import http from 'http';

const EMULATOR = 'http://127.0.0.1:9099';
const API_KEY = 'emulator';

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const url = new URL(EMULATOR + path);
    const req = http.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': data.length } }, (res) => {
      let buf = '';
      res.on('data', (c) => buf += c);
      res.on('end', () => { try { resolve(JSON.parse(buf)); } catch { resolve(buf); } });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  const users = [
    { email: 'student-test@aqstest.com', password: 'Student123!', displayName: 'Student Test' },
    { email: 'admin-test@aqstest.com', password: 'Admin123!', displayName: 'Admin Test' },
  ];

  for (const u of users) {
    console.log(`\n--- Creating ${u.email} ---`);
    const signup = await post(`/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`, {
      email: u.email,
      password: u.password,
      displayName: u.displayName,
      returnSecureToken: true,
    });
    if (signup.error) {
      console.log('Signup error:', signup.error.message);
      // Try sign in instead
      const signin = await post(`/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
        email: u.email,
        password: u.password,
        returnSecureToken: true,
      });
      if (signin.error) {
        console.log('Signin error:', signin.error.message);
      } else {
        console.log('Signed in. UID:', signin.localId);
        console.log('TOKEN=' + signin.idToken);
      }
    } else {
      console.log('Created. UID:', signup.localId);
      console.log('TOKEN=' + signup.idToken);
    }
  }
}

main().catch(console.error);
