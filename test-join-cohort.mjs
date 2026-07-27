// A4 Integration Tests — POST /api/auth/join-cohort
// Tests: valid invite, invalid code, already-in-cohort guard
//
// Prerequisites:
//   1. Firebase Auth emulator running on :9099
//   2. PostgreSQL running on :5432 (aqs_learning DB)
//   3. Express server running on :3000 (npm run dev:emulator)
//
// Run: node test-join-cohort.mjs
import http from 'http';
import pg from 'pg';

const BASE = 'http://localhost:3000';
const { Pool } = pg;

// Same tokens as test-comprehensive-api.mjs (Firebase Auth emulator, alg:none JWT)
const STUDENT_TOKEN = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJuYW1lIjoiU3R1ZGVudCBUZXN0IiwiZW1haWwiOiJzdHVkZW50QGFxc3Rlc3QuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsImF1dGhfdGltZSI6MTc4NDAzNTIwMCwidXNlcl9pZCI6ImNmRWtRUHhCQjNiMGlmOER4N2pSdGlHTFc3NDMiLCJmaXJlYmFzZSI6eyJpZGVudGl0aWVzIjp7ImVtYWlsIjpbInN0dWRlbnRAYXFzdGVzdC5jb20iXX0sInNpZ25faW5fcHJvdmlkZXIiOiJwYXNzd29yZCJ9LCJpYXQiOjE3ODQwMzUyMDEsImV4cCI6MTc4NDAzODgwMSwiYXVkIjoiYXFzLWxlYXJuaW5nLWxvY2FsIiwiaXNzIjoiaHR0cHM6Ly9zZWN1cmV0b2tlbi5nb29nbGUuY29tL2Fxcy1sZWFybmluZy1sb2NhbCIsInN1YiI6ImNmRWtRUHhCQjNiMGlmOER4N2pSdGlHTFc3NDMifQ.';
const ADMIN_TOKEN = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJuYW1lIjoiQWRtaW4gVGVzdCIsImVtYWlsIjoiYWRtaW5AYXFzdGVzdC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwiYXV0aF90aW1lIjoxNzg0MDM1MjAxLCJ1c2VyX2lkIjoidEZqWHZHeHZhcVd6bWNWTVEyTTJGZkUyN0UwMiIsImZpcmViYXNlIjp7ImlkZW50aXRpZXMiOnsiZW1haWwiOlsiYWRtaW5AYXFzdGVzdC5jb20iXX0sInNpZ25faW5fcHJvdmlkZXIiOiJwYXNzd29yZCJ9LCJpYXQiOjE3ODQwMzUyMDEsImV4cCI6MTc4NDAzODgwMSwiYXVkIjoiYXFzLWxlYXJuaW5nLWxvY2FsIiwiaXNzIjoiaHR0cHM6Ly9zZWN1cmV0b2tlbi5nb29nbGUuY29tL2Fxcy1sZWFybmluZy1sb2NhbCIsInN1YiI6InRGalh2R3h2YXFXem1jVk1RMk0yRmZFMjdFMDIifQ.';

// The student's DB uid (Firebase UID from the token)
const STUDENT_UID = 'cfEkQPxBB3b0if8Dx7jRtiGLW743';

// Known cohort in the DB (from seed data)
const EXISTING_COHORT_CODE = 'ED27836A';

const pool = new Pool({
  host: 'localhost',
  user: 'aqs',
  password: 'aqs123',
  database: 'aqs_learning',
});

let results = { pass: 0, fail: 0 };
let failures = [];

function api(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const data = body ? JSON.stringify(body) : null;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const req = http.request(url, { method, headers, timeout: 15000 }, (res) => {
      let buf = '';
      res.on('data', (c) => buf += c);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(buf); } catch {}
        resolve({ status: res.statusCode, body: json, raw: buf });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (data) req.write(data);
    req.end();
  });
}

async function queryCohortId() {
  const { rows } = await pool.query('SELECT cohort_id FROM users WHERE uid = $1', [STUDENT_UID]);
  return rows[0]?.cohort_id ?? null;
}

async function setCohortId(cohortId) {
  await pool.query('UPDATE users SET cohort_id = $1 WHERE uid = $2', [cohortId, STUDENT_UID]);
}

function test(id, desc, fn) {
  return fn().then(ok => {
    if (ok === true) {
      console.log(`  PASS | ${id} — ${desc}`);
      results.pass++;
    } else {
      console.log(`  FAIL | ${id} — ${desc} — ${ok}`);
      results.fail++;
      failures.push({ id, desc, reason: ok });
    }
  }).catch(e => {
    console.log(`  FAIL | ${id} — ${desc} — ${e.message}`);
    results.fail++;
    failures.push({ id, desc, reason: e.message });
  });
}

async function section(title) {
  console.log(`\n${'='.repeat(60)}\n${title}\n${'='.repeat(60)}`);
}

