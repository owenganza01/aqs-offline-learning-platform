import { Application, RequestHandler } from 'express';
import { requireAuth, requireInstructorOrAdmin } from '../../middleware/auth.js';
import { getInstructorAnalyticsHandler } from '../controllers/instructor-analytics-controller.js';

export interface InstructorAnalyticsRouteDeps {
  instructorLimiter: RequestHandler;
}

export function registerInstructorAnalyticsRoutes(app: Application, deps: InstructorAnalyticsRouteDeps): void {
  app.get(
    '/api/instructor/analytics',
    requireAuth,
    requireInstructorOrAdmin,
    deps.instructorLimiter,
    getInstructorAnalyticsHandler,
  );
}
