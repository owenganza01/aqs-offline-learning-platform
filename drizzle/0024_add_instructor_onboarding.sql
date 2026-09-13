-- 0024_add_instructor_onboarding.sql
-- Adds instructor onboarding/approval workflow fields to the users table.

-- 1. Add onboarding_status column (default 'active' preserves existing users)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'onboarding_status'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "onboarding_status" text NOT NULL DEFAULT 'active';
  END IF;
END $$;

-- 2. Add bio column (nullable, set during instructor onboarding)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'bio'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "bio" text;
  END IF;
END $$;

-- 3. Add organization column (nullable, optional during instructor onboarding)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'organization'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "organization" text;
  END IF;
END $$;

-- 4. Add rejection_reason column (nullable, set when an admin declines an application)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'rejection_reason'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "rejection_reason" text;
  END IF;
END $$;

-- 5. Add submitted_at column (when the application was submitted for review)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'submitted_at'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "submitted_at" timestamp;
  END IF;
END $$;

-- 6. Add a CHECK constraint to keep onboarding_status values in the allowed set.
-- Drop any existing constraint first to make the migration idempotent.
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_onboarding_status_check";

ALTER TABLE "users"
  ADD CONSTRAINT "users_onboarding_status_check"
  CHECK (onboarding_status IN ('onboarding', 'pending_approval', 'active', 'rejected'));