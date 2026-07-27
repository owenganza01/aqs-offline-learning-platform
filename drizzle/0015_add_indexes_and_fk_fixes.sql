-- Migration 0015: Add missing indexes + fix FK ON DELETE behavior
-- #17: Add indexes on FK columns that lack them
-- #20: Fix FK ON DELETE for 3 columns that default to NO ACTION

-- =============================================================
-- INDEXES (#17)
-- =============================================================

CREATE INDEX IF NOT EXISTS idx_cohorts_instructor_id ON cohorts(instructor_id);
CREATE INDEX IF NOT EXISTS idx_documents_lesson_id ON documents(lesson_id);
CREATE INDEX IF NOT EXISTS idx_courses_created_by ON courses(created_by);

-- =============================================================
-- FK ON DELETE FIXES (#20)
-- =============================================================

-- 1. users.cohort_id → ON DELETE SET NULL
--    Dropping a cohort should unassign users, not block the drop.
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_cohort_id_cohorts_id_fk;

ALTER TABLE users
  ADD CONSTRAINT users_cohort_id_cohorts_id_fk
  FOREIGN KEY (cohort_id) REFERENCES cohorts(id) ON DELETE SET NULL;

-- 2. courses.created_by → ON DELETE SET NULL
--    Deleting a user should not block course deletion; keep the course, clear the creator.
ALTER TABLE courses
  DROP CONSTRAINT IF EXISTS courses_created_by_users_id_fk;

ALTER TABLE courses
  ADD CONSTRAINT courses_created_by_users_id_fk
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

-- 3. documents.uploaded_by → ON DELETE SET NULL
--    Deleting a user should not block document deletion; keep the doc, clear the uploader.
ALTER TABLE documents
  DROP CONSTRAINT IF EXISTS documents_uploaded_by_users_id_fk;

ALTER TABLE documents
  ADD CONSTRAINT documents_uploaded_by_users_id_fk
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL;
