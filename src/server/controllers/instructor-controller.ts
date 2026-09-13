// src/server/controllers/instructor-controller.ts
import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.js';
import { submitInstructorOnboarding, reopenInstructorOnboarding, StateGuardError } from '../services/user-service.js';

export async function submitOnboarding(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { name, bio, organization } = req.body;
    const updated = await submitInstructorOnboarding(req.dbUser!.id, {
      name,
      bio,
      organization,
    });
    res.json({ success: true, dbUser: updated });
  } catch (error: unknown) {
    if (error instanceof StateGuardError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('Instructor onboarding error:', error);
    res.status(500).json({ error: 'Failed to submit instructor profile for review.' });
  }
}

export async function reopenOnboarding(req: AuthRequest, res: Response): Promise<void> {
  try {
    const updated = await reopenInstructorOnboarding(req.dbUser!.id);
    res.json({ success: true, dbUser: updated });
  } catch (error: unknown) {
    if (error instanceof StateGuardError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('Instructor onboarding reopen error:', error);
    res.status(500).json({ error: 'Failed to reopen instructor application.' });
  }
}
