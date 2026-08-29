import type {
  AccountStatus,
  ActivityAction,
  CampaignStatus,
  ConversationStatus,
  CounterGranularity,
  DataProvenance,
  EntityType,
  LeadSource,
  LeadStatus,
  MessageDirection,
  MessageEventType,
  RiskLevel,
  RiskSignalType,
} from './enums';

// ------------------------------------------------ Auth
export interface User {
  id: string;
  email: string;
  name: string | null;
  passwordHash: string;
  isAdmin: boolean;
  isDemo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthSession {
  token: string;
  user: SafeUser;
  expiresAt: Date;
}

export type SafeUser = Omit<User, 'passwordHash'>;

// ------------------------------------------------ WhatsApp accounts
export interface WhatsAppAccount {
  id: string;
  userId: string;
  name: string;
  phone: string;
  phoneMasked: string;
  countryCode: string | null;
  status: AccountStatus;
  position: number;
  lastActiveAt: Date | null;
  isDemo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageCounter {
  today: number;
  sevenDays: number;
  thirtyDays: number;
  total: number;
  replies: number;
  activeConversations: number;
}

export interface AccountSummary extends WhatsAppAccount {
  counters: MessageCounter;
  risk: RiskState;
  gatewayStatus?: string | null;
}

export interface RiskState {
  level: RiskLevel;
  responseRate: number | null;
  errorCount: number;
  negativeEvents: number;
  messageFailureCount: number;
  signals: RiskSignal[];
}

export interface RiskSignal {
  type: RiskSignalType;
  severity: number;
  message: string;
  detectedAt: Date;
}

// ------------------------------------------------ Leads
export interface Lead {
  id: string;
  userId: string;
  companyName: string | null;
  phone: string | null;
  whatsappUrl: string | null;
  instagramUrl: string | null;
  website: string | null;
  city: string | null;
  niche: string | null;
  source: LeadSource;
  status: LeadStatus;
  notes: string | null;
  assignedAccountId: string | null;
  isDemo: boolean;
  createdAt: Date;
  updatedAt: Date;
  tags?: Tag[];
  campaigns?: Campaign[];
}

// ------------------------------------------------ Campaigns
export interface Campaign {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  niche: string | null;
  city: string | null;
  source: string | null;
  status: CampaignStatus;
  isDemo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CampaignStats {
  campaign: Campaign;
  leads: number;
  contacted: number;
  replies: number;
  interested: number;
  clients: number;
  conversionRate: number;
  counters: Record<CounterGranularity, number>;
}

// ------------------------------------------------ Conversations / messages
export interface Conversation {
  id: string;
  userId: string;
  accountId: string;
  leadId: string;
  status: ConversationStatus;
  unreadCount: number;
  lastMessageAt: Date | null;
  lastMessagePreview: string | null;
  isDemo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  id: string;
  conversationId: string;
  direction: MessageDirection;
  body: string;
  provenance: DataProvenance;
  recordedAt: Date;
  opId: string | null;
}

export interface MessageEvent {
  id: string;
  messageId: string;
  type: MessageEventType;
  name: string;
  at: Date;
  provenance: DataProvenance;
}

// ------------------------------------------------ Tags
export interface Tag {
  id: string;
  userId: string;
  name: string;
  color: string;
}

// ------------------------------------------------ Metrics / risk
export interface AccountMetric {
  id: string;
  accountId: string;
  day: Date;
  messagesSent: number;
  messagesReceived: number;
  replies: number;
  responseRate: number | null;
  errors: number;
  negativeEvents: number;
  messageFailures: number;
  activeConversations: number;
  isDemo: boolean;
}

export interface RiskEvent {
  id: string;
  accountId: string;
  level: RiskLevel;
  message: string;
  metadata: Record<string, unknown>;
  isDemo: boolean;
  createdAt: Date;
}

// ------------------------------------------------ Activity
export interface ActivityEvent {
  id: string;
  userId: string;
  action: ActivityAction;
  entity: EntityType;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

// ------------------------------------------------ Import
export interface ImportPreviewRecord {
  originalValue: string;
  normalizedValue: string | null;
  type: 'WA_LINK' | 'PHONE' | 'INSTAGRAM' | 'WEBSITE' | 'UNDETECTED';
  error: string | null;
}

export interface ImportAnalysis {
  detected: {
    waLinks: number;
    phones: number;
    instagram: number;
    websites: number;
    undetected: number;
  };
  preview: ImportPreviewRecord[];
}

export interface DeduplicationReport {
  total: number;
  newLeads: number;
  duplicates: number;
  duplicateIds: string[];
}

export interface ImportResult {
  imported: number;
  duplicates: number;
  skipped: number;
  errors: string[];
}

// ------------------------------------------------ Analytics
export interface AnalyticsSummary {
  totalLeads: number;
  contacted: number;
  replies: number;
  interested: number;
  negotiations: number;
  clients: number;
  conversionRate: number;
  responseRate: number;
  clientsByAccount: Array<{ name: string; value: number }>;
  clientsByCampaign: Array<{ name: string; value: number }>;
  funnel: Array<{ stage: string; value: number }>;
  counters: {
    today: number;
    sevenDays: number;
    thirtyDays: number;
    allTime: number;
  };
}

// ------------------------------------------------ Generic
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface DashboardData {
  totals: {
    totalLeads: number;
    contacted: number;
    replies: number;
    interested: number;
    clients: number;
  };
  accounts: AccountSummary[];
}

export interface ServerSettings {
  key: string;
  value: string;
}