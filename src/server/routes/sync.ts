import { Application, RequestHandler } from 'express';
import { requireAuth } from '../../middleware/auth.ts';
import { validateBody, syncSchema } from '../../middleware/validate.ts';
import { syncHandler } from '../controllers/sync-controller.ts';

export interface SyncRouteDeps {
  syncRateLimit: RequestHandler;
}

export function registerSyncRoutes(app: Application, deps: SyncRouteDeps): void {
  app.post('/api/sync', requireAuth, deps.syncRateLimit, validateBody(syncSchema), syncHandler);
}
