import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { db } from '../../db/index.ts';
import * as schema from '../../db/schema.ts';
import { AuthRequest, checkDocumentAccess } from '../../middleware/auth.ts';
import { documentStorage } from '../providers/document-storage.ts';

export async function uploadDocument(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file provided.' });
      return;
    }

    const { lessonId } = req.body;
    const parsedLessonId = lessonId ? parseInt(lessonId) : null;
    if (lessonId && isNaN(parsedLessonId!)) {
      res.status(400).json({ error: 'Invalid lessonId.' });
      return;
    }

    const doc = await documentStorage.upload(req.file.buffer, {
      lessonId: parsedLessonId && parsedLessonId > 0 ? parsedLessonId : null,
      originalFileName: req.file.originalname,
      storedFileName: `${randomUUID()}_${req.file.originalname}`,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      uploadedBy: req.dbUser!.id,
    });

    res.status(201).json({
      id: doc.id,
      originalFileName: doc.originalFileName,
      mimeType: doc.mimeType,
      fileSize: doc.fileSize,
      url: `/api/documents/${doc.id}/file`,
    });
  } catch (err: unknown) {
    if (err instanceof Error && (err as any).code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: 'File too large. Maximum size is 10MB.' });
      return;
    }
    console.error('Document upload error:', err);
    res.status(500).json({ error: 'Upload failed.' });
  }
}

export async function getDocumentMetadata(req: AuthRequest, res: Response): Promise<void> {
  try {
    const meta = await documentStorage.getMetadata(req.params.id);
    if (!meta) {
      res.status(404).json({ error: 'Document not found.' });
      return;
    }
    if (!(await checkDocumentAccess(meta.lessonId, req.dbUser!))) {
      res.status(403).json({ error: 'Forbidden: You do not have access to this document.' });
      return;
    }
    res.json(meta);
  } catch (err: unknown) {
    console.error('Document metadata error:', err);
    res.status(500).json({ error: 'Failed to retrieve document.' });
  }
}

export async function downloadDocument(req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await documentStorage.download(req.params.id);
    if (!result) {
      res.status(404).json({ error: 'Document not found.' });
      return;
    }
    if (!(await checkDocumentAccess(result.metadata.lessonId, req.dbUser!))) {
      res.status(403).json({ error: 'Forbidden: You do not have access to this document.' });
      return;
    }

    res.setHeader('Content-Type', result.metadata.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(result.metadata.originalFileName)}"`);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(result.data);
  } catch (err: unknown) {
    console.error('Document download error:', err);
    res.status(500).json({ error: 'Failed to retrieve document.' });
  }
}

export async function deleteDocument(req: AuthRequest, res: Response): Promise<void> {
  try {
    const deleted = await documentStorage.delete(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Document not found.' });
      return;
    }
    res.json({ success: true });
  } catch (err: unknown) {
    console.error('Document delete error:', err);
    res.status(500).json({ error: 'Failed to delete document.' });
  }
}
