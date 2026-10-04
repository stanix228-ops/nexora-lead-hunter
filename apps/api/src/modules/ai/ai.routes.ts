import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '@nexora/database';
import type { AiAgentMode, AiProvider, ApplySolutionToProposalRequest, SolutionBuilderRequest } from '@nexora/types';
import { asyncHandler, NotFoundError, AppError } from '../../common/errors';
import { parsePagination, paginate } from '../../common/pagination';
import { analyzeLeadDigitalFootprint } from './analyzer.service';
import { performAiBusinessAnalysis } from './business-analyzer.service';
import { scoreLead, LeadScoringEngine } from './scoring.service';
import { generateCommercialProposal, CommercialProposalEngine } from './proposal.service';
import {
  generateCopilotSuggestions,
  processInboundWithSalesBrain,
  getSalesBrainState,
  transitionSalesBrainStage,
} from './sales-brain.service';
import { NeedsDiscoveryEngine } from './needs-discovery.service';
import { SolutionBuilderService } from './solution-builder.service';
import { NegotiationEngine } from './negotiation.service';
import { FollowUpEngine, cancelPendingFollowUps } from './followup.service';
import { toggleAiPause, triggerHumanHandoff } from './handoff.service';
import { PreFlightGuardrailService } from './pre-flight-guardrail.service';
import { emitToUser } from '../../common/realtime/socket';
import { recordTimelineEvent } from '../crm/crm.service';
import { DEFAULT_NEXORA_CATALOG } from './ai.types';
import { AutopilotEngineService } from './autopilot.service';

export const aiRouter: import('express').Router = Router();

const businessAnalysisSchema = z.object({
  companyName: z.string().min(1, 'Company name is required').max(200),
  website: z.string().max(300).optional().nullable(),
  instagram: z.string().max(300).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  niche: z.string().max(150).optional().nullable(),
  reviews: z.union([z.array(z.string()), z.string()]).optional().nullable(),
  availableInfo: z.string().max(10000).optional().nullable(),
  leadId: z.string().optional().nullable(),
  forceReanalyze: z.boolean().optional(),
});

const updateConfigSchema = z.object({
  mode: z.enum(['AUTONOMOUS', 'COPILOT', 'OFF']).optional(),
  llmProvider: z.enum(['BUILTIN', 'OPENAI', 'ANTHROPIC', 'GEMINI', 'OPENROUTER', 'OLLAMA']).optional(),
  apiKey: z.string().optional().nullable(),
  modelName: z.string().optional().nullable(),
  temperature: z.number().min(0).max(1).optional(),
  systemPrompt: z.string().optional().nullable(),
  serviceCatalog: z.any().optional(),
  pricingRules: z.any().optional(),
  workingHoursStart: z.string().optional(),
  workingHoursEnd: z.string().optional(),
  timezone: z.string().optional(),
  maxDailyMessagesPerAccount: z.number().optional(),
  minDelaySeconds: z.number().optional(),
  maxDelaySeconds: z.number().optional(),
  autoAnalyzeLeads: z.boolean().optional(),
  autoScoreLeads: z.boolean().optional(),
  autoOutreach: z.boolean().optional(),
  stopWords: z.array(z.string()).optional(),
  followUpEnabled: z.boolean().optional(),
  followUpIntervals: z.array(z.number()).optional(),
});

/**
 * GET /api/ai/config
 */
aiRouter.get('/config', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  let config = await prisma.aiAgentConfig.findUnique({ where: { userId } });

  if (!config) {
    config = await prisma.aiAgentConfig.create({
      data: {
        userId,
        mode: 'COPILOT',
        llmProvider: 'BUILTIN',
        serviceCatalog: DEFAULT_NEXORA_CATALOG as any,
        workingHoursStart: '09:00',
        workingHoursEnd: '20:00',
        timezone: 'Europe/Moscow',
        maxDailyMessagesPerAccount: 50,
        minDelaySeconds: 8,
        maxDelaySeconds: 45,
        autoAnalyzeLeads: true,
        autoScoreLeads: true,
        autoOutreach: false,
        followUpEnabled: true,
        followUpIntervals: [4, 24, 48, 120] as any,
      },
    });
  }

  res.json(config);
}));

/**
 * PUT /api/ai/config
 */
aiRouter.put('/config', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const body = updateConfigSchema.parse(req.body);

  const config = await prisma.aiAgentConfig.upsert({
    where: { userId },
    update: {
      ...body,
      apiKey: body.apiKey === undefined ? undefined : body.apiKey,
      systemPrompt: body.systemPrompt === undefined ? undefined : body.systemPrompt,
    },
    create: {
      userId,
      mode: body.mode ?? 'COPILOT',
      llmProvider: body.llmProvider ?? 'BUILTIN',
      apiKey: body.apiKey ?? null,
      modelName: body.modelName ?? 'gpt-4o-mini',
      temperature: body.temperature ?? 0.4,
      systemPrompt: body.systemPrompt ?? null,
      serviceCatalog: (body.serviceCatalog ?? DEFAULT_NEXORA_CATALOG) as any,
      pricingRules: body.pricingRules as any,
      workingHoursStart: body.workingHoursStart ?? '09:00',
      workingHoursEnd: body.workingHoursEnd ?? '20:00',
      timezone: body.timezone ?? 'Europe/Moscow',
      maxDailyMessagesPerAccount: body.maxDailyMessagesPerAccount ?? 50,
      minDelaySeconds: body.minDelaySeconds ?? 8,
      maxDelaySeconds: body.maxDelaySeconds ?? 45,
      autoAnalyzeLeads: body.autoAnalyzeLeads ?? true,
      autoScoreLeads: body.autoScoreLeads ?? true,
      autoOutreach: body.autoOutreach ?? false,
      stopWords: body.stopWords as any,
      followUpEnabled: body.followUpEnabled ?? true,
      followUpIntervals: (body.followUpIntervals ?? [4, 24, 48, 120]) as any,
    },
  });

  res.json(config);
}));

