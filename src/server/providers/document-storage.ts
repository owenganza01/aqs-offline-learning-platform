// src/server/providers/document-storage.ts
// Document storage abstraction layer.
// Currently backed by PostgreSQL (base64 in TEXT column).
// When Firebase Storage becomes available, implement FirebaseStorageProvider
// and swap the singleton at the bottom of this file.

import { randomUUID } from 'crypto';
import { db } from '../../db/index.ts';
import * as schema from '../../db/schema.ts';
import { eq } from 'drizzle-orm';
import { R2StorageProvider } from './r2-storage.ts';

export interface StoredDocumentMetadata {
  id: string;
  lessonId: number | null;
  originalFileName: string;
  storedFileName: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: Date;
  uploadedBy: number;
}

export interface DocumentStorageProvider {
  upload(file: Buffer, metadata: Omit<StoredDocumentMetadata, 'id' | 'uploadedAt'>): Promise<StoredDocumentMetadata>;
  download(documentId: string): Promise<{ data: Buffer; metadata: StoredDocumentMetadata } | null>;
  delete(documentId: string): Promise<boolean>;
  deleteByLessonId(lessonId: number): Promise<number>;
  getMetadata(documentId: string): Promise<StoredDocumentMetadata | null>;
  backfillLessonId(documentId: string, lessonId: number): Promise<boolean>;
  getSignedUrl?(documentId: string): Promise<string | null>;
}

// ---------------------------------------------------------------------------
// PostgreSQL / database-backed implementation
// ---------------------------------------------------------------------------

export class DatabaseStorageProvider implements DocumentStorageProvider {
  async upload(
    file: Buffer,
    metadata: Omit<StoredDocumentMetadata, 'id' | 'uploadedAt'>,
  ): Promise<StoredDocumentMetadata> {
    const id = randomUUID();
    const fileData = file.toString('base64');

    await db.insert(schema.documents).values({
      id,
      lessonId: metadata.lessonId,
      originalFileName: metadata.originalFileName,
      storedFileName: metadata.storedFileName,
      mimeType: metadata.mimeType,
      fileSize: metadata.fileSize,
      uploadedBy: metadata.uploadedBy,
      fileData,
    });

    return { ...metadata, id, uploadedAt: new Date() };
  }

  async download(documentId: string): Promise<{ data: Buffer; metadata: StoredDocumentMetadata } | null> {
    const rows = await db.select().from(schema.documents).where(eq(schema.documents.id, documentId));

    if (rows.length === 0) return null;

    const row = rows[0];
    const data = Buffer.from(row.fileData, 'base64');

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
    const deleted = await db.delete(schema.documents).where(eq(schema.documents.id, documentId)).returning();
    return deleted.length > 0;
  }

  async deleteByLessonId(lessonId: number): Promise<number> {
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

function createStorageProvider(): DocumentStorageProvider {
  const provider = (process.env.STORAGE_PROVIDER || 'database').toLowerCase();

  if (provider === 'r2') {
    const instance = new R2StorageProvider();
    console.log('Storage provider initialized', {
      provider: 'Cloudflare R2',
      bucket: process.env.R2_BUCKET || '(not set)',
    });
    return instance;
  }

  if (provider !== 'database') {
    throw new Error(`Invalid STORAGE_PROVIDER="${process.env.STORAGE_PROVIDER}". Must be "database" or "r2".`);
  }

  console.log('Storage provider initialized', { provider: 'Database' });
  return new DatabaseStorageProvider();
}

export const documentStorage: DocumentStorageProvider = createStorageProvider();
