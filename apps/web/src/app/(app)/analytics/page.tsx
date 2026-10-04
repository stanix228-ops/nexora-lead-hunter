'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Bot,
  Zap,
  Target,
  Users,
  DollarSign,
  Briefcase,
  Layers,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Download,
  Filter,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Clock,
  ShieldCheck,
  Search,
  ChevronRight,
  Building,
  Mail,
  Smartphone,
  Flame,
  UserCheck,
  Sliders,
  ChevronDown,
  Info,
  Calendar,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';
import { get, post } from '@/lib/api';
import { useToast } from '@/components/ui/toast';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type {
  AnalyticsFullOverview,
  AiPatternInsight,
  AiPatternCategory,
  FunnelStageItem,
  ChannelPerformanceItem,
  NichePerformanceItem,
  SourcePerformanceItem,
  ObjectionAnalyticsItem,
} from '@nexora/types';

// Category color mappings
const CATEGORY_META: Record<
  AiPatternCategory,
  { label: string; icon: any; color: string; badgeBg: string }
> = {
  TOP_CONVERTING_NICHES: {
    label: 'Топ-Ниши',
    icon: Building,
    color: 'text-emerald-600',
    badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  HIGH_IMPACT_PROBLEMS: {
    label: 'Ключевые Боли',
    icon: Target,
    color: 'text-amber-600',
    badgeBg: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  BEST_SELLING_SERVICES: {
    label: 'Топ-Услуги',
    icon: Briefcase,
    color: 'text-blue-600',
    badgeBg: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  CHURN_DROP_OFF_POINTS: {
    label: 'Точки Оттока',
    icon: AlertTriangle,
    color: 'text-rose-600',
    badgeBg: 'bg-rose-50 text-rose-700 border-rose-200',
  },
  HIGH_RESPONSE_MESSAGES: {
    label: 'Эффективные Сообщения',
    icon: Zap,
    color: 'text-purple-600',
    badgeBg: 'bg-purple-50 text-purple-700 border-purple-200',
  },
  HUMAN_HANDOFF_HOTSPOTS: {
    label: 'Human Handoff',
    icon: UserCheck,
    color: 'text-indigo-600',
    badgeBg: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
};

const CHANNEL_ICONS: Record<string, { icon: any; color: string; bg: string }> = {
  WHATSAPP: { icon: Smartphone, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  INSTAGRAM: { icon: Zap, color: 'text-pink-600', bg: 'bg-pink-50' },
  TELEGRAM: { icon: Bot, color: 'text-sky-600', bg: 'bg-sky-50' },
  EMAIL: { icon: Mail, color: 'text-amber-600', bg: 'bg-amber-50' },
};

export default function AnalyticsDashboardPage() {
  const { toast } = useToast();
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<AnalyticsFullOverview | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [recalculating, setRecalculating] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'funnel' | 'patterns' | 'channels' | 'niches' | 'sources' | 'objections'>('patterns');
  const [patternFilter, setPatternFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortField, setSortField] = useState<string>('revenue');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  const loadData = useCallback(async (periodDays: number, showToast = false) => {
    try {
      setLoading(true);
      const res = await get<AnalyticsFullOverview>('/api/analytics/full', { days: periodDays });
      setData(res);
      if (showToast) {
        toast('Аналитические метрики успешно обновлены', 'success');
      }
    } catch (err: any) {
      toast(err?.message || 'Не удалось загрузить данные аналитики', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData(days);
  }, [days, loadData]);

  const handleRecalculate = async () => {
    try {
      setRecalculating(true);
      const res = await post<{ success: boolean; analytics: AnalyticsFullOverview }>('/api/analytics/recalculate');
      if (res.analytics) {
        setData(res.analytics);
      } else {
        await loadData(days);
      }
      toast('AI-паттерны и аналитические агрегаты пересчитаны!', 'success');
    } catch (err: any) {
      toast(err?.message || 'Ошибка пересчета паттернов', 'error');
    } finally {
      setRecalculating(false);
    }
  };

  const handleExportCsv = () => {
    if (!data) return;
    try {
      const csvRows: string[] = [];
      csvRows.push('=== ОБЗОР ВОРОНКИ ПРОДАЖ И МЕТРИК ===');
      csvRows.push(`Период,Последние ${days} дней`);
      csvRows.push(`Дата отчета,${new Date().toLocaleString('ru-RU')}`);
      csvRows.push('');
      csvRows.push('Метрика,Значение');
      csvRows.push(`Лидов найдено,${data.metrics.leadsFound}`);
      csvRows.push(`Лидов охвачено (Contacted),${data.metrics.leadsContacted}`);
      csvRows.push(`Получено ответов (Replies),${data.metrics.replies}`);
      csvRows.push(`Response Rate,${data.metrics.responseRate}%`);
      csvRows.push(`Квалифицировано,${data.metrics.qualified}`);
      csvRows.push(`Выставлено КП (Proposals),${data.metrics.proposals}`);
      csvRows.push(`Переговоры,${data.metrics.negotiations}`);
      csvRows.push(`Выиграно сделок (Won),${data.metrics.won}`);
      csvRows.push(`Утрачено (Lost),${data.metrics.lost}`);
      csvRows.push(`Итоговая конверсия воронки,${data.metrics.conversionRate}%`);
      csvRows.push(`Средний чек сделки,${data.metrics.averageDeal} ₸`);
      csvRows.push(`Общая выручка,${data.metrics.revenue} ₸`);
      csvRows.push(`Повторяющаяся выручка (MRR),${data.metrics.recurringRevenue} ₸/мес`);
      csvRows.push(`Средний цикл сделки,${data.metrics.averageSalesCycleDays} дней`);
      csvRows.push('');
      csvRows.push('=== ЭФФЕКТИВНОСТЬ ПО КАНАЛАМ ===');
      csvRows.push('Канал,Лидов,Охвачено,Ответов,Response Rate %,КП,Выиграно,Конверсия %,Выручка ₸,Средний чек ₸');
      data.channels.forEach((c) => {
        csvRows.push(`${c.label},${c.leadsCount},${c.contactedCount},${c.repliesCount},${c.responseRate}%,${c.proposalsCount},${c.wonCount},${c.conversionRate}%,${c.revenue},${c.averageDeal}`);
      });
      csvRows.push('');
      csvRows.push('=== ЭФФЕКТИВНОСТЬ ПО НИШАМ ===');
      csvRows.push('Ниша,Лидов,Охвачено,Ответов,Response Rate %,Квалифицировано,Выиграно,Конверсия %,Выручка ₸,Главная боль,Топ-услуга');
      data.niches.forEach((n) => {
        csvRows.push(`"${n.niche}",${n.leadsCount},${n.contactedCount},${n.repliesCount},${n.responseRate}%,${n.qualifiedCount},${n.wonCount},${n.conversionRate}%,${n.totalRevenue},"${n.topPainIdentified}","${n.topServiceSold}"`);
      });
      csvRows.push('');
      csvRows.push('=== AI PATTERN INTELLIGENCE (НАЙДЕННЫЕ ЗАКОНОМЕРНОСТИ) ===');
      csvRows.push('Категория,Заголовок,Уверенность %,Влияние,Обоснование,Рекомендация AI');
      data.patterns.forEach((p) => {
        csvRows.push(`"${p.category}","${p.title}",${p.confidence}%,"${p.impact}","${p.evidence.replace(/"/g, '""')}","${p.actionableRecommendation.replace(/"/g, '""')}"`);
      });

      const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `nexora_sales_analytics_${days}d_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast('Аналитический отчет успешно экспортирован в CSV', 'success');
    } catch {
      toast('Не удалось сформировать CSV файл', 'error');
    }
  };

  // Filtered patterns
  const filteredPatterns = useMemo(() => {
    if (!data?.patterns) return [];
    return data.patterns.filter((p) => {
      const matchCat = patternFilter === 'ALL' || p.category === patternFilter;
      const matchSearch =
        !searchQuery ||
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.actionableRecommendation.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [data?.patterns, patternFilter, searchQuery]);

  // Sorted Niches
  const sortedNiches = useMemo(() => {
    if (!data?.niches) return [];
    return [...data.niches].sort((a, b) => {
      let valA: any = (a as any)[sortField];
      let valB: any = (b as any)[sortField];
      if (typeof valA === 'string') return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      return sortAsc ? (valA || 0) - (valB || 0) : (valB || 0) - (valA || 0);
    });
  }, [data?.niches, sortField, sortAsc]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const metrics = data?.metrics;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 rounded-2xl shadow-lg border border-indigo-900/50 relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="space-y-1 relative z-10">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              <BarChart3 className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Система Аналитики & AI Pattern Intelligence</h1>
            <span className="bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 text-xs font-black uppercase px-2 py-0.5 rounded-full shadow-xs">
              AI Powered
            </span>
          </div>
          <p className="text-sm text-slate-300">
            Многомерная аналитика продаж, воронка конверсии в реальном времени и выявление коммерческих закономерностей
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 relative z-10">
          {/* Period selector */}
          <div className="flex bg-slate-800/80 p-1 rounded-xl border border-slate-700/80 text-xs font-medium">
            {[
              { label: '7 дней', val: 7 },
              { label: '30 дней', val: 30 },
              { label: '90 дней', val: 90 },
              { label: 'Все время', val: 365 },
            ].map((p) => (
              <button
                key={p.val}
                onClick={() => setDays(p.val)}
                className={clsx(
                  'px-3 py-1.5 rounded-lg transition-all',
                  days === p.val
                    ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700/50',
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Recalculate AI Patterns */}
          <Button
            size="sm"
            onClick={handleRecalculate}
            disabled={recalculating}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium border border-indigo-400/30 gap-1.5 shadow-sm"
          >
            <RefreshCw className={clsx('w-3.5 h-3.5', recalculating && 'animate-spin')} />
            {recalculating ? 'Анализ...' : 'Пересчитать AI'}
          </Button>

          {/* Export CSV */}
          <Button
            size="sm"
            variant="secondary"
            onClick={handleExportCsv}
            className="bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-200 font-medium gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Экспорт CSV
          </Button>
        </div>
      </div>

      {/* Top 6 KPI Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* Metric 1: Leads Found & Contacted */}
        <Card className="p-4 bg-white border-slate-200 shadow-xs hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Лиды Найдено</span>
            <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {loading ? '—' : (metrics?.leadsFound || 0).toLocaleString('ru-RU')}
          </div>
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-xs text-slate-500">
            <span>Охвачено AI:</span>
            <span className="font-semibold text-slate-700">{metrics?.leadsContacted || 0}</span>
          </div>
        </Card>

        {/* Metric 2: Replies & Response Rate */}
        <Card className="p-4 bg-white border-slate-200 shadow-xs hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Отклики (Replies)</span>
            <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
              <Zap className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {loading ? '—' : (metrics?.replies || 0).toLocaleString('ru-RU')}
          </div>
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-xs text-slate-500">
            <span>Response Rate:</span>
            <span className="font-bold text-emerald-600">{metrics?.responseRate || 0}%</span>
          </div>
        </Card>

        {/* Metric 3: Qualified & Proposals */}
        <Card className="p-4 bg-white border-slate-200 shadow-xs hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Квалиф. / КП</span>
            <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
              <Target className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {loading ? '—' : `${metrics?.qualified || 0} / ${metrics?.proposals || 0}`}
          </div>
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-xs text-slate-500">
            <span>В переговорах:</span>
            <span className="font-semibold text-indigo-600">{metrics?.negotiations || 0}</span>
          </div>
        </Card>

        {/* Metric 4: Won Deals & Conversion */}
        <Card className="p-4 bg-white border-slate-200 shadow-xs hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Сделки Won / Lost</span>
            <div className="p-1.5 rounded-lg bg-teal-50 text-teal-600">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-600">
            {loading ? '—' : `${metrics?.won || 0}`}
            <span className="text-xs font-normal text-rose-500 ml-1.5">
              / {metrics?.lost || 0} отказ
            </span>
          </div>
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-xs text-slate-500">
            <span>Итог. Конверсия:</span>
            <span className="font-bold text-teal-700">{metrics?.conversionRate || 0}%</span>
          </div>
        </Card>

        {/* Metric 5: Revenue & MRR */}
        <Card className="p-4 bg-white border-slate-200 shadow-xs hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Выручка</span>
            <div className="p-1.5 rounded-lg bg-amber-50 text-amber-600">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 truncate" title={`${metrics?.revenue || 0} ₸`}>
            {loading ? '—' : `${(metrics?.revenue || 0).toLocaleString('ru-RU')} ₸`}
          </div>
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-xs text-slate-500">
            <span>MRR подписка:</span>
            <span className="font-bold text-amber-600 truncate">
              {(metrics?.recurringRevenue || 0).toLocaleString('ru-RU')} ₸/мес
            </span>
          </div>
        </Card>

        {/* Metric 6: Average Deal & Sales Cycle */}
        <Card className="p-4 bg-white border-slate-200 shadow-xs hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Средний Чек</span>
            <div className="p-1.5 rounded-lg bg-purple-50 text-purple-600">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 truncate" title={`${metrics?.averageDeal || 0} ₸`}>
            {loading ? '—' : `${(metrics?.averageDeal || 0).toLocaleString('ru-RU')} ₸`}
          </div>
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-xs text-slate-500">
            <span>Цикл сделки:</span>
            <span className="font-semibold text-purple-700">{metrics?.averageSalesCycleDays || 0} дн.</span>
          </div>
        </Card>
      </div>

      {/* Main Tab Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-1 overflow-x-auto text-sm font-medium">
        {[
          { id: 'patterns', label: 'AI Pattern Intelligence', icon: Sparkles, badge: data?.patterns.length || 0, isAi: true },
          { id: 'funnel', label: 'Воронка Продаж', icon: Layers },
          { id: 'channels', label: 'Каналы Связи', icon: Smartphone, badge: data?.channels.length || 0 },
          { id: 'niches', label: 'Ниши & Отрасли', icon: Building, badge: data?.niches.length || 0 },
          { id: 'sources', label: 'Источники Лидов', icon: Target, badge: data?.sources.length || 0 },
          { id: 'objections', label: 'Возражения & Тактики', icon: ShieldAlert, badge: data?.objections.length || 0 },
        ].map((tab) => {
          const active = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={clsx(
                'flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all whitespace-nowrap relative',
                active
                  ? 'bg-indigo-50 text-indigo-700 font-bold border border-indigo-200 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70',
              )}
            >
              <Icon className={clsx('w-4 h-4', active ? 'text-indigo-600' : 'text-slate-400')} />
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span
                  className={clsx(
                    'px-1.5 py-0.5 rounded-full text-[10px] font-bold',
                    active ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-700',
                  )}
                >
                  {tab.badge}
                </span>
              )}
              {tab.isAi && (
                <span className="bg-gradient-to-r from-amber-500 to-pink-500 text-white text-[9px] font-black uppercase px-1.5 py-0.2 rounded-full shadow-xs">
                  AI
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* TAB CONTENT: AI PATTERN INTELLIGENCE */}
      {activeTab === 'patterns' && (
        <div className="space-y-6">
          {/* Pattern Search & Category Filter Header */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="font-bold text-slate-700 flex items-center gap-1.5 mr-1">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                Категория:
              </span>
              {[
                { id: 'ALL', label: 'Все паттерны' },
                { id: 'TOP_CONVERTING_NICHES', label: 'Топ-Ниши' },
                { id: 'HIGH_IMPACT_PROBLEMS', label: 'Боли бизнеса' },
                { id: 'BEST_SELLING_SERVICES', label: 'Топ-Услуги' },
                { id: 'CHURN_DROP_OFF_POINTS', label: 'Точки Оттока' },
                { id: 'HIGH_RESPONSE_MESSAGES', label: 'Формулы Сообщений' },
                { id: 'HUMAN_HANDOFF_HOTSPOTS', label: 'Human Handoff' },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setPatternFilter(f.id)}
                  className={clsx(
                    'px-2.5 py-1 rounded-lg transition-colors font-medium',
                    patternFilter === f.id
                      ? 'bg-indigo-600 text-white font-semibold'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Search query */}
            <div className="relative w-full md:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск по инсайтам..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
              />
            </div>
          </div>

          {/* Pattern Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {filteredPatterns.length === 0 ? (
              <div className="col-span-2 text-center py-12 bg-white rounded-xl border border-slate-200">
                <Sparkles className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <div className="text-sm font-semibold text-slate-700">Нет паттернов по выбранным фильтрам</div>
                <div className="text-xs text-slate-400 mt-1">Попробуйте сбросить категорию или изменить поисковый запрос</div>
              </div>
            ) : (
              filteredPatterns.map((pattern) => {
                const meta = CATEGORY_META[pattern.category] || {
                  label: pattern.category,
                  icon: Sparkles,
                  color: 'text-indigo-600',
                  badgeBg: 'bg-indigo-50 text-indigo-700 border-indigo-200',
                };
                const CategoryIcon = meta.icon;

                const impactColor =
                  pattern.impact === 'CRITICAL'
                    ? 'bg-rose-100 text-rose-800 border-rose-300'
                    : pattern.impact === 'HIGH'
                    ? 'bg-amber-100 text-amber-800 border-amber-300'
                    : pattern.impact === 'POSITIVE'
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                    : 'bg-blue-100 text-blue-800 border-blue-300';

                return (
                  <Card
                    key={pattern.id}
                    className="p-5 bg-white border-slate-200 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
                  >
                    <div>
                      {/* Top Header of Card */}
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-2">
                          <div className={clsx('p-2 rounded-xl bg-slate-50 border border-slate-200', meta.color)}>
                            <CategoryIcon className="w-5 h-5" />
                          </div>
                          <div>
                            <span className={clsx('text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border', meta.badgeBg)}>
                              {meta.label}
                            </span>
                            <h3 className="text-base font-bold text-slate-900 mt-1 leading-snug">{pattern.title}</h3>
                          </div>
                        </div>

                        {/* Impact badge */}
                        <span className={clsx('text-[10px] font-bold px-2 py-0.5 rounded-md border shrink-0', impactColor)}>
                          {pattern.impact} IMPACT
                        </span>
                      </div>

                      {/* Summary */}
                      <p className="text-xs text-slate-600 mb-4 leading-relaxed bg-slate-50/70 p-2.5 rounded-lg border border-slate-100">
                        {pattern.summary}
                      </p>

                      {/* Primary Metrics Highlight */}
                      <div className="grid grid-cols-2 gap-2 mb-4 bg-indigo-50/40 p-2.5 rounded-xl border border-indigo-100">
                        <div>
                          <div className="text-[10px] font-semibold text-slate-500 uppercase">Основной показатель</div>
                          <div className="text-sm font-bold text-indigo-900">{pattern.metrics.primaryValue}</div>
                        </div>
                        {pattern.metrics.secondaryValue && (
                          <div>
                            <div className="text-[10px] font-semibold text-slate-500 uppercase">Сравнение / База</div>
                            <div className="text-sm font-bold text-slate-800">{pattern.metrics.secondaryValue}</div>
                          </div>
                        )}
                      </div>

                      {/* Evidence */}
                      <div className="mb-4">
                        <div className="text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                          <Info className="w-3.5 h-3.5 text-slate-400" />
                          Обоснование на данных (Evidence):
                        </div>
                        <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100 font-mono text-[11px] leading-relaxed">
                          {pattern.evidence}
                        </p>
                      </div>
                    </div>

                    {/* Actionable AI Recommendation footer */}
                    <div className="pt-3 border-t border-slate-100">
                      <div className="text-[11px] font-bold text-emerald-800 mb-1 flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                        Рекомендация AI для внедрения:
                      </div>
                      <p className="text-xs font-medium text-emerald-900 bg-emerald-50/70 p-2.5 rounded-lg border border-emerald-200/80 leading-relaxed">
                        {pattern.actionableRecommendation}
                      </p>
                      <div className="flex items-center justify-between mt-3 text-[10px] text-slate-400">
                        <span>Выборка: {pattern.metrics.sampleSize} контактов</span>
                        <div className="flex items-center gap-1">
                          <span>AI Confidence:</span>
                          <span className="font-bold text-indigo-600">{pattern.confidence}%</span>
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT: FUNNEL CONVERSION */}
      {activeTab === 'funnel' && (
        <Card className="p-6 bg-white border-slate-200 shadow-xs space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Поэтапная сквозная воронка конверсии</h2>
              <p className="text-xs text-slate-500">
                Конверсия на каждом этапе пути лида от первого сбора данных до успешного закрытия сделки
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500">Сквозная конверсия (Won / Total):</div>
              <div className="text-xl font-black text-emerald-600">{metrics?.conversionRate || 0}%</div>
            </div>
          </div>

          <div className="space-y-4">
            {data?.funnel.map((stage, idx) => {
              const maxCount = data.funnel[0]?.count || 1;
              const barWidth = Math.max(8, Math.round((stage.count / maxCount) * 100));

              return (
                <div key={stage.stage} className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 font-bold text-slate-800">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs">
                        {idx + 1}
                      </span>
                      <span>{stage.label}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <div>
                        <span className="text-slate-400 mr-1">Количество:</span>
                        <span className="font-bold text-slate-900 text-sm">{stage.count}</span>
                      </div>
                      {idx > 0 && (
                        <div className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md font-semibold border border-indigo-200">
                          {stage.conversionFromPreviousPercent}% от пред. шага
                        </div>
                      )}
                      <div className="bg-slate-200/70 text-slate-700 px-2 py-0.5 rounded-md font-semibold">
                        {stage.conversionFromTotalPercent}% от базы
                      </div>
                    </div>
                  </div>

                  {/* Funnel Bar */}
                  <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden flex">
                    <div
                      className="bg-gradient-to-r from-indigo-500 to-emerald-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>

                  {/* Drop-off details */}
                  {stage.dropOffCount > 0 && (
                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                      <span className="flex items-center gap-1 text-rose-600 font-medium">
                        <TrendingDown className="w-3.5 h-3.5" />
                        Дроп-офф / потеряно на этом шаге: {stage.dropOffCount} лидов
                      </span>
                      <span>
                        Перешло на след. этап: {stage.count - stage.dropOffCount} ({stage.conversionFromPreviousPercent}%)
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* TAB CONTENT: CHANNELS */}
      {activeTab === 'channels' && (
        <div className="space-y-6">
          {/* Omni-channel cards grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {data?.channels.map((channel) => {
              const meta = CHANNEL_ICONS[channel.channel] || {
                icon: Smartphone,
                color: 'text-indigo-600',
                bg: 'bg-indigo-50',
              };
              const ChannelIcon = meta.icon;

              return (
                <Card key={channel.channel} className="p-5 bg-white border-slate-200 shadow-xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className={clsx('p-2 rounded-xl', meta.bg, meta.color)}>
                          <ChannelIcon className="w-5 h-5" />
                        </div>
                        <h3 className="font-bold text-slate-900">{channel.label}</h3>
                      </div>
                      <span className="text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">
                        {channel.accountsCount} акк.
                      </span>
                    </div>

                    <div className="space-y-2 text-xs mb-4">
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-500">Лидов охвачено:</span>
                        <span className="font-semibold text-slate-800">{channel.contactedCount} / {channel.leadsCount}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-500">Ответов (Response Rate):</span>
                        <span className="font-bold text-emerald-600">{channel.repliesCount} ({channel.responseRate}%)</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-500">Выставлено КП:</span>
                        <span className="font-semibold text-indigo-600">{channel.proposalsCount}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-500">Закрыто сделок (Won):</span>
                        <span className="font-bold text-slate-900">{channel.wonCount}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-500">Конверсия канала:</span>
                        <span className="font-bold text-teal-700">{channel.conversionRate}%</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 bg-slate-50 -mx-5 -mb-5 p-4 rounded-b-xl">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Привлеченная Выручка</div>
                    <div className="text-lg font-black text-slate-900 mt-0.5">
                      {channel.revenue.toLocaleString('ru-RU')} ₸
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      Средний чек: {channel.averageDeal.toLocaleString('ru-RU')} ₸
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Channel Comparison Table */}
          <Card className="p-6 bg-white border-slate-200 shadow-xs overflow-x-auto">
            <h3 className="text-base font-bold text-slate-900 mb-4">Сводная матрица сравнения каналов</h3>
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 uppercase font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Канал</th>
                  <th className="py-3 px-4">Аккаунты</th>
                  <th className="py-3 px-4">База Лидов</th>
                  <th className="py-3 px-4">Охвачено</th>
                  <th className="py-3 px-4">Откликов</th>
                  <th className="py-3 px-4">Response Rate</th>
                  <th className="py-3 px-4">КП</th>
                  <th className="py-3 px-4">Сделок Won</th>
                  <th className="py-3 px-4">Конверсия</th>
                  <th className="py-3 px-4">Выручка</th>
                  <th className="py-3 px-4">Ср. Чек</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data?.channels.map((c) => (
                  <tr key={c.channel} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-bold text-slate-900">{c.label}</td>
                    <td className="py-3 px-4 text-slate-600">{c.accountsCount}</td>
                    <td className="py-3 px-4 text-slate-600">{c.leadsCount}</td>
                    <td className="py-3 px-4 text-slate-600">{c.contactedCount}</td>
                    <td className="py-3 px-4 font-medium text-slate-800">{c.repliesCount}</td>
                    <td className="py-3 px-4 font-bold text-emerald-600">{c.responseRate}%</td>
                    <td className="py-3 px-4 text-indigo-600 font-semibold">{c.proposalsCount}</td>
                    <td className="py-3 px-4 font-bold text-teal-700">{c.wonCount}</td>
                    <td className="py-3 px-4 font-bold text-slate-900">{c.conversionRate}%</td>
                    <td className="py-3 px-4 font-bold text-slate-900">{c.revenue.toLocaleString('ru-RU')} ₸</td>
                    <td className="py-3 px-4 text-slate-600">{c.averageDeal.toLocaleString('ru-RU')} ₸</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {/* TAB CONTENT: NICHES */}
      {activeTab === 'niches' && (
        <Card className="p-6 bg-white border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Эффективность по нишам и сегментам бизнеса</h2>
              <p className="text-xs text-slate-500">
                Где AI Sales Agent показывает максимальную конверсию, средний чек и окупаемость
              </p>
            </div>
            <div className="text-xs text-slate-500">
              Сортировка: <span className="font-semibold text-slate-700">{sortField} ({sortAsc ? '▲' : '▼'})</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 uppercase font-semibold border-b border-slate-200 cursor-pointer">
                <tr>
                  <th className="py-3 px-4" onClick={() => handleSort('niche')}>Ниша</th>
                  <th className="py-3 px-4" onClick={() => handleSort('leadsCount')}>Лидов</th>
                  <th className="py-3 px-4" onClick={() => handleSort('repliesCount')}>Ответов</th>
                  <th className="py-3 px-4" onClick={() => handleSort('responseRate')}>Response Rate</th>
                  <th className="py-3 px-4" onClick={() => handleSort('wonCount')}>Сделок Won</th>
                  <th className="py-3 px-4" onClick={() => handleSort('conversionRate')}>Конверсия</th>
                  <th className="py-3 px-4" onClick={() => handleSort('totalRevenue')}>Выручка</th>
                  <th className="py-3 px-4" onClick={() => handleSort('averageDeal')}>Ср. Чек</th>
                  <th className="py-3 px-4">Главная выявленная боль</th>
                  <th className="py-3 px-4">Топ-услуга продажи</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedNiches.map((n) => (
                  <tr key={n.niche} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-slate-900 whitespace-nowrap">{n.niche}</td>
                    <td className="py-3.5 px-4 text-slate-600">{n.leadsCount}</td>
                    <td className="py-3.5 px-4 font-medium text-slate-800">{n.repliesCount}</td>
                    <td className="py-3.5 px-4 font-bold text-emerald-600">{n.responseRate}%</td>
                    <td className="py-3.5 px-4 font-bold text-teal-700">{n.wonCount}</td>
                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-bold border border-indigo-200">
                        {n.conversionRate}%
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-900 whitespace-nowrap">
                      {n.totalRevenue.toLocaleString('ru-RU')} ₸
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                      {n.averageDeal.toLocaleString('ru-RU')} ₸
                    </td>
                    <td className="py-3.5 px-4 text-amber-800 font-medium">
                      <span className="bg-amber-50 text-amber-800 px-2 py-0.5 rounded border border-amber-200 block truncate max-w-xs" title={n.topPainIdentified}>
                        {n.topPainIdentified}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-blue-800 font-medium">
                      <span className="bg-blue-50 text-blue-800 px-2 py-0.5 rounded border border-blue-200 block truncate max-w-xs" title={n.topServiceSold}>
                        {n.topServiceSold}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* TAB CONTENT: SOURCES */}
      {activeTab === 'sources' && (
        <Card className="p-6 bg-white border-slate-200 shadow-xs space-y-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Качество и отдача каналов лидогенерации</h2>
            <p className="text-xs text-slate-500">
              Сравнение источников поиска и импорта контактов по индексу качества и окупаемости
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 uppercase font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Источник</th>
                  <th className="py-3 px-4">Лидов в базе</th>
                  <th className="py-3 px-4">Откликов</th>
                  <th className="py-3 px-4">Response Rate</th>
                  <th className="py-3 px-4">Закрытых сделок</th>
                  <th className="py-3 px-4">Конверсия</th>
                  <th className="py-3 px-4">Общая Выручка</th>
                  <th className="py-3 px-4">Индекс Качества (Score)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data?.sources.map((s) => (
                  <tr key={s.source} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-bold text-slate-900">{s.source}</td>
                    <td className="py-3 px-4 text-slate-600">{s.leadsCount}</td>
                    <td className="py-3 px-4 font-medium text-slate-800">{s.repliesCount}</td>
                    <td className="py-3 px-4 font-bold text-emerald-600">{s.responseRate}%</td>
                    <td className="py-3 px-4 font-bold text-teal-700">{s.wonCount}</td>
                    <td className="py-3 px-4 font-bold text-slate-900">{s.conversionRate}%</td>
                    <td className="py-3 px-4 font-bold text-slate-900">{s.totalRevenue.toLocaleString('ru-RU')} ₸</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-slate-200 rounded-full h-2 overflow-hidden">
                          <div
                            className={clsx(
                              'h-full rounded-full',
                              s.qualityScore >= 75 ? 'bg-emerald-500' : s.qualityScore >= 50 ? 'bg-amber-500' : 'bg-rose-500',
                            )}
                            style={{ width: `${s.qualityScore}%` }}
                          />
                        </div>
                        <span className="font-bold text-slate-800">{s.qualityScore}/100</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* TAB CONTENT: OBJECTIONS */}
      {activeTab === 'objections' && (
        <div className="space-y-6">
          <Card className="p-6 bg-white border-slate-200 shadow-xs space-y-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Анализ возражений и победные тактики AI</h2>
              <p className="text-xs text-slate-500">
                Частота типовых возражений клиентов и конверсия их успешного преодоления нейроагентом
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data?.objections.map((obj) => (
                <div key={obj.objectionType} className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] font-bold uppercase text-slate-400 font-mono">
                        {obj.objectionType}
                      </span>
                      <h4 className="text-sm font-bold text-slate-900 mt-0.5">{obj.label}</h4>
                    </div>
                    <span className="bg-slate-200/80 text-slate-800 text-xs font-bold px-2 py-0.5 rounded-full">
                      {obj.frequency} раз ({obj.percentage}%)
                    </span>
                  </div>

                  {/* Resolution progress */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-slate-600">
                      <span>Успешно закрыто в сделку:</span>
                      <span className="font-bold text-emerald-600">
                        {obj.resolvedCount} из {obj.frequency} ({obj.resolutionRate}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-amber-500 to-emerald-500 h-full rounded-full"
                        style={{ width: `${obj.resolutionRate}%` }}
                      />
                    </div>
                  </div>

                  {/* Winning AI Strategy */}
                  <div className="pt-2 border-t border-slate-200 text-xs">
                    <span className="font-bold text-indigo-900 flex items-center gap-1 mb-1">
                      <Zap className="w-3.5 h-3.5 text-indigo-600" />
                      Победная тактика AI:
                    </span>
                    <p className="text-slate-700 bg-white p-2.5 rounded-lg border border-slate-200 text-[11px] leading-relaxed">
                      {obj.topWinningStrategy}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
