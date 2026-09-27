-- DEF-006: store actual lesson duration in seconds.
-- NULL = unknown (heuristic used on the frontend as fallback).
ALTER TABLE "lessons" ADD COLUMN IF NOT EXISTS "duration_seconds" integer;
