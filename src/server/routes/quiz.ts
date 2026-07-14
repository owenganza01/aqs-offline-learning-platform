import { Application, RequestHandler } from 'express';
import { requireAuth } from '../../middleware/auth.ts';
import { submitQuiz } from '../controllers/quiz-controller.ts';

export interface QuizRouteDeps {
  quizSubmitRateLimit: RequestHandler;
}

export function registerQuizRoutes(app: Application, deps: QuizRouteDeps): void {
  app.post('/api/quizzes/:id/submit', requireAuth, deps.quizSubmitRateLimit, submitQuiz);
}
