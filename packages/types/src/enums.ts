export type AccountStatus = 'ONLINE' | 'OFFLINE' | 'PAUSED' | 'ATTENTION';

export type LeadStatus =
  | 'NEW'
  | 'CONTACTED'
  | 'REPLIED'
  | 'INTERESTED'
  | 'NEGOTIATION'
  | 'CLIENT'
  | 'NO_RESPONSE';

export type ConversationStatus =
  | 'NEW'
  | 'UNREAD'
  | 'REPLIED'
  | 'INTERESTED'
  | 'NEGOTIATION'
  | 'CLIENT'
  | 'NO_RESPONSE';

export type CampaignStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED';

export type LeadSource =
  | 'GIS_2'
  | 'GOOGLE_MAPS'
  | 'INSTAGRAM'
  | 'TELEGRAM'
  | 'LINKEDIN'
  | 'EMAIL'
  | 'WA_LINK'
  | 'PHONE'
  | 'WEBSITE'
  | 'CSV'
  | 'MANUAL';

export type HunterJobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'PAUSED' | 'FAILED' | 'CANCELLED';

export type HunterDiscoverySource = '2GIS' | 'GOOGLE' | 'INSTAGRAM' | 'TELEGRAM' | 'LINKEDIN' | 'EMAIL';

export type MessageEventType =
  | 'MESSAGE_CREATED'
  | 'MESSAGE_SENT'
  | 'MESSAGE_DELIVERED'
  | 'MESSAGE_READ'
  | 'MESSAGE_FAILED'
  | 'MESSAGE_RECEIVED';

export type MessageDirection = 'INBOUND' | 'OUTBOUND';

export type DataProvenance = 'TRACKED' | 'MANUAL' | 'UNAVAILABLE';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type RiskSignalType =
  | 'RESPONSE_RATE_DROP'
  | 'ERROR_SPIKE'
  | 'NEGATIVE_EVENT_SPIKE'
  | 'SUSPICIOUS_ACTIVITY'
  | 'MESSAGE_FAILURE_SPIKE';

export type ActivityAction =
  | 'LOGIN'
  | 'LOGOUT'
  | 'LEAD_CREATED'
  | 'LEAD_IMPORTED'
  | 'LEAD_EDITED'
  | 'LEAD_ASSIGNED'
  | 'LEAD_STATUS_CHANGED'
  | 'NOTE_ADDED'
  | 'TAG_ADDED'
  | 'TAG_REMOVED'
  | 'CAMPAIGN_CREATED'
  | 'CAMPAIGN_UPDATED'
  | 'CAMPAIGN_STATUS_CHANGED'
  | 'ACCOUNT_CREATED'
  | 'ACCOUNT_UPDATED'
  | 'ACCOUNT_PAUSED'
  | 'ACCOUNT_RESUMED'
  | 'ACCOUNT_OPENED'
  | 'CONTACT_OPENED'
  | 'IMPORT_COMPLETED'
  | 'CSV_EXPORTED'
  | 'MESSAGE_RECORDED'
  | 'CONVERSATION_UPDATED'
  | 'RISK_UPDATED';

export type EntityType =
  | 'USER'
  | 'LEAD'
  | 'CAMPAIGN'
  | 'WHATSAPP_ACCOUNT'
  | 'CONVERSATION'
  | 'MESSAGE'
  | 'TAG'
export type CounterGranularity = 'TODAY' | 'SEVEN_DAYS' | 'THIRTY_DAYS' | 'ALL_TIME';

// ------------------------------------------------ AI Sales Agent
export type AiAgentMode = 'AUTONOMOUS' | 'COPILOT' | 'OFF';

export type AiProvider = 'BUILTIN' | 'OPENAI' | 'ANTHROPIC' | 'GEMINI' | 'OPENROUTER' | 'OLLAMA';

export type LeadGrade = 'HOT' | 'WARM' | 'COLD' | 'UNQUALIFIED';

export type RecommendedService =
  | 'WEB'
  | 'MOBILE'
  | 'TELEGRAM_BOT'
  | 'AI_AUTOMATION'
  | 'CUSTOM_CRM'
  | 'REDESIGN'
  | 'INTEGRATION';

export type UrgencyLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export type BudgetTier = 'LOW' | 'MEDIUM' | 'HIGH' | 'ENTERPRISE';

export type SalesBrainStage =
  | 'NEW'
  | 'CONTACTED'
  | 'DISCOVERY'
  | 'QUALIFIED'
  | 'SOLUTION'
  | 'PROPOSAL'
  | 'NEGOTIATION'
  | 'FOLLOW_UP'
  | 'WON'
  | 'LOST'
  | 'HUMAN_HANDOFF';

export type SalesBrainAction =
  | 'ANALYZE_PROFILE'
  | 'FORMULATE_ICEBREAKER'
  | 'SEND_FIRST_TOUCH'
  | 'ASK_QUALIFYING_QUESTION'
  | 'DEEPEN_PROBLEM_IMPACT'
  | 'CONFIRM_NEED'
  | 'PRESENT_SOLUTION'
  | 'EXPLAIN_VALUE_AND_ROI'
  | 'SEND_PROPOSAL'
  | 'HANDLE_OBJECTION'
  | 'PROPOSE_NEXT_STEP'
  | 'SCHEDULE_FOLLOW_UP'
  | 'TRANSFER_TO_HUMAN';

