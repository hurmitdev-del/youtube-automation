import { logger } from './logger.js';

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Predicate deciding whether a given error should trigger a retry. */
  shouldRetry?: (error: unknown) => boolean;
  label?: string;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs `fn` with exponential backoff retries. Used for transient network or
 * quota-adjacent failures where a retry is likely to succeed. Never throws
 * synchronously outside of exhausting all retries.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    retries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 15000,
    shouldRetry = () => true,
    label = 'operation',
  } = options;

  let attempt = 0;
  let lastError: unknown;

  while (attempt <= retries) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const canRetry = attempt < retries && shouldRetry(error);

      if (!canRetry) {
        break;
      }

      const delay = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
      logger.warn(
        { label, attempt: attempt + 1, retries, delayMs: delay, err: error },
        `Retrying ${label} after failure`,
      );
      await sleep(delay);
      attempt += 1;
    }
  }

  throw lastError;
}
