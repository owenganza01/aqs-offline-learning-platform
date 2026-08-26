import { Application, RequestHandler } from 'express';
import multer from 'multer';
import { requireAuth, requireInstructorOrAdmin, requireAuthOrQueryToken } from '../../middleware/auth.js';
import { ALL_MIME_TYPE_SET, MAX_UPLOAD_SIZE_BYTES } from '../../lib/mime-types.js';
import {
  uploadDocument,
  getDocumentMetadata,
  downloadDocument,
  deleteDocument,
} from '../controllers/document-controller.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALL_MIME_TYPE_SET.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

export interface DocumentRouteDeps {
  uploadRateLimit: RequestHandler;
}

export function registerDocumentRoutes(app: Application, deps: DocumentRouteDeps): void {
  app.post(
    '/api/admin/documents/upload',
    requireAuth,
    requireInstructorOrAdmin,
    deps.uploadRateLimit,
    upload.single('file'),
    uploadDocument,
  );

  app.get('/api/documents/:id', requireAuth, getDocumentMetadata);

  app.get('/api/documents/:id/file', requireAuthOrQueryToken, downloadDocument);

  app.delete('/api/admin/documents/:id', requireAuth, requireInstructorOrAdmin, deleteDocument);
}
