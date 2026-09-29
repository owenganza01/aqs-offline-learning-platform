import { db } from '../../db/index.js';
import * as schema from '../../db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';
import { effectiveClosureStatus, ClosureError } from './closure-service.js';

export async function getUserEnrollments(userId: number): Promise<{ courseIds: number[] }> {
  try {
    const rows = await db
      .select({ courseId: schema.enrollments.courseId })
      .from(schema.enrollments)
      .where(eq(schema.enrollments.userId, userId));
    return { courseIds: rows.map((r) => r.courseId) };
  } catch (error: unknown) {
    if (error instanceof Error && (error as any).code === '42P01') {
      console.warn('Enrollments table not found — returning empty list. Run migrations to create it.');
      return { courseIds: [] };
    }
    throw error;
  }
}

export async function enrollUserInCourse(
  userId: number,
  courseId: number,
): Promise<{ success: boolean; courseId: number }> {
  try {
    // New enrollments are blocked while the course's instructor is in account
    // closure (pending or closed). Existing learners are unaffected.
    const [course] = await db.select().from(schema.courses).where(eq(schema.courses.id, courseId));
    if (course && course.createdBy !== null) {
      const [instructor] = await db.select().from(schema.users).where(eq(schema.users.id, course.createdBy));
      if (instructor && effectiveClosureStatus(instructor) !== null) {
        throw new ClosureError(
          'Enrollment is currently disabled for this course while its instructor account is closing.',
          403,
        );
      }
    }

    await db
      .insert(schema.enrollments)
      .values({ userId, courseId })
      .onConflictDoNothing({ target: [schema.enrollments.userId, schema.enrollments.courseId] });

    return { success: true, courseId };
  } catch (error: unknown) {
    if (error instanceof Error && (error as any).code === '42P01') {
      console.warn('Enrollments table not found — enrollment not persisted. Run migrations to create it.');
      return { success: true, courseId };
    }
    throw error;
  }
}

export interface UnenrollResult {
  success: boolean;
  courseId: number;
  removed: {
    quizAttempts: number;
    lessonCompletions: number;
    courseCompletions: number;
    enrollments: number;
  };
}

/**
 * Unenrolls a user from a course and permanently destroys their progress for it
 * (DEF-007).
 *
 * No progress table has a foreign key to `enrollments` — only
 * enrollUserInCourse ever wrote that row — so deleting the enrollment alone
 * would leave lesson completions, quiz attempts and the course completion
 * behind, and re-enrolling would silently restore the old state. The four
 * deletes below mirror the ordering used by the `wipe_user()` migration.
 *
 * Every delete is scoped to this one course — directly via courseId, or by
 * resolving the course's own lesson/quiz ids first — so progress and
 * certificates belonging to the learner's other courses are never touched.
 * Leaving one course must not disturb the rest of their record.
 *
 * issued_certificates is deliberately NOT deleted. A certificate is an earned
 * credential rather than progress, and destroying one is irreversible and
 * publicly verifiable via /api/certificates/verify/:code, so it is not
 * something a learner should lose as a side effect of leaving a course. The
 * cost of keeping it is cosmetic: issued_certificates is unique on
 * (user_id, course_id) and issueCertificate uses ON CONFLICT DO NOTHING, so a
 * learner who resets and then re-completes the course is returned the
 * certificate they earned the first time instead of a freshly issued one. A
 * stale issue date on an already-earned credential is a far better outcome than
 * silently revoking it.
 *
 * Wrapped in a transaction so a mid-purge failure cannot leave the learner
 * enrolled with half their progress destroyed. None of the deletes depend on
 * each other, so the ordering is for readability rather than referential
 * necessity.
 */
export async function unenrollUserFromCourse(userId: number, courseId: number): Promise<UnenrollResult> {
  return db.transaction(async (tx): Promise<UnenrollResult> => {
    // Quiz attempts and lesson completions are reachable only by joining up to
    // the course, so resolve the child ids first rather than relying on a
    // nullable FK column.
    const quizIds = (
      await tx.select({ id: schema.quizzes.id }).from(schema.quizzes).where(eq(schema.quizzes.courseId, courseId))
    ).map((q) => q.id);

    const deletedAttempts =
      quizIds.length > 0
        ? await tx
            .delete(schema.quizAttempts)
            .where(and(eq(schema.quizAttempts.userId, userId), inArray(schema.quizAttempts.quizId, quizIds)))
            .returning({ id: schema.quizAttempts.id })
        : [];

    const lessonIds = (
      await tx.select({ id: schema.lessons.id }).from(schema.lessons).where(eq(schema.lessons.courseId, courseId))
    ).map((l) => l.id);

    const deletedLessonCompletions =
      lessonIds.length > 0
        ? await tx
            .delete(schema.lessonCompletions)
            .where(
              and(eq(schema.lessonCompletions.userId, userId), inArray(schema.lessonCompletions.lessonId, lessonIds)),
            )
            .returning({ id: schema.lessonCompletions.id })
        : [];

    const deletedCourseCompletions = await tx
      .delete(schema.courseCompletions)
      .where(and(eq(schema.courseCompletions.userId, userId), eq(schema.courseCompletions.courseId, courseId)))
      .returning({ id: schema.courseCompletions.id });

    const deletedEnrollments = await tx
      .delete(schema.enrollments)
      .where(and(eq(schema.enrollments.userId, userId), eq(schema.enrollments.courseId, courseId)))
      .returning({ id: schema.enrollments.id });

    return {
      success: true,
      courseId,
      removed: {
        quizAttempts: deletedAttempts.length,
        lessonCompletions: deletedLessonCompletions.length,
        courseCompletions: deletedCourseCompletions.length,
        enrollments: deletedEnrollments.length,
      },
    };
  });
}
