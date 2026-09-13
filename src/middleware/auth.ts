// src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin.js';
import { db } from '../db/index.js';
import { users, lessons, enrollments } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { DecodedIdToken } from 'firebase-admin/auth';

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
  dbUser?: typeof users.$inferSelect;
}

/** Plain-language message returned when an email is already claimed by a different Firebase account. */
export const EMAIL_CONFLICT_MESSAGE =
  'This email is already linked to an account. Please contact your administrator for help.';

/**
 * Check if a user can access a document.
 * Admin/instructors have full access. Learners must be enrolled in the document's course.
 * Orphaned documents (no lessonId) are admin/instructor only.
 */
export async function checkDocumentAccess(lessonId: number | null, user: typeof users.$inferSelect): Promise<boolean> {
  if (user.role === 'admin' || user.role === 'instructor') {
    return true;
  }
  if (!lessonId) {
    return false;
  }
  const lessonRows = await db.select({ courseId: lessons.courseId }).from(lessons).where(eq(lessons.id, lessonId));
  if (lessonRows.length === 0) {
    return false;
  }
  const enrollmentRows = await db
    .select()
    .from(enrollments)
    .where(and(eq(enrollments.userId, user.id), eq(enrollments.courseId, lessonRows[0].courseId)));
  return enrollmentRows.length > 0;
}

/**
 * Resolve a database user from a verified Firebase token.
 *
 * Lookup rules (in order):
 *  1. Match by Firebase UID -> return that user (normal case, restores idempotent sessions).
 *  2. Match by email where the row has a `pending-` placeholder UID (pre-provisioned
 *     invite) -> adopt the row, attach the real Firebase UID, and keep the pre-assigned
 *     role. The invite IS the approval, so onboarding_status is set to 'active'.
 *  3. Match by email where the row has a real UID that differs from the token -> this
 *     is stale/orphaned data or a reused email. NEVER auto-adopt and NEVER auto-merge.
 *     Throw an explicit EMAIL_CONFLICT error so the caller can return a clear 409.
 *  4. No match at all -> create a new account. The role/onboarding_status depend on the
 *     `intent` provided by the client (learner by default; instructor if the user
 *     explicitly entered through the Instructor Portal and is not yet provisioned).
 */
async function resolveDbUser(
  decodedToken: DecodedIdToken,
  intent: string | undefined,
): Promise<{ user: typeof users.$inferSelect; conflict?: boolean }> {
  const rawEmail = decodedToken.email || `${decodedToken.uid}@aqs.org`;
  const email = rawEmail.toLowerCase();
  const name = decodedToken.name || email.split('@')[0];

  // 1. By Firebase UID (normal case)
  const dbUserList = await db.select().from(users).where(eq(users.uid, decodedToken.uid));
  if (dbUserList.length > 0) {
    return { user: dbUserList[0] };
  }

  // 2. By email — pre-provisioned pending invite
  const emailMatch = await db.select().from(users).where(eq(users.email, email));
  if (emailMatch.length > 0 && emailMatch[0].uid.startsWith('pending-')) {
    const updated = await db
      .update(users)
      .set({ uid: decodedToken.uid, name, onboardingStatus: 'active' })
      .where(eq(users.id, emailMatch[0].id))
      .returning();
    return { user: updated[0] };
  }

  // 3. By email — real UID that differs (stale data / reused email). Never adopt, never merge.
  if (emailMatch.length > 0 && emailMatch[0].uid !== decodedToken.uid) {
    return { user: emailMatch[0], conflict: true };
  }

  // 4. No match at all — create a new account.
  const isInstructorIntent = intent === 'instructor';
  const result = await db
    .insert(users)
    .values({
      uid: decodedToken.uid,
      email,
      name,
      role: isInstructorIntent ? 'instructor' : 'learner',
      onboardingStatus: isInstructorIntent ? 'onboarding' : 'active',
    })
    .returning();
  return { user: result[0] };
}

/**
 * Shared auth plumbing used by requireAuth and requireAuthOrQueryToken.
 * Verifies the token, resolves the DB user via resolveDbUser, and applies the
 * explicit email-conflict guard.
 */
async function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
  token: string,
  intent: string | undefined,
): Promise<void> {
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = decodedToken;

    const { user, conflict } = await resolveDbUser(decodedToken, intent);
    if (conflict) {
      res.status(409).json({ error: EMAIL_CONFLICT_MESSAGE });
      return;
    }

    req.dbUser = user;
    next();
  } catch (error: any) {
    console.error('Error verifying Firebase ID token:', error);
    res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
}

/**
 * Core authentication middleware.
 * Extracts Bearer token from Authorization header only (no query param).
 * Accepts an optional `?intent=instructor` query parameter so users who enter
 * through the Instructor Portal are provisioned with the instructor role instead
 * of defaulting to learner.
 */
export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  const token = authHeader.split('Bearer ')[1];
  const intent = typeof req.query.intent === 'string' ? req.query.intent : undefined;
  return authenticate(req, res, next, token, intent);
};

/**
 * Authentication middleware that also accepts ?token= query parameter.
 * Used ONLY for document file downloads where <a> tags open URLs directly.
 * Downloads never carry intent, so this path always provisions learners.
 */
export const requireAuthOrQueryToken = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  let token: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split('Bearer ')[1];
  } else if (typeof req.query.token === 'string') {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  return authenticate(req, res, next, token, undefined);
};

// Middleware: admin only (no instructor fallback)
export const requireAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.dbUser) {
    return res.status(401).json({ error: 'Unauthorized: No user profile' });
  }

  if (req.dbUser.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Admin access required' });
  }

  next();
};

// Middleware: instructor or admin, but only after onboarding is complete.
// Instructors who have not been approved (onboarding_status !== 'active') cannot
// access instructor-only tools.
export const requireInstructorOrAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.dbUser) {
    return res.status(401).json({ error: 'Unauthorized: No user profile' });
  }

  if (req.dbUser.role !== 'admin' && req.dbUser.role !== 'instructor') {
    return res.status(403).json({ error: 'Forbidden: Instructor or admin access required' });
  }

  if (req.dbUser.role === 'instructor' && req.dbUser.onboardingStatus !== 'active') {
    return res.status(403).json({ error: 'Forbidden: Instructor onboarding not complete' });
  }

  next();
};