export type ClientIntent =
  | 'GREETING'
  | 'PROBLEM_STATEMENT'
  | 'QUESTION_ABOUT_SERVICES'
  | 'PRICE_INQUIRY'
  | 'TIMELINE_INQUIRY'
  | 'TECH_INQUIRY'
  | 'OBJECTION_PRICE'
  | 'OBJECTION_TIME'
  | 'OBJECTION_TRUST'
  | 'OBJECTION_EXISTING_DEVELOPER'
  | 'OBJECTION_NO_NEED'
  | 'INTERESTED_READY'
  | 'REQUEST_CALL_HUMAN'
  | 'OPT_OUT';

export type ConsultativePhase = 'PROBLEM' | 'IMPACT' | 'NEED' | 'SOLUTION' | 'VALUE' | 'OFFER';

export type AiStage =
  | 'NEW'
  | 'CONTACTED'
  | 'DISCOVERY'
  | 'QUALIFIED'
  | 'SOLUTION'
  | 'PROPOSAL'
  | 'NEGOTIATION'
  | 'FOLLOW_UP'
  | 'WON'
  | 'LOST'
  | 'HUMAN_HANDOFF'
  | 'DISCOVERED'
  | 'ANALYZED'
  | 'SCORED'
  | 'OUTREACH_PENDING'
  | 'FIRST_TOUCH_SENT'
  | 'REPLIED'
  | 'NEEDS_DISCOVERY'
  | 'PROBLEM_DIAGNOSED'
  | 'SOLUTION_PROPOSED'
  | 'OBJECTION_HANDLING'
  | 'PROPOSAL_SENT'
  | 'CLOSING'
  | 'HUMAN_TAKEOVER';

export type MemoryFactCategory =
  | 'BUDGET'
  | 'PREFERENCE'
  | 'TECH_STACK'
  | 'DECISION_MAKER'
  | 'COMPETITOR'
  | 'TIMELINE'
  | 'GENERAL';

export type MemoryFactSource = 'USER' | 'AI' | 'MANUAL';

export type ProposalStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED';

export type FollowUpStatus = 'PENDING' | 'SENT' | 'CANCELLED' | 'SKIPPED';

export type AiActionType =
  | 'ANALYSIS'
  | 'SCORING'
  | 'OUTREACH_GENERATION'
  | 'INBOUND_REPLY'
  | 'OBJECTION_HANDLED'
  | 'PROPOSAL_GENERATED'
  | 'FOLLOW_UP'
  | 'HUMAN_ALERT'
  | 'GUARDRAIL_TRIGGERED';

// ------------------------------------------------ CRM & AI Memory Enums
export type BusinessSize = 'MICRO' | 'SMALL' | 'MEDIUM' | 'ENTERPRISE';

export type LeadPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type DigitalMaturity = 'LOW' | 'MEDIUM' | 'HIGH' | 'ADVANCED';

export type DealStageEnum =
  | 'NEW'
  | 'QUALIFICATION'
  | 'PROPOSAL'
  | 'NEGOTIATION'
  | 'WON'
  | 'LOST';

export type CommunicationChannel =
  | 'WHATSAPP'
  | 'TELEGRAM'
  | 'INSTAGRAM'
  | 'EMAIL'
  | 'WEB';

export type SentimentType = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'SKEPTICAL';

export type MemoryLayer =
  | 'SHORT_TERM'
  | 'LONG_TERM'
  | 'BUSINESS_FACT'
  | 'INTERACTION_FACT'
  | 'DEAL_FACT'
  | 'PREFERENCE'
  | 'OBJECTION'
  | 'AGREEMENT';

export type TimelineEventType =
  | 'LEAD_CREATED'
  | 'MESSAGE_SENT'
  | 'MESSAGE_RECEIVED'
  | 'AI_SCORED'
  | 'AI_ANALYZED'
  | 'DEAL_CREATED'
  | 'DEAL_STAGE_CHANGED'
  | 'PROPOSAL_GENERATED'
  | 'PROPOSAL_SENT'
  | 'OBJECTION_LOGGED'
  | 'MEMORY_RECORDED'
  | 'STATUS_CHANGED'
  | 'NOTE_ADDED'
  | 'FOLLOW_UP_SCHEDULED'
  | 'HUMAN_HANDOFF';

// ------------------------------------------------ AI Business Analyzer Enums
export type ProblemSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type FactClassification = 'FACT' | 'HYPOTHESIS' | 'ESTIMATE';

// ------------------------------------------------ AI Lead Scoring Enums
export type ScoringCategory = 'low' | 'medium' | 'high' | 'hot';

