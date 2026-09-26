-- Migration 0019: Drop cohorts table and remove invite code / cohort membership
-- This migration removes the cohort feature entirely.
-- Foreign key dependencies are handled in order.

-- 1. Drop the foreign key constraint on users.cohort_id (if it exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_cohort_id_cohorts_id_fk'
    OR conname = 'users_cohort_id_fkey'
  ) THEN
    ALTER TABLE users DROP CONSTRAINT users_cohort_id_cohorts_id_fk;
  END IF;
END $$;

-- Also handle the constraint added by drizzle migrations
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT tc.constraint_name INTO constraint_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
  WHERE tc.table_name = 'users'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'cohort_id'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

-- 2. Drop the cohort_id column from users
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'cohort_id'
  ) THEN
    ALTER TABLE users DROP COLUMN cohort_id;
  END IF;
END $$;

-- 3. Drop the cohorts table (cascade any remaining dependent constraints)
DROP TABLE IF EXISTS cohorts CASCADE;
