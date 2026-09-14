#!/usr/bin/env node
// scripts/verify-quiz-enrollment-e2e.ts
// End-to-end verification of the quiz-submission enrollment gate:
//   - online: POST /api/quizzes/:id/submit requires an enrollment row for the
//     quiz's course (403 otherwise; a learner who IS enrolled succeeds).
//   - offline: /api/sync rejects the unenrolled quiz submission PER ITEM
//     (skips the item, reports it in rejectedQuizzes, writes no attempt and no
//     certificate) while still processing a valid sibling in the same batch.
// The client surfaces rejected items via BannerOffline's 'warning' state
// (asserted in the transcript below as an HTTP/DB contract; the DOM banner
// render is checked separately in the browser flow).
// Cleanup runs in `finally`. Usage: npx tsx scripts/verify-quiz-enrollment-e2e.ts [--force]
//
// BROWSER FLOW (manual DOM check — the app's only auth path is Google popup, so a
// seeded learner session cannot be driven headlessly with the existing e2e tooling):
//   1. Run this script with --force to create the exact fixture users
//      (course with quiz + a learner enrolled elsewhere + a queued rejection),
//      keep the script's seeded course/learner around, then serves the learner shell
//      on https://localhost:3000 via `npm run dev`.
//   2. Sign in as the mixed learner (X), go offline in DevTools, wait for the
//      "Working offline" banner, navigate to quiz Q in course C and submit it.
//   3. Go online — BannerOffline runs the sync. Expected render:
//        - #connection-sync-banner shows the warning styling (bg-ochre/10 border-ochre/40)
//        - icon is an AlertTriangle
//        - title: "Sync completed with warnings"
//        - message contains "1 saved quiz attempt was not recorded: You must be
//          enrolled in the course to submit the quiz (Quiz <id>). Contact your
//          administrator if you believe this is an error."
//        - the message does NOT auto-dismiss after 5s (success path only)
//        - the local sync queue is empty afterwards.

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
  const adminUid = `e2e-a3-${rand}`;
  const adminEmail = `e2e.a3.${rand}@example.com`;
  const enrolledUid = `e2e-enrolled-${rand}`;
  const enrolledEmail = `e2e.enrolled.${rand}@example.com`;
  const mixedUid = `e2e-mixed-${rand}`;
  const mixedEmail = `e2e.mixed.${rand}@example.com`;
  const createdAuthUids = [adminUid, enrolledUid, mixedUid];

  const courseIds: number[] = [];

  console.log('\n===============================================');
  console.log('  QUIZ ENROLLMENT GATE — END-TO-END VERIFICATION');
  console.log('===============================================');
  console.log(` DB target : ${DATABASE_URL.split('@')[1] || DATABASE_URL}`);
  console.log(` admin uid  : ${adminUid}`);
  console.log(` enrolled   : ${enrolledUid} (enrolled in course C)`);
  console.log(` mixed      : ${mixedUid} (enrolled in course C2, NOT in C)`);
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

  const step = (n: number, title: string) => {
    console.log('\n───────────────────────────────────────────────');
    console.log(` SCENARIO ${n}: ${title}`);
    console.log('───────────────────────────────────────────────');
  };
  const ok = (msg: string) => console.log(`  ✅ ${msg}`);
  const fail = (msg: string) => console.log(`  ❌ ${msg}`);

  let failures = 0;
  const expectStatus = async (label: string, res: Response, expected: number) => {
    const body: any = await res.json().catch(() => ({}));
    const pass = res.status === expected;
    console.log(`   ${label}: HTTP ${res.status}${pass ? '' : ` (${JSON.stringify(body)})`}`);
    if (pass) {
      ok(`${label} returned ${expected} as expected`);
    } else {
      fail(`${label} expected ${expected}, got ${res.status}`);
      failures++;
    }
    return body;
  };

  const assertTrue = (cond: boolean, msg: string) => {
    if (cond) {
      ok(msg);
    } else {
      fail(msg);
      failures++;
    }
  };

  try {
    const app = await createApp();
    server = app.listen(0);
    const address = server.address() as any;
    baseUrl = `http://127.0.0.1:${address.port}`;
    ok(`Express app up at ${baseUrl}`);

    // ------------------------------------------------------------------
    // Seed: Firebase users + DB rows
    // ------------------------------------------------------------------
    await adminAuth.createUser({ uid: adminUid, email: adminEmail, displayName: 'E2E Admin' });
    await pool.query(
      `INSERT INTO users (uid, email, name, role, onboarding_status)
       VALUES ($1, $2, $3, 'admin', 'active') ON CONFLICT (email) DO UPDATE SET role='admin', onboarding_status='active'`,
      [adminUid, adminEmail.toLowerCase(), 'E2E Admin'],
    );
    const adminToken = await mintIdToken(adminUid, adminEmail);

    for (const [uid, email, name] of [
      [enrolledUid, enrolledEmail, 'E2E Enrolled'],
      [mixedUid, mixedEmail, 'E2E Mixed'],
    ] as const) {
      await adminAuth.createUser({ uid, email, displayName: name });
      await pool.query(
        `INSERT INTO users (uid, email, name, role, onboarding_status)
         VALUES ($1, $2, $3, 'learner', 'active') ON CONFLICT (email) DO UPDATE SET role='learner', onboarding_status='active'`,
        [uid, email.toLowerCase(), name],
      );
    }
    const enrolledToken = await mintIdToken(enrolledUid, enrolledEmail);
    const mixedToken = await mintIdToken(mixedUid, mixedEmail);
    ok(`Admin, enrolled learner (L), mixed learner (X) auth+DB seeded (learner/active)`);

    // ------------------------------------------------------------------
    // SETUP: admin creates course C (quiz Q) and course C2 (quiz Q2);
    // L enrolls in C, X enrolls in C2 only.
    // ------------------------------------------------------------------
    step(1, 'Setup — courses/quizzes created; L in C, X in C2 only');
    let res = await apiFetch('/api/admin/courses', adminToken, {
      method: 'POST',
      body: JSON.stringify({ title: `E2E-C-${rand}`, description: 'Enrollment gate fixture C' }),
    });
    let body: any = await res.json();
    if (body?.id == null) throw new Error(`Course C creation failed: ${res.status} ${JSON.stringify(body)}`);
    const courseIdC = body.id;
    courseIds.push(courseIdC);

    res = await apiFetch('/api/admin/courses', adminToken, {
      method: 'POST',
      body: JSON.stringify({ title: `E2E-C2-${rand}`, description: 'Enrollment gate fixture C2' }),
    });
    body = await res.json();
    if (body?.id == null) throw new Error(`Course C2 creation failed: ${res.status} ${JSON.stringify(body)}`);
    const courseIdC2 = body.id;
    courseIds.push(courseIdC2);

    const mkQuiz = (courseId: number) =>
      apiFetch(`/api/admin/courses/${courseId}/quiz`, adminToken, {
        method: 'POST',
        body: JSON.stringify({
          title: `E2E-quiz-${courseId}-${rand}`,
          questions: [{ questionText: 'Pick A', options: ['A', 'B'], correctOptionIndex: 0 }],
        }),
      });
    body = await (await mkQuiz(courseIdC)).json();
    if (body?.quizId == null) throw new Error(`Quiz Q creation failed: ${JSON.stringify(body)}`);
    const quizIdQ = body.quizId;
    body = await (await mkQuiz(courseIdC2)).json();
    if (body?.quizId == null) throw new Error(`Quiz Q2 creation failed: ${JSON.stringify(body)}`);
    const quizIdQ2 = body.quizId;
    ok(`Courses C=${courseIdC} (quiz Q=${quizIdQ}) and C2=${courseIdC2} (quiz Q2=${quizIdQ2}) created`);

    res = await apiFetch('/api/enrollments', enrolledToken, {
      method: 'POST',
      body: JSON.stringify({ courseId: courseIdC }),
    });
    if (res.status !== 200) throw new Error(`L enroll C failed: ${res.status} ${await res.text()}`);
    ok(`L enrolled in course C`);

    res = await apiFetch('/api/enrollments', mixedToken, {
      method: 'POST',
      body: JSON.stringify({ courseId: courseIdC2 }),
    });
    if (res.status !== 200) throw new Error(`X enroll C2 failed: ${res.status} ${await res.text()}`);
    ok(`X enrolled in course C2 only (NOT in C)`);

    // ------------------------------------------------------------------
    // SCENARIO 1: online submit
    // ------------------------------------------------------------------
    step(2, 'Online submit — X (not enrolled in C) blocked with 403; L (enrolled) succeeds');
    res = await apiFetch(`/api/quizzes/${quizIdQ}/submit`, mixedToken, {
      method: 'POST',
      body: JSON.stringify({ answers: [0] }),
    });
    body = await expectStatus('X submits quiz Q (course C)', res, 403);
    assertTrue(/must be enrolled/.test(body?.error || ''), `403 error explains enrollment: "${body?.error}"`);
    const attemptQForX = await pool.query(
      'SELECT id FROM quiz_attempts WHERE user_id = (SELECT id FROM users WHERE uid=$1) AND quiz_id = $2',
      [mixedUid, quizIdQ],
    );
    assertTrue(attemptQForX.rows.length === 0, 'No quiz_attempts row written for X on Q');

    res = await apiFetch(`/api/quizzes/${quizIdQ}/submit`, enrolledToken, {
      method: 'POST',
      body: JSON.stringify({ answers: [0] }),
    });
    await expectStatus('L submits quiz Q (course C)', res, 200);
    const attemptQForL = await pool.query(
      'SELECT id FROM quiz_attempts WHERE user_id = (SELECT id FROM users WHERE uid=$1) AND quiz_id = $2',
      [enrolledUid, quizIdQ],
    );
    assertTrue(attemptQForL.rows.length === 1, 'quiz_attempts row written for enrolled learner L on Q');

    // ------------------------------------------------------------------
    // SCENARIO 2: offline sync with mixed batch — per-item rejection
    // ------------------------------------------------------------------
    step(3, 'Offline sync mixed batch — Q rejected per-item, Q2 still processed');
    res = await apiFetch('/api/sync', mixedToken, {
      method: 'POST',
      body: JSON.stringify({
        lessonCompletions: [],
        quizSubmissions: [
          { quizId: quizIdQ, answers: [0] },
          { quizId: quizIdQ2, answers: [0] },
        ],
      }),
    });
    body = await res.json();
    console.log(`   /api/sync HTTP ${res.status}`);
    console.log(`   rejectedQuizzes : ${JSON.stringify(body?.rejectedQuizzes)}`);
    console.log(`   processedQuizzes: ${JSON.stringify(body?.processedQuizzes?.map((p: any) => p.quizId))}`);
    assertTrue(
      res.status === 200 && body?.success === true,
      'Sync returned 200 success (partial batch is not a transport failure)',
    );
    const rejectedQ = (body?.rejectedQuizzes || []).find((r: any) => r.quizId === quizIdQ);
    const rejectedQ2 = (body?.rejectedQuizzes || []).find((r: any) => r.quizId === quizIdQ2);
    const processedQ2 = (body?.processedQuizzes || []).find((p: any) => p.quizId === quizIdQ2);
    assertTrue(
      !!rejectedQ && /must be enrolled/.test(rejectedQ.reason),
      `Q rejected per-item with enrollment reason: "${rejectedQ?.reason}"`,
    );
    assertTrue(!!processedQ2, 'Q2 (enrolled course) processed successfully in SAME batch');
    assertTrue(!rejectedQ2, 'Q2 is NOT in rejectedQuizzes');

    const attemptQForX2 = await pool.query(
      'SELECT id FROM quiz_attempts WHERE user_id = (SELECT id FROM users WHERE uid=$1) AND quiz_id = $2',
      [mixedUid, quizIdQ],
    );
    assertTrue(
      attemptQForX2.rows.length === 0,
      'Rejected item wrote NO quiz_attempts row (not silently written along the sync path)',
    );
    const attemptQ2ForX = await pool.query(
      'SELECT id FROM quiz_attempts WHERE user_id = (SELECT id FROM users WHERE uid=$1) AND quiz_id = $2',
      [mixedUid, quizIdQ2],
    );
    assertTrue(attemptQ2ForX.rows.length === 1, 'Valid sibling item DID write its quiz_attempts row');

    const certXinC = await pool.query(
      `SELECT 1 FROM issued_certificates WHERE user_id = (SELECT id FROM users WHERE uid=$1) AND course_id = $2`,
      [mixedUid, courseIdC],
    );
    assertTrue(
      certXinC.rows.length === 0,
      'No certificate issued to X for course C (rejected item never reaches cert path)',
    );

    const unenrolledRow = await pool.query(
      `SELECT 1 FROM enrollments WHERE user_id = (SELECT id FROM users WHERE uid=$1) AND course_id = $2`,
      [mixedUid, courseIdC],
    );
    assertTrue(unenrolledRow.rows.length === 0, 'X genuinely has no enrollment row for C (fixture sanity)');

    console.log('\n═══════════════════════════════════════════════');
    console.log(failures === 0 ? ' ALL SCENARIOS PASSED ✅' : ` ${failures} ASSERTION(S) FAILED ❌`);
    console.log('═══════════════════════════════════════════════');
  } finally {
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
    if (courseIds.length > 0) {
      try {
        const deleted = await pool.query(`DELETE FROM courses WHERE id = ANY($1::int[])`, [courseIds]);
        console.log(
          `  ✅ Courses deleted (id in ${courseIds.join(',')}) — cascades quizzes/questions/attempts/certificates/enrollments`,
        );
        if (deleted.rowCount !== courseIds.length) {
          console.log('  ⚠️  Some course rows were missing (already deleted?)');
        }
      } catch (e: any) {
        console.log(`  ❌ Course deletion error: ${e?.message}`);
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
    for (const uid of createdAuthUids) {
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
  if (failures > 0) process.exitCode = 1;
}

main().catch(async (err) => {
  console.error('\n💥 Unexpected fatal error:', err);
  process.exit(1);
});
