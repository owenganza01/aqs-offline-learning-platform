import { describe, it, expect } from 'vitest';
import {
  COVER_THUMBNAIL_PREFIX,
  DEFAULT_THUMBNAIL_TINT,
  parseCoverDocumentId,
  isStoredCoverThumbnail,
  hasRealThumbnail,
} from './course-cover.js';

// The `doc:<uuid>` contract is what lets a course cover be stored as a document
// row while the client still distinguishes it from a placeholder tint. These
// tests pin the pure parsing half of it (DEF-004); the client calls
// `hasRealThumbnail` to decide between the cover endpoint and the tint
// placeholder, so a regression here would silently blank out every cover.

describe('parseCoverDocumentId', () => {
  it('extracts the document id from a stored cover reference', () => {
    expect(parseCoverDocumentId(`${COVER_THUMBNAIL_PREFIX}abc-123`)).toBe('abc-123');
  });

  it('returns null for tint placeholders, data URLs and external URLs', () => {
    expect(parseCoverDocumentId(DEFAULT_THUMBNAIL_TINT)).toBeNull();
    expect(parseCoverDocumentId('teal')).toBeNull();
    expect(parseCoverDocumentId('data:image/png;base64,AAAA')).toBeNull();
    expect(parseCoverDocumentId('https://example.com/cover.png')).toBeNull();
  });

  it('returns null for empty, null, undefined and bare-prefix values', () => {
    expect(parseCoverDocumentId(null)).toBeNull();
    expect(parseCoverDocumentId(undefined)).toBeNull();
    expect(parseCoverDocumentId('')).toBeNull();
    expect(parseCoverDocumentId(COVER_THUMBNAIL_PREFIX)).toBeNull();
  });
});

describe('isStoredCoverThumbnail', () => {
  it('is true only for doc:-prefixed values', () => {
    expect(isStoredCoverThumbnail(`${COVER_THUMBNAIL_PREFIX}abc-123`)).toBe(true);
    expect(isStoredCoverThumbnail('teal')).toBe(false);
    expect(isStoredCoverThumbnail('https://example.com/cover.png')).toBe(false);
  });
});

describe('hasRealThumbnail', () => {
  it('accepts stored covers, external URLs and data URLs', () => {
    expect(hasRealThumbnail(`${COVER_THUMBNAIL_PREFIX}abc-123`)).toBe(true);
    expect(hasRealThumbnail('https://example.com/cover.png')).toBe(true);
    expect(hasRealThumbnail('data:image/png;base64,AAAA')).toBe(true);
  });

  it('rejects tint placeholders and empty values', () => {
    expect(hasRealThumbnail(DEFAULT_THUMBNAIL_TINT)).toBe(false);
    expect(hasRealThumbnail('teal')).toBe(false);
    expect(hasRealThumbnail(null)).toBe(false);
    expect(hasRealThumbnail(undefined)).toBe(false);
    expect(hasRealThumbnail('')).toBe(false);
  });
});
