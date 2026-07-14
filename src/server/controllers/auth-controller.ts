import { Request, Response } from 'express';
import { AuthRequest } from '../../middleware/auth.ts';
import * as authService from '../services/auth-service.ts';

export async function getMe(req: AuthRequest, res: Response): Promise<void> {
  try {
    res.json({
      user: req.user,
      dbUser: req.dbUser,
    });
  } catch (error: any) {
    console.error('Error in /api/auth/me:', error);
    res.status(500).json({ error: error.message });
  }
}

export async function register(req: Request, res: Response): Promise<void> {
  try {
    const { name, email, inviteCode } = req.body;
    const user = await authService.registerUser(name, email, inviteCode);
    res.status(201).json({ success: true, user });
  } catch (error: any) {
    if (error.statusCode) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Failed to complete registration.' });
  }
}

export async function updateProfile(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { avatarUrl, name } = req.body;
    if (!req.dbUser) {
      res.status(404).json({ error: 'User profile not found.' });
      return;
    }
    const dbUser = await authService.updateUserProfile(req.dbUser.id, { avatarUrl, name });
    res.json({ success: true, dbUser });
  } catch (error: any) {
    console.error('Error in updating profile details:', error);
    res.status(500).json({ error: error.message });
  }
}
