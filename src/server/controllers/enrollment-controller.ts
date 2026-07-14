import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.ts';
import { getUserEnrollments, enrollUserInCourse } from '../services/enrollment-service.ts';

export async function listEnrollments(req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await getUserEnrollments(req.dbUser!.id);
    res.json(result);
  } catch (error: unknown) {
    console.error('Error fetching enrollments:', error);
    res.status(500).json({ error: 'Failed to fetch enrollments.' });
  }
}

export async function enrollCourse(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { courseId } = req.body;
    const result = await enrollUserInCourse(req.dbUser!.id, courseId);
    res.json(result);
  } catch (error: unknown) {
    console.error('Error creating enrollment:', error);
    res.status(500).json({ error: 'Failed to create enrollment.' });
  }
}
