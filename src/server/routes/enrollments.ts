import { Application, RequestHandler } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validateBody, enrollmentSchema } from '../../middleware/validate.js';
import { listEnrollments, enrollCourse } from '../controllers/enrollment-controller.js';

export interface EnrollmentRouteDeps {
  enrollmentRateLimit: RequestHandler;
}

export function registerEnrollmentRoutes(app: Application, deps: EnrollmentRouteDeps): void {
  app.get('/api/enrollments', requireAuth, listEnrollments);

  app.post('/api/enrollments', requireAuth, deps.enrollmentRateLimit, validateBody(enrollmentSchema), enrollCourse);
}
