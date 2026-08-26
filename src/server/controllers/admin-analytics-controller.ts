import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.js';
import * as analyticsService from '../services/analytics-service.js';

export async function getAnalytics(req: AuthRequest, res: Response): Promise<void> {
  try {
    const data = await analyticsService.getAnalytics();
    res.json(data);
  } catch (error: unknown) {
    console.error('CMS Analytics fetch error:', error);
    res.status(500).json({ error: 'Failed to compile enrollment analytics.' });
  }
}
