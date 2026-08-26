import { Application, RequestHandler } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { submitQuiz } from '../controllers/quiz-controller.js';

export interface QuizRouteDeps {
  quizSubmitRateLimit: RequestHandler;
}

export function registerQuizRoutes(app: Application, deps: QuizRouteDeps): void {
  app.post('/api/quizzes/:id/submit', requireAuth, deps.quizSubmitRateLimit, submitQuiz);
}
