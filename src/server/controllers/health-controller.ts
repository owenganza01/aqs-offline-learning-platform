import { Request, Response } from 'express';
import { db, schema } from '../../db/index.ts';
import { sql } from 'drizzle-orm';

export async function getHealth(_req: Request, res: Response): Promise<void> {
  try {
    await db.execute(sql`SELECT 1`);
    res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
}

export async function getDbTest(_req: Request, res: Response): Promise<void> {
  const connectionDetails: any = {
    hasDatabaseUrl: !!process.env.DATABASE_URL,
    sqlHost: process.env.SQL_HOST,
    sqlDbName: process.env.SQL_DB_NAME,
    sqlUser: process.env.SQL_USER,
  };

  try {
    // 1. Ping the database and get basic metadata
    const pingStart = Date.now();
    const rawResult = await db.execute(sql`SELECT NOW() as now, version() as version`);
    const pingTimeMs = Date.now() - pingStart;

    const dbTime = (rawResult.rows[0] as any)?.now;
    const dbVersion = (rawResult.rows[0] as any)?.version;

    // 2. Try to read data from the users table
    let readStatus = 'untested';
    let userCount = 0;
    let readError = null;

    try {
      const usersData = await db.select().from(schema.users).limit(10);
      readStatus = 'success';
      userCount = usersData.length;
    } catch (err: any) {
      readStatus = 'failed';
      readError = err.message || err.toString();
    }

    res.json({
      status: 'ok',
      message: 'Successfully connected to database!',
      connectionDetails,
      ping: {
        timeMs: pingTimeMs,
        dbTime,
        dbVersion,
      },
      readTest: {
        status: readStatus,
        table: 'users',
        recordCountRetrieved: userCount,
        error: readError,
        helpMessage:
          readStatus === 'failed'
            ? "Database connection works, but querying users table failed. This usually means migrations haven't been run. Run `npm run db:migrate` to create tables."
            : undefined,
      },
    });
  } catch (err: any) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to connect to database.',
      connectionDetails,
      error: err.message || err.toString(),
    });
  }
}
