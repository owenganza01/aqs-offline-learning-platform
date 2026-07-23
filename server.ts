import fs from 'fs';

// On platforms like Render, we can't upload a real file — so the full
// service account JSON is provided as a single environment variable.
// If present, write it to disk before anything else initializes,
// since firebase-admin.ts expects a real file at ./service-account.json.
if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  fs.writeFileSync('./service-account.json', process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  console.log('[startup] Wrote service-account.json from FIREBASE_SERVICE_ACCOUNT_JSON env var');
}

const { startServer } = await import('./src/server/server.ts');
startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
