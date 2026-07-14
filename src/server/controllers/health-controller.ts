import { Request, Response } from 'express';
import { db } from '../../db/index.ts';
import { sql } from 'drizzle-orm';

export async function getHealth(_req: Request, res: Response): Promise<void> {
  try {
    await db.execute(sql`SELECT 1`);
    res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
}
