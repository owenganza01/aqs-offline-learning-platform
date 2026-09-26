import { randomUUID } from 'crypto';
import { db } from '../../db/index.js';
import * as schema from '../../db/schema.js';
import { eq, sql } from 'drizzle-orm';

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

export interface PaginationParams {
  limit: number;
  offset: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
}

export function parsePagination(limitStr?: string, offsetStr?: string): PaginationParams {
  const limit = Math.min(Math.max(parseInt(limitStr || '') || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const offset = Math.max(parseInt(offsetStr || '') || 0, 0);
  return { limit, offset };
}

export async function listUsers(pagination: PaginationParams): Promise<PaginatedResult<any>> {
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(schema.users);
  const data = await db.select().from(schema.users).limit(pagination.limit).offset(pagination.offset);
  return { data, total: Number(count) };
}

export async function changeUserRole(targetUserId: number, role: string): Promise<any> {
  const updated = await db.update(schema.users).set({ role }).where(eq(schema.users.id, targetUserId)).returning();
  return updated[0];
}

export async function createInstructorAccount(name: string, email: string): Promise<any> {
  const existingUser = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (existingUser.length > 0) {
    if (existingUser[0].uid.startsWith('pending-')) {
      throw new Error('An invitation is already pending for this email.');
    }
    throw new Error('Email already registered.');
  }

  const users = await db
    .insert(schema.users)
    .values({
      uid: `pending-${randomUUID()}`,
      email,
      name,
      role: 'instructor',
    })
    .returning();

  return users[0];
}

/** Valid transition states for the instructor onboarding submission. */
const INSTRUCTOR_ONBOARD_ALLOWED_STATES = ['onboarding', 'rejected'];

/** Valid onboarding statuses for internal guards. */
export const ONBOARDING_STATUSES = ['onboarding', 'pending_approval', 'active', 'rejected'] as const;

export class StateGuardError extends Error {
  statusCode: number;
  constructor(message: string) {
    super(message);
    this.name = 'StateGuardError';
    this.statusCode = 400;
  }
}

/**
 * Submit an instructor onboarding profile for review.
 *
 * State guard: only `onboarding` or `rejected` applicants may submit. Any other
 * state (`active`, `pending_approval`) is rejected with a 400 error rather than
 * silently overwriting the current status.
 *
 * A successful submission ALWAYS clears rejection_reason, regardless of the
 * previous state (e.g. "Edit and Resubmit" after a rejection starts clean).
 */
export async function submitInstructorOnboarding(
  userId: number,
  data: { name?: string; bio: string; organization?: string },
): Promise<any> {
  const [current] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!current) {
    throw new StateGuardError('User not found.');
  }

  if (!INSTRUCTOR_ONBOARD_ALLOWED_STATES.includes(current.onboardingStatus)) {
    throw new StateGuardError(`Invalid submission: cannot onboard from current status (${current.onboardingStatus}).`);
  }

  const updateData: any = {
    bio: data.bio,
    organization: data.organization ?? null,
    rejectionReason: null,
    submittedAt: new Date(),
    onboardingStatus: 'pending_approval',
  };
  if (data.name !== undefined) updateData.name = data.name;

  const updated = await db.update(schema.users).set(updateData).where(eq(schema.users.id, userId)).returning();
  return updated[0];
}

/**
 * Reopen a rejected instructor application ("Edit and Resubmit").
 * Only a `rejected` application can be reopened. Clears rejection_reason and
 * submitted_at and returns the applicant to the onboarding form state.
 */
export async function reopenInstructorOnboarding(userId: number): Promise<any> {
  const [current] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!current) {
    throw new StateGuardError('User not found.');
  }
  if (current.onboardingStatus !== 'rejected') {
    throw new StateGuardError('Only rejected applications can be reopened.');
  }

  const updated = await db
    .update(schema.users)
    .set({ onboardingStatus: 'onboarding', rejectionReason: null, submittedAt: null })
    .where(eq(schema.users.id, userId))
    .returning();
  return updated[0];
}

/** Admin approval of an instructor application. */
export async function approveInstructor(userId: number): Promise<any> {
  const [current] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!current) {
    throw new StateGuardError('User not found.');
  }
  if (current.role !== 'instructor') {
    throw new StateGuardError('Only instructor accounts can be approved as instructors.');
  }

  const updated = await db
    .update(schema.users)
    .set({ onboardingStatus: 'active', rejectionReason: null, submittedAt: null })
    .where(eq(schema.users.id, userId))
    .returning();
  return updated[0];
}

/** Admin decline of an instructor application. Reason is required. */
export async function declineInstructor(userId: number, reason: string): Promise<any> {
  const [current] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!current) {
    throw new StateGuardError('User not found.');
  }
  if (current.role !== 'instructor') {
    throw new StateGuardError('Only instructor accounts can be declined.');
  }

  const updated = await db
    .update(schema.users)
    .set({ onboardingStatus: 'rejected', rejectionReason: reason })
    .where(eq(schema.users.id, userId))
    .returning();
  return updated[0];
}
