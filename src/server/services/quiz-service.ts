import { db } from '../../db/index.ts';
import * as schema from '../../db/schema.ts';
import { eq } from 'drizzle-orm';
import { scoreQuiz } from '../../lib/scoring.ts';

export async function submitQuiz(userId: number, quizId: number, answers: any[]) {
  const questionsList = await db
    .select({ correctOptionIndex: schema.questions.correctOptionIndex })
    .from(schema.questions)
    .where(eq(schema.questions.quizId, quizId));

  if (questionsList.length === 0) {
    throw Object.assign(new Error('No questions found for this quiz.'), { statusCode: 404 });
  }

  const result = scoreQuiz(questionsList, answers);

  const attemptResult = await db
    .insert(schema.quizAttempts)
    .values({
      userId,
      quizId,
      score: result.score,
      passed: result.passed,
    })
    .returning();

  return {
    score: result.score,
    passed: result.passed,
    correctCount: result.correctCount,
    totalQuestions: result.totalQuestions,
    attempt: attemptResult[0],
  };
}