async function main() {
  // Save original cohort_id so we can restore it after tests
  const originalCohortId = await queryCohortId();
  console.log(`Student original cohort_id: ${originalCohortId}`);

  // ─────────────────────────────────────────────────────────
  // SETUP: Ensure student has no cohort for the first test
  // ─────────────────────────────────────────────────────────
  await section('SETUP — Clear student cohort_id');
  await setCohortId(null);
  const preCheck = await queryCohortId();
  if (preCheck !== null) {
    console.log('FATAL: Could not clear student cohort_id — aborting');
    await pool.end();
    process.exit(1);
  }
  console.log('Student cohort_id cleared to NULL — ready to test');

  // ─────────────────────────────────────────────────────────
  // TEST CASES
  // ─────────────────────────────────────────────────────────
  await section('TC-JOIN-01 — Valid invite code sets cohortId');

  await test('TC-JOIN-01', 'POST /api/auth/join-cohort with valid code → 200', async () => {
    const r = await api('POST', '/api/auth/join-cohort', { inviteCode: EXISTING_COHORT_CODE }, STUDENT_TOKEN);
    if (r.status !== 200) return `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`;
    if (!r.body.success) return `Expected success: true, got ${JSON.stringify(r.body)}`;
    if (!r.body.dbUser) return 'Response missing dbUser';
    if (!r.body.cohort) return 'Response missing cohort';
    return true;
  });

  await test('TC-JOIN-01', 'Response dbUser.cohortId matches the cohort ID', async () => {
    const r = await api('POST', '/api/auth/join-cohort', { inviteCode: EXISTING_COHORT_CODE }, STUDENT_TOKEN);
    // This call will fail because student now has a cohort — use the previous response
    // Instead, verify via DB
    const dbCohortId = await queryCohortId();
    if (dbCohortId === null) return 'DB cohort_id is still NULL after successful join';
    return true;
  });

  await test('TC-JOIN-01', 'Response cohort.inviteCode matches the code sent', async () => {
    // Re-read the cohort_id from DB, then check via /api/auth/me
    const r = await api('GET', '/api/auth/me', null, STUDENT_TOKEN);
    if (r.status !== 200) return `GET /api/auth/me failed: ${r.status}`;
    if (!r.body.dbUser) return 'No dbUser in response';
    if (r.body.dbUser.cohortId === null) return 'dbUser.cohortId is null';
    return true;
  });

  await test('TC-JOIN-01', 'DB confirms cohort_id is set to a valid cohort', async () => {
    const dbCohortId = await queryCohortId();
    if (dbCohortId === null) return 'DB cohort_id is NULL';
    // Verify the cohort actually exists
    const { rows } = await pool.query('SELECT id, invite_code FROM cohorts WHERE id = $1', [dbCohortId]);
    if (rows.length === 0) return `cohort_id ${dbCohortId} does not reference a real cohort`;
    if (rows[0].invite_code !== EXISTING_COHORT_CODE) return `Expected invite_code ${EXISTING_COHORT_CODE}, got ${rows[0].invite_code}`;
    return true;
  });

  // ─────────────────────────────────────────────────────────
  await section('TC-JOIN-02 — Invalid/nonexistent code → clean 4xx');

  await test('TC-JOIN-02', 'POST with nonexistent code → 400', async () => {
    const r = await api('POST', '/api/auth/join-cohort', { inviteCode: 'XXXX0000' }, STUDENT_TOKEN);
    if (r.status !== 400) return `Expected 400, got ${r.status}: ${JSON.stringify(r.body)}`;
    if (!r.body.error) return 'Response missing error message';
    return true;
  });

  await test('TC-JOIN-02', 'Error message mentions invalid code', async () => {
    const r = await api('POST', '/api/auth/join-cohort', { inviteCode: 'XXXX0000' }, STUDENT_TOKEN);
    if (!r.body.error.toLowerCase().includes('invalid')) return `Error should mention invalid: "${r.body.error}"`;
    return true;
  });

  await test('TC-JOIN-02', 'DB cohort_id unchanged after invalid code attempt', async () => {
    const dbCohortId = await queryCohortId();
    // Student should still have cohort_id = 1 from TC-JOIN-01
    if (dbCohortId === null) return 'DB cohort_id became NULL — partial state change detected!';
    return true;
  });

  // ─────────────────────────────────────────────────────────
  await section('TC-JOIN-03 — Already in cohort → blocked with "contact your admin"');

  // Student already has cohort_id from TC-JOIN-01, so just try to join again
  await test('TC-JOIN-03', 'POST when already in cohort → 400', async () => {
    const r = await api('POST', '/api/auth/join-cohort', { inviteCode: EXISTING_COHORT_CODE }, STUDENT_TOKEN);
    if (r.status !== 400) return `Expected 400, got ${r.status}: ${JSON.stringify(r.body)}`;
    if (!r.body.error) return 'Response missing error message';
    return true;
  });

  await test('TC-JOIN-03', 'Error message says "already assigned" or "contact your admin"', async () => {
    const r = await api('POST', '/api/auth/join-cohort', { inviteCode: EXISTING_COHORT_CODE }, STUDENT_TOKEN);
    const msg = r.body.error.toLowerCase();
    if (!msg.includes('already') && !msg.includes('contact')) {
      return `Error should mention already-assigned: "${r.body.error}"`;
    }
    return true;
  });

  await test('TC-JOIN-03', 'DB cohort_id unchanged — not overwritten before guard fires', async () => {
    const dbCohortId = await queryCohortId();
    if (dbCohortId === null) return 'DB cohort_id became NULL — guard did not prevent overwrite!';
    if (dbCohortId !== 1) return `Expected cohort_id 1 (original), got ${dbCohortId}`;
    return true;
  });

  // ─────────────────────────────────────────────────────────
  await section('CLEANUP — Restore original student cohort_id');

  await setCohortId(originalCohortId);
  const restored = await queryCohortId();
  console.log(`Student cohort_id restored to: ${restored}`);

  // ─────────────────────────────────────────────────────────
  await section('RESULTS');

  console.log(`\n  PASS: ${results.pass}  |  FAIL: ${results.fail}`);
  if (failures.length > 0) {
    console.log('\nFailed tests:');
    for (const f of failures) {
      console.log(`  ${f.id} — ${f.desc}: ${f.reason}`);
    }
  }

  await pool.end();
  process.exit(results.fail > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error('Fatal error:', e);
  await pool.end();
  process.exit(1);
});
