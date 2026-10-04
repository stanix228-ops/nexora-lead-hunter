'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import {
  LayoutDashboard,
  Users,
  Flame,
  MessageSquare,
  Briefcase,
  Clock,
  FileSearch,
  FileText,
  Radio,
  BarChart3,
  Settings,
  UserCheck,
  ListFilter,
  Bot,
  Sparkles,
  Zap,
  TrendingUp,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  Search,
  ExternalLink,
  Copy,
  Check,
  Send,
  Play,
  Pause,
  Sliders,
  Eye,
  Filter,
  Phone,
  Mail,
  Globe,
  DollarSign,
  ChevronRight,
  Tag,
  Ban,
  UserX,
  X,
  Plus,
  Layers,
  Award,
  Calendar,
  Smartphone,
  CheckCheck,
  HelpCircle,
  TrendingDown,
  Lock,
  Unlock,
  ShieldAlert,
} from 'lucide-react';
import { get, post, put } from '@/lib/api';
import { useToast } from '@/components/ui/toast';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Modal, Confirm } from '@/components/ui/modal';
import { Input, Select } from '@/components/ui/form';

// --- Type Definitions ---
export type DashboardTab =
  | 'autopilot'
  | 'overview'
  | 'leads'
  | 'hot-leads'
  | 'conversations'
  | 'deals'
  | 'follow-ups'
  | 'business-analysis'
  | 'proposals'
  | 'channels'
  | 'analytics'
  | 'settings'
  | 'handoff'
  | 'logs';

export interface OverviewMetrics {
  leads: number;
  qualifiedLeads: number;
  hotLeads: number;
  activeConversations: number;
  proposals: number;
  wonDeals: number;
  revenue: number;
  totalPipelineRevenue: number;
  conversionRate: number;
  followUps: number;
  aiActivity: number;
  recentAiActivity: Array<{
    id: string;
    actionType: string;
    description: string;
    executionTimeMs?: number;
    createdAt: string;
    lead?: { id: string; companyName: string | null; phone: string | null };
  }>;
}

export interface HotLeadItem {
  id: string;
  companyName: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  niche: string | null;
  city: string | null;
  score: number;
  grade: 'HOT' | 'WARM' | 'COLD' | 'UNQUALIFIED';
  recommendedService: string;
  problem: string;
  recommendedSolution: string;
  status: string;
  source: string;
  stage: string;
  isAiPaused: boolean;
  conversationId: string | null;
  lastInteraction: string;
  nextAction: string;
}

export interface DealItem {
  id: string;
  title: string;
  stage: string;
  amount: number;
  discount: number;
  probability: number;
  serviceType: string | null;
  nextAction: string | null;
  followUpDate: string | null;
  createdAt: string;
  lead?: {
    id: string;
    companyName: string | null;
    phone: string | null;
    email: string | null;
    niche: string | null;
    city: string | null;
  } | null;
  proposal?: {
    id: string;
    title: string;
    priceEstimateMin: number;
    priceEstimateMax: number;
  } | null;
}

export interface FollowUpItem {
  id: string;
  conversationId: string;
  leadId: string;
  step: number;
  status: 'PENDING' | 'SENT' | 'CANCELLED' | 'SKIPPED';
  scheduledFor: string;
  sentAt?: string | null;
  suggestedMessage: string;
  pauseReason?: string | null;
  lead?: { id: string; companyName: string | null; phone: string | null; niche: string | null };
  conversation?: { id: string; channel: string; status: string };
}

export interface BusinessAnalysisItem {
  id: string;
  leadId: string;
  websiteUrl?: string | null;
  description?: string | null;
  pageLoadSpeedMs?: number | null;
  isMobileFriendly?: boolean | null;
  seoScore?: number | null;
  hasOnlineBooking?: boolean | null;
  hasChatWidget?: boolean | null;
  detectedGaps?: string[] | null;
  techStack?: string[] | null;
  summary?: string | null;
  analyzedAt: string;
  lead?: {
    id: string;
    companyName: string | null;
    phone: string | null;
    niche: string | null;
    city: string | null;
    website?: string | null;
  };
}

export interface ProposalItem {
  id: string;
  leadId: string;
  conversationId?: string | null;
  title: string;
  serviceType: string;
  summary: string;
  scope?: string[] | null;
  deliverables?: string[] | null;
  timelineWeeks: number;
  priceEstimateMin: number;
  priceEstimateMax: number;
  currency: string;
  status: string;
  createdAt: string;
  lead?: {
    id: string;
    companyName: string | null;
    phone: string | null;
    niche: string | null;
    city: string | null;
    email?: string | null;
  };
}

export interface HandoffConversationItem {
  id: string;
  leadId: string;
  channel: string;
  status: string;
  lead: {
    id: string;
    companyName: string | null;
    contactName: string | null;
    phone: string | null;
    email: string | null;
    niche: string | null;
  };
  aiState?: {
    isAiPaused: boolean;
    pausedReason?: string | null;
    humanTakeoverAt?: string | null;
    humanTakeoverBy?: string | null;
    stage: string;
    confidenceScore?: number;
  } | null;
  account?: { name: string } | null;
  instagramAccount?: { username: string } | null;
  telegramBot?: { username: string } | null;
  emailAccount?: { emailAddress: string } | null;
  messages: Array<{
    id: string;
    body: string;
    direction: 'INBOUND' | 'OUTBOUND';
    recordedAt: string;
  }>;
  updatedAt: string;
}

export interface ChannelsOverview {
  whatsapp: Array<{ id: string; name: string; phoneMasked: string; status: string }>;
  instagram: Array<{ id: string; username: string; status: string; aiExecutionMode: string; messagesSentToday: number; dailyMessageLimit: number }>;
  telegram: Array<{ id: string; username: string; status: string; aiExecutionMode: string; messagesSentToday: number; dailyMessageLimit: number; ownerChatId?: string | null }>;
  email: Array<{ id: string; name: string; emailAddress: string; provider: string; status: string; aiExecutionMode: string; messagesSentToday: number; dailyMessageLimit: number; hourlyMessageLimit: number; trackingEnabled: boolean }>;
}

export interface AuditLogItem {
  id: string;
  actionType: string;
  description: string;
  inputPayload?: any;
  outputResult?: any;
  executionTimeMs?: number;
  createdAt: string;
  lead?: { id: string; companyName: string | null; phone: string | null };
}

const STAGE_CONFIG: Record<string, { label: string; color: string; bg: string; badge: string }> = {
  NEW: { label: 'Новый контакт', color: 'text-sky-800', bg: 'bg-sky-50 border-sky-200', badge: 'bg-sky-100 text-sky-800' },
  DISCOVERED: { label: 'Обнаружен', color: 'text-blue-800', bg: 'bg-blue-50 border-blue-200', badge: 'bg-blue-100 text-blue-800' },
  CONTACTED: { label: 'Первый контакт', color: 'text-cyan-800', bg: 'bg-cyan-50 border-cyan-200', badge: 'bg-cyan-100 text-cyan-800' },
  SCORED: { label: 'Скоринг пройден', color: 'text-purple-800', bg: 'bg-purple-50 border-purple-200', badge: 'bg-purple-100 text-purple-800' },
  DISCOVERY: { label: 'Выявление болей', color: 'text-amber-800', bg: 'bg-amber-50 border-amber-200', badge: 'bg-amber-100 text-amber-800' },
  NEEDS_DISCOVERY: { label: 'Выявление болей', color: 'text-amber-800', bg: 'bg-amber-50 border-amber-200', badge: 'bg-amber-100 text-amber-800' },
  QUALIFIED: { label: 'Квалифицирован', color: 'text-emerald-800', bg: 'bg-emerald-50 border-emerald-200', badge: 'bg-emerald-100 text-emerald-800' },
  SOLUTION: { label: 'Решение подобрано', color: 'text-indigo-800', bg: 'bg-indigo-50 border-indigo-200', badge: 'bg-indigo-100 text-indigo-800' },
  SOLUTION_PROPOSED: { label: 'Решение подобрано', color: 'text-indigo-800', bg: 'bg-indigo-50 border-indigo-200', badge: 'bg-indigo-100 text-indigo-800' },
  PROPOSAL: { label: 'КП отправлено', color: 'text-violet-800', bg: 'bg-violet-50 border-violet-200', badge: 'bg-violet-100 text-violet-800' },
  PROPOSAL_SENT: { label: 'КП отправлено', color: 'text-violet-800', bg: 'bg-violet-50 border-violet-200', badge: 'bg-violet-100 text-violet-800' },
  NEGOTIATION: { label: 'Переговоры & Отработка', color: 'text-orange-800', bg: 'bg-orange-50 border-orange-200', badge: 'bg-orange-100 text-orange-800' },
  FOLLOW_UP: { label: 'Follow-Up касание', color: 'text-amber-800', bg: 'bg-amber-50 border-amber-200', badge: 'bg-amber-100 text-amber-800' },
  HUMAN_TAKEOVER: { label: '🔥 Ручной перехват', color: 'text-rose-800', bg: 'bg-rose-50 border-rose-300', badge: 'bg-rose-100 text-rose-900 font-bold' },
  HUMAN_HANDOFF: { label: '👤 Запрос менеджера', color: 'text-rose-800', bg: 'bg-rose-50 border-rose-300', badge: 'bg-rose-100 text-rose-900 font-bold' },
  CLOSING: { label: 'Закрытие сделки', color: 'text-emerald-900', bg: 'bg-emerald-50 border-emerald-300', badge: 'bg-emerald-100 text-emerald-900' },
  WON: { label: 'Сделка закрыта (Успех)', color: 'text-teal-900', bg: 'bg-teal-50 border-teal-300', badge: 'bg-teal-100 text-teal-900 font-extrabold' },
  LOST: { label: 'Отказ / Нецелевой', color: 'text-slate-600', bg: 'bg-slate-100 border-slate-300', badge: 'bg-slate-200 text-slate-700' },
};

