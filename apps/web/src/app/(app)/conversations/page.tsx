'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  Send,
  Search,
  RefreshCw,
  RotateCw,
  CheckCheck,
  Check,
  Plus,
  MessageSquarePlus,
  X,
  Phone,
  User,
  ChevronLeft,
  ChevronRight,
  Filter,
  Flame,
  MessageCircle,
  Inbox,
  Clock,
  CheckCircle,
  Mail,
  MailOpen,
  Bell,
  Sparkles,
  ExternalLink,
  Tag as TagIcon,
  FolderPlus,
  Folder,
  Edit3,
  Save,
  SlidersHorizontal,
  Layers,
  ChevronDown,
  Briefcase,
  DollarSign,
  AlertCircle,
  Eye,
  CheckCircle2,
  Bot,
  Zap,
  Copy,
  FileText,
  ShieldCheck,
  ShieldAlert,
  UserCheck,
  Radio,
  ToggleLeft,
  ToggleRight,
  PauseCircle,
  PlayCircle,
  Image as ImageIcon,
  Paperclip,
  Mic,
  Video as VideoIcon,
} from 'lucide-react';
import type {
  Conversation,
  AccountSummary,
  SolutionBuilderResult,
  NegotiationEngineResult,
  FollowUpEnginePlanResult,
  PlannedFollowUpItem,
  PreFlightValidationResult,
} from '@nexora/types';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { useSocket } from '@/lib/auth';
import { get, post, put, patch, del } from '@/lib/api';

interface TagItem {
  id: string;
  name: string;
  color: string;
}

interface CampaignItem {
  id: string;
  name: string;
}

interface RowLead {
  id: string;
  companyName: string | null;
  phone: string | null;
  email?: string | null;
  whatsappUrl: string | null;
  instagramUrl?: string | null;
  instagramUsername?: string | null;
  instagramId?: string | null;
  telegram?: string | null;
  telegramUsername?: string | null;
  telegramChatId?: string | null;
  telegramUrl?: string | null;
  website?: string | null;
  city?: string | null;
  niche?: string | null;
  notes?: string | null;
  status: string;
  tags?: Array<{ tag: TagItem }>;
  campaigns?: Array<{ campaign: CampaignItem }>;
  businessAnalysis?: any;
}

interface MessageEventItem {
  id: string;
  type: 'MESSAGE_CREATED' | 'MESSAGE_SENT' | 'MESSAGE_DELIVERED' | 'MESSAGE_READ' | 'MESSAGE_FAILED' | 'MESSAGE_RECEIVED';
  at: Date | string;
}

interface Message {
  id: string;
  conversationId: string;
  direction: 'INBOUND' | 'OUTBOUND';
  body: string;
  provenance: 'TRACKED' | 'MANUAL' | 'UNAVAILABLE';
  recordedAt: Date | string;
  events?: MessageEventItem[];
  emailMeta?: {
    id?: string;
    subject?: string | null;
    emailSubject?: string | null;
    fromAddress?: string;
    toAddress?: string;
    rfcMessageId?: string | null;
    openCount: number;
    openedAt?: string | null;
    clickCount: number;
    clickedAt?: string | null;
    isPersonalized?: boolean;
  } | null;
}

interface RowConversation extends Conversation {
  lead: RowLead;
  account?: { id: string; name: string; phoneMasked: string } | null;
  instagramAccount?: { id: string; name: string; username: string; status: string; aiExecutionMode?: string } | null;
  telegramBot?: { id: string; name: string; username: string; status: string; aiExecutionMode?: string } | null;
  emailAccount?: { id: string; name: string; emailAddress: string; status: string; aiExecutionMode?: string; provider?: string } | null;
  messages?: Message[];
}

interface Thread extends Conversation {
  lead: RowLead;
  account?: { id: string; name: string; phoneMasked: string } | null;
  instagramAccount?: { id: string; name: string; username: string; status: string; aiExecutionMode?: string } | null;
  telegramBot?: { id: string; name: string; username: string; status: string; aiExecutionMode?: string } | null;
  emailAccount?: { id: string; name: string; emailAddress: string; status: string; aiExecutionMode?: string; provider?: string } | null;
  messages: Message[];
}

interface ConversationPaged {
  items: RowConversation[];
  total: number;
  page: number;
  totalPages: number;
  counts?: {
    all: number;
    unread: number;
    replied: number;
    new: number;
    noResponse: number;
    clients: number;
    interested: number;
    negotiation: number;
  };
}

const FILTER_TABS = [
  { value: 'UNREAD', label: '🔥 Непрочитанные', countKey: 'unread' as const, badgeColor: 'bg-emerald-500 text-white' },
  { value: 'ALL', label: 'Все диалоги', countKey: 'all' as const },
  { value: 'INTERESTED', label: '🔥 Горячие', countKey: 'interested' as const, badgeColor: 'bg-amber-500 text-white' },
  { value: 'NEGOTIATION', label: '🤝 Переговоры', countKey: 'negotiation' as const, badgeColor: 'bg-indigo-500 text-white' },
  { value: 'CLIENTS', label: '💼 Клиенты', countKey: 'clients' as const, badgeColor: 'bg-purple-500 text-white' },
  { value: 'REPLIED', label: 'Ответили', countKey: 'replied' as const, badgeColor: 'bg-sky-500 text-white' },
  { value: 'NEW', label: 'Новые', countKey: 'new' as const, badgeColor: 'bg-slate-200 text-slate-700' },
];

const PRESET_COLORS = [
  '#EF4444', // Red
  '#F97316', // Orange
  '#F59E0B', // Amber
  '#10B981', // Emerald
  '#06B6D4', // Cyan
  '#3B82F6', // Blue
  '#6366F1', // Indigo
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#64748B', // Slate
];

const statusRu = (s: string) => {
  const map: Record<string, string> = {
    NEW: 'Новый',
    CONTACTED: 'Контакт',
    REPLIED: 'Ответил',
    INTERESTED: 'Интерес',
    NEGOTIATION: 'Переговоры',
    CLIENT: 'Клиент',
    NO_RESPONSE: 'Нет ответа',
  };
  return map[s] || s;
};

