// src/lib/firebase-admin.ts
import { initializeApp, getApps, cert, type AppOptions } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { createConnection } from 'net';

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
  const options: AppOptions = {};

  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      // Render (and some other platforms) inject env vars with literal newline
      // characters inside the private_key value instead of the \n escape sequence,
      // which breaks JSON.parse(). We normalise them here before parsing.
      const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON.replace(/\\n/g, '\n') // keep already-escaped \n as-is
        .replace(
          /"private_key"\s*:\s*"([\s\S]*?)"/,
          (_match, key) => `"private_key": "${key.replace(/\n/g, '\\n').replace(/\r/g, '')}"`,
        );
      const serviceAccount = JSON.parse(rawJson);

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
