import { describe, it, expect } from 'vitest';
import { lessonSchema } from './validate.js';

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
