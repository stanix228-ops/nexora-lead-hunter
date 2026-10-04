'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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
  QrCode,
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
  Zap,
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
  max?: string | null;
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
  maxCount?: number;
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

const CIS_NICHE_SUGGESTIONS = [
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
  'Медицинские центры',
  'Турагентства',
  'Мебель на заказ',
];

const US_STATES_MAP: Record<string, string[]> = {
  'Florida (Флорида)': ['Miami', 'Orlando', 'Tampa', 'Fort Lauderdale', 'Jacksonville', 'Boca Raton', 'Naples', 'Sarasota'],
  'California (Калифорния)': ['Los Angeles', 'San Francisco', 'San Diego', 'San Jose', 'Sacramento', 'Fresno', 'Irvine', 'Long Beach'],
  'Texas (Техас)': ['Houston', 'Dallas', 'Austin', 'San Antonio', 'Fort Worth', 'El Paso', 'Arlington', 'Plano'],
  'New York (Нью-Йорк)': ['New York City', 'Brooklyn', 'Queens', 'Buffalo', 'Rochester', 'Albany', 'Yonkers'],
  'Illinois (Иллинойс)': ['Chicago', 'Naperville', 'Aurora', 'Rockford', 'Joliet'],
  'Nevada (Невада)': ['Las Vegas', 'Henderson', 'Reno', 'North Las Vegas'],
  'Washington (Вашингтон)': ['Seattle', 'Bellevue', 'Tacoma', 'Spokane', 'Vancouver'],
  'Georgia (Джорджия)': ['Atlanta', 'Savannah', 'Augusta', 'Athens', 'Sandy Springs'],
  'North Carolina (Северная Каролина)': ['Charlotte', 'Raleigh', 'Greensboro', 'Durham', 'Winston-Salem'],
  'Arizona (Аризона)': ['Phoenix', 'Scottsdale', 'Tucson', 'Mesa', 'Chandler', 'Glendale'],
  'Colorado (Колорадо)': ['Denver', 'Colorado Springs', 'Aurora', 'Boulder', 'Fort Collins'],
  'Pennsylvania (Пенсильвания)': ['Philadelphia', 'Pittsburgh', 'Allentown', 'Erie'],
  'Massachusetts (Массачусетс)': ['Boston', 'Cambridge', 'Worcester', 'Springfield'],
  'Ohio (Огайо)': ['Columbus', 'Cleveland', 'Cincinnati', 'Toledo', 'Akron'],
  'New Jersey (Нью-Джерси)': ['Jersey City', 'Newark', 'Paterson', 'Elizabeth', 'Trenton'],
};

const US_NICHE_SUGGESTIONS = [
  { label: 'Roofing (Кровельные работы)', query: 'Roofing contractor' },
  { label: 'Plumbing (Сантехника)', query: 'Plumbing contractor' },
  { label: 'Dental (Стоматология)', query: 'Dentist' },
  { label: 'HVAC (Кондиционеры и отопление)', query: 'HVAC contractor' },
  { label: 'Lawyers (Юристы / Адвокаты)', query: 'Lawyer law firm' },
  { label: 'Auto Detailing (Детейлинг / Авто)', query: 'Auto detailing auto repair' },
  { label: 'Real Estate (Недвижимость)', query: 'Real estate agency' },
  { label: 'Cleaning Services (Клининг)', query: 'Cleaning company' },
  { label: 'Landscaping (Ландшафтный дизайн)', query: 'Landscaping company' },
  { label: 'Remodeling (Ремонт и строительство)', query: 'Home remodeling contractor' },
  { label: 'Solar Energy (Солнечные панели)', query: 'Solar energy company' },
  { label: 'Medical Spas (Косметология / СПА)', query: 'Medical spa' },
  { label: 'Moving Companies (Переезды)', query: 'Moving company' },
  { label: 'Accounting / CPA (Бухгалтеры)', query: 'CPA accounting' },
];

const RUSSIAN_POPULAR_CITIES = [
  'Москва',
  'Санкт-Петербург',
  'Новосибирск',
  'Екатеринбург',
  'Казань',
  'Нижний Новгород',
  'Красноярск',
  'Челябинск',
  'Самара',
  'Уфа',
  'Ростов-на-Дону',
  'Краснодар',
  'Омск',
  'Воронеж',
  'Пермь',
  'Волгоград',
  'Саратов',
  'Тюмень',
  'Тольятти',
  'Барнаул',
  'Ижевск',
  'Ульяновск',
  'Иркутск',
  'Хабаровск',
  'Ярославль',
  'Владивосток',
  'Махачкала',
  'Томск',
  'Оренбург',
  'Кемерово',
  'Новокузнецк',
  'Рязань',
  'Набережные Челны',
  'Астрахань',
  'Пенза',
  'Липецк',
  'Тула',
  'Киров',
  'Чебоксары',
  'Калининград',
  'Брянск',
  'Курск',
  'Иваново',
  'Магнитогорск',
  'Улан-Удэ',
  'Тверь',
  'Ставрополь',
  'Симферополь',
  'Белгород',
  'Сургут',
  'Сочи',
];

const RUSSIAN_NICHE_SUGGESTIONS = [
  'Стоматология',
  'Автосервис',
  'Салоны красоты',
  'Рестораны и кафе',
  'Ремонт квартир',
  'Недвижимость',
  'Юридические услуги',
  'Строительные компании',
  'Клининг',
  'Фитнес клубы',
  'Цветочные магазины',
  'Медицинские центры',
  'Окна и остекление',
  'Мебель на заказ',
  'Бухгалтерские услуги',
  'Грузоперевозки',
];

