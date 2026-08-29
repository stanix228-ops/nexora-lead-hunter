import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/errors';
import {
  analyzeCsv,
  analyzeText,
  candidatesFromAnalysis,
  dedupAgainstDb,
  dedupeBatch,
  performImport,
} from './import.service';

export const importRouter: import('express').Router = Router();

const analyzeSchema = z.object({
  mode: z.enum(['text', 'csv']),
  content: z.string().max(5_000_000),
  mapping: z
    .object({
      companyName: z.string().optional(),
      phone: z.string().optional(),
      whatsappUrl: z.string().optional(),
      instagramUrl: z.string().optional(),
      website: z.string().optional(),
      city: z.string().optional(),
      niche: z.string().optional(),
    })
    .optional(),
  niche: z.string().optional(),
  city: z.string().optional(),
  source: z.string().optional(),
});

const importSchema = analyzeSchema.extend({
  strategy: z.enum(['new', 'all']),
});

importRouter.post('/analyze', asyncHandler(async (req: Request, res: Response) => {
  const body = analyzeSchema.parse(req.body);
  const userId = req.user!.id;

  if (body.mode === 'text') {
    const analysis = analyzeText(body.content);
    const candidates = dedupeBatch(
      candidatesFromAnalysis(analysis, {
        niche: body.niche,
        city: body.city,
      }),
    );
    const { newCandidates, duplicates } = await dedupAgainstDb(userId, candidates);
    res.json({
      mode: 'text',
      analysis,
      dedup: {
        total: candidates.length,
        newLeads: newCandidates.length,
        duplicates,
      },
    });
    return;
  }

  const { parsed, suggestedMapping, candidates } = analyzeCsv(body.content, body.mapping);
  const clean = dedupeBatch(
    candidates.map((c) => ({
      ...c,
      source: body.source ?? 'CSV',
    })),
  );
  const { newCandidates, duplicates } = await dedupAgainstDb(userId, clean);

  res.json({
    mode: 'csv',
    csv: {
      headers: parsed.headers,
      rowCount: parsed.rows.length,
      suggestedMapping,
      preview: parsed.rows.slice(0, 20),
    },
    dedup: {
      total: clean.length,
      newLeads: newCandidates.length,
      duplicates,
    },
  });
}));

importRouter.post('/', asyncHandler(async (req: Request, res: Response) => {
  const body = importSchema.parse(req.body);
  const userId = req.user!.id;

  let candidates;
  if (body.mode === 'text') {
    const analysis = analyzeText(body.content);
    candidates = dedupeBatch(
      candidatesFromAnalysis(analysis, {
        niche: body.niche,
        city: body.city,
      }),
    );
  } else {
    const { candidates: mapped } = analyzeCsv(body.content, body.mapping);
    candidates = dedupeBatch(
      mapped.map((c) => ({ ...c, source: body.source ?? 'CSV' })),
    );
  }

  const result = await performImport(userId, candidates, body.strategy);
  res.json(result);
}));