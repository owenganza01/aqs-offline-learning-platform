import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.js';
import {
  getMaxLimits,
  processEnrollments,
  processLessonCompletions,
  processQuizSubmissions,
  reconcileCourseCompletions,
  getUserSyncState,
} from '../services/sync-service.js';

export async function syncHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const {
      lessonCompletions: localCompletions,
      quizSubmissions: localQuizzes,
      enrollments: localEnrollments = [],
    } = req.body;
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

    // Flush queued enrollments FIRST so a quiz submitted in the same batch
    // satisfies the server's enrollment gate.
    const { processedEnrollments, rejectedEnrollments } = await processEnrollments(userId, localEnrollments);
    await processLessonCompletions(userId, localCompletions);
    const { processedQuizzes, rejectedQuizzes } = await processQuizSubmissions(userId, localQuizzes);
    const reconciledCourseIds = await reconcileCourseCompletions(userId, localCompletions, localQuizzes);
    const syncState = await getUserSyncState(userId);

    res.json({
      success: true,
      ...syncState,
      processedEnrollments,
      rejectedEnrollments,
      processedQuizzes,
      rejectedQuizzes,
      reconciledCourseIds,
    });
  } catch (error: unknown) {
    console.error('Error in reconnect-sync engine:', error);
    res.status(500).json({ error: 'Failed to synchronize progress data.' });
  }
}
