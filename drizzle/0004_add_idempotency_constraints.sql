-- Migration 0004: Add unique constraints for idempotency enforcement
-- Ensures DB-level guarantees for sync retry, crash recovery, and duplicate prevention
--
-- Applied changes:
--   lesson_completions:   NOT NULL + UNIQUE (lesson_completion_id)
--                         UNIQUE (user_id, lesson_id)
--   quiz_attempts:        NOT NULL + UNIQUE (submission_id)
--   course_completions:   UNIQUE (completion_id)
--                         UNIQUE (user_id, course_id)

-- =============================================================
-- STEP 1: lesson_completions — idempotency + business rule
-- =============================================================

-- 1a: Fill any NULL lesson_completion_id with a generated UUID
UPDATE lesson_completions
SET lesson_completion_id = gen_random_uuid()::text
WHERE lesson_completion_id IS NULL;

-- 1b: Remove duplicates on lesson_completion_id (keep latest completed_at)
DELETE FROM lesson_completions
WHERE id NOT IN (
  SELECT DISTINCT ON (lesson_completion_id) id
  FROM lesson_completions
  WHERE lesson_completion_id IS NOT NULL
  ORDER BY lesson_completion_id, completed_at DESC NULLS LAST, id DESC
);

-- 1c: Remove duplicates on (user_id, lesson_id) (keep latest completed_at)
DELETE FROM lesson_completions
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id, lesson_id) id
  FROM lesson_completions
  ORDER BY user_id, lesson_id, completed_at DESC NULLS LAST, id DESC
);

-- 1d: Add NOT NULL and UNIQUE on lesson_completion_id
ALTER TABLE lesson_completions
  ALTER COLUMN lesson_completion_id SET NOT NULL,
  ADD CONSTRAINT lesson_completions_lesson_completion_id_key UNIQUE (lesson_completion_id);

-- 1e: Add unique constraint on (user_id, lesson_id)
ALTER TABLE lesson_completions
  ADD CONSTRAINT lesson_completions_user_lesson_key UNIQUE (user_id, lesson_id);


-- =============================================================
-- STEP 2: quiz_attempts — idempotency via submission_id
-- =============================================================

-- 2a: Fill any NULL submission_id with a generated UUID
UPDATE quiz_attempts
SET submission_id = gen_random_uuid()::text
WHERE submission_id IS NULL;

-- 2b: Remove duplicates on submission_id (keep latest attempted_at)
DELETE FROM quiz_attempts
WHERE id NOT IN (
  SELECT DISTINCT ON (submission_id) id
  FROM quiz_attempts
  WHERE submission_id IS NOT NULL
  ORDER BY submission_id, attempted_at DESC NULLS LAST, id DESC
);

-- 2c: Add NOT NULL and UNIQUE on submission_id
ALTER TABLE quiz_attempts
  ALTER COLUMN submission_id SET NOT NULL,
  ADD CONSTRAINT quiz_attempts_submission_id_key UNIQUE (submission_id);


-- =============================================================
-- STEP 3: course_completions — idempotency + business rule
-- =============================================================

-- 3a: Remove duplicates on completion_id (keep latest completed_at)
DELETE FROM course_completions
WHERE id NOT IN (
  SELECT DISTINCT ON (completion_id) id
  FROM course_completions
  ORDER BY completion_id, completed_at DESC NULLS LAST, id DESC
);

-- 3b: Remove duplicates on (user_id, course_id) (keep latest completed_at)
DELETE FROM course_completions
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id, course_id) id
  FROM course_completions
  ORDER BY user_id, course_id, completed_at DESC NULLS LAST, id DESC
);

-- 3c: Add UNIQUE on completion_id
ALTER TABLE course_completions
  ADD CONSTRAINT course_completions_completion_id_key UNIQUE (completion_id);

-- 3d: Add unique constraint on (user_id, course_id) — one completion per user per course
ALTER TABLE course_completions
  ADD CONSTRAINT course_completions_user_course_key UNIQUE (user_id, course_id);
