'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  RefreshCw,
  Send,
  CheckCheck,
  Plus,
  Search,
  MessageSquarePlus,
  ChevronDown,
  ChevronUp,
  User,
  X,
  Phone,
  LayoutGrid,
  RotateCw,
  CheckCircle2,
} from 'lucide-react';
import { get, post, patch } from '@/lib/api';
import type { AccountSummary } from '@nexora/types';
import { useSocket } from '@/lib/auth';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/form';

interface RowConversation {
  id: string;
  status: string;
  unreadCount: number;
  lastMessagePreview: string | null;
  lastMessageAt: Date | string | null;
  lead: { id: string; companyName: string | null; phone: string | null };
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

interface Thread extends RowConversation {
  messages: Message[];
}

interface ConversationPaged {
  items: RowConversation[];
  total: number;
  page: number;
  totalPages: number;
}

const GATEWAY_LABELS: Record<string, string> = {
  CONNECTED: 'В онлайне',
  SCANNING: 'Сканирование',
  DISCONNECTED: 'Не подключён',
  FAILED: 'Ошибка',
};

function formatTime(d: Date | string | null): string {
  if (!d) return '';
  const date = new Date(d);
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function formatDateHeader(d: Date | string | null): string {
  if (!d) return '';
  const date = new Date(d);
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function AccountChatPane({
  account,
  socket,
  toast,
}: {
  account: AccountSummary;
  socket: ReturnType<typeof useSocket>;
  toast: ReturnType<typeof useToast>['toast'];
}) {
  const [items, setItems] = useState<RowConversation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [thread, setThread] = useState<Thread | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newPhoneInput, setNewPhoneInput] = useState('');
  const [creatingDialog, setCreatingDialog] = useState(false);
  const [collapsedList, setCollapsedList] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    try {
      const res = await get<ConversationPaged>('/api/conversations', {
        account: account.id,
        page: 1,
        pageSize: 100,
        search: search.trim() || undefined,
      });
      setItems(res.items);
      setLoaded(true);
      return res.items;
    } catch {
      setLoaded(true);
      return [] as RowConversation[];
    }
  }, [account.id, search]);

