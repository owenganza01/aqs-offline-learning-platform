// Comprehensive API Test Suite — AQS Learning Platform
// Tests all API endpoints with student and admin tokens
import http from 'http';

const BASE = 'http://localhost:3000';

const STUDENT_TOKEN = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJuYW1lIjoiU3R1ZGVudCBUZXN0IiwiZW1haWwiOiJzdHVkZW50QGFxc3Rlc3QuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsImF1dGhfdGltZSI6MTc4NDAzNTIwMCwidXNlcl9pZCI6ImNmRWtRUHhCQjNiMGlmOER4N2pSdGlHTFc3NDMiLCJmaXJlYmFzZSI6eyJpZGVudGl0aWVzIjp7ImVtYWlsIjpbInN0dWRlbnRAYXFzdGVzdC5jb20iXX0sInNpZ25faW5fcHJvdmlkZXIiOiJwYXNzd29yZCJ9LCJpYXQiOjE3ODQwMzUyMDEsImV4cCI6MTc4NDAzODgwMSwiYXVkIjoiYXFzLWxlYXJuaW5nLWxvY2FsIiwiaXNzIjoiaHR0cHM6Ly9zZWN1cmV0b2tlbi5nb29nbGUuY29tL2Fxcy1sZWFybmluZy1sb2NhbCIsInN1YiI6ImNmRWtRUHhCQjNiMGlmOER4N2pSdGlHTFc3NDMifQ.';
const ADMIN_TOKEN = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJuYW1lIjoiQWRtaW4gVGVzdCIsImVtYWlsIjoiYWRtaW5AYXFzdGVzdC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwiYXV0aF90aW1lIjoxNzg0MDM1MjAxLCJ1c2VyX2lkIjoidEZqWHZHeHZhcVd6bWNWTVEyTTJGZkUyN0UwMiIsImZpcmViYXNlIjp7ImlkZW50aXRpZXMiOnsiZW1haWwiOlsiYWRtaW5AYXFzdGVzdC5jb20iXX0sInNpZ25faW5fcHJvdmlkZXIiOiJwYXNzd29yZCJ9LCJpYXQiOjE3ODQwMzUyMDEsImV4cCI6MTc4NDAzODgwMSwiYXVkIjoiYXFzLWxlYXJuaW5nLWxvY2FsIiwiaXNzIjoiaHR0cHM6Ly9zZWN1cmV0b2tlbi5nb29nbGUuY29tL2Fxcy1sZWFybmluZy1sb2NhbCIsInN1YiI6InRGalh2R3h2YXFXem1jVk1RMk0yRmZFMjdFMDIifQ.';

let results = { pass: 0, fail: 0, blocked: 0 };
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

