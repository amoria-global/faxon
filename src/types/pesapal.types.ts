// types/pesapal.types.ts

export interface PesapalConfig {
  consumerKey: string;
  consumerSecret: string;
  baseUrl: string;
  environment: 'sandbox' | 'production';
  timeout: number;
  retryAttempts: number;
  webhookSecret: string;
  callbackUrl: string;
  defaultCurrency: string;
  merchantAccount: string;
}

export interface PesapalCredentials {
  accessToken?: string;
  expiresAt?: number;
}

// === PESAPAL API REQUEST/RESPONSE TYPES ===

export interface PesapalAuthRequest {
  consumer_key: string;
  consumer_secret: string;
}

export interface PesapalAuthResponse {
  token: string;
  expiryDate: string;
  error?: {
    type: string;
    code: string;
    message: string;
    call_id: string;
  };
}

export interface PesapalCheckoutRequest {
  id: string;
  currency: string;
  amount: number;
  description: string;
  callback_url: string;
  notification_id: string;
  billing_address: {
    email_address: string;
    phone_number?: string;
    country_code?: string;
    first_name?: string;
    middle_name?: string;
    last_name?: string;
    line_1?: string;
    line_2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    zip_code?: string;
  };
}

export interface PesapalCheckoutResponse {
  order_tracking_id: string;
  merchant_reference: string;
  redirect_url: string;
  error?: {
    type: string;
    code: string;
    message: string;
    call_id: string;
  };
}

export interface PesapalPayoutRequest {
  source_type: 'MERCHANT';
  source: {
    account_number: string;
  };
  destination_type: 'MOBILE' | 'BANK';
  destination: {
    type: 'MOBILE' | 'BANK';
    country_code: string;
    holder_name: string;
    account_number: string;
    mobile_provider?: 'AIRTEL' | 'MTN' | 'TIGO' | 'RWANDATEL';
    bank_code?: string;
  };
  transfer_details: {
    amount: number;
    currency_code: string;
    date: string;
    particulars: string;
    reference: string;
  };
}

export interface PesapalPayoutResponse {
  requestId: string;
  status: 'PENDING' | 'SUCCESSFUL' | 'FAILED';
  message: string;
  transaction_tracking_id?: string;
  error?: {
    type: string;
    code: string;
    message: string;
    call_id: string;
  };
}

export interface PesapalWebhookData {
  OrderTrackingId: string;
  OrderMerchantReference: string;
  OrderNotificationType: 'IPNCHANGE';
}

export interface PesapalTransactionStatus {
  payment_method: string;
  amount: number;
  created_date: string;
  confirmation_code: string;
  payment_status_description: string;
  description: string;
  message: string;
  payment_account: string;
  call_back_url: string;
  status_code: number;
  merchant_reference: string;
  account_number?: string;
  order_tracking_id: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'INVALID' | 'REVERSED';
}

// === ESCROW-SPECIFIC TYPES ===

export type EscrowTransactionType = 
  | 'DEPOSIT'
  | 'RELEASE' 
  | 'WITHDRAWAL'
  | 'REFUND';

export type EscrowTransactionStatus = 
  | 'PENDING'
  | 'HELD'
  | 'READY'
  | 'RELEASED'
  | 'REFUNDED'
  | 'FAILED'
  | 'CANCELLED';

export type PayoutMethod = 'MOBILE' | 'BANK';
export type MobileProvider = 'AIRTEL' | 'MTN' | 'TIGO' | 'RWANDATEL';

export interface SplitRules {
  host: number;
  agent: number;
  platform: number;
}

export interface EscrowParticipant {
  id: number;
  role: 'GUEST' | 'HOST' | 'AGENT' | 'PLATFORM';
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
}

// === REQUEST/RESPONSE DTOs ===

export interface CreateDepositDto {
  amount: number;
  currency: string;
  reference: string;
  description?: string;
  hostId: number;
  agentId?: number;
  splitRules: SplitRules;
  billingInfo: {
    email: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
    countryCode?: string;
  };
}

