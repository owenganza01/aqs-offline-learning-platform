import { Request, Response } from 'express';
import { db } from '../../db/index.ts';
import * as schema from '../../db/schema.ts';
import { AuthRequest } from '../../middleware/auth.ts';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { toYouTubeEmbed } from '../../lib/utils.ts';
import { documentStorage } from '../providers/document-storage.ts';

// ── Course CRUD ──────────────────────────────────────────────

export async function createCourse(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { title, description, thumbnail } = req.body;
    if (!title || !description) {
      res.status(400).json({ error: 'Title and description are required.' });
      return;
    }

    const result = await db
      .insert(schema.courses)
      .values({
        title,
        description,
        thumbnail: thumbnail || 'teal',
        createdBy: req.dbUser!.id,
      })
      .returning();

    res.status(201).json(result[0]);
  } catch (error: unknown) {
    console.error('CMS Course creation error:', error);
    res.status(500).json({ error: 'Failed to create course.' });
  }
}

export async function updateCourse(req: AuthRequest, res: Response): Promise<void> {
  try {
    const courseId = parseInt(req.params.id);
    const { title, description, thumbnail } = req.body;

    if (isNaN(courseId)) {
      res.status(400).json({ error: 'Invalid course ID' });
      return;
    }

    const courseRows = await db.select().from(schema.courses).where(eq(schema.courses.id, courseId));
    if (courseRows.length === 0) {
      res.status(404).json({ error: 'Course not found' });
      return;
    }
    const course = courseRows[0];
    if (req.dbUser!.role !== 'admin' && course.createdBy !== req.dbUser!.id) {
      res.status(403).json({ error: 'Forbidden: You can only edit your own courses' });
      return;
    }

    const updated = await db
      .update(schema.courses)
      .set({ title, description, thumbnail })
      .where(eq(schema.courses.id, courseId))
      .returning();

    res.json(updated[0]);
  } catch (error: unknown) {
    console.error('CMS Course edit error:', error);
    res.status(500).json({ error: 'Failed to update course.' });
  }
}

export async function deleteCourse(req: AuthRequest, res: Response): Promise<void> {
  try {
    const courseId = parseInt(req.params.id);
    if (isNaN(courseId)) {
      res.status(400).json({ error: 'Invalid course ID' });
      return;
    }

    const courseRows = await db.select().from(schema.courses).where(eq(schema.courses.id, courseId));
    if (courseRows.length === 0) {
      res.status(404).json({ error: 'Course not found' });
      return;
    }
    const course = courseRows[0];
    if (req.dbUser!.role !== 'admin' && course.createdBy !== req.dbUser!.id) {
      res.status(403).json({ error: 'Forbidden: You can only delete your own courses' });
      return;
    }

    await db.delete(schema.courses).where(eq(schema.courses.id, courseId));

    res.json({ success: true, message: 'Course deleted successfully', courseId });
  } catch (error: unknown) {
    console.error('CMS Course deletion error:', error);
    res.status(500).json({ error: 'Failed to delete course.' });
  }
}

// ── Lesson CRUD ──────────────────────────────────────────────

export async function createLesson(req: AuthRequest, res: Response): Promise<void> {
  try {
    const courseId = parseInt(req.params.courseId);
    const { title, content, videoUrl, slidesUrl, sortOrder } = req.body;

    if (isNaN(courseId) || !title || !content) {
      res.status(400).json({ error: 'Course ID, title and content are required.' });
      return;
    }

    const result = await db
      .insert(schema.lessons)
      .values({
        courseId,
        title,
        content,
        videoUrl: toYouTubeEmbed(videoUrl),
        slidesUrl,
        sortOrder: sortOrder !== undefined ? parseInt(sortOrder) : 0,
      })
      .returning();

    const savedLesson = result[0];

    if (slidesUrl && slidesUrl.startsWith('doc:')) {
      const docId = slidesUrl.slice(4);
      await documentStorage.backfillLessonId(docId, savedLesson.id);
    }

    res.status(201).json(savedLesson);
  } catch (error: unknown) {
    console.error('CMS Lesson creation error:', error);
    res.status(500).json({ error: 'Failed to create lesson.' });
  }
}

