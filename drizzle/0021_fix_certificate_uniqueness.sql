-- Migration 0021: Fix certificate uniqueness constraint
-- The 3-column unique (user_id, course_id, certificate_config_id) has a NULL problem
-- because certificate_config_id becomes NULL after ON DELETE SET NULL.
-- Replace with a 2-column unique (user_id, course_id) that guarantees one cert per learner/course.

-- 1. Drop the flawed constraint (idempotent)
ALTER TABLE issued_certificates
  DROP CONSTRAINT IF EXISTS issued_certificates_user_course_config_key;

-- 2. Create correct unique index (idempotent)
-- This works regardless of whether certificate_config_id is NULL.
CREATE UNIQUE INDEX IF NOT EXISTS issued_certificates_user_course_unique
  ON issued_certificates (user_id, course_id);
