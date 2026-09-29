import { Application, RequestHandler } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validateBody, enrollmentSchema } from '../../middleware/validate.js';
import { listEnrollments, enrollCourse, unenrollCourse } from '../controllers/enrollment-controller.js';

export interface EnrollmentRouteDeps {
  enrollmentRateLimit: RequestHandler;
}

export function registerEnrollmentRoutes(app: Application, deps: EnrollmentRouteDeps): void {
  app.get('/api/enrollments', requireAuth, listEnrollments);

  app.post('/api/enrollments', requireAuth, deps.enrollmentRateLimit, validateBody(enrollmentSchema), enrollCourse);

  // Destructive: drops the enrollment and every progress record for the course.
  app.delete('/api/enrollments/:courseId', requireAuth, deps.enrollmentRateLimit, unenrollCourse);
}
