// src/lib/course-cover.ts
// Shared, dependency-free helpers for course cover thumbnails (DEF-004).
//
// Kept separate from the server service so the client can recognise a stored
// cover reference without importing the database/storage layer into the browser
// bundle. The server service re-exports these for convenience.

/** Marker prefix distinguishing a server-stored cover from a legacy thumbnail. */
export const COVER_THUMBNAIL_PREFIX = 'doc:';

/** Fallback tint stored in courses.thumbnail when a course has no cover image. */
export const DEFAULT_THUMBNAIL_TINT = 'teal';

/**
 * Extracts the document id from a `doc:<uuid>` thumbnail value, or null when
 * the thumbnail is a tint code, data URL or external image URL.
 */
export function parseCoverDocumentId(thumbnail: string | null | undefined): string | null {
  if (!thumbnail || !thumbnail.startsWith(COVER_THUMBNAIL_PREFIX)) return null;
  const id = thumbnail.slice(COVER_THUMBNAIL_PREFIX.length).trim();
  return id.length > 0 ? id : null;
}

/** True when the thumbnail references a server-stored course cover. */
export function isStoredCoverThumbnail(thumbnail: string | null | undefined): boolean {
  return parseCoverDocumentId(thumbnail) !== null;
}

/**
 * True when the thumbnail is a real image rather than a placeholder tint code.
 * Covers are served from an authenticated endpoint, so the caller must be
 * signed in for a `doc:` value to resolve.
 */
export function hasRealThumbnail(thumbnail: string | null | undefined): boolean {
  if (!thumbnail) return false;
  return thumbnail.startsWith('http') || thumbnail.startsWith('data:') || thumbnail.startsWith(COVER_THUMBNAIL_PREFIX);
}
