import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { db } from '../../db/index.ts';
import * as schema from '../../db/schema.ts';
import { AuthRequest } from '../../middleware/auth.ts';
import { eq, sql } from 'drizzle-orm';

export async function createCohort(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { name } = req.body;

    const inviteCode = randomUUID().replace(/-/g, '').substring(0, 8).toUpperCase();

    const result = await db
      .insert(schema.cohorts)
      .values({
        instructorId: req.dbUser!.id,
        name,
        inviteCode,
      })
      .returning();

    res.status(201).json(result[0]);
  } catch (error: unknown) {
    console.error('Create cohort error:', error);
    res.status(500).json({ error: 'Failed to create cohort.' });
  }
}

export async function listCohorts(req: AuthRequest, res: Response): Promise<void> {
  try {
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
      .where(req.dbUser!.role === 'admin' ? undefined : eq(schema.cohorts.instructorId, req.dbUser!.id))
      .groupBy(
        schema.cohorts.id,
        schema.cohorts.instructorId,
        schema.cohorts.name,
        schema.cohorts.inviteCode,
        schema.cohorts.createdAt,
      );

    res.json(cohortsList);
  } catch (error: unknown) {
    console.error('List cohorts error:', error);
    res.status(500).json({ error: 'Failed to fetch cohorts.' });
  }
}

export async function regenerateCohortCode(req: AuthRequest, res: Response): Promise<void> {
  try {
    const cohortId = parseInt(req.params.id);
    if (isNaN(cohortId)) {
      res.status(400).json({ error: 'Invalid cohort ID' });
      return;
    }

    const cohortRows = await db.select().from(schema.cohorts).where(eq(schema.cohorts.id, cohortId));
    if (cohortRows.length === 0) {
      res.status(404).json({ error: 'Cohort not found' });
      return;
    }

    const cohort = cohortRows[0];

    if (req.dbUser!.role !== 'admin' && cohort.instructorId !== req.dbUser!.id) {
      res.status(403).json({ error: 'Forbidden: You can only manage your own cohorts' });
      return;
    }

    const newInviteCode = randomUUID().replace(/-/g, '').substring(0, 8).toUpperCase();

    const updated = await db
      .update(schema.cohorts)
      .set({ inviteCode: newInviteCode })
      .where(eq(schema.cohorts.id, cohortId))
      .returning();

    res.json(updated[0]);
  } catch (error: unknown) {
    console.error('Regenerate cohort code error:', error);
    res.status(500).json({ error: 'Failed to regenerate invite code.' });
  }
}
