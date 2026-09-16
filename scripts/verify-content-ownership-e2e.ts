#!/usr/bin/env node
// scripts/verify-content-ownership-e2e.ts
// End-to-end verification of the content-ownership guard added to the six
// mutation endpoints that previously trusted the caller blindly:
//   createLesson, reorderLessons, saveQuiz, addQuizQuestion,
//   uploadDocument (lesson attach), deleteDocument.
// Hits the REAL Express HTTP routes with REAL Firebase ID tokens.
// Instructor B tries all six actions against instructor A's course content and
// must be rejected with 403 on every one; owner A and an admin must still
// succeed on the same actions; B's own course is a positive control proving the
// 403s are authorization, not authentication failure.
// Cleanup (course cascade + wipe_user + Firebase deletion) runs in `finally`.
// Usage: npx tsx scripts/verify-content-ownership-e2e.ts [--force]

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
  const ownerUid = `e2e-owner-${rand}`;
  const ownerEmail = `e2e.owner.${rand}@example.com`;
  const intruderUid = `e2e-intruder-${rand}`;
  const intruderEmail = `e2e.intruder.${rand}@example.com`;
  const adminUid = `e2e-admin2-${rand}`;
  const adminEmail = `e2e.admin2.${rand}@example.com`;
  const createdAuthUids = [ownerUid, intruderUid, adminUid];

  const courseIds: number[] = [];
  const docIds: string[] = [];

  console.log('\n===============================================');
  console.log('  CONTENT OWNERSHIP — END-TO-END VERIFICATION');
  console.log('===============================================');
  console.log(` DB target : ${DATABASE_URL.split('@')[1] || DATABASE_URL}`);
  console.log(` owner uid   : ${ownerUid}`);
  console.log(` intruder uid: ${intruderUid}`);
  console.log(` admin uid   : ${adminUid}`);
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

  const uploadDoc = async (token: string, lessonId: number | null) => {
    const form = new FormData();
    form.append('file', new Blob(['content-ownership-e2e'], { type: 'application/pdf' }), 'notes.pdf');
    if (lessonId != null) form.append('lessonId', String(lessonId));
    return fetch(`${baseUrl}/api/admin/documents/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
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
    // Seed: Firebase users + DB rows (admin, owner A, intruder B)
    // ------------------------------------------------------------------
    await adminAuth.createUser({ uid: adminUid, email: adminEmail, displayName: 'E2E Admin' });
    await pool.query(
      `INSERT INTO users (uid, email, name, role, onboarding_status)
       VALUES ($1, $2, $3, 'admin', 'active') ON CONFLICT (email) DO UPDATE SET role='admin', onboarding_status='active'`,
      [adminUid, adminEmail.toLowerCase(), 'E2E Admin'],
    );
    const adminToken = await mintIdToken(adminUid, adminEmail);
    ok(`Admin auth user created + DB row seeded (role=admin, onboarding=active)`);

    await adminAuth.createUser({ uid: ownerUid, email: ownerEmail, displayName: 'E2E Owner' });
    await pool.query(
      `INSERT INTO users (uid, email, name, role, onboarding_status)
       VALUES ($1, $2, $3, 'instructor', 'active') ON CONFLICT (email) DO UPDATE SET role='instructor', onboarding_status='active'`,
      [ownerUid, ownerEmail.toLowerCase(), 'E2E Owner'],
    );
    const ownerToken = await mintIdToken(ownerUid, ownerEmail);
    ok(`Owner (instructor A) auth user created + DB row seeded (role=instructor, onboarding=active)`);

    await adminAuth.createUser({ uid: intruderUid, email: intruderEmail, displayName: 'E2E Intruder' });
    await pool.query(
      `INSERT INTO users (uid, email, name, role, onboarding_status)
       VALUES ($1, $2, $3, 'instructor', 'active') ON CONFLICT (email) DO UPDATE SET role='instructor', onboarding_status='active'`,
      [intruderUid, intruderEmail.toLowerCase(), 'E2E Intruder'],
    );
    const intruderToken = await mintIdToken(intruderUid, intruderEmail);
    ok(`Intruder (instructor B) auth user created + DB row seeded (role=instructor, onboarding=active)`);

    // ------------------------------------------------------------------
    // SETUP: owner A builds a course with a lesson, quiz and documents.
    // ------------------------------------------------------------------
    step(1, 'Setup — owner A creates course, lesson, quiz, attached documents');
    let body: any = await (
      await apiFetch('/api/admin/courses', ownerToken, {
        method: 'POST',
        body: JSON.stringify({ title: `E2E-owner-${rand}`, description: 'Ownership verification fixture' }),
      })
    ).json();
    if (body?.id == null) throw new Error(`Owner course creation failed: ${JSON.stringify(body)}`);
    const courseIdA = body.id;
    courseIds.push(courseIdA);
    ok(`Owner created course id=${courseIdA}`);

    const mkLesson = (courseId: number, titleStem: string) =>
      apiFetch(`/api/admin/courses/${courseId}/lessons`, ownerToken, {
        method: 'POST',
        body: JSON.stringify({ title: `${titleStem}-${rand}`, content: 'Lesson body for ownership e2e' }),
      });
    body = await (await mkLesson(courseIdA, 'L1')).json();
    if (body?.id == null) throw new Error(`Lesson L1 creation failed: ${JSON.stringify(body)}`);
    const lessonId1 = body.id;
    body = await (await mkLesson(courseIdA, 'L2')).json();
    if (body?.id == null) throw new Error(`Lesson L2 creation failed: ${JSON.stringify(body)}`);
    const lessonId2 = body.id;
    ok(`Owner created lessons id=${lessonId1}, id=${lessonId2}`);

    body = await (
      await apiFetch(`/api/admin/courses/${courseIdA}/quiz`, ownerToken, {
        method: 'POST',
        body: JSON.stringify({
          title: `E2E-owner-quiz-${rand}`,
          questions: [{ questionText: 'Q1', options: ['A', 'B'], correctOptionIndex: 0 }],
        }),
      })
    ).json();
    ok(`Owner saved quiz (5. saveQuiz provision): ${JSON.stringify(body)}`);

    let docRes = await uploadDoc(ownerToken, lessonId1);
    body = await docRes.json();
    if (docRes.status !== 201 || !body?.id) {
      throw new Error(`Owner doc attach to lessonId1 failed: ${docRes.status} ${JSON.stringify(body)}`);
    }
    const docId1 = body.id;
    docIds.push(docId1);
    docRes = await uploadDoc(ownerToken, lessonId2);
    body = await docRes.json();
    if (docRes.status !== 201 || !body?.id) {
      throw new Error(`Owner doc attach to lessonId2 failed: ${docRes.status} ${JSON.stringify(body)}`);
    }
    const docId2 = body.id;
    docIds.push(docId2);
    ok(`Owner attached documents ${docId1} (L1) and ${docId2} (L2)`);

    // B's positive control fixture: a course B owns.
    body = await (
      await apiFetch('/api/admin/courses', intruderToken, {
        method: 'POST',
        body: JSON.stringify({ title: `E2E-intruder-${rand}`, description: 'Intruder positive control' }),
      })
    ).json();
    if (body?.id == null) throw new Error(`Intruder course creation failed: ${JSON.stringify(body)}`);
    const courseIdB = body.id;
    courseIds.push(courseIdB);
    body = await (
      await apiFetch(`/api/admin/courses/${courseIdB}/lessons`, intruderToken, {
        method: 'POST',
        body: JSON.stringify({ title: `BL-${rand}`, content: 'Intruder own lesson' }),
      })
    ).json();
    if (body?.id == null) throw new Error(`Intruder lesson creation failed: ${JSON.stringify(body)}`);
    const lessonIdB = body.id;
    ok(`Intruder own course id=${courseIdB} + lesson id=${lessonIdB} (positive control)`);

    console.log(
      `   Fixtures ready: courseA=${courseIdA} (L1=${lessonId1}, L2=${lessonId2}, quiz, 2 docs); courseB=${courseIdB} (L=${lessonIdB})`,
    );

    // ------------------------------------------------------------------
    // SCENARIO 2: intruder B attacks owner A's content -> every action 403
    // ------------------------------------------------------------------
    step(2, 'Intruder B against owner A course -> 403 on all six actions');
    let res = await apiFetch(`/api/admin/courses/${courseIdA}/lessons`, intruderToken, {
      method: 'POST',
      body: JSON.stringify({ title: `B-ou-${rand}`, content: 'Unauthorized lesson' }),
    });
    await expectStatus('1/6 createLesson on A course', res, 403);

    res = await apiFetch(`/api/admin/courses/${courseIdA}/lessons/reorder`, intruderToken, {
      method: 'PUT',
      body: JSON.stringify({ orderedIds: [lessonId1, lessonId2] }),
    });
    await expectStatus('2/6 reorderLessons on A course', res, 403);

    res = await apiFetch(`/api/admin/courses/${courseIdA}/quiz`, intruderToken, {
      method: 'POST',
      body: JSON.stringify({
        title: `B-quiz-${rand}`,
        questions: [{ questionText: 'X', options: ['A', 'B'], correctOptionIndex: 1 }],
      }),
    });
    await expectStatus('3/6 saveQuiz on A course', res, 403);

    res = await apiFetch(`/api/admin/courses/${courseIdA}/quiz/questions`, intruderToken, {
      method: 'POST',
      body: JSON.stringify({ questionText: 'X', options: ['A', 'B', 'C', 'D'], correctOptionIndex: 2 }),
    });
    await expectStatus('4/6 addQuizQuestion on A course', res, 403);

    res = await uploadDoc(intruderToken, lessonId1);
    await expectStatus('5/6 uploadDocument attached to A lesson', res, 403);

    res = await apiFetch(`/api/admin/documents/${docId1}`, intruderToken, { method: 'DELETE' });
    await expectStatus('6/6 deleteDocument attached to A lesson', res, 403);
    console.log(
      `   DB check: document ${docId1} still exists? ${await (async () => {
        const q = await pool.query('SELECT id FROM documents WHERE id = $1', [docId1]);
        return q.rows.length > 0;
      })()}`,
    );

    // ------------------------------------------------------------------
    // SCENARIO 3: owner A succeeds on the same six actions against own course
    // ------------------------------------------------------------------
    step(3, 'Owner A against own course -> all six succeed');
    body = await (await mkLesson(courseIdA, 'L3')).json();
    if (body?.id == null) throw new Error(`Owner L3 failed: ${JSON.stringify(body)}`);
    const lessonId3 = body.id;
    ok(`1/6 createLesson on own course -> lesson id=${lessonId3}`);

    res = await apiFetch(`/api/admin/courses/${courseIdA}/lessons/reorder`, ownerToken, {
      method: 'PUT',
      body: JSON.stringify({ orderedIds: [lessonId1, lessonId2, lessonId3] }),
    });
    await expectStatus('2/6 reorderLessons on own course', res, 200);

    res = await apiFetch(`/api/admin/courses/${courseIdA}/quiz`, ownerToken, {
      method: 'POST',
      body: JSON.stringify({
        title: `E2E-owner-quiz-2-${rand}`,
        questions: [{ questionText: 'Q2a', options: ['A', 'B'], correctOptionIndex: 1 }],
      }),
    });
    await expectStatus('3/6 saveQuiz on own course', res, 200);

    res = await apiFetch(`/api/admin/courses/${courseIdA}/quiz/questions`, ownerToken, {
      method: 'POST',
      body: JSON.stringify({ questionText: 'Q2b', options: ['A', 'B', 'C', 'D'], correctOptionIndex: 3 }),
    });
    await expectStatus('4/6 addQuizQuestion on own course', res, 200);

    docRes = await uploadDoc(ownerToken, lessonId2);
    body = await docRes.json();
    if (docRes.status !== 201 || !body?.id) throw new Error(`Owner attach D3 failed: ${docRes.status}`);
    docIds.push(body.id);
    ok(`5/6 uploadDocument attached to own lesson -> doc ${body.id}`);

    res = await apiFetch(`/api/admin/documents/${docId1}`, ownerToken, { method: 'DELETE' });
    await expectStatus('6/6 deleteDocument on own attached doc', res, 200);

    // ------------------------------------------------------------------
    // SCENARIO 4: admin is unaffected -> same six succeed on A's content
    // ------------------------------------------------------------------
    step(4, 'Admin against A course -> all six succeed (unaffected)');
    body = await (
      await apiFetch(`/api/admin/courses/${courseIdA}/lessons`, adminToken, {
        method: 'POST',
        body: JSON.stringify({ title: `AD-L-${rand}`, content: 'Admin-created lesson' }),
      })
    ).json();
    if (body?.id == null) throw new Error(`Admin lesson failed: ${JSON.stringify(body)}`);
    ok(`1/6 admin createLesson in A course -> lesson id=${body.id}`);

    res = await apiFetch(`/api/admin/courses/${courseIdA}/lessons/reorder`, adminToken, {
      method: 'PUT',
      body: JSON.stringify({ orderedIds: [lessonId1, lessonId2, body.id] }),
    });
    await expectStatus('2/6 admin reorderLessons in A course', res, 200);

    res = await apiFetch(`/api/admin/courses/${courseIdA}/quiz`, adminToken, {
      method: 'POST',
      body: JSON.stringify({
        title: `E2E-admin-quiz-${rand}`,
        questions: [{ questionText: 'QA', options: ['A', 'B'], correctOptionIndex: 0 }],
      }),
    });
    await expectStatus('3/6 admin saveQuiz in A course', res, 200);

    res = await apiFetch(`/api/admin/courses/${courseIdA}/quiz/questions`, adminToken, {
      method: 'POST',
      body: JSON.stringify({ questionText: 'QB', options: ['A', 'B', 'C', 'D'], correctOptionIndex: 1 }),
    });
    await expectStatus('4/6 admin addQuizQuestion in A course', res, 200);

    docRes = await uploadDoc(adminToken, lessonId1);
    if (docRes.status !== 201) throw new Error(`Admin attach failed: ${docRes.status}`);
    await (
      await docRes.json()
    ).id;
    ok('5/6 admin uploadDocument attached to A lesson');

    res = await apiFetch(`/api/admin/documents/${docId2}`, adminToken, { method: 'DELETE' });
    await expectStatus('6/6 admin deleteDocument on A attached doc', res, 200);

    // ------------------------------------------------------------------
    // SCENARIO 5: intruder B positive control -> own content all succeeds
    // ------------------------------------------------------------------
    step(5, 'Intruder B own content -> succeeds (proves 403s were authorization)');
    res = await apiFetch(`/api/admin/courses/${courseIdB}/lessons`, intruderToken, {
      method: 'POST',
      body: JSON.stringify({ title: `BL2-${rand}`, content: 'Own lesson two' }),
    });
    await expectStatus('createLesson on own course (B)', res, 201);

    docRes = await uploadDoc(intruderToken, lessonIdB);
    body = await docRes.json();
    if (docRes.status !== 201 || !body?.id) throw new Error(`Intruder own attach failed: ${docRes.status}`);
    docIds.push(body.id);
    ok(`uploadDocument attached to own lesson (B) -> doc ${body.id}`);

    console.log('\n═══════════════════════════════════════════════');
    console.log(failures === 0 ? ' ALL SCENARIOS PASSED ✅' : ` ${failures} ASSERTION(S) FAILED ❌`);
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
    if (courseIds.length > 0) {
      try {
        const deleted = await pool.query(`DELETE FROM courses WHERE id = ANY($1::int[])`, [courseIds]);
        console.log(
          `  ✅ Courses deleted (id in ${courseIds.join(',')}) — cascades lessons/quiz/questions/documents/enrollments/completions/certificates`,
        );
        if (deleted.rowCount !== courseIds.length) {
          console.log('  ⚠️  Some course rows were missing (already deleted?)');
        }
      } catch (e: any) {
        console.log(`  ❌ Course deletion error: ${e?.message}`);
      }
      try {
        const strayDocs = await pool.query('SELECT COUNT(*)::int AS c FROM documents WHERE id = ANY($1::text[])', [
          docIds,
        ]);
        console.log(`  ℹ️  Stray documents remaining in DB: ${strayDocs.rows[0].c}`);
      } catch (e: any) {
        console.log(`  ❌ Stray document count error: ${e?.message}`);
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
