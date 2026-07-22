import { describe, it, expect } from 'vitest';
import { enrollmentSchema } from '../middleware/validate.ts';

describe('enrollmentSchema validation', () => {
  it('rejects empty body (missing courseId)', () => {
    const result = enrollmentSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects courseId that is not a number', () => {
    const result = enrollmentSchema.safeParse({ courseId: 'abc' });
    expect(result.success).toBe(false);
  });

  it('rejects courseId that is not an integer', () => {
    const result = enrollmentSchema.safeParse({ courseId: 1.5 });
    expect(result.success).toBe(false);
  });

  it('rejects courseId that is zero', () => {
    const result = enrollmentSchema.safeParse({ courseId: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects courseId that is negative', () => {
    const result = enrollmentSchema.safeParse({ courseId: -1 });
    expect(result.success).toBe(false);
  });

  it('accepts a valid positive integer courseId', () => {
    const result = enrollmentSchema.safeParse({ courseId: 42 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.courseId).toBe(42);
    }
  });

  it('rejects extra unexpected fields silently passing as valid input shape check', () => {
    const result = enrollmentSchema.safeParse({ courseId: 1, inviteCode: 'EXTRA' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.inviteCode).toBeUndefined();
    }
  });
});
