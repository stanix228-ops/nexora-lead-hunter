'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Plus,
  RefreshCw,
  ExternalLink,
  Trash2,
  Pause,
  Play,
  QrCode,
  Unplug,
  Smartphone,
  Copy,
  Check,
  KeyRound,
  Bot,
  ShieldCheck,
  MessageCircle,
  Mail,
} from 'lucide-react';
import clsx from 'clsx';
import { get, post, put, patch, del } from '@/lib/api';
import type { AccountSummary, AiExecutionMode } from '@nexora/types';
import { AccountStatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, Input } from '@/components/ui/form';
import { Table, Th, Td, EmptyState } from '@/components/ui/table';
import { Modal, Confirm } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useSocket } from '@/lib/auth';

const STATUSES: Array<{ value: string; label: string }> = [
  { value: 'ONLINE', label: 'В онлайне' },
  { value: 'OFFLINE', label: 'Офлайн' },
  { value: 'PAUSED', label: 'На паузе' },
  { value: 'ATTENTION', label: 'Внимание' },
];

const GATEWAY_LABELS: Record<string, string> = {
  DISCONNECTED: 'Не подключён',
  SCANNING: 'Сканирование',
  CONNECTED: 'Подключён',
  FAILED: 'Ошибка',
};

const AI_MODE_LABELS: Record<string, string> = {
  AUTOMATIC_REPLIES: '⚡ Автоответы AI',
  MANUAL_APPROVAL: '📝 Ручное одобрение',
  FULL_AUTONOMY: '🚀 Полная автономия',
  PAUSED: '⏸️ Пауза AI',
  HUMAN_HANDOFF: '👤 Передать человеку',
};

interface WaStatus {
  state: 'DISCONNECTED' | 'SCANNING' | 'CONNECTED' | 'FAILED';
  qr: string | null;
  pairingCode?: string | null;
  error: string | null;
}

interface InstagramAccountRow {
  id: string;
  name: string;
  username: string;
  instagramId: string;
  pageId?: string | null;
  status: 'ONLINE' | 'OFFLINE' | 'PAUSED' | 'ATTENTION';
  aiExecutionMode: AiExecutionMode;
  dailyMessageLimit: number;
  messagesSentToday: number;
  profilePicUrl?: string | null;
  createdAt: string;
  _count?: {
    conversations: number;
    leads: number;
  };
}

interface TelegramBotRow {
  id: string;
  name: string;
  username: string;
  botId: string;
  status: 'ONLINE' | 'OFFLINE' | 'PAUSED' | 'ATTENTION';
  aiExecutionMode: AiExecutionMode;
  isNotificationChannel: boolean;
  ownerChatId?: string | null;
  ownerUsername?: string | null;
  notifyOnHotLead: boolean;
  notifyOnProposal: boolean;
  notifyOnHandoff: boolean;
  notifyOnObjection: boolean;
  dailyMessageLimit: number;
  messagesSentToday: number;
  createdAt: string;
  _count?: {
    conversations: number;
    leads: number;
  };
}

interface EmailAccountRow {
  id: string;
  name: string;
  emailAddress: string;
  senderName?: string | null;
  replyToAddress?: string | null;
  provider: 'SMTP' | 'RESEND' | 'SENDGRID' | 'POSTMARK' | 'MOCK';
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpUser?: string | null;
  smtpSecure?: boolean;
  status: 'ONLINE' | 'OFFLINE' | 'PAUSED' | 'ATTENTION';
  aiExecutionMode: AiExecutionMode;
  dailyMessageLimit: number;
  hourlyMessageLimit: number;
  messagesSentToday: number;
  messagesSentThisHour: number;
  warmupStage: number;
  trackingEnabled: boolean;
  createdAt: string;
  _count?: {
    conversations: number;
    leads: number;
  };
}

interface SuppressionRow {
  id: string;
  email: string;
  reason: string;
  bounceType?: string | null;
  bounceDetails?: string | null;
  suppressedAt: string;
}