/**
 * POST /api/ai/master-toggle
 * Global master switch to completely stop or activate AI across the entire system.
 */
aiRouter.post('/master-toggle', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { mode } = z.object({
    mode: z.enum(['OFF', 'AUTONOMOUS', 'COPILOT']),
  }).parse(req.body);

  const config = await prisma.aiAgentConfig.upsert({
    where: { userId },
    update: {
      mode,
      autoOutreach: mode !== 'OFF',
      followUpEnabled: mode !== 'OFF',
    },
    create: {
      userId,
      mode,
      autoOutreach: mode !== 'OFF',
      followUpEnabled: mode !== 'OFF',
    },
  });

  if (mode === 'OFF') {
    // Pause all conversations
    const userConvs = await prisma.conversation.findMany({
      where: { userId },
      select: { id: true },
    });
    const convIds = userConvs.map((c) => c.id);
    if (convIds.length > 0) {
      await prisma.aiDialogueState.updateMany({
        where: { conversationId: { in: convIds } },
        data: {
          isAiPaused: true,
          stage: 'HUMAN_TAKEOVER',
          pausedReason: 'Глобальная остановка ИИ агента (ручной режим CRM)',
          humanTakeoverAt: new Date(),
          humanTakeoverBy: 'USER',
        },
      });
    }
  }

  emitToUser(userId, 'ai.config_updated', config);
  emitToUser(userId, 'ai.master_mode_changed', { mode });

  res.json({
    ok: true,
    mode: config.mode,
    message: mode === 'OFF'
      ? 'ИИ агент полностью остановлен. Сайт переведен в ручной режим.'
      : 'ИИ агент успешно активирован.',
  });
}));

/**
 * POST /api/ai/business-analysis
 * Full 20-aspect AI Business Analyzer
 */
aiRouter.post('/business-analysis', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const body = businessAnalysisSchema.parse(req.body);
  const result = await performAiBusinessAnalysis(userId, body);
  res.json(result);
}));

/**
 * POST /api/ai/leads/:leadId/analyze
 */
aiRouter.post('/leads/:leadId/analyze', asyncHandler(async (req: Request, res: Response) => {
  const lead = await prisma.lead.findFirst({
    where: { id: req.params.leadId, userId: req.user!.id },
  });
  if (!lead) throw new NotFoundError('Lead not found.');

  const analysis = await analyzeLeadDigitalFootprint(lead.id);
  res.json(analysis);
}));

/**
 * POST /api/ai/lead-score
 * AI Lead Scoring Engine — Deterministic multi-factor scoring (1-100) with explainable factors & confidence.
 */
aiRouter.post('/lead-score', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const schema = z.object({
    leadId: z.string().optional(),
    companyName: z.string().optional(),
    niche: z.string().optional(),
    city: z.string().optional(),
    website: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
    email: z.string().optional().nullable(),
    instagram: z.string().optional().nullable(),
    telegram: z.string().optional().nullable(),
    businessSize: z.enum(['MICRO', 'SMALL', 'MEDIUM', 'ENTERPRISE']).optional(),
    isDecisionMaker: z.boolean().optional(),
    position: z.string().optional(),
    forceRecalculate: z.boolean().optional(),
  });
  const body = schema.parse(req.body);

  if (body.leadId) {
    const lead = await prisma.lead.findFirst({
      where: { id: body.leadId, userId },
    });
    if (!lead) throw new NotFoundError('Lead not found for scoring.');
  }

  const result = await LeadScoringEngine.evaluateScore(userId, body);
  res.json(result);
}));

/**
 * POST /api/ai/leads/:leadId/score
 */
aiRouter.post('/leads/:leadId/score', asyncHandler(async (req: Request, res: Response) => {
  const lead = await prisma.lead.findFirst({
    where: { id: req.params.leadId, userId: req.user!.id },
  });
  if (!lead) throw new NotFoundError('Lead not found.');

  const score = await LeadScoringEngine.evaluateScore(req.user!.id, { leadId: lead.id, forceRecalculate: true });
  res.json(score);
}));

/**
 * POST /api/ai/batch-analyze
 */
aiRouter.post('/batch-analyze', asyncHandler(async (req: Request, res: Response) => {
  const { leadIds } = z.object({ leadIds: z.array(z.string()).min(1).max(100) }).parse(req.body);
  const userId = req.user!.id;

  const leads = await prisma.lead.findMany({
    where: { id: { in: leadIds }, userId },
    select: { id: true },
  });

  const results = [];
  for (const l of leads) {
    try {
      const a = await analyzeLeadDigitalFootprint(l.id);
      results.push({ leadId: l.id, success: true, analysis: a });
    } catch (err) {
      results.push({ leadId: l.id, success: false, error: (err as Error).message });
    }
  }

  res.json({ processed: results.length, items: results });
}));

/**
 * POST /api/ai/batch-score
 */
aiRouter.post('/batch-score', asyncHandler(async (req: Request, res: Response) => {
  const { leadIds } = z.object({ leadIds: z.array(z.string()).min(1).max(100) }).parse(req.body);
  const userId = req.user!.id;

  const leads = await prisma.lead.findMany({
    where: { id: { in: leadIds }, userId },
    select: { id: true },
  });

  const results = [];
  for (const l of leads) {
    try {
      const s = await scoreLead(l.id);
      results.push({ leadId: l.id, success: true, score: s });
    } catch (err) {
      results.push({ leadId: l.id, success: false, error: (err as Error).message });
    }
  }

  res.json({ processed: results.length, items: results });
}));

/**
 * GET /api/ai/conversations/:conversationId/copilot
 */
