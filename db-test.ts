import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

console.log('SQL_PASSWORD is:', typeof process.env.SQL_PASSWORD, process.env.SQL_PASSWORD ? 'Set' : 'Not Set');

import { db } from './src/db/index.ts';
import { users } from './src/db/schema.ts';

async function test() {
  try {
    const list = await db.select().from(users);
    console.log('Success, user count:', list.length);
    process.exit(0);
  } catch (err) {
    console.error('DB Error:', err);
    process.exit(1);
  }
}
test();
