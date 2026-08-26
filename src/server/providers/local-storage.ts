// src/server/providers/local-storage.ts
// File-system-backed document storage.
// Replaces base64-in-Postgres for new uploads.
// Falls back to reading from the DB file_data column for legacy documents.

import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { db } from '../../db/index.js';
import * as schema from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { DocumentStorageProvider, StoredDocumentMetadata } from './document-storage.js';

const STORAGE_DIR = process.env.FILE_STORAGE_DIR || path.join(process.cwd(), 'uploads');

async function ensureStorageDir(): Promise<void> {
  await fs.mkdir(STORAGE_DIR, { recursive: true });
}

export class LocalStorageProvider implements DocumentStorageProvider {
  async upload(
    file: Buffer,
    metadata: Omit<StoredDocumentMetadata, 'id' | 'uploadedAt'>,
  ): Promise<StoredDocumentMetadata> {
    const id = randomUUID();
    const ext = path.extname(metadata.originalFileName);
    const storedFileName = `${id}${ext}`;

    await ensureStorageDir();
    await fs.writeFile(path.join(STORAGE_DIR, storedFileName), file);

    // Store metadata in DB (file_data column gets empty string — file is on disk)
    await db.insert(schema.documents).values({
      id,
      lessonId: metadata.lessonId,
      originalFileName: metadata.originalFileName,
      storedFileName,
      mimeType: metadata.mimeType,
      fileSize: metadata.fileSize,
      uploadedBy: metadata.uploadedBy,
      fileData: '',
    });

    return { ...metadata, id, storedFileName, uploadedAt: new Date() };
  }

  async download(documentId: string): Promise<{ data: Buffer; metadata: StoredDocumentMetadata } | null> {
    const rows = await db.select().from(schema.documents).where(eq(schema.documents.id, documentId));
    if (rows.length === 0) return null;

    const row = rows[0];
    let data: Buffer;

    // Try disk first
    const diskPath = path.join(STORAGE_DIR, row.storedFileName);
    try {
      data = await fs.readFile(diskPath);
    } catch {
      // Fallback: legacy base64 data in DB
      if (row.fileData) {
        data = Buffer.from(row.fileData, 'base64');
      } else {
        return null;
      }
    }

    return {
      data,
      metadata: {
        id: row.id,
        lessonId: row.lessonId,
        originalFileName: row.originalFileName,
        storedFileName: row.storedFileName,
        mimeType: row.mimeType,
        fileSize: row.fileSize,
        uploadedAt: row.uploadedAt,
        uploadedBy: row.uploadedBy,
      },
    };
  }

  async delete(documentId: string): Promise<boolean> {
    // Try to delete from disk first
    const rows = await db
      .select({ storedFileName: schema.documents.storedFileName })
      .from(schema.documents)
      .where(eq(schema.documents.id, documentId));
    if (rows.length > 0) {
      try {
        await fs.unlink(path.join(STORAGE_DIR, rows[0].storedFileName));
      } catch {
        // File may not exist on disk (legacy base64) — ignore
      }
    }

    const deleted = await db.delete(schema.documents).where(eq(schema.documents.id, documentId)).returning();
    return deleted.length > 0;
  }

  async deleteByLessonId(lessonId: number): Promise<number> {
    // Delete files from disk
    const rows = await db
      .select({ storedFileName: schema.documents.storedFileName })
      .from(schema.documents)
      .where(eq(schema.documents.lessonId, lessonId));
    for (const row of rows) {
      try {
        await fs.unlink(path.join(STORAGE_DIR, row.storedFileName));
      } catch {
        // Ignore — may be legacy base64
      }
    }

    const deleted = await db.delete(schema.documents).where(eq(schema.documents.lessonId, lessonId)).returning();
    return deleted.length;
  }

  async backfillLessonId(documentId: string, lessonId: number): Promise<boolean> {
    const updated = await db
      .update(schema.documents)
      .set({ lessonId })
      .where(eq(schema.documents.id, documentId))
      .returning();
    return updated.length > 0;
  }

  async getMetadata(documentId: string): Promise<StoredDocumentMetadata | null> {
    const rows = await db
      .select({
        id: schema.documents.id,
        lessonId: schema.documents.lessonId,
        originalFileName: schema.documents.originalFileName,
        storedFileName: schema.documents.storedFileName,
        mimeType: schema.documents.mimeType,
        fileSize: schema.documents.fileSize,
        uploadedAt: schema.documents.uploadedAt,
        uploadedBy: schema.documents.uploadedBy,
      })
      .from(schema.documents)
      .where(eq(schema.documents.id, documentId));

    if (rows.length === 0) return null;

    const row = rows[0];
    return {
      id: row.id,
      lessonId: row.lessonId,
      originalFileName: row.originalFileName,
      storedFileName: row.storedFileName,
      mimeType: row.mimeType,
      fileSize: row.fileSize,
      uploadedAt: row.uploadedAt,
      uploadedBy: row.uploadedBy,
    };
  }
}