function test(id, desc, fn) {
  return fn().then(ok => {
    if (ok === true) {
      console.log(`  PASS | ${id} — ${desc}`);
      results.pass++;
    } else if (ok === 'BLOCKED') {
      console.log(`  BLOCKED | ${id} — ${desc}`);
      results.blocked++;
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
  await section('SECTION 2 — AUTHORIZATION & ROLE PROTECTION');

  await test('TC-AUTHZ-02', 'Student POST /api/admin/courses → 403', async () => {
    const r = await api('POST', '/api/admin/courses', { title: 'Hack', description: 'test', thumbnail: 'teal' }, STUDENT_TOKEN);
    return r.status === 403 || 'Expected 403, got ' + r.status;
  });
  await test('TC-AUTHZ-02', 'Student DELETE /api/admin/courses/1 → 403', async () => {
    const r = await api('DELETE', '/api/admin/courses/1', null, STUDENT_TOKEN);
    return r.status === 403 || 'Expected 403, got ' + r.status;
  });
  await test('TC-AUTHZ-02', 'Student GET /api/admin/analytics → 403', async () => {
    const r = await api('GET', '/api/admin/analytics', null, STUDENT_TOKEN);
    return r.status === 403 || 'Expected 403, got ' + r.status;
  });
  await test('TC-AUTHZ-02', 'Admin GET /api/admin/analytics → 200', async () => {
    const r = await api('GET', '/api/admin/analytics', null, ADMIN_TOKEN);
    return r.status === 200 || 'Expected 200, got ' + r.status;
  });

  await test('TC-AUTHZ-03', 'Student PUT /api/auth/role → 403', async () => {
    const r = await api('PUT', '/api/auth/role', { role: 'admin' }, STUDENT_TOKEN);
    return r.status === 403 || 'Expected 403, got ' + r.status;
  });

  await test('TC-APISEC-01', 'No token GET /api/auth/me → 401', async () => {
    const r = await api('GET', '/api/auth/me', null, null);
    return r.status === 401 || 'Expected 401, got ' + r.status;
  });

  await section('SECTION 13 — API ENDPOINT PROTECTION MATRIX');

  const matrix = [
    ['GET', '/api/courses', 200, 200, 401],
    ['GET', '/api/courses/1', 200, 200, 401],
    ['POST', '/api/lessons/1/complete', 200, 200, 401],
    ['POST', '/api/quizzes/1/submit', 404, 404, 401],
    ['POST', '/api/sync', 200, 200, 401],
    ['PUT', '/api/auth/profile', 200, 200, 401],
    ['PUT', '/api/auth/role', 403, 200, 401],
    ['POST', '/api/admin/courses', 403, 201, 401],
    ['PUT', '/api/admin/courses/1', 403, 200, 401],
    ['DELETE', '/api/admin/courses/1', 403, 200, 401],
    ['POST', '/api/admin/courses/1/lessons', 403, 201, 401],
    ['GET', '/api/admin/analytics', 403, 200, 401],
  ];

  for (const [method, path, studentExp, adminExp, anonExp] of matrix) {
    await test('TC-ROLE-02', `${method} ${path} — Student → ${studentExp}`, async () => {
      let body = undefined;
      if (method === 'POST' || method === 'PUT') {
        if (path.includes('/role')) body = { role: 'admin' };
        else if (path.includes('/profile')) body = { name: 'test' };
        else if (path.includes('/lessons')) body = { title: 'test', content: 'test' };
        else if (path.includes('/quizzes')) body = { answers: [] };
        else if (path.includes('/sync')) body = { lessonCompletions: [], quizSubmissions: [] };
        else body = { title: 'test', description: 'test' };
      }
      const r = await api(method, path, body, STUDENT_TOKEN);
      return r.status === studentExp || `Expected ${studentExp}, got ${r.status}`;
    });
  }

  // Admin success tests (separate from matrix to avoid 403 tests for admin)
  const adminSuccessTests = [
    ['GET', '/api/courses', 200],
    ['PUT', '/api/auth/profile', 200, { name: 'Admin Test' }],
    ['GET', '/api/admin/analytics', 200],
  ];
  for (const [method, path, exp, body] of adminSuccessTests) {
    await test('TC-ROLE-02', `${method} ${path} — Admin → ${exp}`, async () => {
      const r = await api(method, path, body || undefined, ADMIN_TOKEN);
      return r.status === exp || `Expected ${exp}, got ${r.status}`;
    });
  }

  await section('SECTION 3 — COURSE CREATION (ADMIN)');

  let courseId;
  await test('TC-COURSE-01', 'POST /api/admin/courses → 201', async () => {
    const r = await api('POST', '/api/admin/courses', {
      title: 'Test Statistics Course',
      description: 'A test course for QA purposes covering statistical methods',
      thumbnail: 'teal'
    }, ADMIN_TOKEN);
    if (r.status === 201 && r.body?.id) { courseId = r.body.id; return true; }
    return `Expected 201 with id, got ${r.status}: ${JSON.stringify(r.body)}`;
  });

  if (courseId) {
    await test('TC-COURSE-02', `PUT /api/admin/courses/${courseId} → 200`, async () => {
      const r = await api('PUT', `/api/admin/courses/${courseId}`, {
        title: 'Updated Statistics Course', description: 'Updated'
      }, ADMIN_TOKEN);
      return r.status === 200 || `Expected 200, got ${r.status}`;
    });
  }

  await test('TC-COURSE-05', 'POST /api/admin/courses (empty) → 400', async () => {
    const r = await api('POST', '/api/admin/courses', { title: '', description: '' }, ADMIN_TOKEN);
    return (r.status >= 400 && r.status < 500) || `Expected 4xx, got ${r.status}`;
  });

  await section('SECTION 4 — LESSON MANAGEMENT (ADMIN)');

  let lessonId;
  if (courseId) {
    await test('TC-LESSON-01', `POST courses/${courseId}/lessons → 201`, async () => {
      const r = await api('POST', `/api/admin/courses/${courseId}/lessons`, {
        title: 'Introduction to Variance',
        content: 'Variance measures spread.',
        videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
        sortOrder: 1
      }, ADMIN_TOKEN);
      if (r.status === 201 && r.body?.id) { lessonId = r.body.id; return true; }
      return `Expected 201, got ${r.status}: ${JSON.stringify(r.body)}`;
    });

    if (lessonId) {
      await test('TC-LESSON-03', `PUT lessons/${lessonId} → 200`, async () => {
        const r = await api('PUT', `/api/admin/courses/${courseId}/lessons/${lessonId}`, {
          title: 'Introduction to Variance — Updated', content: 'Updated'
        }, ADMIN_TOKEN);
        return r.status === 200 || `Expected 200, got ${r.status}`;
      });
    }

    let lesson2Id;
    await test('TC-LESSON-02', 'POST 2nd lesson → 201', async () => {
      const r = await api('POST', `/api/admin/courses/${courseId}/lessons`, {
        title: 'Correlation Coefficients', content: 'Measures linear association.', sortOrder: 2
      }, ADMIN_TOKEN);
      if (r.status === 201 && r.body?.id) { lesson2Id = r.body.id; return true; }
      return `Expected 201, got ${r.status}`;
    });

    await test('TC-COMPLETE-01', `GET /api/courses/${courseId} → has lessons`, async () => {
      const r = await api('GET', `/api/courses/${courseId}`, null, STUDENT_TOKEN);
      if (r.status === 200 && r.body?.lessons?.length >= 2) return true;
      return `Expected 200 with >=2 lessons, got ${r.status}: ${r.body?.lessons?.length} lessons`;
    });
  }

  await section('SECTION 5 — QUIZ CREATION (ADMIN)');

  if (courseId) {
    await test('TC-QUIZ-01', 'POST quiz questions → 200', async () => {
      const r = await api('POST', `/api/admin/courses/${courseId}/quiz/questions`, {
        questionText: 'What does variance measure?',
        options: ['Mean', 'Spread', 'Sum', 'Min'],
        correctOptionIndex: 1
      }, ADMIN_TOKEN);
      return r.status === 200 || `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`;
    });
  }

  await section('SECTION 6 — STUDENT ENROLLMENT');

  if (courseId) {
    await test('TC-ENROLL-01', 'POST /api/sync (enroll) → 200', async () => {
      const r = await api('POST', '/api/sync', {
        lessonCompletions: [], quizSubmissions: []
      }, STUDENT_TOKEN);
      return r.status === 200 || `Expected 200, got ${r.status}`;
    });
  }

  await section('SECTION 7 — COURSE COMPLETION (STUDENT)');

  if (lessonId) {
    await test('TC-COMPLETE-03', `POST lessons/${lessonId}/complete → 200`, async () => {
      const r = await api('POST', `/api/lessons/${lessonId}/complete`, null, STUDENT_TOKEN);
      return r.status === 200 || `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`;
    });
  }

  await section('SECTION 10 — ANALYTICS (ADMIN)');

  await test('TC-ANALYTICS-01', 'GET /api/admin/analytics → 200', async () => {
    const r = await api('GET', '/api/admin/analytics', null, ADMIN_TOKEN);
    if (r.status === 200 && r.body) return true;
    return `Expected 200 with body, got ${r.status}`;
  });

  await section('SECTION 12 — PROFILE EDITING');

  await test('TC-PROFILE-01', 'Student PUT /api/auth/profile → 200', async () => {
    const r = await api('PUT', '/api/auth/profile', { name: 'Test Student Name' }, STUDENT_TOKEN);
    return r.status === 200 || `Expected 200, got ${r.status}`;
  });

  await test('TC-PROFILE-01', 'Verify name updated via GET /api/auth/me', async () => {
    const r = await api('GET', '/api/auth/me', null, STUDENT_TOKEN);
    if (r.status === 200 && r.body?.dbUser?.name === 'Test Student Name') return true;
    return `Expected 'Test Student Name', got '${r.body?.dbUser?.name}'`;
  });

  await section('SECTION 14 — EDGE CASES');

  let emptyCourseId;
  await test('TC-EDGE-01', 'Create empty course → 201', async () => {
    const r = await api('POST', '/api/admin/courses', {
      title: 'Empty Course', description: 'No lessons', thumbnail: 'gray'
    }, ADMIN_TOKEN);
    if (r.status === 201 && r.body?.id) { emptyCourseId = r.body.id; return true; }
    return `Expected 201, got ${r.status}`;
  });

  if (emptyCourseId) {
    await test('TC-EDGE-01', `GET /api/courses/${emptyCourseId} → 0 lessons`, async () => {
      const r = await api('GET', `/api/courses/${emptyCourseId}`, null, STUDENT_TOKEN);
      if (r.status === 200 && Array.isArray(r.body?.lessons) && r.body.lessons.length === 0) return true;
      return `Expected 0 lessons, got ${r.body?.lessons?.length}`;
    });
  }

  await section('CLEANUP');

  if (courseId) {
    await api('DELETE', `/api/admin/courses/${courseId}`, null, ADMIN_TOKEN);
    console.log(`  Deleted course ${courseId}`);
  }
  if (emptyCourseId) {
    await api('DELETE', `/api/admin/courses/${emptyCourseId}`, null, ADMIN_TOKEN);
    console.log(`  Deleted empty course ${emptyCourseId}`);
  }

  // Restore name
  await api('PUT', '/api/auth/profile', { name: 'Ganza Owen' }, STUDENT_TOKEN);

  console.log(`\n${'='.repeat(60)}`);
  console.log('API TEST SUMMARY');
  console.log(`${'='.repeat(60)}`);
  console.log(`PASS:    ${results.pass}`);
  console.log(`FAIL:    ${results.fail}`);
  console.log(`BLOCKED: ${results.blocked}`);
  console.log(`TOTAL:   ${results.pass + results.fail + results.blocked}`);
  if (failures.length > 0) {
    console.log(`\nFAILURES:`);
    for (const f of failures) {
      console.log(`  ${f.id}: ${f.reason}`);
    }
  }
}

main().catch(console.error);
