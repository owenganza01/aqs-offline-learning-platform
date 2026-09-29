import { db } from '../../db/index.js';
import * as schema from '../../db/schema.js';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { toYouTubeEmbed } from '../../lib/utils.js';
import { documentStorage } from '../providers/document-storage.js';

export async function getLessonCourseId(lessonId: number): Promise<number | null> {
  const rows = await db
    .select({ courseId: schema.lessons.courseId })
    .from(schema.lessons)
    .where(eq(schema.lessons.id, lessonId))
    .limit(1);
  return rows.length > 0 ? rows[0].courseId : null;
}

function extractDocIds(url: string | null | undefined): string[] {
  if (!url) return [];
  const matches = url.match(/doc:([a-zA-Z0-9_-]+)/g);
  return matches ? matches.map((m) => m.slice(4)) : [];
}

export async function createLesson(
  courseId: number,
  data: {
    title: string;
    content: string;
    videoUrl?: string;
    slidesUrl?: string;
    sortOrder?: number;
    durationSeconds?: number | null;
  },
) {
  const result = await db
    .insert(schema.lessons)
    .values({
      courseId,
      title: data.title,
      content: data.content,
      videoUrl: toYouTubeEmbed(data.videoUrl),
      slidesUrl: data.slidesUrl,
      durationSeconds: data.durationSeconds ?? null,
      sortOrder: data.sortOrder !== undefined ? parseInt(data.sortOrder as any) : 0,
    })
    .returning();

  const savedLesson = result[0];
  for (const docId of extractDocIds(data.slidesUrl)) {
    await documentStorage.backfillLessonId(docId, savedLesson.id);
  }
  for (const docId of extractDocIds(data.videoUrl)) {
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
    durationSeconds?: number | null;
  },
) {
  const updated = await db
    .update(schema.lessons)
    .set({
      title: data.title,
      content: data.content,
      videoUrl: data.videoUrl !== undefined ? toYouTubeEmbed(data.videoUrl) : undefined,
      slidesUrl: data.slidesUrl,
      durationSeconds: 'durationSeconds' in data ? (data.durationSeconds ?? null) : undefined,
      sortOrder: data.sortOrder !== undefined ? parseInt(data.sortOrder as any) : undefined,
    })
    .where(and(eq(schema.lessons.id, lessonId), eq(schema.lessons.courseId, courseId)))
    .returning();

  if (updated.length === 0) return null;

  for (const docId of extractDocIds(data.slidesUrl)) {
    await documentStorage.backfillLessonId(docId, lessonId);
  }
  for (const docId of extractDocIds(data.videoUrl)) {
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

  const caseExpr = sql`CASE ${schema.lessons.id} ${sql.join(
    parsedIds.map((_id: number, i: number) => sql`WHEN ${parsedIds[i]} THEN ${i}`),
    sql.raw(' '),
  )} END`;

  await db
    .update(schema.lessons)
    .set({
      sortOrder: sql`${caseExpr}::integer`,
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

  if (lessonRows.length > 0) {
    for (const docId of extractDocIds(lessonRows[0].slidesUrl)) {
      await documentStorage.delete(docId).catch(() => {});
    }
  }

  return deleted[0];
}