aiRouter.get('/conversations/:conversationId/copilot', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const conversationId = String(req.params.conversationId);

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
    include: {
      lead: { include: { analysis: true, score: true, memoryFacts: true, proposals: true } },
      aiState: true,
      messages: { orderBy: { recordedAt: 'desc' }, take: 20 },
    },
  });

  if (!conversation) throw new NotFoundError('Conversation not found.');

  const suggestions = await generateCopilotSuggestions(userId, conversationId);

  res.json({
    conversationId,
    lead: conversation.lead,
    aiState: conversation.aiState,
    suggestions,
    proposals: conversation.lead.proposals,
    memoryFacts: conversation.lead.memoryFacts,
  });
}));

/**
 * POST /api/ai/conversations/:conversationId/generate-proposal
 */
aiRouter.post('/conversations/:conversationId/generate-proposal', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const conversationId = String(req.params.conversationId);
  const { serviceType } = z.object({ serviceType: z.string().optional() }).parse(req.body || {});

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
  });
  if (!conversation) throw new NotFoundError('Conversation not found.');

  const proposal = await generateCommercialProposal(conversation.leadId, conversationId, serviceType);
  res.status(201).json(proposal);
}));

/**
 * POST /api/ai/conversations/:conversationId/toggle-pause
 */
aiRouter.post('/conversations/:conversationId/toggle-pause', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const conversationId = String(req.params.conversationId);
  const result = await toggleAiPause(userId, conversationId);
  res.json(result);
}));

/**
 * POST /api/ai/conversations/:conversationId/handoff
 */
aiRouter.post('/conversations/:conversationId/handoff', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const conversationId = String(req.params.conversationId);
  const { reason } = z.object({ reason: z.string().default('Передано менеджеру вручную') }).parse(req.body || {});

  const conversation = await prisma.conversation.findFirst({ where: { id: conversationId, userId } });
  if (!conversation) throw new NotFoundError('Conversation not found.');

  await triggerHumanHandoff(userId, conversationId, conversation.leadId, reason);
  res.json({ success: true });
}));

/**
 * POST /api/ai/conversations/:conversationId/toggle-ai
 * Explicitly enables or disables AI Sales Agent for a specific conversation.
 */
aiRouter.post('/conversations/:conversationId/toggle-ai', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const conversationId = String(req.params.conversationId);
  const { enabled, reason } = z.object({
    enabled: z.boolean(),
    reason: z.string().optional(),
  }).parse(req.body);

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
    include: { lead: true },
  });
  if (!conversation) throw new NotFoundError('Conversation not found.');

  const isPaused = !enabled;
  const aiState = await prisma.aiDialogueState.upsert({
    where: { conversationId },
    update: {
      isAiPaused: isPaused,
      pausedReason: isPaused ? (reason || 'Отключен пользователем вручную') : null,
      humanTakeoverAt: isPaused ? (reason?.includes('перехват') ? new Date() : undefined) : null,
      humanTakeoverBy: isPaused && reason?.includes('перехват') ? 'Менеджер' : null,
    },
    create: {
      conversationId,
      isAiPaused: isPaused,
      pausedReason: isPaused ? (reason || 'Отключен пользователем вручную') : null,
    },
  });

  // Record timeline event
  await recordTimelineEvent({
    userId,
    leadId: conversation.leadId,
    conversationId,
    eventType: 'AI_ANALYZED',
    title: enabled ? 'AI Sales Agent включен для диалога' : 'AI Sales Agent отключен для диалога',
    description: enabled
      ? 'Агент возобновил автономное ведение и консультацию клиента.'
      : `Причина отключения: ${reason || 'Ручной режим оператора'}.`,
    metadata: { isAiPaused: isPaused, reason },
  });

  // Emit realtime updates
  emitToUser(userId, 'conversation.ai_toggled', {
    conversationId,
    isAiPaused: isPaused,
    pausedReason: aiState.pausedReason,
    updatedAt: new Date().toISOString(),
  });
  emitToUser(userId, 'conversation.updated', {
    ...conversation,
    aiState,
  });

  res.json({
    conversationId,
    isAiPaused: isPaused,
    pausedReason: aiState.pausedReason,
    humanTakeoverAt: aiState.humanTakeoverAt,
    humanTakeoverBy: aiState.humanTakeoverBy,
    updatedAt: aiState.updatedAt,
  });
}));

/**
 * POST /api/ai/conversations/:conversationId/takeover
 * Human operator immediately takes over the conversation. AI is safely paused.
 */
aiRouter.post('/conversations/:conversationId/takeover', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const conversationId = String(req.params.conversationId);
  const { managerName, notes } = z.object({
    managerName: z.string().default('Менеджер'),
    notes: z.string().optional(),
  }).parse(req.body || {});

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
  });
  if (!conversation) throw new NotFoundError('Conversation not found.');

  const now = new Date();
  const aiState = await prisma.aiDialogueState.upsert({
    where: { conversationId },
    update: {
      isAiPaused: true,
      pausedReason: 'Ручной перехват оператором',
      humanTakeoverAt: now,
      humanTakeoverBy: managerName,
    },
    create: {
      conversationId,
      isAiPaused: true,
      pausedReason: 'Ручной перехват оператором',
      humanTakeoverAt: now,
      humanTakeoverBy: managerName,
    },
  });

  await recordTimelineEvent({
    userId,
    leadId: conversation.leadId,
    conversationId,
    eventType: 'AI_ANALYZED',
    title: `Ручной перехват диалога: ${managerName}`,
    description: notes || 'Оператор взял управление перепиской на себя. Автоматические ответы AI приостановлены.',
    metadata: { managerName, notes, takeoverAt: now.toISOString() },
  });

  emitToUser(userId, 'conversation.takeover', {
    conversationId,
    managerName,
    humanTakeoverAt: now.toISOString(),
  });

  res.json({
    success: true,
    conversationId,
    isAiPaused: true,
    humanTakeoverAt: now.toISOString(),
    humanTakeoverBy: managerName,
  });
}));

