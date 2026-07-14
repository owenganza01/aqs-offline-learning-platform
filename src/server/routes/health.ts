import { Application } from 'express';
import { getHealth } from '../controllers/health-controller.ts';

export function registerHealthRoutes(app: Application): void {
  app.get('/api/health', getHealth);
}
