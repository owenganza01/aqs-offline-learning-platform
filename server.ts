(async () => {
  const { startServer } = await import('./src/server/server.ts');
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
})();
