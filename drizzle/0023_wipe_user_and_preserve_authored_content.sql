-- 0023_wipe_user_and_preserve_authored_content.sql
-- 1. Ensure documents.uploaded_by is nullable
DO $$
BEGIN
  ALTER TABLE "documents" ALTER COLUMN "uploaded_by" DROP NOT NULL;
EXCEPTION
  WHEN others THEN NULL;
END $$;

-- 2. Add uploaded_by_name to documents if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name = 'uploaded_by_name'
  ) THEN
    ALTER TABLE "documents" ADD COLUMN "uploaded_by_name" text;
  END IF;
END $$;

-- 3. Backfill documents.uploaded_by_name from users (name or email)
UPDATE "documents" d
SET "uploaded_by_name" = COALESCE(u."name", u."email")
FROM "users" u
WHERE d."uploaded_by" = u."id"
  AND d."uploaded_by_name" IS NULL;

-- 4. Add created_by_name to courses if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'courses' AND column_name = 'created_by_name'
  ) THEN
    ALTER TABLE "courses" ADD COLUMN "created_by_name" text;
  END IF;
END $$;

-- 5. Backfill courses.created_by_name from users (name or email)
UPDATE "courses" c
SET "created_by_name" = COALESCE(u."name", u."email")
FROM "users" u
WHERE c."created_by" = u."id"
  AND c."created_by_name" IS NULL;

-- 6. Ensure FK constraints on courses.created_by and documents.uploaded_by have ON DELETE SET NULL
DO $$
BEGIN
  -- Drop existing constraints if present
  ALTER TABLE "courses" DROP CONSTRAINT IF EXISTS "courses_created_by_users_id_fk";
  ALTER TABLE "courses" DROP CONSTRAINT IF EXISTS "courses_created_by_fkey";
  ALTER TABLE "documents" DROP CONSTRAINT IF EXISTS "documents_uploaded_by_users_id_fk";
  ALTER TABLE "documents" DROP CONSTRAINT IF EXISTS "documents_uploaded_by_fkey";

  -- Re-add with ON DELETE SET NULL
  ALTER TABLE "courses"
    ADD CONSTRAINT "courses_created_by_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;

  ALTER TABLE "documents"
    ADD CONSTRAINT "documents_uploaded_by_users_id_fk"
    FOREIGN KEY ("uploaded_by") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
END $$;

-- 7. Create wipe_user(target_uid text) function
CREATE OR REPLACE FUNCTION wipe_user(target_uid text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id integer;
BEGIN
  -- Look up internal user id
  SELECT id INTO v_user_id FROM users WHERE uid = target_uid;
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  -- Delete personal / per-user activity records in FK-safe order
  DELETE FROM issued_certificates WHERE user_id = v_user_id;
  DELETE FROM quiz_attempts WHERE user_id = v_user_id;
  DELETE FROM lesson_completions WHERE user_id = v_user_id;
  DELETE FROM course_completions WHERE user_id = v_user_id;
  DELETE FROM enrollments WHERE user_id = v_user_id;

  -- Safety nullification on preserved authored content
  UPDATE courses SET created_by = NULL WHERE created_by = v_user_id;
  UPDATE documents SET uploaded_by = NULL WHERE uploaded_by = v_user_id;

  -- Delete primary user row
  DELETE FROM users WHERE id = v_user_id;

  RETURN true;
END;
$$;
