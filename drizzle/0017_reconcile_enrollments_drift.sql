-- Migration 0017: Drop orphan enrollment_id from the old 0002 path
--
-- The old 0002_add_enrollments.sql created enrollments with an enrollment_id
-- column that was never referenced by application code (zero reads/writes in src/).
-- The canonical schema (src/db/schema.ts, matching 0008) does not include this column.
--
-- This migration:
--   1. Drops the unique constraint on enrollment_id (if present)
--   2. Drops the index on user_id (if present)
--   3. Drops the enrollment_id column itself (if present)
--
-- Idempotent: uses IF EXISTS guards so it's safe on both the old-0002 path
-- (where these objects exist) and the new-0002/fresh-0008 path (where they don't).

DROP INDEX IF EXISTS idx_enrollments_user_id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_enrollments_enrollment_id'
  ) THEN
    ALTER TABLE enrollments DROP CONSTRAINT uq_enrollments_enrollment_id;
  END IF;
END $$;

ALTER TABLE enrollments DROP COLUMN IF EXISTS enrollment_id;
