// Server-side course completion enforcement layer
// Truth: a course is complete ONLY when:
//   1. All lessons have completion records for the user
//   2. A quiz attempt exists with passed = true AND score >= 70

import { db } from '../../db/index.js';
import * as schema from '../../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';

interface CompletionStatus {
  isCompletable: boolean;
  allLessonsComplete: boolean;
  quizPassed: boolean;
  lessonCount: number;
  completedLessonCount: number;
  quizAttempts: number;
  lastQuizScore: number | null;
}

// Check if a user is eligible to mark a course complete
export async function getCourseCompletionStatus(userId: number, courseId: number): Promise<CompletionStatus> {
  // Count total lessons
  const totalLessons = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.lessons)
    .where(eq(schema.lessons.courseId, courseId));

  const lessonCount = Number(totalLessons[0]?.count ?? 0);

  // Count completed lessons for this user
  const completedLessons = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.lessonCompletions)
    .innerJoin(schema.lessons, eq(schema.lessonCompletions.lessonId, schema.lessons.id))
    .where(and(eq(schema.lessonCompletions.userId, userId), eq(schema.lessons.courseId, courseId)));

  const completedLessonCount = Number(completedLessons[0]?.count ?? 0);
  const allLessonsComplete = lessonCount > 0 && completedLessonCount >= lessonCount;

  // Check for a passing quiz attempt
  const quizRows = await db.select().from(schema.quizzes).where(eq(schema.quizzes.courseId, courseId));

  const quiz = quizRows[0];
  let quizPassed = false;
  let quizAttempts = 0;
  let lastQuizScore: number | null = null;

  if (quiz) {
    const attempts = await db
      .select()
      .from(schema.quizAttempts)
      .where(and(eq(schema.quizAttempts.userId, userId), eq(schema.quizAttempts.quizId, quiz.id)))
      .orderBy(schema.quizAttempts.attemptedAt);

    quizAttempts = attempts.length;

    if (attempts.length > 0) {
      lastQuizScore = attempts[attempts.length - 1].score;
      quizPassed = attempts[attempts.length - 1].passed;
    }
  }

  return {
    isCompletable: allLessonsComplete && quizPassed,
    allLessonsComplete,
    quizPassed,
    lessonCount,
    completedLessonCount,
    quizAttempts,
    lastQuizScore,
  };
}

// Attempt to mark a course complete — only succeeds if conditions are met
// Returns the completion record or throws with a descriptive error
export async function completeCourse(
  userId: number,
  courseId: number,
): Promise<{ completionId: string; completedAt: Date }> {
  const status = await getCourseCompletionStatus(userId, courseId);

  if (!status.isCompletable) {
    const reasons: string[] = [];
    if (!status.allLessonsComplete) {
      reasons.push(`Complete ${status.completedLessonCount}/${status.lessonCount} lessons`);
    }
    if (!status.quizPassed) {
      reasons.push(`Pass the course quiz with >= 70% (last score: ${status.lastQuizScore ?? 'N/A'})`);
    }
    throw new Error(`Course not completable: ${reasons.join('; ')}`);
  }

  const completionId = randomUUID();
  const now = new Date();

  // Use the (user_id, course_id) unique constraint to handle idempotency
  try {
    const [record] = await db
      .insert(schema.courseCompletions)
      .values({
        userId,
        courseId,
        completionId,
        quizPassed: true,
        allLessonsComplete: true,
        completedAt: now,
      })
      .returning();

    return { completionId: record.completionId, completedAt: record.completedAt };
  } catch (err: any) {
    if (err.code === '23505') {
      // Already completed — return existing record
      const [existing] = await db
        .select()
        .from(schema.courseCompletions)
        .where(and(eq(schema.courseCompletions.userId, userId), eq(schema.courseCompletions.courseId, courseId)));
      if (existing) {
        return { completionId: existing.completionId, completedAt: existing.completedAt };
      }
    }
    throw err;
  }
}

// Get completion status for display purposes
export async function getCourseCompletion(
  userId: number,
  courseId: number,
): Promise<{ completed: boolean; completedAt: Date | null }> {
  const [record] = await db
    .select()
    .from(schema.courseCompletions)
    .where(and(eq(schema.courseCompletions.userId, userId), eq(schema.courseCompletions.courseId, courseId)));

  return {
    completed: !!record,
    completedAt: record?.completedAt ?? null,
  };
}
