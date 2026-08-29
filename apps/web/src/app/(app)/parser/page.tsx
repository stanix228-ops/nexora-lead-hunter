'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  MapPin,
  Search,
  Download,
  UserPlus,
  Loader2,
  Building2,
  Phone,
  Globe,
  Instagram,
  Send,
  ExternalLink,
  Clock,
  Mail,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  RefreshCw,
  SlidersHorizontal,
  X,
  Copy,
  Star,
  Check,
  Filter,
  MessageSquare,
  Flame,
  FolderOpen,
  History,
  Trash2,
  Edit2,
  Calendar,
  Smartphone,
  ChevronRight,
  ArrowLeft,
  Share2,
  Users,
  Shuffle,
  Layers,
  ChevronDown,
  LayoutGrid,
} from 'lucide-react';
import { get, post, patch, del, getToken } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';

export interface FirmResult {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  allPhones: string[];
  whatsapp: string | null;
  instagram: string | null;
  email: string | null;
  site: string | null;
  schedule: string | null;
  rating: number | null;
  reviewsCount?: number | null;
  vk?: string | null;
  telegram?: string | null;
  facebook?: string | null;
  youtube?: string | null;
  tiktok?: string | null;
  profileLink: string;
}

export interface ParserSessionSummary {
  id: string;
  userId: string;
  title: string;
  niche: string;
  city: string;
  country: string;
  createdAt: string;
  updatedAt: string;
  totalFound: number;
  withSiteCount: number;
  withoutSiteCount: number;
  whatsappCount: number;
  phonesCount: number;
  itemsCount: number;
}

export interface ParserSessionDetail extends ParserSessionSummary {
  items: FirmResult[];
}

interface CitiesResponse {
  countries: Record<string, string[]>;
  list: Array<{ name: string; domain: string; country: string }>;
}

interface CampaignOption {
  id: string;
  name: string;
}

interface WhatsAppAccountOption {
  id: string;
  name: string;
  phoneMasked: string;
  phone: string;
  status: string;
  gatewayStatus?: string | null;
}

const NICHE_SUGGESTIONS = [
  'Стоматология',
  'Автосервис',
  'Салоны красоты',
  'Рестораны и кафе',
  'Недвижимость',
  'Юридические услуги',
  'Строительные компании',
  'Клининг',
  'Фитнес клубы',
  'Цветочные магазины',
  'Одежда и обувь',
  'Медицинские центры',
  'Турагентства',
  'Бухгалтерские услуги',
  'Мебель на заказ',
];

