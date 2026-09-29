// src/lib/course-duration.ts
// Shared, dependency-free helpers for course/lesson duration formatting
// (DEF-005, DEF-006).
//
// Real durations come from `lessons.duration_seconds`, captured from the
// browser's video metadata when a lesson video is uploaded. Lessons saved
// before that value was persisted still have a null duration, so they keep a
// rough estimate rather than rendering as unknown.

/** The subset of a lesson needed to work out how long it takes. */
export interface DurationLesson {
  durationSeconds?: number | null;
  videoUrl?: string | null;
  content?: string | null;
}

/**
 * Estimates used when a lesson has no recorded duration. Declared in seconds so
 * that mixing estimated and real lessons adds up correctly.
 */
const FALLBACK_SECONDS = {
  video: 15 * 60,
  content: 8 * 60,
  empty: 5 * 60,
};

/**
 * Best available length for a single lesson, in seconds. Prefers the recorded
 * video duration and otherwise falls back to an estimate based on the content
 * present.
 */
export function estimateLessonSeconds(lesson: DurationLesson): number {
  if (lesson.durationSeconds != null) return lesson.durationSeconds;
  if (lesson.videoUrl) return FALLBACK_SECONDS.video;
  if (lesson.content && lesson.content.trim()) return FALLBACK_SECONDS.content;
  return FALLBACK_SECONDS.empty;
}

/**
 * Total course length in whole minutes.
 *
 * Seconds are summed first and rounded exactly once. Rounding each lesson
 * before adding inflates the result: three 7m35s lessons would total 24m
 * instead of the true 22m45s -> 23m.
 */
export function courseDurationMinutes(lessons: DurationLesson[]): number {
  const totalSeconds = lessons.reduce((sum, lesson) => sum + estimateLessonSeconds(lesson), 0);
  return Math.round(totalSeconds / 60);
}

/**
 * Human-readable total course duration, e.g. "1h 15m", "45m". Returns "0m" for
 * a course with no lessons, so callers should only render it when the course
 * actually has lessons.
 */
export function formatCourseDuration(lessons: DurationLesson[]): string {
  const totalMinutes = courseDurationMinutes(lessons);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return hours > 0 ? `${hours}h${mins > 0 ? ` ${mins}m` : ''}` : `${mins}m`;
}
