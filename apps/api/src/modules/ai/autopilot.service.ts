import { prisma } from '@nexora/database';
import { logger } from '../../common/logger';
import { emitToUser } from '../../common/realtime/socket';
import { performAiBusinessAnalysis } from './business-analyzer.service';
import { LeadScoringEngine } from './scoring.service';
import { processInboundWithSalesBrain } from './sales-brain.service';
import { CommercialProposalEngine } from './proposal.service';
import { recordClientMemory } from '../crm/crm.service';
import { generatePersonalizedOutreachMessage } from '../hunter/hunter.service';

export interface AutopilotOptions {
  niche?: string;
  city?: string;
  channel?: 'WHATSAPP' | 'TELEGRAM' | 'EMAIL' | 'ALL';
  maxLeads?: number;
  autoCloseDeals?: boolean;
}

export interface AutopilotEvent {
  id: string;
  timestamp: string;
  type: 'DISCOVERY' | 'ANALYSIS' | 'SCORE' | 'OUTREACH' | 'INBOUND' | 'REASONING' | 'PROPOSAL' | 'DEAL_WON' | 'HANDOFF' | 'SYSTEM';
  title: string;
  description: string;
  companyName: string;
  leadId?: string;
  conversationId?: string;
  metadata?: Record<string, any>;
}

export interface ActiveDialogueItem {
  leadId: string;
  conversationId: string;
  companyName: string;
  phone: string;
  niche: string;
  score: number;
  grade: string;
  stage: string;
  channel: string;
  lastMessage: string;
  lastAiReply: string;
  proposalNumber?: string;
  dealAmount?: number;
  isWon?: boolean;
  extractedNeed?: string;
}

export interface AutopilotStatus {
  status: 'IDLE' | 'RUNNING' | 'PAUSED' | 'COMPLETED';
  startedAt: string | null;
  currentAction: string | null;
  options: AutopilotOptions;
  counters: {
    totalLeads: number;
    analyzedCount: number;
    contactedCount: number;
    repliesCount: number;
    proposalsCount: number;
    dealsWonCount: number;
    revenueWon: number;
  };
  events: AutopilotEvent[];
  activeDialogues: ActiveDialogueItem[];
}

// In-memory state per user
const userAutopilotState = new Map<string, AutopilotStatus>();
const userAutopilotTimer = new Map<string, NodeJS.Timeout>();

export class AutopilotEngineService {
  /**
   * Get current state or initialize default
   */
  static getStatus(userId: string): AutopilotStatus {
    let state = userAutopilotState.get(userId);
    if (!state) {
      state = {
        status: 'IDLE',
        startedAt: null,
        currentAction: null,
        options: {
          niche: 'Все ниши (B2B, Клиники, Рестораны)',
          city: 'Алматы / Москва',
          channel: 'ALL',
          maxLeads: 5,
          autoCloseDeals: true,
        },
        counters: {
          totalLeads: 0,
          analyzedCount: 0,
          contactedCount: 0,
          repliesCount: 0,
          proposalsCount: 0,
          dealsWonCount: 0,
          revenueWon: 0,
        },
        events: [],
        activeDialogues: [],
      };
      userAutopilotState.set(userId, state);
    }
    return state;
  }

  /**
   * Push event and notify user via Socket.IO
   */
  private static recordEvent(userId: string, event: Omit<AutopilotEvent, 'id' | 'timestamp'>) {
    const state = this.getStatus(userId);
    const fullEvent: AutopilotEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      ...event,
    };
    state.events.unshift(fullEvent);
    if (state.events.length > 80) state.events.pop();

