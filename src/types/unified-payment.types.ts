// types/unified-payment.types.ts - Unified Payment System Types

// ==================== PAYMENT PROVIDER ENUMS ====================

export enum PaymentProvider {
  PESAPAL = 'pesapal',
  PAWAPAY = 'pawapay',
  XENTRIPAY = 'xentripay'
}

export enum PaymentMethod {
  // Mobile Money
  MTN_MOMO = 'mtn_momo',
  AIRTEL_MONEY = 'airtel_money',
  MPESA = 'mpesa',
  TIGO_PESA = 'tigo_pesa',
  ORANGE_MONEY = 'orange_money',
  VODAFONE = 'vodafone',

  // Cards
  VISA = 'visa',
  MASTERCARD = 'mastercard',
  AMERICAN_EXPRESS = 'amex',

  // Banks
  BANK_TRANSFER = 'bank_transfer',

  // Digital Wallets
  GOOGLE_PAY = 'google_pay',
  APPLE_PAY = 'apple_pay',
  PAYPAL = 'paypal'
}

export enum PaymentCountry {
  RWANDA = 'RW',
  KENYA = 'KE',
  UGANDA = 'UG',
  TANZANIA = 'TZ',
  ZAMBIA = 'ZM',
  GHANA = 'GH',
  NIGERIA = 'NG',
  MALAWI = 'MW',
  BENIN = 'BJ',
  CAMEROON = 'CM',
  DRC = 'CD',
  IVORY_COAST = 'CI',
  SENEGAL = 'SN',
  ZIMBABWE = 'ZW',
  BOTSWANA = 'BW',
  ETHIOPIA = 'ET',
  SOUTH_AFRICA = 'ZA'
}

export enum TransactionType {
  DEPOSIT = 'deposit',
  PAYOUT = 'payout',
  REFUND = 'refund'
}

export enum TransactionStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  HELD = 'HELD',
  REFUNDED = 'REFUNDED',
  REVERSED = 'REVERSED'
}

// ==================== UNIFIED REQUEST/RESPONSE TYPES ====================

export interface PaymentRecipient {
  phoneNumber: string;
  email?: string;
  name?: string;
  country?: PaymentCountry;
}

export interface PaymentMetadata {
  [key: string]: string | number | boolean;
}

export interface UnifiedDepositRequest {
  // Transaction details
  transactionId: string;
  amount: number;
  currency: string;
  description: string;

  // Recipient information
  recipient: PaymentRecipient;

  // Payment method selection
  provider?: PaymentProvider; // Auto-selected if not provided
  paymentMethod?: PaymentMethod;
  country?: PaymentCountry;

  // Callback and webhook
  callbackUrl?: string;
  webhookUrl?: string;

  // Additional metadata
  metadata?: PaymentMetadata;
}

export interface UnifiedDepositResponse {
  success: boolean;
  transactionId: string;
  providerTransactionId: string;
  provider: PaymentProvider;
  status: TransactionStatus;
  amount: number;
  currency: string;

  // Payment instructions (if applicable)
  paymentUrl?: string;
  paymentInstructions?: string;

  // Timestamps
  createdAt: string;
  expiresAt?: string;

  // Additional data
  metadata?: PaymentMetadata;
  errorMessage?: string;
}

export interface UnifiedPayoutRequest {
  // Transaction details
  transactionId: string;
  amount: number;
  currency: string;
  description: string;

  // Recipient information
  recipient: PaymentRecipient;

  // Payment method selection
  provider?: PaymentProvider; // Auto-selected if not provided
  paymentMethod?: PaymentMethod;
  country?: PaymentCountry;

  // Account validation
  validateRecipient?: boolean;

  // Callback and webhook
  callbackUrl?: string;
  webhookUrl?: string;

  // Additional metadata
  metadata?: PaymentMetadata;
}

export interface UnifiedPayoutResponse {
  success: boolean;
  transactionId: string;
  providerTransactionId: string;
  provider: PaymentProvider;
  status: TransactionStatus;
  amount: number;
  currency: string;

  // Recipient validation
  validatedRecipientName?: string;

  // Timestamps
  createdAt: string;
  estimatedCompletionTime?: string;

  // Additional data
  metadata?: PaymentMetadata;
  errorMessage?: string;
}

export interface UnifiedRefundRequest {
  // Original transaction reference
  originalTransactionId: string;
  providerTransactionId?: string;

  // Refund details
  refundId: string;
  amount?: number; // Partial refund if specified
  reason: string;

  // Recipient information (from original transaction)
  recipient: PaymentRecipient;

  // Provider selection
  provider: PaymentProvider;

  // Callback
  callbackUrl?: string;

  // Additional metadata
  metadata?: PaymentMetadata;
}

export interface UnifiedRefundResponse {
  success: boolean;
  refundId: string;
  originalTransactionId: string;
  providerRefundId: string;
  provider: PaymentProvider;
  status: TransactionStatus;
  amount: number;
  currency: string;

  // Timestamps
  createdAt: string;
  estimatedCompletionTime?: string;

  // Additional data
  metadata?: PaymentMetadata;
  errorMessage?: string;
}

export interface UnifiedTransactionStatusRequest {
  transactionId: string;
  provider?: PaymentProvider; // Auto-detected from transactionId if not provided
  transactionType: TransactionType;
}