export default function ParserPage() {
  const router = useRouter();
  const { toast } = useToast();

  // Engine selection: 'yandex' for Russia, '2gis' for CIS / UAE, 'google' for USA / Global
  const [selectedEngine, setSelectedEngine] = useState<'yandex' | '2gis' | 'google'>('yandex');

  // Active View Tab
  const [activeTab, setActiveTab] = useState<'search' | 'history'>('search');

  // Yandex Maps Russia Search parameters
  const [selectedYandexCity, setSelectedYandexCity] = useState<string>('Москва');
  const [customYandexCity, setCustomYandexCity] = useState<string>('');
  const [useCustomYandexCity, setUseCustomYandexCity] = useState<boolean>(false);

  // 2GIS CIS Search parameters
  const [countriesMap, setCountriesMap] = useState<Record<string, string[]>>({});
  const [selectedCountry, setSelectedCountry] = useState<string>('Казахстан');
  const [selectedCity, setSelectedCity] = useState<string>('Алматы');
  const [customCity, setCustomCity] = useState<string>('');
  const [useCustomCity, setUseCustomCity] = useState<boolean>(false);

  // Google Maps USA Search parameters
  const [selectedUsState, setSelectedUsState] = useState<string>('Florida (Флорида)');
  const [selectedUsCity, setSelectedUsCity] = useState<string>('Miami');
  const [customUsCity, setCustomUsCity] = useState<string>('');
  const [useCustomUsCity, setUseCustomUsCity] = useState<boolean>(false);

  // Common Niche & Limit
  const [niche, setNiche] = useState<string>('');
  const [limit, setLimit] = useState<number>(50);

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

  // Filters within table & pre-search
  const [websiteFilter, setWebsiteFilter] = useState<'all' | 'with_site' | 'without_site'>('all');
  const [whatsappFilter, setWhatsappFilter] = useState<'all' | 'with_wa'>('all');
  const [telegramFilter, setTelegramFilter] = useState<'all' | 'with_tg'>('all');
  const [maxFilter, setMaxFilter] = useState<'all' | 'with_max'>('all');
  const [phoneFilter, setPhoneFilter] = useState<'all' | 'with_phone'>('all');
  const [tableSearch, setTableSearch] = useState<string>('');

  // Connected WhatsApp accounts & default picker
  const [waAccounts, setWaAccounts] = useState<WhatsAppAccountOption[]>([]);
  const [defaultWaAccountId, setDefaultWaAccountId] = useState<string>('');
  const [openAccountDropdownIdx, setOpenAccountDropdownIdx] = useState<number | null>(null);

  // Direct WhatsApp Batch Outreach Modal
  const [showOutreachModal, setShowOutreachModal] = useState<boolean>(false);
  const [outreachAccountIds, setOutreachAccountIds] = useState<Set<string>>(new Set());
  const [outreachMode, setOutreachMode] = useState<'smart' | 'custom'>('smart');
  const [customTemplate, setCustomTemplate] = useState<string>(
    'Здравствуйте, {Компания}! Заметил ваш профиль в {Город}. Помогаем бизнесу в сфере {Ниша} автоматизировать запись клиентов и увеличить поток заявок через WhatsApp и Telegram-боты. Подскажите, актуально ли сейчас привлекать больше клиентов?',
  );
  const [outreachDelay, setOutreachDelay] = useState<number>(2500);
  const [isSendingOutreach, setIsSendingOutreach] = useState<boolean>(false);
  const [outreachProgress, setOutreachProgress] = useState<{
    current: number;
    total: number;
    sent: number;
    failed: number;
    skipped: number;
    status: string;
  } | null>(null);
  const [previewText, setPreviewText] = useState<string>('');
  const [isLoadingPreview, setIsLoadingPreview] = useState<boolean>(false);

  // Direct Add to WhatsApp Dialogs (Manual chatting, no bot)
  const [isAddingToDialogs, setIsAddingToDialogs] = useState<boolean>(false);
  const [showAddedSuccessModal, setShowAddedSuccessModal] = useState<boolean>(false);
  const [addedDialogsCount, setAddedDialogsCount] = useState<number>(0);

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

  // Links Export & Copy Modal (single column list)
  const [showLinksModal, setShowLinksModal] = useState<boolean>(false);
  const [linksType, setLinksType] = useState<'telegram' | 'whatsapp' | 'phones' | 'sites' | 'all'>('telegram');
  const [isCopiedAllLinks, setIsCopiedAllLinks] = useState<boolean>(false);

  const eventSourceRef = useRef<EventSource | null>(null);

  // Load WhatsApp accounts
  const loadAccounts = useCallback(async () => {
    try {
      const res = await get<{ items: WhatsAppAccountOption[] } | WhatsAppAccountOption[]>('/api/accounts');
      const list = Array.isArray(res) ? res : res?.items || [];
      setWaAccounts(list);
      const onlineAccs = list.filter(
        (a) => (a.status === 'ONLINE' || a.gatewayStatus === 'CONNECTED') && Boolean(a.phone),
      );
      if (onlineAccs.length > 0) {
        setDefaultWaAccountId(onlineAccs[0].id);
        setOutreachAccountIds(new Set(onlineAccs.map((a) => a.id)));
        setSelectedAccountIds(new Set(onlineAccs.map((a) => a.id)));
      } else {
        const withPhone = list.filter((a) => Boolean(a.phone));
        const primary = withPhone[0] || list[0];
        if (primary) {
          setDefaultWaAccountId(primary.id);
          setOutreachAccountIds(new Set([primary.id]));
          setSelectedAccountIds(new Set([primary.id]));
        }
      }
    } catch {
      setWaAccounts([]);
    }
  }, []);

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
    // 1. Load CIS cities
    void get<CitiesResponse>('/api/parser/cities')
      .then((res) => {
        setCountriesMap(res.countries);
        if (res.countries['Казахстан']?.[0]) {
          setSelectedCity(res.countries['Казахстан'][0]);
        }
      })
      .catch((err) => toast((err as Error).message, 'error'));

    // 2. Load campaigns
    void get<{ items: CampaignOption[] }>('/api/campaigns')
      .then((res) => setCampaigns(res.items || []))
      .catch(() => setCampaigns([]));

    // 3. Load WhatsApp accounts
    void loadAccounts();

    // 4. Load sessions history
    void loadSessions();
  }, [toast, loadSessions]);

  const activeCityName = useMemo(() => {
    if (selectedEngine === 'yandex') {
      return useCustomYandexCity && customYandexCity.trim() ? customYandexCity.trim() : selectedYandexCity;
    } else if (selectedEngine === '2gis') {
      return useCustomCity && customCity.trim() ? customCity.trim() : selectedCity;
    } else {
      return useCustomUsCity && customUsCity.trim() ? customUsCity.trim() : selectedUsCity;
    }
  }, [
    selectedEngine,
    useCustomYandexCity,
    customYandexCity,
    selectedYandexCity,
    useCustomCity,
    customCity,
    selectedCity,
    useCustomUsCity,
    customUsCity,
    selectedUsCity,
  ]);

  const stopParsing = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsParsing(false);
    setProgressMsg('Парсинг остановлен пользователем');
  };

  const startParsing = (overrideLimit?: number) => {
    if (!activeCityName) {
      toast('Укажите город для поиска', 'info');
      return;
    }
    if (!niche.trim()) {
      toast('Укажите нишу или категорию бизнеса', 'info');
      return;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const currentLimit = overrideLimit || limit;
    setResults([]);
    setSelectedIndices(new Set());
    setTotalFound(0);
    setActiveSessionId(null);
    setActiveSessionTitle('');
    setIsParsing(true);
    setProgressMsg(
      `Подключение к ${
        selectedEngine === 'yandex'
          ? 'Яндекс Картам (Россия)'
          : selectedEngine === 'google'
          ? 'Google Maps (США)'
          : '2ГИС (СНГ)'
      }...`,
    );
    setActiveTab('search');

    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    const token = getToken();

    let url = '';
    if (selectedEngine === 'yandex') {
      const params = new URLSearchParams({
        city: activeCityName,
        niche: niche.trim(),
        limit: String(currentLimit),
        websiteFilter,
        phoneFilter,
        whatsappFilter,
        telegramFilter,
      });
      if (token) params.set('token', token);
      url = `${apiBase}/api/parser/yandex/search?${params.toString()}`;
    } else if (selectedEngine === 'google') {
      const params = new URLSearchParams({
        city: activeCityName,
        state: selectedUsState.split(' ')[0] || 'Florida',
        niche: niche.trim(),
        limit: String(currentLimit),
        websiteFilter,
        phoneFilter,
      });
      if (token) params.set('token', token);
      url = `${apiBase}/api/parser/google/search?${params.toString()}`;
    } else {
      const params = new URLSearchParams({
        city: activeCityName,
        country: selectedCountry,
        niche: niche.trim(),
        limit: String(currentLimit),
        websiteFilter,
        whatsappFilter,
        telegramFilter,
        maxFilter,
        phoneFilter,
      });
      if (token) params.set('token', token);
      url = `${apiBase}/api/parser/search?${params.toString()}`;
    }

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
            if (prev.some((p) => (item.phone && p.phone === item.phone) || (item.profileLink && p.profileLink === item.profileLink))) {
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
            `Сбор завершен! Получено ${payload.data?.results || 0} контактов (всего в базе: ${
              payload.data?.total || 0
            })`,
          );
          setIsParsing(false);
          es.close();
          eventSourceRef.current = null;
          toast(`Сбор «${payload.data?.sessionTitle || niche}» завершён и сохранен!`, 'success');
        } else if (payload.type === 'error') {
          setProgressMsg(`Ошибка: ${payload.data?.error}`);
          setIsParsing(false);
          es.close();
          eventSourceRef.current = null;
          toast(payload.data?.error || 'Ошибка при сборе данных', 'error');
        }
      } catch {
        /* ignore parse err */
      }
    };

    es.onerror = () => {
      setIsParsing(false);
      setProgressMsg('Поток завершён');
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
      if (full.country?.includes('Яндекс') || full.country?.includes('Россия')) {
        setSelectedEngine('yandex');
        setSelectedYandexCity(full.city);
      } else if (full.country?.includes('США') || full.country?.includes('USA')) {
        setSelectedEngine('google');
        setSelectedUsCity(full.city);
      } else {
        setSelectedEngine('2gis');
        setSelectedCity(full.city);
        setSelectedCountry(full.country);
      }
      setTotalFound(full.totalFound);
      setSelectedIndices(new Set());
      setActiveTab('search');
      setProgressMsg(`Загружен сохраненный сбор «${full.title}» (${full.items.length} контактов)`);
      toast(`Сбор «${full.title}» загружен`, 'info');
    } catch (err) {
      toast((err as Error).message, 'error');
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
      toast((err as Error).message, 'error');
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
      toast((err as Error).message, 'error');
    }
  };

  const copyToClipboard = (text: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedPhone(text);
    setTimeout(() => setCopiedPhone(null), 2000);
    toast(`Скопировано: ${text}`, 'success');
  };

  // Filtered results for table display
  const filteredResults = useMemo(() => {
    return results.filter((item) => {
      if (websiteFilter === 'with_site' && !item.site) return false;
      if (websiteFilter === 'without_site' && item.site) return false;
      if (whatsappFilter === 'with_wa' && !item.whatsapp) return false;
      if (telegramFilter === 'with_tg' && !item.telegram) return false;
      if (maxFilter === 'with_max' && !item.max) return false;
      if (phoneFilter === 'with_phone' && !item.phone) return false;

      if (tableSearch.trim()) {
        const q = tableSearch.toLowerCase();
        const matchesName = item.name.toLowerCase().includes(q);
        const matchesAddr = item.address.toLowerCase().includes(q);
        const matchesPhone = item.phone?.toLowerCase().includes(q);
        const matchesSite = item.site?.toLowerCase().includes(q);
        const matchesTg = item.telegram?.toLowerCase().includes(q);
        return matchesName || matchesAddr || matchesPhone || matchesSite || matchesTg;
      }

      return true;
    });
  }, [results, websiteFilter, whatsappFilter, telegramFilter, maxFilter, phoneFilter, tableSearch]);

  const toggleSelectAll = () => {
    if (selectedIndices.size === filteredResults.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(filteredResults.map((_, i) => i)));
    }
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
      'Мессенджер MAX',
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
      'Ссылка на профиль',
    ];

    const escapeCsv = (str: string | number | null | undefined) => {
      if (str === null || str === undefined) return '""';
      return `"${String(str).replace(/"/g, '""').replace(/\n/g, ' ')}"`;
    };

    const rows = targetItems.map((f) => [
      escapeCsv(f.name),
      escapeCsv(f.phone),
      escapeCsv(f.max),
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
    const filename = `leads_${selectedEngine}_${activeSessionTitle || `${niche}_${activeCityName}`}_${Date.now()}.csv`.replace(
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

  // Extract links text in single column (one per line)
  const exportedLinksData = useMemo(() => {
    const targetItems =
      selectedIndices.size > 0 ? filteredResults.filter((_, i) => selectedIndices.has(i)) : filteredResults;

    let list: string[] = [];

    if (linksType === 'telegram') {
      list = targetItems
        .map((f) => f.telegram)
        .filter((t): t is string => Boolean(t));
    } else if (linksType === 'whatsapp') {
      list = targetItems
        .map((f) => {
          if (!f.whatsapp && !f.phone) return null;
          const num = (f.whatsapp || f.phone || '').replace(/\D/g, '');
          if (f.whatsapp?.startsWith('http')) return f.whatsapp;
          return num ? `https://wa.me/${num}` : null;
        })
        .filter((w): w is string => Boolean(w));
    } else if (linksType === 'phones') {
      list = targetItems
        .map((f) => f.phone || f.whatsapp)
        .filter((p): p is string => Boolean(p));
    } else if (linksType === 'sites') {
      list = targetItems
        .map((f) => f.site)
        .filter((s): s is string => Boolean(s));
    } else if (linksType === 'all') {
      const allSet = new Set<string>();
      targetItems.forEach((f) => {
        if (f.telegram) allSet.add(f.telegram);
        if (f.whatsapp) {
          const w = f.whatsapp.startsWith('http') ? f.whatsapp : `https://wa.me/${f.whatsapp.replace(/\D/g, '')}`;
          allSet.add(w);
        } else if (f.phone) {
          const pDigits = f.phone.replace(/\D/g, '');
          if (pDigits.length >= 10) allSet.add(`https://wa.me/${pDigits}`);
        }
        if (f.site) allSet.add(f.site.startsWith('http') ? f.site : `https://${f.site}`);
      });
      list = Array.from(allSet);
    }

    return {
      items: list,
      text: list.join('\n'),
      count: list.length,
      totalTarget: targetItems.length,
    };
  }, [filteredResults, selectedIndices, linksType]);

  const handleCopyAllLinks = () => {
    if (!exportedLinksData.text) {
      toast('Нет ссылок для копирования', 'info');
      return;
    }
    void navigator.clipboard.writeText(exportedLinksData.text);
    setIsCopiedAllLinks(true);
    setTimeout(() => setIsCopiedAllLinks(false), 2500);
    toast(`Скопировано ${exportedLinksData.count} ссылок в столбик!`, 'success');
  };

  const handleDownloadTxtLinks = () => {
    if (!exportedLinksData.text) {
      toast('Нет данных для скачивания', 'info');
      return;
    }
    const blob = new Blob([exportedLinksData.text], { type: 'text/plain;charset=utf-8;' });
    const link = document.createElement('a');
    const filename = `links_${linksType}_${activeSessionTitle || `${niche}_${activeCityName}`}_${Date.now()}.txt`.replace(
      /[\\/:*?"<>|]/g,
      '_',
    );
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast(`Файл ${filename} скачан`, 'success');
  };

  // Open single lead in WhatsApp with specific account (manual chatting, no bot)
  const handleOpenLeadWithAccount = async (firm: FirmResult, accountId?: string) => {
    const acc = (accountId && waAccounts.find((a) => a.id === accountId)) || waAccounts[0];
    const phoneOrWa = firm.phone || firm.whatsapp;
    if (!phoneOrWa) {
      toast('У организации нет номера телефона', 'info');
      return;
    }

    setOpenAccountDropdownIdx(null);
    try {
      await post('/api/conversations/open-by-phone', {
        accountId: acc?.id,
        input: phoneOrWa,
        companyName: firm.name,
      });
      toast(`Диалог с «${firm.name}» создан без бота — вы можете написать клиенту`, 'success');
      router.push('/conversations');
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  // Open single lead in MAX Messenger
  const handleOpenMax = (firm: FirmResult) => {
    // 1. If firm has a verified custom channel/bot/invite link
    if (firm.max && !firm.max.match(/max\.ru\/u\/\d{10,15}/) && firm.max.startsWith('http')) {
      window.open(firm.max, '_blank');
      return;
    }

    // 2. Otherwise copy the clean phone number and open MAX Web
    const rawPh = firm.phone || firm.whatsapp || '';
    if (rawPh) {
      const digits = rawPh.replace(/\D/g, '');
      const formatted = digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))
        ? `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`
        : rawPh;

      try {
        void navigator.clipboard.writeText(formatted);
        toast(`Номер «${formatted}» скопирован! Открываем мессенджер MAX (web.max.ru)...`, 'success');
      } catch {
        toast(`Открываем мессенджер MAX (web.max.ru)...`, 'info');
      }
      window.open('https://web.max.ru', '_blank');
    } else {
      window.open('https://web.max.ru', '_blank');
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
      toast((err as Error).message, 'error');
    } finally {
      setIsDistributing(false);
    }
  };

  const onlineWaAccounts = useMemo(
    () => waAccounts.filter((a) => a.status === 'ONLINE' || a.gatewayStatus === 'CONNECTED'),
    [waAccounts],
  );
  const hasOnlineAccount = onlineWaAccounts.length > 0;

  // Load dynamic preview of personalized outreach
  const loadPreviewMessage = useCallback(async () => {
    const targetItems =
      selectedIndices.size > 0 ? filteredResults.filter((_, i) => selectedIndices.has(i)) : filteredResults;
    if (targetItems.length === 0) return;
    const sample = targetItems[0];
    setIsLoadingPreview(true);
    try {
      const res = await post<{ previewText: string }>('/api/parser/preview-message', {
        item: sample,
        city: activeCityName,
        niche: niche.trim(),
        customTemplate: outreachMode === 'custom' ? customTemplate : undefined,
      });
      setPreviewText(res.previewText);
    } catch {
      setPreviewText('');
    } finally {
      setIsLoadingPreview(false);
    }
  }, [selectedIndices, filteredResults, activeCityName, niche, outreachMode, customTemplate]);

  // Execute Batch WhatsApp Outreach
  const handleSendBatchOutreach = async () => {
    const targetItems =
      selectedIndices.size > 0 ? filteredResults.filter((_, i) => selectedIndices.has(i)) : filteredResults;
    if (targetItems.length === 0) {
      toast('Нет контактов для рассылки', 'info');
      return;
    }

    if (!hasOnlineAccount) {
      toast('Нет активных онлайн-аккаунтов WhatsApp. Подключите аккаунт в разделе «Аккаунты WhatsApp»', 'error');
      return;
    }

    const onlineIds = onlineWaAccounts.map((a) => a.id);
    const chosenIds = Array.from(outreachAccountIds).filter((id) => onlineIds.includes(id));
    const finalAccountIds = chosenIds.length > 0 ? chosenIds : onlineIds;

    setIsSendingOutreach(true);
    setOutreachProgress({
      current: 0,
      total: targetItems.length,
      sent: 0,
      failed: 0,
      skipped: 0,
      status: `Подготовка к отправке ${targetItems.length} сообщений...`,
    });

    try {
      const res = await post<{
        total: number;
        sentCount: number;
        skippedCount: number;
        failedCount: number;
        errors: string[];
      }>('/api/parser/send-whatsapp-batch', {
        items: targetItems,
        city: activeCityName,
        niche: niche.trim(),
        accountIds: finalAccountIds,
        customMessageTemplate: outreachMode === 'custom' ? customTemplate : undefined,
        delayMs: outreachDelay,
      });

      setOutreachProgress({
        current: res.total,
        total: res.total,
        sent: res.sentCount,
        failed: res.failedCount,
        skipped: res.skippedCount,
        status: `Рассылка завершена! Отправлено: ${res.sentCount}, Ошибок: ${res.failedCount}, Пропущено: ${res.skippedCount}`,
      });

      if (res.sentCount > 0) {
        toast(`Успешно отправлено ${res.sentCount} сообщений в WhatsApp!`, 'success');
      }
      if (res.failedCount > 0) {
        toast(`Не удалось отправить ${res.failedCount} сообщений. Проверьте соединение с WhatsApp.`, 'error');
      }
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setIsSendingOutreach(false);
    }
  };

  // Batch Add to WhatsApp Dialogs (Manual chatting, no bot)
  const handleAddToWhatsAppDialogs = async () => {
    const targetItems =
      selectedIndices.size > 0 ? filteredResults.filter((_, i) => selectedIndices.has(i)) : filteredResults;

    if (targetItems.length === 0) {
      toast('Нет контактов для добавления в WhatsApp', 'info');
      return;
    }

    setIsAddingToDialogs(true);
    try {
      const targetAccountIds =
        selectedAccountIds.size > 0 ? Array.from(selectedAccountIds) : defaultWaAccountId ? [defaultWaAccountId] : [];

      const res = await post<{
        added: number;
        skipped: number;
        conversations: Array<{ id: string; leadId: string; name: string; phone: string }>;
      }>('/api/parser/add-to-whatsapp', {
        accountIds: targetAccountIds,
        items: targetItems,
        city: activeCityName,
        niche: niche.trim(),
        distributionMode: 'round_robin',
      });

      setAddedDialogsCount(res.added);
      setShowAddedSuccessModal(true);
      toast(`Добавлено ${res.added} контактов в WhatsApp диалоги! (Бот отключен, пишите вручную)`, 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setIsAddingToDialogs(false);
    }
  };

  // Stats
  const totalCount = results.length;
  const phonesCount = results.filter((r) => r.phone || r.whatsapp).length;
  const whatsappCount = results.filter((r) => r.whatsapp).length;
  const telegramCount = results.filter((r) => r.telegram).length;
  const maxCount = results.filter((r) => r.max).length;
  const withSiteCount = results.filter((r) => r.site).length;
  const withoutSiteCount = results.filter((r) => !r.site).length;

  const defaultAccount = waAccounts.find((a) => a.id === defaultWaAccountId) || waAccounts[0];

  return (
    <div className="space-y-6 pb-16">
      {/* Top Header with Navigation Tabs */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <span className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 border border-emerald-500/30 shadow-sm">
            <Globe className="w-6 h-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-ink-900 flex items-center gap-2.5">
              Парсер Лидов
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-300">
                Яндекс Карты (РФ) • 2ГИС (СНГ) • Google Maps (США)
              </span>
            </h1>
            <p className="text-xs text-ink-500 mt-0.5">
              Автоматический сбор контактов (номера, WhatsApp, сайты, соцсети) для холодного аутрича и продаж веб-разработки
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-xl bg-ink-100 p-1 border border-ink-200">
            <button
              onClick={() => setActiveTab('search')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'search'
                  ? 'bg-white text-emerald-700 shadow-sm'
                  : 'text-ink-600 hover:text-ink-900'
              }`}
            >
              <Search size={14} />
              <span>Поиск & Сбор</span>
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'history'
                  ? 'bg-white text-emerald-700 shadow-sm'
                  : 'text-ink-600 hover:text-ink-900'
              }`}
            >
              <History size={14} />
              <span>История сборов ({sessions.length})</span>
            </button>
          </div>
        </div>
      </div>

      {activeTab === 'search' ? (
        <>
          {/* Main Engine Switcher Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-1.5 rounded-2xl bg-white border border-ink-200 shadow-card">
            <button
              type="button"
              onClick={() => setSelectedEngine('yandex')}
              className={`flex items-center justify-center gap-3 py-3 px-4 rounded-xl font-bold transition-all ${
                selectedEngine === 'yandex'
                  ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-md shadow-red-600/20'
                  : 'bg-ink-50 text-ink-700 hover:bg-ink-100'
              }`}
            >
              <span className="text-xl">🔴</span>
              <div className="text-left">
                <div className="text-sm font-black flex items-center gap-1.5">
                  Яндекс Карты
                  <span
                    className={`text-[9px] px-1.5 py-0.2 rounded font-extrabold uppercase tracking-wide ${
                      selectedEngine === 'yandex' ? 'bg-white/20 text-white' : 'bg-red-100 text-red-700'
                    }`}
                  >
                    РФ
                  </span>
                </div>
                <div className={`text-[10px] ${selectedEngine === 'yandex' ? 'text-rose-100' : 'text-ink-400'}`}>
                  Москва, СПб, все города и регионы России
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSelectedEngine('2gis')}
              className={`flex items-center justify-center gap-3 py-3 px-4 rounded-xl font-bold transition-all ${
                selectedEngine === '2gis'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-600/20'
                  : 'bg-ink-50 text-ink-700 hover:bg-ink-100'
              }`}
            >
              <span className="text-xl">📍</span>
              <div className="text-left">
                <div className="text-sm font-black flex items-center gap-1.5">
                  2ГИС
                  <span
                    className={`text-[9px] px-1.5 py-0.2 rounded font-extrabold uppercase tracking-wide ${
                      selectedEngine === '2gis' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    СНГ
                  </span>
                </div>
                <div className={`text-[10px] ${selectedEngine === '2gis' ? 'text-emerald-100' : 'text-ink-400'}`}>
                  Казахстан, Узбекистан, Кыргызстан, ОАЭ
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSelectedEngine('google')}
              className={`flex items-center justify-center gap-3 py-3 px-4 rounded-xl font-bold transition-all ${
                selectedEngine === 'google'
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/20'
                  : 'bg-ink-50 text-ink-700 hover:bg-ink-100'
              }`}
            >
              <span className="text-xl">🇺🇸</span>
              <div className="text-left">
                <div className="text-sm font-black flex items-center gap-1.5">
                  Google Maps
                  <span
                    className={`text-[9px] px-1.5 py-0.2 rounded font-extrabold uppercase tracking-wide ${
                      selectedEngine === 'google' ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-700'
                    }`}
                  >
                    USA
                  </span>
                </div>
                <div className={`text-[10px] ${selectedEngine === 'google' ? 'text-blue-100' : 'text-ink-400'}`}>
                  Все 50 штатов США, города и ZIP-коды
                </div>
              </div>
            </button>
          </div>

          {/* Search Controls Card */}
          <div className="rounded-2xl border border-ink-200 bg-white p-5 shadow-card space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-end">
              {/* Country / State / Source selector */}
              {selectedEngine === 'yandex' ? (
                <div className="md:col-span-3 space-y-1.5">
                  <label className="text-xs font-bold text-ink-700 uppercase tracking-wider block">
                    Источник / Страна
                  </label>
                  <div className="flex items-center gap-2 w-full rounded-xl border border-red-200 bg-red-50/60 p-2.5 text-xs text-red-900 font-bold">
                    <span className="text-base">🇷🇺</span>
                    <span>Россия (Яндекс Карты)</span>
                  </div>
                </div>
              ) : selectedEngine === '2gis' ? (
                <div className="md:col-span-3 space-y-1.5">
                  <label className="text-xs font-bold text-ink-700 uppercase tracking-wider block">Страна (2ГИС)</label>
                  <select
                    value={selectedCountry}
                    onChange={(e) => {
                      setSelectedCountry(e.target.value);
                      const list = countriesMap[e.target.value] || [];
                      if (list[0]) setSelectedCity(list[0]);
                    }}
                    disabled={isParsing}
                    className="w-full rounded-xl border border-ink-200 bg-white p-2.5 text-xs text-ink-900 font-bold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  >
                    {Object.keys(countriesMap).map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="md:col-span-3 space-y-1.5">
                  <label className="text-xs font-bold text-ink-700 uppercase tracking-wider block">Штат США (Google Maps)</label>
                  <select
                    value={selectedUsState}
                    onChange={(e) => {
                      setSelectedUsState(e.target.value);
                      const cities = US_STATES_MAP[e.target.value] || [];
                      if (cities[0]) setSelectedUsCity(cities[0]);
                    }}
                    disabled={isParsing}
                    className="w-full rounded-xl border border-ink-200 bg-white p-2.5 text-xs text-ink-900 font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    {Object.keys(US_STATES_MAP).map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* City selector */}
              <div className="md:col-span-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-ink-700 uppercase tracking-wider block">Город / ZIP</label>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedEngine === 'yandex') setUseCustomYandexCity(!useCustomYandexCity);
                      else if (selectedEngine === '2gis') setUseCustomCity(!useCustomCity);
                      else setUseCustomUsCity(!useCustomUsCity);
                    }}
                    className={`text-[10px] font-bold hover:underline ${
                      selectedEngine === 'yandex'
                        ? 'text-red-600'
                        : selectedEngine === 'google'
                        ? 'text-blue-600'
                        : 'text-emerald-600'
                    }`}
                  >
                    {(selectedEngine === 'yandex'
                      ? useCustomYandexCity
                      : selectedEngine === '2gis'
                      ? useCustomCity
                      : useCustomUsCity)
                      ? 'Из списка'
                      : 'Ввести вручную'}
                  </button>
                </div>

                {selectedEngine === 'yandex' ? (
                  useCustomYandexCity ? (
                    <Input
                      placeholder="Введите город РФ (напр. Москва, Казань)…"
                      value={customYandexCity}
                      onChange={(e) => setCustomYandexCity(e.target.value)}
                      disabled={isParsing}
                      className="text-xs h-9"
                    />
                  ) : (
                    <select
                      value={selectedYandexCity}
                      onChange={(e) => setSelectedYandexCity(e.target.value)}
                      disabled={isParsing}
                      className="w-full rounded-xl border border-ink-200 bg-white p-2.5 text-xs text-ink-900 font-bold focus:ring-2 focus:ring-red-500 focus:outline-none"
                    >
                      {RUSSIAN_POPULAR_CITIES.map((ct) => (
                        <option key={ct} value={ct}>
                          {ct}
                        </option>
                      ))}
                    </select>
                  )
                ) : selectedEngine === '2gis' ? (
                  useCustomCity ? (
                    <Input
                      placeholder="Введите город (напр. Москва, Астана)…"
                      value={customCity}
                      onChange={(e) => setCustomCity(e.target.value)}
                      disabled={isParsing}
                      className="text-xs h-9"
                    />
                  ) : (
                    <select
                      value={selectedCity}
                      onChange={(e) => setSelectedCity(e.target.value)}
                      disabled={isParsing}
                      className="w-full rounded-xl border border-ink-200 bg-white p-2.5 text-xs text-ink-900 font-bold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    >
                      {(countriesMap[selectedCountry] || []).map((ct) => (
                        <option key={ct} value={ct}>
                          {ct}
                        </option>
                      ))}
                    </select>
                  )
                ) : (
                  useCustomUsCity ? (
                    <Input
                      placeholder="City or ZIP (e.g. Miami, 33101)…"
                      value={customUsCity}
                      onChange={(e) => setCustomUsCity(e.target.value)}
                      disabled={isParsing}
                      className="text-xs h-9"
                    />
                  ) : (
                    <select
                      value={selectedUsCity}
                      onChange={(e) => setSelectedUsCity(e.target.value)}
                      disabled={isParsing}
                      className="w-full rounded-xl border border-ink-200 bg-white p-2.5 text-xs text-ink-900 font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    >
                      {(US_STATES_MAP[selectedUsState] || []).map((ct) => (
                        <option key={ct} value={ct}>
                          {ct}
                        </option>
                      ))}
                    </select>
                  )
                )}
              </div>

              {/* Niche Input */}
              <div className="md:col-span-4 space-y-1.5">
                <label className="text-xs font-bold text-ink-700 uppercase tracking-wider block">
                  Ниша / Ключевое слово
                </label>
                <div className="relative">
                  <Input
                    placeholder={
                      selectedEngine === 'yandex'
                        ? 'напр. Стоматология, Ремонт авто, Салон красоты…'
                        : selectedEngine === 'google'
                        ? 'e.g. Roofing contractor, Dentist…'
                        : 'напр. Стоматология, Ремонт авто…'
                    }
                    value={niche}
                    onChange={(e) => setNiche(e.target.value)}
                    disabled={isParsing}
                    className="text-xs h-9 pr-8"
                  />
                  {niche && (
                    <button
                      onClick={() => setNiche('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* Limit Selector */}
              <div className="md:col-span-2 space-y-1.5">
                <label className="text-xs font-bold text-ink-700 uppercase tracking-wider block">Количество</label>
                <select
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  disabled={isParsing}
                  className="w-full rounded-xl border border-ink-200 bg-white p-2.5 text-xs text-ink-900 font-bold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value={15}>15 лидов</option>
                  <option value={30}>30 лидов</option>
                  <option value={50}>50 лидов</option>
                  <option value={100}>100 лидов</option>
                  <option value={250}>250 лидов</option>
                  <option value={500}>500 лидов</option>
                  <option value={1000}>1000 лидов</option>
                  <option value={5000}>♾️ ВСЕ (до упора)</option>
                </select>
              </div>
            </div>

            {/* Quick Niche Suggestion Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
              <span className="text-ink-400 font-bold text-[11px] shrink-0">Популярные ниши:</span>
              {selectedEngine === 'yandex'
                ? RUSSIAN_NICHE_SUGGESTIONS.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setNiche(item)}
                      disabled={isParsing}
                      className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-colors border ${
                        niche === item
                          ? 'bg-red-600 text-white border-red-600 font-bold'
                          : 'bg-ink-50 text-ink-700 border-ink-200 hover:bg-ink-100'
                      }`}
                    >
                      {item}
                    </button>
                  ))
                : selectedEngine === 'google'
                ? US_NICHE_SUGGESTIONS.map((item) => (
                    <button
                      key={item.query}
                      type="button"
                      onClick={() => setNiche(item.query)}
                      disabled={isParsing}
                      className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-colors border ${
                        niche === item.query
                          ? 'bg-blue-600 text-white border-blue-600 font-bold'
                          : 'bg-ink-50 text-ink-700 border-ink-200 hover:bg-ink-100'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))
                : CIS_NICHE_SUGGESTIONS.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setNiche(item)}
                      disabled={isParsing}
                      className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-colors border ${
                        niche === item
                          ? 'bg-emerald-600 text-white border-emerald-600 font-bold'
                          : 'bg-ink-50 text-ink-700 border-ink-200 hover:bg-ink-100'
                      }`}
                    >
                      {item}
                    </button>
                  ))}
            </div>

            {/* Pre-Search Filters & Launch Buttons Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-ink-100">
              {/* Website & Messenger Filters */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-ink-700">Сайты:</span>
                  <div className="flex rounded-xl bg-ink-100 p-1 border border-ink-200">
                    <button
                      type="button"
                      onClick={() => setWebsiteFilter('without_site')}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-black transition-all ${
                        websiteFilter === 'without_site'
                          ? selectedEngine === 'yandex'
                            ? 'bg-red-600 text-white shadow-sm'
                            : selectedEngine === 'google'
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'bg-emerald-600 text-white shadow-sm'
                          : 'text-ink-600 hover:text-ink-900'
                      }`}
                    >
                      <Flame size={13} className="text-amber-300" />
                      <span>🔥 Только БЕЗ САЙТА</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setWebsiteFilter('with_site')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                        websiteFilter === 'with_site'
                          ? 'bg-white text-ink-900 shadow-sm'
                          : 'text-ink-600 hover:text-ink-900'
                      }`}
                    >
                      Только с сайтом
                    </button>
                    <button
                      type="button"
                      onClick={() => setWebsiteFilter('all')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                        websiteFilter === 'all'
                          ? 'bg-white text-ink-900 shadow-sm'
                          : 'text-ink-600 hover:text-ink-900'
                      }`}
                    >
                      Все
                    </button>
                  </div>
                </div>

                {/* Messengers Filters: Telegram & MAX */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-ink-700">Мессенджеры:</span>
                  <button
                    type="button"
                    onClick={() => setTelegramFilter(telegramFilter === 'with_tg' ? 'all' : 'with_tg')}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold border transition-all ${
                      telegramFilter === 'with_tg'
                        ? 'bg-sky-600 text-white border-sky-700 shadow-sm'
                        : 'bg-white text-sky-700 border-sky-200 hover:bg-sky-50'
                    }`}
                    title="Фильтровать контакты, у которых есть Telegram / прямой чат по номеру"
                  >
                    <span>✈️ Только с Telegram</span>
                  </button>

                  {selectedEngine === '2gis' && (
                    <button
                      type="button"
                      onClick={() => setMaxFilter(maxFilter === 'with_max' ? 'all' : 'with_max')}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold border transition-all ${
                        maxFilter === 'with_max'
                          ? 'bg-indigo-600 text-white border-indigo-700 shadow-sm'
                          : 'bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-50'
                      }`}
                      title="Фильтровать контакты, у которых есть мессенджер MAX (max.ru)"
                    >
                      <span>💬 Только с MAX</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                {isParsing ? (
                  <Button
                    variant="danger"
                    size="md"
                    onClick={stopParsing}
                    className="font-bold px-5 bg-rose-600 hover:bg-rose-700 text-white"
                  >
                    <X size={15} /> Остановить парсинг
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="secondary"
                      size="md"
                      onClick={() => startParsing(5000)}
                      disabled={!niche.trim()}
                      className="font-bold border-ink-300 hover:bg-ink-100"
                      title="Парсить весь список без лимита до конца"
                    >
                      <Zap size={15} className="text-amber-500" />
                      <span>Парсить ВСЁ</span>
                    </Button>

                    <Button
                      variant="primary"
                      size="md"
                      onClick={() => startParsing()}
                      disabled={!niche.trim()}
                      className={`font-black px-6 shadow-md ${
                        selectedEngine === 'yandex'
                          ? 'bg-red-600 hover:bg-red-700 text-white shadow-red-600/20'
                          : selectedEngine === 'google'
                          ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20'
                      }`}
                    >
                      <Search size={15} />
                      <span>
                        {selectedEngine === 'yandex'
                          ? 'Искать в Яндекс Картах'
                          : selectedEngine === 'google'
                          ? 'Искать в Google Maps'
                          : 'Искать в 2ГИС'}
                      </span>
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Progress Status Bar */}
            {isParsing && (
              <div
                className={`rounded-xl border p-3.5 text-xs flex items-center justify-between gap-3 animate-pulse ${
                  selectedEngine === 'yandex'
                    ? 'border-red-200 bg-red-50/70 text-red-900'
                    : selectedEngine === 'google'
                    ? 'border-blue-200 bg-blue-50/70 text-blue-900'
                    : 'border-emerald-200 bg-emerald-50/70 text-emerald-900'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Loader2
                    size={16}
                    className={`animate-spin shrink-0 ${
                      selectedEngine === 'yandex'
                        ? 'text-red-600'
                        : selectedEngine === 'google'
                        ? 'text-blue-600'
                        : 'text-emerald-600'
                    }`}
                  />
                  <span className="font-semibold">{progressMsg || 'Выполняется парсинг данных...'}</span>
                </div>
                <div
                  className={`font-bold shrink-0 ${
                    selectedEngine === 'yandex'
                      ? 'text-red-800'
                      : selectedEngine === 'google'
                      ? 'text-blue-800'
                      : 'text-emerald-800'
                  }`}
                >
                  Собрано: <strong>{results.length}</strong> контактов
                </div>
              </div>
            )}
          </div>

          {/* Results Summary and Actions Bar */}
          {results.length > 0 && (
            <div className="space-y-4">
              {!hasOnlineAccount && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-900 text-xs shadow-sm">
                  <div className="flex items-center gap-3">
                    <span className="p-2 rounded-xl bg-amber-500/20 text-amber-700">
                      <AlertCircle size={20} />
                    </span>
                    <div>
                      <p className="font-bold text-amber-950 text-sm">WhatsApp не подключен к системе</p>
                      <p className="text-xs text-amber-800 mt-0.5">
                        Для автоматической отправки сообщений найденным лидам подключите рабочий номер через QR-код в разделе «Аккаунты».
                      </p>
                    </div>
                  </div>
                  <Link
                    href="/accounts"
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition-all shrink-0"
                  >
                    <QrCode size={15} />
                    <span>Подключить WhatsApp</span>
                  </Link>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 border border-ink-200 shadow-card">
                <div className="flex flex-wrap items-center gap-4 text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-ink-900">
                    <Building2 size={16} className="text-emerald-600" />
                    <span>Всего организаций: <strong>{totalCount}</strong></span>
                  </div>
                  <div className="flex items-center gap-1.5 text-ink-700 font-medium">
                    <Phone size={14} className="text-sky-600" />
                    <span>С номерами: <strong>{phonesCount}</strong></span>
                  </div>
                  {telegramCount > 0 && (
                    <div className="flex items-center gap-1.5 text-sky-700 font-medium">
                      <span>✈️ В Telegram: <strong className="font-bold text-sky-800">{telegramCount}</strong></span>
                    </div>
                  )}
                  {maxCount > 0 && (
                    <div className="flex items-center gap-1.5 text-indigo-700 font-medium">
                      <span>💬 В MAX: <strong className="font-bold">{maxCount}</strong></span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 text-ink-700 font-medium">
                    <Flame size={14} className="text-amber-500" />
                    <span>Без сайта: <strong className="text-emerald-700 font-bold">{withoutSiteCount}</strong></span>
                  </div>
                  <div className="flex items-center gap-1.5 text-ink-700 font-medium">
                    <Globe size={14} className="text-purple-600" />
                    <span>С сайтом: <strong>{withSiteCount}</strong></span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setShowLinksModal(true);
                      setIsCopiedAllLinks(false);
                    }}
                    className="text-xs font-bold border-sky-300 text-sky-800 bg-sky-50 hover:bg-sky-100 shadow-sm"
                    title="Открыть все ссылки (Telegram, WhatsApp, сайты, номера) в столбик для быстрого копирования"
                  >
                    <Copy size={14} className="text-sky-600" />
                    <span>📋 Скопировать ссылки</span>
                  </Button>

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => exportCsv()}
                    className="text-xs font-bold border-ink-200 hover:bg-ink-100"
                  >
                    <Download size={14} />
                    <span>Экспорт в CSV</span>
                  </Button>

                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleAddToWhatsAppDialogs}
                    loading={isAddingToDialogs}
                    className="text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20"
                    title="Добавить контакты в WhatsApp диалоги, чтобы вы могли сами написать им вручную без бота"
                  >
                    <UserPlus size={14} />
                    <span>
                      {selectedIndices.size > 0
                        ? `📥 Добавить выбранных в WhatsApp (${selectedIndices.size})`
                        : `📥 Добавить всех в WhatsApp (${filteredResults.length})`}
                    </span>
                  </Button>

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setShowOutreachModal(true);
                      void loadPreviewMessage();
                    }}
                    className="text-xs font-bold border-emerald-300 text-emerald-800 bg-emerald-50 hover:bg-emerald-100"
                    title="Запустить автоматическую рассылку ИИ-ботом"
                  >
                    <Zap size={14} />
                    <span>Авто-рассылка с ИИ</span>
                  </Button>
                </div>
              </div>

              {/* Table Search and In-Table Filters */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="relative w-full max-w-xs">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                  <Input
                    placeholder="Фильтр по названию, адресу, номеру…"
                    value={tableSearch}
                    onChange={(e) => setTableSearch(e.target.value)}
                    className="pl-8 text-xs h-8 bg-white border-ink-200"
                  />
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className="text-xs text-emerald-700 font-bold hover:underline"
                  >
                    {selectedIndices.size === filteredResults.length ? 'Снять выделение' : 'Выбрать все'}
                  </button>
                  {selectedIndices.size > 0 && (
                    <span className="text-ink-500 font-medium">
                      (Выбрано: <strong>{selectedIndices.size}</strong>)
                    </span>
                  )}
                </div>
              </div>

              {/* Leads Table */}
              <div className="rounded-2xl border border-ink-200 bg-white shadow-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 border-b border-ink-200 text-ink-600 uppercase font-black tracking-wider text-[10px]">
                      <tr>
                        <th className="p-3 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={filteredResults.length > 0 && selectedIndices.size === filteredResults.length}
                            onChange={toggleSelectAll}
                            className="rounded border-ink-300 text-emerald-600 focus:ring-emerald-500"
                          />
                        </th>
                        <th className="p-3 min-w-[220px]">Организация</th>
                        <th className="p-3 min-w-[160px]">Телефон / WhatsApp</th>
                        <th className="p-3 min-w-[140px]">Сайт</th>
                        <th className="p-3 min-w-[200px]">Адрес</th>
                        <th className="p-3 min-w-[120px]">Контакты / Соцсети</th>
                        <th className="p-3 text-right min-w-[160px]">Действие</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {filteredResults.map((item, idx) => {
                        const isSelected = selectedIndices.has(idx);
                        const hasPhone = Boolean(item.phone || item.whatsapp);
                        const mainPhone = item.phone || item.whatsapp;

                        return (
                          <tr
                            key={item.id || idx}
                            className={`transition-colors hover:bg-emerald-50/40 ${
                              isSelected ? 'bg-emerald-50/70' : ''
                            }`}
                          >
                            <td className="p-3 text-center">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {
                                  const next = new Set(selectedIndices);
                                  if (next.has(idx)) next.delete(idx);
                                  else next.add(idx);
                                  setSelectedIndices(next);
                                }}
                                className="rounded border-ink-300 text-emerald-600 focus:ring-emerald-500"
                              />
                            </td>

                            <td className="p-3">
                              <div className="font-bold text-ink-900 text-xs flex items-center gap-1.5">
                                <span>{item.name}</span>
                                {item.profileLink && (
                                  <a
                                    href={item.profileLink}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-ink-400 hover:text-emerald-600"
                                    title="Открыть карточку организации"
                                  >
                                    <ExternalLink size={11} />
                                  </a>
                                )}
                              </div>
                              {item.rating && (
                                <div className="flex items-center gap-1 text-[11px] text-amber-500 font-bold mt-0.5">
                                  <Star size={11} fill="currentColor" />
                                  <span>{item.rating.toFixed(1)}</span>
                                  {item.reviewsCount && (
                                    <span className="text-ink-400 font-normal">({item.reviewsCount} отзывов)</span>
                                  )}
                                </div>
                              )}
                            </td>

                            <td className="p-3">
                              {mainPhone ? (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1 font-mono font-bold text-ink-900 text-xs">
                                    <span>{mainPhone}</span>
                                    <button
                                      type="button"
                                      onClick={() => copyToClipboard(mainPhone)}
                                      className="p-1 text-ink-400 hover:text-ink-800"
                                      title="Скопировать номер"
                                    >
                                      {copiedPhone === mainPhone ? (
                                        <Check size={12} className="text-emerald-600" />
                                      ) : (
                                        <Copy size={12} />
                                      )}
                                    </button>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-1 mt-0.5">
                                    {item.whatsapp && (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                        WhatsApp
                                      </span>
                                    )}
                                    {item.telegram && (
                                      <a
                                        href={item.telegram}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1 text-[10px] font-black text-sky-700 bg-sky-50 hover:bg-sky-100 px-1.5 py-0.5 rounded border border-sky-200 transition-colors"
                                        title={`Открыть диалог в Telegram: ${item.telegram}`}
                                      >
                                        <span>✈️ Telegram</span>
                                        <ExternalLink size={9} />
                                      </a>
                                    )}
                                    {mainPhone && (
                                      <button
                                        type="button"
                                        onClick={() => handleOpenMax(item)}
                                        className="inline-flex items-center gap-1 text-[10px] font-black text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-1.5 py-0.5 rounded border border-indigo-200 transition-colors"
                                        title="Открыть диалог в MAX (скопировать номер и перейти в web.max.ru)"
                                      >
                                        <span>💬 MAX</span>
                                        <ExternalLink size={9} />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-ink-400 italic text-[11px]">Номер не указан</span>
                              )}
                            </td>

                            <td className="p-3">
                              {item.site ? (
                                <a
                                  href={item.site.startsWith('http') ? item.site : `https://${item.site}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-blue-600 hover:underline font-medium text-xs flex items-center gap-1 truncate max-w-[150px]"
                                >
                                  <Globe size={12} className="shrink-0" />
                                  <span className="truncate">{item.site.replace(/^https?:\/\//i, '')}</span>
                                </a>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-black text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                                  🔥 БЕЗ САЙТА
                                </span>
                              )}
                            </td>

                            <td className="p-3 text-ink-600 text-xs max-w-[220px]">
                              <div className="truncate" title={item.address}>
                                {item.address || '—'}
                              </div>
                            </td>

                            <td className="p-3">
                              <div className="flex items-center gap-2 text-ink-500">
                                {mainPhone && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenMax(item)}
                                    className="px-1.5 py-0.5 rounded text-[10px] font-black bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200"
                                    title="Написать в мессенджер MAX"
                                  >
                                    MAX
                                  </button>
                                )}
                                {item.email && (
                                  <a
                                    href={`mailto:${item.email}`}
                                    className="hover:text-ink-900"
                                    title={`Email: ${item.email}`}
                                  >
                                    <Mail size={14} />
                                  </a>
                                )}
                                {item.instagram && (
                                  <a
                                    href={item.instagram}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="hover:text-pink-600"
                                    title="Instagram"
                                  >
                                    <Instagram size={14} />
                                  </a>
                                )}
                                {item.telegram && (
                                  <a
                                    href={item.telegram}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="hover:text-sky-500"
                                    title="Telegram"
                                  >
                                    <Send size={14} />
                                  </a>
                                )}
                                {item.vk && (
                                  <a
                                    href={item.vk.startsWith('http') ? item.vk : `https://${item.vk}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="px-1 py-0.5 rounded text-[10px] font-black bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200"
                                    title="ВКонтакте"
                                  >
                                    VK
                                  </a>
                                )}
                              </div>
                            </td>

                            <td className="p-3 text-right">
                              {hasPhone ? (
                                <div className="flex items-center justify-end gap-1.5">
                                  {mainPhone && (
                                    <a
                                      href={item.whatsapp && item.whatsapp.startsWith('http') ? item.whatsapp : `https://wa.me/${mainPhone.replace(/\D/g, '')}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="h-7 px-2 text-[11px] font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 rounded-lg flex items-center gap-1 transition-colors"
                                      title="Открыть wa.me напрямую в приложении WhatsApp"
                                    >
                                      <span>wa.me</span>
                                      <ExternalLink size={10} />
                                    </a>
                                  )}
                                  {item.telegram && (
                                    <a
                                      href={item.telegram}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="h-7 px-2 text-[11px] font-bold bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-300 rounded-lg flex items-center gap-1 transition-colors"
                                      title={`Открыть чат в Telegram (${item.telegram})`}
                                    >
                                      <span>t.me</span>
                                      <ExternalLink size={10} />
                                    </a>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleOpenMax(item)}
                                    className="h-7 px-2 text-[11px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-300 rounded-lg flex items-center gap-1 transition-colors"
                                    title="Открыть чат в MAX (web.max.ru)"
                                  >
                                    <span>MAX</span>
                                    <ExternalLink size={10} />
                                  </button>
                                  <Button
                                    size="sm"
                                    variant="primary"
                                    onClick={() => handleOpenLeadWithAccount(item)}
                                    className="h-7 px-2.5 text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                                    title="Открыть диалог в системе (без бота, писать клиенту вручную)"
                                  >
                                    <MessageSquare size={12} />
                                    <span>В диалог</span>
                                  </Button>
                                </div>
                              ) : (
                                <span className="text-ink-400 text-[11px]">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {filteredResults.length === 0 && results.length > 0 && (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-ink-500">
                            <div className="flex flex-col items-center justify-center gap-2">
                              <span className="text-2xl">🔍</span>
                              <p className="font-bold text-sm text-ink-700">Нет контактов по выбранным фильтрам</p>
                              <p className="text-xs text-ink-400">
                                В текущем сборе найдено <strong>{results.length}</strong> организаций. Попробуйте сбросить фильтры.
                              </p>
                              <button
                                type="button"
                                onClick={() => {
                                  setWebsiteFilter('all');
                                  setWhatsappFilter('all');
                                  setTelegramFilter('all');
                                  setMaxFilter('all');
                                  setPhoneFilter('all');
                                  setTableSearch('');
                                }}
                                className="mt-2 px-3 py-1.5 rounded-xl bg-ink-100 hover:bg-ink-200 text-ink-800 text-xs font-bold transition-colors"
                              >
                                🔄 Показать все {results.length} организаций
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        /* History Tab */
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-ink-900">Сохранённые сборы ({sessions.length})</h2>
            <div className="relative w-72">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <Input
                placeholder="Поиск по сборам…"
                value={sessionsSearch}
                onChange={(e) => setSessionsSearch(e.target.value)}
                className="pl-8 text-xs h-8 bg-white border-ink-200"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sessions.map((sess) => (
              <div
                key={sess.id}
                onClick={() => void openSavedSession(sess)}
                className="rounded-2xl border border-ink-200 bg-white p-5 shadow-card hover:border-emerald-500 hover:shadow-md transition-all cursor-pointer space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-bold text-sm text-ink-900 truncate flex-1">{sess.title}</div>
                  <button
                    type="button"
                    onClick={(e) => void handleDeleteSession(sess.id, sess.title, e)}
                    className="p-1 rounded-lg text-ink-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <div className="text-xs text-ink-500 space-y-1">
                  <div>Город: <strong>{sess.city}</strong> ({sess.country})</div>
                  <div>Ниша: <strong>{sess.niche}</strong></div>
                  <div>Собрано контактов: <strong className="text-emerald-700">{sess.totalFound || sess.itemsCount}</strong></div>
                </div>

                <div className="pt-2 border-t border-ink-100 flex items-center justify-between text-[11px] text-ink-400">
                  <span>{new Date(sess.createdAt).toLocaleDateString()}</span>
                  <span className="text-emerald-600 font-bold flex items-center gap-1">
                    Открыть сбор <ChevronRight size={13} />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal: Smart Distribution across WhatsApp Accounts */}
      {showDistributionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/60 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-ink-100 space-y-4">
            <div className="flex items-center justify-between border-b border-ink-100 pb-3">
              <div className="font-bold text-base text-ink-900">
                Распределение {selectedIndices.size || filteredResults.length} лидов по номерам WhatsApp
              </div>
              <button onClick={() => setShowDistributionModal(false)} className="text-ink-400 hover:text-ink-700">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-bold text-ink-700 uppercase tracking-wider block">
                Выберите активные номера WhatsApp
              </label>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {waAccounts.map((acc) => {
                  const isChecked = selectedAccountIds.has(acc.id);
                  return (
                    <label
                      key={acc.id}
                      className="flex items-center justify-between p-2.5 rounded-xl border border-ink-200 hover:bg-ink-50 cursor-pointer text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            const next = new Set(selectedAccountIds);
                            if (next.has(acc.id)) next.delete(acc.id);
                            else next.add(acc.id);
                            setSelectedAccountIds(next);
                          }}
                          className="rounded border-ink-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="font-bold text-ink-900">{acc.name}</span>
                        <span className="text-ink-500 font-mono">({acc.phoneMasked || acc.phone})</span>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                        {acc.status}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="pt-3 flex justify-end gap-2 border-t border-ink-100">
              <Button variant="secondary" size="sm" onClick={() => setShowDistributionModal(false)}>
                Отмена
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleDistributionSubmit}
                loading={isDistributing}
                className="bg-emerald-600 hover:bg-emerald-700 font-bold text-white"
              >
                <Shuffle size={14} />
                Распределить равномерно
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Direct Batch WhatsApp Outreach */}
      {showOutreachModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl border border-ink-100 space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-ink-100 pb-3">
              <div>
                <h3 className="font-bold text-base text-ink-900 flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600">
                    <MessageSquare size={18} />
                  </span>
                  Рассылка в WhatsApp
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                    {selectedIndices.size || filteredResults.length} лидов
                  </span>
                </h3>
                <p className="text-xs text-ink-500 mt-0.5">
                  Отправка персональных сообщений через подключенные WhatsApp аккаунты
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!isSendingOutreach) {
                    setShowOutreachModal(false);
                    setOutreachProgress(null);
                  }
                }}
                disabled={isSendingOutreach}
                className="text-ink-400 hover:text-ink-700 disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>

            {/* Offline accounts warning */}
            {!hasOnlineAccount && (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-2">
                <div className="flex items-center gap-2 font-bold text-amber-800">
                  <AlertCircle size={16} />
                  <span>Нет активных онлайн-аккаунтов WhatsApp</span>
                </div>
                <p className="text-[11px] text-amber-700">
                  Все аккаунты сейчас офлайн. Откройте раздел «Аккаунты WhatsApp» и отсканируйте QR-код для подключения сессии.
                </p>
                <Link
                  href="/accounts"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
                >
                  <QrCode size={13} />
                  <span>Перейти к подключению QR-кода</span>
                </Link>
              </div>
            )}

            {/* Account selection */}
            {hasOnlineAccount && (
              <div className="space-y-2">
                <label className="text-xs font-bold text-ink-700 uppercase tracking-wider block">
                  Аккаунты для отправки (распределение по очереди)
                </label>
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {onlineWaAccounts.map((acc) => {
                    const isChecked = outreachAccountIds.has(acc.id);
                    return (
                      <label
                        key={acc.id}
                        className={`flex items-center justify-between p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                          isChecked
                            ? 'border-emerald-500 bg-emerald-50/50'
                            : 'border-ink-200 hover:bg-ink-50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              const next = new Set(outreachAccountIds);
                              if (next.has(acc.id)) {
                                if (next.size > 1) next.delete(acc.id);
                              } else {
                                next.add(acc.id);
                              }
                              setOutreachAccountIds(next);
                            }}
                            className="rounded border-ink-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <span className="font-bold text-ink-900">{acc.name}</span>
                          <span className="text-ink-500 font-mono">({acc.phoneMasked || acc.phone})</span>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                          {acc.status}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Message type selection */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-ink-700 uppercase tracking-wider block">
                Формат сообщения
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setOutreachMode('smart');
                    setTimeout(() => void loadPreviewMessage(), 50);
                  }}
                  className={`p-3 rounded-xl border text-left text-xs transition-all ${
                    outreachMode === 'smart'
                      ? 'border-emerald-600 bg-emerald-50/60 ring-2 ring-emerald-500/20'
                      : 'border-ink-200 hover:bg-ink-50 text-ink-700'
                  }`}
                >
                  <div className="font-bold text-ink-900 flex items-center gap-1.5">
                    <Sparkles size={14} className="text-emerald-600" />
                    <span>Умный ИИ-оффер</span>
                  </div>
                  <p className="text-[11px] text-ink-500 mt-1">
                    Индивидуальный оффер под нишу, сайт, ₸ и онлайн-запись без шаблонности
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setOutreachMode('custom');
                    setTimeout(() => void loadPreviewMessage(), 50);
                  }}
                  className={`p-3 rounded-xl border text-left text-xs transition-all ${
                    outreachMode === 'custom'
                      ? 'border-emerald-600 bg-emerald-50/60 ring-2 ring-emerald-500/20'
                      : 'border-ink-200 hover:bg-ink-50 text-ink-700'
                  }`}
                >
                  <div className="font-bold text-ink-900 flex items-center gap-1.5">
                    <Edit2 size={13} className="text-emerald-600" />
                    <span>Свой шаблон</span>
                  </div>
                  <p className="text-[11px] text-ink-500 mt-1">
                    Произвольный текст с тегами {'{Компания}'}, {'{Город}'}, {'{Ниша}'}
                  </p>
                </button>
              </div>

              {outreachMode === 'custom' && (
                <div className="space-y-1.5 pt-1">
                  <textarea
                    rows={4}
                    value={customTemplate}
                    onChange={(e) => {
                      setCustomTemplate(e.target.value);
                      setTimeout(() => void loadPreviewMessage(), 300);
                    }}
                    className="w-full text-xs rounded-xl border border-ink-200 p-2.5 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                    placeholder="Введите текст сообщения..."
                  />
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-ink-500">
                    <span>Быстрые теги:</span>
                    <button
                      type="button"
                      onClick={() => setCustomTemplate((prev) => prev + ' {Компания}')}
                      className="px-1.5 py-0.5 rounded bg-ink-100 hover:bg-ink-200 font-mono text-[10px] text-ink-800"
                    >
                      {'{Компания}'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomTemplate((prev) => prev + ' {Город}')}
                      className="px-1.5 py-0.5 rounded bg-ink-100 hover:bg-ink-200 font-mono text-[10px] text-ink-800"
                    >
                      {'{Город}'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomTemplate((prev) => prev + ' {Ниша}')}
                      className="px-1.5 py-0.5 rounded bg-ink-100 hover:bg-ink-200 font-mono text-[10px] text-ink-800"
                    >
                      {'{Ниша}'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Live Message Preview */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-ink-700 uppercase tracking-wider">
                  Предпросмотр сообщения
                </label>
                <button
                  type="button"
                  onClick={() => void loadPreviewMessage()}
                  className="text-[11px] text-emerald-600 hover:underline flex items-center gap-1 font-semibold"
                >
                  <RefreshCw size={11} className={isLoadingPreview ? 'animate-spin' : ''} />
                  <span>Обновить</span>
                </button>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3 text-xs text-ink-800 relative">
                {isLoadingPreview ? (
                  <div className="py-4 flex items-center justify-center gap-2 text-ink-400">
                    <Loader2 size={16} className="animate-spin text-emerald-600" />
                    <span>Генерация текста...</span>
                  </div>
                ) : previewText ? (
                  <div className="whitespace-pre-wrap font-sans text-xs leading-relaxed">{previewText}</div>
                ) : (
                  <div className="text-ink-400 italic text-[11px]">
                    Выберите контакты для предварительного просмотра
                  </div>
                )}
              </div>
            </div>

            {/* Anti-ban pacing delay */}
            <div className="flex items-center justify-between gap-4 p-3 rounded-xl bg-ink-50 border border-ink-100 text-xs">
              <div>
                <span className="font-bold text-ink-900 block">Анти-бан пауза между сообщениями</span>
                <span className="text-[11px] text-ink-500">Защищает аккаунт WhatsApp от блокировок и спам-фильтров</span>
              </div>
              <select
                value={outreachDelay}
                onChange={(e) => setOutreachDelay(Number(e.target.value))}
                className="bg-white border border-ink-200 rounded-lg px-2.5 py-1 text-xs font-bold text-ink-800"
              >
                <option value={2000}>2.0 сек (Быстро)</option>
                <option value={2500}>2.5 сек (Оптимально)</option>
                <option value={4000}>4.0 сек (Безопасно)</option>
                <option value={6000}>6.0 сек (Осторожно)</option>
              </select>
            </div>

            {/* Live Progress Bar during sending */}
            {outreachProgress && (
              <div className="p-3.5 rounded-xl bg-slate-50 border border-ink-200 space-y-2 text-xs">
                <div className="flex items-center justify-between font-bold text-ink-900">
                  <span>{outreachProgress.status}</span>
                  <span>
                    {outreachProgress.current} / {outreachProgress.total}
                  </span>
                </div>
                <div className="w-full bg-ink-200 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-600 h-full transition-all duration-300"
                    style={{
                      width: `${outreachProgress.total ? (outreachProgress.current / outreachProgress.total) * 100 : 0}%`,
                    }}
                  />
                </div>
                <div className="flex items-center gap-4 text-[11px] text-ink-600">
                  <span className="text-emerald-700 font-bold">✓ Отправлено: {outreachProgress.sent}</span>
                  {outreachProgress.failed > 0 && (
                    <span className="text-rose-600 font-bold">✕ Ошибок: {outreachProgress.failed}</span>
                  )}
                  {outreachProgress.skipped > 0 && (
                    <span className="text-ink-400">Пропущено: {outreachProgress.skipped}</span>
                  )}
                </div>
              </div>
            )}

            {/* Modal Actions */}
            <div className="pt-2 flex justify-end gap-2 border-t border-ink-100">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setShowOutreachModal(false);
                  setOutreachProgress(null);
                }}
                disabled={isSendingOutreach}
              >
                Закрыть
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSendBatchOutreach}
                loading={isSendingOutreach}
                disabled={!hasOnlineAccount || isSendingOutreach}
                className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 font-bold text-white shadow-md shadow-emerald-600/20"
              >
                <Send size={14} />
                <span>
                  🚀 Запустить отправку ({selectedIndices.size || filteredResults.length})
                </span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Successfully Added to Dialogs */}
      {showAddedSuccessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-ink-100 space-y-4 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shadow-sm">
              <CheckCircle2 size={28} />
            </div>
            <div className="space-y-1.5">
              <h3 className="font-bold text-lg text-ink-900">
                Контакты добавлены в WhatsApp диалоги!
              </h3>
              <p className="text-xs text-ink-600 leading-relaxed">
                Успешно добавлено <strong>{addedDialogsCount}</strong> диалогов. ИИ-бот для этих чатов отключен — вы можете лично написать каждому клиенту вручную.
              </p>
            </div>
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowAddedSuccessModal(false)}
                className="w-full sm:w-auto"
              >
                Остаться в парсере
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => router.push('/conversations')}
                className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
              >
                <MessageSquare size={14} />
                <span>Перейти в диалоги ({addedDialogsCount})</span>
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Modal: Export & Copy All Links in Single Column */}
      {showLinksModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl border border-ink-100 space-y-4">
            <div className="flex items-center justify-between border-b border-ink-100 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-sky-100 text-sky-700">
                  <Copy size={18} />
                </span>
                <div>
                  <h3 className="font-bold text-base text-ink-900">
                    Ссылки и контакты в столбик
                  </h3>
                  <p className="text-[11px] text-ink-500 mt-0.5">
                    {selectedIndices.size > 0
                      ? `Выбрано ${selectedIndices.size} из ${filteredResults.length} контактов`
                      : `Всего в таблице: ${filteredResults.length} контактов`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowLinksModal(false)}
                className="p-1 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-ink-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Link Type Selector Tabs */}
            <div className="flex flex-wrap items-center gap-1.5 p-1 bg-ink-100 rounded-xl">
              <button
                type="button"
                onClick={() => setLinksType('telegram')}
                className={`flex-1 min-w-[100px] py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all text-center ${
                  linksType === 'telegram'
                    ? 'bg-white text-sky-700 shadow-sm'
                    : 'text-ink-600 hover:text-ink-900'
                }`}
              >
                ✈️ Telegram ({results.filter((f) => f.telegram).length})
              </button>
              <button
                type="button"
                onClick={() => setLinksType('whatsapp')}
                className={`flex-1 min-w-[100px] py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all text-center ${
                  linksType === 'whatsapp'
                    ? 'bg-white text-emerald-700 shadow-sm'
                    : 'text-ink-600 hover:text-ink-900'
                }`}
              >
                💬 WhatsApp ({results.filter((f) => f.whatsapp || f.phone).length})
              </button>
              <button
                type="button"
                onClick={() => setLinksType('phones')}
                className={`flex-1 min-w-[90px] py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all text-center ${
                  linksType === 'phones'
                    ? 'bg-white text-ink-900 shadow-sm'
                    : 'text-ink-600 hover:text-ink-900'
                }`}
              >
                📞 Телефоны
              </button>
              <button
                type="button"
                onClick={() => setLinksType('sites')}
                className={`flex-1 min-w-[80px] py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all text-center ${
                  linksType === 'sites'
                    ? 'bg-white text-purple-700 shadow-sm'
                    : 'text-ink-600 hover:text-ink-900'
                }`}
              >
                🌐 Сайты
              </button>
              <button
                type="button"
                onClick={() => setLinksType('all')}
                className={`flex-1 min-w-[80px] py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all text-center ${
                  linksType === 'all'
                    ? 'bg-white text-ink-900 shadow-sm'
                    : 'text-ink-600 hover:text-ink-900'
                }`}
              >
                🔗 Все ссылки
              </button>
            </div>

            {/* Textarea containing links in single column */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-ink-700">
                  {linksType === 'telegram'
                    ? 'Ссылки на Telegram (чаты, профили, боты):'
                    : linksType === 'whatsapp'
                    ? 'Ссылки на WhatsApp (wa.me):'
                    : linksType === 'phones'
                    ? 'Номера телефонов списком:'
                    : linksType === 'sites'
                    ? 'Сайты организаций:'
                    : 'Все ссылки подряд в столбик:'}
                </span>
                <span className="text-ink-500 font-medium">
                  Строк: <strong>{exportedLinksData.count}</strong>
                </span>
              </div>

              <textarea
                readOnly
                rows={12}
                value={exportedLinksData.text || 'Нет ссылок для отображения по выбранному типу.'}
                onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                className="w-full font-mono text-xs bg-slate-50 text-ink-900 p-3 rounded-xl border border-ink-200 focus:outline-none focus:ring-2 focus:ring-sky-500 select-all scrollbar-thin"
              />
              <p className="text-[10px] text-ink-400">
                💡 Каждая ссылка выведена с новой строки в столбик. Можно нажать «Скопировать все» или выделить вручную.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-ink-100">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleDownloadTxtLinks}
                disabled={exportedLinksData.count === 0}
                className="text-xs font-bold border-ink-200"
              >
                <Download size={13} />
                <span>Скачать .txt</span>
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowLinksModal(false)}
                  className="text-xs"
                >
                  Закрыть
                </Button>

                <Button
                  variant="primary"
                  size="md"
                  onClick={handleCopyAllLinks}
                  disabled={exportedLinksData.count === 0}
                  className={`font-black text-xs px-5 transition-all shadow-md ${
                    isCopiedAllLinks
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20'
                      : 'bg-sky-600 hover:bg-sky-700 text-white shadow-sky-600/20'
                  }`}
                >
                  {isCopiedAllLinks ? (
                    <>
                      <Check size={15} />
                      <span>Скопировано ({exportedLinksData.count})!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={15} />
                      <span>Скопировать все ({exportedLinksData.count})</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
