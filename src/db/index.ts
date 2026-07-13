// src/db/index.ts
import { drizzle } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
const { Pool } = pkg;
import * as schema from './schema.ts';
import dotenv from 'dotenv';

// Load environment variables BEFORE creating the pool.
// In ESM, server.ts's dotenv.config() runs AFTER this module is imported,
// so process.env is empty when the Pool is created. This fixes that.
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

// Create a new connection pool using the Object Method (as strictly mandated by instructions)
export const createPool = () => {
  return new Pool({
    host: process.env.SQL_HOST,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    database: process.env.SQL_DB_NAME,
    connectionTimeoutMillis: 15000,
  });
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
