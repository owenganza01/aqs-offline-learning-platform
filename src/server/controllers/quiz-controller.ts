import { Request, Response } from 'express';
import { db } from '../../db/index.ts';
import * as schema from '../../db/schema.ts';
import { AuthRequest } from '../../middleware/auth.ts';
import { eq } from 'drizzle-orm';
import { scoreQuiz } from '../../lib/scoring.ts';

export async function submitQuiz(req: AuthRequest, res: Response): Promise<void> {
  try {
    const quizId = parseInt(req.params.id);
    const { answers } = req.body;

    if (isNaN(quizId) || !Array.isArray(answers)) {
      res.status(400).json({ error: 'Invalid quiz submission body' });
      return;
    }

    const questionsList = await db
      .select({ correctOptionIndex: schema.questions.correctOptionIndex })
      .from(schema.questions)
      .where(eq(schema.questions.quizId, quizId));

    if (questionsList.length === 0) {
      res.status(404).json({ error: 'No questions found for this quiz.' });
      return;
    }

    const { correctCount, totalQuestions, score, passed } = scoreQuiz(questionsList, answers);

    const attempt = await db
      .insert(schema.quizAttempts)
      .values({
        userId: req.dbUser!.id,
        quizId,
        score,
        passed,
      })
      .returning();

    res.json({
      success: true,
      score,
      passed,
      correctCount,
      totalQuestions,
      attempt: attempt[0],
    });
  } catch (error: unknown) {
    console.error('Error scoring quiz:', error);
    res.status(500).json({ error: 'Failed to score and submit quiz.' });
  }
}
