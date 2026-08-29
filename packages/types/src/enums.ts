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
  | 'WA_LINK'
  | 'PHONE'
  | 'INSTAGRAM'
  | 'WEBSITE'
  | 'CSV'
  | 'MANUAL';

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
  | 'SETTING';

export type CounterGranularity = 'TODAY' | 'SEVEN_DAYS' | 'THIRTY_DAYS' | 'ALL_TIME';