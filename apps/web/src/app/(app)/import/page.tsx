'use client';

import { useState } from 'react';
import { FileText, Table2, Wand2, Upload, CheckCircle2, XCircle, Repeat } from 'lucide-react';
import { post } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Select, Textarea } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';

interface TextAnalysis {
  detected: Record<string, number>;
  preview: Array<{ originalValue: string; normalizedValue: string | null; type: string; error: string | null }>;
}

interface CsvAnalysis {
  headers: string[];
  rowCount: number;
  suggestedMapping: Record<string, string>;
  preview: Record<string, string>[];
}

interface DedupReport {
  total: number;
  newLeads: number;
  duplicates: number;
}

type AnalyzeResponse =
  | { mode: 'text'; analysis: TextAnalysis; dedup: DedupReport }
  | { mode: 'csv'; csv: CsvAnalysis; dedup: DedupReport };

interface ImportResult {
  imported: number;
  duplicates: number;
  skipped: number;
  errors: string[];
}

const TYPE_RU: Record<string, string> = {
  WA_LINK: 'WhatsApp-ссылка',
  PHONE: 'Телефон',
  INSTAGRAM: 'Instagram',
  WEBSITE: 'Сайт',
  UNDETECTED: 'Не распознано',
};

export default function ImportPage() {
  const { toast } = useToast();
  const [mode, setMode] = useState<'text' | 'csv'>('text');
  const [content, setContent] = useState('');
  const [niche, setNiche] = useState('');
  const [city, setCity] = useState('');
  const [source, setSource] = useState('CSV');
  const [strategy, setStrategy] = useState<'new' | 'all'>('new');
  const [busy, setBusy] = useState(false);
  const [analyzed, setAnalyzed] = useState<AnalyzeResponse | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const analyze = async () => {
    if (!content.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await post<AnalyzeResponse>('/api/import/analyze', {
        mode,
        content,
        niche: niche || undefined,
        city: city || undefined,
        source: source || undefined,
      });
      setAnalyzed(res);
    } catch (err) {
      toast((err as Error).message, 'danger');
    } finally {
      setBusy(false);
    }
  };

  const runImport = async () => {
    if (!analyzed) return;
    setBusy(true);
    try {
      const res = await post<ImportResult>('/api/import', {
        mode,
        content,
        strategy,
        niche: niche || undefined,
        city: city || undefined,
        source: mode === 'csv' ? source : undefined,
      });
      setResult(res);
      setAnalyzed(null);
      setContent('');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink-900">Импорт контактов</h1>
        <p className="text-xs text-ink-500">Массовая загрузка номеров, ссылок и CSV баз лидов</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-ink-100 pb-3">
            <Button
              variant={mode === 'text' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setMode('text')}
            >
              <FileText size={14} /> Текст / Номера
            </Button>
            <Button
              variant={mode === 'csv' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setMode('csv')}
            >
              <Table2 size={14} /> CSV / Excel
            </Button>
          </div>

          <div className="space-y-3">
            <Textarea
              label="Данные для импорта"
              rows={8}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={
                mode === 'text'
                  ? '+79991234567\nhttps://wa.me/79997654321\n@username\nhttps://site.ru'
                  : 'name,phone,website\nООО Пример,+79991234567,https://site.ru'
              }
            />

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Ниша (опционально)"
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                placeholder="Стоматология"
              />
              <Input
                label="Город (опционально)"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Москва"
              />
            </div>

            <Button
              variant="primary"
              size="md"
              className="w-full"
              loading={busy}
              onClick={analyze}
            >
              <Wand2 size={16} /> Анализировать данные
            </Button>
          </div>
        </Card>

        <Card className="p-5 space-y-4">
          <h2 className="font-bold text-sm text-ink-900">Результат анализа и загрузка</h2>

          {analyzed ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="p-3 bg-ink-50 rounded-xl">
                  <div className="text-ink-400">Всего</div>
                  <div className="text-lg font-bold text-ink-900">{analyzed.dedup.total}</div>
                </div>
                <div className="p-3 bg-emerald-50 rounded-xl">
                  <div className="text-emerald-600">Новых</div>
                  <div className="text-lg font-bold text-emerald-700">{analyzed.dedup.newLeads}</div>
                </div>
                <div className="p-3 bg-amber-50 rounded-xl">
                  <div className="text-amber-600">Дубликаты</div>
                  <div className="text-lg font-bold text-amber-700">{analyzed.dedup.duplicates}</div>
                </div>
              </div>

              <Button
                variant="success"
                size="md"
                className="w-full"
                loading={busy}
                onClick={runImport}
              >
                <Upload size={16} /> Загрузить в базу ({analyzed.dedup.newLeads})
              </Button>
            </div>
          ) : result ? (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 space-y-2">
              <div className="flex items-center gap-2 font-bold">
                <CheckCircle2 size={18} className="text-emerald-600" />
                Импорт успешно завершён!
              </div>
              <div className="text-xs space-y-1">
                <div>Загружено: <strong>{result.imported}</strong></div>
                <div>Пропущено дублей: <strong>{result.duplicates}</strong></div>
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-xs text-ink-400">
              Вставьте контакты слева и нажмите «Анализировать»
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}