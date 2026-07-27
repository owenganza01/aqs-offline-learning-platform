// src/server/app.ts
import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cors from 'cors';
import path from 'path';
import timeout from 'connect-timeout';
import { createServer as createViteServer } from 'vite';
import { db } from '../db/index.ts';
import * as schema from '../db/schema.ts';
import { eq } from 'drizzle-orm';
import { toYouTubeEmbed } from '../lib/utils.ts';
import { MAX_UPLOAD_SIZE_BYTES } from '../lib/mime-types.ts';
import { rateLimit } from '../middleware/rate-limit.ts';
import {
  registerHealthRoutes,
  registerAuthRoutes,
  registerAdminUserRoutes,
  registerCourseRoutes,
  registerQuizRoutes,
  registerSyncRoutes,
  registerAdminCourseRoutes,
  registerEnrollmentRoutes,
  registerCohortRoutes,
  registerDocumentRoutes,
} from './routes/index.ts';

export async function createApp() {
  const app = express();

  // Middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(timeout('30s'));

  app.use(
    cors({
      origin:
        process.env.NODE_ENV === 'production'
          ? ['https://aqs-learning-platform.vercel.app']
          : ['http://localhost:3000', 'http://127.0.0.1:3000'],
      credentials: true,
    }),
  );

  app.use(compression({ threshold: 512 }));

  const isProduction = process.env.NODE_ENV === 'production';
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", 'https://apis.google.com'],
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

  app.use((_req, res, next) => {
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()',
    );
    next();
  });

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

  // Rate limiters
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

  // Register route modules
  registerHealthRoutes(app);
  registerAuthRoutes(app, { registerRateLimit, profileRateLimit });
  registerAdminUserRoutes(app, { authRateLimit });
  registerCourseRoutes(app);
  registerQuizRoutes(app, { quizSubmitRateLimit });
  registerSyncRoutes(app, { syncRateLimit });
  registerAdminCourseRoutes(app);
  registerEnrollmentRoutes(app, { enrollmentRateLimit });
  registerCohortRoutes(app);
  registerDocumentRoutes(app, { uploadRateLimit });

  // HaltOnTimedout — stop processing timed-out requests
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (req.timedout) return;
    next();
  });

  // Global error handler — ensures all errors return JSON, not HTML
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const error = err as Error & { code?: string; name?: string; status?: number };

    if (req.timedout) {
      res.status(503).json({ error: 'Request timed out' });
      return;
    }

    if (error.code === 'LIMIT_FILE_SIZE') {
      res
        .status(413)
        .json({ error: `File too large. Maximum size is ${Math.round(MAX_UPLOAD_SIZE_BYTES / (1024 * 1024))}MB.` });
      return;
    }

    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      res.status(400).json({ error: 'Unexpected file field. Use field name "file".' });
      return;
    }

    if (typeof error.message === 'string' && error.message.startsWith('Unsupported file type:')) {
      res.status(400).json({ error: error.message });
      return;
    }

    console.error('Unhandled error:', error);
    res.status(error.status ?? 500).json({ error: error.message || 'Internal server error' });
  });

  // Vite integration for dev vs prod
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(
      '/assets',
      express.static(path.join(distPath, 'assets'), {
        maxAge: '1y',
        immutable: true,
        index: false,
      }),
    );
    app.use(
      express.static(distPath, {
        maxAge: '1h',
        index: false,
      }),
    );
    app.get('*', (req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  return app;
}
