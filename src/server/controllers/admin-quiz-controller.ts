import { Request, Response } from 'express';
import { db } from '../../db/index.ts';
import * as schema from '../../db/schema.ts';
import { AuthRequest } from '../../middleware/auth.ts';
import { eq } from 'drizzle-orm';

export async function saveQuiz(req: AuthRequest, res: Response): Promise<void> {
  try {
    const courseId = parseInt(req.params.courseId);
    const { title, questions } = req.body;

    if (isNaN(courseId) || !title || !Array.isArray(questions)) {
      res.status(400).json({ error: 'Course ID, quiz title, and questions array are required.' });
      return;
    }

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

    res.json({
      success: true,
      quizId,
      uploadedQuestionsCount: insertedQuestions.length,
    });
  } catch (error: unknown) {
    console.error('CMS Quiz synchronizing error:', error);
    res.status(500).json({ error: 'Failed to save curriculum quiz.' });
  }
}

export async function addQuizQuestion(req: AuthRequest, res: Response): Promise<void> {
  try {
    const courseId = parseInt(req.params.courseId);
    const { questionText, options, correctOptionIndex } = req.body;

    if (isNaN(courseId) || !questionText || !Array.isArray(options) || correctOptionIndex === undefined) {
      res.status(400).json({ error: 'Course ID, question text, options array, and correctOptionIndex are required.' });
      return;
    }

    const trimmedOptions = options.map((opt: any) => (typeof opt === 'string' ? opt.trim() : ''));
    if (trimmedOptions.some((opt: string) => !opt)) {
      res.status(400).json({ error: 'All of the 4 options must be non-empty strings.' });
      return;
    }

    const parsedCorrectOptionIndex = parseInt(correctOptionIndex as any);
    if (
      isNaN(parsedCorrectOptionIndex) ||
      parsedCorrectOptionIndex < 0 ||
      parsedCorrectOptionIndex >= trimmedOptions.length
    ) {
      res.status(400).json({ error: 'Invalid correct option index.' });
      return;
    }

    const courseExists = await db.select().from(schema.courses).where(eq(schema.courses.id, courseId));
    if (courseExists.length === 0) {
      res.status(404).json({ error: 'Course not found.' });
      return;
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
          title: `${courseExists[0].title} Exam`,
        })
        .returning();
      quizId = newQuiz[0].id;
    }

    const question = await db
      .insert(schema.questions)
      .values({
        quizId,
        questionText: questionText.trim(),
        options: trimmedOptions,
        correctOptionIndex: parsedCorrectOptionIndex,
      })
      .returning();

    res.json({
      success: true,
      quizId,
      question: question[0],
    });
  } catch (error: unknown) {
    console.error('Error creating single quiz question:', error);
    res.status(500).json({ error: 'Failed to create quiz question.' });
  }
}
