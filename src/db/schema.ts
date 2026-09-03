import { relations } from 'drizzle-orm';
import { integer, pgTable, serial, text, timestamp, boolean, jsonb, unique, index } from 'drizzle-orm/pg-core';

// 1. Users table (synced from Firebase UID)
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID (or 'pending-<uuid>' before first login)
  email: text('email').notNull().unique(),
  name: text('name'),
  role: text('role').default('learner').notNull(), // 'learner' | 'instructor' | 'admin'
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 3. Courses table
export const courses = pgTable('courses', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  thumbnail: text('thumbnail'), // Data URL, image URL, or gradient code
  createdBy: integer('created_by').references(() => users.id),
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
export const lessonCompletions = pgTable(
  'lesson_completions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    lessonId: integer('lesson_id')
      .references(() => lessons.id, { onDelete: 'cascade' })
      .notNull(),
    completedAt: timestamp('completed_at').defaultNow().notNull(),
  },
  (table) => [
    index('lesson_completions_user_id_idx').on(table.userId),
    index('lesson_completions_lesson_id_idx').on(table.lessonId),
  ],
);

// 7. Quiz attempts (Passed score >= 70%)
export const quizAttempts = pgTable(
  'quiz_attempts',
  {
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
  },
  (table) => [index('quiz_attempts_user_id_idx').on(table.userId), index('quiz_attempts_quiz_id_idx').on(table.quizId)],
);

// 8. Course completions (server-side enforcement: all lessons done + quiz passed >= 70%)
export const courseCompletions = pgTable('course_completions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  courseId: integer('course_id')
    .references(() => courses.id, { onDelete: 'cascade' })
    .notNull(),
  completionId: text('completion_id').notNull(),
  quizPassed: boolean('quiz_passed').notNull().default(false),
  allLessonsComplete: boolean('all_lessons_complete').notNull().default(false),
  completedAt: timestamp('completed_at').defaultNow().notNull(),
});

// 9. Documents (uploaded lesson files stored in the database)
export const documents = pgTable(
  'documents',
  {
    id: text('id').primaryKey(), // Application-generated UUID
    lessonId: integer('lesson_id').references(() => lessons.id, { onDelete: 'cascade' }),
    originalFileName: text('original_file_name').notNull(),
    storedFileName: text('stored_file_name').notNull(),
    mimeType: text('mime_type').notNull(),
    fileSize: integer('file_size').notNull(),
    uploadedAt: timestamp('uploaded_at').defaultNow().notNull(),
    uploadedBy: integer('uploaded_by')
      .references(() => users.id)
      .notNull(),
    fileData: text('file_data').notNull(), // Base64-encoded binary content
  },
  (table) => [index('documents_lesson_id_idx').on(table.lessonId)],
);

// 10. Enrollments (tracks which users are enrolled in which courses)
export const enrollments = pgTable(
  'enrollments',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    courseId: integer('course_id')
      .references(() => courses.id, { onDelete: 'cascade' })
      .notNull(),
    enrolledAt: timestamp('enrolled_at').defaultNow().notNull(),
  },
  (table) => [unique('enrollments_user_course_key').on(table.userId, table.courseId)],
);

// 11. Certificate configurations (per-course certificate settings)
export const certificateConfigs = pgTable('certificate_configs', {
  id: serial('id').primaryKey(),
  courseId: integer('course_id')
    .references(() => courses.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  enabled: boolean('enabled').notNull().default(false),
  title: text('title').notNull().default('Certificate of Completion'),
  issuer: text('issuer').notNull().default('AQS Learning Platform'),
  requireCourseCompletion: boolean('require_course_completion').notNull().default(true),
  requireAssessment: boolean('require_assessment').notNull().default(true),
  minAssessmentScore: integer('min_assessment_score'),
  templateDocumentId: text('template_document_id'),
  templateFileName: text('template_file_name'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 12. Issued certificates (historical records — survive config/course deletion)
export const issuedCertificates = pgTable(
  'issued_certificates',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    certificateConfigId: integer('certificate_config_id').references(() => certificateConfigs.id, {
      onDelete: 'set null',
    }),
    courseId: integer('course_id').references(() => courses.id, { onDelete: 'set null' }),
    verificationCode: text('verification_code').notNull().unique(),
    learnerNameSnapshot: text('learner_name_snapshot').notNull(),
    courseTitleSnapshot: text('course_title_snapshot').notNull(),
    certificateTitleSnapshot: text('certificate_title_snapshot').notNull(),
    issuerSnapshot: text('issuer_snapshot').notNull(),
    requirementsSnapshot: jsonb('requirements_snapshot').notNull(),
    issuedAt: timestamp('issued_at').defaultNow().notNull(),
  },
  (table) => [
    index('issued_certificates_user_id_idx').on(table.userId),
    index('issued_certificates_verification_code_idx').on(table.verificationCode),
    unique('issued_certificates_user_course_config_key').on(table.userId, table.courseId, table.certificateConfigId),
  ],
);

// Define Relationships

export const usersRelations = relations(users, ({ one, many }) => ({
  lessonCompletions: many(lessonCompletions),
  quizAttempts: many(quizAttempts),
  enrollments: many(enrollments),
}));

export const coursesRelations = relations(courses, ({ many, one }) => ({
  lessons: many(lessons),
  quiz: one(quizzes, {
    fields: [courses.id],
    references: [quizzes.courseId],
  }),
  enrollments: many(enrollments),
  creator: one(users, {
    fields: [courses.createdBy],
    references: [users.id],
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

export const courseCompletionsRelations = relations(courseCompletions, ({ one }) => ({
  user: one(users, {
    fields: [courseCompletions.userId],
    references: [users.id],
  }),
  course: one(courses, {
    fields: [courseCompletions.courseId],
    references: [courses.id],
  }),
}));

export const documentsRelations = relations(documents, ({ one }) => ({
  lesson: one(lessons, {
    fields: [documents.lessonId],
    references: [lessons.id],
  }),
  uploader: one(users, {
    fields: [documents.uploadedBy],
    references: [users.id],
  }),
}));

export const enrollmentsRelations = relations(enrollments, ({ one }) => ({
  user: one(users, {
    fields: [enrollments.userId],
    references: [users.id],
  }),
  course: one(courses, {
    fields: [enrollments.courseId],
    references: [courses.id],
  }),
}));

export const certificateConfigsRelations = relations(certificateConfigs, ({ one }) => ({
  course: one(courses, {
    fields: [certificateConfigs.courseId],
    references: [courses.id],
  }),
}));

export const issuedCertificatesRelations = relations(issuedCertificates, ({ one }) => ({
  user: one(users, {
    fields: [issuedCertificates.userId],
    references: [users.id],
  }),
  course: one(courses, {
    fields: [issuedCertificates.courseId],
    references: [courses.id],
  }),
  certificateConfig: one(certificateConfigs, {
    fields: [issuedCertificates.certificateConfigId],
    references: [certificateConfigs.id],
  }),
}));
