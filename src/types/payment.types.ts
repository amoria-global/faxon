// Base Types
export type PaymentType = 'deposit' | 'withdrawal' | 'transfer' | 'refund' | 'commission' | 'fee';
export type PaymentMethod = 'mobile_money' | 'bank_transfer' | 'card' | 'wallet' | 'cash';
export type TransactionStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'expired';
export type MobileMoneyProvider = 'mpesa' | 'airtel' | 'orange' | 'mtn' | 'tigo';
export type TransferType = 'mobile' | 'internal' | 'rtgs' | 'swift' | 'instant';

// --- DTOs (Data Transfer Objects) ---
export interface DepositDto {
  amount: number;
  phoneNumber: string;
  reference: string;
  description?: string;
  callbackUrl?: string;
}

export interface WithdrawalDto {
  amount: number;
  accountNumber: string;
  bankCode: string;
  accountName: string;
  reference: string;
  description?: string;
  callbackUrl?: string;
}

export interface TransferDto {
  amount: number;
  transferType: TransferType;
  sourceAccount: string;
  destinationAccount: string;
  destinationBankCode?: string;
  reference: string;
  description?: string;
  callbackUrl?: string;
}

export interface BalanceInquiryDto {
  accountNumber: string;
  countryCode?: string;
}

// --- Core Domain Models ---
export interface PaymentTransaction {
  id: string;
  userId: number;
  type: PaymentType;
  method: PaymentMethod;
  amount: number;
  currency: string;
  status: TransactionStatus;
  reference: string;
  externalId?: string;
  jengaTransactionId?: string;
  description?: string;
  metadata?: Record<string, any>;
  charges?: number;
  netAmount?: number;
  sourceAccount?: string;
  destinationAccount?: string;
  phoneNumber?: string;
  bankCode?: string;
  accountName?: string;
  failureReason?: string;
  callbackUrl?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface UserWallet {
  id: string;
  userId: number;
  balance: number;
  currency: string;
  accountNumber?: string;
  isActive: boolean;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BalanceInfo {
  available: number;
  pending: number;
  total: number;
  currency: string;
  accountNumber: string;
  accountName: string;
  lastUpdated: string;
}

// --- Filters and Search ---
export interface PaymentFilters {
  userId: any;
  type?: PaymentType[];
  method?: PaymentMethod[];
  status?: TransactionStatus[];
  dateFrom?: string;
  dateTo?: string;
  minAmount?: number;
  maxAmount?: number;
  reference?: string;
  phoneNumber?: string;
  accountNumber?: string;
}

export interface PaymentHistory {
  transactions: PaymentTransaction[];
  summary: TransactionSummary;
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface TransactionSummary {
  totalDeposits: number;
  totalWithdrawals: number;
  totalTransfers: number;
  totalCharges: number;
  netAmount: number;
  transactionCount: number;
}

// --- Jenga API Types ---
export interface JengaConfig {
  baseUrl: string;
  username: string;
  password: string;
  apiKey: string;
  privateKey: string;
  environment: 'sandbox' | 'production';
  timeout: number;
  retryAttempts: number;
  callbackUrl: string;
}

export interface JengaCredentials {
  accessToken?: string;
  refreshToken?: string;
  tokenType?: string;
  expiresAt?: number;
}

export interface JengaAuthRequest {
  username: string;
  password: string;
}

export interface JengaAuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface JengaMobileMoneyRequest {
  customer: {
    countryCode: string;
    mobileNumber: string;
  };
  transaction: {
    amount: string;
    description: string;
    type: string;
    id: string;
  };
}

export interface JengaBankTransferRequest {
  source: {
    countryCode: string;
    name: string;
    accountNumber: string;
  };
  destination: {
    countryCode: string;
    name: string;
    bankCode?: string;
    accountNumber: string;
    type: string;
  };
  transfer: {
    type: string;
    amount: string;
    currencyCode: string;
    reference: string;
    date: string;
    description: string;
  };
}

export interface JengaBalanceRequest {
  countryCode: string;
  accountNumber: string;
}

export interface JengaBalanceResponse {
  accountNumber: string;
  accountName: string;
  balances: Array<{
    type: string;
    amount: string;
    currencyCode: string;
  }>;
}

export interface JengaTransactionResponse {
  transactionId: string;
  transactionCode: string;
  status: string;
  message?: string;
  charges?: string;
  resultCode?: string;
  resultDesc?: string;
}

export interface JengaCallbackData {
  transactionId: string;
  merchantTransactionId: string;
  status: string;
  resultCode: string;
  resultDesc: string;
  amount?: string;
  charges?: string;
  accountNumber?: string;
  phoneNumber?: string;
  timestamp: string;
}

// --- Fee and Limits ---
export interface TransactionFees {
  serviceFee: number;
  processingFee: number;
  commissionFee: number;
  totalFees: number;
  netAmount: number;
  currency: string;
}

export interface PaymentLimits {
  userId: number;
  limits: {
    daily: {
      deposit: number;
      withdrawal: number;
      transfer: number;
    };
    monthly: {
      deposit: number;
      withdrawal: number;
      transfer: number;
    };
    perTransaction: {
      minDeposit: number;
      maxDeposit: number;
      minWithdrawal: number;
      maxWithdrawal: number;
      minTransfer: number;
      maxTransfer: number;
    };
    currency: string;
  };
  usedLimits: {
    dailyUsed: {
      deposit: number;
      withdrawal: number;
      transfer: number;
      date: string;
    };
    monthlyUsed: {
      deposit: number;
      withdrawal: number;
      transfer: number;
      month: string;
    };
  };
  updatedAt: string;
}

// --- Validation Types ---
export interface BankValidationResponse {
  isValid: boolean;
  accountName?: string;
  bankName?: string;
  errors?: string[];
}

export interface PhoneValidationResponse {
  isValid: boolean;
  formattedNumber?: string;
  provider?: MobileMoneyProvider;
  errors?: string[];
}

// --- Bank Account Management ---
export interface BankAccount {
  id: string;
  userId: number;
  accountNumber: string;
  accountName: string;
  bankCode: string;
  bankName: string;
  branchCode?: string;
  isDefault: boolean;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBankAccountDto {
  accountNumber: string;
  accountName: string;
  bankCode: string;
  bankName: string;
  branchCode?: string;
  isDefault?: boolean;
}

export interface UpdateBankAccountDto {
  accountName?: string;
  branchCode?: string;
  isDefault?: boolean;
}

// --- Mobile Money Account Management ---
export interface MobileMoneyAccount {
  id: string;
  userId: number;
  phoneNumber: string;
  provider: MobileMoneyProvider;
  accountName: string;
  isDefault: boolean;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMobileMoneyAccountDto {
  phoneNumber: string;
  provider: MobileMoneyProvider;
  accountName: string;
  isDefault?: boolean;
}

export interface UpdateMobileMoneyAccountDto {
  accountName?: string;
  isDefault?: boolean;
}

// --- Payment Settings ---
export interface PaymentSettings {
  id: string;
  userId: number;
  defaultCurrency: string;
  autoWithdrawal: boolean;
  withdrawalThreshold?: number;
  defaultBankAccount?: string;
  defaultMobileNumber?: string;
  notificationPreferences: {
    email: boolean;
    sms: boolean;
    push: boolean;
    transactionAlerts: boolean;
    balanceAlerts: boolean;
    securityAlerts: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

export interface UpdatePaymentSettingsDto {
  defaultCurrency?: string;
  autoWithdrawal?: boolean;
  withdrawalThreshold?: number;
  defaultBankAccount?: string;
  defaultMobileNumber?: string;
  notificationPreferences?: Partial<PaymentSettings['notificationPreferences']>;
}

// --- Wallet Transactions ---
export interface WalletTransaction {
  id: string;
  walletId: string;
  type: 'credit' | 'debit';
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  reference: string;
  description: string;
  transactionId?: string;
  createdAt: string;
}

// --- Payment Reports and Analytics ---
export interface PaymentAnalytics {
  userId: number;
  period: {
    start: string;
    end: string;
  };
  summary: {
    totalDeposits: number;
    totalWithdrawals: number;
    totalTransfers: number;
    totalFees: number;
    netFlow: number;
    transactionCount: number;
  };
  breakdown: {
    byMethod: Record<PaymentMethod, number>;
    byType: Record<PaymentType, number>;
    byStatus: Record<TransactionStatus, number>;
  };
  trends: {
    daily: Array<{
      date: string;
      deposits: number;
      withdrawals: number;
      transfers: number;
    }>;
  };
}

// --- Fee Structure ---
export interface FeeStructure {
  id: string;
  type: PaymentType;
  method: PaymentMethod;
  feeType: 'fixed' | 'percentage';
  amount: number;
  minFee?: number;
  maxFee?: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// --- Error Types ---
export interface PaymentError {
  code: string;
  message: string;
  details?: Record<string, any>;
  timestamp: string;
}

export interface PaymentErrorResponse {
  success: false;
  error: PaymentError;
}

// --- Success Response Types ---
export interface PaymentSuccessResponse<T = any> {
  success: true;
  data: T;
  message?: string;
}

export type PaymentResponse<T = any> = PaymentSuccessResponse<T> | PaymentErrorResponse;

// --- Notification Types ---
export interface PaymentNotification {
  id: string;
  userId: number;
  type: 'transaction_completed' | 'transaction_failed' | 'balance_low' | 'security_alert';
  title: string;
  message: string;
  data?: Record<string, any>;
  channels: Array<'email' | 'sms' | 'push'>;
  isRead: boolean;
  createdAt: string;
}

// --- Audit and Compliance ---
export interface PaymentAuditLog {
  id: string;
  userId: number;
  action: string;
  resource: string;
  resourceId?: string;
  changes?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: string;
}

// --- KYC and Verification ---
export interface KYCDocument {
  id: string;
  userId: number;
  type: 'national_id' | 'passport' | 'driving_license' | 'utility_bill' | 'bank_statement';
  documentUrl: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  verifiedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface KYCStatus {
  userId: number;
  level: 'basic' | 'intermediate' | 'full';
  isVerified: boolean;
  requiredDocuments: string[];
  submittedDocuments: KYCDocument[];
  verificationLimits: {
    dailyLimit: number;
    monthlyLimit: number;
    transactionLimit: number;
  };
  updatedAt: string;
}

// --- Batch Operations ---
export interface BatchPaymentRequest {
  reference: string;
  description?: string;
  totalAmount: number;
  payments: Array<{
    type: PaymentType;
    method: PaymentMethod;
    amount: number;
    recipient: {
      phoneNumber?: string;
      accountNumber?: string;
      bankCode?: string;
      accountName?: string;
    };
    reference: string;
    description?: string;
  }>;
}

export interface BatchPaymentResponse {
  batchId: string;
  reference: string;
  totalAmount: number;
  successCount: number;
  failureCount: number;
  status: 'processing' | 'completed' | 'partial' | 'failed';
  results: Array<{
    reference: string;
    status: TransactionStatus;
    transactionId?: string;
    error?: string;
  }>;
  createdAt: string;
  completedAt?: string;
}

// --- Currency and Exchange ---
export interface CurrencyExchange {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  amount: number;
  convertedAmount: number;
  fees: number;
  timestamp: string;
}

// --- Recurring Payments ---
export interface RecurringPayment {
  id: string;
  userId: number;
  type: PaymentType;
  method: PaymentMethod;
  amount: number;
  currency: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  nextPaymentDate: string;
  endDate?: string;
  isActive: boolean;
  successfulPayments: number;
  failedPayments: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRecurringPaymentDto {
  type: PaymentType;
  method: PaymentMethod;
  amount: number;
  frequency: RecurringPayment['frequency'];
  startDate: string;
  endDate?: string;
  recipient?: {
    phoneNumber?: string;
    accountNumber?: string;
    bankCode?: string;
    accountName?: string;
  };
  description?: string;
}

// --- Payment Links ---
export interface PaymentLink {
  id: string;
  userId: number;
  title: string;
  description?: string;
  amount?: number; // null for variable amounts
  currency: string;
  expiresAt?: string;
  maxUses?: number;
  currentUses: number;
  isActive: boolean;
  successUrl?: string;
  cancelUrl?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePaymentLinkDto {
  title: string;
  description?: string;
  amount?: number;
  currency?: string;
  expiresAt?: string;
  maxUses?: number;
  successUrl?: string;
  cancelUrl?: string;
  metadata?: Record<string, any>;
}

// --- Escrow Payments ---
export interface EscrowPayment {
  id: string;
  payerId: number;
  payeeId: number;
  amount: number;
  currency: string;
  status: 'pending' | 'funded' | 'released' | 'refunded' | 'disputed';
  purpose: string;
  conditions?: string;
  releaseDate?: string;
  disputeReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEscrowPaymentDto {
  payeeId: number;
  amount: number;
  currency?: string;
  purpose: string;
  conditions?: string;
  releaseDate?: string;
}