/**
 * POST /api/ai/conversations/:conversationId/handback
 * Hands conversation back from human operator to autonomous AI Sales Agent.
 */
aiRouter.post('/conversations/:conversationId/handback', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const conversationId = String(req.params.conversationId);

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
  });
  if (!conversation) throw new NotFoundError('Conversation not found.');

  const aiState = await prisma.aiDialogueState.upsert({
    where: { conversationId },
    update: {
      isAiPaused: false,
      pausedReason: null,
      humanTakeoverAt: null,
      humanTakeoverBy: null,
    },
    create: {
      conversationId,
      isAiPaused: false,
    },
  });

  await recordTimelineEvent({
    userId,
    leadId: conversation.leadId,
    conversationId,
    eventType: 'AI_ANALYZED',
    title: 'Управление возвращено AI Sales Agent',
    description: 'Оператор завершил ручное ведение и передал диалог цифровому менеджеру.',
  });

  emitToUser(userId, 'conversation.ai_toggled', {
    conversationId,
    isAiPaused: false,
    updatedAt: new Date().toISOString(),
  });

  res.json({
    success: true,
    conversationId,
    isAiPaused: false,
  });
}));

/**
 * GET /api/ai/conversations/:conversationId/pre-flight-status
 * Live evaluation of the 5 Pre-Flight Guardrail checks.
 */
aiRouter.get('/conversations/:conversationId/pre-flight-status', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const conversationId = String(req.params.conversationId);
  const sampleText = (req.query.text as string) || 'Здравствуйте! Готовы обсудить проект.';

  const result = await PreFlightGuardrailService.validateAiDispatch(userId, conversationId, sampleText);
  res.json(result);
}));

/**
 * POST /api/ai/conversations/:conversationId/reply
 */
aiRouter.post('/conversations/:conversationId/reply', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const conversationId = String(req.params.conversationId);
  const { text } = z.object({ text: z.string().min(1) }).parse(req.body);

  const result = await processInboundWithSalesBrain(userId, conversationId, text);
  res.json(result);
}));

/**
 * POST /api/ai/sales-brain/process
 * Autonomous consultative processing of inbound client message.
 */
aiRouter.post('/sales-brain/process', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const schema = z.object({
    conversationId: z.string().min(1),
    text: z.string().min(1),
    forceStage: z.enum([
      'NEW',
      'CONTACTED',
      'DISCOVERY',
      'QUALIFIED',
      'SOLUTION',
      'PROPOSAL',
      'NEGOTIATION',
      'FOLLOW_UP',
      'WON',
      'LOST',
      'HUMAN_HANDOFF',
    ]).optional(),
  });
  const { conversationId, text, forceStage } = schema.parse(req.body);

  const result = await processInboundWithSalesBrain(userId, conversationId, text, forceStage);
  res.json(result);
}));

/**
 * POST /api/ai/sales-brain/transition
 * Programmatic or manual transition of conversation state in Sales Brain state machine.
 */
aiRouter.post('/sales-brain/transition', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const schema = z.object({
    conversationId: z.string().min(1),
    nextStage: z.enum([
      'NEW',
      'CONTACTED',
      'DISCOVERY',
      'QUALIFIED',
      'SOLUTION',
      'PROPOSAL',
      'NEGOTIATION',
      'FOLLOW_UP',
      'WON',
      'LOST',
      'HUMAN_HANDOFF',
    ]),
    reason: z.string().optional(),
  });
  const { conversationId, nextStage, reason } = schema.parse(req.body);

  const result = await transitionSalesBrainStage(userId, conversationId, nextStage, reason);
  res.json(result);
}));

/**
 * GET /api/ai/sales-brain/state/:conversationId
 * Returns full diagnostic state, BANT, allowed/prohibited actions, consultative phase and memory facts.
 */
aiRouter.get('/sales-brain/state/:conversationId', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const conversationId = String(req.params.conversationId);
  const state = await getSalesBrainState(userId, conversationId);
  res.json(state);
}));

/**
 * POST /api/ai/sales-brain/copilot
 * Generates smart stage-aware recommendations for human manager.
 */
aiRouter.post('/sales-brain/copilot', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { conversationId } = z.object({ conversationId: z.string().min(1) }).parse(req.body);
  const suggestions = await generateCopilotSuggestions(userId, conversationId);
  res.json({ suggestions });
}));

/**
 * POST /api/ai/needs-discovery/analyze
 * Extracts 12-dimensional needs profile and determines the single next natural question.
 */
aiRouter.post('/needs-discovery/analyze', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const schema = z.object({
    conversationId: z.string().min(1),
    text: z.string().optional(),
  });
  const { conversationId, text } = schema.parse(req.body);

  const result = await NeedsDiscoveryEngine.analyzeAndExtractProfile(userId, conversationId, text);
  res.json(result);
}));

/**
 * GET /api/ai/needs-discovery/profile/:conversationId
 * Returns the current 12-slot Needs Discovery Profile for a conversation.
 */
aiRouter.get('/needs-discovery/profile/:conversationId', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const conversationId = String(req.params.conversationId);

  const conv = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
    include: { aiState: true, lead: true },
  });

  if (!conv) throw new NotFoundError('Conversation not found.');

  const profile = (conv.aiState?.discoveryProfile as any) || null;
  res.json({
    conversationId,
    leadId: conv.leadId,
    profile,
    stage: conv.aiState?.stage || 'DISCOVERY',
  });
}));

/**
 * PUT /api/ai/needs-discovery/profile/:conversationId
 * Allows manual manager adjustments or overrides to the 12-slot Needs Discovery Profile.
 */
