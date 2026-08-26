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
