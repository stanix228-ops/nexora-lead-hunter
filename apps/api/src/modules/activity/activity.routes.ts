import type { Request, Response } from 'express';
import { prisma } from '@nexora/database';
import { asyncHandler } from '../../common/errors';
import { paginate, parsePagination } from '../../common/pagination';

export const activityRouter = require('express').Router();

activityRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { page, pageSize } = parsePagination(req.query);
    const filters: Record<string, unknown> = { userId };

    if (req.query.action) filters.action = String(req.query.action);
    if (req.query.entity) filters.entity = String(req.query.entity);
    if (req.query.entityId) filters.entityId = String(req.query.entityId);
    if (req.query.leadId) filters.leadId = String(req.query.leadId);

    const [items, total] = await Promise.all([
      prisma.activityEvent.findMany({
        where: filters,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.activityEvent.count({ where: filters }),
    ]);

    res.json(paginate(items, total, { page, pageSize }));
  }),
);

activityRouter.get(
  '/latest',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const items = await prisma.activityEvent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    res.json({ items });
  }),
);