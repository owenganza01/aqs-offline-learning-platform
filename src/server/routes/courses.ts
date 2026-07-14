import { Application } from 'express';
import { requireAuth } from '../../middleware/auth.ts';
import { listCourses, getCourseById, completeCourseHandler, completeLesson } from '../controllers/course-controller.ts';

export function registerCourseRoutes(app: Application): void {
  app.get('/api/courses', requireAuth, listCourses);

  app.get('/api/courses/:id', requireAuth, getCourseById);

  app.post('/api/courses/:id/complete', requireAuth, completeCourseHandler);

  app.post('/api/lessons/:id/complete', requireAuth, completeLesson);
}
