-- Create course_completions table for server-side completion enforcement
-- A course is only complete when all lessons are marked done AND the quiz is passed at >= 70%
CREATE TABLE IF NOT EXISTS course_completions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  completion_id TEXT NOT NULL,
  quiz_passed BOOLEAN NOT NULL DEFAULT FALSE,
  all_lessons_complete BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_course_completions_user_course UNIQUE (user_id, course_id)
);

CREATE INDEX idx_course_completions_user_id ON course_completions(user_id);
CREATE INDEX idx_course_completions_course_id ON course_completions(course_id);
