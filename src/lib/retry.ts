export const BACKOFF_DELAYS_MS = [1000, 2000, 4000];
export const BACKOFF_MAX_DELAY_MS = 60000;
export const MAX_RETRIES = 3;

export function calculateBackoffMs(attempt: number): number {
  if (attempt < 0) return 0;
  if (attempt < BACKOFF_DELAYS_MS.length) {
    return BACKOFF_DELAYS_MS[attempt];
  }
  const lastDelay = BACKOFF_DELAYS_MS[BACKOFF_DELAYS_MS.length - 1];
  const multiplier = Math.pow(2, attempt - BACKOFF_DELAYS_MS.length + 1);
  return Math.min(lastDelay * multiplier, BACKOFF_MAX_DELAY_MS);
}

export function waitForBackoff(attempt: number): Promise<void> {
  const delay = calculateBackoffMs(attempt);
  return new Promise((resolve) => setTimeout(resolve, delay));
}

export async function withBackoff<T>(
  fn: () => Promise<T>,
  options?: {
    maxRetries?: number;
    onRetry?: (attempt: number, error: unknown) => void;
  },
): Promise<T> {
  const maxRetries = options?.maxRetries ?? MAX_RETRIES;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt < maxRetries) {
        options?.onRetry?.(attempt, err);
        await waitForBackoff(attempt);
      } else {
        throw err;
      }
    }
  }

  throw new Error('Unreachable — retry loop exhausted');
}
