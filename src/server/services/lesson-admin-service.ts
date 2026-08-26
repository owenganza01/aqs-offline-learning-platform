import { db } from '../../db/index.js';
import * as schema from '../../db/schema.js';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { toYouTubeEmbed } from '../../lib/utils.js';
import { documentStorage } from '../providers/document-storage.js';

export async function createLesson(
  courseId: number,
  data: { title: string; content: string; videoUrl?: string; slidesUrl?: string; sortOrder?: number },
) {
  const result = await db
    .insert(schema.lessons)
    .values({
      courseId,
      title: data.title,
      content: data.content,
      videoUrl: toYouTubeEmbed(data.videoUrl),
      slidesUrl: data.slidesUrl,
      sortOrder: data.sortOrder !== undefined ? parseInt(data.sortOrder as any) : 0,
    })
    .returning();

  const savedLesson = result[0];
  if (data.slidesUrl && data.slidesUrl.startsWith('doc:')) {
    const docId = data.slidesUrl.slice(4);
    await documentStorage.backfillLessonId(docId, savedLesson.id);
  }
  if (data.videoUrl && data.videoUrl.startsWith('doc:')) {
    const docId = data.videoUrl.slice(4);
    await documentStorage.backfillLessonId(docId, savedLesson.id);
  }
  return savedLesson;
}

export async function updateLesson(
  lessonId: number,
  courseId: number,
  data: {
    title?: string;
    content?: string;
    videoUrl?: string;
    slidesUrl?: string;
    sortOrder?: number;
  },
) {
  const updated = await db
    .update(schema.lessons)
    .set({
      title: data.title,
      content: data.content,
      videoUrl: data.videoUrl !== undefined ? toYouTubeEmbed(data.videoUrl) : undefined,
      slidesUrl: data.slidesUrl,
      sortOrder: data.sortOrder !== undefined ? parseInt(data.sortOrder as any) : undefined,
    })
    .where(and(eq(schema.lessons.id, lessonId), eq(schema.lessons.courseId, courseId)))
    .returning();

  if (updated.length === 0) return null;

  if (data.slidesUrl && data.slidesUrl.startsWith('doc:')) {
    const docId = data.slidesUrl.slice(4);
    await documentStorage.backfillLessonId(docId, lessonId);
  }
  if (data.videoUrl && data.videoUrl.startsWith('doc:')) {
    const docId = data.videoUrl.slice(4);
    await documentStorage.backfillLessonId(docId, lessonId);
  }
  return updated[0];
}

export async function reorderLessons(courseId: number, orderedIds: number[]) {
  const courseLessons = await db
    .select({ id: schema.lessons.id })
    .from(schema.lessons)
    .where(eq(schema.lessons.courseId, courseId));
  const validIds = new Set(courseLessons.map((l) => l.id));
  const parsedIds = orderedIds.filter((id: number) => !isNaN(id));
  const invalidIds = parsedIds.filter((id: number) => !validIds.has(id));
  if (invalidIds.length > 0) {
    throw Object.assign(new Error(`Lessons ${invalidIds.join(', ')} do not belong to this course`), {
      statusCode: 400,
    });
  }

  await db
    .update(schema.lessons)
    .set({
      sortOrder: sql`CASE ${schema.lessons.id} ${sql.join(
        parsedIds.map((_id: number, i: number) => sql`WHEN ${parsedIds[i]} THEN ${i}`),
        sql.raw(' '),
      )} END`,
    })
    .where(inArray(schema.lessons.id, parsedIds));
}

export async function deleteLesson(lessonId: number, courseId: number) {
  const lessonRows = await db
    .select({ slidesUrl: schema.lessons.slidesUrl })
    .from(schema.lessons)
    .where(and(eq(schema.lessons.id, lessonId), eq(schema.lessons.courseId, courseId)));

  const deleted = await db
    .delete(schema.lessons)
    .where(and(eq(schema.lessons.id, lessonId), eq(schema.lessons.courseId, courseId)))
    .returning();

  if (deleted.length === 0) return null;

  if (lessonRows.length > 0 && lessonRows[0].slidesUrl?.startsWith('doc:')) {
    const docId = lessonRows[0].slidesUrl.slice(4);
    await documentStorage.delete(docId).catch(() => {});
  }

  return deleted[0];
}