aiRouter.put('/needs-discovery/profile/:conversationId', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const conversationId = String(req.params.conversationId);
  const { profile } = z.object({ profile: z.record(z.unknown()) }).parse(req.body);

  const conv = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
    include: { aiState: true },
  });

  if (!conv) throw new NotFoundError('Conversation not found.');

  const updatedState = await prisma.aiDialogueState.upsert({
    where: { conversationId },
    update: { discoveryProfile: profile as any },
    create: { conversationId, discoveryProfile: profile as any },
  });

  // Sync with Lead entity
  const updateLeadData: Record<string, unknown> = {};
  const budgetObj = profile.budget as any;
  if (budgetObj?.amount) updateLeadData.estimatedBudget = Number(budgetObj.amount);
  if (profile.need) updateLeadData.assumedNeed = String(profile.need);
  const dmObj = profile.decisionMaker as any;
  if (dmObj?.isDecisionMaker !== undefined && dmObj?.isDecisionMaker !== null) {
    updateLeadData.isDecisionMaker = Boolean(dmObj.isDecisionMaker);
    updateLeadData.decisionMakerInfo = dmObj.role || dmObj.details || null;
  }

  if (Object.keys(updateLeadData).length > 0) {
    await prisma.lead.update({
      where: { id: conv.leadId },
      data: updateLeadData,
    });
  }

  res.json({ success: true, discoveryProfile: updatedState.discoveryProfile });
}));

// ============================================================================
// Solution Builder Endpoints
// ============================================================================

const buildSolutionSchema = z.object({
  leadId: z.string().optional(),
  conversationId: z.string().optional(),
  companyName: z.string().optional(),
  niche: z.string().optional(),
  overrideProblems: z.array(z.string()).optional(),
  preferredProductTypes: z
    .array(
      z.enum([
        'WEBSITE',
        'MOBILE_APP',
        'TELEGRAM_BOT',
        'AI_ASSISTANT',
        'AI_TOOL',
        'BUSINESS_AUTOMATION',
        'CUSTOM_IT_SOLUTION',
        'COMPLEX_BUNDLE',
      ]),
    )
    .optional(),
  targetBudget: z.number().optional(),
});

const applySolutionSchema = z.object({
  leadId: z.string().min(1, 'leadId is required'),
  conversationId: z.string().optional(),
  solution: z.record(z.unknown()).refine((val) => !!val && Object.keys(val).length > 0, { message: 'Solution data is required' }),
  proposalTitle: z.string().optional(),
  customDiscountPercent: z.number().min(0).max(100).optional(),
});

/**
 * POST /api/ai/solution-builder/build
 * Synthesizes a grounded Nexora IT Solution based on Business Analysis + Needs Discovery.
 */
aiRouter.post('/solution-builder/build', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const body = buildSolutionSchema.parse(req.body);

  const result = await SolutionBuilderService.buildSolution(userId, body);
  res.json(result);
}));

/**
 * POST /api/ai/solution-builder/apply-to-proposal
 * Saves the crafted solution into CommercialProposal, updates Deal in CRM, and logs timeline.
 */
aiRouter.post('/solution-builder/apply-to-proposal', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const body = applySolutionSchema.parse(req.body);

  const result = await SolutionBuilderService.applySolutionToProposal(
    userId,
    body as unknown as ApplySolutionToProposalRequest,
  );
  res.json({
    success: true,
    proposal: result.proposal,
    deal: result.deal,
  });
}));

// ============================================================================
// Negotiation Engine Endpoints
// ============================================================================

const negotiationSchema = z.object({
  text: z.string().min(1, 'Text is required'),
  conversationId: z.string().optional(),
  leadId: z.string().optional(),
  customOwnerPolicy: z
    .object({
      maxDiscountPercent: z.number().optional(),
      allowDiscountsWithoutScopeReduction: z.boolean().optional(),
      requireManagerApprovalAbovePercent: z.number().optional(),
      autoSuggestMvpFirst: z.boolean().optional(),
    })
    .optional(),
});

/**
 * POST /api/ai/negotiation/handle
 * Handles objections via 11-type consultative matrix with guardrails and discount policy.
 */
aiRouter.post('/negotiation/handle', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const body = negotiationSchema.parse(req.body);

  const result = await NegotiationEngine.processNegotiation(userId, {
    text: body.text,
    conversationId: body.conversationId || '',
    leadId: body.leadId,
    customOwnerPolicy: body.customOwnerPolicy,
  });

  res.json(result);
}));

const generateProposalSchema = z.object({
  leadId: z.string().min(1, 'Lead ID is required'),
  conversationId: z.string().optional(),
  overrideServiceType: z.string().optional(),
  customTitle: z.string().optional(),
  customDiscountPercent: z.number().min(0).max(30).optional(),
  preferredScope: z.array(z.string()).optional(),
  includeRecurringSupport: z.boolean().optional(),
  strictVerification: z.boolean().optional(),
});

/**
 * POST /api/ai/proposals/generate
 * Generates a tailored 11-section commercial proposal, performs pre-flight verification, and syncs with CRM.
 */
aiRouter.post('/proposals/generate', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const body = generateProposalSchema.parse(req.body);

  const proposal = await CommercialProposalEngine.generateProposal(userId, body);
  res.json({
    success: true,
    proposal,
  });
}));

/**
 * GET /api/ai/proposals/:proposalId/html
 * Renders the HTML preview of the commercial proposal for PDF export / printing.
 */
