import { prisma } from '@nexora/database';
import type { MemoryFactCategory, MemoryLayer } from '@nexora/types';
import { buildStructuredMemoryPrompt } from '../crm/crm.service';

export interface ExtractedFact {
  category: MemoryFactCategory;
  layer: MemoryLayer;
  key: string;
  value: string;
  confidence: number;
}

export async function extractAndStoreMemoryFacts(
  leadId: string,
  messageText: string,
  conversationId?: string | null,
): Promise<ExtractedFact[]> {
  const text = messageText.toLowerCase();
  const facts: ExtractedFact[] = [];

  // 1. Budget detection -> DEAL_FACT & BUDGET
  const budgetMatch = text.match(/(бюджет|рассчитыва[ею]м на|до|около)\s+(\d+[\s\d]*)\s*(тыс|руб|к|тысяч|т\.р\.)/i);
  if (budgetMatch && budgetMatch[2]) {
    const rawVal = budgetMatch[2].replace(/\s/g, '');
    facts.push({
      category: 'BUDGET',
      layer: 'DEAL_FACT',
      key: 'Заявленный бюджет',
      value: `${rawVal} ${budgetMatch[3] || 'руб.'}`,
      confidence: 0.9,
    });
  }

  // 2. Tech stack / Current tools detection -> BUSINESS_FACT
  if (text.includes('1с') || text.includes('1c')) {
    facts.push({ category: 'TECH_STACK', layer: 'BUSINESS_FACT', key: 'Текущий учет', value: 'Используют 1С', confidence: 0.95 });
  }
  if (text.includes('битрикс') || text.includes('bitrix')) {
    facts.push({ category: 'TECH_STACK', layer: 'BUSINESS_FACT', key: 'Текущая CRM', value: '1C-Битрикс / Bitrix24', confidence: 0.95 });
  }
  if (text.includes('amo') || text.includes('амо')) {
    facts.push({ category: 'TECH_STACK', layer: 'BUSINESS_FACT', key: 'Текущая CRM', value: 'AmoCRM', confidence: 0.95 });
  }
  if (text.includes('excel') || text.includes('эксель') || text.includes('таблиц')) {
    facts.push({ category: 'TECH_STACK', layer: 'BUSINESS_FACT', key: 'Текущий учет', value: 'Таблицы Excel / Google Sheets', confidence: 0.9 });
  }

  // 3. Decision maker detection -> LONG_TERM
  if (text.includes('я директор') || text.includes('я собственник') || text.includes('я владелец') || text.includes('я руководитель')) {
    facts.push({ category: 'DECISION_MAKER', layer: 'LONG_TERM', key: 'Роль собеседника', value: 'Лицо принимающее решения (Руководитель/Владелец)', confidence: 0.98 });
  } else if (text.includes('спрошу у директора') || text.includes('согласую с руководством')) {
    facts.push({ category: 'DECISION_MAKER', layer: 'LONG_TERM', key: 'Роль собеседника', value: 'Менеджер (требуется согласование с руководством)', confidence: 0.9 });
  }

  // 4. Timeline / Urgency detection -> PREFERENCE & AGREEMENT
  if (text.includes('срочно') || text.includes('на этой неделе') || text.includes('как можно скорее')) {
    facts.push({ category: 'TIMELINE', layer: 'PREFERENCE', key: 'Срочность запуска', value: 'Высокая (срочно/на этой неделе)', confidence: 0.95 });
  } else if (text.includes('в следующем месяце') || text.includes('к сезону')) {
    facts.push({ category: 'TIMELINE', layer: 'PREFERENCE', key: 'Срочность запуска', value: 'Среднесрочная (1-2 месяца)', confidence: 0.85 });
  }

  // 5. Commitments & Agreements detection -> AGREEMENT
  if (text.includes('созвон') || text.includes('встретимся') || text.includes('наберите в') || text.includes('позвоните')) {
    facts.push({ category: 'GENERAL', layer: 'AGREEMENT', key: 'Запрос на контакт/созвон', value: messageText.slice(0, 150), confidence: 0.9 });
  }

  // 6. Dialogue focus -> SHORT_TERM
  if (messageText.length > 10) {
    facts.push({
      category: 'GENERAL',
      layer: 'SHORT_TERM',
      key: 'Текущий фокус диалога',
      value: messageText.length > 100 ? `${messageText.slice(0, 100)}...` : messageText,
      confidence: 0.85,
    });
  }

  // Persist into both 8-layer ClientMemory and legacy MemoryFact via batch creation
  if (facts.length > 0) {
    try {
      await Promise.all([
        prisma.clientMemory.createMany({
          data: facts.map((fact) => ({
            leadId,
            conversationId: conversationId ?? null,
            layer: fact.layer,
            key: fact.key,
            value: fact.value,
            source: 'AI' as const,
            confidence: fact.confidence,
          })),
        }),
        prisma.memoryFact.createMany({
          data: facts.map((fact) => ({
            leadId,
            category: fact.category,
            key: fact.key,
            value: fact.value,
            source: 'AI' as const,
            confidence: fact.confidence,
          })),
        }),
      ]);
    } catch {
      // Fallback in case of batch failure
    }
  }

  return facts;
}

export async function getLeadMemoryContext(leadId: string): Promise<string> {
  return buildStructuredMemoryPrompt(leadId);
}

