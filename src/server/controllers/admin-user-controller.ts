import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.js';
import { canPromoteToRole } from '../services/authorization-service.js';
import {
  listUsers as listUsersService,
  changeUserRole as changeUserRoleService,
  createInstructorAccount,
  parsePagination,
  approveInstructor,
  declineInstructor,
  StateGuardError,
} from '../services/user-service.js';
import { initiateInstructorClosure, withClosureInfo, ClosureError } from '../services/closure-service.js';

export async function listUsers(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { limit, offset } = parsePagination(
      req.query.limit as string | undefined,
      req.query.offset as string | undefined,
    );
    const { data, total } = await listUsersService({ limit, offset });
    res.setHeader('X-Total-Count', total);
    // Attach server-computed closure state to every row so the admin UI never
    // re-implements the expiry rule client-side.
    res.json(data.map((u: any) => withClosureInfo(u)));
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

export async function approveInstructorUser(req: AuthRequest, res: Response): Promise<void> {
  try {
    const targetUserId = parseInt(req.params.userId);
    if (isNaN(targetUserId)) {
      res.status(400).json({ error: 'Invalid user ID.' });
      return;
    }
    const updated = await approveInstructor(targetUserId);
    res.json({ success: true, dbUser: updated });
  } catch (error: unknown) {
    if (error instanceof StateGuardError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('Approve instructor error:', error);
    res.status(500).json({ error: 'Failed to approve instructor.' });
  }
}

export async function declineInstructorUser(req: AuthRequest, res: Response): Promise<void> {
  try {
    const targetUserId = parseInt(req.params.userId);
    if (isNaN(targetUserId)) {
      res.status(400).json({ error: 'Invalid user ID.' });
      return;
    }
    const { rejectionReason } = req.body;
    const updated = await declineInstructor(targetUserId, rejectionReason);
    res.json({ success: true, dbUser: updated });
  } catch (error: unknown) {
    if (error instanceof StateGuardError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('Decline instructor error:', error);
    res.status(500).json({ error: 'Failed to decline instructor.' });
  }
}

export async function closeInstructorAccount(req: AuthRequest, res: Response): Promise<void> {
  try {
    const targetUserId = parseInt(req.params.userId);
    if (isNaN(targetUserId)) {
      res.status(400).json({ error: 'Invalid user ID.' });
      return;
    }
    // Admins cannot close their own account.
    if (targetUserId === req.dbUser!.id) {
      res.status(403).json({ error: 'You cannot close your own account.' });
      return;
    }
    const { retentionDays, reason } = req.body ?? {};
    const updated = await initiateInstructorClosure(targetUserId, { retentionDays, reason });
    res.json({ success: true, dbUser: withClosureInfo(updated) });
  } catch (error: unknown) {
    if (error instanceof ClosureError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('Initiate closure error:', error);
    res.status(500).json({ error: 'Failed to initiate account closure.' });
  }
}
