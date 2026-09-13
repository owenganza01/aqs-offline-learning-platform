import { Application, RequestHandler } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validateBody, instructorOnboardSchema } from '../../middleware/validate.js';
import { submitOnboarding, reopenOnboarding } from '../controllers/instructor-controller.js';

export interface InstructorRoutesDeps {
  onboardRateLimit: RequestHandler;
}

export function registerInstructorRoutes(app: Application, deps: InstructorRoutesDeps): void {
  app.put(
    '/api/instructor/onboard',
    requireAuth,
    deps.onboardRateLimit,
    validateBody(instructorOnboardSchema),
    submitOnboarding,
  );

  app.put('/api/instructor/onboard/reopen', requireAuth, deps.onboardRateLimit, reopenOnboarding);
}
