import { db } from '../../db/index.ts';
import * as schema from '../../db/schema.ts';
import { eq } from 'drizzle-orm';

export async function saveQuiz(courseId: number, title: string, questions: any[]) {
  let quizId: number;
  const existingQuizzes = await db.select().from(schema.quizzes).where(eq(schema.quizzes.courseId, courseId));

  if (existingQuizzes.length > 0) {
    quizId = existingQuizzes[0].id;
    await db.update(schema.quizzes).set({ title }).where(eq(schema.quizzes.id, quizId));
    await db.delete(schema.questions).where(eq(schema.questions.quizId, quizId));
  } else {
    const newQuiz = await db.insert(schema.quizzes).values({ courseId, title }).returning();
    quizId = newQuiz[0].id;
  }

  const questionValues = questions
    .filter((q: any) => q.questionText && Array.isArray(q.options) && q.correctOptionIndex !== undefined)
    .map((q: any) => ({
      quizId,
      questionText: q.questionText,
      options: q.options,
      correctOptionIndex: parseInt(q.correctOptionIndex),
    }));

  const insertedQuestions =
    questionValues.length > 0 ? await db.insert(schema.questions).values(questionValues).returning() : [];

  return { quizId, uploadedQuestionsCount: insertedQuestions.length };
}

export async function addQuizQuestion(
  courseId: number,
  body: {
    questionText: string;
    options: string[];
    correctOptionIndex: number;
    courseTitle?: string;
  },
) {
  const parsedCorrectOptionIndex = parseInt(body.correctOptionIndex as any);
  if (
    isNaN(parsedCorrectOptionIndex) ||
    parsedCorrectOptionIndex < 0 ||
    parsedCorrectOptionIndex >= body.options.length
  ) {
    throw Object.assign(new Error('Invalid correct option index.'), { statusCode: 400 });
  }

  const courseRows = await db.select().from(schema.courses).where(eq(schema.courses.id, courseId));
  if (courseRows.length === 0) {
    throw Object.assign(new Error('Course not found.'), { statusCode: 404 });
  }

  let quizId: number;
  const existingQuizzes = await db.select().from(schema.quizzes).where(eq(schema.quizzes.courseId, courseId));

  if (existingQuizzes.length > 0) {
    quizId = existingQuizzes[0].id;
  } else {
    const newQuiz = await db
      .insert(schema.quizzes)
      .values({
        courseId,
        title: body.courseTitle || `${courseRows[0].title} Exam`,
      })
      .returning();
    quizId = newQuiz[0].id;
  }

  const question = await db
    .insert(schema.questions)
    .values({
      quizId,
      questionText: body.questionText.trim(),
      options: body.options,
      correctOptionIndex: parsedCorrectOptionIndex,
    })
    .returning();

  return { quizId, question: question[0] };
}
