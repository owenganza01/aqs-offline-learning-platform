-- Add lesson_completion_id column for idempotent offline lesson completion processing
ALTER TABLE lesson_completions 
  ADD COLUMN lesson_completion_id TEXT;

-- Partial unique index: only non-null lesson_completion_ids are enforced as unique.
-- NULL rows (existing completions) are excluded from the index.
CREATE UNIQUE INDEX idx_lesson_completions_lesson_completion_id 
  ON lesson_completions(lesson_completion_id) 
  WHERE lesson_completion_id IS NOT NULL;
