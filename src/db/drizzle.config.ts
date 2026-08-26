// src/db/drizzle.config.ts
import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';

// Load environment variables from .env.local file
dotenv.config({ path: '.env.local' });

const dbUrl = process.env.DATABASE_URL;

let dbCredentials: any;

if (dbUrl) {
  console.log('Using DATABASE_URL connection string for Drizzle Kit configuration.');
  dbCredentials = {
    url: dbUrl,
    ssl: { rejectUnauthorized: false },
  };
} else {
  const sqlHost = process.env.SQL_HOST;
  const sqlDbName = process.env.SQL_DB_NAME;
  const user = process.env.SQL_ADMIN_USER;
  const password = process.env.SQL_ADMIN_PASSWORD;

  if (!sqlHost || !sqlDbName || !user || !password) {
    throw new Error(
      'Either DATABASE_URL or (SQL_HOST, SQL_DB_NAME, SQL_ADMIN_USER, SQL_ADMIN_PASSWORD) must be set in environment variables.',
    );
  }

  console.log(`Using admin user: ${user} to configure Drizzle Kit.`);
  dbCredentials = {
    host: sqlHost,
    user: user,
    password: password,
    database: sqlDbName,
    ssl: false, // False when using Cloud SQL Local Proxy
  };
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle', // Output directory for migrations
  dialect: 'postgresql',
  schemaFilter: ['public'],
  dbCredentials,
  verbose: true,
});
