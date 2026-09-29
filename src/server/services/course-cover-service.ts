// src/server/services/course-cover-service.ts
// Course cover images (DEF-004).
//
// Covers are stored as a regular document row (lessonId = null) and referenced
// from the existing courses.thumbnail TEXT column as `doc:<uuid>`. The TEXT
// column already had to hold a gradient code / data URL / external URL, so
// reusing it for a document pointer avoids a schema migration while keeping the
// value self-describing.
//
// Access deliberately does NOT go through checkDocumentAccess: that helper
// requires a lesson and would reject every learner because a course cover has
// no lesson. Instead the document must be proven to be the current cover of the
// requested course, which is a stronger check than ownership of a lesson.

import { db } from '../../db/index.js';
import * as schema from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { documentStorage, type StoredDocumentMetadata } from '../providers/document-storage.js';
import { COVER_THUMBNAIL_PREFIX, DEFAULT_THUMBNAIL_TINT, parseCoverDocumentId } from '../../lib/course-cover.js';

export { COVER_THUMBNAIL_PREFIX, DEFAULT_THUMBNAIL_TINT, parseCoverDocumentId };

export async function getCourseThumbnail(courseId: number): Promise<string | null> {
  const rows = await db
    .select({ thumbnail: schema.courses.thumbnail })
    .from(schema.courses)
    .where(eq(schema.courses.id, courseId))
    .limit(1);

  return rows[0]?.thumbnail ?? null;
}

/**
 * Resolves the document backing a course cover, or null when the course has no
 * stored cover (tint code / data URL / external URL) or the referenced document
 * has since been removed. Callers must treat null as "render the fallback".
 */
export async function getCourseCoverDocument(
  courseId: number,
): Promise<{ data: Buffer; metadata: StoredDocumentMetadata } | null> {
  const documentId = parseCoverDocumentId(await getCourseThumbnail(courseId));
  if (!documentId) return null;

  return documentStorage.download(documentId);
}

/**
 * Uploads a new cover for a course and repoints courses.thumbnail at it.
 *
 * The previous cover document is deleted only after the new pointer is
 * committed, so a failure part-way through leaves the old cover intact rather
 * than orphaning the course. Deletion failures are logged and swallowed —
 * a stale row in `documents` is far better than a course with no cover.
 */
export async function setCourseCoverImage(
  courseId: number,
  file: { originalname: string; mimetype: string; buffer: Buffer; size: number },
  uploadedBy: number | null,
): Promise<string> {
  const previousThumbnail = await getCourseThumbnail(courseId);
  const previousDocumentId = parseCoverDocumentId(previousThumbnail);

  const stored = await documentStorage.upload(file.buffer, {
    lessonId: null,
    originalFileName: file.originalname,
    storedFileName: `cover-${courseId}-${storedSafeName(file.originalname)}`,
    mimeType: file.mimetype,
    fileSize: file.size,
    uploadedBy,
    uploadedByName: null,
  });

  await db
    .update(schema.courses)
    .set({ thumbnail: `${COVER_THUMBNAIL_PREFIX}${stored.id}` })
    .where(eq(schema.courses.id, courseId));

  if (previousDocumentId && previousDocumentId !== stored.id) {
    try {
      await documentStorage.delete(previousDocumentId);
    } catch (e) {
      console.warn(`Failed to delete previous course cover ${previousDocumentId} for course ${courseId}:`, e);
    }
  }

  return `${COVER_THUMBNAIL_PREFIX}${stored.id}`;
}

/**
 * Drops a stored cover and falls the course back to its tint placeholder.
 * Returns the restored thumbnail, or null when the course was not found.
 */
export async function clearCourseCoverImage(courseId: number): Promise<string | null> {
  const current = await getCourseThumbnail(courseId);
  if (current === null) return null;

  const documentId = parseCoverDocumentId(current);
  await db.update(schema.courses).set({ thumbnail: DEFAULT_THUMBNAIL_TINT }).where(eq(schema.courses.id, courseId));

  if (documentId) {
    try {
      await documentStorage.delete(documentId);
    } catch (e) {
      console.warn(`Failed to delete course cover ${documentId} for course ${courseId}:`, e);
    }
  }

  return DEFAULT_THUMBNAIL_TINT;
}

// Keeps the stored filename filesystem/log friendly without trusting client input.
function storedSafeName(originalName: string): string {
  const base = originalName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-64);
  return base.length > 0 ? base : 'cover';
}
