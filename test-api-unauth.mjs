// Test script to generate Firebase ID tokens via Google OAuth REST API
// Uses the Firebase Auth signInWithIdp endpoint

const FIREBASE_API_KEY = 'AIzaSyCel_hjT73L6e2oQtTbqFV5_pcS1Ad0mJU';

async function getGoogleOAuthToken() {
  // Use the Google OAuth2 token endpoint with the API key
  // This simulates the Firebase Auth popup flow
  const authUrl = `https://accounts.google.com/o/oauth2/auth?` +
    `client_id=24215930573-...apps.googleusercontent.com&` +
    `redirect_uri=http://localhost:3000&` +
    `response_type=token&` +
    `scope=email profile`;
  
  console.log('Auth URL:', authUrl);
  console.log('Need to complete Google OAuth flow manually or use emulator.');
}

// Alternative: Test all endpoints WITHOUT auth (verify 401)
async function testUnauthenticated() {
  const BASE = 'http://localhost:3000';
  const results = [];
  
  const endpoints = [
    { method: 'GET', path: '/api/auth/me' },
    { method: 'PUT', path: '/api/auth/role', body: { role: 'admin' } },
    { method: 'PUT', path: '/api/auth/profile', body: { name: 'test' } },
    { method: 'GET', path: '/api/courses' },
    { method: 'GET', path: '/api/courses/1' },
    { method: 'POST', path: '/api/lessons/1/complete' },
    { method: 'POST', path: '/api/quizzes/1/submit', body: { answers: [0] } },
    { method: 'POST', path: '/api/sync', body: { lessonCompletions: [], quizSubmissions: [] } },
    { method: 'POST', path: '/api/admin/courses', body: { title: 'test', description: 'test' } },
    { method: 'PUT', path: '/api/admin/courses/1', body: { title: 'test' } },
    { method: 'DELETE', path: '/api/admin/courses/1' },
    { method: 'POST', path: '/api/admin/courses/1/lessons', body: { title: 'test', content: 'test' } },
    { method: 'GET', path: '/api/admin/analytics' },
  ];
  
  console.log('\n=== UNAUTHENTICATED ACCESS TEST (expect 401 for all) ===\n');
  
  for (const ep of endpoints) {
    const opts = { method: ep.method, headers: {} };
    if (ep.body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(ep.body);
    }
    
    try {
      const resp = await fetch(`${BASE}${ep.path}`, opts);
      const data = await resp.json().catch(() => null);
      const status = resp.status;
      const pass = status === 401;
      results.push({ endpoint: `${ep.method} ${ep.path}`, status, pass, error: data?.error });
      console.log(`${pass ? 'PASS' : 'FAIL'} | ${ep.method} ${ep.path} → ${status} ${data?.error || ''}`);
    } catch (err) {
      results.push({ endpoint: `${ep.method} ${ep.path}`, status: 'ERROR', pass: false, error: err.message });
      console.log(`FAIL | ${ep.method} ${ep.path} → ERROR: ${err.message}`);
    }
  }
  
  // Test static pages
  console.log('\n=== STATIC PAGE TESTS ===\n');
  
  try {
    const resp = await fetch(`${BASE}/`);
    const pass = resp.status === 200;
    const html = await resp.text();
    const hasLoginButton = html.includes('SIGN IN WITH GOOGLE');
    const hasTitle = html.includes('AQS Digital Classroom');
    const hasBadges = html.includes('Offline Compatible') && html.includes('Sync Progress');
    console.log(`${pass ? 'PASS' : 'FAIL'} | GET / → ${resp.status}`);
    console.log(`${hasLoginButton ? 'PASS' : 'FAIL'} | Landing page has SIGN IN WITH GOOGLE button: ${hasLoginButton}`);
    console.log(`${hasTitle ? 'PASS' : 'FAIL'} | Landing page has AQS Digital Classroom title: ${hasTitle}`);
    console.log(`${hasBadges ? 'PASS' : 'FAIL'} | Landing page has feature badges: ${hasBadges}`);
  } catch (err) {
    console.log(`FAIL | GET / → ERROR: ${err.message}`);
  }
  
  // Test PWA manifest
  console.log('\n=== PWA MANIFEST TEST ===\n');
  try {
    const resp = await fetch(`${BASE}/manifest.json`);
    if (resp.status === 200) {
      const manifest = await resp.json();
      console.log('PASS | manifest.json accessible');
      console.log(`  name: ${manifest.name || manifest.short_name || 'MISSING'}`);
      console.log(`  start_url: ${manifest.start_url || 'MISSING'}`);
      console.log(`  display: ${manifest.display || 'MISSING'}`);
      console.log(`  icons: ${manifest.icons?.length || 0} icon(s)`);
    } else {
      console.log(`FAIL | manifest.json → ${resp.status}`);
    }
  } catch (err) {
    console.log(`FAIL | manifest.json → ERROR: ${err.message}`);
  }
  
  // Test service worker
  console.log('\n=== SERVICE WORKER TEST ===\n');
  try {
    const resp = await fetch(`${BASE}/sw.js`);
    if (resp.status === 200) {
      console.log('PASS | sw.js (service worker) accessible');
    } else {
      // Try other common locations
      const resp2 = await fetch(`${BASE}/service-worker.js`);
      if (resp2.status === 200) {
        console.log('PASS | service-worker.js accessible');
      } else {
        console.log(`INFO | No service worker found at /sw.js or /service-worker.js (status: ${resp.status}, ${resp2.status})`);
      }
    }
  } catch (err) {
    console.log(`INFO | Service worker check: ${err.message}`);
  }
  
  // Summary
  const total = results.length;
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.log(`\n=== SUMMARY: ${passed}/${total} passed, ${failed} failed ===\n`);
}

testUnauthenticated().catch(console.error);
