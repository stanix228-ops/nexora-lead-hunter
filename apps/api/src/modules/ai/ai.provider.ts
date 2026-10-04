import { logger } from '../../common/logger';
import type { AiAgentConfig } from '@nexora/types';
import { DEFAULT_NEXORA_CATALOG, type NexoraServiceItem } from './ai.types';

export interface LLMGenerateOptions {
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
}

export interface LLMProvider {
  name: string;
  generateText(prompt: string, systemPrompt?: string, options?: LLMGenerateOptions): Promise<string>;
  generateJson<T = any>(prompt: string, systemPrompt?: string, options?: LLMGenerateOptions): Promise<T>;
}

/**
 * Built-in Rule-based & Heuristic Sales Brain for Nexora IT Agency.
 * Operates with 100% reliability even without external API keys.
 */
export class BuiltinSmartProvider implements LLMProvider {
  name = 'BuiltinSmartProvider';

  async generateText(prompt: string, systemPrompt?: string, options?: LLMGenerateOptions): Promise<string> {
    const fullText = `${systemPrompt || ''}\n${prompt}`;
    const p = prompt.toLowerCase();
    const s = (systemPrompt || '').toLowerCase();

    // 1. Extract context elements
    let inboundText = '';
    const inboundMatch = prompt.match(/Новое сообщение клиента:\s*"([^"]+)"/i);
    if (inboundMatch && inboundMatch[1]) {
      inboundText = inboundMatch[1].trim();
    } else {
      inboundText = prompt.trim();
    }
    const inb = inboundText.toLowerCase();
    const normInb = inb.replace(/[,\.!\?:;"'«»\(\)\-]/g, ' ').replace(/\s+/g, ' ').trim();

    // Detect if this is an ongoing dialogue with existing message history
    const historyBlockMatch = prompt.match(/История диалога:\s*([\s\S]*?)(?=Новое сообщение клиента:|$)/i);
    const historyText = historyBlockMatch ? historyBlockMatch[1].trim() : '';
    const historyHasMessages =
      historyText.includes('Клиент:') ||
      historyText.includes('Консультант Nexora:') ||
      historyText.length > 30;

    // Extract metadata
    const companyMatch = fullText.match(/- Компания:\s*([^\n\r]+)/i);
    const companyName = companyMatch ? companyMatch[1].trim() : 'ваш бизнес';

    const nicheMatch = fullText.match(/- Ниша:\s*([^\n\r]+)/i);
    const niche = nicheMatch ? nicheMatch[1].trim() : 'ваша сфера';

    const suggestedQMatch = fullText.match(/Рекомендуемый следующий единственный вопрос:\s*"([^"]+)"/i) ||
      fullText.match(/Органично используй или адаптируй вопрос:\s*"([^"]+)"/i);
    const suggestedQuestion = suggestedQMatch ? suggestedQMatch[1].trim() : null;

    // =========================================================================
    // CONTEXTUAL CONSULTATIVE DIALOGUE ENGINE
    // =========================================================================

    // 1. Client Identity & Source Inquiry ("Кто вы?", "Откуда мой номер?")
    if (
      normInb.includes('кто вы') ||
      normInb.includes('кто это') ||
      normInb.includes('вы кто') ||
      normInb.includes('откуда номер') ||
      normInb.includes('откуда вы') ||
      normInb.includes('что за компания') ||
      normInb.includes('с кем говорю') ||
      normInb.includes('откуда контакты') ||
      normInb.includes('кто вам дал')
    ) {
      return `Меня зовут Даниил, команда IT-разработки Nexora. Нашли контакты «${companyName}» в открытом справочнике 2GIS. Обратили внимание на ваш бизнес и увидели возможность подключить онлайн-запись и WhatsApp-бота, чтобы заявки от клиентов не терялись в нерабочее время. Скажите, есть минута посмотреть короткий пример, как это работает в сфере ${niche}?`;
    }

