// Structured logger — JSON in production, formatted in development
// Works in both Node.js (server) and browser environments

const isProduction = process.env.NODE_ENV === 'production';

function sanitizeMeta(meta?: Record<string, unknown>): Record<string, unknown> {
  if (!meta) return {};
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (value instanceof Error) {
      sanitized[key] = value.message;
      sanitized[`${key}Stack`] = value.stack;
    } else if (value instanceof URL) {
      sanitized[key] = value.href;
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

const hasStdout = typeof process !== 'undefined' && typeof process.stdout !== 'undefined';

function writeLog(level: string, message: string, meta?: Record<string, unknown>) {
  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...sanitizeMeta(meta),
  };

  if (isProduction && hasStdout) {
    const line = JSON.stringify(entry) + '\n';
    if (level === 'error' || level === 'fatal') {
      process.stderr.write(line);
    } else {
      process.stdout.write(line);
    }
  } else {
    const ts = new Date().toISOString().slice(11, 23);
    const prefix = `${ts} [${level.toUpperCase()}]`;
    const metaStr = meta && Object.keys(meta).length > 0 ? JSON.stringify(meta) : '';
    if (level === 'error') {
      console.error(prefix, message, metaStr);
    } else if (level === 'warn') {
      console.warn(prefix, message, metaStr);
    } else {
      console.log(prefix, message, metaStr);
    }
  }
}

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => writeLog('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => writeLog('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => writeLog('error', message, meta),
};
