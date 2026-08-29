import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@nexora/database';
import type { SafeUser } from '@nexora/types';
import { asyncHandler, AppError } from '../../common/errors';
import {
  authorize,
  clearSessionCookie,
  setSessionCookie,
  signToken,
} from '../../common/security/auth';
import { authLimiter } from '../../common/security/middleware';
import { recordActivity } from '../../common/activity/recorder';

export const authRouter: import('express').Router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function toSafeUser(user: {
  id: string;
  email: string;
  name: string | null;
  isAdmin: boolean;
  isDemo: boolean;
  createdAt: Date;
  updatedAt: Date;
}): SafeUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isAdmin: user.isAdmin,
    isDemo: user.isDemo,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

authRouter.post('/login', authLimiter(), asyncHandler(async (req: Request, res: Response) => {
  const body = loginSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
  if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
    throw new AppError(401, 'Invalid email or password.', 'INVALID_CREDENTIALS');
  }
  const token = signToken({ id: user.id, email: user.email });
  setSessionCookie(res, token);
  await recordActivity({
    userId: user.id,
    action: 'LOGIN',
    entity: 'USER',
    entityId: user.id,
    metadata: { method: 'password' },
  });
  res.json({ token, user: toSafeUser(user), expiresIn: 7 * 24 * 3600 });
}));

authRouter.post('/register', asyncHandler(async (req: Request, res: Response) => {
  const body = z
    .object({
      email: z.string().email(),
      password: z.string().min(8).max(100),
      name: z.string().min(1).max(80).optional(),
    })
    .parse(req.body);

  const existing = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
  if (existing) {
    throw new AppError(409, 'An account with this email already exists.', 'EMAIL_TAKEN');
  }

  const passwordHash = await bcrypt.hash(body.password, 10);
  const user = await prisma.user.create({
    data: {
      email: body.email.toLowerCase(),
      passwordHash,
      name: body.name ?? null,
    },
  });

  const token = signToken({ id: user.id, email: user.email });
  setSessionCookie(res, token);
  await recordActivity({
    userId: user.id,
    action: 'LOGIN',
    entity: 'USER',
    entityId: user.id,
    metadata: { registered: true },
  });
  res.status(201).json({ token, user: toSafeUser(user) });
}));

authRouter.post('/logout', authorize, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  await recordActivity({ userId, action: 'LOGOUT', entity: 'USER', entityId: userId });
  clearSessionCookie(res);
  res.json({ ok: true });
}));

authRouter.get('/me', authorize, asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, email: true, name: true, isAdmin: true, isDemo: true, createdAt: true, updatedAt: true },
  });
  if (!user) throw new AppError(404, 'User not found.');
  res.json({ user: toSafeUser(user) });
}));