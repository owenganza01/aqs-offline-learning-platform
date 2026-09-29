import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.js';
import { getUserEnrollments, enrollUserInCourse, unenrollUserFromCourse } from '../services/enrollment-service.js';
import { ClosureError } from '../services/closure-service.js';
import { courseIdParamSchema } from '../../middleware/validate.js';

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
    if (error instanceof ClosureError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('Error creating enrollment:', error);
    res.status(500).json({ error: 'Failed to create enrollment.' });
  }
}

/**
 * Leaves a course and permanently destroys the learner's progress for it
 * (DEF-007). Destructive and irreversible, so it is intentionally not queued
 * for later sync — the client must be online for the server purge to happen.
 */
export async function unenrollCourse(req: AuthRequest, res: Response): Promise<void> {
  try {
    const parsed = courseIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid course ID' });
      return;
    }

    const result = await unenrollUserFromCourse(req.dbUser!.id, parsed.data.courseId);
    res.json(result);
  } catch (error: unknown) {
    console.error('Error unenrolling from course:', error);
    res.status(500).json({ error: 'Failed to leave course. Please try again.' });
  }
}
