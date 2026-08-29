'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Smartphone,
  Users,
  MessagesSquare,
  Search,
  Megaphone,
  RadioTower,
  ArrowRight,
  Plus,
  RefreshCw,
  Send,
  Flame,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { get } from '@/lib/api';
import type { AccountSummary } from '@nexora/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AccountStatusBadge } from '@/components/ui/badge';

export default function DashboardPage() {
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await get<{ items: AccountSummary[] }>('/api/accounts');
      if (res && res.items) {
        setAccounts(res.items);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const connectedCount = accounts.filter((a) => (a.status as string) === 'CONNECTED').length;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-emerald-700 via-emerald-600 to-teal-700 p-6 text-white shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">Nexora WhatsApp CRM & Парсер</h1>
            <p className="text-sm text-emerald-100">
              Единая платформа: парсинг целевых организаций без сайтов, прогрев номеров и массовые рассылки
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/parser">
              <Button variant="secondary" size="md" className="bg-white text-emerald-800 hover:bg-emerald-50 font-bold">
                <Search size={16} />
                Открыть Парсер Лидов
              </Button>
            </Link>
            <Link href="/accounts">
              <Button variant="primary" size="md" className="bg-emerald-950 text-white hover:bg-emerald-900 border border-emerald-500/30">
                <Plus size={16} />
                Добавить WhatsApp
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5 border-l-4 border-l-emerald-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">WhatsApp Аккаунты</p>
              <h3 className="mt-1 text-2xl font-bold text-ink-900">
                {connectedCount} <span className="text-sm font-normal text-ink-400">/ {accounts.length} онлайн</span>
              </h3>
            </div>
            <div className="rounded-xl bg-emerald-50 p-3 text-emerald-600">
              <Smartphone size={24} />
            </div>
          </div>
          <Link href="/accounts" className="mt-3 flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:underline">
            Управление аккаунтами <ArrowRight size={12} />
          </Link>
        </Card>

        <Card className="p-5 border-l-4 border-l-sky-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Парсер 2ГИС & Google</p>
              <h3 className="mt-1 text-2xl font-bold text-ink-900">США & РФ/СНГ</h3>
            </div>
            <div className="rounded-xl bg-sky-50 p-3 text-sky-600">
              <Search size={24} />
            </div>
          </div>
          <Link href="/parser" className="mt-3 flex items-center gap-1 text-xs font-semibold text-sky-600 hover:underline">
            Сбор организаций без сайта <ArrowRight size={12} />
          </Link>
        </Card>

        <Card className="p-5 border-l-4 border-l-purple-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Диалоги & Чаты</p>
              <h3 className="mt-1 text-2xl font-bold text-ink-900">Входящие</h3>
            </div>
            <div className="rounded-xl bg-purple-50 p-3 text-purple-600">
              <MessagesSquare size={24} />
            </div>
          </div>
          <Link href="/conversations" className="mt-3 flex items-center gap-1 text-xs font-semibold text-purple-600 hover:underline">
            Открыть входящие чаты <ArrowRight size={12} />
          </Link>
        </Card>

        <Card className="p-5 border-l-4 border-l-amber-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Мульти-трансляция</p>
              <h3 className="mt-1 text-2xl font-bold text-ink-900">Live View</h3>
            </div>
            <div className="rounded-xl bg-amber-50 p-3 text-amber-600">
              <RadioTower size={24} />
            </div>
          </div>
          <Link href="/multiview" className="mt-3 flex items-center gap-1 text-xs font-semibold text-amber-600 hover:underline">
            Экран всех номеров <ArrowRight size={12} />
          </Link>
        </Card>
      </div>

      {/* Connected Accounts Quick List */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-ink-900">Подключенные WhatsApp Номера</h2>
            <p className="text-xs text-ink-500">Статусы Baileys Web сессий в реальном времени</p>
          </div>
          <Button variant="secondary" size="sm" onClick={loadData} loading={loading}>
            <RefreshCw size={14} />
            Обновить
          </Button>
        </div>

        {accounts.length === 0 ? (
          <div className="py-8 text-center text-ink-400">
            <Smartphone size={36} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm font-medium">Нет добавленных WhatsApp аккаунтов</p>
            <Link href="/accounts" className="mt-2 inline-block text-xs font-bold text-emerald-600 hover:underline">
              + Добавить первый номер через QR-код
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {accounts.map((acc) => (
              <div key={acc.id} className="flex items-center justify-between p-3.5 rounded-xl border border-ink-200 bg-ink-50/50">
                <div className="space-y-0.5">
                  <div className="font-bold text-sm text-ink-900">{acc.name}</div>
                  <div className="text-xs font-mono text-ink-500">{acc.phoneMasked || 'Не привязан'}</div>
                </div>
                <AccountStatusBadge status={acc.status} />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
