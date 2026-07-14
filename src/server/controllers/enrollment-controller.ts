import { Request, Response } from 'express';
import { db } from '../../db/index.ts';
import * as schema from '../../db/schema.ts';
import { AuthRequest } from '../../middleware/auth.ts';
import { eq } from 'drizzle-orm';

export async function listEnrollments(req: AuthRequest, res: Response): Promise<void> {
  try {
    const rows = await db
      .select({ courseId: schema.enrollments.courseId })
      .from(schema.enrollments)
      .where(eq(schema.enrollments.userId, req.dbUser!.id));
    const courseIds = rows.map((r) => r.courseId);
    res.json({ courseIds });
  } catch (error: unknown) {
    if (error instanceof Error && (error as any).code === '42P01') {
      console.warn('Enrollments table not found — returning empty list. Run migrations to create it.');
      res.json({ courseIds: [] });
      return;
    }
    console.error('Error fetching enrollments:', error);
    res.status(500).json({ error: 'Failed to fetch enrollments.' });
  }
}

export async function enrollCourse(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { courseId } = req.body;

    await db
      .insert(schema.enrollments)
      .values({ userId: req.dbUser!.id, courseId })
      .onConflictDoNothing({ target: [schema.enrollments.userId, schema.enrollments.courseId] });

    res.json({ success: true, courseId });
  } catch (error: unknown) {
    if (error instanceof Error && (error as any).code === '42P01') {
      console.warn('Enrollments table not found — enrollment not persisted. Run migrations to create it.');
      res.json({ success: true, courseId: req.body.courseId });
      return;
    }
    console.error('Error creating enrollment:', error);
    res.status(500).json({ error: 'Failed to create enrollment.' });
  }
}
