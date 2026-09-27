import { describe, it, expect } from 'vitest';
import {
  ALLOWED_SLIDE_MIME_TYPE_SET,
  ALLOWED_SLIDE_EXTENSIONS,
  MAX_UPLOAD_SIZE_BYTES,
  ALL_MIME_TYPE_SET,
  VIDEO_MIME_TYPES,
  ALLOWED_IMAGE_MIME_TYPE_SET,
  ALLOWED_IMAGE_EXTENSIONS,
  MAX_COVER_UPLOAD_SIZE_BYTES,
} from './mime-types.js';

describe('MIME type constants', () => {
  it('includes core document types', () => {
    expect(ALLOWED_SLIDE_MIME_TYPE_SET.has('application/pdf')).toBe(true);
    expect(ALLOWED_SLIDE_MIME_TYPE_SET.has('application/vnd.ms-powerpoint')).toBe(true);
    expect(
      ALLOWED_SLIDE_MIME_TYPE_SET.has('application/vnd.openxmlformats-officedocument.presentationml.presentation'),
    ).toBe(true);
  });

  it('does not include video types in slide MIME set', () => {
    expect(ALLOWED_SLIDE_MIME_TYPE_SET.has('image/png')).toBe(false);
    expect(ALLOWED_SLIDE_MIME_TYPE_SET.has('video/mp4')).toBe(false);
  });

  it('MAX_UPLOAD_SIZE_BYTES is 100 MB', () => {
    expect(MAX_UPLOAD_SIZE_BYTES).toBe(100 * 1024 * 1024);
  });

  it('ALLOWED_SLIDE_EXTENSIONS contains expected extensions', () => {
    expect(ALLOWED_SLIDE_EXTENSIONS).toContain('.pdf');
    expect(ALLOWED_SLIDE_EXTENSIONS).toContain('.pptx');
  });

  it('includes video MIME types in ALL_MIME_TYPE_SET', () => {
    expect(ALL_MIME_TYPE_SET.has('video/mp4')).toBe(true);
    expect(ALL_MIME_TYPE_SET.has('video/webm')).toBe(true);
    expect(ALL_MIME_TYPE_SET.has('video/ogg')).toBe(true);
  });

  it('VIDEO_MIME_TYPES maps correctly', () => {
    expect(VIDEO_MIME_TYPES['video/mp4']).toBe('mp4');
    expect(VIDEO_MIME_TYPES['video/webm']).toBe('webm');
    expect(VIDEO_MIME_TYPES['video/ogg']).toBe('ogv');
  });
});

// Course cover images (DEF-004).
describe('ALLOWED_IMAGE_MIME_TYPE_SET', () => {
  it('allows the cover image formats the client advertises', () => {
    expect(ALLOWED_IMAGE_MIME_TYPE_SET.has('image/jpeg')).toBe(true);
    expect(ALLOWED_IMAGE_MIME_TYPE_SET.has('image/png')).toBe(true);
    expect(ALLOWED_IMAGE_MIME_TYPE_SET.has('image/webp')).toBe(true);
  });

  it('rejects non-image types', () => {
    expect(ALLOWED_IMAGE_MIME_TYPE_SET.has('application/pdf')).toBe(false);
    expect(ALLOWED_IMAGE_MIME_TYPE_SET.has('video/mp4')).toBe(false);
    expect(ALLOWED_IMAGE_MIME_TYPE_SET.has('image/gif')).toBe(false);
    expect(ALLOWED_IMAGE_MIME_TYPE_SET.has('image/svg+xml')).toBe(false);
  });

  it('stays out of ALL_MIME_TYPE_SET so lesson uploads are unaffected', () => {
    // Regression guard: folding images into ALL_MIME_TYPE_SET would let an image
    // be uploaded as a lesson "video"/"slide", where it cannot be rendered.
    expect(ALL_MIME_TYPE_SET.has('image/jpeg')).toBe(false);
    expect(ALL_MIME_TYPE_SET.has('image/png')).toBe(false);
    expect(ALL_MIME_TYPE_SET.has('image/webp')).toBe(false);
  });

  it('caps cover uploads well below the lesson upload budget', () => {
    expect(MAX_COVER_UPLOAD_SIZE_BYTES).toBe(5 * 1024 * 1024);
    expect(MAX_COVER_UPLOAD_SIZE_BYTES).toBeLessThan(MAX_UPLOAD_SIZE_BYTES);
  });

  it('ALLOWED_IMAGE_EXTENSIONS matches the accepted MIME types', () => {
    expect(ALLOWED_IMAGE_EXTENSIONS).toContain('.jpg');
    expect(ALLOWED_IMAGE_EXTENSIONS).toContain('.jpeg');
    expect(ALLOWED_IMAGE_EXTENSIONS).toContain('.png');
    expect(ALLOWED_IMAGE_EXTENSIONS).toContain('.webp');
  });
});
