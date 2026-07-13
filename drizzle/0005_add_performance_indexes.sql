-- Migration 0005: Add performance indexes for analytics endpoint and learner filtering
--
-- Problem:
--   The analytics endpoint (GET /api/instructor/analytics) was rewritten from O(C×L)
--   nested loops to O(1) bulk aggregation (8 total queries), but four indexes are
--   needed to ensure those queries scale to production data volumes:
--
--   1. quiz_attempts(user_id, quiz_id) — composite index for GROUP BY aggregation
--      Query: SELECT user_id, quiz_id, MAX(score), BOOL_OR(passed) FROM quiz_attempts
--             GROUP BY user_id, quiz_id
--      Without this index: full sequential scan + hash aggregation (O(A) where A = rows)
--      With this index:   index-only scan possible, faster hash aggregation
--
--   2. lesson_completions(completed_at DESC) — descending index for recent activity
--      Query: SELECT ... FROM lesson_completions ORDER BY completed_at DESC LIMIT 8
--      Without this index: full sequential scan + sort (O(CL log CL))
--      With this index:   index scan stops at 8 rows (O(log CL + 8))
--      CRITICAL — without it, recent activity is the first failure point at ~10K rows
--
--   3. quiz_attempts(attempted_at DESC) — descending index for recent quiz activity
--      Query: SELECT ... FROM quiz_attempts ORDER BY attempted_at DESC LIMIT 8
--      Same pattern as #2 — without this index, every analytics request sorts the
--      entire quiz_attempts table to find the 8 most recent rows.
--      CRITICAL — same severity as #2
--
--   4. users(role) — index for learner filtering
--      Query: filter learners from allUsers (WHERE role = 'learner')
--      Without this index: full sequential scan of users table
--      With this index:   index scan, important at >100K users


-- =============================================================
-- 1. Composite index for quiz_attempts GROUP BY aggregation
-- =============================================================
-- Speeds up: SELECT user_id, quiz_id, MAX(score), BOOL_OR(passed)
--            FROM quiz_attempts GROUP BY user_id, quiz_id
-- Covers:    user_id, quiz_id (both columns in GROUP BY)

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user_quiz
  ON quiz_attempts (user_id, quiz_id);


-- =============================================================
-- 2. Descending index for lesson completions ORDER BY + LIMIT
-- =============================================================
-- Speeds up: SELECT ... FROM lesson_completions
--            ORDER BY completed_at DESC LIMIT 8
-- CRITICAL:  Without this index, every analytics request sorts the entire
--            lesson_completions table to find the 8 most recent rows.
--            With this index, PostgreSQL reads only 8 index entries.

CREATE INDEX IF NOT EXISTS idx_lesson_completions_completed_at
  ON lesson_completions (completed_at DESC);


-- =============================================================
-- 3. Descending index for quiz attempts ORDER BY + LIMIT
-- =============================================================
-- Speeds up: SELECT ... FROM quiz_attempts
--            ORDER BY attempted_at DESC LIMIT 8
-- CRITICAL:  Same pattern as #2. Without this index, every analytics request
--            sorts the entire quiz_attempts table to find the 8 most recent
--            quiz submissions. With this index, PostgreSQL reads only 8 entries.

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_attempted_at
  ON quiz_attempts (attempted_at DESC);


-- =============================================================
-- 4. Index for learner filtering at scale
-- =============================================================
-- Speeds up: filtering WHERE role = 'learner' on the users table
-- Important when the users table exceeds 100,000 rows.
-- Low cardinality (only 3 distinct values: learner, instructor, admin),
-- so a bitmap scan is used. This is still far faster than a full
-- sequential scan for selective queries.

CREATE INDEX IF NOT EXISTS idx_users_role
  ON users (role);
