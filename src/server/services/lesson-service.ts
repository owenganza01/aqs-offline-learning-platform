import { db } from '../../db/index.js';
import * as schema from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';

export async function completeLesson(userId: number, lessonId: number) {
  const existing = await db
    .select()
    .from(schema.lessonCompletions)
    .where(and(eq(schema.lessonCompletions.userId, userId), eq(schema.lessonCompletions.lessonId, lessonId)));

  if (existing.length === 0) {
    await db.insert(schema.lessonCompletions).values({ userId, lessonId });
  }
}
