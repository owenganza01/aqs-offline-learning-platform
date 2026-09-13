#!/usr/bin/env node
// scripts/wipe-user.js
// Completely wipes a user account across Supabase Postgres and Firebase Auth.
// Usage: node scripts/wipe-user.js <uid-or-email> [--force]
//        npm run wipe-user -- <uid-or-email> [--force]

import pg from 'pg';
import { readFileSync, existsSync } from 'fs';
import { createInterface } from 'readline';
import dotenv from 'dotenv';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

// ---------------------------------------------------------------------------
// 1. Parse CLI Arguments
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const force = args.includes('--force') || args.includes('-f');
const identifier = args.find((a) => !a.startsWith('-'));

if (!identifier) {
  console.error('\n❌ Error: Missing user identifier (UID or email).');
  console.error('\nUsage:');
  console.error('  npm run wipe-user -- <uid-or-email> [--force]');
  console.error('  node scripts/wipe-user.js <uid-or-email> [--force]\n');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 2. Initialize Database Client
// ---------------------------------------------------------------------------
const DATABASE_URL = process.env.DATABASE_URL;
let dbClient;

if (DATABASE_URL) {
  dbClient = new pg.Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
} else if (process.env.SQL_HOST) {
  dbClient = new pg.Client({
    host: process.env.SQL_HOST,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    database: process.env.SQL_DB_NAME,
    ssl: process.env.SQL_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
} else {
  console.error('❌ Error: No database configuration found. Please set DATABASE_URL in .env.local');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 3. Initialize Firebase Admin SDK
// ---------------------------------------------------------------------------
function initFirebaseAdmin() {
  if (getApps().length) {
    return getAuth();
  }

  const options = {};

  // Check emulator
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    options.projectId = process.env.FIREBASE_PROJECT_ID || 'aqs-learning-local';
    initializeApp(options);
    return getAuth();
  }

  // Check inline service account JSON
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON.replace(/\\n/g, '\n').replace(
        /"private_key"\s*:\s*"([\s\S]*?)"/,
        (_m, key) => `"private_key": "${key.replace(/\n/g, '\\n').replace(/\r/g, '')}"`,
      );
      const serviceAccount = JSON.parse(rawJson);
      options.credential = cert(serviceAccount);
      if (serviceAccount.project_id) {
        options.projectId = serviceAccount.project_id;
      }
    } catch (err) {
      console.warn('⚠️  Warning: Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:', err.message);
    }
  }

  // Check file path
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './service-account.json';
  if (!options.credential && existsSync(credPath)) {
    try {
      const serviceAccount = JSON.parse(readFileSync(credPath, 'utf8'));
      options.credential = cert(serviceAccount);
      if (serviceAccount.project_id) {
        options.projectId = serviceAccount.project_id;
      }
    } catch (err) {
      console.warn(`⚠️  Warning: Failed to read credentials from ${credPath}:`, err.message);
    }
  }

  if (!options.projectId) {
    options.projectId = process.env.FIREBASE_PROJECT_ID || 'aqs-learning-local';
  }

  initializeApp(options);
  return getAuth();
}

const adminAuth = initFirebaseAdmin();

// ---------------------------------------------------------------------------
// 4. Prompt Helper
// ---------------------------------------------------------------------------
function askConfirmation(question) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

// ---------------------------------------------------------------------------
// 5. Main Execution
// ---------------------------------------------------------------------------
async function main() {
  await dbClient.connect();

  console.log('\n🔍 Looking up user:', identifier);

  // Look up user in Postgres
  const dbUserResult = await dbClient.query(
    'SELECT id, uid, email, name, role, created_at FROM users WHERE uid = $1 OR email = $1 LIMIT 1',
    [identifier],
  );

  const dbUser = dbUserResult.rows[0];
  let targetUid = dbUser?.uid;
  let targetEmail = dbUser?.email;
  let targetName = dbUser?.name;
  let createdAt = dbUser?.created_at;

  // If not in DB, check Firebase Auth
  if (!dbUser) {
    try {
      let fbUser;
      if (identifier.includes('@')) {
        fbUser = await adminAuth.getUserByEmail(identifier);
      } else {
        fbUser = await adminAuth.getUser(identifier);
      }
      targetUid = fbUser.uid;
      targetEmail = fbUser.email;
      targetName = fbUser.displayName;
      createdAt = fbUser.metadata?.creationTime;
      console.log('⚠️  User not found in Postgres, but found in Firebase Auth.');
    } catch (e) {
      if (e.code === 'auth/user-not-found') {
        console.error(`\n❌ User "${identifier}" was not found in either Postgres or Firebase Auth.`);
        await dbClient.end();
        process.exit(1);
      }
      console.error('Error querying Firebase Auth:', e.message);
    }
  }

  // Print account details
  console.log('\n========================================');
  console.log('       TARGET ACCOUNT IDENTIFIED        ');
  console.log('========================================');
  console.log(` UID:         ${targetUid || '(none)'}`);
  console.log(` Email:       ${targetEmail || '(none)'}`);
  console.log(` Name:        ${targetName || '(not set)'}`);
  console.log(` Role:        ${dbUser?.role || '(unknown)'}`);
  console.log(` Created At:  ${createdAt ? new Date(createdAt).toISOString() : '(unknown)'}`);
  console.log('========================================\n');

  // Confirmation prompt
  if (!force) {
    console.log('⚠️  WARNING: This will permanently wipe this user account, including:');
    console.log('   - Personal quiz attempts, lesson completions, course completions, and certificates');
    console.log('   - Course enrollments');
    console.log('   - User account profile and credentials in both Postgres and Firebase Auth');
    console.log('   (Authored courses and uploaded documents will be preserved with author snapshots)');
    console.log('   (Message history is preserved for the other participant: the wiped user\'s references');
    console.log('    are nulled and their display name kept via snapshots — no messages are deleted)\n');

    const confirmation = await askConfirmation('Type "yes" to confirm and proceed with the wipe: ');
    if (confirmation !== 'yes') {
      console.log('\n🚫 Wipe aborted by user. No changes were made.\n');
      await dbClient.end();
      process.exit(0);
    }
    console.log('');
  } else {
    console.log('⚡ --force flag detected. Bypassing interactive confirmation...\n');
  }

  // -------------------------------------------------------------------------
  // Step 1: Wipe Postgres records
  // -------------------------------------------------------------------------
  console.log(`⏳ [1/2] Executing wipe_user("${targetUid}") in Postgres...`);

  if (targetUid && dbUser) {
    try {
      const wipeResult = await dbClient.query('SELECT wipe_user($1) AS wiped', [targetUid]);
      const wiped = wipeResult.rows[0]?.wiped;

      if (!wiped) {
        console.error('❌ Postgres wipe failed: wipe_user returned false (user not found or foreign key constraint error).');
        console.error('⛔ Firebase Auth deletion will NOT proceed to prevent desynchronization.');
        await dbClient.end();
        process.exit(1);
      }

      console.log(
        '✅ [1/2] Postgres wipe succeeded: all personal records and user row deleted. Message history preserved for the other participant (FKs nulled, snapshots kept).',
      );
    } catch (err) {
      console.error('❌ Postgres wipe error:', err.message);
      console.error('⛔ Firebase Auth deletion will NOT proceed.');
      await dbClient.end();
      process.exit(1);
    }
  } else {
    console.log('ℹ️  Skipping Postgres wipe (user did not exist in database).');
  }

  // -------------------------------------------------------------------------
  // Step 2: Delete from Firebase Auth
  // -------------------------------------------------------------------------
  console.log(`⏳ [2/2] Deleting user "${targetUid}" from Firebase Auth...`);

  try {
    await adminAuth.deleteUser(targetUid);
    console.log('✅ [2/2] Firebase Auth user deleted successfully.');
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      console.log('⚠️  [2/2] User not found in Firebase Auth (already deleted or pending).');
    } else {
      console.error('❌ Firebase Auth deletion error:', err.message);
      await dbClient.end();
      process.exit(1);
    }
  }

  await dbClient.end();

  console.log('\n✨ Account wipe completed successfully across both systems!\n');
}

main().catch(async (err) => {
  console.error('\n💥 Unexpected fatal error during wipe:', err);
  try {
    await dbClient.end();
  } catch (_) {}
  process.exit(1);
});