export interface UnifiedTransactionStatusResponse {
  transactionId: string;
  providerTransactionId: string;
  provider: PaymentProvider;
  type: TransactionType;
  status: TransactionStatus;
  amount: number;
  currency: string;

  // Additional status info
  statusDescription?: string;
  failureReason?: string;

  // Timestamps
  createdAt: string;
  updatedAt: string;
  completedAt?: string;

  // Metadata
  metadata?: PaymentMetadata;
}

// ==================== PROVIDER CONFIGURATION ====================

export interface ProviderConfiguration {
  provider: PaymentProvider;
  enabled: boolean;
  priority: number; // Lower number = higher priority

  // Supported features
  supportedMethods: PaymentMethod[];
  supportedCountries: PaymentCountry[];
  supportedCurrencies: string[];

  // Limits
  minAmount: number;
  maxAmount: number;

  // Settings
  apiKey: string;
  baseUrl: string;
  environment: 'production' | 'sandbox';
  timeout?: number;

  // Features
  supportsDeposits: boolean;
  supportsPayouts: boolean;
  supportsRefunds: boolean;
  supportsBulkPayouts: boolean;
  supportsRecipientValidation: boolean;
}

export interface PaymentProviderSettings {
  providers: ProviderConfiguration[];
  defaultProvider?: PaymentProvider;

  // Routing rules
  routingRules: {
    country?: Record<string, PaymentProvider>;
    paymentMethod?: Record<string, PaymentProvider>;
    currency?: Record<string, PaymentProvider>;
  };

  // Fallback strategy
  enableFallback: boolean;
  fallbackOrder: PaymentProvider[];
}

// ==================== WEBHOOK DATA ====================

export interface UnifiedWebhookData {
  provider: PaymentProvider;
  transactionId: string;
  providerTransactionId: string;
  type: TransactionType;
  status: TransactionStatus;
  amount: number;
  currency: string;

  // Additional data
  statusDescription?: string;
  failureReason?: string;
  metadata?: PaymentMetadata;

  // Timestamps
  timestamp: string;

  // Raw provider data
  rawData: any;
}

// ==================== BULK OPERATIONS ====================

export interface BulkPayoutRequest {
  bulkId: string;
  payouts: UnifiedPayoutRequest[];
  provider?: PaymentProvider;
}

export interface BulkPayoutResponse {
  success: boolean;
  bulkId: string;
  provider: PaymentProvider;
  totalPayouts: number;
  successfulPayouts: number;
  failedPayouts: number;

  // Individual results
  results: UnifiedPayoutResponse[];

  // Timestamps
  createdAt: string;
  completedAt?: string;
}

// ==================== PROVIDER INTERFACE ====================

export interface IPaymentProvider {
  // Identification
  getProviderName(): PaymentProvider;
  isAvailable(): Promise<boolean>;

  // Deposit operations
  initiateDeposit(request: UnifiedDepositRequest): Promise<UnifiedDepositResponse>;
  getDepositStatus(transactionId: string): Promise<UnifiedTransactionStatusResponse>;

  // Payout operations
  initiatePayout(request: UnifiedPayoutRequest): Promise<UnifiedPayoutResponse>;
  getPayoutStatus(transactionId: string): Promise<UnifiedTransactionStatusResponse>;

  // Refund operations
  initiateRefund(request: UnifiedRefundRequest): Promise<UnifiedRefundResponse>;
  getRefundStatus(refundId: string): Promise<UnifiedTransactionStatusResponse>;

  // Bulk operations (optional)
  initiateBulkPayout?(request: BulkPayoutRequest): Promise<BulkPayoutResponse>;

  // Recipient validation (optional)
  validateRecipient?(phoneNumber: string, paymentMethod: PaymentMethod): Promise<{ valid: boolean; name?: string }>;

  // Webhook handling
  validateWebhook(payload: string, signature: string): boolean;
  parseWebhook(payload: any): UnifiedWebhookData;

  // Health check
  healthCheck(): Promise<boolean>;
}

// ==================== ERROR HANDLING ====================

export class PaymentError extends Error {
  constructor(
    message: string,
    public code: string,
    public provider?: PaymentProvider,
    public transactionId?: string,
    public details?: any
  ) {
    super(message);
    this.name = 'PaymentError';
  }
}

export enum PaymentErrorCode {
  PROVIDER_UNAVAILABLE = 'PROVIDER_UNAVAILABLE',
  INVALID_REQUEST = 'INVALID_REQUEST',
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  INVALID_RECIPIENT = 'INVALID_RECIPIENT',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  TRANSACTION_NOT_FOUND = 'TRANSACTION_NOT_FOUND',
  DUPLICATE_TRANSACTION = 'DUPLICATE_TRANSACTION',
  AMOUNT_LIMIT_EXCEEDED = 'AMOUNT_LIMIT_EXCEEDED',
  UNSUPPORTED_CURRENCY = 'UNSUPPORTED_CURRENCY',
  UNSUPPORTED_COUNTRY = 'UNSUPPORTED_COUNTRY',
  UNSUPPORTED_PAYMENT_METHOD = 'UNSUPPORTED_PAYMENT_METHOD',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  WEBHOOK_VALIDATION_FAILED = 'WEBHOOK_VALIDATION_FAILED',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}
