import { doubleCsrf } from 'csrf-csrf';
import type { Request } from 'express';

import './session.types';

const secure = process.env.COOKIE_SECURE === 'true';

const csrfUtils = doubleCsrf({
  getSecret: () => process.env.SESSION_SECRET ?? 'change-me-session-secret',
  getSessionIdentifier: (req: Request) => req.sessionID ?? 'anonymous',
  cookieName: 'csrf',
  cookieOptions: {
    httpOnly: false,
    sameSite: 'lax',
    secure,
    path: '/',
  },
  getCsrfTokenFromRequest: (req: Request) =>
    (req.headers['x-csrf-token'] as string | undefined) ?? '',
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
  skipCsrfProtection: (req: Request) => {
    // Explicit mobile Bearer only (not session-injected Bearer — that runs later)
    const auth = req.headers.authorization;
    if (
      typeof auth === 'string' &&
      auth.toLowerCase().startsWith('bearer ') &&
      !req.session?.tokens
    ) {
      return true;
    }
    if (
      req.path.startsWith('/auth/login') ||
      req.path.startsWith('/auth/callback')
    ) {
      return true;
    }
    return false;
  },
});

export const csrfProtection = csrfUtils.doubleCsrfProtection;
export const generateCsrfToken = csrfUtils.generateCsrfToken;
