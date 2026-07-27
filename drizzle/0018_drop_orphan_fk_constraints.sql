-- Migration 0018: Drop orphan auto-named FK constraints from 0011
--
-- Migration 0011 added courses.created_by and users.cohort_id with inline
-- REFERENCES clauses (e.g., `REFERENCES users(id)`). PostgreSQL auto-named
-- these constraints courses_created_by_fkey and users_cohort_id_fkey, both
-- with ON DELETE NO ACTION.
--
-- Later migrations (0014 → 0015 → 0016) added explicit-named constraints
-- (courses_created_by_users_id_fk, users_cohort_id_cohorts_id_fk) with the
-- intended ON DELETE SET NULL behavior. But the orphan auto-named NO ACTION
-- constraints remained, creating a conflict: when both exist on the same
-- column, NO ACTION wins, preventing deletion of referenced rows.
--
-- This migration drops the orphan auto-named constraints so only the
-- correctly-behaved SET NULL constraints remain.
--
-- documents.uploaded_by is NOT affected — 0009's explicit constraint name
-- matches 0015/0016, so no duplicate was created.

ALTER TABLE courses DROP CONSTRAINT IF EXISTS courses_created_by_fkey;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_cohort_id_fkey;
