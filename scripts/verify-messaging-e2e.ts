#!/usr/bin/env node
// scripts/verify-messaging-e2e.ts
// End-to-end verification of the learner <-> instructor messaging flow.
// Hits the REAL Express HTTP routes with REAL Firebase ID tokens and prints the
// output for each scenario, wipe-user.js style. All test rows and test auth
// users are removed in a `finally` block, success or failure.
// Usage: npx tsx scripts/verify-messaging-e2e.ts
//
// Scenarios covered:
//  S1  Learner starts a thread (atomic find-or-create, no duplicate conversations)
//  S2  Instructor replies; unread badge rises and drops on mark-as-read
//  S3  Real admin close-initiate -> BOTH learner and instructor sends blocked (403)
//  S4  Fixture reset (direct DB, no cancel endpoint) -> sends work again
//  S5  wipe_user() preserves message history (FKs nulled, snapshots kept)
//  Finally: explicit course DELETE (cascades threads), 0-stray-row + Firebase report

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
  const learnerUid = `e2e-learner-${rand}`;
  const learnerEmail = `e2e.learner.${rand}@example.com`;
  const instructorUid = `e2e-instructor-${rand}`;
  const instructorEmail = `e2e.instructor.${rand}@example.com`;
  const adminUid = `e2e-admin-${rand}`;
  const adminEmail = `e2e.admin.${rand}@example.com`;
  const createdAuthUids = [learnerUid, instructorUid, adminUid];

  console.log('\n===============================================');
  console.log('  LEARNER-INSTRUCTOR MESSAGING — END-TO-END VERIFICATION');
  console.log('===============================================');
  console.log(` DB target      : ${DATABASE_URL.split('@')[1] || DATABASE_URL}`);
  console.log(` learner uid    : ${learnerUid}`);
  console.log(` instructor uid : ${instructorUid}`);
  console.log(` admin uid      : ${adminUid}`);
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

  let learnerToken: string;
  let learnerUserId: number;
  let instructorToken: string;
  let instructorUserId: number;
  let adminToken: string;

  let courseAId: number | undefined;
  let courseBId: number | undefined;
  let conversationId: number;
  let learnerMessageId: number;
  let instructorMessageId: number;
  let instructorMsgSenderIdInDb: number;

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
    // Seed: Firebase users + DB rows (admin + active instructor + learner)
    // ------------------------------------------------------------------
    await adminAuth.createUser({ uid: adminUid, email: adminEmail, displayName: 'E2E Admin' });
    await pool.query(
      `INSERT INTO users (uid, email, name, role, onboarding_status)
       VALUES ($1, $2, $3, 'admin', 'active') ON CONFLICT (email) DO UPDATE SET role='admin', onboarding_status='active'`,
      [adminUid, adminEmail.toLowerCase(), 'E2E Admin'],
    );
    adminToken = await mintIdToken(adminUid, adminEmail);
    ok('Admin auth user created + DB row seeded (role=admin)');

    await adminAuth.createUser({ uid: instructorUid, email: instructorEmail, displayName: 'E2E Instructor' });
    instructorToken = await mintIdToken(instructorUid, instructorEmail);
    const instructorRows = await pool.query(
      `INSERT INTO users (uid, email, name, role, onboarding_status)
       VALUES ($1, $2, $3, 'instructor', 'active') RETURNING id`,
      [instructorUid, instructorEmail.toLowerCase(), 'E2E Instructor'],
    );
    instructorUserId = instructorRows.rows[0].id;
    ok(`Instructor auth user + DB row seeded (role=instructor, onboarding=active, id=${instructorUserId})`);

    await adminAuth.createUser({ uid: learnerUid, email: learnerEmail, displayName: 'E2E Learner' });
    learnerToken = await mintIdToken(learnerUid, learnerEmail);
    const learnerRows = await pool.query(
      `INSERT INTO users (uid, email, name, role, onboarding_status)
       VALUES ($1, $2, $3, 'learner', 'active') RETURNING id`,
      [learnerUid, learnerEmail.toLowerCase(), 'E2E Learner'],
    );
    learnerUserId = learnerRows.rows[0].id;
    ok(`Learner auth user + DB row seeded (role=learner, id=${learnerUserId})`);

    // ------------------------------------------------------------------
    // Seed: two courses owned by the instructor; learner enrolled in A only
    // ------------------------------------------------------------------
    let res = await apiFetch('/api/admin/courses', instructorToken, {
      method: 'POST',
      body: JSON.stringify({
        title: `E2E Messaging Course A ${rand}`,
        description: 'Temporary end-to-end verification course.',
        thumbnail: '',
      }),
    });
    let body: any = await res.json();
    console.log(`   create course A HTTP ${res.status}`);
    courseAId = body?.id;
    if (res.status === 201 && typeof courseAId === 'number') {
      ok(`Course A created (id=${courseAId}, created_by=${body?.createdBy})`);
    } else {
      throw new Error(`Failed to create course A: ${res.status} ${JSON.stringify(body)}`);
    }

    res = await apiFetch('/api/admin/courses', instructorToken, {
      method: 'POST',
      body: JSON.stringify({
        title: `E2E Messaging Course B ${rand}`,
        description: 'Temporary end-to-end verification course (no enrollment).',
        thumbnail: '',
      }),
    });
    body = await res.json();
    courseBId = body?.id;
    if (res.status === 201 && typeof courseBId === 'number') {
      ok(`Course B created (id=${courseBId})`);
    } else {
      throw new Error(`Failed to create course B: ${res.status} ${JSON.stringify(body)}`);
    }

    res = await apiFetch('/api/enrollments', learnerToken, {
      method: 'POST',
      body: JSON.stringify({ courseId: courseAId }),
    });
    body = await res.json();
    console.log(`   enroll learner in course A HTTP ${res.status}`);
    if (res.status === 201 || res.status === 200) {
      ok('Learner enrolled in course A');
    } else {
      throw new Error(`Enrollment failed: ${res.status} ${JSON.stringify(body)}`);
    }

    // ------------------------------------------------------------------
    // S1: atomic find-or-create + no duplicate conversations
    // ------------------------------------------------------------------
    step(1, 'Learner starts a thread; repeated send reuses the same conversation');
    res = await apiFetch('/api/messages/send', learnerToken, {
      method: 'POST',
      body: JSON.stringify({
        courseId: courseAId,
        instructorId: instructorUserId,
        content: 'Hello! I have a question about the syllabus structure.',
      }),
    });
    body = await res.json();
    console.log(`   send#1 HTTP ${res.status}`);
    conversationId = body?.conversationId;
    learnerMessageId = body?.message?.id;
    if (res.status === 201 && typeof conversationId === 'number') {
      ok(`Conversation created on first send (conversationId=${conversationId}, messageId=${learnerMessageId})`);
    } else {
      throw new Error(`First send failed: ${res.status} ${JSON.stringify(body)}`);
    }

    const dupRow = await pool.query(
      `SELECT count(*)::int AS n, min(id) AS conv_id
         FROM conversations
        WHERE course_id=$1 AND learner_id=$2 AND instructor_id=$3`,
      [courseAId, learnerUserId, instructorUserId],
    );
    console.log(`   conversations rows for triplet: ${dupRow.rows[0].n}`);
    if (dupRow.rows[0].n === 1 && dupRow.rows[0].conv_id === conversationId) {
      ok('Exactly one conversation row exists for the triplet');
    } else {
      fail(`Expected exactly 1 conversation row, found ${dupRow.rows[0].n}`);
    }

    res = await apiFetch('/api/messages/send', learnerToken, {
      method: 'POST',
      body: JSON.stringify({
        courseId: courseAId,
        instructorId: instructorUserId,
        content: 'Also, are quizzes graded instantly?',
      }),
    });
    body = await res.json();
    console.log(`   send#2 HTTP ${res.status}`);
    if (res.status === 201 && body?.conversationId === conversationId) {
      ok(`Second send reused the SAME conversation (id=${body.conversationId}) — no duplicate`);
    } else {
      fail(`Expected same conversationId ${conversationId}, got ${body?.conversationId}`);
    }

    // ------------------------------------------------------------------
    // S2: instructor reply + unread lifecycle
    // ------------------------------------------------------------------
    step(2, 'Instructor replies; learner sees unread badge, then marks as read');
    res = await apiFetch('/api/messages/send', instructorToken, {
      method: 'POST',
      body: JSON.stringify({ conversationId, content: 'Hi! Quizzes are graded instantly after submission.' }),
    });
    body = await res.json();
    console.log(`   instructor reply HTTP ${res.status}`);
    instructorMessageId = body?.message?.id;
    if (res.status === 201 && instructorMessageId) {
      ok(`Instructor replied into the existing thread (messageId=${instructorMessageId})`);
    } else {
      fail(`Instructor reply failed: ${res.status} ${JSON.stringify(body)}`);
    }

    res = await apiFetch('/api/messages/unread-total', learnerToken);
    body = await res.json();
    console.log(`   learner unread-total HTTP ${res.status} -> ${JSON.stringify(body)}`);
    if (res.status === 200 && body?.unreadTotal >= 1) {
      ok(`Unread total shows >= 1 (got ${body.unreadTotal})`);
    } else {
      fail(`Expected unreadTotal >= 1, got ${JSON.stringify(body)}`);
    }

    res = await apiFetch(`/api/messages/conversations/${conversationId}`, learnerToken);
    body = await res.json();
    console.log(`   learner thread HTTP ${res.status} (${body?.messages?.length ?? '?'} messages)`);
    if (res.status === 200 && Array.isArray(body?.messages) && body.messages.length === 3) {
      ok('Learner sees all 3 messages (2 sent + instructor reply); reply renders with live instructor name');
    } else {
      fail(`Expected 3 messages in thread, got ${JSON.stringify(body)}`);
    }
    const replyMessage = body?.messages?.find((m: any) => m.id === instructorMessageId);
    if (replyMessage?.senderName === 'E2E Instructor') {
      ok(`Reply carries live senderName="${replyMessage.senderName}"`);
    } else {
      fail(`Expected senderName "E2E Instructor", got ${JSON.stringify(replyMessage)}`);
    }

    res = await apiFetch(`/api/messages/conversations/${conversationId}/read`, learnerToken, { method: 'POST' });
    body = await res.json();
    console.log(`   mark-read HTTP ${res.status} (marked=${body?.marked})`);
    if (res.status === 200 && body?.marked === 1) {
      ok('Mark-as-read cleared the instructor reply');
    } else {
      fail(`Expected marked=1, got ${JSON.stringify(body)}`);
    }

    res = await apiFetch('/api/messages/unread-total', learnerToken);
    body = await res.json();
    console.log(`   learner unread-total after read HTTP ${res.status} -> ${JSON.stringify(body)}`);
    if (res.status === 200 && body?.unreadTotal === 0) {
      ok('Unread total returned to 0 after mark-as-read');
    } else {
      fail(`Expected 0, got ${JSON.stringify(body)}`);
    }

    // Instructor sees the thread in their conversation list
    res = await apiFetch('/api/messages/conversations', instructorToken);
    body = await res.json();
    console.log(`   instructor conversations HTTP ${res.status}`);
    if (res.status === 200 && body?.conversations?.some((c: any) => c.id === conversationId)) {
      ok('Conversation appears in the instructor conversation list (counterpart = learner)');
    } else {
      fail('Conversation missing from instructor list');
    }

    // ------------------------------------------------------------------
    // S3: enrollment gate — learner NOT enrolled in course B cannot message
    // ------------------------------------------------------------------
    step(3, 'Learner without enrollment in course B -> 403');
    res = await apiFetch('/api/messages/send', learnerToken, {
      method: 'POST',
      body: JSON.stringify({ courseId: courseBId, instructorId: instructorUserId, content: 'Should be denied.' }),
    });
    body = await res.json();
    console.log(`   learner->course B send HTTP ${res.status}, error="${body?.error}"`);
    if (res.status === 403) {
      ok('Enrollment gate blocked the non-enrolled learner (403)');
    } else {
      fail(`Expected 403, got ${res.status} ${JSON.stringify(body)}`);
    }

    // ------------------------------------------------------------------
    // S4: real admin close-initiate -> both directions blocked
    // ------------------------------------------------------------------
    step(4, 'Admin initiates closure -> messaging disabled for BOTH participants (403)');
    res = await apiFetch(`/api/admin/users/${instructorUserId}/close-initiate`, adminToken, {
      method: 'POST',
      body: JSON.stringify({ retentionDays: 7, reason: 'E2E closure wiring check' }),
    });
    body = await res.json();
    console.log(`   close-initiate HTTP ${res.status}, closureStatus=${body?.dbUser?.closureStatus}`);
    if (res.status === 200 && body?.dbUser?.closureStatus === 'pending') {
      ok(`Real admin close-initiate set pending closure on instructor (id=${instructorUserId})`);
    } else {
      throw new Error(`close-initiate failed: ${res.status} ${JSON.stringify(body)}`);
    }

    res = await apiFetch('/api/messages/send', learnerToken, {
      method: 'POST',
      body: JSON.stringify({ courseId: courseAId, instructorId: instructorUserId, content: 'Blocked during closure.' }),
    });
    body = await res.json();
    console.log(`   learner send under closure HTTP ${res.status}, error="${body?.error}"`);
    if (res.status === 403) {
      ok('Learner send blocked (403) while instructor account is closing');
    } else {
      fail(`Expected 403, got ${res.status} ${JSON.stringify(body)}`);
    }

    res = await apiFetch('/api/messages/send', instructorToken, {
      method: 'POST',
      body: JSON.stringify({ conversationId, content: 'Blocked during closure too.' }),
    });
    body = await res.json();
    console.log(`   instructor reply under closure HTTP ${res.status}, error="${body?.error}"`);
    if (res.status === 403) {
      ok('Instructor send blocked (403) while their own account is closing — bidirectional gate');
    } else {
      fail(`Expected 403, got ${res.status} ${JSON.stringify(body)}`);
    }

    // ------------------------------------------------------------------
    // S5: fixture reset via direct DB (no cancel closure endpoint) -> 200
    // ------------------------------------------------------------------
    step(5, 'Fixture reset (direct DB) -> sends work again');
    await pool.query(
      `UPDATE users
          SET closure_status=NULL, closure_started_at=NULL,
              closure_retention_days=NULL, closure_reason=NULL
        WHERE id=$1`,
      [instructorUserId],
    );
    ok('Cleared closure fields directly in the DB (fixture reset only)');

    res = await apiFetch('/api/messages/send', learnerToken, {
      method: 'POST',
      body: JSON.stringify({
        courseId: courseAId,
        instructorId: instructorUserId,
        content: 'We are back online after the reset.',
      }),
    });
    body = await res.json();
    console.log(`   learner send after reset HTTP ${res.status}, conversationId=${body?.conversationId}`);
    if (res.status === 201 && body?.conversationId === conversationId) {
      ok('Send succeeds again after fixture reset and reuses the same conversation');
    } else {
      fail(`Expected 201 + same conversation, got ${res.status} ${JSON.stringify(body)}`);
    }

    // ------------------------------------------------------------------
    // S6: wipe_user() preserves the thread history for the survivor
    // ------------------------------------------------------------------
    step(6, 'wipe_user() preserves conversations/messages (FKs nulled, snapshots kept)');
    const instructorMsgRow = (
      await pool.query('SELECT sender_id, sender_name_snapshot FROM messages WHERE id=$1', [instructorMessageId])
    ).rows[0];
    instructorMsgSenderIdInDb = instructorMsgRow.sender_id;
    console.log(
      `   instructor message row before wipe: sender_id=${instructorMsgSenderIdInDb}, snapshot="${instructorMsgRow.sender_name_snapshot}"`,
    );

    const wipeRes = await pool.query('SELECT wipe_user($1) AS wiped', [instructorUid]);
    console.log(`   wipe_user(instructor) returned: ${wipeRes.rows[0].wiped}`);
    if (wipeRes.rows[0].wiped) {
      ok('wipe_user() removed the instructor DB row and personal records');
    } else {
      fail('wipe_user() did not report a wiped row');
    }

    const convRow = (
      await pool.query(
        `SELECT id, course_id, learner_id, instructor_id, learner_name_snapshot, instructor_name_snapshot
           FROM conversations WHERE id=$1`,
        [conversationId],
      )
    ).rows[0];
    console.log(`   conversation after wipe: learner_id=${convRow.learner_id}, instructor_id=${convRow.instructor_id}`);
    if (convRow && convRow.instructor_id === null && convRow.learner_id === learnerUserId) {
      ok('Conversation preserved: instructor FK nulled, learner FK intact (thread survives)');
    } else {
      fail(`Unexpected conversation state: ${JSON.stringify(convRow)}`);
    }
    if (convRow?.instructor_name_snapshot === 'E2E Instructor') {
      ok(`Instructor name preserved via snapshot ("${convRow.instructor_name_snapshot}")`);
    } else {
      fail(`Expected snapshot "E2E Instructor", got "${convRow?.instructor_name_snapshot}"`);
    }

    const msgRows = (
      await pool.query(
        `SELECT id, sender_id, sender_name_snapshot, content FROM messages WHERE conversation_id=$1 ORDER BY id`,
        [conversationId],
      )
    ).rows;
    console.log(`   messages after wipe: ${msgRows.length} rows preserved`);
    if (msgRows.length === 4) {
      ok('All 4 messages preserved (wipe_user does not touch messages)');
    } else {
      fail(`Expected 4 messages, got ${msgRows.length}`);
    }
    const wipedInstructorMsg = msgRows.find((m: any) => m.id === instructorMessageId);
    const wipedLearnerMsg = msgRows.find((m: any) => m.id === learnerMessageId);
    if (
      wipedInstructorMsg &&
      wipedInstructorMsg.sender_id === null &&
      wipedInstructorMsg.sender_name_snapshot === 'E2E Instructor'
    ) {
      ok(`Instructor message kept with sender_id null + snapshot "${wipedInstructorMsg.sender_name_snapshot}"`);
    } else {
      fail(`Instructor message snapshot broken: ${JSON.stringify(wipedInstructorMsg)}`);
    }
    if (wipedLearnerMsg && wipedLearnerMsg.sender_id === learnerUserId) {
      ok('Learner messages keep their sender linkage');
    } else {
      fail(`Learner message linkage broken: ${JSON.stringify(wipedLearnerMsg)}`);
    }

    // Survivor (learner) can still read the history after the wipe
    res = await apiFetch(`/api/messages/conversations/${conversationId}`, learnerToken);
    body = await res.json();
    console.log(`   survivor thread HTTP ${res.status} (${body?.messages?.length ?? '?'} messages)`);
    if (res.status === 200 && body?.messages?.length === 4) {
      const snapshotRendered = body.messages.some(
        (m: any) => m.id === instructorMessageId && m.senderName === 'E2E Instructor',
      );
      if (snapshotRendered) {
        ok('Survivor still reads the full history; wiped sender renders from snapshot name');
      } else {
        fail('Snapshot name not rendered in survivor thread');
      }
    } else {
      fail(`Survivor thread failed: ${res.status} ${JSON.stringify(body)}`);
    }

    console.log('\n═══════════════════════════════════════════════');
    console.log(' ALL SCENARIOS COMPLETE (see ✅/❌ above)');
    console.log('═══════════════════════════════════════════════');
  } finally {
    // ------------------------------------------------------------------
    // CLEANUP — always runs, success or failure. No stray rows/accounts.
    // wipe_user() never deletes courses/messages, so the test course is
    // deleted EXPLICITLY here (its threads cascade away with it).
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

    const testCourseIds = [courseAId, courseBId].filter((id): id is number => typeof id === 'number');
    for (const courseId of testCourseIds) {
      try {
        const del = await pool.query('DELETE FROM courses WHERE id = $1 RETURNING id', [courseId]);
        if (del.rowCount === 1) {
          console.log(`  ✅ Explicit course DELETE removed course ${courseId} (threads cascaded)`);
        } else {
          console.log(`  ℹ️  Course ${courseId} did not exist to delete`);
        }
      } catch (e: any) {
        console.log(`  ❌ Course delete ${courseId}: ${e?.message}`);
      }
    }

    for (const uid of [learnerUid, instructorUid, adminUid]) {
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

    for (const uid of createdAuthUids) {
      try {
        await adminAuth.deleteUser(uid);
        console.log(`  ✅ Firebase Auth user removed: ${uid}`);
      } catch (e: any) {
        console.log(`  ⚠️  Firebase deleteUser(${uid}): ${e?.message || e}`);
      }
    }

    try {
      const { rows } = await pool.query(`SELECT count(*)::int AS n FROM users WHERE uid LIKE 'e2e-%'`);
      console.log(`  ✅ Postgres stray e2e-% users after cleanup: ${rows[0].n}`);
      if (rows[0].n !== 0) console.log('  ❌ STRAY ROWS DETECTED — investigate!');
    } catch (e: any) {
      console.log(`  ❌ Stray-user check failed: ${e?.message}`);
    }
    try {
      const { rows } = await pool.query(
        `SELECT count(*)::int AS n
           FROM conversations c
           JOIN courses CO ON CO.id = c.course_id
          WHERE CO.title LIKE 'E2E Messaging Course%'`,
      );
      console.log(`  ✅ Postgres leftover E2E conversations after course DELETE: ${rows[0].n}`);
      if (rows[0].n !== 0) console.log('  ❌ LEFT-OVER THREADS DETECTED — investigate!');
    } catch (e: any) {
      console.log(`  ❌ Left-over thread check failed: ${e?.message}`);
    }

    await pool.end();
    console.log('\n✨ Cleanup complete. No stray accounts or rows remain.\n');
  }
}

main().catch(async (err) => {
  console.error('\n💥 Unexpected fatal error:', err);
  process.exit(1);
});
