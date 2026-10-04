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
  AiAgentMode,
  AiProvider,
  LeadGrade,
  RecommendedService,
  UrgencyLevel,
  BudgetTier,
  AiStage,
  MemoryFactCategory,
  MemoryFactSource,
  ProposalStatus,
  FollowUpStatus,
  AiActionType,
  BusinessSize,
  LeadPriority,
  DigitalMaturity,
  DealStageEnum,
  CommunicationChannel,
  SentimentType,
  MemoryLayer,
  TimelineEventType,
  ProblemSeverity,
  FactClassification,
  HunterJobStatus,
  HunterDiscoverySource,
  ScoringCategory,
  SalesBrainStage,
  SalesBrainAction,
  ClientIntent,
  ConsultativePhase,
  BuyingIntentLevel,
  DiscoveryUrgency,
  NexoraProductType,
  NegotiationObjectionType,
  NegotiationStrategyForExpensive,
  WhatsAppProviderType,
  OfficialMediaType,
  DeliveryStatus,
  AiExecutionMode,
  InstagramMediaType,
  TelegramMediaType,
  TelegramNotificationType,
  EmailProviderType,
  EmailSuppressionReason,
  EmailBounceType,
  EmailTrackingEventType,
  AiPermission,
  SecurityAuditStatus,
  SecurityVector,
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

