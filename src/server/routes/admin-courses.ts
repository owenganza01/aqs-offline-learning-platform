import { Application } from 'express';
import { requireAuth, requireInstructorOrAdmin, requireAdmin } from '../../middleware/auth.js';
import {
  validateBody,
  courseSchema,
  lessonSchema,
  reorderSchema,
  quizSchema,
  quizQuestionSchema,
} from '../../middleware/validate.js';
import {
  createCourse,
  updateCourse,
  deleteCourse,
  createLesson,
  updateLesson,
  reorderLessons,
  deleteLesson,
} from '../controllers/admin-course-controller.js';
import { saveQuiz, addQuizQuestion } from '../controllers/admin-quiz-controller.js';
import { getAnalytics } from '../controllers/admin-analytics-controller.js';

export function registerAdminCourseRoutes(app: Application): void {
  app.post('/api/admin/courses', requireAuth, requireInstructorOrAdmin, validateBody(courseSchema), createCourse);

  app.put('/api/admin/courses/:id', requireAuth, requireInstructorOrAdmin, validateBody(courseSchema), updateCourse);

  app.delete('/api/admin/courses/:id', requireAuth, requireInstructorOrAdmin, deleteCourse);

  app.post(
    '/api/admin/courses/:courseId/lessons',
    requireAuth,
    requireInstructorOrAdmin,
    validateBody(lessonSchema),
    createLesson,
  );

  app.put(
    '/api/admin/courses/:courseId/lessons/:id',
    requireAuth,
    requireInstructorOrAdmin,
    validateBody(lessonSchema),
    updateLesson,
  );

  app.put(
    '/api/admin/courses/:courseId/lessons/reorder',
    requireAuth,
    requireInstructorOrAdmin,
    validateBody(reorderSchema),
    reorderLessons,
  );

  app.delete('/api/admin/courses/:courseId/lessons/:id', requireAuth, requireInstructorOrAdmin, deleteLesson);

  app.post(
    '/api/admin/courses/:courseId/quiz',
    requireAuth,
    requireInstructorOrAdmin,
    validateBody(quizSchema),
    saveQuiz,
  );

  app.post(
    '/api/admin/courses/:courseId/quiz/questions',
    requireAuth,
    requireInstructorOrAdmin,
    validateBody(quizQuestionSchema),
    addQuizQuestion,
  );

  app.get('/api/admin/analytics', requireAuth, requireAdmin, getAnalytics);
}