    // 2. Deal Closing / Ready to proceed / Proposal request ("Давайте КП", "Пришлите предложение", "Куда платить")
    if (
      normInb.includes('кп') ||
      normInb.includes('коммерческ') ||
      normInb.includes('предложени') ||
      normInb.includes('готов') ||
      normInb.includes('выставляйте счет') ||
      normInb.includes('куда платить') ||
      normInb.includes('давайте попробуем') ||
      normInb.includes('подписываем') ||
      normInb.includes('оформить заказ') ||
      normInb.includes('скидывайте') ||
      normInb.includes('скиньте')
    ) {
      return `Отлично! Уже формирую для «${companyName}» краткое коммерческое предложение с точной сметой (от 35 000 ₸) и этапами запуска за 3-5 дней. Отправлю прямо сюда файлом. Подскажите, пожалуйста, ваше имя, чтобы корректно оформить документ?`;
    }

    // 3. Affirmation / Positive Interest ("Да", "Актуально", "Расскажите", "Давайте", "Слушаю")
    const isAffirmative =
      normInb === 'да' ||
      normInb.startsWith('да ') ||
      normInb.includes('актуально') ||
      normInb.includes('интересно') ||
      normInb.includes('давайте') ||
      normInb.includes('расскажите') ||
      normInb.includes('слушаю') ||
      normInb.includes('рассматриваем') ||
      normInb.includes('было бы неплохо') ||
      normInb.includes('можно') ||
      normInb.includes('хочу') ||
      normInb === 'ок' ||
      normInb === 'хорошо' ||
      normInb.startsWith('хорошо ') ||
      normInb.startsWith('ок ');

    if (isAffirmative) {
      if (suggestedQuestion) {
        return `Отлично! Для «${companyName}» в сфере ${niche} мы обычно внедряем быстрые решения (онлайн-запись в Telegram / AI-ассистента в WhatsApp от 35 000 ₸), чтобы клиенты не уходили к конкурентам из-за ожидания ответа.\n\n${suggestedQuestion}`;
      }
      return `Отлично! Давайте расскажу конкретнее. Для сферы ${niche} мы чаще всего внедряем связку: Telegram-бота для онлайн-записи и умного WhatsApp-ассистента (от 35 000 ₸). Это окупается буквально с 1-2 новых клиентов, так как заявки принимаются круглосуточно.\n\nПодскажите, сейчас клиенты к вам чаще звонят по телефону или пишут в мессенджеры?`;
    }

    // 3. Price / Cost Inquiry ("Сколько стоит?", "Цена?", "Прайс?")
    if (
      inb.includes('цена') ||
      inb.includes('стоимость') ||
      inb.includes('сколько стоит') ||
      inb.includes('прайс') ||
      inb.includes('тариф') ||
      inb.includes('бюджет') ||
      inb.includes('почем') ||
      inb.includes('расценки') ||
      inb.includes('price')
    ) {
      return `Стоимость у нас прозрачная и максимально комфортная для бизнеса:\n• Telegram-бот и онлайн-запись 24/7: от 35 000 ₸\n• AI-ассистент в WhatsApp (авто-ответы и сбор заявок): от 45 000 ₸\n• Современный адаптивный сайт на Next.js: от 49 000 ₸\n\nОплата делится на 2 этапа (50% аванс, 50% после проверки и сдачи), запуск занимает всего от 3 до 7 дней. Под какую задачу для «${companyName}» вам подготовить точный расчет?`;
    }

    // 4. Services Inquiry ("Что предлагаете?", "Чем занимаетесь?", "Что за сайт/бот?")
    if (
      inb.includes('что вы предлагаете') ||
      inb.includes('что предлагаете') ||
      inb.includes('какие услуги') ||
      inb.includes('чем занимаетесь') ||
      inb.includes('что за сайт') ||
      inb.includes('что за бот') ||
      inb.includes('в чем суть') ||
      inb.includes('что делаете') ||
      inb.includes('подробнее')
    ) {
      return `Мы в Nexora специализируемся на 3 решениях для сферы ${niche}:\n1. Умные боты в Telegram и WhatsApp для онлайн-записи клиентов 24/7 (от 35 000 ₸).\n2. Быстрые современные сайты на Next.js с адаптацией под смартфоны (от 49 000 ₸).\n3. Автоматическая передача заявок в CRM или Google Таблицы.\n\nКаждое решение окупается уже в первый месяц. Какое из этих направлений для «${companyName}» сейчас было бы наиболее полезно?`;
    }

