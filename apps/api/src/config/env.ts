const WEAK_SECRETS = new Set([
  'change-me-session-secret',
  'change-me-to-a-long-random-string',
  'nest-api-secret-change-me',
  'web-bff-secret-change-me',
]);

export function assertRuntimeSecrets() {
  const isProd = process.env.NODE_ENV === 'production';
  const required = [
    'SESSION_SECRET',
    'KEYCLOAK_CLIENT_SECRET',
    'KEYCLOAK_BFF_SECRET',
  ] as const;

  for (const key of required) {
    const value = process.env[key];
    if (!value || WEAK_SECRETS.has(value)) {
      const msg = `${key} must be set to a strong unique value`;
      if (isProd) throw new Error(msg);
      console.warn(`[security] ${msg}`);
    }
  }

  if (isProd && process.env.COOKIE_SECURE !== 'true') {
    throw new Error('COOKIE_SECURE must be true in production');
  }
}

export function cookieOptions() {
  const secure = process.env.COOKIE_SECURE === 'true';
  return {
    session: { secure, sameSite: 'lax' as const, path: '/' },
    csrf: { secure, sameSite: 'lax' as const, path: '/' },
  };
}
