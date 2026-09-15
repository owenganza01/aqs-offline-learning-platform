import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.js';
import { getInstructorCourses, getInstructorLearners } from '../services/analytics-service.js';

export async function getInstructorCoursesHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const data = await getInstructorCourses(req.dbUser!.id);
    res.json(data);
  } catch (error: unknown) {
    console.error('Instructor courses error:', error);
    res.status(500).json({ error: 'Failed to fetch instructor courses.' });
  }
}

export async function getInstructorLearnersHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const data = await getInstructorLearners(req.dbUser!.id);
    res.json(data);
  } catch (error: unknown) {
    console.error('Instructor learners error:', error);
    res.status(500).json({ error: 'Failed to fetch instructor learners.' });
  }
}
