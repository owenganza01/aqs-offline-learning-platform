import { describe, it, expect } from 'vitest';
import { lessonSchema, reorderSchema, courseIdParamSchema } from './validate.js';

// Regression coverage for DEF-008 (instructor lesson creation/save failure).
//
// The lesson editor submits `videoUrl: toYouTubeEmbed(...)` and
// `slidesUrl: form.slidesUrl || null`, both of which serialise to JSON `null`
// when the optional fields are left blank. The lesson columns are nullable, so
// `null` is a legitimate value; the schema previously only accepted
// `undefined` (`.optional()`), which made every text-only lesson save fail
// with HTTP 400 "Validation failed" before reaching the controller.

describe('lessonSchema validation', () => {
  it('accepts the exact payload the lesson editor sends for a text-only lesson', () => {
    const result = lessonSchema.safeParse({
      courseId: 5,
      title: 'Intro',
      content: 'Body text only',
      videoUrl: null,
      slidesUrl: null,
      sortOrder: 0,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.videoUrl).toBeNull();
      expect(result.data.slidesUrl).toBeNull();
    }
  });

  it('accepts a payload where only the optional keys are omitted entirely', () => {
    const result = lessonSchema.safeParse({ title: 'Intro', content: 'Body', sortOrder: 0 });
    expect(result.success).toBe(true);
  });

  it('accepts a payload with a video but no slides', () => {
    const result = lessonSchema.safeParse({
      title: 'Intro',
      content: 'Body',
      videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
      slidesUrl: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a payload with slides but no video', () => {
    const result = lessonSchema.safeParse({
      title: 'Intro',
      content: 'Body',
      videoUrl: null,
      slidesUrl: 'doc:12',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a non-string, non-null videoUrl', () => {
    expect(lessonSchema.safeParse({ title: 'Intro', content: 'Body', videoUrl: 123 }).success).toBe(false);
    expect(lessonSchema.safeParse({ title: 'Intro', content: 'Body', videoUrl: {} }).success).toBe(false);
    expect(lessonSchema.safeParse({ title: 'Intro', content: 'Body', videoUrl: [] }).success).toBe(false);
    expect(lessonSchema.safeParse({ title: 'Intro', content: 'Body', videoUrl: true }).success).toBe(false);
  });

  it('rejects a non-string, non-null slidesUrl', () => {
    expect(lessonSchema.safeParse({ title: 'Intro', content: 'Body', slidesUrl: 42 }).success).toBe(false);
    expect(lessonSchema.safeParse({ title: 'Intro', content: 'Body', slidesUrl: {} }).success).toBe(false);
    expect(lessonSchema.safeParse({ title: 'Intro', content: 'Body', slidesUrl: [] }).success).toBe(false);
  });

  it('rejects a null title or null content', () => {
    expect(lessonSchema.safeParse({ title: null, content: 'Body' }).success).toBe(false);
    expect(lessonSchema.safeParse({ title: 'Intro', content: null }).success).toBe(false);
  });

  it('still enforces a non-empty title', () => {
    const result = lessonSchema.safeParse({ title: '', content: 'Body' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join('.') === 'title')).toBe(true);
    }
  });

  it('still enforces non-empty content', () => {
    const result = lessonSchema.safeParse({ title: 'Intro', content: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join('.') === 'content')).toBe(true);
    }
  });

  it('still enforces the max length on videoUrl and slidesUrl', () => {
    expect(lessonSchema.safeParse({ title: 'I', content: 'B', videoUrl: 'x'.repeat(501) }).success).toBe(false);
    expect(lessonSchema.safeParse({ title: 'I', content: 'B', slidesUrl: 'x'.repeat(5001) }).success).toBe(false);
  });

  it('still rejects a negative or fractional sortOrder', () => {
    expect(lessonSchema.safeParse({ title: 'I', content: 'B', sortOrder: -1 }).success).toBe(false);
    expect(lessonSchema.safeParse({ title: 'I', content: 'B', sortOrder: 1.5 }).success).toBe(false);
  });

  it('coerces a numeric string sortOrder to a number', () => {
    const result = lessonSchema.safeParse({ title: 'Intro', content: 'Body', sortOrder: '3' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sortOrder).toBe(3);
    }
  });
});

// Coverage for DEF-006 (real video duration). The lesson editor reads
// `video.duration` from the browser's media metadata and sends it as
// `durationSeconds`. The schema previously omitted the key, and Zod strips
// unknown keys — so the value never reached the controller and
// `lessons.duration_seconds` stayed NULL.
describe('lessonSchema durationSeconds validation', () => {
  it('keeps the real duration sent by the lesson editor', () => {
    const result = lessonSchema.safeParse({
      title: 'Intro',
      content: 'Body',
      videoUrl: 'doc:abc',
      slidesUrl: null,
      durationSeconds: 455,
      sortOrder: 0,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.durationSeconds).toBe(455);
    }
  });

  it('accepts an explicit null for an unknown duration', () => {
    const result = lessonSchema.safeParse({ title: 'Intro', content: 'Body', durationSeconds: null });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.durationSeconds).toBeNull();
    }
  });

  it('omits the key entirely when the client does not send it', () => {
    const result = lessonSchema.safeParse({ title: 'Intro', content: 'Body' });
    expect(result.success).toBe(true);
    if (result.success) {
      // Absent, not undefined-valued: the service relies on this to tell
      // "leave the stored duration alone" from "clear it" on update.
      expect('durationSeconds' in result.data).toBe(false);
    }
  });

  it('accepts zero and a whole number of seconds', () => {
    const zero = lessonSchema.safeParse({ title: 'I', content: 'B', durationSeconds: 0 });
    expect(zero.success).toBe(true);
    if (zero.success) {
      expect(zero.data.durationSeconds).toBe(0);
    }
    const whole = lessonSchema.safeParse({ title: 'I', content: 'B', durationSeconds: 3600 });
    expect(whole.success).toBe(true);
  });

  it('rejects a negative duration', () => {
    expect(lessonSchema.safeParse({ title: 'I', content: 'B', durationSeconds: -1 }).success).toBe(false);
  });

  it('rejects a fractional duration', () => {
    const result = lessonSchema.safeParse({ title: 'I', content: 'B', durationSeconds: 12.5 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join('.') === 'durationSeconds')).toBe(true);
    }
  });

  it('rejects a non-numeric, non-null duration', () => {
    expect(lessonSchema.safeParse({ title: 'I', content: 'B', durationSeconds: '455' }).success).toBe(false);
    expect(lessonSchema.safeParse({ title: 'I', content: 'B', durationSeconds: {} }).success).toBe(false);
  });
});

