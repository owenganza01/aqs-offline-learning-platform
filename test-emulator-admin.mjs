import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import http from 'http';

// Connect to emulator
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
initializeApp({ projectId: 'aqs-learning-local' });
const adminAuth = getAuth();

const DB_USERS = [
  { uid: 'cfEkQPxBB3b0if8Dx7jRtiGLW743', email: 'student@aqstest.com', password: 'Student123!', displayName: 'Student Test' },
  { uid: 'tFjXvGxvaqWzmcVMQ2M2FfE27E02', email: 'admin@aqstest.com', password: 'Admin123!', displayName: 'Admin Test' },
];

async function main() {
  for (const u of DB_USERS) {
    console.log(`\n--- Creating ${u.email} (uid: ${u.uid}) ---`);
    try {
      await adminAuth.createUser({ uid: u.uid, email: u.email, password: u.password, displayName: u.displayName, emailVerified: true });
      console.log('Created in emulator');
    } catch (e) {
      if (e.code === 'auth/uid-already-exists') {
        console.log('User already exists in emulator');
      } else {
        console.log('Error:', e.code, e.message);
        continue;
      }
    }
  }

  // Now get tokens using client SDK via REST API
  for (const u of DB_USERS) {
    const body = JSON.stringify({ email: u.email, password: u.password, returnSecureToken: true });
    const token = await new Promise((resolve, reject) => {
      const req = http.request('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': body.length }
      }, (res) => {
        let buf = '';
        res.on('data', (c) => buf += c);
        res.on('end', () => { try { resolve(JSON.parse(buf)); } catch { resolve(buf); } });
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
    if (token.error) {
      console.log(`Sign-in error for ${u.email}:`, token.error.message);
    } else {
      console.log(`\nTOKEN_FOR_${u.uid === 'cfEkQPxBB3b0if8Dx7jRtiGLW743' ? 'STUDENT' : 'ADMIN'}=${token.idToken}`);
    }
  }
}

main().catch(console.error);
