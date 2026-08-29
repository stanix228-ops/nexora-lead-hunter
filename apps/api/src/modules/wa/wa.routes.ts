import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '@nexora/database';
import { asyncHandler, NotFoundError, AppError } from '../../common/errors';
import {
  startWaSession,
  getWaStatus,
  refreshWaQr,
  requestWaPairingCode,
  logoutWaSession,
  triggerWaSync,
} from './wa.manager';

export const waRouter: import('express').Router = Router();

const pairingCodeSchema = z.object({
  phone: z.string().min(6, 'Укажите номер телефона'),
});

/** GET /api/wa/:accountId — current pairing status (no side effects). */
waRouter.get('/:accountId', asyncHandler(async (req: Request, res: Response) => {
  const account = await prisma.whatsAppAccount.findFirst({
    where: { id: String(req.params.accountId), userId: req.user!.id },
    include: { gateway: true },
  });
  if (!account) throw new NotFoundError('Account not found.');
  const live = getWaStatus(account.id);
  res.json({
    state: live?.state ?? account.gateway?.status ?? 'DISCONNECTED',
    qr: live?.qr ?? null,
    pairingCode: live?.pairingCode ?? null,
    error: live?.error ?? account.gateway?.lastError ?? null,
  });
}));

/** POST /api/wa/:accountId/sync — trigger full history and chat synchronization. */
waRouter.post('/:accountId/sync', asyncHandler(async (req: Request, res: Response) => {
  const account = await prisma.whatsAppAccount.findFirst({
    where: { id: String(req.params.accountId), userId: req.user!.id },
  });
  if (!account) throw new NotFoundError('Account not found.');
  const result = await triggerWaSync(req.user!.id, account.id);
  res.json(result);
}));

/** POST /api/wa/:accountId/init — start/resume a WhatsApp Web session. */
waRouter.post('/:accountId/init', asyncHandler(async (req: Request, res: Response) => {
  const account = await prisma.whatsAppAccount.findFirst({
    where: { id: String(req.params.accountId), userId: req.user!.id },
  });
  if (!account) throw new NotFoundError('Account not found.');
  const result = await startWaSession(req.user!.id, account.id);
  res.json(result);
}));

/** POST /api/wa/:accountId/status — poll state. */
waRouter.post('/:accountId/status', asyncHandler(async (req: Request, res: Response) => {
  const account = await prisma.whatsAppAccount.findFirst({
    where: { id: String(req.params.accountId), userId: req.user!.id },
  });
  if (!account) throw new NotFoundError('Account not found.');
  const live = getWaStatus(account.id);
  if (!live) {
    const started = await startWaSession(req.user!.id, account.id);
    res.json(started);
    return;
  }
  res.json(live);
}));

/** POST /api/wa/:accountId/pairing-code — request 8-character pairing code by phone. */
waRouter.post('/:accountId/pairing-code', asyncHandler(async (req: Request, res: Response) => {
  const parsed = pairingCodeSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, 'Некорректный номер телефона.', 'INVALID_PHONE');
  }
  const account = await prisma.whatsAppAccount.findFirst({
    where: { id: String(req.params.accountId), userId: req.user!.id },
  });
  if (!account) throw new NotFoundError('Account not found.');
  const result = await requestWaPairingCode(req.user!.id, account.id, parsed.data.phone);
  res.json(result);
}));

/** POST /api/wa/:accountId/qr — regenerate the pairing QR. */
waRouter.post('/:accountId/qr', asyncHandler(async (req: Request, res: Response) => {
  const account = await prisma.whatsAppAccount.findFirst({
    where: { id: String(req.params.accountId), userId: req.user!.id },
  });
  if (!account) throw new NotFoundError('Account not found.');
  const result = await refreshWaQr(req.user!.id, account.id);
  res.json(result ?? { state: 'DISCONNECTED', qr: null, pairingCode: null, error: null });
}));

/** POST /api/wa/:accountId/logout — disconnect + delete the local session. */
waRouter.post('/:accountId/logout', asyncHandler(async (req: Request, res: Response) => {
  const account = await prisma.whatsAppAccount.findFirst({
    where: { id: String(req.params.accountId), userId: req.user!.id },
  });
  if (!account) throw new NotFoundError('Account not found.');
  await logoutWaSession(account.id);
  res.json({ ok: true });
}));