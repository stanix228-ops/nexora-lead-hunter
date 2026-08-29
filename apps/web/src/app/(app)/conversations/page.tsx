'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Send,
  Search,
  RefreshCw,
  RotateCw,
  CheckCheck,
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
} from 'lucide-react';
import { get, post, patch } from '@/lib/api';
import type { Conversation, AccountSummary } from '@nexora/types';
import { AccountStatusBadge, statusRu } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { useSocket } from '@/lib/auth';

interface RowConversation extends Conversation {
  lead: {
    id: string;
    companyName: string | null;
    phone: string | null;
    whatsappUrl: string | null;
  };
  account: { id: string; name: string; phoneMasked: string };
}

interface Message {
  id: string;
  conversationId: string;
  direction: 'INBOUND' | 'OUTBOUND';
  body: string;
  provenance: 'TRACKED' | 'MANUAL' | 'UNAVAILABLE';
  recordedAt: Date | string;
}

interface Thread extends Conversation {
  lead: {
    id: string;
    companyName: string | null;
    phone: string | null;
    whatsappUrl: string | null;
  };
  account: { id: string; name: string; phoneMasked: string };
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
  };
}

const FILTER_TABS = [
  { value: 'ALL', label: 'Все', countKey: 'all' as const },
  { value: 'UNREAD', label: 'Непрочитанные', countKey: 'unread' as const, badgeColor: 'bg-emerald-500 text-white' },
  { value: 'REPLIED', label: 'Ответили', countKey: 'replied' as const, badgeColor: 'bg-sky-500 text-white' },
  { value: 'NEW', label: 'Новые', countKey: 'new' as const, badgeColor: 'bg-amber-500/20 text-amber-600' },
  { value: 'NO_RESPONSE', label: 'Нет ответа', countKey: 'noResponse' as const, badgeColor: 'bg-slate-200 text-slate-700' },
  { value: 'CLIENTS', label: 'Клиенты', countKey: 'clients' as const, badgeColor: 'bg-purple-500/20 text-purple-700' },
];

