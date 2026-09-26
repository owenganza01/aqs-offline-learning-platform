import { db } from '../../db/index.js';
import * as schema from '../../db/schema.js';
import { eq } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Instructor account closure lifecycle
//
// Closure is initiated by an admin and stored on the users row as:
//   closure_status       'pending' | 'closed' | null
//   closure_started_at   when closure was initiated
//   closure_retention_days 7..30, captured at initiation
//   closure_reason       admin-supplied free text
//
// The 'pending' -> 'closed' transition is NEVER a background job. It is
// computed on read by effectiveClosureStatus(). Any read path that displays
// closure state, checks authorization, or renders a banner must go through
// this function so the rule lives in exactly one place.
// ---------------------------------------------------------------------------

export const DEFAULT_CLOSURE_RETENTION_DAYS = 14;
export const MIN_CLOSURE_RETENTION_DAYS = 7;
export const MAX_CLOSURE_RETENTION_DAYS = 30;

export type EffectiveClosureStatus = 'pending' | 'closed' | null;

/** Minimal shape the expiry check needs — satisfied by any users table row. */
export interface ClosureAwareUser {
  closureStatus: string | null;
  closureStartedAt: Date | string | null;
  closureRetentionDays: number | null;
}

export class ClosureError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'ClosureError';
    this.statusCode = statusCode;
  }
}

/** Retention window in milliseconds captured at initiation. */
export function closureRetentionMs(user: ClosureAwareUser): number {
  const days = user.closureRetentionDays ?? DEFAULT_CLOSURE_RETENTION_DAYS;
  return days * 24 * 60 * 60 * 1000;
}

/**
 * Shared single source of truth for closure state.
 * Returns 'pending' while inside the retention window, 'closed' once the
 * deadline passes, and null when the account was never put into closure.
 */
export function effectiveClosureStatus(user: ClosureAwareUser, now: Date = new Date()): EffectiveClosureStatus {
  if (!user.closureStatus) {
    return null;
  }
  if (user.closureStatus === 'closed') {
    return 'closed';
  }
  if (!user.closureStartedAt) {
    return 'closed';
  }
  const started = user.closureStartedAt instanceof Date ? user.closureStartedAt : new Date(user.closureStartedAt);
  if (isNaN(started.getTime())) {
    return 'closed';
  }
  return now.getTime() >= started.getTime() + closureRetentionMs(user) ? 'closed' : 'pending';
}

/** Absolute deadline of the retention window, or null when no closure is active. */
export function closureDeadline(user: ClosureAwareUser): Date | null {
  if (!user.closureStatus || user.closureStatus === 'closed' || !user.closureStartedAt) {
    return null;
  }
  const started = user.closureStartedAt instanceof Date ? user.closureStartedAt : new Date(user.closureStartedAt);
  if (isNaN(started.getTime())) {
    return null;
  }
  return new Date(started.getTime() + closureRetentionMs(user));
}

/**
 * Admin initiates closure of an instructor account.
 * Guards: must be an instructor; must not already be in closure.
 * retentionDays defaults to DEFAULT_CLOSURE_RETENTION_DAYS and is clamped to
 * [MIN, MAX] defensively (the route-level zod already enforces 7..30).
 */
export async function initiateInstructorClosure(
  userId: number,
  opts: { retentionDays?: number; reason?: string },
): Promise<typeof schema.users.$inferSelect> {
  const [current] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!current) {
    throw new ClosureError('User not found.', 404);
  }
  if (current.role !== 'instructor') {
    throw new ClosureError('Only instructor accounts can be closed.', 400);
  }
  if (current.closureStatus) {
    throw new ClosureError('This account is already in closure.', 400);
  }

  const requested = opts.retentionDays ?? DEFAULT_CLOSURE_RETENTION_DAYS;
  const retentionDays = Math.min(Math.max(requested, MIN_CLOSURE_RETENTION_DAYS), MAX_CLOSURE_RETENTION_DAYS);

  const [updated] = await db
    .update(schema.users)
    .set({
      closureStatus: 'pending',
      closureStartedAt: new Date(),
      closureRetentionDays: retentionDays,
      closureReason: opts.reason ?? null,
    })
    .where(eq(schema.users.id, userId))
    .returning();

  return updated;
}

/**
 * Admin transfers a course to another instructor.
 * Guard: target must be an instructor with onboarding_status 'active' and no
 * closure in effect. Transferring clears is_archived so the course resumes
 * full status under its new owner.
 */
export async function transferCourseOwnership(
  courseId: number,
  targetUserId: number,
): Promise<typeof schema.courses.$inferSelect> {
  const [course] = await db.select().from(schema.courses).where(eq(schema.courses.id, courseId));
  if (!course) {
    throw new ClosureError('Course not found.', 404);
  }

  const [target] = await db.select().from(schema.users).where(eq(schema.users.id, targetUserId));
  if (!target) {
    throw new ClosureError('Target instructor not found.', 404);
  }
  if (target.role !== 'instructor') {
    throw new ClosureError('Course transfer target must be an instructor.', 400);
  }
  if (target.onboardingStatus !== 'active') {
    throw new ClosureError('Course transfer target must have completed instructor onboarding.', 400);
  }
  if (effectiveClosureStatus(target) !== null) {
    throw new ClosureError('Course transfer target cannot be in account closure.', 400);
  }

  const [updated] = await db
    .update(schema.courses)
    .set({
      createdBy: target.id,
      createdByName: target.name || target.email,
      isArchived: false,
    })
    .where(eq(schema.courses.id, courseId))
    .returning();

  return updated;
}

/**
 * Admin explicitly archives or restores a course (read-only preservation vs.
 * active). is_archived is ONLY ever set by this admin action or cleared by a
 * transfer — it is never flipped automatically by the closure deadline.
 */
export async function setCourseArchived(
  courseId: number,
  archived: boolean,
): Promise<typeof schema.courses.$inferSelect> {
  const [course] = await db.select().from(schema.courses).where(eq(schema.courses.id, courseId));
  if (!course) {
    throw new ClosureError('Course not found.', 404);
  }

  const [updated] = await db
    .update(schema.courses)
    .set({ isArchived: archived })
    .where(eq(schema.courses.id, courseId))
    .returning();

  return updated;
}

/** Attach server-computed closure fields to a user row for API responses. */
export function withClosureInfo<T extends ClosureAwareUser>(user: T) {
  return {
    ...user,
    closureEffective: effectiveClosureStatus(user),
    closureDeadline: closureDeadline(user)?.toISOString() ?? null,
  };
}
