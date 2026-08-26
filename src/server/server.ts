// src/server/server.ts
import { createApp } from './app.js';
import { shutdownDb } from '../db/index.js';

export async function startServer() {
  const app = await createApp();
  const PORT = 3000;

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received — shutting down gracefully...`);
    server.close(() => {
      console.log('HTTP server closed.');
    });
    await shutdownDb();
    console.log('Database pool closed.');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
