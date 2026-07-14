import { Request, Response } from 'express';
import { db } from '../../db/index.ts';
import * as schema from '../../db/schema.ts';
import { AuthRequest } from '../../middleware/auth.ts';
import { completeCourse } from '../services/course-service.ts';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
function parsePagination(req: Request): { limit: number; offset: number } {
  const limit = Math.min(Math.max(parseInt(req.query.limit as string) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
  return { limit, offset };
}

export async function listCourses(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { limit, offset } = parsePagination(req);
    const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(schema.courses);
    const allCourses = await db.select().from(schema.courses).limit(limit).offset(offset);
    const courseIds = allCourses.map((c) => c.id);

    const lessonsByCourse = new Map<
      number,
      {
        id: number;
        courseId: number;
        title: string;
        sortOrder: number;
        videoUrl: string | null;
        slidesUrl: string | null;
      }[]
    >();
    const quizByCourse = new Map<number, { id: number; courseId: number; title: string }>();
    if (courseIds.length > 0) {
      const allLessons = await db
        .select({
          id: schema.lessons.id,
          courseId: schema.lessons.courseId,
          title: schema.lessons.title,
          sortOrder: schema.lessons.sortOrder,
          videoUrl: schema.lessons.videoUrl,
          slidesUrl: schema.lessons.slidesUrl,
        })
        .from(schema.lessons)
        .where(inArray(schema.lessons.courseId, courseIds))
        .orderBy(schema.lessons.sortOrder);

      for (const lesson of allLessons) {
        if (!lessonsByCourse.has(lesson.courseId)) {
          lessonsByCourse.set(lesson.courseId, []);
        }
        lessonsByCourse.get(lesson.courseId)!.push(lesson);
      }

      const allQuizzes = await db
        .select({
          id: schema.quizzes.id,
          courseId: schema.quizzes.courseId,
          title: schema.quizzes.title,
        })
        .from(schema.quizzes)
        .where(inArray(schema.quizzes.courseId, courseIds));
      for (const q of allQuizzes) {
        quizByCourse.set(q.courseId, q);
      }
    }

    const coursesWithDetails = allCourses.map((course) => ({
      ...course,
      lessons: lessonsByCourse.get(course.id) || [],
      quiz: quizByCourse.get(course.id) || null,
    }));

    res.setHeader('X-Total-Count', Number(count));
    res.json(coursesWithDetails);
  } catch (error: any) {
    console.error('Error fetching courses:', error);
    res.status(500).json({ error: 'Failed to retrieve courses.' });
  }
}

export async function getCourseById(req: AuthRequest, res: Response): Promise<void> {
  try {
    const courseId = parseInt(req.params.id);
    if (isNaN(courseId)) {
      res.status(400).json({ error: 'Invalid course ID' });
      return;
    }

    const courseList = await db.select().from(schema.courses).where(eq(schema.courses.id, courseId));
    if (courseList.length === 0) {
      res.status(404).json({ error: 'Course not found' });
      return;
    }

    const course = courseList[0];

    const courseLessons = await db
      .select()
      .from(schema.lessons)
      .where(eq(schema.lessons.courseId, courseId))
      .orderBy(schema.lessons.sortOrder);

    const courseQuizzes = await db.select().from(schema.quizzes).where(eq(schema.quizzes.courseId, courseId));
    let quiz = null;

    if (courseQuizzes.length > 0) {
      const fullQuiz = courseQuizzes[0];
      const quizQuestionsRaw = await db
        .select({
          id: schema.questions.id,
          quizId: schema.questions.quizId,
          questionText: schema.questions.questionText,
          options: schema.questions.options,
        })
        .from(schema.questions)
        .where(eq(schema.questions.quizId, fullQuiz.id));

      quiz = {
        ...fullQuiz,
        questions: quizQuestionsRaw,
      };
    }

    const completions = await db
      .select({ lessonId: schema.lessonCompletions.lessonId })
      .from(schema.lessonCompletions)
      .where(eq(schema.lessonCompletions.userId, req.dbUser!.id));

    const completionsIds = completions.map((c) => c.lessonId);

    const quizAttemptsList = quiz
      ? await db
          .select()
          .from(schema.quizAttempts)
          .where(and(eq(schema.quizAttempts.userId, req.dbUser!.id), eq(schema.quizAttempts.quizId, quiz.id)))
          .orderBy(desc(schema.quizAttempts.attemptedAt))
      : [];

    res.json({
      course,
      lessons: courseLessons,
      quiz,
      completedLessonIds: completionsIds,
      quizAttempts: quizAttemptsList,
    });
  } catch (error: any) {
    console.error('Error loading course details:', error);
    res.status(500).json({ error: 'Failed to load course details.' });
  }
}

export async function completeCourseHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const courseId = parseInt(req.params.id);
    if (isNaN(courseId)) {
      res.status(400).json({ error: 'Invalid course ID' });
      return;
    }

    const result = await completeCourse(req.dbUser!.id, courseId);
    res.json({ success: true, completionId: result.completionId, completedAt: result.completedAt.toISOString() });
  } catch (error: any) {
    if (error.message?.startsWith('Course not completable:')) {
      res.status(422).json({ error: error.message });
      return;
    }
    console.error('Error in /api/courses/:id/complete:', error);
    res.status(500).json({ error: error.message || 'Failed to complete course.' });
  }
}

export async function completeLesson(req: AuthRequest, res: Response): Promise<void> {
  try {
    const lessonId = parseInt(req.params.id);
    if (isNaN(lessonId)) {
      res.status(400).json({ error: 'Invalid lesson ID' });
      return;
    }

    const existing = await db
      .select()
      .from(schema.lessonCompletions)
      .where(and(eq(schema.lessonCompletions.userId, req.dbUser!.id), eq(schema.lessonCompletions.lessonId, lessonId)));

    if (existing.length === 0) {
      await db.insert(schema.lessonCompletions).values({
        userId: req.dbUser!.id,
        lessonId,
      });
    }

    res.json({ success: true, lessonId });
  } catch (error: any) {
    console.error('Error checking/creating lesson completion:', error);
    res.status(500).json({ error: 'Failed to complete lesson.' });
  }
}
