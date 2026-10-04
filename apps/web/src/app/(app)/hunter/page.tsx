'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Crosshair,
  Search,
  Bot,
  Globe,
  Sparkles,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Filter,
  ExternalLink,
  ShieldCheck,
  Zap,
  TrendingUp,
  Building2,
  Phone,
  MessageSquare,
  Instagram,
  Send,
  Linkedin,
  Mail,
  Layers,
  ChevronRight,
  RefreshCw,
  Sliders,
  Flame,
  FileText,
  Activity,
  ArrowUpRight,
  Radio,
} from 'lucide-react';
import { get, post } from '@/lib/api';
import { useSocket, useAuth } from '@/lib/auth';
import { useToast } from '@/components/ui/toast';
import type {
  LeadHunterJob,
  LeadHunterStats,
  HunterDiscoverySource,
  LeadHunterFilters,
  Lead,
} from '@nexora/types';

const NICHE_PRESETS = [
  'Стоматология',
  'Рестораны и доставка еды',
  'Автосервисы и детейлинг',
  'Клиники и медцентры',
  'Салоны красоты и барбершопы',
  'Юридические услуги',
  'Строительство и ремонт',
  'Фитнес-клубы',
];

const CITY_PRESETS = [
  'Алматы',
  'Астана',
  'Шымкент',
  'Москва',
  'Санкт-Петербург',
  'Ташкент',
  'Dubai',
  'Miami',
];

