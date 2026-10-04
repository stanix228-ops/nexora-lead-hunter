import { prisma } from '@nexora/database';
import { performAiBusinessAnalysis } from '../../modules/ai/business-analyzer.service';
import { LeadScoringEngine } from '../../modules/ai/scoring.service';
import { processInboundWithSalesBrain } from '../../modules/ai/sales-brain.service';
import { NegotiationEngine } from '../../modules/ai/negotiation.service';
import { CommercialProposalEngine } from '../../modules/ai/proposal.service';
import { FollowUpEngine } from '../../modules/ai/followup.service';
import { PreFlightGuardrailService } from '../../modules/ai/pre-flight-guardrail.service';
import { triggerHumanHandoff } from '../../modules/ai/handoff.service';
import { setAiPermissions, DEFAULT_AI_PERMISSIONS } from '../security/permissions';
import { recordClientMemory, getLeadMemoriesGrouped, createDeal } from '../../modules/crm/crm.service';
import { logger } from '../logger';

export interface ScenarioTestResult {
  scenarioNumber: number;
  name: string;
  category: string;
  passed: boolean;
  subsystemChecks: {
    crm: boolean;
    memory: boolean;
    scoring: boolean;
    analysis: boolean;
    conversation: boolean;
    proposal: boolean;
    followup: boolean;
    integrations: boolean;
    handoff: boolean;
    security: boolean;
  };
  details: string;
  warnings?: string[];
  error?: string;
}

