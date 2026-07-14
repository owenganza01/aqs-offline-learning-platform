import { Application } from 'express';
import { requireAuth, requireInstructorOrAdmin } from '../../middleware/auth.ts';
import { validateBody, createCohortSchema } from '../../middleware/validate.ts';
import { createCohort, listCohorts, regenerateCohortCode } from '../controllers/instructor-cohort-controller.ts';

export function registerCohortRoutes(app: Application): void {
  app.post(
    '/api/instructor/cohorts',
    requireAuth,
    requireInstructorOrAdmin,
    validateBody(createCohortSchema),
    createCohort,
  );

  app.get('/api/instructor/cohorts', requireAuth, requireInstructorOrAdmin, listCohorts);

  app.post('/api/instructor/cohorts/:id/regenerate-code', requireAuth, requireInstructorOrAdmin, regenerateCohortCode);
}