    // 5. Timeline Inquiry ("Какие сроки?", "Сколько по времени?")
    if (
      inb.includes('срок') ||
      inb.includes('сколько по времени') ||
      inb.includes('когда будет готов') ||
      inb.includes('как быстро') ||
      inb.includes('как долго')
    ) {
      return `Сроки очень оперативные: запуск Telegram-бота или ассистента в WhatsApp занимает от 3 до 5 рабочих дней. Разработка сайта под ключ на Next.js — от 7 до 12 дней. Мы работаем по договору с четкими дедлайнами и показываем рабочий прототип уже на 2-3 день. К какому числу вам комфортно было бы запуститься?`;
    }

    // 6. Workflow: Messengers / WhatsApp / Instagram
    if (
      inb.includes('ватсап') ||
      inb.includes('whatsapp') ||
      inb.includes('инстаграм') ||
      inb.includes('инста') ||
      inb.includes('директ') ||
      inb.includes('сообщения') ||
      inb.includes('пишут')
    ) {
      return `Понял вас! Когда клиенты пишут в WhatsApp и Instagram, критична скорость первого ответа — если не ответить за 3-5 минут, до 40% клиентов уходят к конкурентам. Наш ассистент отвечает мгновенно даже ночью, консультирует по услугам и сохраняет контакты прямо в базу. Хотите пришлю пример, как это работает в вашей нише?`;
    }

    // 7. Workflow: Phone Calls
    if (
      inb.includes('звонят') ||
      inb.includes('звонки') ||
      inb.includes('по телефону') ||
      inb.includes('набирают') ||
      inb.includes('голосом')
    ) {
      return `Звонки — это здорово! Но когда линия занята или звонят после 19:00, звонки часто срываются. Мы настраиваем авто-ответ со ссылкой на онлайн-запись в WhatsApp/Telegram, где клиент видит свободные окна и записывается сам за 30 секунд. Удобно будет посмотреть пример реализации?`;
    }

    // 8. Workflow: Manual / Notebook / Excel
    if (
      inb.includes('вручную') ||
      inb.includes('блокнот') ||
      inb.includes('тетрадь') ||
      inb.includes('таблиц') ||
      inb.includes('эксель') ||
      inb.includes('excel')
    ) {
      return `Классическая ситуация! Ручная запись отнимает у персонала до 2-3 часов каждый день и иногда приводит к накладкам по времени. Мы переводим это в единый удобный формат: клиент записывается сам в мессенджере, а вам сразу падает готовая карточка с уведомлением. Хотите пришлю расчет окупаемости для «${companyName}»?`;
    }

    // 9. Existing CRM / 1C / Bitrix
    if (
      inb.includes('1с') ||
      inb.includes('битрикс') ||
      inb.includes('amocrm') ||
      inb.includes('amo') ||
      inb.includes('crm') ||
      inb.includes('yclients')
    ) {
      return `Отлично, что у вас уже внедрена система! Мы не предлагаем менять привычный софт, а настраиваем бесшовную интеграцию: бот принимает заявку в мессенджере и мгновенно создает сделку в вашей текущей системе без ручного переноса. Хотите уточню, как именно настроить эту связку для «${companyName}»?`;
    }

    // 10. Cases / Proof / Portfolio
    if (
      inb.includes('кейсы') ||
      inb.includes('примеры') ||
      inb.includes('портфолио') ||
      inb.includes('покажите') ||
      inb.includes('работы') ||
      inb.includes('отзывы') ||
      inb.includes('гарант')
    ) {
      return `Мы работаем по официальному договору с поэтапной оплатой (50/50) и даем 6 месяцев гарантии на код. С удовольствием покажу 2-3 релевантных кейса по автоматизации для сферы ${niche}. В каком формате удобнее посмотреть: ссылкой или скриншотами прямо сюда в чат?`;
    }

