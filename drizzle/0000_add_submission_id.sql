-- Add submission_id column for idempotent quiz submission processing
ALTER TABLE quiz_attempts 
  ADD COLUMN submission_id TEXT;

-- Partial unique index: only non-null submission_ids are enforced as unique.
-- NULL rows (existing attempts) are excluded from the index.
CREATE UNIQUE INDEX idx_quiz_attempts_submission_id 
  ON quiz_attempts(submission_id) 
  WHERE submission_id IS NOT NULL;
