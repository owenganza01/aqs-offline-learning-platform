-- Migration 0028: DB-level idempotency for offline-sync reconciliation
-- Prevents duplicate rows when the same queued offline payload is flushed more
-- than once (dropped-connection retry, crash recovery).
--
-- The original 0004 migration referenced legacy columns (lesson_completion_id,
-- submission_id) that do not exist in the current schema, so it was never
-- applied in production. This migration re-establishes the intent against the
-- schema as it exists today:
--   lesson_completions:  UNIQUE (user_id, lesson_id)
--   quiz_attempts:       UNIQUE (user_id, quiz_id, attempted_at)
--   course_completions:  UNIQUE (completion_id) and UNIQUE (user_id, course_id)
-- completeCourse() relies on the (user_id, course_id) conflict (SQLSTATE 23505)
-- to be idempotent: without it a re-run inserts a duplicate course_completions
-- row with a fresh completion_id. The issued_certificates (user_id, course_id)
-- unique index already exists (issued_certificates_user_course_unique), which is
-- why certificates were never double-issued.

-- =============================================================
-- STEP 1: lesson_completions — one completion per (user, lesson)
-- =============================================================

-- 1a: Dedupe existing rows (keep latest completed_at)
DELETE FROM lesson_completions a
USING lesson_completions b
WHERE a.user_id = b.user_id
  AND a.lesson_id = b.lesson_id
  AND (a.completed_at, a.id) < (b.completed_at, b.id);

-- 1b: Enforce uniqueness
ALTER TABLE lesson_completions
  ADD CONSTRAINT lesson_completions_user_lesson_key UNIQUE (user_id, lesson_id);

-- =============================================================
-- STEP 2: quiz_attempts — a retried queue item shares attempted_at
-- =============================================================

-- 2a: Dedupe existing rows (keep the highest id for identical timestamps)
DELETE FROM quiz_attempts a
USING quiz_attempts b
WHERE a.user_id = b.user_id
  AND a.quiz_id = b.quiz_id
  AND a.attempted_at = b.attempted_at
  AND a.id < b.id;

-- 2b: Enforce uniqueness (distinct re-attempts carry distinct attempted_at)
ALTER TABLE quiz_attempts
  ADD CONSTRAINT quiz_attempts_user_quiz_attempt_key UNIQUE (user_id, quiz_id, attempted_at);

-- =============================================================
-- STEP 3: course_completions — the idempotent completeCourse() path
-- =============================================================

-- 3a: Dedupe existing rows on completion_id (keep latest completed_at)
DELETE FROM course_completions a
USING course_completions b
WHERE a.completion_id = b.completion_id
  AND (a.completed_at, a.id) < (b.completed_at, b.id);

-- 3b: Dedupe existing rows on (user_id, course_id) (keep latest completed_at)
DELETE FROM course_completions a
USING course_completions b
WHERE a.user_id = b.user_id
  AND a.course_id = b.course_id
  AND (a.completed_at, a.id) < (b.completed_at, b.id);

-- 3c: Enforce uniqueness
ALTER TABLE course_completions
  ADD CONSTRAINT course_completions_completion_id_key UNIQUE (completion_id);
ALTER TABLE course_completions
  ADD CONSTRAINT course_completions_user_course_key UNIQUE (user_id, course_id);