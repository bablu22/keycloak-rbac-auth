import { createHash, randomBytes } from 'node:crypto';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Request } from 'express';

import { fetchWithRetry } from '../common/fetch-retry';
import { validateReturnTo } from './return-to';
import type { AuthTokens } from './session.types';

type OidcConfig = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  end_session_endpoint?: string;
};

export type OAuthTokens = AuthTokens;

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private oidc!: OidcConfig;
  private readonly refreshLocks = new Map<
    string,
    Promise<string | undefined>
  >();

  private readonly webOrigin =
    process.env.WEB_ORIGIN ?? 'http://localhost:5173';
  private readonly redirectUri =
    process.env.KEYCLOAK_BFF_REDIRECT_URI ??
    'http://localhost:3000/auth/callback';
  private readonly clientId = process.env.KEYCLOAK_BFF_CLIENT_ID ?? 'web-bff';
  private readonly clientSecret = process.env.KEYCLOAK_BFF_SECRET ?? '';
  private readonly realmUrl = `${process.env.KEYCLOAK_URL ?? 'http://localhost:8080'}/realms/${process.env.KEYCLOAK_REALM ?? 'erp-realm'}`;

  async onModuleInit() {
    if (!this.clientSecret) {
      throw new Error('KEYCLOAK_BFF_SECRET is required');
    }
    const res = await fetchWithRetry(
      `${this.realmUrl}/.well-known/openid-configuration`,
      undefined,
      { label: 'Keycloak OIDC discovery', attempts: 30, delayMs: 2000 },
    );
    if (!res.ok) {
      throw new Error(`OIDC discovery failed: ${res.status}`);
    }
    this.oidc = (await res.json()) as OidcConfig;
    this.logger.log(`OIDC discovery ready for ${this.clientId}`);
  }

  getWebOrigin() {
    return this.webOrigin;
  }

  private pkce() {
    const codeVerifier = randomBytes(32).toString('base64url');
    const codeChallenge = createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    const state = randomBytes(16).toString('base64url');
    const nonce = randomBytes(16).toString('base64url');
    return { codeVerifier, codeChallenge, state, nonce };
  }

  async buildLoginUrl(req: Request, returnTo?: string) {
    const { codeVerifier, codeChallenge, state, nonce } = this.pkce();
    req.session.oidc = {
      state,
      codeVerifier,
      nonce,
      returnTo: validateReturnTo(returnTo, this.webOrigin),
    };

    const url = new URL(this.oidc.authorization_endpoint);
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('redirect_uri', this.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid profile email');
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('state', state);
    url.searchParams.set('nonce', nonce);
    return url;
  }

  async exchangeCallback(req: Request): Promise<{
    tokens: OAuthTokens;
    returnTo: string;
  }> {
    const oidc = req.session.oidc;
    if (!oidc?.state || !oidc.codeVerifier) {
      throw new Error('Missing login state — start again from /auth/login');
    }

    const url = new URL(
      `${process.env.API_PUBLIC_URL ?? 'http://localhost:3000'}${req.originalUrl}`,
    );
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (!code || state !== oidc.state) {
      throw new Error('Invalid OAuth callback state or code');
    }

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code_verifier: oidc.codeVerifier,
    });

    const tokenRes = await fetch(this.oidc.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const raw = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      id_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };

    if (!tokenRes.ok || !raw.access_token) {
      throw new Error(
        raw.error_description || raw.error || 'Token exchange failed',
      );
    }

    if (oidc.nonce && raw.id_token) {
      const idClaims = this.decodeJwtPayload(raw.id_token);
      if (idClaims?.nonce !== oidc.nonce) {
        throw new Error('Invalid ID token nonce');
      }
    }

    const expiresIn = raw.expires_in ?? 300;
    const returnTo = oidc.returnTo || this.webOrigin;
    delete req.session.oidc;

    return {
      returnTo,
      tokens: {
        accessToken: raw.access_token,
        refreshToken: raw.refresh_token,
        idToken: raw.id_token,
        expiresAt: Date.now() + expiresIn * 1000,
      },
    };
  }

  async ensureFreshAccessToken(req: Request): Promise<string | undefined> {
    const tokens = req.session.tokens;
    if (!tokens?.accessToken) return undefined;

    if (tokens.expiresAt > Date.now() + 30_000) {
      return tokens.accessToken;
    }

    if (!tokens.refreshToken) {
      delete req.session.tokens;
      return undefined;
    }

    const sessionId = req.sessionID;
    if (!sessionId) return undefined;

    const inFlight = this.refreshLocks.get(sessionId);
    if (inFlight) return inFlight;

    const refreshPromise = this.refreshSessionTokens(req, tokens).finally(
      () => {
        this.refreshLocks.delete(sessionId);
      },
    );
    this.refreshLocks.set(sessionId, refreshPromise);
    return refreshPromise;
  }

  private async refreshSessionTokens(
    req: Request,
    tokens: AuthTokens,
  ): Promise<string | undefined> {
    try {
      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokens.refreshToken!,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      });
      const tokenRes = await fetch(this.oidc.token_endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      const refreshed = (await tokenRes.json()) as {
        access_token?: string;
        refresh_token?: string;
        id_token?: string;
        expires_in?: number;
      };
      if (!tokenRes.ok || !refreshed.access_token) {
        delete req.session.tokens;
        return undefined;
      }
      const expiresIn = refreshed.expires_in ?? 300;
      req.session.tokens = {
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token ?? tokens.refreshToken,
        idToken: refreshed.id_token ?? tokens.idToken,
        expiresAt: Date.now() + expiresIn * 1000,
      };
      return refreshed.access_token;
    } catch (error) {
      this.logger.warn(`Refresh failed: ${(error as Error).message}`);
      delete req.session.tokens;
      return undefined;
    }
  }

  private decodeJwtPayload(token: string) {
    try {
      const payload = token.split('.')[1];
      if (!payload) return null;
      const json = Buffer.from(payload, 'base64url').toString('utf8');
      return JSON.parse(json) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  decodeAccessToken(accessToken: string) {
    return this.decodeJwtPayload(accessToken);
  }

  claimsFromToken(accessToken: string) {
    const claims = this.decodeAccessToken(accessToken);
    if (!claims) return null;
    const realmRoles =
      (claims.realm_access as { roles?: string[] } | undefined)?.roles ?? [];
    const clientRoles =
      (
        claims.resource_access as
          | Record<string, { roles?: string[] }>
          | undefined
      )?.['nest-api']?.roles ?? [];
    return {
      sub: claims.sub,
      email: claims.email,
      name: claims.name ?? claims.preferred_username,
      preferred_username: claims.preferred_username,
      realmRoles,
      clientRoles,
    };
  }

  buildLogoutUrl(idToken?: string) {
    const endSession =
      this.oidc.end_session_endpoint ??
      `${this.realmUrl}/protocol/openid-connect/logout`;
    const url = new URL(endSession);
    if (idToken) {
      url.searchParams.set('id_token_hint', idToken);
    }
    url.searchParams.set('post_logout_redirect_uri', this.webOrigin);
    return url.toString();
  }

  clearSession(req: Request) {
    const idToken = req.session.tokens?.idToken;
    return new Promise<{ idToken?: string }>((resolve, reject) => {
      req.session.destroy((err) => {
        if (err) reject(err);
        else resolve({ idToken });
      });
    });
  }
}
