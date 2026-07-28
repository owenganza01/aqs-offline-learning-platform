import { Application, RequestHandler } from 'express';
import { requireAuth, requireInstructorOrAdmin } from '../../middleware/auth.ts';
import { validateBody, createCohortSchema } from '../../middleware/validate.ts';
import { createCohort, listCohorts, regenerateCohortCode } from '../controllers/instructor-cohort-controller.ts';

export interface CohortRouteDeps {
  adminLimiter: RequestHandler;
}

export function registerCohortRoutes(app: Application, deps: CohortRouteDeps): void {
  app.post(
    '/api/instructor/cohorts',
    requireAuth,
    requireInstructorOrAdmin,
    deps.adminLimiter,
    validateBody(createCohortSchema),
    createCohort,
  );

  app.get('/api/instructor/cohorts', requireAuth, requireInstructorOrAdmin, deps.adminLimiter, listCohorts);

  app.post(
    '/api/instructor/cohorts/:id/regenerate-code',
    requireAuth,
    requireInstructorOrAdmin,
    deps.adminLimiter,
    regenerateCohortCode,
  );
}