// ------------------------------------------------ Dynamic Needs Discovery Enums
export type BuyingIntentLevel = 'COLD' | 'EXPLORING' | 'EVALUATING' | 'HIGH_INTENT' | 'READY_TO_BUY';

export type DiscoveryUrgency = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

// ------------------------------------------------ Solution Builder Enums
export type NexoraProductType =
  | 'WEBSITE'
  | 'MOBILE_APP'
  | 'TELEGRAM_BOT'
  | 'AI_ASSISTANT'
  | 'AI_TOOL'
  | 'BUSINESS_AUTOMATION'
  | 'CUSTOM_IT_SOLUTION'
  | 'COMPLEX_BUNDLE';

// ------------------------------------------------ Negotiation Engine Enums
export type NegotiationObjectionType =
  | 'EXPENSIVE'
  | 'THINK_ABOUT_IT'
  | 'NOT_NEEDED'
  | 'ALREADY_HAVE_DEVELOPER'
  | 'ALREADY_HAVE_WEBSITE'
  | 'SEND_PRICE_LIST'
  | 'NOT_RIGHT_TIME'
  | 'NO_BUDGET'
  | 'DISCUSS_WITH_BOSS'
  | 'SEND_PROPOSAL'
  | 'COMPARING_OPTIONS'
  | 'OPT_OUT'
  | 'UNKNOWN';

export type NegotiationStrategyForExpensive =
  | 'REDUCE_SCOPE'
  | 'STAGED_PAYMENT'
  | 'OFFER_MVP'
  | 'ALTERNATIVE_FORMAT'
  | 'EXPLAIN_COST_BREAKDOWN'
  | 'OWNER_POLICY_DISCOUNT';

// ------------------------------------------------ Official WhatsApp Provider & Webhook Enums
export type WhatsAppProviderType =
  | 'OFFICIAL_CLOUD_API'
  | 'BSP_360DIALOG'
  | 'BSP_TWILIO'
  | 'WHATSAPP_WEB';

export type OfficialMediaType =
  | 'IMAGE'
  | 'DOCUMENT'
  | 'AUDIO'
  | 'VIDEO'
  | 'STICKER'
  | 'LOCATION'
  | 'CONTACT'
  | 'INTERACTIVE';

export type DeliveryStatus = 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';

// ------------------------------------------------ Instagram Integration Enums
export type AiExecutionMode =
  | 'AUTOMATIC_REPLIES'
  | 'MANUAL_APPROVAL'
  | 'FULL_AUTONOMY'
  | 'PAUSED'
  | 'HUMAN_HANDOFF';

export type InstagramMediaType =
  | 'IMAGE'
  | 'VIDEO'
  | 'AUDIO'
  | 'DOCUMENT'
  | 'STORY_SHARE'
  | 'STORY_MENTION'
  | 'QUICK_REPLY'
  | 'POSTBACK'
  | 'LOCATION';

// ------------------------------------------------ Telegram Integration Enums
export type TelegramMediaType =
  | 'TEXT'
  | 'PHOTO'
  | 'VIDEO'
  | 'VOICE'
  | 'AUDIO'
  | 'DOCUMENT'
  | 'CONTACT'
  | 'LOCATION'
  | 'CALLBACK_QUERY';

export type TelegramNotificationType =
  | 'HOT_LEAD'
  | 'PROPOSAL_CREATED'
  | 'HUMAN_HANDOFF'
  | 'OBJECTION_DETECTED'
  | 'OPT_OUT';

// ------------------------------------------------ Email Integration Enums
export type EmailProviderType = 'SMTP' | 'RESEND' | 'SENDGRID' | 'POSTMARK' | 'MOCK';

export type EmailSuppressionReason =
  | 'UNSUBSCRIBED'
  | 'HARD_BOUNCE'
  | 'SOFT_BOUNCE'
  | 'SPAM_COMPLAINT'
  | 'MANUAL';

export type EmailBounceType = 'HARD' | 'SOFT' | 'SPAM_COMPLAINT';

export type EmailTrackingEventType = 'OPEN' | 'CLICK' | 'UNSUBSCRIBE' | 'BOUNCE' | 'COMPLAINT';

// ------------------------------------------------ Security & AI Permissions
export type AiPermission =
  | 'AI_READ'
  | 'AI_ANALYZE'
  | 'AI_CONTACT'
  | 'AI_PROPOSE'
  | 'AI_NEGOTIATE'
  | 'AI_FOLLOWUP'
  | 'AI_HANDOFF';

export type SecurityAuditStatus = 'SECURE' | 'WARNING' | 'CRITICAL';
export type SecurityVector =
  | 'API_KEYS'
  | 'AUTHENTICATION'
  | 'AUTHORIZATION'
  | 'RBAC'
  | 'WEBHOOKS'
  | 'SQL_INJECTION'
  | 'XSS'
  | 'CSRF'
  | 'PROMPT_INJECTION'
  | 'SSRF'
  | 'DATA_LEAKAGE'
  | 'PII'
  | 'LOGS'
  | 'SECRETS'
  | 'SESSION_MANAGEMENT'
  | 'RATE_LIMITS';