import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.ts';
import { canPromoteToRole } from '../services/authorization-service.ts';
import {
  listUsers as listUsersService,
  changeUserRole as changeUserRoleService,
  createInstructorAccount,
  parsePagination,
} from '../services/user-service.ts';

export async function listUsers(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { limit, offset } = parsePagination(
      req.query.limit as string | undefined,
      req.query.offset as string | undefined,
    );
    const { data, total } = await listUsersService({ limit, offset });
    res.setHeader('X-Total-Count', total);
    res.json(data);
  } catch (error: unknown) {
    console.error('List users error:', error);
    res.status(500).json({ error: 'Failed to fetch users.' });
  }
}

export async function changeUserRole(req: AuthRequest, res: Response): Promise<void> {
  try {
    const targetUserId = parseInt(req.params.userId);
    const { role } = req.body;

    if (isNaN(targetUserId)) {
      res.status(400).json({ error: 'Invalid user ID.' });
      return;
    }

    const promotionCheck = await canPromoteToRole(req.dbUser!.id, targetUserId, role);
    if (!promotionCheck.allowed) {
      res.status(403).json({ error: promotionCheck.error });
      return;
    }

    const updated = await changeUserRoleService(targetUserId, role);
    if (!updated) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    res.json({ success: true, dbUser: updated });
  } catch (error: unknown) {
    console.error('Error updating user role:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update role.' });
  }
}

export async function createInstructor(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { name, email } = req.body;
    const user = await createInstructorAccount(name, email);
    res.status(201).json({ success: true, user });
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      (error.message === 'An invitation is already pending for this email.' ||
        error.message === 'Email already registered.')
    ) {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error('Create instructor error:', error);
    res.status(500).json({ error: 'Failed to create instructor account.' });
  }
}
