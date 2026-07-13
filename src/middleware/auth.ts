// src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import { db } from '../db/index.ts';
import { users, lessons, enrollments } from '../db/schema.ts';
import { eq, and } from 'drizzle-orm';
import { DecodedIdToken } from 'firebase-admin/auth';

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
  dbUser?: typeof users.$inferSelect;
}

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
 * Core authentication middleware.
 * Extracts Bearer token from Authorization header only (no query param).
 * On first login for a pre-provisioned account (uid starts with 'pending-'),
 * links the real Firebase UID to the existing row by email match.
 */
export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = decodedToken;

    const rawEmail = decodedToken.email || `${decodedToken.uid}@aqs.org`;
    const email = rawEmail.toLowerCase();
    const name = decodedToken.name || email.split('@')[0];

    // 1. Try lookup by Firebase UID (normal case)
    const dbUserList = await db.select().from(users).where(eq(users.uid, decodedToken.uid));
    let dbUser: typeof users.$inferSelect;

    if (dbUserList.length > 0) {
      dbUser = dbUserList[0];
    } else {
      // 2. No match by UID — try by email (pre-provisioned account)
      const emailMatch = await db.select().from(users).where(eq(users.email, email));

      if (emailMatch.length > 0 && emailMatch[0].uid.startsWith('pending-')) {
        // 3. Found a pending row — link it to the real Firebase UID
        const updated = await db
          .update(users)
          .set({ uid: decodedToken.uid, name })
          .where(eq(users.id, emailMatch[0].id))
          .returning();
        dbUser = updated[0];
      } else if (emailMatch.length > 0) {
        // Email exists with a real UID — this shouldn't happen (different Firebase account)
        // Return the existing user to avoid duplicates
        dbUser = emailMatch[0];
      } else {
        // 4. No match at all — create new learner account
        const result = await db
          .insert(users)
          .values({
            uid: decodedToken.uid,
            email,
            name,
            role: 'learner',
          })
          .returning();
        dbUser = result[0];
      }
    }

    req.dbUser = dbUser;
    next();
  } catch (error: any) {
    console.error('Error verifying Firebase ID token:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};

/**
 * Authentication middleware that also accepts ?token= query parameter.
 * Used ONLY for document file downloads where <a> tags open URLs directly.
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

  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = decodedToken;

    const rawEmail = decodedToken.email || `${decodedToken.uid}@aqs.org`;
    const email = rawEmail.toLowerCase();
    const name = decodedToken.name || email.split('@')[0];

    const dbUserList = await db.select().from(users).where(eq(users.uid, decodedToken.uid));
    let dbUser: typeof users.$inferSelect;

    if (dbUserList.length > 0) {
      dbUser = dbUserList[0];
    } else {
      const emailMatch = await db.select().from(users).where(eq(users.email, email));

      if (emailMatch.length > 0 && emailMatch[0].uid.startsWith('pending-')) {
        const updated = await db
          .update(users)
          .set({ uid: decodedToken.uid, name })
          .where(eq(users.id, emailMatch[0].id))
          .returning();
        dbUser = updated[0];
      } else if (emailMatch.length > 0) {
        dbUser = emailMatch[0];
      } else {
        const result = await db
          .insert(users)
          .values({
            uid: decodedToken.uid,
            email,
            name,
            role: 'learner',
          })
          .returning();
        dbUser = result[0];
      }
    }

    req.dbUser = dbUser;
    next();
  } catch (error: any) {
    console.error('Error verifying Firebase ID token:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
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

// Middleware: instructor or admin
export const requireInstructorOrAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.dbUser) {
    return res.status(401).json({ error: 'Unauthorized: No user profile' });
  }

  if (req.dbUser.role !== 'admin' && req.dbUser.role !== 'instructor') {
    return res.status(403).json({ error: 'Forbidden: Instructor or admin access required' });
  }

  next();
};
