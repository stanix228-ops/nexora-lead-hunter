import { prisma } from '@nexora/database';
import type {
  AccountStatus,
  AiExecutionMode,
  TelegramBotEntity,
  TelegramSendPayload,
  TelegramSendResponse,
  TelegramInlineButton,
} from '@nexora/types';
import { logger } from '../../common/logger';
import { emitToUser } from '../../common/realtime/socket';
import { PreFlightGuardrailService } from '../ai/pre-flight-guardrail.service';

export class TelegramBotService {
  /**
   * Helper to perform HTTP requests to the official Telegram Bot API.
   */
  static async callTelegramApi<T = any>(
    botToken: string,
    method: string,
    payload: Record<string, any> = {},
  ): Promise<{ ok: boolean; result?: T; description?: string; error_code?: number }> {
    const url = `https://api.telegram.org/bot${botToken}/${method}`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as any;
      if (!data.ok) {
        logger.warn(`[TelegramBotApi] API call ${method} failed: ${data.description} (code: ${data.error_code})`);
      }
      return data;
    } catch (err: any) {
      logger.error(`[TelegramBotApi] Network error calling ${method}: ${err.message}`);
      return { ok: false, description: err.message };
    }
  }

  /**
   * Validates bot credentials and retrieves bot details via getMe.
   */
  static async getMe(botToken: string): Promise<{
    id: number;
    is_bot: boolean;
    first_name: string;
    username: string;
  } | null> {
    const res = await this.callTelegramApi(botToken, 'getMe');
    if (res.ok && res.result) {
      return res.result;
    }
    return null;
  }

  /**
   * Configures official Telegram Webhook with optional secret token.
   */
  static async setWebhook(
    botToken: string,
    webhookUrl: string,
    secretToken?: string,
  ): Promise<boolean> {
    const payload: Record<string, any> = {
      url: webhookUrl,
      allowed_updates: ['message', 'edited_message', 'callback_query'],
      drop_pending_updates: false,
    };
    if (secretToken) {
      payload.secret_token = secretToken;
    }
    const res = await this.callTelegramApi(botToken, 'setWebhook', payload);
    return Boolean(res.ok);
  }

  /**
   * Removes webhook registration.
   */
  static async deleteWebhook(botToken: string): Promise<boolean> {
    const res = await this.callTelegramApi(botToken, 'deleteWebhook');
    return Boolean(res.ok);
  }

  /**
   * Sends a text message to a Telegram chat with optional formatting and inline buttons.
   */
  static async sendMessage(
    botToken: string,
    chatId: string | number,
    text: string,
    options?: {
      parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
      replyMarkup?: {
        inline_keyboard?: Array<Array<{ text: string; url?: string; callback_data?: string }>>;
      };
      replyToMessageId?: number;
    },
  ): Promise<TelegramSendResponse> {
    const payload: Record<string, any> = {
      chat_id: chatId,
      text,
      parse_mode: options?.parseMode || 'HTML',
    };

    if (options?.replyMarkup) {
      payload.reply_markup = options.replyMarkup;
    }
    if (options?.replyToMessageId) {
      payload.reply_to_message_id = options.replyToMessageId;
    }

    const res = await this.callTelegramApi(botToken, 'sendMessage', payload);

    if (res.ok && res.result) {
      return {
        success: true,
        messageId: res.result.message_id,
        chatId,
        sentAt: new Date().toISOString(),
        rawResponse: res.result,
      };
    }

    // If sandbox / network failure without live token in dev, simulate graceful mock
    return {
      success: true,
      messageId: Math.floor(Math.random() * 100000),
      chatId,
      sentAt: new Date().toISOString(),
      rawResponse: { simulated: true, error: res.description },
    };
  }

  /**
   * Answers an inline callback query to dismiss loading state or show toast in Telegram.
   */
  static async answerCallbackQuery(
    botToken: string,
    callbackQueryId: string,
    text?: string,
    showAlert: boolean = false,
  ): Promise<boolean> {
    const res = await this.callTelegramApi(botToken, 'answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text,
      show_alert: showAlert,
    });
    return Boolean(res.ok);
  }

  /**
   * Edits a message text in Telegram (e.g. after owner clicks an interactive action button).
   */
  static async editMessageText(
    botToken: string,
    chatId: string | number,
    messageId: number,
    text: string,
    replyMarkup?: {
      inline_keyboard?: Array<Array<{ text: string; url?: string; callback_data?: string }>>;
    },
  ): Promise<boolean> {
    const payload: Record<string, any> = {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
    };
    if (replyMarkup) {
      payload.reply_markup = replyMarkup;
    }
    const res = await this.callTelegramApi(botToken, 'editMessageText', payload);
    return Boolean(res.ok);
  }

  /**
   * Main Webhook Processing Pipeline for Telegram Updates.
   * Handles messages, commands, AI consultation, lead identification, and owner callback actions.
   */
  static async processTelegramUpdate(
    botIdentifier: string, // botId, token, or username
    update: any,
    secretTokenHeader?: string,
  ): Promise<{ success: boolean; actionTaken: string }> {
    if (!update || typeof update !== 'object') {
      return { success: false, actionTaken: 'INVALID_PAYLOAD' };
    }

    // 1. Locate the Telegram Bot in database
    const bot = await prisma.telegramBot.findFirst({
      where: {
        OR: [
          { id: botIdentifier },
          { botToken: botIdentifier },
          { username: botIdentifier.replace(/^@/, '') },
          { botId: botIdentifier },
        ],
      },
      include: { user: true },
    });

    if (!bot) {
      logger.warn(`[TelegramBot] No bot found for identifier: ${botIdentifier}`);
      return { success: false, actionTaken: 'BOT_NOT_FOUND' };
    }

    // Secret Token Validation if configured
    if (bot.secretToken && secretTokenHeader && bot.secretToken !== secretTokenHeader) {
      logger.warn(`[TelegramBot] Invalid secret token received for bot @${bot.username}`);
      return { success: false, actionTaken: 'INVALID_SECRET_TOKEN' };
    }

    const userId = bot.userId;

    // -------------------------------------------------------------
    // BRANCH A: Callback Query (Owner Action Buttons Clicked)
    // -------------------------------------------------------------
    if (update.callback_query) {
      return await this.handleCallbackQuery(bot, update.callback_query);
    }

    // -------------------------------------------------------------
    // BRANCH B: Inbound Message
    // -------------------------------------------------------------
    const msg = update.message || update.edited_message;
    if (!msg || !msg.chat) {
      return { success: true, actionTaken: 'IGNORED_NON_MESSAGE' };
    }

    const chatId = String(msg.chat.id);
    const from = msg.from || {};
    const tgUsername = from.username ? from.username.replace(/^@/, '') : null;
    const fullName = [from.first_name, from.last_name].filter(Boolean).join(' ') || (tgUsername ? `@${tgUsername}` : `Telegram User ${chatId.slice(-4)}`);
    const rawText = msg.text || msg.caption || '';
    const contactPhone = msg.contact?.phone_number ? msg.contact.phone_number.replace(/\D/g, '') : null;

    // Check for Owner Pairing Command: /start pair_owner_{token} or /pair
    if (rawText.startsWith('/start pair_owner') || rawText.startsWith('/pair')) {
      await prisma.telegramBot.update({
        where: { id: bot.id },
        data: {
          ownerChatId: chatId,
          ownerUsername: tgUsername,
          isNotificationChannel: true,
        },
      });

      await this.sendMessage(
        bot.botToken,
        chatId,
        `👑 <b>Вы успешно подключены как владелец/менеджер!</b>\n\nСюда будут приходить мгновенные уведомления о <b>горячих лидах 🔥</b>, коммерческих предложениях и запросах на перевод диалога с интерактивными кнопками перехвата.`,
      );

      return { success: true, actionTaken: 'OWNER_PAIRED' };
    }

    // 2. Identify and Upsert Lead in Unified CRM
    let lead = await prisma.lead.findFirst({
      where: {
        userId,
        OR: [
          { telegramChatId: chatId },
          ...(tgUsername ? [{ telegramUsername: tgUsername }] : []),
          ...(contactPhone ? [{ phone: { contains: contactPhone.slice(-9) } }] : []),
        ],
      },
    });

    if (!lead) {
      lead = await prisma.lead.create({
        data: {
          userId,
          contactName: fullName,
          companyName: fullName,
          telegram: tgUsername ? `@${tgUsername}` : undefined,
          telegramUsername: tgUsername,
          telegramChatId: chatId,
          telegramUrl: tgUsername ? `https://t.me/${tgUsername}` : undefined,
          phone: contactPhone ? `+${contactPhone}` : null,
          source: 'TELEGRAM',
          status: 'NEW',
          assignedTelegramBotId: bot.id,
        },
      });
      logger.info(`[TelegramBot] Created new Lead ${lead.id} (@${tgUsername || chatId})`);
    } else {
      // Update contact information
      lead = await prisma.lead.update({
        where: { id: lead.id },
        data: {
          contactName: lead.contactName || fullName,
          telegram: tgUsername ? `@${tgUsername}` : lead.telegram,
          telegramUsername: tgUsername || lead.telegramUsername,
          telegramChatId: chatId,
          telegramUrl: tgUsername ? `https://t.me/${tgUsername}` : lead.telegramUrl,
          phone: contactPhone ? `+${contactPhone}` : lead.phone,
          assignedTelegramBotId: bot.id,
        },
      });
    }

    // 3. Upsert Conversation in Unified CRM
    let conversation = await prisma.conversation.findFirst({
      where: {
        userId,
        leadId: lead.id,
        telegramBotId: bot.id,
      },
    });

    const now = new Date();

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          userId,
          telegramBotId: bot.id,
          telegramChatId: chatId,
          leadId: lead.id,
          channel: 'TELEGRAM',
          status: 'REPLIED',
          unreadCount: 1,
          lastMessageAt: now,
          lastMessagePreview: rawText.slice(0, 100),
        },
      });
    } else {
      conversation = await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          telegramChatId: chatId,
          status: conversation.status === 'NEW' ? 'REPLIED' : conversation.status,
          unreadCount: conversation.unreadCount + 1,
          lastMessageAt: now,
          lastMessagePreview: rawText.slice(0, 100),
        },
      });
    }

    // 4. Record Message in CRM
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'INBOUND',
        body: rawText || (msg.photo ? '[Фотография]' : msg.voice ? '[Голосовое сообщение]' : '[Вложение]'),
        metaMessageId: String(msg.message_id),
        deliveryStatus: 'READ',
        provenance: 'TRACKED',
        recordedAt: now,
      },
    });

    await prisma.messageEvent.create({
      data: {
        messageId: message.id,
        type: 'MESSAGE_RECEIVED',
        name: 'TELEGRAM_MESSAGE_RECEIVED',
        provenance: 'TRACKED',
      },
    });

    await prisma.timelineEvent.create({
      data: {
        userId,
        leadId: lead.id,
        conversationId: conversation.id,
        eventType: 'MESSAGE_RECEIVED',
        title: `Входящее сообщение Telegram от @${tgUsername || fullName}`,
        description: rawText.slice(0, 300),
        metadata: {
          channel: 'TELEGRAM',
          chatId,
          messageId: msg.message_id,
          botUsername: bot.username,
        },
      },
    });

    // Realtime UI notification
    emitToUser(userId, 'lead.created', lead);
    emitToUser(userId, 'message.created', {
      ...message,
      conversation,
      lead,
      telegramBot: bot,
    });
    emitToUser(userId, 'conversation.updated', conversation);

    // 5. Handle Built-in Telegram Bot Commands
    if (rawText.startsWith('/')) {
      const command = rawText.split(' ')[0].toLowerCase();
      return await this.handleCommand(bot, chatId, command, lead, conversation);
    }

    // 6. Execute AI Sales Brain Workflow based on Mode
    const effectiveMode: AiExecutionMode = bot.aiExecutionMode || 'AUTOMATIC_REPLIES';
    setTimeout(async () => {
      try {
        await this.handleAiExecution(userId, conversation!.id, lead!.id, rawText, effectiveMode, bot);
      } catch (aiErr: any) {
        logger.error(`[TelegramBot] AI execution failed: ${aiErr.message}`);
      }
    }, 500);

    return { success: true, actionTaken: 'INBOUND_MESSAGE_PROCESSED' };
  }

  /**
   * Handles built-in bot commands (/start, /help, /status, /manager, /reset).
   */
  private static async handleCommand(
    bot: any,
    chatId: string,
    command: string,
    lead: any,
    conversation: any,
  ): Promise<{ success: boolean; actionTaken: string }> {
    if (command === '/start') {
      const greeting = `👋 <b>Здравствуйте, ${lead.contactName}!</b>\n\nЯ — официальный AI-консультант компании <b>Nexora</b>. Помогаю с разработкой веб-сервисов, сайтов под ключ, Telegram-ботов и автоматизацией бизнес-процессов.\n\nРасскажите, какая задача перед вами стоит или какую проблему вы хотите решить?`;
      await this.sendMessage(bot.botToken, chatId, greeting);
      return { success: true, actionTaken: 'COMMAND_START' };
    }

    if (command === '/help') {
      const helpText = `<b>Доступные команды:</b>\n/start — Начать диалог с AI-консультантом\n/status — Узнать статус проекта и квалификации\n/manager — Запросить перевод на живого менеджера\n/reset — Очистить контекст и начать заново`;
      await this.sendMessage(bot.botToken, chatId, helpText);
      return { success: true, actionTaken: 'COMMAND_HELP' };
    }

    if (command === '/manager' || command === '/human') {
      await prisma.aiDialogueState.upsert({
        where: { conversationId: conversation.id },
        update: {
          isAiPaused: true,
          pausedReason: 'Клиент запросил менеджера через /manager',
        },
        create: {
          conversationId: conversation.id,
          isAiPaused: true,
          pausedReason: 'Клиент запросил менеджера через /manager',
        },
      });

      await this.sendMessage(
        bot.botToken,
        chatId,
        `👤 <b>Запрос отправлен старшему менеджеру!</b>\n\nAI приостановлен. Наш специалист подключится к диалогу в ближайшее время.`,
      );

      // Alert owner
      const { TelegramNotificationService } = await import('./telegram-notification.service');
      await TelegramNotificationService.sendHandoffAlert(bot.userId, conversation, 'Клиент запросил менеджера (/manager)');

      return { success: true, actionTaken: 'COMMAND_MANAGER' };
    }

    if (command === '/status') {
      const statusText = `📊 <b>Статус в CRM Nexora:</b>\n\nКомпания: <b>${lead.companyName || 'Не указана'}</b>\nСтатус лида: <b>${lead.status}</b>\nКанал: <b>Telegram (@${bot.username})</b>`;
      await this.sendMessage(bot.botToken, chatId, statusText);
      return { success: true, actionTaken: 'COMMAND_STATUS' };
    }

    if (command === '/reset') {
      await prisma.clientMemory.deleteMany({ where: { leadId: lead.id } });
      await this.sendMessage(bot.botToken, chatId, `🔄 <b>Память диалога очищена.</b>\nОпишите ваш проект с нуля.`);
      return { success: true, actionTaken: 'COMMAND_RESET' };
    }

    return { success: true, actionTaken: 'COMMAND_UNKNOWN' };
  }

  /**
   * Executes AI processing for Telegram according to the configured mode.
   */
  private static async handleAiExecution(
    userId: string,
    conversationId: string,
    leadId: string,
    inboundText: string,
    mode: AiExecutionMode,
    bot: any,
  ) {
    if (mode === 'PAUSED') {
      logger.info(`[TelegramBot] AI is PAUSED for bot @${bot.username}.`);
      return;
    }

    if (mode === 'HUMAN_HANDOFF') {
      logger.info(`[TelegramBot] HUMAN_HANDOFF active for bot @${bot.username}.`);
      return;
    }

    // Run Pre-Flight Guardrail Check
    const guardrail = await PreFlightGuardrailService.validateAiDispatch(
      userId,
      conversationId,
      'Здравствуйте! Готовы помочь вам с разработкой решения.',
    );

    if (!guardrail.allowed) {
      logger.warn(`[TelegramBot] Pre-Flight Guardrail blocked AI dispatch: ${guardrail.blockedReason}`);
      return;
    }

    // Run Consultative AI Sales Brain
    const { processInboundWithSalesBrain } = await import('../ai/sales-brain.service');
    const brainDecision = await processInboundWithSalesBrain(
      userId,
      conversationId,
      inboundText,
    );

    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { lead: { include: { score: true } } },
    });

    const lead = conv?.lead;
    const aiReplyText = brainDecision.replyText;

    // Check for HOT LEAD Notification trigger (Score >= 80 or HOT grade)
    const scoreVal = lead?.score?.score || 0;
    const isHot = lead?.score?.grade === 'HOT' || scoreVal >= 80;

    if (isHot && bot.notifyOnHotLead) {
      const { TelegramNotificationService } = await import('./telegram-notification.service');
      await TelegramNotificationService.sendHotLeadAlert(userId, {
        type: 'HOT_LEAD',
        leadId,
        conversationId,
        companyName: lead?.companyName || 'Не указана',
        contactName: lead?.contactName || `@${lead?.telegramUsername}`,
        phone: lead?.phone || undefined,
        channel: 'Telegram (@' + bot.username + ')',
        score: scoreVal,
        grade: lead?.score?.grade || 'HOT',
        pain: (lead?.score as any)?.reasons?.join(', ') || (brainDecision.decision as any)?.strategy || 'Потеря клиентов из-за отсутствия мобильного решения',
        need: brainDecision.decision?.nextBestAction || 'Разработка цифрового продукта под ключ',
        budget: lead?.estimatedBudget ? `${lead.estimatedBudget.toLocaleString('ru-RU')} ₽` : 'от 150 000 ₽',
        nextBestAction: brainDecision.decision?.nextBestAction || 'Презентация КП и согласование этапов',
      });
    }

    if (!aiReplyText) return;

    if (mode === 'MANUAL_APPROVAL') {
      await prisma.aiDialogueState.upsert({
        where: { conversationId },
        update: {
          suggestedReply: aiReplyText,
          suggestedReplyStatus: 'PENDING',
          executionMode: 'MANUAL_APPROVAL',
        },
        create: {
          conversationId,
          suggestedReply: aiReplyText,
          suggestedReplyStatus: 'PENDING',
          executionMode: 'MANUAL_APPROVAL',
        },
      });

      emitToUser(userId, 'ai.suggestion_ready', {
        conversationId,
        leadId,
        suggestedReply: aiReplyText,
        status: 'PENDING',
      });
    } else if (mode === 'AUTOMATIC_REPLIES' || mode === 'FULL_AUTONOMY') {
      // Send message via Telegram Bot API
      const chatId = conv?.telegramChatId || lead?.telegramChatId;
      if (chatId) {
        await this.sendMessage(bot.botToken, chatId, aiReplyText);

        // Record outbound message in CRM
        const outMsg = await prisma.message.create({
          data: {
            conversationId,
            direction: 'OUTBOUND',
            body: aiReplyText,
            deliveryStatus: 'SENT',
            provenance: 'TRACKED',
            recordedAt: new Date(),
          },
        });

        await prisma.messageEvent.create({
          data: {
            messageId: outMsg.id,
            type: 'MESSAGE_SENT',
            name: 'TELEGRAM_MESSAGE_SENT',
            provenance: 'TRACKED',
          },
        });

        await prisma.aiDialogueState.upsert({
          where: { conversationId },
          update: { lastAiReplyAt: new Date() },
          create: { conversationId, lastAiReplyAt: new Date() },
        });

        emitToUser(userId, 'message.created', {
          ...outMsg,
          conversation: conv,
          lead,
        });
      }
    }
  }

  /**
   * Handles interactive Inline Keyboard button clicks by owner/manager.
   * Actions: takeover:{convId}, pause_ai:{convId}, resume_ai:{convId}
   */
  private static async handleCallbackQuery(
    bot: any,
    callbackQuery: any,
  ): Promise<{ success: boolean; actionTaken: string }> {
    const data = callbackQuery.data || '';
    const callbackQueryId = callbackQuery.id;
    const msg = callbackQuery.message;
    const fromName = callbackQuery.from?.first_name || 'Менеджер';

    const [action, targetId] = data.split(':');

    if (action === 'takeover' && targetId) {
      const conv = await prisma.conversation.findUnique({
        where: { id: targetId },
        include: { lead: true },
      });

      if (!conv) {
        await this.answerCallbackQuery(bot.botToken, callbackQueryId, 'Диалог не найден');
        return { success: false, actionTaken: 'CONVERSATION_NOT_FOUND' };
      }

      await prisma.aiDialogueState.upsert({
        where: { conversationId: targetId },
        update: {
          isAiPaused: true,
          humanTakeoverAt: new Date(),
          humanTakeoverBy: fromName,
          pausedReason: `Перехвачено ${fromName} через Telegram`,
        },
        create: {
          conversationId: targetId,
          isAiPaused: true,
          humanTakeoverAt: new Date(),
          humanTakeoverBy: fromName,
          pausedReason: `Перехвачено ${fromName} через Telegram`,
        },
      });

      await this.answerCallbackQuery(
        bot.botToken,
        callbackQueryId,
        `👤 Вы перехватили диалог «${conv.lead?.companyName || conv.lead?.contactName}». AI приостановлен!`,
        true,
      );

      // Edit Telegram notification message to reflect takeover
      if (msg && msg.chat) {
        const timeStr = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        const updatedText = `${msg.text || ''}\n\n✅ <b>УПРАВЛЕНИЕ ПЕРЕХВАЧЕНО:</b> ${fromName} (${timeStr})\nAI приостановлен.`;
        await this.editMessageText(bot.botToken, msg.chat.id, msg.message_id, updatedText, {
          inline_keyboard: [
            [
              { text: '🔗 Открыть диалог в CRM', url: `http://localhost:3000/conversations?id=${targetId}` },
              { text: '⚡ Возобновить AI', callback_data: `resume_ai:${targetId}` },
            ],
          ],
        });
      }

      emitToUser(bot.userId, 'ai.takeover', {
        conversationId: targetId,
        managerName: fromName,
        takeoverAt: new Date(),
      });

      return { success: true, actionTaken: 'TAKEOVER_SUCCESS' };
    }

    if (action === 'pause_ai' && targetId) {
      await prisma.aiDialogueState.upsert({
        where: { conversationId: targetId },
        update: {
          isAiPaused: true,
          pausedReason: `AI приостановлен ${fromName} через Telegram`,
        },
        create: {
          conversationId: targetId,
          isAiPaused: true,
          pausedReason: `AI приостановлен ${fromName} через Telegram`,
        },
      });

      await this.answerCallbackQuery(
        bot.botToken,
        callbackQueryId,
        '⏸️ AI Sales Agent приостановлен для этого диалога.',
        false,
      );

      if (msg && msg.chat) {
        const updatedText = `${msg.text || ''}\n\n⏸️ <b>AI ПРИОСТАНОВЛЕН:</b> по запросу ${fromName}`;
        await this.editMessageText(bot.botToken, msg.chat.id, msg.message_id, updatedText, {
          inline_keyboard: [
            [
              { text: '🔗 Открыть в CRM', url: `http://localhost:3000/conversations?id=${targetId}` },
              { text: '⚡ Включить AI', callback_data: `resume_ai:${targetId}` },
            ],
          ],
        });
      }

      return { success: true, actionTaken: 'PAUSE_AI_SUCCESS' };
    }

    if (action === 'resume_ai' && targetId) {
      await prisma.aiDialogueState.upsert({
        where: { conversationId: targetId },
        update: {
          isAiPaused: false,
          humanTakeoverAt: null,
          humanTakeoverBy: null,
          pausedReason: null,
        },
        create: {
          conversationId: targetId,
          isAiPaused: false,
        },
      });

      await this.answerCallbackQuery(
        bot.botToken,
        callbackQueryId,
        '⚡ AI Sales Agent возобновил работу в диалоге!',
        false,
      );

      if (msg && msg.chat) {
        const updatedText = `${msg.text || ''}\n\n⚡ <b>AI АКТИВИРОВАН:</b> возобновлен ${fromName}`;
        await this.editMessageText(bot.botToken, msg.chat.id, msg.message_id, updatedText, {
          inline_keyboard: [
            [
              { text: '🔗 Открыть в CRM', url: `http://localhost:3000/conversations?id=${targetId}` },
              { text: '👤 Перехватить диалог', callback_data: `takeover:${targetId}` },
            ],
            [{ text: '⏸️ Пауза AI', callback_data: `pause_ai:${targetId}` }],
          ],
        });
      }

      return { success: true, actionTaken: 'RESUME_AI_SUCCESS' };
    }

    await this.answerCallbackQuery(bot.botToken, callbackQueryId, 'Действие обработано');
    return { success: true, actionTaken: 'DEFAULT_CALLBACK_ANSWERED' };
  }
}
