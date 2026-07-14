import { Request, Response } from 'express';
import { db } from '../../db/index.ts';
import * as schema from '../../db/schema.ts';
import { AuthRequest } from '../../middleware/auth.ts';
import { eq, and } from 'drizzle-orm';
import { scoreQuiz } from '../../lib/scoring.ts';
import { resolveSyncConflicts } from '../services/sync-service.ts';

const MAX_SYNC_COMPLETIONS = 500;
const MAX_SYNC_QUIZZES = 100;

export async function syncHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { lessonCompletions: localCompletions, quizSubmissions: localQuizzes } = req.body;

    if (localCompletions.length > MAX_SYNC_COMPLETIONS) {
      res.status(400).json({ error: `Too many lesson completions. Maximum is ${MAX_SYNC_COMPLETIONS}.` });
      return;
    }
    if (localQuizzes.length > MAX_SYNC_QUIZZES) {
      res.status(400).json({ error: `Too many quiz submissions. Maximum is ${MAX_SYNC_QUIZZES}.` });
      return;
    }

    const userId = req.dbUser!.id;

    // 1. Process Lesson Completions
    for (const comp of localCompletions) {
      const lessonId = parseInt(comp.lessonId);
      if (isNaN(lessonId)) continue;

      const existsList = await db
        .select({ id: schema.lessonCompletions.id })
        .from(schema.lessonCompletions)
        .where(and(eq(schema.lessonCompletions.userId, userId), eq(schema.lessonCompletions.lessonId, lessonId)));

      if (existsList.length === 0) {
        await db.insert(schema.lessonCompletions).values({
          userId,
          lessonId,
          completedAt: comp.completedAt ? new Date(comp.completedAt) : new Date(),
        });
      }
    }

    // 2. Process Quiz Submissions offline scoring
    const quizSyncItems = localQuizzes.map((sub: any) => ({
      idempotencyKey: `${userId}:quiz:${sub.quizId}`,
      type: 'quiz_submission' as const,
      timestamp: sub.attemptedAt || new Date().toISOString(),
      payload: sub,
    }));
    const deduplicatedQuizzes = resolveSyncConflicts(quizSyncItems);

    const processedQuizzes = [];
    for (const item of deduplicatedQuizzes) {
      const sub = item.payload as { quizId: string; answers: number[]; attemptedAt?: string };
      const quizId = parseInt(sub.quizId);
      const answers = sub.answers;
      if (isNaN(quizId) || !Array.isArray(answers)) continue;

      const questionsList = await db
        .select({ correctOptionIndex: schema.questions.correctOptionIndex })
        .from(schema.questions)
        .where(eq(schema.questions.quizId, quizId));

      if (questionsList.length > 0) {
        const { correctCount, totalQuestions, score, passed } = scoreQuiz(questionsList, answers);

        const attempt = await db
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
          attempt: attempt[0],
        });
      }
    }

    // 3. Fetch all current states for this user to return as truth
    const allCompletions = await db
      .select()
      .from(schema.lessonCompletions)
      .where(eq(schema.lessonCompletions.userId, userId));
    const allAttempts = await db.select().from(schema.quizAttempts).where(eq(schema.quizAttempts.userId, userId));

    res.json({
      success: true,
      syncedCompletions: allCompletions.map((c) => c.lessonId),
      syncedAttempts: allAttempts,
      processedQuizzes,
    });
  } catch (error: unknown) {
    console.error('Error in reconnect-sync engine:', error);
    res.status(500).json({ error: 'Failed to synchronize progress data.' });
  }
}