export async function updateLesson(req: AuthRequest, res: Response): Promise<void> {
  try {
    const lessonId = parseInt(req.params.id);
    const courseId = parseInt(req.params.courseId);
    const { title, content, videoUrl, slidesUrl, sortOrder } = req.body;

    if (isNaN(lessonId)) {
      res.status(400).json({ error: 'Invalid lesson ID' });
      return;
    }

    if (req.dbUser!.role !== 'admin') {
      const courseRows = await db.select().from(schema.courses).where(eq(schema.courses.id, courseId));
      if (courseRows.length === 0 || courseRows[0].createdBy !== req.dbUser!.id) {
        res.status(403).json({ error: 'Forbidden: You can only edit lessons in your own courses' });
        return;
      }
    }

    const updated = await db
      .update(schema.lessons)
      .set({
        title,
        content,
        videoUrl: toYouTubeEmbed(videoUrl),
        slidesUrl,
        sortOrder: sortOrder !== undefined ? parseInt(sortOrder) : undefined,
      })
      .where(and(eq(schema.lessons.id, lessonId), eq(schema.lessons.courseId, courseId)))
      .returning();

    if (updated.length === 0) {
      res.status(404).json({ error: 'Lesson not found' });
      return;
    }

    if (slidesUrl && slidesUrl.startsWith('doc:')) {
      const docId = slidesUrl.slice(4);
      await documentStorage.backfillLessonId(docId, lessonId);
    }

    res.json(updated[0]);
  } catch (error: unknown) {
    console.error('CMS Lesson edit error:', error);
    res.status(500).json({ error: 'Failed to update lesson.' });
  }
}

export async function reorderLessons(req: AuthRequest, res: Response): Promise<void> {
  try {
    const courseId = parseInt(req.params.courseId);
    const { orderedIds } = req.body;

    if (isNaN(courseId)) {
      res.status(400).json({ error: 'Invalid course ID' });
      return;
    }

    const courseLessons = await db
      .select({ id: schema.lessons.id })
      .from(schema.lessons)
      .where(eq(schema.lessons.courseId, courseId));
    const validIds = new Set(courseLessons.map((l) => l.id));
    const parsedIds = orderedIds.map((id: any) => parseInt(id)).filter((id: number) => !isNaN(id));
    const invalidIds = parsedIds.filter((id: number) => !validIds.has(id));
    if (invalidIds.length > 0) {
      res.status(400).json({ error: `Lessons ${invalidIds.join(', ')} do not belong to this course` });
      return;
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

    res.json({ success: true, message: 'Curriculum reordered successfully' });
  } catch (error: unknown) {
    console.error('CMS Reorder curriculum error:', error);
    res.status(500).json({ error: 'Failed to reorder lessons.' });
  }
}

export async function deleteLesson(req: AuthRequest, res: Response): Promise<void> {
  try {
    const lessonId = parseInt(req.params.id);
    const courseId = parseInt(req.params.courseId);
    if (isNaN(lessonId)) {
      res.status(400).json({ error: 'Invalid lesson ID' });
      return;
    }

    if (req.dbUser!.role !== 'admin') {
      const courseRows = await db.select().from(schema.courses).where(eq(schema.courses.id, courseId));
      if (courseRows.length === 0 || courseRows[0].createdBy !== req.dbUser!.id) {
        res.status(403).json({ error: 'Forbidden: You can only delete lessons in your own courses' });
        return;
      }
    }

    const lessonRows = await db
      .select({ slidesUrl: schema.lessons.slidesUrl })
      .from(schema.lessons)
      .where(and(eq(schema.lessons.id, lessonId), eq(schema.lessons.courseId, courseId)));

    const deleted = await db
      .delete(schema.lessons)
      .where(and(eq(schema.lessons.id, lessonId), eq(schema.lessons.courseId, courseId)))
      .returning();

    if (deleted.length === 0) {
      res.status(404).json({ error: 'Lesson not found' });
      return;
    }

    if (lessonRows.length > 0 && lessonRows[0].slidesUrl?.startsWith('doc:')) {
      const docId = lessonRows[0].slidesUrl.slice(4);
      await documentStorage.delete(docId).catch(() => {});
    }

    res.json({ success: true, message: 'Lesson deleted successfully' });
  } catch (error: unknown) {
    console.error('CMS Lesson deletion error:', error);
    res.status(500).json({ error: 'Failed to delete lesson.' });
  }
}
