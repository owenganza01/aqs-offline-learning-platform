-- 0025_instructor_closure.sql
-- Adds instructor account-closure lifecycle columns to users, and an
-- admin-driven archive flag to courses.

-- 1. closure_status (nullable: NULL | 'pending' | 'closed')
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'closure_status'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "closure_status" text;
  END IF;
END $$;

-- 2. closure_started_at (when the admin initiated closure)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'closure_started_at'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "closure_started_at" timestamp;
  END IF;
END $$;

-- 3. closure_retention_days (captured at initiation, 7..30, default applied app-side)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'closure_retention_days'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "closure_retention_days" integer CHECK (
      closure_retention_days IS NULL OR (closure_retention_days BETWEEN 7 AND 30)
    );
  END IF;
END $$;

-- 4. closure_reason (free text set by the admin at initiation)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'closure_reason'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "closure_reason" text;
  END IF;
END $$;

-- 5. Constant CHECK constraint on closure_status values.
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_closure_status_check";
ALTER TABLE "users"
  ADD CONSTRAINT "users_closure_status_check"
  CHECK (closure_status IN ('pending', 'closed'));

-- 6. courses.is_archived (admin-driven flag; NOT NULL default false)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'courses' AND column_name = 'is_archived'
  ) THEN
    ALTER TABLE "courses" ADD COLUMN "is_archived" boolean NOT NULL DEFAULT false;
  END IF;
END $$;