import { Request, Response } from 'express';
import { AuthRequest } from '../../middleware/auth.js';
import {
  getMaxLimits,
  processLessonCompletions,
  processQuizSubmissions,
  getUserSyncState,
} from '../services/sync-service.js';

export async function syncHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { lessonCompletions: localCompletions, quizSubmissions: localQuizzes } = req.body;
    const { maxCompletions, maxQuizzes } = getMaxLimits();

    if (localCompletions.length > maxCompletions) {
      res.status(400).json({ error: `Too many lesson completions. Maximum is ${maxCompletions}.` });
      return;
    }
    if (localQuizzes.length > maxQuizzes) {
      res.status(400).json({ error: `Too many quiz submissions. Maximum is ${maxQuizzes}.` });
      return;
    }

    const userId = req.dbUser!.id;

    await processLessonCompletions(userId, localCompletions);
    const processedQuizzes = await processQuizSubmissions(userId, localQuizzes);
    const syncState = await getUserSyncState(userId);

    res.json({
      success: true,
      ...syncState,
      processedQuizzes,
    });
  } catch (error: unknown) {
    console.error('Error in reconnect-sync engine:', error);
    res.status(500).json({ error: 'Failed to synchronize progress data.' });
  }
}
