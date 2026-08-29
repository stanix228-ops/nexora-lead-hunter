import { Router } from 'express';
import type { Request, Response } from 'express';
import { prisma } from '@nexora/database';
import { asyncHandler } from '../../common/errors';
import { riskForAccount } from './risk.service';

export const riskRouter: import('express').Router = Router();

riskRouter.get('/', asyncHandler(async (req: Request, res: Response) => {
  const accounts = await prisma.whatsAppAccount.findMany({
    where: { userId: req.user!.id },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    include: { metrics: true },
  });

  const items = await Promise.all(
    accounts.map(async (account) => {
      const risk = await riskForAccount(account);
      const messages = account.metrics.reduce(
        (acc, m) => acc + m.messagesSent + m.messagesReceived,
        0,
      );
      const latestEvents = await prisma.riskEvent.findMany({
        where: { accountId: account.id },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });
      return {
        account: {
          id: account.id,
          name: account.name,
          phoneMasked: account.phoneMasked,
          status: account.status,
        },
        risk: risk,
        messages,
        replies: account.metrics.reduce((acc, m) => acc + m.replies, 0),
        events: latestEvents,
      };
    }),
  );

  res.json({ items });
}));

riskRouter.get('/events', asyncHandler(async (req: Request, res: Response) => {
  const events = await prisma.riskEvent.findMany({
    where: {
      account: { userId: req.user!.id },
    },
    include: { account: { select: { id: true, name: true, phoneMasked: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json({ items: events });
}));