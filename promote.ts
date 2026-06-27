import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { db } from './src/db/index.ts';
import { users } from './src/db/schema.ts';

async function promoteUsers() {
  console.log('Promoting all users to admin role...');
  try {
    const result = await db.update(users).set({ role: 'admin' });
    console.log('Update successful! All existing users are now admins.');
    process.exit(0);
  } catch (error) {
    console.error('Error updating users:', error);
    process.exit(1);
  }
}

promoteUsers();
