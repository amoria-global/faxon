/**
 * JamboLush Admin Settings Types
 * Comprehensive type definitions for the admin settings system
 */

// ============================================
// COMMON TYPES
// ============================================

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  status: number;
  timestamp: string;
}

// ============================================
// PAYMENT PROVIDER TYPES
// ============================================

export interface PaymentProviderCredentials {
  apiKey: string;
  secretKey?: string;
  merchantId?: string;
  [key: string]: any;
}

export interface PaymentProviderConfig {
  baseUrl: string;
  webhookUrl: string;
  timeout: number;
  retryAttempts: number;
  [key: string]: any;
}

export interface PaymentProvider {
  id: string;
  name: string;
  type: 'mobile_money' | 'bank' | 'card';
  region?: string;
  enabled: boolean;
  testMode: boolean;
  credentials: PaymentProviderCredentials;
  config?: PaymentProviderConfig;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePaymentProviderDto {
  name: string;
  type: 'mobile_money' | 'bank' | 'card';
  region?: string;
  enabled?: boolean;
  testMode?: boolean;
  credentials: PaymentProviderCredentials;
  config?: PaymentProviderConfig;
}

export interface UpdatePaymentProviderDto {
  enabled?: boolean;
  testMode?: boolean;
  credentials?: Partial<PaymentProviderCredentials>;
  config?: Partial<PaymentProviderConfig>;
}

// ============================================
// PAYMENT OPERATOR TYPES
// ============================================

export interface OperatorSupportedOperations {
  deposit: boolean;
  withdrawal: boolean;
  refund: boolean;
  disburse: boolean;
}

export interface OperatorLimits {
  minAmount: number;
  maxAmount: number;
  dailyLimit: number;
}

export interface OperatorFees {
  depositFee: number;
  withdrawalFee: number;
  currency: string;
}

export interface PaymentOperator {
  id: string;
  name: string;
  code: string;
  country: string;
  type: 'mobile_money' | 'bank';
  enabled: boolean;
  primaryProviderId?: string;
  alternativeProviderId?: string;
  supportedOperations: OperatorSupportedOperations;
  limits?: OperatorLimits;
  fees?: OperatorFees;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateOperatorDto {
  name: string;
  code: string;
  country: string;
  type: 'mobile_money' | 'bank';
  enabled?: boolean;
  primaryProviderId?: string;
  alternativeProviderId?: string;
  supportedOperations: OperatorSupportedOperations;
  limits?: OperatorLimits;
  fees?: OperatorFees;
}

export interface UpdateOperatorDto {
  enabled?: boolean;
  primaryProviderId?: string;
  alternativeProviderId?: string;
  supportedOperations?: Partial<OperatorSupportedOperations>;
  limits?: Partial<OperatorLimits>;
  fees?: Partial<OperatorFees>;
}

// ============================================
// COMMUNICATION TYPES
// ============================================

export interface EmailConfig {
  apiKey: string;
  fromEmail: string;
  fromName: string;
  replyTo?: string;
  dailyLimit?: number;
}

export interface SmsConfig {
  apiKey: string;
  senderId: string;
  username?: string;
  dailyLimit?: number;
}

export interface WhatsAppConfig {
  apiKey: string;
  phoneNumberId: string;
  businessAccountId?: string;
  dailyLimit?: number;
}

export interface CommunicationSetting {
  id: 'email' | 'sms' | 'whatsapp';
  enabled: boolean;
  provider: string;
  config: EmailConfig | SmsConfig | WhatsAppConfig;
  dailyLimit?: number;
  currentUsage: number;
  usageResetAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateCommunicationSettingDto {
  enabled?: boolean;
  provider?: string;
  config?: Partial<EmailConfig | SmsConfig | WhatsAppConfig>;
  dailyLimit?: number;
}

// ============================================
// SECURITY TYPES
// ============================================

export interface TwoFactorSettings {
  enabled: boolean;
  method: 'sms' | 'email' | 'authenticator';
  requireForAdmins: boolean;
  requireForHosts: boolean;
  requireForAgents: boolean;
  codeExpiryMinutes?: number;
}

export interface SessionSettings {
  sessionTimeout: number; // minutes
  maxActiveSessions: number;
  requireReauthForSensitive: boolean;
  ipWhitelisting: boolean;
  whitelistedIPs: string[];
}

export interface PasswordPolicySettings {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  expiryDays: number;
  preventReuse: number;
}

export interface ApiSecuritySettings {
  rateLimit: number;
  rateLimitWindow: number; // minutes
  requireApiKey: boolean;
  allowCORS: boolean;
  allowedOrigins?: string[];
}

export interface SecuritySetting {
  id: string;
  category: 'twoFactor' | 'session' | 'passwordPolicy' | 'apiSecurity';
  settings: TwoFactorSettings | SessionSettings | PasswordPolicySettings | ApiSecuritySettings;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateSecuritySettingDto {
  twoFactor?: Partial<TwoFactorSettings>;
  session?: Partial<SessionSettings>;
  passwordPolicy?: Partial<PasswordPolicySettings>;
  apiSecurity?: Partial<ApiSecuritySettings>;
}

// ============================================
// BUSINESS RULES TYPES
// ============================================

export interface BookingRules {
  minBookingAdvance: number; // days
  maxBookingAdvance: number; // days
  instantBooking: boolean;
  requireHostApproval: boolean;
}

export interface CancellationRules {
  freeCancellationWindow: number; // hours
  cancellationFee: number; // percentage
  noShowFee: number; // percentage
}

export interface PaymentRules {
  depositPercentage: number;
  fullPaymentBefore: number; // days
  refundProcessingDays: number;
  autoRefundOnCancel: boolean;
}

export interface CommissionRules {
  platformCommission: number; // percentage
  agentCommission: number; // percentage
  tourGuideCommission: number; // percentage
}

export interface SystemRules {
  maintenanceMode: boolean;
  allowNewRegistrations: boolean;
  requireEmailVerification: boolean;
  requirePhoneVerification: boolean;
  requireKYC: boolean;
  autoApproveListings: boolean;
  enableReviews: boolean;
  enableMessaging: boolean;
}

export interface FinancialRules {
  baseCurrency: string;
  taxRate: number; // percentage
  minWithdrawal: number;
  maxWithdrawal: number;
  withdrawalFee: number; // percentage
  escrowHoldDays: number;
}

export interface LimitRules {
  maxPropertyImages: number;
  maxTourImages: number;
  maxFileSize: number; // MB
  maxPropertiesPerHost: number;
  maxActiveBookings: number;
  maxGuestsPerBooking: number;
}

export interface BusinessRule {
  id: string;
  category: 'booking' | 'cancellation' | 'payment' | 'commission' | 'system' | 'financial' | 'limits';
  rules: BookingRules | CancellationRules | PaymentRules | CommissionRules | SystemRules | FinancialRules | LimitRules;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateBusinessRulesDto {
  booking?: Partial<BookingRules>;
  cancellation?: Partial<CancellationRules>;
  payment?: Partial<PaymentRules>;
  commission?: Partial<CommissionRules>;
  system?: Partial<SystemRules>;
  financial?: Partial<FinancialRules>;
  limits?: Partial<LimitRules>;
}

// ============================================
// AUTOMATED JOBS TYPES
// ============================================

export interface JobConfig {
  reminderDays?: number;
  channels?: ('email' | 'sms' | 'whatsapp')[];
  filters?: Record<string, any>;
  batchSize?: number;
  [key: string]: any;
}

export interface AutomatedJob {
  id: string;
  jobType: string;
  schedule: string; // Cron expression
  timezone: string;
  enabled: boolean;
  config?: JobConfig;
  lastRun?: Date;
  lastRunStatus?: 'success' | 'failed';
  nextRun?: Date;
  executionCount: number;
  successCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAutomatedJobDto {
  jobType: string;
  schedule: string;
  timezone?: string;
  enabled?: boolean;
  config?: JobConfig;
}

export interface UpdateAutomatedJobDto {
  schedule?: string;
  timezone?: string;
  enabled?: boolean;
  config?: Partial<JobConfig>;
}

export interface JobType {
  type: string;
  name: string;
  description: string;
  category: string;
  configurable: boolean;
  supportedChannels: string[];
}

// ============================================
// WEBHOOK TYPES
// ============================================

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  secret?: string;
  active: boolean;
  headers?: Record<string, string>;
  retryCount: number;
  lastSuccess?: Date;
  lastFailure?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateWebhookDto {
  url: string;
  events: string[];
  secret?: string;
  active?: boolean;
  headers?: Record<string, string>;
}

export interface UpdateWebhookDto {
  url?: string;
  events?: string[];
  secret?: string;
  active?: boolean;
  headers?: Record<string, string>;
}

// ============================================
// NOTIFICATION TYPES
// ============================================

export interface NotificationTemplate {
  id: string;
  name: string;
  channel: 'email' | 'sms' | 'whatsapp';
  category?: string;
  subject?: string;
  content: string;
  variables?: string[];
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateNotificationTemplateDto {
  name: string;
  channel: 'email' | 'sms' | 'whatsapp';
  category?: string;
  subject?: string;
  content: string;
  variables?: string[];
  active?: boolean;
}

export interface UpdateNotificationTemplateDto {
  name?: string;
  subject?: string;
  content?: string;
  variables?: string[];
  active?: boolean;
}

export interface NotificationTriggers {
  booking: {
    email: boolean;
    sms: boolean;
    whatsapp: boolean;
  };
  payment: {
    email: boolean;
    sms: boolean;
    whatsapp: boolean;
  };
  cancellation: {
    email: boolean;
    sms: boolean;
    whatsapp: boolean;
  };
  [key: string]: {
    email: boolean;
    sms: boolean;
    whatsapp: boolean;
  };
}

export interface SendEmailDto {
  to: {
    email: string;
    name: string;
  };
  template: string;
  subject: string;
  data: Record<string, any>;
  attachments?: Array<{
    filename: string;
    content: string;
    type: string;
  }>;
}

export interface SendSmsDto {
  to: string;
  message: string;
  senderId?: string;
  priority?: 'high' | 'normal' | 'low';
}

export interface SendWhatsAppDto {
  to: string;
  template: string;
  language: string;
  parameters: Array<{
    type: string;
    text: string;
  }>;
  attachments?: Array<{
    type: string;
    url: string;
    filename: string;
  }>;
}

export interface BulkNotificationDto {
  recipients: Array<{
    userId: string;
    email: string;
    phone: string;
  }>;
  channels: ('email' | 'sms' | 'whatsapp')[];
  template: string;
  data: Record<string, any>;
  scheduledAt?: Date;
}

// ============================================
// AUDIT LOG TYPES
// ============================================

export interface AuditLog {
  id: string;
  userId?: number;
  action: string;
  category?: string;
  ipAddress?: string;
  userAgent?: string;
  status: 'success' | 'failed';
  metadata?: Record<string, any>;
  createdAt: Date;
}

export interface CreateAuditLogDto {
  userId?: number;
  action: string;
  category?: string;
  ipAddress?: string;
  userAgent?: string;
  status: 'success' | 'failed';
  metadata?: Record<string, any>;
}

// ============================================
// PAYMENT TRANSACTION TYPES
// ============================================

export interface PaymentTransactionDto {
  operatorCode: string;
  operationType: 'deposit' | 'withdrawal' | 'refund' | 'disburse';
  amount: number;
  currency: string;
  phoneNumber?: string;
  accountNumber?: string;
  reference: string;
  metadata?: Record<string, any>;
}

export interface PaymentTransactionResponse {
  transactionId: string;
  status: 'pending' | 'success' | 'failed';
  provider: string;
  operatorCode: string;
  amount: number;
  currency: string;
  reference: string;
  externalReference: string;
  createdAt: Date;
  estimatedCompletionTime?: Date;
}

// ============================================
// USER MANAGEMENT TYPES
// ============================================

export interface WelcomeUserDto {
  userId: string;
  email: string;
  name: string;
  userType: 'guest' | 'host' | 'agent' | 'guide';
  registrationSource?: string;
  referralCode?: string;
}

export interface UserOnboardingStatus {
  userId: string;
  onboardingComplete: boolean;
  completionPercentage: number;
  steps: Array<{
    step: string;
    status: 'completed' | 'pending' | 'not_started';
    completedAt?: Date;
    dueDate?: Date;
  }>;
  remindersSent: number;
  lastReminderAt?: Date;
}

export interface UserActivityDto {
  activityType: string;
  metadata?: Record<string, any>;
}

export interface ReEngagementCriteria {
  inactiveDays: number;
  lastBookingDate?: string;
  userTypes: string[];
}

export interface ReEngagementCampaign {
  template: string;
  channels: ('email' | 'sms' | 'whatsapp')[];
  incentive?: {
    type: string;
    value: number;
    validDays: number;
  };
}

export interface ReEngageUsersDto {
  criteria: ReEngagementCriteria;
  campaign: ReEngagementCampaign;
}

// ============================================
// SYSTEM FEATURE TOGGLE
// ============================================

export interface FeatureToggleDto {
  feature: string;
  enabled: boolean;
  message?: string;
  scheduledEnd?: Date;
}
