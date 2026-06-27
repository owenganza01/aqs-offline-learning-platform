// src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import { db } from '../db/index.ts';
import { users } from '../db/schema.ts';
import { eq } from 'drizzle-orm';
import { DecodedIdToken } from 'firebase-admin/auth';

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
  dbUser?: typeof users.$inferSelect;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = decodedToken;

    // Standard email check & backup email
    const email = decodedToken.email || `${decodedToken.uid}@aqs.org`;
    const name = decodedToken.name || email.split('@')[0];

    // Safely fetch or upsert the user record in PostgreSQL using Drizzle
    let dbUserList = await db.select().from(users).where(eq(users.uid, decodedToken.uid));
    let dbUser: typeof users.$inferSelect;

    if (dbUserList.length === 0) {
      const result = await db.insert(users)
        .values({
          uid: decodedToken.uid,
          email,
          name,
          role: 'learner', // Default role
        })
        .returning();
      dbUser = result[0];
    } else {
      dbUser = dbUserList[0];
    }

    req.dbUser = dbUser;
    next();
  } catch (error: any) {
    console.error('Error verifying Firebase ID token:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};

// Middleware to restrict access to Instructors or Admins
export const requireInstructor = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.dbUser) {
    return res.status(401).json({ error: 'Unauthorized: No user profile' });
  }

  if (req.dbUser.role !== 'instructor' && req.dbUser.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Instructor access required' });
  }

  next();
};
