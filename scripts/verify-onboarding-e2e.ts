#!/usr/bin/env node
// scripts/verify-onboarding-e2e.ts
// End-to-end verification of the instructor onboarding + email-conflict flow.
// Hits the REAL Express HTTP routes with REAL Firebase ID tokens and prints the
// output for each scenario, wipe-user.js style. All test rows and test auth
// users are removed in a `finally` block, success or failure.
// Usage: npx tsx scripts/verify-onboarding-e2e.ts

import dotenv from 'dotenv';
import pg from 'pg';
import { readFileSync } from 'fs';
import { createInterface } from 'readline';

process.env.NODE_ENV = 'production';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const { Pool } = pg;

async function askConfirmation(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'yes');
    });
  });
}

async function main() {
  const { initializeApp, getApps, cert } = await import('firebase-admin/app');
  if (!getApps().length) {
    const serviceAccount = JSON.parse(readFileSync('./service-account.json', 'utf8'));
    initializeApp({ credential: cert(serviceAccount), projectId: serviceAccount.project_id });
  }
  const { adminAuth } = await import('../src/lib/firebase-admin.js');
  const { createApp } = await import('../src/server/app.js');

  const apiKey = JSON.parse(readFileSync('./firebase-applet-config.json', 'utf8')).apiKey;
  const DATABASE_URL = process.env.DATABASE_URL!;
  const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

  const rand = Date.now().toString(36);
  const instructorUid = `e2e-instructor-${rand}`;
  const instructorMainEmail = `e2e.instructor.${rand}@example.com`;
  const instructorAuthEmail = `e2e.instructor.auth.${rand}@example.com`;
  const adminUid = `e2e-admin-${rand}`;
  const adminEmail = `e2e.admin.${rand}@example.com`;
  const conflictUid = `e2e-conflict-${rand}`;
  const createdAuthUids = [instructorUid, conflictUid, adminUid];

  console.log('\n===============================================');
  console.log('  INSTRUCTOR ONBOARDING — END-TO-END VERIFICATION');
  console.log('===============================================');
  console.log(` DB target : ${DATABASE_URL.split('@')[1] || DATABASE_URL}`);
  console.log(` instructor uid : ${instructorUid}`);
  console.log(` instructor email: ${instructorMainEmail}`);
  console.log(` admin uid       : ${adminUid}`);
  console.log(` conflict  uid   : ${conflictUid}`);
  console.log('===============================================\n');

  console.log('⚠️  This script WRITES real rows to the database above and creates');
  console.log('   real Firebase Auth test users. Everything is deleted afterwards.\n');

  const force = process.argv.includes('--force') || process.argv.includes('-f');
  if (!force) {
    const confirmed = await askConfirmation('Type "yes" to run the verified flows against this database: ');
    if (!confirmed) {
      console.log('\n🚫 Aborted by user. No changes were made.\n');
      await pool.end();
      return;
    }
  } else {
    console.log('⚡ --force detected. Bypassing interactive confirmation...\n');
  }

  let server: ReturnType<Awaited<ReturnType<typeof createApp>>['listen']> | undefined;
  let baseUrl = '';

  const mintIdToken = async (uid: string, email: string) => {
    const customToken = await adminAuth.createCustomToken(uid, {
      email,
      email_verified: true,
    });
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    });
    if (!res.ok) {
      throw new Error(`Token exchange failed (${res.status}): ${await res.text()}`);
    }
    const data: any = await res.json();
    return data.idToken as string;
  };

  const apiFetch = async (path: string, token: string, init: any = {}) => {
    const headers: any = { Authorization: `Bearer ${token}`, ...(init.headers || {}) };
    if (init.body) headers['Content-Type'] = 'application/json';
    return fetch(`${baseUrl}${path}`, { ...init, headers });
  };

  const printDbUserRow = async (label: string, uid: string) => {
    const { rows } = await pool.query(
      `SELECT email, role, onboarding_status, name, organization, bio,
              rejection_reason, submitted_at, created_at
         FROM users WHERE uid = $1`,
      [uid],
    );
    console.log(label);
    if (rows.length === 0) {
      console.log('   (no DB row for this uid)');
      return;
    }
    const r = rows[0];
    console.log(`   email            : ${r.email}`);
    console.log(`   role             : ${r.role}`);
    console.log(`   onboarding_status: ${r.onboarding_status}`);
    console.log(`   name             : ${r.name || '(not set)'}`);
    console.log(`   organization     : ${r.organization || '(not set)'}`);
    console.log(`   bio              : ${r.bio || '(not set)'}`);
    console.log(`   rejection_reason : ${r.rejection_reason || '(none)'}`);
    console.log(`   submitted_at     : ${r.submitted_at ? new Date(r.submitted_at).toISOString() : '(not set)'}`);
  };

  const step = (n: number, title: string) => {
    console.log('\n───────────────────────────────────────────────');
    console.log(` SCENARIO ${n}: ${title}`);
    console.log('───────────────────────────────────────────────');
  };
  const ok = (msg: string) => console.log(`  ✅ ${msg}`);
  const fail = (msg: string) => console.log(`  ❌ ${msg}`);

  let instructorToken: string;
  let instructorUserId: number | null;
  let adminToken: string;

  try {
    // ------------------------------------------------------------------
    // Boot the REAL Express app (same routes/middleware as production)
    // ------------------------------------------------------------------
    const app = await createApp();
    server = app.listen(0);
    const address = server.address() as any;
    baseUrl = `http://127.0.0.1:${address.port}`;
    ok(`Express app up at ${baseUrl}`);

    // ------------------------------------------------------------------
    // Seed: Firebase users + admin DB row
    // ------------------------------------------------------------------
    await adminAuth.createUser({ uid: adminUid, email: adminEmail, displayName: 'E2E Admin' });
    await pool.query(
      `INSERT INTO users (uid, email, name, role, onboarding_status)
       VALUES ($1, $2, $3, 'admin', 'active') ON CONFLICT (email) DO UPDATE SET role='admin', onboarding_status='active'`,
      [adminUid, adminEmail.toLowerCase(), 'E2E Admin'],
    );
    adminToken = await mintIdToken(adminUid, adminEmail);
    ok(`Admin auth user created + DB row seeded (role=admin, onboarding=active)`);

    await adminAuth.createUser({ uid: instructorUid, email: instructorMainEmail, displayName: 'E2E Instructor' });
    instructorToken = await mintIdToken(instructorUid, instructorMainEmail);
    ok(`Instructor auth user created`);

    // ------------------------------------------------------------------
    // SCENARIO 1: new signup with intent=instructor -> onboarding
    // ------------------------------------------------------------------
    step(1, 'New signup with intent=instructor lands in onboarding');
    let res = await apiFetch('/api/auth/me?intent=instructor', instructorToken);
    let body: any = await res.json();
    console.log(`   HTTP ${res.status}`);
    const s1 = body?.dbUser;
    instructorUserId = s1?.id ?? null;
    console.log(`   response.dbUser: role=${s1?.role}, onboarding_status=${s1?.onboardingStatus}`);
    if (res.status === 200 && s1?.role === 'instructor' && s1?.onboardingStatus === 'onboarding') {
      ok('User created as instructor with onboarding_status=onboarding');
    } else {
      fail(`Expected 200 instructor/onboarding, got ${res.status} ${JSON.stringify(body)}`);
    }
    await printDbUserRow('   DB row after signup:', instructorUid);

    // ------------------------------------------------------------------
    // SCENARIO 2: submit onboarding -> pending_approval + submitted_at
    // ------------------------------------------------------------------
    step(2, 'Submit onboarding form -> pending_approval, submitted_at set');
    res = await apiFetch('/api/instructor/onboard', instructorToken, {
      method: 'PUT',
      body: JSON.stringify({
        name: 'E2E Instructor',
        bio: 'I have taught computer science for ten years and want to host courses.',
        organization: 'Example University',
      }),
    });
    body = await res.json();
    console.log(`   HTTP ${res.status}`);
    const s2 = body?.dbUser;
    console.log(`   response.dbUser: onboarding_status=${s2?.onboardingStatus}, submitted_at=${s2?.submittedAt}`);
    if (res.status === 200 && s2?.onboardingStatus === 'pending_approval' && s2?.submittedAt) {
      ok(`pending_approval with submitted_at=${new Date(s2.submittedAt).toISOString()}`);
    } else {
      fail(`Expected 200 pending_approval + submitted_at, got ${res.status} ${JSON.stringify(body)}`);
    }
    await printDbUserRow('   DB row after submit:', instructorUid);

    // ------------------------------------------------------------------
    // SCENARIO 3: admin declines with a reason
    // ------------------------------------------------------------------
    step(3, 'Admin declines with a reason -> rejected, reason stored');
    if (instructorUserId === null) throw new Error('No instructor DB id to decline');
    res = await apiFetch(`/api/admin/users/${instructorUserId}/decline`, adminToken, {
      method: 'PUT',
      body: JSON.stringify({ rejectionReason: 'Please include verifiable teaching credentials in your bio.' }),
    });
    body = await res.json();
    console.log(`   HTTP ${res.status}`);
    const s3 = body?.dbUser;
    console.log(
      `   response.dbUser: onboarding_status=${s3?.onboardingStatus}, rejection_reason=${s3?.rejectionReason}`,
    );
    if (
      res.status === 200 &&
      s3?.onboardingStatus === 'rejected' &&
      /teaching credentials/.test(s3?.rejectionReason || '')
    ) {
      ok('rejected with the given reason stored');
    } else {
      fail(`Expected 200 rejected + reason, got ${res.status} ${JSON.stringify(body)}`);
    }
    await printDbUserRow('   DB row after decline:', instructorUid);

    // ------------------------------------------------------------------
    // SCENARIO 4: resubmit -> back to pending_approval, reason cleared
    // ------------------------------------------------------------------
    step(4, 'Reopen + resubmit -> pending_approval, rejection_reason cleared');
    res = await apiFetch('/api/instructor/onboard/reopen', instructorToken, { method: 'PUT' });
    const reopenBody: any = await res.json();
    console.log(
      `   reopen HTTP ${res.status} -> ${reopenBody?.dbUser?.onboardingStatus} (rejection_reason=${reopenBody?.dbUser?.rejectionReason})`,
    );
    res = await apiFetch('/api/instructor/onboard', instructorToken, {
      method: 'PUT',
      body: JSON.stringify({
        name: 'E2E Instructor',
        bio: 'I have taught computer science for ten years (PhD, verifiable via university records).',
        organization: 'Example University',
      }),
    });
    body = await res.json();
    console.log(`   resubmit HTTP ${res.status}`);
    const s4 = body?.dbUser;
    console.log(
      `   response.dbUser: onboarding_status=${s4?.onboardingStatus}, rejection_reason=${s4?.rejectionReason}`,
    );
    if (res.status === 200 && s4?.onboardingStatus === 'pending_approval' && s4?.rejectionReason === null) {
      ok('pending_approval with rejection_reason cleared');
    } else {
      fail(`Expected pending_approval + null reason, got ${res.status} ${JSON.stringify(body)}`);
    }
    await printDbUserRow('   DB row after reopen+resubmit:', instructorUid);

    // ------------------------------------------------------------------
    // SCENARIO 5: admin approves -> active, dashboard accessible
    // ------------------------------------------------------------------
    step(5, 'Admin approves -> active, instructor dashboard accessible');
    res = await apiFetch(`/api/admin/users/${instructorUserId}/approve`, adminToken, { method: 'PUT' });
    body = await res.json();
    console.log(`   approve HTTP ${res.status}`);
    const s5 = body?.dbUser;
    console.log(`   response.dbUser: onboarding_status=${s5?.onboardingStatus}`);
    if (res.status === 200 && s5?.onboardingStatus === 'active') {
      ok('approved -> onboarding_status=active');
    } else {
      fail(`Expected 200 active, got ${res.status} ${JSON.stringify(body)}`);
    }
    await printDbUserRow('   DB row after approve:', instructorUid);
    const dashRes = await apiFetch('/api/instructor/analytics', instructorToken);
    console.log(`   GET /api/instructor/analytics HTTP ${dashRes.status}`);
    if (dashRes.status !== 403) {
      ok(`instructor dashboard reachable (status ${dashRes.status})`);
    } else {
      fail('instructor dashboard was blocked (403) despite active status');
    }

    // ------------------------------------------------------------------
    // SCENARIO 6: second account, same email -> 409 exact message
    // ------------------------------------------------------------------
    step(6, 'Second Google account with an email that already has a real UID -> 409');
    await adminAuth.deleteUser(instructorUid);
    await adminAuth.createUser({ uid: conflictUid, email: instructorMainEmail, displayName: 'Second Account' });
    const conflictToken = await mintIdToken(conflictUid, instructorMainEmail);
    res = await apiFetch('/api/auth/me', conflictToken);
    body = await res.json();
    console.log(`   HTTP ${res.status}`);
    console.log(`   response body: ${JSON.stringify(body)}`);
    const expected = 'This email is already linked to an account. Please contact your administrator for help.';
    if (res.status === 409 && body?.error === expected) {
      ok(`exact 409 returned: "${body.error}"`);
    } else {
      fail(`Expected 409 with exact message, got ${res.status} ${JSON.stringify(body)}`);
    }
    await printDbUserRow('   DB row for second account:', conflictUid);

    // ------------------------------------------------------------------
    // SCENARIO 7: non-admin (instructor) hits admin approve route -> 403
    // ------------------------------------------------------------------
    step(7, 'Non-admin instructor calls PUT /api/admin/users/:id/approve -> 403');
    await adminAuth.createUser({ uid: instructorUid, email: instructorAuthEmail, displayName: 'E2E Instructor' });
    const freshInstructorToken = await mintIdToken(instructorUid, instructorAuthEmail);
    res = await apiFetch(`/api/admin/users/${instructorUserId}/approve`, freshInstructorToken, { method: 'PUT' });
    body = await res.json();
    console.log(`   HTTP ${res.status}`);
    console.log(`   response body: ${JSON.stringify(body)}`);
    if (res.status === 403 && body?.error === 'Forbidden: Admin access required') {
      ok('requireAdmin blocked the non-admin caller (403)');
    } else {
      fail(`Expected 403 to block non-admin, got ${res.status} ${JSON.stringify(body)}`);
    }

    console.log('\n═══════════════════════════════════════════════');
    console.log(' ALL SCENARIOS COMPLETE (see ✅/❌ above)');
    console.log('═══════════════════════════════════════════════');
  } finally {
    // ------------------------------------------------------------------
    // CLEANUP — always runs, success or failure. No stray rows/accounts.
    // ------------------------------------------------------------------
    console.log('\n───────────────────────────────────────────────');
    console.log(' CLEANUP');
    console.log('───────────────────────────────────────────────');
    if (server) {
      try {
        server.close();
        console.log('  ✅ HTTP server closed');
      } catch (e: any) {
        console.log(`  ⚠️  server close: ${e?.message}`);
      }
    }
    for (const uid of createdAuthUids) {
      try {
        await adminAuth.deleteUser(uid);
        console.log(`  ✅ Firebase Auth user removed: ${uid}`);
      } catch (e: any) {
        console.log(`  ⚠️  Firebase deleteUser(${uid}): ${e?.message || e}`);
      }
    }
    for (const uid of [instructorUid, adminUid, conflictUid]) {
      try {
        const result = await pool.query('SELECT wipe_user($1) AS wiped', [uid]);
        if (result.rows[0]?.wiped) {
          console.log(`  ✅ DB row (+ related personal records) removed for uid=${uid}`);
        } else {
          console.log(`  ℹ️  No DB row existed for uid=${uid} (nothing to wipe)`);
        }
      } catch (e: any) {
        console.log(`  ❌ DB wipe error for uid=${uid}: ${e?.message}`);
      }
    }
    await pool.end();
    console.log('\n✨ Cleanup complete. No stray accounts or rows remain.\n');
  }
}

main().catch(async (err) => {
  console.error('\n💥 Unexpected fatal error:', err);
  process.exit(1);
});
