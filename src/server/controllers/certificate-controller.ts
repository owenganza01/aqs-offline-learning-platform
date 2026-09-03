import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.js';
import * as certificateService from '../services/certificate-service.js';
import * as courseAdminService from '../services/course-admin-service.js';

export async function getCertificateConfig(req: AuthRequest, res: Response): Promise<void> {
  try {
    const courseId = parseInt(req.params.courseId);
    if (isNaN(courseId)) {
      res.status(400).json({ error: 'Invalid course ID' });
      return;
    }

    // Check ownership: admin can access any course, instructor only their own
    const course = await courseAdminService.getCourseById(courseId);
    if (!course) {
      res.status(404).json({ error: 'Course not found' });
      return;
    }
    if (req.dbUser!.role !== 'admin' && course.createdBy !== req.dbUser!.id) {
      res.status(403).json({ error: 'Forbidden: You can only configure certificates for your own courses' });
      return;
    }

    const config = await certificateService.getCertificateConfig(courseId);
    res.json(config || { enabled: false });
  } catch (error: unknown) {
    console.error('Get certificate config error:', error);
    res.status(500).json({ error: 'Failed to get certificate configuration.' });
  }
}

export async function saveCertificateConfig(req: AuthRequest, res: Response): Promise<void> {
  try {
    const courseId = parseInt(req.params.courseId);
    if (isNaN(courseId)) {
      res.status(400).json({ error: 'Invalid course ID' });
      return;
    }

    // Check ownership
    const course = await courseAdminService.getCourseById(courseId);
    if (!course) {
      res.status(404).json({ error: 'Course not found' });
      return;
    }
    if (req.dbUser!.role !== 'admin' && course.createdBy !== req.dbUser!.id) {
      res.status(403).json({ error: 'Forbidden: You can only configure certificates for your own courses' });
      return;
    }

    const { enabled, title, issuer, requireCourseCompletion, requireAssessment, minAssessmentScore } = req.body;

    await certificateService.saveCertificateConfig(courseId, {
      enabled: enabled ?? false,
      title: title ?? 'Certificate of Completion',
      issuer: issuer ?? 'AQS Learning Platform',
      requireCourseCompletion: requireCourseCompletion ?? true,
      requireAssessment: requireAssessment ?? true,
      minAssessmentScore: minAssessmentScore ?? null,
    });

    res.json({ success: true });
  } catch (error: unknown) {
    console.error('Save certificate config error:', error);
    res.status(500).json({ error: 'Failed to save certificate configuration.' });
  }
}

export async function getCertificateStatus(req: AuthRequest, res: Response): Promise<void> {
  try {
    const courseId = parseInt(req.params.courseId);
    if (isNaN(courseId)) {
      res.status(400).json({ error: 'Invalid course ID' });
      return;
    }

    const status = await certificateService.getCertificateStatus(req.dbUser!.id, courseId);
    res.json(status);
  } catch (error: unknown) {
    console.error('Get certificate status error:', error);
    res.status(500).json({ error: 'Failed to get certificate status.' });
  }
}

export async function verifyCertificate(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { verificationCode } = req.params;
    if (!verificationCode) {
      res.status(400).json({ error: 'Verification code is required' });
      return;
    }

    const result = await certificateService.verifyCertificate(verificationCode);
    res.json(result);
  } catch (error: unknown) {
    console.error('Verify certificate error:', error);
    res.status(500).json({ error: 'Failed to verify certificate.' });
  }
}

export async function uploadCertificateTemplate(req: AuthRequest, res: Response): Promise<void> {
  try {
    const courseId = parseInt(req.params.courseId);
    if (isNaN(courseId)) {
      res.status(400).json({ error: 'Invalid course ID' });
      return;
    }

    const course = await courseAdminService.getCourseById(courseId);
    if (!course) {
      res.status(404).json({ error: 'Course not found' });
      return;
    }
    if (req.dbUser!.role !== 'admin' && course.createdBy !== req.dbUser!.id) {
      res.status(403).json({ error: 'Forbidden: You can only configure certificates for your own courses' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'No PDF file uploaded.' });
      return;
    }

    if (req.file.mimetype !== 'application/pdf' && !req.file.originalname.toLowerCase().endsWith('.pdf')) {
      res.status(400).json({ error: 'Only PDF template files are supported.' });
      return;
    }

    const result = await certificateService.uploadCertificateTemplate(
      courseId,
      req.file.buffer,
      req.file.originalname,
      req.dbUser!.id,
    );

    res.status(201).json({
      success: true,
      documentId: result.documentId,
      fileName: result.fileName,
    });
  } catch (error: unknown) {
    console.error('Upload certificate template error:', error);
    res.status(500).json({ error: 'Failed to upload certificate template.' });
  }
}

export async function removeCertificateTemplate(req: AuthRequest, res: Response): Promise<void> {
  try {
    const courseId = parseInt(req.params.courseId);
    if (isNaN(courseId)) {
      res.status(400).json({ error: 'Invalid course ID' });
      return;
    }

    const course = await courseAdminService.getCourseById(courseId);
    if (!course) {
      res.status(404).json({ error: 'Course not found' });
      return;
    }
    if (req.dbUser!.role !== 'admin' && course.createdBy !== req.dbUser!.id) {
      res.status(403).json({ error: 'Forbidden: You can only configure certificates for your own courses' });
      return;
    }

    await certificateService.removeCertificateTemplate(courseId);
    res.json({ success: true });
  } catch (error: unknown) {
    console.error('Remove certificate template error:', error);
    res.status(500).json({ error: 'Failed to remove certificate template.' });
  }
}

export async function downloadCertificate(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { verificationCode } = req.params;
    if (!verificationCode) {
      res.status(400).json({ error: 'Verification code is required' });
      return;
    }

    const result = await certificateService.generateCertificatePdf(verificationCode);
    if (!result) {
      res.status(404).json({ error: 'Certificate not found' });
      return;
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
    res.setHeader('Content-Length', result.buffer.length);
    res.send(result.buffer);
  } catch (error: unknown) {
    console.error('Download certificate error:', error);
    res.status(500).json({ error: 'Failed to generate and download certificate.' });
  }
}