aiRouter.get('/proposals/:proposalId/html', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const proposal = await prisma.commercialProposal.findFirst({
    where: { id: req.params.proposalId, lead: { userId } },
    include: { lead: true },
  });

  if (!proposal) throw new NotFoundError('Proposal not found.');

  const scopeData = (proposal.scope as any) || {};
  // If structuredPdfVersion exists in scope or rebuild
  if (scopeData.html) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(scopeData.html);
  }

  // Fallback generation of HTML
  const regenerated = await CommercialProposalEngine.generateProposal(userId, {
    leadId: proposal.leadId,
    conversationId: proposal.conversationId || undefined,
    overrideServiceType: proposal.serviceType,
  });

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(regenerated.structuredPdfVersion.html);
}));

/**
 * GET /api/ai/proposals/:proposalId
 * Returns full proposal details with CRM associations.
 */
aiRouter.get('/proposals/:proposalId', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const proposal = await prisma.commercialProposal.findFirst({
    where: { id: req.params.proposalId, lead: { userId } },
    include: {
      lead: { select: { id: true, companyName: true, phone: true, niche: true, city: true } },
      deals: true,
    },
  });

  if (!proposal) throw new NotFoundError('Proposal not found.');
  res.json({ proposal });
}));

// ============================================================================
// Follow-Up Engine Endpoints
// ============================================================================

const followUpPlanSchema = z.object({
  conversationId: z.string().min(1, 'Conversation ID is required'),
  leadId: z.string().optional(),
  forceRecalculate: z.boolean().optional(),
  customPauseReason: z
    .enum([
      'NO_REPLY_AFTER_PROPOSAL',
      'THINKING_ABOUT_PRICE',
      'DISCUSSING_WITH_BOSS',
      'COMPARING_COMPETITORS',
      'BUSY_OPERATIONS',
      'QUALIFICATION_STALLED',
      'GENERAL_SILENCE',
      'DISCOVERY_INCOMPLETE',
    ])
    .optional(),
});

const followUpExecuteSchema = z.object({
  followUpJobId: z.string().min(1, 'FollowUpJob ID is required'),
  overrideMessage: z.string().optional(),
  markAsSentOnly: z.boolean().optional(),
});

/**
 * POST /api/ai/follow-up/plan
 * Plans the 3-step consultative follow-up sequence based on deal stage, urgency, lead score, pause reason and opt-out guardrail.
 */
aiRouter.post('/follow-up/plan', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const body = followUpPlanSchema.parse(req.body);

  const plan = await FollowUpEngine.planFollowUps(userId, body);
  res.json({
    success: true,
    plan,
  });
}));

/**
 * POST /api/ai/follow-up/execute
 * Executes and sends a scheduled follow-up message via WhatsApp/Telegram gateway.
 */
aiRouter.post('/follow-up/execute', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const body = followUpExecuteSchema.parse(req.body);

  const result = await FollowUpEngine.executeFollowUp(userId, body);
  res.json({
    success: true,
    result,
  });
}));

/**
 * POST /api/ai/follow-up/cancel
 * Cancels all pending follow-up jobs for a conversation.
 */
aiRouter.post('/follow-up/cancel', asyncHandler(async (req: Request, res: Response) => {
  const { conversationId } = z.object({ conversationId: z.string().min(1) }).parse(req.body);
  await cancelPendingFollowUps(conversationId);
  res.json({ success: true, message: 'All pending follow-ups cancelled.' });
}));

/**
 * GET /api/ai/follow-up/jobs
 * Lists follow-up jobs for a user's leads.
 */
aiRouter.get('/follow-up/jobs', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const conversationId = typeof req.query.conversationId === 'string' ? req.query.conversationId : undefined;
  const status = typeof req.query.status === 'string' ? (req.query.status as any) : undefined;

  const jobs = await prisma.followUpJob.findMany({
    where: {
      lead: { userId },
      conversationId: conversationId || undefined,
      status: status || undefined,
    },
    include: {
      lead: { select: { id: true, companyName: true, phone: true, niche: true } },
      conversation: { select: { id: true, channel: true, status: true } },
    },
    orderBy: { scheduledFor: 'asc' },
    take: 100,
  });

  res.json({ items: jobs });
}));

/**
 * GET /api/ai/proposals
 */
