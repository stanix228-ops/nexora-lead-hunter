'use client';

import { useState, useEffect, useCallback } from 'react';
import clsx from 'clsx';
import {
  Users,
  Briefcase,
  Kanban,
  Table as TableIcon,
  Search,
  Filter,
  Plus,
  RefreshCw,
  Sparkles,
  Download,
  Phone,
  Mail,
  Send,
  Building,
  UserCheck,
  TrendingUp,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Pin,
  Trash2,
  Edit2,
  Layers,
  Brain,
  History,
  Shield,
  FileText,
  ChevronRight,
  X,
  Flame,
  ArrowRight,
} from 'lucide-react';
import { get, post, patch, del } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { useSocket } from '@/lib/auth';

// ------------------------------------------------ Types
interface Client {
  id: string;
  contactName: string | null;
  companyName: string | null;
  position: string | null;
  phone: string | null;
  email: string | null;
  telegram: string | null;
  whatsappUrl: string | null;
  instagramUrl: string | null;
  website: string | null;
  city: string | null;
  country: string | null;
  niche: string | null;
  businessSize: 'MICRO' | 'SMALL' | 'MEDIUM' | 'ENTERPRISE';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: string;
  source: string;
  assumedNeed: string | null;
  estimatedBudget: number | null;
  isDecisionMaker: boolean | null;
  decisionMakerInfo: string | null;
  dealProbability: number | null;
  notes: string | null;
  isArchived: boolean;
  score?: {
    score: number;
    grade: string;
    recommendedService: string;
    urgency: string;
    reasons?: string[];
  } | null;
  analysis?: {
    digitalMaturity: 'LOW' | 'MEDIUM' | 'HIGH' | 'ADVANCED';
    websiteStatus: string;
  } | null;
  deals?: Array<{ id: string; title: string; amount: number; stage: string }>;
  tags?: Array<{ id: string; name: string; color: string }>;
  assignedAccount?: { id: string; name: string; phoneMasked: string } | null;
  createdAt: string;
  updatedAt: string;
}

