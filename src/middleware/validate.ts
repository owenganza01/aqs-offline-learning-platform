// src/middleware/validate.ts
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

export const validateBody = (schema: z.ZodType) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: result.error.issues.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
        })),
      });
    }
    req.body = result.data;
    next();
  };
};

// === Validation schemas for new endpoints ===

// Student registration with cohort invite code
export const registerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z
    .string()
    .email('Valid email is required')
    .transform((s) => s.trim().toLowerCase()),
  inviteCode: z.string().min(1, 'Invite code is required'),
});

// Admin creates instructor account
export const createInstructorSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z
    .string()
    .email('Valid email is required')
    .transform((s) => s.trim().toLowerCase()),
});

// Create a cohort
export const createCohortSchema = z.object({
  name: z.string().min(1, 'Cohort name is required').max(100),
});

// Update user profile (name and/or avatar URL)
export const updateProfileSchema = z
  .object({
    name: z.string().min(1, 'Name is required').max(100).optional(),
    avatarUrl: z
      .string()
      .url('Avatar must be a valid URL')
      .max(2048, 'Avatar URL too long')
      .refine((url) => url.startsWith('https://'), {
        message: 'Avatar URL must use HTTPS',
      })
      .optional(),
  })
  .refine((data) => data.name !== undefined || data.avatarUrl !== undefined, {
    message: 'At least one field (name or avatarUrl) must be provided',
  });

// Create or update a course
export const courseSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().min(1, 'Description is required').max(5000),
  thumbnail: z.string().max(500).optional(),
});

// Create or update a lesson
export const lessonSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  content: z.string().min(1, 'Content is required').max(50000),
  videoUrl: z.string().max(500).optional(),
  slidesUrl: z.string().max(500).optional(),
  sortOrder: z
    .union([
      z.number().int().min(0),
      z
        .string()
        .transform((v) => parseInt(v))
        .pipe(z.number().int().min(0)),
    ])
    .optional(),
});

// Reorder lessons
export const reorderSchema = z.object({
  orderedIds: z
    .array(z.union([z.number(), z.string().transform((v) => parseInt(v))]))
    .min(1, 'orderedIds must be a non-empty array'),
});

// Quiz question option
const questionOptionSchema = z.object({
  questionText: z.string().min(1, 'Question text is required').max(1000),
  options: z
    .array(z.string().min(1, 'Option cannot be empty'))
    .min(2, 'At least 2 options required')
    .max(10, 'Maximum 10 options'),
  correctOptionIndex: z.union([z.number().int().min(0), z.string().transform((v) => parseInt(v))]),
});

// Create or replace a quiz
export const quizSchema = z.object({
  title: z.string().min(1, 'Quiz title is required').max(200),
  questions: z.array(questionOptionSchema).min(1, 'At least 1 question required'),
});

// Add a single quiz question
export const quizQuestionSchema = z.object({
  questionText: z.string().min(1, 'Question text is required').max(1000),
  options: z.array(z.string().min(1, 'Option cannot be empty')).min(2).max(10),
  correctOptionIndex: z.union([z.number().int().min(0), z.string().transform((v) => parseInt(v))]),
});

// Enroll in a course
export const enrollmentSchema = z.object({
  courseId: z.number({ message: 'courseId is required and must be a number' }).int().positive(),
});

// Sync payload
export const syncSchema = z.object({
  lessonCompletions: z.array(
    z.object({
      lessonId: z.union([z.number(), z.string()]),
      completedAt: z.string().optional(),
    }),
  ),
  quizSubmissions: z.array(
    z.object({
      quizId: z.union([z.number(), z.string()]),
      answers: z.array(z.number()),
      attemptedAt: z.string().optional(),
    }),
  ),
});

// Change a user's role
export const changeRoleSchema = z.object({
  role: z.enum(['learner', 'instructor', 'admin'], {
    message: 'Role must be learner, instructor, or admin',
  }),
});