aiRouter.get('/proposals', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const proposals = await prisma.commercialProposal.findMany({
    where: { lead: { userId } },
    include: { lead: { select: { id: true, companyName: true, phone: true, niche: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json({ items: proposals });
}));

/**
 * GET /api/ai/pipeline
 */
aiRouter.get('/pipeline', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;

  const leads = await prisma.lead.findMany({
    where: { userId },
    include: {
      score: true,
      analysis: true,
      conversations: {
        include: { aiState: true },
        take: 1,
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 300,
  });

  const columns: Record<string, any[]> = {
    DISCOVERED: [],
    SCORED: [],
    NEEDS_DISCOVERY: [],
    SOLUTION_PROPOSED: [],
    PROPOSAL_SENT: [],
    CLOSING: [],
    WON: [],
    HUMAN_TAKEOVER: [],
  };

  for (const lead of leads) {
    const conv = lead.conversations[0];
    const stage = conv?.aiState?.stage || (lead.score ? 'SCORED' : 'DISCOVERED');

    const targetColumn = columns[stage] ? stage : 'DISCOVERED';
    columns[targetColumn]!.push({
      id: lead.id,
      companyName: lead.companyName,
      phone: lead.phone,
      niche: lead.niche,
      city: lead.city,
      website: lead.website,
      score: lead.score?.score ?? null,
      grade: lead.score?.grade ?? null,
      recommendedService: lead.score?.recommendedService ?? null,
      conversationId: conv?.id ?? null,
      isAiPaused: conv?.aiState?.isAiPaused ?? false,
      stage,
    });
  }

  res.json({ columns });
}));

/**
 * GET /api/ai/analytics
 */
aiRouter.get('/analytics', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;

  const [totalLeads, scoredLeads, totalProposals, activeConversations, auditLogs] = await Promise.all([
    prisma.lead.count({ where: { userId } }),
    prisma.leadScore.count({ where: { lead: { userId } } }),
    prisma.commercialProposal.count({ where: { lead: { userId } } }),
    prisma.conversation.count({ where: { userId } }),
    prisma.aiAuditLog.findMany({ where: { userId }, take: 200 }),
  ]);

  const objectionsCount = auditLogs.filter((l) => l.actionType === 'OBJECTION_HANDLED').length;
  const hotLeadsCount = await prisma.aiDialogueState.count({
    where: { conversation: { userId }, stage: 'HUMAN_TAKEOVER' },
  });

  res.json({
    totalLeads,
    scoredLeads,
    totalProposals,
    activeConversations,
    objectionsCount,
    hotLeadsCount,
    aiActionsTotal: auditLogs.length,
  });
}));

/**
 * GET /api/ai/audit
 */
aiRouter.get('/audit', asyncHandler(async (req: Request, res: Response) => {
  const { page, pageSize } = parsePagination(req.query);
  const userId = req.user!.id;

  const [items, total] = await Promise.all([
    prisma.aiAuditLog.findMany({
      where: { userId },
      include: {
        lead: { select: { id: true, companyName: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.aiAuditLog.count({ where: { userId } }),
  ]);

  res.json(paginate(items, total, { page, pageSize }));
}));

/**
 * POST /api/ai/conversations/:conversationId/blacklist
 * Adds the lead to suppression list, pauses AI, and cancels all follow-ups.
 */
aiRouter.post('/conversations/:conversationId/blacklist', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const conversationId = String(req.params.conversationId);
  const { reason } = z.object({ reason: z.string().default('Внесён в черный список менеджером') }).parse(req.body || {});

  const conv = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
    include: { lead: true },
  });
  if (!conv) throw new NotFoundError('Conversation not found.');

  // 1. Pause AI
  await prisma.aiDialogueState.upsert({
    where: { conversationId },
    update: {
      isAiPaused: true,
      pausedReason: `BLACKLIST: ${reason}`,
      stage: 'LOST',
    },
    create: {
      conversationId,
      isAiPaused: true,
      pausedReason: `BLACKLIST: ${reason}`,
      stage: 'LOST',
    },
  });

  // 2. Update Lead status
  await prisma.lead.update({
    where: { id: conv.leadId },
    data: { status: 'NO_RESPONSE' },
  });

  // 3. Add to Email suppression if email exists
  if (conv.lead.email) {
    const normalized = conv.lead.email.trim().toLowerCase();
    await prisma.emailSuppression.upsert({
      where: {
        userId_email: { userId, email: normalized },
      },
      update: { reason: 'MANUAL', bounceDetails: reason, suppressedAt: new Date() },
      create: { userId, email: normalized, reason: 'MANUAL', bounceDetails: reason },
    });
  }

  // 4. Cancel pending follow-ups
  await cancelPendingFollowUps(conversationId);

  // 5. Timeline event
  await recordTimelineEvent({
    userId,
    leadId: conv.leadId,
    conversationId,
    eventType: 'STATUS_CHANGED',
    title: '🚫 Лид добавлен в черный список (Blacklist)',
    description: `Причина: ${reason}. Все запланированные сообщения и AI остановлены.`,
    metadata: { reason, blacklistedAt: new Date().toISOString() },
  });

  emitToUser(userId, 'conversation.updated', {
    id: conversationId,
    status: 'NO_RESPONSE',
    isAiPaused: true,
  });

  res.json({ success: true, message: 'Лид успешно заблокирован и внесен в черный список.' });
}));

/**
 * GET /api/ai/dashboard-full
 * Single comprehensive aggregator endpoint for the entire AI Sales Agent Control Dashboard.
 */
aiRouter.get('/dashboard-full', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;

  const [
    leadsCount,
    scoredLeadsCount,
    proposalsCount,
    activeConvCount,
    wonDealsCount,
    deals,
    proposals,
    followUpJobs,
    auditLogs,
    hotLeads,
    businessAnalyses,
    handoffConversations,
    waAccounts,
    igAccounts,
    tgBots,
    emailAccounts,
    config,
  ] = await Promise.all([
    prisma.lead.count({ where: { userId } }),
    prisma.leadScore.count({ where: { lead: { userId }, score: { gte: 50 } } }),
    prisma.commercialProposal.count({ where: { lead: { userId } } }),
    prisma.conversation.count({ where: { userId } }),
    prisma.deal.count({ where: { userId, stage: 'WON' } }),
    prisma.deal.findMany({
      where: { userId },
      include: {
        lead: { select: { id: true, companyName: true, phone: true, niche: true, city: true, email: true } },
        proposal: { select: { id: true, title: true, priceEstimateMin: true, priceEstimateMax: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    }),
    prisma.commercialProposal.findMany({
      where: { lead: { userId } },
      include: {
        lead: { select: { id: true, companyName: true, phone: true, niche: true, city: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.followUpJob.findMany({
      where: { lead: { userId }, status: 'PENDING' },
      include: {
        lead: { select: { id: true, companyName: true, phone: true, niche: true } },
        conversation: { select: { id: true, channel: true, status: true } },
      },
      orderBy: { scheduledFor: 'asc' },
      take: 50,
    }),
    prisma.aiAuditLog.findMany({
      where: { userId },
      include: {
        lead: { select: { id: true, companyName: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.lead.findMany({
      where: {
        userId,
        OR: [
          { score: { score: { gte: 75 } } },
          { score: { grade: 'HOT' } },
          { conversations: { some: { aiState: { stage: 'HUMAN_TAKEOVER' } } } },
        ],
      },
      include: {
        score: true,
        analysis: true,
        conversations: {
          include: { aiState: true },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    }),
    prisma.businessAnalysis.findMany({
      where: { lead: { userId } },
      include: {
        lead: { select: { id: true, companyName: true, phone: true, niche: true, city: true, website: true } },
      },
      orderBy: { analyzedAt: 'desc' },
      take: 50,
    }),
    prisma.conversation.findMany({
      where: {
        userId,
        OR: [
          { aiState: { isAiPaused: true } },
          { aiState: { humanTakeoverAt: { not: null } } },
          { aiState: { stage: 'HUMAN_TAKEOVER' } },
        ],
      },
      include: {
        lead: true,
        aiState: true,
        account: true,
        instagramAccount: true,
        telegramBot: true,
        emailAccount: true,
        messages: { orderBy: { recordedAt: 'desc' }, take: 1 },
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    }),
    prisma.whatsAppAccount.findMany({
      where: { userId },
      select: { id: true, name: true, phoneMasked: true, status: true },
    }),
    prisma.instagramAccount.findMany({
      where: { userId },
      select: { id: true, username: true, status: true, aiExecutionMode: true, messagesSentToday: true, dailyMessageLimit: true },
    }),
    prisma.telegramBot.findMany({
      where: { userId },
      select: { id: true, username: true, status: true, aiExecutionMode: true, messagesSentToday: true, dailyMessageLimit: true, ownerChatId: true },
    }),
    prisma.emailAccount.findMany({
      where: { userId },
      select: { id: true, name: true, emailAddress: true, provider: true, status: true, aiExecutionMode: true, messagesSentToday: true, dailyMessageLimit: true, hourlyMessageLimit: true, trackingEnabled: true },
    }),
    prisma.aiAgentConfig.findUnique({ where: { userId } }),
  ]);

  // Calculate metrics
  const totalRevenue = (deals as any[]).reduce((acc: number, d: any) => acc + (d.amount || 0), 0);
  const wonRevenue = (deals as any[]).filter((d: any) => d.stage === 'WON').reduce((acc: number, d: any) => acc + (d.amount || 0), 0);
  const conversionRate = leadsCount > 0 ? Math.round(((wonDealsCount || proposalsCount) / leadsCount) * 100) : 0;
  const qualifiedLeads = scoredLeadsCount;
  const hotLeadsCount = hotLeads.length;

  res.json({
    overview: {
      leads: leadsCount,
      qualifiedLeads,
      hotLeads: hotLeadsCount,
      activeConversations: activeConvCount,
      proposals: proposalsCount,
      wonDeals: wonDealsCount,
      revenue: wonRevenue || totalRevenue,
      totalPipelineRevenue: totalRevenue,
      conversionRate,
      followUps: followUpJobs.length,
      aiActivity: auditLogs.length,
      recentAiActivity: auditLogs.slice(0, 10),
    },
    hotLeadsList: (hotLeads as any[]).map((l: any) => {
      const conv = l.conversations?.[0];
      const detectedProblems = Array.isArray(l.analysis?.detectedGaps)
        ? (l.analysis.detectedGaps as string[])
        : Array.isArray(l.score?.detectedPains)
        ? (l.score.detectedPains as string[])
        : [];
      return {
        id: l.id,
        companyName: l.companyName,
        contactName: l.contactName || l.phone,
        phone: l.phone,
        email: l.email,
        website: l.website,
        niche: l.niche,
        city: l.city,
        score: l.score?.score ?? 85,
        grade: l.score?.grade ?? 'HOT',
        recommendedService: l.score?.recommendedService ?? 'Разработка веб-сервиса & Мобильного приложения',
        problem: detectedProblems[0] || 'Низкая скорость мобильной версии и потеря 40% трафика',
        recommendedSolution: l.score?.recommendedOffer || l.analysis?.summary || 'Редизайн мобильной версии + интеграция модуля онлайн-записи',
        status: l.status,
        source: conv?.channel || 'Парсер',
        stage: conv?.aiState?.stage || 'QUALIFIED',
        isAiPaused: conv?.aiState?.isAiPaused || false,
        conversationId: conv?.id || null,
        lastInteraction: l.updatedAt,
        nextAction: l.score?.nextBestAction || 'Презентация коммерческого предложения',
      };
    }),
    deals,
    followUps: followUpJobs,
    businessAnalyses,
    proposals,
    channels: {
      whatsapp: waAccounts,
      instagram: igAccounts,
      telegram: tgBots,
      email: emailAccounts,
    },
    humanHandoffQueue: handoffConversations,
    logs: auditLogs,
    config,
  });
}));

// ============================================================================
// Autopilot Sales Machine Endpoints
// ============================================================================

/**
 * GET /api/ai/autopilot/status
 * Returns current live state, counters, events, and active dialogues.
 */
aiRouter.get('/autopilot/status', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const status = AutopilotEngineService.getStatus(userId);
  res.json(status);
}));

/**
 * POST /api/ai/autopilot/start
 * Starts the complete autonomous sales process.
 */
aiRouter.post('/autopilot/start', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const body = req.body || {};
  const status = await AutopilotEngineService.startAutopilot(userId, body);
  res.json({ success: true, status });
}));

/**
 * POST /api/ai/autopilot/pause
 * Pauses autonomous actions.
 */
aiRouter.post('/autopilot/pause', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const status = AutopilotEngineService.pauseAutopilot(userId);
  res.json({ success: true, status });
}));

/**
 * POST /api/ai/autopilot/resume
 * Resumes autonomous actions.
 */
aiRouter.post('/autopilot/resume', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const status = AutopilotEngineService.resumeAutopilot(userId);
  res.json({ success: true, status });
}));

/**
 * POST /api/ai/autopilot/reset
 * Resets the autopilot state and counters.
 */
aiRouter.post('/autopilot/reset', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const status = AutopilotEngineService.resetAutopilot(userId);
  res.json({ success: true, status });
}));

