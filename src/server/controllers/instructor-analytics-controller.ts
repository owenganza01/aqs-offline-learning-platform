import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.js';
import { getInstructorAnalytics } from '../services/analytics-service.js';

export async function getInstructorAnalyticsHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const analytics = await getInstructorAnalytics(req.dbUser!.id);
    res.json(analytics);
  } catch (error: unknown) {
    console.error('Instructor analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics.' });
  }
}
