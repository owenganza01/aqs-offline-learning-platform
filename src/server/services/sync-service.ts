// Sync reliability service — exponential backoff + conflict resolution
// Re-exports shared backoff utilities from lib/retry.ts so client code
// never imports server-only modules.
export {
  BACKOFF_DELAYS_MS,
  BACKOFF_MAX_DELAY_MS,
  MAX_RETRIES,
  calculateBackoffMs,
  waitForBackoff,
  withBackoff,
} from '../../lib/retry.ts';

// Server-side sync item identifier for conflict resolution
// Uses UUID idempotency keys to deduplicate
export interface SyncItem {
  idempotencyKey: string;
  type: 'lesson_completion' | 'quiz_submission' | 'enrollment';
  timestamp: string;
  payload: Record<string, unknown>;
}

// Conflict resolution: for identical idempotency keys, the later timestamp wins
export function resolveSyncConflicts<T extends SyncItem>(items: T[]): T[] {
  const seen = new Map<string, T>();

  for (const item of items) {
    const existing = seen.get(item.idempotencyKey);
    if (!existing || item.timestamp > existing.timestamp) {
      seen.set(item.idempotencyKey, item);
    }
  }

  return Array.from(seen.values());
}