export default function AccountsPage() {
  const { toast } = useToast();
  const socket = useSocket();
  const [activeTab, setActiveTab] = useState<'WHATSAPP' | 'INSTAGRAM' | 'TELEGRAM' | 'EMAIL'>('WHATSAPP');

  // WhatsApp Accounts State
  const [items, setItems] = useState<AccountSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [toDelete, setToDelete] = useState<AccountSummary | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // QR & Pairing code modal
  const [qrAccount, setQrAccount] = useState<AccountSummary | null>(null);
  const [pairMode, setPairMode] = useState<'qr' | 'code'>('qr');
  const [pairPhone, setPairPhone] = useState('');
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [waBusy, setWaBusy] = useState(false);
  const [waStatus, setWaStatus] = useState<WaStatus>({ state: 'DISCONNECTED', qr: null, error: null });
  const [qrToastShown, setQrToastShown] = useState(false);

  // Instagram Accounts State
  const [igItems, setIgItems] = useState<InstagramAccountRow[] | null>(null);
  const [showCreateIg, setShowCreateIg] = useState(false);
  const [toDeleteIg, setToDeleteIg] = useState<InstagramAccountRow | null>(null);
  const [igForm, setIgForm] = useState({
    name: '',
    username: '',
    instagramId: '',
    pageId: '',
    accessToken: '',
    appSecret: '',
    aiExecutionMode: 'AUTOMATIC_REPLIES' as AiExecutionMode,
    dailyMessageLimit: 200,
  });

  // Telegram Bots & Notifications State
  const [tgItems, setTgItems] = useState<TelegramBotRow[] | null>(null);
  const [showCreateTg, setShowCreateTg] = useState(false);
  const [toDeleteTg, setToDeleteTg] = useState<TelegramBotRow | null>(null);
  const [testingTgId, setTestingTgId] = useState<string | null>(null);
  const [tgForm, setTgForm] = useState({
    name: '',
    botToken: '',
    username: '',
    secretToken: '',
    ownerChatId: '',
    ownerUsername: '',
    isNotificationChannel: true,
    notifyOnHotLead: true,
    notifyOnProposal: true,
    notifyOnHandoff: true,
    notifyOnObjection: true,
    aiExecutionMode: 'AUTOMATIC_REPLIES' as AiExecutionMode,
    dailyMessageLimit: 500,
  });

  // Email Accounts & Suppression State
  const [emailItems, setEmailItems] = useState<EmailAccountRow[] | null>(null);
  const [suppressionItems, setSuppressionItems] = useState<SuppressionRow[] | null>(null);
  const [showCreateEmail, setShowCreateEmail] = useState(false);
  const [showSuppressionModal, setShowSuppressionModal] = useState(false);
  const [toDeleteEmail, setToDeleteEmail] = useState<EmailAccountRow | null>(null);
  const [testingEmailId, setTestingEmailId] = useState<string | null>(null);
  const [manualSuppEmail, setManualSuppEmail] = useState('');
  const [emailForm, setEmailForm] = useState({
    name: '',
    emailAddress: '',
    senderName: '',
    replyToAddress: '',
    provider: 'SMTP' as 'SMTP' | 'RESEND' | 'SENDGRID' | 'POSTMARK' | 'MOCK',
    smtpHost: 'smtp.gmail.com',
    smtpPort: 587,
    smtpUser: '',
    smtpPassword: '',
    smtpSecure: false,
    apiKey: '',
    aiExecutionMode: 'AUTOMATIC_REPLIES' as AiExecutionMode,
    dailyMessageLimit: 50,
    hourlyMessageLimit: 10,
    trackingEnabled: true,
  });

  const load = useCallback(async () => {
    try {
      const res = await get<{ items: AccountSummary[] }>('/api/accounts');
      setItems(res.items);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  const loadInstagram = useCallback(async () => {
    try {
      const res = await get<InstagramAccountRow[]>('/api/instagram/accounts');
      setIgItems(res || []);
    } catch (err) {
      setIgItems([]);
    }
  }, []);

  const loadTelegram = useCallback(async () => {
    try {
      const res = await get<TelegramBotRow[]>('/api/telegram/bots');
      setTgItems(res || []);
    } catch (err) {
      setTgItems([]);
    }
  }, []);

  const loadEmail = useCallback(async () => {
    try {
      const res = await get<{ success: boolean; data: EmailAccountRow[] }>('/api/email/accounts');
      setEmailItems(res.data || []);
    } catch (err) {
      setEmailItems([]);
    }
  }, []);

  const loadSuppressions = useCallback(async () => {
    try {
      const res = await get<{ success: boolean; data: SuppressionRow[] }>('/api/email/suppressions');
      setSuppressionItems(res.data || []);
    } catch (err) {
      setSuppressionItems([]);
    }
  }, []);

  useEffect(() => {
    void load();
    void loadInstagram();
    void loadTelegram();
    void loadEmail();
  }, [load, loadInstagram, loadTelegram, loadEmail]);

  // Realtime updates from backend via WebSocket
  useEffect(() => {
    if (!socket || !qrAccount) return;

    const onStatus = (payload: { accountId: string; status: string; lastError?: string }) => {
      if (payload.accountId !== qrAccount.id) return;
      setWaStatus((prev) => ({
        ...prev,
        state: payload.status as WaStatus['state'],
        error: payload.lastError ?? null,
      }));
      if (payload.status === 'CONNECTED' && !qrToastShown) {
        setQrToastShown(true);
        toast('Аккаунт успешно подключён к WhatsApp!', 'success');
        void load();
      }
    };

    const onQr = (payload: { accountId: string; qr: string }) => {
      if (payload.accountId !== qrAccount.id) return;
      setWaStatus((prev) => ({ ...prev, qr: payload.qr, state: 'SCANNING' }));
    };

    const onPairingCode = (payload: { accountId: string; code: string }) => {
      if (payload.accountId !== qrAccount.id) return;
      setPairingCode(payload.code);
      setWaStatus((prev) => ({ ...prev, state: 'SCANNING' }));
    };

    socket.on('account.gateway.status', onStatus);
    socket.on('account.wa.qr', onQr);
    socket.on('account.wa.pairing_code', onPairingCode);

    return () => {
      socket.off('account.gateway.status', onStatus);
      socket.off('account.wa.qr', onQr);
      socket.off('account.wa.pairing_code', onPairingCode);
    };
  }, [socket, qrAccount, qrToastShown, toast, load]);

  // Periodic polling fallback while modal is open
  useEffect(() => {
    if (!qrAccount) return;
    let active = true;

    const poll = async () => {
      try {
        const res = await post<WaStatus>(`/api/wa/${qrAccount.id}/status`);
        if (!active) return;
        setWaStatus((prev) => ({
          state: res.state === 'FAILED' ? 'FAILED' : res.state,
          qr: res.qr || prev.qr,
          pairingCode: res.pairingCode || prev.pairingCode,
          error: res.error,
        }));
        if (res.pairingCode) {
          setPairingCode(res.pairingCode);
        }
        if (res.state === 'CONNECTED' && !qrToastShown) {
          setQrToastShown(true);
          toast('Аккаунт успешно подключён к WhatsApp!', 'success');
          void load();
        }
      } catch {
        /* transient polling error */
      }
    };

    void poll();
    const interval = window.setInterval(poll, 2500);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [qrAccount?.id, qrToastShown, toast, load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const created = await post<AccountSummary>('/api/accounts', {
        name: undefined,
        phone: undefined,
      });
      toast('Аккаунт добавлен', 'success');
      setShowCreate(false);
      await load();
      openQr(created);
    } catch (err) {
      toast((err as Error).message, 'danger');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateInstagram = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!igForm.username.trim() || !igForm.instagramId.trim()) return;
    setSaving(true);
    try {
      await post('/api/instagram/accounts', {
        name: igForm.name.trim() || `@${igForm.username.trim().replace(/^@/, '')}`,
        username: igForm.username.trim().replace(/^@/, ''),
        instagramId: igForm.instagramId.trim(),
        pageId: igForm.pageId.trim() || undefined,
        accessToken: igForm.accessToken.trim() || undefined,
        appSecret: igForm.appSecret.trim() || undefined,
        aiExecutionMode: igForm.aiExecutionMode,
        dailyMessageLimit: Number(igForm.dailyMessageLimit) || 200,
      });
      toast('Instagram-аккаунт успешно подключён!', 'success');
      setShowCreateIg(false);
      setIgForm({
        name: '',
        username: '',
        instagramId: '',
        pageId: '',
        accessToken: '',
        appSecret: '',
        aiExecutionMode: 'AUTOMATIC_REPLIES',
        dailyMessageLimit: 200,
      });
      await loadInstagram();
    } catch (err: any) {
      toast(err?.message || 'Ошибка подключения Instagram', 'danger');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateIgMode = async (id: string, mode: string) => {
    setBusyId(id);
    try {
      await patch(`/api/instagram/accounts/${id}`, { aiExecutionMode: mode });
      toast(`Режим AI обновлен на «${AI_MODE_LABELS[mode] || mode}»`, 'success');
      await loadInstagram();
    } catch (err: any) {
      toast(err?.message || 'Ошибка обновления режима', 'danger');
    } finally {
      setBusyId(null);
    }
  };

  const confirmDeleteIg = async () => {
    if (!toDeleteIg) return;
    setBusyId(toDeleteIg.id);
    try {
      await del(`/api/instagram/accounts/${toDeleteIg.id}`);
      toast('Instagram-аккаунт удалён', 'success');
      setToDeleteIg(null);
      await loadInstagram();
    } catch (err: any) {
      toast(err?.message || 'Ошибка удаления', 'danger');
    } finally {
      setBusyId(null);
    }
  };

  const handleCreateTelegram = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tgForm.botToken.trim()) return;
    setSaving(true);
    try {
      await post('/api/telegram/bots', {
        name: tgForm.name.trim() || 'Telegram Bot',
        botToken: tgForm.botToken.trim(),
        username: tgForm.username.trim() || undefined,
        secretToken: tgForm.secretToken.trim() || undefined,
        ownerChatId: tgForm.ownerChatId.trim() || undefined,
        ownerUsername: tgForm.ownerUsername.trim() || undefined,
        isNotificationChannel: tgForm.isNotificationChannel,
        notifyOnHotLead: tgForm.notifyOnHotLead,
        notifyOnProposal: tgForm.notifyOnProposal,
        notifyOnHandoff: tgForm.notifyOnHandoff,
        notifyOnObjection: tgForm.notifyOnObjection,
        aiExecutionMode: tgForm.aiExecutionMode,
        dailyMessageLimit: Number(tgForm.dailyMessageLimit) || 500,
      });
      toast('Telegram-бот успешно подключён и авторизован!', 'success');
      setShowCreateTg(false);
      setTgForm({
        name: '',
        botToken: '',
        username: '',
        secretToken: '',
        ownerChatId: '',
        ownerUsername: '',
        isNotificationChannel: true,
        notifyOnHotLead: true,
        notifyOnProposal: true,
        notifyOnHandoff: true,
        notifyOnObjection: true,
        aiExecutionMode: 'AUTOMATIC_REPLIES',
        dailyMessageLimit: 500,
      });
      await loadTelegram();
    } catch (err: any) {
      toast(err?.message || 'Ошибка подключения Telegram-бота', 'danger');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateTgMode = async (id: string, mode: string) => {
    setBusyId(id);
    try {
      await patch(`/api/telegram/bots/${id}`, { aiExecutionMode: mode });
      toast(`Режим AI обновлен на «${AI_MODE_LABELS[mode] || mode}»`, 'success');
      await loadTelegram();
    } catch (err: any) {
      toast(err?.message || 'Ошибка обновления режима', 'danger');
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleTgNotification = async (id: string, field: 'notifyOnHotLead' | 'notifyOnProposal' | 'notifyOnHandoff', currentValue: boolean) => {
    setBusyId(id);
    try {
      await patch(`/api/telegram/bots/${id}`, { [field]: !currentValue });
      toast('Настройка уведомлений сохранена', 'success');
      await loadTelegram();
    } catch (err: any) {
      toast(err?.message || 'Ошибка сохранения настройки', 'danger');
    } finally {
      setBusyId(null);
    }
  };

  const handleSendTestNotification = async (id: string) => {
    setTestingTgId(id);
    try {
      await post(`/api/telegram/bots/${id}/test-notification`, {});
      toast('🔥 Тестовое уведомление HOT LEAD успешно отправлено в Telegram!', 'success');
    } catch (err: any) {
      toast(err?.message || 'Ошибка отправки тестового уведомления', 'danger');
    } finally {
      setTestingTgId(null);
    }
  };

  const confirmDeleteTg = async () => {
    if (!toDeleteTg) return;
    setBusyId(toDeleteTg.id);
    try {
      await del(`/api/telegram/bots/${toDeleteTg.id}`);
      toast('Telegram-бот удалён', 'success');
      setToDeleteTg(null);
      await loadTelegram();
    } catch (err: any) {
      toast(err?.message || 'Ошибка удаления', 'danger');
    } finally {
      setBusyId(null);
    }
  };

  const handleCreateEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailForm.emailAddress.trim()) return;
    setSaving(true);
    try {
      await post('/api/email/accounts', {
        name: emailForm.name.trim() || emailForm.emailAddress.trim(),
        emailAddress: emailForm.emailAddress.trim(),
        senderName: emailForm.senderName.trim() || undefined,
        replyToAddress: emailForm.replyToAddress.trim() || undefined,
        provider: emailForm.provider,
        smtpHost: emailForm.smtpHost.trim() || undefined,
        smtpPort: Number(emailForm.smtpPort) || 587,
        smtpUser: emailForm.smtpUser.trim() || undefined,
        smtpPassword: emailForm.smtpPassword.trim() || undefined,
        smtpSecure: emailForm.smtpSecure,
        apiKey: emailForm.apiKey.trim() || undefined,
        aiExecutionMode: emailForm.aiExecutionMode,
        dailyMessageLimit: Number(emailForm.dailyMessageLimit) || 50,
        hourlyMessageLimit: Number(emailForm.hourlyMessageLimit) || 10,
        trackingEnabled: emailForm.trackingEnabled,
      });
      toast('Email аккаунт успешно подключён!', 'success');
      setShowCreateEmail(false);
      setEmailForm({
        name: '',
        emailAddress: '',
        senderName: '',
        replyToAddress: '',
        provider: 'SMTP',
        smtpHost: 'smtp.gmail.com',
        smtpPort: 587,
        smtpUser: '',
        smtpPassword: '',
        smtpSecure: false,
        apiKey: '',
        aiExecutionMode: 'AUTOMATIC_REPLIES',
        dailyMessageLimit: 50,
        hourlyMessageLimit: 10,
        trackingEnabled: true,
      });
      await loadEmail();
    } catch (err: any) {
      toast(err?.message || 'Ошибка подключения Email аккаунта', 'danger');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateEmailMode = async (id: string, mode: string) => {
    setBusyId(id);
    try {
      await put(`/api/email/accounts/${id}`, { aiExecutionMode: mode });
      toast(`Режим AI обновлен на «${AI_MODE_LABELS[mode] || mode}»`, 'success');
      await loadEmail();
    } catch (err: any) {
      toast(err?.message || 'Ошибка обновления режима', 'danger');
    } finally {
      setBusyId(null);
    }
  };

  const handleTestEmail = async (id: string) => {
    setTestingEmailId(id);
    try {
      const res = await post<{ success: boolean; data: { message: string } }>(`/api/email/accounts/${id}/test`, {});
      toast(res.data?.message || 'Подключение успешно проверено!', 'success');
    } catch (err: any) {
      toast(err?.message || 'Ошибка проверки соединения', 'danger');
    } finally {
      setTestingEmailId(null);
    }
  };

  const confirmDeleteEmail = async () => {
    if (!toDeleteEmail) return;
    setBusyId(toDeleteEmail.id);
    try {
      await del(`/api/email/accounts/${toDeleteEmail.id}`);
      toast('Email-аккаунт удалён', 'success');
      setToDeleteEmail(null);
      await loadEmail();
    } catch (err: any) {
      toast(err?.message || 'Ошибка удаления', 'danger');
    } finally {
      setBusyId(null);
    }
  };

  const handleAddSuppression = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualSuppEmail.trim()) return;
    try {
      await post('/api/email/suppressions', { email: manualSuppEmail.trim(), reason: 'MANUAL' });
      toast(`Email ${manualSuppEmail} добавлен в Suppression List`, 'success');
      setManualSuppEmail('');
      await loadSuppressions();
    } catch (err: any) {
      toast(err?.message || 'Ошибка добавления email в список блокировок', 'danger');
    }
  };

  const handleRemoveSuppression = async (id: string, email: string) => {
    try {
      await del(`/api/email/suppressions/${id}`);
      toast(`Email ${email} удален из Suppression List`, 'success');
      await loadSuppressions();
    } catch (err: any) {
      toast(err?.message || 'Ошибка удаления', 'danger');
    }
  };

  const togglePause = async (acc: AccountSummary) => {
    setBusyId(acc.id);
    try {
      if (acc.status === 'PAUSED') await post(`/api/accounts/${acc.id}/resume`);
      else await post(`/api/accounts/${acc.id}/pause`);
      toast(acc.status === 'PAUSED' ? 'Аккаунт снова в работе' : 'Аккаунт на паузе', 'success');
      await load();
    } catch (err) {
      toast((err as Error).message, 'danger');
    } finally {
      setBusyId(null);
    }
  };

  const setManualStatus = async (acc: AccountSummary, s: string) => {
    setBusyId(acc.id);
    try {
      await patch(`/api/accounts/${acc.id}`, { status: s });
      toast('Статус обновлён', 'success');
      await load();
    } catch (err) {
      toast((err as Error).message, 'danger');
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setBusyId(toDelete.id);
    try {
      await del(`/api/accounts/${toDelete.id}`);
      toast('Аккаунт удалён', 'success');
      setToDelete(null);
      await load();
    } catch (err) {
      toast((err as Error).message, 'danger');
    } finally {
      setBusyId(null);
    }
  };

  const openWhatsApp = (acc: AccountSummary) => {
    if (acc.phoneMasked) {
      const cleanPhone = acc.phoneMasked.replace(/\D/g, '');
      if (cleanPhone) {
        window.open(`https://web.whatsapp.com/send?phone=${cleanPhone}`, '_blank');
        return;
      }
    }
    window.open('https://web.whatsapp.com', '_blank');
  };

  const openQr = (acc: AccountSummary) => {
    setQrAccount(acc);
    setPairMode('qr');
    setPairPhone(acc.phoneMasked ? acc.phoneMasked.replace(/\D/g, '') : '');
    setPairingCode(null);
    setCodeCopied(false);
    setWaBusy(false);
    setWaStatus({
      state: acc.gatewayStatus === 'CONNECTED' ? 'CONNECTED' : 'DISCONNECTED',
      qr: null,
      error: null,
    });
    setQrToastShown(false);
    void refreshQr();
  };

  const refreshQr = async () => {
    if (!qrAccount) return;
    setWaBusy(true);
    setWaStatus((prev) => ({ ...prev, state: 'SCANNING', qr: null, error: null }));
    try {
      const res = await post<WaStatus>(`/api/wa/${qrAccount.id}/qr`);
      setWaStatus((prev) => ({ ...prev, ...res }));
    } catch (err) {
      setWaStatus({ state: 'FAILED', qr: null, error: (err as Error).message });
    } finally {
      setWaBusy(false);
    }
  };

  const requestPhoneCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qrAccount || !pairPhone.trim()) return;
    setWaBusy(true);
    setCodeCopied(false);
    try {
      const res = await post<{ state: WaStatus['state']; pairingCode: string | null; error: string | null }>(
        `/api/wa/${qrAccount.id}/pairing-code`,
        { phone: pairPhone },
      );
      if (res.pairingCode) {
        setPairingCode(res.pairingCode);
        toast('Код сопряжения получен!', 'success');
      }
      setWaStatus((prev) => ({
        ...prev,
        state: res.state,
        pairingCode: res.pairingCode,
        error: res.error,
      }));
    } catch (err) {
      toast((err as Error).message, 'danger');
      setWaStatus((prev) => ({ ...prev, error: (err as Error).message }));
    } finally {
      setWaBusy(false);
    }
  };

  const copyCodeToClipboard = () => {
    if (!pairingCode) return;
    const clean = pairingCode.replace(/\s+/g, '');
    void navigator.clipboard.writeText(clean);
    setCodeCopied(true);
    toast('Код скопирован', 'info');
    setTimeout(() => setCodeCopied(false), 3000);
  };

  const logoutWa = async (acc: AccountSummary) => {
    setBusyId(acc.id);
    try {
      await post(`/api/wa/${acc.id}/logout`);
      toast('Аккаунт отключён от WhatsApp', 'success');
      await load();
    } catch (err) {
      toast((err as Error).message, 'danger');
    } finally {
      setBusyId(null);
    }
  };

  const closeQr = () => {
    setQrAccount(null);
    setPairingCode(null);
    setCodeCopied(false);
    setWaStatus({ state: 'DISCONNECTED', qr: null, error: null });
    setQrToastShown(false);
  };

  const qrConnected = waStatus.state === 'CONNECTED';

  return (
    <div className="space-y-4">
      {/* Top Channel Tabs Selector */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex rounded-xl bg-ink-100 p-1 gap-1 border border-ink-200">
          <button
            type="button"
            onClick={() => setActiveTab('WHATSAPP')}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all',
              activeTab === 'WHATSAPP'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-ink-600 hover:text-ink-900',
            )}
          >
            <MessageCircle size={15} />
            <span>WhatsApp Аккаунты</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-800 text-white">
              {items?.length || 0}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('INSTAGRAM')}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all',
              activeTab === 'INSTAGRAM'
                ? 'bg-gradient-to-r from-pink-600 via-rose-600 to-purple-600 text-white shadow-xs'
                : 'text-ink-600 hover:text-ink-900',
            )}
          >
            <Bot size={15} />
            <span>Instagram Direct</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-purple-900 text-white">
              {igItems?.length || 0}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('TELEGRAM')}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all',
              activeTab === 'TELEGRAM'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'text-ink-600 hover:text-ink-900',
            )}
          >
            <Bot size={15} />
            <span>✈️ Telegram Боты & Алерты</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-sky-900 text-white">
              {tgItems?.length || 0}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('EMAIL')}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all',
              activeTab === 'EMAIL'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-ink-600 hover:text-ink-900',
            )}
          >
            <Mail size={15} />
            <span>✉️ Email & Домены (SMTP/API)</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-amber-900 text-white">
              {emailItems?.length || 0}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              void load();
              void loadInstagram();
              void loadTelegram();
              void loadEmail();
            }}
          >
            <RefreshCw size={14} />
            Обновить
          </Button>

          {activeTab === 'WHATSAPP' ? (
            <Button size="sm" onClick={() => setShowCreate(true)} disabled={(items?.length ?? 0) >= 7}>
              <Plus size={14} />
              Добавить WhatsApp
            </Button>
          ) : activeTab === 'INSTAGRAM' ? (
            <Button
              size="sm"
              onClick={() => setShowCreateIg(true)}
              className="bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700 text-white font-bold"
            >
              <Plus size={14} />
              Подключить Instagram
            </Button>
          ) : activeTab === 'TELEGRAM' ? (
            <Button
              size="sm"
              onClick={() => setShowCreateTg(true)}
              className="bg-sky-600 hover:bg-sky-700 text-white font-bold"
            >
              <Plus size={14} />
              Подключить Telegram Бота
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  void loadSuppressions();
                  setShowSuppressionModal(true);
                }}
                className="border-amber-300 text-amber-900 bg-amber-50 hover:bg-amber-100"
              >
                <ShieldCheck size={14} className="text-amber-700" />
                Suppression List ({suppressionItems?.length || 0})
              </Button>
              <Button
                size="sm"
                onClick={() => setShowCreateEmail(true)}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold"
              >
                <Plus size={14} />
                Подключить Email
              </Button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-600">{error}</div>
      )}

      {/* TAB 1: WhatsApp Accounts Table */}
      {activeTab === 'WHATSAPP' && (
        <Card className="p-0">
          {!items ? (
            <div className="px-5 py-12 text-center text-sm text-ink-400">Загрузка…</div>
          ) : !items.length ? (
            <EmptyState title="WhatsApp-аккаунтов пока нет" hint="Добавьте первый WhatsApp-аккаунт" />
          ) : (
            <Table
              head={
                <>
                  <Th>Аккаунт</Th>
                  <Th>Статус</Th>
                  <Th>WhatsApp</Th>
                  <Th className="text-right">Сообщения (7 дней)</Th>
                  <Th className="text-right">Ответы</Th>
                  <Th className="text-right">Диалоги</Th>
                  <Th>Риск</Th>
                  <Th className="text-right">Действия</Th>
                </>
              }
            >
              {items.map((acc) => (
                <tr key={acc.id} className="hover:bg-ink-50/50">
                  <Td>
                    <div className="font-medium text-ink-800">{acc.name}</div>
                    <div className="text-[11px] text-ink-400">{acc.phoneMasked}</div>
                  </Td>
                  <Td>
                    <AccountStatusBadge status={acc.status} />
                    <div className="mt-1">
                      <Select
                        value={acc.status}
                        onChange={(e) => void setManualStatus(acc, e.target.value)}
                        disabled={busyId === acc.id}
                        className="w-32"
                      >
                        {STATUSES.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </Td>
                  <Td>
                    <span
                      className={
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ' +
                        (acc.gatewayStatus === 'CONNECTED'
                          ? 'bg-emerald-50 text-emerald-600'
                          : acc.gatewayStatus === 'SCANNING'
                            ? 'bg-warning-50 text-warning-700'
                            : acc.gatewayStatus === 'FAILED'
                              ? 'bg-danger-50 text-danger-600'
                              : 'bg-ink-100 text-ink-500')
                      }
                    >
                      <span
                        className={
                          'h-1.5 w-1.5 rounded-full ' +
                          (acc.gatewayStatus === 'CONNECTED' ? 'bg-emerald-500' : 'bg-ink-300')
                        }
                      />
                      {GATEWAY_LABELS[acc.gatewayStatus ?? 'DISCONNECTED']}
                    </span>
                  </Td>
                  <Td className="text-right font-medium text-ink-700">{acc.counters?.sevenDays ?? 0}</Td>
                  <Td className="text-right text-ink-600">{acc.counters?.replies ?? 0}</Td>
                  <Td className="text-right text-ink-600">{acc.counters?.activeConversations ?? 0}</Td>
                  <Td>
                    <span
                      className={
                        'inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ' +
                        (acc.risk?.level === 'CRITICAL' || acc.risk?.level === 'HIGH'
                          ? 'bg-danger-50 text-danger-600'
                          : acc.risk?.level === 'MEDIUM'
                            ? 'bg-warning-50 text-warning-700'
                            : 'bg-emerald-50 text-emerald-600')
                      }
                    >
                      {acc.risk?.level ?? '—'}
                    </span>
                  </Td>
                  <Td className="text-right">
                    <div className="inline-flex items-center gap-1">
                      {acc.gatewayStatus === 'CONNECTED' ? (
                        <button
                          title="Отключить от WhatsApp"
                          onClick={() => void logoutWa(acc)}
                          disabled={busyId === acc.id}
                          className="rounded-md p-1.5 text-ink-400 hover:bg-ink-100 hover:text-danger-500 disabled:opacity-40"
                        >
                          <Unplug size={15} />
                        </button>
                      ) : (
                        <button
                          title="Подключить (QR / Код)"
                          onClick={() => void openQr(acc)}
                          className="rounded-md p-1.5 text-ink-400 hover:bg-ink-100 hover:text-brand-600"
                        >
                          <QrCode size={15} />
                        </button>
                      )}
                      <button
                        title="Открыть в WhatsApp Web"
                        onClick={() => void openWhatsApp(acc)}
                        className="rounded-md p-1.5 text-ink-400 hover:bg-ink-100 hover:text-brand-600"
                      >
                        <ExternalLink size={15} />
                      </button>
                      <button
                        title={acc.status === 'PAUSED' ? 'Возобновить' : 'На паузу'}
                        disabled={busyId === acc.id}
                        onClick={() => void togglePause(acc)}
                        className="rounded-md p-1.5 text-ink-400 hover:bg-ink-100 hover:text-warning-600 disabled:opacity-40"
                      >
                        {acc.status === 'PAUSED' ? <Play size={15} /> : <Pause size={15} />}
                      </button>
                      <button
                        title="Удалить"
                        onClick={() => setToDelete(acc)}
                        className="rounded-md p-1.5 text-ink-400 hover:bg-ink-100 hover:text-danger-500"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      )}

      {/* TAB 2: Instagram Direct Accounts Table */}
      {activeTab === 'INSTAGRAM' && (
        <div className="space-y-4">
          <div className="p-4 bg-gradient-to-r from-pink-50 via-purple-50 to-white rounded-2xl border border-pink-200 flex items-center justify-between flex-wrap gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-gradient-to-br from-pink-500 to-purple-600 text-white shadow-2xs font-bold text-xs">
                  📸 IG
                </span>
                <h3 className="text-sm font-black text-ink-900">
                  Официальная интеграция Meta Graph API (Instagram Direct)
                </h3>
              </div>
              <p className="text-xs text-ink-600">
                Соответствует политикам Meta (24-часовое окно Standard Messaging, защита Opt-Out, 5 режимов работы AI).
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono bg-white px-3 py-1.5 rounded-xl border border-pink-200 text-pink-900 shadow-2xs">
              <span>Webhook:</span>
              <strong className="text-purple-700">/api/webhooks/instagram</strong>
            </div>
          </div>

          <Card className="p-0">
            {!igItems ? (
              <div className="px-5 py-12 text-center text-sm text-ink-400">Загрузка Instagram-аккаунтов…</div>
            ) : !igItems.length ? (
              <div className="py-12 px-4 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-pink-100 to-purple-100 text-purple-700 flex items-center justify-center mx-auto border border-purple-200">
                  <Bot size={24} />
                </div>
                <div>
                  <p className="font-bold text-base text-ink-900">Instagram-аккаунтов пока не подключено</p>
                  <p className="text-xs text-ink-500 max-w-sm mx-auto mt-0.5">
                    Подключите ваш бизнес-аккаунт Instagram через Meta Graph API для приёма Direct сообщений и автоматических AI консультаций.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => setShowCreateIg(true)}
                  className="bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700 text-white font-bold"
                >
                  <Plus size={14} /> Подключить Instagram
                </Button>
              </div>
            ) : (
              <Table
                head={
                  <>
                    <Th>Instagram Аккаунт</Th>
                    <Th>Instagram ID</Th>
                    <Th>Статус</Th>
                    <Th>Режим работы AI (5 режимов)</Th>
                    <Th className="text-right">Лимит / Отправлено</Th>
                    <Th className="text-right">Диалоги / Лиды</Th>
                    <Th className="text-right">Действия</Th>
                  </>
                }
              >
                {igItems.map((acc) => (
                  <tr key={acc.id} className="hover:bg-ink-50/50">
                    <Td>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 p-[2px] shrink-0">
                          <div className="w-full h-full rounded-full bg-white flex items-center justify-center font-bold text-xs text-purple-900 uppercase">
                            {acc.username[0] || 'I'}
                          </div>
                        </div>
                        <div>
                          <div className="font-bold text-ink-900 text-xs flex items-center gap-1">
                            <span>{acc.name}</span>
                            <a
                              href={`https://instagram.com/${acc.username}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-pink-600 hover:text-pink-700"
                              title="Открыть в Instagram"
                            >
                              <ExternalLink size={12} />
                            </a>
                          </div>
                          <div className="text-[11px] font-semibold text-purple-700">@{acc.username}</div>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <span className="font-mono text-xs text-ink-600 bg-ink-100 px-2 py-0.5 rounded-md">
                        {acc.instagramId}
                      </span>
                    </Td>
                    <Td>
                      <AccountStatusBadge status={acc.status} />
                    </Td>
                    <Td>
                      <select
                        value={acc.aiExecutionMode || 'AUTOMATIC_REPLIES'}
                        onChange={(e) => void handleUpdateIgMode(acc.id, e.target.value)}
                        disabled={busyId === acc.id}
                        className="rounded-lg border border-purple-300 bg-purple-50 px-2.5 py-1 text-xs font-bold text-purple-900 focus:outline-none focus:ring-1 focus:ring-purple-500 shadow-2xs cursor-pointer"
                      >
                        <option value="AUTOMATIC_REPLIES">⚡ Автоответы AI</option>
                        <option value="MANUAL_APPROVAL">📝 Ручное одобрение</option>
                        <option value="FULL_AUTONOMY">🚀 Полная автономия</option>
                        <option value="PAUSED">⏸️ Пауза AI</option>
                        <option value="HUMAN_HANDOFF">👤 Передать человеку</option>
                      </select>
                    </Td>
                    <Td className="text-right">
                      <div className="text-xs font-bold text-ink-800">
                        {acc.messagesSentToday} / {acc.dailyMessageLimit}
                      </div>
                      <div className="text-[10px] text-ink-400">сообщений в сутки</div>
                    </Td>
                    <Td className="text-right">
                      <span className="font-bold text-xs text-purple-800">
                        {acc._count?.conversations ?? 0} чатов
                      </span>
                      <span className="text-[10px] text-ink-400 block">
                        {acc._count?.leads ?? 0} лидов
                      </span>
                    </Td>
                    <Td className="text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          title="Удалить Instagram-аккаунт"
                          onClick={() => setToDeleteIg(acc)}
                          className="rounded-md p-1.5 text-ink-400 hover:bg-ink-100 hover:text-danger-500"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </div>
      )}

      {/* TAB 3: Telegram Bots & Owner Notifications Table */}
      {activeTab === 'TELEGRAM' && (
        <div className="space-y-4">
          <div className="p-4 bg-gradient-to-r from-sky-50 via-blue-50 to-white rounded-2xl border border-sky-200 flex items-center justify-between flex-wrap gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-sky-600 text-white shadow-2xs font-bold text-xs">
                  ✈️ TG
                </span>
                <h3 className="text-sm font-black text-ink-900">
                  Официальный Telegram Bot API + Канал мгновенных уведомлений владельца
                </h3>
              </div>
              <p className="text-xs text-ink-600">
                AI консультирует клиентов в Telegram, а бот отправляет владельцу карточки <strong className="text-amber-700 font-bold">🔥 HOT LEAD</strong> с интерактивными кнопками <code>[Открыть CRM]</code>, <code>[Перехватить диалог]</code>, <code>[Пауза AI]</code>.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono bg-white px-3 py-1.5 rounded-xl border border-sky-200 text-sky-900 shadow-2xs">
              <span>Webhook:</span>
              <strong className="text-sky-700">/api/webhooks/telegram/:username</strong>
            </div>
          </div>

          <Card className="p-0">
            {!tgItems ? (
              <div className="px-5 py-12 text-center text-sm text-ink-400">Загрузка Telegram-ботов…</div>
            ) : !tgItems.length ? (
              <div className="py-12 px-4 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-sky-100 text-sky-700 flex items-center justify-center mx-auto border border-sky-200">
                  <Bot size={24} />
                </div>
                <div>
                  <p className="font-bold text-base text-ink-900">Telegram-ботов пока не подключено</p>
                  <p className="text-xs text-ink-500 max-w-sm mx-auto mt-0.5">
                    Подключите вашего бота от @BotFather для приёма сообщений, ведения лидов и получения мгновенных алертов о горячих сделках с кнопками перехвата.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => setShowCreateTg(true)}
                  className="bg-sky-600 hover:bg-sky-700 text-white font-bold"
                >
                  <Plus size={14} /> Подключить Telegram Бота
                </Button>
              </div>
            ) : (
              <Table
                head={
                  <>
                    <Th>Telegram Бот</Th>
                    <Th>Bot ID</Th>
                    <Th>Статус</Th>
                    <Th>Режим работы AI</Th>
                    <Th>Канал уведомлений (Владелец)</Th>
                    <Th>Алерты в Telegram</Th>
                    <Th className="text-right">Лимит / Отправлено</Th>
                    <Th className="text-right">Диалоги / Лиды</Th>
                    <Th className="text-right">Действия</Th>
                  </>
                }
              >
                {tgItems.map((bot) => (
                  <tr key={bot.id} className="hover:bg-ink-50/50">
                    <Td>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-sky-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                          ✈️
                        </div>
                        <div>
                          <div className="font-bold text-ink-900 text-xs flex items-center gap-1">
                            <span>{bot.name}</span>
                            <a
                              href={`https://t.me/${bot.username}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sky-600 hover:text-sky-700"
                              title="Открыть в Telegram"
                            >
                              <ExternalLink size={12} />
                            </a>
                          </div>
                          <div className="text-[11px] font-semibold text-sky-700">@{bot.username}</div>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <span className="font-mono text-xs text-ink-600 bg-ink-100 px-2 py-0.5 rounded-md">
                        {bot.botId}
                      </span>
                    </Td>
                    <Td>
                      <AccountStatusBadge status={bot.status} />
                    </Td>
                    <Td>
                      <select
                        value={bot.aiExecutionMode || 'AUTOMATIC_REPLIES'}
                        onChange={(e) => void handleUpdateTgMode(bot.id, e.target.value)}
                        disabled={busyId === bot.id}
                        className="rounded-lg border border-sky-300 bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-900 focus:outline-none focus:ring-1 focus:ring-sky-500 shadow-2xs cursor-pointer"
                      >
                        <option value="AUTOMATIC_REPLIES">⚡ Автоответы AI</option>
                        <option value="MANUAL_APPROVAL">📝 Ручное одобрение</option>
                        <option value="FULL_AUTONOMY">🚀 Полная автономия</option>
                        <option value="PAUSED">⏸️ Пауза AI</option>
                        <option value="HUMAN_HANDOFF">👤 Передать человеку</option>
                      </select>
                    </Td>
                    <Td>
                      {bot.ownerChatId ? (
                        <div className="text-xs">
                          <div className="font-bold text-emerald-800 flex items-center gap-1">
                            <span>👑 {bot.ownerUsername ? `@${bot.ownerUsername}` : 'Владелец'}</span>
                          </div>
                          <div className="font-mono text-[10px] text-ink-500">Chat ID: {bot.ownerChatId}</div>
                        </div>
                      ) : (
                        <div className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                          ⚠️ Отправьте <code>/start</code> боту
                        </div>
                      )}
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void handleToggleTgNotification(bot.id, 'notifyOnHotLead', bot.notifyOnHotLead)}
                          className={clsx(
                            'px-2 py-0.5 rounded-md text-[10px] font-bold transition-all border shadow-2xs',
                            bot.notifyOnHotLead
                              ? 'bg-amber-100 border-amber-300 text-amber-900'
                              : 'bg-zinc-100 border-zinc-200 text-zinc-400 line-through',
                          )}
                          title="Уведомлять о Горячих Лидах (Score >= 80)"
                        >
                          🔥 Hot Lead
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleToggleTgNotification(bot.id, 'notifyOnHandoff', bot.notifyOnHandoff)}
                          className={clsx(
                            'px-2 py-0.5 rounded-md text-[10px] font-bold transition-all border shadow-2xs',
                            bot.notifyOnHandoff
                              ? 'bg-purple-100 border-purple-300 text-purple-900'
                              : 'bg-zinc-100 border-zinc-200 text-zinc-400 line-through',
                          )}
                          title="Уведомлять о запросах менеджера"
                        >
                          👤 Handoff
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleToggleTgNotification(bot.id, 'notifyOnProposal', bot.notifyOnProposal)}
                          className={clsx(
                            'px-2 py-0.5 rounded-md text-[10px] font-bold transition-all border shadow-2xs',
                            bot.notifyOnProposal
                              ? 'bg-emerald-100 border-emerald-300 text-emerald-900'
                              : 'bg-zinc-100 border-zinc-200 text-zinc-400 line-through',
                          )}
                          title="Уведомлять о сформированных КП"
                        >
                          📑 КП
                        </button>
                      </div>
                    </Td>
                    <Td className="text-right">
                      <div className="text-xs font-bold text-ink-800">
                        {bot.messagesSentToday} / {bot.dailyMessageLimit}
                      </div>
                      <div className="text-[10px] text-ink-400">сообщений в сутки</div>
                    </Td>
                    <Td className="text-right">
                      <span className="font-bold text-xs text-sky-800">
                        {bot._count?.conversations ?? 0} чатов
                      </span>
                      <span className="text-[10px] text-ink-400 block">
                        {bot._count?.leads ?? 0} лидов
                      </span>
                    </Td>
                    <Td className="text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => void handleSendTestNotification(bot.id)}
                          loading={testingTgId === bot.id}
                          className="h-7 px-2 text-[11px] font-bold border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 gap-1 shadow-2xs"
                          title="Отправить тестовый HOT LEAD алерт с кнопками в Telegram владельца"
                        >
                          <span>🔥 Тест</span>
                        </Button>
                        <button
                          title="Удалить Telegram-бота"
                          onClick={() => setToDeleteTg(bot)}
                          className="rounded-md p-1.5 text-ink-400 hover:bg-ink-100 hover:text-danger-500"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </div>
      )}

      {/* TAB 4: Email Accounts & Anti-Spam Outreach Table */}
      {activeTab === 'EMAIL' && (
        <div className="space-y-4">
          <div className="p-4 bg-gradient-to-r from-amber-50 via-orange-50 to-white rounded-2xl border border-amber-200 flex items-center justify-between flex-wrap gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-amber-600 text-white shadow-2xs font-bold text-xs">
                  ✉️ EMAIL
                </span>
                <h3 className="text-sm font-black text-ink-900">
                  Персонализированный Email Outreach & Умный AI Inbox (RFC 2822 / 8058)
                </h3>
              </div>
              <p className="text-xs text-ink-600">
                Каждое первое письмо генерируется индивидуально на основе <strong>BusinessAnalysis</strong> (скорость загрузки, мобильная версия, стек технологий). Встроен трекинг открытий/кликов, автоматическая обработка отписок и защита от спама.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-xs font-mono bg-white px-3 py-1.5 rounded-xl border border-amber-200 text-amber-900 shadow-2xs">
                <span>Inbound Webhook:</span>
                <strong className="text-amber-700"> /api/webhooks/email/inbound</strong>
              </div>
            </div>
          </div>

          <Card className="p-0">
            {!emailItems ? (
              <div className="px-5 py-12 text-center text-sm text-ink-400">Загрузка Email-аккаунтов…</div>
            ) : !emailItems.length ? (
              <div className="py-12 px-4 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto border border-amber-200">
                  <Mail size={24} />
                </div>
                <div>
                  <p className="font-bold text-base text-ink-900">Email-аккаунтов пока не подключено</p>
                  <p className="text-xs text-ink-500 max-w-sm mx-auto mt-0.5">
                    Подключите ваш почтовый ящик (SMTP / Resend / SendGrid / Mock) для отправки персональных предложений клиентам и автономного ведения диалогов через Email.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => setShowCreateEmail(true)}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-bold"
                  >
                    <Plus size={14} /> Подключить Email Аккаунт
                  </Button>
                </div>
              </div>
            ) : (
              <Table
                head={
                  <>
                    <Th>Email Аккаунт</Th>
                    <Th>Провайдер</Th>
                    <Th>Статус</Th>
                    <Th>Режим AI</Th>
                    <Th>Прогрев & Лимиты</Th>
                    <Th>Трекинг</Th>
                    <Th className="text-right">Диалоги / Лиды</Th>
                    <Th className="text-right">Действия</Th>
                  </>
                }
              >
                {emailItems.map((acc) => (
                  <tr key={acc.id} className="hover:bg-ink-50/50">
                    <Td>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-amber-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                          ✉️
                        </div>
                        <div>
                          <div className="font-bold text-ink-900 text-xs flex items-center gap-1">
                            <span>{acc.name}</span>
                          </div>
                          <div className="text-[11px] font-semibold text-amber-800 font-mono">
                            {acc.emailAddress}
                          </div>
                          {acc.senderName && (
                            <div className="text-[10px] text-ink-400">
                              От: {acc.senderName}
                            </div>
                          )}
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <span className="font-mono text-xs font-bold text-amber-900 bg-amber-100/80 px-2 py-0.5 rounded-md border border-amber-200">
                        {acc.provider}
                      </span>
                      {acc.smtpHost && (
                        <div className="text-[10px] text-ink-400 font-mono mt-0.5">
                          {acc.smtpHost}:{acc.smtpPort || 587}
                        </div>
                      )}
                    </Td>
                    <Td>
                      <AccountStatusBadge status={acc.status} />
                    </Td>
                    <Td>
                      <select
                        value={acc.aiExecutionMode || 'AUTOMATIC_REPLIES'}
                        onChange={(e) => void handleUpdateEmailMode(acc.id, e.target.value)}
                        disabled={busyId === acc.id}
                        className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-900 focus:outline-none focus:ring-1 focus:ring-amber-500 shadow-2xs cursor-pointer"
                      >
                        <option value="AUTOMATIC_REPLIES">⚡ Автоответы AI</option>
                        <option value="MANUAL_APPROVAL">📝 Ручное одобрение</option>
                        <option value="FULL_AUTONOMY">🚀 Полная автономия</option>
                        <option value="PAUSED">⏸️ Пауза AI</option>
                        <option value="HUMAN_HANDOFF">👤 Передать человеку</option>
                      </select>
                    </Td>
                    <Td>
                      <div className="text-xs font-bold text-ink-800">
                        Сутки: {acc.messagesSentToday} / {acc.dailyMessageLimit}
                      </div>
                      <div className="text-[10px] text-amber-700">
                        Час: {acc.messagesSentThisHour} / {acc.hourlyMessageLimit} (прогрев)
                      </div>
                    </Td>
                    <Td>
                      <div className="flex flex-col gap-0.5 text-[11px]">
                        <span className={clsx('font-bold', acc.trackingEnabled ? 'text-emerald-700' : 'text-zinc-400')}>
                          {acc.trackingEnabled ? '✅ Open & Click Pixel' : '⚪ Трекинг выкл'}
                        </span>
                        <span className="text-[10px] text-ink-400">RFC 8058 1-Click Unsub</span>
                      </div>
                    </Td>
                    <Td className="text-right">
                      <span className="font-bold text-xs text-amber-900">
                        {acc._count?.conversations ?? 0} чатов
                      </span>
                      <span className="text-[10px] text-ink-400 block">
                        {acc._count?.leads ?? 0} лидов
                      </span>
                    </Td>
                    <Td className="text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => void handleTestEmail(acc.id)}
                          loading={testingEmailId === acc.id}
                          className="h-7 px-2 text-[11px] font-bold border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 gap-1 shadow-2xs"
                          title="Проверить SMTP / API подключение к почтовому серверу"
                        >
                          <span>⚡ Тест</span>
                        </Button>
                        <button
                          title="Удалить Email-аккаунт"
                          onClick={() => setToDeleteEmail(acc)}
                          className="rounded-md p-1.5 text-ink-400 hover:bg-ink-100 hover:text-danger-500"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </div>
      )}

      {/* Modal: Create WhatsApp Account */}
      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Добавить WhatsApp-аккаунт"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>
              Отмена
            </Button>
            <Button type="submit" form="create-account-form" loading={saving}>
              Добавить и подключить
            </Button>
          </>
        }
      >
        <form id="create-account-form" onSubmit={create} className="space-y-4">
          <div className="rounded-xl bg-ink-50 p-3.5 text-xs text-ink-600 space-y-1.5">
            <p className="font-medium text-ink-800">Авторизация без сторонних API</p>
            <p>
              После создания откроется окно подключения. Вы сможете отсканировать <strong>QR-код</strong> или получить <strong>8-значный код сопряжения</strong> прямо в WhatsApp на телефоне.
            </p>
          </div>
        </form>
      </Modal>

      {/* Modal: Connect Instagram Account */}
      <Modal
        open={showCreateIg}
        onClose={() => setShowCreateIg(false)}
        title="Подключение Instagram Direct (Meta Graph API)"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreateIg(false)}>
              Отмена
            </Button>
            <Button
              type="submit"
              form="create-ig-form"
              loading={saving}
              className="bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700 text-white font-bold"
            >
              Подключить Instagram
            </Button>
          </>
        }
      >
        <form id="create-ig-form" onSubmit={handleCreateInstagram} className="space-y-3.5">
          <div className="rounded-xl bg-purple-50 p-3 text-xs text-purple-900 border border-purple-100 space-y-1">
            <p className="font-bold flex items-center gap-1">
              <ShieldCheck size={14} className="text-purple-600" /> Официальный Meta Graph API
            </p>
            <p className="text-[11px] text-purple-700 leading-relaxed">
              Укажите данные вашего подключённого Instagram Business аккаунта. Вебхуки приёма сообщений настраиваются в Meta Developer Console.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-ink-700 mb-1 uppercase tracking-wider">
              Название в системе
            </label>
            <Input
              placeholder="напр. Nexora Direct Основной"
              value={igForm.name}
              onChange={(e) => setIgForm({ ...igForm, name: e.target.value })}
              className="text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-ink-700 mb-1 uppercase tracking-wider">
                Instagram Username *
              </label>
              <Input
                placeholder="username (без @)"
                value={igForm.username}
                onChange={(e) => setIgForm({ ...igForm, username: e.target.value })}
                required
                className="text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-ink-700 mb-1 uppercase tracking-wider">
                Instagram Account / IGSID *
              </label>
              <Input
                placeholder="напр. 17841405309211844"
                value={igForm.instagramId}
                onChange={(e) => setIgForm({ ...igForm, instagramId: e.target.value })}
                required
                className="text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-ink-700 mb-1 uppercase tracking-wider">
                Режим работы AI
              </label>
              <select
                value={igForm.aiExecutionMode}
                onChange={(e) => setIgForm({ ...igForm, aiExecutionMode: e.target.value as any })}
                className="w-full rounded-xl border border-ink-200 bg-white p-2.5 text-xs text-ink-900 font-medium focus:ring-1 focus:ring-purple-500"
              >
                <option value="AUTOMATIC_REPLIES">⚡ Автоответы AI</option>
                <option value="MANUAL_APPROVAL">📝 Ручное одобрение</option>
                <option value="FULL_AUTONOMY">🚀 Полная автономия</option>
                <option value="PAUSED">⏸️ Пауза AI</option>
                <option value="HUMAN_HANDOFF">👤 Передать человеку</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-ink-700 mb-1 uppercase tracking-wider">
                Суточный лимит сообщений
              </label>
              <Input
                type="number"
                value={String(igForm.dailyMessageLimit)}
                onChange={(e) => setIgForm({ ...igForm, dailyMessageLimit: Number(e.target.value) || 200 })}
                min={1}
                max={1000}
                className="text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-ink-700 mb-1 uppercase tracking-wider">
              Meta Graph Access Token (Опционально)
            </label>
            <Input
              type="password"
              placeholder="EAA..."
              value={igForm.accessToken}
              onChange={(e) => setIgForm({ ...igForm, accessToken: e.target.value })}
              className="text-xs font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-ink-700 mb-1 uppercase tracking-wider">
              Meta App Secret (для валидации HMAC-SHA256 подписи)
            </label>
            <Input
              type="password"
              placeholder="App Secret из Meta Developer Console"
              value={igForm.appSecret}
              onChange={(e) => setIgForm({ ...igForm, appSecret: e.target.value })}
              className="text-xs font-mono"
            />
          </div>
        </form>
      </Modal>

      {/* Modal: Connect WhatsApp (QR or Phone Code) */}
      <Modal
        open={!!qrAccount}
        onClose={closeQr}
        title={qrConnected ? `«${qrAccount?.name}» подключён` : `Подключение «${qrAccount?.name}» к WhatsApp`}
        footer={
          <>
            <Button variant="secondary" onClick={closeQr}>
              {qrConnected ? 'Готово' : 'Закрыть'}
            </Button>
            {!qrConnected && pairMode === 'qr' && (
              <Button type="button" onClick={() => void refreshQr()} loading={waBusy} disabled={waBusy}>
                <RefreshCw size={14} />
                Обновить QR
              </Button>
            )}
          </>
        }
      >
        {qrAccount && (
          <div className="space-y-4">
            {qrConnected ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center space-y-2">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <Check size={20} />
                </div>
                <div className="text-sm font-semibold text-emerald-800">WhatsApp успешно подключён!</div>
                <p className="text-xs text-emerald-600">
                  Сессия сохранена и будет активна постоянно. Диалоги и рассылки доступны в системе.
                </p>
              </div>
            ) : (
              <>
                {/* Tabs: QR vs Phone Code */}
                <div className="flex rounded-xl bg-ink-100/80 p-1">
                  <button
                    type="button"
                    onClick={() => setPairMode('qr')}
                    className={
                      'flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition ' +
                      (pairMode === 'qr'
                        ? 'bg-white text-ink-900 shadow-sm'
                        : 'text-ink-500 hover:text-ink-800')
                    }
                  >
                    <QrCode size={14} />
                    По QR-коду
                  </button>
                  <button
                    type="button"
                    onClick={() => setPairMode('code')}
                    className={
                      'flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition ' +
                      (pairMode === 'code'
                        ? 'bg-white text-ink-900 shadow-sm'
                        : 'text-ink-500 hover:text-ink-800')
                    }
                  >
                    <Smartphone size={14} />
                    По номеру телефона
                  </button>
                </div>

                {/* TAB 1: QR Code */}
                {pairMode === 'qr' && (
                  <div className="space-y-4">
                    <div className="rounded-xl bg-ink-50 p-3 text-xs text-ink-600 space-y-1">
                      <p className="font-medium text-ink-800">Инструкция по сканированию:</p>
                      <ol className="list-decimal pl-4 space-y-0.5 text-ink-500">
                        <li>Откройте WhatsApp на телефоне</li>
                        <li>Нажмите <strong>Настройки</strong> (или три точки) → <strong>«Связанные устройства»</strong></li>
                        <li>Нажмите <strong>«Привязать устройство»</strong> и наведите камеру на QR-код ниже</li>
                      </ol>
                    </div>

                    {waBusy && !waStatus.qr && (
                      <div className="flex flex-col items-center justify-center py-10 gap-2">
                        <RefreshCw size={24} className="animate-spin text-brand-600" />
                        <p className="text-xs text-ink-500">Генерируем свежий QR-код…</p>
                      </div>
                    )}

                    {waStatus.qr && (
                      <div className="flex flex-col items-center gap-3">
                        <div className="rounded-2xl border border-ink-100 bg-white p-3 shadow-md">
                          <img
                            src={`data:image/png;base64,${waStatus.qr}`}
                            alt="QR-код привязки WhatsApp"
                            className="h-60 w-60 object-contain rounded-lg"
                          />
                        </div>
                        <p className="text-[11px] text-ink-400 text-center">
                          Код обновляется автоматически. Как только устройство свяжется, окно закроется.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 2: Phone Pairing Code */}
                {pairMode === 'code' && (
                  <div className="space-y-4">
                    <div className="rounded-xl bg-ink-50 p-3 text-xs text-ink-600 space-y-1">
                      <p className="font-medium text-ink-800">Сопряжение через 8-значный код:</p>
                      <ol className="list-decimal pl-4 space-y-0.5 text-ink-500">
                        <li>Введите ваш номер телефона (с кодом страны, например: <code>+77051234567</code>)</li>
                        <li>В WhatsApp на телефоне: <strong>Связанные устройства</strong> → <strong>Привязать устройство</strong></li>
                        <li>Внизу нажмите <strong>«Связать по номеру телефона»</strong> и введите 8-значный код</li>
                      </ol>
                    </div>

                    <form onSubmit={requestPhoneCode} className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-ink-700 mb-1">
                          Номер телефона
                        </label>
                        <div className="flex gap-2">
                          <Input
                            placeholder="+7 705 123 45 67"
                            value={pairPhone}
                            onChange={(e) => setPairPhone(e.target.value)}
                            className="flex-1"
                            disabled={waBusy}
                          />
                          <Button type="submit" loading={waBusy} disabled={!pairPhone.trim() || waBusy}>
                            <KeyRound size={14} />
                            Получить код
                          </Button>
                        </div>
                      </div>
                    </form>

                    {pairingCode && (
                      <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-4 text-center space-y-2">
                        <div className="text-xs text-brand-700 font-medium">Ваш код сопряжения WhatsApp:</div>
                        <div className="flex items-center justify-center gap-2">
                          <span className="font-mono text-2xl font-bold tracking-widest text-brand-900 bg-white px-4 py-1.5 rounded-lg border border-brand-200 shadow-sm">
                            {pairingCode}
                          </span>
                          <button
                            type="button"
                            onClick={copyCodeToClipboard}
                            className="rounded-lg border border-brand-200 bg-white p-2.5 text-brand-700 hover:bg-brand-50 shadow-sm transition"
                            title="Скопировать код"
                          >
                            {codeCopied ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
                          </button>
                        </div>
                        <p className="text-[11px] text-ink-500">
                          Введите эти 8 символов в WhatsApp на телефоне в течение 60 секунд.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {waStatus.state === 'FAILED' && waStatus.error && (
                  <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-xs text-red-600">
                    {waStatus.error}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </Modal>

      {/* Modal: Connect Telegram Bot */}
      <Modal
        open={showCreateTg}
        onClose={() => setShowCreateTg(false)}
        title="Подключение Telegram Бота (Official Bot API)"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreateTg(false)}>
              Отмена
            </Button>
            <Button
              type="submit"
              form="create-tg-form"
              loading={saving}
              className="bg-sky-600 hover:bg-sky-700 text-white font-bold"
            >
              Подключить Telegram Бота
            </Button>
          </>
        }
      >
        <form id="create-tg-form" onSubmit={handleCreateTelegram} className="space-y-3.5">
          <div className="rounded-xl bg-sky-50 p-3 text-xs text-sky-900 border border-sky-200 space-y-1">
            <p className="font-bold flex items-center gap-1">
              <ShieldCheck size={14} className="text-sky-600" /> Официальный Telegram Bot API
            </p>
            <p className="text-[11px] text-sky-700 leading-relaxed">
              Создайте бота в <strong>@BotFather</strong>, скопируйте API Token и укажите его здесь. Токен автоматически верифицируется через метод <code>getMe</code>.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-ink-700 mb-1 uppercase tracking-wider">
              Название бота в CRM
            </label>
            <Input
              placeholder="напр. Nexora Sales Bot"
              value={tgForm.name}
              onChange={(e) => setTgForm({ ...tgForm, name: e.target.value })}
              className="text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-ink-700 mb-1 uppercase tracking-wider">
              Telegram Bot Token (от @BotFather) *
            </label>
            <Input
              type="password"
              placeholder="123456789:ABCdefGHIjklMNOpqrSTUvwxYZ"
              value={tgForm.botToken}
              onChange={(e) => setTgForm({ ...tgForm, botToken: e.target.value })}
              required
              className="text-xs font-mono"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-ink-700 mb-1 uppercase tracking-wider">
                Owner Chat ID (для алертов)
              </label>
              <Input
                placeholder="напр. 987654321 или команда /start"
                value={tgForm.ownerChatId}
                onChange={(e) => setTgForm({ ...tgForm, ownerChatId: e.target.value })}
                className="text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-ink-700 mb-1 uppercase tracking-wider">
                Username владельца
              </label>
              <Input
                placeholder="без @"
                value={tgForm.ownerUsername}
                onChange={(e) => setTgForm({ ...tgForm, ownerUsername: e.target.value })}
                className="text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-ink-700 mb-1 uppercase tracking-wider">
                Режим работы AI
              </label>
              <select
                value={tgForm.aiExecutionMode}
                onChange={(e) => setTgForm({ ...tgForm, aiExecutionMode: e.target.value as any })}
                className="w-full rounded-xl border border-ink-200 bg-white p-2.5 text-xs text-ink-900 font-medium focus:ring-1 focus:ring-sky-500"
              >
                <option value="AUTOMATIC_REPLIES">⚡ Автоответы AI</option>
                <option value="MANUAL_APPROVAL">📝 Ручное одобрение</option>
                <option value="FULL_AUTONOMY">🚀 Полная автономия</option>
                <option value="PAUSED">⏸️ Пауза AI</option>
                <option value="HUMAN_HANDOFF">👤 Передать человеку</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-ink-700 mb-1 uppercase tracking-wider">
                Суточный лимит сообщений
              </label>
              <Input
                type="number"
                value={String(tgForm.dailyMessageLimit)}
                onChange={(e) => setTgForm({ ...tgForm, dailyMessageLimit: Number(e.target.value) || 500 })}
                min={1}
                max={2000}
                className="text-xs"
              />
            </div>
          </div>

          <div className="rounded-xl border border-ink-200 p-3 bg-slate-50 space-y-2">
            <div className="text-xs font-bold text-ink-800">Уведомления владельца в Telegram:</div>
            <div className="grid grid-cols-3 gap-2">
              <label className="flex items-center gap-1.5 text-xs font-medium text-ink-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={tgForm.notifyOnHotLead}
                  onChange={(e) => setTgForm({ ...tgForm, notifyOnHotLead: e.target.checked })}
                  className="rounded text-sky-600 focus:ring-sky-500"
                />
                <span>🔥 Hot Leads</span>
              </label>
              <label className="flex items-center gap-1.5 text-xs font-medium text-ink-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={tgForm.notifyOnHandoff}
                  onChange={(e) => setTgForm({ ...tgForm, notifyOnHandoff: e.target.checked })}
                  className="rounded text-sky-600 focus:ring-sky-500"
                />
                <span>👤 Handoff</span>
              </label>
              <label className="flex items-center gap-1.5 text-xs font-medium text-ink-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={tgForm.notifyOnProposal}
                  onChange={(e) => setTgForm({ ...tgForm, notifyOnProposal: e.target.checked })}
                  className="rounded text-sky-600 focus:ring-sky-500"
                />
                <span>📑 Готовые КП</span>
              </label>
            </div>
          </div>
        </form>
      </Modal>

      {/* Modal: Confirm Delete WhatsApp */}
      <Confirm
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => void confirmDelete()}
        busy={busyId === toDelete?.id}
        title="Удалить аккаунт?"
        message={`Аккаунт «${toDelete?.name}» будет удалён вместе с историей диалогов.`}
      />

      {/* Modal: Confirm Delete Instagram */}
      <Confirm
        open={!!toDeleteIg}
        onClose={() => setToDeleteIg(null)}
        onConfirm={() => void confirmDeleteIg()}
        busy={busyId === toDeleteIg?.id}
        title="Удалить Instagram-аккаунт?"
        message={`Аккаунт @${toDeleteIg?.username} будет отключён от CRM.`}
      />

      {/* Modal: Confirm Delete Telegram Bot */}
      <Confirm
        open={!!toDeleteTg}
        onClose={() => setToDeleteTg(null)}
        onConfirm={() => void confirmDeleteTg()}
        busy={busyId === toDeleteTg?.id}
        title="Удалить Telegram-бота?"
        message={`Бот @${toDeleteTg?.username} будет отключён, а вебхук удалён из Telegram.`}
      />

      {/* Modal: Connect Email Account */}
      <Modal
        open={showCreateEmail}
        onClose={() => setShowCreateEmail(false)}
        title="Подключение Email Аккаунта (SMTP / API)"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreateEmail(false)}>
              Отмена
            </Button>
            <Button
              type="submit"
              form="create-email-form"
              loading={saving}
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold"
            >
              Подключить Email
            </Button>
          </>
        }
      >
        <form id="create-email-form" onSubmit={handleCreateEmail} className="space-y-3.5">
          <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900 border border-amber-200 space-y-1">
            <p className="font-bold flex items-center gap-1">
              <ShieldCheck size={14} className="text-amber-600" /> Персонализированный Outreach & RFC 2822
            </p>
            <p className="text-[11px] text-amber-700 leading-relaxed">
              Подключите SMTP или API (Resend, SendGrid, Mock). Каждое первое письмо формируется на базе аудита сайта клиента с встроенными заголовками <code>List-Unsubscribe</code> и защитой от спама.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-ink-700 mb-1 uppercase tracking-wider">
                Название в CRM *
              </label>
              <Input
                placeholder="напр. Outreach Alexey"
                value={emailForm.name}
                onChange={(e) => setEmailForm({ ...emailForm, name: e.target.value })}
                required
                className="text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-ink-700 mb-1 uppercase tracking-wider">
                Email Адрес (From) *
              </label>
              <Input
                type="email"
                placeholder="alex@domain.com"
                value={emailForm.emailAddress}
                onChange={(e) => setEmailForm({ ...emailForm, emailAddress: e.target.value })}
                required
                className="text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-ink-700 mb-1 uppercase tracking-wider">
                Имя отправителя (Sender Name)
              </label>
              <Input
                placeholder="Алексей | Nexora Digital"
                value={emailForm.senderName}
                onChange={(e) => setEmailForm({ ...emailForm, senderName: e.target.value })}
                className="text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-ink-700 mb-1 uppercase tracking-wider">
                Reply-To Email
              </label>
              <Input
                type="email"
                placeholder="info@domain.com"
                value={emailForm.replyToAddress}
                onChange={(e) => setEmailForm({ ...emailForm, replyToAddress: e.target.value })}
                className="text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-ink-700 mb-1 uppercase tracking-wider">
                Провайдер
              </label>
              <select
                value={emailForm.provider}
                onChange={(e) => setEmailForm({ ...emailForm, provider: e.target.value as any })}
                className="w-full rounded-xl border border-ink-200 bg-white p-2.5 text-xs text-ink-900 font-medium focus:ring-1 focus:ring-amber-500"
              >
                <option value="SMTP">SMTP (Gmail / Yandex / Custom)</option>
                <option value="RESEND">Resend API</option>
                <option value="SENDGRID">SendGrid API</option>
                <option value="POSTMARK">Postmark API</option>
                <option value="MOCK">MOCK (Локальный тест)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-ink-700 mb-1 uppercase tracking-wider">
                Режим работы AI
              </label>
              <select
                value={emailForm.aiExecutionMode}
                onChange={(e) => setEmailForm({ ...emailForm, aiExecutionMode: e.target.value as any })}
                className="w-full rounded-xl border border-ink-200 bg-white p-2.5 text-xs text-ink-900 font-medium focus:ring-1 focus:ring-amber-500"
              >
                <option value="AUTOMATIC_REPLIES">⚡ Автоответы AI</option>
                <option value="MANUAL_APPROVAL">📝 Ручное одобрение</option>
                <option value="FULL_AUTONOMY">🚀 Полная автономия</option>
                <option value="PAUSED">⏸️ Пауза AI</option>
                <option value="HUMAN_HANDOFF">👤 Передать человеку</option>
              </select>
            </div>
          </div>

          {emailForm.provider === 'SMTP' && (
            <div className="rounded-xl border border-ink-200 p-3 bg-slate-50 space-y-2.5">
              <div className="text-xs font-bold text-ink-800">Настройки SMTP подключения:</div>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-[11px] font-medium text-ink-600 mb-0.5">SMTP Host</label>
                  <Input
                    placeholder="smtp.gmail.com"
                    value={emailForm.smtpHost}
                    onChange={(e) => setEmailForm({ ...emailForm, smtpHost: e.target.value })}
                    className="text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-ink-600 mb-0.5">Порт</label>
                  <Input
                    type="number"
                    value={String(emailForm.smtpPort)}
                    onChange={(e) => setEmailForm({ ...emailForm, smtpPort: Number(e.target.value) || 587 })}
                    className="text-xs"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-ink-600 mb-0.5">SMTP User</label>
                  <Input
                    placeholder="alex@domain.com"
                    value={emailForm.smtpUser}
                    onChange={(e) => setEmailForm({ ...emailForm, smtpUser: e.target.value })}
                    className="text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-ink-600 mb-0.5">SMTP Пароль (App Password)</label>
                  <Input
                    type="password"
                    placeholder="••••••••••••"
                    value={emailForm.smtpPassword}
                    onChange={(e) => setEmailForm({ ...emailForm, smtpPassword: e.target.value })}
                    className="text-xs font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {emailForm.provider !== 'SMTP' && emailForm.provider !== 'MOCK' && (
            <div>
              <label className="block text-xs font-bold text-ink-700 mb-1 uppercase tracking-wider">
                API Key ({emailForm.provider})
              </label>
              <Input
                type="password"
                placeholder="re_... / SG...."
                value={emailForm.apiKey}
                onChange={(e) => setEmailForm({ ...emailForm, apiKey: e.target.value })}
                className="text-xs font-mono"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-ink-700 mb-1 uppercase tracking-wider">
                Суточный лимит (Anti-Spam)
              </label>
              <Input
                type="number"
                value={String(emailForm.dailyMessageLimit)}
                onChange={(e) => setEmailForm({ ...emailForm, dailyMessageLimit: Number(e.target.value) || 50 })}
                min={1}
                max={500}
                className="text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-ink-700 mb-1 uppercase tracking-wider">
                Часовой лимит прогрева
              </label>
              <Input
                type="number"
                value={String(emailForm.hourlyMessageLimit)}
                onChange={(e) => setEmailForm({ ...emailForm, hourlyMessageLimit: Number(e.target.value) || 10 })}
                min={1}
                max={100}
                className="text-xs"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs font-medium text-ink-700 cursor-pointer p-2 rounded-xl bg-amber-50/50 border border-amber-100">
            <input
              type="checkbox"
              checked={emailForm.trackingEnabled}
              onChange={(e) => setEmailForm({ ...emailForm, trackingEnabled: e.target.checked })}
              className="rounded text-amber-600 focus:ring-amber-500"
            />
            <span>Включить трекинг открытий (1x1 Pixel) и кликов по ссылкам</span>
          </label>
        </form>
      </Modal>

      {/* Modal: Suppression List (Unsubscribed & Bounces) */}
      <Modal
        open={showSuppressionModal}
        onClose={() => setShowSuppressionModal(false)}
        title="Suppression List (Список отписок, отказов и жалоб на спам)"
        footer={
          <Button variant="secondary" onClick={() => setShowSuppressionModal(false)}>
            Закрыть
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="text-xs text-ink-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-ink-100">
            Адреса из этого списка <strong>никогда не получат исходящие письма</strong> от AI или менеджеров. Система автоматически блокирует отправку при обнаружении отписки по ссылке, в тексте письма, или при получении bounce-уведомления от почтового сервера.
          </div>

          <form onSubmit={handleAddSuppression} className="flex gap-2">
            <Input
              type="email"
              placeholder="Добавить email в черный список (напр. client@domain.com)"
              value={manualSuppEmail}
              onChange={(e) => setManualSuppEmail(e.target.value)}
              required
              className="text-xs flex-1"
            />
            <Button type="submit" size="sm" className="bg-amber-600 hover:bg-amber-700 text-white font-bold">
              Внести в базу
            </Button>
          </form>

          <div className="max-h-60 overflow-y-auto border border-ink-200 rounded-xl">
            {!suppressionItems || suppressionItems.length === 0 ? (
              <div className="p-8 text-center text-xs text-ink-400">
                Список чист — заблокированных адресов нет.
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-ink-50 border-b border-ink-200 font-bold text-ink-700">
                    <th className="p-2.5">Email</th>
                    <th className="p-2.5">Причина</th>
                    <th className="p-2.5">Дата блокировки</th>
                    <th className="p-2.5 text-right">Действие</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {suppressionItems.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="p-2.5 font-mono font-semibold text-ink-900">{s.email}</td>
                      <td className="p-2.5">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900">
                          {s.reason}
                        </span>
                        {s.bounceDetails && (
                          <span className="text-[10px] text-ink-400 block truncate max-w-[140px]" title={s.bounceDetails}>
                            {s.bounceDetails}
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 text-ink-500 text-[11px]">
                        {new Date(s.suppressedAt).toLocaleDateString('ru-RU')}
                      </td>
                      <td className="p-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => void handleRemoveSuppression(s.id, s.email)}
                          className="text-danger-500 hover:text-danger-700 text-xs font-semibold"
                        >
                          Разблокировать
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </Modal>

      {/* Modal: Confirm Delete Email Account */}
      <Confirm
        open={!!toDeleteEmail}
        onClose={() => setToDeleteEmail(null)}
        onConfirm={() => void confirmDeleteEmail()}
        busy={busyId === toDeleteEmail?.id}
        title="Удалить Email-аккаунт?"
        message={`Аккаунт «${toDeleteEmail?.emailAddress}» будет отключён от CRM.`}
      />
    </div>
  );
}
