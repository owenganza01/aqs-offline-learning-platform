import { relations } from 'drizzle-orm';
import { integer, pgTable, serial, text, timestamp, boolean, jsonb } from 'drizzle-orm/pg-core';

// 1. Users table (synced from Firebase UID)
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID
  email: text('email').notNull(),
  name: text('name'),
  role: text('role').default('learner').notNull(), // 'learner' | 'instructor' | 'admin'
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 2. Courses table
export const courses = pgTable('courses', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  thumbnail: text('thumbnail'), // Data URL, image URL, or gradient code
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 3. Lessons table
export const lessons = pgTable('lessons', {
  id: serial('id').primaryKey(),
  courseId: integer('course_id')
    .references(() => courses.id, { onDelete: 'cascade' })
    .notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  videoUrl: text('video_url'), // unlisted YouTube video URL or ID
  slidesUrl: text('slides_url'), // PowerPoint, PDF, or slides link
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 4. Quizzes table (One quiz per course containing multiple questions)
export const quizzes = pgTable('quizzes', {
  id: serial('id').primaryKey(),
  courseId: integer('course_id')
    .references(() => courses.id, { onDelete: 'cascade' })
    .notNull()
    .unique(), // Enforce 1 quiz per course as per SRS
  title: text('title').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 5. Questions table
export const questions = pgTable('questions', {
  id: serial('id').primaryKey(),
  quizId: integer('quiz_id')
    .references(() => quizzes.id, { onDelete: 'cascade' })
    .notNull(),
  questionText: text('question_text').notNull(),
  options: jsonb('options').notNull(), // Array of strings: string[]
  correctOptionIndex: integer('correct_option_index').notNull(), // Checked server-side ONLY!
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 6. Lesson completions (Progress tracker)
export const lessonCompletions = pgTable('lesson_completions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  lessonId: integer('lesson_id')
    .references(() => lessons.id, { onDelete: 'cascade' })
    .notNull(),
  completedAt: timestamp('completed_at').defaultNow().notNull(),
});

// 7. Quiz attempts (Passed score >= 70%)
export const quizAttempts = pgTable('quiz_attempts', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  quizId: integer('quiz_id')
    .references(() => quizzes.id, { onDelete: 'cascade' })
    .notNull(),
  score: integer('score').notNull(), // percentage scored (0 to 100)
  passed: boolean('passed').notNull(), // true if score >= 70
  attemptedAt: timestamp('attempted_at').defaultNow().notNull(),
});

// Define Relationships

export const usersRelations = relations(users, ({ many }) => ({
  lessonCompletions: many(lessonCompletions),
  quizAttempts: many(quizAttempts),
}));

export const coursesRelations = relations(courses, ({ many, one }) => ({
  lessons: many(lessons),
  quiz: one(quizzes, {
    fields: [courses.id],
    references: [quizzes.courseId],
  }),
}));

export const lessonsRelations = relations(lessons, ({ one }) => ({
  course: one(courses, {
    fields: [lessons.courseId],
    references: [courses.id],
  }),
}));

export const quizzesRelations = relations(quizzes, ({ one, many }) => ({
  course: one(courses, {
    fields: [quizzes.courseId],
    references: [courses.id],
  }),
  questions: many(questions),
}));

export const questionsRelations = relations(questions, ({ one }) => ({
  quiz: one(quizzes, {
    fields: [questions.quizId],
    references: [quizzes.id],
  }),
}));

export const lessonCompletionsRelations = relations(lessonCompletions, ({ one }) => ({
  user: one(users, {
    fields: [lessonCompletions.userId],
    references: [users.id],
  }),
  lesson: one(lessons, {
    fields: [lessonCompletions.lessonId],
    references: [lessons.id],
  }),
}));

export const quizAttemptsRelations = relations(quizAttempts, ({ one }) => ({
  user: one(users, {
    fields: [quizAttempts.userId],
    references: [users.id],
  }),
  quiz: one(quizzes, {
    fields: [quizAttempts.quizId],
    references: [quizzes.id],
  }),
}));
