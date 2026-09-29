#!/usr/bin/env node
// scripts/verify-instructor-analytics-e2e.ts
// End-to-end verification of the instructor analytics scope + certificatesIssued + lessonCompletions:
//   - Instructor I owns course C (1 lesson + quiz, cert enabled). Admin owns course C2 (I does not).
//   - Learner L enrolls in C; completes it ONLINE (quiz submit → lesson complete → course complete)
//     which issues a certificate.
//   - GET /api/instructor/analytics: totalCourses=1, totalLearners=1, lessonCompletions=1,
//     certificatesIssued=1 (C2 excluded), courseStats[0].certificatesIssued=1, courseStats length 1.
//   - GET /api/admin/analytics: lessonCompletions>=1, totalLearnersCount>=1 (global scope sanity).
// Cleanup runs in `finally`. Usage: npx tsx scripts/verify-instructor-analytics-e2e.ts [--force]

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
  const adminUid = `e2e-admin-${rand}`;
  const adminEmail = `e2e.admin.${rand}@example.com`;
  const instructorUid = `e2e-inst-${rand}`;
  const instructorEmail = `e2e.inst.${rand}@example.com`;
  const learnerUid = `e2e-learner-${rand}`;
  const learnerEmail = `e2e.learner.${rand}@example.com`;
  const createdAuthUids = [adminUid, instructorUid, learnerUid];

  const courseIds: number[] = [];

  console.log('\n===============================================');
  console.log('  INSTRUCTOR ANALYTICS — END-TO-END VERIFICATION');
  console.log('===============================================');
  console.log(` DB target  : ${DATABASE_URL.split('@')[1] || DATABASE_URL}`);
  console.log(` admin uid  : ${adminUid}`);
  console.log(` instructor : ${instructorUid}`);
  console.log(` learner    : ${learnerUid}`);
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
    console.log(`   ${label}: HTTP ${res.status}${pass ? '' : ` (${JSON.stringify(body).slice(0, 200)})`}`);
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
    for (const [uid, email, name, role] of [
      [adminUid, adminEmail, 'E2E Admin', 'admin'],
      [instructorUid, instructorEmail, 'E2E Instructor', 'instructor'],
      [learnerUid, learnerEmail, 'E2E Learner', 'learner'],
    ] as const) {
      await adminAuth.createUser({ uid, email, displayName: name });
      await pool.query(
        `INSERT INTO users (uid, email, name, role, onboarding_status)
         VALUES ($1, $2, $3, $4, 'active') ON CONFLICT (email) DO UPDATE SET role=$4, onboarding_status='active'`,
        [uid, email.toLowerCase(), name, role],
      );
    }
    const adminToken = await mintIdToken(adminUid, adminEmail);
    const instructorToken = await mintIdToken(instructorUid, instructorEmail);
    const learnerToken = await mintIdToken(learnerUid, learnerEmail);
    ok(`Admin, Instructor, Learner auth+DB seeded (all active)`);

    // ------------------------------------------------------------------
    // SETUP: instructor creates course C (1 lesson + quiz); admin enables cert;
    // admin owns course C2 (I does NOT own it, no learner activity).
    // ------------------------------------------------------------------
    step(1, 'Setup — instructor-owned C + admin-owned C2');
    let res = await apiFetch('/api/admin/courses', instructorToken, {
      method: 'POST',
      body: JSON.stringify({ title: `E2E-C-${rand}`, description: 'Instructor analytics fixture' }),
    });
    let body: any = await res.json();
    if (body?.id == null) throw new Error(`Course C creation failed: ${res.status} ${JSON.stringify(body)}`);
    const courseIdC = body.id;
    courseIds.push(courseIdC);
    ok(`Course C created (id=${courseIdC}, instructor-owned)`);

    const lessonRes = await apiFetch(`/api/admin/courses/${courseIdC}/lessons`, instructorToken, {
      method: 'POST',
      body: JSON.stringify({ title: `Lesson-1-${rand}`, sortOrder: 1, content: `Lesson content ${rand}` }),
    });
    const lessonBody: any = await lessonRes.json();
    if (lessonBody?.id == null)
      throw new Error(`Lesson creation failed: ${lessonRes.status} ${JSON.stringify(lessonBody)}`);
    const lessonIdC = lessonBody.id;

    const quizRes = await apiFetch(`/api/admin/courses/${courseIdC}/quiz`, instructorToken, {
      method: 'POST',
      body: JSON.stringify({
        title: `Quiz-C-${rand}`,
        questions: [{ questionText: 'Pick A', options: ['A', 'B'], correctOptionIndex: 0 }],
      }),
    });
    const quizBody: any = await quizRes.json();
    if (quizBody?.quizId == null) throw new Error(`Quiz C creation failed: ${JSON.stringify(quizBody)}`);
    const quizIdC = quizBody.quizId;
    ok(`Course C seeded (1 lesson + quiz)`);

    const certConfigRes = await apiFetch(`/api/courses/${courseIdC}/certificate-config`, adminToken, {
      method: 'PUT',
      body: JSON.stringify({
        enabled: true,
        title: `Certificate C ${rand}`,
        issuer: 'AQS E2E',
        requireCourseCompletion: true,
        requireAssessment: true,
        minAssessmentScore: 70,
      }),
    });
    if (certConfigRes.status !== 200) {
      throw new Error(`Cert config failed: ${certConfigRes.status} ${await certConfigRes.text()}`);
    }
    ok(`Certificate config enabled for course C`);

    res = await apiFetch('/api/admin/courses', adminToken, {
      method: 'POST',
      body: JSON.stringify({ title: `E2E-C2-${rand}`, description: 'Admin-owned fixture (not I-owned)' }),
    });
    body = await res.json();
    if (body?.id == null) throw new Error(`Course C2 creation failed: ${res.status}`);
    const courseIdC2 = body.id;
    courseIds.push(courseIdC2);
    ok(`Course C2 created (id=${courseIdC2}, admin-owned, no learner activity)`);

    // L enrolls in C only
    res = await apiFetch('/api/enrollments', learnerToken, {
      method: 'POST',
      body: JSON.stringify({ courseId: courseIdC }),
    });
    if (res.status !== 200) throw new Error(`L enroll C failed: ${res.status} ${await res.text()}`);
    ok(`Learner enrolled in C`);

    // ------------------------------------------------------------------
    // SCENARIO 2: Online completion of C → certificate issued
    // ------------------------------------------------------------------
    step(2, 'Online completion — quiz submit, lesson complete, course complete → cert issued');
    res = await apiFetch(`/api/quizzes/${quizIdC}/submit`, learnerToken, {
      method: 'POST',
      body: JSON.stringify({ answers: [0] }),
    });
    if (res.status !== 200) throw new Error(`Quiz C submit failed: ${res.status}`);
    res = await apiFetch(`/api/lessons/${lessonIdC}/complete`, learnerToken, { method: 'POST' });
    if (res.status !== 200) throw new Error(`Lesson C complete failed: ${res.status}`);
    res = await apiFetch(`/api/courses/${courseIdC}/complete`, learnerToken, { method: 'POST' });
    if (res.status !== 200) throw new Error(`Course C complete failed: ${res.status}`);
    ok(`Online completion flow executed (quiz + lesson + course complete)`);

    const completionRow = await pool.query(
      `SELECT id FROM course_completions WHERE user_id = (SELECT id FROM users WHERE uid=$1) AND course_id = $2`,
      [learnerUid, courseIdC],
    );
    assertTrue(completionRow.rows.length === 1, `course_completions row recorded for (L, C)`);

    const certRows = await pool.query(
      `SELECT id FROM issued_certificates WHERE user_id = (SELECT id FROM users WHERE uid=$1) AND course_id = $2`,
      [learnerUid, courseIdC],
    );
    assertTrue(certRows.rows.length === 1, `Certificate issued (1 row in issued_certificates for C)`);

    // ------------------------------------------------------------------
    // SCENARIO 3: Instructor analytics — scope-correct + new fields
    // ------------------------------------------------------------------
    step(3, 'GET /api/instructor/analytics — scope + certificatesIssued + lessonCompletions');
    res = await apiFetch('/api/instructor/analytics', instructorToken);
    body = await res.json();
    console.log(`   HTTP ${res.status}`);
    console.log(`   totalCourses        : ${body.totalCourses}`);
    console.log(`   totalLearners       : ${body.totalLearners}`);
    console.log(`   lessonCompletions   : ${body.lessonCompletions}`);
    console.log(`   certificatesIssued  : ${body.certificatesIssued}`);
    console.log(`   courseStats.length  : ${body.courseStats?.length}`);
    if (body.courseStats?.length > 0) {
      const cs = body.courseStats[0];
      console.log(`   courseStats[0].title             : ${cs.title}`);
      console.log(`   courseStats[0].activeStudents    : ${cs.activeStudents}`);
      console.log(`   courseStats[0].certificatesIssued: ${cs.certificatesIssued}`);
      console.log(`   courseStats[0].lessonsCount      : ${cs.lessonsCount}`);
    }
    assertTrue(res.status === 200, 'Instructor analytics returned 200');
    assertTrue(body.totalCourses === 1, 'totalCourses = 1 (only I-owned C)');
    assertTrue(body.totalLearners === 1, 'totalLearners = 1 (L enrolled in C)');
    assertTrue(body.lessonCompletions === 1, 'lessonCompletions = 1');
    assertTrue(body.certificatesIssued === 1, 'certificatesIssued = 1');
    assertTrue(body.courseStats?.length === 1, 'courseStats length = 1 (C2 excluded)');
    if (body.courseStats?.length > 0) {
      const cs = body.courseStats[0];
      assertTrue(cs.activeStudents === 1, 'activeStudents = 1');
      assertTrue(cs.certificatesIssued === 1, 'per-course certificatesIssued = 1');
      assertTrue(cs.lessonsCount === 1, 'lessonsCount = 1');
    }
    assertTrue(!body.totalLearnersCount, 'totalLearnersCount absent (instructor contract uses totalLearners)');

    // ------------------------------------------------------------------
    // SCENARIO 4: Admin analytics — lessonCompletions field present
    // ------------------------------------------------------------------
    step(4, 'GET /api/admin/analytics — lessonCompletions field present (sanity)');
    res = await apiFetch('/api/admin/analytics', adminToken);
    body = await res.json();
    console.log(`   HTTP ${res.status}`);
    console.log(`   totalLearnersCount : ${body.totalLearnersCount}`);
    console.log(`   lessonCompletions  : ${body.lessonCompletions}`);
    assertTrue(res.status === 200, 'Admin analytics returned 200');
    assertTrue(typeof body.lessonCompletions === 'number', 'Admin contract includes lessonCompletions (number)');
    assertTrue(body.lessonCompletions >= 1, 'Admin lessonCompletions >= 1 (C completion counted globally)');
    assertTrue(body.totalLearnersCount >= 1, 'Admin totalLearnersCount >= 1 (L counted)');

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
        await pool.query(`DELETE FROM courses WHERE id = ANY($1::int[])`, [courseIds]);
        console.log(`  ✅ Courses deleted (cascade): ${courseIds.join(',')}`);
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
          console.log(`  ✅ DB row (+ personal records) removed for uid=${uid}`);
        } else {
          console.log(`  ℹ️  No DB row existed for uid=${uid}`);
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