    // 11. Objection: Expensive / Budget
    if (
      inb.includes('дорого') ||
      inb.includes('бюджет') ||
      inb.includes('денег') ||
      inb.includes('дороговато') ||
      inb.includes('expensive')
    ) {
      return `Понимаю вас, расходы для бизнеса должны быть комфортными и сразу приносить прибыль. Именно поэтому мы держим доступные цены: базовую онлайн-запись или Telegram-бота можно запустить всего от 35 000 ₸ — это окупается буквально с 1-2 новых клиентов. Также оплату можно разделить на 2 этапа (50/50). Удобно будет посмотреть краткий расчет окупаемости для вашей сферы?`;
    }

    // 12. Objection: Already have site / developer
    if (
      inb.includes('есть разработчик') ||
      inb.includes('есть сайт') ||
      inb.includes('уже сделали') ||
      inb.includes('свой программист') ||
      inb.includes('already have')
    ) {
      return `Это отлично, что у вас уже есть база! Мы в Nexora часто работаем в связке с текущими решениями: например, подключаем к существующему сайту Telegram Mini App для мгновенных заказов или настраиваем AI-менеджера в WhatsApp (от 35 000 ₸), который берет на себя рутину по ответам клиентам в нерабочее время. Хотите пришлю пример, как это работает в вашей нише?`;
    }

    // 13. Objection: Later / Next month
    if (
      inb.includes('потом') ||
      inb.includes('на почту') ||
      inb.includes('позже') ||
      inb.includes('не сейчас') ||
      inb.includes('через месяц') ||
      inb.includes('занят')
    ) {
      return `Договорились, не буду вас отвлекать! Зафиксировал. Чтобы я сохранил нужную информацию к нашему следующему контакту: какой вопрос для вас в перспективе будет важнее — привлечение новых клиентов или автоматизация записи текущих?`;
    }

    // 14. Objection: Not needed / Opt-out
    if (
      inb.includes('не надо') ||
      inb.includes('не нужно') ||
      inb.includes('не интересно') ||
      inb.includes('не актуально') ||
      inb.includes('отстаньте')
    ) {
      return `Вас понял! Большое спасибо за обратную связь. Если в будущем понадобится качественная IT-разработка или автоматизация — будем рады сотрудничеству. Успехов вашему бизнесу «${companyName}»!`;
    }



    // 16. Greeting in an active conversation (NEVER repeat outreach!)
    if (
      inb.startsWith('привет') ||
      inb.startsWith('здравствуй') ||
      inb.startsWith('добрый') ||
      inb.startsWith('салам') ||
      inb.includes('доброе утро') ||
      inb.includes('добрый вечер')
    ) {
      if (historyHasMessages) {
        return `Добрый день! Рад диалогу. Мы как раз обратили внимание на «${companyName}» в сфере ${niche}. Подскажите, как сейчас у вас выстроен процесс приема клиентов — администратор отвечает вручную или уже подключена какая-то онлайн-система?`;
      }
    }

    // 17. Consultative Fallback during active conversation
    if (historyHasMessages) {
      if (suggestedQuestion) {
        return suggestedQuestion;
      }
      return `Благодарю за ответ! Чтобы предложить вам наиболее точное решение для «${companyName}»: подскажите, с какой главной сложностью при приеме клиентов вы чаще всего сталкиваетесь сейчас?`;
    }

