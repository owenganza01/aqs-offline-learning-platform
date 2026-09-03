import { db } from '../../db/index.js';
import * as schema from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { documentStorage } from '../providers/document-storage.js';
import { generatePersonalizedCertificatePdf } from './pdf-certificate-generator.js';

export interface CertificateConfigData {
  enabled: boolean;
  title: string;
  issuer: string;
  requireCourseCompletion: boolean;
  requireAssessment: boolean;
  minAssessmentScore: number | null;
  templateDocumentId?: string | null;
  templateFileName?: string | null;
}

interface CertificateEligibility {
  eligible: boolean;
  reasons: string[];
  bestScore: number | null;
}

interface IssuedCertificate {
  id: number;
  verificationCode: string;
  learnerNameSnapshot: string;
  courseTitleSnapshot: string;
  certificateTitleSnapshot: string;
  issuerSnapshot: string;
  requirementsSnapshot: any;
  issuedAt: Date;
}

// Get certificate configuration for a course
export async function getCertificateConfig(courseId: number): Promise<CertificateConfigData | null> {
  const [config] = await db
    .select()
    .from(schema.certificateConfigs)
    .where(eq(schema.certificateConfigs.courseId, courseId));

  if (!config) return null;

  return {
    enabled: config.enabled,
    title: config.title,
    issuer: config.issuer,
    requireCourseCompletion: config.requireCourseCompletion,
    requireAssessment: config.requireAssessment,
    minAssessmentScore: config.minAssessmentScore,
    templateDocumentId: config.templateDocumentId,
    templateFileName: config.templateFileName,
  };
}

// Save/update certificate configuration
export async function saveCertificateConfig(courseId: number, data: CertificateConfigData): Promise<void> {
  const existing = await db
    .select()
    .from(schema.certificateConfigs)
    .where(eq(schema.certificateConfigs.courseId, courseId));

  if (existing.length > 0) {
    await db
      .update(schema.certificateConfigs)
      .set({
        enabled: data.enabled,
        title: data.title,
        issuer: data.issuer,
        requireCourseCompletion: data.requireCourseCompletion,
        requireAssessment: data.requireAssessment,
        minAssessmentScore: data.minAssessmentScore,
        updatedAt: new Date(),
      })
      .where(eq(schema.certificateConfigs.courseId, courseId));
  } else {
    await db.insert(schema.certificateConfigs).values({
      courseId,
      enabled: data.enabled,
      title: data.title,
      issuer: data.issuer,
      requireCourseCompletion: data.requireCourseCompletion,
      requireAssessment: data.requireAssessment,
      minAssessmentScore: data.minAssessmentScore,
    });
  }
}

// Check certificate eligibility for a user
export async function checkEligibility(userId: number, courseId: number): Promise<CertificateEligibility> {
  const config = await getCertificateConfig(courseId);
  if (!config || !config.enabled) {
    return { eligible: false, reasons: ['Certificate not enabled for this course'], bestScore: null };
  }

  const reasons: string[] = [];
  let bestScore: number | null = null;

  // Check course completion requirement
  if (config.requireCourseCompletion) {
    const [completion] = await db
      .select()
      .from(schema.courseCompletions)
      .where(and(eq(schema.courseCompletions.userId, userId), eq(schema.courseCompletions.courseId, courseId)));

    if (!completion) {
      reasons.push('Course not completed');
    }
  }

  // Check assessment requirement
  if (config.requireAssessment) {
    const quiz = await db.select().from(schema.quizzes).where(eq(schema.quizzes.courseId, courseId)).limit(1);

    if (quiz.length > 0) {
      const attempts = await db
        .select()
        .from(schema.quizAttempts)
        .where(and(eq(schema.quizAttempts.userId, userId), eq(schema.quizAttempts.quizId, quiz[0].id)));

      if (attempts.length > 0) {
        bestScore = Math.max(...attempts.map((a) => a.score));
        const requiredScore = config.minAssessmentScore ?? 70;
        if (bestScore < requiredScore) {
          reasons.push(`Assessment score ${bestScore}% below required ${requiredScore}%`);
        }
      } else {
        reasons.push('No assessment attempts');
      }
    }
    // If no quiz exists, assessment requirement is satisfied
  }

  return {
    eligible: reasons.length === 0,
    reasons,
    bestScore,
  };
}

