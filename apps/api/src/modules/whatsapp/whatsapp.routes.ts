import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '@nexora/database';
import type { AccountStatus, AccountSummary } from '@nexora/types';
import { maskPhone, buildWaLink } from '@nexora/utils';
import { asyncHandler, AppError, NotFoundError } from '../../common/errors';
import { getAccountCounters } from './counters.service';
import { riskForAccount } from '../risk/risk.service';
import { recordActivity } from '../../common/activity/recorder';
import { emitToUser } from '../../common/realtime/socket';

export const whatsappRouter: import('express').Router = Router();

const ACCOUNT_STATUSES: AccountStatus[] = ['ONLINE', 'OFFLINE', 'PAUSED', 'ATTENTION'];

const accountCreateSchema = z.object({
  name: z.string().min(1).max(60).optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  countryCode: z.string().optional().nullable(),
  status: z.enum(['ONLINE', 'OFFLINE', 'PAUSED', 'ATTENTION']).optional(),
});

const accountUpdateSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  phone: z.string().min(5).max(20).optional(),
  countryCode: z.string().optional().nullable(),
  status: z.enum(['ONLINE', 'OFFLINE', 'PAUSED', 'ATTENTION']).optional(),
});

async function buildSummary(account: {
  id: string;
  userId: string;
  name: string;
  phone: string;
  phoneMasked: string;
  countryCode: string | null;
  status: AccountStatus;
  position: number;
  lastActiveAt: Date | null;
  isDemo: boolean;
  createdAt: Date;
  updatedAt: Date;
} & { gateway?: { provider: string; status: string; lastError: string | null } | null }): Promise<AccountSummary & { gatewayStatus: string | null }> {
  const [counters, risk] = await Promise.all([
    getAccountCounters({ id: account.id }),
    riskForAccount(account),
  ]);
  return {
    ...account,
    counters,
    risk,
    gatewayStatus: account.gateway?.status ?? null,
  };
}

whatsappRouter.get('/', asyncHandler(async (req: Request, res: Response) => {
  let accounts = await prisma.whatsAppAccount.findMany({
    where: { userId: req.user!.id },
    include: { gateway: { select: { provider: true, status: true, lastError: true } } },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  });

  if (accounts.length === 0) {
    const defaultAcc = await prisma.whatsAppAccount.create({
      data: {
        userId: req.user!.id,
        name: 'Основной WhatsApp',
        phone: '',
        phoneMasked: 'Не привязан',
        status: 'OFFLINE',
        position: 1,
      },
      include: { gateway: { select: { provider: true, status: true, lastError: true } } },
    });
    accounts = [defaultAcc];
  }

  const summaries = await Promise.all(accounts.map(buildSummary));
  res.json({ items: summaries });
}));

whatsappRouter.post('/', asyncHandler(async (req: Request, res: Response) => {
  const body = accountCreateSchema.parse(req.body);
  const userId = req.user!.id;
  const count = await prisma.whatsAppAccount.count({ where: { userId } });
  if (count >= 7) {
    throw new AppError(400, 'Maximum of 7 WhatsApp accounts per workspace.', 'ACCOUNT_LIMIT');
  }
  const digits = (body.phone ?? '').replace(/\D/g, '');
  const account = await prisma.whatsAppAccount.create({
    data: {
      userId,
      name: body.name?.trim() || (digits ? maskPhone(digits) : `Аккаунт ${count + 1}`),
      phone: digits,
      phoneMasked: digits ? maskPhone(digits) : '—',
      countryCode: body.countryCode ?? null,
      status: body.status ?? 'OFFLINE',
      position: count + 1,
    },
  });
  await recordActivity({
    userId,
    action: 'ACCOUNT_CREATED',
    entity: 'WHATSAPP_ACCOUNT',
    entityId: account.id,
    metadata: { name: account.name },
  });
  emitToUser(userId, 'account.created', account);
  res.status(201).json(await buildSummary(account));
}));