export default function ConversationsPage() {
  const { toast } = useToast();
  const socket = useSocket();
  const [items, setItems] = useState<RowConversation[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(40);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [filter, setFilter] = useState('ALL');
  const [account, setAccount] = useState('');
  const [search, setSearch] = useState('');
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [thread, setThread] = useState<Thread | null>(null);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newDialogAccount, setNewDialogAccount] = useState('');
  const [newDialogInput, setNewDialogInput] = useState('');
  const [creatingDialog, setCreatingDialog] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [counts, setCounts] = useState({
    all: 0,
    unread: 0,
    replied: 0,
    new: 0,
    noResponse: 0,
    clients: 0,
  });

  const threadRef = useRef<HTMLDivElement>(null);

  const handleSync = async () => {
    setSyncing(true);
    try {
      for (const acc of accounts) {
        await post(`/api/wa/${acc.id}/sync`).catch(() => undefined);
      }
      toast('Синхронизация чатов из WhatsApp запущена…', 'info');
      setTimeout(() => void load(), 2000);
    } catch (err) {
      toast((err as Error).message, 'danger');
    } finally {
      setTimeout(() => setSyncing(false), 1000);
    }
  };

  const load = useCallback(async () => {
    try {
      const q: Record<string, string | number> = { page, pageSize };
      if (filter !== 'ALL') q.filter = filter;
      if (account) q.account = account;
      if (search.trim()) q.search = search.trim();
      const res = await get<ConversationPaged>('/api/conversations', q);
      setItems(res.items || []);
      setTotal(res.total || 0);
      setTotalPages(res.totalPages || 1);
      if (res.counts) {
        setCounts(res.counts);
      }
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [page, pageSize, filter, account, search]);

  const openThread = useCallback(
    async (id: string) => {
      try {
        const res = await get<Thread>(`/api/conversations/${id}`);
        setThread(res);
        if (res.unreadCount > 0) {
          await patch(`/api/conversations/${id}`, { markRead: true });
          setItems((prev) =>
            prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c)),
          );
        }
      } catch (err) {
        toast((err as Error).message, 'danger');
      }
    },
    [toast],
  );

  useEffect(() => {
    void load();
    void get<{ items: AccountSummary[] }>('/api/accounts')
      .then((r) => {
        setAccounts(r.items || []);
        if (r.items?.[0] && !newDialogAccount) {
          setNewDialogAccount(r.items[0].id);
        }
      })
      .catch(() => setAccounts([]));
  }, [load, newDialogAccount]);

  const threadIdRef = useRef<string | null>(null);
  useEffect(() => {
    threadIdRef.current = thread?.id ?? null;
  }, [thread?.id]);

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
          .then((r) => setThread(r))
          .catch(() => undefined);
      }
    };

    socket.on('conversation.created', onConv);
    socket.on('conversation.updated', onMsg);
    socket.on('message.created', onMsg);

    return () => {
      socket.off('conversation.created', onConv);
      socket.off('conversation.updated', onMsg);
      socket.off('message.created', onMsg);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [socket, load]);

  useEffect(() => {
    if (thread && threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [thread]);

  const setStatus = async (conv: RowConversation, s: string) => {
    setBusyId(conv.id);
    try {
      await patch(`/api/conversations/${conv.id}`, { status: s });
      toast('Статус обновлён', 'success');
      await load();
      if (thread?.id === conv.id) await openThread(conv.id);
    } catch (err) {
      toast((err as Error).message, 'danger');
    } finally {
      setBusyId(null);
    }
  };

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
      toast((err as Error).message, 'danger');
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
    } catch (err) {
      toast((err as Error).message, 'danger');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-8.5rem)] gap-4 overflow-hidden">
      {/* Left List Column */}
      <div className="flex w-full flex-col gap-3 lg:w-[420px] lg:shrink-0 h-full overflow-hidden min-h-0">
        {/* Header bar */}
        <div className="flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-bold text-ink-900">Диалоги WhatsApp</h2>
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

        {/* List Card Container */}
        <div className="rounded-2xl border border-ink-200 bg-white shadow-card flex flex-col flex-1 min-h-0 overflow-hidden">
          {/* Search and Account Selector */}
          <div className="space-y-2 border-b border-ink-100 p-3 bg-slate-50 shrink-0">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
                <Input
                  placeholder="Поиск по компании или номеру…"
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
                className="w-40 rounded-xl border border-ink-200 bg-white px-2.5 py-1 text-xs text-ink-900 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="">Все аккаунты</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name || a.phoneMasked}
                  </option>
                ))}
              </select>
            </div>

            {/* Filter Tabs Pills */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
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
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                      isActive
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'bg-white text-ink-600 border border-ink-200 hover:bg-ink-50'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                        isActive
                          ? 'bg-emerald-700 text-white'
                          : tab.badgeColor || 'bg-ink-100 text-ink-700'
                      }`}
                    >
                      {tabCount}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Scrollable Conversation List */}
          <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-ink-100">
            {error ? (
              <div className="px-4 py-8 text-center text-xs text-red-600">{error}</div>
            ) : items.length === 0 ? (
              <div className="px-4 py-12 text-center text-sm text-ink-400 space-y-2">
                <Inbox size={32} className="mx-auto text-ink-300" />
                <p className="font-medium text-ink-600">В этой вкладке нет диалогов</p>
                <p className="text-xs text-ink-400 max-w-xs mx-auto">
                  {filter === 'ALL'
                    ? 'Добавьте лиды из парсера 2ГИС или откройте новый диалог.'
                    : `Нет сообщений со статусом «${FILTER_TABS.find((t) => t.value === filter)?.label}».`}
                </p>
                <Button size="sm" variant="secondary" onClick={() => setShowNewDialog(true)} className="text-xs mt-2">
                  + Начать диалог
                </Button>
              </div>
            ) : (
              items.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => void openThread(conv.id)}
                  className={
                    'w-full px-4 py-3 text-left transition-colors hover:bg-emerald-50/50 ' +
                    (thread?.id === conv.id ? 'bg-emerald-50 border-l-4 border-emerald-600' : '')
                  }
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-ink-900">
                        {conv.lead?.companyName ?? conv.lead?.phone ?? 'Лид'}
                      </div>
                      <div className="truncate text-[11px] text-ink-500 flex items-center gap-1.5 mt-0.5">
                        <span className="font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                          {conv.account?.name || conv.account?.phoneMasked}
                        </span>
                        {conv.lead?.phone && <span>· {conv.lead.phone}</span>}
                      </div>
                    </div>

                    {conv.unreadCount > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-[10px] font-bold text-white shadow-sm animate-pulse">
                        {conv.unreadCount}
                      </span>
                    )}
                  </div>

                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-ink-600 font-medium">
                      {conv.lastMessagePreview ?? (
                        <span className="text-ink-400 italic">Диалог создан (напишите первым)</span>
                      )}
                    </span>
                    <span className="shrink-0 rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-bold text-ink-600 border border-ink-200">
                      {statusRu(conv.status)}
                    </span>
                  </div>
                </button>
              ))
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

      {/* Main Chat Thread Pane */}
      <div className="hidden min-w-0 flex-1 flex-col rounded-2xl border border-ink-200 bg-white shadow-card lg:flex overflow-hidden h-full">
        {!thread ? (
          <div className="flex flex-1 flex-col items-center justify-center text-sm text-ink-400 gap-3 p-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200 shadow-sm">
              <MessageSquarePlus size={32} />
            </div>
            <div>
              <p className="font-bold text-base text-ink-900">Выберите диалог из списка слева</p>
              <p className="text-xs text-ink-500 mt-1 max-w-sm">
                Вы можете переписываться от имени любого подключенного номера WhatsApp, менять статусы и фильтровать чаты.
              </p>
            </div>
            <Button
              size="sm"
              variant="primary"
              onClick={() => setShowNewDialog(true)}
              className="text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 font-semibold"
            >
              <Plus size={14} /> Открыть новый диалог
            </Button>
          </div>
        ) : (
          <>
            {/* Thread Header */}
            <div className="flex items-center justify-between gap-3 border-b border-ink-100 px-5 py-3.5 bg-slate-50 shrink-0">
              <div>
                <div className="text-base font-bold text-ink-900 flex items-center gap-2">
                  {thread.lead?.companyName ?? thread.lead?.phone ?? 'Лид'}
                </div>
                <div className="text-xs text-ink-500 flex items-center gap-2 mt-0.5">
                  <span>
                    Аккаунт: <strong className="text-emerald-700">{thread.account?.name}</strong>
                  </span>
                  {thread.lead?.phone && (
                    <span>
                      · Тел: <strong>{thread.lead.phone}</strong>
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-ink-500 font-medium">Статус:</span>
                <select
                  value={thread.status}
                  onChange={(e) => void setStatus(thread as unknown as RowConversation, e.target.value)}
                  className="rounded-lg border border-ink-300 bg-white px-2.5 py-1 text-xs text-ink-900 font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                >
                  {['NEW', 'UNREAD', 'REPLIED', 'INTERESTED', 'NEGOTIATION', 'CLIENT', 'NO_RESPONSE'].map((s) => (
                    <option key={s} value={s}>
                      {statusRu(s)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Messages Area */}
            <div ref={threadRef} className="flex-1 space-y-2.5 overflow-y-auto bg-slate-100/60 p-5">
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
                      <p className="whitespace-pre-wrap break-words leading-relaxed">{m.body}</p>
                      <div
                        className={
                          'mt-1 flex items-center justify-end gap-1 text-[9px] ' +
                          (isOut ? 'text-emerald-100' : 'text-ink-400')
                        }
                      >
                        <span>
                          {new Date(m.recordedAt).toLocaleTimeString('ru-RU', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        {isOut && <CheckCheck size={12} className="text-emerald-200" />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Message Input */}
            <form onSubmit={sendMessage} className="flex items-center gap-2 border-t border-ink-100 bg-white p-3 shrink-0">
              <Input
                placeholder="Введите сообщение в WhatsApp…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="flex-1 text-xs h-10 border-ink-200"
              />
              <Button
                type="submit"
                size="sm"
                loading={sending}
                disabled={!draft.trim()}
                className="h-10 px-4 bg-emerald-600 hover:bg-emerald-700 font-semibold"
              >
                <Send size={15} />
              </Button>
            </form>
          </>
        )}
      </div>

      {/* Modal: New Dialog */}
      {showNewDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-ink-100 pb-3">
              <h3 className="text-base font-bold text-ink-900 flex items-center gap-2">
                <MessageSquarePlus size={18} className="text-emerald-600" />
                Новый диалог WhatsApp
              </h3>
              <button
                type="button"
                onClick={() => setShowNewDialog(false)}
                className="text-ink-400 hover:text-ink-700"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateNewDialog} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-ink-700 mb-1">
                  Аккаунт-отправитель
                </label>
                <select
                  value={newDialogAccount}
                  onChange={(e) => setNewDialogAccount(e.target.value)}
                  className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.phoneMasked || 'Без номера'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-ink-700 mb-1">
                  Номер телефона или ссылка WhatsApp
                </label>
                <Input
                  placeholder="+7 (705) 123-45-67 или https://wa.me/77051234567"
                  value={newDialogInput}
                  onChange={(e) => setNewDialogInput(e.target.value)}
                  autoFocus
                />
                <p className="mt-1.5 text-[11px] text-ink-500">
                  Вставьте номер телефона или ссылку wa.me для перехода к диалогу.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-ink-100">
                <Button variant="secondary" type="button" onClick={() => setShowNewDialog(false)}>
                  Отмена
                </Button>
                <Button
                  type="submit"
                  loading={creatingDialog}
                  disabled={!newDialogInput.trim() || !newDialogAccount}
                  className="bg-emerald-600 hover:bg-emerald-700 font-semibold"
                >
                  Открыть чат
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