// Generate a secure verification code
function generateVerificationCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'AQS-CERT-';
  const bytes = randomBytes(8);
  for (let i = 0; i < 8; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

// Issue a certificate (concurrency-safe — atomic INSERT with conflict handling)
export async function issueCertificate(userId: number, courseId: number): Promise<IssuedCertificate | null> {
  const config = await getCertificateConfig(courseId);
  if (!config || !config.enabled) return null;

  const eligibility = await checkEligibility(userId, courseId);
  if (!eligibility.eligible) return null;

  // Get user and course info for snapshots
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  const [course] = await db.select().from(schema.courses).where(eq(schema.courses.id, courseId));
  if (!user || !course) return null;

  // Get config ID (may be NULL if config was deleted after eligibility check)
  const [configRecord] = await db
    .select()
    .from(schema.certificateConfigs)
    .where(eq(schema.certificateConfigs.courseId, courseId));

  const requirementsSnapshot = {
    requireCourseCompletion: config.requireCourseCompletion,
    requireAssessment: config.requireAssessment,
    minAssessmentScore: config.minAssessmentScore,
    bestScore: eligibility.bestScore,
  };

  // Atomic insert with conflict handling — retry up to 5 times for verification_code collisions
  for (let attempt = 0; attempt < 5; attempt++) {
    const verificationCode = generateVerificationCode();

    try {
      const result = await db
        .insert(schema.issuedCertificates)
        .values({
          userId,
          certificateConfigId: configRecord?.id ?? null,
          courseId,
          verificationCode,
          learnerNameSnapshot: user.name || user.email,
          courseTitleSnapshot: course.title,
          certificateTitleSnapshot: config.title,
          issuerSnapshot: config.issuer,
          requirementsSnapshot,
        })
        .onConflictDoNothing({
          target: [schema.issuedCertificates.userId, schema.issuedCertificates.courseId],
        })
        .returning();

      if (result.length > 0) {
        // New certificate created
        const issued = result[0];
        return {
          id: issued.id,
          verificationCode: issued.verificationCode,
          learnerNameSnapshot: issued.learnerNameSnapshot,
          courseTitleSnapshot: issued.courseTitleSnapshot,
          certificateTitleSnapshot: issued.certificateTitleSnapshot,
          issuerSnapshot: issued.issuerSnapshot,
          requirementsSnapshot: issued.requirementsSnapshot,
          issuedAt: issued.issuedAt,
        };
      }

      // Conflict on (user_id, course_id) — certificate already exists
      // Retrieve the existing certificate
      const [existing] = await db
        .select()
        .from(schema.issuedCertificates)
        .where(and(eq(schema.issuedCertificates.userId, userId), eq(schema.issuedCertificates.courseId, courseId)));

      if (existing) {
        return {
          id: existing.id,
          verificationCode: existing.verificationCode,
          learnerNameSnapshot: existing.learnerNameSnapshot,
          courseTitleSnapshot: existing.courseTitleSnapshot,
          certificateTitleSnapshot: existing.certificateTitleSnapshot,
          issuerSnapshot: existing.issuerSnapshot,
          requirementsSnapshot: existing.requirementsSnapshot,
          issuedAt: existing.issuedAt,
        };
      }
      // If not found (race condition), retry
    } catch (err: any) {
      // verification_code unique constraint violation — retry with new code
      if (err.code === '23505' && err.constraint?.includes('verification_code')) {
        continue;
      }
      throw err;
    }
  }

  return null;
}

// Get certificate status for a user and course
export async function getCertificateStatus(
  userId: number,
  courseId: number,
): Promise<{
  enabled: boolean;
  eligible: boolean;
  issued: boolean;
  certificate?: {
    verificationCode: string;
    issuedAt: Date;
  };
  reasons?: string[];
}> {
  const config = await getCertificateConfig(courseId);
  if (!config || !config.enabled) {
    return { enabled: false, eligible: false, issued: false };
  }

  const eligibility = await checkEligibility(userId, courseId);

  // Check if already issued
  const [existing] = await db
    .select()
    .from(schema.issuedCertificates)
    .where(and(eq(schema.issuedCertificates.userId, userId), eq(schema.issuedCertificates.courseId, courseId)));

  return {
    enabled: true,
    eligible: eligibility.eligible,
    issued: !!existing,
    certificate: existing
      ? {
          verificationCode: existing.verificationCode,
          issuedAt: existing.issuedAt,
        }
      : undefined,
    reasons: eligibility.eligible ? undefined : eligibility.reasons,
  };
}

// Verify a certificate by verification code (public endpoint)
export async function verifyCertificate(verificationCode: string): Promise<{
  valid: boolean;
  courseName?: string;
  learnerInitials?: string;
  issuedAt?: Date;
  certificateTitle?: string;
  issuer?: string;
}> {
  const [cert] = await db
    .select()
    .from(schema.issuedCertificates)
    .where(eq(schema.issuedCertificates.verificationCode, verificationCode));

  if (!cert) {
    return { valid: false };
  }

  // Generate initials from learner name
  const nameParts = cert.learnerNameSnapshot.split(' ').filter(Boolean);
  const initials = nameParts
    .map((p: string) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return {
    valid: true,
    courseName: cert.courseTitleSnapshot,
    learnerInitials: initials,
    issuedAt: cert.issuedAt,
    certificateTitle: cert.certificateTitleSnapshot,
    issuer: cert.issuerSnapshot,
  };
}

// Upload a custom PDF template for a course certificate
export async function uploadCertificateTemplate(
  courseId: number,
  fileBuffer: Buffer,
  fileName: string,
  userId: number,
): Promise<{ documentId: string; fileName: string }> {
  // Store the PDF in documentStorage
  const doc = await documentStorage.upload(fileBuffer, {
    lessonId: null,
    originalFileName: fileName,
    storedFileName: `cert-template-${courseId}-${Date.now()}.pdf`,
    mimeType: 'application/pdf',
    fileSize: fileBuffer.length,
    uploadedBy: userId,
  });

  // Link to certificateConfigs
  const existing = await db
    .select()
    .from(schema.certificateConfigs)
    .where(eq(schema.certificateConfigs.courseId, courseId));

  if (existing.length > 0) {
    // If an old template exists, clean it up
    if (existing[0].templateDocumentId) {
      try {
        await documentStorage.delete(existing[0].templateDocumentId);
      } catch (e) {
        console.warn('Failed to clean up old template:', e);
      }
    }

    await db
      .update(schema.certificateConfigs)
      .set({
        templateDocumentId: doc.id,
        templateFileName: fileName,
        updatedAt: new Date(),
      })
      .where(eq(schema.certificateConfigs.courseId, courseId));
  } else {
    await db.insert(schema.certificateConfigs).values({
      courseId,
      enabled: false,
      templateDocumentId: doc.id,
      templateFileName: fileName,
    });
  }

  return { documentId: doc.id, fileName };
}

// Remove custom PDF template for a course certificate
export async function removeCertificateTemplate(courseId: number): Promise<void> {
  const [config] = await db
    .select()
    .from(schema.certificateConfigs)
    .where(eq(schema.certificateConfigs.courseId, courseId));

  if (config?.templateDocumentId) {
    try {
      await documentStorage.delete(config.templateDocumentId);
    } catch (e) {
      console.warn('Failed to delete template document from storage:', e);
    }
  }

  await db
    .update(schema.certificateConfigs)
    .set({
      templateDocumentId: null,
      templateFileName: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.certificateConfigs.courseId, courseId));
}

// Generate the final personalized certificate PDF (template or default)
export async function generateCertificatePdf(
  verificationCode: string,
): Promise<{ buffer: Buffer; fileName: string } | null> {
  const [cert] = await db
    .select()
    .from(schema.issuedCertificates)
    .where(eq(schema.issuedCertificates.verificationCode, verificationCode));

  if (!cert) return null;

  let templateBuffer: Buffer | null = null;
  if (cert.courseId) {
    const [config] = await db
      .select()
      .from(schema.certificateConfigs)
      .where(eq(schema.certificateConfigs.courseId, cert.courseId));

    if (config?.templateDocumentId) {
      const doc = await documentStorage.download(config.templateDocumentId);
      if (doc?.data) {
        templateBuffer = doc.data;
      }
    }
  }

  const pdfBytes = await generatePersonalizedCertificatePdf({
    learnerName: cert.learnerNameSnapshot,
    courseTitle: cert.courseTitleSnapshot,
    certificateTitle: cert.certificateTitleSnapshot,
    issuer: cert.issuerSnapshot,
    verificationCode: cert.verificationCode,
    issuedAt: cert.issuedAt,
    templateBuffer,
  });

  const safeTitle = cert.courseTitleSnapshot.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
  const fileName = `Certificate_${safeTitle}_${cert.verificationCode}.pdf`;

  return {
    buffer: Buffer.from(pdfBytes),
    fileName,
  };
}
