import { Logger } from '@nestjs/common';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  opts?: { attempts?: number; delayMs?: number; label?: string },
): Promise<Response> {
  const attempts = opts?.attempts ?? 30;
  const delayMs = opts?.delayMs ?? 2000;
  const label = opts?.label ?? url;
  const logger = new Logger('FetchRetry');
  let lastError: unknown;

  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, init);
      return res;
    } catch (error) {
      lastError = error;
      if (i < attempts) {
        logger.warn(
          `${label} unavailable (attempt ${i}/${attempts}): ${(error as Error).message}`,
        );
        await delay(delayMs);
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`${label} unavailable after ${attempts} attempts`);
}
