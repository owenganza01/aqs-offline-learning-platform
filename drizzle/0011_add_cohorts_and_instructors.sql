-- Migration 0011: Add cohorts table, instructor support, and email uniqueness
-- This migration is additive only — no existing data is modified or deleted.

-- 1. Create cohorts table (idempotent)
CREATE TABLE IF NOT EXISTS cohorts (
  id SERIAL PRIMARY KEY,
  instructor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  invite_code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

-- 2. Add cohort_id column to users (idempotent — skip if column exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'cohort_id'
  ) THEN
    ALTER TABLE users ADD COLUMN cohort_id INTEGER REFERENCES cohorts(id);
  END IF;
END $$;

-- 3. Add created_by column to courses (idempotent — skip if column exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'courses' AND column_name = 'created_by'
  ) THEN
    ALTER TABLE courses ADD COLUMN created_by INTEGER REFERENCES users(id);
  END IF;
END $$;

-- 4. Add UNIQUE constraint on users.email (prevents duplicate registrations)
-- Uses a workaround since PostgreSQL doesn't support ADD CONSTRAINT IF NOT EXISTS
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_email_unique'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email);
  END IF;
END $$;
