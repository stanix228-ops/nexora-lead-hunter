import { prisma } from '@nexora/database';
import type { TelegramOwnerAlertPayload } from '@nexora/types';
import { logger } from '../../common/logger';
import { TelegramBotService } from './telegram-bot.service';

export class TelegramNotificationService {
  /**
   * Dispatches a formatted HOT LEAD alert with interactive inline buttons to the owner's Telegram.
   */
  static async sendHotLeadAlert(
    userId: string,
    payload: TelegramOwnerAlertPayload,
  ): Promise<{ sent: boolean; recipientChatId?: string }> {
    // 1. Find the designated notification bot for the user
    const bot = await prisma.telegramBot.findFirst({
      where: {
        userId,
        status: { not: 'OFFLINE' },
        ownerChatId: { not: null },
      },
    });

    if (!bot || !bot.ownerChatId) {
      logger.info(`[TelegramNotification] No ownerChatId configured for user ${userId}. Skipping Hot Lead alert.`);
      return { sent: false };
    }

    const CRM_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000';
    const crmUrl = payload.conversationId
      ? `${CRM_BASE_URL}/conversations?id=${payload.conversationId}`
      : `${CRM_BASE_URL}/crm?leadId=${payload.leadId}`;

    const text = [
      `🔥 <b>HOT LEAD DETECTED</b>\n`,
      `🏢 <b>Компания:</b> ${payload.companyName || 'Не указана'}`,
      `👤 <b>Клиент:</b> ${payload.contactName || 'Лид'} ${payload.phone ? `(${payload.phone})` : ''}`,
      `🌐 <b>Канал:</b> ${payload.channel || 'Telegram'}`,
      `🎯 <b>Score:</b> <b>${payload.score || 93}/100 🔥 (${payload.grade || 'HOT'})</b>\n`,
      `⚠️ <b>Проблема:</b> ${payload.pain || 'Потеря клиентов из-за отсутствия мобильной адаптации'}`,
      `💡 <b>Потребность:</b> ${payload.need || 'Разработка цифрового продукта под ключ'}`,
      `💰 <b>Бюджет:</b> ${typeof payload.budget === 'number' ? `${payload.budget.toLocaleString('ru-RU')} ₽` : payload.budget || 'от 150 000 ₽'}`,
      `🚀 <b>Следующий шаг:</b> ${payload.nextBestAction || 'Презентация коммерческого предложения и согласование этапов'}`,
    ].join('\n');

    const inlineKeyboard: Array<Array<{ text: string; url?: string; callback_data?: string }>> = [
      [
        { text: '🔗 Открыть CRM', url: crmUrl },
        { text: '👤 Перехватить диалог', callback_data: `takeover:${payload.conversationId || payload.leadId}` },
      ],
      [
        { text: '⏸️ Пауза AI', callback_data: `pause_ai:${payload.conversationId || payload.leadId}` },
      ],
    ];

    const sendRes = await TelegramBotService.sendMessage(bot.botToken, bot.ownerChatId, text, {
      parseMode: 'HTML',
      replyMarkup: { inline_keyboard: inlineKeyboard },
    });

    logger.info(`[TelegramNotification] HOT LEAD alert dispatched to owner chat ${bot.ownerChatId} (success: ${sendRes.success})`);

    return { sent: sendRes.success, recipientChatId: bot.ownerChatId };
  }

  /**
   * Dispatches a HUMAN HANDOFF notification when a customer requests a manager.
   */
  static async sendHandoffAlert(
    userId: string,
    conversation: any,
    reason?: string,
  ): Promise<{ sent: boolean }> {
    const bot = await prisma.telegramBot.findFirst({
      where: {
        userId,
        status: { not: 'OFFLINE' },
        ownerChatId: { not: null },
      },
    });

    if (!bot || !bot.ownerChatId) return { sent: false };

    const CRM_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000';
    const crmUrl = `${CRM_BASE_URL}/conversations?id=${conversation.id}`;

    const text = [
      `👤 <b>ТРЕБУЕТСЯ ВМЕШАТЕЛЬСТВО МЕНЕДЖЕРА (HUMAN HANDOFF)</b>\n`,
      `Клиент запросил живого специалиста или задал нестандартный вопрос.`,
      `\n🏢 <b>Диалог:</b> #${conversation.id.slice(-6)}`,
      `Причина: <i>${reason || 'Запрос клиента'}</i>\n`,
      `AI временно приостановлен и ожидает вашего ответа.`,
    ].join('\n');

    const inlineKeyboard = [
      [
        { text: '🔗 Открыть диалог в CRM', url: crmUrl },
        { text: '👤 Перехватить диалог', callback_data: `takeover:${conversation.id}` },
      ],
    ];

    await TelegramBotService.sendMessage(bot.botToken, bot.ownerChatId, text, {
      parseMode: 'HTML',
      replyMarkup: { inline_keyboard: inlineKeyboard },
    });

    return { sent: true };
  }

  /**
   * Sends a test alert to verify owner notification settings and Telegram Bot API connectivity.
   */
  static async sendTestAlert(userId: string, botId?: string): Promise<{ success: boolean; error?: string }> {
    const bot = await prisma.telegramBot.findFirst({
      where: botId ? { id: botId, userId } : { userId, ownerChatId: { not: null } },
    });

    if (!bot) {
      return { success: false, error: 'Telegram-бот не найден' };
    }

    if (!bot.ownerChatId) {
      return {
        success: false,
        error: 'В боте не указан Owner Chat ID. Отправьте команду /start боту для привязки или укажите Chat ID вручную.',
      };
    }

    const testPayload: TelegramOwnerAlertPayload = {
      type: 'HOT_LEAD',
      leadId: 'test_lead_id',
      conversationId: 'test_conv_id',
      companyName: 'ООО «Премиум Ритейл Групп»',
      contactName: 'Алексей Смирнов',
      phone: '+7 (999) 123-45-67',
      channel: `Telegram (@${bot.username})`,
      score: 93,
      grade: 'HOT',
      pain: 'Старый сайт теряет 60% заявок с мобильных устройств',
      need: 'Разработка современного адаптивного интернет-магазина под ключ',
      budget: '350 000 ₽',
      nextBestAction: 'Презентация индивидуального КП (сроки: 2.5 нед.)',
    };

    const res = await this.sendHotLeadAlert(userId, testPayload);
    return { success: res.sent };
  }
}
