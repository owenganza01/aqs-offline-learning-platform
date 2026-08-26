import { Application } from 'express';
import { getHealth, getDbTest } from '../controllers/health-controller.js';

export function registerHealthRoutes(app: Application): void {
  app.get('/api/health', getHealth);
  app.get('/api/db-test', getDbTest);
}
