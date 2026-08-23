import {
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Public } from 'nest-keycloak-connect';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import { AuthService } from './auth.service';
import { generateCsrfToken } from './csrf';
import { cookieOptions } from '../config/env';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('login')
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async login(
    @Req() req: Request,
    @Res() res: Response,
    @Query('returnTo') returnTo?: string,
  ) {
    const url = await this.authService.buildLoginUrl(req, returnTo);
    return res.redirect(url.href);
  }

  @Get('callback')
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async callback(@Req() req: Request, @Res() res: Response) {
    try {
      const { tokens, returnTo } = await this.authService.exchangeCallback(req);

      await new Promise<void>((resolve, reject) => {
        req.session.regenerate((err) => (err ? reject(err) : resolve()));
      });

      req.session.tokens = tokens;

      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => (err ? reject(err) : resolve()));
      });

      return res.redirect(returnTo);
    } catch {
      return res.redirect(`${this.authService.getWebOrigin()}/?authError=login_failed`);
    }
  }

  @Get('me')
  @Public()
  async me(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    // Session-only profile endpoint (BFF). Mobile clients use GET /me with Bearer.
    const accessToken = await this.authService.ensureFreshAccessToken(req);

    if (!accessToken) {
      throw new UnauthorizedException('Not authenticated');
    }

    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => (err ? reject(err) : resolve()));
    });

    const profile = this.authService.claimsFromToken(accessToken);
    if (!profile) {
      throw new UnauthorizedException('Invalid token');
    }

    const csrfToken = generateCsrfToken(req, res, { overwrite: true });

    return {
      ...profile,
      authMode: 'session',
      csrfToken,
    };
  }

  @Get('csrf')
  @Public()
  csrf(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (!req.session.tokens?.accessToken) {
      throw new UnauthorizedException('Not authenticated');
    }
    return {
      csrfToken: generateCsrfToken(req, res, { overwrite: true }),
    };
  }

  @Post('logout')
  @Public()
  async logout(@Req() req: Request, @Res() res: Response) {
    const { idToken } = await this.authService.clearSession(req);
    const opts = cookieOptions();
    res.clearCookie('ledgeros.sid', opts.session);
    res.clearCookie('csrf', opts.csrf);
    const logoutUrl = this.authService.buildLogoutUrl(idToken);
    return res.json({ redirectTo: logoutUrl });
  }
}
