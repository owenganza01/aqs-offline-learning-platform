-- Migration 0013: Add performance indexes for lesson listing, completion checks,
-- quiz scoring, and quiz attempt ordering.
--
-- Indexes added:
--   1. lessons (course_id, sort_order)
--      Speeds up: SELECT ... FROM lessons WHERE course_id = ? ORDER BY sort_order
--      Used by: GET /api/courses/:id, GET /api/courses, lesson reorder verification
--      Without: sequential scan + sort for every course detail request
--
--   2. lesson_completions (user_id, lesson_id)
--      Speeds up: SELECT ... FROM lesson_completions WHERE user_id = ? AND lesson_id = ?
--      Used by: POST /api/sync (existence check), GET /api/courses/:id (completion list)
--      Without: sequential scan per completion check (up to 500 per sync)
--
--   3. quiz_attempts (user_id, quiz_id, attempted_at DESC)
--      Speeds up: SELECT ... FROM quiz_attempts WHERE user_id = ? AND quiz_id = ?
--                ORDER BY attempted_at DESC
--      Used by: GET /api/courses/:id (latest attempt per user+quiz)
--      Without: separate index scan + sort, or bitmap combine of two indexes
--
--   4. questions (quiz_id)
--      Speeds up: SELECT ... FROM questions WHERE quiz_id = ?
--      Used by: POST /api/quizzes/:id/submit, POST /api/sync, GET /api/courses/:id
--      Without: sequential scan of questions table per quiz scoring

CREATE INDEX IF NOT EXISTS idx_lessons_course_sort
  ON lessons (course_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_lesson_completions_user_lesson
  ON lesson_completions (user_id, lesson_id);

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user_quiz_attempted
  ON quiz_attempts (user_id, quiz_id, attempted_at DESC);

CREATE INDEX IF NOT EXISTS idx_questions_quiz
  ON questions (quiz_id);
