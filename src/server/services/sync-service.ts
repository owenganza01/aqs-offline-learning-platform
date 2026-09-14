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
} from '../../lib/retry.js';

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

import { db } from '../../db/index.js';
import * as schema from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { scoreQuiz } from '../../lib/scoring.js';
import { issueCertificate } from './certificate-service.js';

const MAX_SYNC_COMPLETIONS = 500;
const MAX_SYNC_QUIZZES = 100;

export function getMaxLimits() {
  return { maxCompletions: MAX_SYNC_COMPLETIONS, maxQuizzes: MAX_SYNC_QUIZZES };
}

export async function processLessonCompletions(
  userId: number,
  localCompletions: Array<{ lessonId: string; completedAt?: string }>,
) {
  for (const comp of localCompletions) {
    const lessonId = parseInt(comp.lessonId);
    if (isNaN(lessonId)) continue;

    const existRows = await db
      .select({ id: schema.lessonCompletions.id })
      .from(schema.lessonCompletions)
      .where(and(eq(schema.lessonCompletions.userId, userId), eq(schema.lessonCompletions.lessonId, lessonId)));

    if (existRows.length === 0) {
      await db.insert(schema.lessonCompletions).values({
        userId,
        lessonId,
        completedAt: comp.completedAt ? new Date(comp.completedAt) : new Date(),
      });
    }
  }
}

export async function processQuizSubmissions(
  userId: number,
  localQuizzes: Array<{ quizId: string; answers: number[]; attemptedAt?: string }>,
) {
  const quizSyncItems = localQuizzes.map((sub: any) => ({
    idempotencyKey: `${userId}:quiz:${sub.quizId}`,
    type: 'quiz_submission' as const,
    timestamp: sub.attemptedAt || new Date().toISOString(),
    payload: sub,
  }));
  const deduplicatedQuizzes = resolveSyncConflicts(quizSyncItems);

  const processedQuizzes = [];
  const rejectedQuizzes = [];
  for (const item of deduplicatedQuizzes) {
    const sub = item.payload as { quizId: string; answers: number[]; attemptedAt?: string };
    const quizId = parseInt(sub.quizId);
    const answers = sub.answers;
    if (isNaN(quizId) || !Array.isArray(answers)) continue;

    const quiz = await db
      .select({ courseId: schema.quizzes.courseId })
      .from(schema.quizzes)
      .where(eq(schema.quizzes.id, quizId))
      .limit(1);
    if (quiz.length === 0) {
      rejectedQuizzes.push({ quizId, reason: 'Quiz not found.' });
      continue;
    }

    const enrolled = await db
      .select({ id: schema.enrollments.id })
      .from(schema.enrollments)
      .where(and(eq(schema.enrollments.userId, userId), eq(schema.enrollments.courseId, quiz[0].courseId)))
      .limit(1);
    if (enrolled.length === 0) {
      // This rejection path currently only fires for a payload referencing a course
      // the learner was never enrolled in - unenroll doesn't exist yet, so a
      // genuinely-enrolled learner can never legitimately reach this state. Revisit
      // durability of this notice if an unenroll feature is ever added, since it
      // would then affect real completed attempts, not just invalid ones.
      rejectedQuizzes.push({ quizId, reason: 'You must be enrolled in this course to submit the quiz.' });
      continue;
    }

    const questionsList = await db
      .select({ correctOptionIndex: schema.questions.correctOptionIndex })
      .from(schema.questions)
      .where(eq(schema.questions.quizId, quizId));

    if (questionsList.length > 0) {
      const { correctCount, totalQuestions, score, passed } = scoreQuiz(questionsList, answers);

      const attemptResult = await db
        .insert(schema.quizAttempts)
        .values({
          userId,
          quizId,
          score,
          passed,
          attemptedAt: sub.attemptedAt ? new Date(sub.attemptedAt) : new Date(),
        })
        .returning();

      processedQuizzes.push({
        quizId,
        score,
        passed,
        attempt: attemptResult[0],
      });

      // Check for certificate eligibility after sync quiz submission
      try {
        await issueCertificate(userId, quiz[0].courseId);
      } catch (err) {
        console.error('Certificate check after sync quiz submission failed:', err);
      }
    }
  }

  return { processedQuizzes, rejectedQuizzes };
}

export async function getUserSyncState(userId: number) {
  const allCompletions = await db
    .select()
    .from(schema.lessonCompletions)
    .where(eq(schema.lessonCompletions.userId, userId));
  const allAttempts = await db.select().from(schema.quizAttempts).where(eq(schema.quizAttempts.userId, userId));

  return {
    syncedCompletions: allCompletions.map((c) => c.lessonId),
    syncedAttempts: allAttempts,
  };
}
