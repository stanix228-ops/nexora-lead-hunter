'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import {
  Zap,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  Bot,
  Search,
  FileSearch,
  MessageSquare,
  FileText,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  DollarSign,
  Smartphone,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Flame,
  Clock,
  Radio,
  Send,
  Building,
  Check,
  RefreshCw,
  MessageCircle,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { get, post } from '@/lib/api';
import { useSocket } from '@/lib/auth';
import { useToast } from '@/components/ui/toast';
import { Card, StatCard } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/form';

export interface AutopilotEvent {
  id: string;
  timestamp: string;
  type: 'DISCOVERY' | 'ANALYSIS' | 'SCORE' | 'OUTREACH' | 'INBOUND' | 'REASONING' | 'PROPOSAL' | 'DEAL_WON' | 'HANDOFF' | 'SYSTEM';
  title: string;
  description: string;
  companyName: string;
  leadId?: string;
  conversationId?: string;
  metadata?: Record<string, any>;
}

export interface ActiveDialogueItem {
  leadId: string;
  conversationId: string;
  companyName: string;
  phone: string;
  niche: string;
  score: number;
  grade: string;
  stage: string;
  channel: string;
  lastMessage: string;
  lastAiReply: string;
  proposalNumber?: string;
  dealAmount?: number;
  isWon?: boolean;
  extractedNeed?: string;
}

export interface AutopilotStatus {
  status: 'IDLE' | 'RUNNING' | 'PAUSED' | 'COMPLETED';
  startedAt: string | null;
  currentAction: string | null;
  options: {
    niche?: string;
    city?: string;
    channel?: 'WHATSAPP' | 'TELEGRAM' | 'EMAIL' | 'ALL';
    maxLeads?: number;
    autoCloseDeals?: boolean;
  };
  counters: {
    totalLeads: number;
    analyzedCount: number;
    contactedCount: number;
    repliesCount: number;
    proposalsCount: number;
    dealsWonCount: number;
    revenueWon: number;
  };
  events: AutopilotEvent[];
  activeDialogues: ActiveDialogueItem[];
}

