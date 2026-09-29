-- 0027_update_wipe_user_comments.sql
-- Documentation-only replacement of wipe_user(). The function body is
-- byte-for-byte identical to the version introduced in 0023 — no functional
-- change. The only difference is the expanded comment block, which explicitly
-- documents what happens to message history (conversations / messages) when
-- the function runs.
--
-- This migration intentionally contains ONLY the CREATE OR REPLACE FUNCTION
-- statement. No schema alters, no index changes, no constraint drops.

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

  -- ---------------------------------------------------------------------
  -- Personal / per-user activity records — hard deleted in FK-safe order.
  -- These have no value to a second party, so removal is complete.
  -- ---------------------------------------------------------------------
  DELETE FROM issued_certificates WHERE user_id = v_user_id;
  DELETE FROM quiz_attempts WHERE user_id = v_user_id;
  DELETE FROM lesson_completions WHERE user_id = v_user_id;
  DELETE FROM course_completions WHERE user_id = v_user_id;
  DELETE FROM enrollments WHERE user_id = v_user_id;

  -- ---------------------------------------------------------------------
  -- Authored content (courses, documents) — preserved, authorship nulled.
  -- ---------------------------------------------------------------------
  UPDATE courses SET created_by = NULL WHERE created_by = v_user_id;
  UPDATE documents SET uploaded_by = NULL WHERE uploaded_by = v_user_id;

  -- ---------------------------------------------------------------------
  -- Message history — preserved, NOT touched by any statement in this
  -- function. No DELETE or UPDATE is issued against conversations or
  -- messages. Preservation is achieved entirely by the FK ON DELETE SET
  -- NULL rules that fire when the users row is deleted below:
  --
  --   • conversations.learner_id    ON DELETE SET NULL  (row survives
  --   • conversations.instructor_id ON DELETE SET NULL   for the other
  --                                                      participant)
  --   • messages.sender_id          ON DELETE SET NULL
  --
  -- Display names are retained by snapshot columns
  -- (learner_name_snapshot / instructor_name_snapshot on conversations,
  --  sender_name_snapshot on messages), so the surviving participant keeps
  -- a fully readable thread after this wipe.
  --
  -- IF the wiped user was the LAST participant (both FKs already NULL on a
  -- conversation), that conversation simply becomes orphaned but is never
  -- deleted by this routine; housekeeping, if ever desired, is a separate
  -- administrative concern.
  -- ---------------------------------------------------------------------

  -- Delete primary user row — this is the ONLY statement that affects
  -- message history, and only via the FK SET NULL rules above.
  DELETE FROM users WHERE id = v_user_id;

  RETURN true;
END;
$$;