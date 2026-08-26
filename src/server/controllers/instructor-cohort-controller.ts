import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.js';
import {
  createCohort as createCohortService,
  listCohorts as listCohortsService,
  regenerateCohortCode as regenerateCohortCodeService,
} from '../services/cohort-service.js';

export async function createCohort(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { name } = req.body;
    const cohort = await createCohortService(name, req.dbUser!.id);
    res.status(201).json(cohort);
  } catch (error: unknown) {
    console.error('Create cohort error:', error);
    res.status(500).json({ error: 'Failed to create cohort.' });
  }
}

export async function listCohorts(req: AuthRequest, res: Response): Promise<void> {
  try {
    const cohortsList = await listCohortsService(req.dbUser!.role, req.dbUser!.id);
    res.json(cohortsList);
  } catch (error: unknown) {
    console.error('List cohorts error:', error);
    res.status(500).json({ error: 'Failed to fetch cohorts.' });
  }
}

export async function regenerateCohortCode(req: AuthRequest, res: Response): Promise<void> {
  try {
    const cohortId = parseInt(req.params.id);
    if (isNaN(cohortId)) {
      res.status(400).json({ error: 'Invalid cohort ID' });
      return;
    }

    const updated = await regenerateCohortCodeService(cohortId, req.dbUser!.id, req.dbUser!.role);
    res.json(updated);
  } catch (error: unknown) {
    if (error instanceof Error && 'statusCode' in error) {
      const err = error as Error & { statusCode: number };
      res.status(err.statusCode).json({ error: error.message });
      return;
    }
    console.error('Regenerate cohort code error:', error);
    res.status(500).json({ error: 'Failed to regenerate invite code.' });
  }
}