export default function ConversationsPage() {
  const { toast } = useToast();
  const socket = useSocket();
  const [items, setItems] = useState<RowConversation[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(40);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [filter, setFilter] = useState('ALL');
  const [channelFilter, setChannelFilter] = useState<'ALL' | 'WHATSAPP' | 'INSTAGRAM' | 'TELEGRAM' | 'EMAIL'>('ALL');
  const [account, setAccount] = useState('');
  const [selectedTagFilter, setSelectedTagFilter] = useState('');
  const [selectedCampaignFilter, setSelectedCampaignFilter] = useState('');
  const [search, setSearch] = useState('');
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [allTags, setAllTags] = useState<TagItem[]>([]);
  const [allCampaigns, setAllCampaigns] = useState<CampaignItem[]>([]);
  const [thread, setThread] = useState<Thread | null>(null);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [loadingPersonalizedDraft, setLoadingPersonalizedDraft] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Side Drawer state for Lead Info
  const [showLeadDrawer, setShowLeadDrawer] = useState(true);
  const [leadNotes, setLeadNotes] = useState('');
  const [leadCompanyName, setLeadCompanyName] = useState('');
  const [leadPhone, setLeadPhone] = useState('');
  const [leadCity, setLeadCity] = useState('');
  const [leadNiche, setLeadNiche] = useState('');
  const [isSavingLead, setIsSavingLead] = useState(false);

  // Create New Tag Modal
  const [showCreateTagModal, setShowCreateTagModal] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#10B981');
  const [isCreatingTag, setIsCreatingTag] = useState(false);

  // Create New Campaign Modal
  const [showCreateCampaignModal, setShowCreateCampaignModal] = useState(false);
  const [newCampaignName, setNewCampaignName] = useState('');
  const [isCreatingCampaign, setIsCreatingCampaign] = useState(false);

  // New Dialog Modal
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newDialogAccount, setNewDialogAccount] = useState('');
  const [newDialogInput, setNewDialogInput] = useState('');
  const [creatingDialog, setCreatingDialog] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const [counts, setCounts] = useState({
    all: 0,
    unread: 0,
    replied: 0,
    new: 0,
    noResponse: 0,
    clients: 0,
    interested: 0,
    negotiation: 0,
  });

  // AI Sales Copilot state
  const [aiData, setAiData] = useState<{
    lead?: any;
    aiState?: any;
    suggestions?: Array<{ id: string; type: string; title: string; text: string; rationale: string }>;
    proposals?: any[];
    memoryFacts?: any[];
  } | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [aiConfig, setAiConfig] = useState<any>(null);
  const [proposalModalOpen, setProposalModalOpen] = useState(false);
  const [activeProposal, setActiveProposal] = useState<any>(null);
  const [isGeneratingProposal, setIsGeneratingProposal] = useState(false);
  const [proposalTab, setProposalTab] = useState<'WHATSAPP' | 'EXTENDED' | 'PDF' | 'VERIFICATION'>('WHATSAPP');

  // Solution Builder State
  const [solutionResult, setSolutionResult] = useState<SolutionBuilderResult | null>(null);
  const [isBuildingSolution, setIsBuildingSolution] = useState(false);
  const [isApplyingSolution, setIsApplyingSolution] = useState(false);
  const [solutionModalOpen, setSolutionModalOpen] = useState(false);

  // Negotiation Engine State
  const [loadingObjection, setLoadingObjection] = useState<string | null>(null);
  const [negotiationResult, setNegotiationResult] = useState<NegotiationEngineResult | null>(null);

  // Follow-Up Engine State
  const [followUpPlan, setFollowUpPlan] = useState<FollowUpEnginePlanResult | null>(null);
  const [isPlanningFollowUp, setIsPlanningFollowUp] = useState(false);
  const [isExecutingFollowUp, setIsExecutingFollowUp] = useState(false);
  const [followUpModalOpen, setFollowUpModalOpen] = useState(false);

  // Pre-Flight Guardrails & Per-Conversation AI State
  const [preFlightModalOpen, setPreFlightModalOpen] = useState(false);
  const [preFlightResult, setPreFlightResult] = useState<PreFlightValidationResult | null>(null);
  const [loadingPreFlight, setLoadingPreFlight] = useState(false);
  const [togglingAi, setTogglingAi] = useState(false);

  const toggleConversationAi = async (enabled: boolean, reason?: string) => {
    if (!thread) return;
    setTogglingAi(true);
    try {
      const res = await post<{ isAiPaused: boolean; pausedReason?: string }>(
        `/api/ai/conversations/${thread.id}/toggle-ai`,
        { enabled, reason },
      );
      toast(
        res.isAiPaused
          ? '⏸️ AI Sales Agent отключен для этого диалога'
          : '⚡ AI Sales Agent включен для этого диалога',
        'info',
      );
      await loadAiCopilot(thread.id);
      void load();
    } catch (err: any) {
      toast(err.message || 'Ошибка переключения AI', 'error');
    } finally {
      setTogglingAi(false);
    }
  };

  const handleTakeover = async () => {
    if (!thread) return;
    setTogglingAi(true);
    try {
      await post(`/api/ai/conversations/${thread.id}/takeover`, { managerName: 'Менеджер' });
      toast('👤 Вы перехватили управление диалогом. AI приостановлен.', 'success');
      await loadAiCopilot(thread.id);
      void load();
    } catch (err: any) {
      toast(err.message || 'Ошибка перехвата диалога', 'error');
    } finally {
      setTogglingAi(false);
    }
  };

  const handleHandback = async () => {
    if (!thread) return;
    setTogglingAi(true);
    try {
      await post(`/api/ai/conversations/${thread.id}/handback`, {});
      toast('🤝 Управление диалогом возвращено AI Sales Agent', 'success');
      await loadAiCopilot(thread.id);
      void load();
    } catch (err: any) {
      toast(err.message || 'Ошибка передачи диалога', 'error');
    } finally {
      setTogglingAi(false);
    }
  };

  const checkPreFlight = async () => {
    if (!thread) return;
    setLoadingPreFlight(true);
    setPreFlightModalOpen(true);
    try {
      const res = await get<PreFlightValidationResult>(
        `/api/ai/conversations/${thread.id}/pre-flight-status?text=${encodeURIComponent(draft || 'Здравствуйте! Готовы обсудить проект.')}`,
      );
      setPreFlightResult(res);
    } catch (err: any) {
      toast(err.message || 'Ошибка проверки Pre-Flight', 'error');
    } finally {
      setLoadingPreFlight(false);
    }
  };

  const handleManualApproval = async (action: 'APPROVE_AND_SEND' | 'REJECT' | 'EDIT_AND_SEND', editedText?: string) => {
    if (!thread) return;
    try {
      const res = await post<any>(`/api/instagram/conversations/${thread.id}/manual-approval`, {
        action,
        editedText,
      });
      toast(
        action === 'APPROVE_AND_SEND'
          ? '✅ AI ответ одобрен и отправлен в Instagram Direct!'
          : action === 'EDIT_AND_SEND'
          ? '✏️ Ответ отредактирован и отправлен в Instagram Direct!'
          : '❌ Предложенный AI ответ отклонён',
        'success',
      );
      await loadAiCopilot(thread.id);
      void load();
      if (action === 'APPROVE_AND_SEND' || action === 'EDIT_AND_SEND') {
        const updated = await get<Thread>(`/api/conversations/${thread.id}`);
        setThread(updated);
      }
    } catch (err: any) {
      toast(err.message || 'Ошибка обработки подтверждения', 'error');
    }
  };

  const handleToggleChannelMode = async (mode: 'AUTOMATIC_REPLIES' | 'MANUAL_APPROVAL' | 'FULL_AUTONOMY' | 'PAUSED' | 'HUMAN_HANDOFF') => {
    if (!thread) return;
    setTogglingAi(true);
    try {
      const endpoint = thread.channel === 'TELEGRAM'
        ? `/api/telegram/conversations/${thread.id}/toggle-mode`
        : `/api/instagram/conversations/${thread.id}/toggle-mode`;
      await post<any>(endpoint, { mode });
      toast(`⚙️ Режим AI изменён на «${mode}»`, 'success');
      await loadAiCopilot(thread.id);
      void load();
    } catch (err: any) {
      toast(err.message || 'Ошибка смены режима', 'error');
    } finally {
      setTogglingAi(false);
    }
  };

  const handleToggleIgMode = handleToggleChannelMode;

  const loadAiCopilot = useCallback(async (convId: string) => {
    try {
      setLoadingAi(true);
      const [copilotRes, cfgRes] = await Promise.all([
        get<any>(`/api/ai/conversations/${convId}/copilot`).catch(() => null),
        get<any>('/api/ai/config').catch(() => null),
      ]);
      setAiData(copilotRes);
      setAiConfig(cfgRes);
    } catch {
      /* ignore */
    } finally {
      setLoadingAi(false);
    }
  }, []);

  const threadRef = useRef<HTMLDivElement>(null);

  // Load Tags & Campaigns
  const loadMetadata = useCallback(async () => {
    try {
      const [tagsRes, campaignsRes] = await Promise.all([
        get<{ items: TagItem[] }>('/api/tags').catch(() => ({ items: [] })),
        get<{ items: Array<{ campaign?: CampaignItem } | CampaignItem> }>('/api/campaigns').catch(() => ({ items: [] })),
      ]);
      setAllTags(tagsRes.items || []);
      const rawList = campaignsRes.items || [];
      const parsed: CampaignItem[] = rawList
        .map((item: any) => {
          if (item?.campaign?.id) return { id: String(item.campaign.id), name: String(item.campaign.name) };
          if (item?.id) return { id: String(item.id), name: String(item.name) };
          return null;
        })
        .filter((c): c is CampaignItem => Boolean(c && c.id));

      const unique = Array.from(new Map(parsed.map((c) => [c.id, c])).values());
      setAllCampaigns(unique);
    } catch {
      /* ignore */
    }
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      for (const acc of accounts) {
        await post(`/api/wa/${acc.id}/sync`).catch(() => undefined);
      }
      toast('Синхронизация чатов из WhatsApp запущена…', 'info');
      setTimeout(() => void load(), 2000);
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setTimeout(() => setSyncing(false), 1000);
    }
  };

  const load = useCallback(async () => {
    try {
      const q: Record<string, string | number> = { page, pageSize };
      if (filter !== 'ALL') q.filter = filter;
      if (channelFilter !== 'ALL') q.channel = channelFilter;
      if (account) q.account = account;
      if (selectedTagFilter) q.tag = selectedTagFilter;
      if (selectedCampaignFilter) q.campaign = selectedCampaignFilter;
      if (search.trim()) q.search = search.trim();
      const res = await get<ConversationPaged>('/api/conversations', q);
      setItems(res.items || []);
      setTotal(res.total || 0);
      setTotalPages(res.totalPages || 1);
      if (res.counts) {
        setCounts({
          all: res.counts.all || 0,
          unread: res.counts.unread || 0,
          replied: res.counts.replied || 0,
          new: res.counts.new || 0,
          noResponse: res.counts.noResponse || 0,
          clients: res.counts.clients || 0,
          interested: res.counts.interested || 0,
          negotiation: res.counts.negotiation || 0,
        });
      }
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [page, pageSize, filter, channelFilter, account, selectedTagFilter, selectedCampaignFilter, search]);

  const openThread = useCallback(
    async (id: string, autoMarkRead = true) => {
      try {
        const res = await get<Thread>(`/api/conversations/${id}`);
        setThread(res);
        setLeadNotes(res.lead?.notes || '');
        setLeadCompanyName(res.lead?.companyName || '');
        setLeadPhone(res.lead?.phone || '');
        setLeadCity(res.lead?.city || '');
        setLeadNiche(res.lead?.niche || '');

        if (autoMarkRead && res.unreadCount > 0) {
          await patch(`/api/conversations/${id}`, { markRead: true });
          setItems((prev) =>
            prev.map((c) => (c.id === id ? { ...c, unreadCount: 0, status: c.status === 'UNREAD' ? 'REPLIED' : c.status } : c)),
          );
          setCounts((prev) => ({ ...prev, unread: Math.max(0, prev.unread - 1) }));
        }
      } catch (err) {
        toast((err as Error).message, 'error');
      }
    },
    [toast],
  );

  // Mark conversation read / unread
  const markConversationAsUnread = async (convId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await patch(`/api/conversations/${convId}`, { markUnread: true });
      setItems((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, unreadCount: 1, status: 'UNREAD' } : c)),
      );
      setCounts((prev) => ({ ...prev, unread: prev.unread + 1 }));
      if (thread?.id === convId) {
        setThread((prev) => prev ? { ...prev, unreadCount: 1, status: 'UNREAD' } : null);
      }
      toast('Диалог помечен как непрочитанный вами', 'info');
      void load();
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  const markConversationAsRead = async (convId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await patch(`/api/conversations/${convId}`, { markRead: true });
      setItems((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, unreadCount: 0 } : c)),
      );
      setCounts((prev) => ({ ...prev, unread: Math.max(0, prev.unread - 1) }));
      if (thread?.id === convId) {
        setThread((prev) => prev ? { ...prev, unreadCount: 0 } : null);
      }
      toast('Диалог помечен как прочитанный вами', 'success');
      void load();
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  const markAllAsRead = async () => {
    if (counts.unread === 0) return;
    setMarkingAll(true);
    try {
      await post('/api/conversations/mark-all-read', { accountId: account || undefined });
      toast('Все сообщения отмечены прочитанными', 'success');
      void load();
      if (thread) {
        setThread((prev) => prev ? { ...prev, unreadCount: 0 } : null);
      }
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setMarkingAll(false);
    }
  };

  // Lead CRM: Update status, notes, tags, campaigns
  const updateLeadStatus = async (status: string) => {
    if (!thread) return;
    setIsSavingLead(true);
    try {
      const res = await patch<Thread>(`/api/conversations/${thread.id}/lead`, { status });
      setThread(res);
      setItems((prev) =>
        prev.map((c) => (c.id === thread.id ? { ...c, status: res.status as any, lead: res.lead } : c)),
      );
      toast(`Статус лида изменен на «${statusRu(status)}»`, 'success');
      void load();
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setIsSavingLead(false);
    }
  };

  const saveLeadDetails = async () => {
    if (!thread) return;
    setIsSavingLead(true);
    try {
      const res = await patch<Thread>(`/api/conversations/${thread.id}/lead`, {
        companyName: leadCompanyName,
        phone: leadPhone,
        notes: leadNotes,
        city: leadCity,
        niche: leadNiche,
      });
      setThread(res);
      setItems((prev) =>
        prev.map((c) => (c.id === thread.id ? { ...c, lead: res.lead } : c)),
      );
      toast('Данные лида и заметки сохранены', 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setIsSavingLead(false);
    }
  };

  const toggleLeadTag = async (tagId: string, isAttached: boolean) => {
    if (!thread) return;
    try {
      const res = await patch<Thread>(`/api/conversations/${thread.id}/lead`, {
        ...(isAttached ? { removeTagId: tagId } : { addTagId: tagId }),
      });
      setThread(res);
      setItems((prev) =>
        prev.map((c) => (c.id === thread.id ? { ...c, lead: res.lead } : c)),
      );
      toast(isAttached ? 'Метка снята' : 'Метка добавлена', 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  const toggleLeadCampaign = async (campaignId: string, isAttached: boolean) => {
    if (!thread) return;
    try {
      const res = await patch<Thread>(`/api/conversations/${thread.id}/lead`, {
        ...(isAttached ? { removeCampaignId: campaignId } : { addCampaignId: campaignId }),
      });
      setThread(res);
      setItems((prev) =>
        prev.map((c) => (c.id === thread.id ? { ...c, lead: res.lead } : c)),
      );
      toast(isAttached ? 'Удалено из списка' : 'Добавлено в список', 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  const handleCreateTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTagName.trim()) return;
    setIsCreatingTag(true);
    try {
      const created = await post<TagItem>('/api/tags', {
        name: newTagName.trim(),
        color: newTagColor,
      });
      setAllTags((prev) => (prev.some((t) => t.id === created.id) ? prev : [...prev, created]));
      if (thread) {
        await toggleLeadTag(created.id, false);
      }
      setNewTagName('');
      setShowCreateTagModal(false);
      toast(`Метка «${created.name}» создана`, 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setIsCreatingTag(false);
    }
  };

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCampaignName.trim()) return;
    setIsCreatingCampaign(true);
    try {
      const res = await post<any>('/api/campaigns', {
        name: newCampaignName.trim(),
      });
      const created: CampaignItem = res?.campaign
        ? { id: String(res.campaign.id), name: String(res.campaign.name) }
        : { id: String(res?.id || ''), name: String(res?.name || '') };

      if (created.id) {
        setAllCampaigns((prev) => (prev.some((c) => c.id === created.id) ? prev : [...prev, created]));
        if (thread) {
          await toggleLeadCampaign(created.id, false);
        }
      }
      setNewCampaignName('');
      setShowCreateCampaignModal(false);
      toast(`Список «${created.name}» создан`, 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setIsCreatingCampaign(false);
    }
  };

  useEffect(() => {
    void load();
    void loadMetadata();
    void get<{ items: AccountSummary[] }>('/api/accounts')
      .then((r) => {
        setAccounts(r.items || []);
        if (r.items?.[0] && !newDialogAccount) {
          setNewDialogAccount(r.items[0].id);
        }
      })
      .catch(() => setAccounts([]));
  }, [load, loadMetadata, newDialogAccount]);

  const threadIdRef = useRef<string | null>(null);
  useEffect(() => {
    threadIdRef.current = thread?.id ?? null;
    if (thread?.id) {
      void loadAiCopilot(thread.id);
    } else {
      setAiData(null);
    }
  }, [thread?.id, loadAiCopilot]);

  useEffect(() => {
    if (!socket) return;

    let debounceTimer: NodeJS.Timeout | null = null;
    const triggerDebouncedLoad = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void load();
      }, 350);
    };

    const onConv = (c: RowConversation) => {
      setItems((prev) => (prev.some((p) => p.id === c.id) ? prev : [c, ...prev]));
      triggerDebouncedLoad();
    };

    const onMsg = (msg?: { conversationId?: string; conversation?: { id?: string } }) => {
      const convId = msg?.conversationId || msg?.conversation?.id;
      triggerDebouncedLoad();
      if (convId && threadIdRef.current === convId) {
        void get<Thread>(`/api/conversations/${convId}`)
          .then((r) => {
            setThread(r);
            setLeadNotes(r.lead?.notes || '');
          })
          .catch(() => undefined);
      }
    };

    socket.on('conversation.created', onConv);
    socket.on('conversation.updated', onMsg);
    socket.on('message.created', onMsg);
    socket.on('message.updated', onMsg);

    return () => {
      socket.off('conversation.created', onConv);
      socket.off('conversation.updated', onMsg);
      socket.off('message.created', onMsg);
      socket.off('message.updated', onMsg);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [socket, load]);

  useEffect(() => {
    if (thread && threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [thread]);

  const handleCreateNewDialog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDialogAccount || !newDialogInput.trim()) return;
    setCreatingDialog(true);
    try {
      const created = await post<Thread>('/api/conversations/open-by-phone', {
        accountId: newDialogAccount,
        input: newDialogInput.trim(),
      });
      toast('Диалог открыт', 'success');
      setNewDialogInput('');
      setShowNewDialog(false);
      await load();
      setThread(created);
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setCreatingDialog(false);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!thread || !draft.trim()) return;
    setSending(true);
    try {
      const body = draft.trim();
      if (thread.channel === 'EMAIL') {
        const emailAccId = thread.emailAccount?.id || thread.accountId;
        const res = await post<{ success: boolean; data: any }>('/api/email/send', {
          conversationId: thread.id,
          emailAccountId: emailAccId,
          to: thread.lead.email || thread.lead.phone || '',
          subject: emailSubject.trim() || `Предложение по сотрудничеству для ${thread.lead.companyName || ''}`,
          bodyText: body,
        });
        if (res.data?.messageId) {
          toast('✉️ Письмо успешно отправлено!', 'success');
        }
        await openThread(thread.id);
        setDraft('');
        setEmailSubject('');
        await load();
      } else if (thread.channel === 'TELEGRAM') {
        const res = await post<{ success: boolean; message: Message; conversation: Thread }>('/api/telegram/send', {
          conversationId: thread.id,
          text: body,
        });
        setThread(res.conversation);
        setDraft('');
        await load();
      } else if (thread.channel === 'INSTAGRAM') {
        const res = await post<{ success: boolean; message: Message; conversation: Thread }>('/api/instagram/send', {
          conversationId: thread.id,
          text: body,
        });
        setThread(res.conversation);
        setDraft('');
        await load();
      } else {
        try {
          const gw = await post<{ message: Message; conversation: Thread }>('/api/messages/send', {
            conversationId: thread.id,
            body,
          });
          setThread(gw.conversation);
          setDraft('');
          await load();
        } catch (err) {
          const e = err as { code?: string };
          if (e.code === 'GATEWAY_NOT_CONNECTED' || e.code === 'LEAD_NO_PHONE') {
            const res = await post<{ message: Message; conversation: Thread }>('/api/messages', {
              conversationId: thread.id,
              body,
              direction: 'OUTBOUND',
              provenance: 'MANUAL',
            });
            setThread(res.conversation);
            setDraft('');
            await load();
          } else {
            throw err;
          }
        }
      }
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setSending(false);
    }
  };

  const handleGeneratePersonalizedDraft = async () => {
    if (!thread?.lead?.id) return;
    setLoadingPersonalizedDraft(true);
    try {
      const res = await post<{ success: boolean; data: { subject: string; bodyText: string } }>(
        '/api/email/personalize-preview',
        { leadId: thread.lead.id },
      );
      if (res.data) {
        setEmailSubject(res.data.subject);
        setDraft(res.data.bodyText);
        toast('✨ Персонализированный черновик сгенерирован на основе BusinessAnalysis!', 'success');
      }
    } catch (err: any) {
      toast(err.message || 'Ошибка генерации персонализированного черновика', 'error');
    } finally {
      setLoadingPersonalizedDraft(false);
    }
  };

  const attachedTagIds = new Set(thread?.lead?.tags?.map((t) => t.tag.id) || []);
  const attachedCampaignIds = new Set(thread?.lead?.campaigns?.map((c) => c.campaign.id) || []);

  /**
   * Render WhatsApp Checkmarks / Read Status for an OUTBOUND message
   */
  const renderMessageReceipt = (m: Message) => {
    if (m.direction !== 'OUTBOUND') return null;

    const isRead = m.events?.some((e) => e.type === 'MESSAGE_READ');
    const isDelivered = m.events?.some((e) => e.type === 'MESSAGE_DELIVERED');
    const isFailed = m.events?.some((e) => e.type === 'MESSAGE_FAILED');

    if (isRead) {
      return (
        <span
          className="flex items-center gap-0.5 text-cyan-300 font-black cursor-help"
          title="✓✓ Прочитано лидом (собеседник открыл сообщение)"
        >
          <CheckCheck size={14} className="text-cyan-300 stroke-[2.6] drop-shadow-sm" />
          <span className="text-[8px] uppercase tracking-wider font-extrabold text-cyan-200 ml-0.5">
            Прочитано
          </span>
        </span>
      );
    }

    if (isDelivered) {
      return (
        <span
          className="flex items-center gap-0.5 text-emerald-200 cursor-help"
          title="✓✓ Доставлено на телефон собеседника"
        >
          <CheckCheck size={13} className="text-emerald-200 stroke-[2.2]" />
          <span className="text-[8px] text-emerald-100 ml-0.5">Доставлено</span>
        </span>
      );
    }

    if (isFailed) {
      return (
        <span className="flex items-center gap-0.5 text-rose-300" title="Ошибка отправки">
          <AlertCircle size={13} />
        </span>
      );
    }

    // Default sent status
    return (
      <span className="flex items-center gap-0.5 text-emerald-200" title="✓ Отправлено в WhatsApp">
        <Check size={13} className="text-emerald-200 stroke-[2.2]" />
        <span className="text-[8px] text-emerald-100 ml-0.5">Отправлено</span>
      </span>
    );
  };

  return (
    <div className="flex h-[calc(100vh-8.5rem)] gap-4 overflow-hidden">
      {/* Left Column: Conversations List & Filters */}
      <div className="flex w-full flex-col gap-3 lg:w-[420px] lg:shrink-0 h-full overflow-hidden min-h-0">
        {/* Top Header Bar */}
        <div className="flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-bold text-ink-900 flex items-center gap-2">
              {channelFilter === 'INSTAGRAM' ? '📸 Instagram Direct' : channelFilter === 'TELEGRAM' ? '✈️ Telegram Боты' : channelFilter === 'EMAIL' ? '✉️ Email Inbox' : channelFilter === 'WHATSAPP' ? '💬 WhatsApp' : 'Омни-чат (WA + IG + TG + Email)'}
              {counts.unread > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-black text-white shadow-sm animate-pulse">
                  🔥 {counts.unread} непрочитанных
                </span>
              )}
            </h2>
            <p className="text-xs text-ink-500">
              Всего: <strong className="text-ink-900">{total}</strong> чатов
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              onClick={() => setShowNewDialog(true)}
              className="h-8 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-700 font-semibold"
              title="Открыть новый диалог по номеру"
            >
              <Plus size={14} />
              Новый
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleSync()}
              disabled={syncing}
              className="h-8 px-2 text-xs border-ink-200"
              title="Синхронизировать чаты из WhatsApp"
            >
              <RotateCw size={14} className={syncing ? 'animate-spin text-emerald-600' : ''} />
              <span className="hidden sm:inline">Синхронизация</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void load()}
              className="h-8 w-8 p-0 border-ink-200"
              title="Обновить список"
            >
              <RefreshCw size={14} />
            </Button>
          </div>
        </div>

        {/* Channel Selector Pills (All / WhatsApp / Instagram Direct / Telegram / Email) */}
        <div className="flex rounded-xl bg-ink-100 p-1 gap-1 shrink-0 border border-ink-200 overflow-x-auto">
          <button
            type="button"
            onClick={() => {
              setChannelFilter('ALL');
              setPage(1);
            }}
            className={clsx(
              'flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-bold transition-all',
              channelFilter === 'ALL'
                ? 'bg-white text-ink-900 shadow-xs'
                : 'text-ink-600 hover:text-ink-900',
            )}
          >
            <span>🌐 Все</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setChannelFilter('WHATSAPP');
              setPage(1);
            }}
            className={clsx(
              'flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-bold transition-all',
              channelFilter === 'WHATSAPP'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-emerald-700 hover:bg-emerald-50',
            )}
          >
            <span>💬 WA</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setChannelFilter('INSTAGRAM');
              setPage(1);
            }}
            className={clsx(
              'flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-bold transition-all',
              channelFilter === 'INSTAGRAM'
                ? 'bg-gradient-to-r from-pink-600 to-purple-600 text-white shadow-xs'
                : 'text-purple-700 hover:bg-purple-50',
            )}
          >
            <span>📸 IG</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setChannelFilter('TELEGRAM');
              setPage(1);
            }}
            className={clsx(
              'flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-bold transition-all',
              channelFilter === 'TELEGRAM'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'text-sky-700 hover:bg-sky-50',
            )}
          >
            <span>✈️ TG</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setChannelFilter('EMAIL');
              setPage(1);
            }}
            className={clsx(
              'flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-bold transition-all',
              channelFilter === 'EMAIL'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-amber-700 hover:bg-amber-50',
            )}
          >
            <span>✉️ Email</span>
          </button>
        </div>

        {/* Dedicated Fast Unread Quick-Bar */}
        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-ink-100 border border-ink-200 shrink-0">
          <button
            type="button"
            onClick={() => {
              setFilter('UNREAD');
              setPage(1);
            }}
            className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
              filter === 'UNREAD'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                : 'bg-white/80 text-ink-700 hover:bg-white hover:text-ink-900'
            }`}
          >
            <Flame size={15} className={counts.unread > 0 ? 'text-amber-300 animate-bounce' : ''} />
            <span>Непрочитанные вами</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                filter === 'UNREAD' ? 'bg-emerald-800 text-white' : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {counts.unread}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setFilter('ALL');
              setPage(1);
            }}
            className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
              filter === 'ALL'
                ? 'bg-ink-800 text-white shadow-md'
                : 'bg-white/80 text-ink-700 hover:bg-white hover:text-ink-900'
            }`}
          >
            <MessageSquarePlus size={15} />
            <span>Все диалоги</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                filter === 'ALL' ? 'bg-ink-900 text-white' : 'bg-ink-200 text-ink-700'
              }`}
            >
              {counts.all}
            </span>
          </button>
        </div>

        {/* List Card Container */}
        <div className="rounded-2xl border border-ink-200 bg-white shadow-card flex flex-col flex-1 min-h-0 overflow-hidden">
          {/* Search, Tag & Campaign Selectors */}
          <div className="space-y-2 border-b border-ink-100 p-3 bg-slate-50 shrink-0">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
                <Input
                  placeholder="Поиск по компании, номеру, заметкам…"
                  className="pl-8 text-xs h-8 bg-white border-ink-200"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
              </div>

              <select
                value={account}
                onChange={(e) => {
                  setAccount(e.target.value);
                  setPage(1);
                }}
                className="w-36 rounded-xl border border-ink-200 bg-white px-2 py-1 text-xs text-ink-900 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option key="all-accounts" value="">Все номера</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name || a.phoneMasked}
                  </option>
                ))}
              </select>
            </div>

            {/* Campaign (List) & Tag Filtering Selectors */}
            <div className="grid grid-cols-2 gap-2">
              <select
                value={selectedCampaignFilter}
                onChange={(e) => {
                  setSelectedCampaignFilter(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-ink-200 bg-white px-2 py-1 text-[11px] text-ink-800 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option key="all-campaigns" value="">📁 Все списки / папки</option>
                {allCampaigns.map((c) => (
                  <option key={`campaign-${c.id}`} value={c.id}>
                    📁 {c.name}
                  </option>
                ))}
              </select>

              <select
                value={selectedTagFilter}
                onChange={(e) => {
                  setSelectedTagFilter(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-ink-200 bg-white px-2 py-1 text-[11px] text-ink-800 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option key="all-tags" value="">🏷️ Все метки / теги</option>
                {allTags.map((t) => (
                  <option key={`tag-${t.id}`} value={t.id}>
                    🏷️ {t.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Filter Tabs Sub-Pills */}
            <div className="flex items-center justify-between gap-1 overflow-x-auto pb-0.5 scrollbar-none">
              <div className="flex items-center gap-1">
                {FILTER_TABS.map((tab) => {
                  const isActive = filter === tab.value;
                  const tabCount = counts[tab.countKey] ?? 0;

                  return (
                    <button
                      key={tab.value}
                      type="button"
                      onClick={() => {
                        setFilter(tab.value);
                        setPage(1);
                      }}
                      className={`px-2 py-0.5 rounded-md text-[11px] font-semibold whitespace-nowrap transition-all flex items-center gap-1 ${
                        isActive
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-white text-ink-600 border border-ink-200 hover:bg-ink-100'
                      }`}
                    >
                      <span>{tab.label}</span>
                      <span
                        className={`px-1 rounded-full text-[9px] font-bold ${
                          isActive ? 'bg-emerald-700 text-white' : tab.badgeColor || 'bg-ink-100 text-ink-700'
                        }`}
                      >
                        {tabCount}
                      </span>
                    </button>
                  );
                })}
              </div>

              {counts.unread > 0 && filter === 'UNREAD' && (
                <button
                  type="button"
                  onClick={() => void markAllAsRead()}
                  disabled={markingAll}
                  className="text-[10px] text-emerald-700 hover:underline font-bold whitespace-nowrap shrink-0"
                >
                  ✓ Прочитать все
                </button>
              )}
            </div>
          </div>

          {/* Scrollable Conversation List */}
          <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-ink-100">
            {error ? (
              <div className="px-4 py-8 text-center text-xs text-red-600">{error}</div>
            ) : items.length === 0 ? (
              <div className="px-4 py-12 text-center text-sm text-ink-400 space-y-2">
                <Inbox size={32} className="mx-auto text-ink-300" />
                <p className="font-medium text-ink-600">
                  {filter === 'UNREAD' ? '🎉 Все сообщения прочитаны!' : 'В этой вкладке нет диалогов'}
                </p>
                <p className="text-xs text-ink-400 max-w-xs mx-auto">
                  {filter === 'UNREAD'
                    ? 'Новые входящие сообщения из WhatsApp появятся здесь автоматически.'
                    : 'Нет сообщений по выбранным фильтрам и меткам.'}
                </p>
                {filter === 'UNREAD' ? (
                  <Button size="sm" variant="secondary" onClick={() => setFilter('ALL')} className="text-xs mt-2">
                    Показать все диалоги ({counts.all})
                  </Button>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => setShowNewDialog(true)} className="text-xs mt-2">
                    + Начать диалог
                  </Button>
                )}
              </div>
            ) : (
              items.map((conv) => {
                const isUnread = conv.unreadCount > 0;
                const leadTags = conv.lead?.tags || [];
                const leadCampaigns = conv.lead?.campaigns || [];
                const lastMsg = conv.messages?.[0];
                const lastIsOutbound = lastMsg?.direction === 'OUTBOUND';
                const lastIsReadByLead = lastMsg?.events?.some((e) => e.type === 'MESSAGE_READ');
                const lastIsDelivered = lastMsg?.events?.some((e) => e.type === 'MESSAGE_DELIVERED');

                return (
                  <div
                    key={conv.id}
                    onClick={() => void openThread(conv.id)}
                    className={
                      'group relative w-full px-4 py-3 text-left transition-colors cursor-pointer ' +
                      (thread?.id === conv.id
                        ? 'bg-emerald-50/90 border-l-4 border-emerald-600'
                        : isUnread
                        ? 'bg-emerald-50/40 border-l-4 border-emerald-500 hover:bg-emerald-50'
                        : 'hover:bg-ink-50/70')
                    }
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          {isUnread && (
                            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 animate-ping" />
                          )}
                          <span
                            className={`truncate text-sm ${
                              isUnread ? 'font-black text-ink-950' : 'font-bold text-ink-800'
                            }`}
                          >
                            {conv.lead?.companyName ?? (conv.lead?.telegramUsername ? `@${conv.lead.telegramUsername}` : conv.lead?.instagramUsername ? `@${conv.lead.instagramUsername}` : conv.lead?.phone) ?? 'Лид'}
                          </span>
                        </div>
                        <div className="truncate text-[11px] text-ink-500 flex items-center gap-1.5 mt-0.5">
                          {conv.channel === 'TELEGRAM' ? (
                            <span className="font-semibold text-sky-700 bg-sky-50 px-1.5 py-0.2 rounded border border-sky-200 flex items-center gap-0.5">
                              ✈️ {conv.telegramBot?.username ? `@${conv.telegramBot.username}` : conv.telegramBot?.name || 'Telegram'}
                            </span>
                          ) : conv.channel === 'INSTAGRAM' ? (
                            <span className="font-semibold text-pink-700 bg-pink-50 px-1.5 py-0.2 rounded border border-pink-200 flex items-center gap-0.5">
                              📸 {conv.instagramAccount?.username ? `@${conv.instagramAccount.username}` : conv.instagramAccount?.name || 'Instagram'}
                            </span>
                          ) : (
                            <span className="font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                              💬 {conv.account?.name || conv.account?.phoneMasked || 'WhatsApp'}
                            </span>
                          )}
                          {conv.lead?.telegramUsername && conv.channel !== 'TELEGRAM' ? (
                            <span className="font-medium text-sky-700">· @{conv.lead.telegramUsername}</span>
                          ) : conv.lead?.instagramUsername && conv.channel !== 'INSTAGRAM' ? (
                            <span className="font-medium text-purple-700">· @{conv.lead.instagramUsername}</span>
                          ) : conv.lead?.phone ? (
                            <span>· {conv.lead.phone}</span>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {isUnread ? (
                          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-[10px] font-black text-white shadow-xs animate-pulse" title="Не прочитано вами">
                            {conv.unreadCount} новых
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold text-ink-400 flex items-center gap-0.5" title="Прочитано вами">
                            <CheckCircle2 size={12} className="text-emerald-500" />
                          </span>
                        )}

                        {/* Quick hover toggle read/unread button */}
                        <button
                          type="button"
                          onClick={(e) =>
                            isUnread
                              ? markConversationAsRead(conv.id, e)
                              : markConversationAsUnread(conv.id, e)
                          }
                          className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-ink-200/80 text-ink-500 hover:text-ink-900 transition-opacity"
                          title={isUnread ? 'Отметить прочитанным вами' : 'Отметить как непрочитанное вами'}
                        >
                          {isUnread ? <CheckCheck size={14} className="text-emerald-600" /> : <Mail size={14} />}
                        </button>
                      </div>
                    </div>

                    {/* Preview Message with Lead Read Status */}
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <div className="truncate text-xs flex items-center gap-1 min-w-0">
                        {lastIsOutbound && (
                          <span className="shrink-0">
                            {lastIsReadByLead ? (
                              <span className="text-cyan-600 font-bold flex items-center" title="Лид прочитал ваше последнее сообщение">
                                <CheckCheck size={13} className="text-cyan-600 stroke-[2.6]" />
                              </span>
                            ) : lastIsDelivered ? (
                              <span className="text-emerald-600 flex items-center" title="Доставлено на телефон лида">
                                <CheckCheck size={13} className="text-emerald-600 stroke-[2.2]" />
                              </span>
                            ) : (
                              <span className="text-ink-400 flex items-center" title="Отправлено в WhatsApp">
                                <Check size={13} />
                              </span>
                            )}
                          </span>
                        )}
                        <span
                          className={`truncate ${
                            isUnread ? 'font-bold text-ink-900' : 'text-ink-600 font-medium'
                          }`}
                        >
                          {conv.lastMessagePreview ?? (
                            <span className="text-ink-400 italic font-normal">Диалог создан (напишите первым)</span>
                          )}
                        </span>
                      </div>

                      <span className="shrink-0 rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-bold text-ink-600 border border-ink-200">
                        {statusRu(conv.status)}
                      </span>
                    </div>

                    {/* Tags & Lists Chips in Card */}
                    {(leadTags.length > 0 || leadCampaigns.length > 0) && (
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        {leadTags.map((lt) => (
                          <span
                            key={lt.tag.id}
                            className="inline-flex items-center px-1.5 py-0.2 rounded-md text-[9px] font-bold text-white shadow-xs"
                            style={{ backgroundColor: lt.tag.color || '#10B981' }}
                          >
                            {lt.tag.name}
                          </span>
                        ))}
                        {leadCampaigns.map((lc) => (
                          <span
                            key={lc.campaign.id}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-md text-[9px] font-bold bg-purple-50 text-purple-700 border border-purple-200"
                          >
                            📁 {lc.campaign.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Bottom Pagination Bar */}
          {totalPages > 1 && (
            <div className="border-t border-ink-100 p-2.5 bg-slate-50 flex items-center justify-between text-xs text-ink-600 shrink-0">
              <span className="text-ink-500 font-medium">
                Стр <strong>{page}</strong> из <strong>{totalPages}</strong> ({total} диалогов)
              </span>

              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="h-7 px-2 text-xs border-ink-200"
                >
                  <ChevronLeft size={14} />
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="h-7 px-2 text-xs border-ink-200"
                >
                  <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Chat Thread Pane + Right CRM Drawer */}
      <div className="hidden min-w-0 flex-1 rounded-2xl border border-ink-200 bg-white shadow-card lg:flex overflow-hidden h-full">
        {!thread ? (
          <div className="flex flex-1 flex-col items-center justify-center text-sm text-ink-400 gap-3 p-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200 shadow-sm">
              <MessageSquarePlus size={32} />
            </div>
            <div>
              <p className="font-bold text-base text-ink-900">Выберите диалог из списка слева</p>
              <p className="text-xs text-ink-500 mt-1 max-w-sm">
                Вы можете переписываться от имени любого номера WhatsApp, отслеживать статус доставки и прочтения лидом, присваивать метки и сортировать лиды.
              </p>
            </div>
            {counts.unread > 0 && (
              <Button
                size="sm"
                variant="primary"
                onClick={() => setFilter('UNREAD')}
                className="text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 font-bold"
              >
                <Flame size={14} /> Открыть непрочитанные ({counts.unread})
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-1 h-full overflow-hidden">
            {/* Left part of thread: Chat Messages & Input */}
            <div className="flex flex-1 flex-col h-full min-w-0 border-r border-ink-100">
              {/* Thread Header */}
              <div className="flex items-center justify-between gap-3 border-b border-ink-100 px-4 py-3 bg-slate-50 shrink-0">
                <div className="min-w-0 flex-1">
                  <div className="text-base font-bold text-ink-900 flex items-center gap-2">
                    <span className="truncate">{thread.lead?.companyName ?? (thread.lead?.telegramUsername ? `@${thread.lead.telegramUsername}` : thread.lead?.instagramUsername ? `@${thread.lead.instagramUsername}` : thread.lead?.email || thread.lead?.phone) ?? 'Лид'}</span>
                    {thread.channel === 'EMAIL' ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-600 px-2 py-0.5 text-[10px] font-black text-white shadow-2xs">
                        ✉️ Email Inbox
                      </span>
                    ) : thread.channel === 'TELEGRAM' ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-sky-600 px-2 py-0.5 text-[10px] font-black text-white shadow-2xs">
                        ✈️ Telegram Bot
                      </span>
                    ) : thread.channel === 'INSTAGRAM' ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-gradient-to-r from-pink-500 to-purple-600 px-2 py-0.5 text-[10px] font-black text-white shadow-2xs">
                        📸 Instagram Direct
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-bold border border-emerald-200">
                        💬 WhatsApp
                      </span>
                    )}
                    {thread.lead?.email && (
                      <span className="text-xs font-mono text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                        {thread.lead.email}
                      </span>
                    )}
                    {thread.lead?.telegramUsername && (
                      <a
                        href={thread.lead?.telegramUrl || `https://t.me/${thread.lead.telegramUsername}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sky-600 hover:text-sky-700 shrink-0 flex items-center gap-0.5 text-xs font-semibold"
                        title="Открыть диалог в Telegram"
                      >
                        <span>@{thread.lead.telegramUsername}</span>
                        <ExternalLink size={12} />
                      </a>
                    )}
                    {thread.lead?.whatsappUrl && (
                      <a
                        href={thread.lead.whatsappUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-emerald-600 hover:text-emerald-700 shrink-0"
                        title="Открыть в WhatsApp Web"
                      >
                        <ExternalLink size={14} />
                      </a>
                    )}
                    {thread.lead?.instagramUsername && (
                      <a
                        href={`https://instagram.com/${thread.lead.instagramUsername}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-pink-600 hover:text-pink-700 shrink-0 flex items-center gap-0.5 text-xs font-semibold"
                        title="Открыть профиль Instagram"
                      >
                        <span>@{thread.lead.instagramUsername}</span>
                        <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                  <div className="text-xs text-ink-500 flex items-center gap-2 mt-0.5">
                    {thread.channel === 'EMAIL' ? (
                      <span>
                        Отправитель: <strong className="text-amber-800">{thread.emailAccount?.name || 'Email Аккаунт'} ({thread.emailAccount?.emailAddress || 'SMTP'})</strong>
                      </span>
                    ) : thread.channel === 'TELEGRAM' ? (
                      <span>
                        Бот: <strong className="text-sky-700">@{thread.telegramBot?.username || thread.telegramBot?.name}</strong>
                      </span>
                    ) : thread.channel === 'INSTAGRAM' ? (
                      <span>
                        Аккаунт: <strong className="text-purple-700">@{thread.instagramAccount?.username || thread.instagramAccount?.name}</strong>
                      </span>
                    ) : (
                      <span>
                        Номер: <strong className="text-emerald-700">{thread.account?.name}</strong>
                      </span>
                    )}
                    {thread.lead?.phone && (
                      <span>
                        · Тел: <strong>{thread.lead.phone}</strong>
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-100/70 px-2 py-0.2 rounded-full">
                      <CheckCircle2 size={11} className="text-emerald-600" /> Прочитано вами
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  {/* Pre-Flight Guardrail Status Button */}
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={checkPreFlight}
                    loading={loadingPreFlight}
                    className="h-8 px-2.5 text-xs font-bold border-cyan-300 bg-cyan-50 text-cyan-800 hover:bg-cyan-100 gap-1"
                    title="Проверить 5 параметров Pre-Flight Guardrail перед отправкой"
                  >
                    <ShieldCheck size={13} className="text-cyan-600" />
                    <span>Pre-Flight 5/5</span>
                  </Button>

                  {/* Human Takeover / Handback Button */}
                  {aiData?.aiState?.humanTakeoverAt ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleHandback}
                      disabled={togglingAi}
                      className="h-8 px-2.5 text-xs font-bold border-purple-300 bg-purple-100 text-purple-900 hover:bg-purple-200 gap-1 shadow-2xs"
                      title="Передать управление обратно AI Sales Agent"
                    >
                      <UserCheck size={13} className="text-purple-700" />
                      <span>🤝 Передать AI</span>
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleTakeover}
                      disabled={togglingAi}
                      className="h-8 px-2.5 text-xs font-semibold border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 gap-1"
                      title="Перехватить диалог (AI будет приостановлен)"
                    >
                      <PauseCircle size={13} className="text-amber-600" />
                      <span>👤 Перехват</span>
                    </Button>
                  )}

                  {/* AI Mode Selector: Multi-Mode dropdown for Telegram / Instagram OR standard Toggle for WhatsApp */}
                  {thread.channel === 'TELEGRAM' || thread.channel === 'INSTAGRAM' ? (
                    <div className="flex items-center gap-1">
                      <select
                        value={aiData?.aiState?.executionMode || (thread.channel === 'TELEGRAM' ? thread.telegramBot?.aiExecutionMode : thread.instagramAccount?.aiExecutionMode) || 'AUTOMATIC_REPLIES'}
                        onChange={(e) => void handleToggleChannelMode(e.target.value as any)}
                        disabled={togglingAi}
                        className={clsx(
                          'h-8 rounded-lg border px-2 py-1 text-xs font-bold focus:outline-none focus:ring-1 shadow-2xs cursor-pointer',
                          thread.channel === 'TELEGRAM'
                            ? 'border-sky-300 bg-sky-50 text-sky-900 focus:ring-sky-500'
                            : 'border-purple-300 bg-purple-50 text-purple-900 focus:ring-purple-500',
                        )}
                        title="5 Режимов AI: Автоответы / Ручное одобрение / Полная автономия / Пауза / Передача человеку"
                      >
                        <option value="AUTOMATIC_REPLIES">⚡ Автоответы AI</option>
                        <option value="MANUAL_APPROVAL">📝 Ручное одобрение</option>
                        <option value="FULL_AUTONOMY">🚀 Полная автономия</option>
                        <option value="PAUSED">⏸️ Пауза AI</option>
                        <option value="HUMAN_HANDOFF">👤 Передать человеку</option>
                      </select>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={togglingAi}
                      onClick={() => toggleConversationAi(Boolean(aiData?.aiState?.isAiPaused))}
                      className={clsx(
                        'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold border transition-colors shadow-2xs',
                        aiData?.aiState?.isAiPaused
                          ? 'bg-zinc-100 text-zinc-700 border-zinc-300 hover:bg-zinc-200'
                          : aiConfig?.mode === 'AUTONOMOUS'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                          : 'bg-purple-50 text-purple-800 border-purple-300 hover:bg-purple-100',
                      )}
                      title={
                        aiData?.aiState?.isAiPaused
                          ? 'AI отключен для этого чата. Нажмите, чтобы включить.'
                          : 'AI активен для этого чата. Нажмите, чтобы отключить.'
                      }
                    >
                      <Bot size={13} className={aiData?.aiState?.isAiPaused ? 'text-zinc-500' : 'text-emerald-600'} />
                      <span>
                        {aiData?.aiState?.isAiPaused
                          ? '⏸️ AI Отключен'
                          : aiConfig?.mode === 'AUTONOMOUS'
                          ? '⚡ AI Автономный'
                          : '🤝 AI Копилот'}
                      </span>
                    </button>
                  )}

                  {/* Mark as unread button */}
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void markConversationAsUnread(thread.id)}
                    className="h-8 px-2.5 text-xs border-ink-200 text-ink-700 hover:bg-ink-100"
                    title="Пометить как непрочитанное вами"
                  >
                    <Mail size={14} className="text-amber-600" />
                    <span className="hidden sm:inline">Непрочитано</span>
                  </Button>

                  {/* Toggle CRM Drawer Button */}
                  <Button
                    size="sm"
                    variant={showLeadDrawer ? 'primary' : 'secondary'}
                    onClick={() => setShowLeadDrawer(!showLeadDrawer)}
                    className={`h-8 px-2.5 text-xs font-bold ${
                      showLeadDrawer
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        : 'border-ink-200 text-ink-700 hover:bg-ink-100'
                    }`}
                    title="Открыть карточку лида и метки"
                  >
                    <TagIcon size={14} />
                    <span>Карточка Лида</span>
                  </Button>
                </div>
              </div>

              {/* Messages Area */}
              <div ref={threadRef} className="flex-1 space-y-2.5 overflow-y-auto bg-slate-100/60 p-4">
                {thread.messages.length === 0 && (
                  <div className="py-12 text-center text-sm text-ink-400 space-y-1">
                    <div className="w-12 h-12 rounded-xl bg-white text-ink-300 flex items-center justify-center mx-auto border border-ink-200">
                      <MessageCircle size={24} />
                    </div>
                    <p className="font-semibold text-ink-700 mt-2">Сообщений пока нет</p>
                    <p className="text-xs text-ink-400">Напишите первое сообщение клиенту через поле ввода ниже.</p>
                  </div>
                )}
                {thread.messages.map((m) => {
                  const isOut = m.direction === 'OUTBOUND';
                  return (
                    <div key={m.id} className={'flex ' + (isOut ? 'justify-end' : 'justify-start')}>
                      <div
                        className={
                          'max-w-[75%] rounded-2xl px-4 py-2.5 text-xs shadow-sm ' +
                          (isOut
                            ? 'rounded-br-sm bg-emerald-600 text-white'
                            : 'rounded-bl-sm bg-white text-ink-800 border border-ink-200')
                        }
                      >
                        {m.emailMeta?.subject && (
                          <div className={clsx(
                            'text-[11px] font-bold border-b pb-1 mb-1.5 flex items-center gap-1.5',
                            isOut ? 'border-emerald-500/50 text-emerald-100' : 'border-ink-200 text-ink-800'
                          )}>
                            <Mail size={12} className={isOut ? 'text-emerald-200' : 'text-amber-600'} />
                            <span>Тема: {m.emailMeta.subject}</span>
                          </div>
                        )}
                        <p className="whitespace-pre-wrap break-words leading-relaxed">{m.body}</p>
                        <div
                          className={
                            'mt-1.5 flex items-center justify-end gap-1.5 text-[9px] ' +
                            (isOut ? 'text-emerald-100' : 'text-ink-400')
                          }
                        >
                          {isOut && m.emailMeta && (
                            <div className="flex items-center gap-1.5 mr-1 font-medium">
                              {m.emailMeta.openCount > 0 ? (
                                <span className="bg-emerald-700/80 px-1.5 py-0.5 rounded text-[8px] font-bold text-emerald-100 flex items-center gap-0.5" title={`Открыто ${m.emailMeta.openCount} раз`}>
                                  👁️ {m.emailMeta.openCount}
                                </span>
                              ) : (
                                <span className="text-[8px] opacity-75">👁️ 0</span>
                              )}
                              {m.emailMeta.clickCount > 0 && (
                                <span className="bg-emerald-700/80 px-1.5 py-0.5 rounded text-[8px] font-bold text-emerald-100 flex items-center gap-0.5" title={`Переходов по ссылкам: ${m.emailMeta.clickCount}`}>
                                  🔗 {m.emailMeta.clickCount}
                                </span>
                              )}
                            </div>
                          )}
                          <span>
                            {new Date(m.recordedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {renderMessageReceipt(m)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* AI Draft Review Banner for MANUAL_APPROVAL mode */}
              {aiData?.aiState?.suggestedReplyStatus === 'PENDING' && aiData?.aiState?.suggestedReply && (
                <div className="border-t-2 border-purple-400 bg-gradient-to-r from-purple-50 via-indigo-50 to-pink-50 p-3.5 shrink-0 shadow-sm animate-in fade-in">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-purple-600 text-white shadow-2xs">
                        <Bot size={14} />
                      </span>
                      <div>
                        <span className="text-xs font-black text-purple-950 uppercase tracking-wider">
                          AI Черновик на проверку (Manual Approval)
                        </span>
                        <span className="text-[10px] text-purple-700 block font-medium">
                          AI Sales Agent сгенерировал персональный ответ. Проверьте и подтвердите отправку.
                        </span>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-200 text-purple-900 border border-purple-300">
                      Требуется подтверждение
                    </span>
                  </div>

                  <div className="rounded-xl bg-white p-3 border border-purple-200 font-medium text-xs text-ink-900 shadow-2xs whitespace-pre-wrap leading-relaxed">
                    {aiData.aiState.suggestedReply}
                  </div>

                  <div className="flex items-center justify-between mt-2.5 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => void handleManualApproval('APPROVE_AND_SEND')}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-1.5 shadow-2xs"
                      >
                        <CheckCircle2 size={14} />
                        <span>Одобрить и отправить</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setDraft(aiData.aiState.suggestedReply);
                          toast('Черновик перенесён в поле ввода для редактирования', 'info');
                        }}
                        className="border-purple-300 bg-white text-purple-800 hover:bg-purple-100 font-bold text-xs gap-1"
                      >
                        <Edit3 size={13} />
                        <span>Редактировать</span>
                      </Button>
                    </div>

                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void handleManualApproval('REJECT')}
                      className="border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 font-semibold text-xs gap-1"
                    >
                      <X size={13} />
                      <span>Отклонить</span>
                    </Button>
                  </div>
                </div>
              )}

              {/* AI Copilot Suggestion Chips */}
              {aiData?.suggestions && aiData.suggestions.length > 0 && (
                <div className="border-t border-purple-100 bg-purple-50/70 px-3.5 py-2 shrink-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-purple-800 flex items-center gap-1">
                      <Sparkles size={11} className="text-purple-600" />
                      AI Подсказки ответа (Copilot):
                    </span>
                    <span className="text-[10px] text-purple-600">Кликните, чтобы вставить</span>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {aiData.suggestions.map((sug) => (
                      <button
                        key={sug.id}
                        type="button"
                        onClick={() => setDraft(sug.text)}
                        className="rounded-lg bg-white border border-purple-200 hover:border-purple-400 hover:bg-purple-100/50 p-2 text-left text-[11px] text-ink-800 shrink-0 w-64 shadow-2xs transition-all"
                      >
                        <div className="font-bold text-purple-900 truncate flex items-center gap-1">
                          <Zap size={10} className="text-purple-600 shrink-0" />
                          {sug.title}
                        </div>
                        <p className="text-[10px] text-ink-600 mt-0.5 line-clamp-2">{sug.text}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Input Form Box */}
              <form onSubmit={sendMessage} className="border-t border-ink-100 p-3 bg-white shrink-0 space-y-2">
                {thread.channel === 'EMAIL' && (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 flex items-center gap-2 bg-amber-50/70 border border-amber-200/80 rounded-xl px-3 py-1.5">
                      <Mail size={13} className="text-amber-600 shrink-0" />
                      <span className="text-[11px] font-bold text-amber-900 shrink-0">Тема:</span>
                      <input
                        type="text"
                        value={emailSubject}
                        onChange={(e) => setEmailSubject(e.target.value)}
                        placeholder={`Предложение по сотрудничеству для ${thread.lead?.companyName || 'клиента'}`}
                        disabled={sending}
                        className="flex-1 bg-transparent text-xs text-ink-900 placeholder:text-amber-700/50 focus:outline-none"
                      />
                    </div>
                    {thread.lead?.businessAnalysis && (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={handleGeneratePersonalizedDraft}
                        loading={loadingPersonalizedDraft}
                        className="bg-purple-50 hover:bg-purple-100 text-purple-800 border-purple-200 text-xs font-bold gap-1.5 shrink-0"
                        title="Сгенерировать персонализированное письмо на основе аудита сайта (PageSpeed, SEO, Gaps)"
                      >
                        <Sparkles size={13} className="text-purple-600" />
                        <span>✨ Оффер по аудиту</span>
                      </Button>
                    )}
                  </div>
                )}
                <div className="flex gap-2">
                  <textarea
                    rows={thread.channel === 'EMAIL' ? 3 : 1}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={
                      thread.channel === 'EMAIL'
                        ? `Текст email сообщения от «${thread.emailAccount?.name || thread.account?.name || 'Email'}» (${thread.emailAccount?.emailAddress || ''})…`
                        : `Написать сообщение от «${thread.account?.name || 'Аккаунт'}»…`
                    }
                    disabled={sending}
                    className="flex-1 rounded-xl border border-ink-200 bg-ink-50 px-4 py-2.5 text-xs text-ink-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                  />
                  <Button
                    type="submit"
                    size="md"
                    loading={sending}
                    disabled={!draft.trim()}
                    className={clsx(
                      'px-5 text-xs font-bold self-end',
                      thread.channel === 'EMAIL'
                        ? 'bg-amber-600 hover:bg-amber-700 text-white'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white',
                    )}
                  >
                    <Send size={14} />
                    <span>Отправить</span>
                  </Button>
                </div>
              </form>
            </div>

            {/* Right CRM Drawer: Lead Tagging, Lists, Notes & Pipeline */}
            {showLeadDrawer && (
              <div className="w-80 shrink-0 flex flex-col h-full bg-white border-l border-ink-100 overflow-y-auto p-4 space-y-4">
                <div className="flex items-center justify-between border-b border-ink-100 pb-2.5">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-ink-900 uppercase tracking-wider">
                    <Briefcase size={14} className="text-emerald-600" />
                    <span>Управление Лидом</span>
                  </div>
                  <button
                    onClick={() => setShowLeadDrawer(false)}
                    className="text-ink-400 hover:text-ink-700"
                    title="Свернуть панель"
                  >
                    <X size={15} />
                  </button>
                </div>

                {/* AI Sales Brain Intelligence Card */}
                <div className="rounded-2xl border border-purple-200 bg-gradient-to-br from-purple-50 via-indigo-50/40 to-white p-3.5 space-y-3 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-bold text-xs text-purple-900">
                      <Bot size={15} className="text-purple-600" />
                      <span>Sales Brain & Скоринг</span>
                    </div>
                    {aiData?.lead?.score?.score !== undefined ? (
                      <span
                        className={clsx(
                          'rounded-full px-2 py-0.5 text-[10px] font-black',
                          aiData.lead.score.grade === 'HOT'
                            ? 'bg-rose-100 text-rose-800 border border-rose-300'
                            : 'bg-purple-100 text-purple-800',
                        )}
                      >
                        {aiData.lead.score.score}/100 {aiData.lead.score.grade === 'HOT' ? '🔥' : '⚡'}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={async () => {
                          if (!thread?.lead?.id) return;
                          try {
                            await post(`/api/ai/leads/${thread.lead.id}/score`, {});
                            toast('AI-скоринг рассчитан!', 'success');
                            await loadAiCopilot(thread.id);
                          } catch {
                            toast('Ошибка расчета скоринга', 'danger');
                          }
                        }}
                        className="text-[10px] font-bold text-purple-700 hover:underline"
                      >
                        + Рассчитать
                      </button>
                    )}
                  </div>

                  {/* Stage Machine Status */}
                  <div className="bg-white/90 p-2.5 rounded-xl border border-purple-100 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-ink-500 uppercase tracking-wider">Стадия Sales Brain:</span>
                      <span className="font-extrabold text-[11px] text-purple-800 bg-purple-100 px-2 py-0.5 rounded-md">
                        {aiData?.aiState?.stage || 'DISCOVERY'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-ink-500">
                      <span>Консалтинг:</span>
                      <span className="font-bold text-emerald-700">
                        PROBLEM → IMPACT → NEED → SOLUTION → VALUE → OFFER
                      </span>
                    </div>
                  </div>

                  {/* Dynamic Needs Discovery 12-Slot Profile */}
                  {aiData?.aiState?.discoveryProfile && (
                    <div className="bg-white/95 p-2.5 rounded-xl border border-purple-100 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-purple-900 uppercase tracking-wider">
                          Потребности (Discovery):
                        </span>
                        <span className="text-[10px] font-extrabold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full">
                          {aiData.aiState.discoveryProfile.completedSlotsCount || 0}/10 слотов (
                          {Math.round((aiData.aiState.discoveryProfile.confidence || 0) * 100)}%)
                        </span>
                      </div>

                      {aiData.aiState.discoveryProfile.need && (
                        <div className="text-[11px] text-ink-800">
                          <span className="text-[10px] font-bold text-ink-500 block">Задача / Потребность:</span>
                          <span className="font-semibold text-purple-950">{aiData.aiState.discoveryProfile.need}</span>
                        </div>
                      )}

                      {aiData.aiState.discoveryProfile.pain && aiData.aiState.discoveryProfile.pain.length > 0 && (
                        <div className="text-[11px] text-rose-900 bg-rose-50/70 p-1.5 rounded-lg border border-rose-100 space-y-0.5">
                          <span className="text-[10px] font-bold text-rose-700 uppercase block">Выявленные боли:</span>
                          <ul className="list-disc list-inside space-y-0.5">
                            {aiData.aiState.discoveryProfile.pain.map((p: string, idx: number) => (
                              <li key={idx} className="truncate">{p}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {aiData.aiState.discoveryProfile.impact && (
                        <div className="text-[10px] text-amber-900 bg-amber-50/70 p-1.5 rounded-lg border border-amber-100">
                          <span className="font-bold block text-amber-700">Влияние на бизнес (Impact):</span>
                          <span>{aiData.aiState.discoveryProfile.impact}</span>
                        </div>
                      )}

                      {aiData.aiState.discoveryProfile.nextSuggestedQuestion && (
                        <div className="bg-gradient-to-br from-emerald-50 to-teal-50/60 p-2 rounded-xl border border-emerald-200 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-extrabold text-emerald-800 uppercase tracking-wider flex items-center gap-1">
                              <Sparkles size={11} className="text-emerald-600" />
                              Следующий вопрос AI:
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setDraft(aiData.aiState.discoveryProfile.nextSuggestedQuestion);
                                toast('Вопрос вставлен в поле ввода', 'info');
                              }}
                              className="text-[10px] font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-0.5 bg-white px-1.5 py-0.5 rounded-md border border-emerald-200 shadow-2xs"
                            >
                              <Zap size={10} /> Вставить
                            </button>
                          </div>
                          <p className="text-[11px] text-emerald-950 font-medium leading-snug">
                            {aiData.aiState.discoveryProfile.nextSuggestedQuestion}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Copilot Suggestions */}
                  {aiData?.suggestions && aiData.suggestions.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <span className="text-[10px] font-bold text-purple-800 uppercase block">Подсказки AI Copilot:</span>
                      <div className="space-y-1.5">
                        {aiData.suggestions.map((sug) => (
                          <div
                            key={sug.id}
                            className="bg-white p-2 rounded-xl border border-purple-100 shadow-2xs hover:border-purple-300 transition-colors space-y-1"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold text-purple-900 truncate">{sug.title}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setDraft(sug.text);
                                  toast('Текст вставлен в поле ввода', 'info');
                                }}
                                className="text-[10px] font-bold text-emerald-600 hover:text-emerald-800 flex items-center gap-0.5"
                              >
                                <Zap size={11} /> Вставить
                              </button>
                            </div>
                            <p className="text-[11px] text-ink-700 line-clamp-2 leading-relaxed">{sug.text}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Negotiation Engine — 11 Objections Rebuttal Matrix */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-ink-800 uppercase tracking-wider block">
                        Отработка возражений (5 шагов):
                      </span>
                      <span className="text-[9px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                        Без споров и давления
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-1 max-h-48 overflow-y-auto p-1 bg-ink-50/70 rounded-xl border border-ink-100">
                      {[
                        { label: '💰 Дорого', query: 'Дорого, высокая цена' },
                        { label: '🤔 Подумаем', query: 'Надо подумать, посоветуемся' },
                        { label: '🙅‍♂️ Не нужно', query: 'Нам это не нужно, не интересно' },
                        { label: '👨‍💻 Есть разработчик', query: 'У нас уже есть свой программист' },
                        { label: '🌐 Есть сайт', query: 'У нас уже есть сайт' },
                        { label: '📋 Отправьте цены', query: 'Отправьте цены и прайс-лист' },
                        { label: '⏳ Не время', query: 'Сейчас не время, давайте позже' },
                        { label: '📉 Нет бюджета', query: 'Нет бюджета на разработку' },
                        { label: '👔 Обсудить с шефом', query: 'Нужно обсудить с руководителем' },
                        { label: '📄 Пришлите КП', query: 'Пришлите коммерческое предложение' },
                        { label: '⚖️ Сравниваем', query: 'Мы сравниваем варианты и подрядчиков' },
                        { label: '🛑 Не пишите мне', query: 'Не пишите мне больше' },
                      ].map((obj) => (
                        <button
                          key={obj.label}
                          type="button"
                          disabled={!!loadingObjection}
                          onClick={async () => {
                            if (!thread) return;
                            try {
                              setLoadingObjection(obj.label);
                              const res = await post<NegotiationEngineResult>('/api/ai/negotiation/handle', {
                                text: obj.query,
                                conversationId: thread.id,
                                leadId: thread.lead?.id,
                              });
                              setNegotiationResult(res);
                              setDraft(res.turn.fullResponseText);
                              if (res.turn.optOutTriggered) {
                                toast('Клиент зафиксирован в Opt-Out. AI остановлен.', 'info');
                              } else {
                                toast(`Отработано возражение: ${res.turn.detectedObjection}. Текст вставлен в поле ввода!`, 'success');
                              }
                              await loadAiCopilot(thread.id);
                            } catch (err: any) {
                              toast(err?.message || 'Ошибка отработки возражения', 'danger');
                            } finally {
                              setLoadingObjection(null);
                            }
                          }}
                          className={`p-1.5 rounded-lg text-[11px] font-bold text-left border transition-all truncate flex items-center justify-between ${
                            obj.label.includes('🛑')
                              ? 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100'
                              : 'bg-white text-ink-800 border-ink-200/80 hover:border-amber-400 hover:bg-amber-50/50 shadow-2xs'
                          }`}
                        >
                          <span className="truncate">{obj.label}</span>
                          {loadingObjection === obj.label && (
                            <RefreshCw size={10} className="animate-spin text-ink-500 shrink-0 ml-1" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="primary"
                      loading={isBuildingSolution}
                      onClick={async () => {
                        if (!thread) return;
                        try {
                          setIsBuildingSolution(true);
                          const res = await post<SolutionBuilderResult>('/api/ai/solution-builder/build', {
                            conversationId: thread.id,
                            leadId: thread.lead?.id,
                          });
                          setSolutionResult(res);
                          setSolutionModalOpen(true);
                          toast('Индивидуальное решение Nexora успешно сформировано!', 'success');
                        } catch (err: any) {
                          toast(err?.message || 'Ошибка подбора решения', 'danger');
                        } finally {
                          setIsBuildingSolution(false);
                        }
                      }}
                      className="w-full text-xs font-bold bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 hover:from-amber-600 hover:to-rose-600 shadow-xs text-white"
                    >
                      <Sparkles size={13} />
                      Подобрать решение (Solution Builder)
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      loading={isPlanningFollowUp}
                      onClick={async () => {
                        if (!thread?.id) return;
                        try {
                          setIsPlanningFollowUp(true);
                          const res = await post<{ success: boolean; plan: FollowUpEnginePlanResult }>(
                            '/api/ai/follow-up/plan',
                            {
                              conversationId: thread.id,
                              leadId: thread.lead?.id,
                              forceRecalculate: true,
                            },
                          );
                          setFollowUpPlan(res.plan);
                          setFollowUpModalOpen(true);
                          if (res.plan.isOptedOut) {
                            toast('Клиент в Opt-Out. Все фоллоу-апы отключены.', 'info');
                          } else {
                            toast('3-шаговая цепочка Follow-up успешно сформирована!', 'success');
                          }
                          await loadAiCopilot(thread.id);
                        } catch (err: any) {
                          toast(err?.message || 'Ошибка планирования Follow-up', 'danger');
                        } finally {
                          setIsPlanningFollowUp(false);
                        }
                      }}
                      className="w-full text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 shadow-2xs"
                    >
                      <Clock size={13} />
                      Follow-up Engine (3 шага)
                    </Button>
                  </div>
                </div>

                {/* 1. Pipeline Status Selector */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black text-ink-700 uppercase tracking-wider block">
                    Статус воронки (Воронка продаж)
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { value: 'INTERESTED', label: '🔥 Горячий', color: 'border-amber-300 bg-amber-50 text-amber-900' },
                      { value: 'NEGOTIATION', label: '🤝 Переговоры', color: 'border-indigo-300 bg-indigo-50 text-indigo-900' },
                      { value: 'CLIENT', label: '💼 Клиент', color: 'border-purple-300 bg-purple-50 text-purple-900' },
                      { value: 'REPLIED', label: '💬 Ответил', color: 'border-sky-300 bg-sky-50 text-sky-900' },
                      { value: 'NEW', label: '🆕 Новый', color: 'border-slate-300 bg-slate-50 text-slate-800' },
                      { value: 'NO_RESPONSE', label: '⏳ Нет ответа', color: 'border-rose-300 bg-rose-50 text-rose-800' },
                    ].map((st) => {
                      const isCurrent = thread.lead?.status === st.value || thread.status === st.value;
                      return (
                        <button
                          key={st.value}
                          type="button"
                          onClick={() => void updateLeadStatus(st.value)}
                          disabled={isSavingLead}
                          className={`p-2 rounded-xl text-xs font-bold text-left border transition-all ${
                            isCurrent
                              ? `${st.color} ring-2 ring-emerald-500 font-black shadow-xs`
                              : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50'
                          }`}
                        >
                          {st.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Tags & Color Labels */}
                <div className="space-y-2 pt-2 border-t border-ink-100">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-black text-ink-700 uppercase tracking-wider block">
                      Метки и Теги лида
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowCreateTagModal(true)}
                      className="text-[11px] font-bold text-emerald-600 hover:underline flex items-center gap-0.5"
                    >
                      <Plus size={12} /> Создать
                    </button>
                  </div>

                  {/* Attached tags list */}
                  <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 rounded-xl bg-ink-50 border border-ink-200">
                    {thread.lead?.tags && thread.lead.tags.length > 0 ? (
                      thread.lead.tags.map((lt) => (
                        <span
                          key={lt.tag.id}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold text-white shadow-xs"
                          style={{ backgroundColor: lt.tag.color || '#10B981' }}
                        >
                          <span>{lt.tag.name}</span>
                          <button
                            type="button"
                            onClick={() => void toggleLeadTag(lt.tag.id, true)}
                            className="hover:opacity-75"
                            title="Снять метку"
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))
                    ) : (
                      <span className="text-[11px] text-ink-400 italic">Нет присвоенных меток</span>
                    )}
                  </div>

                  {/* Quick-add available tags */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-ink-500 block">Быстрое добавление:</span>
                    <div className="flex flex-wrap gap-1">
                      {allTags.map((t) => {
                        const isAttached = attachedTagIds.has(t.id);
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => void toggleLeadTag(t.id, isAttached)}
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all border ${
                              isAttached
                                ? 'bg-ink-900 text-white border-ink-900 line-through opacity-60'
                                : 'bg-white text-ink-800 border-ink-200 hover:bg-ink-100'
                            }`}
                          >
                            <span
                              className="inline-block w-1.5 h-1.5 rounded-full mr-1"
                              style={{ backgroundColor: t.color }}
                            />
                            {t.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* 3. Lists & Campaigns (Folders) */}
                <div className="space-y-2 pt-2 border-t border-ink-100">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-black text-ink-700 uppercase tracking-wider block">
                      Списки и Папки сортировки
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowCreateCampaignModal(true)}
                      className="text-[11px] font-bold text-emerald-600 hover:underline flex items-center gap-0.5"
                    >
                      <FolderPlus size={12} /> Новый список
                    </button>
                  </div>

                  {/* Attached campaigns */}
                  <div className="space-y-1.5">
                    {thread.lead?.campaigns && thread.lead.campaigns.length > 0 ? (
                      thread.lead.campaigns.map((lc) => (
                        <div
                          key={lc.campaign.id}
                          className="flex items-center justify-between p-2 rounded-xl bg-purple-50 border border-purple-200 text-xs font-bold text-purple-900"
                        >
                          <span className="flex items-center gap-1.5 truncate">
                            <Folder size={14} className="text-purple-600 shrink-0" />
                            <span className="truncate">{lc.campaign.name}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => void toggleLeadCampaign(lc.campaign.id, true)}
                            className="text-purple-400 hover:text-purple-800 p-0.5"
                            title="Удалить из этого списка"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      ))
                    ) : (
                      <span className="text-[11px] text-ink-400 italic block">Лид не привязан к спискам</span>
                    )}
                  </div>

                  {/* Dropdown to add to campaign */}
                  <div className="pt-1">
                    <select
                      value=""
                      onChange={(e) => {
                        if (e.target.value) {
                          void toggleLeadCampaign(e.target.value, false);
                        }
                      }}
                      className="w-full rounded-xl border border-ink-200 bg-white p-2 text-xs text-ink-800 font-medium focus:ring-1 focus:ring-emerald-500"
                    >
                      <option key="add-campaign-placeholder" value="">+ Добавить лид в список…</option>
                      {allCampaigns
                        .filter((c) => !attachedCampaignIds.has(c.id))
                        .map((c) => (
                          <option key={`attach-campaign-${c.id}`} value={c.id}>
                            📁 {c.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                {/* 4. CRM Notes Box */}
                <div className="space-y-1.5 pt-2 border-t border-ink-100">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-black text-ink-700 uppercase tracking-wider block">
                      Заметки по сделке
                    </label>
                    <button
                      type="button"
                      onClick={() => void saveLeadDetails()}
                      disabled={isSavingLead}
                      className="text-[11px] font-bold text-emerald-600 hover:underline flex items-center gap-1"
                    >
                      <Save size={12} /> Сохранить
                    </button>
                  </div>
                  <textarea
                    value={leadNotes}
                    onChange={(e) => setLeadNotes(e.target.value)}
                    placeholder="Договорённости, бюджет, когда перезвонить…"
                    rows={3}
                    className="w-full rounded-xl border border-ink-200 bg-ink-50 p-2.5 text-xs text-ink-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                  />
                </div>

                {/* 5. Lead Contact Info Edit */}
                <div className="space-y-2 pt-2 border-t border-ink-100">
                  <label className="text-[11px] font-black text-ink-700 uppercase tracking-wider block">
                    Информация о клиенте
                  </label>
                  <div className="space-y-1.5 text-xs">
                    <div>
                      <span className="text-[10px] text-ink-500 font-bold block mb-0.5">Название / Контакт:</span>
                      <Input
                        value={leadCompanyName}
                        onChange={(e) => setLeadCompanyName(e.target.value)}
                        placeholder="Название компании…"
                        className="text-xs h-7.5"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-ink-500 font-bold block mb-0.5">Телефон:</span>
                      <Input
                        value={leadPhone}
                        onChange={(e) => setLeadPhone(e.target.value)}
                        placeholder="Телефон…"
                        className="text-xs h-7.5"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <span className="text-[10px] text-ink-500 font-bold block mb-0.5">Город:</span>
                        <Input
                          value={leadCity}
                          onChange={(e) => setLeadCity(e.target.value)}
                          placeholder="Город…"
                          className="text-xs h-7.5"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-ink-500 font-bold block mb-0.5">Ниша:</span>
                        <Input
                          value={leadNiche}
                          onChange={(e) => setLeadNiche(e.target.value)}
                          placeholder="Ниша…"
                          className="text-xs h-7.5"
                        />
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void saveLeadDetails()}
                      loading={isSavingLead}
                      className="w-full text-xs font-bold mt-1"
                    >
                      <Save size={13} />
                      <span>Обновить профиль лида</span>
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal: Create New Tag */}
      {showCreateTagModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/60 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-ink-100 space-y-4">
            <div className="flex items-center justify-between border-b border-ink-100 pb-3">
              <div className="font-bold text-base text-ink-900">Создать новую метку / тег</div>
              <button onClick={() => setShowCreateTagModal(false)} className="text-ink-400 hover:text-ink-700">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateTag} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-ink-700 uppercase tracking-wider mb-1 block">
                  Название метки
                </label>
                <Input
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  placeholder="напр. 🔥 Горячий, 💰 Бюджет $1000…"
                  className="text-xs"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs font-bold text-ink-700 uppercase tracking-wider mb-1 block">
                  Цвет метки
                </label>
                <div className="flex items-center gap-2">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewTagColor(c)}
                      className={`w-6 h-6 rounded-full transition-transform ${
                        newTagColor === c ? 'scale-125 ring-2 ring-emerald-500 ring-offset-2' : 'hover:scale-110'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <Button variant="secondary" size="sm" type="button" onClick={() => setShowCreateTagModal(false)}>
                  Отмена
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  type="submit"
                  loading={isCreatingTag}
                  disabled={!newTagName.trim()}
                  className="bg-emerald-600 hover:bg-emerald-700 font-bold"
                >
                  <Plus size={14} />
                  Создать метку
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create New Campaign / List */}
      {showCreateCampaignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/60 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-ink-100 space-y-4">
            <div className="flex items-center justify-between border-b border-ink-100 pb-3">
              <div className="font-bold text-base text-ink-900">Создать список / папку сортировки</div>
              <button onClick={() => setShowCreateCampaignModal(false)} className="text-ink-400 hover:text-ink-700">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateCampaign} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-ink-700 uppercase tracking-wider mb-1 block">
                  Название списка
                </label>
                <Input
                  value={newCampaignName}
                  onChange={(e) => setNewCampaignName(e.target.value)}
                  placeholder="напр. База кровельщиков Майами, Ждут КП…"
                  className="text-xs"
                  autoFocus
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <Button variant="secondary" size="sm" type="button" onClick={() => setShowCreateCampaignModal(false)}>
                  Отмена
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  type="submit"
                  loading={isCreatingCampaign}
                  disabled={!newCampaignName.trim()}
                  className="bg-emerald-600 hover:bg-emerald-700 font-bold"
                >
                  <FolderPlus size={14} />
                  Создать список
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Open New Dialog */}
      {showNewDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-ink-100 space-y-4">
            <div className="flex items-center justify-between border-b border-ink-100 pb-3">
              <div className="font-bold text-base text-ink-900">Новый диалог WhatsApp</div>
              <button onClick={() => setShowNewDialog(false)} className="text-ink-400 hover:text-ink-700">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateNewDialog} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-ink-700 uppercase tracking-wider mb-1 block">
                  Выберите WhatsApp номер
                </label>
                <select
                  value={newDialogAccount}
                  onChange={(e) => setNewDialogAccount(e.target.value)}
                  className="w-full rounded-xl border border-ink-200 bg-white p-2.5 text-xs text-ink-900 font-medium focus:ring-1 focus:ring-emerald-500"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.phoneMasked || 'Без номера'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-ink-700 uppercase tracking-wider mb-1 block">
                  Номер телефона или ссылка wa.me
                </label>
                <Input
                  value={newDialogInput}
                  onChange={(e) => setNewDialogInput(e.target.value)}
                  placeholder="+7 (999) 123-45-67 или https://wa.me/79991234567"
                  className="text-xs"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <Button variant="secondary" size="sm" type="button" onClick={() => setShowNewDialog(false)}>
                  Отмена
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  type="submit"
                  loading={creatingDialog}
                  disabled={!newDialogInput.trim()}
                  className="bg-emerald-600 hover:bg-emerald-700 font-bold"
                >
                  <MessageSquarePlus size={14} />
                  Открыть чат
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: AI Commercial Proposal Generator & Multi-Format Viewer */}
      {proposalModalOpen && activeProposal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-950/70 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-4xl rounded-2xl bg-white shadow-2xl border border-ink-100 flex flex-col max-h-[92vh] my-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-ink-100 bg-gradient-to-r from-indigo-50 via-purple-50 to-white rounded-t-2xl">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="p-1.5 rounded-lg bg-indigo-600 text-white shadow-2xs">
                    <FileText size={16} />
                  </span>
                  <h3 className="font-black text-base text-ink-900 leading-tight">
                    {activeProposal.title || 'Персональное коммерческое предложение Nexora'}
                  </h3>
                  {activeProposal.structuredPdfVersion?.documentNumber && (
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 border border-indigo-200">
                      № {activeProposal.structuredPdfVersion.documentNumber}
                    </span>
                  )}
                  {activeProposal.verification && (
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        activeProposal.verification.isApproved
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                          : 'bg-rose-50 text-rose-800 border-rose-300'
                      }`}
                    >
                      {activeProposal.verification.isApproved ? '✓ Проверено AI' : '⚠️ Требует правок'} (
                      {Math.round((activeProposal.verification.confidenceScore || 0.95) * 100)}%)
                    </span>
                  )}
                </div>
                <p className="text-xs text-ink-600 font-medium">
                  {activeProposal.companyName ? `Заказчик: «${activeProposal.companyName}»` : 'Персональное предложение под ключ'} •{' '}
                  Срок: ~{activeProposal.timeline?.totalWeeks || activeProposal.timelineWeeks || 2} нед. •{' '}
                  Бюджет:{' '}
                  {activeProposal.pricing?.finalMinAmount
                    ? `${activeProposal.pricing.finalMinAmount.toLocaleString('ru-RU')} – ${activeProposal.pricing.finalMaxAmount.toLocaleString('ru-RU')} ₽`
                    : `${activeProposal.priceEstimateMin?.toLocaleString('ru-RU')} – ${activeProposal.priceEstimateMax?.toLocaleString('ru-RU')} ₽`}
                </p>
              </div>
              <button
                onClick={() => setProposalModalOpen(false)}
                className="text-ink-400 hover:text-ink-700 p-1 rounded-lg hover:bg-ink-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Tab Navigation */}
            <div className="flex border-b border-ink-100 bg-ink-50/60 px-5 pt-2 gap-2 text-xs font-bold overflow-x-auto">
              <button
                type="button"
                onClick={() => setProposalTab('WHATSAPP')}
                className={`pb-2.5 px-3 border-b-2 transition-all flex items-center gap-1.5 ${
                  proposalTab === 'WHATSAPP'
                    ? 'border-emerald-600 text-emerald-800 bg-white rounded-t-lg font-black'
                    : 'border-transparent text-ink-600 hover:text-ink-900'
                }`}
              >
                <span>📱 Версия для WhatsApp</span>
              </button>
              <button
                type="button"
                onClick={() => setProposalTab('EXTENDED')}
                className={`pb-2.5 px-3 border-b-2 transition-all flex items-center gap-1.5 ${
                  proposalTab === 'EXTENDED'
                    ? 'border-purple-600 text-purple-800 bg-white rounded-t-lg font-black'
                    : 'border-transparent text-ink-600 hover:text-ink-900'
                }`}
              >
                <span>📑 Расширенная версия (11 разделов)</span>
              </button>
              <button
                type="button"
                onClick={() => setProposalTab('PDF')}
                className={`pb-2.5 px-3 border-b-2 transition-all flex items-center gap-1.5 ${
                  proposalTab === 'PDF'
                    ? 'border-indigo-600 text-indigo-800 bg-white rounded-t-lg font-black'
                    : 'border-transparent text-ink-600 hover:text-ink-900'
                }`}
              >
                <span>🖨️ PDF / CRM Документ</span>
              </button>
              <button
                type="button"
                onClick={() => setProposalTab('VERIFICATION')}
                className={`pb-2.5 px-3 border-b-2 transition-all flex items-center gap-1.5 ${
                  proposalTab === 'VERIFICATION'
                    ? 'border-amber-600 text-amber-800 bg-white rounded-t-lg font-black'
                    : 'border-transparent text-ink-600 hover:text-ink-900'
                }`}
              >
                <span>🛡️ Предстартовая проверка</span>
              </button>
            </div>

            {/* Tab Body */}
            <div className="p-5 space-y-4 overflow-y-auto max-h-[calc(90vh-170px)] text-xs text-ink-800">
              {proposalTab === 'WHATSAPP' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-[11px] text-ink-500">
                    <span>Готово для отправки в WhatsApp / Telegram диалог:</span>
                    <span className="font-bold text-emerald-700">Оптимизировано для чтения со смартфона (до 30 сек)</span>
                  </div>
                  <div className="rounded-xl bg-ink-900 text-emerald-300 p-4 font-mono text-xs whitespace-pre-wrap max-h-96 overflow-y-auto leading-relaxed border border-emerald-900/50 shadow-inner">
                    {activeProposal.whatsAppVersion || activeProposal.formattedMarkdown || activeProposal.summary}
                  </div>
                </div>
              )}

              {proposalTab === 'EXTENDED' && (
                <div className="space-y-4">
                  <div className="rounded-xl bg-white p-4 font-mono text-xs whitespace-pre-wrap max-h-96 overflow-y-auto leading-relaxed border border-ink-200 text-ink-900 shadow-2xs">
                    {activeProposal.extendedVersion || activeProposal.summary}
                  </div>
                </div>
              )}

              {proposalTab === 'PDF' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-ink-700">
                      Интерактивный PDF-макет предложения с фирменной стилизацией Nexora
                    </span>
                    {activeProposal.id && (
                      <a
                        href={`/api/ai/proposals/${activeProposal.id}/html`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 hover:underline bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-200"
                      >
                        <span>Печать / Открыть PDF в новом окне ↗</span>
                      </a>
                    )}
                  </div>
                  {activeProposal.structuredPdfVersion?.html ? (
                    <div className="rounded-xl border border-ink-200 overflow-hidden shadow-2xs bg-slate-100">
                      <iframe
                        srcDoc={activeProposal.structuredPdfVersion.html}
                        title="Commercial Proposal PDF Preview"
                        className="w-full h-96 border-0 bg-white"
                      />
                    </div>
                  ) : (
                    <div className="p-8 text-center text-ink-500 bg-ink-50 rounded-xl border border-ink-200">
                      HTML-представление для печати сформировано и доступно по ссылке выше.
                    </div>
                  )}
                </div>
              )}

              {proposalTab === 'VERIFICATION' && (
                <div className="space-y-3">
                  <div className="p-3.5 bg-gradient-to-br from-indigo-50 to-white rounded-xl border border-indigo-100 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-black text-xs text-indigo-950 uppercase tracking-wider">
                        Автоматический аудит перед отправкой (Pre-Flight Verification)
                      </span>
                      <span className="font-extrabold text-xs px-2 py-0.5 rounded bg-indigo-100 text-indigo-900">
                        {activeProposal.verification?.isApproved ? 'Утверждено к отправке' : 'Внимание'}
                      </span>
                    </div>
                    <p className="text-[11px] text-ink-600">
                      Движок валидирует отсутствие вымышленных фактов, математическую корректность сметы, реалистичность сроков и прямое соответствие выявленным проблемам клиента.
                    </p>
                  </div>

                  {activeProposal.verification && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div className="p-3 bg-white rounded-xl border border-emerald-200 shadow-2xs space-y-1">
                        <div className="flex items-center gap-1.5 font-bold text-xs text-emerald-900">
                          <span>✓ Проверка фактов и контекста</span>
                        </div>
                        <p className="text-[11px] text-ink-600">
                          {activeProposal.verification.checks.noUnconfirmedFacts
                            ? 'Все данные (название, ниша, стек, проблемы) подтверждены фактами CRM.'
                            : 'Обнаружены общие формулировки.'}
                        </p>
                      </div>

                      <div className="p-3 bg-white rounded-xl border border-emerald-200 shadow-2xs space-y-1">
                        <div className="flex items-center gap-1.5 font-bold text-xs text-emerald-900">
                          <span>✓ Проверка стоимости и сметы</span>
                        </div>
                        <p className="text-[11px] text-ink-600">
                          {activeProposal.verification.details.priceValidationDetails || 'Цены согласованы с каталогом.'}
                        </p>
                      </div>

                      <div className="p-3 bg-white rounded-xl border border-emerald-200 shadow-2xs space-y-1">
                        <div className="flex items-center gap-1.5 font-bold text-xs text-emerald-900">
                          <span>✓ Проверка дорожной карты</span>
                        </div>
                        <p className="text-[11px] text-ink-600">
                          {activeProposal.verification.details.timelineValidationDetails || 'Сроки реалистичны.'}
                        </p>
                      </div>

                      <div className="p-3 bg-white rounded-xl border border-emerald-200 shadow-2xs space-y-1">
                        <div className="flex items-center gap-1.5 font-bold text-xs text-emerald-900">
                          <span>✓ Решение болей бизнеса</span>
                        </div>
                        <p className="text-[11px] text-ink-600">
                          {activeProposal.verification.details.needsAlignmentDetails || 'Решает ключевые боли.'}
                        </p>
                      </div>
                    </div>
                  )}

                  {activeProposal.verification?.passedChecks && (
                    <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 space-y-1">
                      <span className="font-bold text-[11px] text-emerald-900 block">Пройденные критерии качества:</span>
                      <ul className="text-[11px] text-emerald-800 space-y-0.5 list-disc list-inside">
                        {activeProposal.verification.passedChecks.map((c: string, idx: number) => (
                          <li key={idx}>{c}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-ink-100 bg-ink-50/70 rounded-b-2xl flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    const textToInsert =
                      activeProposal.whatsAppVersion || activeProposal.formattedMarkdown || activeProposal.summary;
                    setDraft(textToInsert);
                    setProposalModalOpen(false);
                    toast('Текст КП вставлен в поле ввода сообщения WhatsApp!', 'success');
                  }}
                  className="font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-xs"
                >
                  <Send size={13} />
                  Вставить в чат (WhatsApp)
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const copyText =
                      proposalTab === 'EXTENDED'
                        ? activeProposal.extendedVersion || activeProposal.summary
                        : activeProposal.whatsAppVersion || activeProposal.formattedMarkdown || activeProposal.summary;
                    void navigator.clipboard.writeText(copyText);
                    toast('Текст предложения скопирован в буфер', 'success');
                  }}
                >
                  <Copy size={13} />
                  Копировать текущую вкладку
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setProposalModalOpen(false)}>
                  Закрыть
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Nexora Solution Builder — 8-Block Consultative Architecture */}
      {solutionModalOpen && solutionResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-950/70 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl border border-ink-100 flex flex-col max-h-[90vh] my-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-ink-100 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-purple-500/10 rounded-t-2xl">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="p-1 rounded-lg bg-amber-500 text-white shadow-2xs">
                    <Sparkles size={16} />
                  </span>
                  <h3 className="font-black text-base text-ink-900 leading-tight">
                    {solutionResult.solutionTitle}
                  </h3>
                  <span
                    className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${
                      solutionResult.isBundle
                        ? 'bg-purple-100 text-purple-800 border border-purple-200'
                        : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    }`}
                  >
                    {solutionResult.isBundle ? '🔥 Комплексный пакет' : solutionResult.productType}
                  </span>
                  <span className="text-[10px] font-bold text-ink-600 bg-white px-2 py-0.5 rounded-full border border-ink-200">
                    Точность AI: {(solutionResult.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <p className="text-xs text-ink-600 font-medium">{solutionResult.headline}</p>
              </div>
              <button
                onClick={() => setSolutionModalOpen(false)}
                className="text-ink-400 hover:text-ink-700 p-1 rounded-lg hover:bg-ink-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body: 8 Consultative Blocks */}
            <div className="p-5 space-y-4 overflow-y-auto max-h-[calc(90vh-140px)] text-xs text-ink-800">
              {/* Grounded Pains Notice */}
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-amber-950 text-xs">
                  <AlertCircle size={14} className="text-amber-700 shrink-0" />
                  <span>Привязка к выявленным узким местам (Grounded Pains):</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {solutionResult.groundedPains.map((gp, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 bg-white px-2 py-1 rounded-lg text-[11px] font-semibold text-amber-900 border border-amber-200 shadow-2xs"
                      title={gp.impact}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                      {gp.pain}
                      <span className="text-[9px] font-bold text-amber-600 uppercase bg-amber-100 px-1 rounded">
                        {gp.source}
                      </span>
                    </span>
                  ))}
                </div>
              </div>

              {/* 8-Block Consultative Pitch Sequence */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* 1. Problem */}
                <div className="p-3.5 bg-ink-50/60 rounded-xl border border-ink-100 space-y-1.5">
                  <span className="text-[10px] font-black text-rose-700 uppercase tracking-wider block">
                    📌 1. Выявленная проблема (PROBLEM)
                  </span>
                  <p className="text-xs text-ink-900 leading-relaxed font-medium">
                    {solutionResult.pitch.problem}
                  </p>
                </div>

                {/* 2. Why it matters */}
                <div className="p-3.5 bg-ink-50/60 rounded-xl border border-ink-100 space-y-1.5">
                  <span className="text-[10px] font-black text-amber-700 uppercase tracking-wider block">
                    ⚠️ 2. В чем риски и потери (WHY IT MATTERS)
                  </span>
                  <p className="text-xs text-ink-900 leading-relaxed font-medium">
                    {solutionResult.pitch.whyItMatters}
                  </p>
                </div>

                {/* 3. Solution */}
                <div className="p-3.5 bg-purple-50/50 rounded-xl border border-purple-100 space-y-1.5 md:col-span-2">
                  <span className="text-[10px] font-black text-purple-800 uppercase tracking-wider block">
                    💡 3. Целевое решение Nexora (SOLUTION)
                  </span>
                  <p className="text-xs text-purple-950 font-bold leading-relaxed">
                    {solutionResult.pitch.solution}
                  </p>
                  {/* Products deliverables preview */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1.5">
                    {solutionResult.matchedProducts.map((p, idx) => (
                      <div key={idx} className="bg-white p-2.5 rounded-lg border border-purple-200/70 shadow-2xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-black text-[11px] text-purple-900">{p.title}</span>
                          <span className="text-[10px] font-bold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded">
                            ~{p.estimatedWeeks} нед.
                          </span>
                        </div>
                        <ul className="text-[11px] text-ink-700 space-y-0.5 list-disc list-inside">
                          {p.keyFeatures.slice(0, 3).map((f, fIdx) => (
                            <li key={fIdx} className="line-clamp-1">{f}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 4. How it works */}
                <div className="p-3.5 bg-ink-50/60 rounded-xl border border-ink-100 space-y-1.5">
                  <span className="text-[10px] font-black text-indigo-700 uppercase tracking-wider block">
                    ⚙️ 4. Как это работает (HOW IT WORKS)
                  </span>
                  <p className="text-xs text-ink-900 leading-relaxed font-medium whitespace-pre-line">
                    {solutionResult.pitch.howItWorks}
                  </p>
                </div>

                {/* 5. Expected Result & ROI */}
                <div className="p-3.5 bg-emerald-50/60 rounded-xl border border-emerald-100 space-y-2">
                  <span className="text-[10px] font-black text-emerald-800 uppercase tracking-wider block">
                    📈 5. Ожидаемый результат (EXPECTED RESULT)
                  </span>
                  <p className="text-xs text-emerald-950 font-medium whitespace-pre-line leading-relaxed">
                    {solutionResult.pitch.expectedResult}
                  </p>
                  {solutionResult.expectedRoi && (
                    <div className="p-2 bg-white rounded-lg border border-emerald-200 text-[11px] space-y-0.5">
                      <div className="font-bold text-emerald-900">
                        ROI / Эффект: {solutionResult.expectedRoi.expectedMonthlySavingsOrRevenue}
                      </div>
                      <div className="text-emerald-700 text-[10px]">
                        Срок окупаемости: ~{solutionResult.expectedRoi.paybackPeriodMonths} мес. • {solutionResult.expectedRoi.keyMetric}
                      </div>
                    </div>
                  )}
                </div>

                {/* 6. Implementation Roadmap */}
                <div className="p-3.5 bg-ink-50/60 rounded-xl border border-ink-100 space-y-1.5 md:col-span-2">
                  <span className="text-[10px] font-black text-sky-800 uppercase tracking-wider block">
                    ⏱ 6. План внедрения (IMPLEMENTATION)
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                    {solutionResult.implementationRoadmap.map((stage, sIdx) => (
                      <div key={sIdx} className="bg-white p-2 rounded-lg border border-ink-200 shadow-2xs space-y-1">
                        <div className="font-bold text-[11px] text-ink-900">{stage.stage}</div>
                        <span className="text-[10px] text-sky-700 font-semibold bg-sky-50 px-1.5 py-0.5 rounded block w-fit">
                          Длительность: {stage.durationWeeks} нед.
                        </span>
                        <div className="text-[10px] text-ink-600 line-clamp-2">
                          {stage.deliverables.join(', ')}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 7. Estimated Cost & Transparency */}
                <div className="p-3.5 bg-amber-50/50 rounded-xl border border-amber-200 space-y-2">
                  <span className="text-[10px] font-black text-amber-900 uppercase tracking-wider block">
                    💰 7. Оценка бюджета (ESTIMATED COST)
                  </span>
                  <div className="text-base font-black text-amber-950">
                    {solutionResult.pricing.minAmount.toLocaleString('ru-RU')} – {solutionResult.pricing.maxAmount.toLocaleString('ru-RU')}{' '}
                    {solutionResult.pricing.currency}
                  </div>
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    {solutionResult.pricing.reasoning}
                  </p>
                  {solutionResult.pricing.requiredClarifications.length > 0 && (
                    <div className="pt-1 text-[10px] text-amber-900/80 space-y-0.5">
                      <span className="font-bold block">Для точного фиксирования сметы требуется:</span>
                      <ul className="list-disc list-inside space-y-0.5">
                        {solutionResult.pricing.requiredClarifications.map((q, qIdx) => (
                          <li key={qIdx}>{q}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* 8. Recurring Service Option */}
                <div className="p-3.5 bg-ink-50/60 rounded-xl border border-ink-100 space-y-1.5">
                  <span className="text-[10px] font-black text-indigo-800 uppercase tracking-wider block">
                    🔄 8. Поддержка и развитие (RECURRING SERVICE)
                  </span>
                  {solutionResult.recurringOption ? (
                    <div className="space-y-1">
                      <div className="font-bold text-xs text-ink-900">
                        {solutionResult.recurringOption.name} — {solutionResult.recurringOption.monthlyCost.toLocaleString('ru-RU')}{' '}
                        {solutionResult.recurringOption.currency}/мес
                      </div>
                      <p className="text-[11px] text-ink-700 leading-relaxed">
                        {solutionResult.recurringOption.description}
                      </p>
                      <div className="flex flex-wrap gap-1 pt-1">
                        {solutionResult.recurringOption.benefits.map((b, bIdx) => (
                          <span key={bIdx} className="bg-white px-1.5 py-0.5 rounded text-[10px] text-indigo-900 font-medium border border-indigo-100">
                            ✓ {b}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-ink-700 font-medium">{solutionResult.pitch.optionalRecurringService}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-ink-100 bg-ink-50/70 rounded-b-2xl flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setDraft(solutionResult.formattedPitchMessage);
                    setSolutionModalOpen(false);
                    toast('Питч решения вставлен в поле ввода сообщения!', 'success');
                  }}
                  className="font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-xs"
                >
                  <Send size={13} />
                  Вставить питч в диалог
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  loading={isApplyingSolution}
                  onClick={async () => {
                    if (!thread?.lead?.id) return;
                    try {
                      setIsApplyingSolution(true);
                      await post('/api/ai/solution-builder/apply-to-proposal', {
                        leadId: thread.lead.id,
                        conversationId: thread.id,
                        solution: solutionResult,
                      });
                      toast('Решение успешно сохранено в CRM как Коммерческое предложение и Сделка!', 'success');
                      await loadAiCopilot(thread.id);
                    } catch (err: any) {
                      toast(err?.message || 'Ошибка сохранения в CRM', 'danger');
                    } finally {
                      setIsApplyingSolution(false);
                    }
                  }}
                  className="font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200"
                >
                  <Briefcase size={13} />
                  Сохранить как КП в CRM
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard.writeText(solutionResult.formattedPitchMessage);
                    toast('Текст питча скопирован в буфер обмена', 'success');
                  }}
                >
                  <Copy size={13} />
                  Копировать Markdown
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setSolutionModalOpen(false)}>
                  Закрыть
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Nexora Follow-Up Engine (3-Step Progression) */}
      {followUpModalOpen && followUpPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-950/70 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl border border-ink-100 flex flex-col max-h-[90vh] my-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-ink-100 bg-gradient-to-r from-teal-50 via-cyan-50 to-white rounded-t-2xl">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="p-1.5 rounded-lg bg-teal-600 text-white shadow-2xs">
                    <Clock size={16} />
                  </span>
                  <h3 className="font-black text-base text-ink-900 leading-tight">
                    Follow-up Engine: 3-Шаговая Цепочка Касаний
                  </h3>
                  {followUpPlan.isOptedOut ? (
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300">
                      🛑 Opt-Out (Отключено)
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 border border-teal-200">
                      Причина паузы: {followUpPlan.pauseReason}
                    </span>
                  )}
                </div>
                <p className="text-xs text-ink-600 font-medium">{followUpPlan.summary}</p>
              </div>
              <button
                onClick={() => setFollowUpModalOpen(false)}
                className="text-ink-400 hover:text-ink-700 p-1 rounded-lg hover:bg-ink-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 overflow-y-auto max-h-[calc(90vh-140px)] text-xs text-ink-800">
              {followUpPlan.isOptedOut ? (
                <div className="p-6 text-center space-y-3 bg-rose-50/80 rounded-2xl border border-rose-200 text-rose-950">
                  <div className="text-3xl">🛑</div>
                  <div className="font-black text-sm">Клиент зафиксирован в режиме Opt-Out</div>
                  <p className="text-xs text-rose-800 max-w-md mx-auto">
                    Клиент запросил прекращение коммуникации («не пишите мне» / «спам» / «стоп»).
                    Все повторные контакты автоматически заблокированы.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {followUpPlan.plannedFollowUps.map((step) => (
                    <div
                      key={step.stepNumber}
                      className="p-4 rounded-xl border border-ink-200 bg-white space-y-3 shadow-2xs hover:border-teal-300 transition-colors"
                    >
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-teal-100 text-teal-800 font-black flex items-center justify-center text-xs">
                            {step.stepNumber}
                          </span>
                          <span className="font-black text-xs text-ink-900">
                            {step.stepNumber === 1
                              ? 'Шаг 1: Напомнить о контексте & Эмпатия'
                              : step.stepNumber === 2
                              ? 'Шаг 2: Дополнительная ценность & Инсайт'
                              : 'Шаг 3: Конкретный следующий шаг & Дедлайн'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="font-bold text-ink-500">
                            📅 {new Date(step.scheduledFor).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-ink-100 text-ink-700 font-semibold text-[10px]">
                            {step.channel}
                          </span>
                        </div>
                      </div>

                      <div className="text-[11px] text-ink-600 bg-ink-50 p-2 rounded-lg border border-ink-100">
                        <span className="font-bold text-ink-700">Цель касания: </span>
                        {step.reason}
                      </div>

                      <div className="rounded-xl bg-ink-900 text-teal-300 p-3 font-mono text-xs whitespace-pre-wrap leading-relaxed shadow-inner">
                        {step.message}
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <div className="flex gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setDraft(step.message);
                              setFollowUpModalOpen(false);
                              toast(`Текст шага ${step.stepNumber} вставлен в поле ввода!`, 'success');
                            }}
                            className="font-bold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 text-xs"
                          >
                            <Send size={12} />
                            Вставить в чат
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              void navigator.clipboard.writeText(step.message);
                              toast(`Текст шага ${step.stepNumber} скопирован в буфер`, 'success');
                            }}
                          >
                            <Copy size={12} />
                            Копировать
                          </Button>
                        </div>

                        {step.id && (
                          <Button
                            variant="primary"
                            size="sm"
                            loading={isExecutingFollowUp}
                            onClick={async () => {
                              try {
                                setIsExecutingFollowUp(true);
                                await post('/api/ai/follow-up/execute', {
                                  followUpJobId: step.id,
                                });
                                toast(`Follow-up (Шаг ${step.stepNumber}) успешно отправлен!`, 'success');
                                if (thread?.id) await loadAiCopilot(thread.id);
                                setFollowUpModalOpen(false);
                              } catch (err: any) {
                                toast(err?.message || 'Ошибка отправки follow-up', 'danger');
                              } finally {
                                setIsExecutingFollowUp(false);
                              }
                            }}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
                          >
                            <Send size={12} />
                            Отправить клиенту сейчас
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-ink-100 bg-ink-50/70 rounded-b-2xl flex items-center justify-between gap-2 flex-wrap">
              {!followUpPlan.isOptedOut && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={async () => {
                    if (!thread?.id) return;
                    try {
                      await post('/api/ai/follow-up/cancel', { conversationId: thread.id });
                      toast('Все запланированные фоллоу-апы отменены.', 'info');
                      setFollowUpModalOpen(false);
                      await loadAiCopilot(thread.id);
                    } catch (err: any) {
                      toast(err?.message || 'Ошибка отмены', 'danger');
                    }
                  }}
                  className="font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200"
                >
                  Отменить все фоллоу-апы
                </Button>
              )}

              <Button variant="secondary" size="sm" onClick={() => setFollowUpModalOpen(false)}>
                Закрыть
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* 5. Pre-Flight Guardrails 5-Point Verification Modal */}
      {preFlightModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-xs animate-in fade-in">
          <div className="relative flex max-h-[90vh] w-full max-w-xl flex-col rounded-2xl bg-white shadow-2xl border border-ink-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-ink-100 p-5 bg-gradient-to-r from-cyan-50 via-sky-50 to-white rounded-t-2xl">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-cyan-600 text-white flex items-center justify-center font-bold shadow-xs">
                    <ShieldCheck size={18} />
                  </div>
                  <h3 className="font-black text-base text-ink-900 leading-tight">
                    Pre-Flight Guardrail: 5-Точечный Аудит AI
                  </h3>
                </div>
                <p className="text-xs text-ink-600 font-medium">
                  Обязательная автоматическая проверка безопасности перед каждой отправкой сообщения AI.
                </p>
              </div>
              <button
                onClick={() => setPreFlightModalOpen(false)}
                className="text-ink-400 hover:text-ink-700 p-1 rounded-lg hover:bg-ink-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 overflow-y-auto max-h-[calc(90vh-140px)] text-xs text-ink-800">
              {loadingPreFlight ? (
                <div className="py-12 text-center text-xs text-ink-400">
                  <RefreshCw size={24} className="animate-spin mx-auto text-cyan-600 mb-2" />
                  Выполняется верификация 5 параметров безопасности…
                </div>
              ) : preFlightResult ? (
                <div className="space-y-3">
                  {/* Overall Status Banner */}
                  <div
                    className={clsx(
                      'p-4 rounded-xl border flex items-center gap-3',
                      preFlightResult.allowed
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                        : 'bg-rose-50 border-rose-300 text-rose-950',
                    )}
                  >
                    {preFlightResult.allowed ? (
                      <CheckCircle2 size={24} className="text-emerald-600 shrink-0" />
                    ) : (
                      <ShieldAlert size={24} className="text-rose-600 shrink-0" />
                    )}
                    <div>
                      <div className="font-black text-xs">
                        {preFlightResult.allowed
                          ? '✅ Все 5 проверок пройдены — Отправка разрешена'
                          : '🚫 Отправка заблокирована проверкой безопасности'}
                      </div>
                      {preFlightResult.blockedReason && (
                        <div className="text-[11px] text-rose-700 mt-0.5 font-medium">
                          Причина: {preFlightResult.blockedReason}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 5 Checks Cards */}
                  <div className="space-y-2.5">
                    {/* Check 1 */}
                    <div className="p-3 rounded-xl border border-ink-200 bg-white space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-ink-900 flex items-center gap-1.5">
                          {preFlightResult.checks.isChannelAllowed.passed ? '✅' : '❌'} 1. Разрешён ли канал
                        </span>
                        <span
                          className={clsx(
                            'text-[10px] font-bold px-2 py-0.5 rounded-full',
                            preFlightResult.checks.isChannelAllowed.passed
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800',
                          )}
                        >
                          {preFlightResult.checks.isChannelAllowed.passed ? 'PASSED' : 'BLOCKED'}
                        </span>
                      </div>
                      <p className="text-[11px] text-ink-600">{preFlightResult.checks.isChannelAllowed.reason}</p>
                    </div>

                    {/* Check 2 */}
                    <div className="p-3 rounded-xl border border-ink-200 bg-white space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-ink-900 flex items-center gap-1.5">
                          {preFlightResult.checks.isMessageAllowed.passed ? '✅' : '❌'} 2. Разрешено ли сообщение (WhatsApp Policy)
                        </span>
                        <span
                          className={clsx(
                            'text-[10px] font-bold px-2 py-0.5 rounded-full',
                            preFlightResult.checks.isMessageAllowed.passed
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800',
                          )}
                        >
                          {preFlightResult.checks.isMessageAllowed.passed ? 'PASSED' : 'BLOCKED'}
                        </span>
                      </div>
                      <p className="text-[11px] text-ink-600">{preFlightResult.checks.isMessageAllowed.reason}</p>
                    </div>

                    {/* Check 3 */}
                    <div className="p-3 rounded-xl border border-ink-200 bg-white space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-ink-900 flex items-center gap-1.5">
                          {preFlightResult.checks.isOptOut.passed ? '✅' : '❌'} 3. Нет ли Opt-Out / Отказа
                        </span>
                        <span
                          className={clsx(
                            'text-[10px] font-bold px-2 py-0.5 rounded-full',
                            preFlightResult.checks.isOptOut.passed
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800',
                          )}
                        >
                          {preFlightResult.checks.isOptOut.passed ? 'PASSED' : 'BLOCKED'}
                        </span>
                      </div>
                      <p className="text-[11px] text-ink-600">{preFlightResult.checks.isOptOut.reason}</p>
                    </div>

                    {/* Check 4 */}
                    <div className="p-3 rounded-xl border border-ink-200 bg-white space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-ink-900 flex items-center gap-1.5">
                          {preFlightResult.checks.isRateLimitAllowed.passed ? '✅' : '❌'} 4. Не превышен ли Rate Limit
                        </span>
                        <span
                          className={clsx(
                            'text-[10px] font-bold px-2 py-0.5 rounded-full',
                            preFlightResult.checks.isRateLimitAllowed.passed
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800',
                          )}
                        >
                          {preFlightResult.checks.isRateLimitAllowed.passed ? 'PASSED' : 'BLOCKED'}
                        </span>
                      </div>
                      <p className="text-[11px] text-ink-600">{preFlightResult.checks.isRateLimitAllowed.reason}</p>
                    </div>

                    {/* Check 5 */}
                    <div className="p-3 rounded-xl border border-ink-200 bg-white space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-ink-900 flex items-center gap-1.5">
                          {preFlightResult.checks.isHumanHandoffRequired.passed ? '✅' : '❌'} 5. Не требуется ли Human Handoff
                        </span>
                        <span
                          className={clsx(
                            'text-[10px] font-bold px-2 py-0.5 rounded-full',
                            preFlightResult.checks.isHumanHandoffRequired.passed
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800',
                          )}
                        >
                          {preFlightResult.checks.isHumanHandoffRequired.passed ? 'PASSED' : 'BLOCKED'}
                        </span>
                      </div>
                      <p className="text-[11px] text-ink-600">{preFlightResult.checks.isHumanHandoffRequired.reason}</p>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-ink-100 bg-ink-50/70 rounded-b-2xl flex items-center justify-between gap-2">
              <span className="text-[10px] text-ink-500 font-mono">
                Проверено: {preFlightResult?.validatedAt ? new Date(preFlightResult.validatedAt).toLocaleTimeString('ru-RU') : '—'}
              </span>
              <Button variant="secondary" size="sm" onClick={() => setPreFlightModalOpen(false)}>
                Закрыть
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