export default function ParserPage() {
  const router = useRouter();
  const { toast } = useToast();

  // Active View Tab
  const [activeTab, setActiveTab] = useState<'search' | 'history'>('search');

  // Search parameters
  const [countriesMap, setCountriesMap] = useState<Record<string, string[]>>({});
  const [selectedCountry, setSelectedCountry] = useState<string>('Казахстан');
  const [selectedCity, setSelectedCity] = useState<string>('Алматы');
  const [customCity, setCustomCity] = useState<string>('');
  const [useCustomCity, setUseCustomCity] = useState<boolean>(false);
  const [niche, setNiche] = useState<string>('');
  const [limit, setLimit] = useState<number>(30);

  // Search execution & results
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [progressMsg, setProgressMsg] = useState<string>('');
  const [results, setResults] = useState<FirmResult[]>([]);
  const [totalFound, setTotalFound] = useState<number>(0);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);

  // Active Session info
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeSessionTitle, setActiveSessionTitle] = useState<string>('');
  const [isEditingTitle, setIsEditingTitle] = useState<boolean>(false);
  const [tempTitle, setTempTitle] = useState<string>('');

  // Sessions History
  const [sessions, setSessions] = useState<ParserSessionSummary[]>([]);
  const [sessionsSearch, setSessionsSearch] = useState<string>('');
  const [isLoadingSessions, setIsLoadingSessions] = useState<boolean>(false);

  // Filters within table
  const [websiteFilter, setWebsiteFilter] = useState<'all' | 'with_site' | 'without_site'>('all');
  const [whatsappFilter, setWhatsappFilter] = useState<'all' | 'with_wa'>('all');
  const [phoneFilter, setPhoneFilter] = useState<'all' | 'with_phone'>('all');
  const [tableSearch, setTableSearch] = useState<string>('');

  // Connected WhatsApp accounts & default picker
  const [waAccounts, setWaAccounts] = useState<WhatsAppAccountOption[]>([]);
  const [defaultWaAccountId, setDefaultWaAccountId] = useState<string>('');
  const [openAccountDropdownIdx, setOpenAccountDropdownIdx] = useState<number | null>(null);

  // Smart Distribution Modal
  const [showDistributionModal, setShowDistributionModal] = useState<boolean>(false);
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());
  const [distributionMode, setDistributionMode] = useState<'round_robin' | 'single' | 'batch'>('round_robin');
  const [perAccountLimit, setPerAccountLimit] = useState<number>(20);
  const [isDistributing, setIsDistributing] = useState<boolean>(false);
  const [distributionSuccess, setDistributionSuccess] = useState<{
    totalAdded: number;
    distribution: Array<{ accountId: string; accountName: string; phoneMasked: string; count: number }>;
  } | null>(null);

  // Import to Leads Modal
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<string>('');
  const [skipDuplicates, setSkipDuplicates] = useState<boolean>(true);
  const [isImporting, setIsImporting] = useState<boolean>(false);

  const eventSourceRef = useRef<EventSource | null>(null);

  // Load sessions history
  const loadSessions = useCallback(async () => {
    setIsLoadingSessions(true);
    try {
      const res = await get<{ items: ParserSessionSummary[] }>('/api/parser/sessions');
      setSessions(res.items || []);
    } catch {
      setSessions([]);
    } finally {
      setIsLoadingSessions(false);
    }
  }, []);

  useEffect(() => {
    // 1. Load cities
    void get<CitiesResponse>('/api/parser/cities')
      .then((res) => {
        setCountriesMap(res.countries);
        if (res.countries['Казахстан']?.[0]) {
          setSelectedCity(res.countries['Казахстан'][0]);
        }
      })
      .catch((err) => toast((err as Error).message, 'danger'));

    // 2. Load campaigns
    void get<{ items: CampaignOption[] }>('/api/campaigns')
      .then((res) => setCampaigns(res.items || []))
      .catch(() => setCampaigns([]));

    // 3. Load WhatsApp accounts
    void get<WhatsAppAccountOption[]>('/api/whatsapp')
      .then((accs) => {
        setWaAccounts(accs || []);
        if (accs?.[0]) {
          setDefaultWaAccountId(accs[0].id);
          setSelectedAccountIds(new Set(accs.map((a) => a.id)));
        }
      })
      .catch(() => {
        void get<{ items: WhatsAppAccountOption[] }>('/api/accounts')
          .then((res) => {
            setWaAccounts(res.items || []);
            if (res.items?.[0]) {
              setDefaultWaAccountId(res.items[0].id);
              setSelectedAccountIds(new Set(res.items.map((a) => a.id)));
            }
          })
          .catch(() => setWaAccounts([]));
      });

    // 4. Load sessions history
    void loadSessions();
  }, [toast, loadSessions]);

  const citiesInCountry = useMemo(() => {
    return countriesMap[selectedCountry] || [];
  }, [countriesMap, selectedCountry]);

  const handleCountryChange = (c: string) => {
    setSelectedCountry(c);
    const list = countriesMap[c] || [];
    if (list[0]) {
      setSelectedCity(list[0]);
    }
  };

  const activeCityName = useCustomCity && customCity.trim() ? customCity.trim() : selectedCity;

  const stopParsing = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsParsing(false);
    setProgressMsg('Парсинг остановлен пользователем');
  };

  const startParsing = () => {
    if (!activeCityName) {
      toast('Выберите или введите город для поиска', 'info');
      return;
    }
    if (!niche.trim()) {
      toast('Укажите нишу или категорию бизнеса', 'info');
      return;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setResults([]);
    setSelectedIndices(new Set());
    setTotalFound(0);
    setActiveSessionId(null);
    setActiveSessionTitle('');
    setIsParsing(true);
    setProgressMsg('Инициализация сессии и подключение к 2GIS...');
    setActiveTab('search');

    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    const token = getToken();
    const params = new URLSearchParams({
      city: activeCityName,
      country: selectedCountry,
      niche: niche.trim(),
      limit: String(limit),
      websiteFilter,
      whatsappFilter,
      phoneFilter,
    });
    if (token) params.set('token', token);

    const url = `${apiBase}/api/parser/search?${params.toString()}`;
    const es = new EventSource(url, { withCredentials: true });
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'progress') {
          setProgressMsg(payload.data?.message || 'Сбор данных...');
        } else if (payload.type === 'result') {
          const item: FirmResult = payload.data;
          setResults((prev) => {
            if (prev.some((p) => p.profileLink === item.profileLink || (p.phone && p.phone === item.phone))) {
              return prev;
            }
            return [...prev, item];
          });
        } else if (payload.type === 'complete') {
          setTotalFound(payload.data?.total || 0);
          if (payload.data?.sessionId) {
            setActiveSessionId(payload.data.sessionId);
            setActiveSessionTitle(payload.data.sessionTitle || `${niche.trim()} ${activeCityName}`);
            void loadSessions();
          }
          setProgressMsg(
            `Сбор завершен и сохранен в историю! Получено ${payload.data?.results || 0} контактов (всего: ${
              payload.data?.total || 0
            })`,
          );
          setIsParsing(false);
          es.close();
          eventSourceRef.current = null;
          toast(`Сбор «${payload.data?.sessionTitle || niche}» сохранен в историю!`, 'success');
        } else if (payload.type === 'error') {
          setProgressMsg(`Ошибка: ${payload.data?.error}`);
          setIsParsing(false);
          es.close();
          eventSourceRef.current = null;
          toast(payload.data?.error || 'Ошибка при парсинге', 'danger');
        }
      } catch {
        /* ignore parse err */
      }
    };

    es.onerror = () => {
      setIsParsing(false);
      setProgressMsg('Соединение завершено');
      es.close();
      eventSourceRef.current = null;
    };
  };

  // Open saved session
  const openSavedSession = async (sessionSummary: ParserSessionSummary) => {
    try {
      const full = await get<ParserSessionDetail>(`/api/parser/sessions/${sessionSummary.id}`);
      setResults(full.items || []);
      setActiveSessionId(full.id);
      setActiveSessionTitle(full.title);
      setNiche(full.niche);
      setSelectedCity(full.city);
      setSelectedCountry(full.country);
      setTotalFound(full.totalFound);
      setSelectedIndices(new Set());
      setActiveTab('search');
      setProgressMsg(`Загружен сохраненный сбор «${full.title}» (${full.items.length} контактов)`);
      toast(`Сбор «${full.title}» загружен`, 'info');
    } catch (err) {
      toast((err as Error).message, 'danger');
    }
  };

  // Delete saved session
  const handleDeleteSession = async (id: string, title: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!confirm(`Удалить сбор «${title}» из истории?`)) return;

    try {
      await del(`/api/parser/sessions/${id}`);
      toast(`Сбор «${title}» удален`, 'success');
      if (activeSessionId === id) {
        setActiveSessionId(null);
        setActiveSessionTitle('');
      }
      void loadSessions();
    } catch (err) {
      toast((err as Error).message, 'danger');
    }
  };

  // Rename session title
  const handleSaveTitle = async () => {
    if (!activeSessionId || !tempTitle.trim()) return;
    try {
      await patch(`/api/parser/sessions/${activeSessionId}`, { title: tempTitle.trim() });
      setActiveSessionTitle(tempTitle.trim());
      setIsEditingTitle(false);
      void loadSessions();
      toast('Название сбора обновлено', 'success');
    } catch (err) {
      toast((err as Error).message, 'danger');
    }
  };

  const copyToClipboard = (text: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedPhone(text);
    setTimeout(() => setCopiedPhone(null), 2000);
    toast(`Номер скопирован: ${text}`, 'success');
  };

  // Filtered results for table display
  const filteredResults = useMemo(() => {
    return results.filter((item) => {
      if (websiteFilter === 'with_site' && !item.site) return false;
      if (websiteFilter === 'without_site' && item.site) return false;
      if (whatsappFilter === 'with_wa' && !item.whatsapp) return false;
      if (phoneFilter === 'with_phone' && !item.phone) return false;

      if (tableSearch.trim()) {
        const q = tableSearch.toLowerCase();
        const matchesName = item.name.toLowerCase().includes(q);
        const matchesAddr = item.address.toLowerCase().includes(q);
        const matchesPhone = item.phone?.toLowerCase().includes(q);
        const matchesSite = item.site?.toLowerCase().includes(q);
        return matchesName || matchesAddr || matchesPhone || matchesSite;
      }

      return true;
    });
  }, [results, websiteFilter, whatsappFilter, phoneFilter, tableSearch]);

  const toggleSelectAll = () => {
    if (selectedIndices.size === filteredResults.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(filteredResults.map((_, i) => i)));
    }
  };

  const toggleSelectRow = (idx: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  // Export to CSV / Excel
  const exportCsv = (itemsOverride?: FirmResult[]) => {
    const targetItems =
      itemsOverride ||
      (selectedIndices.size > 0 ? filteredResults.filter((_, i) => selectedIndices.has(i)) : filteredResults);

    if (targetItems.length === 0) {
      toast('Нет данных для экспорта', 'info');
      return;
    }

    const headers = [
      'Название',
      'Телефон',
      'WhatsApp',
      'Адрес',
      'Сайт',
      'Наличие сайта',
      'Email',
      'Instagram',
      'Telegram',
      'VK',
      'Рейтинг',
      'Отзывов',
      'График',
      'Ссылка 2GIS',
    ];

    const escapeCsv = (str: string | number | null | undefined) => {
      if (str === null || str === undefined) return '""';
      return `"${String(str).replace(/"/g, '""').replace(/\n/g, ' ')}"`;
    };

    const rows = targetItems.map((f) => [
      escapeCsv(f.name),
      escapeCsv(f.phone),
      escapeCsv(f.whatsapp),
      escapeCsv(f.address),
      escapeCsv(f.site),
      escapeCsv(f.site ? 'Да' : 'Нет'),
      escapeCsv(f.email),
      escapeCsv(f.instagram),
      escapeCsv(f.telegram),
      escapeCsv(f.vk),
      escapeCsv(f.rating),
      escapeCsv(f.reviewsCount),
      escapeCsv(f.schedule),
      escapeCsv(f.profileLink),
    ]);

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const filename = `2gis_${activeSessionTitle || `${niche}_${activeCityName}`}_${Date.now()}.csv`.replace(
      /[\\/:*?"<>|]/g,
      '_',
    );
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast(`Экспортировано ${targetItems.length} записей в CSV`, 'success');
  };

  // Open single lead in WhatsApp with specific account
  const handleOpenLeadWithAccount = async (firm: FirmResult, accountId: string) => {
    const acc = waAccounts.find((a) => a.id === accountId);
    if (!acc) {
      toast('Выберите WhatsApp аккаунт', 'danger');
      return;
    }

    const phoneOrWa = firm.phone || firm.whatsapp;
    if (!phoneOrWa) {
      toast('У организации нет номера телефона', 'info');
      return;
    }

    setOpenAccountDropdownIdx(null);
    try {
      await post('/api/conversations/open-by-phone', {
        accountId: acc.id,
        input: phoneOrWa,
        companyName: firm.name,
      });
      toast(`Диалог с «${firm.name}» открыт на аккаунте «${acc.name || acc.phoneMasked}»`, 'success');
      router.push('/conversations');
    } catch (err) {
      toast((err as Error).message, 'danger');
    }
  };

  // Execute smart batch distribution
  const handleDistributionSubmit = async () => {
    const targetAccountIds = Array.from(selectedAccountIds);
    if (targetAccountIds.length === 0) {
      toast('Выберите хотя бы один WhatsApp аккаунт', 'info');
      return;
    }

    const targetItems =
      selectedIndices.size > 0 ? filteredResults.filter((_, i) => selectedIndices.has(i)) : filteredResults;

    if (targetItems.length === 0) {
      toast('Нет контактов для распределения', 'info');
      return;
    }

    setIsDistributing(true);
    setDistributionSuccess(null);

    try {
      const res = await post<{
        added: number;
        skipped: number;
        mode: string;
        distribution: Array<{ accountId: string; accountName: string; phoneMasked: string; count: number }>;
      }>('/api/parser/add-to-whatsapp', {
        accountIds: targetAccountIds,
        distributionMode,
        perAccountLimit,
        items: targetItems,
        city: activeCityName,
        niche: niche.trim(),
      });

      setDistributionSuccess({
        totalAdded: res.added,
        distribution: res.distribution,
      });

      toast(`Успешно распределено ${res.added} лидов между аккаунтами!`, 'success');
    } catch (err) {
      toast((err as Error).message, 'danger');
    } finally {
      setIsDistributing(false);
    }
  };

  // Import to Leads
  const handleImportSubmit = async () => {
    const itemsToImport =
      selectedIndices.size > 0 ? filteredResults.filter((_, i) => selectedIndices.has(i)) : filteredResults;

    if (itemsToImport.length === 0) {
      toast('Выберите хотя бы одну организацию для импорта', 'info');
      return;
    }

    setIsImporting(true);
    try {
      const res = await post<{
        imported: number;
        duplicates: number;
        skipped: number;
        totalProcessed: number;
      }>('/api/parser/import', {
        items: itemsToImport,
        city: activeCityName,
        country: selectedCountry,
        niche: niche.trim(),
        campaignId: selectedCampaign || undefined,
        skipDuplicates,
      });

      toast(`Импортировано: ${res.imported} лидов (Дубликатов: ${res.duplicates})`, 'success');
      setShowImportModal(false);
    } catch (err) {
      toast((err as Error).message, 'danger');
    } finally {
      setIsImporting(false);
    }
  };

  // Filtered Sessions
  const filteredSessions = useMemo(() => {
    if (!sessionsSearch.trim()) return sessions;
    const q = sessionsSearch.toLowerCase();
    return sessions.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.city.toLowerCase().includes(q) ||
        s.niche.toLowerCase().includes(q) ||
        s.country.toLowerCase().includes(q),
    );
  }, [sessions, sessionsSearch]);

  // Distribution Preview Calculation
  const distributionPreview = useMemo(() => {
    const totalLeads = selectedIndices.size > 0 ? selectedIndices.size : filteredResults.length;
    const accList = waAccounts.filter((a) => selectedAccountIds.has(a.id));
    if (accList.length === 0 || totalLeads === 0) return [];

    if (distributionMode === 'round_robin') {
      const base = Math.floor(totalLeads / accList.length);
      const rem = totalLeads % accList.length;
      return accList.map((acc, idx) => ({
        account: acc,
        count: base + (idx < rem ? 1 : 0),
      }));
    } else if (distributionMode === 'batch') {
      let remaining = totalLeads;
      return accList.map((acc, idx) => {
        if (idx === accList.length - 1) {
          const count = remaining;
          remaining = 0;
          return { account: acc, count };
        }
        const count = Math.min(remaining, perAccountLimit);
        remaining = Math.max(0, remaining - count);
        return { account: acc, count };
      });
    } else {
      // Single
      const first = accList[0];
      return [{ account: first!, count: totalLeads }];
    }
  }, [selectedIndices.size, filteredResults.length, waAccounts, selectedAccountIds, distributionMode, perAccountLimit]);

  // Stats
  const totalCount = results.length;
  const phonesCount = results.filter((r) => r.phone || r.whatsapp).length;
  const whatsappCount = results.filter((r) => r.whatsapp).length;
  const withSiteCount = results.filter((r) => r.site).length;
  const withoutSiteCount = results.filter((r) => !r.site).length;

  const defaultAccount = waAccounts.find((a) => a.id === defaultWaAccountId) || waAccounts[0];

  return (
    <div className="space-y-6 pb-16">
      {/* Top Header with Navigation Tabs */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <span className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-lg shadow-emerald-500/5">
            <MapPin className="w-6 h-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Парсер организаций 2ГИС</h1>
            <p className="text-sm text-slate-300 mt-0.5">
              Сбор прямых контактов, умное распределение по WhatsApp аккаунтам и история сборов
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="inline-flex rounded-xl bg-slate-900/90 p-1 border border-slate-800 shadow-md self-start md:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab('search')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'search'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Search className="w-4 h-4" />
            Поиск в 2ГИС
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'history'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <History className="w-4 h-4" />
            История сборов
            <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-[11px] font-bold text-slate-300 border border-slate-700">
              {sessions.length}
            </span>
          </button>
        </div>
      </div>

      {/* VIEW 1: HISTORY OF SAVED SESSIONS */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/90 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <FolderOpen className="w-5 h-5 text-emerald-400" /> Сохраненные сборы и поиски
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Нажмите на любой сбор, чтобы открыть все спарсенные контакты и распределить их по аккаунтам
              </p>
            </div>

            <div className="w-full sm:w-72">
              <Input
                value={sessionsSearch}
                onChange={(e) => setSessionsSearch(e.target.value)}
                placeholder="Поиск по сборам..."
                className="w-full bg-slate-950 border-slate-700 text-xs text-white"
              />
            </div>
          </div>

          {filteredSessions.length === 0 ? (
            <Card className="p-12 text-center border-slate-800 bg-slate-900/40">
              <div className="w-16 h-16 rounded-2xl bg-slate-800 text-slate-400 flex items-center justify-center mx-auto mb-4 border border-slate-700">
                <History className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-white">История сборов пока пуста</h3>
              <p className="text-sm text-slate-400 max-w-md mx-auto mt-1.5 leading-relaxed">
                Запустите поиск по любой нише и городу. Все найденные лиды автоматически сохранятся сюда под именем запроса (например: «юрист астана 28.08.26»).
              </p>
              <Button
                variant="primary"
                onClick={() => setActiveTab('search')}
                className="mt-5 gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
              >
                <Search className="w-4 h-4" /> Начать новый поиск
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredSessions.map((session) => (
                <div
                  key={session.id}
                  onClick={() => void openSavedSession(session)}
                  className={`p-5 rounded-xl border transition-all cursor-pointer hover:border-emerald-500/50 hover:shadow-xl hover:shadow-emerald-950/20 group relative ${
                    activeSessionId === session.id
                      ? 'border-emerald-500 bg-emerald-950/15'
                      : 'border-slate-800 bg-slate-900/90'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <h3 className="font-bold text-slate-100 group-hover:text-emerald-400 transition-colors text-base line-clamp-1">
                        {session.title}
                      </h3>
                      <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-emerald-400" /> {session.city} ({session.country})
                        </span>
                        <span>•</span>
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-500" />
                          {new Date(session.createdAt).toLocaleDateString('ru-RU', {
                            day: '2-digit',
                            month: '2-digit',
                            year: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => handleDeleteSession(session.id, session.title, e)}
                      title="Удалить сбор"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-60 group-hover:opacity-100"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Badges & Stats */}
                  <div className="grid grid-cols-2 gap-2 my-3.5 pt-3 border-t border-slate-800 text-xs">
                    <div className="p-2 rounded-lg bg-slate-950 border border-slate-800/80">
                      <div className="text-[11px] text-slate-400">Всего контактов:</div>
                      <div className="text-sm font-bold text-white mt-0.5">{session.itemsCount}</div>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-950 border border-slate-800/80">
                      <div className="text-[11px] text-slate-400">WhatsApp:</div>
                      <div className="text-sm font-bold text-emerald-400 mt-0.5">{session.whatsappCount}</div>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-950 border border-slate-800/80">
                      <div className="text-[11px] text-slate-400">С сайтом:</div>
                      <div className="text-sm font-bold text-sky-400 mt-0.5">{session.withSiteCount}</div>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-950 border border-slate-800/80">
                      <div className="text-[11px] text-slate-400">Без сайта:</div>
                      <div className="text-sm font-bold text-amber-400 mt-0.5">{session.withoutSiteCount}</div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between gap-2 pt-2">
                    <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1 group-hover:underline">
                      Открыть базу <ChevronRight className="w-3.5 h-3.5" />
                    </span>

                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={async (e) => {
                          e.stopPropagation();
                          const full = await get<ParserSessionDetail>(`/api/parser/sessions/${session.id}`);
                          exportCsv(full.items);
                        }}
                        title="Скачать в CSV"
                        className="px-2 py-1 text-xs border-slate-700 hover:bg-slate-800 text-slate-300"
                      >
                        <Download className="w-3 h-3" />
                      </Button>

                      <Button
                        variant="primary"
                        size="sm"
                        onClick={async (e) => {
                          e.stopPropagation();
                          const full = await get<ParserSessionDetail>(`/api/parser/sessions/${session.id}`);
                          setResults(full.items || []);
                          setActiveSessionId(full.id);
                          setActiveSessionTitle(full.title);
                          setShowDistributionModal(true);
                        }}
                        className="gap-1 px-2.5 py-1 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
                      >
                        <Shuffle className="w-3 h-3" /> Распределить
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: ACTIVE SEARCH & WORKSPACE */}
      {activeTab === 'search' && (
        <div className="space-y-6">
          {/* Active Session Info Banner */}
          {activeSessionId && (
            <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/40 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <FolderOpen className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                {isEditingTitle ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={tempTitle}
                      onChange={(e) => setTempTitle(e.target.value)}
                      className="bg-slate-950 border-slate-700 text-xs text-white font-bold h-8"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleSaveTitle();
                        if (e.key === 'Escape') setIsEditingTitle(false);
                      }}
                    />
                    <Button size="sm" variant="primary" onClick={handleSaveTitle} className="h-8 px-2 text-xs bg-emerald-600">
                      <Check className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setIsEditingTitle(false)} className="h-8 px-2 text-xs">
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">{activeSessionTitle}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setTempTitle(activeSessionTitle);
                        setIsEditingTitle(true);
                      }}
                      className="p-1 text-slate-400 hover:text-white rounded"
                      title="Переименовать сбор"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                <span className="text-xs text-slate-400 hidden sm:inline">• {results.length} лидов</span>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setActiveSessionId(null);
                    setActiveSessionTitle('');
                    setResults([]);
                  }}
                  className="text-xs border-slate-700 bg-slate-800 text-slate-300 hover:text-white"
                >
                  Новый поиск
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setActiveTab('history')}
                  className="text-xs border-slate-700 bg-slate-800 text-slate-300 hover:text-white gap-1.5"
                >
                  <History className="w-3.5 h-3.5" /> Все сборы
                </Button>
              </div>
            </div>
          )}

          {/* Main Search Filter Box */}
          <Card className="p-6 border-slate-800 bg-slate-900/90 shadow-xl shadow-black/20 backdrop-blur">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              {/* Country */}
              <div className="md:col-span-3">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 block">
                  Страна поиска
                </label>
                <Select
                  value={selectedCountry}
                  onChange={(e) => handleCountryChange(e.target.value)}
                  className="w-full bg-slate-950 border-slate-700 text-white font-medium focus:border-emerald-500"
                >
                  {Object.keys(countriesMap).map((country) => (
                    <option key={country} value={country}>
                      {country}
                    </option>
                  ))}
                </Select>
              </div>

              {/* City Selector / Custom City Input */}
              <div className="md:col-span-3">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                    Город
                  </label>
                  <button
                    type="button"
                    onClick={() => setUseCustomCity(!useCustomCity)}
                    className="text-[11px] text-emerald-400 hover:text-emerald-300 underline font-medium"
                  >
                    {useCustomCity ? 'Выбрать из списка' : 'Ввести свой'}
                  </button>
                </div>

                {useCustomCity ? (
                  <Input
                    value={customCity}
                    onChange={(e) => setCustomCity(e.target.value)}
                    placeholder="Введите название любого города"
                    className="w-full bg-slate-950 border-slate-700 text-white font-medium focus:border-emerald-500"
                  />
                ) : (
                  <Select
                    value={selectedCity}
                    onChange={(e) => setSelectedCity(e.target.value)}
                    className="w-full bg-slate-950 border-slate-700 text-white font-medium focus:border-emerald-500"
                  >
                    {citiesInCountry.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                )}
              </div>

              {/* Niche Input */}
              <div className="md:col-span-4">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 block">
                  Ниша / Любой поисковый запрос
                </label>
                <Input
                  value={niche}
                  onChange={(e) => setNiche(e.target.value)}
                  placeholder="Например: Стоматология, Автосервис, Юристы"
                  className="w-full bg-slate-950 border-slate-700 text-white font-medium placeholder:text-slate-500 focus:border-emerald-500"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isParsing) startParsing();
                  }}
                />
              </div>

              {/* Limit */}
              <div className="md:col-span-2">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 block">
                  Количество
                </label>
                <Select
                  value={String(limit)}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  className="w-full bg-slate-950 border-slate-700 text-white font-medium focus:border-emerald-500"
                >
                  <option value="15">15 записей (~1 стр)</option>
                  <option value="30">30 записей (~2 стр)</option>
                  <option value="50">50 записей (~4 стр)</option>
                  <option value="100">100 записей (~8 стр)</option>
                  <option value="150">150 записей</option>
                </Select>
              </div>
            </div>

            {/* Niche Quick Presets */}
            <div className="mt-4 pt-4 border-t border-slate-800 flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-400 mr-1 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Быстрый выбор:
              </span>
              {NICHE_SUGGESTIONS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setNiche(preset)}
                  className={`text-xs px-3 py-1 rounded-lg border transition-all ${
                    niche === preset
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 font-semibold shadow-sm shadow-emerald-500/20'
                      : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>

            {/* Start / Stop Button Bar */}
            <div className="mt-5 flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-800">
              <div className="text-xs text-slate-400 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-emerald-400" />
                <span>
                  Город: <strong className="text-white">{activeCityName}</strong> ({selectedCountry})
                </span>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                {isParsing ? (
                  <Button variant="danger" onClick={stopParsing} className="gap-2 px-6 py-2.5 w-full sm:w-auto font-medium">
                    <X className="w-4 h-4" />
                    Остановить сбор
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    onClick={startParsing}
                    className="gap-2 px-8 py-2.5 w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-lg shadow-emerald-600/25 transition-all"
                  >
                    <Search className="w-4 h-4" />
                    Начать поиск в 2ГИС
                  </Button>
                )}
              </div>
            </div>
          </Card>

          {/* Progress & Live Status Box */}
          {(isParsing || progressMsg) && (
            <Card className="p-4 border-emerald-500/40 bg-emerald-950/30 shadow-lg">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  {isParsing ? (
                    <Loader2 className="w-5 h-5 text-emerald-400 animate-spin flex-shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                  )}
                  <div>
                    <p className="text-sm font-semibold text-white">{progressMsg}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {activeCityName} • Ниша: «{niche || '—'}»
                    </p>
                  </div>
                </div>

                {/* Quick Live Stats */}
                <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
                  <div className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300">
                    Собрано: <span className="font-bold text-white ml-1">{totalCount}</span>
                  </div>
                  <div className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300">
                    Телефонов: <span className="font-bold text-emerald-400 ml-1">{phonesCount}</span>
                  </div>
                  <div className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300">
                    WhatsApp: <span className="font-bold text-green-400 ml-1">{whatsappCount}</span>
                  </div>
                  <div className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300">
                    Без сайта: <span className="font-bold text-amber-400 ml-1">{withoutSiteCount}</span>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Results Header & Advanced Filters Bar */}
          {results.length > 0 && (
            <div className="space-y-4">
              {/* Filter Bar */}
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/90 shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-1 flex items-center gap-1">
                    <Filter className="w-3.5 h-3.5 text-emerald-400" /> Фильтры:
                  </span>

                  {/* Website filter buttons */}
                  <div className="inline-flex rounded-lg bg-slate-950 p-1 border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setWebsiteFilter('all')}
                      className={`text-xs px-3 py-1 rounded-md font-medium transition-all ${
                        websiteFilter === 'all'
                          ? 'bg-slate-800 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Все ({totalCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setWebsiteFilter('with_site')}
                      className={`text-xs px-3 py-1 rounded-md font-medium transition-all ${
                        websiteFilter === 'with_site'
                          ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      С сайтом ({withSiteCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setWebsiteFilter('without_site')}
                      className={`text-xs px-3 py-1 rounded-md font-medium transition-all flex items-center gap-1 ${
                        websiteFilter === 'without_site'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Flame className="w-3 h-3 text-amber-400" /> Без сайта ({withoutSiteCount})
                    </button>
                  </div>

                  {/* WhatsApp filter toggle */}
                  <button
                    type="button"
                    onClick={() => setWhatsappFilter(whatsappFilter === 'all' ? 'with_wa' : 'all')}
                    className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all ${
                      whatsappFilter === 'with_wa'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-semibold'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                    }`}
                  >
                    Только с WhatsApp ({whatsappCount})
                  </button>

                  {/* Phone filter toggle */}
                  <button
                    type="button"
                    onClick={() => setPhoneFilter(phoneFilter === 'all' ? 'with_phone' : 'all')}
                    className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all ${
                      phoneFilter === 'with_phone'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-semibold'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                    }`}
                  >
                    Только с телефоном ({phonesCount})
                  </button>
                </div>

                {/* Free text search within table */}
                <div className="w-full md:w-64">
                  <Input
                    value={tableSearch}
                    onChange={(e) => setTableSearch(e.target.value)}
                    placeholder="Поиск в таблице..."
                    className="w-full bg-slate-950 border-slate-700 text-xs text-white"
                  />
                </div>
              </div>

              {/* Action Bar & Default Account Selector */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selectedIndices.size === filteredResults.length && filteredResults.length > 0}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                  <span className="text-sm font-medium text-slate-300">
                    Выбрано: <strong className="text-white font-bold">{selectedIndices.size}</strong> из {filteredResults.length}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {/* Default Account Selector */}
                  {waAccounts.length > 0 && (
                    <div className="flex items-center gap-2 bg-slate-950 px-3 py-1 rounded-lg border border-slate-800 text-xs">
                      <span className="text-slate-400 font-medium whitespace-nowrap">Аккаунт по умолч:</span>
                      <select
                        value={defaultWaAccountId}
                        onChange={(e) => setDefaultWaAccountId(e.target.value)}
                        className="bg-transparent text-white font-bold text-xs focus:outline-none cursor-pointer"
                      >
                        {waAccounts.map((acc) => (
                          <option key={acc.id} value={acc.id} className="bg-slate-900 text-white">
                            {acc.name || acc.phoneMasked} ({acc.phoneMasked || acc.phone || 'Без номера'})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Smart Distribution Button */}
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setShowDistributionModal(true)}
                    className="gap-2 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-md shadow-emerald-600/20"
                  >
                    <Shuffle className="w-3.5 h-3.5" />
                    Распределить по аккаунтам ({selectedIndices.size > 0 ? selectedIndices.size : filteredResults.length})
                  </Button>

                  {/* Import to Leads Button */}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowImportModal(true)}
                    className="gap-2 text-xs border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium"
                  >
                    <UserPlus className="w-3.5 h-3.5 text-emerald-400" />
                    Импорт в Лиды
                  </Button>

                  {/* Export CSV Button */}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => exportCsv()}
                    className="gap-2 text-xs border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Скачать Excel
                  </Button>
                </div>
              </div>

              {/* Results Table */}
              <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/90 shadow-xl">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-950 text-slate-300 text-xs uppercase tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="p-3.5 w-10 text-center"></th>
                      <th className="p-3.5 font-bold">Организация</th>
                      <th className="p-3.5 font-bold">Контакты</th>
                      <th className="p-3.5 font-bold">Выбор WhatsApp аккаунта</th>
                      <th className="p-3.5 font-bold">Сайт & Наличие</th>
                      <th className="p-3.5 font-bold">Адрес & Рейтинг</th>
                      <th className="p-3.5 font-bold">Соцсети</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {filteredResults.map((firm, idx) => {
                      const isSelected = selectedIndices.has(idx);
                      const isDropdownOpen = openAccountDropdownIdx === idx;

                      return (
                        <tr
                          key={firm.profileLink || idx}
                          className={`hover:bg-slate-800/50 transition-colors ${
                            isSelected ? 'bg-emerald-950/20' : ''
                          }`}
                        >
                          {/* Checkbox */}
                          <td className="p-3.5 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectRow(idx)}
                              className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                            />
                          </td>

                          {/* Name & 2GIS link */}
                          <td className="p-3.5 min-w-[200px]">
                            <div className="font-bold text-slate-100">{firm.name}</div>
                            <a
                              href={firm.profileLink}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 font-medium hover:underline mt-1"
                            >
                              Открыть в 2ГИС <ExternalLink className="w-3 h-3" />
                            </a>
                          </td>

                          {/* Phone & Copy */}
                          <td className="p-3.5 min-w-[180px]">
                            {firm.phone ? (
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-xs font-semibold text-slate-100 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                                    {firm.phone}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => copyToClipboard(firm.phone!)}
                                    title="Скопировать телефон"
                                    className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                                  >
                                    {copiedPhone === firm.phone ? (
                                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                                    ) : (
                                      <Copy className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                </div>
                                {firm.allPhones.length > 1 && (
                                  <div className="text-[11px] text-slate-400">
                                    Ещё {firm.allPhones.length - 1} тел.
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">Не указан</span>
                            )}
                            {firm.email && (
                              <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                                <Mail className="w-3 h-3 text-slate-400" /> {firm.email}
                              </div>
                            )}
                          </td>

                          {/* Per-Lead WhatsApp Account Picker */}
                          <td className="p-3.5 min-w-[220px]">
                            <div className="flex flex-col gap-1.5 relative">
                              {firm.phone || firm.whatsapp ? (
                                <div className="flex items-center">
                                  {/* Main action: write with default account */}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handleOpenLeadWithAccount(firm, defaultWaAccountId || waAccounts[0]?.id || '')
                                    }
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-l-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-all text-xs font-semibold shadow-sm flex-1 truncate"
                                    title={`Открыть диалог на аккаунте «${defaultAccount?.name || 'Основной'}»`}
                                  >
                                    <Smartphone className="w-3.5 h-3.5 flex-shrink-0" />
                                    <span className="truncate">
                                      {defaultAccount?.name ? `Написать с ${defaultAccount.name}` : 'Написать в чат'}
                                    </span>
                                  </button>

                                  {/* Dropdown toggle to pick specific account */}
                                  {waAccounts.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => setOpenAccountDropdownIdx(isDropdownOpen ? null : idx)}
                                      className="px-2 py-1.5 rounded-r-lg bg-emerald-700 hover:bg-emerald-600 text-white border-l border-emerald-500/40 text-xs flex items-center justify-center"
                                      title="Выбрать другой WhatsApp аккаунт"
                                    >
                                      <ChevronDown className="w-3.5 h-3.5" />
                                    </button>
                                  )}

                                  {/* Account Selection Popup */}
                                  {isDropdownOpen && (
                                    <div
                                      className="absolute top-full left-0 mt-1 w-64 p-1.5 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl z-30 space-y-1"
                                      onMouseLeave={() => setOpenAccountDropdownIdx(null)}
                                    >
                                      <div className="px-2 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                                        С какого номера написать:
                                      </div>
                                      {waAccounts.map((acc) => (
                                        <button
                                          key={acc.id}
                                          type="button"
                                          onClick={() => void handleOpenLeadWithAccount(firm, acc.id)}
                                          className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-emerald-600/20 hover:text-emerald-300 text-xs text-slate-200 transition-colors flex items-center justify-between gap-2"
                                        >
                                          <div className="truncate">
                                            <div className="font-semibold truncate">{acc.name || acc.phoneMasked}</div>
                                            <div className="text-[10px] text-slate-400 font-mono">
                                              {acc.phoneMasked || acc.phone}
                                            </div>
                                          </div>
                                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                                            {acc.status}
                                          </span>
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-slate-400">—</span>
                              )}

                              {firm.whatsapp && (
                                <a
                                  href={firm.whatsapp}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center justify-center gap-1 text-[11px] font-medium text-emerald-400 hover:text-emerald-300 hover:underline"
                                  title="Открыть в WhatsApp Web (wa.me)"
                                >
                                  <Send className="w-3 h-3" /> Написать в wa.me
                                </a>
                              )}
                            </div>
                          </td>

                          {/* Website & Lead Status */}
                          <td className="p-3.5 min-w-[170px]">
                            {firm.site ? (
                              <div className="space-y-1">
                                <a
                                  href={firm.site}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 hover:underline max-w-[180px] truncate font-medium"
                                  title={firm.site}
                                >
                                  <Globe className="w-3.5 h-3.5 flex-shrink-0" />
                                  <span className="truncate">{firm.site.replace(/^https?:\/\//, '')}</span>
                                </a>
                                <div>
                                  <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">
                                    Есть сайт
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                  <Flame className="w-3 h-3 text-amber-400" />
                                  БЕЗ САЙТА
                                </span>
                                <div className="text-[11px] text-amber-400/80 font-medium">Горячий лид</div>
                              </div>
                            )}
                          </td>

                          {/* Address & Rating */}
                          <td className="p-3.5 max-w-[220px]">
                            <div className="text-xs text-slate-200 line-clamp-2">
                              {firm.address || <span className="text-slate-400">—</span>}
                            </div>
                            {firm.rating ? (
                              <div className="flex items-center gap-1 text-xs text-amber-400 font-semibold mt-1">
                                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                                <span>{firm.rating}</span>
                                {firm.reviewsCount ? (
                                  <span className="text-slate-400 font-normal">({firm.reviewsCount} отзывов)</span>
                                ) : null}
                              </div>
                            ) : null}
                          </td>

                          {/* Socials */}
                          <td className="p-3.5">
                            <div className="flex items-center gap-1.5">
                              {firm.instagram && (
                                <a
                                  href={firm.instagram}
                                  target="_blank"
                                  rel="noreferrer"
                                  title="Instagram"
                                  className="p-1.5 rounded-lg bg-pink-500/15 text-pink-400 border border-pink-500/20 hover:bg-pink-500/25"
                                >
                                  <Instagram className="w-3.5 h-3.5" />
                                </a>
                              )}
                              {firm.telegram && (
                                <a
                                  href={firm.telegram}
                                  target="_blank"
                                  rel="noreferrer"
                                  title="Telegram"
                                  className="p-1.5 rounded-lg bg-sky-500/15 text-sky-400 border border-sky-500/20 hover:bg-sky-500/25"
                                >
                                  <Send className="w-3.5 h-3.5" />
                                </a>
                              )}
                              {!firm.instagram && !firm.telegram && (
                                <span className="text-xs text-slate-400">—</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Empty State */}
          {!isParsing && results.length === 0 && (
            <Card className="p-12 text-center border-slate-800 bg-slate-900/40">
              <div className="w-16 h-16 rounded-2xl bg-slate-800 text-emerald-400 flex items-center justify-center mx-auto mb-4 border border-slate-700 shadow-lg">
                <Search className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-white">Парсер 2ГИС готов к сбору данных</h3>
              <p className="text-sm text-slate-400 max-w-md mx-auto mt-1.5 leading-relaxed">
                Выберите страну, город и сферу бизнеса. Все результаты автоматически сохранятся в историю сборов и могут быть распределены по вашим WhatsApp аккаунтам.
              </p>
            </Card>
          )}
        </div>
      )}

      {/* MODAL 1: SMART LEAD DISTRIBUTION BETWEEN WHATSAPP ACCOUNTS */}
      {showDistributionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <Card className="w-full max-w-xl p-6 border-slate-700 bg-slate-900 shadow-2xl relative">
            <button
              onClick={() => {
                setShowDistributionModal(false);
                setDistributionSuccess(null);
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                <Shuffle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Распределение лидов между WhatsApp</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Распределение {selectedIndices.size > 0 ? selectedIndices.size : filteredResults.length} лидов по номерам менеджеров
                </p>
              </div>
            </div>

            {distributionSuccess ? (
              <div className="space-y-4 py-3">
                <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/40 text-center space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                  <h4 className="text-base font-bold text-white">
                    Успешно распределено {distributionSuccess.totalAdded} лидов!
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 text-left">
                    {distributionSuccess.distribution.map((dist) => (
                      <div key={dist.accountId} className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs">
                        <div className="font-bold text-white">{dist.accountName || dist.phoneMasked}</div>
                        <div className="text-slate-400 mt-0.5">
                          Назначено: <span className="font-bold text-emerald-400">{dist.count} лидов</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setShowDistributionModal(false);
                      setDistributionSuccess(null);
                    }}
                  >
                    Закрыть
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setShowDistributionModal(false);
                      router.push('/conversations');
                    }}
                    className="gap-2 border-slate-700 bg-slate-800 text-slate-200 hover:text-white"
                  >
                    <MessageSquare className="w-4 h-4" /> Открыть Диалоги
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => {
                      setShowDistributionModal(false);
                      router.push('/multiview');
                    }}
                    className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
                  >
                    <LayoutGrid className="w-4 h-4" /> Открыть Мультиаккаунт
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 py-2">
                {/* Strategy Selector */}
                <div>
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 block">
                    Стратегия распределения:
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setDistributionMode('round_robin')}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        distributionMode === 'round_robin'
                          ? 'bg-emerald-500/15 border-emerald-500 text-white shadow-md'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-xs">
                        <Shuffle className="w-3.5 h-3.5 text-emerald-400" />
                        По очереди
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        Равномерно (1-й ➔ А1, 2-й ➔ А2, 3-й ➔ А1)
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDistributionMode('single')}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        distributionMode === 'single'
                          ? 'bg-emerald-500/15 border-emerald-500 text-white shadow-md'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-xs">
                        <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
                        Один аккаунт
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        Все лиды на один выбранный номер
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDistributionMode('batch')}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        distributionMode === 'batch'
                          ? 'bg-emerald-500/15 border-emerald-500 text-white shadow-md'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-xs">
                        <Layers className="w-3.5 h-3.5 text-emerald-400" />
                        Пакетно
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        По {perAccountLimit} шт на каждый аккаунт
                      </div>
                    </button>
                  </div>
                </div>

                {/* Account Selection */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                      Участвующие WhatsApp аккаунты:
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedAccountIds.size === waAccounts.length) {
                          setSelectedAccountIds(new Set());
                        } else {
                          setSelectedAccountIds(new Set(waAccounts.map((a) => a.id)));
                        }
                      }}
                      className="text-[11px] text-emerald-400 hover:text-emerald-300 underline font-medium"
                    >
                      {selectedAccountIds.size === waAccounts.length ? 'Снять выделение' : 'Выбрать все'}
                    </button>
                  </div>

                  {waAccounts.length === 0 ? (
                    <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
                      У вас пока нет подключенных WhatsApp аккаунтов. Подключите аккаунт в разделе «Аккаунты».
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {waAccounts.map((acc) => {
                        const isChecked = selectedAccountIds.has(acc.id);
                        return (
                          <label
                            key={acc.id}
                            className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-colors ${
                              isChecked
                                ? 'bg-slate-950 border-emerald-500/60'
                                : 'bg-slate-950/60 border-slate-800 opacity-60 hover:opacity-100'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  setSelectedAccountIds((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(acc.id)) next.delete(acc.id);
                                    else next.add(acc.id);
                                    return next;
                                  });
                                }}
                                className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                              />
                              <div>
                                <div className="text-xs font-bold text-white">{acc.name || acc.phoneMasked}</div>
                                <div className="text-[11px] text-slate-400 font-mono">
                                  {acc.phoneMasked || acc.phone || 'Без номера'}
                                </div>
                              </div>
                            </div>

                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                acc.status === 'ONLINE'
                                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                  : 'bg-slate-800 text-slate-400 border-slate-700'
                              }`}
                            >
                              {acc.status}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Batch Limit Setting */}
                {distributionMode === 'batch' && (
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
                    <span className="text-slate-300 font-medium">Лимит на 1 номер:</span>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="1"
                        max="100"
                        value={perAccountLimit}
                        onChange={(e) => setPerAccountLimit(Number(e.target.value) || 20)}
                        className="w-20 bg-slate-900 border-slate-700 text-xs text-white text-center"
                      />
                      <span className="text-slate-400">лидов</span>
                    </div>
                  </div>
                )}

                {/* Live Distribution Preview */}
                {distributionPreview.length > 0 && (
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
                    <div className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                      Превью распределения нагрузки:
                    </div>
                    <div className="space-y-1.5 pt-1">
                      {distributionPreview.map(({ account, count }) => (
                        <div key={account.id} className="flex items-center justify-between text-xs">
                          <span className="text-slate-300 flex items-center gap-1.5 truncate">
                            <Smartphone className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                            <span className="truncate">{account.name || account.phoneMasked}</span>
                          </span>
                          <span className="font-bold text-emerald-400 ml-2 whitespace-nowrap">
                            👉 {count} лидов
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-6 flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
                  <Button
                    variant="secondary"
                    onClick={() => setShowDistributionModal(false)}
                    disabled={isDistributing}
                    className="border-slate-700 bg-slate-800 text-slate-300"
                  >
                    Отмена
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleDistributionSubmit}
                    disabled={isDistributing || selectedAccountIds.size === 0}
                    className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
                  >
                    {isDistributing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Распределение...
                      </>
                    ) : (
                      <>
                        <Shuffle className="w-4 h-4" /> Распределить лиды
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* MODAL 2: IMPORT TO LEADS */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <Card className="w-full max-w-lg p-6 border-slate-700 bg-slate-900 shadow-2xl relative">
            <button
              onClick={() => setShowImportModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                <UserPlus className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Импорт организаций в Лиды</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Добавление {selectedIndices.size > 0 ? selectedIndices.size : filteredResults.length} контактов в базу данных
                </p>
              </div>
            </div>

            <div className="space-y-4 py-2">
              <div>
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 block">
                  Прикрепить к кампании (необязательно)
                </label>
                <Select
                  value={selectedCampaign}
                  onChange={(e) => setSelectedCampaign(e.target.value)}
                  className="w-full bg-slate-950 border-slate-700 text-white"
                >
                  <option value="">Без кампании (только в Лиды)</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Сбор:</span>
                  <span className="font-bold text-white">{activeSessionTitle || `${niche} ${activeCityName}`}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Город:</span>
                  <span className="font-bold text-white">{activeCityName}</span>
                </div>
              </div>

              <label className="flex items-center gap-2.5 cursor-pointer text-xs text-slate-300 font-medium pt-1">
                <input
                  type="checkbox"
                  checked={skipDuplicates}
                  onChange={(e) => setSkipDuplicates(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
                Пропускать дубликаты (по совпадению номера телефона)
              </label>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
              <Button
                variant="secondary"
                onClick={() => setShowImportModal(false)}
                disabled={isImporting}
                className="border-slate-700 bg-slate-800 text-slate-300 hover:text-white"
              >
                Отмена
              </Button>
              <Button
                variant="primary"
                onClick={handleImportSubmit}
                disabled={isImporting}
                className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
              >
                {isImporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Импорт...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" /> Начать импорт
                  </>
                )}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
