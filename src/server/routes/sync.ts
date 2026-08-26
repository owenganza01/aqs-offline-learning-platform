import { Application, RequestHandler } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validateBody, syncSchema } from '../../middleware/validate.js';
import { syncHandler } from '../controllers/sync-controller.js';

export interface SyncRouteDeps {
  syncRateLimit: RequestHandler;
}

export function registerSyncRoutes(app: Application, deps: SyncRouteDeps): void {
  app.post('/api/sync', requireAuth, deps.syncRateLimit, validateBody(syncSchema), syncHandler);
}
