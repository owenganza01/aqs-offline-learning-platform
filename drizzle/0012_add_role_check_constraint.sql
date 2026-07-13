-- Migration 0012: Add CHECK constraint on users.role
-- Validates role values at the database level (learner, instructor, admin).
-- Idempotent: skips if the constraint already exists.
-- No data correction is performed — any 0006-related data issues must be
-- diagnosed and fixed manually by a human, not automated in a migration.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'role_check'
      AND conrelid = 'users'::regclass
  ) THEN
    ALTER TABLE users ADD CONSTRAINT role_check
      CHECK (role IN ('learner', 'instructor', 'admin'));
  END IF;
END $$;
