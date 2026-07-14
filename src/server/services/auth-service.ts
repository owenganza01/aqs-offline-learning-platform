import { randomUUID } from 'crypto';
import { db } from '../../db/index.ts';
import * as schema from '../../db/schema.ts';
import { eq } from 'drizzle-orm';

export async function registerUser(name: string, email: string, inviteCode: string) {
  const cohortRows = await db.select().from(schema.cohorts).where(eq(schema.cohorts.inviteCode, inviteCode));
  if (cohortRows.length === 0) {
    throw Object.assign(new Error('Code not recognized — check with your instructor.'), { statusCode: 400 });
  }
  const cohort = cohortRows[0];

  const existingUser = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (existingUser.length > 0) {
    if (existingUser[0].uid.startsWith('pending-')) {
      throw Object.assign(new Error('An invitation is already pending for this email.'), { statusCode: 400 });
    }
    throw Object.assign(new Error('Email already registered.'), { statusCode: 400 });
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

  return result[0];
}

export async function updateUserProfile(userId: number, data: { avatarUrl?: string; name?: string }) {
  const updateData: any = {};
  if (data.avatarUrl !== undefined) updateData.avatarUrl = data.avatarUrl;
  if (data.name !== undefined) updateData.name = data.name;

  const updated = await db.update(schema.users).set(updateData).where(eq(schema.users.id, userId)).returning();
  return updated[0];
}
