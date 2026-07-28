import { randomUUID } from 'crypto';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { db } from '../../db/index.ts';
import * as schema from '../../db/schema.ts';
import { eq } from 'drizzle-orm';
import { DocumentStorageProvider, StoredDocumentMetadata } from './document-storage.ts';

function createR2Client(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('R2StorageProvider: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY must be set');
  }

  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function getBucket(): string {
  const bucket = process.env.R2_BUCKET;
  if (!bucket) throw new Error('R2StorageProvider: R2_BUCKET must be set');
  return bucket;
}

export class R2StorageProvider implements DocumentStorageProvider {
  private client: S3Client;
  private bucket: string;

  constructor() {
    this.client = createR2Client();
    this.bucket = getBucket();
  }

  async upload(
    file: Buffer,
    metadata: Omit<StoredDocumentMetadata, 'id' | 'uploadedAt'>,
  ): Promise<StoredDocumentMetadata> {
    const id = randomUUID();
    const ext = metadata.originalFileName.includes('.')
      ? metadata.originalFileName.substring(metadata.originalFileName.lastIndexOf('.'))
      : '';
    const storedFileName = `${id}${ext}`;

    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: storedFileName,
          Body: file,
          ContentType: metadata.mimeType,
        }),
      );
    } catch (err) {
      console.error('R2 upload failed', {
        operation: 'upload',
        documentId: id,
        storedFileName,
        bucket: this.bucket,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

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

    try {
      const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: row.storedFileName }));
      const data = response.Body ? Buffer.from(await response.Body.transformToByteArray()) : Buffer.alloc(0);

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
    } catch (err) {
      console.error('R2 download failed, falling back to base64', {
        operation: 'download',
        documentId,
        storedFileName: row.storedFileName,
        bucket: this.bucket,
        hasBase64Fallback: !!row.fileData,
        error: err instanceof Error ? err.message : String(err),
      });
      if (row.fileData) {
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
      return null;
    }
  }

  async getSignedUrl(documentId: string): Promise<string | null> {
    const rows = await db
      .select({ storedFileName: schema.documents.storedFileName })
      .from(schema.documents)
      .where(eq(schema.documents.id, documentId));
    if (rows.length === 0) return null;

    const storedFileName = rows[0].storedFileName;
    if (!storedFileName) return null;

    try {
      const url = await getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: storedFileName }), {
        expiresIn: 3600,
      });
      return url;
    } catch (err) {
      console.error('R2 getSignedUrl failed', {
        operation: 'getSignedUrl',
        documentId,
        storedFileName,
        bucket: this.bucket,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  async delete(documentId: string): Promise<boolean> {
    const rows = await db
      .select({ storedFileName: schema.documents.storedFileName })
      .from(schema.documents)
      .where(eq(schema.documents.id, documentId));

    if (rows.length > 0 && rows[0].storedFileName) {
      try {
        await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: rows[0].storedFileName }));
      } catch (err) {
        console.error('R2 delete object failed', {
          operation: 'delete',
          documentId,
          storedFileName: rows[0].storedFileName,
          bucket: this.bucket,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const deleted = await db.delete(schema.documents).where(eq(schema.documents.id, documentId)).returning();
    return deleted.length > 0;
  }

  async deleteByLessonId(lessonId: number): Promise<number> {
    const rows = await db
      .select({ storedFileName: schema.documents.storedFileName })
      .from(schema.documents)
      .where(eq(schema.documents.lessonId, lessonId));

    const keys = rows.map((r) => r.storedFileName).filter(Boolean);
    if (keys.length > 0) {
      for (const key of keys) {
        try {
          await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
        } catch (err) {
          console.error('R2 deleteByLessonId object failed', {
            operation: 'deleteByLessonId',
            lessonId,
            storedFileName: key,
            bucket: this.bucket,
            error: err instanceof Error ? err.message : String(err),
          });
        }
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
