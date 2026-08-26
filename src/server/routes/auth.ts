import { Application, RequestHandler } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validateBody, registerSchema, updateProfileSchema } from '../../middleware/validate.js';
import { getMe, register, updateProfile } from '../controllers/auth-controller.js';

export interface AuthRouteDeps {
  registerRateLimit: RequestHandler;
  profileRateLimit: RequestHandler;
}

export function registerAuthRoutes(app: Application, deps: AuthRouteDeps): void {
  app.get('/api/auth/me', requireAuth, getMe);

  app.post('/api/auth/register', deps.registerRateLimit, validateBody(registerSchema), register);

  app.put('/api/auth/profile', requireAuth, deps.profileRateLimit, validateBody(updateProfileSchema), updateProfile);
}