export default function AutopilotPage() {
  const socket = useSocket();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedNiche, setSelectedNiche] = useState('Все ниши (Клиники, Рестораны, Авто)');
  const [selectedChannel, setSelectedChannel] = useState<'ALL' | 'WHATSAPP' | 'TELEGRAM' | 'EMAIL'>('ALL');
  const [maxLeads, setMaxLeads] = useState(5);
  const [eventFilter, setEventFilter] = useState<string>('ALL');

  const [statusData, setStatusData] = useState<AutopilotStatus>({
    status: 'IDLE',
    startedAt: null,
    currentAction: null,
    options: {
      niche: 'Все ниши (Клиники, Рестораны, Авто)',
      city: 'Алматы / Москва',
      channel: 'ALL',
      maxLeads: 5,
      autoCloseDeals: true,
    },
    counters: {
      totalLeads: 0,
      analyzedCount: 0,
      contactedCount: 0,
      repliesCount: 0,
      proposalsCount: 0,
      dealsWonCount: 0,
      revenueWon: 0,
    },
    events: [],
    activeDialogues: [],
  });

  // Fetch initial status
  const fetchStatus = useCallback(async () => {
    try {
      const data = await get<AutopilotStatus>('/api/ai/autopilot/status');
      if (data) {
        setStatusData(data);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  const [hunterJobs, setHunterJobs] = useState<any[]>([]);
  const [waAccount, setWaAccount] = useState<any | null>(null);
  const [sendingJobId, setSendingJobId] = useState<string | null>(null);

  const fetchAuxData = useCallback(async () => {
    try {
      const [jobsRes, accountsRes] = await Promise.all([
        get<{ items: any[]; total: number }>('/api/hunter/jobs?pageSize=6'),
        get<any[]>('/api/accounts'),
      ]);
      if (jobsRes?.items) setHunterJobs(jobsRes.items);
      if (accountsRes) {
        const onlineAcc = accountsRes.find((a: any) => a.status === 'ONLINE') || accountsRes[0];
        setWaAccount(onlineAcc || null);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
    void fetchAuxData();
  }, [fetchStatus, fetchAuxData]);

  const handleSendWhatsAppForHunterJob = async (jobId: string, jobName: string) => {
    setSendingJobId(jobId);
    try {
      const res = await post<{ success: boolean; message: string; result: any }>(
        `/api/hunter/jobs/${jobId}/send-whatsapp`,
        { limit: 200 },
      );
      toast(res?.message || `Рассылка в WhatsApp для «${jobName}» запущена!`, 'success');
      void fetchAuxData();
      void fetchStatus();
    } catch (err: any) {
      toast(`Ошибка отправки в WhatsApp: ${err?.message || 'Сбой'}`, 'error');
    } finally {
      setSendingJobId(null);
    }
  };

  // Realtime Socket listeners
  useEffect(() => {
    if (!socket) return;

    const onAutopilotStatus = (status: AutopilotStatus) => {
      setStatusData(status);
    };

    const onAutopilotEvent = (evt: AutopilotEvent) => {
      setStatusData((prev) => ({
        ...prev,
        events: [evt, ...prev.events.filter((e) => e.id !== evt.id)].slice(0, 80),
      }));

      // Trigger celebration confetti on won deal!
      if (evt.type === 'DEAL_WON') {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
        });
        toast(`🎉 Сделка закрыта: ${evt.companyName}!`, 'success');
      }
    };

    socket.on('autopilot.status', onAutopilotStatus);
    socket.on('autopilot.event', onAutopilotEvent);

    return () => {
      socket.off('autopilot.status', onAutopilotStatus);
      socket.off('autopilot.event', onAutopilotEvent);
    };
  }, [socket, toast]);

  // Actions
  const handleStart = async () => {
    setActionLoading(true);
    try {
      const res = await post<{ success: boolean; status: AutopilotStatus }>('/api/ai/autopilot/start', {
        niche: selectedNiche,
        channel: selectedChannel,
        maxLeads,
        autoCloseDeals: true,
      });
      if (res?.status) setStatusData(res.status);
      toast('🚀 Автопилот продаж запущен! Начинаем автономный цикл...', 'success');
    } catch (e: any) {
      toast(`Ошибка запуска: ${e.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePause = async () => {
    setActionLoading(true);
    try {
      const res = await post<{ success: boolean; status: AutopilotStatus }>('/api/ai/autopilot/pause', {});
      if (res?.status) setStatusData(res.status);
      toast('⏸ Автопилот приостановлен', 'info');
    } catch (e: any) {
      toast(`Ошибка: ${e.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResume = async () => {
    setActionLoading(true);
    try {
      const res = await post<{ success: boolean; status: AutopilotStatus }>('/api/ai/autopilot/resume', {});
      if (res?.status) setStatusData(res.status);
      toast('▶️ Автопилот возобновлен', 'success');
    } catch (e: any) {
      toast(`Ошибка: ${e.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReset = async () => {
    setActionLoading(true);
    try {
      const res = await post<{ success: boolean; status: AutopilotStatus }>('/api/ai/autopilot/reset', {});
      if (res?.status) setStatusData(res.status);
      toast('🔄 Состояние автопилота сброшено', 'info');
    } catch (e: any) {
      toast(`Ошибка: ${e.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const isRunning = statusData.status === 'RUNNING';
  const isPaused = statusData.status === 'PAUSED';

  const filteredEvents = useMemo(() => {
    if (eventFilter === 'ALL') return statusData.events;
    return statusData.events.filter((e) => e.type === eventFilter);
  }, [statusData.events, eventFilter]);

  const responseRate = statusData.counters.contactedCount > 0
    ? Math.round((statusData.counters.repliesCount / statusData.counters.contactedCount) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Top Hero Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-brand-500/20 bg-gradient-to-r from-ink-950 via-brand-950 to-ink-950 p-6 text-white shadow-2xl">
        <div className="absolute -right-10 -top-10 h-64 w-64 rounded-full bg-brand-500/10 blur-3xl pointer-events-none" />
        <div className="absolute right-40 -bottom-10 h-48 w-48 rounded-full bg-emerald-500/10 blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col justify-between gap-6 md:flex-row md:items-center">
          <div>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/20 text-brand-400 border border-brand-500/30 shadow-inner">
                <Zap className="h-5 w-5 fill-current animate-pulse text-brand-400" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight text-white">Автопилот Продаж (AI Mission Control)</h1>
                  <span
                    className={clsx(
                      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider',
                      isRunning
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 animate-pulse'
                        : isPaused
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-white/10 text-white/70 border border-white/10',
                    )}
                  >
                    <span
                      className={clsx(
                        'h-1.5 w-1.5 rounded-full',
                        isRunning ? 'bg-emerald-400' : isPaused ? 'bg-amber-400' : 'bg-white/40',
                      )}
                    />
                    {isRunning ? 'Автопилот активен' : isPaused ? 'На паузе' : 'Готов к запуску'}
                  </span>
                </div>
                <p className="mt-1 text-sm text-ink-300">
                  Полный автономный цикл: от нахождения целевого бизнеса до персонализированного касания, снятия возражений и заключения сделки.
                </p>
              </div>
            </div>
          </div>

          {/* Action Control Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            {!isRunning && !isPaused && (
              <Button
                variant="primary"
                size="md"
                disabled={actionLoading}
                onClick={handleStart}
                className="bg-brand-500 hover:bg-brand-600 text-white shadow-lg shadow-brand-500/25 px-6 font-semibold"
              >
                <Play className="mr-2 h-5 w-5 fill-current" />
                Запустить Автопилот
              </Button>
            )}

            {isRunning && (
              <Button
                variant="secondary"
                size="md"
                disabled={actionLoading}
                onClick={handlePause}
                className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
              >
                <Pause className="mr-2 h-4 w-4" />
                Приостановить
              </Button>
            )}

            {isPaused && (
              <Button
                variant="primary"
                size="md"
                disabled={actionLoading}
                onClick={handleResume}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Play className="mr-2 h-4 w-4 fill-current" />
                Возобновить
              </Button>
            )}

            <Button
              variant="secondary"
              size="md"
              disabled={actionLoading}
              onClick={handleReset}
              className="border-white/20 text-white/80 hover:bg-white/10"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Сброс
            </Button>
          </div>
        </div>

        {/* Live Active Action Beacon */}
        {statusData.currentAction && (
          <div className="mt-5 flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 backdrop-blur-sm">
            <Radio className="h-4 w-4 animate-pulse text-emerald-400 flex-shrink-0" />
            <span className="text-xs font-medium uppercase tracking-wider text-emerald-300">Прямо сейчас:</span>
            <span className="text-sm font-medium text-white truncate">{statusData.currentAction}</span>
          </div>
        )}
      </div>

      {/* Visual Pipeline Funnel (6 Steps) */}
      <div className="rounded-xl border border-ink-100 bg-white p-5 shadow-card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-ink-900 flex items-center gap-2">
            <Bot className="h-4 w-4 text-brand-600" />
            Сквозная цепочка автономных продаж (Autonomous Flow)
          </h2>
          <span className="text-xs text-ink-500 font-medium">100% без участия человека</span>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          {/* Step 1 */}
          <div className="relative rounded-lg border border-ink-100 bg-ink-50/50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-ink-400">01</span>
              <Search className="h-4 w-4 text-brand-500" />
            </div>
            <p className="mt-2 text-xs font-bold text-ink-900">Поиск лидов</p>
            <p className="text-[11px] text-ink-500">2GIS / Карты / База</p>
            <div className="mt-2 text-sm font-bold text-ink-900">{statusData.counters.totalLeads} лидов</div>
          </div>

          {/* Step 2 */}
          <div className="relative rounded-lg border border-ink-100 bg-ink-50/50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-ink-400">02</span>
              <FileSearch className="h-4 w-4 text-purple-500" />
            </div>
            <p className="mt-2 text-xs font-bold text-ink-900">AI-Аудит бизнеса</p>
            <p className="text-[11px] text-ink-500">20 аспектов и боли</p>
            <div className="mt-2 text-sm font-bold text-purple-600">{statusData.counters.analyzedCount} сайтов</div>
          </div>

          {/* Step 3 */}
          <div className="relative rounded-lg border border-ink-100 bg-ink-50/50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-ink-400">03</span>
              <Send className="h-4 w-4 text-blue-500" />
            </div>
            <p className="mt-2 text-xs font-bold text-ink-900">Первое касание</p>
            <p className="text-[11px] text-ink-500">WhatsApp / Telegram</p>
            <div className="mt-2 text-sm font-bold text-blue-600">{statusData.counters.contactedCount} отправлено</div>
          </div>

          {/* Step 4 */}
          <div className="relative rounded-lg border border-ink-100 bg-ink-50/50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-ink-400">04</span>
              <MessageSquare className="h-4 w-4 text-amber-500" />
            </div>
            <p className="mt-2 text-xs font-bold text-ink-900">Переговоры</p>
            <p className="text-[11px] text-ink-500">Возражения & Боли</p>
            <div className="mt-2 text-sm font-bold text-amber-600">{statusData.counters.repliesCount} ответов ({responseRate}%)</div>
          </div>

          {/* Step 5 */}
          <div className="relative rounded-lg border border-ink-100 bg-ink-50/50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-ink-400">05</span>
              <FileText className="h-4 w-4 text-indigo-500" />
            </div>
            <p className="mt-2 text-xs font-bold text-ink-900">Смета и КП</p>
            <p className="text-[11px] text-ink-500">3 тарифа и сроки</p>
            <div className="mt-2 text-sm font-bold text-indigo-600">{statusData.counters.proposalsCount} КП</div>
          </div>

          {/* Step 6 */}
          <div className="relative rounded-lg border border-emerald-500/30 bg-emerald-50/50 p-3 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-600">06</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="mt-2 text-xs font-bold text-emerald-900">Сделка WON</p>
            <p className="text-[11px] text-emerald-700">Согласие & Договор</p>
            <div className="mt-2 text-sm font-bold text-emerald-600">{statusData.counters.dealsWonCount} закрыто</div>
          </div>
        </div>
      </div>

      {/* KPI Stats Row */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Лидов в цикле"
          value={statusData.counters.totalLeads}
          hint="Отобраны и квалифицированы"
          icon={<Building className="h-5 w-5" />}
          tone="default"
        />
        <StatCard
          label="Отклик клиентов"
          value={`${responseRate}%`}
          hint={`${statusData.counters.repliesCount} ответов на касания`}
          icon={<TrendingUp className="h-5 w-5" />}
          tone="brand"
        />
        <StatCard
          label="КП сформировано"
          value={statusData.counters.proposalsCount}
          hint="Индивидуальный расчет под боли"
          icon={<FileText className="h-5 w-5" />}
          tone="warning"
        />
        <StatCard
          label="Выручка сделок WON"
          value={`${statusData.counters.revenueWon.toLocaleString('ru-RU')} ₸`}
          hint={`${statusData.counters.dealsWonCount} закрытых сделок`}
          icon={<DollarSign className="h-5 w-5" />}
          tone="success"
        />
      </div>

      {/* Real Hunter Jobs Outreach Ready Card */}
      {hunterJobs && hunterJobs.length > 0 && (
        <div className="rounded-xl border border-brand-500/30 bg-gradient-to-r from-brand-950/40 via-brand-900/20 to-ink-900/40 p-5 shadow-lg backdrop-blur-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-inner">
                  <MessageCircle className="h-5 w-5" />
                </span>
                <h3 className="text-base font-bold text-white">
                  Найденные базы Lead Hunter (готовность к реальному WhatsApp Outreach)
                </h3>
              </div>
              <p className="mt-1 text-xs text-ink-300">
                Запустите отправку персонализированных первых сообщений в WhatsApp с вашего подключенного номера{' '}
                <span className="font-semibold text-emerald-400">
                  {waAccount ? `${waAccount.name} (${waAccount.phoneMasked || waAccount.phone}) — ONLINE` : 'WhatsApp ONLINE'}
                </span>
                . Когда компании ответят, AI Sales Brain продолжит диалог автоматически!
              </p>
            </div>

            <Link
              href="/hunter"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20 transition"
            >
              Перейти в Lead Hunter <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {hunterJobs.map((job) => {
              const leadsCount = job._count?.leads ?? job.savedCount ?? 0;
              const isSending = sendingJobId === job.id;

              return (
                <div
                  key={job.id}
                  className="flex flex-col justify-between rounded-lg border border-white/10 bg-white/5 p-4 shadow-sm transition hover:border-brand-400/50 backdrop-blur-sm"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white truncate max-w-[200px]" title={job.name}>
                        {job.name}
                      </span>
                      <span
                        className={clsx(
                          'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                          job.status === 'COMPLETED'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-white/10 text-white/70',
                        )}
                      >
                        {job.status === 'COMPLETED' ? 'Готов к рассылке' : job.status}
                      </span>
                    </div>
                    <p className="mt-2 text-2xl font-black text-brand-400">
                      {leadsCount}{' '}
                      <span className="text-xs font-medium text-ink-300">лидов в базе</span>
                    </p>
                    <p className="mt-1 text-[11px] text-ink-400">
                      Ниша: {job.niche} • {job.city || 'Все города'}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-white/10">
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={isSending || leadsCount === 0}
                      onClick={() => handleSendWhatsAppForHunterJob(job.id, job.name)}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs py-2 shadow-md shadow-emerald-900/40"
                    >
                      {isSending ? (
                        <>
                          <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          Отправка в WhatsApp...
                        </>
                      ) : (
                        <>
                          <MessageCircle className="mr-1.5 h-3.5 w-3.5 fill-current" />
                          Написать всем {leadsCount > 0 ? leadsCount : ''} в WhatsApp
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick Launch & Options Card */}
      {!isRunning && (
        <Card title="Настройки следующего автономного запуска" subtitle="Параметры таргетинга и каналов для AI Sales Agent">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="text-xs font-semibold text-ink-700">Целевая ниша</label>
              <Select
                value={selectedNiche}
                onChange={(e) => setSelectedNiche(e.target.value)}
                className="mt-1"
              >
                <option value="Все ниши (Клиники, Рестораны, Авто)">Все ниши (Клиники, Рестораны, Авто)</option>
                <option value="стоматология">Стоматологии и Медицинские клиники</option>
                <option value="ресторан">Рестораны, Кафе и Доставка</option>
                <option value="автосервис">Автосервисы и Детейлинг-центры</option>
                <option value="юрист">Юридические компании и Консалтинг</option>
                <option value="ecommerce">Интернет-магазины (E-commerce)</option>
              </Select>
            </div>

            <div>
              <label className="text-xs font-semibold text-ink-700">Канал коммуникации</label>
              <Select
                value={selectedChannel}
                onChange={(e) => setSelectedChannel(e.target.value as any)}
                className="mt-1"
              >
                <option value="ALL">Мультиканал (WhatsApp + Telegram + Email)</option>
                <option value="WHATSAPP">WhatsApp Business</option>
                <option value="TELEGRAM">Telegram Bot</option>
                <option value="EMAIL">Email</option>
              </Select>
            </div>

            <div>
              <label className="text-xs font-semibold text-ink-700">Количество лидов за цикл</label>
              <Select
                value={String(maxLeads)}
                onChange={(e) => setMaxLeads(Number(e.target.value))}
                className="mt-1"
              >
                <option value="3">3 лида (Быстрый тест)</option>
                <option value="5">5 лидов (Оптимально)</option>
                <option value="10">10 лидов (Интенсив)</option>
                <option value="25">25 лидов (Масштабирование)</option>
              </Select>
            </div>
          </div>
        </Card>
      )}

      {/* Main Split View: Active Dialogues (Left) vs Live Event Stream (Right) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Active Dialogues being handled on Autopilot (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-ink-900 flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-brand-600" />
              Активные переговоры на автопилоте ({statusData.activeDialogues.length})
            </h3>
            <span className="text-xs text-ink-500">Автоматическое ведение диалога</span>
          </div>

          {statusData.activeDialogues.length === 0 ? (
            <div className="rounded-xl border border-dashed border-ink-200 bg-white p-8 text-center">
              <Bot className="mx-auto h-12 w-12 text-ink-300" />
              <p className="mt-3 text-sm font-semibold text-ink-700">Диалогов пока нет</p>
              <p className="mt-1 text-xs text-ink-500 max-w-sm mx-auto">
                Нажмите «Запустить Автопилот», и AI Sales Agent начнет находить компании, анализировать их сайты и вести переписку в реальном времени.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {statusData.activeDialogues.map((dlg) => (
                <div
                  key={dlg.leadId}
                  className={clsx(
                    'rounded-xl border p-4 transition-all duration-200 bg-white shadow-sm',
                    dlg.isWon ? 'border-emerald-500/40 bg-emerald-50/20' : 'border-ink-100 hover:border-brand-500/30',
                  )}
                >
                  {/* Lead Header */}
                  <div className="flex items-center justify-between border-b border-ink-100 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-ink-900">{dlg.companyName}</span>
                        <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold text-ink-600 uppercase">
                          {dlg.niche}
                        </span>
                        <span
                          className={clsx(
                            'rounded px-1.5 py-0.5 text-[10px] font-bold uppercase',
                            dlg.grade === 'HOT'
                              ? 'bg-rose-100 text-rose-700'
                              : dlg.grade === 'WARM'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-blue-100 text-blue-700',
                          )}
                        >
                          {dlg.grade === 'HOT' ? '🔥 HOT' : '⚡ WARM'} {dlg.score}
                        </span>
                      </div>
                      <p className="text-xs text-ink-500 mt-0.5">{dlg.phone}</p>
                    </div>

                    <div className="text-right">
                      <span
                        className={clsx(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold',
                          dlg.isWon
                            ? 'bg-emerald-100 text-emerald-800'
                            : dlg.stage === 'PROPOSAL_SENT'
                            ? 'bg-indigo-100 text-indigo-800'
                            : 'bg-blue-100 text-blue-800',
                        )}
                      >
                        {dlg.isWon ? '🎉 СДЕЛКА WON' : dlg.stage}
                      </span>
                      {dlg.dealAmount && (
                        <p className="text-xs font-bold text-emerald-600 mt-0.5">
                          {dlg.dealAmount.toLocaleString('ru-RU')} ₸
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Messages Bubble Preview */}
                  <div className="mt-3 space-y-2 text-xs">
                    {/* Inbound from Lead */}
                    {dlg.lastMessage && (
                      <div className="flex items-start gap-2">
                        <span className="rounded bg-ink-100 px-1.5 py-0.5 font-bold text-ink-700 flex-shrink-0">
                          Клиент:
                        </span>
                        <p className="text-ink-700 bg-ink-50 rounded-lg p-2 flex-1">{dlg.lastMessage}</p>
                      </div>
                    )}

                    {/* Outbound from AI */}
                    {dlg.lastAiReply && (
                      <div className="flex items-start gap-2">
                        <span className="rounded bg-brand-100 px-1.5 py-0.5 font-bold text-brand-700 flex-shrink-0">
                          AI Agent:
                        </span>
                        <p className="text-brand-900 bg-brand-50/60 rounded-lg p-2 flex-1 font-medium">
                          {dlg.lastAiReply}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Footer Proposal Info & Navigation */}
                  <div className="mt-3 flex items-center justify-between border-t border-ink-100 pt-2 text-xs text-ink-500">
                    <div className="flex items-center gap-2">
                      {dlg.proposalNumber && (
                        <span className="inline-flex items-center gap-1 font-semibold text-indigo-600">
                          <FileText className="h-3.5 w-3.5" />
                          КП: {dlg.proposalNumber}
                        </span>
                      )}
                    </div>

                    <Link
                      href={`/conversations?id=${dlg.conversationId}`}
                      className="font-medium text-brand-600 hover:text-brand-700 flex items-center gap-1"
                    >
                      Открыть диалог <ChevronRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Realtime Mission Event Stream / Terminal (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-ink-900 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-600" />
              Журнал автопилота в реальном времени
            </h3>
            <span className="text-xs text-ink-500">Live Stream</span>
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap gap-1.5">
            {['ALL', 'ANALYSIS', 'SCORE', 'OUTREACH', 'INBOUND', 'PROPOSAL', 'DEAL_WON'].map((f) => (
              <button
                key={f}
                onClick={() => setEventFilter(f)}
                className={clsx(
                  'rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors',
                  eventFilter === f
                    ? 'bg-ink-900 text-white'
                    : 'bg-ink-100 text-ink-600 hover:bg-ink-200',
                )}
              >
                {f === 'ALL'
                  ? 'Все события'
                  : f === 'ANALYSIS'
                  ? 'Аудит'
                  : f === 'SCORE'
                  ? 'Скоринг'
                  : f === 'OUTREACH'
                  ? 'Касания'
                  : f === 'INBOUND'
                  ? 'Ответы'
                  : f === 'PROPOSAL'
                  ? 'КП'
                  : 'Сделки'}
              </button>
            ))}
          </div>

          {/* Event Stream Container */}
          <div className="h-[620px] overflow-y-auto rounded-xl border border-ink-100 bg-ink-950 p-4 font-mono text-xs text-ink-300 shadow-inner space-y-3">
            {filteredEvents.length === 0 ? (
              <div className="py-20 text-center text-ink-500">
                <Clock className="mx-auto h-8 w-8 text-ink-700 mb-2" />
                Ожидание событий автопилота...
              </div>
            ) : (
              filteredEvents.map((evt) => {
                const time = new Date(evt.timestamp).toLocaleTimeString('ru-RU');
                const badgeColor =
                  evt.type === 'DEAL_WON'
                    ? 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10'
                    : evt.type === 'PROPOSAL'
                    ? 'text-indigo-400 border-indigo-500/40 bg-indigo-500/10'
                    : evt.type === 'INBOUND'
                    ? 'text-amber-400 border-amber-500/40 bg-amber-500/10'
                    : evt.type === 'OUTREACH'
                    ? 'text-blue-400 border-blue-500/40 bg-blue-500/10'
                    : evt.type === 'ANALYSIS'
                    ? 'text-purple-400 border-purple-500/40 bg-purple-500/10'
                    : 'text-ink-400 border-white/10 bg-white/5';

                return (
                  <div key={evt.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5 transition-colors hover:bg-white/[0.05]">
                    <div className="flex items-center justify-between gap-2">
                      <span className={clsx('rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase', badgeColor)}>
                        {evt.type}
                      </span>
                      <span className="text-[10px] text-ink-500">{time}</span>
                    </div>

                    <p className="mt-1.5 font-bold text-white text-xs">{evt.title}</p>
                    <p className="text-ink-400 text-[11px] leading-relaxed mt-0.5">{evt.description}</p>

                    {evt.companyName && (
                      <p className="mt-1 text-[10px] text-brand-400 font-semibold truncate">
                        🏢 {evt.companyName}
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
