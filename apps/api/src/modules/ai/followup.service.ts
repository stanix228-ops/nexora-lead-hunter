import { prisma } from '@nexora/database';
import type {
  FollowUpEnginePlanRequest,
  FollowUpEnginePlanResult,
  PlannedFollowUpItem,
  FollowUpStepStrategy,
  FollowUpPauseReason,
  FollowUpExecuteRequest,
  FollowUpExecuteResult,
  LeadGrade,
  UrgencyLevel,
} from '@nexora/types';
import { logger } from '../../common/logger';
import { recordTimelineEvent, recordClientMemory } from '../crm/crm.service';
import { sendViaGateway } from '../gateway/gateway.service';
import { emitToUser } from '../../common/realtime/socket';
import { assertAiPermission } from '../../common/security/permissions';

// ============================================================================
// 1. FollowUp Engine Class
// ============================================================================

export class FollowUpEngine {
  /**
   * Evaluates context (deal stage, last message, pause reason, urgency, lead score, last contact time)
   * and autonomously plans the 3-step consultative follow-up sequence.
   * If client opted out, cancels all follow-ups immediately.
   */
  static async planFollowUps(
    userId: string,
    request: FollowUpEnginePlanRequest,
  ): Promise<FollowUpEnginePlanResult> {
    const startTime = Date.now();
    const { conversationId, leadId, forceRecalculate, customPauseReason } = request;

    // Security check: Enforce AI_FOLLOWUP permission
    await assertAiPermission(userId, 'AI_FOLLOWUP', `Планирование follow-up для диалога ${conversationId}`);

    // 1. Fetch Conversation, Lead, Messages, Score & Analysis
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      include: {
        lead: {
          include: {
            analysis: true,
            score: true,
            proposals: { take: 1, orderBy: { createdAt: 'desc' } },
            deals: { take: 1, orderBy: { createdAt: 'desc' } },
            clientMemories: { take: 20, orderBy: { createdAt: 'desc' } },
          },
        },
        aiState: true,
        messages: { take: 10, orderBy: { recordedAt: 'desc' } },
        followUps: { orderBy: { stepNumber: 'asc' } },
      },
    });

    if (!conversation) {
      throw new Error(`Conversation with ID ${conversationId} not found.`);
    }

    const lead = conversation.lead;
    const aiState = conversation.aiState;
    const lastMessage = conversation.messages[0];
    const deal = lead.deals[0];
    const proposal = lead.proposals[0];
    const businessAnalysis = lead.analysis;
    const leadScore = lead.score;

    const companyName = lead.companyName || 'Ваша компания';
    const niche = lead.niche || 'бизнес';
    const city = lead.city || 'Казахстан / СНГ';
    const contactName = lead.contactName || '';

    // 2. Strict Opt-Out Check & Safety Halt
    const lastMsgText = lastMessage?.body?.toLowerCase() || '';
    const isExplicitOptOut =
      aiState?.isAiPaused === true ||
      lead.status === 'NO_RESPONSE' ||
      lastMsgText.includes('не пишите') ||
      lastMsgText.includes('спам') ||
      lastMsgText.includes('стоп') ||
      lastMsgText.includes('отстаньте') ||
      lastMsgText.includes('удалите номер');

    if (isExplicitOptOut) {
      // Cancel all existing pending follow-up jobs
      await prisma.followUpJob.updateMany({
        where: { conversationId, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });

      await prisma.aiDialogueState.upsert({
        where: { conversationId },
        update: { isAiPaused: true, nextFollowUpAt: null },
        create: { conversationId, isAiPaused: true, nextFollowUpAt: null },
      });

      if (lead.status !== 'NO_RESPONSE') {
        await prisma.lead.update({
          where: { id: lead.id },
          data: { status: 'NO_RESPONSE' },
        });
      }

      logger.info(`[FollowUpEngine] Opt-Out detected for lead ${lead.id}. All follow-ups halted.`, {
        conversationId,
      });

      return {
        isOptedOut: true,
        reasonCancelled: 'Клиент запросил прекращение коммуникации (Opt-Out). Все последующие фоллоу-апы отключены.',
        plannedFollowUps: [],
        nextScheduledFollowUp: null,
        aiConfidence: 1.0,
        pauseReason: 'OPT_OUT',
        crmTaskCreated: false,
        summary: 'Коммуникация полностью остановлена, AI заблокирован.',
      };
    }

    // 3. Determine Underlying Pause Reason
    const pauseReason: FollowUpPauseReason =
      customPauseReason || this.detectPauseReason(conversation, proposal, deal, lastMessage);

    // 4. Calculate Urgency, Lead Grade & Intervals
    const urgency: UrgencyLevel = (leadScore?.urgency as UrgencyLevel) || 'MEDIUM';
    const leadGrade: LeadGrade = (leadScore?.grade as LeadGrade) || 'WARM';

    // Interval hours based on urgency & grade
    const step1Hours = urgency === 'HIGH' ? 8 : urgency === 'MEDIUM' ? 24 : 48;
    const step2Hours = urgency === 'HIGH' ? 32 : urgency === 'MEDIUM' ? 72 : 120;
    const step3Hours = urgency === 'HIGH' ? 72 : urgency === 'MEDIUM' ? 144 : 240;

    const baseDate = lastMessage?.recordedAt ? new Date(lastMessage.recordedAt) : new Date();

    const dateStep1 = this.calculateWorkingHoursTime(new Date(baseDate.getTime() + step1Hours * 3600 * 1000));
    const dateStep2 = this.calculateWorkingHoursTime(new Date(baseDate.getTime() + step2Hours * 3600 * 1000));
    const dateStep3 = this.calculateWorkingHoursTime(new Date(baseDate.getTime() + step3Hours * 3600 * 1000));

    // 5. Compose the 3-Step Consultative Messages
    const serviceName = proposal?.serviceType || leadScore?.recommendedService || 'Web-сервис и автоматизация';
    const mainPain =
      (businessAnalysis?.foundProblems as string[])?.[0] || 'медленный сбор заявок и потеря ночного трафика';

    const step1Message = this.generateStep1ContextReminder({
      companyName,
      contactName,
      niche,
      serviceName,
      mainPain,
      pauseReason,
      proposalNumber: (proposal?.scope as any)?.documentNumber,
    });

    const step2Message = this.generateStep2ValueAddition({
      companyName,
      contactName,
      niche,
      serviceName,
      mainPain,
      pauseReason,
    });

    const step3Message = this.generateStep3ConcreteNextStep({
      companyName,
      contactName,
      niche,
      serviceName,
      mainPain,
      pauseReason,
    });

    const channel = conversation.channel === 'TELEGRAM' ? 'TELEGRAM' : 'WHATSAPP';
    const dealStage = deal?.stage || aiState?.stage || 'DISCOVERY';

    const plannedItems: PlannedFollowUpItem[] = [
      {
        conversationId,
        leadId: lead.id,
        stepNumber: 1,
        strategy: 'STEP_1_CONTEXT_REMINDER',
        scheduledFor: dateStep1.toISOString(),
        reason: this.formatReasonDescription(pauseReason, 1),
        channel,
        message: step1Message,
        status: 'PENDING',
        dealStage,
        urgency,
        leadGrade,
        createdAt: new Date().toISOString(),
      },
      {
        conversationId,
        leadId: lead.id,
        stepNumber: 2,
        strategy: 'STEP_2_VALUE_ADDITION',
        scheduledFor: dateStep2.toISOString(),
        reason: this.formatReasonDescription(pauseReason, 2),
        channel,
        message: step2Message,
        status: 'PENDING',
        dealStage,
        urgency,
        leadGrade,
        createdAt: new Date().toISOString(),
      },
      {
        conversationId,
        leadId: lead.id,
        stepNumber: 3,
        strategy: 'STEP_3_CONCRETE_NEXT_STEP',
        scheduledFor: dateStep3.toISOString(),
        reason: this.formatReasonDescription(pauseReason, 3),
        channel,
        message: step3Message,
        status: 'PENDING',
        dealStage,
        urgency,
        leadGrade,
        createdAt: new Date().toISOString(),
      },
    ];

    // 6. Save or Update in Database
    // Cancel old pending jobs first if recalculating
    await prisma.followUpJob.updateMany({
      where: { conversationId, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });

    // Create Step 1 Job in Database
    const nextJob = await prisma.followUpJob.create({
      data: {
        conversationId,
        leadId: lead.id,
        stepNumber: 1,
        scheduledFor: dateStep1,
        status: 'PENDING',
        reason: plannedItems[0]!.reason,
        channel,
        messageTemplate: plannedItems[0]!.message,
        metadata: {
          pauseReason,
          urgency,
          leadGrade,
          strategy: 'STEP_1_CONTEXT_REMINDER',
        },
      },
    });
    plannedItems[0]!.id = nextJob.id;

    // Update AI State & Deal with Next Action
    await prisma.aiDialogueState.upsert({
      where: { conversationId },
      update: {
        followUpStep: 1,
        nextFollowUpAt: dateStep1,
      },
      create: {
        conversationId,
        followUpStep: 1,
        nextFollowUpAt: dateStep1,
      },
    });

    if (deal) {
      await prisma.deal.update({
        where: { id: deal.id },
        data: {
          followUpDate: dateStep1,
          nextAction: `Follow-up (Шаг 1): ${plannedItems[0]!.reason}`,
        },
      });
    }

    // 7. Log Action in Timeline & Audit
    await recordTimelineEvent({
      userId,
      leadId: lead.id,
      conversationId,
      dealId: deal?.id,
      eventType: 'FOLLOW_UP_SCHEDULED',
      title: `Запланирован Follow-up (Шаг 1 из 3)`,
      description: `Причина: ${plannedItems[0]!.reason}. Дата: ${dateStep1.toLocaleString('ru-RU')}. Канал: ${channel}.`,
      metadata: {
        jobId: nextJob.id,
        pauseReason,
        scheduledFor: dateStep1.toISOString(),
        step: 1,
      },
    });

    await prisma.aiAuditLog.create({
      data: {
        userId,
        leadId: lead.id,
        conversationId,
        actionType: 'FOLLOW_UP',
        modelUsed: 'FOLLOW_UP_ENGINE_V1',
        executionTimeMs: Date.now() - startTime,
        inputSnapshot: {
          conversationId,
          dealStage,
          pauseReason,
          urgency,
          leadGrade,
        },
        outputSnapshot: {
          jobId: nextJob.id,
          step: 1,
          scheduledFor: dateStep1.toISOString(),
          messageSnippet: step1Message.slice(0, 100),
        },
      },
    });

    // Notify Realtime WebSocket Clients
    emitToUser(userId, 'followup:scheduled', {
      jobId: nextJob.id,
      leadId: lead.id,
      conversationId,
      scheduledFor: dateStep1.toISOString(),
      step: 1,
    });

    return {
      isOptedOut: false,
      plannedFollowUps: plannedItems,
      nextScheduledFollowUp: plannedItems[0],
      aiConfidence: 0.95,
      pauseReason,
      crmTaskCreated: true,
      crmTaskId: nextJob.id,
      summary: `Сформирована 3-шаговая цепочка фоллоу-апов. Ближайший контакт запланирован на ${dateStep1.toLocaleString('ru-RU')}.`,
    };
  }

  // ==========================================================================
  // 2. Execution & Dispatch Flow
  // ==========================================================================

  /**
   * Executes a scheduled follow-up job: sends the message via channel gateway,
   * marks job as SENT, logs timeline event, and automatically schedules the next step.
   */
  static async executeFollowUp(
    userId: string,
    request: FollowUpExecuteRequest,
  ): Promise<FollowUpExecuteResult> {
    const { followUpJobId, overrideMessage, markAsSentOnly = false } = request;

    // Security check: Enforce AI_FOLLOWUP permission
    await assertAiPermission(userId, 'AI_FOLLOWUP', `Отправка follow-up сообщения для задачи ${followUpJobId}`);

    const job = await prisma.followUpJob.findUnique({
      where: { id: followUpJobId },
      include: {
        conversation: {
          include: {
            lead: true,
            account: true,
          },
        },
      },
    });

    if (!job) {
      throw new Error(`FollowUp job with ID ${followUpJobId} not found.`);
    }

    if (job.status === 'CANCELLED') {
      throw new Error(`Cannot execute cancelled follow-up job.`);
    }

    const messageToSend = overrideMessage || job.messageTemplate || '';
    const conversation = job.conversation;
    const lead = conversation.lead;

    // 1. Send via WhatsApp / Telegram Gateway (if not marked as sent only)
    if (!markAsSentOnly && conversation.lead.phone) {
      try {
        await sendViaGateway(userId, conversation.id, messageToSend);
      } catch (err: any) {
        logger.error(`[FollowUpEngine] Failed to dispatch follow-up via gateway: ${err.message}`, {
          jobId: job.id,
        });
      }
    }

    // 2. Record Outgoing Message in Conversation
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'OUTBOUND',
        body: messageToSend,
        intent: 'FOLLOW_UP',
      },
    });

    // 3. Update FollowUp Job Status
    const now = new Date();
    await prisma.followUpJob.update({
      where: { id: job.id },
      data: {
        status: 'SENT',
        sentAt: now,
        actualMessageSent: messageToSend,
      },
    });

    // 4. Update Conversation AI State
    await prisma.aiDialogueState.updateMany({
      where: { conversationId: conversation.id },
      data: {
        lastAiReplyAt: now,
        followUpStep: job.stepNumber,
      },
    });

    // 5. Record Timeline & Memory
    await recordTimelineEvent({
      userId,
      leadId: lead.id,
      conversationId: conversation.id,
      eventType: 'MESSAGE_SENT',
      title: `Отправлен Follow-up (Шаг ${job.stepNumber})`,
      description: messageToSend.slice(0, 200),
      metadata: {
        jobId: job.id,
        stepNumber: job.stepNumber,
        channel: job.channel,
      },
    });

    await recordClientMemory({
      leadId: lead.id,
      conversationId: conversation.id,
      layer: 'INTERACTION_FACT',
      key: `followup_step_${job.stepNumber}_sent`,
      value: `Отправлен follow-up шаг ${job.stepNumber}: "${messageToSend.slice(0, 100)}..."`,
      confidence: 1.0,
      source: 'AI',
    });

    // 6. Schedule Next Step in Sequence if step < 3
    let nextPlanned: PlannedFollowUpItem | null = null;
    if (job.stepNumber < 3) {
      const planRes = await this.planFollowUps(userId, {
        conversationId: conversation.id,
        leadId: lead.id,
      });
      nextPlanned = planRes.plannedFollowUps.find((p) => p.stepNumber === job.stepNumber + 1) || null;
    }

    return {
      success: true,
      jobId: job.id,
      sentMessageText: messageToSend,
      sentAt: now.toISOString(),
      channel: job.channel,
      nextFollowUpScheduled: nextPlanned,
    };
  }

  // ==========================================================================
  // 3. Pause Reason Detection
  // ==========================================================================

  private static detectPauseReason(
    conv: any,
    proposal: any,
    deal: any,
    lastMsg: any,
  ): FollowUpPauseReason {
    const text = lastMsg?.body?.toLowerCase() || '';

    if (text.includes('дорого') || text.includes('цена') || text.includes('бюджет')) {
      return 'THINKING_ABOUT_PRICE';
    }
    if (text.includes('директор') || text.includes('шеф') || text.includes('руководител') || text.includes('совещани')) {
      return 'DISCUSSING_WITH_BOSS';
    }
    if (text.includes('сравнива') || text.includes('тендер') || text.includes('другие вариант')) {
      return 'COMPARING_COMPETITORS';
    }
    if (text.includes('занят') || text.includes('не сейчас') || text.includes('позже') || text.includes('следующ')) {
      return 'BUSY_OPERATIONS';
    }
    if (proposal && (deal?.stage === 'PROPOSAL' || conv.aiState?.stage === 'PROPOSAL')) {
      return 'NO_REPLY_AFTER_PROPOSAL';
    }
    if (conv.aiState?.stage === 'DISCOVERY' || !conv.aiState?.discoveryProfile?.need) {
      return 'DISCOVERY_INCOMPLETE';
    }

    return 'GENERAL_SILENCE';
  }

  // ==========================================================================
  // 4. Working Hours Calculation (09:00 - 20:00)
  // ==========================================================================

  private static calculateWorkingHoursTime(target: Date, startHour = 9, endHour = 20): Date {
    const adjusted = new Date(target);
    const hour = adjusted.getHours();

    // If before working hours, set to 09:15 AM
    if (hour < startHour) {
      adjusted.setHours(startHour, 15, 0, 0);
    }
    // If after working hours, move to next morning 09:15 AM
    else if (hour >= endHour) {
      adjusted.setDate(adjusted.getDate() + 1);
      adjusted.setHours(startHour, 15, 0, 0);
    }

    // Skip Sunday to Monday morning
    if (adjusted.getDay() === 0) {
      adjusted.setDate(adjusted.getDate() + 1);
      adjusted.setHours(startHour, 15, 0, 0);
    }

    return adjusted;
  }

  // ==========================================================================
  // 5. 3-Step Message Composition (Context -> Value -> Next Step)
  // ==========================================================================

  private static generateStep1ContextReminder(ctx: {
    companyName: string;
    contactName: string;
    niche: string;
    serviceName: string;
    mainPain: string;
    pauseReason: FollowUpPauseReason;
    proposalNumber?: string;
  }): string {
    const greeting = ctx.contactName ? `Здравствуйте, ${ctx.contactName}!` : `Здравствуйте!`;

    switch (ctx.pauseReason) {
      case 'NO_REPLY_AFTER_PROPOSAL':
        return `${greeting} На связи команда Nexora. Ранее отправляли вам персональное предложение${ctx.proposalNumber ? ` (№${ctx.proposalNumber})` : ''} для «${ctx.companyName}». Удалось ли ознакомиться со сметой и дорожной картой проекта?`;

      case 'THINKING_ABOUT_PRICE':
        return `${greeting} Возвращаюсь к нашему диалогу по «${ctx.companyName}». Понимаю, что нужно взвесить бюджет. Подскажите, удалось ли посмотреть расчет окупаемости и вариант с поэтапной оплатой (50/50)?`;

      case 'DISCUSSING_WITH_BOSS':
        return `${greeting} Подскажите, удалось ли обсудить проект с руководством «${ctx.companyName}»? Если требуются дополнительные материалы или краткая 1-страничная выжимка для встречи — с радостью подготовим!`;

      case 'COMPARING_COMPETITORS':
        return `${greeting} Как продвигается выбор IT-подрядчика для «${ctx.companyName}»? Если остались технические вопросы по скорости загрузки или интеграциям — я на связи.`;

      case 'BUSY_OPERATIONS':
        return `${greeting} Пишу, как и договаривались, когда спадет операционная нагрузка. Актуально ли сейчас вернуться к вопросу цифровизации «${ctx.companyName}»?`;

      default:
        return `${greeting} На связи IT-студия Nexora по проекту для «${ctx.companyName}». Удалось ли взглянуть на наше предыдущее сообщение по решению задачи (${ctx.mainPain})?`;
    }
  }

  private static generateStep2ValueAddition(ctx: {
    companyName: string;
    contactName: string;
    niche: string;
    serviceName: string;
    mainPain: string;
    pauseReason: FollowUpPauseReason;
  }): string {
    const greeting = ctx.contactName ? `Добрый день, ${ctx.contactName}!` : `Добрый день!`;

    switch (ctx.pauseReason) {
      case 'NO_REPLY_AFTER_PROPOSAL':
        return `${greeting} Подготовили для сферы «${ctx.niche}» краткую инфографику с разбором: как современные Web-приложения на Next.js и Telegram Mini App снижают стоимость привлечения лида на 30–40%. Могу отправить ссылку взглянуть?`;

      case 'THINKING_ABOUT_PRICE':
        return `${greeting} Чтобы снизить нагрузку на бюджет «${ctx.companyName}», мы подготовили облегченный сценарий запуска (MVP): ключевой модуль онлайн-записи запускается за 10 дней и окупает себя уже в первый месяц. Прислать скорректированную смету?`;

      default:
        return `${greeting} Недавно оцифровали похожий кейс в сфере «${ctx.niche}»: внедрение 24/7 авто-ответов в WhatsApp помогло сократить потери ночных обращений на 85%. Хотите посмотреть, как это реализовано?`;
    }
  }

  private static generateStep3ConcreteNextStep(ctx: {
    companyName: string;
    contactName: string;
    niche: string;
    serviceName: string;
    mainPain: string;
    pauseReason: FollowUpPauseReason;
  }): string {
    const greeting = ctx.contactName ? `Приветствую, ${ctx.contactName}!` : `Приветствую!`;

    return `${greeting} Мы на этой неделе финализируем производственный график на следующий спринт разработки. Чтобы забронировать даты запуска для «${ctx.companyName}», предлагаю выйти на 10 минут в Zoom/Telegram — наглядно покажем прототип и ответим на все вопросы. Удобно завтра в 11:00 или в 15:00?`;
  }

  private static formatReasonDescription(reason: FollowUpPauseReason, step: number): string {
    const stepLabel =
      step === 1 ? 'Контекст & Эмпатия' : step === 2 ? 'Дополнительная ценность & Инсайт' : 'Конкретный следующий шаг';

    switch (reason) {
      case 'NO_REPLY_AFTER_PROPOSAL':
        return `Нет ответа после отправки КП (${stepLabel})`;
      case 'THINKING_ABOUT_PRICE':
        return `Клиент взял паузу по стоимости/бюджету (${stepLabel})`;
      case 'DISCUSSING_WITH_BOSS':
        return `Ожидание согласования с руководством (${stepLabel})`;
      case 'COMPARING_COMPETITORS':
        return `Клиент сравнивает варианты на рынке (${stepLabel})`;
      case 'BUSY_OPERATIONS':
        return `Перенос контакта из-за загруженности (${stepLabel})`;
      case 'DISCOVERY_INCOMPLETE':
        return `Уточнение потребностей и болей бизнеса (${stepLabel})`;
      default:
        return `Регулярный фоллоу-ап (${stepLabel})`;
    }
  }
}

// Backward-compatible wrappers
export async function scheduleNextFollowUp(
  conversationId: string,
  leadId: string,
): Promise<void> {
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (conv) {
    await FollowUpEngine.planFollowUps(conv.userId, { conversationId, leadId });
  }
}

export async function cancelPendingFollowUps(conversationId: string): Promise<void> {
  await prisma.followUpJob.updateMany({
    where: { conversationId, status: 'PENDING' },
    data: { status: 'CANCELLED' },
  });
  await prisma.aiDialogueState.updateMany({
    where: { conversationId },
    data: { nextFollowUpAt: null },
  });
}
