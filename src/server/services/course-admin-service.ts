import { db } from '../../db/index.ts';
import * as schema from '../../db/schema.ts';
import { eq } from 'drizzle-orm';

export async function createCourse(
  title: string,
  description: string,
  thumbnail: string | undefined,
  createdBy: number,
) {
  const result = await db
    .insert(schema.courses)
    .values({ title, description, thumbnail: thumbnail || 'teal', createdBy })
    .returning();
  return result[0];
}

export async function getCourseById(courseId: number) {
  const rows = await db.select().from(schema.courses).where(eq(schema.courses.id, courseId));
  return rows[0] || null;
}

export async function updateCourse(
  courseId: number,
  data: { title?: string; description?: string; thumbnail?: string },
) {
  const updated = await db.update(schema.courses).set(data).where(eq(schema.courses.id, courseId)).returning();
  return updated[0];
}

export async function deleteCourse(courseId: number) {
  await db.delete(schema.courses).where(eq(schema.courses.id, courseId));
}
