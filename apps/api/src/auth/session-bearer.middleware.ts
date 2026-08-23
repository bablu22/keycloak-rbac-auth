import type { NestMiddleware } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { AuthService } from './auth.service';

/**
 * Web BFF: promote session access token into Authorization header so
 * nest-keycloak-connect AuthGuard/RoleGuard keep working.
 * Mobile: already sends Bearer — left untouched.
 */
@Injectable()
export class SessionBearerMiddleware implements NestMiddleware {
  constructor(private readonly authService: AuthService) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    // Leave /auth/* to AuthController (needs to distinguish session vs Bearer)
    if (req.path.startsWith('/auth')) {
      next();
      return;
    }

    const hasBearer = Boolean(req.headers.authorization?.match(/^Bearer\s+/i));
    if (!hasBearer && req.session) {
      const token = await this.authService.ensureFreshAccessToken(req);
      if (token) {
        req.headers.authorization = `Bearer ${token}`;
      }
    }
    next();
  }
}
