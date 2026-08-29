import { Router } from 'express';
import type { Request, Response } from 'express';
import { prisma } from '@nexora/database';
import type { AnalyticsSummary } from '@nexora/types';
import { asyncHandler } from '../../common/errors';
import { getGlobalMessageCounts } from './analytics.service';

export const analyticsRouter: import('express').Router = Router();

export { getGlobalMessageCounts };

analyticsRouter.get('/', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;

  const leads = await prisma.lead.findMany({
    where: { userId },
    select: { status: true, assignedAccountId: true, campaigns: { select: { campaign: { select: { name: true } } } } },
  });

  const totalLeads = leads.length;
  const contactStatuses = new Set(['CONTACTED', 'REPLIED', 'INTERESTED', 'NEGOTIATION', 'CLIENT', 'NO_RESPONSE']);
  const replyStatuses = new Set(['REPLIED', 'INTERESTED', 'NEGOTIATION', 'CLIENT']);
  const interestedStatuses = new Set(['INTERESTED', 'NEGOTIATION', 'CLIENT']);

  const statusCounts = {
    contacted: leads.filter((l) => contactStatuses.has(l.status)).length,
    replies: leads.filter((l) => replyStatuses.has(l.status)).length,
    interested: leads.filter((l) => interestedStatuses.has(l.status)).length,
    negotiations: leads.filter((l) => l.status === 'NEGOTIATION').length,
    clients: leads.filter((l) => l.status === 'CLIENT').length,
  };

  const conversionRate = totalLeads > 0 ? (statusCounts.clients / totalLeads) * 100 : 0;
  const responseRate =
    statusCounts.contacted > 0 ? (statusCounts.replies / statusCounts.contacted) * 100 : 0;

  // clients by account & by campaign
  const accounts = await prisma.whatsAppAccount.findMany({
    where: { userId },
    select: { id: true, name: true },
  });
  const clientsByAccount = accounts.map((a) => ({
    name: a.name,
    value: leads.filter((l) => l.assignedAccountId === a.id && l.status === 'CLIENT').length,
  }));

  const campaigns = await prisma.campaign.findMany({
    where: { userId },
    select: { id: true, name: true, leads: { select: { lead: { select: { status: true } } } } },
  });
  const clientsByCampaign = campaigns.map((c) => ({
    name: c.name,
    value: c.leads.filter((cl) => cl.lead.status === 'CLIENT').length,
  }));

  const funnel = [
    { stage: 'Total leads', value: totalLeads },
    { stage: 'Contacted', value: statusCounts.contacted },
    { stage: 'Replies', value: statusCounts.replies },
    { stage: 'Interested', value: statusCounts.interested },
    { stage: 'Negotiation', value: statusCounts.negotiations },
    { stage: 'Clients', value: statusCounts.clients },
  ];

  const { today, sevenDays, thirtyDays, allTime } = await getGlobalMessageCounts(userId);

  const summary: AnalyticsSummary = {
    totalLeads,
    contacted: statusCounts.contacted,
    replies: statusCounts.replies,
    interested: statusCounts.interested,
    negotiations: statusCounts.negotiations,
    clients: statusCounts.clients,
    conversionRate: Math.round(conversionRate * 100) / 100,
    responseRate: Math.round(responseRate * 100) / 100,
    clientsByAccount,
    clientsByCampaign,
    funnel,
    counters: { today, sevenDays, thirtyDays, allTime },
  };

  res.json(summary);
}));

analyticsRouter.get('/funnel', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const leads = await prisma.lead.findMany({
    where: { userId },
    select: { status: true },
  });
  const set = (list: string[]) => (s: string) => list.includes(s);
  const contactSet = set(['CONTACTED', 'REPLIED', 'INTERESTED', 'NEGOTIATION', 'CLIENT', 'NO_RESPONSE']);
  const replySet = set(['REPLIED', 'INTERESTED', 'NEGOTIATION', 'CLIENT']);
  const interSet = set(['INTERESTED', 'NEGOTIATION', 'CLIENT']);

  res.json({
    funnel: [
      { stage: 'Total leads', value: leads.length, status: null },
      { stage: 'Contacted', value: leads.filter((l) => contactSet(l.status)).length, status: 'CONTACTED' },
      { stage: 'Replies', value: leads.filter((l) => replySet(l.status)).length, status: 'REPLIED' },
      { stage: 'Interested', value: leads.filter((l) => interSet(l.status)).length, status: 'INTERESTED' },
      { stage: 'Negotiation', value: leads.filter((l) => l.status === 'NEGOTIATION').length, status: 'NEGOTIATION' },
      { stage: 'Clients', value: leads.filter((l) => l.status === 'CLIENT').length, status: 'CLIENT' },
    ],
  });
}));