export interface ReleaseEscrowDto {
  transactionId: string;
  releaseReason?: string;
}

export interface WithdrawDto {
  amount: number;
  method: PayoutMethod;
  destination: {
    holderName: string;
    accountNumber: string;
    mobileProvider?: MobileProvider;
    bankCode?: string;
    countryCode?: string;
  };
  reference: string;
  particulars?: string;
}

export interface RefundDto {
  transactionId: string;
  amount?: number; // For partial refunds
  reason: string;
}

// === CORE MODELS ===

export interface EscrowTransaction {
  id: string;
  guestId: number;
  hostId: number;
  agentId?: number;
  type: EscrowTransactionType;
  status: EscrowTransactionStatus;
  amount: number;
  currency: string;
  reference: string;
  description?: string;
  metadata?: string;
  
  // Pesapal identifiers
  pesapalOrderId?: string;
  pesapalTrackingId?: string;
  pesapalPayoutId?: string;
  
  // Split configuration
  splitRules: SplitRules;
  splitAmounts?: {
    host: number;
    agent: number;
    platform: number;
  };
  
  // Status tracking
  heldAt?: Date;
  readyAt?: Date;
  releasedAt?: Date;
  refundedAt?: Date;
  failedAt?: Date;
  
  // Additional data
  billingInfo?: Record<string, any>;
  failureReason?: string;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  
  // Relations
  guest?: EscrowParticipant;
  host?: EscrowParticipant;
  agent?: EscrowParticipant;
}

export interface UserWallet {
  id: string;
  userId: number;
  balance: number;
  currency: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface WithdrawalRequest {
  id: string;
  userId: number;
  amount: number;
  currency: string;
  method: PayoutMethod;
  destination: Record<string, any>;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  pesapalPayoutId?: string | any;
  reference: string;
  failureReason?: string | any;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date | any;
}

// === API RESPONSE TYPES ===

export interface EscrowSuccessResponse<T = any> {
  success: true;
  data: T;
  message: string;
}

export interface EscrowErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
    timestamp: string;
  };
}

export type EscrowApiResponse<T = any> = EscrowSuccessResponse<T> | EscrowErrorResponse;

// === ANALYTICS & REPORTING ===

export interface EscrowAnalytics {
  userId: number;
  period: {
    startDate: string;
    endDate: string;
  };
  summary: {
    totalVolume: number;
    totalTransactions: number;
    totalHeld: number;
    totalReleased: number;
    totalRefunded: number;
    totalWithdrawn: number;
    averageTransactionAmount: number;
    averageHoldingPeriod: number; // in hours
  };
  breakdown: {
    byStatus: Record<EscrowTransactionStatus, number>;
    byType: Record<EscrowTransactionType, number>;
    byCurrency: Record<string, number>;
  };
}

// === CONFIGURATION TYPES ===

export interface EscrowLimits {
  userId: number;
  daily: {
    maxAmount: number;
    maxTransactions: number;
    usedAmount: number;
    usedTransactions: number;
  };
  monthly: {
    maxAmount: number;
    maxTransactions: number;
    usedAmount: number;
    usedTransactions: number;
  };
  perTransaction: {
    minAmount: number;
    maxAmount: number;
  };
  currency: string;
  updatedAt: Date;
}

export interface PlatformSettings {
  defaultSplitRules: SplitRules;
  supportedCurrencies: string[];
  supportedCountries: string[];
  supportedMobileProviders: MobileProvider[];
  fees: {
    deposit: {
      percentage: number;
      fixed: number;
      min: number;
      max: number;
    };
    withdrawal: {
      mobile: number;
      bank: number;
    };
    refund: {
      percentage: number;
      fixed: number;
    };
  };
  limits: {
    minDeposit: number;
    maxDeposit: number;
    minWithdrawal: number;
    maxWithdrawal: number;
    dailyLimit: number;
    monthlyLimit: number;
  };
}