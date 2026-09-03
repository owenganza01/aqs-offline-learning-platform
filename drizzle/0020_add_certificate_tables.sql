-- Migration 0020: Add certificate configuration and issued certificate tables
-- This migration is additive only — no existing data is modified or deleted.

-- 1. Create certificate_configs table (idempotent)
CREATE TABLE IF NOT EXISTS certificate_configs (
  id SERIAL PRIMARY KEY,
  course_id INTEGER NOT NULL UNIQUE REFERENCES courses(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  title TEXT NOT NULL DEFAULT 'Certificate of Completion',
  issuer TEXT NOT NULL DEFAULT 'AQS Learning Platform',
  require_course_completion BOOLEAN NOT NULL DEFAULT true,
  require_assessment BOOLEAN NOT NULL DEFAULT true,
  min_assessment_score INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- 2. Create issued_certificates table (idempotent)
CREATE TABLE IF NOT EXISTS issued_certificates (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  certificate_config_id INTEGER REFERENCES certificate_configs(id) ON DELETE SET NULL,
  course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL,
  verification_code TEXT NOT NULL UNIQUE,
  learner_name_snapshot TEXT NOT NULL,
  course_title_snapshot TEXT NOT NULL,
  certificate_title_snapshot TEXT NOT NULL,
  issuer_snapshot TEXT NOT NULL,
  requirements_snapshot JSONB NOT NULL,
  issued_at TIMESTAMP NOT NULL DEFAULT now()
);

-- 3. Add indexes for issued_certificates (idempotent)
CREATE INDEX IF NOT EXISTS issued_certificates_user_id_idx ON issued_certificates(user_id);
CREATE INDEX IF NOT EXISTS issued_certificates_verification_code_idx ON issued_certificates(verification_code);

-- 4. Add unique constraint for (user_id, course_id, certificate_config_id) (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'issued_certificates_user_course_config_key'
  ) THEN
    ALTER TABLE issued_certificates ADD CONSTRAINT issued_certificates_user_course_config_key
      UNIQUE (user_id, course_id, certificate_config_id);
  END IF;
END $$;