interface Deal {
  id: string;
  title: string;
  stage: 'NEW' | 'QUALIFICATION' | 'PROPOSAL' | 'NEGOTIATION' | 'WON' | 'LOST';
  serviceType: string | null;
  amount: number;
  discount: number;
  probability: number;
  nextAction: string | null;
  followUpDate: string | null;
  lostReason: string | null;
  lead?: {
    id: string;
    contactName: string | null;
    companyName: string | null;
    phone: string | null;
    email: string | null;
    city: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
}

interface MemoryItem {
  id: string;
  layer: 'SHORT_TERM' | 'LONG_TERM' | 'BUSINESS_FACT' | 'INTERACTION_FACT' | 'DEAL_FACT' | 'PREFERENCE' | 'OBJECTION' | 'AGREEMENT';
  key: string;
  value: string;
  confidence: number;
  source: 'USER' | 'AI' | 'MANUAL';
  isPinned: boolean;
  createdAt: string;
}

interface TimelineItem {
  id: string;
  eventType: string;
  title: string;
  description: string | null;
  createdAt: string;
}

const DEAL_STAGES: Array<{ key: Deal['stage']; label: string; color: string; bg: string }> = [
  { key: 'NEW', label: 'Новая заявка', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30' },
  { key: 'QUALIFICATION', label: 'Квалификация', color: 'text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/30' },
  { key: 'PROPOSAL', label: 'КП / Смета', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30' },
  { key: 'NEGOTIATION', label: 'Переговоры', color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/30' },
  { key: 'WON', label: 'Успешно закрыто', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' },
  { key: 'LOST', label: 'Отказ', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/30' },
];

const MEMORY_LAYER_NAMES: Record<string, { label: string; desc: string; icon: string }> = {
  SHORT_TERM: { label: 'Кратковременная память', desc: 'Текущий контекст диалога', icon: '⚡' },
  LONG_TERM: { label: 'Долговременная память', desc: 'Ключевые свойства клиента', icon: '🧠' },
  BUSINESS_FACT: { label: 'Факты о бизнесе', desc: 'Стек, процессы, ниша', icon: '🏢' },
  INTERACTION_FACT: { label: 'История контактов', desc: 'Звонки, переписки, договоренности', icon: '📞' },
  DEAL_FACT: { label: 'История сделок', desc: 'Бюджеты, чеки, покупки', icon: '💰' },
  PREFERENCE: { label: 'Предпочтения', desc: 'Каналы связи, дедлайны', icon: '🎯' },
  OBJECTION: { label: 'Возражения', desc: 'Зафиксированные сомнения', icon: '🛡️' },
  AGREEMENT: { label: 'Обязательства', desc: 'Согласованные следующие шаги', icon: '🤝' },
};

export default function CrmPage() {
  const { showToast } = useToast();
  const socket = useSocket();

  const [activeTab, setActiveTab] = useState<'pipeline' | 'clients'>('pipeline');
  const [loading, setLoading] = useState(false);

  // Clients state
  const [clients, setClients] = useState<Client[]>([]);
  const [totalClients, setTotalClients] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [sizeFilter, setSizeFilter] = useState('ALL');
  const [showArchived, setShowArchived] = useState(false);

  // Deals state
  const [deals, setDeals] = useState<Deal[]>([]);

  // Selected Client for Profile Drawer
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clientDrawerTab, setClientDrawerTab] = useState<'info' | 'business' | 'memory' | 'deals' | 'timeline'>('info');
  const [clientMemories, setClientMemories] = useState<Record<string, MemoryItem[]>>({});
  const [clientTimeline, setClientTimeline] = useState<TimelineItem[]>([]);
  const [clientBusiness, setClientBusiness] = useState<any>({});
  const [newNoteText, setNewNoteText] = useState('');
  const [newMemoryKey, setNewMemoryKey] = useState('');
  const [newMemoryVal, setNewMemoryVal] = useState('');
  const [newMemoryLayer, setNewMemoryLayer] = useState<string>('BUSINESS_FACT');

  // Modals
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [isDealModalOpen, setIsDealModalOpen] = useState(false);

  // Form states for Create Client
  const [newClientName, setNewClientName] = useState('');
  const [newClientCompany, setNewClientCompany] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [newClientEmail, setNewClientEmail] = useState('');
  const [newClientTelegram, setNewClientTelegram] = useState('');
  const [newClientNiche, setNewClientNiche] = useState('');
  const [newClientCity, setNewClientCity] = useState('');
  const [newClientPriority, setNewClientPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'>('MEDIUM');
  const [newClientSize, setNewClientSize] = useState<'MICRO' | 'SMALL' | 'MEDIUM' | 'ENTERPRISE'>('SMALL');

  // Form states for Create Deal
  const [newDealTitle, setNewDealTitle] = useState('');
  const [newDealLeadId, setNewDealLeadId] = useState('');
  const [newDealAmount, setNewDealAmount] = useState<number>(50000);
  const [newDealService, setNewDealService] = useState('WEB');
  const [newDealStage, setNewDealStage] = useState<Deal['stage']>('NEW');

  // Fetch Clients
  const fetchClients = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = {
        page: '1',
        pageSize: '100',
        archived: showArchived ? 'true' : 'false',
      };
      if (searchQuery) params.search = searchQuery;
      if (statusFilter !== 'ALL') params.status = statusFilter;
      if (priorityFilter !== 'ALL') params.priority = priorityFilter;
      if (sizeFilter !== 'ALL') params.businessSize = sizeFilter;

      const res = await get<{ items: Client[]; total: number }>('/api/crm/clients', params);
      setClients(res.items || []);
      setTotalClients(res.total || 0);
    } catch (err: any) {
      showToast('Ошибка загрузки клиентов', err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, statusFilter, priorityFilter, sizeFilter, showArchived, showToast]);

  // Fetch Deals
  const fetchDeals = useCallback(async () => {
    try {
      const res = await get<Deal[]>('/api/crm/deals');
      setDeals(res || []);
    } catch (err: any) {
      showToast('Ошибка загрузки сделок', err.message, 'error');
    }
  }, [showToast]);

  useEffect(() => {
    void fetchClients();
    void fetchDeals();
  }, [fetchClients, fetchDeals]);

  // Open Client Profile & fetch deep details
  const openClientProfile = async (client: Client) => {
    setSelectedClient(client);
    setClientDrawerTab('info');
    try {
      const [fullProfile, memRes, timelineRes, busRes] = await Promise.all([
        get<any>(`/api/crm/clients/${client.id}`),
        get<{ layers: Record<string, MemoryItem[]> }>(`/api/crm/leads/${client.id}/memory`),
        get<TimelineItem[]>(`/api/crm/leads/${client.id}/timeline`),
        get<any>(`/api/crm/clients/${client.id}/business`),
      ]);
      setSelectedClient(fullProfile);
      setClientMemories(memRes.layers || {});
      setClientTimeline(timelineRes || []);
      setClientBusiness(busRes || {});
    } catch (err: any) {
      showToast('Ошибка загрузки профиля', err.message, 'error');
    }
  };

  // Recalculate AI Score
  const handleRecalculateScore = async (leadId: string) => {
    try {
      showToast('AI пересчитывает скоринг...', 'Анализ цифрового следа и диалогов...', 'info');
      const res = await post<{ ok: boolean; score: any }>(`/api/crm/clients/${leadId}/recalculate-score`, {});
      showToast('Скоринг обновлен', `Оценка: ${res.score.score}/100 (${res.score.grade})`, 'success');
      void fetchClients();
      if (selectedClient && selectedClient.id === leadId) {
        void openClientProfile({ ...selectedClient, score: res.score });
      }
    } catch (err: any) {
      showToast('Ошибка скоринга', err.message, 'error');
    }
  };

  // Change Deal Stage
  const handleStageChange = async (dealId: string, nextStage: Deal['stage']) => {
    try {
      await patch(`/api/crm/deals/${dealId}/stage`, { stage: nextStage });
      showToast('Этап сделки обновлен', `Переведено в: ${nextStage}`, 'success');
      void fetchDeals();
      if (selectedClient) void openClientProfile(selectedClient);
    } catch (err: any) {
      showToast('Ошибка смены этапа', err.message, 'error');
    }
  };

  // Create Client
  const handleCreateClient = async () => {
    try {
      await post('/api/crm/clients', {
        contactName: newClientName || null,
        companyName: newClientCompany || null,
        phone: newClientPhone || null,
        email: newClientEmail || null,
        telegram: newClientTelegram || null,
        niche: newClientNiche || null,
        city: newClientCity || null,
        priority: newClientPriority,
        businessSize: newClientSize,
      });
      showToast('Клиент добавлен', undefined, 'success');
      setIsClientModalOpen(false);
      setNewClientName('');
      setNewClientCompany('');
      setNewClientPhone('');
      setNewClientEmail('');
      void fetchClients();
    } catch (err: any) {
      showToast('Ошибка создания', err.message, 'error');
    }
  };

  // Create Deal
  const handleCreateDeal = async () => {
    try {
      if (!newDealLeadId || !newDealTitle) {
        showToast('Заполните название и выберите клиента', undefined, 'error');
        return;
      }
      await post('/api/crm/deals', {
        leadId: newDealLeadId,
        title: newDealTitle,
        amount: Number(newDealAmount),
        serviceType: newDealService,
        stage: newDealStage,
      });
      showToast('Сделка создана', undefined, 'success');
      setIsDealModalOpen(false);
      setNewDealTitle('');
      void fetchDeals();
    } catch (err: any) {
      showToast('Ошибка создания сделки', err.message, 'error');
    }
  };

  // Add Memory Fact
  const handleAddMemory = async () => {
    if (!selectedClient || !newMemoryKey || !newMemoryVal) return;
    try {
      await post(`/api/crm/leads/${selectedClient.id}/memory`, {
        layer: newMemoryLayer,
        key: newMemoryKey,
        value: newMemoryVal,
        source: 'MANUAL',
      });
      showToast('Факт зафиксирован в памяти AI', undefined, 'success');
      setNewMemoryKey('');
      setNewMemoryVal('');
      void openClientProfile(selectedClient);
    } catch (err: any) {
      showToast('Ошибка сохранения', err.message, 'error');
    }
  };

  // Add Timeline Note
  const handleAddNote = async () => {
    if (!selectedClient || !newNoteText) return;
    try {
      await post(`/api/crm/leads/${selectedClient.id}/timeline/note`, { note: newNoteText });
      showToast('Заметка добавлена в хронику', undefined, 'success');
      setNewNoteText('');
      void openClientProfile(selectedClient);
    } catch (err: any) {
      showToast('Ошибка добавления', err.message, 'error');
    }
  };

  // Calculate Pipeline Sum
  const pipelineValue = deals
    .filter((d) => d.stage !== 'LOST')
    .reduce((acc, d) => acc + (d.amount || 0), 0);
  const wonValue = deals
    .filter((d) => d.stage === 'WON')
    .reduce((acc, d) => acc + (d.amount || 0), 0);

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 bg-slate-950 text-slate-100 min-h-screen">
      {/* Header & Metrics */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-800/80 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight bg-gradient-to-r from-emerald-400 to-indigo-400 bg-clip-text text-transparent">
              Nexora CRM & AI Память
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              8-Layer Memory
            </span>
          </div>
          <p className="text-slate-400 text-sm mt-1">
            Единое управление клиентами, воронкой сделок, цифровым анализом бизнеса и памятью AI Sales Agent
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            className="border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300"
            onClick={() => {
              window.open('/api/crm/clients/export?maskPii=true', '_blank');
            }}
          >
            <Shield className="w-4 h-4 mr-2 text-emerald-400" />
            Экспорт (PII Защита)
          </Button>

          <Button
            variant="secondary"
            className="border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300"
            onClick={() => setIsDealModalOpen(true)}
          >
            <Briefcase className="w-4 h-4 mr-2 text-indigo-400" />
            Новая сделка
          </Button>

          <Button
            className="bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/30"
            onClick={() => setIsClientModalOpen(true)}
          >
            <Plus className="w-4 h-4 mr-2" />
            Новый клиент
          </Button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Всего клиентов в CRM</span>
            <Users className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold mt-2 text-slate-100">{totalClients}</div>
          <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            Синхронизировано с базой
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Объем воронки (Pipeline)</span>
            <TrendingUp className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold mt-2 text-slate-100">{new Intl.NumberFormat('ru-RU').format(pipelineValue)} ₸</div>
          <div className="text-xs text-slate-500 mt-1">{deals.length} активных сделок в работе</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Успешно закрыто (Won)</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold mt-2 text-emerald-400">{new Intl.NumberFormat('ru-RU').format(wonValue)} ₸</div>
          <div className="text-xs text-slate-500 mt-1">Оплаченные контракты</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>AI Память и Скоринг</span>
            <Brain className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold mt-2 text-purple-400">8 Слоев</div>
          <div className="text-xs text-slate-500 mt-1">Факты, возражения, сделки, ЛПР</div>
        </div>
      </div>

      {/* Navigation Tabs (Pipeline vs Clients) */}
      <div className="flex items-center justify-between border-b border-slate-800">
        <div className="flex space-x-2">
          <button
            onClick={() => setActiveTab('pipeline')}
            className={clsx(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
              activeTab === 'pipeline'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200',
            )}
          >
            <Kanban className="w-4 h-4" />
            Воронка сделок (Kanban)
            <span className="ml-1.5 px-2 py-0.5 rounded-full text-xs bg-slate-800 text-slate-300">
              {deals.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('clients')}
            className={clsx(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
              activeTab === 'clients'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200',
            )}
          >
            <TableIcon className="w-4 h-4" />
            База клиентов
            <span className="ml-1.5 px-2 py-0.5 rounded-full text-xs bg-slate-800 text-slate-300">
              {totalClients}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="text-slate-400 hover:text-slate-200"
            onClick={() => {
              void fetchClients();
              void fetchDeals();
            }}
          >
            <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: DEAL PIPELINE (KANBAN) */}
      {/* ========================================================================= */}
      {activeTab === 'pipeline' && (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 overflow-x-auto pb-4">
          {DEAL_STAGES.map((col) => {
            const stageDeals = deals.filter((d) => d.stage === col.key);
            const colTotal = stageDeals.reduce((sum, d) => sum + (d.amount || 0), 0);

            return (
              <div key={col.key} className="flex flex-col rounded-xl bg-slate-900/60 border border-slate-800/80 p-3 min-w-[240px]">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <div>
                    <h3 className={clsx('text-xs font-semibold uppercase tracking-wider', col.color)}>
                      {col.label}
                    </h3>
                    <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                      {new Intl.NumberFormat('ru-RU').format(colTotal)} ₸
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-xs bg-slate-800 text-slate-300 font-semibold">
                    {stageDeals.length}
                  </span>
                </div>

                <div className="space-y-3 mt-3 flex-1 overflow-y-auto max-h-[calc(100vh-360px)]">
                  {stageDeals.map((deal) => (
                    <div
                      key={deal.id}
                      className="p-3 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 transition shadow-sm cursor-pointer group"
                      onClick={() => {
                        if (deal.lead) {
                          openClientProfile(deal.lead as any);
                        }
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-medium text-sm text-slate-200 group-hover:text-emerald-400 transition">
                          {deal.title}
                        </div>
                      </div>

                      <div className="text-xs text-slate-400 mt-1 font-semibold text-emerald-400">
                        {new Intl.NumberFormat('ru-RU').format(deal.amount)} ₸
                      </div>

                      {deal.lead && (
                        <div className="text-xs text-slate-400 mt-2 flex items-center gap-1">
                          <Building className="w-3 h-3 text-slate-500" />
                          <span className="truncate">{deal.lead.companyName || deal.lead.contactName || 'Клиент'}</span>
                        </div>
                      )}

                      {deal.nextAction && (
                        <div className="text-[11px] text-indigo-400 mt-2 p-1.5 rounded bg-indigo-500/10 border border-indigo-500/20 truncate">
                          👉 {deal.nextAction}
                        </div>
                      )}

                      {/* Quick stage switch */}
                      <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-800/80 text-[11px] text-slate-500">
                        <span>Вероятность: {deal.probability}%</span>
                        <div className="flex items-center gap-1">
                          {col.key !== 'WON' && (
                            <button
                              title="Перевести на следующий этап"
                              className="p-1 hover:text-emerald-400 text-slate-400"
                              onClick={(e) => {
                                e.stopPropagation();
                                const nextIndex = DEAL_STAGES.findIndex((s) => s.key === col.key) + 1;
                                if (nextIndex < DEAL_STAGES.length) {
                                  handleStageChange(deal.id, DEAL_STAGES[nextIndex]!.key);
                                }
                              }}
                            >
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  {stageDeals.length === 0 && (
                    <div className="text-center py-8 text-xs text-slate-600">
                      Нет сделок
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: CLIENTS LIST & TABLE */}
      {/* ========================================================================= */}
      {activeTab === 'clients' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 p-4 rounded-xl bg-slate-900/80 border border-slate-800">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
              <Input
                placeholder="Поиск по имени, компании, телефону, email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-slate-950 border-slate-800 text-slate-200 text-sm"
              />
            </div>

            <Select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="bg-slate-950 border-slate-800 text-slate-200 text-sm"
            >
              <option value="ALL">Все приоритеты</option>
              <option value="URGENT">🔥 Срочный (URGENT)</option>
              <option value="HIGH">Высокий (HIGH)</option>
              <option value="MEDIUM">Средний (MEDIUM)</option>
              <option value="LOW">Низкий (LOW)</option>
            </Select>

            <Select
              value={sizeFilter}
              onChange={(e) => setSizeFilter(e.target.value)}
              className="bg-slate-950 border-slate-800 text-slate-200 text-sm"
            >
              <option value="ALL">Все размеры бизнеса</option>
              <option value="MICRO">Микробизнес</option>
              <option value="SMALL">Малый бизнес</option>
              <option value="MEDIUM">Средний бизнес</option>
              <option value="ENTERPRISE">Крупный Enterprise</option>
            </Select>

            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-950 border-slate-800 text-slate-200 text-sm"
            >
              <option value="ALL">Все статусы</option>
              <option value="NEW">Новый</option>
              <option value="CONTACTED">Связались</option>
              <option value="INTERESTED">Заинтересован</option>
              <option value="NEGOTIATION">Переговоры</option>
              <option value="CLIENT">Клиент</option>
              <option value="NO_RESPONSE">Нет ответа</option>
            </Select>

            <div className="flex items-center justify-between px-2">
              <label className="text-xs text-slate-400 flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                  className="rounded bg-slate-950 border-slate-800 text-emerald-500"
                />
                Архивные клиенты
              </label>
              <Button size="sm" variant="secondary" className="border-slate-800 text-xs" onClick={fetchClients}>
                Применить
              </Button>
            </div>
          </div>

          {/* Table */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-900 text-xs uppercase text-slate-400 font-semibold border-b border-slate-800">
                  <tr>
                    <th className="py-3.5 px-4">Клиент / Компания</th>
                    <th className="py-3.5 px-4">Контакты</th>
                    <th className="py-3.5 px-4">Ниша & Город</th>
                    <th className="py-3.5 px-4">AI Score</th>
                    <th className="py-3.5 px-4">Размер & Приоритет</th>
                    <th className="py-3.5 px-4">Статус</th>
                    <th className="py-3.5 px-4 text-right">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {clients.map((client) => (
                    <tr
                      key={client.id}
                      className="hover:bg-slate-900/80 transition cursor-pointer"
                      onClick={() => openClientProfile(client)}
                    >
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-200">
                          {client.contactName || client.companyName || 'Без названия'}
                        </div>
                        {client.companyName && client.contactName && (
                          <div className="text-xs text-slate-400">{client.companyName}</div>
                        )}
                        {client.position && (
                          <div className="text-[11px] text-indigo-400">{client.position}</div>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <div className="text-xs space-y-0.5">
                          {client.phone && <div className="text-slate-300 font-mono">📞 {client.phone}</div>}
                          {client.email && <div className="text-slate-400 truncate max-w-[160px]">✉️ {client.email}</div>}
                          {client.telegram && <div className="text-sky-400">✈️ @{client.telegram.replace('@', '')}</div>}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="text-xs">
                          <span className="font-medium text-slate-300">{client.niche || '—'}</span>
                          {client.city && <span className="text-slate-500 block">{client.city}</span>}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        {client.score ? (
                          <div className="flex items-center gap-2">
                            <span
                              className={clsx(
                                'px-2 py-0.5 rounded text-xs font-bold',
                                client.score.grade === 'HOT'
                                  ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                                  : client.score.grade === 'WARM'
                                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                                  : 'bg-slate-800 text-slate-400',
                              )}
                            >
                              {client.score.score}/100
                            </span>
                            <span className="text-xs text-slate-400">{client.score.recommendedService}</span>
                          </div>
                        ) : (
                          <button
                            className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRecalculateScore(client.id);
                            }}
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            Рассчитать
                          </button>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <div className="space-y-1">
                          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-300 block w-fit">
                            {client.businessSize}
                          </span>
                          <span
                            className={clsx(
                              'px-2 py-0.5 rounded text-[11px] font-medium block w-fit',
                              client.priority === 'URGENT'
                                ? 'bg-rose-500/10 text-rose-400'
                                : client.priority === 'HIGH'
                                ? 'bg-amber-500/10 text-amber-400'
                                : 'bg-slate-800 text-slate-400',
                            )}
                          >
                            {client.priority}
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {client.status}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-slate-400 hover:text-slate-200"
                          onClick={(e) => {
                            e.stopPropagation();
                            openClientProfile(client);
                          }}
                        >
                          Открыть <ChevronRight className="w-4 h-4 ml-1" />
                        </Button>
                      </td>
                    </tr>
                  ))}

                  {clients.length === 0 && !loading && (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-slate-500">
                        Клиенты не найдены
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CLIENT PROFILE DRAWER / MODAL */}
      {/* ========================================================================= */}
      {selectedClient && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-3xl bg-slate-950 border-l border-slate-800 h-full flex flex-col shadow-2xl overflow-hidden">
            {/* Drawer Header */}
            <div className="p-6 border-b border-slate-800 flex items-start justify-between bg-slate-900/60">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold text-slate-100">
                    {selectedClient.contactName || selectedClient.companyName || 'Карточка клиента'}
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    {selectedClient.status}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Компания: {selectedClient.companyName || '—'} | Ниша: {selectedClient.niche || '—'} | Город:{' '}
                  {selectedClient.city || '—'}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  className="border-slate-800 text-xs text-indigo-400 hover:bg-slate-900"
                  onClick={() => handleRecalculateScore(selectedClient.id)}
                >
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                  Пересчитать AI Score
                </Button>
                <button
                  onClick={() => setSelectedClient(null)}
                  className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Drawer Tabs */}
            <div className="flex border-b border-slate-800 px-6 bg-slate-900/30 overflow-x-auto">
              <button
                onClick={() => setClientDrawerTab('info')}
                className={clsx(
                  'px-4 py-3 text-xs font-semibold border-b-2 transition whitespace-nowrap',
                  clientDrawerTab === 'info'
                    ? 'border-emerald-400 text-emerald-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200',
                )}
              >
                Общая информация
              </button>

              <button
                onClick={() => setClientDrawerTab('business')}
                className={clsx(
                  'px-4 py-3 text-xs font-semibold border-b-2 transition whitespace-nowrap',
                  clientDrawerTab === 'business'
                    ? 'border-emerald-400 text-emerald-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200',
                )}
              >
                Анализ бизнеса
              </button>

              <button
                onClick={() => setClientDrawerTab('memory')}
                className={clsx(
                  'px-4 py-3 text-xs font-semibold border-b-2 transition whitespace-nowrap flex items-center gap-1.5',
                  clientDrawerTab === 'memory'
                    ? 'border-emerald-400 text-emerald-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200',
                )}
              >
                <Brain className="w-3.5 h-3.5" />
                Память AI (8 слоев)
              </button>

              <button
                onClick={() => setClientDrawerTab('deals')}
                className={clsx(
                  'px-4 py-3 text-xs font-semibold border-b-2 transition whitespace-nowrap',
                  clientDrawerTab === 'deals'
                    ? 'border-emerald-400 text-emerald-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200',
                )}
              >
                Сделки
              </button>

              <button
                onClick={() => setClientDrawerTab('timeline')}
                className={clsx(
                  'px-4 py-3 text-xs font-semibold border-b-2 transition whitespace-nowrap flex items-center gap-1.5',
                  clientDrawerTab === 'timeline'
                    ? 'border-emerald-400 text-emerald-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200',
                )}
              >
                <History className="w-3.5 h-3.5" />
                Хроника событий
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* SUB-TAB 1: INFO */}
              {clientDrawerTab === 'info' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                      <div className="text-xs text-slate-400">ФИО / Контактное лицо</div>
                      <div className="text-sm font-semibold text-slate-200 mt-1">
                        {selectedClient.contactName || '—'}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                      <div className="text-xs text-slate-400">Должность</div>
                      <div className="text-sm font-semibold text-slate-200 mt-1">
                        {selectedClient.position || '—'}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                      <div className="text-xs text-slate-400">Телефон</div>
                      <div className="text-sm font-semibold text-emerald-400 font-mono mt-1">
                        {selectedClient.phone || '—'}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                      <div className="text-xs text-slate-400">Email</div>
                      <div className="text-sm font-semibold text-slate-200 mt-1">
                        {selectedClient.email || '—'}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                      <div className="text-xs text-slate-400">Telegram</div>
                      <div className="text-sm font-semibold text-sky-400 mt-1">
                        {selectedClient.telegram ? `@${selectedClient.telegram.replace('@', '')}` : '—'}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                      <div className="text-xs text-slate-400">Сайт</div>
                      <div className="text-sm font-semibold text-indigo-400 mt-1 truncate">
                        {selectedClient.website || '—'}
                      </div>
                    </div>
                  </div>

                  {/* AI Evaluation Banner */}
                  {selectedClient.score && (
                    <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-950/40 to-slate-900 border border-indigo-500/30">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Brain className="w-5 h-5 text-indigo-400" />
                          <span className="font-bold text-sm text-indigo-300">Оценка AI Sales Brain</span>
                        </div>
                        <span className="px-2 py-0.5 rounded text-xs font-bold bg-indigo-500/20 text-indigo-300">
                          {selectedClient.score.grade} ({selectedClient.score.score}/100)
                        </span>
                      </div>
                      <div className="mt-3 text-xs text-slate-300 space-y-1">
                        <div>
                          <strong>Рекомендуемый оффер:</strong> {selectedClient.score.recommendedService}
                        </div>
                        {selectedClient.score.reasons && (
                          <div className="mt-2 space-y-1">
                            {selectedClient.score.reasons.map((r, i) => (
                              <div key={i} className="text-slate-400">
                                • {r}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  {selectedClient.notes && (
                    <div className="p-4 rounded-lg bg-slate-900 border border-slate-800">
                      <div className="text-xs text-slate-400 font-semibold mb-1">Заметки о клиенте</div>
                      <div className="text-sm text-slate-300 whitespace-pre-wrap">{selectedClient.notes}</div>
                    </div>
                  )}
                </div>
              )}

              {/* SUB-TAB 2: BUSINESS PROFILE */}
              {clientDrawerTab === 'business' && (
                <div className="space-y-6">
                  <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Цифровая зрелость бизнеса
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {clientBusiness.digitalMaturity || 'LOW'}
                      </span>
                    </div>

                    <div>
                      <div className="text-xs text-slate-400">Описание бизнеса:</div>
                      <div className="text-sm text-slate-200 mt-1">
                        {clientBusiness.description || 'Описание пока не заполнено.'}
                      </div>
                    </div>

                    {clientBusiness.foundProblems && Array.isArray(clientBusiness.foundProblems) && (
                      <div>
                        <div className="text-xs text-rose-400 font-semibold mb-2">Обнаруженные проблемы (Боли):</div>
                        <div className="space-y-1.5">
                          {clientBusiness.foundProblems.map((p: string, i: number) => (
                            <div key={i} className="text-xs text-slate-300 p-2 rounded bg-rose-500/5 border border-rose-500/20">
                              ⚠️ {p}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {clientBusiness.foundOpportunities && Array.isArray(clientBusiness.foundOpportunities) && (
                      <div>
                        <div className="text-xs text-emerald-400 font-semibold mb-2">Точки роста и автоматизации:</div>
                        <div className="space-y-1.5">
                          {clientBusiness.foundOpportunities.map((op: string, i: number) => (
                            <div key={i} className="text-xs text-slate-300 p-2 rounded bg-emerald-500/5 border border-emerald-500/20">
                              🚀 {op}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* SUB-TAB 3: 8-LAYER AI MEMORY */}
              {clientDrawerTab === 'memory' && (
                <div className="space-y-6">
                  {/* Add memory item */}
                  <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                    <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                      + Зафиксировать факт в память AI
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <Select
                        value={newMemoryLayer}
                        onChange={(e) => setNewMemoryLayer(e.target.value)}
                        className="bg-slate-950 border-slate-800 text-xs"
                      >
                        {Object.entries(MEMORY_LAYER_NAMES).map(([layerKey, val]) => (
                          <option key={layerKey} value={layerKey}>
                            {val.icon} {val.label}
                          </option>
                        ))}
                      </Select>
                      <Input
                        placeholder="Ключ (например: Бюджет, CRM, ЛПР)"
                        value={newMemoryKey}
                        onChange={(e) => setNewMemoryKey(e.target.value)}
                        className="bg-slate-950 border-slate-800 text-xs"
                      />
                      <Input
                        placeholder="Значение (например: 150 000 руб.)"
                        value={newMemoryVal}
                        onChange={(e) => setNewMemoryVal(e.target.value)}
                        className="bg-slate-950 border-slate-800 text-xs"
                      />
                    </div>
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs" onClick={handleAddMemory}>
                      Сохранить в память
                    </Button>
                  </div>

                  {/* 8 Layers list */}
                  <div className="space-y-4">
                    {Object.entries(MEMORY_LAYER_NAMES).map(([layerKey, val]) => {
                      const facts = clientMemories[layerKey] || [];
                      return (
                        <div key={layerKey} className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
                          <div className="flex items-center justify-between pb-2 border-b border-slate-800/60">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">{val.icon}</span>
                              <div>
                                <h4 className="text-xs font-bold text-slate-200">{val.label}</h4>
                                <p className="text-[10px] text-slate-500">{val.desc}</p>
                              </div>
                            </div>
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-400">
                              {facts.length}
                            </span>
                          </div>

                          <div className="mt-3 space-y-2">
                            {facts.map((fact) => (
                              <div
                                key={fact.id}
                                className={clsx(
                                  'p-2.5 rounded-lg border text-xs flex items-center justify-between',
                                  fact.isPinned
                                    ? 'bg-amber-500/5 border-amber-500/30 text-amber-200'
                                    : 'bg-slate-950 border-slate-800 text-slate-300',
                                )}
                              >
                                <div>
                                  <span className="font-semibold text-slate-200 mr-2">[{fact.key}]:</span>
                                  <span>{fact.value}</span>
                                </div>
                                <div className="flex items-center gap-1.5 text-slate-500">
                                  {fact.isPinned && <Pin className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />}
                                  <span className="text-[10px] text-slate-600">{fact.source}</span>
                                </div>
                              </div>
                            ))}

                            {facts.length === 0 && (
                              <div className="text-xs text-slate-600 py-2 italic">Данных в этом слое пока нет</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* SUB-TAB 4: DEALS */}
              {clientDrawerTab === 'deals' && (
                <div className="space-y-4">
                  {selectedClient.deals && selectedClient.deals.length > 0 ? (
                    selectedClient.deals.map((deal) => (
                      <div key={deal.id} className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                        <div className="flex items-center justify-between">
                          <h4 className="font-bold text-sm text-slate-100">{deal.title}</h4>
                          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-400">
                            {deal.stage}
                          </span>
                        </div>
                        <div className="text-sm font-semibold text-emerald-400">
                          {new Intl.NumberFormat('ru-RU').format(deal.amount)} ₸
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-xs text-slate-500">
                      Сделок по этому клиенту пока нет
                    </div>
                  )}
                </div>
              )}

              {/* SUB-TAB 5: UNIFIED TIMELINE */}
              {clientDrawerTab === 'timeline' && (
                <div className="space-y-6">
                  {/* Add note */}
                  <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                    <div className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">
                      + Добавить заметку в хронику
                    </div>
                    <textarea
                      rows={2}
                      placeholder="О чем договорились, важные детали созвона или переписки..."
                      value={newNoteText}
                      onChange={(e) => setNewNoteText(e.target.value)}
                      className="w-full p-2 rounded bg-slate-950 border border-slate-800 text-xs text-slate-200"
                    />
                    <Button size="sm" className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs" onClick={handleAddNote}>
                      Добавить запись
                    </Button>
                  </div>

                  {/* Timeline Events */}
                  <div className="space-y-3 border-l-2 border-slate-800 ml-4 pl-4">
                    {clientTimeline.map((ev) => (
                      <div key={ev.id} className="relative group">
                        <div className="absolute -left-[23px] top-1.5 w-3 h-3 rounded-full bg-emerald-500 ring-4 ring-slate-950" />
                        <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-slate-200">{ev.title}</span>
                            <span className="text-[10px] text-slate-500">
                              {new Date(ev.createdAt).toLocaleString('ru-RU')}
                            </span>
                          </div>
                          {ev.description && (
                            <p className="text-xs text-slate-400 whitespace-pre-wrap">{ev.description}</p>
                          )}
                        </div>
                      </div>
                    ))}

                    {clientTimeline.length === 0 && (
                      <div className="text-xs text-slate-600 italic">Событий пока нет</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CREATE CLIENT */}
      {/* ========================================================================= */}
      {isClientModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl bg-slate-950 border border-slate-800 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-slate-100">Новый клиент / контакт</h3>
              <button onClick={() => setIsClientModalOpen(false)} className="text-slate-500 hover:text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 font-medium">ФИО контакта</label>
                <Input
                  placeholder="Иван Иванов"
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  className="mt-1 bg-slate-900 border-slate-800"
                />
              </div>

              <div>
                <label className="text-slate-400 font-medium">Компания</label>
                <Input
                  placeholder="ООО «Ресторан Восток»"
                  value={newClientCompany}
                  onChange={(e) => setNewClientCompany(e.target.value)}
                  className="mt-1 bg-slate-900 border-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 font-medium">Телефон</label>
                  <Input
                    placeholder="+7 999 123-45-67"
                    value={newClientPhone}
                    onChange={(e) => setNewClientPhone(e.target.value)}
                    className="mt-1 bg-slate-900 border-slate-800"
                  />
                </div>
                <div>
                  <label className="text-slate-400 font-medium">Email</label>
                  <Input
                    placeholder="ceo@company.ru"
                    value={newClientEmail}
                    onChange={(e) => setNewClientEmail(e.target.value)}
                    className="mt-1 bg-slate-900 border-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 font-medium">Telegram</label>
                  <Input
                    placeholder="@username"
                    value={newClientTelegram}
                    onChange={(e) => setNewClientTelegram(e.target.value)}
                    className="mt-1 bg-slate-900 border-slate-800"
                  />
                </div>
                <div>
                  <label className="text-slate-400 font-medium">Ниша</label>
                  <Input
                    placeholder="Ресторан / Клиника"
                    value={newClientNiche}
                    onChange={(e) => setNewClientNiche(e.target.value)}
                    className="mt-1 bg-slate-900 border-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 font-medium">Размер бизнеса</label>
                  <Select
                    value={newClientSize}
                    onChange={(e) => setNewClientSize(e.target.value as any)}
                    className="mt-1 bg-slate-900 border-slate-800"
                  >
                    <option value="MICRO">Микробизнес (1-5 чел)</option>
                    <option value="SMALL">Малый бизнес (5-20 чел)</option>
                    <option value="MEDIUM">Средний бизнес (20-100 чел)</option>
                    <option value="ENTERPRISE">Enterprise (100+ чел)</option>
                  </Select>
                </div>
                <div>
                  <label className="text-slate-400 font-medium">Приоритет</label>
                  <Select
                    value={newClientPriority}
                    onChange={(e) => setNewClientPriority(e.target.value as any)}
                    className="mt-1 bg-slate-900 border-slate-800"
                  >
                    <option value="LOW">Низкий (LOW)</option>
                    <option value="MEDIUM">Средний (MEDIUM)</option>
                    <option value="HIGH">Высокий (HIGH)</option>
                    <option value="URGENT">🔥 Срочный (URGENT)</option>
                  </Select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <Button variant="secondary" className="border-slate-800" onClick={() => setIsClientModalOpen(false)}>
                Отмена
              </Button>
              <Button className="bg-emerald-600 hover:bg-emerald-500 text-white" onClick={handleCreateClient}>
                Создать контакт
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CREATE DEAL */}
      {/* ========================================================================= */}
      {isDealModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl bg-slate-950 border border-slate-800 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-slate-100">Новая сделка</h3>
              <button onClick={() => setIsDealModalOpen(false)} className="text-slate-500 hover:text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 font-medium">Название сделки</label>
                <Input
                  placeholder="Разработка Telegram Mini App для доставки"
                  value={newDealTitle}
                  onChange={(e) => setNewDealTitle(e.target.value)}
                  className="mt-1 bg-slate-900 border-slate-800"
                />
              </div>

              <div>
                <label className="text-slate-400 font-medium">Клиент</label>
                <Select
                  value={newDealLeadId}
                  onChange={(e) => setNewDealLeadId(e.target.value)}
                  className="mt-1 bg-slate-900 border-slate-800"
                >
                  <option value="">-- Выберите клиента --</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.companyName || c.contactName || c.phone}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 font-medium">Сумма (руб.)</label>
                  <Input
                    type="number"
                    value={newDealAmount}
                    onChange={(e) => setNewDealAmount(Number(e.target.value))}
                    className="mt-1 bg-slate-900 border-slate-800"
                  />
                </div>
                <div>
                  <label className="text-slate-400 font-medium">Этап воронки</label>
                  <Select
                    value={newDealStage}
                    onChange={(e) => setNewDealStage(e.target.value as any)}
                    className="mt-1 bg-slate-900 border-slate-800"
                  >
                    {DEAL_STAGES.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <Button variant="secondary" className="border-slate-800" onClick={() => setIsDealModalOpen(false)}>
                Отмена
              </Button>
              <Button className="bg-indigo-600 hover:bg-indigo-500 text-white" onClick={handleCreateDeal}>
                Создать сделку
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