    // 18. Default initial outreach (used ONLY when starting from zero)
    return `Здравствуйте! Обратили внимание на ваш бизнес «${companyName}» в сфере ${niche}. Мы в Nexora помогаем компаниям автоматизировать прием клиентов и увеличить поток заявок через современные веб-сервисы и ботов. Скажите, актуален ли для вас вопрос привлечения новых клиентов сейчас?`;
  }

  async generateJson<T = any>(prompt: string, systemPrompt?: string, options?: LLMGenerateOptions): Promise<T> {
    const p = prompt.toLowerCase();

    // Default structured mock for analysis / scoring / proposals
    if (p.includes('proposal') || p.includes('коммерческ')) {
      const mockProposal: any = {
        title: 'Автоматизация приема заявок и Telegram Mini App для бизнеса',
        serviceType: 'TELEGRAM_BOT',
        summary: 'Комплексное внедрение Telegram Mini App и авто-воронки для увеличения конверсии входящих лидов и снижения нагрузки на менеджеров.',
        scope: [
          'Проектирование логики сценария и CJM пользователя',
          'Разработка адаптивного интерфейса Telegram Mini App',
          'Подключение приема платежей Kaspi / карт и онлайн-бронирования',
          'Двусторонняя синхронизация с CRM и базой данных',
          'Инструкции для персонала и 6 месяцев техподдержки',
        ],
        deliverables: [
          'Telegram Mini App под ключ',
          'Панель администратора',
          'Исходный код в репозитории клиента',
          'Обучение команды',
        ],
        timelineWeeks: 1.5,
        priceEstimateMin: 35000,
        priceEstimateMax: 85000,
        currency: 'KZT',
        formattedMarkdown: `### Коммерческое предложение: Автоматизация для вашего бизнеса\n\n**Исполнитель:** IT-компания Nexora\n**Срок реализации:** 1-2 недели\n**Инвестиции:** от 35 000 до 85 000 ₸\n\n#### Состав работ:\n1. Интерактивный Telegram Mini App для каталога и онлайн-заказов\n2. AI-квалификация входящих обращений в WhatsApp\n3. Мгновенные уведомления менеджерам в CRM\n4. Гарантийная поддержка 6 месяцев`,
      };
      return mockProposal as T;
    }

    if (p.includes('score') || p.includes('скоринг')) {
      const mockScore: any = {
        score: 85,
        grade: 'HOT',
        recommendedService: 'TELEGRAM_BOT',
        urgency: 'HIGH',
        estimatedBudgetTier: 'MEDIUM',
        reasons: [
          'Отсутствует современная онлайн-запись в Telegram/WhatsApp',
          'Высокая маржинальность ниши и сильная конкуренция',
          'Прямой контакт в мессенджерах ускоряет цикл сделки',
        ],
        painPoints: [
          'Потеря ночных и выходных заявок из-за отсутствия 24/7 авто-ответа',
          'Ручной ввод заказов менеджерами в таблицы',
        ],
        techGaps: [
          'Нет Telegram Mini App',
          'Нет AI-квалификатора обращений',
        ],
      };
      return mockScore as T;
    }

    return {} as T;
  }
}

/**
 * Universal OpenAI-compatible API client (OpenAI, OpenRouter, Groq, DeepSeek, Ollama).
 */
export class OpenAICompatibleProvider implements LLMProvider {
  name: string;
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor(apiKey: string, model = 'gpt-4o-mini', baseUrl = 'https://api.openai.com/v1', name = 'OpenAI') {
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.name = name;
  }

  async generateText(prompt: string, systemPrompt?: string, options?: LLMGenerateOptions): Promise<string> {
    try {
      const messages: Array<{ role: string; content: string }> = [];
      if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
      }
      messages.push({ role: 'user', content: prompt });

      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: options?.temperature ?? 0.4,
          max_tokens: options?.maxTokens ?? 1500,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`LLM API Error ${res.status}: ${errText}`);
      }

      const json = await res.json();
      return json?.choices?.[0]?.message?.content?.trim() || '';
    } catch (err) {
      logger.error('OpenAICompatibleProvider generateText failed, falling back to Builtin', { error: (err as Error).message });
      const fallback = new BuiltinSmartProvider();
      return fallback.generateText(prompt, systemPrompt, options);
    }
  }

  async generateJson<T = any>(prompt: string, systemPrompt?: string, options?: LLMGenerateOptions): Promise<T> {
    try {
      const jsonSystemPrompt = `${systemPrompt || ''}\n\nIMPORTANT: Output strictly valid JSON without any markdown code fences or conversational text.`;
      const raw = await this.generateText(prompt, jsonSystemPrompt, options);
      const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
      return JSON.parse(cleaned) as T;
    } catch (err) {
      logger.error('OpenAICompatibleProvider generateJson failed, falling back to Builtin', { error: (err as Error).message });
      const fallback = new BuiltinSmartProvider();
      return fallback.generateJson<T>(prompt, systemPrompt, options);
    }
  }
}

