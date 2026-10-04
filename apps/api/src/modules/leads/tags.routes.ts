import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '@nexora/database';
import { asyncHandler, NotFoundError, AppError } from '../../common/errors';

export const tagRouter: import('express').Router = Router();

const DEFAULT_PRESET_TAGS = [
  { name: '🔥 Горячий лид', color: '#EF4444' },
  { name: '💰 Нужен сайт', color: '#10B981' },
  { name: '📞 Перезвонить', color: '#3B82F6' },
  { name: '⏳ Думает / КП', color: '#8B5CF6' },
  { name: '🇺🇸 США Кровля', color: '#06B6D4' },
  { name: '❌ Отказ / Спам', color: '#64748B' },
];

/**
 * GET /api/tags
 * List all tags for the user, ensuring default preset tags exist.
 */
tagRouter.get('/', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  let items = await prisma.tag.findMany({
    where: { userId },
    include: {
      _count: { select: { leads: true } },
    },
    orderBy: { name: 'asc' },
  });

  // If no tags exist yet, seed default preset tags
  if (items.length === 0) {
    for (const preset of DEFAULT_PRESET_TAGS) {
      await prisma.tag.create({
        data: {
          userId,
          name: preset.name,
          color: preset.color,
        },
      });
    }
    items = await prisma.tag.findMany({
      where: { userId },
      include: {
        _count: { select: { leads: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  res.json({ items });
}));

const createTagSchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).default('#10B981'),
});

/**
 * POST /api/tags
 * Create a new tag.
 */
tagRouter.post('/', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const body = createTagSchema.parse(req.body);

  const existing = await prisma.tag.findFirst({
    where: { userId, name: { equals: body.name.trim(), mode: 'insensitive' } },
  });
  if (existing) {
    res.json(existing);
    return;
  }

  const created = await prisma.tag.create({
    data: {
      userId,
      name: body.name.trim(),
      color: body.color,
    },
  });

  res.status(201).json(created);
}));

/**
 * DELETE /api/tags/:id
 * Delete a tag.
 */
tagRouter.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const tag = await prisma.tag.findFirst({
    where: { id: String(req.params.id), userId },
  });
  if (!tag) throw new NotFoundError('Tag not found.');

  await prisma.leadTag.deleteMany({ where: { tagId: tag.id } });
  await prisma.tag.delete({ where: { id: tag.id } });

  res.json({ success: true });
}));
