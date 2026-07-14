import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.ts';
import * as quizAdminService from '../services/quiz-admin-service.ts';

export async function saveQuiz(req: AuthRequest, res: Response): Promise<void> {
  try {
    const courseId = parseInt(req.params.courseId);
    const { title, questions } = req.body;
    if (isNaN(courseId) || !title || !Array.isArray(questions)) {
      res.status(400).json({ error: 'Course ID, quiz title, and questions array are required.' });
      return;
    }
    const result = await quizAdminService.saveQuiz(courseId, title, questions);
    res.json({ success: true, ...result });
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
    const result = await quizAdminService.addQuizQuestion(courseId, {
      questionText,
      options: trimmedOptions,
      correctOptionIndex,
    });
    res.json({ success: true, ...result });
  } catch (error: any) {
    if (error.statusCode) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('Error creating single quiz question:', error);
    res.status(500).json({ error: 'Failed to create quiz question.' });
  }
}