whatsappRouter.patch('/:id', asyncHandler(async (req: Request, res: Response) => {
  const body = accountUpdateSchema.parse(req.body);
  const userId = req.user!.id;
  const account = await prisma.whatsAppAccount.findFirst({ where: { id: String(req.params.id), userId } });
  if (!account) throw new NotFoundError('Account not found.');

  let phone: string | undefined;
  let phoneMasked: string | undefined;
  if (body.phone) {
    phone = body.phone.replace(/\D/g, '');
    phoneMasked = maskPhone(phone);
  }

  const updated = await prisma.whatsAppAccount.update({
    where: { id: account.id },
    data: {
      name: body.name ?? undefined,
      phone,
      phoneMasked,
      countryCode: body.countryCode === undefined ? undefined : body.countryCode,
      status: body.status ?? undefined,
      lastActiveAt:
        body.status === 'ONLINE' ? new Date() : body.status ? account.lastActiveAt : undefined,
    },
  });

  await recordActivity({
    userId,
    action: 'ACCOUNT_UPDATED',
    entity: 'WHATSAPP_ACCOUNT',
    entityId: updated.id,
    metadata: { name: updated.name, fields: Object.keys(body) },
  });
  emitToUser(userId, 'account.status.changed', {
    id: updated.id,
    status: updated.status,
  });
  res.json(await buildSummary(updated));
}));

async function setAccountStatus(req: Request, res: Response, status: AccountStatus) {
  const userId = req.user!.id;
  const account = await prisma.whatsAppAccount.findFirst({ where: { id: String(req.params.id), userId } });
  if (!account) throw new NotFoundError('Account not found.');

  const updated = await prisma.whatsAppAccount.update({
    where: { id: account.id },
    data: {
      status,
      lastActiveAt: status === 'ONLINE' ? new Date() : account.lastActiveAt,
    },
  });
  const action =
    status === 'PAUSED'
      ? 'ACCOUNT_PAUSED'
      : status === 'ONLINE'
        ? 'ACCOUNT_RESUMED'
        : 'ACCOUNT_UPDATED';
  await recordActivity({
    userId,
    action: action as never,
    entity: 'WHATSAPP_ACCOUNT',
    entityId: updated.id,
    metadata: { name: updated.name, status },
  });
  emitToUser(userId, 'account.status.changed', { id: updated.id, status });
  emitToUser(userId, 'account.metrics.updated', { id: updated.id });
  res.json(await buildSummary(updated));
}

whatsappRouter.post('/:id/pause', asyncHandler(async (req, res) => setAccountStatus(req, res, 'PAUSED')));
whatsappRouter.post('/:id/resume', asyncHandler(async (req, res) => setAccountStatus(req, res, 'ONLINE')));
whatsappRouter.post('/:id/attention', asyncHandler(async (req, res) => setAccountStatus(req, res, 'ATTENTION')));

whatsappRouter.post('/:id/open', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const account = await prisma.whatsAppAccount.findFirst({ where: { id: String(req.params.id), userId } });
  if (!account) throw new NotFoundError('Account not found.');
  await recordActivity({
    userId,
    action: 'ACCOUNT_OPENED',
    entity: 'WHATSAPP_ACCOUNT',
    entityId: account.id,
    metadata: { name: account.name },
  });
  // The desktop client listens for this realtime event and opens the
  // corresponding WhatsApp Web window. In plain browser mode the
  // frontend falls back to a new tab.
  emitToUser(userId, 'account.open.requested', { id: account.id, name: account.name });
  res.json({ ok: true, whatsappUrl: `https://web.whatsapp.com` });
}));

whatsappRouter.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const account = await prisma.whatsAppAccount.findFirst({
    where: { id: String(req.params.id), userId: req.user!.id },
  });
  if (!account) throw new NotFoundError('Account not found.');
  res.json(await buildSummary(account));
}));

whatsappRouter.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const account = await prisma.whatsAppAccount.findFirst({ where: { id: String(req.params.id), userId } });
  if (!account) throw new NotFoundError('Account not found.');
  // Kill the built-in WA session (if any) so no files/sockets linger.
  const { logoutWaSession } = await import('../wa/wa.manager');
  await logoutWaSession(account.id);
  await prisma.whatsAppAccount.delete({ where: { id: account.id } });
  await recordActivity({
    userId,
    action: 'ACCOUNT_UPDATED',
    entity: 'WHATSAPP_ACCOUNT',
    entityId: account.id,
    metadata: { deleted: true, name: account.name },
  });
  emitToUser(userId, 'account.deleted', { id: account.id });
  res.json({ ok: true });
}));

export { buildWaLink };