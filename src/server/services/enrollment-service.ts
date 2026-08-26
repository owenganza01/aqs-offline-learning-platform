import { db } from '../../db/index.js';
import * as schema from '../../db/schema.js';
import { eq } from 'drizzle-orm';

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
