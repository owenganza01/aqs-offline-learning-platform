import { Application, RequestHandler } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import {
  listCourses,
  listPublicCourses,
  getCourseById,
  completeCourseHandler,
  completeLesson,
} from '../controllers/course-controller.js';

export interface CourseRouteDeps {
  browseLimiter: RequestHandler;
  completionLimiter: RequestHandler;
  publicCoursesLimiter: RequestHandler;
}

export function registerCourseRoutes(app: Application, deps: CourseRouteDeps): void {
  app.get('/api/public/courses', deps.publicCoursesLimiter, listPublicCourses);

  app.get('/api/courses', requireAuth, deps.browseLimiter, listCourses);

  app.get('/api/courses/:id', requireAuth, deps.browseLimiter, getCourseById);

  app.post('/api/courses/:id/complete', requireAuth, deps.completionLimiter, completeCourseHandler);

  app.post('/api/lessons/:id/complete', requireAuth, deps.completionLimiter, completeLesson);
}
