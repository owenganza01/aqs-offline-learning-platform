import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { db } from '../../db/index.ts';
import * as schema from '../../db/schema.ts';
import { AuthRequest } from '../../middleware/auth.ts';
import { eq, sql } from 'drizzle-orm';
import { canPromoteToRole } from '../services/authorization-service.ts';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
function parsePagination(req: Request): { limit: number; offset: number } {
  const limit = Math.min(Math.max(parseInt(req.query.limit as string) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
  return { limit, offset };
}

export async function listUsers(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { limit, offset } = parsePagination(req);
    const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(schema.users);
    const allUsers = await db.select().from(schema.users).limit(limit).offset(offset);
    res.setHeader('X-Total-Count', Number(count));
    res.json(allUsers);
  } catch (error: unknown) {
    console.error('List users error:', error);
    res.status(500).json({ error: 'Failed to fetch users.' });
  }
}

export async function changeUserRole(req: AuthRequest, res: Response): Promise<void> {
  try {
    const targetUserId = parseInt(req.params.userId);
    const { role } = req.body;

    if (isNaN(targetUserId)) {
      res.status(400).json({ error: 'Invalid user ID.' });
      return;
    }

    const promotionCheck = await canPromoteToRole(req.dbUser!.id, targetUserId, role);
    if (!promotionCheck.allowed) {
      res.status(403).json({ error: promotionCheck.error });
      return;
    }

    const updated = await db.update(schema.users).set({ role }).where(eq(schema.users.id, targetUserId)).returning();

    if (updated.length === 0) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    res.json({ success: true, dbUser: updated[0] });
  } catch (error: unknown) {
    console.error('Error updating user role:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update role.' });
  }
}

export async function createInstructor(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { name, email } = req.body;

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
        role: 'instructor',
      })
      .returning();

    res.status(201).json({ success: true, user: result[0] });
  } catch (error: unknown) {
    console.error('Create instructor error:', error);
    res.status(500).json({ error: 'Failed to create instructor account.' });
  }
}