// ------------------------------------------------ Leads / CRM Clients
export interface Lead {
  id: string;
  userId: string;
  contactName: string | null;
  companyName: string | null;
  position: string | null;
  phone: string | null;
  email: string | null;
  whatsappUrl: string | null;
  instagramUrl: string | null;
  telegram: string | null;
  website: string | null;
  city: string | null;
  country: string | null;
  niche: string | null;
  businessSize: BusinessSize;
  priority: LeadPriority;
  source: LeadSource;
  status: LeadStatus;
  assumedNeed: string | null;
  estimatedBudget: number | null;
  isDecisionMaker: boolean | null;
  decisionMakerInfo: string | null;
  dealProbability: number | null;
  notes: string | null;
  customFields?: Record<string, unknown> | null;
  isArchived: boolean;
  archivedAt: Date | null;
  assignedAccountId: string | null;
  discoveredAt?: Date;
  searchQuery?: string | null;
  hunterJobId?: string | null;
  isDemo: boolean;
  createdAt: Date;
  updatedAt: Date;
  tags?: Tag[];
  campaigns?: Campaign[];
  deals?: Deal[];
  clientMemories?: ClientMemory[];
  timelineEvents?: TimelineEvent[];
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
  channel: CommunicationChannel;
  status: ConversationStatus;
  currentIntent: string | null;
  sentiment: SentimentType | null;
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
  intent?: string | null;
  sentiment?: SentimentType | null;
  extractedFacts?: Record<string, unknown> | null;
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

// ------------------------------------------------ AI Sales Agent Entities
export interface AiAgentConfig {
  id: string;
  userId: string;
  mode: AiAgentMode;
  llmProvider: AiProvider;
  apiKey: string | null;
  modelName: string | null;
  temperature: number;
  systemPrompt: string | null;
  serviceCatalog: any;
  pricingRules: any;
  workingHoursStart: string;
  workingHoursEnd: string;
  timezone: string;
  maxDailyMessagesPerAccount: number;
  minDelaySeconds: number;
  maxDelaySeconds: number;
  autoAnalyzeLeads: boolean;
  autoScoreLeads: boolean;
  autoOutreach: boolean;
  stopWords: any;
  followUpEnabled: boolean;
  followUpIntervals: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface BusinessAnalysis {
  id: string;
  leadId: string;
  description: string | null;
  services: string[] | null;
  websiteUrl: string | null;
  socials: Record<string, string> | null;
  competitors: string[] | null;
  foundProblems: string[] | null;
  foundOpportunities: string[] | null;
  digitalMaturity: DigitalMaturity;
  automationPoints: string[] | null;
  websiteStatus: string;
  pageLoadSpeedMs: number | null;
  isMobileFriendly: boolean | null;
  techStack: string[] | null;
  hasOnlineBooking: boolean | null;
  hasEcommerce: boolean | null;
  hasChatWidget: boolean | null;
  seoScore: number | null;
  detectedGaps: string[] | null;
  instagramHandle: string | null;
  instagramBio: string | null;
  instagramFollowers: number | null;
  summary: string | null;
  analyzedAt: Date;
}

export interface ScoringFactorItem {
  key: string;
  factor: string;
  points: number;
  category: string;
  description: string;
  evidence: string;
}

export interface ScoringBreakdown {
  problemPresence: number;
  problemSeverity: number;
  solutionValue: number;
  nexoraFit: number;
  businessSize: number;
  digitalMaturity: number;
  budgetIndicators: number;
  urgency: number;
  decisionMaker: number;
  contactQuality: number;
  communicationReadiness: number;
  recurringPotential: number;
}

export interface LeadScore {
  id: string;
  leadId: string;
  score: number;
  grade: LeadGrade;
  category: ScoringCategory;
  confidence: number;
  recommendedService: RecommendedService;
  urgency: UrgencyLevel;
  estimatedBudgetTier: BudgetTier;
  reasons: string[] | null;
  factors: ScoringFactorItem[] | null;
  breakdown: ScoringBreakdown | null;
  painPoints: string[] | null;
  techGaps: string[] | null;
  rawAnalysis: any;
  scoredAt: Date;
}

export interface LeadScoreResult {
  leadId?: string;
  score: number;
  category: ScoringCategory;
  confidence: number;
  grade: LeadGrade;
  recommendedService: RecommendedService;
  urgency: UrgencyLevel;
  estimatedBudgetTier: BudgetTier;
  factors: ScoringFactorItem[];
  explanations: string[];
  scoreBreakdown: ScoringBreakdown;
  reasons: string[];
  painPoints: string[];
  techGaps: string[];
  summary: string;
  scoredAt: string;
}

export interface LeadScoreRequest {
  leadId?: string;
  companyName?: string;
  niche?: string;
  city?: string;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  instagram?: string | null;
  telegram?: string | null;
  businessSize?: BusinessSize;
  isDecisionMaker?: boolean;
  position?: string;
  forceRecalculate?: boolean;
}

export interface AiDialogueState {
  id: string;
  conversationId: string;
  stage: AiStage;
  bantBudget: string | null;
  bantAuthority: string | null;
  bantNeed: string | null;
  bantTimeline: string | null;
  identifiedPains: string[] | null;
  offeredServices: string[] | null;
  objectionsEncountered: string[] | null;
  isAiPaused: boolean;
  humanTakeoverAt: Date | null;
  lastAiReplyAt: Date | null;
  nextFollowUpAt: Date | null;
  followUpStep: number;
  confidenceScore: number;
  summary: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MemoryFact {
  id: string;
  leadId: string;
  category: MemoryFactCategory;
  key: string;
  value: string;
  source: MemoryFactSource;
  confidence: number;
  createdAt: Date;
}

// ------------------------------------------------ CRM: 8-Layer Memory Fact Model
export interface ClientMemory {
  id: string;
  leadId: string;
  conversationId?: string | null;
  layer: MemoryLayer;
  key: string;
  value: string;
  confidence: number;
  source: MemoryFactSource;
  isPinned: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ------------------------------------------------ CRM: Deal / Pipeline Model
export interface Deal {
  id: string;
  userId: string;
  leadId: string;
  conversationId?: string | null;
  proposalId?: string | null;
  proposal?: CommercialProposal | null;
  title: string;
  stage: DealStageEnum;
  serviceType: string | null;
  proposalText: string | null;
  amount: number;
  discount: number;
  probability: number;
  nextAction: string | null;
  followUpDate: Date | null;
  lostReason: string | null;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
  lead?: Lead | null;
  timelineEvents?: TimelineEvent[];
}

export interface CommercialProposal {
  id: string;
  leadId: string;
  conversationId: string | null;
  title: string;
  serviceType: string;
  summary: string;
  scope: string[] | null;
  deliverables: string[] | null;
  timelineWeeks: number;
  priceEstimateMin: number;
  priceEstimateMax: number;
  currency: string;
  status: ProposalStatus;
  createdAt: Date;
  updatedAt: Date;
}

// ------------------------------------------------ CRM: Unified Customer Timeline
export interface TimelineEvent {
  id: string;
  userId: string;
  leadId?: string | null;
  dealId?: string | null;
  conversationId?: string | null;
  eventType: TimelineEventType;
  title: string;
  description: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
}

export interface FollowUpJob {
  id: string;
  conversationId: string;
  leadId: string;
  stepNumber: number;
  scheduledFor: Date;
  status: FollowUpStatus;
  messageTemplate: string | null;
  actualMessageSent: string | null;
  sentAt: Date | null;
  createdAt: Date;
}

export interface AiAuditLog {
  id: string;
  userId: string;
  leadId: string | null;
  conversationId: string | null;
  actionType: AiActionType;
  modelUsed: string | null;
  promptTokens: number;
  completionTokens: number;
  inputSnapshot: any;
  outputSnapshot: any;
  executionTimeMs: number;
  success: boolean;
  errorMessage: string | null;
  createdAt: Date;
}

// ------------------------------------------------ AI Business Analyzer Entities
export interface StructuredProblemItem {
  problem: string;
  evidence: string;
  severity: ProblemSeverity;
  business_impact: string;
  estimated_loss: string;
  possible_solution: string;
  confidence: number;
  classification: FactClassification;
}

export interface DigitalAspectAudit {
  status: 'OPTIMAL' | 'SUBOPTIMAL' | 'CRITICAL' | 'insufficient_data';
  evidence: string;
  details: string;
  score?: number;
}

export interface DigitalStateAuditMap {
  website: DigitalAspectAudit;
  mobile: DigitalAspectAudit;
  structure: DigitalAspectAudit;
  ux: DigitalAspectAudit;
  design: DigitalAspectAudit;
  cta: DigitalAspectAudit;
  forms: DigitalAspectAudit;
  contacts: DigitalAspectAudit;
  whatsapp: DigitalAspectAudit;
  telegram: DigitalAspectAudit;
  onlineBooking: DigitalAspectAudit;
  speed: DigitalAspectAudit;
  seo: DigitalAspectAudit;
  explicitIssues: DigitalAspectAudit;
  instagram: DigitalAspectAudit;
  reviews: DigitalAspectAudit;
  competitors: DigitalAspectAudit;
  customerJourney: DigitalAspectAudit;
  manualProcesses: DigitalAspectAudit;
  automationOpportunities: DigitalAspectAudit;
}

export interface BusinessAnalysisRequest {
  companyName: string;
  website?: string | null;
  instagram?: string | null;
  city?: string | null;
  niche?: string | null;
  reviews?: string[] | string | null;
  availableInfo?: string | null;
  leadId?: string | null;
  forceReanalyze?: boolean;
}

export interface BusinessAnalysisReport {
  businessSummary: string;
  currentDigitalState: DigitalStateAuditMap;
  problems: StructuredProblemItem[];
  opportunities: string[];
  automationOpportunities: string[];
  competitorObservations: string[];
  potentialSolutions: Array<{
    solution: string;
    impact: string;
    timelineWeeks: number;
    priceEstimate: string;
  }>;
  confidence: number;
  confidenceReason: string;
  recommendedNextStep: string;
  digitalMaturity: DigitalMaturity;
  meta: {
    analyzedAt: string;
    cached: boolean;
    executionTimeMs: number;
    provider: string;
  };
}

// ------------------------------------------------ Lead Hunter Entities
export interface LeadHunterFilters {
  websiteFilter?: 'all' | 'with_site' | 'without_site';
  hasInstagram?: boolean;
  hasTelegram?: boolean;
  requireProblematicSite?: boolean;
  requireAutomationNeed?: boolean;
  minScore?: number;
}

export interface LeadHunterRequest {
  name?: string;
  niche: string;
  city: string;
  country?: string;
  targetCount?: number;
  minScore?: number;
  sources?: HunterDiscoverySource[];
  filters?: LeadHunterFilters;
  autoOutreach?: boolean;
}

export interface DiscoveredLeadRaw {
  source: HunterDiscoverySource;
  name: string;
  phone?: string | null;
  allPhones?: string[];
  email?: string | null;
  website?: string | null;
  instagram?: string | null;
  telegram?: string | null;
  whatsapp?: string | null;
  address?: string | null;
  rating?: number | null;
  reviewsCount?: number | null;
  profileLink?: string | null;
  extra?: Record<string, unknown>;
}

export interface LeadHunterJob {
  id: string;
  userId: string;
  name: string;
  query: string;
  niche: string;
  city: string;
  country: string | null;
  targetCount: number;
  minScore: number;
  sources: HunterDiscoverySource[];
  filters: LeadHunterFilters | null;
  autoOutreach: boolean;
  status: HunterJobStatus;
  discoveredCount: number;
  processedCount: number;
  savedCount: number;
  duplicateCount: number;
  rejectedCount: number;
  currentStage: string | null;
  errorMessage: string | null;
  logs: Array<{ timestamp: string; message: string; type?: 'info' | 'warn' | 'error' | 'success' }> | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  leads?: Lead[];
}

export interface LeadHunterStats {
  totalJobs: number;
  runningJobs: number;
  totalDiscovered: number;
  totalSaved: number;
  totalDuplicates: number;
  avgAiScore: number;
  bySource: Record<string, number>;
}

// ------------------------------------------------ Central Sales Brain Entities
export interface SalesBrainDecision {
  shouldAskQuestion: boolean;
  shouldProposeSolution: boolean;
  shouldSendProposal: boolean;
  shouldTransferToHuman: boolean;
  detectedIntent: ClientIntent;
  detectedObjection?: string | null;
  nextBestAction: SalesBrainAction;
  consultativePhase: ConsultativePhase;
  rationale: string;
  confidence: number;
}

export interface SalesBrainProcessResult {
  replyText: string | null;
  stage: SalesBrainStage | AiStage;
  previousStage: SalesBrainStage | AiStage;
  decision: SalesBrainDecision;
  allowedActions: string[];
  prohibitedActions: string[];
  isAiPaused: boolean;
  isHotLead: boolean;
  humanHandoffTriggered: boolean;
  optOutTriggered?: boolean;
  objectionHandled?: boolean;
  extractedFacts?: Array<{ key: string; value: string; layer: string }>;
  executionTimeMs: number;
}

export interface SalesBrainStateData {
  conversationId: string;
  leadId: string;
  currentStage: SalesBrainStage | AiStage;
  allowedActions: string[];
  prohibitedActions: string[];
  consultativePhase: ConsultativePhase;
  bant: {
    budget?: string | null;
    authority?: string | null;
    need?: string | null;
    timeline?: string | null;
  };
  identifiedPains: string[];
  offeredServices: string[];
  objectionsEncountered: string[];
  isAiPaused: boolean;
  confidenceScore: number;
  recentMemories: ClientMemory[];
}

export interface SalesBrainProcessRequest {
  text: string;
  conversationId: string;
  forceStage?: SalesBrainStage | AiStage;
}

export interface SalesBrainTransitionRequest {
  conversationId: string;
  nextStage: SalesBrainStage | AiStage;
  reason?: string;
}

// ------------------------------------------------ Dynamic Needs Discovery Entities
export interface NeedsDiscoveryProfile {
  need: string | null;
  currentProcess: string | null;
  pain: string[] | null;
  impact: string | null;
  desiredResult: string | null;
  urgency: DiscoveryUrgency;
  budget: {
    amount?: number | null;
    currency?: string;
    tier?: 'LOW' | 'MEDIUM' | 'HIGH' | 'ENTERPRISE' | 'UNKNOWN';
    raw?: string | null;
    isNegotiable?: boolean;
  } | null;
  decisionMaker: {
    isDecisionMaker: boolean | null;
    role?: string | null;
    details?: string | null;
  } | null;
  currentSolution: {
    stack?: string[];
    tools?: string[];
    existingDeveloper?: boolean;
    provider?: string | null;
  } | null;
  constraints: string[];
  buyingIntent: BuyingIntentLevel;
  confidence: number;
  completedSlotsCount: number;
  missingSlots: string[];
  nextSuggestedQuestion?: string | null;
  nextSuggestedQuestionGoal?: string | null;
}

export interface NeedsDiscoveryAnalysisResult {
  profile: NeedsDiscoveryProfile;
  nextQuestion: string | null;
  questionGoal: string | null;
  canTransitionToSolution: boolean;
  budgetTimingAppropriate: boolean;
  extractedNewFacts: Array<{ key: string; value: string; layer: string }>;
  explanation: string;
}

export interface NeedsDiscoveryRequest {
  conversationId: string;
  text?: string;
  forceAnalyze?: boolean;
}

export interface NeedsDiscoveryUpdateProfileRequest {
  conversationId: string;
  profile: Partial<NeedsDiscoveryProfile>;
}

// ------------------------------------------------ Solution Builder Entities
export interface ConsultativePitchBlock {
  title: string;
  content: string;
}

export interface ConsultativePitchStructure {
  problem: string;
  whyItMatters: string;
  solution: string;
  howItWorks: string;
  expectedResult: string;
  implementation: string;
  estimatedCost: string;
  optionalRecurringService?: string | null;
}

export interface SolutionDeliverableItem {
  name: string;
  description: string;
  techStack: string[];
  timelineWeeks: number;
}

export interface SolutionPricingEstimate {
  minAmount: number;
  maxAmount: number;
  currency: string;
  isRange: boolean;
  confidence: number;
  reasoning: string;
  requiredClarifications: string[];
  isSufficientDataForExactPrice: boolean;
}

export interface SolutionRecurringOption {
  name: string;
  monthlyCost: number;
  currency: string;
  description: string;
  benefits: string[];
}

export interface MatchedNexoraProduct {
  type: NexoraProductType;
  title: string;
  tagline: string;
  description: string;
  targetedPain: string;
  keyFeatures: string[];
  deliverables: SolutionDeliverableItem[];
  baseMinPrice: number;
  baseMaxPrice: number;
  estimatedWeeks: number;
}

export interface SolutionBuilderResult {
  productType: NexoraProductType;
  isBundle: boolean;
  solutionTitle: string;
  headline: string;
  summary: string;
  matchedProducts: MatchedNexoraProduct[];
  groundedPains: Array<{
    pain: string;
    impact: string;
    addressedBy: string;
    source: 'BUSINESS_ANALYSIS' | 'NEEDS_DISCOVERY' | 'MEMORY';
  }>;
  pitch: ConsultativePitchStructure;
  formattedPitchMessage: string;
  pricing: SolutionPricingEstimate;
  recurringOption?: SolutionRecurringOption | null;
  implementationRoadmap: Array<{
    stage: string;
    durationWeeks: number;
    deliverables: string[];
  }>;
  expectedRoi: {
    expectedMonthlySavingsOrRevenue?: string | null;
    paybackPeriodMonths?: number | null;
    keyMetric: string;
  };
  confidence: number;
  generationMetadata: {
    leadId?: string;
    conversationId?: string;
    analyzedAt: string;
    executionTimeMs: number;
  };
}

export interface SolutionBuilderRequest {
  leadId?: string;
  conversationId?: string;
  companyName?: string;
  niche?: string;
  overrideProblems?: string[];
  preferredProductTypes?: NexoraProductType[];
  targetBudget?: number;
}

export interface ApplySolutionToProposalRequest {
  leadId: string;
  conversationId?: string;
  solution: SolutionBuilderResult;
  proposalTitle?: string;
  customDiscountPercent?: number;
}

// ------------------------------------------------ Negotiation Engine Entities
export interface OwnerDiscountPolicy {
  maxDiscountPercent: number;
  allowDiscountsWithoutScopeReduction: boolean;
  requireManagerApprovalAbovePercent: number;
  autoSuggestMvpFirst: boolean;
}

export interface NegotiationTurn {
  detectedObjection: NegotiationObjectionType;
  confidence: number;
  underlyingReason: string;
  acknowledgedEmpathy: string;
  clarifyingQuestion: string;
  reframedValue: string;
  suggestedNextStep: string;
  fullResponseText: string;
  expensiveStrategyApplied?: NegotiationStrategyForExpensive;
  discountOffer?: {
    discountPercent: number;
    discountAmount: number;
    finalPrice: number;
    rationale: string;
    isOwnerPolicyCompliant: boolean;
  };
  optOutTriggered: boolean;
  guardrailPassed: boolean;
}

export interface NegotiationProcessRequest {
  text: string;
  conversationId: string;
  leadId?: string;
  customOwnerPolicy?: Partial<OwnerDiscountPolicy>;
}

export interface NegotiationEngineResult {
  turn: NegotiationTurn;
  crmUpdates: {
    isAiPaused: boolean;
    leadStatus?: string;
    optOut: boolean;
    recordedMemoryFact?: { key: string; value: string; layer: string };
  };
  executionTimeMs: number;
}

// ------------------------------------------------ Commercial Proposal Generator Entities
export interface ProposalVerificationChecks {
  noUnconfirmedFacts: boolean;
  correctPricing: boolean;
  correctTimeline: boolean;
  matchesNeeds: boolean;
}

export interface ProposalVerificationResult {
  isApproved: boolean;
  confidenceScore: number;
  checks: ProposalVerificationChecks;
  passedChecks: string[];
  warnings: string[];
  blockingErrors: string[];
  details: {
    factsCheckedCount: number;
    unconfirmedClaims: string[];
    priceValidationDetails: string;
    timelineValidationDetails: string;
    needsAlignmentDetails: string;
  };
}

export interface ProposalFunctionalityItem {
  module: string;
  features: string[];
  techStack: string[];
  userValue: string;
}

export interface ProposalPhaseItem {
  stageNumber: number;
  title: string;
  durationWeeks: number;
  deliverables: string[];
  milestoneGoal: string;
}

export interface ProposalPricingItem {
  name: string;
  amount: number;
  description: string;
}

export interface ProposalPricingStructure {
  minAmount: number;
  maxAmount: number;
  currency: string;
  isRange: boolean;
  paymentTerms: string;
  discountPercent?: number;
  discountAmount?: number;
  finalMinAmount: number;
  finalMaxAmount: number;
  itemizedBreakdown: ProposalPricingItem[];
}

export interface ProposalMaintenanceStructure {
  warrantyMonths: number;
  warrantySla: string;
  warrantyCoverage: string[];
  ongoingSupportPackage?: {
    name: string;
    monthlyCost: number;
    currency: string;
    description: string;
    inclusions: string[];
  } | null;
}

export interface CommercialProposalDetailPayload {
  id?: string;
  leadId: string;
  conversationId?: string | null;
  title: string;
  serviceType: string;
  companyName: string;
  niche: string;
  city?: string | null;
  taskUnderstanding: string;
  identifiedProblem: string;
  proposedSolution: string;
  functionality: ProposalFunctionalityItem[];
  phases: ProposalPhaseItem[];
  timeline: {
    totalWeeks: number;
    estimatedDeliveryDate?: string;
    phasesSummary: string;
  };
  pricing: ProposalPricingStructure;
  inclusions: string[];
  exclusions: string[];
  maintenance: ProposalMaintenanceStructure;
  nextStep: string;
  whatsAppVersion: string;
  extendedVersion: string;
  structuredPdfVersion: {
    html: string;
    documentNumber: string;
    date: string;
    validUntil: string;
  };
  verification: ProposalVerificationResult;
  createdAt: string;
  status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED';
}

export interface GenerateProposalRequest {
  leadId: string;
  conversationId?: string;
  overrideServiceType?: string;
  customTitle?: string;
  customDiscountPercent?: number;
  preferredScope?: string[];
  includeRecurringSupport?: boolean;
  strictVerification?: boolean;
}

export interface ProposalVerificationRequest {
  proposal: Partial<CommercialProposalDetailPayload>;
  leadId: string;
  conversationId?: string;
}

// ------------------------------------------------ Follow-Up Engine Entities
export type FollowUpPauseReason =
  | 'NO_REPLY_AFTER_PROPOSAL'
  | 'THINKING_ABOUT_PRICE'
  | 'DISCUSSING_WITH_BOSS'
  | 'COMPARING_COMPETITORS'
  | 'BUSY_OPERATIONS'
  | 'QUALIFICATION_STALLED'
  | 'GENERAL_SILENCE'
  | 'DISCOVERY_INCOMPLETE';

export type FollowUpStepStrategy =
  | 'STEP_1_CONTEXT_REMINDER'
  | 'STEP_2_VALUE_ADDITION'
  | 'STEP_3_CONCRETE_NEXT_STEP'
  | 'CUSTOM';

export interface PlannedFollowUpItem {
  id?: string;
  conversationId: string;
  leadId: string;
  stepNumber: number;
  strategy: FollowUpStepStrategy;
  scheduledFor: string; // follow_up_date
  reason: string; // reason
  channel: 'WHATSAPP' | 'TELEGRAM' | 'EMAIL' | 'PHONE'; // channel
  message: string; // message
  status: 'PENDING' | 'SENT' | 'CANCELLED' | 'SKIPPED'; // status
  dealStage: string;
  urgency: 'HIGH' | 'MEDIUM' | 'LOW';
  leadGrade: LeadGrade;
  createdAt: string;
}

export interface FollowUpEnginePlanRequest {
  conversationId: string;
  leadId?: string;
  forceRecalculate?: boolean;
  customPauseReason?: FollowUpPauseReason;
  customStep?: number;
}

export interface FollowUpEnginePlanResult {
  isOptedOut: boolean;
  reasonCancelled?: string;
  plannedFollowUps: PlannedFollowUpItem[];
  nextScheduledFollowUp?: PlannedFollowUpItem | null;
  aiConfidence: number;
  pauseReason: string;
  crmTaskCreated: boolean;
  crmTaskId?: string;
  summary: string;
}

export interface FollowUpExecuteRequest {
  followUpJobId: string;
  overrideMessage?: string;
  markAsSentOnly?: boolean;
}

export interface FollowUpExecuteResult {
  success: boolean;
  jobId: string;
  sentMessageText: string;
  sentAt: string;
  channel: string;
  nextFollowUpScheduled?: PlannedFollowUpItem | null;
}

// ============================================================================
// 10. Official WhatsApp & Pre-Flight Send Guardrails
// ============================================================================

export interface PreFlightCheckItem {
  name: string;
  passed: boolean;
  reason?: string;
  metadata?: Record<string, any>;
}

export interface PreFlightValidationResult {
  allowed: boolean;
  checks: {
    isChannelAllowed: PreFlightCheckItem;
    isMessageAllowed: PreFlightCheckItem;
    isOptOut: PreFlightCheckItem;
    isRateLimitAllowed: PreFlightCheckItem;
    isHumanHandoffRequired: PreFlightCheckItem;
  };
  blockedReason?: string;
  validatedAt: string;
}

export interface OfficialWhatsAppConfig {
  accountId: string;
  provider: WhatsAppProviderType;
  phoneNumberId?: string;
  wabaId?: string;
  accessToken?: string;
  verifyToken?: string;
  appSecret?: string;
  webhookUrl?: string;
}

export interface OfficialWhatsAppSendPayload {
  to?: string;
  body?: string;
  mediaType?: OfficialMediaType;
  mediaUrl?: string;
  mediaCaption?: string;
  mediaFileName?: string;
  templateName?: string;
  templateLanguage?: string;
  templateComponents?: Array<Record<string, any>>;
}

export interface OfficialWhatsAppSendResponse {
  success: boolean;
  metaMessageId?: string;
  status: DeliveryStatus;
  sentAt: string;
  rawResponse?: any;
  error?: string;
}

export interface ConversationAiToggleRequest {
  enabled: boolean;
  reason?: string;
}

export interface ConversationAiToggleResult {
  conversationId: string;
  isAiPaused: boolean;
  pausedReason?: string | null;
  humanTakeoverAt?: string | null;
  humanTakeoverBy?: string | null;
  updatedAt: string;
}

export interface HumanTakeoverRequest {
  managerName?: string;
  notes?: string;
}

// ============================================================================
// 11. Instagram Direct Official API & AI Integration Entities
// ============================================================================

export interface InstagramAccountEntity {
  id: string;
  userId: string;
  name: string;
  username: string;
  instagramId: string;
  pageId?: string | null;
  status: AccountStatus;
  accessToken?: string | null;
  verifyToken?: string | null;
  appSecret?: string | null;
  profilePicUrl?: string | null;
  aiExecutionMode: AiExecutionMode;
  dailyMessageLimit: number;
  messagesSentToday: number;
  lastActiveAt?: Date | string | null;
  isDemo: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface InstagramSendPayload {
  recipientId: string; // Instagram-scoped User ID (IGSID)
  text?: string;
  mediaType?: InstagramMediaType;
  mediaUrl?: string;
  quickReplies?: Array<{ title: string; payload: string }>;
  tag?: 'CONFIRMED_EVENT_UPDATE' | 'POST_PURCHASE_UPDATE' | 'ACCOUNT_UPDATE' | 'HUMAN_AGENT';
}

export interface InstagramSendResponse {
  success: boolean;
  metaMessageId?: string;
  recipientId: string;
  status: DeliveryStatus;
  sentAt: string;
  rawResponse?: any;
  error?: string;
}

export interface InstagramModeToggleRequest {
  mode: AiExecutionMode;
  reason?: string;
}

export interface InstagramModeToggleResult {
  instagramAccountId?: string;
  conversationId?: string;
  aiExecutionMode: AiExecutionMode;
  isAiPaused: boolean;
  pausedReason?: string | null;
  humanTakeoverAt?: string | null;
  humanTakeoverBy?: string | null;
  updatedAt: string;
}

export interface InstagramManualApprovalAction {
  action: 'APPROVE_AND_SEND' | 'REJECT' | 'EDIT_AND_SEND';
  editedText?: string;
}

// ============================================================================
// 12. Telegram Official Bot API & Owner Notifications Entities
// ============================================================================

export interface TelegramBotEntity {
  id: string;
  userId: string;
  name: string;
  username: string;
  botId?: string | null;
  botToken: string;
  secretToken?: string | null;
  status: AccountStatus;
  webhookUrl?: string | null;
  aiExecutionMode: AiExecutionMode;
  isNotificationChannel: boolean;
  ownerChatId?: string | null;
  ownerUsername?: string | null;
  notifyOnHotLead: boolean;
  notifyOnProposal: boolean;
  notifyOnHandoff: boolean;
  notifyOnObjection: boolean;
  dailyMessageLimit: number;
  messagesSentToday: number;
  lastActiveAt?: Date | string | null;
  isDemo: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
  _count?: {
    conversations?: number;
    leads?: number;
  };
}

export interface TelegramInlineButton {
  text: string;
  url?: string;
  callbackData?: string;
}

export interface TelegramSendPayload {
  chatId: string | number;
  text: string;
  parseMode?: 'Markdown' | 'HTML' | 'MarkdownV2';
  replyToMessageId?: number;
  inlineKeyboard?: TelegramInlineButton[][];
}

export interface TelegramSendResponse {
  success: boolean;
  messageId?: number;
  chatId: string | number;
  sentAt: string;
  rawResponse?: any;
  error?: string;
}

export interface TelegramOwnerAlertPayload {
  type: TelegramNotificationType;
  leadId: string;
  conversationId?: string;
  companyName?: string;
  contactName?: string;
  phone?: string;
  channel?: string;
  score?: number;
  grade?: string;
  pain?: string;
  need?: string;
  budget?: string | number;
  nextBestAction?: string;
  customMessage?: string;
}

// ------------------------------------------------ Email Integration Entities
export interface EmailAccountEntity {
  id: string;
  userId: string;
  name: string;
  emailAddress: string;
  senderName?: string | null;
  replyToAddress?: string | null;
  provider: EmailProviderType;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpUser?: string | null;
  smtpSecure?: boolean;
  apiKey?: string | null;
  webhookSecret?: string | null;
  status: AccountStatus;
  aiExecutionMode: AiExecutionMode;
  dailyMessageLimit: number;
  hourlyMessageLimit: number;
  messagesSentToday: number;
  messagesSentThisHour: number;
  lastSentAt?: Date | string | null;
  warmupStage: number;
  trackingEnabled: boolean;
  signatureHtml?: string | null;
  isDemo: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
  _count?: {
    conversations?: number;
    leads?: number;
  };
}

export interface EmailSuppressionEntity {
  id: string;
  userId: string;
  email: string;
  reason: EmailSuppressionReason;
  bounceType?: EmailBounceType | null;
  bounceDetails?: string | null;
  sourceMessageId?: string | null;
  suppressedAt: Date | string;
}

export interface EmailMessageMetaEntity {
  id: string;
  messageId: string;
  emailSubject?: string | null;
  fromAddress: string;
  toAddress: string;
  ccAddresses?: string[] | null;
  bccAddresses?: string[] | null;
  replyToAddress?: string | null;
  rfcMessageId?: string | null;
  inReplyTo?: string | null;
  references?: string | null;
  openToken?: string | null;
  openedAt?: Date | string | null;
  openCount: number;
  clickToken?: string | null;
  clickedAt?: Date | string | null;
  clickCount: number;
  clickedUrls?: string[] | null;
  isPersonalized: boolean;
  personalizationFactors?: Record<string, unknown> | null;
  unsubToken?: string | null;
  unsubscribedAt?: Date | string | null;
  bounceType?: EmailBounceType | null;
  bounceDetails?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface EmailSendPayload {
  emailAccountId: string;
  to: string;
  subject: string;
  bodyHtml?: string;
  bodyText?: string;
  leadId?: string;
  conversationId?: string;
  inReplyTo?: string;
  references?: string;
  isPersonalizedOutreach?: boolean;
  personalizationLeadId?: string;
}

export interface EmailSendResponse {
  success: boolean;
  messageId: string;
  rfcMessageId?: string;
  from: string;
  to: string;
  subject: string;
  sentAt: string;
  isSuppressed?: boolean;
  rateLimitThrottled?: boolean;
  error?: string;
}

export interface InboundEmailPayload {
  emailAccountId?: string;
  from: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string;
  timestamp?: string;
}

// ------------------------------------------------ Analytics & AI Pattern Intelligence
export type AiPatternCategory =
  | 'TOP_CONVERTING_NICHES'
  | 'HIGH_IMPACT_PROBLEMS'
  | 'BEST_SELLING_SERVICES'
  | 'CHURN_DROP_OFF_POINTS'
  | 'HIGH_RESPONSE_MESSAGES'
  | 'HUMAN_HANDOFF_HOTSPOTS';

export interface AiPatternInsight {
  id: string;
  category: AiPatternCategory;
  title: string;
  summary: string;
  confidence: number;
  impact: 'HIGH' | 'MEDIUM' | 'CRITICAL' | 'POSITIVE';
  evidence: string;
  metrics: {
    primaryValue: string;
    secondaryValue?: string;
    sampleSize: number;
    conversionDeltaPercent?: number;
  };
  actionableRecommendation: string;
}

export interface FunnelStageItem {
  stage: string;
  label: string;
  count: number;
  conversionFromPreviousPercent: number;
  conversionFromTotalPercent: number;
  dropOffCount: number;
}

export interface ChannelPerformanceItem {
  channel: 'WHATSAPP' | 'INSTAGRAM' | 'TELEGRAM' | 'EMAIL';
  label: string;
  accountsCount: number;
  leadsCount: number;
  contactedCount: number;
  repliesCount: number;
  responseRate: number;
  proposalsCount: number;
  wonCount: number;
  conversionRate: number;
  revenue: number;
  averageDeal: number;
}

export interface NichePerformanceItem {
  niche: string;
  leadsCount: number;
  contactedCount: number;
  repliesCount: number;
  responseRate: number;
  qualifiedCount: number;
  proposalsCount: number;
  wonCount: number;
  conversionRate: number;
  totalRevenue: number;
  averageDeal: number;
  topPainIdentified: string;
  topServiceSold: string;
}

export interface SourcePerformanceItem {
  source: string;
  leadsCount: number;
  repliesCount: number;
  responseRate: number;
  wonCount: number;
  conversionRate: number;
  totalRevenue: number;
  qualityScore: number;
}

export interface ObjectionAnalyticsItem {
  objectionType: string;
  label: string;
  frequency: number;
  percentage: number;
  resolvedCount: number;
  resolutionRate: number;
  topWinningStrategy: string;
}

export interface AnalyticsFullOverview {
  metrics: {
    leadsFound: number;
    leadsContacted: number;
    replies: number;
    qualified: number;
    proposals: number;
    negotiations: number;
    won: number;
    lost: number;
    conversionRate: number;
    averageDeal: number;
    revenue: number;
    recurringRevenue: number;
    responseRate: number;
    averageSalesCycleDays: number;
  };
  funnel: FunnelStageItem[];
  channels: ChannelPerformanceItem[];
  niches: NichePerformanceItem[];
  sources: SourcePerformanceItem[];
  objections: ObjectionAnalyticsItem[];
  patterns: AiPatternInsight[];
  generatedAt: string;
}

// ------------------------------------------------ Security & RBAC / AI Permissions
export interface SecurityCheckItem {
  vector: SecurityVector;
  name: string;
  category: 'INFRASTRUCTURE' | 'AUTHENTICATION' | 'AI_GUARDRAILS' | 'DATA_PROTECTION';
  status: 'PASS' | 'WARN' | 'FAIL';
  description: string;
  mitigation: string;
  details?: Record<string, unknown>;
}

export interface AiPermissionsConfig {
  AI_READ: boolean;
  AI_ANALYZE: boolean;
  AI_CONTACT: boolean;
  AI_PROPOSE: boolean;
  AI_NEGOTIATE: boolean;
  AI_FOLLOWUP: boolean;
  AI_HANDOFF: boolean;
}

export interface SecurityAuditReport {
  overallScore: number;
  status: SecurityAuditStatus;
  auditedAt: string;
  checks: SecurityCheckItem[];
  aiSandboxRestrictions: {
    systemPromptRevealBlocked: boolean;
    apiKeysExfiltrationBlocked: boolean;
    arbitraryCommandExecBlocked: boolean;
    systemSettingsModificationBlocked: boolean;
    unauthorizedPriceAlterationBlocked: boolean;
    crmDeletionBlocked: boolean;
    unauthorizedOutboundBlocked: boolean;
  };
  permissions: AiPermissionsConfig;
  summary: {
    totalChecks: number;
    passedChecks: number;
    warningChecks: number;
    failedChecks: number;
  };
}