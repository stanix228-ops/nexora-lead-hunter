'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import {
  Bot,
  ArrowLeft,
  Save,
  Key,
  Sliders,
  ShieldAlert,
  Clock,
  Zap,
  Sparkles,
  CheckCircle2,
  Lock,
  Layers,
  HelpCircle,
  Plus,
  Trash2,
} from 'lucide-react';
import { get, put } from '@/lib/api';
import { useToast } from '@/components/ui/toast';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/form';

export default function AiAgentSettingsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [mode, setMode] = useState<'AUTONOMOUS' | 'COPILOT' | 'OFF'>('COPILOT');
  const [llmProvider, setLlmProvider] = useState<'BUILTIN' | 'OPENAI' | 'ANTHROPIC' | 'GEMINI' | 'OPENROUTER' | 'OLLAMA'>('BUILTIN');
  const [apiKey, setApiKey] = useState('');
  const [modelName, setModelName] = useState('gpt-4o-mini');
  const [temperature, setTemperature] = useState(0.4);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [workingHoursStart, setWorkingHoursStart] = useState('09:00');
  const [workingHoursEnd, setWorkingHoursEnd] = useState('20:00');
  const [minDelaySeconds, setMinDelaySeconds] = useState(8);
  const [maxDelaySeconds, setMaxDelaySeconds] = useState(45);
  const [maxDailyMessages, setMaxDailyMessages] = useState(50);
  const [stopWordsText, setStopWordsText] = useState('стоп, хватит, отписка, спам, не пишите, stop, unsubscribe');

  useEffect(() => {
    const loadConfig = async () => {
      try {
        setLoading(true);
        const res = await get<any>('/api/ai/config');
        if (res) {
          setMode(res.mode || 'COPILOT');
          setLlmProvider(res.llmProvider || 'BUILTIN');
          setApiKey(res.apiKey || '');
          setModelName(res.modelName || 'gpt-4o-mini');
          setTemperature(res.temperature ?? 0.4);
          setSystemPrompt(res.systemPrompt || '');
          setWorkingHoursStart(res.workingHoursStart || '09:00');
          setWorkingHoursEnd(res.workingHoursEnd || '20:00');
          setMinDelaySeconds(res.minDelaySeconds ?? 8);
          setMaxDelaySeconds(res.maxDelaySeconds ?? 45);
          setMaxDailyMessages(res.maxDailyMessagesPerAccount ?? 50);
          if (Array.isArray(res.stopWords)) {
            setStopWordsText(res.stopWords.join(', '));
          }
        }
      } catch {
        toast('Не удалось загрузить настройки AI', 'danger');
      } finally {
        setLoading(false);
      }
    };

    void loadConfig();
  }, [toast]);

  const handleSave = async () => {
    try {
      setSaving(true);
      const stopWords = stopWordsText
        .split(',')
        .map((w) => w.trim())
        .filter(Boolean);

      await put('/api/ai/config', {
        mode,
        llmProvider,
        apiKey: apiKey || null,
        modelName,
        temperature: Number(temperature),
        systemPrompt: systemPrompt || null,
        workingHoursStart,
        workingHoursEnd,
        minDelaySeconds: Number(minDelaySeconds),
        maxDelaySeconds: Number(maxDelaySeconds),
        maxDailyMessagesPerAccount: Number(maxDailyMessages),
        stopWords,
      });

      toast('Настройки AI Sales Agent сохранены!', 'success');
    } catch {
      toast('Ошибка при сохранении настроек', 'danger');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl pb-16">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/ai-agent">
            <Button variant="secondary" size="sm" className="h-9 w-9 p-0">
              <ArrowLeft size={16} />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-ink-900">Настройки AI Sales Agent</h1>
            <p className="text-xs text-ink-500">
              Конфигурация модели, каталога IT-услуг Nexora, рабочего времени и анти-бан лимитов.
            </p>
          </div>
        </div>

        <Button
          variant="primary"
          size="md"
          onClick={() => void handleSave()}
          disabled={saving || loading}
          className="bg-purple-600 hover:bg-purple-700 font-bold"
        >
          <Save size={16} />
          {saving ? 'Сохранение...' : 'Сохранить изменения'}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {/* Card 1: Operating Mode */}
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2 border-b border-ink-100 pb-3">
            <Zap className="text-purple-600" size={18} />
            <h2 className="text-sm font-bold text-ink-900">Режим работы агента</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              {
                id: 'AUTONOMOUS',
                title: '⚡ 100% Автономный',
                desc: 'AI сам квалифицирует лиды, ведет переписку в WhatsApp, обрабатывает возражения и высылает КП.',
              },
              {
                id: 'COPILOT',
                title: '🤝 AI-Копилот (Рекомендуется)',
                desc: 'AI генерирует умные подсказки и драфты ответов. Менеджер отправляет их в 1 клик.',
              },
              {
                id: 'OFF',
                title: '⏸️ Выключен',
                desc: 'AI-агент отключен. Доступен только ручной режим общения менеджерами.',
              },
            ].map((m) => (
              <div
                key={m.id}
                onClick={() => setMode(m.id as any)}
                className={clsx(
                  'cursor-pointer rounded-xl border p-4 transition-all',
                  mode === m.id
                    ? 'border-purple-600 bg-purple-50/50 shadow-sm ring-2 ring-purple-600/20'
                    : 'border-ink-200 bg-white hover:border-ink-300',
                )}
              >
                <div className="font-bold text-xs text-ink-900">{m.title}</div>
                <div className="mt-1.5 text-[11px] text-ink-500 leading-relaxed">{m.desc}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* Card 2: LLM Engine & API Provider */}
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-ink-100 pb-3">
            <div className="flex items-center gap-2">
              <Bot className="text-indigo-600" size={18} />
              <h2 className="text-sm font-bold text-ink-900">Провайдер нейросети (LLM)</h2>
            </div>
            <span className="text-[11px] text-ink-500 font-semibold">Поддерживает OpenAI, Gemini, Claude, OpenRouter, Ollama</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-ink-600 mb-1">Провайдер AI</label>
              <select
                value={llmProvider}
                onChange={(e) => setLlmProvider(e.target.value as any)}
                className="w-full h-9 rounded-lg border border-ink-200 bg-white px-3 text-xs font-semibold text-ink-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="BUILTIN">🔥 Встроенный эвристический движок (0 ₽ / Без ключей)</option>
                <option value="OPENAI">OpenAI (GPT-4o / GPT-4o-mini)</option>
                <option value="GEMINI">Google Gemini 1.5 (Flash / Pro)</option>
                <option value="OPENROUTER">OpenRouter (Все модели)</option>
                <option value="OLLAMA">Локальная Ollama (Llama 3.2 / DeepSeek)</option>
              </select>
            </div>

            <Input
              label="Название модели"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              placeholder="gpt-4o-mini / gemini-1.5-flash / llama3.2"
              className="text-xs"
            />
          </div>

          {llmProvider !== 'BUILTIN' && (
            <div>
              <label className="block text-xs font-medium text-ink-600 mb-1">API Ключ провайдера</label>
              <div className="relative">
                <Input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-proj-... / AIzaSy..."
                  className="text-xs font-mono pr-10"
                />
                <Lock size={14} className="absolute right-3 top-3 text-ink-400" />
              </div>
              <p className="text-[10px] text-ink-400 mt-1">
                Ключ хранится в зашифрованном виде и используется исключительно для генерации ответов клиентам.
              </p>
            </div>
          )}

          <div className="space-y-1.5 pt-2">
            <div className="flex justify-between text-xs font-semibold text-ink-700">
              <span>Креативность ответов (Temperature):</span>
              <span className="font-mono text-purple-700">{temperature}</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="w-full accent-purple-600 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-ink-400">
              <span>0.0 (Строго по регламентам)</span>
              <span>1.0 (Максимальная гибкость)</span>
            </div>
          </div>
        </Card>

        {/* Card 3: Custom Sales Instructions */}
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2 border-b border-ink-100 pb-3">
            <Sparkles className="text-purple-600" size={18} />
            <h2 className="text-sm font-bold text-ink-900">Инструкции руководителя (Prompt Guidelines)</h2>
          </div>

          <Textarea
            label="Дополнительные правила и тон диалога для Nexora"
            rows={4}
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="Например: Делай упор на скорость разработки Next.js и интеграцию с Telegram. Если клиент из ресторанной сферы — предлагай Telegram Mini App для доставки..."
            className="text-xs font-sans leading-relaxed"
          />
        </Card>

        {/* Card 4: Working Hours & Anti-Ban Rate Limiting */}
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2 border-b border-ink-100 pb-3">
            <Clock className="text-emerald-600" size={18} />
            <h2 className="text-sm font-bold text-ink-900">Рабочие часы & Анти-бан защита WhatsApp</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Начало отправки сообщений"
              type="time"
              value={workingHoursStart}
              onChange={(e) => setWorkingHoursStart(e.target.value)}
              className="text-xs font-mono"
            />

            <Input
              label="Окончание отправки (Тихие часы)"
              type="time"
              value={workingHoursEnd}
              onChange={(e) => setWorkingHoursEnd(e.target.value)}
              className="text-xs font-mono"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <Input
              label="Мин. задержка перед ответом (сек)"
              type="number"
              min="2"
              max="60"
              value={minDelaySeconds}
              onChange={(e) => setMinDelaySeconds(parseInt(e.target.value) || 5)}
              className="text-xs font-mono"
            />

            <Input
              label="Макс. задержка (сек)"
              type="number"
              min="5"
              max="180"
              value={maxDelaySeconds}
              onChange={(e) => setMaxDelaySeconds(parseInt(e.target.value) || 45)}
              className="text-xs font-mono"
            />

            <Input
              label="Макс. сообщений в день на аккаунт"
              type="number"
              min="10"
              max="300"
              value={maxDailyMessages}
              onChange={(e) => setMaxDailyMessages(parseInt(e.target.value) || 50)}
              className="text-xs font-mono"
            />
          </div>
        </Card>

        {/* Card 5: Stop-words & Blacklist */}
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2 border-b border-ink-100 pb-3">
            <ShieldAlert className="text-rose-600" size={18} />
            <h2 className="text-sm font-bold text-ink-900">Стоп-слова и автоматическая отписка (Opt-out)</h2>
          </div>

          <Input
            label="Ключевые слова для мгновенной паузы AI и отписки (через запятую)"
            value={stopWordsText}
            onChange={(e) => setStopWordsText(e.target.value)}
            className="text-xs font-mono text-rose-800 bg-rose-50/50 border-rose-200"
          />
          <p className="text-[10px] text-ink-400 -mt-2">
            При получении этих слов диалог немедленно переходит в статус «Отписан», AI останавливается, а все запланированные фоллоу-апы отменяются.
          </p>
        </Card>
      </div>
    </div>
  );
}
