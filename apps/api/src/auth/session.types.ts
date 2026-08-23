import 'express-session';

export type AuthTokens = {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresAt: number;
};

declare module 'express-session' {
  interface SessionData {
    tokens?: AuthTokens;
    oidc?: {
      state: string;
      codeVerifier: string;
      nonce?: string;
      returnTo?: string;
    };
  }
}
