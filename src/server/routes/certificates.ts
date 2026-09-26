import { Application, RequestHandler } from 'express';
import multer from 'multer';
import { requireAuth } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import {
  getCertificateConfig,
  saveCertificateConfig,
  getCertificateStatus,
  verifyCertificate,
  uploadCertificateTemplate,
  removeCertificateTemplate,
  downloadCertificate,
} from '../controllers/certificate-controller.js';
import { z } from 'zod';

const templateUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are supported as certificate templates.'));
    }
  },
});

const certificateConfigSchema = z.object({
  enabled: z.boolean().optional(),
  title: z.string().min(1).max(200).optional(),
  issuer: z.string().min(1).max(200).optional(),
  requireCourseCompletion: z.boolean().optional(),
  requireAssessment: z.boolean().optional(),
  minAssessmentScore: z.number().int().min(0).max(100).nullable().optional(),
});

export interface CertificateRouteDeps {
  certificateRateLimit: RequestHandler;
  publicVerifyRateLimit: RequestHandler;
}

export function registerCertificateRoutes(app: Application, deps: CertificateRouteDeps): void {
  // Admin/instructor routes
  app.get('/api/courses/:courseId/certificate-config', requireAuth, deps.certificateRateLimit, getCertificateConfig);

  app.put(
    '/api/courses/:courseId/certificate-config',
    requireAuth,
    deps.certificateRateLimit,
    validateBody(certificateConfigSchema),
    saveCertificateConfig,
  );

  // Template upload & remove
  app.post(
    '/api/courses/:courseId/certificate-template',
    requireAuth,
    deps.certificateRateLimit,
    templateUpload.single('file'),
    uploadCertificateTemplate,
  );

  app.delete(
    '/api/courses/:courseId/certificate-template',
    requireAuth,
    deps.certificateRateLimit,
    removeCertificateTemplate,
  );

  // Learner certificate status
  app.get('/api/courses/:courseId/certificate-status', requireAuth, deps.certificateRateLimit, getCertificateStatus);

  // Public certificate verification (no auth required)
  app.get('/api/certificates/verify/:verificationCode', deps.publicVerifyRateLimit, verifyCertificate);

  // Download personalized certificate PDF (no auth required if verificationCode is known)
  app.get('/api/certificates/download/:verificationCode', deps.publicVerifyRateLimit, downloadCertificate);
}