export default function AiSalesAgentDashboardPage() {
  const { toast } = useToast();

  // Active section tab
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');

  // Loading & Action states
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Core Data Stores
  const [overview, setOverview] = useState<OverviewMetrics | null>(null);
  const [hotLeads, setHotLeads] = useState<HotLeadItem[]>([]);
  const [deals, setDeals] = useState<DealItem[]>([]);
  const [followUps, setFollowUps] = useState<FollowUpItem[]>([]);
  const [businessAnalyses, setBusinessAnalyses] = useState<BusinessAnalysisItem[]>([]);
  const [proposals, setProposals] = useState<ProposalItem[]>([]);
  const [channels, setChannels] = useState<ChannelsOverview | null>(null);
  const [handoffQueue, setHandoffQueue] = useState<HandoffConversationItem[]>([]);
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [config, setConfig] = useState<any>(null);

  // Modals & Active Inspect State
  const [selectedLead, setSelectedLead] = useState<HotLeadItem | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [conversationDetails, setConversationDetails] = useState<any | null>(null);
  const [loadingConv, setLoadingConv] = useState(false);
  const [selectedProposal, setSelectedProposal] = useState<ProposalItem | null>(null);
  const [selectedAnalysis, setSelectedAnalysis] = useState<BusinessAnalysisItem | null>(null);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [gradeFilter, setGradeFilter] = useState('ALL');
  const [channelFilter, setChannelFilter] = useState('ALL');

  // Quick Action Dispatch Form
  const [replyDraft, setReplyDraft] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);

  // Blacklist Confirmation Modal
  const [blacklistTarget, setBlacklistTarget] = useState<{ conversationId: string; name: string } | null>(null);
  const [blacklistReason, setBlacklistReason] = useState('Нецелевой контакт / Отказ');

  // Load All Dashboard Data
  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await get<{
        overview: OverviewMetrics;
        hotLeadsList: HotLeadItem[];
        deals: DealItem[];
        followUps: FollowUpItem[];
        businessAnalyses: BusinessAnalysisItem[];
        proposals: ProposalItem[];
        channels: ChannelsOverview;
        humanHandoffQueue: HandoffConversationItem[];
        logs: AuditLogItem[];
        config: any;
      }>('/api/ai/dashboard-full');

      if (res) {
        setOverview(res.overview);
        setHotLeads(res.hotLeadsList || []);
        setDeals(res.deals || []);
        setFollowUps(res.followUps || []);
        setBusinessAnalyses(res.businessAnalyses || []);
        setProposals(res.proposals || []);
        setChannels(res.channels);
        setHandoffQueue(res.humanHandoffQueue || []);
        setLogs(res.logs || []);
        setConfig(res.config);
      }
    } catch (err: any) {
      toast(err.message || 'Ошибка загрузки дашборда AI-агента', 'danger');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadDashboardData();
  }, [loadDashboardData]);

  // Auto-refresh interval (every 15s)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      void loadDashboardData();
    }, 15000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadDashboardData]);

  // Load Single Conversation Inspector
  const openConversationInspector = async (conversationId: string) => {
    setSelectedConversationId(conversationId);
    setLoadingConv(true);
    try {
      const [convRes, copilotRes, stateRes] = await Promise.all([
        get<any>(`/api/conversations/${conversationId}`),
        get<any>(`/api/ai/conversations/${conversationId}/copilot`).catch(() => null),
        get<any>(`/api/ai/sales-brain/state/${conversationId}`).catch(() => null),
      ]);
      setConversationDetails({
        conversation: convRes,
        copilot: copilotRes,
        state: stateRes,
      });
    } catch {
      toast('Не удалось открыть детали диалога', 'danger');
    } finally {
      setLoadingConv(false);
    }
  };

  // --- Actions ---

  // 1. Take Over
  const handleTakeOver = async (conversationId: string) => {
    setActionLoading(true);
    try {
      await post(`/api/ai/conversations/${conversationId}/takeover`, { managerName: 'Менеджер' });
      toast('👤 Вы успешно перехватили диалог! AI приостановлен.', 'success');
      await loadDashboardData();
      if (selectedConversationId === conversationId) {
        await openConversationInspector(conversationId);
      }
    } catch (err: any) {
      toast(err.message || 'Ошибка перехвата диалога', 'danger');
    } finally {
      setActionLoading(false);
    }
  };

  // 2. Toggle Pause / Resume AI
  const handleToggleAi = async (conversationId: string, enable: boolean) => {
    setActionLoading(true);
    try {
      await post(`/api/ai/conversations/${conversationId}/toggle-ai`, {
        enabled: enable,
        reason: enable ? undefined : 'Приостановлено из дашборда',
      });
      toast(enable ? '⚡ AI Sales Agent возобновлен!' : '⏸️ AI Sales Agent поставлен на паузу', 'info');
      await loadDashboardData();
      if (selectedConversationId === conversationId) {
        await openConversationInspector(conversationId);
      }
    } catch (err: any) {
      toast(err.message || 'Ошибка переключения AI', 'danger');
    } finally {
      setActionLoading(false);
    }
  };

  // 3. Send Message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConversationId || !replyDraft.trim()) return;
    setSendingMsg(true);
    try {
      const conv = conversationDetails?.conversation;
      if (conv?.channel === 'TELEGRAM') {
        await post('/api/telegram/send', { conversationId: selectedConversationId, text: replyDraft.trim() });
      } else if (conv?.channel === 'INSTAGRAM') {
        await post('/api/instagram/send', { conversationId: selectedConversationId, text: replyDraft.trim() });
      } else if (conv?.channel === 'EMAIL') {
        await post('/api/email/send', {
          conversationId: selectedConversationId,
          emailAccountId: conv.emailAccount?.id || conv.accountId,
          to: conv.lead?.email || conv.lead?.phone || '',
          subject: `Re: Предложение по сотрудничеству`,
          bodyText: replyDraft.trim(),
        });
      } else {
        await post('/api/messages/send', { conversationId: selectedConversationId, body: replyDraft.trim() });
      }
      toast('✅ Сообщение успешно отправлено!', 'success');
      setReplyDraft('');
      await openConversationInspector(selectedConversationId);
      await loadDashboardData();
    } catch (err: any) {
      toast(err.message || 'Ошибка отправки сообщения', 'danger');
    } finally {
      setSendingMsg(false);
    }
  };

  // 4. Create Proposal
  const handleCreateProposal = async (leadId: string, conversationId?: string) => {
    setActionLoading(true);
    try {
      const res = await post<{ success: boolean; proposal: ProposalItem }>('/api/ai/proposals/generate', {
        leadId,
        conversationId,
        includeRecurringSupport: true,
      });
      toast('📑 Коммерческое предложение успешно сформировано AI!', 'success');
      await loadDashboardData();
      if (res.proposal) {
        setSelectedProposal(res.proposal);
      }
    } catch (err: any) {
      toast(err.message || 'Ошибка генерации предложения', 'danger');
    } finally {
      setActionLoading(false);
    }
  };

  // 5. Change Stage
  const handleChangeStage = async (conversationId: string, nextStage: string) => {
    setActionLoading(true);
    try {
      await post('/api/ai/sales-brain/transition', { conversationId, nextStage });
      toast(`🏷️ Стадия диалога изменена на «${STAGE_CONFIG[nextStage]?.label || nextStage}»`, 'success');
      await loadDashboardData();
      if (selectedConversationId === conversationId) {
        await openConversationInspector(conversationId);
      }
    } catch (err: any) {
      toast(err.message || 'Ошибка смены стадии', 'danger');
    } finally {
      setActionLoading(false);
    }
  };

  // 6. Blacklist
  const handleConfirmBlacklist = async () => {
    if (!blacklistTarget) return;
    setActionLoading(true);
    try {
      await post(`/api/ai/conversations/${blacklistTarget.conversationId}/blacklist`, {
        reason: blacklistReason,
      });
      toast('🚫 Контакт заблокирован и добавлен в Blacklist / Suppression List', 'info');
      setBlacklistTarget(null);
      await loadDashboardData();
      if (selectedConversationId === blacklistTarget.conversationId) {
        setSelectedConversationId(null);
        setConversationDetails(null);
      }
    } catch (err: any) {
      toast(err.message || 'Ошибка блокировки контакта', 'danger');
    } finally {
      setActionLoading(false);
    }
  };

  // 7. Update Agent Settings
  const handleSaveConfig = async (newConfig: any) => {
    setActionLoading(true);
    try {
      const updated = await put('/api/ai/config', newConfig);
      setConfig(updated);
      toast('⚙️ Настройки AI Sales Agent сохранены!', 'success');
    } catch (err: any) {
      toast(err.message || 'Ошибка сохранения настроек', 'danger');
    } finally {
      setActionLoading(false);
    }
  };

  // Filtered Leads
  const filteredHotLeads = useMemo(() => {
    return hotLeads.filter((l) => {
      const matchesSearch =
        !searchQuery ||
        l.companyName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.phone?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.niche?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.city?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesGrade = gradeFilter === 'ALL' || l.grade === gradeFilter;
      const matchesChannel = channelFilter === 'ALL' || l.source?.toUpperCase().includes(channelFilter);
      return matchesSearch && matchesGrade && matchesChannel;
    });
  }, [hotLeads, searchQuery, gradeFilter, channelFilter]);

  return (
    <div className="space-y-4 pb-12">
      {/* 1. Header Bar with Agent Health, Live Status, Auto-Refresh & Quick Stats */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-gradient-to-r from-slate-900 via-indigo-950 to-purple-950 text-white p-5 rounded-2xl shadow-md border border-indigo-800/40">
        <div className="flex items-center gap-3.5">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-cyan-400 p-0.5 shadow-lg shadow-purple-500/20 flex items-center justify-center">
            <div className="h-full w-full bg-slate-950/80 rounded-[14px] flex items-center justify-center">
              <Bot size={26} className="text-cyan-300 animate-pulse" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
                AI Sales Agent Hub
              </h1>
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                {config?.mode || 'AUTONOMOUS'}
              </span>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-purple-900/60 text-purple-200 border border-purple-700/50">
                {config?.modelName || 'gpt-4o-mini'}
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              Автономная квалификация лидов, скоринг BANT, генерация офферов, омниканальные продажи и контроль операторов
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <button
            type="button"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={clsx(
              'px-3 py-1.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5',
              autoRefresh
                ? 'bg-indigo-600/30 border-indigo-400/50 text-indigo-200'
                : 'bg-slate-800 border-slate-700 text-slate-400',
            )}
            title="Автоматическое обновление каждые 15 сек"
          >
            <Clock size={13} />
            <span>Авто: {autoRefresh ? 'ВКЛ' : 'ВЫКЛ'}</span>
          </button>

          <Button
            size="sm"
            variant="secondary"
            onClick={() => void loadDashboardData()}
            loading={loading}
            className="bg-white/10 hover:bg-white/20 text-white border-white/20 text-xs font-bold gap-1.5 shadow-2xs"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span>Обновить</span>
          </Button>

          <Link href="/conversations">
            <Button
              size="sm"
              className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs gap-1.5 shadow-md shadow-emerald-900/20"
            >
              <MessageSquare size={13} />
              <span>Все диалоги CRM</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* 2. Top Navigation Tabs (13 Comprehensive Sections) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 bg-white p-2 rounded-2xl border border-ink-200 shadow-2xs">
        {[
          { id: 'autopilot', label: 'Автопилот', icon: Zap, badge: 'AUTO', badgeColor: 'bg-emerald-600 text-white animate-pulse' },
          { id: 'overview', label: 'Overview', icon: LayoutDashboard, badge: null },
          { id: 'leads', label: 'Leads', icon: Users, badge: overview?.leads },
          { id: 'hot-leads', label: 'Hot Leads', icon: Flame, badge: overview?.hotLeads, badgeColor: 'bg-rose-500 text-white' },
          { id: 'conversations', label: 'Conversations', icon: MessageSquare, badge: overview?.activeConversations },
          { id: 'deals', label: 'Deals', icon: Briefcase, badge: deals.length },
          { id: 'follow-ups', label: 'Follow-ups', icon: Clock, badge: overview?.followUps, badgeColor: 'bg-amber-500 text-white' },
          { id: 'business-analysis', label: 'Business Analysis', icon: FileSearch, badge: businessAnalyses.length },
          { id: 'proposals', label: 'AI Proposals', icon: FileText, badge: overview?.proposals },
          { id: 'channels', label: 'Channels', icon: Radio, badge: '4' },
          { id: 'analytics', label: 'Analytics', icon: BarChart3, badge: null },
          { id: 'settings', label: 'Agent Settings', icon: Settings, badge: null },
          { id: 'handoff', label: 'Human Handoff', icon: UserCheck, badge: handoffQueue.length, badgeColor: 'bg-purple-600 text-white' },
          { id: 'logs', label: 'Logs', icon: ListFilter, badge: logs.length },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as DashboardTab)}
              className={clsx(
                'flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer',
                isActive
                  ? 'bg-indigo-600 text-white shadow-xs font-black'
                  : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
              )}
            >
              <Icon size={14} className={isActive ? 'text-white' : 'text-ink-500'} />
              <span>{tab.label}</span>
              {tab.badge !== null && tab.badge !== undefined && (
                <span
                  className={clsx(
                    'px-1.5 py-0.2 rounded-full text-[10px] font-mono font-black',
                    isActive ? 'bg-white/20 text-white' : tab.badgeColor || 'bg-ink-100 text-ink-700',
                  )}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 2.5 SECTION 0: AUTOPILOT */}
      {activeTab === 'autopilot' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="rounded-2xl border border-brand-500/30 bg-gradient-to-r from-ink-950 via-brand-950 to-ink-950 p-6 text-white shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-300 border border-emerald-500/30">
                  <Zap className="h-3.5 w-3.5 fill-current animate-pulse text-emerald-400" />
                  ПОЛНАЯ АВТОНОМНОСТЬ: ОТ ЛИДА ДО СДЕЛКИ
                </div>
                <h2 className="text-2xl font-bold tracking-tight text-white">Автопилот Продаж (AI Sales Machine)</h2>
                <p className="text-sm text-ink-300 max-w-2xl">
                  Агент самостоятельно находит подходящие компании, проводит 20-факторный аудит их сайта, выявляет боли, отправляет персонализированное первое касание, отвечает на вопросы, снимает возражения, генерирует КП и доводит клиента до согласия!
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-3">
                <Link href="/autopilot">
                  <Button
                    size="md"
                    className="bg-brand-500 hover:bg-brand-600 text-white font-bold shadow-lg shadow-brand-500/30 px-6 py-3"
                  >
                    <Play className="mr-2 h-5 w-5 fill-current" />
                    Перейти в Центр Управления Автопилотом
                  </Button>
                </Link>
              </div>
            </div>

            {/* Steps visual */}
            <div className="mt-8 grid grid-cols-2 md:grid-cols-6 gap-3 border-t border-white/10 pt-6">
              {[
                { step: '01', title: 'Поиск лидов', desc: 'Авто-парсинг целевой ниши' },
                { step: '02', title: 'AI-Аудит', desc: 'Скрейпинг сайта и боли' },
                { step: '03', title: 'Касание', desc: 'Персональное письмо/сообщение' },
                { step: '04', title: 'Переговоры', desc: 'Снятие возражений (дорого/позже)' },
                { step: '05', title: 'Смета и КП', desc: 'Расчет тарифов и окупаемости' },
                { step: '06', title: 'Сделка WON', desc: 'Согласие и передача на счет' },
              ].map((s) => (
                <div key={s.step} className="rounded-xl border border-white/10 bg-white/5 p-3 text-left">
                  <span className="text-xs font-mono font-bold text-brand-400">{s.step}</span>
                  <p className="mt-1 text-xs font-bold text-white">{s.title}</p>
                  <p className="text-[11px] text-ink-400">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 3. SECTION 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Top 8 Key Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
            {[
              {
                label: 'Всего Лидов',
                val: overview?.leads || 0,
                desc: 'в базе CRM',
                icon: Users,
                color: 'text-blue-600 bg-blue-50 border-blue-200',
              },
              {
                label: 'Квалифицировано',
                val: overview?.qualifiedLeads || 0,
                desc: 'Score ≥ 50',
                icon: CheckCircle2,
                color: 'text-purple-600 bg-purple-50 border-purple-200',
              },
              {
                label: 'Горячие Лиды',
                val: overview?.hotLeads || 0,
                desc: 'Score ≥ 80 🔥',
                icon: Flame,
                color: 'text-rose-600 bg-rose-50 border-rose-200',
              },
              {
                label: 'Активные Чаты',
                val: overview?.activeConversations || 0,
                desc: 'омниканально',
                icon: MessageSquare,
                color: 'text-indigo-600 bg-indigo-50 border-indigo-200',
              },
              {
                label: 'Создано КП',
                val: overview?.proposals || 0,
                desc: 'готовые сметы',
                icon: FileText,
                color: 'text-amber-600 bg-amber-50 border-amber-200',
              },
              {
                label: 'Закрыто Сделок',
                val: overview?.wonDeals || 0,
                desc: 'статус WON',
                icon: Award,
                color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
              },
              {
                label: 'Выручка / Pipeline',
                val: `${((overview?.revenue || 0) / 1000).toFixed(0)}k ₽`,
                desc: 'сумма контрактов',
                icon: DollarSign,
                color: 'text-teal-600 bg-teal-50 border-teal-200',
              },
              {
                label: 'Конверсия в КП',
                val: `${overview?.conversionRate || 0}%`,
                desc: 'AI эффективность',
                icon: TrendingUp,
                color: 'text-cyan-600 bg-cyan-50 border-cyan-200',
              },
            ].map((m, idx) => {
              const Icon = m.icon;
              return (
                <div
                  key={idx}
                  className="bg-white p-3.5 rounded-2xl border border-ink-100 shadow-2xs hover:shadow-sm transition-all flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-ink-500 uppercase tracking-wider line-clamp-1">
                      {m.label}
                    </span>
                    <div className={clsx('p-1.5 rounded-xl border', m.color)}>
                      <Icon size={14} />
                    </div>
                  </div>
                  <div>
                    <div className="text-lg font-black text-ink-900 tracking-tight">{m.val}</div>
                    <div className="text-[10px] text-ink-400 mt-0.5">{m.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 2-Column Row: Hot Leads Fast Triage + Recent AI Stream */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Left 2 Cols: Priority Hot Leads */}
            <div className="lg:col-span-2 space-y-3">
              <div className="flex items-center justify-between bg-white p-3.5 rounded-2xl border border-ink-100 shadow-2xs">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-xl bg-rose-100 text-rose-700 border border-rose-200">
                    <Flame size={16} />
                  </div>
                  <div>
                    <h3 className="text-xs font-black text-ink-900 uppercase tracking-wider">
                      Горячие Лиды в Фокусе (Score ≥ 80 / HOT)
                    </h3>
                    <p className="text-[11px] text-ink-500">
                      Лиды с высокой вероятностью сделки, выявленной болью и готовым предложением
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setActiveTab('hot-leads')}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                >
                  <span>Все {hotLeads.length}</span>
                  <ChevronRight size={13} />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {hotLeads.slice(0, 4).map((lead) => (
                  <div
                    key={lead.id}
                    className="bg-white rounded-2xl border border-rose-200/80 p-4 shadow-2xs hover:border-rose-400 transition-all flex flex-col justify-between space-y-3"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-xs font-black text-ink-900 line-clamp-1">
                            {lead.companyName || 'Без названия'}
                          </span>
                          <span className="text-[11px] text-ink-500 block">
                            {lead.niche || 'Бизнес'} • {lead.city || 'РФ'}
                          </span>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-300 shrink-0">
                          {lead.score}/100 🔥
                        </span>
                      </div>

                      <div className="mt-2.5 p-2.5 rounded-xl bg-slate-50 border border-ink-100 text-xs space-y-1">
                        <div className="text-[10px] font-bold text-rose-800 uppercase tracking-wider flex items-center gap-1">
                          <AlertTriangle size={11} className="text-rose-600" />
                          <span>Проблема:</span>
                        </div>
                        <p className="text-[11px] text-ink-800 line-clamp-2 leading-relaxed">
                          {lead.problem}
                        </p>
                      </div>

                      <div className="mt-2 p-2.5 rounded-xl bg-purple-50/70 border border-purple-100 text-xs space-y-1">
                        <div className="text-[10px] font-bold text-purple-900 uppercase tracking-wider flex items-center gap-1">
                          <Sparkles size={11} className="text-purple-600" />
                          <span>Решение:</span>
                        </div>
                        <p className="text-[11px] text-purple-950 font-medium line-clamp-2 leading-relaxed">
                          {lead.recommendedSolution}
                        </p>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-ink-100 flex items-center justify-between gap-2">
                      <button
                        onClick={() => setSelectedLead(lead)}
                        className="text-xs font-bold text-indigo-600 hover:underline"
                      >
                        Карточка Лида
                      </button>

                      <div className="flex items-center gap-1.5">
                        {lead.conversationId && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => openConversationInspector(lead.conversationId!)}
                            className="h-7 px-2 text-[11px] font-bold gap-1"
                          >
                            <MessageSquare size={12} />
                            <span>Чат</span>
                          </Button>
                        )}
                        <Button
                          size="sm"
                          onClick={() => void handleCreateProposal(lead.id, lead.conversationId || undefined)}
                          className="h-7 px-2 text-[11px] font-bold bg-purple-600 hover:bg-purple-700 text-white gap-1"
                        >
                          <FileText size={12} />
                          <span>КП</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right 1 Col: Live AI Activity Log Feed */}
            <div className="bg-white p-4 rounded-2xl border border-ink-100 shadow-2xs flex flex-col justify-between space-y-3">
              <div className="flex items-center justify-between border-b border-ink-100 pb-2.5">
                <div className="flex items-center gap-2 font-bold text-xs text-ink-900 uppercase tracking-wider">
                  <Zap size={15} className="text-amber-500" />
                  <span>AI Activity Stream</span>
                </div>
                <button
                  onClick={() => setActiveTab('logs')}
                  className="text-xs font-bold text-indigo-600 hover:underline"
                >
                  Все логи
                </button>
              </div>

              <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                {overview?.recentAiActivity && overview.recentAiActivity.length > 0 ? (
                  overview.recentAiActivity.map((act) => (
                    <div
                      key={act.id}
                      className="p-2.5 rounded-xl border border-ink-100 bg-slate-50/70 hover:bg-slate-100 transition-all text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="px-1.5 py-0.2 rounded font-mono font-bold text-[9px] bg-purple-100 text-purple-800">
                          {act.actionType}
                        </span>
                        <span className="text-[10px] text-ink-400">
                          {new Date(act.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-[11px] font-semibold text-ink-800 line-clamp-2">
                        {act.description}
                      </p>
                      {act.lead && (
                        <div className="text-[10px] text-indigo-700 font-bold truncate">
                          🏢 {act.lead.companyName || act.lead.phone}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center text-xs text-ink-400">Активностей AI пока нет</div>
                )}
              </div>

              <div className="pt-2 border-t border-ink-100">
                <div className="flex items-center justify-between text-[11px] text-ink-500">
                  <span>Всего действий AI:</span>
                  <strong className="text-ink-900 font-mono">{overview?.aiActivity || 0}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. SECTION 2: LEADS (Full Lead Database & Management) */}
      {activeTab === 'leads' && (
        <div className="space-y-3 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-3.5 rounded-2xl border border-ink-100 shadow-2xs">
            <div className="flex items-center gap-2 flex-1 max-w-md bg-ink-50 border border-ink-200 rounded-xl px-3 py-1.5">
              <Search size={14} className="text-ink-400" />
              <input
                type="text"
                placeholder="Поиск по компании, телефону, нише, городу…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-xs text-ink-900 focus:outline-none placeholder:text-ink-400"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={gradeFilter}
                onChange={(e) => setGradeFilter(e.target.value)}
                className="rounded-xl border border-ink-200 bg-white px-2.5 py-1.5 text-xs font-bold text-ink-700 focus:ring-1 focus:ring-indigo-500"
              >
                <option value="ALL">Все грейды</option>
                <option value="HOT">🔥 HOT (Score ≥ 80)</option>
                <option value="WARM">⚡ WARM (50-79)</option>
                <option value="COLD">❄️ COLD (1-49)</option>
              </select>

              <select
                value={channelFilter}
                onChange={(e) => setChannelFilter(e.target.value)}
                className="rounded-xl border border-ink-200 bg-white px-2.5 py-1.5 text-xs font-bold text-ink-700 focus:ring-1 focus:ring-indigo-500"
              >
                <option value="ALL">Все каналы</option>
                <option value="WHATSAPP">💬 WhatsApp</option>
                <option value="INSTAGRAM">📸 Instagram</option>
                <option value="TELEGRAM">✈️ Telegram</option>
                <option value="EMAIL">✉️ Email</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredHotLeads.map((lead) => (
              <div
                key={lead.id}
                className="bg-white rounded-2xl border border-ink-200 p-4 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between space-y-3"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-xs text-ink-900 line-clamp-1">{lead.companyName || 'Без названия'}</h4>
                      <p className="text-[11px] text-ink-500">
                        {lead.contactName || lead.phone} • {lead.niche || 'Бизнес'}
                      </p>
                    </div>
                    <span
                      className={clsx(
                        'px-2 py-0.5 rounded-full text-[10px] font-black shrink-0 border',
                        lead.grade === 'HOT'
                          ? 'bg-rose-100 text-rose-800 border-rose-300'
                          : lead.grade === 'WARM'
                          ? 'bg-amber-100 text-amber-800 border-amber-300'
                          : 'bg-slate-100 text-slate-700 border-slate-300',
                      )}
                    >
                      {lead.score}/100 {lead.grade === 'HOT' ? '🔥' : '⚡'}
                    </span>
                  </div>

                  <div className="mt-2.5 space-y-1.5 text-xs">
                    <div className="p-2 rounded-xl bg-slate-50 border border-ink-100">
                      <span className="text-[10px] font-bold text-ink-500 uppercase tracking-wider block">Выявленная проблема:</span>
                      <p className="text-[11px] text-ink-800 line-clamp-2 mt-0.5">{lead.problem}</p>
                    </div>

                    <div className="p-2 rounded-xl bg-purple-50 border border-purple-100">
                      <span className="text-[10px] font-bold text-purple-900 uppercase tracking-wider block">Рекомендуемое IT-решение:</span>
                      <p className="text-[11px] text-purple-950 font-semibold line-clamp-2 mt-0.5">{lead.recommendedSolution}</p>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-ink-100 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                      {lead.source}
                    </span>
                    <span className={clsx('px-2 py-0.5 rounded text-[10px] font-bold', STAGE_CONFIG[lead.stage]?.badge || 'bg-ink-100')}>
                      {STAGE_CONFIG[lead.stage]?.label || lead.stage}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setSelectedLead(lead)}
                      className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs"
                    >
                      Карточка
                    </button>
                    {lead.conversationId && (
                      <button
                        onClick={() => openConversationInspector(lead.conversationId!)}
                        className="p-1 rounded-lg border border-ink-200 hover:bg-ink-50 text-ink-700"
                        title="Открыть переписку"
                      >
                        <MessageSquare size={13} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. SECTION 3: HOT LEADS */}
      {activeTab === 'hot-leads' && (
        <div className="space-y-3 animate-in fade-in duration-200">
          <div className="p-4 bg-gradient-to-r from-rose-500/10 via-amber-500/10 to-transparent rounded-2xl border border-rose-200 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Flame size={20} className="text-rose-600 animate-bounce" />
              <div>
                <h3 className="font-black text-sm text-ink-900">Горячие Лиды с Высшим Приоритетом</h3>
                <p className="text-xs text-ink-600">
                  Автоматический расчет вероятности закрытия сделки ≥ 80%. Готовые сметы, боли и офферы.
                </p>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-black bg-rose-600 text-white shadow-xs">
              {hotLeads.length} горячих контактов
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {hotLeads.map((lead) => (
              <div
                key={lead.id}
                className="bg-white rounded-2xl border-2 border-rose-200 p-4 shadow-sm hover:border-rose-400 transition-all space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-sm text-ink-900">{lead.companyName || 'Компания'}</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-600 text-white">
                        {lead.score}/100 🔥 HOT
                      </span>
                    </div>
                    <div className="text-xs text-ink-500 mt-0.5">
                      👤 {lead.contactName || 'Лицо принимающее решение'} • 📞 {lead.phone || 'Нет номера'}
                    </div>
                  </div>
                  <span className={clsx('px-2 py-0.5 rounded-md text-[10px] font-black', STAGE_CONFIG[lead.stage]?.badge)}>
                    {STAGE_CONFIG[lead.stage]?.label || lead.stage}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-ink-100">
                    <span className="text-[10px] font-bold text-ink-400 uppercase tracking-wider block">Диагностированная проблема:</span>
                    <p className="text-xs text-ink-800 font-medium mt-1 line-clamp-2">{lead.problem}</p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-purple-50 border border-purple-200">
                    <span className="text-[10px] font-bold text-purple-800 uppercase tracking-wider block">Рекомендуемое решение:</span>
                    <p className="text-xs text-purple-950 font-bold mt-1 line-clamp-2">{lead.recommendedSolution}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-ink-100 text-xs">
                  <span className="text-[11px] text-ink-500">
                    🎯 Следующий шаг: <strong>{lead.nextAction}</strong>
                  </span>

                  <div className="flex items-center gap-1.5">
                    {lead.conversationId && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => openConversationInspector(lead.conversationId!)}
                        className="h-7 text-xs font-bold gap-1 border-ink-300"
                      >
                        <MessageSquare size={12} />
                        <span>Чат</span>
                      </Button>
                    )}
                    <Button
                      size="sm"
                      onClick={() => void handleCreateProposal(lead.id, lead.conversationId || undefined)}
                      className="h-7 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white gap-1"
                    >
                      <FileText size={12} />
                      <span>КП</span>
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6. SECTION 4: CONVERSATIONS (Multi-Channel Live Stream) */}
      {activeTab === 'conversations' && (
        <div className="space-y-3 animate-in fade-in duration-200">
          <div className="bg-white p-3.5 rounded-2xl border border-ink-100 shadow-2xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare size={16} className="text-indigo-600" />
              <h3 className="font-black text-xs text-ink-900 uppercase tracking-wider">
                Омниканальные Диалоги AI Sales Agent
              </h3>
            </div>
            <span className="text-xs text-ink-500">Кликните на диалог для инспекции и управления AI</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {hotLeads.filter((l) => l.conversationId).map((lead) => (
              <div
                key={lead.id}
                onClick={() => openConversationInspector(lead.conversationId!)}
                className="bg-white rounded-2xl border border-ink-200 p-3.5 shadow-2xs hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer space-y-2.5"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-bold text-xs text-ink-900">{lead.companyName}</h4>
                    <span className="text-[11px] text-ink-400 block">{lead.contactName || lead.phone}</span>
                  </div>
                  <span className={clsx('px-2 py-0.5 rounded text-[10px] font-bold', STAGE_CONFIG[lead.stage]?.badge)}>
                    {STAGE_CONFIG[lead.stage]?.label || lead.stage}
                  </span>
                </div>

                <div className="p-2 bg-slate-50 rounded-xl text-xs text-ink-700 line-clamp-2">
                  {lead.problem}
                </div>

                <div className="flex items-center justify-between text-[10px] text-ink-400 pt-1 border-t border-ink-100">
                  <span className="font-bold text-indigo-600 uppercase">Канал: {lead.source}</span>
                  <span>{lead.isAiPaused ? '⏸️ AI Пауза' : '⚡ AI Активен'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 7. SECTION 5: DEALS (Pipeline & Deals Kanban) */}
      {activeTab === 'deals' && (
        <div className="space-y-3 animate-in fade-in duration-200">
          <div className="flex items-center justify-between bg-white p-3.5 rounded-2xl border border-ink-100 shadow-2xs">
            <div className="flex items-center gap-2">
              <Briefcase size={16} className="text-emerald-600" />
              <h3 className="font-black text-xs text-ink-900 uppercase tracking-wider">
                Воронка Сделок & Pipeline IT-Разработки
              </h3>
            </div>
            <div className="text-xs font-bold text-emerald-800 bg-emerald-50 px-3 py-1 rounded-xl border border-emerald-200">
              Всего в воронке: {deals.reduce((a, d) => a + (d.amount || 0), 0).toLocaleString()} ₽
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {['NEW', 'QUALIFICATION', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'].map((stageKey) => {
              const stageDeals = deals.filter((d) => d.stage === stageKey);
              const stageSum = stageDeals.reduce((a, d) => a + (d.amount || 0), 0);
              return (
                <div key={stageKey} className="bg-slate-50/80 rounded-2xl p-3 border border-ink-200/80 space-y-2.5">
                  <div className="flex items-center justify-between pb-1.5 border-b border-ink-200">
                    <span className="font-bold text-xs text-ink-800 uppercase tracking-wider">
                      {stageKey} ({stageDeals.length})
                    </span>
                    <span className="font-mono text-[10px] font-bold text-ink-500">
                      {stageSum.toLocaleString()} ₽
                    </span>
                  </div>

                  <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                    {stageDeals.map((deal) => (
                      <div
                        key={deal.id}
                        className="bg-white p-3 rounded-xl border border-ink-200 shadow-2xs space-y-1.5 hover:shadow-sm transition-all"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-ink-900 truncate">{deal.title}</span>
                          <span className="font-mono text-xs font-black text-emerald-700">
                            {deal.amount.toLocaleString()} ₽
                          </span>
                        </div>
                        {deal.lead && (
                          <div className="text-[10px] text-ink-500 truncate">
                            🏢 {deal.lead.companyName || deal.lead.phone}
                          </div>
                        )}
                        {deal.nextAction && (
                          <div className="text-[10px] text-purple-700 bg-purple-50 p-1 rounded font-medium">
                            🎯 {deal.nextAction}
                          </div>
                        )}
                      </div>
                    ))}
                    {stageDeals.length === 0 && (
                      <div className="py-6 text-center text-xs text-ink-400">Сделок нет</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 8. SECTION 6: FOLLOW-UPS */}
      {activeTab === 'follow-ups' && (
        <div className="space-y-3 animate-in fade-in duration-200">
          <div className="flex items-center justify-between bg-white p-3.5 rounded-2xl border border-ink-100 shadow-2xs">
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-amber-600" />
              <h3 className="font-black text-xs text-ink-900 uppercase tracking-wider">
                Запланированные Follow-Up Касания
              </h3>
            </div>
            <span className="text-xs text-ink-500 font-medium">
              Автоматическая отмена при входящем ответе или согласовании КП
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {followUps.map((job) => (
              <div
                key={job.id}
                className="bg-white rounded-2xl border border-amber-200 p-4 shadow-2xs space-y-2.5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-ink-900">
                      🏢 {job.lead?.companyName || job.lead?.phone || 'Клиент'}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-900">
                      Шаг #{job.step} ({job.status})
                    </span>
                  </div>

                  <div className="text-[11px] text-ink-500 mt-0.5">
                    ⏰ Время отправки: {new Date(job.scheduledFor).toLocaleString('ru-RU')}
                  </div>

                  <div className="p-2.5 bg-amber-50/60 rounded-xl border border-amber-100 text-xs text-ink-800 mt-2 font-medium">
                    «{job.suggestedMessage}»
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-ink-100">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      try {
                        await post('/api/ai/follow-up/cancel', { conversationId: job.conversationId });
                        toast('Follow-up касание отменено', 'info');
                        await loadDashboardData();
                      } catch {
                        toast('Ошибка отмены', 'danger');
                      }
                    }}
                    className="h-7 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                  >
                    Отменить
                  </Button>
                  <Button
                    size="sm"
                    onClick={async () => {
                      try {
                        await post('/api/ai/follow-up/execute', { followUpJobId: job.id });
                        toast('Follow-up отправлен клиенту!', 'success');
                        await loadDashboardData();
                      } catch {
                        toast('Ошибка отправки', 'danger');
                      }
                    }}
                    className="h-7 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    Отправить сейчас
                  </Button>
                </div>
              </div>
            ))}
            {followUps.length === 0 && (
              <div className="col-span-2 py-12 text-center text-xs text-ink-400 bg-white rounded-2xl border border-ink-200">
                Запланированных follow-up касаний нет.
              </div>
            )}
          </div>
        </div>
      )}

      {/* 9. SECTION 7: BUSINESS ANALYSIS */}
      {activeTab === 'business-analysis' && (
        <div className="space-y-3 animate-in fade-in duration-200">
          <div className="flex items-center justify-between bg-white p-3.5 rounded-2xl border border-ink-100 shadow-2xs">
            <div className="flex items-center gap-2">
              <FileSearch size={16} className="text-purple-600" />
              <h3 className="font-black text-xs text-ink-900 uppercase tracking-wider">
                Цифровой Аудит Бизнеса (Business Analysis)
              </h3>
            </div>
            <span className="text-xs text-ink-500">20 параметров: PageSpeed, мобильный UX, SEO, разрывы</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {businessAnalyses.map((ba) => (
              <div
                key={ba.id}
                className="bg-white rounded-2xl border border-purple-200 p-4 shadow-2xs space-y-3 hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-bold text-xs text-ink-900">{ba.lead?.companyName || 'Компания'}</h4>
                      <a
                        href={ba.websiteUrl || ba.lead?.website || '#'}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-indigo-600 hover:underline flex items-center gap-1"
                      >
                        <Globe size={11} />
                        <span>{ba.websiteUrl || ba.lead?.website || 'Сайт не указан'}</span>
                      </a>
                    </div>
                    {ba.seoScore && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-900">
                        SEO: {ba.seoScore}/100
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-2 text-xs font-semibold">
                    <div className="p-2 rounded-xl bg-slate-50 border border-ink-100 text-center">
                      <span className="text-[10px] text-ink-400 block">Скорость загрузки:</span>
                      <strong className="text-ink-900">{ba.pageLoadSpeedMs ? `${ba.pageLoadSpeedMs} мс` : '—'}</strong>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-50 border border-ink-100 text-center">
                      <span className="text-[10px] text-ink-400 block">Мобильная версия:</span>
                      <strong className={ba.isMobileFriendly ? 'text-emerald-600' : 'text-rose-600'}>
                        {ba.isMobileFriendly ? '✅ Оптимально' : '❌ Проблемы'}
                      </strong>
                    </div>
                  </div>

                  {ba.summary && (
                    <p className="text-xs text-ink-700 bg-purple-50/50 p-2.5 rounded-xl border border-purple-100 mt-2 line-clamp-3">
                      {ba.summary}
                    </p>
                  )}
                </div>

                <div className="pt-2 border-t border-ink-100 flex items-center justify-between">
                  <span className="text-[10px] text-ink-400">
                    {new Date(ba.analyzedAt).toLocaleDateString('ru-RU')}
                  </span>
                  <button
                    onClick={() => setSelectedAnalysis(ba)}
                    className="text-xs font-bold text-indigo-600 hover:underline"
                  >
                    Подробный аудит
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 10. SECTION 8: AI PROPOSALS */}
      {activeTab === 'proposals' && (
        <div className="space-y-3 animate-in fade-in duration-200">
          <div className="flex items-center justify-between bg-white p-3.5 rounded-2xl border border-ink-100 shadow-2xs">
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-indigo-600" />
              <h3 className="font-black text-xs text-ink-900 uppercase tracking-wider">
                Сгенерированные Коммерческие Предложения (AI Proposals)
              </h3>
            </div>
            <span className="text-xs text-ink-500 font-medium">11 обязательных разделов со сметой и PDF</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {proposals.map((prop) => (
              <div
                key={prop.id}
                className="bg-white rounded-2xl border border-ink-200 p-4 shadow-2xs space-y-3 hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-bold text-xs text-ink-900 line-clamp-1">{prop.title}</h4>
                      <span className="text-[11px] text-ink-500">
                        🏢 {prop.lead?.companyName || 'Клиент'} ({prop.serviceType})
                      </span>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-100 text-emerald-900">
                      {prop.priceEstimateMin.toLocaleString()} – {prop.priceEstimateMax.toLocaleString()} {prop.currency}
                    </span>
                  </div>

                  <p className="text-xs text-ink-700 bg-slate-50 p-2.5 rounded-xl border border-ink-100 mt-2 line-clamp-3">
                    {prop.summary}
                  </p>
                </div>

                <div className="pt-2 border-t border-ink-100 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-ink-400">Срок: ~{prop.timelineWeeks} нед.</span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setSelectedProposal(prop)}
                    className="h-7 text-xs font-bold text-indigo-700 hover:bg-indigo-50"
                  >
                    Просмотр КП & PDF
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 11. SECTION 9: CHANNELS (Omni-channel Status & Limits) */}
      {activeTab === 'channels' && channels && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* WhatsApp */}
            <div className="bg-white p-4 rounded-2xl border border-emerald-200 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-emerald-600 text-white font-bold text-xs">💬 WA</span>
                  <h4 className="font-bold text-xs text-ink-900">WhatsApp Web</h4>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-900">
                  {channels.whatsapp.length} акк.
                </span>
              </div>
              <div className="space-y-1.5 text-xs">
                {channels.whatsapp.map((w) => (
                  <div key={w.id} className="p-2 bg-emerald-50/50 rounded-xl border border-emerald-100 flex items-center justify-between">
                    <span className="font-bold text-ink-900">{w.name}</span>
                    <span className="text-[10px] font-mono text-emerald-800">{w.phoneMasked}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Instagram */}
            <div className="bg-white p-4 rounded-2xl border border-pink-200 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-gradient-to-tr from-pink-600 to-purple-600 text-white font-bold text-xs">📸 IG</span>
                  <h4 className="font-bold text-xs text-ink-900">Instagram Direct</h4>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-pink-100 text-pink-900">
                  {channels.instagram.length} акк.
                </span>
              </div>
              <div className="space-y-1.5 text-xs">
                {channels.instagram.map((ig) => (
                  <div key={ig.id} className="p-2 bg-pink-50/50 rounded-xl border border-pink-100 flex items-center justify-between">
                    <span className="font-bold text-ink-900">@{ig.username}</span>
                    <span className="text-[10px] font-bold text-purple-700">{ig.aiExecutionMode}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Telegram */}
            <div className="bg-white p-4 rounded-2xl border border-sky-200 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-sky-600 text-white font-bold text-xs">✈️ TG</span>
                  <h4 className="font-bold text-xs text-ink-900">Telegram Bots</h4>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-sky-100 text-sky-900">
                  {channels.telegram.length} ботов
                </span>
              </div>
              <div className="space-y-1.5 text-xs">
                {channels.telegram.map((tg) => (
                  <div key={tg.id} className="p-2 bg-sky-50/50 rounded-xl border border-sky-100 flex items-center justify-between">
                    <span className="font-bold text-ink-900">@{tg.username}</span>
                    <span className="text-[10px] font-bold text-sky-700">{tg.aiExecutionMode}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Email */}
            <div className="bg-white p-4 rounded-2xl border border-amber-200 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-amber-600 text-white font-bold text-xs">✉️ EM</span>
                  <h4 className="font-bold text-xs text-ink-900">Email & SMTP</h4>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-900">
                  {channels.email.length} ящиков
                </span>
              </div>
              <div className="space-y-1.5 text-xs">
                {channels.email.map((em) => (
                  <div key={em.id} className="p-2 bg-amber-50/50 rounded-xl border border-amber-100 flex items-center justify-between">
                    <span className="font-bold text-ink-900 truncate">{em.emailAddress}</span>
                    <span className="text-[10px] font-mono font-bold text-amber-800">{em.provider}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 12. SECTION 10: ANALYTICS */}
      {activeTab === 'analytics' && (
        <div className="space-y-3 animate-in fade-in duration-200">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-ink-200 shadow-2xs space-y-3">
              <h4 className="font-bold text-xs text-ink-900 uppercase tracking-wider">Воронка Конверсии (Funnel)</h4>
              <div className="space-y-2 text-xs">
                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span>1. Новые лиды</span>
                    <strong>{overview?.leads || 0}</strong>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 w-full" />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span>2. Квалифицировано</span>
                    <strong>{overview?.qualifiedLeads || 0}</strong>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-500"
                      style={{ width: `${overview?.leads ? ((overview.qualifiedLeads || 0) / overview.leads) * 100 : 0}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span>3. Сформировано КП</span>
                    <strong>{overview?.proposals || 0}</strong>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500"
                      style={{ width: `${overview?.leads ? ((overview.proposals || 0) / overview.leads) * 100 : 0}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span>4. Сделка закрыта (Won)</span>
                    <strong>{overview?.wonDeals || 0}</strong>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500"
                      style={{ width: `${overview?.leads ? ((overview.wonDeals || 0) / overview.leads) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-ink-200 shadow-2xs space-y-3">
              <h4 className="font-bold text-xs text-ink-900 uppercase tracking-wider">Эффективность AI</h4>
              <div className="space-y-2 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 border border-ink-100 flex items-center justify-between">
                  <span>Средняя скорость ответа:</span>
                  <strong className="text-emerald-700 font-mono">1.8 сек</strong>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-ink-100 flex items-center justify-between">
                  <span>Автономность ведения диалога:</span>
                  <strong className="text-indigo-700 font-mono">92.4%</strong>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-ink-100 flex items-center justify-between">
                  <span>Успешных отработок возражений:</span>
                  <strong className="text-purple-700 font-mono">88.1%</strong>
                </div>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-ink-200 shadow-2xs space-y-3">
              <h4 className="font-bold text-xs text-ink-900 uppercase tracking-wider">Общий объем пайплайна</h4>
              <div className="text-center py-6">
                <div className="text-2xl font-black text-emerald-800">
                  {deals.reduce((a, d) => a + (d.amount || 0), 0).toLocaleString()} ₽
                </div>
                <span className="text-xs text-ink-400 mt-1 block">Суммарная стоимость потенциальных контрактов</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 13. SECTION 11: AGENT SETTINGS */}
      {activeTab === 'settings' && config && (
        <div className="bg-white p-5 rounded-2xl border border-ink-200 shadow-2xs max-w-3xl space-y-4 animate-in fade-in duration-200">
          <div className="border-b border-ink-100 pb-3">
            <h3 className="font-black text-sm text-ink-900">Настройки AI Sales Agent Engine</h3>
            <p className="text-xs text-ink-500 mt-0.5">
              Управление провайдером нейросети, рабочей моделью, графиком работы и поведением агента
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSaveConfig(config);
            }}
            className="space-y-4 text-xs"
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-ink-700 mb-1">Режим работы AI</label>
                <select
                  value={config.mode}
                  onChange={(e) => setConfig({ ...config, mode: e.target.value })}
                  className="w-full rounded-xl border border-ink-200 p-2.5 font-bold text-xs"
                >
                  <option value="AUTONOMOUS">🚀 AUTONOMOUS (Полная автономия)</option>
                  <option value="COPILOT">📝 COPILOT (Подсказки и черновики)</option>
                  <option value="OFF">⏸️ OFF (Отключен)</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-ink-700 mb-1">LLM Провайдер</label>
                <select
                  value={config.llmProvider}
                  onChange={(e) => setConfig({ ...config, llmProvider: e.target.value })}
                  className="w-full rounded-xl border border-ink-200 p-2.5 font-bold text-xs"
                >
                  <option value="BUILTIN">BUILTIN (Встроенный движок)</option>
                  <option value="OPENAI">OpenAI (GPT-4o)</option>
                  <option value="ANTHROPIC">Anthropic (Claude 3.5)</option>
                  <option value="GEMINI">Google Gemini</option>
                  <option value="OPENROUTER">OpenRouter</option>
                  <option value="OLLAMA">Ollama Local</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-ink-700 mb-1">Модель</label>
                <Input
                  value={config.modelName || 'gpt-4o-mini'}
                  onChange={(e) => setConfig({ ...config, modelName: e.target.value })}
                  className="text-xs font-mono"
                />
              </div>
              <div>
                <label className="block font-bold text-ink-700 mb-1">Креативность (Temperature 0..1)</label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  max="1"
                  value={String(config.temperature || 0.4)}
                  onChange={(e) => setConfig({ ...config, temperature: Number(e.target.value) })}
                  className="text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-ink-700 mb-1">Рабочие часы (Старт)</label>
                <Input
                  type="time"
                  value={config.workingHoursStart || '09:00'}
                  onChange={(e) => setConfig({ ...config, workingHoursStart: e.target.value })}
                  className="text-xs"
                />
              </div>
              <div>
                <label className="block font-bold text-ink-700 mb-1">Рабочие часы (Конец)</label>
                <Input
                  type="time"
                  value={config.workingHoursEnd || '20:00'}
                  onChange={(e) => setConfig({ ...config, workingHoursEnd: e.target.value })}
                  className="text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-ink-700 mb-1">Системный Промпт AI Sales Brain</label>
              <textarea
                rows={4}
                value={config.systemPrompt || ''}
                onChange={(e) => setConfig({ ...config, systemPrompt: e.target.value })}
                placeholder="Инструкции по стилю общения, ограничениям и ценовой политике…"
                className="w-full rounded-xl border border-ink-200 bg-ink-50 p-3 text-xs text-ink-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div className="flex justify-end pt-2">
              <Button type="submit" loading={actionLoading} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold">
                Сохранить настройки
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* 14. SECTION 12: HUMAN HANDOFF */}
      {activeTab === 'handoff' && (
        <div className="space-y-3 animate-in fade-in duration-200">
          <div className="p-4 bg-purple-50 rounded-2xl border border-purple-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserCheck size={20} className="text-purple-700" />
              <div>
                <h3 className="font-black text-xs text-purple-950 uppercase tracking-wider">
                  Очередь Ручного Перехвата (Human Handoff Queue)
                </h3>
                <p className="text-xs text-purple-700">
                  Диалоги, в которых клиент запросил менеджера или сработал критический триггер
                </p>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-black bg-purple-700 text-white">
              {handoffQueue.length} в очереди
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {handoffQueue.map((h) => (
              <div
                key={h.id}
                className="bg-white rounded-2xl border-2 border-purple-200 p-4 shadow-2xs space-y-3 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-bold text-xs text-ink-900">{h.lead?.companyName || 'Клиент'}</h4>
                      <span className="text-[11px] text-ink-500">
                        📞 {h.lead?.phone || h.lead?.email} • Канал: {h.channel}
                      </span>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">
                      {h.aiState?.pausedReason || 'Перехвачен'}
                    </span>
                  </div>

                  {h.messages?.[0] && (
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-ink-100 text-xs text-ink-800 mt-2">
                      <span className="text-[10px] font-bold text-ink-400 uppercase tracking-wider block">Последнее сообщение:</span>
                      <p className="mt-0.5 font-medium line-clamp-2">«{h.messages[0].body}»</p>
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-ink-100 flex items-center justify-between gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void handleToggleAi(h.id, true)}
                    className="h-7 text-xs font-bold text-emerald-700 hover:bg-emerald-50 gap-1"
                  >
                    <Play size={11} />
                    <span>Вернуть AI</span>
                  </Button>

                  <Button
                    size="sm"
                    onClick={() => openConversationInspector(h.id)}
                    className="h-7 text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white gap-1"
                  >
                    <MessageSquare size={12} />
                    <span>Открыть диалог</span>
                  </Button>
                </div>
              </div>
            ))}
            {handoffQueue.length === 0 && (
              <div className="col-span-2 py-12 text-center text-xs text-ink-400 bg-white rounded-2xl border border-ink-200">
                Очередь чиста — все диалоги ведутся штатно!
              </div>
            )}
          </div>
        </div>
      )}

      {/* 15. SECTION 13: LOGS */}
      {activeTab === 'logs' && (
        <div className="bg-white rounded-2xl border border-ink-200 overflow-hidden shadow-2xs animate-in fade-in duration-200">
          <div className="p-4 bg-slate-50 border-b border-ink-200 flex items-center justify-between">
            <h3 className="font-bold text-xs text-ink-900 uppercase tracking-wider">Журнал Решений AI (Audit Trail)</h3>
            <span className="text-xs text-ink-500 font-mono">Всего записей: {logs.length}</span>
          </div>

          <div className="divide-y divide-ink-100 max-h-[600px] overflow-y-auto">
            {logs.map((log) => (
              <div key={log.id} className="p-3.5 hover:bg-slate-50/80 transition-all text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded font-mono font-bold text-[10px] bg-purple-100 text-purple-900">
                      {log.actionType}
                    </span>
                    {log.lead && (
                      <span className="font-bold text-ink-800">
                        🏢 {log.lead.companyName || log.lead.phone}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-ink-400 font-mono">
                    {log.executionTimeMs ? `${log.executionTimeMs}ms • ` : ''}
                    {new Date(log.createdAt).toLocaleString('ru-RU')}
                  </div>
                </div>
                <p className="text-ink-700 leading-relaxed font-medium">{log.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DRAWER / MODAL 1: LEAD CARD (Full Business & AI Intelligence)             */}
      {/* ========================================================================= */}
      {selectedLead && (
        <Modal
          open={!!selectedLead}
          onClose={() => setSelectedLead(null)}
          title={`Карточка Лида: ${selectedLead.companyName || 'Компания'}`}
          footer={
            <div className="flex items-center justify-between w-full">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (selectedLead.conversationId) {
                    setBlacklistTarget({ conversationId: selectedLead.conversationId, name: selectedLead.companyName || 'Лид' });
                  }
                }}
                className="text-rose-600 hover:bg-rose-50"
              >
                🚫 В черный список
              </Button>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => setSelectedLead(null)}>
                  Закрыть
                </Button>
                {selectedLead.conversationId && (
                  <Button
                    size="sm"
                    onClick={() => {
                      const convId = selectedLead.conversationId!;
                      setSelectedLead(null);
                      void openConversationInspector(convId);
                    }}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                  >
                    Перейти в диалог
                  </Button>
                )}
              </div>
            </div>
          }
        >
          <div className="space-y-3.5 text-xs">
            {/* Header badges */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-ink-100">
              <div>
                <span className="font-black text-sm text-ink-900 block">{selectedLead.companyName}</span>
                <span className="text-[11px] text-ink-500">
                  {selectedLead.niche} • {selectedLead.city}
                </span>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-black bg-rose-100 text-rose-900 border border-rose-300">
                {selectedLead.score}/100 🔥 {selectedLead.grade}
              </span>
            </div>

            {/* Contacts & Sources */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-xl border border-ink-100 bg-white">
                <span className="text-[10px] text-ink-400 font-bold uppercase tracking-wider block">Контактное лицо:</span>
                <strong className="text-ink-900 mt-0.5 block">{selectedLead.contactName || '—'}</strong>
                <span className="text-[11px] text-ink-500 font-mono">{selectedLead.phone || selectedLead.email}</span>
              </div>
              <div className="p-2.5 rounded-xl border border-ink-100 bg-white">
                <span className="text-[10px] text-ink-400 font-bold uppercase tracking-wider block">Источник & Канал:</span>
                <strong className="text-ink-900 mt-0.5 block">{selectedLead.source}</strong>
                <span className="text-[11px] text-ink-500">{STAGE_CONFIG[selectedLead.stage]?.label || selectedLead.stage}</span>
              </div>
            </div>

            {/* Problem diagnosed */}
            <div className="p-3 rounded-xl bg-rose-50/70 border border-rose-200">
              <span className="text-[10px] font-bold text-rose-900 uppercase tracking-wider block">Диагностированная проблема:</span>
              <p className="text-xs text-rose-950 font-medium mt-1 leading-relaxed">{selectedLead.problem}</p>
            </div>

            {/* Recommended solution */}
            <div className="p-3 rounded-xl bg-purple-50/70 border border-purple-200">
              <span className="text-[10px] font-bold text-purple-900 uppercase tracking-wider block">Рекомендуемое IT-решение:</span>
              <p className="text-xs text-purple-950 font-bold mt-1 leading-relaxed">{selectedLead.recommendedSolution}</p>
            </div>

            {/* Next Action */}
            <div className="p-3 rounded-xl bg-indigo-50/70 border border-indigo-200 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-indigo-900 uppercase tracking-wider block">Следующий шаг:</span>
                <strong className="text-xs text-indigo-950">{selectedLead.nextAction}</strong>
              </div>
              <Button
                size="sm"
                onClick={() => void handleCreateProposal(selectedLead.id, selectedLead.conversationId || undefined)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs"
              >
                Создать КП
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* DRAWER / MODAL 2: CONVERSATION INSPECTOR (Clean, No raw Chain-of-Thought)  */}
      {/* ========================================================================= */}
      {selectedConversationId && (
        <Modal
          open={!!selectedConversationId}
          onClose={() => {
            setSelectedConversationId(null);
            setConversationDetails(null);
          }}
          title={`Диалог с «${conversationDetails?.conversation?.lead?.companyName || 'Клиентом'}» (${conversationDetails?.conversation?.channel || 'Чат'})`}
          footer={
            <div className="flex items-center justify-between w-full flex-wrap gap-2">
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void handleTakeOver(selectedConversationId)}
                  loading={actionLoading}
                  className="bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300 font-bold text-xs"
                >
                  <UserCheck size={13} />
                  <span>Take Over</span>
                </Button>

                {conversationDetails?.conversation?.aiState?.isAiPaused ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void handleToggleAi(selectedConversationId, true)}
                    loading={actionLoading}
                    className="bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border-emerald-300 font-bold text-xs"
                  >
                    <Play size={13} />
                    <span>Resume AI</span>
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void handleToggleAi(selectedConversationId, false)}
                    loading={actionLoading}
                    className="bg-slate-100 hover:bg-slate-200 text-ink-700 border-ink-300 font-bold text-xs"
                  >
                    <Pause size={13} />
                    <span>Pause AI</span>
                  </Button>
                )}

                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void handleCreateProposal(conversationDetails?.conversation?.leadId, selectedConversationId)}
                  loading={actionLoading}
                  className="bg-purple-50 hover:bg-purple-100 text-purple-900 border-purple-300 font-bold text-xs"
                >
                  <FileText size={13} />
                  <span>Create Proposal</span>
                </Button>

                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    setBlacklistTarget({
                      conversationId: selectedConversationId,
                      name: conversationDetails?.conversation?.lead?.companyName || 'Клиент',
                    })
                  }
                  className="text-rose-600 hover:bg-rose-50 border-rose-200 font-bold text-xs"
                >
                  <Ban size={13} />
                  <span>Blacklist</span>
                </Button>
              </div>

              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSelectedConversationId(null);
                  setConversationDetails(null);
                }}
              >
                Закрыть
              </Button>
            </div>
          }
        >
          {loadingConv ? (
            <div className="py-16 text-center text-xs text-ink-400">Загрузка структуры диалога и памяти AI…</div>
          ) : conversationDetails ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs max-h-[70vh] overflow-y-auto pr-1">
              {/* Left 2 Cols: Message Stream */}
              <div className="md:col-span-2 space-y-3 flex flex-col justify-between">
                <div className="space-y-2 max-h-96 overflow-y-auto p-3 bg-slate-100/70 rounded-2xl border border-ink-200">
                  {conversationDetails.conversation?.messages?.length > 0 ? (
                    conversationDetails.conversation.messages.map((m: any) => {
                      const isOut = m.direction === 'OUTBOUND';
                      return (
                        <div key={m.id} className={clsx('flex', isOut ? 'justify-end' : 'justify-start')}>
                          <div
                            className={clsx(
                              'max-w-[80%] rounded-2xl px-3.5 py-2 text-xs shadow-2xs',
                              isOut
                                ? 'bg-indigo-600 text-white rounded-br-sm'
                                : 'bg-white text-ink-900 border border-ink-200 rounded-bl-sm',
                            )}
                          >
                            <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
                            <div
                              className={clsx(
                                'text-[9px] mt-1 text-right',
                                isOut ? 'text-indigo-200' : 'text-ink-400',
                              )}
                            >
                              {new Date(m.recordedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-8 text-center text-xs text-ink-400">Сообщений пока нет</div>
                  )}
                </div>

                {/* Send message form */}
                <form onSubmit={handleSendMessage} className="flex gap-2">
                  <input
                    type="text"
                    value={replyDraft}
                    onChange={(e) => setReplyDraft(e.target.value)}
                    placeholder="Написать сообщение клиенту…"
                    disabled={sendingMsg}
                    className="flex-1 rounded-xl border border-ink-200 bg-ink-50 px-3.5 py-2 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    loading={sendingMsg}
                    disabled={!replyDraft.trim()}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                  >
                    <Send size={13} />
                    <span>Отправить</span>
                  </Button>
                </form>
              </div>

              {/* Right 1 Col: Structured AI Reasoning & Extracted Facts (No Raw Chain-of-Thought!) */}
              <div className="space-y-3">
                {/* 1. Current Stage & Stage Switcher */}
                <div className="p-3 bg-white rounded-2xl border border-ink-200 shadow-2xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-ink-500 uppercase tracking-wider">Текущая стадия:</span>
                    <span
                      className={clsx(
                        'px-2 py-0.5 rounded text-[10px] font-black',
                        STAGE_CONFIG[conversationDetails.conversation?.aiState?.stage]?.badge,
                      )}
                    >
                      {STAGE_CONFIG[conversationDetails.conversation?.aiState?.stage]?.label ||
                        conversationDetails.conversation?.aiState?.stage ||
                        'NEW'}
                    </span>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-ink-400 block mb-1">Сменить стадию:</label>
                    <select
                      value={conversationDetails.conversation?.aiState?.stage || 'NEW'}
                      onChange={(e) => void handleChangeStage(selectedConversationId, e.target.value)}
                      className="w-full rounded-xl border border-ink-200 bg-slate-50 p-1.5 text-xs font-bold text-ink-800"
                    >
                      {Object.keys(STAGE_CONFIG).map((k) => (
                        <option key={k} value={k}>
                          {STAGE_CONFIG[k].label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* 2. Structured AI Reasoning Summary */}
                <div className="p-3 bg-gradient-to-br from-purple-50 to-indigo-50/50 rounded-2xl border border-purple-200 shadow-2xs space-y-2">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-purple-900">
                    <Bot size={14} className="text-purple-600" />
                    <span>AI Reasoning Summary</span>
                  </div>

                  <p className="text-xs text-purple-950 font-medium leading-relaxed bg-white/80 p-2.5 rounded-xl border border-purple-100">
                    {conversationDetails.state?.consultativePhase
                      ? `Фаза: ${conversationDetails.state.consultativePhase}. Диагностика потребностей завершена. Сформирован оффер на разработку веб-модуля.`
                      : 'AI ведет консультативный диалог, выявляет лиц принимающих решения и технические ограничения проекта.'}
                  </p>
                </div>

                {/* 3. Extracted Facts (8-Layer Memory) */}
                <div className="p-3 bg-white rounded-2xl border border-ink-200 shadow-2xs space-y-2">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-ink-900 uppercase tracking-wider">
                    <Layers size={13} className="text-indigo-600" />
                    <span>Extracted Facts (BANT):</span>
                  </div>

                  <div className="space-y-1 text-xs">
                    <div className="p-1.5 rounded-lg bg-slate-50 border border-ink-100 flex items-center justify-between">
                      <span className="text-[10px] text-ink-500">Бюджет:</span>
                      <strong className="text-ink-900">
                        {conversationDetails.conversation?.lead?.estimatedBudget
                          ? `${conversationDetails.conversation.lead.estimatedBudget.toLocaleString()} ₽`
                          : 'В процессе уточнения'}
                      </strong>
                    </div>
                    <div className="p-1.5 rounded-lg bg-slate-50 border border-ink-100 flex items-center justify-between">
                      <span className="text-[10px] text-ink-500">ЛПР:</span>
                      <strong className="text-ink-900">
                        {conversationDetails.conversation?.lead?.isDecisionMaker ? 'Да (Руководитель)' : 'Уточняется'}
                      </strong>
                    </div>
                    <div className="p-1.5 rounded-lg bg-slate-50 border border-ink-100 flex items-center justify-between">
                      <span className="text-[10px] text-ink-500">Срочность:</span>
                      <strong className="text-rose-700">Высокая (до 30 дней)</strong>
                    </div>
                  </div>
                </div>

                {/* 4. Proposed Next Action */}
                <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200 space-y-1">
                  <span className="text-[10px] font-bold text-emerald-900 uppercase tracking-wider block">
                    Proposed Next Action:
                  </span>
                  <p className="text-xs text-emerald-950 font-bold">
                    Презентовать коммерческое предложение и согласовать созвон в Zoom.
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: PROPOSAL VIEWER & PDF EXPORT                                     */}
      {/* ========================================================================= */}
      {selectedProposal && (
        <Modal
          open={!!selectedProposal}
          onClose={() => setSelectedProposal(null)}
          title={`Коммерческое предложение: ${selectedProposal.title}`}
          footer={
            <div className="flex items-center justify-between w-full">
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      `# ${selectedProposal.title}\n\n${selectedProposal.summary}\n\nСмета: ${selectedProposal.priceEstimateMin} - ${selectedProposal.priceEstimateMax} ${selectedProposal.currency}\nСрок: ${selectedProposal.timelineWeeks} нед.`,
                    );
                    toast('Текст КП скопирован в буфер обмена!', 'success');
                  } catch {
                    toast('Ошибка копирования', 'danger');
                  }
                }}
              >
                <Copy size={13} />
                <span>Скопировать Markdown</span>
              </Button>

              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => setSelectedProposal(null)}>
                  Закрыть
                </Button>
                <a
                  href={`/api/ai/proposals/${selectedProposal.id}/html`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs"
                >
                  <ExternalLink size={13} />
                  <span>Открыть PDF / Печать</span>
                </a>
              </div>
            </div>
          }
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-purple-50 rounded-xl border border-purple-200 flex items-center justify-between">
              <div>
                <span className="font-bold text-xs text-purple-900 block">{selectedProposal.serviceType}</span>
                <span className="text-[11px] text-purple-700">🏢 {selectedProposal.lead?.companyName}</span>
              </div>
              <span className="text-sm font-black text-purple-950 font-mono">
                {selectedProposal.priceEstimateMin.toLocaleString()} – {selectedProposal.priceEstimateMax.toLocaleString()}{' '}
                {selectedProposal.currency}
              </span>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-ink-100">
              <h5 className="font-bold text-xs text-ink-900 mb-1">Резюме проекта:</h5>
              <p className="text-xs text-ink-700 leading-relaxed">{selectedProposal.summary}</p>
            </div>

            {selectedProposal.deliverables && selectedProposal.deliverables.length > 0 && (
              <div className="p-3 bg-white rounded-xl border border-ink-200 space-y-1.5">
                <h5 className="font-bold text-xs text-ink-900">Состав работ и результаты (Deliverables):</h5>
                <ul className="list-disc list-inside space-y-1 text-ink-700">
                  {selectedProposal.deliverables.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: BUSINESS ANALYSIS DETAILS                                        */}
      {/* ========================================================================= */}
      {selectedAnalysis && (
        <Modal
          open={!!selectedAnalysis}
          onClose={() => setSelectedAnalysis(null)}
          title={`Цифровой Аудит: ${selectedAnalysis.lead?.companyName || 'Компания'}`}
          footer={
            <Button variant="secondary" size="sm" onClick={() => setSelectedAnalysis(null)}>
              Закрыть
            </Button>
          }
        >
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-3 gap-2">
              <div className="p-3 rounded-xl bg-slate-50 border border-ink-100 text-center">
                <span className="text-[10px] text-ink-400 block">PageSpeed</span>
                <strong className="text-sm font-black text-ink-900">
                  {selectedAnalysis.pageLoadSpeedMs ? `${selectedAnalysis.pageLoadSpeedMs} мс` : '—'}
                </strong>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-ink-100 text-center">
                <span className="text-[10px] text-ink-400 block">SEO Оценка</span>
                <strong className="text-sm font-black text-purple-700">
                  {selectedAnalysis.seoScore ? `${selectedAnalysis.seoScore}/100` : '—'}
                </strong>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-ink-100 text-center">
                <span className="text-[10px] text-ink-400 block">Мобильная версия</span>
                <strong
                  className={clsx(
                    'text-sm font-black',
                    selectedAnalysis.isMobileFriendly ? 'text-emerald-600' : 'text-rose-600',
                  )}
                >
                  {selectedAnalysis.isMobileFriendly ? 'Адаптивно' : 'Критично'}
                </strong>
              </div>
            </div>

            {selectedAnalysis.detectedGaps && selectedAnalysis.detectedGaps.length > 0 && (
              <div className="p-3 bg-rose-50/70 rounded-xl border border-rose-200 space-y-1.5">
                <h5 className="font-bold text-xs text-rose-900 uppercase tracking-wider">Выявленные разрывы:</h5>
                <ul className="list-disc list-inside space-y-1 text-rose-950 font-medium">
                  {selectedAnalysis.detectedGaps.map((gap, i) => (
                    <li key={i}>{gap}</li>
                  ))}
                </ul>
              </div>
            )}

            {selectedAnalysis.summary && (
              <div className="p-3 bg-purple-50 rounded-xl border border-purple-200">
                <h5 className="font-bold text-xs text-purple-900 uppercase tracking-wider mb-1">
                  Предлагаемое решение Nexora:
                </h5>
                <p className="text-purple-950 leading-relaxed font-bold">{selectedAnalysis.summary}</p>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: BLACKLIST CONFIRMATION                                           */}
      {/* ========================================================================= */}
      {blacklistTarget && (
        <Confirm
          open={!!blacklistTarget}
          onClose={() => setBlacklistTarget(null)}
          onConfirm={() => void handleConfirmBlacklist()}
          busy={actionLoading}
          title="Внести лид в черный список (Blacklist)?"
          message={`Контакт «${blacklistTarget.name}» будет добавлен в Suppression List. AI Sales Agent и все последующие рассылки/фоллоу-апы будут остановлены.`}
        />
      )}
    </div>
  );
}
