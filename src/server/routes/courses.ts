import { Application, RequestHandler } from 'express';
import multer from 'multer';
import { requireAuth, requireAuthOrQueryToken } from '../../middleware/auth.js';
import {
  listCourses,
  listPublicCourses,
  getCourseById,
  completeCourseHandler,
  completeLesson,
  uploadCourseCover,
  removeCourseCover,
  getCourseCover,
} from '../controllers/course-controller.js';
import { ALLOWED_IMAGE_MIME_TYPE_SET, MAX_COVER_UPLOAD_SIZE_BYTES } from '../../lib/mime-types.js';

// Course cover images (DEF-004). Image-only, memory-backed, and capped well
// below the lesson upload budget since covers are dashboard thumbnails.
const coverUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_COVER_UPLOAD_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_MIME_TYPE_SET.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG or WebP images are supported as course covers.'));
    }
  },
});

export interface CourseRouteDeps {
  browseLimiter: RequestHandler;
  completionLimiter: RequestHandler;
  publicCoursesLimiter: RequestHandler;
  courseAssetLimiter?: RequestHandler;
}

export function registerCourseRoutes(app: Application, deps: CourseRouteDeps): void {
  app.get('/api/public/courses', deps.publicCoursesLimiter, listPublicCourses);

  app.get('/api/courses', requireAuth, deps.browseLimiter, listCourses);

  app.get('/api/courses/:id', requireAuth, deps.browseLimiter, getCourseById);

  // Registered before the other /api/courses/:courseId routes would matter for
  // path shape; Express matches by exact segment count so there is no conflict.
  // requireAuthOrQueryToken: covers are visible to any signed-in learner,
  // including those not enrolled, and <img src> cannot send an auth header.
  app.get('/api/courses/:courseId/cover', requireAuthOrQueryToken, deps.browseLimiter, getCourseCover);

  app.post(
    '/api/courses/:courseId/cover',
    requireAuth,
    deps.courseAssetLimiter ?? deps.browseLimiter,
    coverUpload.single('file'),
    uploadCourseCover,
  );

  app.delete(
    '/api/courses/:courseId/cover',
    requireAuth,
    deps.courseAssetLimiter ?? deps.browseLimiter,
    removeCourseCover,
  );

  app.post('/api/courses/:id/complete', requireAuth, deps.completionLimiter, completeCourseHandler);

  app.post('/api/lessons/:id/complete', requireAuth, deps.completionLimiter, completeLesson);
}
