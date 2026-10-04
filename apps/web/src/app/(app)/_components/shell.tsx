'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import clsx from 'clsx';
import {
  LayoutDashboard,
  Smartphone,
  Users,
  Megaphone,
  MessagesSquare,
  Upload,
  BarChart3,
  ShieldAlert,
  RadioTower,
  LogOut,
  Menu,
  X,
  Volume2,
  VolumeX,
  Bell,
  Globe,
  Flame,
  Bot,
  Sparkles,
  Briefcase,
  Crosshair,
  Zap,
} from 'lucide-react';
import { useAuth, useSocket } from '@/lib/auth';
import { useToast } from '@/components/ui/toast';
import { get, post } from '@/lib/api';
import {
  playMessageSound,
  showDesktopNotification,
  requestNotificationPermission,
} from '@/lib/notifications';

const NAV = [
  { href: '/', label: 'Дашборд', icon: LayoutDashboard },
  { href: '/autopilot', label: 'Автопилот Продаж', icon: Zap, isAi: true, isHot: true },
  { href: '/hunter', label: 'Lead Hunter', icon: Crosshair, isAi: true, isHot: true },
  { href: '/ai-agent', label: 'AI Sales Agent', icon: Bot, isAi: true },
  { href: '/crm', label: 'CRM & Память AI', icon: Briefcase, isAi: true },
  { href: '/parser', label: 'Парсер Лидов', icon: Globe, isHot: true },
  { href: '/conversations', label: 'Диалоги', icon: MessagesSquare, badgeKey: 'conversations' },
  { href: '/accounts', label: 'Аккаунты WhatsApp', icon: Smartphone },
  { href: '/multiview', label: 'Трансляция', icon: RadioTower, badgeKey: 'multiview' },
  { href: '/leads', label: 'База Лидов', icon: Users },
  { href: '/campaigns', label: 'Кампании', icon: Megaphone },
  { href: '/import', label: 'Импорт контактов', icon: Upload },
  { href: '/analytics', label: 'Аналитика', icon: BarChart3 },
  { href: '/risk', label: 'Риски и Лимиты', icon: ShieldAlert },
];

function ShellInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const socket = useSocket();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [aiMode, setAiMode] = useState<'OFF' | 'AUTONOMOUS' | 'COPILOT'>('OFF');
  const [togglingAi, setTogglingAi] = useState(false);

  // Load unread count on startup
  const loadUnread = useCallback(async () => {
    try {
      const res = await get<{ total: number }>('/api/conversations', { filter: 'UNREAD', pageSize: 1 });
      setUnreadCount(res.total || 0);
    } catch {
      /* ignore */
    }
  }, []);

  // Load global AI mode on startup
  const loadAiConfig = useCallback(async () => {
    try {
      const res = await get<{ mode?: 'OFF' | 'AUTONOMOUS' | 'COPILOT' }>('/api/ai/config');
      if (res?.mode) {
        setAiMode(res.mode);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadUnread();
    void loadAiConfig();
  }, [loadUnread, loadAiConfig]);

  const toggleGlobalAi = async () => {
    try {
      setTogglingAi(true);
      const nextMode = aiMode === 'OFF' ? 'AUTONOMOUS' : 'OFF';
      const res = await post<{ ok: boolean; mode: 'OFF' | 'AUTONOMOUS' | 'COPILOT'; message: string }>(
        '/api/ai/master-toggle',
        { mode: nextMode },
      );
      if (res?.ok) {
        setAiMode(res.mode);
        toast(
          res.mode === 'OFF'
            ? '⏸️ ИИ агент полностью остановлен! Включен ручной режим (как прежде).'
            : '⚡ ИИ агент активирован! Включен авто-режим.',
          res.mode === 'OFF' ? 'info' : 'success',
        );
      }
    } catch (err) {
      toast((err as Error).message || 'Не удалось переключить режим AI', 'danger');
    } finally {
      setTogglingAi(false);
    }
  };

  // Request browser notification permission once
  useEffect(() => {
    requestNotificationPermission();
  }, []);

  // Global socket listener for new messages & notifications
  useEffect(() => {
    if (!socket) return;

    const onMessage = (msg: {
      id?: string;
      direction?: 'INBOUND' | 'OUTBOUND';
      body?: string;
      lead?: { companyName?: string | null; phone?: string | null };
      account?: { name?: string };
    }) => {
      void loadUnread();

      if (msg.direction === 'INBOUND') {
        const sender = msg.lead?.companyName || msg.lead?.phone || 'Клиент WhatsApp';
        const preview = msg.body ? (msg.body.length > 80 ? msg.body.slice(0, 80) + '…' : msg.body) : 'Новое сообщение';

        if (soundEnabled) {
          playMessageSound();
        }

        showDesktopNotification(`WhatsApp: ${sender}`, preview);
        toast(`📩 ${sender}: ${preview}`, 'success');
      }
    };

    const onConvUpdated = () => {
      void loadUnread();
    };

    const onHotLeadAlert = (data: { reason?: string }) => {
      if (soundEnabled) playMessageSound();
      showDesktopNotification('🔥 Горячий лид!', data.reason || 'Клиент готов к заключению сделки');
      toast(`🔥 Внимание! Горячий лид: ${data.reason || 'Требуется участие менеджера'}`, 'success');
      void loadUnread();
    };

    const onMasterModeChanged = (data: { mode: 'OFF' | 'AUTONOMOUS' | 'COPILOT' }) => {
      if (data?.mode) setAiMode(data.mode);
    };

    socket.on('message.created', onMessage);
    socket.on('conversation.updated', onConvUpdated);
    socket.on('conversation.created', onConvUpdated);
    socket.on('ai.hot_lead_alert', onHotLeadAlert);
    socket.on('ai.master_mode_changed', onMasterModeChanged);

    return () => {
      socket.off('message.created', onMessage);
      socket.off('conversation.updated', onConvUpdated);
      socket.off('conversation.created', onConvUpdated);
      socket.off('ai.hot_lead_alert', onHotLeadAlert);
      socket.off('ai.master_mode_changed', onMasterModeChanged);
    };
  }, [socket, soundEnabled, toast, loadUnread]);

  const nav = (
    <nav className="flex flex-1 flex-col gap-1 px-3">
      {NAV.map((item) => {
        const active = pathname === item.href;
        const showBadge = (item.badgeKey === 'conversations' || item.badgeKey === 'multiview') && unreadCount > 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            className={clsx(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors relative',
              active
                ? 'bg-brand-50 text-brand-700'
                : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
            )}
          >
            <item.icon size={18} className={active ? 'text-brand-600' : 'text-ink-400'} />
            <span className="flex-1 truncate">{item.label}</span>
            {item.isAi && !showBadge && (
              aiMode === 'OFF' ? (
                <span className="flex items-center gap-0.5 rounded-full bg-amber-100 text-amber-800 px-1.5 py-0.5 text-[9px] font-semibold border border-amber-200">
                  ⏸️ ВЫКЛ
                </span>
              ) : (
                <span className="flex items-center gap-0.5 rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-1.5 py-0.5 text-[9px] font-black shadow-xs animate-pulse">
                  ⚡ AUTO
                </span>
              )
            )}
            {item.isHot && !showBadge && (
              <span className="flex items-center gap-0.5 rounded-full bg-emerald-100 text-emerald-800 px-1.5 py-0.2 text-[9px] font-black border border-emerald-300">
                🔥 СНГ/USA
              </span>
            )}
            {showBadge && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-bold text-white shadow-sm animate-pulse">
                {unreadCount}
              </span>
            )}
            {active && !showBadge && !item.isHot && !item.isAi && <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />}
          </Link>
        );
      })}
    </nav>
  );

  const sidebar = (
    <div className="flex h-full flex-col border-r border-ink-100 bg-white">
      <div className="flex items-center gap-2.5 px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm">
          <MessagesSquare size={18} />
        </div>
        <div>
          <div className="text-sm font-bold text-ink-900">Nexora</div>
          <div className="text-[10px] uppercase tracking-wider text-emerald-600 font-semibold">WhatsApp Hub</div>
        </div>
      </div>
      {nav}
      <div className="border-t border-ink-100 p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2 bg-ink-50/50">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
            {user?.email?.charAt(0).toUpperCase() ?? '?'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold text-ink-800">{user?.email}</div>
            <div className="text-[10px] text-ink-400">{user?.name ?? 'Пользователь'}</div>
          </div>
          <button
            onClick={() => void logout()}
            title="Выйти"
            className="rounded-md p-1.5 text-ink-400 hover:bg-ink-100 hover:text-danger-500"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 md:block">{sidebar}</aside>
      {/* Mobile sidebar */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-ink-900/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 shadow-pop">
            {sidebar}
            <button
              onClick={() => setOpen(false)}
              className="absolute right-3 top-4 rounded-md p-1 text-ink-400 hover:bg-ink-100"
            >
              <X size={18} />
            </button>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-ink-100 bg-white px-4 md:px-6 shadow-xs">
          <button className="rounded-md p-1.5 text-ink-500 hover:bg-ink-100 md:hidden" onClick={() => setOpen(true)}>
            <Menu size={20} />
          </button>
          <div className="text-sm font-bold text-ink-800">
            {NAV.find((n) => n.href === pathname)?.label ?? 'Nexora'}
          </div>
          <div className="ml-auto flex items-center gap-2.5">
            {/* Global Master AI Toggle */}
            <button
              onClick={() => void toggleGlobalAi()}
              disabled={togglingAi}
              className={clsx(
                'flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold border transition-all shadow-2xs cursor-pointer',
                aiMode === 'OFF'
                  ? 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
                  : 'border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100',
              )}
              title={
                aiMode === 'OFF'
                  ? 'ИИ агент полностью остановлен. Сайт работает в обычном ручном режиме. Нажмите, чтобы включить.'
                  : 'ИИ агент активен. Нажмите, чтобы полностью остановить бота и вернуть ручной режим.'
              }
            >
              <Bot size={14} className={aiMode === 'OFF' ? 'text-amber-600' : 'text-emerald-600 animate-pulse'} />
              <span className="hidden sm:inline-flex items-center gap-1.5">
                <span className={clsx('h-2 w-2 rounded-full', aiMode === 'OFF' ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse')} />
                <span>ИИ Агент: <strong>{aiMode === 'OFF' ? 'ВЫКЛЮЧЕН (Ручной режим)' : 'АКТИВЕН'}</strong></span>
              </span>
              <span className="sm:hidden text-[11px] font-bold">
                {aiMode === 'OFF' ? '⏸️ AI ВЫКЛ' : '⚡ AI ВКЛ'}
              </span>
            </button>

            {/* Sound toggle button */}
            <button
              onClick={() => {
                const next = !soundEnabled;
                setSoundEnabled(next);
                if (next) playMessageSound();
                toast(next ? 'Звук уведомлений включён' : 'Звук уведомлений выключен', 'info');
              }}
              title={soundEnabled ? 'Звук уведомлений включён' : 'Звук уведомлений выключен'}
              className={clsx(
                'flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium border transition-colors',
                soundEnabled
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-ink-200 bg-ink-50 text-ink-500',
              )}
            >
              {soundEnabled ? <Volume2 size={14} className="text-emerald-600" /> : <VolumeX size={14} />}
              <span className="hidden sm:inline">{soundEnabled ? 'Звук вкл' : 'Звук выкл'}</span>
            </button>

            {/* Live API badge */}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Онлайн
            </span>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  return <ShellInner>{children}</ShellInner>;
}
