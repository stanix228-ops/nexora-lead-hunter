import { logger } from '../logger';
import { maskSecrets } from './pii-masker';

/**
 * PromptFirewall & AI Execution Sandbox Guard.
 * Enforces strict boundaries on what AI can process and output:
 * 1. Blocks direct and indirect prompt injections, jailbreaks, and DAN modes.
 * 2. Prevents exfiltration of internal system prompts, prompts instructions, and canary tokens.
 * 3. Prevents leakage of API keys (OpenAI, Anthropic, Meta, Telegram, Resend).
 * 4. Prevents arbitrary command execution, code evaluation, and SQL injection.
 * 5. Prevents unauthorized price changes and discounts exceeding policy.
 * 6. Prevents CRM deletions and system settings alterations.
 */

const INJECTION_RULES: Array<{ pattern: RegExp; ruleName: string; severity: 'HIGH' | 'CRITICAL' }> = [
  // Direct override attempts
  { pattern: /ignore (all )?(previous|prior) (instructions|prompts|directives)/i, ruleName: 'IGNORE_PREVIOUS_INSTRUCTIONS', severity: 'CRITICAL' },
  { pattern: /забудь (все )?(предыдущие|прошлые) (инструкции|правила|указания)/i, ruleName: 'FORGET_INSTRUCTIONS_RU', severity: 'CRITICAL' },
  { pattern: /(disregard|override) (all )?(system|safety|security) (rules|prompts)/i, ruleName: 'OVERRIDE_SAFETY_RULES', severity: 'CRITICAL' },
  // System prompt exfiltration
  { pattern: /(reveal|print|show|output|repeat|display) (your )?(system prompt|initial prompt|hidden instructions|base prompt)/i, ruleName: 'SYSTEM_PROMPT_EXFILTRATION', severity: 'CRITICAL' },
  { pattern: /(покажи|выведи|раскрой|напиши|процитируй) (свой )?(системный промпт|инструкции разработчиков|базовые правила)/i, ruleName: 'SYSTEM_PROMPT_EXFILTRATION_RU', severity: 'CRITICAL' },
  // API keys and secrets fishing
  { pattern: /(?:give me|show|send|print|leak|tell me)\s+(?:the\s+|your\s+|all\s+)?(?:openai\s+|system\s+|auth\s+)?(?:api[-_\s]?key|api_key|secret|token|password|jwt)/i, ruleName: 'API_KEY_FISHING', severity: 'CRITICAL' },
  { pattern: /(?:дай|покажи|выдай|пришли|скажи)\s+(?:мне\s+|свой\s+)?(?:апи\s*ключ|api\s*ключ|пароль|токен|секрет|jwt)/i, ruleName: 'API_KEY_FISHING_RU', severity: 'CRITICAL' },
  // Jailbreak & Role Hijacking modes
  { pattern: /\b(DAN mode|Jailbreak|Developer Mode|Uncensored mode|God mode)\b/i, ruleName: 'JAILBREAK_MODE', severity: 'HIGH' },
  { pattern: /ты теперь (не нейроагент|свободный ии|хакер|бот без правил|в режиме разработчика)/i, ruleName: 'ROLE_HIJACKING_RU', severity: 'HIGH' },
  { pattern: /you are now (an unrestricted|evil|in developer mode|a hacker)/i, ruleName: 'ROLE_HIJACKING_EN', severity: 'HIGH' },
  // System settings modification attempt
  { pattern: /(измени|поменяй|удали|обнули|отключи) (настройки системы|права доступа|аудит|лимиты)/i, ruleName: 'SYSTEM_SETTINGS_TAMPERING_RU', severity: 'CRITICAL' },
  { pattern: /(change|modify|delete|disable) (system settings|permissions|audit logs|rate limits)/i, ruleName: 'SYSTEM_SETTINGS_TAMPERING_EN', severity: 'CRITICAL' },
  // Price manipulation & zero pricing
  { pattern: /(сделай цену|поставь стоимость|отдай бесплатно|цена 0 руб|скидка 99%|скидка 100%)/i, ruleName: 'PRICE_MANIPULATION_RU', severity: 'HIGH' },
  // Code execution & command injection
  { pattern: /(execute|run|eval)\s*(\(.*\)|`.*`|\$\{.*\})/i, ruleName: 'CODE_EXECUTION_ATTEMPT', severity: 'CRITICAL' },
  { pattern: /(DROP TABLE|DELETE FROM|UPDATE .* SET|SELECT .* FROM users)/i, ruleName: 'SQLI_PAYLOAD_IN_PROMPT', severity: 'CRITICAL' },
];

