import type {
  SalesBrainStage,
  SalesBrainAction,
  ConsultativePhase,
  ClientIntent,
  AiStage,
} from '@nexora/types';

/**
 * Stage definitions and action rules matrix for the Central Sales Brain State Machine.
 */
export interface StageRule {
  stage: SalesBrainStage;
  label: string;
  description: string;
  consultativePhase: ConsultativePhase;
  allowedActions: string[];
  prohibitedActions: string[];
  validNextStages: SalesBrainStage[];
}

export const STAGE_RULES: Record<SalesBrainStage, StageRule> = {
  NEW: {
    stage: 'NEW',
    label: 'Новый лид',
    description: 'Лид обнаружен, но контакт еще не установлен.',
    consultativePhase: 'PROBLEM',
    allowedActions: [
      'ANALYZE_PROFILE',
      'FORMULATE_ICEBREAKER',
      'SEND_FIRST_TOUCH',
      'SCORE_LEAD',
    ],
    prohibitedActions: [
      'PRESENT_SOLUTION',
      'SEND_PROPOSAL',
      'DISCUSS_PRICE',
      'PRESSURE_SALE',
    ],
    validNextStages: ['CONTACTED', 'DISCOVERY', 'QUALIFIED', 'LOST', 'HUMAN_HANDOFF'],
  },

  CONTACTED: {
    stage: 'CONTACTED',
    label: 'Первое касание',
    description: 'Отправлено первое сообщение, ожидается реакция клиента.',
    consultativePhase: 'PROBLEM',
    allowedActions: [
      'WAIT_REPLY',
      'SCHEDULE_FOLLOW_UP',
      'PROCESS_INBOUND',
      'FORMULATE_ICEBREAKER',
    ],
    prohibitedActions: [
      'MASS_SPAM',
      'SEND_PROPOSAL',
      'DISCUSS_PRICE',
      'INTRUSIVE_CALLS',
    ],
    validNextStages: ['DISCOVERY', 'FOLLOW_UP', 'LOST', 'HUMAN_HANDOFF'],
  },

  DISCOVERY: {
    stage: 'DISCOVERY',
    label: 'Выявление потребностей (Discovery)',
    description: 'Диагностика процессов бизнеса, выявление узких мест и потерь.',
    consultativePhase: 'IMPACT',
    allowedActions: [
      'ASK_QUALIFYING_QUESTION',
      'DEEPEN_PROBLEM_IMPACT',
      'DETECT_PAIN_POINTS',
      'EXTRACT_MEMORY_FACTS',
      'LISTEN_ACTIVE',
    ],
    prohibitedActions: [
      'PRESENT_SOLUTION_EARLY',
      'SEND_PROPOSAL',
      'PRESSURE_SALE',
      'ARGUE_OBJECTION',
      'PITCH_FEATURES_IN_FACE',
    ],
    validNextStages: ['QUALIFIED', 'FOLLOW_UP', 'LOST', 'HUMAN_HANDOFF'],
  },

  QUALIFIED: {
    stage: 'QUALIFIED',
    label: 'Квалифицирован (Qualified)',
    description: 'Подтверждено наличие боли, ЛПР, ориентировочный бюджет и готовность к изменениям.',
    consultativePhase: 'NEED',
    allowedActions: [
      'CONFIRM_NEED',
      'SUMMARIZE_PAIN_IMPACT',
      'PROPOSE_SOLUTION_CONCEPT',
      'ASK_QUALIFYING_QUESTION',
      'SCHEDULE_DEMO',
    ],
    prohibitedActions: [
      'SEND_UNSOLICITED_INVOICE',
      'EXAGGERATE_PROMISES',
      'FAKE_DEADLINES',
    ],
    validNextStages: ['SOLUTION', 'DISCOVERY', 'FOLLOW_UP', 'LOST', 'HUMAN_HANDOFF'],
  },

  SOLUTION: {
    stage: 'SOLUTION',
    label: 'Презентация решения',
    description: 'Демонстрация архитектурного решения Nexora и обоснование ценности и ROI.',
    consultativePhase: 'SOLUTION',
    allowedActions: [
      'PRESENT_SOLUTION',
      'EXPLAIN_VALUE_AND_ROI',
      'ANSWER_TECH_QUESTIONS',
      'DEMO_CONCEPT',
      'SHARE_RELEVANT_CASE',
    ],
    prohibitedActions: [
      'PRESSURE_SALE',
      'MANIPULATIVE_DISCOUNT',
      'FAKE_SCARCITY',
      'UNREALISTIC_TIMELINE',
    ],
    validNextStages: ['PROPOSAL', 'QUALIFIED', 'NEGOTIATION', 'FOLLOW_UP', 'LOST', 'HUMAN_HANDOFF'],
  },

  PROPOSAL: {
    stage: 'PROPOSAL',
    label: 'Коммерческое предложение',
    description: 'Формирование и отправка структурированного КП / сметы / договора.',
    consultativePhase: 'OFFER',
    allowedActions: [
      'GENERATE_PROPOSAL',
      'SEND_PROPOSAL',
      'EXPLAIN_DELIVERABLES_TIMELINE',
      'CLARIFY_SCOPE',
    ],
    prohibitedActions: [
      'ALTER_SCOPE_UNILATERALLY',
      'HIDDEN_FEES',
      'AGGRESSIVE_CLOSING',
    ],
    validNextStages: ['NEGOTIATION', 'WON', 'LOST', 'FOLLOW_UP', 'HUMAN_HANDOFF'],
  },

  NEGOTIATION: {
    stage: 'NEGOTIATION',
    label: 'Переговоры и согласование',
    description: 'Отработка возражений (цена, сроки, доверие), согласование условий и этапов оплаты.',
    consultativePhase: 'VALUE',
    allowedActions: [
      'HANDLE_OBJECTION',
      'CLARIFY_TERMS',
      'OFFER_TIERED_OPTIONS',
      'EXPLAIN_VALUE_AND_ROI',
      'PREPARE_CONTRACT',
    ],
    prohibitedActions: [
      'AGGRESSIVE_CLOSING',
      'DISMISS_CONCERNS',
      'TOXIC_BARGAINING',
      'DEVALUE_COMPETITORS',
    ],
    validNextStages: ['WON', 'LOST', 'PROPOSAL', 'FOLLOW_UP', 'HUMAN_HANDOFF'],
  },

  FOLLOW_UP: {
    stage: 'FOLLOW_UP',
    label: 'Вежливое сопровождение (Follow-up)',
    description: 'Мягкое ненавязчивое касание, предоставление полезного кейса или уточнение таймлайна.',
    consultativePhase: 'VALUE',
    allowedActions: [
      'SCHEDULE_FOLLOW_UP',
      'SHARE_RELEVANT_CASE',
      'ASK_TIMELINE_UPDATE',
      'CHECK_PROJECT_STATUS',
    ],
    prohibitedActions: [
      'INTRUSIVE_CALLS',
      'TOXIC_PRESSURE',
      'PASSIVE_AGGRESSIVE_TONE',
      'DAILY_SPAM',
    ],
    validNextStages: ['DISCOVERY', 'QUALIFIED', 'SOLUTION', 'PROPOSAL', 'NEGOTIATION', 'LOST', 'HUMAN_HANDOFF'],
  },

  WON: {
    stage: 'WON',
    label: 'Сделка закрыта (Won)',
    description: 'Клиент принял предложение, подписан договор или внесен аванс.',
    consultativePhase: 'OFFER',
    allowedActions: [
      'CONFIRM_AGREEMENT',
      'SEND_ONBOARDING_INFO',
      'NOTIFY_PROJECT_TEAM',
      'TRANSFER_TO_HUMAN',
    ],
    prohibitedActions: [
      'RESELL_SERVICES',
      'DELAY_ONBOARDING',
      'ALTER_AGREED_TERMS',
    ],
    validNextStages: ['HUMAN_HANDOFF', 'DISCOVERY'],
  },

  LOST: {
    stage: 'LOST',
    label: 'Сделка закрыта (Lost)',
    description: 'Клиент отказался, проект заморожен или лид нецелевой.',
    consultativePhase: 'PROBLEM',
    allowedActions: [
      'POLITE_CLOSE',
      'LOG_LOST_REASON',
      'ARCHIVE_OR_NURTURE',
    ],
    prohibitedActions: [
      'ARGUE_WITH_CLIENT',
      'UNPROFESSIONAL_REBUTTAL',
      'CONTINUE_SPAM',
    ],
    validNextStages: ['NEW', 'DISCOVERY', 'HUMAN_HANDOFF'],
  },

  HUMAN_HANDOFF: {
    stage: 'HUMAN_HANDOFF',
    label: 'Передано человеку (Human Handoff)',
    description: 'AI приостановлен, диалог ведет живой специалист или архитектор Nexora.',
    consultativePhase: 'VALUE',
    allowedActions: [
      'ALERT_MANAGER',
      'PAUSE_AI_AUTO_REPLIES',
      'PROVIDE_AI_SUMMARY',
      'GENERATE_COPILOT_SUGGESTIONS',
    ],
    prohibitedActions: [
      'INTERFERE_WITH_HUMAN',
      'OVERRIDE_HUMAN_MESSAGES',
      'AUTO_REPLY_WITHOUT_HUMAN_APPROVAL',
    ],
    validNextStages: ['DISCOVERY', 'QUALIFIED', 'SOLUTION', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST', 'FOLLOW_UP'],
  },
};

/**
 * Normalizes legacy stages to current standard 11 Sales Brain stages.
 */
export function normalizeSalesBrainStage(stage: string | null | undefined): SalesBrainStage {
  if (!stage) return 'NEW';

  const s = stage.toUpperCase();
  switch (s) {
    case 'NEW':
    case 'DISCOVERED':
    case 'ANALYZED':
    case 'SCORED':
      return 'NEW';

    case 'CONTACTED':
    case 'OUTREACH_PENDING':
    case 'FIRST_TOUCH_SENT':
      return 'CONTACTED';

    case 'DISCOVERY':
    case 'NEEDS_DISCOVERY':
    case 'PROBLEM_DIAGNOSED':
    case 'REPLIED':
      return 'DISCOVERY';

    case 'QUALIFIED':
      return 'QUALIFIED';

    case 'SOLUTION':
    case 'SOLUTION_PROPOSED':
      return 'SOLUTION';

    case 'PROPOSAL':
    case 'PROPOSAL_SENT':
      return 'PROPOSAL';

    case 'NEGOTIATION':
    case 'OBJECTION_HANDLING':
    case 'CLOSING':
      return 'NEGOTIATION';

    case 'FOLLOW_UP':
      return 'FOLLOW_UP';

    case 'WON':
      return 'WON';

    case 'LOST':
      return 'LOST';

    case 'HUMAN_HANDOFF':
    case 'HUMAN_TAKEOVER':
      return 'HUMAN_HANDOFF';

    default:
      return 'DISCOVERY';
  }
}

/**
 * Validates whether a transition from one stage to another is allowed.
 */
export function validateStateTransition(
  currentStage: SalesBrainStage,
  targetStage: SalesBrainStage,
  isManagerOverride: boolean = false,
): { allowed: boolean; reason?: string } {
  if (currentStage === targetStage) {
    return { allowed: true };
  }

  // Managers/Architects can force any transition if needed
  if (isManagerOverride) {
    return { allowed: true };
  }

  const rule = STAGE_RULES[currentStage];
  if (!rule) {
    return { allowed: false, reason: `Unknown stage: ${currentStage}` };
  }

  if (rule.validNextStages.includes(targetStage)) {
    return { allowed: true };
  }

  // Always allow transition to HUMAN_HANDOFF or LOST
  if (targetStage === 'HUMAN_HANDOFF' || targetStage === 'LOST') {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: `Переход из стадии "${rule.label}" в "${STAGE_RULES[targetStage]?.label || targetStage}" запрещен регламентом State Machine. Допустимые следующие стадии: ${rule.validNextStages.map((st) => STAGE_RULES[st]?.label || st).join(', ')}.`,
  };
}

/**
 * Returns allowed and prohibited action lists for a given stage.
 */
export function getActionsForStage(stage: SalesBrainStage): { allowed: string[]; prohibited: string[] } {
  const rule = STAGE_RULES[stage] || STAGE_RULES.DISCOVERY;
  return {
    allowed: rule.allowedActions,
    prohibited: rule.prohibitedActions,
  };
}

/**
 * Calculates current consultative phase according to consultative methodology:
 * PROBLEM -> IMPACT -> NEED -> SOLUTION -> VALUE -> OFFER
 */
export function getConsultativePhaseForStage(stage: SalesBrainStage): ConsultativePhase {
  const rule = STAGE_RULES[stage];
  return rule ? rule.consultativePhase : 'PROBLEM';
}

/**
 * Determines automatic transition based on intent, history, and current stage.
 */
export function evaluateAutoStageTransition(
  currentStage: SalesBrainStage,
  intent: ClientIntent,
  inboundText: string,
  messageCount: number,
  hasIdentifiedProblems: boolean,
  hasIdentifiedNeed: boolean,
): SalesBrainStage {
  const text = inboundText.toLowerCase();

  // 1. Opt-out / Unsubscribe
  if (intent === 'OPT_OUT') {
    return 'LOST';
  }

  // 2. Direct Human / Call Request
  if (intent === 'REQUEST_CALL_HUMAN' || text.includes('созвон') || text.includes('позвоните') || text.includes('человек') || text.includes('директор')) {
    return 'HUMAN_HANDOFF';
  }

  // 3. Agreement / Acceptance
  if (intent === 'INTERESTED_READY' && (currentStage === 'PROPOSAL' || currentStage === 'NEGOTIATION')) {
    if (text.includes('оплатить') || text.includes('готовы работать') || text.includes('выставляйте счет') || text.includes('подписываем')) {
      return 'WON';
    }
  }

  // 4. Objections
  if (intent.startsWith('OBJECTION_')) {
    if (currentStage === 'SOLUTION' || currentStage === 'PROPOSAL' || currentStage === 'QUALIFIED') {
      return 'NEGOTIATION';
    }
  }

  // 5. Progression through Consultative Funnel
  switch (currentStage) {
    case 'NEW':
      if (intent === 'PROBLEM_STATEMENT' || hasIdentifiedProblems) {
        return 'QUALIFIED';
      }
      return 'DISCOVERY';

    case 'CONTACTED':
      // Client responded -> Move to DISCOVERY or QUALIFIED
      if (intent === 'PROBLEM_STATEMENT' || hasIdentifiedProblems) {
        return 'QUALIFIED';
      }
      return 'DISCOVERY';

    case 'DISCOVERY':
      // If client explained their process/problem and we have sufficient data -> QUALIFIED
      if (hasIdentifiedProblems || hasIdentifiedNeed || messageCount >= 4 || intent === 'PROBLEM_STATEMENT') {
        return 'QUALIFIED';
      }
      return 'DISCOVERY';

    case 'QUALIFIED':
      // If client asks about solutions, examples, or pricing -> SOLUTION
      if (intent === 'QUESTION_ABOUT_SERVICES' || intent === 'TECH_INQUIRY' || text.includes('как') || text.includes('что предлагаете') || text.includes('вариант')) {
        return 'SOLUTION';
      }
      if (intent === 'PRICE_INQUIRY' || text.includes('цена') || text.includes('стоимость') || text.includes('сколько')) {
        return 'SOLUTION';
      }
      return 'QUALIFIED';

    case 'SOLUTION':
      // If client requests proposal/estimate/quote -> PROPOSAL
      if (intent === 'PRICE_INQUIRY' || text.includes('кп') || text.includes('предложение') || text.includes('смета') || text.includes('расчет')) {
        return 'PROPOSAL';
      }
      return 'SOLUTION';

    case 'PROPOSAL':
      if (intent.startsWith('OBJECTION_') || text.includes('дорого') || text.includes('скидк') || text.includes('сроки')) {
        return 'NEGOTIATION';
      }
      return 'PROPOSAL';

    case 'NEGOTIATION':
      return 'NEGOTIATION';

    case 'FOLLOW_UP':
      // Client replied to follow-up -> return to DISCOVERY or QUALIFIED
      return 'DISCOVERY';

    default:
      return currentStage;
  }
}
