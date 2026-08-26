// src/lib/firebase-admin.ts
import { initializeApp, getApps, cert, type AppOptions } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { createConnection } from 'net';
import firebaseConfig from '../../firebase-applet-config.json';

// Auto-detect Firebase Auth emulator on localhost:9099 (dev only).
// Retries up to 3 seconds to wait for the emulator to finish starting.
// This avoids env-var propagation issues through npx.cmd on Windows.
if (process.env.NODE_ENV !== 'production' && !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  (function probeEmulator(attempt = 0) {
    const probe = createConnection(9099, '127.0.0.1', () => {
      probe.destroy();
      process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
      console.log('[firebase] Firebase Auth emulator detected on :9099 — using emulator, not real Firebase auth');
    });
    probe.setTimeout(800, () => {
      probe.destroy();
      if (attempt < 3) {
        setTimeout(() => probeEmulator(attempt + 1), 500);
      }
    });
    probe.on('error', () => {
      if (attempt < 3) {
        setTimeout(() => probeEmulator(attempt + 1), 500);
      }
    });
  })();
}

if (!getApps().length) {
  const options: AppOptions = {
    projectId: firebaseConfig.projectId,
  };

  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      options.credential = cert(serviceAccount);
      if (serviceAccount.project_id) {
        options.projectId = serviceAccount.project_id;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`[firebase] Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON: ${message}`, { cause: err });
    }
  }

  initializeApp(options);
}

export const adminAuth = getAuth();
