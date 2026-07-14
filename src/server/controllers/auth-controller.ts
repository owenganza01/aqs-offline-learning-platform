import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { db } from '../../db/index.ts';
import * as schema from '../../db/schema.ts';
import { AuthRequest } from '../../middleware/auth.ts';
import { eq } from 'drizzle-orm';

export async function getMe(req: AuthRequest, res: Response): Promise<void> {
  try {
    res.json({
      user: req.user,
      dbUser: req.dbUser,
    });
  } catch (error: any) {
    console.error('Error in /api/auth/me:', error);
    res.status(500).json({ error: error.message });
  }
}

export async function register(req: Request, res: Response): Promise<void> {
  try {
    const { name, email, inviteCode } = req.body;

    const cohortList = await db.select().from(schema.cohorts).where(eq(schema.cohorts.inviteCode, inviteCode));
    if (cohortList.length === 0) {
      res.status(400).json({ error: 'Code not recognized — check with your instructor.' });
      return;
    }
    const cohort = cohortList[0];

    const existingUser = await db.select().from(schema.users).where(eq(schema.users.email, email));
    if (existingUser.length > 0) {
      if (existingUser[0].uid.startsWith('pending-')) {
        res.status(400).json({ error: 'An invitation is already pending for this email.' });
        return;
      }
      res.status(400).json({ error: 'Email already registered.' });
      return;
    }

    const result = await db
      .insert(schema.users)
      .values({
        uid: `pending-${randomUUID()}`,
        email,
        name,
        role: 'learner',
        cohortId: cohort.id,
      })
      .returning();

    res.status(201).json({ success: true, user: result[0] });
  } catch (error: any) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Failed to complete registration.' });
  }
}

export async function updateProfile(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { avatarUrl, name } = req.body;
    if (!req.dbUser) {
      res.status(404).json({ error: 'User profile not found.' });
      return;
    }

    const updateData: any = {};
    if (avatarUrl !== undefined) {
      updateData.avatarUrl = avatarUrl;
    }
    if (name !== undefined) {
      updateData.name = name;
    }

    const updated = await db.update(schema.users).set(updateData).where(eq(schema.users.id, req.dbUser.id)).returning();

    res.json({ success: true, dbUser: updated[0] });
  } catch (error: any) {
    console.error('Error in updating profile details:', error);
    res.status(500).json({ error: error.message });
  }
}
