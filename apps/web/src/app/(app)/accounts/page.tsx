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
} from 'lucide-react';
import { get, post, patch, del } from '@/lib/api';
import type { AccountSummary } from '@nexora/types';
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

interface WaStatus {
  state: 'DISCONNECTED' | 'SCANNING' | 'CONNECTED' | 'FAILED';
  qr: string | null;
  pairingCode?: string | null;
  error: string | null;
}

export default function AccountsPage() {
  const { toast } = useToast();
  const socket = useSocket();
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
  const pollRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await get<{ items: AccountSummary[] }>('/api/accounts');
      setItems(res.items);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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

  const openWhatsApp = async (acc: AccountSummary) => {
    try {
      const res = await post<{ whatsappUrl: string }>(`/api/accounts/${acc.id}/open`);
      window.open(res.whatsappUrl, '_blank', 'noopener');
    } catch (err) {
      toast((err as Error).message, 'danger');
    }
  };

  const openQr = async (acc: AccountSummary) => {
    setQrAccount(acc);
    setPairMode('qr');
    setPairPhone(acc.phone || '');
    setPairingCode(null);
    setCodeCopied(false);
    setWaStatus({ state: 'DISCONNECTED', qr: null, error: null });
    setQrToastShown(false);
    setWaBusy(true);
    try {
      const res = await post<WaStatus>(`/api/wa/${acc.id}/init`);
      setWaStatus(res);
      if (res.pairingCode) setPairingCode(res.pairingCode);
    } catch (err) {
      setWaStatus({ state: 'FAILED', qr: null, error: (err as Error).message });
    } finally {
      setWaBusy(false);
    }
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink-900">Аккаунты WhatsApp</h2>
          <p className="text-xs text-ink-400">До 7 аккаунтов на рабочее пространство</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            <RefreshCw size={14} />
            Обновить
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)} disabled={(items?.length ?? 0) >= 7}>
            <Plus size={14} />
            Добавить
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-600">{error}</div>
      )}

      <Card className="p-0">
        {!items ? (
          <div className="px-5 py-12 text-center text-sm text-ink-400">Загрузка…</div>
        ) : !items.length ? (
          <EmptyState title="Аккаунтов пока нет" hint="Добавьте первый WhatsApp-аккаунт" />
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

      {/* Modal: Create Account */}
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

      {/* Modal: Confirm Delete */}
      <Confirm
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => void confirmDelete()}
        busy={busyId === toDelete?.id}
        title="Удалить аккаунт?"
        message={`Аккаунт «${toDelete?.name}» будет удалён вместе с историей диалогов.`}
      />
    </div>
  );
}