/**
 * Google Gemini Provider via official REST endpoint.
 */
export class GeminiProvider implements LLMProvider {
  name = 'GeminiProvider';
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = 'gemini-1.5-flash') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async generateText(prompt: string, systemPrompt?: string, options?: LLMGenerateOptions): Promise<string> {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
      const contents: any[] = [];

      if (systemPrompt) {
        contents.push({ role: 'user', parts: [{ text: `SYSTEM INSTRUCTIONS:\n${systemPrompt}` }] });
        contents.push({ role: 'model', parts: [{ text: 'Understood. I will act strictly according to instructions.' }] });
      }
      contents.push({ role: 'user', parts: [{ text: prompt }] });

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature: options?.temperature ?? 0.4,
            maxOutputTokens: options?.maxTokens ?? 1500,
          },
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Gemini API Error ${res.status}: ${errText}`);
      }

      const json = await res.json();
      return json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    } catch (err) {
      logger.error('GeminiProvider generateText failed, falling back to Builtin', { error: (err as Error).message });
      const fallback = new BuiltinSmartProvider();
      return fallback.generateText(prompt, systemPrompt, options);
    }
  }

  async generateJson<T = any>(prompt: string, systemPrompt?: string, options?: LLMGenerateOptions): Promise<T> {
    try {
      const jsonPrompt = `${prompt}\n\nRespond ONLY with valid JSON.`;
      const raw = await this.generateText(jsonPrompt, systemPrompt, options);
      const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
      return JSON.parse(cleaned) as T;
    } catch (err) {
      logger.error('GeminiProvider generateJson failed, falling back to Builtin', { error: (err as Error).message });
      const fallback = new BuiltinSmartProvider();
      return fallback.generateJson<T>(prompt, systemPrompt, options);
    }
  }
}

/**
 * Factory function to retrieve the configured AI provider.
 */
export function getAIProvider(config?: Partial<AiAgentConfig> | null): LLMProvider {
  if (config?.apiKey && config?.llmProvider && config.llmProvider !== 'BUILTIN') {
    switch (config.llmProvider) {
      case 'OPENAI':
        return new OpenAICompatibleProvider(config.apiKey, config.modelName || 'gpt-4o-mini', 'https://api.openai.com/v1', 'OpenAI');
      case 'OPENROUTER':
        return new OpenAICompatibleProvider(config.apiKey, config.modelName || 'openai/gpt-4o-mini', 'https://openrouter.ai/api/v1', 'OpenRouter');
      case 'OLLAMA':
        return new OpenAICompatibleProvider(config.apiKey || 'ollama', config.modelName || 'llama3.2', 'http://localhost:11434/v1', 'Ollama');
      case 'GEMINI':
        return new GeminiProvider(config.apiKey, config.modelName || 'gemini-1.5-flash');
      default:
        break;
    }
  }

  // Auto-detect environment LLM keys if not explicitly set in DB config
  if (process.env.GROQ_API_KEY) {
    return new OpenAICompatibleProvider(process.env.GROQ_API_KEY, 'llama-3.3-70b-versatile', 'https://api.groq.com/openai/v1', 'Groq');
  }
  if (process.env.OPENAI_API_KEY) {
    return new OpenAICompatibleProvider(process.env.OPENAI_API_KEY, process.env.OPENAI_MODEL || 'gpt-4o-mini', 'https://api.openai.com/v1', 'OpenAI');
  }
  if (process.env.OPENROUTER_API_KEY) {
    return new OpenAICompatibleProvider(process.env.OPENROUTER_API_KEY, process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini', 'https://openrouter.ai/api/v1', 'OpenRouter');
  }
  if (process.env.GEMINI_API_KEY) {
    return new GeminiProvider(process.env.GEMINI_API_KEY, 'gemini-1.5-flash');
  }

  return new BuiltinSmartProvider();
}
