import { Application, RequestHandler } from 'express';
import { requireAuth, requireInstructorOrAdmin } from '../../middleware/auth.js';
import {
  getInstructorCoursesHandler,
  getInstructorLearnersHandler,
} from '../controllers/instructor-dashboard-controller.js';

export interface InstructorDashboardRouteDeps {
  instructorLimiter: RequestHandler;
}

export function registerInstructorDashboardRoutes(app: Application, deps: InstructorDashboardRouteDeps): void {
  app.get(
    '/api/instructor/courses',
    requireAuth,
    requireInstructorOrAdmin,
    deps.instructorLimiter,
    getInstructorCoursesHandler,
  );

  app.get(
    '/api/instructor/learners',
    requireAuth,
    requireInstructorOrAdmin,
    deps.instructorLimiter,
    getInstructorLearnersHandler,
  );
}