// Coverage for the lesson-reorder payload (DEF-010). The admin curriculum list
// now always sends the complete ordered id list, so the schema's job is to
// reject an empty or malformed sequence rather than to default it.
describe('reorderSchema validation', () => {
  it('accepts a full ordered id list', () => {
    const result = reorderSchema.safeParse({ orderedIds: [3, 1, 2] });
    expect(result.success).toBe(true);
  });

  it('rejects an empty orderedIds array', () => {
    expect(reorderSchema.safeParse({ orderedIds: [] }).success).toBe(false);
  });

  it('rejects a missing orderedIds key', () => {
    expect(reorderSchema.safeParse({}).success).toBe(false);
  });

  it('coerces string ids to numbers', () => {
    const result = reorderSchema.safeParse({ orderedIds: ['7', '8'] });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.orderedIds).toEqual([7, 8]);
    }
  });
});

// Coverage for the DELETE /api/enrollments/:courseId param (DEF-007). This
// route triggers a destructive purge, so a malformed id must be rejected before
// any delete runs.
describe('courseIdParamSchema validation', () => {
  it('accepts a positive integer courseId', () => {
    const result = courseIdParamSchema.safeParse({ courseId: 42 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.courseId).toBe(42);
    }
  });

  it('coerces a numeric string, as Express path params arrive', () => {
    const result = courseIdParamSchema.safeParse({ courseId: '42' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.courseId).toBe(42);
    }
  });

  it('rejects zero and negative ids', () => {
    expect(courseIdParamSchema.safeParse({ courseId: 0 }).success).toBe(false);
    expect(courseIdParamSchema.safeParse({ courseId: -1 }).success).toBe(false);
  });

  it('rejects non-numeric and missing ids', () => {
    expect(courseIdParamSchema.safeParse({ courseId: 'abc' }).success).toBe(false);
    expect(courseIdParamSchema.safeParse({}).success).toBe(false);
  });

  it('rejects fractional ids', () => {
    expect(courseIdParamSchema.safeParse({ courseId: 1.5 }).success).toBe(false);
  });
});
