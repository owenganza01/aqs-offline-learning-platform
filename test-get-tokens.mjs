import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyCel_hjT73L6e2oQtTbqFV5_pcS1Ad0mJU',
  authDomain: 'aqs-learning-local.firebaseapp.com',
  projectId: 'aqs-learning-local',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Point to emulator
// Firebase Auth emulator uses FIREBASE_AUTH_EMULATOR_HOST env var
// But for the client SDK we need to use connectAuthEmulator
import { connectAuthEmulator } from 'firebase/auth';
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });

const EMAIL = 'ganzaowen23@gmail.com';
const PASSWORD = 'TestPass123!';

async function main() {
  // Try to create the user first
  try {
    const cred = await createUserWithEmailAndPassword(auth, EMAIL, PASSWORD);
    console.log('Created user:', cred.user.uid);
  } catch (e) {
    if (e.code === 'auth/email-already-in-use') {
      console.log('User already exists, signing in...');
    } else {
      console.log('Create error:', e.code, e.message);
      return;
    }
  }

  // Sign in and get token
  try {
    const cred = await signInWithEmailAndPassword(auth, EMAIL, PASSWORD);
    const tokenResult = await cred.user.getIdTokenResult();
    console.log('TOKEN=' + tokenResult.token);
    console.log('UID=' + cred.user.uid);
    console.log('EMAIL=' + cred.user.email);
  } catch (e) {
    console.log('Sign-in error:', e.code, e.message);
  }
}

main();
