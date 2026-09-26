-- 0026_messaging.sql
-- Learner <-> instructor direct messaging.
--
-- Design notes (agreed decisions):
--   * instructor_id is captured once at conversation creation and never
--     updated, even if the course is later transferred to another instructor.
--   * conversations + messages are HISTORICAL data. On user wipe, the wiped
--     participant's FK nulls out (ON DELETE SET NULL) while name snapshots
--     preserve their identity, so the surviving participant keeps a fully
--     readable thread. wipe_user() never issues DELETE/UPDATE against these
--     tables.
--   * Only learners initiate conversations; instructors reply to existing
--     threads (v1 scope).
--   * The atomic find-or-create relies on UNIQUE(course_id, learner_id,
--     instructor_id): sendMessage() does INSERT .. ON CONFLICT DO UPDATE in a
--     single statement (no check-then-insert race).
--   * Postgres treats NULLs as distinct in UNIQUE constraints, so a wiped
--     (NULL-ed) participant never conflicts with a fresh thread.

-- 1. conversations
CREATE TABLE IF NOT EXISTS "conversations" (
  "id" serial PRIMARY KEY,
  -- Courses are never hard-deleted by this application (only archived/transferred) - this CASCADE is currently unreachable in practice. Revisit this FK if a hard-delete-course feature is ever added.
  "course_id" integer NOT NULL REFERENCES "courses"("id") ON DELETE CASCADE,
  "learner_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "instructor_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "learner_name_snapshot" text,
  "instructor_name_snapshot" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "conversations_course_learner_instructor_key"
    UNIQUE ("course_id", "learner_id", "instructor_id")
);

-- 2. messages
CREATE TABLE IF NOT EXISTS "messages" (
  "id" serial PRIMARY KEY,
  "conversation_id" integer NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "sender_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "sender_name_snapshot" text,
  "content" text NOT NULL,
  "is_read" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS "conversations_learner_id_idx" ON "conversations" ("learner_id");
CREATE INDEX IF NOT EXISTS "conversations_instructor_id_idx" ON "conversations" ("instructor_id");
CREATE INDEX IF NOT EXISTS "messages_conversation_id_created_at_idx" ON "messages" ("conversation_id", "created_at");
CREATE INDEX IF NOT EXISTS "messages_conversation_id_is_read_idx" ON "messages" ("conversation_id", "is_read");
CREATE INDEX IF NOT EXISTS "messages_sender_id_idx" ON "messages" ("sender_id");