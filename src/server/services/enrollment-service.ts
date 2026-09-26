import { db } from '../../db/index.js';
import * as schema from '../../db/schema.js';
import { eq } from 'drizzle-orm';
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
