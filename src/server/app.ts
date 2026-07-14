// src/server/app.ts
import express, { Response } from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cors from 'cors';
import path from 'path';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import { db } from '../db/index.ts';
import * as schema from '../db/schema.ts';
import {
  requireAuth,
  requireAuthOrQueryToken,
  requireAdmin,
  requireInstructorOrAdmin,
  AuthRequest,
} from '../middleware/auth.ts';

import {
  validateBody,
  registerSchema,
  createInstructorSchema,
  createCohortSchema,
  changeRoleSchema,
  updateProfileSchema,
  courseSchema,
  lessonSchema,
  reorderSchema,
  quizSchema,
  quizQuestionSchema,
  enrollmentSchema,
  syncSchema,
} from '../middleware/validate.ts';
import { rateLimit } from '../middleware/rate-limit.ts';
import { toYouTubeEmbed } from '../lib/utils.ts';
import { ALLOWED_SLIDE_MIME_TYPE_SET, MAX_UPLOAD_SIZE_BYTES } from '../lib/mime-types.ts';
import { eq, sql } from 'drizzle-orm';
import { getHealth } from './controllers/health-controller.ts';
import { getMe, register, updateProfile } from './controllers/auth-controller.ts';
import { listCourses, getCourseById, completeCourseHandler, completeLesson } from './controllers/course-controller.ts';
import { submitQuiz } from './controllers/quiz-controller.ts';
import { syncHandler } from './controllers/sync-controller.ts';
import { listUsers, changeUserRole, createInstructor } from './controllers/admin-user-controller.ts';
import {
  createCourse,
  updateCourse,
  deleteCourse,
  createLesson,
  updateLesson,
  reorderLessons,
  deleteLesson,
} from './controllers/admin-course-controller.ts';
import { saveQuiz, addQuizQuestion } from './controllers/admin-quiz-controller.ts';
import { getAnalytics } from './controllers/admin-analytics-controller.ts';
import { listEnrollments, enrollCourse } from './controllers/enrollment-controller.ts';
import { createCohort, listCohorts, regenerateCohortCode } from './controllers/instructor-cohort-controller.ts';
import {
  uploadDocument,
  getDocumentMetadata,
  downloadDocument,
  deleteDocument,
} from './controllers/document-controller.ts';

