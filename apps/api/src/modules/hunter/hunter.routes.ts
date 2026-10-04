import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '@nexora/database';
import { asyncHandler, NotFoundError, AppError } from '../../common/errors';
import { logger } from '../../common/logger';
import { hunterQueue } from './hunter-queue.service';
import { LeadHunterService } from './hunter.service';
import type { HunterDiscoverySource } from '@nexora/types';

export const hunterRouter: import('express').Router = Router();

const createJobSchema = z.object({
  name: z.string().optional(),
  niche: z.string().min(2, 'Укажите нишу для поиска'),
  city: z.string().min(2, 'Укажите город поиска'),
  country: z.string().optional(),
  targetCount: z.number().int().min(1).max(500).default(30),
  minScore: z.number().int().min(0).max(100).default(50),
  sources: z.array(z.enum(['2GIS', 'GOOGLE', 'INSTAGRAM', 'TELEGRAM', 'LINKEDIN', 'EMAIL'])).default(['2GIS', 'GOOGLE']),
  filters: z.object({
    websiteFilter: z.enum(['all', 'with_site', 'without_site']).optional().default('all'),
    hasInstagram: z.boolean().optional(),
    hasTelegram: z.boolean().optional(),
    requireProblematicSite: z.boolean().optional(),
    requireAutomationNeed: z.boolean().optional(),
    minScore: z.number().optional(),
  }).optional().default({}),
  autoOutreach: z.boolean().optional().default(false),
});

/**
 * POST /api/hunter/jobs
 * Create and enqueue a new Lead Hunter autonomous job.
 */
hunterRouter.post(
  '/jobs',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const body = createJobSchema.parse(req.body);

    const query = `${body.niche} ${body.city}${body.country ? ` (${body.country})` : ''}`;
    const jobName = body.name || `Поиск: ${body.niche} — ${body.city}`;

    const job = await prisma.leadHunterJob.create({
      data: {
        userId,
        name: jobName,
        query,
        niche: body.niche,
        city: body.city,
        country: body.country || null,
        targetCount: body.targetCount,
        minScore: body.minScore,
        sources: body.sources as any,
        filters: body.filters as any,
        autoOutreach: body.autoOutreach,
        status: 'PENDING',
        currentStage: 'В очереди на запуск',
        logs: [
          {
            timestamp: new Date().toISOString(),
            message: `Задача «${jobName}» создана. Ожидание запуска...`,
            type: 'info',
          },
        ] as any,
      },
    });

    // Enqueue to background worker
    await hunterQueue.enqueue(job.id, userId);

    res.status(201).json(job);
  }),
);

/**
 * GET /api/hunter/jobs
 * List all Lead Hunter jobs for current user.
 */
hunterRouter.get(
  '/jobs',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(String(req.query.pageSize || '20'), 10) || 20));
    const status = req.query.status as string | undefined;

    const where: any = { userId };
    if (status) {
      where.status = status;
    }

    const [items, total] = await Promise.all([
      prisma.leadHunterJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          _count: { select: { leads: true } },
        },
      }),
      prisma.leadHunterJob.count({ where }),
    ]);

    res.json({
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  }),
);

/**
 * GET /api/hunter/jobs/:id
 * Get full job details, live logs, and associated discovered leads.
 */
hunterRouter.get(
  '/jobs/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const jobId = String(req.params.id);

    const job = await prisma.leadHunterJob.findFirst({
      where: { id: jobId, userId },
      include: {
        leads: {
          take: 50,
          orderBy: { createdAt: 'desc' },
          include: {
            score: true,
            analysis: true,
          },
        },
      },
    });

    if (!job) {
      throw new NotFoundError('Задача Lead Hunter не найдена');
    }

    res.json(job);
  }),
);

/**
 * POST /api/hunter/jobs/:id/pause
 * Pause a running job.
 */
hunterRouter.post(
  '/jobs/:id/pause',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const jobId = String(req.params.id);

    await hunterQueue.pause(jobId, userId);
    res.json({ success: true, message: 'Задача приостановлена' });
  }),
);

/**
 * POST /api/hunter/jobs/:id/resume
 * Resume a paused job.
 */
hunterRouter.post(
  '/jobs/:id/resume',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const jobId = String(req.params.id);

    await hunterQueue.resume(jobId, userId);
    res.json({ success: true, message: 'Задача возобновлена' });
  }),
);

/**
 * POST /api/hunter/jobs/:id/cancel
 * Cancel a running or pending job.
 */
hunterRouter.post(
  '/jobs/:id/cancel',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const jobId = String(req.params.id);

    await hunterQueue.cancel(jobId, userId);
    res.json({ success: true, message: 'Задача отменена' });
  }),
);

/**
 * GET /api/hunter/stats
 * Get aggregated hunter metrics.
 */
hunterRouter.get(
  '/stats',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const stats = await LeadHunterService.getStats(userId);
    res.json(stats);
  }),
);

/**
 * POST /api/hunter/jobs/:id/send-whatsapp
 * Trigger immediate WhatsApp outreach for all discovered leads in this job.
 */
hunterRouter.post(
  '/jobs/:id/send-whatsapp',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const jobId = String(req.params.id);
    const limit = typeof req.body?.limit === 'number' ? req.body.limit : 200;

    const result = await LeadHunterService.sendWhatsAppOutreachForJob(jobId, userId, limit);
    res.json({
      success: true,
      message: `Отправлено сообщений в WhatsApp: ${result.sentCount}. Пропущено: ${result.skippedCount}.`,
      result,
    });
  }),
);

