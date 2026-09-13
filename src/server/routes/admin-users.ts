import { Application, RequestHandler } from 'express';
import { requireAuth, requireAdmin } from '../../middleware/auth.js';
import {
  validateBody,
  createInstructorSchema,
  changeRoleSchema,
  instructorDeclineSchema,
  closureInitiateSchema,
} from '../../middleware/validate.js';
import {
  listUsers,
  changeUserRole,
  createInstructor,
  approveInstructorUser,
  declineInstructorUser,
  closeInstructorAccount,
} from '../controllers/admin-user-controller.js';

export interface AdminUserRouteDeps {
  authRateLimit: RequestHandler;
  adminLimiter: RequestHandler;
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

  app.get('/api/admin/users', requireAuth, requireAdmin, deps.adminLimiter, listUsers);

  app.put(
    '/api/admin/users/:userId/role',
    requireAuth,
    requireAdmin,
    deps.authRateLimit,
    validateBody(changeRoleSchema),
    changeUserRole,
  );

  app.put('/api/admin/users/:userId/approve', requireAuth, requireAdmin, deps.authRateLimit, approveInstructorUser);

  app.put(
    '/api/admin/users/:userId/decline',
    requireAuth,
    requireAdmin,
    deps.authRateLimit,
    validateBody(instructorDeclineSchema),
    declineInstructorUser,
  );

  app.post(
    '/api/admin/users/:userId/close-initiate',
    requireAuth,
    requireAdmin,
    deps.authRateLimit,
    validateBody(closureInitiateSchema),
    closeInstructorAccount,
  );
}
