#!/usr/bin/env node
// scripts/verify-fixes-phase1.ts
// Scripted validation for the Phase-1 fix series (learners roster, messaging,
// enrollment sync + mark-complete/sync-UI supporting server behavior):
//
//   A. Learners roster — role filter + participation union:
//        - agent with role=admin but a stray enrollment row is NOT in the roster;
//        - a learner with lesson-completion participation but NO enrollment row
//          (offline-era ghost) IS in the roster;
//        - the union only includes learners in courses the instructor owns.
//   B. Enrollment sync — /api/sync flushes pending `enrollments` FIRST, is
//        idempotent on replay, and the roster reflects the flushed enrollment.
//   C. Messaging — instructor-initiated thread via courseId+learnerId works for
//        the owning instructor; a non-owner instructor is rejected (403); a
//        learner with participation-but-no-enrollment-row can start a thread
//        (participation fallback); a stranger with no participation is 403'd;
//        an existing thread supports replies by conversationId.
//
// Cleanup runs in `finally`. Usage: npx tsx scripts/verify-fixes-phase1.ts [--force]

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
  const mk = (prefix: string) => `fix1-${prefix}-${rand}`;

  const roles: Record<string, { uid: string; email: string; name: string; role: string; onboarding: string }> = {};
  const defs = [
    ['kevin', 'admin', 'active'], // admin with a stray enrollment row (roster must EXCLUDE)
    ['instA', 'instructor', 'active'],
    ['instB', 'instructor', 'active'], // non-owner instructor (message gate)
    ['l1', 'learner', 'active'], // normally enrolled in courseA
    ['ghost', 'learner', 'active'], // participation but no enrollment row
    ['offline', 'learner', 'active'], // offline-enrolled; flushes via /api/sync
    ['stranger', 'learner', 'active'], // no enrollment, no participation
  ] as const;
  for (const [key, role, onboarding] of defs) {
    roles[key] = { uid: mk(key), email: `fix1.${key}.${rand}@example.com`, name: `Fix1 ${key}`, role, onboarding };
  }
  const createdAuthUids = Object.values(roles).map((r) => r.uid);
  const courseIds: number[] = [];

  console.log('\n===============================================');
  console.log('  PHASE-1 FIX SERIES — VERIFICATION (server-side)');
  console.log('===============================================');
  console.log(` DB target  : ${DATABASE_URL.split('@')[1] || DATABASE_URL}`);
  console.log(` roles      : kevin=admin instA instB l1 ghost offline stranger`);
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
    const customToken = await adminAuth.createCustomToken(uid, { email, email_verified: true });
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    });
    if (!res.ok) throw new Error(`Token exchange failed (${res.status}): ${await res.text()}`);
    const data: any = await res.json();
    return data.idToken as string;
  };

  const apiFetch = async (path: string, token: string, init: any = {}) => {
    const headers: any = { Authorization: `Bearer ${token}`, ...(init.headers || {}) };
    if (init.body) headers['Content-Type'] = 'application/json';
    return fetch(`${baseUrl}${path}`, { ...init, headers });
  };

  const step = (n: string, title: string) => {
    console.log('\n───────────────────────────────────────────────');
    console.log(` ${title}`);
    console.log('───────────────────────────────────────────────');
  };
  const ok = (msg: string) => console.log(`  ✅ ${msg}`);
  const fail = (msg: string) => console.log(`  ❌ ${msg}`);

  let failures = 0;
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

    // Seed users
    for (const r of Object.values(roles)) {
      await adminAuth.createUser({ uid: r.uid, email: r.email, displayName: r.name });
      await pool.query(
        `INSERT INTO users (uid, email, name, role, onboarding_status)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (email) DO UPDATE SET role=$4, onboarding_status=$5`,
        [r.uid, r.email.toLowerCase(), r.name, r.role, r.onboarding],
      );
    }
    const tokens: Record<string, string> = {};
    const dbIds: Record<string, number> = {};
    for (const key of Object.keys(roles)) {
      tokens[key] = await mintIdToken(roles[key].uid, roles[key].email);
      const row = await pool.query(`SELECT id FROM users WHERE uid = $1`, [roles[key].uid]);
      dbIds[key] = row.rows[0].id;
    }
    ok(`kevin=admin(${dbIds.kevin}) instA(${dbIds.instA}) instB(${dbIds.instB}) seeded`);

    // ------------------------------------------------------------------
    // SETUP: courseA (owned by A, 2 lessons), courseB (owned by B, 1 lesson)
    // ------------------------------------------------------------------
    step('Setup', 'courseA (owned by A, 2 lessons) + courseB (owned by B, 1 lesson)');

    const buildCourse = async (ownerToken: string, title: string, lessons: number) => {
      const res = await apiFetch('/api/admin/courses', ownerToken, {
        method: 'POST',
        body: JSON.stringify({ title: `${title}-${rand}`, description: `Fixture ${title}` }),
      });
      const body: any = await res.json();
      if (body?.id == null) throw new Error(`Course create failed: ${res.status} ${JSON.stringify(body)}`);
      const courseId = body.id;
      courseIds.push(courseId);
      const lessonIds: number[] = [];
      for (let ord = 1; ord <= lessons; ord++) {
        const lr = await apiFetch(`/api/admin/courses/${courseId}/lessons`, ownerToken, {
          method: 'POST',
          body: JSON.stringify({ title: `L${ord}-${title}`, sortOrder: ord, content: `Content ${title} ${ord}` }),
        });
        const lb: any = await lr.json();
        if (lb?.id == null) throw new Error(`Lesson create failed: ${lr.status} ${JSON.stringify(lb)}`);
        lessonIds.push(lb.id);
      }
      return { courseId, lessonIds };
    };

    const A = await buildCourse(tokens.instA, 'courseA', 2);
    const B = await buildCourse(tokens.instB, 'courseB', 1);
    ok(`courseA=${A.courseId} (lessons ${A.lessonIds}) courseB=${B.courseId}`);

    // ------------------------------------------------------------------
    // SCENARIO A: learners roster — role filter + participation union
    // ------------------------------------------------------------------
    step('SCENARIO A', 'Roster: excludes admin with stray enrollment; includes participation-only ghost');

    // l1: normal server enrollment.
    const l1Enroll = await apiFetch('/api/enrollments', tokens.l1, {
      method: 'POST',
      body: JSON.stringify({ courseId: A.courseId }),
    });
    assertTrue(l1Enroll.status === 200, `l1 enrolls in courseA via POST /api/enrollments (got ${l1Enroll.status})`);

    // kevin (admin): strays into courseA via a direct enrollment row — simulates
    // a legacy offline enrollment that silently landed in the enrollments table.
    await pool.query(`INSERT INTO enrollments (user_id, course_id) VALUES ($1, $2)`, [dbIds.kevin, A.courseId]);
    ok('Inserted stray enrollments row for kevin (admin) in courseA');

    // ghost: completes a lesson in courseA with NO enrollment row.
    const ghostComplete = await apiFetch(`/api/lessons/${A.lessonIds[0]}/complete`, tokens.ghost, {
      method: 'POST',
    });
    assertTrue(ghostComplete.status === 200, `ghost completes lesson in courseA online (got ${ghostComplete.status})`);
    const ghostRow = await pool.query(`SELECT id FROM lesson_completions WHERE user_id = $1 AND lesson_id = $2`, [
      dbIds.ghost,
      A.lessonIds[0],
    ]);
    assertTrue(ghostRow.rowCount === 1, 'lesson_completions row exists for ghost (participation evidence)');

    const aLearnersRes = await apiFetch('/api/instructor/learners', tokens.instA);
    const aLearnersBody: any = await aLearnersRes.json();
    if (aLearnersRes.status !== 200) throw new Error(`A learners failed: ${aLearnersRes.status}`);
    const aLearnerEmails = (aLearnersBody.learners || []).map((l: any) => l.email);
    assertTrue(aLearnersRes.status === 200, `A GET /api/instructor/learners → 200 (got ${aLearnersRes.status})`);
    assertTrue(
      aLearnerEmails.includes(roles.l1.email) && aLearnerEmails.includes(roles.ghost.email),
      `Roster includes l1 + ghost (got ${aLearnerEmails.join(', ')})`,
    );
    assertTrue(
      !aLearnerEmails.includes(roles.kevin.email),
      `Roster EXCLUDES admin kevin despite stray enrollment (got ${aLearnerEmails.join(', ')})`,
    );
    assertTrue(
      aLearnerEmails.every((e: string) => e.endsWith('@example.com')) && aLearnerEmails.length === 2,
      `Roster has exactly the 2 true learners (got ${aLearnerEmails.length})`,
    );

    const ghostEntry = (aLearnersBody.learners || []).find((l: any) => l.email === roles.ghost.email);
    assertTrue(
      ghostEntry?.enrolledCourses?.length === 1 && ghostEntry.enrolledCourses[0]?.id === A.courseId,
      'ghost enrolledCourses resolved to [courseA] via participation union (no enrollment row needed)',
    );

    // ------------------------------------------------------------------
    // SCENARIO B: enrollment sync — enrollments flush FIRST + idempotent
    // ------------------------------------------------------------------
    step('SCENARIO B', '/api/sync flushes pending enrollments first, idempotent on replay');

    const syncPayload = {
      enrollments: [{ courseId: A.courseId, enrolledAt: '2026-09-16T08:00:00.000Z' }],
      lessonCompletions: [{ lessonId: A.lessonIds[1] }],
      quizSubmissions: [],
    };
    let syncRes = await apiFetch('/api/sync', tokens.offline, {
      method: 'POST',
      body: JSON.stringify(syncPayload),
    });
    let syncBody: any = await syncRes.json();
    assertTrue(
      syncRes.status === 200 && syncBody?.success && Array.isArray(syncBody.processedEnrollments),
      `offline-learner /api/sync → 200 (got ${syncRes.status} ${JSON.stringify(syncBody)})`,
    );
    assertTrue(
      syncBody?.processedEnrollments?.includes(A.courseId),
      `processedEnrollments includes courseA (got ${JSON.stringify(syncBody?.processedEnrollments)})`,
    );
    assertTrue(syncBody?.rejectedEnrollments?.length === 0, 'no rejected enrollment');

    const offEnrollRow = await pool.query(`SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2`, [
      dbIds.offline,
      A.courseId,
    ]);
    assertTrue(offEnrollRow.rowCount === 1, 'server-side enrollments row now exists for offline learner');

    // Replay the identical payload — must stay 200 and not error (idempotent).
    syncRes = await apiFetch('/api/sync', tokens.offline, { method: 'POST', body: JSON.stringify(syncPayload) });
    syncBody = await syncRes.json();
    assertTrue(
      syncRes.status === 200 && syncBody?.success && syncBody?.rejectedEnrollments?.length === 0,
      'duplicate /api/sync replay → 200, no rejection (idempotent)',
    );

    const aLearnersAgain = await apiFetch('/api/instructor/learners', tokens.instA);
    const aLearnersAgainBody: any = await aLearnersAgain.json();
    const againEmails = (aLearnersAgainBody.learners || []).map((l: any) => l.email);
    assertTrue(againEmails.includes(roles.offline.email), 'Roster now includes offline learner after enrollment flush');
    const offEntry = (aLearnersAgainBody.learners || []).find((l: any) => l.email === roles.offline.email);
    assertTrue(
      offEntry?.enrolledCourses?.length === 1 && offEntry.enrolledCourses[0]?.id === A.courseId,
      'offline learner enrolledCourses = [courseA] (same batch: enrollment flushed before completions)',
    );

    // ------------------------------------------------------------------
    // SCENARIO C: messaging — instructor start, owner gate, participation
    // ------------------------------------------------------------------
    step('SCENARIO C', 'Messaging: instructor start (courseId+learnerId), owner gate, participation fallback');

    // Instructor A starts a thread with enrolled l1.
    let send = await apiFetch('/api/messages/send', tokens.instA, {
      method: 'POST',
      body: JSON.stringify({ courseId: A.courseId, learnerId: dbIds.l1, content: 'Hi l1 — welcome to courseA.' }),
    });
    let sendBody: any = await send.json();
    assertTrue(
      (send.status === 200 || send.status === 201) && typeof sendBody?.conversationId === 'number',
      `Instructor A start thread w/ l1 → 200/201 + conversationId (got ${send.status})`,
    );
    const convId1 = sendBody.conversationId;

    // l1 replies in the thread by conversationId.
    send = await apiFetch('/api/messages/send', tokens.l1, {
      method: 'POST',
      body: JSON.stringify({ conversationId: convId1, content: 'Thanks, instructor!' }),
    });
    assertTrue(
      send.status === 200 || send.status === 201,
      `l1 replies by conversationId → 200/201 (got ${send.status})`,
    );

    // Instructor B (not owner of courseA) must be rejected even though B is a
    // real instructor and l1 is enrolled in courseA.
    send = await apiFetch('/api/messages/send', tokens.instB, {
      method: 'POST',
      body: JSON.stringify({ courseId: A.courseId, learnerId: dbIds.l1, content: 'intrusion attempt' }),
    });
    assertTrue(
      send.status === 403 || send.status === 409,
      `Non-owner instructor B start on courseA → rejected (got ${send.status})`,
    );

    // ghost learner (participation, no enrollment row) starts a thread with A.
    send = await apiFetch('/api/messages/send', tokens.ghost, {
      method: 'POST',
      body: JSON.stringify({ courseId: A.courseId, instructorId: dbIds.instA, content: 'Hi, about lesson 1…' }),
    });
    sendBody = await send.json();
    assertTrue(
      (send.status === 200 || send.status === 201) && typeof sendBody?.conversationId === 'number',
      `Ghost learner start w/ A → 200/201 (participation fallback) (got ${send.status})`,
    );

    // stranger (no enrollment, no participation) must be 403'd.
    send = await apiFetch('/api/messages/send', tokens.stranger, {
      method: 'POST',
      body: JSON.stringify({ courseId: A.courseId, instructorId: dbIds.instA, content: 'unknown person' }),
    });
    assertTrue(send.status === 403, `Stranger start on courseA → 403 (got ${send.status})`);

    // Instructor-side list reflects both threads (l1 and ghost).
    const convRes = await apiFetch('/api/messages/conversations', tokens.instA);
    const convBody: any = await convRes.json();
    const aConvEmails = (convBody.conversations || []).map((c: any) =>
      c.learnerName === 'Fix1 l1' ? roles.l1.email : c.learnerName === 'Fix1 ghost' ? roles.ghost.email : c.learnerName,
    );
    assertTrue(
      convRes.status === 200 && aConvEmails.includes(roles.l1.email) && aConvEmails.includes(roles.ghost.email),
      `Instructor A conversations include l1 + ghost threads (got ${JSON.stringify(aConvEmails)})`,
    );

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