const SOURCES_LIST: Array<{ id: HunterDiscoverySource; label: string; icon: any; color: string }> = [
  { id: '2GIS', label: '2GIS', icon: Building2, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  { id: 'GOOGLE', label: 'Google Maps', icon: Globe, color: 'text-blue-400 bg-blue-500/10 border-blue-500/30' },
  { id: 'INSTAGRAM', label: 'Instagram', icon: Instagram, color: 'text-pink-400 bg-pink-500/10 border-pink-500/30' },
  { id: 'TELEGRAM', label: 'Telegram', icon: Send, color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30' },
  { id: 'LINKEDIN', label: 'LinkedIn', icon: Linkedin, color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30' },
  { id: 'EMAIL', label: 'Email Scan', icon: Mail, color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
];

export default function LeadHunterPage() {
  const { user } = useAuth();
  const socket = useSocket();
  const { toast } = useToast();

  // Stats & Jobs State
  const [stats, setStats] = useState<LeadHunterStats | null>(null);
  const [jobs, setJobs] = useState<LeadHunterJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<LeadHunterJob | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  // Form State
  const [niche, setNiche] = useState('Стоматология');
  const [city, setCity] = useState('Алматы');
  const [country, setCountry] = useState('KZ');
  const [targetCount, setTargetCount] = useState(30);
  const [minScore, setMinScore] = useState(50);
  const [selectedSources, setSelectedSources] = useState<HunterDiscoverySource[]>(['2GIS', 'GOOGLE']);
  
  // Filters
  const [websiteFilter, setWebsiteFilter] = useState<'all' | 'with_site' | 'without_site'>('without_site');
  const [hasInstagram, setHasInstagram] = useState(false);
  const [requireProblematicSite, setRequireProblematicSite] = useState(false);
  const [requireAutomationNeed, setRequireAutomationNeed] = useState(true);
  const [autoOutreach, setAutoOutreach] = useState(true);
  const [isSendingWa, setIsSendingWa] = useState(false);

  // Load Data
  const loadStatsAndJobs = useCallback(async () => {
    try {
      const [statsRes, jobsRes] = await Promise.all([
        get<LeadHunterStats>('/api/hunter/stats').catch(() => null),
        get<{ items: LeadHunterJob[] }>('/api/hunter/jobs').catch(() => ({ items: [] })),
      ]);

      if (statsRes) setStats(statsRes);
      if (jobsRes && jobsRes.items) {
        setJobs(jobsRes.items);
        if (!selectedJob && jobsRes.items.length > 0) {
          void loadJobDetails(jobsRes.items[0].id);
        }
      }
    } catch {
      /* ignore */
    } finally {
      setIsLoading(false);
    }
  }, [selectedJob]);

  const loadJobDetails = async (jobId: string) => {
    try {
      const res = await get<LeadHunterJob>(`/api/hunter/jobs/${jobId}`);
      setSelectedJob(res);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    void loadStatsAndJobs();
  }, [loadStatsAndJobs]);

  // Socket Live Updates
  useEffect(() => {
    if (!socket) return;

    const onProgress = (data: { jobId: string; stage: string; discovered: number; processed: number; saved: number; duplicates: number }) => {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === data.jobId
            ? {
                ...j,
                currentStage: data.stage,
                discoveredCount: data.discovered,
                processedCount: data.processed,
                savedCount: data.saved,
                duplicateCount: data.duplicates,
                status: 'RUNNING',
              }
            : j,
        ),
      );

      if (selectedJob && selectedJob.id === data.jobId) {
        void loadJobDetails(data.jobId);
      }
    };

    const onCompleted = (data: { jobId: string }) => {
      toast('🎉 Задача Lead Hunter успешно завершена!', 'success');
      void loadStatsAndJobs();
      if (selectedJob && selectedJob.id === data.jobId) {
        void loadJobDetails(data.jobId);
      }
    };

    const onFailed = (data: { jobId: string; error?: string }) => {
      toast(`⚠️ Ошибка поиска: ${data.error || 'Произошел сбой'}`, 'error');
      void loadStatsAndJobs();
    };

    socket.on('hunter.job_progress', onProgress);
    socket.on('hunter.job_completed', onCompleted);
    socket.on('hunter.job_failed', onFailed);

    return () => {
      socket.off('hunter.job_progress', onProgress);
      socket.off('hunter.job_completed', onCompleted);
      socket.off('hunter.job_failed', onFailed);
    };
  }, [socket, selectedJob, toast, loadStatsAndJobs]);

  // Handle Source Toggle
  const toggleSource = (src: HunterDiscoverySource) => {
    setSelectedSources((prev) =>
      prev.includes(src) ? (prev.length > 1 ? prev.filter((s) => s !== src) : prev) : [...prev, src],
    );
  };

  // Create & Start Search Job
  const handleStartSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!niche.trim() || !city.trim()) {
      toast('Укажите нишу и город поиска', 'error');
      return;
    }

    setIsCreating(true);
    try {
      const filters: LeadHunterFilters = {
        websiteFilter,
        hasInstagram,
        requireProblematicSite,
        requireAutomationNeed,
        minScore,
      };

      const res = await post<LeadHunterJob>('/api/hunter/jobs', {
        niche: niche.trim(),
        city: city.trim(),
        country: country.trim() || undefined,
        targetCount,
        minScore,
        sources: selectedSources,
        filters,
        autoOutreach,
      });

      toast('🚀 Задача Lead Hunter запущена в фоновом режиме!', 'success');
      setJobs((prev) => [res, ...prev]);
      setSelectedJob(res);
      void loadJobDetails(res.id);
    } catch (err: any) {
      toast(`Ошибка создания задачи: ${err?.message || 'Сбой сервера'}`, 'error');
    } finally {
      setIsCreating(false);
    }
  };

  const handleSendWhatsAppForJob = async (jobId: string) => {
    setIsSendingWa(true);
    try {
      const res = await post<{ success: boolean; message: string; result: any }>(
        `/api/hunter/jobs/${jobId}/send-whatsapp`,
        { limit: 200 },
      );
      toast(res?.message || 'Отправка сообщений в WhatsApp запущена!', 'success');
      void loadStatsAndJobs();
      void loadJobDetails(jobId);
    } catch (err: any) {
      toast(`Ошибка отправки в WhatsApp: ${err?.message || 'Сбой'}`, 'error');
    } finally {
      setIsSendingWa(false);
    }
  };

  const handlePauseJob = async (jobId: string) => {
    try {
      await post(`/api/hunter/jobs/${jobId}/pause`, {});
      toast('Задача приостановлена', 'info');
      void loadJobDetails(jobId);
      void loadStatsAndJobs();
    } catch {
      toast('Не удалось приостановить', 'error');
    }
  };

  const handleResumeJob = async (jobId: string) => {
    try {
      await post(`/api/hunter/jobs/${jobId}/resume`, {});
      toast('Задача возобновлена', 'success');
      void loadJobDetails(jobId);
      void loadStatsAndJobs();
    } catch {
      toast('Не удалось возобновить', 'error');
    }
  };

  const handleCancelJob = async (jobId: string) => {
    try {
      await post(`/api/hunter/jobs/${jobId}/cancel`, {});
      toast('Задача отменена', 'info');
      void loadJobDetails(jobId);
      void loadStatsAndJobs();
    } catch {
      toast('Не удалось отменить', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-tr from-violet-600 to-indigo-500 rounded-xl shadow-lg shadow-violet-500/20 text-white">
              <Crosshair className="w-7 h-7 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl md:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-violet-300">
                  Lead Hunter
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-violet-500/20 text-violet-300 border border-violet-500/30">
                  Autonomous AI Pipeline
                </span>
              </div>
              <p className="text-sm text-slate-400 mt-0.5">
                Многоканальный поиск B2B-клиентов с 7-этапным аудитом, дедупликацией и AI-скорингом
              </p>
            </div>
          </div>
        </div>

        {/* Top Metric Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl px-3.5 py-2">
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Search className="w-3.5 h-3.5 text-blue-400" /> Найдено
              </span>
              <p className="text-xl font-bold text-white mt-0.5">{stats.totalDiscovered}</p>
            </div>
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl px-3.5 py-2">
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 text-emerald-400" /> В CRM
              </span>
              <p className="text-xl font-bold text-emerald-400 mt-0.5">{stats.totalSaved}</p>
            </div>
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl px-3.5 py-2">
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-400" /> Дубликаты
              </span>
              <p className="text-xl font-bold text-amber-400 mt-0.5">{stats.totalDuplicates}</p>
            </div>
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl px-3.5 py-2">
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Flame className="w-3.5 h-3.5 text-pink-400" /> Ср. AI Score
              </span>
              <p className="text-xl font-bold text-pink-400 mt-0.5">{stats.avgAiScore}/100</p>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Search & Parameter Configurator (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />

            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Sliders className="w-5 h-5 text-violet-400" />
                Параметры поиска
              </h2>
              <span className="text-xs text-slate-400">Nexora 2.0 Hunter</span>
            </div>

            <form onSubmit={handleStartSearch} className="space-y-4">
              {/* Niche Input */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Ниша / Сфера бизнеса</label>
                <input
                  type="text"
                  value={niche}
                  onChange={(e) => setNiche(e.target.value)}
                  placeholder="Например: Стоматология, Рестораны, Автосервис..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500"
                  required
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {NICHE_PRESETS.slice(0, 4).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setNiche(p)}
                      className="px-2 py-0.5 rounded-lg text-[11px] bg-slate-800/80 hover:bg-slate-800 text-slate-300 border border-slate-700/50 transition-colors"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* City & Country Inputs */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">Город</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Алматы, Москва..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">Страна (Код)</label>
                  <input
                    type="text"
                    value={country}
                    onChange={(e) => setCountry(e.target.value.toUpperCase())}
                    placeholder="KZ, RU..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white text-center uppercase focus:outline-none focus:border-violet-500"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {CITY_PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCity(c)}
                    className="px-2 py-0.5 rounded-lg text-[11px] bg-slate-800/80 hover:bg-slate-800 text-slate-300 border border-slate-700/50 transition-colors"
                  >
                    {c}
                  </button>
                ))}
              </div>

              {/* Multi-Source Selector */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Подключенные источники ({selectedSources.length} выбрано)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {SOURCES_LIST.map((src) => {
                    const active = selectedSources.includes(src.id);
                    const Icon = src.icon;
                    return (
                      <button
                        key={src.id}
                        type="button"
                        onClick={() => toggleSource(src.id)}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border text-xs font-medium transition-all ${
                          active
                            ? `${src.color} shadow-sm font-semibold`
                            : 'border-slate-800/80 bg-slate-950/60 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{src.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Quality & Audit Filters */}
              <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-3.5 space-y-3">
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-violet-400" /> Фильтры качества и критерии
                </span>

                {/* Website filter */}
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Наличие сайта</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: 'all', label: 'Все' },
                      { id: 'with_site', label: 'С сайтом' },
                      { id: 'without_site', label: 'Без сайта 🔥' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setWebsiteFilter(opt.id as any)}
                        className={`py-1.5 px-2 rounded-lg text-xs font-medium border transition-colors ${
                          websiteFilter === opt.id
                            ? 'bg-violet-600/30 border-violet-500/50 text-white'
                            : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Checkboxes */}
                <div className="space-y-2 pt-1 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={hasInstagram}
                      onChange={(e) => setHasInstagram(e.target.checked)}
                      className="rounded bg-slate-900 border-slate-700 text-violet-600 focus:ring-0"
                    />
                    <span>Наличие активного Instagram (для ботов/Mini App)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={requireProblematicSite}
                      onChange={(e) => setRequireProblematicSite(e.target.checked)}
                      className="rounded bg-slate-900 border-slate-700 text-violet-600 focus:ring-0"
                    />
                    <span>Признаки проблемного сайта (медленный, без адаптива)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={requireAutomationNeed}
                      onChange={(e) => setRequireAutomationNeed(e.target.checked)}
                      className="rounded bg-slate-900 border-slate-700 text-violet-600 focus:ring-0"
                    />
                    <span>Потребность в автоматизации (клиники, ручной Direct)</span>
                  </label>
                </div>
              </div>

              {/* Target count & Min score */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex justify-between text-xs text-slate-300 mb-1">
                    <span>Количество лидов:</span>
                    <span className="font-bold text-violet-400">{targetCount}</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="200"
                    step="5"
                    value={targetCount}
                    onChange={(e) => setTargetCount(parseInt(e.target.value, 10))}
                    className="w-full accent-violet-500 cursor-pointer"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-xs text-slate-300 mb-1">
                    <span>Мин. AI Score:</span>
                    <span className="font-bold text-pink-400">{minScore}/100</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="90"
                    step="5"
                    value={minScore}
                    onChange={(e) => setMinScore(parseInt(e.target.value, 10))}
                    className="w-full accent-pink-500 cursor-pointer"
                  />
                </div>
              </div>

              {/* Auto Outreach Toggle with Guardrails */}
              <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <div>
                      <p className="text-xs font-semibold text-white">Автоматический Outreach</p>
                      <p className="text-[11px] text-slate-400">Безопасная отправка офферов</p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoOutreach}
                      onChange={(e) => setAutoOutreach(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-violet-600" />
                  </label>
                </div>
                <p className="text-[11px] text-slate-400 mt-2">
                  {autoOutreach
                    ? '⚡ Авто-отправка в WhatsApp включена: сразу после нахождения каждого лида AI-агент отправит персонализированное сообщение с подключенного номера WhatsApp!'
                    : '🛡 Авто-отправка выключена: лиды поступят в CRM со статусом NEW, а отправить сообщения можно будет в 1 клик по кнопке «Написать всем в WhatsApp».'}
                </p>
              </div>

              {/* Start Button */}
              <button
                type="submit"
                disabled={isCreating}
                className="w-full py-3 px-4 rounded-xl font-semibold text-sm bg-gradient-to-r from-violet-600 via-indigo-600 to-violet-500 hover:from-violet-500 hover:to-indigo-500 text-white shadow-lg shadow-violet-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isCreating ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Инициализация конвейера...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    Запустить автономный Lead Hunter
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Active Task Monitor & Discovered Leads (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Active / Selected Task Card */}
          {selectedJob ? (
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl relative overflow-hidden space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`w-3 h-3 rounded-full ${
                      selectedJob.status === 'RUNNING'
                        ? 'bg-emerald-400 animate-ping'
                        : selectedJob.status === 'COMPLETED'
                        ? 'bg-emerald-500'
                        : selectedJob.status === 'PAUSED'
                        ? 'bg-amber-400'
                        : 'bg-slate-500'
                    }`}
                  />
                  <div>
                    <h3 className="font-semibold text-white text-base">{selectedJob.name}</h3>
                    <p className="text-xs text-slate-400 flex items-center gap-2">
                      <span>Запрос: «{selectedJob.query}»</span>
                      <span>•</span>
                      <span>Цель: {selectedJob.targetCount} лидов</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleSendWhatsAppForJob(selectedJob.id)}
                    disabled={isSendingWa || selectedJob.savedCount === 0}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-600/30 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <MessageSquare className="w-3.5 h-3.5 fill-current" />
                    {isSendingWa ? 'Отправка...' : `💬 Написать всем в WhatsApp (${selectedJob.savedCount})`}
                  </button>
                  {selectedJob.status === 'RUNNING' && (
                    <button
                      onClick={() => handlePauseJob(selectedJob.id)}
                      className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-medium flex items-center gap-1"
                    >
                      <Pause className="w-3 h-3" /> Пауза
                    </button>
                  )}
                  {selectedJob.status === 'PAUSED' && (
                    <button
                      onClick={() => handleResumeJob(selectedJob.id)}
                      className="px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded-lg text-xs font-medium flex items-center gap-1"
                    >
                      <Play className="w-3 h-3" /> Возобновить
                    </button>
                  )}
                  {(selectedJob.status === 'RUNNING' || selectedJob.status === 'PENDING') && (
                    <button
                      onClick={() => handleCancelJob(selectedJob.id)}
                      className="px-2.5 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 rounded-lg text-xs font-medium flex items-center gap-1"
                    >
                      Отмена
                    </button>
                  )}
                </div>
              </div>

              {/* Progress & Current Stage */}
              <div>
                <div className="flex justify-between text-xs text-slate-300 mb-1.5">
                  <span className="font-medium text-violet-300 flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-violet-400" />
                    {selectedJob.currentStage || 'Ожидание...'}
                  </span>
                  <span className="font-bold text-white">
                    {Math.round((selectedJob.savedCount / Math.max(selectedJob.targetCount, 1)) * 100)}%
                  </span>
                </div>
                <div className="w-full bg-slate-950 rounded-full h-2.5 overflow-hidden border border-slate-800">
                  <div
                    className="bg-gradient-to-r from-violet-600 via-indigo-500 to-emerald-400 h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, Math.round((selectedJob.savedCount / Math.max(selectedJob.targetCount, 1)) * 100))}%`,
                    }}
                  />
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div className="bg-slate-950/80 p-2 rounded-xl border border-slate-800">
                  <span className="text-slate-400 text-[11px]">Найдено</span>
                  <p className="font-bold text-sm text-white mt-0.5">{selectedJob.discoveredCount}</p>
                </div>
                <div className="bg-slate-950/80 p-2 rounded-xl border border-slate-800">
                  <span className="text-slate-400 text-[11px]">Проверено</span>
                  <p className="font-bold text-sm text-blue-400 mt-0.5">{selectedJob.processedCount}</p>
                </div>
                <div className="bg-slate-950/80 p-2 rounded-xl border border-slate-800">
                  <span className="text-slate-400 text-[11px]">В CRM</span>
                  <p className="font-bold text-sm text-emerald-400 mt-0.5">{selectedJob.savedCount}</p>
                </div>
                <div className="bg-slate-950/80 p-2 rounded-xl border border-slate-800">
                  <span className="text-slate-400 text-[11px]">Дубликатов</span>
                  <p className="font-bold text-sm text-amber-400 mt-0.5">{selectedJob.duplicateCount}</p>
                </div>
              </div>

              {/* Discovered Leads List */}
              {selectedJob.leads && selectedJob.leads.length > 0 ? (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Flame className="w-3.5 h-3.5 text-pink-400" />
                      Обнаруженные и проанализированные компании ({selectedJob.leads.length})
                    </h4>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleSendWhatsAppForJob(selectedJob.id)}
                        disabled={isSendingWa || selectedJob.leads.length === 0}
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                      >
                        <MessageSquare className="w-3 h-3 fill-current" />
                        {isSendingWa ? 'Отправка...' : '💬 Написать всем в WhatsApp'}
                      </button>
                      <Link
                        href="/crm"
                        className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1"
                      >
                        Вся база CRM <ArrowUpRight className="w-3 h-3" />
                      </Link>
                    </div>
                  </div>

                  <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
                    {selectedJob.leads.map((lead: any) => {
                      const scoreVal = lead.score?.score || 60;
                      const scoreGrade = lead.score?.grade || 'WARM';
                      const recService = lead.score?.recommendedService || 'WEB';

                      return (
                        <div
                          key={lead.id}
                          className="bg-slate-950/90 border border-slate-800/80 hover:border-slate-700/80 p-3.5 rounded-xl transition-all space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-white text-sm">
                                  {lead.companyName || 'Организация'}
                                </span>
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
                                  {lead.source}
                                </span>
                              </div>
                              <p className="text-xs text-slate-400 mt-0.5">
                                {lead.city || 'Город не указан'} {lead.niche ? `• ${lead.niche}` : ''}
                              </p>
                            </div>

                            {/* Score badge */}
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`px-2 py-0.5 rounded-lg text-xs font-bold border ${
                                  scoreGrade === 'HOT'
                                    ? 'bg-pink-500/20 text-pink-300 border-pink-500/30'
                                    : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                }`}
                              >
                                {scoreVal}/100 {scoreGrade}
                              </span>
                            </div>
                          </div>

                          {/* Contact badges & Service */}
                          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-900 text-xs">
                            <span className="px-2 py-0.5 rounded bg-violet-950/60 text-violet-300 border border-violet-800/40 text-[11px] font-medium">
                              💡 Оффер: {recService}
                            </span>
                            {lead.phone && !lead.phone.startsWith('hunter_') && (
                              <span className="text-slate-400 text-[11px] flex items-center gap-1">
                                <Phone className="w-3 h-3 text-slate-500" /> {lead.phone}
                              </span>
                            )}
                            {lead.whatsappUrl && (
                              <a
                                href={lead.whatsappUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-emerald-400 hover:text-emerald-300 text-[11px] flex items-center gap-1"
                              >
                                <MessageSquare className="w-3 h-3" /> WhatsApp
                              </a>
                            )}
                            {lead.website && (
                              <a
                                href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-400 hover:text-blue-300 text-[11px] flex items-center gap-1"
                              >
                                <Globe className="w-3 h-3" /> Сайт
                              </a>
                            )}
                            {lead.instagramUrl && (
                              <a
                                href={lead.instagramUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-pink-400 hover:text-pink-300 text-[11px] flex items-center gap-1"
                              >
                                <Instagram className="w-3 h-3" /> Instagram
                              </a>
                            )}

                            <Link
                              href={`/crm?leadId=${lead.id}`}
                              className="ml-auto text-[11px] text-violet-400 hover:text-violet-300 font-medium flex items-center gap-0.5"
                            >
                              В профиль CRM <ChevronRight className="w-3 h-3" />
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {/* Logs Drawer */}
              {selectedJob.logs && (selectedJob.logs as any[]).length > 0 && (
                <div className="bg-slate-950 rounded-xl p-3 border border-slate-800 text-xs font-mono max-h-36 overflow-y-auto space-y-1">
                  <div className="text-[11px] text-slate-500 uppercase tracking-wider mb-1 font-sans font-semibold">
                    Журнал выполнения задачи:
                  </div>
                  {(selectedJob.logs as any[]).map((log, idx) => (
                    <div key={idx} className="text-slate-300 flex items-start gap-2">
                      <span className="text-slate-500 select-none">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                      <span
                        className={
                          log.type === 'error'
                            ? 'text-red-400'
                            : log.type === 'warn'
                            ? 'text-amber-400'
                            : log.type === 'success'
                            ? 'text-emerald-400'
                            : 'text-slate-300'
                        }
                      >
                        {log.message}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-slate-900/50 border border-dashed border-slate-800 rounded-2xl p-12 text-center text-slate-400 space-y-3">
              <Crosshair className="w-12 h-12 text-slate-600 mx-auto" />
              <h3 className="font-semibold text-white">Нет активных задач поиска</h3>
              <p className="text-sm max-w-sm mx-auto text-slate-500">
                Задайте нишу, город и параметры в левой панели, затем нажмите «Запустить автономный Lead Hunter».
              </p>
            </div>
          )}

          {/* History of Past Hunter Jobs */}
          {jobs.length > 0 && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
              <h3 className="font-semibold text-white text-base flex items-center gap-2">
                <Clock className="w-4 h-4 text-violet-400" />
                История запусков Lead Hunter
              </h3>

              <div className="space-y-2 max-h-56 overflow-y-auto">
                {jobs.map((job) => (
                  <div
                    key={job.id}
                    onClick={() => {
                      setSelectedJob(job);
                      void loadJobDetails(job.id);
                    }}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                      selectedJob?.id === job.id
                        ? 'bg-violet-950/40 border-violet-500/50'
                        : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white text-sm">{job.name}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            job.status === 'COMPLETED'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : job.status === 'RUNNING'
                              ? 'bg-blue-500/20 text-blue-300'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {job.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {new Date(job.createdAt).toLocaleDateString()} • Сохранено: {job.savedCount} / {job.targetCount}
                      </p>
                    </div>

                    <ChevronRight className="w-4 h-4 text-slate-500" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
