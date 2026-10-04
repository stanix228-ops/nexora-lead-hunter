import { prisma } from '@nexora/database';
import type {
  PreFlightValidationResult,
  PreFlightCheckItem,
} from '@nexora/types';
import { logger } from '../../common/logger';

// Default anti-spam and opt-out word lists
const OPT_OUT_PATTERNS = [
  'стоп',
  'не пишите',
  'отписка',
  'спам',
  'отстаньте',
  'удалите номер',
  'заблокирую',
  'хватит',
  'stop',
  'unsubscribe',
  'cancel',
  'spam',
];

const HUMAN_REQUEST_PATTERNS = [
  'позовите человека',
  'позовите оператора',
  'хочу поговорить с человеком',
  'дайте менеджера',
  'соедините с оператором',
  'живой человек',
  'нужен человек',
  'поговорить с менеджером',
  'human',
  'operator',
  'talk to human',
];

const PROHIBITED_MESSAGE_PATTERNS = [
  /гарантируем 100% результат за 1 день/i,
  /бесплатно навсегда без оплаты/i,
  /скидка 90%/i,
  /купите прямо сейчас срочно/i,
];

export class PreFlightGuardrailService {
  /**
   * Evaluates all 5 mandatory checks before an AI message is dispatched:
   * 1. isChannelAllowed: channel enabled, account active & connected
   * 2. isMessageAllowed: message complies with WhatsApp policy, stop-words & safety
   * 3. isOptOut: no active opt-out in state, lead status, memory, or last message
   * 4. isRateLimitAllowed: daily/hourly quotas & anti-flood cooldown
   * 5. isHumanHandoffRequired: human takeover inactive and no human requested
   */
  static async validateAiDispatch(
    userId: string,
    conversationId: string,
    messageText: string,
  ): Promise<PreFlightValidationResult> {
    const timestamp = new Date().toISOString();

    // 1. Fetch Conversation, Account, Gateway, InstagramAccount, TelegramBot, EmailAccount, Lead, AiState, and Config
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      include: {
        lead: {
          include: {
            clientMemories: { where: { layer: 'OBJECTION' }, take: 10 },
          },
        },
        account: {
          include: {
            gateway: true,
          },
        },
        instagramAccount: true,
        telegramBot: true,
        emailAccount: true,
        aiState: true,
        messages: {
          take: 10,
          orderBy: { recordedAt: 'desc' },
        },
      },
    });

    if (!conversation) {
      return {
        allowed: false,
        blockedReason: 'Диалог не найден в базе данных.',
        validatedAt: timestamp,
        checks: {
          isChannelAllowed: { name: 'isChannelAllowed', passed: false, reason: 'Conversation not found' },
          isMessageAllowed: { name: 'isMessageAllowed', passed: false, reason: 'Conversation not found' },
          isOptOut: { name: 'isOptOut', passed: false, reason: 'Conversation not found' },
          isRateLimitAllowed: { name: 'isRateLimitAllowed', passed: false, reason: 'Conversation not found' },
          isHumanHandoffRequired: { name: 'isHumanHandoffRequired', passed: false, reason: 'Conversation not found' },
        },
      };
    }

    const aiConfig = await prisma.aiAgentConfig.findUnique({ where: { userId } });
    const lead = conversation.lead;
    const account = conversation.account;
    const igAccount = conversation.instagramAccount;
    const tgBot = conversation.telegramBot;
    const emailAccount = conversation.emailAccount;
    const gateway = account?.gateway;
    const aiState = conversation.aiState;
    const lastMessage = conversation.messages[0];
    const isInstagram = conversation.channel === 'INSTAGRAM';
    const isTelegram = conversation.channel === 'TELEGRAM';
    const isEmail = conversation.channel === 'EMAIL';

    // ------------------------------------------------------------------------
    // CHECK 1: isChannelAllowed (Разрешён ли канал)
    // ------------------------------------------------------------------------
    let channelCheck: PreFlightCheckItem;
    if (aiConfig?.mode === 'OFF') {
      channelCheck = {
        name: 'isChannelAllowed',
        passed: false,
        reason: 'AI Sales Agent отключен глобально в настройках профиля (mode: OFF).',
      };
    } else if (isEmail) {
      if (!emailAccount) {
        channelCheck = {
          name: 'isChannelAllowed',
          passed: false,
          reason: 'Email аккаунт не привязан к данному диалогу.',
        };
      } else if (emailAccount.status === 'PAUSED' || emailAccount.status === 'OFFLINE') {
        channelCheck = {
          name: 'isChannelAllowed',
          passed: false,
          reason: `Email аккаунт (${emailAccount.emailAddress}) находится в неактивном статусе (${emailAccount.status}).`,
        };
      } else if (emailAccount.aiExecutionMode === 'PAUSED') {
        channelCheck = {
          name: 'isChannelAllowed',
          passed: false,
          reason: `AI для Email аккаунта ${emailAccount.emailAddress} приостановлен (PAUSED).`,
        };
      } else {
        channelCheck = {
          name: 'isChannelAllowed',
          passed: true,
          reason: `Канал EMAIL (${emailAccount.emailAddress}) активен и готов к отправке (${emailAccount.provider}).`,
          metadata: { emailAccountId: emailAccount.id, emailAddress: emailAccount.emailAddress, provider: emailAccount.provider },
        };
      }
    } else if (isTelegram) {
      if (!tgBot) {
        channelCheck = {
          name: 'isChannelAllowed',
          passed: false,
          reason: 'Telegram бот не привязан к данному диалогу.',
        };
      } else if (tgBot.status === 'PAUSED' || tgBot.status === 'OFFLINE') {
        channelCheck = {
          name: 'isChannelAllowed',
          passed: false,
          reason: `Telegram бот (@${tgBot.username}) находится в неактивном статусе (${tgBot.status}).`,
        };
      } else if (tgBot.aiExecutionMode === 'PAUSED') {
        channelCheck = {
          name: 'isChannelAllowed',
          passed: false,
          reason: `AI для Telegram бота @${tgBot.username} приостановлен (PAUSED).`,
        };
      } else {
        channelCheck = {
          name: 'isChannelAllowed',
          passed: true,
          reason: `Канал TELEGRAM (@${tgBot.username}) активен и авторизован (Official Bot API).`,
          metadata: { telegramBotId: tgBot.id, username: tgBot.username, mode: tgBot.aiExecutionMode },
        };
      }
    } else if (isInstagram) {
      if (!igAccount) {
        channelCheck = {
          name: 'isChannelAllowed',
          passed: false,
          reason: 'Instagram аккаунт не привязан к данному диалогу.',
        };
      } else if (igAccount.status === 'PAUSED' || igAccount.status === 'OFFLINE') {
        channelCheck = {
          name: 'isChannelAllowed',
          passed: false,
          reason: `Instagram аккаунт (@${igAccount.username}) находится в неактивном статусе (${igAccount.status}).`,
        };
      } else if (igAccount.aiExecutionMode === 'PAUSED') {
        channelCheck = {
          name: 'isChannelAllowed',
          passed: false,
          reason: `AI для Instagram аккаунта @${igAccount.username} приостановлен (PAUSED).`,
        };
      } else {
        channelCheck = {
          name: 'isChannelAllowed',
          passed: true,
          reason: `Канал INSTAGRAM (@${igAccount.username}) активен и авторизован (Official Graph API).`,
          metadata: { instagramAccountId: igAccount.id, username: igAccount.username, mode: igAccount.aiExecutionMode },
        };
      }
    } else if (!account || account.status === 'PAUSED' || account.status === 'OFFLINE') {
      channelCheck = {
        name: 'isChannelAllowed',
        passed: false,
        reason: `Аккаунт WhatsApp находится в неактивном статусе (${account?.status || 'UNKNOWN'}).`,
      };
    } else if (
      gateway &&
      gateway.status !== 'CONNECTED' &&
      gateway.provider !== 'OFFICIAL_CLOUD_API' &&
      gateway.provider !== 'BSP_360DIALOG'
    ) {
      channelCheck = {
        name: 'isChannelAllowed',
        passed: false,
        reason: `Шлюз WhatsApp не подключен (статус: ${gateway.status}).`,
      };
    } else {
      channelCheck = {
        name: 'isChannelAllowed',
        passed: true,
        reason: `Канал ${conversation.channel} активен и авторизован (${gateway?.provider || 'OFFICIAL'}).`,
        metadata: { provider: gateway?.provider, accountId: account.id },
      };
    }

    // ------------------------------------------------------------------------
    // CHECK 2: isMessageAllowed (Разрешено ли сообщение)
    // ------------------------------------------------------------------------
    let messageCheck: PreFlightCheckItem;
    const trimmedMsg = (messageText || '').trim();
    const maxLen = isInstagram ? 1000 : isTelegram ? 4096 : isEmail ? 50000 : 4000;

    if (!trimmedMsg || trimmedMsg.length < 2) {
      messageCheck = {
        name: 'isMessageAllowed',
        passed: false,
        reason: 'Текст сообщения пустой или слишком короткий.',
      };
    } else if (trimmedMsg.length > maxLen) {
      messageCheck = {
        name: 'isMessageAllowed',
        passed: false,
        reason: `Превышен максимальный лимит длины сообщения ${conversation.channel} (${maxLen} символов).`,
      };
    } else {
      const isProhibited = PROHIBITED_MESSAGE_PATTERNS.some((pattern) => pattern.test(trimmedMsg));
      if (isProhibited) {
        messageCheck = {
          name: 'isMessageAllowed',
          passed: false,
          reason: 'Сообщение содержит запрещенные спам-шаблоны или нереалистичные гарантии.',
        };
      } else {
        // Meta 24-hour customer service window check
        const lastInbound = conversation.messages.find((m) => m.direction === 'INBOUND');
        const lastInboundTime = lastInbound ? new Date(lastInbound.recordedAt).getTime() : 0;
        const hoursSinceLastInbound = lastInboundTime ? (Date.now() - lastInboundTime) / (1000 * 3600) : 999;

        if (isInstagram && lastInboundTime && hoursSinceLastInbound > 24) {
          messageCheck = {
            name: 'isMessageAllowed',
            passed: false,
            reason: `24-часовое окно Meta для Instagram закрыто (прошло ${Math.round(hoursSinceLastInbound)}ч). Отправка запрещена официальной политикой платформы.`,
            metadata: {
              charCount: trimmedMsg.length,
              within24hWindow: false,
              hoursSinceLastInbound: Math.round(hoursSinceLastInbound * 10) / 10,
            },
          };
        } else {
          messageCheck = {
            name: 'isMessageAllowed',
            passed: true,
            reason: `Сообщение прошло проверку безопасности, комплаенса и структуры ${conversation.channel}.`,
            metadata: {
              charCount: trimmedMsg.length,
              within24hWindow: hoursSinceLastInbound <= 24,
              hoursSinceLastInbound: Math.round(hoursSinceLastInbound * 10) / 10,
            },
          };
        }
      }
    }

    // ------------------------------------------------------------------------
    // CHECK 3: isOptOut (Нет ли opt-out)
    // ------------------------------------------------------------------------
    let optOutCheck: PreFlightCheckItem;
    const lastCustomerMsgText =
      lastMessage?.direction === 'INBOUND' ? (lastMessage.body || '').toLowerCase() : '';

    const hasOptOutWord = OPT_OUT_PATTERNS.some(
      (sw) =>
        lastCustomerMsgText === sw ||
        lastCustomerMsgText.startsWith(`${sw} `) ||
        lastCustomerMsgText.endsWith(` ${sw}`) ||
        lastCustomerMsgText.includes(` ${sw} `),
    );

    let isSuppressedEmail = false;
    if (isEmail && lead.email) {
      const suppCount = await prisma.emailSuppression.count({
        where: { userId, email: lead.email.toLowerCase() },
      });
      isSuppressedEmail = suppCount > 0;
    }

    if (isSuppressedEmail) {
      optOutCheck = {
        name: 'isOptOut',
        passed: false,
        reason: `Email ${lead.email} находится в списке отписок/блокировок (Suppression List). Отправка запрещена.`,
      };
    } else if (aiState?.isAiPaused === true && aiState.pausedReason === 'OPT_OUT') {
      optOutCheck = {
        name: 'isOptOut',
        passed: false,
        reason: 'Клиент ранее запросил отписку (Opt-Out). AI заблокирован.',
      };
    } else if (lead.status === 'NO_RESPONSE' || hasOptOutWord) {
      optOutCheck = {
        name: 'isOptOut',
        passed: false,
        reason: 'Обнаружен прямой запрос на прекращение контакта («не пишите», «стоп», отписка).',
      };
    } else {
      optOutCheck = {
        name: 'isOptOut',
        passed: true,
        reason: 'Клиент не заявлял об отказе или отписке. Коммуникация разрешена.',
      };
    }

    // ------------------------------------------------------------------------
    // CHECK 4: isRateLimitAllowed (Не превышен ли rate limit)
    // ------------------------------------------------------------------------
    let rateLimitCheck: PreFlightCheckItem;
    const maxDaily = isEmail
      ? (emailAccount?.dailyMessageLimit ?? 50)
      : isTelegram
      ? (tgBot?.dailyMessageLimit ?? 1000)
      : isInstagram
      ? (igAccount?.dailyMessageLimit ?? 100)
      : (aiConfig?.maxDailyMessagesPerAccount ?? 50);

    // Count messages sent by this account today
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const sentTodayCount = await prisma.message.count({
      where: {
        conversation: isEmail
          ? { emailAccountId: emailAccount?.id }
          : isTelegram
          ? { telegramBotId: tgBot?.id }
          : isInstagram
          ? { instagramAccountId: igAccount?.id }
          : { accountId: account?.id },
        direction: 'OUTBOUND',
        recordedAt: { gte: startOfToday },
      },
    });

    // Check anti-flood in this conversation: max 4 outbound in the last 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const sentRecentCount = await prisma.message.count({
      where: {
        conversationId,
        direction: 'OUTBOUND',
        recordedAt: { gte: fiveMinutesAgo },
      },
    });

    // For email, check hourly warmup limit as well
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const sentThisHourCount = isEmail
      ? await prisma.message.count({
          where: {
            conversation: { emailAccountId: emailAccount?.id },
            direction: 'OUTBOUND',
            recordedAt: { gte: oneHourAgo },
          },
        })
      : 0;

    const maxHourly = emailAccount?.hourlyMessageLimit ?? 10;

    if (sentTodayCount >= maxDaily) {
      rateLimitCheck = {
        name: 'isRateLimitAllowed',
        passed: false,
        reason: `Превышен дневной лимит сообщений аккаунта (${sentTodayCount}/${maxDaily}).`,
        metadata: { sentToday: sentTodayCount, limit: maxDaily },
      };
    } else if (isEmail && sentThisHourCount >= maxHourly) {
      rateLimitCheck = {
        name: 'isRateLimitAllowed',
        passed: false,
        reason: `Превышен часовой лимит прогрева email-аккаунта (${sentThisHourCount}/${maxHourly}).`,
        metadata: { sentThisHour: sentThisHourCount, hourlyLimit: maxHourly },
      };
    } else if (sentRecentCount >= 4) {
      rateLimitCheck = {
        name: 'isRateLimitAllowed',
        passed: false,
        reason: `Сработал антифлуд: отправлено ${sentRecentCount} сообщений за последние 5 минут. Необходим cooldown.`,
        metadata: { recentSent: sentRecentCount },
      };
    } else {
      rateLimitCheck = {
        name: 'isRateLimitAllowed',
        passed: true,
        reason: `Лимиты в норме (отправлено сегодня: ${sentTodayCount}/${maxDaily}, недавних: ${sentRecentCount}).`,
        metadata: { sentToday: sentTodayCount, limit: maxDaily, recentSent: sentRecentCount },
      };
    }

    // ------------------------------------------------------------------------
    // CHECK 5: isHumanHandoffRequired (Не требуется ли human handoff)
    // ------------------------------------------------------------------------
    let humanHandoffCheck: PreFlightCheckItem;
    const isExplicitHumanRequest = HUMAN_REQUEST_PATTERNS.some((pattern) =>
      lastCustomerMsgText.includes(pattern),
    );

    if (isEmail && emailAccount?.aiExecutionMode === 'HUMAN_HANDOFF') {
      humanHandoffCheck = {
        name: 'isHumanHandoffRequired',
        passed: false,
        reason: `Для Email аккаунта ${emailAccount.emailAddress} включен режим прямой передачи менеджеру (HUMAN_HANDOFF).`,
      };
    } else if (isTelegram && tgBot?.aiExecutionMode === 'HUMAN_HANDOFF') {
      humanHandoffCheck = {
        name: 'isHumanHandoffRequired',
        passed: false,
        reason: `Для Telegram бота @${tgBot.username} включен режим прямой передачи менеджеру (HUMAN_HANDOFF).`,
      };
    } else if (isInstagram && igAccount?.aiExecutionMode === 'HUMAN_HANDOFF') {
      humanHandoffCheck = {
        name: 'isHumanHandoffRequired',
        passed: false,
        reason: `Для Instagram аккаунта @${igAccount.username} включен режим прямой передачи менеджеру (HUMAN_HANDOFF).`,
      };
    } else if (aiState?.humanTakeoverAt != null) {
      humanHandoffCheck = {
        name: 'isHumanHandoffRequired',
        passed: false,
        reason: `Диалог перехвачен человеком (${aiState.humanTakeoverBy || 'Менеджер'}) в ${new Date(aiState.humanTakeoverAt).toLocaleTimeString('ru-RU')}. AI приостановлен.`,
        metadata: { humanTakeoverBy: aiState.humanTakeoverBy, humanTakeoverAt: aiState.humanTakeoverAt },
      };
    } else if (aiState?.isAiPaused === true) {
      humanHandoffCheck = {
        name: 'isHumanHandoffRequired',
        passed: false,
        reason: `AI отключен вручную для данного диалога (${aiState.pausedReason || 'Ручной режим'}).`,
      };
    } else if (isExplicitHumanRequest) {
      humanHandoffCheck = {
        name: 'isHumanHandoffRequired',
        passed: false,
        reason: 'Клиент запросил связь с живым человеком. Требуется передача менеджеру.',
      };
    } else {
      humanHandoffCheck = {
        name: 'isHumanHandoffRequired',
        passed: true,
        reason: 'Диалог находится в автономном ведении AI Sales Agent, вмешательство человека не требуется.',
      };
    }

    // Overall decision
    const allPassed =
      channelCheck.passed &&
      messageCheck.passed &&
      optOutCheck.passed &&
      rateLimitCheck.passed &&
      humanHandoffCheck.passed;

    let blockedReason: string | undefined;
    if (!allPassed) {
      const failedChecks = [
        !channelCheck.passed ? channelCheck.reason : null,
        !messageCheck.passed ? messageCheck.reason : null,
        !optOutCheck.passed ? optOutCheck.reason : null,
        !rateLimitCheck.passed ? rateLimitCheck.reason : null,
        !humanHandoffCheck.passed ? humanHandoffCheck.reason : null,
      ].filter(Boolean);
      blockedReason = failedChecks.join('; ');
    }

    logger.info(`[PreFlightGuardrail] Validation result for conversation ${conversationId}: ${allPassed ? 'PASSED' : 'BLOCKED'}`, {
      allPassed,
      blockedReason,
    });

    return {
      allowed: allPassed,
      checks: {
        isChannelAllowed: channelCheck,
        isMessageAllowed: messageCheck,
        isOptOut: optOutCheck,
        isRateLimitAllowed: rateLimitCheck,
        isHumanHandoffRequired: humanHandoffCheck,
      },
      blockedReason,
      validatedAt: timestamp,
    };
  }
}
