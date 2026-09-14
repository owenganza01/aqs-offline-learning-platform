import { Response } from 'express';
import { randomUUID } from 'crypto';
import { AuthRequest, checkDocumentAccess } from '../../middleware/auth.js';
import { documentStorage } from '../providers/document-storage.js';
import * as lessonAdminService from '../services/lesson-admin-service.js';
import * as courseAdminService from '../services/course-admin-service.js';

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

    if (parsedLessonId && parsedLessonId > 0 && req.dbUser!.role !== 'admin') {
      const lessonCourseId = await lessonAdminService.getLessonCourseId(parsedLessonId);
      if (lessonCourseId === null) {
        res.status(404).json({ error: 'Lesson not found.' });
        return;
      }
      const course = await courseAdminService.getCourseById(lessonCourseId);
      if (!course || course.createdBy !== req.dbUser!.id) {
        res.status(403).json({ error: 'Forbidden: You can only attach documents to lessons in your own courses' });
        return;
      }
    }

    const doc = await documentStorage.upload(req.file.buffer, {
      lessonId: parsedLessonId && parsedLessonId > 0 ? parsedLessonId : null,
      originalFileName: req.file.originalname,
      storedFileName: `${randomUUID()}_${req.file.originalname}`,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      uploadedBy: req.dbUser!.id,
      uploadedByName: req.dbUser!.name || req.dbUser!.email,
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
    // Access check: get metadata first
    const meta = await documentStorage.getMetadata(req.params.id);
    if (!meta) {
      res.status(404).json({ error: 'Document not found.' });
      return;
    }
    if (!(await checkDocumentAccess(meta.lessonId, req.dbUser!))) {
      res.status(403).json({ error: 'Forbidden: You do not have access to this document.' });
      return;
    }

    // If provider supports signed URLs, redirect (enables native video streaming)
    if (documentStorage.getSignedUrl) {
      const url = await documentStorage.getSignedUrl(req.params.id);
      if (url) {
        res.redirect(302, url);
        return;
      }
    }

    // Fallback: buffer download (legacy base64 or non-video files)
    const result = await documentStorage.download(req.params.id);
    if (!result) {
      res.status(404).json({ error: 'Document not found.' });
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
    const meta = await documentStorage.getMetadata(req.params.id);
    if (!meta) {
      res.status(404).json({ error: 'Document not found.' });
      return;
    }

    const isAdmin = req.dbUser!.role === 'admin';

    let attachedCourseId: number | null = null;
    if (meta.lessonId != null) {
      attachedCourseId = await lessonAdminService.getLessonCourseId(meta.lessonId);
    }

    if (attachedCourseId != null) {
      // Attached to a live lesson -> only that course's current owner, or an admin.
      if (!isAdmin) {
        const course = await courseAdminService.getCourseById(attachedCourseId);
        if (!course) {
          res.status(404).json({ error: 'Course not found.' });
          return;
        }
        if (course.createdBy !== req.dbUser!.id) {
          res.status(403).json({ error: 'Forbidden: You can only delete documents in your own courses' });
          return;
        }
      }
    } else {
      // Orphaned (never attached, or its lesson no longer exists) -> the uploader, or an admin.
      // uploadedBy === null (wiped/legacy uploader) on an orphaned document -> admin only.
      if (!isAdmin && meta.uploadedBy !== req.dbUser!.id) {
        res.status(403).json({ error: 'Forbidden: You can only delete your own uploaded documents' });
        return;
      }
    }

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
