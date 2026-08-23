const LOCAL_ORIGINS = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

export function validateReturnTo(
  returnTo: string | undefined,
  webOrigin: string,
): string {
  if (!returnTo?.trim()) return webOrigin;

  try {
    const allowedOrigins = new Set([webOrigin, ...LOCAL_ORIGINS]);
    const target = returnTo.startsWith('/')
      ? new URL(returnTo, webOrigin)
      : new URL(returnTo);

    if (!allowedOrigins.has(target.origin)) {
      return webOrigin;
    }
    // Must be absolute — relative paths redirect to the API host (localhost:3000)
    return target.origin + target.pathname + target.search + target.hash;
  } catch {
    return webOrigin;
  }
}
