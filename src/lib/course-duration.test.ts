import { describe, it, expect } from 'vitest';
import { estimateLessonSeconds, courseDurationMinutes, formatCourseDuration } from './course-duration.js';

// Coverage for DEF-005 (total course duration on the course card) and
// DEF-006 (displayed video duration must match the real uploaded video).
//
// The critical behaviour is that seconds are summed and rounded ONCE. Rounding
// each lesson before adding inflates the total — the reported symptom was
// three 7m35s videos reading as 10 minutes each instead of their real length.

describe('estimateLessonSeconds', () => {
  it('prefers the recorded duration over any fallback', () => {
    expect(estimateLessonSeconds({ durationSeconds: 455, videoUrl: 'doc:x', content: 'body' })).toBe(455);
  });

  it('treats a null duration as unknown, not zero', () => {
    expect(estimateLessonSeconds({ durationSeconds: null, videoUrl: 'doc:x' })).toBe(15 * 60);
  });

  it('falls back by content type when no duration was recorded', () => {
    expect(estimateLessonSeconds({ videoUrl: 'doc:x' })).toBe(15 * 60);
    expect(estimateLessonSeconds({ content: 'Some body text' })).toBe(8 * 60);
    expect(estimateLessonSeconds({ content: '   ' })).toBe(5 * 60);
    expect(estimateLessonSeconds({})).toBe(5 * 60);
  });

  it('keeps a real sub-minute duration instead of rounding it up to the fallback', () => {
    expect(estimateLessonSeconds({ durationSeconds: 20, videoUrl: 'doc:x' })).toBe(20);
  });
});

describe('courseDurationMinutes', () => {
  it('rounds once at the end rather than per lesson', () => {
    // 3 x 7m35s = 22m45s -> 23m. Per-lesson rounding would give 3 x 8 = 24m.
    const lessons = [{ durationSeconds: 455 }, { durationSeconds: 455 }, { durationSeconds: 455 }];
    expect(courseDurationMinutes(lessons)).toBe(23);
  });

  it('sums the real durations of a mixed course', () => {
    const lessons = [{ durationSeconds: 600 }, { durationSeconds: 455 }, { durationSeconds: 125 }];
    // 1180s = 19m40s -> 20m
    expect(courseDurationMinutes(lessons)).toBe(20);
  });

  it('mixes recorded durations with fallback estimates', () => {
    const lessons = [{ durationSeconds: 300 }, { videoUrl: 'doc:x' }, { content: 'body' }];
    // 300 + 900 + 480 = 1680s = 28m
    expect(courseDurationMinutes(lessons)).toBe(28);
  });

  it('returns 0 for a course with no lessons', () => {
    expect(courseDurationMinutes([])).toBe(0);
  });
});

describe('formatCourseDuration', () => {
  it('formats minutes only under an hour', () => {
    expect(formatCourseDuration([{ durationSeconds: 2700 }])).toBe('45m');
  });

  it('formats hours and minutes', () => {
    expect(formatCourseDuration([{ durationSeconds: 4500 }])).toBe('1h 15m');
  });

  it('omits a zero minutes remainder', () => {
    expect(formatCourseDuration([{ durationSeconds: 3600 }])).toBe('1h');
  });

  it('formats a multi-hour course', () => {
    expect(formatCourseDuration([{ durationSeconds: 12600 }])).toBe('3h 30m');
  });

  it('renders 0m for an empty course so callers can gate on lesson count', () => {
    expect(formatCourseDuration([])).toBe('0m');
  });
});
