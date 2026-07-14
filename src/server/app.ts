// src/server/app.ts
import express, { Response } from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cors from 'cors';
import path from 'path';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { createServer as createViteServer } from 'vite';
import { db } from '../db/index.ts';
import * as schema from '../db/schema.ts';
import {
  requireAuth,
  requireAuthOrQueryToken,
  requireAdmin,
  requireInstructorOrAdmin,
  AuthRequest,
  checkDocumentAccess,
} from '../middleware/auth.ts';
import { canPromoteToRole } from './services/authorization-service.ts';
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
import { scoreQuiz } from '../lib/scoring.ts';
import { toYouTubeEmbed } from '../lib/utils.ts';
import { resolveSyncConflicts } from './services/sync-service.ts';
import { documentStorage } from './providers/document-storage.ts';
import { ALLOWED_SLIDE_MIME_TYPE_SET, MAX_UPLOAD_SIZE_BYTES } from '../lib/mime-types.ts';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { getHealth } from './controllers/health-controller.ts';
import { getMe, register, updateProfile } from './controllers/auth-controller.ts';
import { listCourses, getCourseById, completeCourseHandler, completeLesson } from './controllers/course-controller.ts';
import { submitQuiz } from './controllers/quiz-controller.ts';

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

  // Pagination helper
  const DEFAULT_PAGE_SIZE = 50;
  const MAX_PAGE_SIZE = 100;
  function parsePagination(req: express.Request): { limit: number; offset: number } {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
    return { limit, offset };
  }

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
    async (req: AuthRequest, res: Response) => {
      try {
        const { name, email } = req.body;

        // Check if email already exists
        const existingUser = await db.select().from(schema.users).where(eq(schema.users.email, email));
        if (existingUser.length > 0) {
          if (existingUser[0].uid.startsWith('pending-')) {
            return res.status(400).json({ error: 'An invitation is already pending for this email.' });
          }
          return res.status(400).json({ error: 'Email already registered.' });
        }

        // Create the instructor account with placeholder UID (linked on first Google login)
        const result = await db
          .insert(schema.users)
          .values({
            uid: `pending-${randomUUID()}`,
            email,
            name,
            role: 'instructor',
          })
          .returning();

        res.status(201).json({ success: true, user: result[0] });
      } catch (error: any) {
        console.error('Create instructor error:', error);
        res.status(500).json({ error: 'Failed to create instructor account.' });
      }
    },
  );

  // Admin: List all users (paginated, backward-compatible array response)
  app.get('/api/admin/users', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { limit, offset } = parsePagination(req);
      const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(schema.users);
      const allUsers = await db.select().from(schema.users).limit(limit).offset(offset);
      res.setHeader('X-Total-Count', Number(count));
      res.json(allUsers);
    } catch (error: any) {
      console.error('List users error:', error);
      res.status(500).json({ error: 'Failed to fetch users.' });
    }
  });

  // Admin: Change a user's role (replaces old PUT /api/auth/role which only worked on self)
  app.put(
    '/api/admin/users/:userId/role',
    requireAuth,
    requireAdmin,
    authRateLimit,
    validateBody(changeRoleSchema),
    async (req: AuthRequest, res: Response) => {
      try {
        const targetUserId = parseInt(req.params.userId);
        const { role } = req.body;

        if (isNaN(targetUserId)) {
          return res.status(400).json({ error: 'Invalid user ID.' });
        }

        // Use canPromoteToRole to prevent self-demotion and validate permissions
        const promotionCheck = await canPromoteToRole(req.dbUser!.id, targetUserId, role);
        if (!promotionCheck.allowed) {
          return res.status(403).json({ error: promotionCheck.error });
        }

        const updated = await db
          .update(schema.users)
          .set({ role })
          .where(eq(schema.users.id, targetUserId))
          .returning();

        if (updated.length === 0) {
          return res.status(404).json({ error: 'User not found.' });
        }

        res.json({ success: true, dbUser: updated[0] });
      } catch (error: any) {
        console.error('Error updating user role:', error);
        res.status(500).json({ error: error.message });
      }
    },
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

  const MAX_SYNC_COMPLETIONS = 500;
  const MAX_SYNC_QUIZZES = 100;

  // Sync: Connects the local offline queue (completions and quiz answers) with the production database
  app.post(
    '/api/sync',
    requireAuth,
    syncRateLimit,
    validateBody(syncSchema),
    async (req: AuthRequest, res: Response) => {
      try {
        const { lessonCompletions: localCompletions, quizSubmissions: localQuizzes } = req.body;

        if (localCompletions.length > MAX_SYNC_COMPLETIONS) {
          return res.status(400).json({ error: `Too many lesson completions. Maximum is ${MAX_SYNC_COMPLETIONS}.` });
        }
        if (localQuizzes.length > MAX_SYNC_QUIZZES) {
          return res.status(400).json({ error: `Too many quiz submissions. Maximum is ${MAX_SYNC_QUIZZES}.` });
        }

        const userId = req.dbUser!.id;

        // 1. Process Lesson Completions
        for (const comp of localCompletions) {
          const lessonId = parseInt(comp.lessonId);
          if (isNaN(lessonId)) continue;

          // Check if DB already has it (minimal projection)
          const existsList = await db
            .select({ id: schema.lessonCompletions.id })
            .from(schema.lessonCompletions)
            .where(and(eq(schema.lessonCompletions.userId, userId), eq(schema.lessonCompletions.lessonId, lessonId)));

          if (existsList.length === 0) {
            await db.insert(schema.lessonCompletions).values({
              userId,
              lessonId,
              completedAt: comp.completedAt ? new Date(comp.completedAt) : new Date(),
            });
          }
        }

        // 2. Process Quiz Submissions offline scoring
        // Deduplicate by idempotency key (userId:quizId) — later timestamp wins
        const quizSyncItems = localQuizzes.map((sub) => ({
          idempotencyKey: `${userId}:quiz:${sub.quizId}`,
          type: 'quiz_submission' as const,
          timestamp: sub.attemptedAt || new Date().toISOString(),
          payload: sub,
        }));
        const deduplicatedQuizzes = resolveSyncConflicts(quizSyncItems);

        const processedQuizzes = [];
        for (const item of deduplicatedQuizzes) {
          const sub = item.payload as { quizId: string; answers: number[]; attemptedAt?: string };
          const quizId = parseInt(sub.quizId);
          const answers = sub.answers;
          if (isNaN(quizId) || !Array.isArray(answers)) continue;

          // Score this quiz securely on server (only needed column)
          const questionsList = await db
            .select({ correctOptionIndex: schema.questions.correctOptionIndex })
            .from(schema.questions)
            .where(eq(schema.questions.quizId, quizId));

          if (questionsList.length > 0) {
            const { correctCount, totalQuestions, score, passed } = scoreQuiz(questionsList, answers);

            // Insert quiz attempt
            const attempt = await db
              .insert(schema.quizAttempts)
              .values({
                userId,
                quizId,
                score,
                passed,
                attemptedAt: sub.attemptedAt ? new Date(sub.attemptedAt) : new Date(),
              })
              .returning();

            processedQuizzes.push({
              quizId,
              score,
              passed,
              attempt: attempt[0],
            });
          }
        }

        // 3. Fetch all current states for this user to return as truth
        const allCompletions = await db
          .select()
          .from(schema.lessonCompletions)
          .where(eq(schema.lessonCompletions.userId, userId));
        const allAttempts = await db.select().from(schema.quizAttempts).where(eq(schema.quizAttempts.userId, userId));

        res.json({
          success: true,
          syncedCompletions: allCompletions.map((c) => c.lessonId),
          syncedAttempts: allAttempts,
          processedQuizzes,
        });
      } catch (error: any) {
        console.error('Error in reconnect-sync engine:', error);
        res.status(500).json({ error: 'Failed to synchronize progress data.' });
      }
    },
  );

  // ==========================================
  // ADMIN CMS ROUTES (Validated & Restricted via requireAdmin)
  // ==========================================

  // Course: Create
  app.post(
    '/api/admin/courses',
    requireAuth,
    requireInstructorOrAdmin,
    validateBody(courseSchema),
    async (req: AuthRequest, res: Response) => {
      try {
        const { title, description, thumbnail } = req.body;
        if (!title || !description) {
          return res.status(400).json({ error: 'Title and description are required.' });
        }

        const result = await db
          .insert(schema.courses)
          .values({
            title,
            description,
            thumbnail: thumbnail || 'teal',
            createdBy: req.dbUser!.id,
          })
          .returning();

        res.status(201).json(result[0]);
      } catch (error: any) {
        console.error('CMS Course creation error:', error);
        res.status(500).json({ error: 'Failed to create course.' });
      }
    },
  );

  // Course: Edit
  app.put(
    '/api/admin/courses/:id',
    requireAuth,
    requireInstructorOrAdmin,
    validateBody(courseSchema),
    async (req: AuthRequest, res: Response) => {
      try {
        const courseId = parseInt(req.params.id);
        const { title, description, thumbnail } = req.body;

        if (isNaN(courseId)) {
          return res.status(400).json({ error: 'Invalid course ID' });
        }

        // Ownership check: instructors can only edit their own courses
        const courseRows = await db.select().from(schema.courses).where(eq(schema.courses.id, courseId));
        if (courseRows.length === 0) {
          return res.status(404).json({ error: 'Course not found' });
        }
        const course = courseRows[0];
        if (req.dbUser!.role !== 'admin' && course.createdBy !== req.dbUser!.id) {
          return res.status(403).json({ error: 'Forbidden: You can only edit your own courses' });
        }

        const updated = await db
          .update(schema.courses)
          .set({ title, description, thumbnail })
          .where(eq(schema.courses.id, courseId))
          .returning();

        res.json(updated[0]);
      } catch (error: any) {
        console.error('CMS Course edit error:', error);
        res.status(500).json({ error: 'Failed to update course.' });
      }
    },
  );

  // Course: Delete
  app.delete(
    '/api/admin/courses/:id',
    requireAuth,
    requireInstructorOrAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const courseId = parseInt(req.params.id);
        if (isNaN(courseId)) {
          return res.status(400).json({ error: 'Invalid course ID' });
        }

        // Ownership check: instructors can only delete their own courses
        const courseRows = await db.select().from(schema.courses).where(eq(schema.courses.id, courseId));
        if (courseRows.length === 0) {
          return res.status(404).json({ error: 'Course not found' });
        }
        const course = courseRows[0];
        if (req.dbUser!.role !== 'admin' && course.createdBy !== req.dbUser!.id) {
          return res.status(403).json({ error: 'Forbidden: You can only delete your own courses' });
        }

        const deleted = await db.delete(schema.courses).where(eq(schema.courses.id, courseId)).returning();

        res.json({ success: true, message: 'Course deleted successfully', courseId });
      } catch (error: any) {
        console.error('CMS Course deletion error:', error);
        res.status(500).json({ error: 'Failed to delete course.' });
      }
    },
  );

  // Lessons: Create
  app.post(
    '/api/admin/courses/:courseId/lessons',
    requireAuth,
    requireInstructorOrAdmin,
    validateBody(lessonSchema),
    async (req: AuthRequest, res: Response) => {
      try {
        const courseId = parseInt(req.params.courseId);
        const { title, content, videoUrl, slidesUrl, sortOrder } = req.body;

        if (isNaN(courseId) || !title || !content) {
          return res.status(400).json({ error: 'Course ID, title and content are required.' });
        }

        const result = await db
          .insert(schema.lessons)
          .values({
            courseId,
            title,
            content,
            videoUrl: toYouTubeEmbed(videoUrl),
            slidesUrl,
            sortOrder: sortOrder !== undefined ? parseInt(sortOrder) : 0,
          })
          .returning();

        const savedLesson = result[0];

        // Backfill document lessonId if slidesUrl references an uploaded document
        if (slidesUrl && slidesUrl.startsWith('doc:')) {
          const docId = slidesUrl.slice(4);
          await documentStorage.backfillLessonId(docId, savedLesson.id);
        }

        res.status(201).json(savedLesson);
      } catch (error: any) {
        console.error('CMS Lesson creation error:', error);
        res.status(500).json({ error: 'Failed to create lesson.' });
      }
    },
  );

  // Lessons: Edit
  app.put(
    '/api/admin/courses/:courseId/lessons/:id',
    requireAuth,
    requireInstructorOrAdmin,
    validateBody(lessonSchema),
    async (req: AuthRequest, res: Response) => {
      try {
        const lessonId = parseInt(req.params.id);
        const courseId = parseInt(req.params.courseId);
        const { title, content, videoUrl, slidesUrl, sortOrder } = req.body;

        if (isNaN(lessonId)) {
          return res.status(400).json({ error: 'Invalid lesson ID' });
        }

        // Ownership check: instructors can only edit lessons in their own courses
        if (req.dbUser!.role !== 'admin') {
          const courseRows = await db.select().from(schema.courses).where(eq(schema.courses.id, courseId));
          if (courseRows.length === 0 || courseRows[0].createdBy !== req.dbUser!.id) {
            return res.status(403).json({ error: 'Forbidden: You can only edit lessons in your own courses' });
          }
        }

        const updated = await db
          .update(schema.lessons)
          .set({
            title,
            content,
            videoUrl: toYouTubeEmbed(videoUrl),
            slidesUrl,
            sortOrder: sortOrder !== undefined ? parseInt(sortOrder) : undefined,
          })
          .where(and(eq(schema.lessons.id, lessonId), eq(schema.lessons.courseId, courseId)))
          .returning();

        if (updated.length === 0) {
          return res.status(404).json({ error: 'Lesson not found' });
        }

        // Backfill document lessonId if slidesUrl references an uploaded document
        if (slidesUrl && slidesUrl.startsWith('doc:')) {
          const docId = slidesUrl.slice(4);
          await documentStorage.backfillLessonId(docId, lessonId);
        }

        res.json(updated[0]);
      } catch (error: any) {
        console.error('CMS Lesson edit error:', error);
        res.status(500).json({ error: 'Failed to update lesson.' });
      }
    },
  );

  // Lessons: Reorder (Linear builder update)
  app.put(
    '/api/admin/courses/:courseId/lessons/reorder',
    requireAuth,
    requireInstructorOrAdmin,
    validateBody(reorderSchema),
    async (req: AuthRequest, res: Response) => {
      try {
        const courseId = parseInt(req.params.courseId);
        const { orderedIds } = req.body;

        if (isNaN(courseId)) {
          return res.status(400).json({ error: 'Invalid course ID' });
        }

        // Verify all lessons belong to the specified course
        const courseLessons = await db
          .select({ id: schema.lessons.id })
          .from(schema.lessons)
          .where(eq(schema.lessons.courseId, courseId));
        const validIds = new Set(courseLessons.map((l) => l.id));
        const parsedIds = orderedIds.map((id: any) => parseInt(id)).filter((id: number) => !isNaN(id));
        const invalidIds = parsedIds.filter((id: number) => !validIds.has(id));
        if (invalidIds.length > 0) {
          return res.status(400).json({ error: `Lessons ${invalidIds.join(', ')} do not belong to this course` });
        }

        // Single UPDATE with CASE WHEN instead of N individual UPDATEs
        await db
          .update(schema.lessons)
          .set({
            sortOrder: sql`CASE ${schema.lessons.id} ${sql.join(
              parsedIds.map((_id: number, i: number) => sql`WHEN ${parsedIds[i]} THEN ${i}`),
              sql.raw(' '),
            )} END`,
          })
          .where(inArray(schema.lessons.id, parsedIds));

        res.json({ success: true, message: 'Curriculum reordered successfully' });
      } catch (error: any) {
        console.error('CMS Reorder curriculum error:', error);
        res.status(500).json({ error: 'Failed to reorder lessons.' });
      }
    },
  );

  // Lessons: Delete
  app.delete(
    '/api/admin/courses/:courseId/lessons/:id',
    requireAuth,
    requireInstructorOrAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const lessonId = parseInt(req.params.id);
        const courseId = parseInt(req.params.courseId);
        if (isNaN(lessonId)) {
          return res.status(400).json({ error: 'Invalid lesson ID' });
        }

        // Ownership check: instructors can only delete lessons in their own courses
        if (req.dbUser!.role !== 'admin') {
          const courseRows = await db.select().from(schema.courses).where(eq(schema.courses.id, courseId));
          if (courseRows.length === 0 || courseRows[0].createdBy !== req.dbUser!.id) {
            return res.status(403).json({ error: 'Forbidden: You can only delete lessons in your own courses' });
          }
        }

        // Fetch lesson before deletion to check for uploaded documents
        const lessonRows = await db
          .select({ slidesUrl: schema.lessons.slidesUrl })
          .from(schema.lessons)
          .where(and(eq(schema.lessons.id, lessonId), eq(schema.lessons.courseId, courseId)));

        const deleted = await db
          .delete(schema.lessons)
          .where(and(eq(schema.lessons.id, lessonId), eq(schema.lessons.courseId, courseId)))
          .returning();

        if (deleted.length === 0) {
          return res.status(404).json({ error: 'Lesson not found' });
        }

        // Clean up uploaded document if slidesUrl references one (null lessonId won't cascade)
        if (lessonRows.length > 0 && lessonRows[0].slidesUrl?.startsWith('doc:')) {
          const docId = lessonRows[0].slidesUrl.slice(4);
          await documentStorage.delete(docId).catch(() => {});
        }

        res.json({ success: true, message: 'Lesson deleted successfully' });
      } catch (error: any) {
        console.error('CMS Lesson deletion error:', error);
        res.status(500).json({ error: 'Failed to delete lesson.' });
      }
    },
  );

  // Quiz: Create or fully replace a Quiz & Questions
  app.post(
    '/api/admin/courses/:courseId/quiz',
    requireAuth,
    requireInstructorOrAdmin,
    validateBody(quizSchema),
    async (req: AuthRequest, res: Response) => {
      try {
        const courseId = parseInt(req.params.courseId);
        const { title, questions } = req.body;

        if (isNaN(courseId) || !title || !Array.isArray(questions)) {
          return res.status(400).json({ error: 'Course ID, quiz title, and questions array are required.' });
        }

        // 1. Get or Create Quiz for this Course
        let quizId: number;
        const existingQuizzes = await db.select().from(schema.quizzes).where(eq(schema.quizzes.courseId, courseId));

        if (existingQuizzes.length > 0) {
          quizId = existingQuizzes[0].id;
          await db.update(schema.quizzes).set({ title }).where(eq(schema.quizzes.id, quizId));
          // Delete all old questions to refresh them
          await db.delete(schema.questions).where(eq(schema.questions.quizId, quizId));
        } else {
          const newQuiz = await db.insert(schema.quizzes).values({ courseId, title }).returning();
          quizId = newQuiz[0].id;
        }

        // 2. Batch insert all questions (single round-trip instead of N)
        const questionValues = questions
          .filter((q: any) => q.questionText && Array.isArray(q.options) && q.correctOptionIndex !== undefined)
          .map((q: any) => ({
            quizId,
            questionText: q.questionText,
            options: q.options,
            correctOptionIndex: parseInt(q.correctOptionIndex),
          }));

        const insertedQuestions =
          questionValues.length > 0 ? await db.insert(schema.questions).values(questionValues).returning() : [];

        res.json({
          success: true,
          quizId,
          uploadedQuestionsCount: insertedQuestions.length,
        });
      } catch (error: any) {
        console.error('CMS Quiz synchronizing error:', error);
        res.status(500).json({ error: 'Failed to save curriculum quiz.' });
      }
    },
  );

  // Quiz: Add a single multiple-choice question to an existing course's quiz
  app.post(
    '/api/admin/courses/:courseId/quiz/questions',
    requireAuth,
    requireInstructorOrAdmin,
    validateBody(quizQuestionSchema),
    async (req: AuthRequest, res: Response) => {
      try {
        const courseId = parseInt(req.params.courseId);
        const { questionText, options, correctOptionIndex } = req.body;

        if (isNaN(courseId) || !questionText || !Array.isArray(options) || correctOptionIndex === undefined) {
          return res
            .status(400)
            .json({ error: 'Course ID, question text, options array, and correctOptionIndex are required.' });
        }

        const trimmedOptions = options.map((opt: any) => (typeof opt === 'string' ? opt.trim() : ''));
        if (trimmedOptions.some((opt: string) => !opt)) {
          return res.status(400).json({ error: 'All of the 4 options must be non-empty strings.' });
        }

        const parsedCorrectOptionIndex = parseInt(correctOptionIndex as any);
        if (
          isNaN(parsedCorrectOptionIndex) ||
          parsedCorrectOptionIndex < 0 ||
          parsedCorrectOptionIndex >= trimmedOptions.length
        ) {
          return res.status(400).json({ error: 'Invalid correct option index.' });
        }

        // Check if course exists
        const courseExists = await db.select().from(schema.courses).where(eq(schema.courses.id, courseId));
        if (courseExists.length === 0) {
          return res.status(404).json({ error: 'Course not found.' });
        }

        // 1. Get or Create Quiz for this Course
        let quizId: number;
        const existingQuizzes = await db.select().from(schema.quizzes).where(eq(schema.quizzes.courseId, courseId));

        if (existingQuizzes.length > 0) {
          quizId = existingQuizzes[0].id;
        } else {
          const newQuiz = await db
            .insert(schema.quizzes)
            .values({
              courseId,
              title: `${courseExists[0].title} Exam`,
            })
            .returning();
          quizId = newQuiz[0].id;
        }

        // 2. Insert the single new question
        const question = await db
          .insert(schema.questions)
          .values({
            quizId,
            questionText: questionText.trim(),
            options: trimmedOptions,
            correctOptionIndex: parsedCorrectOptionIndex,
          })
          .returning();

        res.json({
          success: true,
          quizId,
          question: question[0],
        });
      } catch (error: any) {
        console.error('Error creating single quiz question:', error);
        res.status(500).json({ error: 'Failed to create quiz question.' });
      }
    },
  );

  // CMS Analytics: Get all stats (bulk-query version — eliminates N+1 per-learner per-course loops)
  app.get('/api/admin/analytics', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      // Bulk fetch 1: users
      const allUsers = await db.select().from(schema.users);
      const learners = allUsers.filter((u) => u.role === 'learner');
      const learnerIds = new Set(learners.map((l) => l.id));
      const totalLearnersCount = learners.length;

      // Bulk fetch 2: courses
      const courses = await db.select().from(schema.courses);

      // Bulk fetch 3: lessons
      const allLessons = await db.select().from(schema.lessons);

      // Bulk fetch 4: quizzes
      const allQuizzes = await db.select().from(schema.quizzes);

      // Bulk fetch 5: lesson completions
      const allCompletions = await db.select().from(schema.lessonCompletions);

      // Bulk fetch 6: quiz attempts
      const allAttempts = await db.select().from(schema.quizAttempts);

      // Build in-memory lookup maps
      const lessonsByCourse: Record<number, typeof allLessons> = {};
      for (const lesson of allLessons) {
        if (!lessonsByCourse[lesson.courseId]) lessonsByCourse[lesson.courseId] = [];
        lessonsByCourse[lesson.courseId].push(lesson);
      }

      const quizByCourse: Record<number, (typeof allQuizzes)[0]> = {};
      for (const q of allQuizzes) {
        quizByCourse[q.courseId] = q;
      }

      const completionsByUser: Record<number, Set<number>> = {};
      for (const c of allCompletions) {
        if (!completionsByUser[c.userId]) completionsByUser[c.userId] = new Set();
        completionsByUser[c.userId].add(c.lessonId);
      }

      const attemptsByKey: Record<string, typeof allAttempts> = {};
      for (const a of allAttempts) {
        const key = `${a.userId}:${a.quizId}`;
        if (!attemptsByKey[key]) attemptsByKey[key] = [];
        attemptsByKey[key].push(a);
      }

      // Compute per-course stats in memory
      const courseStats = [];
      for (const course of courses) {
        const courseLessons = lessonsByCourse[course.id] || [];
        const courseLessonIds = new Set(courseLessons.map((l) => l.id));
        const quiz = quizByCourse[course.id] || null;

        let activeStudentsCount = 0;
        let completedCourseStudentsCount = 0;
        let passedQuizStudentsCount = 0;
        let sumScore = 0;
        let scoreAttemptsCount = 0;

        for (const learner of learners) {
          const userCompletions = completionsByUser[learner.id];
          if (userCompletions) {
            const courseCompletionsCount = [...userCompletions].filter((id) => courseLessonIds.has(id)).length;
            if (courseCompletionsCount > 0) {
              activeStudentsCount++;
              if (courseLessons.length > 0 && courseCompletionsCount >= courseLessons.length) {
                completedCourseStudentsCount++;
              }
            }
          }

          if (quiz) {
            const key = `${learner.id}:${quiz.id}`;
            const attempts = attemptsByKey[key] || [];
            if (attempts.length > 0) {
              const bestAttempt = [...attempts].sort((a, b) => b.score - a.score)[0];
              if (attempts.some((a) => a.passed)) {
                passedQuizStudentsCount++;
              }
              sumScore += bestAttempt.score;
              scoreAttemptsCount++;
            }
          }
        }

        const avgScore = scoreAttemptsCount > 0 ? Math.round(sumScore / scoreAttemptsCount) : null;
        const completionRate =
          totalLearnersCount > 0 ? Math.round((passedQuizStudentsCount / totalLearnersCount) * 100) : 0;

        courseStats.push({
          id: course.id,
          title: course.title,
          lessonsCount: courseLessons.length,
          activeStudents: activeStudentsCount,
          completions: completedCourseStudentsCount,
          passedQuizzes: passedQuizStudentsCount,
          averageScore: avgScore,
          completionRate,
        });
      }

      // Recent activity (computed from already-fetched bulk data, no extra queries)
      const userMap = new Map(allUsers.map((u) => [u.id, u]));
      const lessonMap = new Map(allLessons.map((l) => [l.id, l]));
      const quizMap = new Map(allQuizzes.map((q) => [q.id, q]));

      const recentCompletions = allCompletions
        .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
        .slice(0, 8)
        .map((comp) => {
          const learner = userMap.get(comp.userId);
          const lesson = lessonMap.get(comp.lessonId);
          if (!learner || !lesson) return null;
          return {
            studentName: learner.name || learner.email,
            lessonTitle: lesson.title,
            completedAt: comp.completedAt,
            type: 'lesson' as const,
          };
        })
        .filter(Boolean);

      const recentAttempts = allAttempts
        .sort((a, b) => new Date(b.attemptedAt).getTime() - new Date(a.attemptedAt).getTime())
        .slice(0, 8)
        .map((att) => {
          const learner = userMap.get(att.userId);
          const q = quizMap.get(att.quizId);
          if (!learner || !q) return null;
          return {
            studentName: learner.name || learner.email,
            quizTitle: q.title,
            score: att.score,
            passed: att.passed,
            attemptedAt: att.attemptedAt,
            type: 'quiz' as const,
          };
        })
        .filter(Boolean);

      const recentActivity = [...recentCompletions, ...recentAttempts]
        .sort(
          (a: any, b: any) =>
            new Date(b.completedAt || b.attemptedAt).getTime() - new Date(a.completedAt || a.attemptedAt).getTime(),
        )
        .slice(0, 10);

      res.json({
        totalLearnersCount,
        courseStats,
        recentActivity,
      });
    } catch (error: any) {
      console.error('CMS Analytics fetch error:', error);
      res.status(500).json({ error: 'Failed to compile enrollment analytics.' });
    }
  });

  // Enrollment: Get user's enrolled courses
  app.get('/api/enrollments', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const rows = await db
        .select({ courseId: schema.enrollments.courseId })
        .from(schema.enrollments)
        .where(eq(schema.enrollments.userId, req.dbUser!.id));
      const courseIds = rows.map((r) => r.courseId);
      res.json({ courseIds });
    } catch (error: any) {
      // If the enrollments table doesn't exist yet, return empty instead of 500
      if (error?.code === '42P01' || error?.message?.includes('does not exist')) {
        console.warn('Enrollments table not found — returning empty list. Run migrations to create it.');
        return res.json({ courseIds: [] });
      }
      console.error('Error fetching enrollments:', error);
      res.status(500).json({ error: 'Failed to fetch enrollments.' });
    }
  });

  // Enrollment: Enroll in a course
  app.post(
    '/api/enrollments',
    requireAuth,
    enrollmentRateLimit,
    validateBody(enrollmentSchema),
    async (req: AuthRequest, res: Response) => {
      try {
        const { courseId } = req.body;

        await db
          .insert(schema.enrollments)
          .values({ userId: req.dbUser!.id, courseId })
          .onConflictDoNothing({ target: [schema.enrollments.userId, schema.enrollments.courseId] });

        res.json({ success: true, courseId });
      } catch (error: any) {
        if (error?.code === '42P01' || error?.message?.includes('does not exist')) {
          console.warn('Enrollments table not found — enrollment not persisted. Run migrations to create it.');
          return res.json({ success: true, courseId: req.body.courseId });
        }
        console.error('Error creating enrollment:', error);
        res.status(500).json({ error: 'Failed to create enrollment.' });
      }
    },
  );

  // ==========================================
  // COHORT MANAGEMENT
  // ==========================================

  // Instructor/Admin: Create a cohort
  app.post(
    '/api/instructor/cohorts',
    requireAuth,
    requireInstructorOrAdmin,
    validateBody(createCohortSchema),
    async (req: AuthRequest, res: Response) => {
      try {
        const { name } = req.body;

        // Generate a random 8-character invite code (uppercase alphanumeric)
        const inviteCode = randomUUID().replace(/-/g, '').substring(0, 8).toUpperCase();

        const result = await db
          .insert(schema.cohorts)
          .values({
            instructorId: req.dbUser!.id,
            name,
            inviteCode,
          })
          .returning();

        res.status(201).json(result[0]);
      } catch (error: any) {
        console.error('Create cohort error:', error);
        res.status(500).json({ error: 'Failed to create cohort.' });
      }
    },
  );

  // Instructor/Admin: List cohorts (admin sees all, instructor sees own)
  app.get('/api/instructor/cohorts', requireAuth, requireInstructorOrAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const cohortsList = await db
        .select({
          id: schema.cohorts.id,
          instructorId: schema.cohorts.instructorId,
          name: schema.cohorts.name,
          inviteCode: schema.cohorts.inviteCode,
          createdAt: schema.cohorts.createdAt,
          memberCount: sql<number>`count(${schema.users.id})::int`,
        })
        .from(schema.cohorts)
        .leftJoin(schema.users, eq(schema.cohorts.id, schema.users.cohortId))
        .where(req.dbUser!.role === 'admin' ? undefined : eq(schema.cohorts.instructorId, req.dbUser!.id))
        .groupBy(
          schema.cohorts.id,
          schema.cohorts.instructorId,
          schema.cohorts.name,
          schema.cohorts.inviteCode,
          schema.cohorts.createdAt,
        );

      res.json(cohortsList);
    } catch (error: any) {
      console.error('List cohorts error:', error);
      res.status(500).json({ error: 'Failed to fetch cohorts.' });
    }
  });

  // Instructor/Admin: Regenerate invite code for a cohort
  app.post(
    '/api/instructor/cohorts/:id/regenerate-code',
    requireAuth,
    requireInstructorOrAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const cohortId = parseInt(req.params.id);
        if (isNaN(cohortId)) {
          return res.status(400).json({ error: 'Invalid cohort ID' });
        }

        // Look up the cohort
        const cohortRows = await db.select().from(schema.cohorts).where(eq(schema.cohorts.id, cohortId));
        if (cohortRows.length === 0) {
          return res.status(404).json({ error: 'Cohort not found' });
        }

        const cohort = cohortRows[0];

        // Ownership check: instructors can only manage their own cohorts
        if (req.dbUser!.role !== 'admin' && cohort.instructorId !== req.dbUser!.id) {
          return res.status(403).json({ error: 'Forbidden: You can only manage your own cohorts' });
        }

        // Generate new invite code
        const newInviteCode = randomUUID().replace(/-/g, '').substring(0, 8).toUpperCase();

        const updated = await db
          .update(schema.cohorts)
          .set({ inviteCode: newInviteCode })
          .where(eq(schema.cohorts.id, cohortId))
          .returning();

        res.json(updated[0]);
      } catch (error: any) {
        console.error('Regenerate cohort code error:', error);
        res.status(500).json({ error: 'Failed to regenerate invite code.' });
      }
    },
  );

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
    async (req: AuthRequest, res: Response) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: 'No file provided.' });
        }

        const { lessonId } = req.body;
        const parsedLessonId = lessonId ? parseInt(lessonId) : null;
        if (lessonId && isNaN(parsedLessonId!)) {
          return res.status(400).json({ error: 'Invalid lessonId.' });
        }

        const doc = await documentStorage.upload(req.file.buffer, {
          lessonId: parsedLessonId && parsedLessonId > 0 ? parsedLessonId : null,
          originalFileName: req.file.originalname,
          storedFileName: `${randomUUID()}_${req.file.originalname}`,
          mimeType: req.file.mimetype,
          fileSize: req.file.size,
          uploadedBy: req.dbUser!.id,
        });

        res.status(201).json({
          id: doc.id,
          originalFileName: doc.originalFileName,
          mimeType: doc.mimeType,
          fileSize: doc.fileSize,
          url: `/api/documents/${doc.id}/file`,
        });
      } catch (err: any) {
        console.error('Document upload error:', err);
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ error: 'File too large. Maximum size is 10MB.' });
        }
        console.error('Document upload error:', err);
        res.status(500).json({ error: 'Upload failed.' });
      }
    },
  );

  // Documents: Get document metadata
  app.get('/api/documents/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const meta = await documentStorage.getMetadata(req.params.id);
      if (!meta) {
        return res.status(404).json({ error: 'Document not found.' });
      }
      if (!(await checkDocumentAccess(meta.lessonId, req.dbUser!))) {
        return res.status(403).json({ error: 'Forbidden: You do not have access to this document.' });
      }
      res.json(meta);
    } catch (err: any) {
      console.error('Document metadata error:', err);
      res.status(500).json({ error: 'Failed to retrieve document.' });
    }
  });

  // Documents: Download/serve file content (uses ?token= for <a> tag compatibility)
  app.get('/api/documents/:id/file', requireAuthOrQueryToken, async (req: AuthRequest, res: Response) => {
    try {
      const result = await documentStorage.download(req.params.id);
      if (!result) {
        return res.status(404).json({ error: 'Document not found.' });
      }
      if (!(await checkDocumentAccess(result.metadata.lessonId, req.dbUser!))) {
        return res.status(403).json({ error: 'Forbidden: You do not have access to this document.' });
      }

      res.setHeader('Content-Type', result.metadata.mimeType);
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${encodeURIComponent(result.metadata.originalFileName)}"`,
      );
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.send(result.data);
    } catch (err: any) {
      console.error('Document download error:', err);
      res.status(500).json({ error: 'Failed to retrieve document.' });
    }
  });

  // Documents: Delete a document
  app.delete(
    '/api/admin/documents/:id',
    requireAuth,
    requireInstructorOrAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const deleted = await documentStorage.delete(req.params.id);
        if (!deleted) {
          return res.status(404).json({ error: 'Document not found.' });
        }
        res.json({ success: true });
      } catch (err: any) {
        console.error('Document delete error:', err);
        res.status(500).json({ error: 'Failed to delete document.' });
      }
    },
  );

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