export async function createApp() {
  const app = express();

  // Middleware
  app.use(express.json({ limit: '10mb' }));

  // CORS — explicitly configured for same-origin. Update if API and frontend are deployed separately.
  app.use(
    cors({
      origin:
        process.env.NODE_ENV === 'production'
          ? ['https://aqs-learning-platform.vercel.app'] // Replace with actual production origin(s)
          : ['http://localhost:3000', 'http://127.0.0.1:3000'],
      credentials: true,
    }),
  );

  // HTTP compression for JSON, text, and API responses (skips already-compressed assets)
  app.use(compression({ threshold: 512 }));

  // Security headers (helmet)
  const isProduction = process.env.NODE_ENV === 'production';
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: [
            "'self'",
            // 'unsafe-inline' is required for Vite HMR (dev) and some React patterns.
            // In production, replace with nonces or hashes for strict CSP.
            "'unsafe-inline'",
            'https://apis.google.com',
          ],
          scriptSrcAttr: ["'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          connectSrc: [
            "'self'",
            ...(isProduction ? [] : ['ws://localhost:24678', 'http://localhost:24678']),
            'https://identitytoolkit.googleapis.com',
            'https://securetoken.googleapis.com',
            'https://www.googleapis.com',
            'https://firestore.googleapis.com',
          ],
          frameSrc: [
            "'self'",
            'https://aqs-learning-local.firebaseapp.com',
            'https://accounts.google.com',
            'https://apis.google.com',
            'https://www.youtube.com',
            'https://www.youtube-nocookie.com',
          ],
          imgSrc: ["'self'", 'data:', 'https:'],
          mediaSrc: ["'self'"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: [],
        },
      },
      crossOriginOpenerPolicy: { policy: 'unsafe-none' },
      crossOriginEmbedderPolicy: false,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );

  // Permissions-Policy — helmet v8 does not include this header
  app.use((_req, res, next) => {
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()',
    );
    next();
  });

  // Serve public/ static files (robots.txt, manifest.json, etc.)
  // Must come before API routes so /robots.txt is served directly,
  // not intercepted by the SPA catch-all route at the bottom.
  app.use(express.static(path.join(process.cwd(), 'public')));

  // One-time startup migration: normalize legacy video_url values to embed format
  (async () => {
    try {
      const allLessons = await db.select().from(schema.lessons);
      let normalized = 0;
      for (const lesson of allLessons) {
        if (!lesson.videoUrl) continue;
        const fixed = toYouTubeEmbed(lesson.videoUrl);
        if (fixed && fixed !== lesson.videoUrl) {
          await db.update(schema.lessons).set({ videoUrl: fixed }).where(eq(schema.lessons.id, lesson.id));
          normalized++;
        }
      }
      if (normalized > 0) console.log(`[migration] Normalized ${normalized} legacy video URL(s) to embed format.`);
    } catch {
      // Non-fatal: table may not exist yet
    }
  })();

  // ==========================================
  // RATE LIMITING
  // ==========================================

  const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: 'Too many authentication attempts, please try again later',
  });
  const registerRateLimit = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: 'Too many registration attempts, please try again later',
  });
  const uploadRateLimit = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 50,
    message: 'Too many uploads, please try again later',
  });
  const syncRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: 'Too many sync requests, please try again later',
  });
  const quizSubmitRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    message: 'Too many quiz submissions, please try again later',
  });
  const enrollmentRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: 'Too many enrollment requests, please try again later',
  });
  const profileRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: 'Too many profile update requests, please try again later',
  });

  // ==========================================
  // API ROUTES
  // ==========================================

  // Health: Database connectivity check (no auth required — must be first)
  app.get('/api/health', getHealth);

  // Auth: Get current user profile and role
  app.get('/api/auth/me', requireAuth, getMe);

  // Auth: Student registration with cohort invite code (public — no auth required)
  app.post('/api/auth/register', registerRateLimit, validateBody(registerSchema), register);

  // Auth: Update user physical profile (avatar url and name)
  app.put('/api/auth/profile', requireAuth, profileRateLimit, validateBody(updateProfileSchema), updateProfile);

  // ==========================================
  // ADMIN USER MANAGEMENT
  // ==========================================

  // Admin: Create instructor account
  app.post(
    '/api/admin/instructors',
    requireAuth,
    requireAdmin,
    authRateLimit,
    validateBody(createInstructorSchema),
    createInstructor,
  );

  // Admin: List all users (paginated, backward-compatible array response)
  app.get('/api/admin/users', requireAuth, requireAdmin, listUsers);

  // Admin: Change a user's role (replaces old PUT /api/auth/role which only worked on self)
  app.put(
    '/api/admin/users/:userId/role',
    requireAuth,
    requireAdmin,
    authRateLimit,
    validateBody(changeRoleSchema),
    changeUserRole,
  );

  // Courses: List all courses for Learner Discovery, including lessons (without full detail) and quizzes
  app.get('/api/courses', requireAuth, listCourses);

  // Courses: Get detailed course info, lessons, and secure questions (NO correct answers sent to client!)
  app.get('/api/courses/:id', requireAuth, getCourseById);

  // Course Completions: Mark a course complete — only succeeds if all lessons done + quiz passed >= 70%
  app.post('/api/courses/:id/complete', requireAuth, completeCourseHandler);

  // Lesson Completions: Mark a lesson complete (online)
  app.post('/api/lessons/:id/complete', requireAuth, completeLesson);

  // Quiz: Submit and score a quiz securely on server
  app.post('/api/quizzes/:id/submit', requireAuth, quizSubmitRateLimit, submitQuiz);

  // Sync: Connects the local offline queue (completions and quiz answers) with the production database
  app.post('/api/sync', requireAuth, syncRateLimit, validateBody(syncSchema), syncHandler);

  // ==========================================
  // ADMIN CMS ROUTES (Validated & Restricted via requireAdmin)
  // ==========================================

  // Course: Create
  app.post('/api/admin/courses', requireAuth, requireInstructorOrAdmin, validateBody(courseSchema), createCourse);

  // Course: Edit
  app.put('/api/admin/courses/:id', requireAuth, requireInstructorOrAdmin, validateBody(courseSchema), updateCourse);

  // Course: Delete
  app.delete('/api/admin/courses/:id', requireAuth, requireInstructorOrAdmin, deleteCourse);

  // Lessons: Create
  app.post(
    '/api/admin/courses/:courseId/lessons',
    requireAuth,
    requireInstructorOrAdmin,
    validateBody(lessonSchema),
    createLesson,
  );

  // Lessons: Edit
  app.put(
    '/api/admin/courses/:courseId/lessons/:id',
    requireAuth,
    requireInstructorOrAdmin,
    validateBody(lessonSchema),
    updateLesson,
  );

  // Lessons: Reorder (Linear builder update)
  app.put(
    '/api/admin/courses/:courseId/lessons/reorder',
    requireAuth,
    requireInstructorOrAdmin,
    validateBody(reorderSchema),
    reorderLessons,
  );

  // Lessons: Delete
  app.delete('/api/admin/courses/:courseId/lessons/:id', requireAuth, requireInstructorOrAdmin, deleteLesson);

  // Quiz: Create or fully replace a Quiz & Questions
  app.post(
    '/api/admin/courses/:courseId/quiz',
    requireAuth,
    requireInstructorOrAdmin,
    validateBody(quizSchema),
    saveQuiz,
  );

  // Quiz: Add a single multiple-choice question to an existing course's quiz
  app.post(
    '/api/admin/courses/:courseId/quiz/questions',
    requireAuth,
    requireInstructorOrAdmin,
    validateBody(quizQuestionSchema),
    addQuizQuestion,
  );

  // CMS Analytics: Get all stats (bulk-query version — eliminates N+1 per-learner per-course loops)
  app.get('/api/admin/analytics', requireAuth, requireAdmin, getAnalytics);

  // Enrollment: Get user's enrolled courses
  app.get('/api/enrollments', requireAuth, listEnrollments);

  // Enrollment: Enroll in a course
  app.post('/api/enrollments', requireAuth, enrollmentRateLimit, validateBody(enrollmentSchema), enrollCourse);

  // ==========================================
  // COHORT MANAGEMENT
  // ==========================================

  // Instructor/Admin: Create a cohort
  app.post(
    '/api/instructor/cohorts',
    requireAuth,
    requireInstructorOrAdmin,
    validateBody(createCohortSchema),
    createCohort,
  );

  // Instructor/Admin: List cohorts (admin sees all, instructor sees own)
  app.get('/api/instructor/cohorts', requireAuth, requireInstructorOrAdmin, listCohorts);

  // Instructor/Admin: Regenerate invite code for a cohort
  app.post('/api/instructor/cohorts/:id/regenerate-code', requireAuth, requireInstructorOrAdmin, regenerateCohortCode);

  // ==========================================
  // DOCUMENT UPLOAD / DOWNLOAD ENDPOINTS
  // ==========================================

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_SIZE_BYTES },
    fileFilter: (_req, file, cb) => {
      if (ALLOWED_SLIDE_MIME_TYPE_SET.has(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error(`Unsupported file type: ${file.mimetype}`));
      }
    },
  });

  // Documents: Upload a file for a lesson
  app.post(
    '/api/admin/documents/upload',
    requireAuth,
    requireInstructorOrAdmin,
    uploadRateLimit,
    upload.single('file'),
    uploadDocument,
  );

  // Documents: Get document metadata
  app.get('/api/documents/:id', requireAuth, getDocumentMetadata);

  // Documents: Download/serve file content (uses ?token= for <a> tag compatibility)
  app.get('/api/documents/:id/file', requireAuthOrQueryToken, downloadDocument);

  // Documents: Delete a document
  app.delete('/api/admin/documents/:id', requireAuth, requireInstructorOrAdmin, deleteDocument);

  // ==========================================
  // VITE SERVICE / STATIC ASSETS PIPELINE
  // ==========================================

  // Vite integration for dev vs prod as specified
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    // Hashed assets (in dist/assets/) — immutable, long-lived cache
    app.use(
      '/assets',
      express.static(path.join(distPath, 'assets'), {
        maxAge: '1y',
        immutable: true,
        index: false,
      }),
    );
    // Non-asset static files (robots.txt, manifest.json, etc.) — moderate cache
    app.use(
      express.static(distPath, {
        maxAge: '1h',
        index: false,
      }),
    );
    // SPA catch-all — no-cache so clients always get the latest version
    app.get('*', (req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  return app;
}
