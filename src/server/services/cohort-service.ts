import { randomUUID } from 'crypto';
import { db } from '../../db/index.js';
import * as schema from '../../db/schema.js';
import { eq, sql } from 'drizzle-orm';

function generateInviteCode(): string {
  return randomUUID().replace(/-/g, '').substring(0, 8).toUpperCase();
}

export async function createCohort(name: string, instructorId: number): Promise<any> {
  const cohorts = await db
    .insert(schema.cohorts)
    .values({
      instructorId,
      name,
      inviteCode: generateInviteCode(),
    })
    .returning();

  return cohorts[0];
}

export async function listCohorts(userRole: string, userId: number): Promise<any[]> {
  const cohortsList = await db
    .select({
      id: schema.cohorts.id,
      instructorId: schema.cohorts.instructorId,
      name: schema.cohorts.name,
      inviteCode: schema.cohorts.inviteCode,
      createdAt: schema.cohorts.createdAt,
      memberCount: sql<number>`count(${schema.users.id})::int`,
    })
    .from(schema.cohorts)
    .leftJoin(schema.users, eq(schema.cohorts.id, schema.users.cohortId))
    .where(userRole === 'admin' ? undefined : eq(schema.cohorts.instructorId, userId))
    .groupBy(
      schema.cohorts.id,
      schema.cohorts.instructorId,
      schema.cohorts.name,
      schema.cohorts.inviteCode,
      schema.cohorts.createdAt,
    );

  return cohortsList;
}

export async function regenerateCohortCode(cohortId: number, userId: number, userRole: string): Promise<any> {
  const cohortRows = await db.select().from(schema.cohorts).where(eq(schema.cohorts.id, cohortId));
  if (cohortRows.length === 0) {
    throw Object.assign(new Error('Cohort not found'), { statusCode: 404 });
  }

  const cohort = cohortRows[0];
  if (userRole !== 'admin' && cohort.instructorId !== userId) {
    throw Object.assign(new Error('Forbidden: You can only manage your own cohorts'), { statusCode: 403 });
  }

  const updated = await db
    .update(schema.cohorts)
    .set({ inviteCode: generateInviteCode() })
    .where(eq(schema.cohorts.id, cohortId))
    .returning();

  return updated[0];
}
