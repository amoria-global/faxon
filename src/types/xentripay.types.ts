// types/xentripay.types.ts - Complete type definitions

// ==================== SERVICE CONFIGURATION ====================

export interface XentriPayConfig {
  apiKey: string;
  baseUrl: string;
  environment: 'production' | 'sandbox';
  timeout?: number;
}

// ==================== COLLECTIONS (DEPOSITS) ====================

export interface CollectionRequest {
  email: string;
  cname: string;
  amount: number;
  cnumber: string;
  msisdn: string;
  currency: string;
  pmethod: string;
  chargesIncluded?: string;
}

export interface CollectionResponse {
  reply: string;
  url: string;
  success: number;
  authkey: string;
  tid: string;
  refid: string;
  retcode: number;
}

export interface CollectionStatusResponse {
  refid: string;
  status: 'SUCCESS' | 'PENDING' | 'FAILED';
  updatedAt: string;
}

// ==================== PAYOUTS (WITHDRAWALS) ====================

export interface PayoutRequest {
  customerReference: string;
  telecomProviderId: string;
  msisdn: string;
  name: string;
  transactionType: 'PAYOUT';
  currency: string;
  amount: number;
}

export interface PayoutResponse {
  id: number;
  businessName: string;
  customerReference: string;
  telecomProvider: string;
  telecomProviderId: string;
  msisdn: string;
  transactionType: string;
  currency: string;
  amount: number;
  txnCharge: number;
  status: PayoutStatus;
  statusMessage: string;
  internalRef: string;
  remoteIp: string;
  paymentChanel: string;
  validatedAccountName: string;
  externalTransactionRef: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PayoutStatus = 
  | 'PENDING' 
  | 'COMPLETED' 
  | 'FAILED' 
  | 'REVERSED';

export interface PayoutStatusResponse {
  timestamp: string;
  message: string;
  data: {
    status: string;
    reference_number: string;
    amount: string;
  };
}

// ==================== ACCOUNT VALIDATION ====================

export interface AccountValidationRequest {
  accountNumber: string;
  bankId: string;
}

export interface AccountValidationResponse {
  registeredName: string;
}

// ==================== WALLET ====================

export interface WalletBalanceResponse {
  walletId: number;
  businessAccountId: number;
  businessName: string;
  balance: string;
  currency: string;
  active: boolean;
}

// ==================== ESCROW TRANSACTIONS ====================

export interface EscrowTransaction {
  id: string;
  userId: string; // Payer (guest/user making payment)
  recipientId?: string; // Host agent receiving payment
  amount: number;
  currency: string;
  description: string;
  status: EscrowStatus;
  xentriPayRefId?: string;
  xentriPayTid?: string;
  xentriPayInternalRef?: string;
  customerReference?: string;
  collectionResponse?: CollectionResponse;
  payoutResponse?: PayoutResponse;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  platformFee?: number; // Platform commission
  hostEarning?: number; // Host agent earning
  metadata?: Record<string, any>;
}

export type EscrowStatus =
  | 'INITIATED'
  | 'PENDING'
  | 'HELD'
  | 'RELEASED'
  | 'REFUNDED'
  | 'FAILED'
  | 'CANCELLED';

export interface CreateEscrowRequest {
  userId: string;
  userEmail: string;
  userName: string;
  userPhone: string;
  recipientId?: string;
  recipientEmail?: string;
  recipientName?: string;
  recipientPhone?: string;
  amount: number;
  description: string;
  paymentMethod?: 'momo';
  platformFeePercentage?: number; // e.g., 10 for 10%
  metadata?: Record<string, any>;
}

export interface ReleaseEscrowRequest {
  transactionId: string;
  requesterId: string;
  reason?: string;
}

export interface RefundEscrowRequest {
  transactionId: string;
  requesterId: string;
  reason: string;
}

// ==================== WEBHOOKS ====================

export interface XentriPayWebhookData {
  refid: string;
  status: string;
  amount?: number;
  transactionId?: string;
  timestamp?: string;
}

// ==================== ERROR RESPONSES ====================

export interface XentriPayErrorResponse {
  message: string;
  status: number;
  errors?: string[];
}

// ==================== PHONE VALIDATION ====================

export interface PhoneValidationResult {
  isValid: boolean;
  formattedNumber?: string;
  provider?: 'MTN' | 'AIRTEL' | 'SPENN';
  errors?: string[];
}

export interface BankValidationResult {
  isValid: boolean;
  errors?: string[];
}

// ==================== PROVIDER DEFINITIONS ====================

export interface MobileProvider {
  id: string;
  name: string;
  code: string;
}

export interface BankProvider {
  id: string;
  name: string;
  code: string;
}

export const MOBILE_PROVIDERS: MobileProvider[] = [
  { id: '63510', name: 'MTN Mobile Money', code: 'MTN' },
  { id: '63514', name: 'Airtel Money', code: 'AIRTEL' },
  { id: '63509', name: 'Spenn', code: 'SPENN' }
];

export const BANK_PROVIDERS: BankProvider[] = [
  { id: '010', name: 'Investment and Mortgage Bank', code: 'I&M' },
  { id: '040', name: 'Banque de Kigali', code: 'BK' },
  { id: '070', name: 'Guaranty Trust Bank Rwanda', code: 'GTB' },
  { id: '025', name: 'National Commercial Bank of Africa', code: 'NCBA' },
  { id: '100', name: 'Ecobank Rwanda', code: 'ECOBANK' },
  { id: '115', name: 'Access Bank Rwanda', code: 'ACCESS' },
  { id: '145', name: 'Urwego Opportunity Bank', code: 'UOB' },
  { id: '192', name: 'Equity Bank', code: 'EQUITY' },
  { id: '400', name: 'Banque Populaire du Rwanda', code: 'BPR' },
  { id: '800', name: 'Zigama Credit and Savings Scheme', code: 'ZIGAMA' },
  { id: '900', name: 'Bank of Africa Rwanda', code: 'BOA' },
  { id: '950', name: 'Unguka Bank', code: 'UNGUKA' },
  { id: '951', name: 'Banque Nationale du Rwanda', code: 'BNR' }
];

// ==================== API RESPONSE WRAPPERS ====================

export interface ApiSuccessResponse<T> {
  success: true;
  message?: string;
  data: T;
  timestamp?: string;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    errors?: string[];
    timestamp?: string;
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// ==================== EMAIL NOTIFICATION TYPES ====================

export interface DepositInitiatedEmailData {
  to: string;
  userName: string;
  amount: number;
  transactionId: string;
  description: string;
  instructions: string;
  paymentMethod: string;
}

export interface FundsHeldEmailData {
  to: string;
  userName: string;
  transactionId: string;
  amount: number;
  description: string;
  paymentMethod: string;
}

export interface PayoutCompletedEmailData {
  to: string;
  recipientName: string;
  transactionId: string;
  amount: number;
  description: string;
}

export interface RefundCompletedEmailData {
  to: string;
  userName: string;
  transactionId: string;
  amount: number;
  reason: string;
}

// ==================== TRANSACTION HISTORY ====================

export interface TransactionHistoryQuery {
  userId?: string;
  status?: EscrowStatus;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export interface TransactionHistoryResponse {
  transactions: EscrowTransaction[];
  total: number;
  page: number;
  pageSize: number;
}

// ==================== STATISTICS ====================

export interface TransactionStatistics {
  totalTransactions: number;
  totalAmount: number;
  successfulTransactions: number;
  failedTransactions: number;
  pendingTransactions: number;
  averageTransactionAmount: number;
  averageProcessingTime: number; // in milliseconds
}

export type PaymentMethod = 'momo' | 'card';

export interface PaymentChoice {
  method: PaymentMethod;
  provider?: string; // For MoMo: 'MTN' | 'AIRTEL'
}

export interface BulkOperationResult {
  success: number;
  failed: number;
  results: Array<{ id: string; status: string; error?: string }>;
}