'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import {
  ShieldCheck,
  ArrowLeft,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileCode,
  Zap,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { get } from '@/lib/api';
import { useToast } from '@/components/ui/toast';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface AuditItem {
  id: string;
  actionType: string;
  modelUsed: string | null;
  promptTokens: number;
  completionTokens: number;
  inputSnapshot: any;
  outputSnapshot: any;
  executionTimeMs: number;
  success: boolean;
  errorMessage: string | null;
  createdAt: string;
  lead?: { id: string; companyName: string | null; phone: string | null };
}

const ACTION_COLORS: Record<string, string> = {
  ANALYSIS: 'bg-blue-100 text-blue-800 border-blue-200',
  SCORING: 'bg-purple-100 text-purple-800 border-purple-200',
  INBOUND_REPLY: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  OBJECTION_HANDLED: 'bg-amber-100 text-amber-800 border-amber-200',
  PROPOSAL_GENERATED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  FOLLOW_UP: 'bg-teal-100 text-teal-800 border-teal-200',
  HUMAN_ALERT: 'bg-rose-100 text-rose-800 border-rose-200',
  GUARDRAIL_TRIGGERED: 'bg-red-100 text-red-800 border-red-200',
};

export default function AiAuditTrailPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<AuditItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadAudit = useCallback(async () => {
    try {
      setLoading(true);
      const res = await get<{ items: AuditItem[]; total: number }>('/api/ai/audit', { pageSize: 50 });
      setItems(res.items || []);
      setTotal(res.total || 0);
    } catch {
      toast('Не удалось загрузить журнал аудита AI', 'danger');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadAudit();
  }, [loadAudit]);

  return (
    <div className="space-y-6 max-w-5xl pb-16">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/ai-agent">
            <Button variant="secondary" size="sm" className="h-9 w-9 p-0">
              <ArrowLeft size={16} />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-ink-900">Журнал аудита AI Sales Agent</h1>
            <p className="text-xs text-ink-500">
              Полная история решений, генераций, обработки возражений и времени отклика нейросети ({total} записей).
            </p>
          </div>
        </div>

        <Button variant="secondary" size="sm" onClick={() => void loadAudit()} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Обновить
        </Button>
      </div>

      {/* Audit List */}
      <div className="space-y-3">
        {items.length === 0 ? (
          <Card className="p-12 text-center text-ink-400">
            <ShieldCheck size={36} className="mx-auto mb-2 text-ink-300" />
            <p className="font-bold text-ink-700">Журнал аудита пока пуст</p>
            <p className="text-xs text-ink-400 mt-1">Все действия и решения AI будут фиксироваться здесь в реальном времени.</p>
          </Card>
        ) : (
          items.map((log) => {
            const isExpanded = expandedId === log.id;
            return (
              <Card key={log.id} className="p-4 border-ink-200 transition-shadow hover:shadow-sm">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={clsx(
                        'rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border shrink-0',
                        ACTION_COLORS[log.actionType] || 'bg-ink-100 text-ink-800',
                      )}
                    >
                      {log.actionType}
                    </span>

                    <div className="min-w-0">
                      <div className="text-xs font-bold text-ink-900 truncate">
                        {log.lead?.companyName || 'Без названия организации'}
                        {log.lead?.phone && <span className="font-mono text-ink-400 font-normal ml-2">({log.lead.phone})</span>}
                      </div>
                      <div className="text-[10px] text-ink-400 flex items-center gap-2 mt-0.5">
                        <span>Модель: {log.modelUsed || 'Builtin'}</span>
                        <span>•</span>
                        <span>Время отклика: {log.executionTimeMs} мс</span>
                        <span>•</span>
                        <span>{new Date(log.createdAt).toLocaleString('ru-RU')}</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => setExpandedId(isExpanded ? null : log.id)}
                    className="flex items-center gap-1 text-xs font-semibold text-purple-600 hover:text-purple-800 shrink-0"
                  >
                    <FileCode size={13} />
                    {isExpanded ? 'Скрыть детали' : 'Инспектор'}
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                </div>

                {/* Expanded Inspector Snapshot */}
                {isExpanded && (
                  <div className="mt-4 border-t border-ink-100 pt-3 space-y-3">
                    {log.inputSnapshot && (
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-ink-500">Входные данные (Input / Prompt):</span>
                        <pre className="mt-1 rounded-lg bg-ink-900 text-purple-200 p-3 text-[11px] font-mono whitespace-pre-wrap overflow-x-auto max-h-48 leading-relaxed">
                          {JSON.stringify(log.inputSnapshot, null, 2)}
                        </pre>
                      </div>
                    )}

                    {log.outputSnapshot && (
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-ink-500">Результат генерации (Output / Completion):</span>
                        <pre className="mt-1 rounded-lg bg-ink-900 text-emerald-200 p-3 text-[11px] font-mono whitespace-pre-wrap overflow-x-auto max-h-48 leading-relaxed">
                          {JSON.stringify(log.outputSnapshot, null, 2)}
                        </pre>
                      </div>
                    )}

                    {log.errorMessage && (
                      <div className="rounded-lg bg-rose-50 p-2.5 text-xs text-rose-800 font-medium border border-rose-200">
                        Ошибка: {log.errorMessage}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
