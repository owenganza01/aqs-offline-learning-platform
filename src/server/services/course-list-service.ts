import { db } from '../../db/index.js';
import * as schema from '../../db/schema.js';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

export function parsePagination(req: { query: { limit?: string; offset?: string } }): {
  limit: number;
  offset: number;
} {
  const limit = Math.min(Math.max(parseInt(req.query.limit || '') || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const offset = Math.max(parseInt(req.query.offset || '') || 0, 0);
  return { limit, offset };
}

export async function listCourses(limit: number, offset: number) {
  const countResult = await db.select({ count: sql<number>`count(*)` }).from(schema.courses);
  const count = Number(countResult[0]?.count ?? 0);

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

  return { courses: coursesWithDetails, count };
}

export async function getCourseDetail(courseId: number, userId: number) {
  const courseRows = await db.select().from(schema.courses).where(eq(schema.courses.id, courseId));
  if (courseRows.length === 0) return null;

  const course = courseRows[0];

  const courseLessons = await db
    .select()
    .from(schema.lessons)
    .where(eq(schema.lessons.courseId, courseId))
    .orderBy(schema.lessons.sortOrder);

  const courseQuizzes = await db.select().from(schema.quizzes).where(eq(schema.quizzes.courseId, courseId));
  let quiz: any = null;

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

    quiz = { ...fullQuiz, questions: quizQuestionsRaw };
  }

  const completions = await db
    .select({ lessonId: schema.lessonCompletions.lessonId })
    .from(schema.lessonCompletions)
    .where(eq(schema.lessonCompletions.userId, userId));

  const completionsIds = completions.map((c) => c.lessonId);

  const quizAttemptsList = quiz
    ? await db
        .select()
        .from(schema.quizAttempts)
        .where(and(eq(schema.quizAttempts.userId, userId), eq(schema.quizAttempts.quizId, quiz.id)))
        .orderBy(desc(schema.quizAttempts.attemptedAt))
    : [];

  return { course, lessons: courseLessons, quiz, completedLessonIds: completionsIds, quizAttempts: quizAttemptsList };
}