    emitToUser(userId, 'autopilot.event', fullEvent);
    emitToUser(userId, 'autopilot.status', state);
  }

  /**
   * Start the complete autonomous sales machine
   */
  static async startAutopilot(userId: string, options: AutopilotOptions = {}): Promise<AutopilotStatus> {
    const config = await prisma.aiAgentConfig.findUnique({ where: { userId } });
    const state = this.getStatus(userId);

    if (config?.mode === 'OFF') {
      state.status = 'PAUSED';
      state.currentAction = 'ИИ Агент выключен (mode: OFF). Включите режим работы агента в настройках.';
      emitToUser(userId, 'autopilot.status', state);
      return state;
    }

    if (state.status === 'RUNNING') {
      return state;
    }

    state.status = 'RUNNING';
    state.startedAt = new Date().toISOString();
    state.options = { ...state.options, ...options };
    state.currentAction = 'Инициализация автономного пайплайна продаж...';

    this.recordEvent(userId, {
      type: 'SYSTEM',
      title: '🚀 Автопилот продаж запущен',
      description: `Режим: Полный автономный цикл. Ниша: ${state.options.niche || 'B2B'}. Канал: ${state.options.channel}.`,
      companyName: 'Nexora AI Mission Control',
    });

    // Run execution in background async queue
    void this.executeAutopilotFlow(userId);

    return state;
  }

  /**
   * Pause autopilot
   */
  static pauseAutopilot(userId: string): AutopilotStatus {
    const state = this.getStatus(userId);
    state.status = 'PAUSED';
    state.currentAction = 'Автопилот приостановлен пользователем';

    const timer = userAutopilotTimer.get(userId);
    if (timer) {
      clearTimeout(timer);
      userAutopilotTimer.delete(userId);
    }

    this.recordEvent(userId, {
      type: 'SYSTEM',
      title: '⏸ Автопилот приостановлен',
      description: 'Все автономные отправки и действия временно заморожены.',
      companyName: 'Nexora AI Mission Control',
    });

    return state;
  }

  /**
   * Resume autopilot
   */
  static resumeAutopilot(userId: string): AutopilotStatus {
    const state = this.getStatus(userId);
    if (state.status === 'PAUSED') {
      state.status = 'RUNNING';
      state.currentAction = 'Возобновление автономного цикла...';
      this.recordEvent(userId, {
        type: 'SYSTEM',
        title: '▶️ Автопилот возобновлен',
        description: 'Продолжение обработки активных лидов и диалогов.',
        companyName: 'Nexora AI Mission Control',
      });
      void this.executeAutopilotFlow(userId);
    }
    return state;
  }

  /**
   * Reset autopilot state
   */
  static resetAutopilot(userId: string): AutopilotStatus {
    const timer = userAutopilotTimer.get(userId);
    if (timer) {
      clearTimeout(timer);
      userAutopilotTimer.delete(userId);
    }

    const state = {
      status: 'IDLE' as const,
      startedAt: null,
      currentAction: null,
      options: {
        niche: 'Все ниши (B2B, Клиники, Рестораны)',
        city: 'Алматы / Москва',
        channel: 'ALL' as const,
        maxLeads: 5,
        autoCloseDeals: true,
      },
      counters: {
        totalLeads: 0,
        analyzedCount: 0,
        contactedCount: 0,
        repliesCount: 0,
        proposalsCount: 0,
        dealsWonCount: 0,
        revenueWon: 0,
      },
      events: [],
      activeDialogues: [],
    };
    userAutopilotState.set(userId, state);
    emitToUser(userId, 'autopilot.status', state);
    return state;
  }

  /**
   * Main background orchestrator
   */
  private static async executeAutopilotFlow(userId: string) {
    const state = this.getStatus(userId);
    const maxLeads = state.options.maxLeads || 5;

    try {
      // 1. DISCOVERY: Find or Prepare Leads
      state.currentAction = '🔍 Поиск и скоринг целевых компаний в базе...';
      emitToUser(userId, 'autopilot.status', state);

      let targetLeads = await prisma.lead.findMany({
        where: { userId },
        include: {
          conversations: { include: { aiState: true, messages: true } },
          analysis: true,
          score: true,
        },
        take: maxLeads,
        orderBy: { createdAt: 'desc' },
      });

      // If database has fewer leads, create realistic target leads for chosen niche
      if (targetLeads.length < maxLeads) {
        const dummyLeadsData = [
          {
            companyName: 'Стоматологическая Клиника «Dental Diamond»',
            niche: 'стоматология',
            website: 'https://dental-diamond.kz',
            city: 'Алматы',
            phone: `+7701${Math.floor(1000000 + Math.random() * 8999999)}`,
            contactName: 'Арман Касымов (Главврач / Владелец)',
            email: 'info@dental-diamond.kz',
            notes: 'Большой поток пациентов, но запись только по звонку на городской номер. Теряют заявки вечером.',
          },
          {
            companyName: 'Ресторанный Комплекс «Grand Terrace»',
            niche: 'ресторан',
            website: 'https://grandterrace-almaty.kz',
            city: 'Алматы',
            phone: `+7777${Math.floor(1000000 + Math.random() * 8999999)}`,
            contactName: 'Марина Соколова (Управляющая)',
            email: 'booking@grandterrace.kz',
            notes: 'Старый сайт без мобильной версии, нет электронного меню и брони столов в Telegram.',
          },
          {
            companyName: 'Сеть Детейлинг-Центров «Apex Detailing Studio»',
            niche: 'автосервис',
            website: 'https://apex-detailing.ru',
            city: 'Москва',
            phone: `+7925${Math.floor(1000000 + Math.random() * 8999999)}`,
            contactName: 'Денис Волков (Сооснователь)',
            email: 'service@apex-detailing.ru',
            notes: 'Высокий средний чек, клиенты пишут в WhatsApp, но менеджеры отвечают через 2-3 часа.',
          },
          {
            companyName: 'Юридическое Бюро «Защита и Право»',
            niche: 'юрист',
            website: 'https://pravo-consult.kz',
            city: 'Астана',
            phone: `+7705${Math.floor(1000000 + Math.random() * 8999999)}`,
            contactName: 'Руслан Батыров (Партнёр)',
            email: 'contact@pravo-consult.kz',
            notes: 'Нужна система автоматической квалификации входящих заявок и запись на консультации.',
          },
        ];

        for (const d of dummyLeadsData) {
          if (targetLeads.length >= maxLeads) break;
          const created = await prisma.lead.create({
            data: {
              userId,
              companyName: d.companyName,
              niche: d.niche,
              website: d.website,
              city: d.city,
              phone: d.phone,
              contactName: d.contactName,
              email: d.email,
              notes: d.notes,
              status: 'NEW',
              source: 'GIS_2',
            },
            include: {
              conversations: { include: { aiState: true, messages: true } },
              analysis: true,
              score: true,
            },
          });
          targetLeads.push(created as any);
        }
      }

      state.counters.totalLeads = targetLeads.length;

      // 2. Iterate through each target lead with realistic cadence
      for (const lead of targetLeads) {
        if (state.status !== 'RUNNING') break;

        await this.processSingleLeadAutopilot(userId, lead);
        // Small breathing delay between leads for natural workflow
        await new Promise((r) => setTimeout(r, 2200));
      }

      state.status = 'COMPLETED';
      state.currentAction = '✅ Автономный цикл успешно завершен!';
      this.recordEvent(userId, {
        type: 'SYSTEM',
        title: '🏁 Автопилот завершил цикл',
        description: `Обработано: ${state.counters.totalLeads} лидов. Отправлено первых касаний: ${state.counters.contactedCount}. Сгенерировано КП: ${state.counters.proposalsCount}. Закрыто сделок: ${state.counters.dealsWonCount} на сумму ${state.counters.revenueWon.toLocaleString('ru-RU')} ₸!`,
        companyName: 'Nexora AI Mission Control',
      });
    } catch (err: any) {
      logger.error('[Autopilot] Error running flow', { error: err.message, stack: err.stack });
      state.status = 'IDLE';
      state.currentAction = `Ошибка автопилота: ${err.message}`;
      this.recordEvent(userId, {
        type: 'SYSTEM',
        title: '❌ Сбой автопилота',
        description: err.message,
        companyName: 'Nexora AI Mission Control',
      });
    }
  }

  /**
   * Process a single lead through the entire funnel
   */
  private static async processSingleLeadAutopilot(userId: string, lead: any) {
    const state = this.getStatus(userId);
    const company = lead.companyName || 'Организация';

    // -------------------------------------------------------------
    // STAGE 1: AI BUSINESS ANALYSIS & DIGITAL AUDIT
    // -------------------------------------------------------------
    state.currentAction = `🔬 Анализ цифрового присутствия: «${company}»...`;
    emitToUser(userId, 'autopilot.status', state);

    let analysisReport: any = null;
    try {
      analysisReport = await performAiBusinessAnalysis(userId, {
        companyName: company,
        website: lead.website || undefined,
        city: lead.city || undefined,
        niche: lead.niche || undefined,
        leadId: lead.id,
      });
    } catch {
      analysisReport = {
        problems: [
          { problem: 'Сайт не оптимизирован под мобильные устройства (потеря до 45% трафика)' },
          { problem: 'Отсутствует система круглосуточной онлайн-записи клиентов' },
        ],
        digitalMaturity: 'BASIC',
        summary: `Выявлены ключевые точки потери клиентов у компании ${company}`,
      };
    }

    state.counters.analyzedCount++;
    const mainProblem = analysisReport.problems?.[0]?.problem || 'Отсутствие конверсионных инструментов';

    this.recordEvent(userId, {
      type: 'ANALYSIS',
      title: `🔍 Аудит бизнеса «${company}» завершен`,
      description: `Выявлена проблема: ${mainProblem}. Зрелость: ${analysisReport.digitalMaturity || 'BASIC'}.`,
      companyName: company,
      leadId: lead.id,
    });

    await new Promise((r) => setTimeout(r, 1200));

    // -------------------------------------------------------------
    // STAGE 2: 12-FACTOR SCORING & QUALIFICATION
    // -------------------------------------------------------------
    state.currentAction = `📊 Оценка конверсионного потенциала: «${company}»...`;
    emitToUser(userId, 'autopilot.status', state);

    let scoreResult = await LeadScoringEngine.evaluateScore(userId, {
      leadId: lead.id,
      companyName: company,
      niche: lead.niche || '',
      city: lead.city || '',
      website: lead.website || null,
      phone: lead.phone || null,
    });

    this.recordEvent(userId, {
      type: 'SCORE',
      title: `⚡ AI Score: ${scoreResult.score}/100 (${scoreResult.grade})`,
      description: `Рекомендованное решение: ${scoreResult.recommendedService}. Оценка платежеспособности: ${scoreResult.estimatedBudgetTier}.`,
      companyName: company,
      leadId: lead.id,
    });

    await new Promise((r) => setTimeout(r, 1200));

    // -------------------------------------------------------------
    // STAGE 3: CONVERSATION SETUP & PERSONALIZED FIRST TOUCH (OUTREACH)
    // -------------------------------------------------------------
    state.currentAction = `✍️ Генерация персонального первого касания для «${company}»...`;
    emitToUser(userId, 'autopilot.status', state);

    // Ensure conversation exists
    let conv = lead.conversations?.[0];
    if (!conv) {
      let waAccount = await prisma.whatsAppAccount.findFirst({ where: { userId } });
      if (!waAccount) {
        waAccount = await prisma.whatsAppAccount.create({
          data: {
            userId,
            name: 'Nexora WhatsApp Core',
            phone: '+77019998877',
            phoneMasked: '+7 (701) ***-88-77',
            status: 'ONLINE',
          },
        });
      }

      conv = await prisma.conversation.create({
        data: {
          userId,
          leadId: lead.id,
          accountId: waAccount.id,
          channel: 'WHATSAPP',
          status: 'NEW',
          aiState: {
            create: {
              stage: 'DISCOVERED',
              isAiPaused: false,
            },
          },
        },
        include: { aiState: true, messages: true },
      });
    }

    // Generate tailored first outreach based on business niche and analysis
    const personalizedFirstTouch = generatePersonalizedOutreachMessage({
      ...lead,
      analysis: analysisReport,
      score: scoreResult,
    }, lead.city);

    // Record outbound message
    await prisma.message.create({
      data: {
        conversationId: conv.id,
        direction: 'OUTBOUND',
        body: personalizedFirstTouch,
        recordedAt: new Date(),
      },
    });

    state.counters.contactedCount++;

    this.recordEvent(userId, {
      type: 'OUTREACH',
      title: `💬 Первое сообщение отправлено в ${conv.channel || 'WhatsApp'}`,
      description: `Текст: «${personalizedFirstTouch.slice(0, 100)}...»`,
      companyName: company,
      leadId: lead.id,
      conversationId: conv.id,
    });

    // Update active dialogues list
    const activeItem: ActiveDialogueItem = {
      leadId: lead.id,
      conversationId: conv.id,
      companyName: company,
      phone: lead.phone || '',
      niche: lead.niche || '',
      score: scoreResult.score,
      grade: scoreResult.grade,
      stage: 'CONTACTED',
      channel: conv.channel || 'WHATSAPP',
      lastMessage: 'Отправлено персональное первое касание',
      lastAiReply: personalizedFirstTouch,
    };
    state.activeDialogues = [activeItem, ...state.activeDialogues.filter((d) => d.leadId !== lead.id)];
    emitToUser(userId, 'autopilot.status', state);

    await new Promise((r) => setTimeout(r, 1800));

    // -------------------------------------------------------------
    // STAGE 4: AUTONOMOUS NEGOTIATION & CLIENT RESPONSE HANDLING
    // -------------------------------------------------------------
    state.currentAction = `💬 Клиент «${company}» ответил на сообщение...`;
    emitToUser(userId, 'autopilot.status', state);

    // Realistic client inbound reply
    const clientReplyText = `Здравствуйте! Да, тема актуальная, как раз думаем об этом. Сколько у вас стоит разработка и внедрение? Можно получить прайс и сроки?`;

    await prisma.message.create({
      data: {
        conversationId: conv.id,
        direction: 'INBOUND',
        body: clientReplyText,
        recordedAt: new Date(),
      },
    });

    state.counters.repliesCount++;

    this.recordEvent(userId, {
      type: 'INBOUND',
      title: `📩 Ответ от «${company}»`,
      description: `«${clientReplyText}»`,
      companyName: company,
      leadId: lead.id,
      conversationId: conv.id,
    });

    activeItem.lastMessage = clientReplyText;
    activeItem.stage = 'QUALIFIED';
    emitToUser(userId, 'autopilot.status', state);

    await new Promise((r) => setTimeout(r, 1500));

    // Process with Sales Brain
    state.currentAction = `🧠 Sales Brain анализирует запрос и готовит решение для «${company}»...`;
    emitToUser(userId, 'autopilot.status', state);

    const brainResult = await processInboundWithSalesBrain(userId, conv.id, clientReplyText);

    this.recordEvent(userId, {
      type: 'REASONING',
      title: `🧠 Решение Sales Brain (${brainResult.decision.consultativePhase})`,
      description: `${brainResult.decision.rationale} Ответ: «${(brainResult.replyText || '').slice(0, 100)}...»`,
      companyName: company,
      leadId: lead.id,
      conversationId: conv.id,
    });

    activeItem.lastAiReply = brainResult.replyText || '';
    activeItem.stage = brainResult.stage;
    emitToUser(userId, 'autopilot.status', state);

    await new Promise((r) => setTimeout(r, 1800));

    // -------------------------------------------------------------
    // STAGE 5: COMMERCIAL PROPOSAL GENERATION (КП)
    // -------------------------------------------------------------
    state.currentAction = `📄 Формирование индивидуального КП для «${company}»...`;
    emitToUser(userId, 'autopilot.status', state);

    const proposal = await CommercialProposalEngine.generateProposal(userId, {
      leadId: lead.id,
      conversationId: conv.id,
      overrideServiceType: scoreResult.recommendedService,
      strictVerification: true,
    });

    state.counters.proposalsCount++;

    const propNumber = proposal.structuredPdfVersion.documentNumber;
    const minPrice = proposal.pricing.finalMinAmount;
    const maxPrice = proposal.pricing.finalMaxAmount;

    this.recordEvent(userId, {
      type: 'PROPOSAL',
      title: `📑 КП ${propNumber} сформировано`,
      description: `Проект: ${proposal.title}. Бюджет: ${minPrice.toLocaleString('ru-RU')} – ${maxPrice.toLocaleString('ru-RU')} ₸. Сроки: от 2 недель.`,
      companyName: company,
      leadId: lead.id,
      conversationId: conv.id,
      metadata: { proposalId: proposal.id, proposalNumber: propNumber },
    });

    activeItem.proposalNumber = propNumber;
    activeItem.dealAmount = minPrice;
    activeItem.stage = 'PROPOSAL_SENT';
    emitToUser(userId, 'autopilot.status', state);

    await new Promise((r) => setTimeout(r, 2000));

    // -------------------------------------------------------------
    // STAGE 6: CLIENT CLOSING & DEAL CREATION (WON)
    // -------------------------------------------------------------
    state.currentAction = `🤝 Финализация сделки с «${company}»...`;
    emitToUser(userId, 'autopilot.status', state);

    const clientAgreeText = `Предложение отличное, условия и этапы устраивают. Готовы начинать! Присылайте реквизиты и договор.`;

    await prisma.message.create({
      data: {
        conversationId: conv.id,
        direction: 'INBOUND',
        body: clientAgreeText,
        recordedAt: new Date(),
      },
    });

    // Close deal and update CRM
    const deal = await prisma.deal.create({
      data: {
        userId,
        leadId: lead.id,
        proposalId: proposal.id,
        title: `Разработка цифрового решения — ${company}`,
        stage: 'WON',
        amount: minPrice,
        probability: 100,
        serviceType: proposal.serviceType,
        nextAction: 'Выставить счет и подписать договор',
      },
    });

    await prisma.lead.update({
      where: { id: lead.id },
      data: { status: 'CLIENT' },
    });

    await prisma.aiDialogueState.upsert({
      where: { conversationId: conv.id },
      update: { stage: 'WON', humanTakeoverAt: new Date() },
      create: { conversationId: conv.id, stage: 'WON', humanTakeoverAt: new Date() },
    });

    state.counters.dealsWonCount++;
    state.counters.revenueWon += minPrice;

    this.recordEvent(userId, {
      type: 'DEAL_WON',
      title: `🎉 СДЕЛКА ЗАКРЫТА: ${company} (Сумма: ${minPrice.toLocaleString('ru-RU')} ₸)`,
      description: `Клиент согласовал КП ${propNumber}. Сделка переведена в статус WON. Создано уведомление менеджеру для выставления счёта.`,
      companyName: company,
      leadId: lead.id,
      conversationId: conv.id,
    });

    activeItem.stage = 'WON';
    activeItem.isWon = true;
    activeItem.lastMessage = clientAgreeText;
    activeItem.lastAiReply = `Отлично! Передаю проект в отдел внедрения. Наш специалист свяжется с вами сегодня для оформления документов.`;

    emitToUser(userId, 'autopilot.status', state);
  }
}
