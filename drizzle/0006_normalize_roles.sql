-- Migration 0006: Normalize instructor role to admin
-- NOTE: Superseded by migration 0012. The system now supports three roles
-- (learner, instructor, admin). The role_check CHECK constraint in 0012
-- is the source of truth for valid role values.
-- The system now supports exactly two roles: learner and admin.
-- Any existing user rows with role = 'instructor' are promoted to 'admin'.
-- This migration is safe to run multiple times (idempotent).

UPDATE users
SET role = 'admin'
WHERE role = 'instructor';