  const openThread = useCallback(async (id: string) => {
    try {
      const res = await get<Thread>(`/api/conversations/${id}`);
      setThread(res);
      if (res.unreadCount > 0) {
        await patch(`/api/conversations/${id}`, { markRead: true });
        setItems((prev) =>
          prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c)),
        );
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Initial load
  useEffect(() => {
    void loadConversations().then((list) => {
      if (list[0] && !thread?.id) void openThread(list[0].id);
    });
  }, [loadConversations]);

  // Realtime updates via Socket.IO
  useEffect(() => {
    if (!socket) return;

    const onMessage = (payload: { conversationId?: string; account?: { id?: string }; conversation?: { accountId?: string } }) => {
      const accId = payload.account?.id || payload.conversation?.accountId;
      if (accId && accId !== account.id) return;

      void loadConversations().then((list) => {
        if (payload.conversationId && (threadRef.current?.dataset.threadId === payload.conversationId || !threadRef.current?.dataset.threadId)) {
          void openThread(payload.conversationId);
        } else if (!thread && list[0]) {
          void openThread(list[0].id);
        }
      });
    };

    const onConv = (payload: { id?: string; accountId?: string; account?: { id?: string } }) => {
      const accId = payload.accountId ?? payload.account?.id;
      if (accId && accId !== account.id) return;
      void loadConversations();
      if (payload.id && thread?.id === payload.id) {
        void get<Thread>(`/api/conversations/${payload.id}`).then((r) => setThread(r));
      }
    };

    socket.on('message.created', onMessage);
    socket.on('conversation.updated', onConv);
    socket.on('conversation.created', onConv);

    return () => {
      socket.off('message.created', onMessage);
      socket.off('conversation.updated', onConv);
      socket.off('conversation.created', onConv);
    };
  }, [socket, account.id, thread?.id, loadConversations, openThread, thread]);

  // Auto-scroll when messages update
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [thread?.messages.length]);

  const handleSyncChats = async () => {
    setSyncing(true);
    try {
      await post(`/api/wa/${account.id}/sync`);
      toast('Синхронизация чатов из WhatsApp запущена…', 'info');
      setTimeout(() => void loadConversations(), 2000);
    } catch (err) {
      toast((err as Error).message, 'danger');
    } finally {
      setTimeout(() => setSyncing(false), 1000);
    }
  };

  const handleStartNewDialog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPhoneInput.trim()) return;
    setCreatingDialog(true);
    try {
      const created = await post<Thread>('/api/conversations/open-by-phone', {
        accountId: account.id,
        input: newPhoneInput.trim(),
      });
      toast('Диалог открыт', 'success');
      setNewPhoneInput('');
      setShowNewDialog(false);
      await loadConversations();
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
        await loadConversations();
      } catch (err) {
        const e = err as { code?: string };
        if (e.code === 'GATEWAY_NOT_CONNECTED' || e.code === 'LEAD_NO_PHONE') {
          const res = await post<{ message: Message; conversation: Thread }>('/api/messages', {
            conversationId: thread.id,
            direction: 'OUTBOUND',
            body,
            provenance: 'MANUAL',
          });
          setThread(res.conversation);
          setDraft('');
          await loadConversations();
          toast(
            e.code === 'LEAD_NO_PHONE'
              ? 'У лида нет номера'
              : 'Аккаунт не подключён к WhatsApp — сохранено локально',
            'info',
          );
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

  const connected = account.gatewayStatus === 'CONNECTED';
  const connecting = account.gatewayStatus === 'SCANNING';
  const failed = account.gatewayStatus === 'FAILED';
  const selected = thread?.id ?? null;

  return (
    <div className="flex h-[680px] flex-col overflow-hidden rounded-2xl border border-ink-200/80 bg-white shadow-card transition-all hover:shadow-pop">
      {/* Pane Header */}
      <div className="border-b border-ink-100 bg-ink-50/50 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-bold text-ink-900">{account.name}</span>
            </div>
            <div className="text-[11px] text-ink-500">{account.phoneMasked || 'Без номера'}</div>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={
                'inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ' +
                (connected
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : connecting
                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                    : failed
                      ? 'bg-red-50 text-red-600 border border-red-200'
                      : 'bg-ink-100 text-ink-500 border border-ink-200')
              }
            >
              <span
                className={
                  'h-1.5 w-1.5 rounded-full ' +
                  (connected
                    ? 'bg-emerald-500 animate-pulse'
                    : connecting
                      ? 'bg-amber-500'
                      : 'bg-ink-400')
                }
              />
              {GATEWAY_LABELS[account.gatewayStatus ?? 'DISCONNECTED']}
            </span>

            {connected && (
              <button
                type="button"
                onClick={() => void handleSyncChats()}
                disabled={syncing}
                title="Синхронизировать чаты из WhatsApp"
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-ink-200 bg-white text-ink-500 hover:bg-ink-50 hover:text-ink-800 disabled:opacity-50"
              >
                <RotateCw size={13} className={syncing ? 'animate-spin text-emerald-600' : ''} />
              </button>
            )}

            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowNewDialog((prev) => !prev)}
              className="h-7 px-2 text-xs"
              title="Открыть новый диалог по номеру или ссылке"
            >
              <Plus size={13} />
              Чат
            </Button>
          </div>
        </div>

        {/* New Dialog Expandable Bar */}
        {showNewDialog && (
          <form
            onSubmit={handleStartNewDialog}
            className="mt-2.5 rounded-xl border border-brand-200 bg-brand-50/70 p-2.5 space-y-2 animate-fadeIn"
          >
            <div className="flex items-center justify-between text-xs font-semibold text-brand-900">
              <span className="flex items-center gap-1">
                <MessageSquarePlus size={14} className="text-brand-600" />
                Новый диалог в «{account.name}»
              </span>
              <button
                type="button"
                onClick={() => setShowNewDialog(false)}
                className="text-ink-400 hover:text-ink-700"
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex gap-1.5">
              <Input
                placeholder="Номер (+7 705...) или ссылка wa.me/..."
                value={newPhoneInput}
                onChange={(e) => setNewPhoneInput(e.target.value)}
                className="h-8 text-xs flex-1 bg-white"
                autoFocus
              />
              <Button type="submit" size="sm" loading={creatingDialog} disabled={!newPhoneInput.trim()} className="h-8 px-3 text-xs">
                Открыть
              </Button>
            </div>
          </form>
        )}
      </div>

      {/* Conversations Search & Accordion Bar */}
      <div className="flex items-center justify-between border-b border-ink-100 bg-white px-3 py-1.5">
        <div className="relative flex-1 mr-2">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-300" />
          <input
            type="text"
            placeholder="Поиск по диалогам…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 w-full rounded-md bg-ink-50 pl-7 pr-2 text-xs text-ink-800 placeholder-ink-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <button
          type="button"
          onClick={() => setCollapsedList((prev) => !prev)}
          className="flex items-center gap-1 text-[11px] font-medium text-ink-500 hover:text-ink-800"
          title="Свернуть/развернуть список диалогов"
        >
          <span>{items.length} диалогов</span>
          {collapsedList ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
        </button>
      </div>

      {/* Conversations Selector List */}
      {!collapsedList && (
        <div className="max-h-36 shrink-0 overflow-y-auto border-b border-ink-100 bg-ink-50/30 divide-y divide-ink-50">
          {!loaded ? (
            <div className="px-4 py-3 text-center text-xs text-ink-400">Загрузка диалогов…</div>
          ) : !items.length ? (
            <div className="px-4 py-4 text-center text-xs text-ink-400 space-y-1.5">
              <p>Диалогов пока нет в списке.</p>
              <div className="flex justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewDialog(true)}
                  className="text-xs text-brand-600 hover:underline font-medium"
                >
                  + Открыть по номеру
                </button>
                {connected && (
                  <button
                    type="button"
                    onClick={() => void handleSyncChats()}
                    className="text-xs text-emerald-600 hover:underline font-medium"
                  >
                    · Синхронизировать из WhatsApp
                  </button>
                )}
              </div>
            </div>
          ) : (
            items.map((conv) => (
              <button
                key={conv.id}
                onClick={() => void openThread(conv.id)}
                className={
                  'flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-white ' +
                  (selected === conv.id ? 'bg-brand-50/80 border-l-2 border-brand-600' : '')
                }
              >
                <div className="min-w-0 flex items-center gap-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-600 text-xs font-semibold">
                    {conv.lead?.companyName?.[0]?.toUpperCase() ?? <User size={12} />}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold text-ink-800">
                      {conv.lead?.companyName ?? conv.lead?.phone ?? 'Лид'}
                    </div>
                    <div className="truncate text-[10px] text-ink-400">
                      {conv.lastMessagePreview ?? 'Нет сообщений'}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {conv.unreadCount > 0 && (
                    <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-600 px-1 text-[9px] font-bold text-white shadow-xs">
                      {conv.unreadCount}
                    </span>
                  )}
                  <span className="text-[9px] text-ink-400">{formatTime(conv.lastMessageAt)}</span>
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {/* Active Conversation Header */}
      {thread && (
        <div className="flex items-center justify-between border-b border-ink-100 bg-ink-50/60 px-3.5 py-2">
          <div className="min-w-0">
            <div className="text-xs font-bold text-ink-900 truncate">
              {thread.lead?.companyName ?? thread.lead?.phone ?? 'Диалог'}
            </div>
            <div className="text-[10px] text-ink-500 flex items-center gap-1">
              <Phone size={10} />
              {thread.lead?.phone || 'Без номера'}
            </div>
          </div>
          <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[9px] font-medium text-ink-600">
            {thread.messages.length} сообщ.
          </span>
        </div>
      )}

      {/* Messages Thread */}
      <div
        ref={threadRef}
        data-thread-id={thread?.id}
        className="flex-1 space-y-2 overflow-y-auto bg-slate-50/70 p-3.5"
      >
        {!thread ? (
          <div className="flex h-full flex-col items-center justify-center text-center p-4 text-ink-400 gap-2">
            <MessageSquarePlus size={28} className="text-ink-300" />
            <p className="text-xs font-medium text-ink-600">Выберите диалог или начните новый</p>
            <Button size="sm" variant="secondary" onClick={() => setShowNewDialog(true)} className="text-xs">
              + Вставить номер или ссылку
            </Button>
          </div>
        ) : thread.messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center p-4 text-ink-400 gap-1">
            <p className="text-xs font-medium text-ink-700">Диалог открыт</p>
            <p className="text-[11px]">Напишите сообщение ниже, чтобы отправить его через WhatsApp.</p>
          </div>
        ) : (
          thread.messages.map((m, idx) => {
            const isOut = m.direction === 'OUTBOUND';
            const prevMsg = thread.messages[idx - 1];
            const showDateHeader =
              !prevMsg ||
              new Date(prevMsg.recordedAt).toDateString() !== new Date(m.recordedAt).toDateString();

            return (
              <div key={m.id} className="space-y-1">
                {showDateHeader && (
                  <div className="my-2 text-center">
                    <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[9px] font-medium text-ink-500">
                      {formatDateHeader(m.recordedAt)}
                    </span>
                  </div>
                )}
                <div className={'flex ' + (isOut ? 'justify-end' : 'justify-start')}>
                  <div
                    className={
                      'max-w-[85%] rounded-2xl px-3.5 py-2 text-xs shadow-sm transition ' +
                      (isOut
                        ? 'rounded-br-sm bg-emerald-600 text-white'
                        : 'rounded-bl-sm bg-white text-ink-800 border border-ink-100')
                    }
                  >
                    <p className="whitespace-pre-wrap break-words leading-relaxed">{m.body}</p>
                    <div
                      className={
                        'mt-1 flex items-center justify-end gap-1 text-[9px] ' +
                        (isOut ? 'text-emerald-100' : 'text-ink-400')
                      }
                    >
                      <span>{formatTime(m.recordedAt)}</span>
                      {isOut && <CheckCheck size={12} className="text-emerald-200" />}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Composer Input */}
      <form onSubmit={sendMessage} className="flex items-center gap-2 border-t border-ink-100 bg-white p-2.5">
        <Input
          placeholder={thread ? 'Введите сообщение…' : 'Сначала выберите диалог…'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="flex-1 text-xs h-9"
          disabled={!thread}
        />
        <Button
          type="submit"
          size="sm"
          loading={sending}
          disabled={!thread || !draft.trim()}
          className="h-9 px-3 bg-emerald-600 hover:bg-emerald-700"
        >
          <Send size={13} />
        </Button>
      </form>
    </div>
  );
}

export default function MultiviewPage() {
  const { toast } = useToast();
  const socket = useSocket();
  const [accounts, setAccounts] = useState<AccountSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filterOnline, setFilterOnline] = useState(false);
  const [quickDialogOpen, setQuickDialogOpen] = useState(false);
  const [quickAccountId, setQuickAccountId] = useState('');
  const [quickPhoneInput, setQuickPhoneInput] = useState('');
  const [quickSending, setQuickSending] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await get<{ items: AccountSummary[] }>('/api/accounts');
      setAccounts(res.items);
      if (res.items[0] && !quickAccountId) {
        setQuickAccountId(res.items[0].id);
      }
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [quickAccountId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Realtime updates for account status
  useEffect(() => {
    if (!socket) return;
    const onStatus = (payload: { accountId: string; status: string }) => {
      setAccounts((prev) =>
        prev
          ? prev.map((a) => (a.id === payload.accountId ? { ...a, gatewayStatus: payload.status } : a))
          : prev,
      );
    };
    socket.on('account.gateway.status', onStatus);
    return () => {
      socket.off('account.gateway.status', onStatus);
    };
  }, [socket]);

  const handleGlobalSync = async () => {
    setSyncingAll(true);
    try {
      for (const acc of accounts ?? []) {
        if (acc.gatewayStatus === 'CONNECTED') {
          await post(`/api/wa/${acc.id}/sync`).catch(() => undefined);
        }
      }
      toast('Синхронизация WhatsApp запущена для всех подключённых аккаунтов', 'success');
      setTimeout(() => void load(), 2000);
    } catch (err) {
      toast((err as Error).message, 'danger');
    } finally {
      setTimeout(() => setSyncingAll(false), 1000);
    }
  };

  const handleGlobalNewDialog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickAccountId || !quickPhoneInput.trim()) return;
    setQuickSending(true);
    try {
      await post('/api/conversations/open-by-phone', {
        accountId: quickAccountId,
        input: quickPhoneInput.trim(),
      });
      toast('Новый диалог успешно открыт!', 'success');
      setQuickPhoneInput('');
      setQuickDialogOpen(false);
      await load();
    } catch (err) {
      toast((err as Error).message, 'danger');
    } finally {
      setQuickSending(false);
    }
  };

  const visibleAccounts = (accounts ?? []).filter((a) =>
    filterOnline ? a.gatewayStatus === 'CONNECTED' : true,
  );
  const connectedCount = accounts?.filter((a) => a.gatewayStatus === 'CONNECTED').length ?? 0;

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-ink-900 flex items-center gap-2">
            <LayoutGrid size={22} className="text-emerald-600" />
            Транслятор WhatsApp
          </h2>
          <p className="text-xs text-ink-500">
            Мультипросмотр и общение со всех WhatsApp-аккаунтов одновременно · {connectedCount} из{' '}
            {accounts?.length ?? 0} онлайн
          </p>
        </div>

        <div className="flex items-center gap-2">
          {connectedCount > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleGlobalSync()}
              disabled={syncingAll}
              className="text-xs"
              title="Загрузить все контакты и историю чатов из подключённых WhatsApp"
            >
              <RotateCw size={13} className={syncingAll ? 'animate-spin text-emerald-600' : ''} />
              Синхронизировать чаты
            </Button>
          )}

          <Button
            variant="secondary"
            size="sm"
            onClick={() => setFilterOnline((prev) => !prev)}
            className={filterOnline ? 'border-emerald-500 text-emerald-700 bg-emerald-50' : ''}
          >
            {filterOnline ? 'Показаны только онлайн' : 'Все аккаунты'}
          </Button>

          <Button
            size="sm"
            onClick={() => setQuickDialogOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <MessageSquarePlus size={14} />
            Открыть диалог по ссылке / номеру
          </Button>

          <Button variant="secondary" size="sm" onClick={() => void load()}>
            <RefreshCw size={14} />
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-600">{error}</div>
      )}

      {/* Modal: Quick Start Dialog */}
      {quickDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-fadeIn">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-pop space-y-4">
            <div className="flex items-center justify-between border-b border-ink-100 pb-3">
              <h3 className="text-base font-bold text-ink-900 flex items-center gap-2">
                <MessageSquarePlus size={18} className="text-emerald-600" />
                Открыть диалог WhatsApp
              </h3>
              <button
                type="button"
                onClick={() => setQuickDialogOpen(false)}
                className="text-ink-400 hover:text-ink-700"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleGlobalNewDialog} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1">
                  Выберите аккаунт WhatsApp
                </label>
                <select
                  value={quickAccountId}
                  onChange={(e) => setQuickAccountId(e.target.value)}
                  className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {(accounts ?? []).map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.phoneMasked || 'Без номера'}) —{' '}
                      {GATEWAY_LABELS[acc.gatewayStatus ?? 'DISCONNECTED']}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1">
                  Номер телефона или ссылка WhatsApp
                </label>
                <Input
                  placeholder="+7 (705) 123-45-67 или https://wa.me/77051234567"
                  value={quickPhoneInput}
                  onChange={(e) => setQuickPhoneInput(e.target.value)}
                  autoFocus
                />
                <p className="mt-1 text-[11px] text-ink-400">
                  Поддерживаются прямые номера, ссылки <code>wa.me/...</code> и международные форматы.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-ink-100">
                <Button variant="secondary" type="button" onClick={() => setQuickDialogOpen(false)}>
                  Отмена
                </Button>
                <Button
                  type="submit"
                  loading={quickSending}
                  disabled={!quickPhoneInput.trim() || !quickAccountId}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  Открыть и перейти к чату
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Grid of WhatsApp Accounts */}
      {!accounts ? (
        <div className="rounded-2xl border border-ink-100 bg-white p-12 text-center text-sm text-ink-400">
          Загрузка аккаунтов WhatsApp…
        </div>
      ) : !accounts.length ? (
        <div className="rounded-2xl border border-ink-100 bg-white p-12 text-center text-sm text-ink-500 space-y-2">
          <p className="font-semibold text-ink-800">Нет добавленных WhatsApp-аккаунтов</p>
          <p className="text-xs text-ink-400">Добавьте и подключите аккаунты в разделе «Аккаунты».</p>
        </div>
      ) : visibleAccounts.length === 0 ? (
        <div className="rounded-2xl border border-ink-100 bg-white p-12 text-center text-sm text-ink-400">
          Нет онлайн-аккаунтов. Подключите аккаунты в разделе «Аккаунты» или снимите фильтр онлайн.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 2xl:grid-cols-3">
          {visibleAccounts.map((acc) => (
            <AccountChatPane key={acc.id} account={acc} socket={socket} toast={toast} />
          ))}
        </div>
      )}
    </div>
  );
}
