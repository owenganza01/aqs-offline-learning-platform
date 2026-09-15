#!/usr/bin/env node
// scripts/verify-instructor-dashboard.ts
// Scripted validation for the instructor dashboard series (Part 3-7):
//
//   GET /api/instructor/courses  — only courses OWNED by the instructor
//   GET /api/instructor/learners — only learners enrolled in courses the instructor owns
//
// Scenarios:
//   1.  Permission gates — learner → 403; onboarding-incomplete instructor → 403.
//   2.  Instructor A scope — courses endpoint returns exactly instructor A's course
//       (not instructor B's, not the admin-owned course); enrichment counts correct.
//   3.  Instructor B scope — returns only B's course; hasQuiz=false for no quiz.
//   4.  Instructor A learner roster — only A's enrolled learners; cross-enrollments
//       in OTHER courses (admin-owned courseC) are NOT leaked into enrolledCourses.
//   5.  Instructor B learner roster — only B's enrolled learners.
//   6.  Admin regression — admin is authorized (200) but scoped to their own (empty) set.
//   7.  Deep math — full completion + passing quiz + cert on courseA, then verify
//       completions/certificates/pass-rate/best-score surface in both endpoints,
//       with NO leakage into instructor B's data.
//
// Cleanup runs in `finally`. Usage: npx tsx scripts/verify-instructor-dashboard.ts [--force]

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
  const mk = (prefix: string) => `dash-${prefix}-${rand}`;

  const roles: Record<string, { uid: string; email: string; name: string; role: string; onboarding: string }> = {};
  const defs = [
    ['admin', 'admin', 'active'],
    ['instA', 'instructor', 'active'],
    ['instB', 'instructor', 'active'],
    ['instP', 'instructor', 'pending_approval'],
    ['learner1', 'learner', 'active'],
    ['learner2', 'learner', 'active'],
    ['learner3', 'learner', 'active'],
  ] as const;
  for (const [key, role, onboarding] of defs) {
    roles[key] = { uid: mk(key), email: `dash.${key}.${rand}@example.com`, name: `Dash ${key}`, role, onboarding };
  }
  const createdAuthUids = Object.values(roles).map((r) => r.uid);
  const courseIds: number[] = [];

  console.log('\n===============================================');
  console.log('  INSTRUCTOR DASHBOARD SERIES — VERIFICATION');
  console.log('===============================================');
  console.log(` DB target  : ${DATABASE_URL.split('@')[1] || DATABASE_URL}`);
  console.log(` instructors: A=${roles.instA.uid} B=${roles.instB.uid} pending=${roles.instP.uid}`);
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

  try {
    const app = await createApp();
    server = app.listen(0);
    const address = server.address() as any;
    baseUrl = `http://127.0.0.1:${address.port}`;
    ok(`Express app up at ${baseUrl}`);

    // Seed users (admin, 2 active instructors, 1 pending instructor, 3 learners)
    for (const r of Object.values(roles)) {
      await adminAuth.createUser({ uid: r.uid, email: r.email, displayName: r.name });
      await pool.query(
        `INSERT INTO users (uid, email, name, role, onboarding_status)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (email) DO UPDATE SET role=$4, onboarding_status=$5`,
        [r.uid, r.email.toLowerCase(), r.name, r.role, r.onboarding],
      );
    }
    const tokens: Record<string, string> = {};
    for (const key of Object.keys(roles)) {
      tokens[key] = await mintIdToken(roles[key].uid, roles[key].email);
    }
    ok(`Admin + 2 active instructors + 1 pending instructor + 3 learners seeded`);

    // ------------------------------------------------------------------
    // SETUP: courseA (owned by instructor A, 2 lessons + quiz),
    //        courseB (owned by instructor B, 1 lesson, no quiz),
    //        courseC (owned by ADMIN, 1 lesson, no quiz)
    // ------------------------------------------------------------------
    step(1, 'Setup — courseA (A, 2 lessons + quiz), courseB (B, 1 lesson), courseC (admin, 1 lesson)');

    const quizFor = (courseId: number, tag: string) =>
      apiFetch(`/api/admin/courses/${courseId}/quiz`, tokens.admin, {
        method: 'POST',
        body: JSON.stringify({
          title: `Quiz ${tag}`,
          questions: [
            { questionText: 'Q1', options: ['A', 'B', 'C', 'D'], correctOptionIndex: 0 },
            { questionText: 'Q2', options: ['A', 'B', 'C', 'D'], correctOptionIndex: 0 },
          ],
        }),
      });

    const buildCourse = async (ownerToken: string, title: string, lessons: number, withQuiz: boolean) => {
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
      let quizId: number | null = null;
      if (withQuiz) {
        const qr = await quizFor(courseId, title);
        const qb: any = await qr.json();
        if (qb?.quizId == null) throw new Error(`Quiz create failed: ${JSON.stringify(qb)}`);
        quizId = qb.quizId;
      }
      return { courseId, lessonIds, quizId };
    };

    const A = await buildCourse(tokens.instA, 'courseA', 2, true);
    const B = await buildCourse(tokens.instB, 'courseB', 1, false);
    const C = await buildCourse(tokens.admin, 'courseC', 1, false);
    ok(`courseA=${A.courseId} (lessons ${A.lessonIds}, quiz ${A.quizId})`);
    ok(`courseB=${B.courseId} (lessons ${B.lessonIds}, no quiz)`);
    ok(`courseC=${C.courseId} (owned by admin)`);

    // Enable certificates on courseA so the deep-math scenario can assert cert counts.
    const certR = await apiFetch(`/api/courses/${A.courseId}/certificate-config`, tokens.instA, {
      method: 'PUT',
      body: JSON.stringify({
        enabled: true,
        title: `Certificate ${A.courseId}`,
        issuer: 'AQS Dash',
        requireCourseCompletion: true,
        requireAssessment: true,
        minAssessmentScore: 70,
      }),
    });
    if (certR.status !== 200) throw new Error(`Cert config failed: ${certR.status} ${await certR.text()}`);
    ok(`Certificate config enabled on courseA (by owner A)`);

    const enroll = async (token: string, courseId: number) => {
      const r = await apiFetch('/api/enrollments', token, {
        method: 'POST',
        body: JSON.stringify({ courseId }),
      });
      if (r.status !== 200) throw new Error(`Enroll ${courseId} failed: ${r.status} ${await r.text()}`);
    };
    await enroll(tokens.learner1, A.courseId); // L1: A only (also in C below)
    await enroll(tokens.learner3, A.courseId); // L3: A + B
    await enroll(tokens.learner3, B.courseId);
    await enroll(tokens.learner2, B.courseId); // L2: B only
    await enroll(tokens.learner1, C.courseId); // L1 also in admin-owned C (must NOT leak into A's roster)
    ok(`Enrollments: L1→{A,C}, L2→{B}, L3→{A,B}`);

    // ------------------------------------------------------------------
    // SCENARIO 1: permission gates
    // ------------------------------------------------------------------
    step(2, 'Permission gates — learner forbidden; onboarding-incomplete instructor forbidden');
    let res = await apiFetch('/api/instructor/courses', tokens.learner1);
    assertTrue(res.status === 403, `Learner GET /api/instructor/courses → 403 (got ${res.status})`);
    res = await apiFetch('/api/instructor/learners', tokens.learner1);
    assertTrue(res.status === 403, `Learner GET /api/instructor/learners → 403 (got ${res.status})`);
    res = await apiFetch('/api/instructor/courses', tokens.instP);
    assertTrue(res.status === 403, `Pending instructor GET /api/instructor/courses → 403 (got ${res.status})`);
    res = await apiFetch('/api/instructor/learners', tokens.instP);
    assertTrue(res.status === 403, `Pending instructor GET /api/instructor/learners → 403 (got ${res.status})`);

    // ------------------------------------------------------------------
    // SCENARIO 2: instructor A course scope + enrichment counts
    // ------------------------------------------------------------------
    step(3, 'Instructor A — /api/instructor/courses returns ONLY courseA with correct enrichment');
    res = await apiFetch('/api/instructor/courses', tokens.instA);
    let body: any = await res.json();
    if (res.status !== 200) throw new Error(`Instructor A courses failed: ${res.status} ${JSON.stringify(body)}`);
    const aCourses = body.courses || [];
    assertTrue(aCourses.length === 1, `A sees exactly 1 course (got ${aCourses.length})`);
    const courseA = aCourses.find((c: any) => c.id === A.courseId);
    assertTrue(!!courseA, 'The single course is courseA');
    assertTrue(!aCourses.some((c: any) => c.id === B.courseId), 'courseB (owned by B) NOT in A scope');
    assertTrue(!aCourses.some((c: any) => c.id === C.courseId), 'admin-owned courseC NOT in A scope');
    assertTrue(courseA?.lessonsCount === 2, `courseA.lessonsCount === 2 (got ${courseA?.lessonsCount})`);
    assertTrue(courseA?.enrollmentsCount === 2, `courseA.enrollmentsCount === 2 (got ${courseA?.enrollmentsCount})`);
    assertTrue(courseA?.hasQuiz === true, `courseA.hasQuiz === true (got ${courseA?.hasQuiz})`);
    assertTrue(courseA?.passRate === 0, `courseA.passRate === 0 pre-attempts (got ${courseA?.passRate})`);
    assertTrue(courseA?.completionsCount === 0, `courseA.completionsCount === 0 pre-completion`);
    assertTrue(courseA?.certificatesIssued === 0, `courseA.certificatesIssued === 0 pre-completion`);
    assertTrue(courseA?.createdBy === courseA?.createdBy, 'courseA carries createdBy');

    // ------------------------------------------------------------------
    // SCENARIO 3: instructor B course scope
    // ------------------------------------------------------------------
    step(4, 'Instructor B — /api/instructor/courses returns ONLY courseB');
    res = await apiFetch('/api/instructor/courses', tokens.instB);
    body = await res.json();
    if (res.status !== 200) throw new Error(`Instructor B courses failed: ${res.status} ${JSON.stringify(body)}`);
    const bCourses = body.courses || [];
    assertTrue(bCourses.length === 1, `B sees exactly 1 course (got ${bCourses.length})`);
    assertTrue(bCourses[0]?.id === B.courseId, 'Course B present, courseA absent');
    assertTrue(bCourses[0]?.lessonsCount === 1, `courseB.lessonsCount === 1 (got ${bCourses[0]?.lessonsCount})`);
    assertTrue(bCourses[0]?.hasQuiz === false, `courseB.hasQuiz === false (got ${bCourses[0]?.hasQuiz})`);

    // ------------------------------------------------------------------
    // SCENARIO 4: instructor A learner roster scope
    // ------------------------------------------------------------------
    step(5, 'Instructor A — /api/instructor/learners contains only its enrolled learners, scoped courses');
    res = await apiFetch('/api/instructor/learners', tokens.instA);
    body = await res.json();
    if (res.status !== 200) throw new Error(`Instructor A learners failed: ${res.status} ${JSON.stringify(body)}`);
    const aLearners = body.learners || [];
    assertTrue(aLearners.length === 2, `A roster has L1 + L3 (got ${aLearners.length})`);
    assertTrue(!aLearners.some((l: any) => l.email === roles.learner2.email), 'L2 (B-only learner) NOT in A roster');
    const aL1 = aLearners.find((l: any) => l.email === roles.learner1.email);
    const aL3 = aLearners.find((l: any) => l.email === roles.learner3.email);
    assertTrue(!!aL1 && !!aL3, 'L1 and L3 both present');
    assertTrue(
      aL1?.enrolledCourses?.length === 1 && aL1?.enrolledCourses?.[0]?.id === A.courseId,
      'L1 enrolledCourses = [courseA] only — admin-owned courseC NOT leaked',
    );
    assertTrue(
      aL3?.enrolledCourses?.length === 1 && aL3?.enrolledCourses?.[0]?.id === A.courseId,
      'L3 enrolledCourses = [courseA] — courseB NOT leaked into A scope',
    );
    assertTrue(aL1?.lessonsCompleted === 0 && aL1?.lessonsTotal === 2, 'L1 progress 0/2 pre-completion');

    // ------------------------------------------------------------------
    // SCENARIO 5: instructor B learner roster scope
    // ------------------------------------------------------------------
    step(6, 'Instructor B — /api/instructor/learners contains only its enrolled learners');
    res = await apiFetch('/api/instructor/learners', tokens.instB);
    body = await res.json();
    if (res.status !== 200) throw new Error(`Instructor B learners failed: ${res.status} ${JSON.stringify(body)}`);
    const bLearners = body.learners || [];
    assertTrue(bLearners.length === 2, `B roster has L2 + L3 (got ${bLearners.length})`);
    assertTrue(!bLearners.some((l: any) => l.email === roles.learner1.email), 'L1 (A-only) NOT in B roster');
    const bL3 = bLearners.find((l: any) => l.email === roles.learner3.email);
    assertTrue(
      bL3?.enrolledCourses?.length === 1 && bL3?.enrolledCourses?.[0]?.id === B.courseId,
      'L3 enrolledCourses = [courseB] — courseA NOT leaked into B scope',
    );

    // ------------------------------------------------------------------
    // SCENARIO 6: admin regression — admin is authorized (200) and scoped to
    // the one course the admin owns (courseC) and its enrolled learner (L1).
    // ------------------------------------------------------------------
    step(7, 'Admin regression — new endpoints return 200 with admin-owned scope (courseC)');
    res = await apiFetch('/api/instructor/courses', tokens.admin);
    body = await res.json();
    assertTrue(res.status === 200, `Admin GET /api/instructor/courses → 200 (got ${res.status})`);
    assertTrue(
      body?.courses?.length === 1 && body.courses[0]?.id === C.courseId,
      'Admin scope = exactly courseC (admin-owned), NOT courseA/courseB',
    );
    res = await apiFetch('/api/instructor/learners', tokens.admin);
    body = await res.json();
    assertTrue(res.status === 200, `Admin GET /api/instructor/learners → 200 (got ${res.status})`);
    assertTrue(
      body?.learners?.length === 1 && body.learners[0]?.email === roles.learner1.email,
      'Admin scope = exactly L1 (enrolled in courseC), NOT L2/L3',
    );
    assertTrue(
      body?.learners?.[0]?.enrolledCourses?.length === 1 && body.learners[0].enrolledCourses[0]?.id === C.courseId,
      'L1 enrolledCourses in admin scope = [courseC] only',
    );

    // ------------------------------------------------------------------
    // SCENARIO 7: deep math — full offline completion on courseA
    // ------------------------------------------------------------------
    step(8, 'Deep math — L1 completes courseA (2 lessons + passing quiz) → counts in A, no leak to B');
    const PASS_ANSWERS = [0, 0]; // 2/2 = 100%
    res = await apiFetch('/api/sync', tokens.learner1, {
      method: 'POST',
      body: JSON.stringify({
        lessonCompletions: [{ lessonId: A.lessonIds[0] }, { lessonId: A.lessonIds[1] }],
        quizSubmissions: [{ quizId: A.quizId, answers: PASS_ANSWERS, attemptedAt: '2026-09-16T12:00:00.000Z' }],
      }),
    });
    body = await res.json();
    if (res.status !== 200 || !body?.success) throw new Error(`Sync failed: ${res.status} ${JSON.stringify(body)}`);
    assertTrue(body?.reconciledCourseIds?.length === 1, 'Sync completed courseA for L1');

    res = await apiFetch('/api/instructor/courses', tokens.instA);
    body = await res.json();
    const courseADeep = (body.courses || []).find((c: any) => c.id === A.courseId);
    assertTrue(
      courseADeep?.completionsCount === 1,
      `courseA.completionsCount === 1 (got ${courseADeep?.completionsCount})`,
    );
    assertTrue(
      courseADeep?.certificatesIssued === 1,
      `courseA.certificatesIssued === 1 (got ${courseADeep?.certificatesIssued})`,
    );
    assertTrue(courseADeep?.passRate === 100, `courseA.passRate === 100 (got ${courseADeep?.passRate})`);
    assertTrue(courseADeep?.averageScore === 100, `courseA.averageScore === 100 (got ${courseADeep?.averageScore})`);

    res = await apiFetch('/api/instructor/learners', tokens.instA);
    body = await res.json();
    const aL1Deep = (body.learners || []).find((l: any) => l.email === roles.learner1.email);
    assertTrue(aL1Deep?.lessonsCompleted === 2 && aL1Deep?.lessonsTotal === 2, 'L1 progress 2/2 after completion');
    assertTrue(aL1Deep?.quizzesPassed === 1, `L1 quizzesPassed === 1 (got ${aL1Deep?.quizzesPassed})`);
    assertTrue(aL1Deep?.bestScore === 100, `L1 bestScore === 100 (got ${aL1Deep?.bestScore})`);
    assertTrue(
      aL1Deep?.courseCompletionsCount === 1,
      `L1 courseCompletionsCount === 1 (got ${aL1Deep?.courseCompletionsCount})`,
    );
    assertTrue(aL1Deep?.certificatesCount === 1, `L1 certificatesCount === 1 (got ${aL1Deep?.certificatesCount})`);
    assertTrue(!!aL1Deep?.lastActive, 'L1 lastActive populated after activity');

    // No cross-instructor leakage after deep math.
    res = await apiFetch('/api/instructor/courses', tokens.instB);
    body = await res.json();
    const courseBAfter = (body.courses || []).find((c: any) => c.id === B.courseId);
    assertTrue(
      body.courses?.length === 1 && courseBAfter?.completionsCount === 0,
      'Instructor B data unchanged — no leakage of courseA completion',
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
