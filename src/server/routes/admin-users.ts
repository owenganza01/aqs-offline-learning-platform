import { Application, RequestHandler } from 'express';
import { requireAuth, requireAdmin } from '../../middleware/auth.ts';
import { validateBody, createInstructorSchema, changeRoleSchema } from '../../middleware/validate.ts';
import { listUsers, changeUserRole, createInstructor } from '../controllers/admin-user-controller.ts';

export interface AdminUserRouteDeps {
  authRateLimit: RequestHandler;
}

export function registerAdminUserRoutes(app: Application, deps: AdminUserRouteDeps): void {
  app.post(
    '/api/admin/instructors',
    requireAuth,
    requireAdmin,
    deps.authRateLimit,
    validateBody(createInstructorSchema),
    createInstructor,
  );

  app.get('/api/admin/users', requireAuth, requireAdmin, listUsers);

  app.put(
    '/api/admin/users/:userId/role',
    requireAuth,
    requireAdmin,
    deps.authRateLimit,
    validateBody(changeRoleSchema),
    changeUserRole,
  );
}
