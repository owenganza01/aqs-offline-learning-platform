// src/db/index.ts
import { drizzle } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
const { Pool } = pkg;
import * as schema from './schema.js';
import dotenv from 'dotenv';

// Load environment variables BEFORE creating the pool.
// In ESM, server.ts's dotenv.config() runs AFTER this module is imported,
// so process.env is empty when the Pool is created. This fixes that.
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

// Create a new connection pool using the Object Method or connection string
export const createPool = () => {
  const connectionString = process.env.DATABASE_URL;
  const useSsl =
    process.env.SQL_SSL !== 'false' &&
    (process.env.SQL_SSL === 'true' ||
      (!!connectionString && !connectionString.includes('localhost') && !connectionString.includes('127.0.0.1')));

  const config: any = {
    max: 25,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
  };

  if (connectionString) {
    config.connectionString = connectionString;
  } else {
    config.host = process.env.SQL_HOST;
    config.user = process.env.SQL_USER;
    config.password = process.env.SQL_PASSWORD;
    config.database = process.env.SQL_DB_NAME;
  }

  if (useSsl) {
    config.ssl = { rejectUnauthorized: false };
  } else {
    config.ssl = false;
  }

  return new Pool(config);
};

// Create the pool instance
const pool = createPool();

// Handle unexpected pool-level client errors gracefully
pool.on('error', (err) => {
  console.error('Unexpected error on idle SQL pool client:', err);
});

// Initialize and export the Drizzle database instance
export const db = drizzle(pool, { schema });

export async function shutdownDb() {
  await pool.end();
}
export type DatabaseType = typeof db;
export { schema };
