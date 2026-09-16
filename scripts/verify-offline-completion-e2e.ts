#!/usr/bin/env node
// scripts/verify-offline-completion-e2e.ts
// Dedicated offline-sync course-completion verification (FR-03) for the
// reconcileCourseCompletions fix:
//
//   FR-03  Learner completes ALL lessons + passes the quiz OFFLINE (queued),
//          reconnects → /api/sync flush creates a course_completions row and
//          issues the certificate, using the SAME 70% pass threshold as the
//          online path (single shared PASS_THRESHOLD constant in scoring.ts).
//   1.     Idempotency — re-syncing the identical payload (retry after a dropped
//          connection) does NOT duplicate the course_completions row, duplicate
//          quiz attempts, or double-issue the certificate (unique constraints
//          from migration 0028 + resolveSyncConflicts dedupe).
//   2.     Ordering — the enrollment gate (commit 3) runs BEFORE reconciliation,
//          so a rejected/unenrolled quiz submission in the same batch can never
//          trigger a course completion for that course.
//   3.     Cert-shape parity — the certificate issued via this offline path has
//          the same shape/fields as one issued through the online course-complete
//          flow (both funnel through the single issueCertificate service).
//
// Cleanup runs in `finally`. Usage: npx tsx scripts/verify-offline-completion-e2e.ts [--force]

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
  const mk = (prefix: string) => `e2e-${prefix}-${rand}`;
  const adminUid = mk('admin');
  const adminEmail = `e2e.admin.${rand}@example.com`;
  const learnerUids = {
    offline: mk('offline'), // FR-03 offline completer
    below: mk('below'), // fails quiz (50% < 70)
    gated: mk('gated'), // ordering/gate probe
    online: mk('online'), // online completion for cert-shape parity
  };
  const emails = {
    admin: adminEmail,
    offline: `e2e.offline.${rand}@example.com`,
    below: `e2e.below.${rand}@example.com`,
    gated: `e2e.gated.${rand}@example.com`,
    online: `e2e.online.${rand}@example.com`,
  };
  const createdAuthUids = [adminUid, ...Object.values(learnerUids)];
  const courseIds: number[] = [];

  console.log('\n===============================================');
  console.log('  OFFLINE COURSE COMPLETION — FR-03 VERIFICATION');
  console.log('===============================================');
  console.log(` DB target  : ${DATABASE_URL.split('@')[1] || DATABASE_URL}`);
  console.log(
    ` learners   : offline=${learnerUids.offline} below=${learnerUids.below} gated=${learnerUids.gated} online=${learnerUids.online}`,
  );
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

  const step = (n: number, title: string) => {
    console.log('\n───────────────────────────────────────────────');
    console.log(` SCENARIO ${n}: ${title}`);
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

  // Read-only DB helpers
  const countRows = async (
    table: string,
    userUid: string,
    filterValue: number,
    extraAnd = '',
    filterCol = 'course_id',
  ) => {
    const result = await pool.query(
      `SELECT count(*)::int AS n FROM ${table} WHERE user_id = (SELECT id FROM users WHERE uid=$1) AND ${filterCol} = $2 ${extraAnd}`,
      [userUid, filterValue],
    );
    return result.rows[0].n;
  };

  try {
    const app = await createApp();
    server = app.listen(0);
    const address = server.address() as any;
    baseUrl = `http://127.0.0.1:${address.port}`;
    ok(`Express app up at ${baseUrl}`);

    // Seed users (admins/learners, all active)
    for (const [uid, email, name, role] of [
      [adminUid, emails.admin, 'E2E Admin', 'admin'],
      ...(['offline', 'below', 'gated', 'online'] as const).map((k) => [
        learnerUids[k],
        emails[k],
        `E2E ${k}`,
        'learner',
      ]),
    ] as const) {
      await adminAuth.createUser({ uid, email, displayName: name });
      await pool.query(
        `INSERT INTO users (uid, email, name, role, onboarding_status)
         VALUES ($1, $2, $3, $4, 'active') ON CONFLICT (email) DO UPDATE SET role=$4, onboarding_status='active'`,
        [uid, email.toLowerCase(), name, role],
      );
    }
    const adminToken = await mintIdToken(adminUid, emails.admin);
    const learnerTokens: Record<string, string> = {};
    for (const key of ['offline', 'below', 'gated', 'online'] as const) {
      learnerTokens[key] = await mintIdToken(learnerUids[key], emails[key]);
    }
    ok(`Admin + 4 learners seeded (all active)`);

    // ------------------------------------------------------------------
    // SETUP: three courses, each with 2 lessons + a 4-question quiz (pass = 3/4 = 75%).
    //  M — offline FR-03 course (completed offline by 'offline', failed by 'below', completed-ish by 'gated')
    //  U — unenrolled course for the ordering probe ('gated' is NOT enrolled here)
    //  P — parity course completed ONLINE by 'online'
    // ------------------------------------------------------------------
    step(1, 'Setup — courses M/U/P: 2 lessons + 4-question quiz each; cert enabled');
    const quizFor = (courseId: number, tag: string) =>
      apiFetch(`/api/admin/courses/${courseId}/quiz`, adminToken, {
        method: 'POST',
        body: JSON.stringify({
          title: `Quiz ${tag}`,
          questions: [
            { questionText: 'Q1', options: ['A', 'B', 'C', 'D'], correctOptionIndex: 0 },
            { questionText: 'Q2', options: ['A', 'B', 'C', 'D'], correctOptionIndex: 0 },
            { questionText: 'Q3', options: ['A', 'B', 'C', 'D'], correctOptionIndex: 0 },
            { questionText: 'Q4', options: ['A', 'B', 'C', 'D'], correctOptionIndex: 0 },
          ],
        }),
      });
    const buildCourse = async (title: string) => {
      const res = await apiFetch('/api/admin/courses', adminToken, {
        method: 'POST',
        body: JSON.stringify({ title: `${title}-${rand}`, description: `Fixture ${title}` }),
      });
      const body: any = await res.json();
      if (body?.id == null) throw new Error(`Course create failed: ${res.status} ${JSON.stringify(body)}`);
      const courseId = body.id;
      courseIds.push(courseId);
      const lessonIds: number[] = [];
      for (const ord of [1, 2]) {
        const lr = await apiFetch(`/api/admin/courses/${courseId}/lessons`, adminToken, {
          method: 'POST',
          body: JSON.stringify({ title: `L${ord}-${title}`, sortOrder: ord, content: `Content ${title} ${ord}` }),
        });
        const lb: any = await lr.json();
        if (lb?.id == null) throw new Error(`Lesson create failed: ${lr.status} ${JSON.stringify(lb)}`);
        lessonIds.push(lb.id);
      }
      const qr = await quizFor(courseId, title);
      const qb: any = await qr.json();
      if (qb?.quizId == null) throw new Error(`Quiz create failed: ${JSON.stringify(qb)}`);
      return { courseId, lessonIds, quizId: qb.quizId };
    };

    const M = await buildCourse('M');
    const U = await buildCourse('U');
    const P = await buildCourse('P');

    for (const courseId of [M.courseId, U.courseId, P.courseId]) {
      const cr = await apiFetch(`/api/courses/${courseId}/certificate-config`, adminToken, {
        method: 'PUT',
        body: JSON.stringify({
          enabled: true,
          title: `Certificate ${courseId}`,
          issuer: 'AQS E2E',
          requireCourseCompletion: true,
          requireAssessment: true,
          minAssessmentScore: 70,
        }),
      });
      if (cr.status !== 200) throw new Error(`Cert config failed: ${cr.status} ${await cr.text()}`);
    }
    ok(
      `Courses M (${M.courseId}), U (${U.courseId}), P (${P.courseId}) — lessons ${M.lessonIds}/${U.lessonIds}/${P.lessonIds}`,
    );
    ok(`Quiz ids M=${M.quizId} U=${U.quizId} P=${P.quizId}`);

    const enroll = async (token: string, courseId: number) => {
      const r = await apiFetch('/api/enrollments', token, {
        method: 'POST',
        body: JSON.stringify({ courseId }),
      });
      if (r.status !== 200) throw new Error(`Enroll ${courseId} failed: ${r.status} ${await r.text()}`);
    };
    await enroll(learnerTokens.offline, M.courseId);
    await enroll(learnerTokens.below, M.courseId);
    await enroll(learnerTokens.gated, M.courseId);
    await enroll(learnerTokens.online, P.courseId);
    ok(`offline/below/gated enrolled in M; online enrolled in P; NOBODY enrolled in U`);

    const PASS_ANSWERS = [0, 0, 0, 0]; // 4/4 = 100%, passes
    const FAIL_ANSWERS = [0, 0, 1, 1]; // 2/4 = 50%, below the shared 70 threshold

    // ------------------------------------------------------------------
    // SCENARIO 2 (FR-03): offline completion creates course_completions + cert
    // ------------------------------------------------------------------
    step(2, 'FR-03 — learner completes all lessons + passes quiz OFFLINE → sync flush completes course + issues cert');
    let res = await apiFetch('/api/sync', learnerTokens.offline, {
      method: 'POST',
      body: JSON.stringify({
        lessonCompletions: [{ lessonId: M.lessonIds[0] }, { lessonId: M.lessonIds[1] }],
        quizSubmissions: [{ quizId: M.quizId, answers: PASS_ANSWERS, attemptedAt: '2026-09-15T12:00:00.000Z' }],
      }),
    });
    let body: any = await res.json();
    console.log(`   /api/sync HTTP ${res.status}`);
    console.log(
      `   processedQuizzes: ${JSON.stringify(body?.processedQuizzes?.map((p: any) => ({ quizId: p.quizId, score: p.score, passed: p.passed })))}`,
    );
    console.log(`   reconciledCourseIds: ${JSON.stringify(body?.reconciledCourseIds)}`);
    if (res.status !== 200 || !body?.success) throw new Error(`Sync failed: ${res.status} ${JSON.stringify(body)}`);
    assertTrue(res.status === 200 && body?.success === true, 'Sync returned 200 success');
    assertTrue(
      body?.processedQuizzes?.some((p: any) => p.quizId === M.quizId && p.passed === true),
      'Quiz marked passed on the offline flush (100%)',
    );
    assertTrue(body?.reconciledCourseIds?.length === 1, 'Sync reconciled exactly one course completion');
    assertTrue(
      (await countRows('course_completions', learnerUids.offline, M.courseId)) === 1,
      'course_completions row created (FR-03)',
    );
    assertTrue(
      (await countRows('issued_certificates', learnerUids.offline, M.courseId)) === 1,
      'Certificate issued for offline completion (FR-03)',
    );

    // ------------------------------------------------------------------
    // SCENARIO 3: 70% threshold — failing quiz offline does NOT complete
    // ------------------------------------------------------------------
    step(3, '70% threshold — offline quiz at 50% does NOT create course completion or cert');
    res = await apiFetch('/api/sync', learnerTokens.below, {
      method: 'POST',
      body: JSON.stringify({
        lessonCompletions: [{ lessonId: M.lessonIds[0] }, { lessonId: M.lessonIds[1] }],
        quizSubmissions: [{ quizId: M.quizId, answers: FAIL_ANSWERS, attemptedAt: '2026-09-15T12:30:00.000Z' }],
      }),
    });
    body = await res.json();
    console.log(`   /api/sync HTTP ${res.status}`);
    console.log(
      `   processedQuizzes: ${JSON.stringify(body?.processedQuizzes?.map((p: any) => ({ quizId: p.quizId, score: p.score, passed: p.passed })))}`,
    );
    console.log(`   reconciledCourseIds: ${JSON.stringify(body?.reconciledCourseIds)}`);
    if (res.status !== 200 || !body?.success) throw new Error(`Sync failed: ${res.status} ${JSON.stringify(body)}`);
    assertTrue(
      body?.processedQuizzes?.some((p: any) => p.quizId === M.quizId && p.passed === false && p.score === 50),
      'Quiz scored 50 and NOT passed (shared 70 threshold)',
    );
    assertTrue(body?.reconciledCourseIds?.length === 0, 'Sync reconciled zero completions for failing learner');
    assertTrue(
      (await countRows('course_completions', learnerUids.below, M.courseId)) === 0,
      'NO course_completions row below threshold',
    );
    assertTrue(
      (await countRows('issued_certificates', learnerUids.below, M.courseId)) === 0,
      'NO certificate below threshold',
    );

    // ------------------------------------------------------------------
    // SCENARIO 4: Idempotency — identical re-sync (dropped-connection retry)
    // ------------------------------------------------------------------
    step(4, 'Idempotency — re-run the identical sync payload; no duplicates, no double-issue');
    const offlineCompletionBefore = await pool.query(
      `SELECT id, completion_id FROM course_completions
       WHERE user_id = (SELECT id FROM users WHERE uid=$1) AND course_id = $2`,
      [learnerUids.offline, M.courseId],
    );
    assertTrue(offlineCompletionBefore.rows.length === 1, 'Exactly 1 course_completions row before retry');
    const certRowBefore = await pool.query(
      `SELECT id, verification_code FROM issued_certificates
       WHERE user_id = (SELECT id FROM users WHERE uid=$1) AND course_id = $2`,
      [learnerUids.offline, M.courseId],
    );
    const attemptsBefore = await countRows('quiz_attempts', learnerUids.offline, M.quizId, '', 'quiz_id');

    res = await apiFetch('/api/sync', learnerTokens.offline, {
      method: 'POST',
      body: JSON.stringify({
        lessonCompletions: [{ lessonId: M.lessonIds[0] }, { lessonId: M.lessonIds[1] }],
        quizSubmissions: [{ quizId: M.quizId, answers: PASS_ANSWERS, attemptedAt: '2026-09-15T12:00:00.000Z' }],
      }),
    });
    body = await res.json();
    console.log(`   Re-sync HTTP ${res.status}; reconciledCourseIds=${JSON.stringify(body?.reconciledCourseIds)}`);
    if (res.status !== 200 || !body?.success) throw new Error(`Re-sync failed: ${res.status} ${JSON.stringify(body)}`);

    const offlineCompletionAfter = await pool.query(
      `SELECT id, completion_id FROM course_completions
       WHERE user_id = (SELECT id FROM users WHERE uid=$1) AND course_id = $2`,
      [learnerUids.offline, M.courseId],
    );
    assertTrue(
      offlineCompletionAfter.rows.length === 1 &&
        offlineCompletionAfter.rows[0].completion_id === offlineCompletionBefore.rows[0].completion_id,
      'course_completions still EXACTLY 1 row, same completion_id (no duplicate on retry)',
    );
    const certRowAfter = await pool.query(
      `SELECT id, verification_code FROM issued_certificates
       WHERE user_id = (SELECT id FROM users WHERE uid=$1) AND course_id = $2`,
      [learnerUids.offline, M.courseId],
    );
    assertTrue(
      certRowAfter.rows.length === 1 && certRowAfter.rows[0].id === certRowBefore.rows[0].id,
      'issued_certificates still EXACTLY 1 row, same cert (no double-issue on retry)',
    );
    const attemptsAfter = await countRows('quiz_attempts', learnerUids.offline, M.quizId, '', 'quiz_id');
    assertTrue(
      attemptsAfter === attemptsBefore && attemptsAfter === 1,
      `quiz_attempts deduped on retry (${attemptsAfter} ≈ ${attemptsBefore})`,
    );

    // ------------------------------------------------------------------
    // SCENARIO 5: Ordering — enrollment gate precedes reconciliation
    // ------------------------------------------------------------------
    step(5, 'Ordering — unenrolled quiz in same batch REJECTED; sibling enrolled course still completes');
    res = await apiFetch('/api/sync', learnerTokens.gated, {
      method: 'POST',
      body: JSON.stringify({
        lessonCompletions: [
          { lessonId: M.lessonIds[0] },
          { lessonId: M.lessonIds[1] },
          { lessonId: U.lessonIds[0] },
          { lessonId: U.lessonIds[1] },
        ],
        quizSubmissions: [
          { quizId: U.quizId, answers: PASS_ANSWERS, attemptedAt: '2026-09-15T13:00:00.000Z' }, // gated is NOT enrolled in U → per-item rejected
          { quizId: M.quizId, answers: PASS_ANSWERS, attemptedAt: '2026-09-15T13:05:00.000Z' }, // gated IS enrolled in M → processed
        ],
      }),
    });
    body = await res.json();
    console.log(`   /api/sync HTTP ${res.status}`);
    console.log(`   rejectedQuizzes : ${JSON.stringify(body?.rejectedQuizzes)}`);
    console.log(`   processedQuizzes: ${JSON.stringify(body?.processedQuizzes?.map((p: any) => p.quizId))}`);
    console.log(`   reconciledCourseIds: ${JSON.stringify(body?.reconciledCourseIds)}`);
    if (res.status !== 200 || !body?.success) throw new Error(`Sync failed: ${res.status} ${JSON.stringify(body)}`);
    const rejectedU = (body?.rejectedQuizzes || []).find((r: any) => r.quizId === U.quizId);
    assertTrue(
      !!rejectedU && /must be enrolled/.test(rejectedU.reason),
      `Unenrolled U quiz rejected per-item ("${rejectedU?.reason}")`,
    );
    assertTrue(
      body?.processedQuizzes?.some((p: any) => p.quizId === M.quizId),
      'Enrolled M quiz processed in SAME batch',
    );
    assertTrue(
      (await countRows('course_completions', learnerUids.gated, M.courseId)) === 1,
      'M completed for gated (sibling processed)',
    );
    assertTrue(
      (await countRows('course_completions', learnerUids.gated, U.courseId)) === 0,
      'U NOT completed — rejected quiz can never feed reconciliation, even with all its lessons marked complete',
    );
    assertTrue(
      (await countRows('issued_certificates', learnerUids.gated, U.courseId)) === 0,
      'NO certificate for U (rejected path)',
    );

    // ------------------------------------------------------------------
    // SCENARIO 6: Cert-shape parity — offline-issued cert matches online-issued cert
    // ------------------------------------------------------------------
    step(6, 'Cert-shape parity — offline cert fields match the online course-complete flow');
    // Online completion of P (mirror LearnerCoursePlayer: real quiz submit, lesson completes, course complete)
    res = await apiFetch(`/api/quizzes/${P.quizId}/submit`, learnerTokens.online, {
      method: 'POST',
      body: JSON.stringify({ answers: PASS_ANSWERS }),
    });
    if (res.status !== 200) throw new Error(`Online quiz submit failed: ${res.status}`);
    for (const lid of P.lessonIds) {
      const r = await apiFetch(`/api/lessons/${lid}/complete`, learnerTokens.online, { method: 'POST' });
      if (r.status !== 200) throw new Error(`Online lesson complete failed: ${r.status}`);
    }
    res = await apiFetch(`/api/courses/${P.courseId}/complete`, learnerTokens.online, { method: 'POST' });
    if (res.status !== 200) throw new Error(`Online course complete failed: ${res.status}`);
    assertTrue(
      (await countRows('course_completions', learnerUids.online, P.courseId)) === 1,
      'Online completion recorded for P',
    );
    assertTrue(
      (await countRows('issued_certificates', learnerUids.online, P.courseId)) === 1,
      'Online certificate issued for P',
    );

    const fetchCert = async (userUid: string, courseId: number) => {
      const r = await pool.query(
        `SELECT learner_name_snapshot, course_title_snapshot, certificate_title_snapshot, issuer_snapshot,
                requirements_snapshot, verification_code, certificate_config_id
         FROM issued_certificates WHERE user_id = (SELECT id FROM users WHERE uid=$1) AND course_id = $2`,
        [userUid, courseId],
      );
      return r.rows[0];
    };
    const offlineCert = await fetchCert(learnerUids.offline, M.courseId);
    const onlineCert = await fetchCert(learnerUids.online, P.courseId);

    const reqKeys = ['requireCourseCompletion', 'requireAssessment', 'minAssessmentScore', 'bestScore'];
    const shapeMatches =
      offlineCert &&
      onlineCert &&
      offlineCert.learner_name_snapshot === 'E2E offline' &&
      onlineCert.learner_name_snapshot === 'E2E online' &&
      typeof offlineCert.course_title_snapshot === 'string' &&
      typeof onlineCert.course_title_snapshot === 'string' &&
      offlineCert.certificate_title_snapshot === `Certificate ${M.courseId}` &&
      onlineCert.certificate_title_snapshot === `Certificate ${P.courseId}` &&
      offlineCert.issuer_snapshot === 'AQS E2E' &&
      onlineCert.issuer_snapshot === 'AQS E2E' &&
      offlineCert.certificate_config_id != null &&
      onlineCert.certificate_config_id != null &&
      /^AQS-CERT-/.test(offlineCert.verification_code) &&
      /^AQS-CERT-/.test(onlineCert.verification_code) &&
      reqKeys.every((k) => k in (offlineCert.requirements_snapshot || {})) &&
      reqKeys.every((k) => k in (onlineCert.requirements_snapshot || {}));
    console.log(
      `   offlineCert: ${JSON.stringify({ ...offlineCert, requirements_snapshot: offlineCert.requirements_snapshot })}`,
    );
    console.log(
      `   onlineCert : ${JSON.stringify({ ...onlineCert, requirements_snapshot: onlineCert.requirements_snapshot })}`,
    );
    assertTrue(
      !!shapeMatches,
      'Offline + online certificates share the same populated shape (single issueCertificate path)',
    );
    assertTrue(
      offlineCert.requirements_snapshot?.bestScore === 100,
      'Offline cert bestScore recorded (100) like online',
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
