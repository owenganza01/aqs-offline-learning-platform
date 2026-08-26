import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.js';
import * as quizService from '../services/quiz-service.js';

export async function submitQuiz(req: AuthRequest, res: Response): Promise<void> {
  try {
    const quizId = parseInt(req.params.id);
    const { answers } = req.body;
    if (isNaN(quizId) || !Array.isArray(answers)) {
      res.status(400).json({ error: 'Invalid quiz submission body' });
      return;
    }
    const result = await quizService.submitQuiz(req.dbUser!.id, quizId, answers);
    res.json({ success: true, ...result });
  } catch (error: any) {
    if (error.statusCode) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('Error scoring quiz:', error);
    res.status(500).json({ error: 'Failed to score and submit quiz.' });
  }
}
