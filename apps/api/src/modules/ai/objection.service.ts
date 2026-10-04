import { NegotiationEngine } from './negotiation.service';
import type { NegotiationObjectionType } from '@nexora/types';

export type ObjectionCategory =
  | 'BUDGET'
  | 'ALREADY_HAVE'
  | 'NO_TIME'
  | 'NOT_NEEDED'
  | 'TRUST_GUARANTEE'
  | 'COMPLEXITY'
  | 'UNKNOWN';

export interface ObjectionMatch {
  category: ObjectionCategory;
  detectedText: string;
  rebuttal: string;
  confidence: number;
  negotiationType?: NegotiationObjectionType;
}

/**
 * Detects objections using the full 11-type NegotiationEngine
 * and maps to the legacy format for backward compatibility.
 */
export function detectAndHandleObjection(text: string): ObjectionMatch | null {
  const rule = NegotiationEngine.classifyObjection(text);

  if (rule.type === 'UNKNOWN') {
    return null;
  }

  // Category mapping
  let category: ObjectionCategory = 'UNKNOWN';
  if (rule.type === 'EXPENSIVE' || rule.type === 'NO_BUDGET') category = 'BUDGET';
  else if (rule.type === 'ALREADY_HAVE_DEVELOPER' || rule.type === 'ALREADY_HAVE_WEBSITE') category = 'ALREADY_HAVE';
  else if (rule.type === 'NOT_RIGHT_TIME') category = 'NO_TIME';
  else if (rule.type === 'NOT_NEEDED' || rule.type === 'OPT_OUT') category = 'NOT_NEEDED';
  else if (rule.type === 'COMPARING_OPTIONS') category = 'TRUST_GUARANTEE';

  const rebuttal = `${rule.acknowledge}\n\n${rule.reframe}\n\n${rule.clarify ? rule.clarify + '\n\n' : ''}${rule.nextStep}`;

  return {
    category,
    detectedText: text,
    rebuttal,
    confidence: 0.95,
    negotiationType: rule.type,
  };
}
