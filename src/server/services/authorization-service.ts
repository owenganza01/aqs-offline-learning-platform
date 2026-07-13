// Server-side authorization enforcement layer
// Single source of truth for role validation and promotion

import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middleware/auth.ts';
import { db } from '../../db/index.ts';
import { users } from '../../db/schema.ts';
import { eq, sql } from 'drizzle-orm';

type Role = 'learner' | 'instructor' | 'admin';

const ROLE_HIERARCHY: Record<Role, number> = {
  learner: 0,
  instructor: 0.5,
  admin: 1,
};

// Middleware: require specific role level
export function requireRole(minRole: Role) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.dbUser) {
      return res.status(401).json({ error: 'Unauthorized: No user profile' });
    }

    const userLevel = ROLE_HIERARCHY[req.dbUser.role as Role] ?? -1;
    const requiredLevel = ROLE_HIERARCHY[minRole];

    if (userLevel < requiredLevel) {
      return res.status(403).json({
        error: `Forbidden: ${minRole} access required`,
      });
    }

    next();
  };
}

// Middleware: require admin specifically (no instructor fallback)
export const requireAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.dbUser) {
    return res.status(401).json({ error: 'Unauthorized: No user profile' });
  }

  if (req.dbUser.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Admin access required' });
  }

  next();
};

// Validate whether a user is allowed to promote to a target role
// - Admins can promote anyone to any role
// - Learners cannot promote
// - No user can self-promote (prevents accidental lockout)
export async function canPromoteToRole(
  actorId: number,
  targetUserId: number,
  targetRole: Role,
): Promise<{ allowed: boolean; error?: string }> {
  const [actor] = await db.select().from(users).where(eq(users.id, actorId));
  if (!actor) {
    return { allowed: false, error: 'Actor not found' };
  }

  const [target] = await db.select().from(users).where(eq(users.id, targetUserId));
  if (!target) {
    return { allowed: false, error: 'Target user not found' };
  }

  // Self-promotion/demotion is never allowed (prevents lockout)
  if (actorId === targetUserId) {
    return { allowed: false, error: 'Cannot change your own role. Ask another admin.' };
  }

  const actorLevel = ROLE_HIERARCHY[actor.role as Role] ?? -1;
  const requiredLevel = ROLE_HIERARCHY[targetRole];

  // Only admins can promote others
  if (actor.role !== 'admin') {
    return { allowed: false, error: 'Only administrators can change roles' };
  }

  // Target role must be at or below the actor's level
  if (requiredLevel > actorLevel) {
    return { allowed: false, error: 'Cannot promote to a role higher than your own' };
  }

  // Last-admin protection: block demoting the only admin
  if (target.role === 'admin' && targetRole !== 'admin') {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(eq(users.role, 'admin'));
    if (Number(count) <= 1) {
      return { allowed: false, error: 'Cannot demote the last admin — at least one admin must remain' };
    }
  }

  return { allowed: true };
}