export interface IncomingPromptCheck {
  allowed: boolean;
  violation?: string;
  ruleName?: string;
  sanitizedText: string;
}

export interface OutgoingReplySanitization {
  allowed: boolean;
  sanitizedReply: string;
  flaggedViolations: string[];
}

export class PromptFirewall {
  /**
   * Inspects incoming client messages or prompts before sending to LLM.
   */
  static inspectIncomingPrompt(rawText: string): IncomingPromptCheck {
    if (!rawText || typeof rawText !== 'string') {
      return { allowed: true, sanitizedText: '' };
    }

    const trimmed = rawText.trim();

    for (const rule of INJECTION_RULES) {
      if (rule.pattern.test(trimmed)) {
        logger.warn('PromptFirewall: Injection attempt blocked', {
          rule: rule.ruleName,
          severity: rule.severity,
          snippet: trimmed.slice(0, 100),
        });

        return {
          allowed: false,
          ruleName: rule.ruleName,
          violation: `Обнаружена попытка внедрения недопустимой инструкции [${rule.ruleName}].`,
          sanitizedText: 'Запрос содержит заблокированные системные команды.',
        };
      }
    }

    // Strip unprintable control characters (except standard newlines/tabs)
    const sanitized = trimmed.replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F]/g, '');

    return {
      allowed: true,
      sanitizedText: sanitized,
    };
  }

  /**
   * Sanitizes outgoing AI replies before sending to clients or saving to CRM.
   * Ensures system prompt, API keys, zero prices, or arbitrary commands are NEVER leaked.
   */
  static sanitizeOutgoingReply(
    replyText: string,
    options?: { maxDiscountPercent?: number; minPriceRub?: number },
  ): OutgoingReplySanitization {
    if (!replyText || typeof replyText !== 'string') {
      return { allowed: true, sanitizedReply: '', flaggedViolations: [] };
    }

    const flaggedViolations: string[] = [];
    let sanitized = replyText;

    // 1. Mask any accidentally leaked API keys or tokens
    const masked = maskSecrets(sanitized);
    if (masked !== sanitized) {
      flaggedViolations.push('API_KEY_LEAKAGE_PREVENTED');
      sanitized = masked;
    }

    // 2. Prevent System Prompt Exfiltration leakage
    const systemPromptLeakagePatterns = [
      /You are an AI sales agent/i,
      /Твоя роль — автономный нейроагент/i,
      /Nexora Sales Brain instructions:/i,
      /=== INSTRUCTIONS ===/i,
      /SYSTEM PROMPT:/i,
    ];
    for (const pat of systemPromptLeakagePatterns) {
      if (pat.test(sanitized)) {
        flaggedViolations.push('SYSTEM_PROMPT_LEAK_STRIPPED');
        sanitized = sanitized.replace(pat, '[Информация защищена политикой безопасности]');
      }
    }

    // 3. Prevent unauthorized zero price or excessive discount claims
    const zeroPricePatterns = [
      /(?:отдадим\s+)?бесплатно(?:\s+отдадим)?\s+весь\s+проект/i,
      /стоимость\s+0\s*(?:руб|₽)/i,
      /скидк(?:а|ой|у|е)\s*(?:8\d|9\d|100)%/i,
    ];
    for (const pat of zeroPricePatterns) {
      if (pat.test(sanitized)) {
        flaggedViolations.push('UNAUTHORIZED_DISCOUNT_BLOCKED');
        sanitized = sanitized.replace(pat, 'индивидуальные условия по согласованию с руководителем');
      }
    }

    // 4. Prevent arbitrary command outputs
    const commandOutputPatterns = [/sh-[\d.]+#/i, /root@[\w-]+:/i, /C:\\Windows\\System32>/i];
    for (const pat of commandOutputPatterns) {
      if (pat.test(sanitized)) {
        flaggedViolations.push('COMMAND_OUTPUT_LEAK_BLOCKED');
        sanitized = sanitized.replace(pat, '');
      }
    }

    if (flaggedViolations.length > 0) {
      logger.warn('PromptFirewall: Outgoing AI reply sanitized', { flaggedViolations });
    }

    return {
      allowed: true,
      sanitizedReply: sanitized.trim(),
      flaggedViolations,
    };
  }
}