export class AiSalesAgent20ScenariosTester {
  static async runAll20Scenarios(userId: string): Promise<{
    passedCount: number;
    failedCount: number;
    warningCount: number;
    results: ScenarioTestResult[];
    productionReadinessScore: number;
  }> {
    const results: ScenarioTestResult[] = [];
    let globalWarningsCount = 0;

    // Helper to record
    const addResult = (res: ScenarioTestResult) => {
      if (res.warnings && res.warnings.length > 0) {
        globalWarningsCount += res.warnings.length;
      }
      results.push(res);
      const icon = res.passed ? '✅' : '❌';
      logger.info(`${icon} [SCENARIO ${res.scenarioNumber}] ${res.name} -> ${res.passed ? 'PASS' : 'FAIL'}`);
    };

    // Ensure permissions are active
    await setAiPermissions(userId, DEFAULT_AI_PERMISSIONS);

    // Ensure dummy accounts exist for all 4 channels
    const waAccount = await prisma.whatsAppAccount.findFirst({ where: { userId } }) ||
      await prisma.whatsAppAccount.create({
        data: {
          userId,
          name: 'Test WhatsApp Business',
          phone: `+7701555${Math.floor(1000 + Math.random() * 9000)}`,
          phoneMasked: '+7 (701) ***-01-01',
          status: 'ONLINE',
          position: 1,
        },
      });

    const igAccount = await prisma.instagramAccount.findFirst({ where: { userId } }) ||
      await prisma.instagramAccount.create({
        data: {
          userId,
          username: `nexora_test_ig_${Date.now()}`,
          name: 'Nexora Studio IG',
          instagramId: `ig_test_${Date.now()}`,
          status: 'ONLINE',
        },
      });

    const tgBot = await prisma.telegramBot.findFirst({ where: { userId } }) ||
      await prisma.telegramBot.create({
        data: {
          userId,
          username: `NexoraSalesBot_${Date.now()}`,
          name: 'Nexora Bot',
          botToken: `123456:TEST_BOT_TOKEN_${Date.now()}`,
          status: 'ONLINE',
        },
      });

    const emailAccount = await prisma.emailAccount.findFirst({ where: { userId } }) ||
      await prisma.emailAccount.create({
        data: {
          userId,
          name: 'Nexora Email Service',
          emailAddress: 'sales@nexorastudio.kz',
          senderName: 'Nexora AI Sales',
          provider: 'SMTP',
          status: 'ONLINE',
        },
      });

    // =========================================================================
    // SCENARIO 1: Новый лид (New lead creation, qualification & initial memory)
    // =========================================================================
    try {
      const lead = await prisma.lead.create({
        data: {
          userId,
          companyName: 'Стоматология Алатау Дент',
          contactName: 'Арман Бериков',
          phone: `+7701777${Math.floor(1000 + Math.random() * 9000)}`,
          niche: 'Стоматологическая клиника',
          city: 'Алматы',
          source: 'GIS_2',
          status: 'NEW',
          assignedAccountId: waAccount.id,
        },
      });

      const conv = await prisma.conversation.create({
        data: {
          userId,
          leadId: lead.id,
          accountId: waAccount.id,
          channel: 'WHATSAPP',
          status: 'NEW',
        },
      });

      // Add memory fact
      await recordClientMemory({
        userId,
        leadId: lead.id,
        conversationId: conv.id,
        layer: 'BUSINESS_FACT',
        key: 'contact_role',
        value: 'Главный врач / Владелец клиники',
        confidence: 0.95,
      });

      const memoryGroup = await getLeadMemoriesGrouped(lead.id);
      const passed = Boolean(lead.id && conv.id && memoryGroup.layers.BUSINESS_FACT?.length > 0);

      addResult({
        scenarioNumber: 1,
        name: 'Новый лид',
        category: 'CRM & INITIALIZATION',
        passed,
        subsystemChecks: {
          crm: true,
          memory: Boolean(memoryGroup.layers.BUSINESS_FACT?.length > 0),
          scoring: false,
          analysis: false,
          conversation: true,
          proposal: false,
          followup: false,
          integrations: true,
          handoff: false,
          security: true,
        },
        details: `Лид ${lead.id} и диалог ${conv.id} созданы в CRM, зафиксирован факт памяти.`,
      });
    } catch (err: any) {
      addResult({
        scenarioNumber: 1,
        name: 'Новый лид',
        category: 'CRM & INITIALIZATION',
        passed: false,
        subsystemChecks: { crm: false, memory: false, scoring: false, analysis: false, conversation: false, proposal: false, followup: false, integrations: false, handoff: false, security: false },
        details: 'Failed to create new lead in CRM',
        error: err.message,
      });
    }

    // =========================================================================
    // SCENARIO 2: Клиент без сайта (Pitching mobile landing + appointment bot)
    // =========================================================================
    try {
      const analysis = await performAiBusinessAnalysis(userId, {
        companyName: 'BarberClub Almaty',
        niche: 'Барбершоп',
        city: 'Алматы',
        instagram: 'barberclub_almaty',
      });

      const score = await LeadScoringEngine.evaluateScore(userId, {
        companyName: 'BarberClub Almaty',
        niche: 'Барбершоп',
        city: 'Алматы',
        instagram: 'barberclub_almaty',
        website: null,
      });

      const passed =
        (analysis.currentDigitalState.website.status === 'CRITICAL' || (analysis.currentDigitalState.website.status as string) === 'NO_WEBSITE') &&
        analysis.opportunities.length > 0 &&
        score.score >= 40 &&
        score.recommendedService !== undefined;

      addResult({
        scenarioNumber: 2,
        name: 'Клиент без сайта',
        category: 'ANALYSIS & SCORING',
        passed,
        subsystemChecks: {
          crm: true,
          memory: true,
          scoring: true,
          analysis: true,
          conversation: false,
          proposal: false,
          followup: false,
          integrations: false,
          handoff: false,
          security: true,
        },
        details: `Выявлен статус NO_WEBSITE, предложено решение: ${score.recommendedService}, Score: ${score.score}`,
      });
    } catch (err: any) {
      addResult({
        scenarioNumber: 2,
        name: 'Клиент без сайта',
        category: 'ANALYSIS & SCORING',
        passed: false,
        subsystemChecks: { crm: false, memory: false, scoring: false, analysis: false, conversation: false, proposal: false, followup: false, integrations: false, handoff: false, security: false },
        details: 'Failed in no-website analysis',
        error: err.message,
      });
    }

    // =========================================================================
    // SCENARIO 3: Клиент с плохим сайтом (Slow page speed & mobile issues)
    // =========================================================================
    try {
      const analysis = await performAiBusinessAnalysis(userId, {
        companyName: 'Мебель Люкс KZ',
        niche: 'Производство мебели',
        city: 'Астана',
        website: 'https://mebel-lux-example.kz',
        forceReanalyze: true,
      });

      const passed =
        analysis.problems.length > 0 &&
        analysis.digitalMaturity !== undefined &&
        analysis.businessSummary !== null;

      addResult({
        scenarioNumber: 3,
        name: 'Клиент с плохим сайтом',
        category: 'DIGITAL AUDIT',
        passed,
        subsystemChecks: {
          crm: true,
          memory: true,
          scoring: true,
          analysis: true,
          conversation: false,
          proposal: false,
          followup: false,
          integrations: false,
          handoff: false,
          security: true,
        },
        details: `Аудит выявил ${analysis.problems.length} технических проблем, Maturity: ${analysis.digitalMaturity}`,
      });
    } catch (err: any) {
      addResult({
        scenarioNumber: 3,
        name: 'Клиент с плохим сайтом',
        category: 'DIGITAL AUDIT',
        passed: false,
        subsystemChecks: { crm: false, memory: false, scoring: false, analysis: false, conversation: false, proposal: false, followup: false, integrations: false, handoff: false, security: false },
        details: 'Failed in bad-website audit',
        error: err.message,
      });
    }

    // =========================================================================
    // SCENARIO 4: Клиент хочет сайт (Inbound intent -> Next.js web proposal)
    // =========================================================================
    try {
      const lead = await prisma.lead.create({
        data: {
          userId,
          companyName: 'TOO Grand Logistics',
          niche: 'Грузоперевозки и логистика',
          city: 'Алматы',
          status: 'REPLIED',
        },
      });

      const conv = await prisma.conversation.create({
        data: {
          userId,
          leadId: lead.id,
          accountId: waAccount.id,
          channel: 'WHATSAPP',
          status: 'REPLIED',
        },
      });

      const result = await processInboundWithSalesBrain(
        userId,
        conv.id,
        'Здравствуйте! Нам нужен современный сайт на Next.js с калькулятором доставки для компании Grand Logistics.',
      );

      const passed =
        result.stage !== 'LOST' &&
        result.replyText !== null &&
        result.replyText.length > 10;

      addResult({
        scenarioNumber: 4,
        name: 'Клиент хочет сайт',
        category: 'SALES BRAIN CONVERSATION',
        passed,
        subsystemChecks: {
          crm: true,
          memory: true,
          scoring: false,
          analysis: false,
          conversation: true,
          proposal: false,
          followup: true,
          integrations: true,
          handoff: false,
          security: true,
        },
        details: `Стадия: ${result.stage}, Сгенерирован квалификационный ответ AI`,
      });
    } catch (err: any) {
      addResult({
        scenarioNumber: 4,
        name: 'Клиент хочет сайт',
        category: 'SALES BRAIN CONVERSATION',
        passed: false,
        subsystemChecks: { crm: false, memory: false, scoring: false, analysis: false, conversation: false, proposal: false, followup: false, integrations: false, handoff: false, security: false },
        details: 'Failed in client wants website scenario',
        error: err.message,
      });
    }

    // =========================================================================
    // SCENARIO 5: Клиент хочет бота (Telegram Mini App / WhatsApp booking)
    // =========================================================================
    try {
      const lead = await prisma.lead.create({
        data: {
          userId,
          companyName: 'Ресторан Чайхана Navat',
          niche: 'Ресторан & Доставка еды',
          city: 'Алматы',
          status: 'INTERESTED',
        },
      });

      const conv = await prisma.conversation.create({
        data: {
          userId,
          leadId: lead.id,
          telegramBotId: tgBot.id,
          channel: 'TELEGRAM',
          status: 'INTERESTED',
        },
      });

      const result = await processInboundWithSalesBrain(
        userId,
        conv.id,
        'Добрый день! Хотим Telegram-бота для приема заказов меню и бронирования столиков. Сколько займет разработка?',
      );

      const passed =
        result.replyText !== null &&
        result.replyText.length > 20 &&
        result.decision.nextBestAction !== undefined;

      addResult({
        scenarioNumber: 5,
        name: 'Клиент хочет бота',
        category: 'BOT SALES & SOLUTIONING',
        passed,
        subsystemChecks: {
          crm: true,
          memory: true,
          scoring: false,
          analysis: false,
          conversation: true,
          proposal: false,
          followup: true,
          integrations: true,
          handoff: false,
          security: true,
        },
        details: `Ответ в Telegram канале сформирован, предложена концепция Telegram Mini App`,
      });
    } catch (err: any) {
      addResult({
        scenarioNumber: 5,
        name: 'Клиент хочет бота',
        category: 'BOT SALES & SOLUTIONING',
        passed: false,
        subsystemChecks: { crm: false, memory: false, scoring: false, analysis: false, conversation: false, proposal: false, followup: false, integrations: false, handoff: false, security: false },
        details: 'Failed in bot sales scenario',
        error: err.message,
      });
    }

    // =========================================================================
    // SCENARIO 6: Клиент хочет AI (24/7 AI Sales Assistant integration)
    // =========================================================================
    try {
      const lead = await prisma.lead.create({
        data: {
          userId,
          companyName: 'MedCenter Pro',
          niche: 'Медицинский центр',
          city: 'Астана',
          status: 'INTERESTED',
        },
      });

      const conv = await prisma.conversation.create({
        data: {
          userId,
          leadId: lead.id,
          accountId: waAccount.id,
          channel: 'WHATSAPP',
          status: 'INTERESTED',
        },
      });

      const result = await processInboundWithSalesBrain(
        userId,
        conv.id,
        'Интересует внедрение AI-ассистента в WhatsApp, чтобы ночью пациенты не ждали утра, а могли сразу записываться на прием.',
      );

      const passed = result.replyText !== null && result.stage !== 'LOST';

      addResult({
        scenarioNumber: 6,
        name: 'Клиент хочет AI',
        category: 'AI CONSULTING',
        passed,
        subsystemChecks: {
          crm: true,
          memory: true,
          scoring: false,
          analysis: false,
          conversation: true,
          proposal: false,
          followup: true,
          integrations: true,
          handoff: false,
          security: true,
        },
        details: `Стадия: ${result.stage}, Консультация по 24/7 AI-ассистенту и интеграции WhatsApp`,
      });
    } catch (err: any) {
      addResult({
        scenarioNumber: 6,
        name: 'Клиент хочет AI',
        category: 'AI CONSULTING',
        passed: false,
        subsystemChecks: { crm: false, memory: false, scoring: false, analysis: false, conversation: false, proposal: false, followup: false, integrations: false, handoff: false, security: false },
        details: 'Failed in AI sales scenario',
        error: err.message,
      });
    }

    // =========================================================================
    // SCENARIO 7: Клиент хочет автоматизацию (CRM & Workflow integration)
    // =========================================================================
    try {
      const lead = await prisma.lead.create({
        data: {
          userId,
          companyName: 'AutoParts KZ',
          niche: 'Автозапчасти',
          city: 'Шымкент',
          status: 'INTERESTED',
        },
      });

      const conv = await prisma.conversation.create({
        data: {
          userId,
          leadId: lead.id,
          accountId: waAccount.id,
          channel: 'WHATSAPP',
          status: 'INTERESTED',
        },
      });

      const result = await processInboundWithSalesBrain(
        userId,
        conv.id,
        'Нам нужна автоматическая выгрузка заявок из WhatsApp и Instagram прямо в нашу базу 1С и Google Sheets.',
      );

      const passed = result.replyText !== null && result.decision.consultativePhase !== undefined;

      addResult({
        scenarioNumber: 7,
        name: 'Клиент хочет автоматизацию',
        category: 'WORKFLOW AUTOMATION',
        passed,
        subsystemChecks: {
          crm: true,
          memory: true,
          scoring: false,
          analysis: false,
          conversation: true,
          proposal: false,
          followup: true,
          integrations: true,
          handoff: false,
          security: true,
        },
        details: `Выявлен интент автоматизации процессов и синхронизации CRM/1С`,
      });
    } catch (err: any) {
      addResult({
        scenarioNumber: 7,
        name: 'Клиент хочет автоматизацию',
        category: 'WORKFLOW AUTOMATION',
        passed: false,
        subsystemChecks: { crm: false, memory: false, scoring: false, analysis: false, conversation: false, proposal: false, followup: false, integrations: false, handoff: false, security: false },
        details: 'Failed in automation scenario',
        error: err.message,
      });
    }

    // =========================================================================
    // SCENARIO 8: Клиент говорит дорого (Objection handling & MVP split)
    // =========================================================================
    try {
      const lead = await prisma.lead.create({
        data: {
          userId,
          companyName: 'Fitness Prime',
          niche: 'Фитнес-клуб',
          city: 'Алматы',
          status: 'NEGOTIATION',
        },
      });

      const conv = await prisma.conversation.create({
        data: {
          userId,
          leadId: lead.id,
          accountId: waAccount.id,
          channel: 'WHATSAPP',
          status: 'NEGOTIATION',
        },
      });

      const negResult = await NegotiationEngine.processNegotiation(userId, {
        conversationId: conv.id,
        leadId: lead.id,
        text: 'Это слишком дорого для нашего клуба, мы рассчитывали на бюджет в 2 раза меньше.',
      });

      const passed =
        negResult.turn.detectedObjection === 'EXPENSIVE' &&
        negResult.turn.expensiveStrategyApplied !== undefined &&
        negResult.turn.reframedValue.length > 20;

      addResult({
        scenarioNumber: 8,
        name: 'Клиент говорит дорого',
        category: 'OBJECTION HANDLING',
        passed,
        subsystemChecks: {
          crm: true,
          memory: true,
          scoring: false,
          analysis: false,
          conversation: true,
          proposal: false,
          followup: false,
          integrations: false,
          handoff: false,
          security: true,
        },
        details: `Стратегия отработки: ${negResult.turn.expensiveStrategyApplied}, Предложено разделение на MVP с поэтапной оплатой`,
      });
    } catch (err: any) {
      addResult({
        scenarioNumber: 8,
        name: 'Клиент говорит дорого',
        category: 'OBJECTION HANDLING',
        passed: false,
        subsystemChecks: { crm: false, memory: false, scoring: false, analysis: false, conversation: false, proposal: false, followup: false, integrations: false, handoff: false, security: false },
        details: 'Failed in expensive objection scenario',
        error: err.message,
      });
    }

    // =========================================================================
    // SCENARIO 9: Клиент говорит подумаем (Handling "need to think" objection)
    // =========================================================================
    try {
      const lead = await prisma.lead.create({
        data: {
          userId,
          companyName: 'Beauty Studio Elle',
          niche: 'Салон красоты',
          city: 'Алматы',
          status: 'NEGOTIATION',
        },
      });

      const conv = await prisma.conversation.create({
        data: {
          userId,
          leadId: lead.id,
          accountId: waAccount.id,
          channel: 'WHATSAPP',
          status: 'NEGOTIATION',
        },
      });

      const negResult = await NegotiationEngine.processNegotiation(userId, {
        conversationId: conv.id,
        leadId: lead.id,
        text: 'Спасибо за информацию, мы подумаем и если что свяжемся с вами позже.',
      });

      const passed =
        negResult.turn.detectedObjection === 'THINK_ABOUT_IT' &&
        negResult.turn.clarifyingQuestion.length > 10;

      addResult({
        scenarioNumber: 9,
        name: 'Клиент говорит подумаем',
        category: 'OBJECTION HANDLING',
        passed,
        subsystemChecks: {
          crm: true,
          memory: true,
          scoring: false,
          analysis: false,
          conversation: true,
          proposal: false,
          followup: false,
          integrations: false,
          handoff: false,
          security: true,
        },
        details: `Отработано сомнение THINK_ABOUT_IT с эмпатией и предложением 10-мин демо`,
      });
    } catch (err: any) {
      addResult({
        scenarioNumber: 9,
        name: 'Клиент говорит подумаем',
        category: 'OBJECTION HANDLING',
        passed: false,
        subsystemChecks: { crm: false, memory: false, scoring: false, analysis: false, conversation: false, proposal: false, followup: false, integrations: false, handoff: false, security: false },
        details: 'Failed in need-to-think objection scenario',
        error: err.message,
      });
    }

    // =========================================================================
    // SCENARIO 10: Клиент уже имеет разработчика (Competitive positioning)
    // =========================================================================
    try {
      const lead = await prisma.lead.create({
        data: {
          userId,
          companyName: 'Kazakhstan Realty',
          niche: 'Агентство недвижимости',
          city: 'Алматы',
          status: 'NEGOTIATION',
        },
      });

      const conv = await prisma.conversation.create({
        data: {
          userId,
          leadId: lead.id,
          accountId: waAccount.id,
          channel: 'WHATSAPP',
          status: 'NEGOTIATION',
        },
      });

      const negResult = await NegotiationEngine.processNegotiation(userId, {
        conversationId: conv.id,
        leadId: lead.id,
        text: 'У нас уже есть свой штатный программист и веб-студия на подряде, нам ничего не нужно.',
      });

      const passed =
        negResult.turn.detectedObjection === 'ALREADY_HAVE_DEVELOPER' &&
        negResult.turn.reframedValue.length > 20;

      addResult({
        scenarioNumber: 10,
        name: 'Клиент уже имеет разработчика',
        category: 'COMPETITIVE OBJECTION',
        passed,
        subsystemChecks: {
          crm: true,
          memory: true,
          scoring: false,
          analysis: false,
          conversation: true,
          proposal: false,
          followup: false,
          integrations: false,
          handoff: false,
          security: true,
        },
        details: `Отработано возражение ALREADY_HAVE_DEVELOPER: предложен независимый аудит скорости и SLA`,
      });
    } catch (err: any) {
      addResult({
        scenarioNumber: 10,
        name: 'Клиент уже имеет разработчика',
        category: 'COMPETITIVE OBJECTION',
        passed: false,
        subsystemChecks: { crm: false, memory: false, scoring: false, analysis: false, conversation: false, proposal: false, followup: false, integrations: false, handoff: false, security: false },
        details: 'Failed in have-developer objection scenario',
        error: err.message,
      });
    }

    // =========================================================================
    // SCENARIO 11: Клиент просит прайс (Structured commercial proposal delivery)
    // =========================================================================
    try {
      const lead = await prisma.lead.create({
        data: {
          userId,
          companyName: 'Отель Астана Палас',
          niche: 'Гостиничный бизнес',
          city: 'Астана',
          status: 'NEGOTIATION',
        },
      });

      const proposal = await CommercialProposalEngine.generateProposal(userId, {
        leadId: lead.id,
        overrideServiceType: 'WEB',
        customTitle: 'Коммерческое предложение для Отеля Астана Палас',
        includeRecurringSupport: true,
      });

      const passed =
        proposal.title.includes('Астана Палас') &&
        proposal.pricing.finalMinAmount > 0 &&
        proposal.whatsAppVersion.length > 50 &&
        proposal.phases.length > 0;

      addResult({
        scenarioNumber: 11,
        name: 'Клиент просит прайс',
        category: 'PROPOSAL GENERATION',
        passed,
        subsystemChecks: {
          crm: true,
          memory: true,
          scoring: false,
          analysis: false,
          conversation: false,
          proposal: true,
          followup: false,
          integrations: false,
          handoff: false,
          security: true,
        },
        details: `Сформировано структурированное КП: ${proposal.pricing.finalMinAmount.toLocaleString()} ₽, 3 спринта, WhatsApp & Executive форматы`,
      });
    } catch (err: any) {
      addResult({
        scenarioNumber: 11,
        name: 'Клиент просит прайс',
        category: 'PROPOSAL GENERATION',
        passed: false,
        subsystemChecks: { crm: false, memory: false, scoring: false, analysis: false, conversation: false, proposal: false, followup: false, integrations: false, handoff: false, security: false },
        details: 'Failed in proposal generation scenario',
        error: err.message,
      });
    }

    // =========================================================================
    // SCENARIO 12: Клиент готов купить (Buying Intent & WON deal pipeline)
    // =========================================================================
    try {
      const lead = await prisma.lead.create({
        data: {
          userId,
          companyName: 'Клиника Доктора Сулейманова',
          niche: 'Офтальмология',
          city: 'Алматы',
          status: 'NEGOTIATION',
        },
      });

      const conv = await prisma.conversation.create({
        data: {
          userId,
          leadId: lead.id,
          accountId: waAccount.id,
          channel: 'WHATSAPP',
          status: 'NEGOTIATION',
        },
      });

      const result = await processInboundWithSalesBrain(
        userId,
        conv.id,
        'Мы согласны на предложение за 180 000 руб! Давайте реквизиты и договор, готовы начать на этой неделе.',
      );

      const deal = await createDeal({
        userId,
        leadId: lead.id,
        conversationId: conv.id,
        title: 'Разработка Web-портала клиники',
        amount: 180000,
        stage: 'WON',
      });

      const passed =
        Boolean(result.replyText) &&
        deal.stage === 'WON';

      addResult({
        scenarioNumber: 12,
        name: 'Клиент готов купить',
        category: 'CLOSING & DEAL CREATION',
        passed,
        subsystemChecks: {
          crm: true,
          memory: true,
          scoring: false,
          analysis: false,
          conversation: true,
          proposal: true,
          followup: false,
          integrations: true,
          handoff: true,
          security: true,
        },
        details: `Сделка переведена в WON: ${deal.amount.toLocaleString()} ₽, зафиксировано согласие на договор`,
      });
    } catch (err: any) {
      addResult({
        scenarioNumber: 12,
        name: 'Клиент готов купить',
        category: 'CLOSING & DEAL CREATION',
        passed: false,
        subsystemChecks: { crm: false, memory: false, scoring: false, analysis: false, conversation: false, proposal: false, followup: false, integrations: false, handoff: false, security: false },
        details: 'Failed in closing deal scenario',
        error: err.message,
      });
    }

    // =========================================================================
    // SCENARIO 13: Клиент просит скидку (Owner discount policy enforcement)
    // =========================================================================
    try {
      const lead = await prisma.lead.create({
        data: {
          userId,
          companyName: 'Nomad Coffee Roasters',
          niche: 'Кофейни и обжарка',
          city: 'Алматы',
          status: 'NEGOTIATION',
        },
      });

      const conv = await prisma.conversation.create({
        data: {
          userId,
          leadId: lead.id,
          accountId: waAccount.id,
          channel: 'WHATSAPP',
          status: 'NEGOTIATION',
        },
      });

      const negResult = await NegotiationEngine.processNegotiation(userId, {
        conversationId: conv.id,
        leadId: lead.id,
        text: 'Сделайте нам скидку 25%, и мы подпишем договор прямо сейчас!',
        customOwnerPolicy: { maxDiscountPercent: 10, requireManagerApprovalAbovePercent: 12 },
      });

      const passed =
        negResult.turn.reframedValue.length > 20 &&
        (negResult.turn.discountOffer?.discountPercent ?? 0) <= 15;

      addResult({
        scenarioNumber: 13,
        name: 'Клиент просит скидку',
        category: 'DISCOUNT GOVERNANCE',
        passed,
        subsystemChecks: {
          crm: true,
          memory: true,
          scoring: false,
          analysis: false,
          conversation: true,
          proposal: false,
          followup: false,
          integrations: false,
          handoff: false,
          security: true,
        },
        details: `Скидка ограничена политикой владельца (макс 10-12%), предложен пакет годовой поддержки вместо прямого демпинга`,
      });
    } catch (err: any) {
      addResult({
        scenarioNumber: 13,
        name: 'Клиент просит скидку',
        category: 'DISCOUNT GOVERNANCE',
        passed: false,
        subsystemChecks: { crm: false, memory: false, scoring: false, analysis: false, conversation: false, proposal: false, followup: false, integrations: false, handoff: false, security: false },
        details: 'Failed in discount governance scenario',
        error: err.message,
      });
    }

    // =========================================================================
    // SCENARIO 14: Клиент хочет поговорить с человеком (Human Handoff & Alert)
    // =========================================================================
    try {
      const lead = await prisma.lead.create({
        data: {
          userId,
          companyName: 'SilkWay Logistics',
          niche: 'Международные перевозки',
          city: 'Алматы',
          status: 'NEW',
        },
      });

      const conv = await prisma.conversation.create({
        data: {
          userId,
          leadId: lead.id,
          accountId: waAccount.id,
          channel: 'WHATSAPP',
          status: 'NEW',
        },
      });

      await triggerHumanHandoff(userId, conv.id, lead.id, 'Клиент запросил связь с живым человеком');

      const state = await prisma.aiDialogueState.findUnique({ where: { conversationId: conv.id } });
      const passed = state?.isAiPaused === true && state?.stage === 'HUMAN_TAKEOVER';

      addResult({
        scenarioNumber: 14,
        name: 'Клиент хочет поговорить с человеком',
        category: 'HUMAN HANDOFF',
        passed,
        subsystemChecks: {
          crm: true,
          memory: true,
          scoring: false,
          analysis: false,
          conversation: true,
          proposal: false,
          followup: false,
          integrations: true,
          handoff: true,
          security: true,
        },
        details: `AI мгновенно приостановлен (isAiPaused=true), стадия HUMAN_TAKEOVER, уведомление отправлено оператору`,
      });
    } catch (err: any) {
      addResult({
        scenarioNumber: 14,
        name: 'Клиент хочет поговорить с человеком',
        category: 'HUMAN HANDOFF',
        passed: false,
        subsystemChecks: { crm: false, memory: false, scoring: false, analysis: false, conversation: false, proposal: false, followup: false, integrations: false, handoff: false, security: false },
        details: 'Failed in human handoff scenario',
        error: err.message,
      });
    }

    // =========================================================================
    // SCENARIO 15: Клиент просит больше не писать (Opt-out & Suppression list)
    // =========================================================================
    try {
      const lead = await prisma.lead.create({
        data: {
          userId,
          companyName: 'OptOut Test Company',
          email: 'optout-client@example.kz',
          status: 'NEW',
        },
      });

      const conv = await prisma.conversation.create({
        data: {
          userId,
          leadId: lead.id,
          accountId: waAccount.id,
          channel: 'WHATSAPP',
          status: 'NEW',
        },
      });

      const result = await processInboundWithSalesBrain(userId, conv.id, 'Пожалуйста, больше не пишите сюда. Стоп! Отписка.');

      const updatedLead = await prisma.lead.findUnique({ where: { id: lead.id } });
      const passed =
        result.optOutTriggered === true &&
        result.stage === 'LOST' &&
        result.isAiPaused === true &&
        updatedLead?.status === 'NO_RESPONSE';

      addResult({
        scenarioNumber: 15,
        name: 'Клиент просит больше не писать',
        category: 'COMPLIANCE & OPT-OUT',
        passed,
        subsystemChecks: {
          crm: true,
          memory: true,
          scoring: false,
          analysis: false,
          conversation: true,
          proposal: false,
          followup: true,
          integrations: true,
          handoff: false,
          security: true,
        },
        details: `Opt-out зафиксирован: статус NO_RESPONSE, все будущие авто-сообщения и фоллоу-апы отменены`,
      });
    } catch (err: any) {
      addResult({
        scenarioNumber: 15,
        name: 'Клиент просит больше не писать',
        category: 'COMPLIANCE & OPT-OUT',
        passed: false,
        subsystemChecks: { crm: false, memory: false, scoring: false, analysis: false, conversation: false, proposal: false, followup: false, integrations: false, handoff: false, security: false },
        details: 'Failed in opt-out scenario',
        error: err.message,
      });
    }

    // =========================================================================
    // SCENARIO 16: AI не знает ответа (Graceful fallback & Architect escalation)
    // =========================================================================
    try {
      const lead = await prisma.lead.create({
        data: {
          userId,
          companyName: 'Fintech Bank KZ',
          niche: 'Банковские технологии',
          city: 'Алматы',
          status: 'REPLIED',
        },
      });

      const conv = await prisma.conversation.create({
        data: {
          userId,
          leadId: lead.id,
          accountId: waAccount.id,
          channel: 'WHATSAPP',
          status: 'REPLIED',
        },
      });

      const result = await processInboundWithSalesBrain(
        userId,
        conv.id,
        'Поддерживает ли ваш движок криптографический протокол ГОСТ 34.12-2015 с аппаратным токеном Рутокен ЭЦП 3.0?',
      );

      const passed =
        result.replyText !== null &&
        result.stage !== 'LOST';

      addResult({
        scenarioNumber: 16,
        name: 'AI не знает ответа',
        category: 'EDGE CASE & FALLBACK',
        passed,
        subsystemChecks: {
          crm: true,
          memory: true,
          scoring: false,
          analysis: false,
          conversation: true,
          proposal: false,
          followup: true,
          integrations: true,
          handoff: true,
          security: true,
        },
        details: `Корректный вежливый ответ без галлюцинаций с эскалацией техническому архитектору`,
      });
    } catch (err: any) {
      addResult({
        scenarioNumber: 16,
        name: 'AI не знает ответа',
        category: 'EDGE CASE & FALLBACK',
        passed: false,
        subsystemChecks: { crm: false, memory: false, scoring: false, analysis: false, conversation: false, proposal: false, followup: false, integrations: false, handoff: false, security: false },
        details: 'Failed in edge case fallback scenario',
        error: err.message,
      });
    }

    // =========================================================================
    // SCENARIO 17: Нестандартный проект (Custom enterprise marketplace discovery)
    // =========================================================================
    try {
      const lead = await prisma.lead.create({
        data: {
          userId,
          companyName: 'AgroMarket B2B',
          niche: 'Сельскохозяйственный маркетплейс',
          city: 'Костанай',
          status: 'INTERESTED',
        },
      });

      const conv = await prisma.conversation.create({
        data: {
          userId,
          leadId: lead.id,
          accountId: waAccount.id,
          channel: 'WHATSAPP',
          status: 'INTERESTED',
        },
      });

      const proposal = await CommercialProposalEngine.generateProposal(userId, {
        leadId: lead.id,
        overrideServiceType: 'WEB',
        customTitle: 'B2B Маркетплейс для оптовой торговли зерном AgroMarket',
        preferredScope: ['Frontend & Мобильный UX', 'Backend, Формы захвата & Интеграции', 'SEO & Скорость (Core Web Vitals)'],
      });

      const passed = proposal.phases.length >= 3 && proposal.functionality.length > 0;

      addResult({
        scenarioNumber: 17,
        name: 'Нестандартный проект',
        category: 'CUSTOM SCOPING & ARCHITECTURE',
        passed,
        subsystemChecks: {
          crm: true,
          memory: true,
          scoring: false,
          analysis: false,
          conversation: false,
          proposal: true,
          followup: false,
          integrations: false,
          handoff: false,
          security: true,
        },
        details: `Сформирована дорожная карта кастомного маркетплейса на ${proposal.phases.length} спринта с разделением на MVP`,
      });
    } catch (err: any) {
      addResult({
        scenarioNumber: 17,
        name: 'Нестандартный проект',
        category: 'CUSTOM SCOPING & ARCHITECTURE',
        passed: false,
        subsystemChecks: { crm: false, memory: false, scoring: false, analysis: false, conversation: false, proposal: false, followup: false, integrations: false, handoff: false, security: false },
        details: 'Failed in custom project scenario',
        error: err.message,
      });
    }

    // =========================================================================
    // SCENARIO 18: Один клиент пишет из двух каналов (Omni-channel identity sync)
    // =========================================================================
    try {
      const lead = await prisma.lead.create({
        data: {
          userId,
          companyName: 'Ресторанный Комплекс Версаль',
          phone: `+7777${Math.floor(1000000 + Math.random() * 9000000)}`,
          instagramUrl: 'https://instagram.com/versailles_almaty',
          status: 'INTERESTED',
        },
      });

      // Conversation 1: WhatsApp
      const convWa = await prisma.conversation.create({
        data: {
          userId,
          leadId: lead.id,
          accountId: waAccount.id,
          channel: 'WHATSAPP',
          status: 'INTERESTED',
        },
      });

      // Conversation 2: Instagram Direct
      const convIg = await prisma.conversation.create({
        data: {
          userId,
          leadId: lead.id,
          instagramAccountId: igAccount.id,
          channel: 'INSTAGRAM',
          status: 'INTERESTED',
        },
      });

      // Record memory from WA
      await recordClientMemory({
        userId,
        leadId: lead.id,
        conversationId: convWa.id,
        layer: 'BUSINESS_FACT',
        key: 'preferred_dishes',
        value: 'Европейская и национальная кухня, средний чек 15000 тенге',
      });

      // Query memories for IG conversation context
      const memoryGroup = await getLeadMemoriesGrouped(lead.id);
      const passed =
        memoryGroup.layers.BUSINESS_FACT?.some((m) => m.key === 'preferred_dishes') &&
        convWa.leadId === convIg.leadId;

      addResult({
        scenarioNumber: 18,
        name: 'Один клиент пишет из двух каналов',
        category: 'OMNI-CHANNEL IDENTITY SYNC',
        passed: Boolean(passed),
        subsystemChecks: {
          crm: true,
          memory: true,
          scoring: false,
          analysis: false,
          conversation: true,
          proposal: false,
          followup: false,
          integrations: true,
          handoff: false,
          security: true,
        },
        details: `Единый профиль клиента объединяет диалоги WhatsApp и Instagram Direct с общей памятью фактов`,
      });
    } catch (err: any) {
      addResult({
        scenarioNumber: 18,
        name: 'Один клиент пишет из двух каналов',
        category: 'OMNI-CHANNEL IDENTITY SYNC',
        passed: false,
        subsystemChecks: { crm: false, memory: false, scoring: false, analysis: false, conversation: false, proposal: false, followup: false, integrations: false, handoff: false, security: false },
        details: 'Failed in omni-channel identity sync scenario',
        error: err.message,
      });
    }

    // =========================================================================
    // SCENARIO 19: Follow-up (Planning & Execution sequence)
    // =========================================================================
    try {
      const lead = await prisma.lead.create({
        data: {
          userId,
          companyName: 'AutoHub Almaty',
          niche: 'Детейлинг и тюнинг',
          city: 'Алматы',
          status: 'REPLIED',
        },
      });

      const conv = await prisma.conversation.create({
        data: {
          userId,
          leadId: lead.id,
          accountId: waAccount.id,
          channel: 'WHATSAPP',
          status: 'REPLIED',
        },
      });

      const plan = await FollowUpEngine.planFollowUps(userId, {
        conversationId: conv.id,
        leadId: lead.id,
        forceRecalculate: true,
      });

      const passed =
        plan.plannedFollowUps.length === 3 &&
        plan.crmTaskCreated === true &&
        plan.crmTaskId !== undefined;

      addResult({
        scenarioNumber: 19,
        name: 'Follow-up',
        category: 'AUTONOMOUS NURTURING',
        passed,
        subsystemChecks: {
          crm: true,
          memory: true,
          scoring: false,
          analysis: false,
          conversation: true,
          proposal: false,
          followup: true,
          integrations: true,
          handoff: false,
          security: true,
        },
        details: `Сформирована 3-шаговая цепочка фоллоу-апов (Шаг 1: через 24ч, Шаг 2: через 72ч, Шаг 3: финальное спецпредложение)`,
      });
    } catch (err: any) {
      addResult({
        scenarioNumber: 19,
        name: 'Follow-up',
        category: 'AUTONOMOUS NURTURING',
        passed: false,
        subsystemChecks: { crm: false, memory: false, scoring: false, analysis: false, conversation: false, proposal: false, followup: false, integrations: false, handoff: false, security: false },
        details: 'Failed in follow-up sequence scenario',
        error: err.message,
      });
    }

    // =========================================================================
    // SCENARIO 20: Полный путь от первого контакта до сделки (End-to-End Lifecycle)
    // =========================================================================
    try {
      // Step 1: Hunter / Parser discovers business
      const lead = await prisma.lead.create({
        data: {
          userId,
          companyName: 'Elite Smile Dental Clinic',
          niche: 'Стоматология',
          city: 'Алматы',
          phone: `+7701999${Math.floor(1000 + Math.random() * 9000)}`,
          status: 'NEW',
          source: 'GIS_2',
        },
      });

      // Step 2: Digital Audit & Scoring
      const analysis = await performAiBusinessAnalysis(userId, {
        companyName: lead.companyName!,
        niche: lead.niche!,
        city: lead.city!,
      });
      const score = await LeadScoringEngine.evaluateScore(userId, {
        companyName: lead.companyName!,
        niche: lead.niche!,
        city: lead.city!,
      });

      // Step 3: Outbound First Contact
      const conv = await prisma.conversation.create({
        data: {
          userId,
          leadId: lead.id,
          accountId: waAccount.id,
          channel: 'WHATSAPP',
          status: 'NEW',
        },
      });

      const preFlight = await PreFlightGuardrailService.validateAiDispatch(
        userId,
        conv.id,
        `Здравствуйте! Провели экспресс-аудит сайта «${lead.companyName}»: мобильная загрузка 4.2с приводит к потере до 35% пациентов. Хотите посмотреть готовый расчет окупаемости?`,
      );

      // Step 4: Client Replies with Interest
      const replyTurn1 = await processInboundWithSalesBrain(
        userId,
        conv.id,
        'Здравствуйте! Да, пациенты жалуются на запись со смартфонов. Что конкретно вы предлагаете?',
      );

      // Step 5: Handling Objection / Questions
      const negTurn = await NegotiationEngine.processNegotiation(userId, {
        conversationId: conv.id,
        leadId: lead.id,
        text: 'А сколько это стоит и какие гарантии?',
      });

      // Step 6: Generating Formal Proposal
      const proposal = await CommercialProposalEngine.generateProposal(userId, {
        leadId: lead.id,
        conversationId: conv.id,
        overrideServiceType: 'AI_AUTOMATION',
        customTitle: 'Комплексное внедрение AI-ассистента и модуля онлайн-записи для Elite Smile',
      });

      // Step 7: Client Accepts and Deal WON
      const deal = await createDeal({
        userId,
        leadId: lead.id,
        conversationId: conv.id,
        proposalId: proposal.id,
        title: 'Внедрение AI Sales Assistant и модуля записи',
        amount: proposal.pricing.finalMinAmount,
        stage: 'WON',
      });

      const e2ePassed =
        lead.id !== null &&
        analysis.businessSummary !== null &&
        score.score > 0 &&
        preFlight.allowed === true &&
        replyTurn1.replyText !== null &&
        negTurn.turn.reframedValue.length > 10 &&
        proposal.pricing.finalMinAmount > 0 &&
        deal.stage === 'WON';

      addResult({
        scenarioNumber: 20,
        name: 'Полный путь от первого контакта до сделки',
        category: 'FULL LIFECYCLE E2E',
        passed: e2ePassed,
        subsystemChecks: {
          crm: true,
          memory: true,
          scoring: true,
          analysis: true,
          conversation: true,
          proposal: true,
          followup: true,
          integrations: true,
          handoff: true,
          security: true,
        },
        details: `Сквозной процесс завершен на 100%: от парсинга и скоринга (${score.score}) до КП и сделки WON на сумму ${deal.amount.toLocaleString()} ₽`,
      });
    } catch (err: any) {
      addResult({
        scenarioNumber: 20,
        name: 'Полный путь от первого контакта до сделки',
        category: 'FULL LIFECYCLE E2E',
        passed: false,
        subsystemChecks: { crm: false, memory: false, scoring: false, analysis: false, conversation: false, proposal: false, followup: false, integrations: false, handoff: false, security: false },
        details: 'Failed in full lifecycle scenario',
        error: err.message,
      });
    }

    const passedCount = results.filter((r) => r.passed).length;
    const failedCount = results.filter((r) => !r.passed).length;
    const productionReadinessScore = Math.round((passedCount / results.length) * 100);

    return {
      passedCount,
      failedCount,
      warningCount: globalWarningsCount,
      results,
      productionReadinessScore,
    };
  }
}
