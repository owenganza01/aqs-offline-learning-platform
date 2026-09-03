import { db } from '../../db/index.js';
import * as schema from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { scoreQuiz } from '../../lib/scoring.js';
import { issueCertificate } from './certificate-service.js';

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

  // Check for certificate eligibility after quiz submission
  try {
    const quiz = await db.select().from(schema.quizzes).where(eq(schema.quizzes.id, quizId)).limit(1);
    if (quiz.length > 0) {
      await issueCertificate(userId, quiz[0].courseId);
    }
  } catch (err) {
    console.error('Certificate check after quiz submission failed:', err);
  }

  return {
    score: result.score,
    passed: result.passed,
    correctCount: result.correctCount,
    totalQuestions: result.totalQuestions,
    attempt: attemptResult[0],
  };
}
