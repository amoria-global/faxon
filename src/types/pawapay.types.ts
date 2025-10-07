// types/pawapay.types.ts - PawaPay API Type Definitions

// ==================== CONFIGURATION ====================

export interface PawaPayConfig {
  apiKey: string;
  baseUrl: string; // https://api.pawapay.cloud for production
  environment: 'production' | 'sandbox';
  timeout?: number;
}

// ==================== DEPOSIT (Money In) ====================

export interface PawaPayMetadataField {
  fieldName: string;
  fieldValue: string;
  isPII?: boolean; // Marks if field contains Personally Identifiable Information
}

export interface DepositRequest {
  depositId: string; // Unique ID from your system
  amount: string; // Amount in smallest currency unit (e.g., "100" for 1.00)
  currency: string; // ISO 4217 currency code (e.g., "ZMW", "UGX", "KES")
  payer: {
    type: 'MMO';
    accountDetails: {
      phoneNumber: string; // Phone number in international format without + (e.g., "260763456789")
      provider: string; // MNO code (e.g., "MTN_MOMO_RWA", "AIRTEL_OAPI_ZMB")
    };
  };
  customerTimestamp?: string; // ISO 8601 timestamp
  statementDescription?: string; // Description shown to customer (4-22 characters)
  metadata?: PawaPayMetadataField[]; // Optional: Array of metadata fields
}

export interface DepositResponse {
  depositId: string;
  status: 'ACCEPTED' | 'SUBMITTED' | 'COMPLETED' | 'FAILED' | 'REJECTED' | 'CANCELLED';
  requestedAmount?: string;
  currency?: string;
  country?: string;
  payer?: {
    type: string;
    accountDetails?: {
      phoneNumber: string;
      provider: string;
    };
  };
  customerTimestamp?: string;
  statementDescription?: string;
  created?: string;
  receivedByPawaPay?: string;
  correspondentIds?: {
    PROVIDER_TRANSACTION_ID?: string;
    FINANCIAL_TRANSACTION_ID?: string;
  };
  failureReason?: {
    failureCode: string;
    failureMessage: string;
  };
}

// ==================== PAYOUT (Money Out) ====================

export interface PayoutRequest {
  payoutId: string; // Unique ID from your system
  amount: string; // Amount in smallest currency unit
  currency: string; // ISO 4217 currency code
  recipient: {
    type: 'MMO';
    accountDetails: {
      phoneNumber: string; // Phone number in international format without +
      provider: string; // MNO code (e.g., "MTN_MOMO_RWA", "AIRTEL_OAPI_ZMB")
    };
  };
  customerTimestamp?: string; // ISO 8601 timestamp
  statementDescription?: string; // Description shown to recipient (4-22 characters)
  metadata?: PawaPayMetadataField[]; // Optional: Array of metadata fields
}

export interface PayoutResponse {
  payoutId: string;
  status: 'ACCEPTED' | 'ENQUEUED' | 'SUBMITTED' | 'COMPLETED' | 'FAILED' | 'REJECTED' | 'CANCELLED';
  requestedAmount?: string | any;
  depositedAmount?: string | any;
  currency?: string | any;
  country?: string | any;
  recipient: {
    type: string;
    accountDetails?: {
      phoneNumber: string;
      provider: string;
    };
  };
  customerTimestamp?: string;
  statementDescription?: string;
  created?: string;
  receivedByPawaPay?: string;
  correspondentIds?: {
    PROVIDER_TRANSACTION_ID?: string;
    FINANCIAL_TRANSACTION_ID?: string;
  };
  failureReason?: {
    failureCode: string;
    failureMessage: string;
  };
}

// ==================== REFUND ====================

export interface RefundRequest {
  refundId: string; // Unique ID from your system
  depositId: string; // Original deposit ID to refund
  amount: string; // Amount to refund (can be partial)
}

export interface RefundResponse {
  refundId: string;
  status: 'ACCEPTED' | 'ENQUEUED' | 'SUBMITTED' | 'COMPLETED' | 'FAILED' | 'REJECTED' | 'CANCELLED';
  depositId: string;
  requestedAmount: string;
  refundedAmount?: string;
  currency: string;
  country: string;
  correspondent: string;
  created: string;
  receivedByPawaPay?: string;
  correspondentIds?: {
    PROVIDER_TRANSACTION_ID?: string;
    FINANCIAL_TRANSACTION_ID?: string;
  };
  failureReason?: {
    failureCode: string;
    failureMessage: string;
  };
}

// ==================== BULK PAYOUT ====================

export interface BulkPayoutRequest {
  bulkPayoutId: string; // Unique ID for the bulk operation
  payouts: PayoutRequest[];
}

export interface BulkPayoutResponse {
  bulkPayoutId: string;
  status: 'ACCEPTED' | 'PROCESSING' | 'COMPLETED' | 'PARTIAL_SUCCESS' | 'FAILED';
  totalPayouts: number;
  successfulPayouts: number;
  failedPayouts: number;
  payouts: PayoutResponse[];
  created: string;
}

// ==================== ACTIVE CONFIGURATION ====================

export interface ActiveConfiguration {
  correspondents: Correspondent[];
}

export interface Correspondent {
  correspondent: string; // e.g., "MTN_MOMO_ZMB"
  country: string; // ISO 3166-1 alpha-3 country code (e.g., "ZMB")
  currency: string; // ISO 4217 currency code (e.g., "ZMW")
  depositMinimum?: string;
  depositMaximum?: string;
  payoutMinimum?: string;
  payoutMaximum?: string;
  active: boolean;
}

// ==================== RESEND CALLBACK ====================

export interface ResendCallbackRequest {
  transactionId: string; // depositId, payoutId, or refundId
  type: 'DEPOSIT' | 'PAYOUT' | 'REFUND';
}

// ==================== WEBHOOK/CALLBACK ====================

export interface PawaPayWebhookData {
  depositId?: string;
  payoutId?: string;
  refundId?: string;
  status: 'ACCEPTED' | 'SUBMITTED' | 'COMPLETED' | 'FAILED' | 'REJECTED' | 'CANCELLED';
  requestedAmount: string;
  depositedAmount?: string;
  currency: string;
  country: string;
  correspondent: string;
  payer?: {
    type: string;
    address: {
      value: string;
    };
  };
  recipient?: {
    type: string;
    address: {
      value: string;
    };
  };
  customerTimestamp: string;
  statementDescription: string;
  created: string;
  receivedByPawaPay?: string;
  correspondentIds?: {
    PROVIDER_TRANSACTION_ID?: string;
    FINANCIAL_TRANSACTION_ID?: string;
  };
  failureReason?: {
    failureCode: string;
    failureMessage: string;
  };
  metadata?: Record<string, any>;
}

// ==================== TRANSACTION STATUS ====================

export type TransactionStatus =
  | 'ACCEPTED'      // Initial state, transaction accepted
  | 'ENQUEUED'      // Queued for processing
  | 'SUBMITTED'     // Submitted to MNO
  | 'COMPLETED'     // Successfully completed
  | 'FAILED'        // Failed (will not be retried)
  | 'REJECTED'      // Rejected by MNO
  | 'CANCELLED';    // Cancelled

// ==================== ERROR TYPES ====================

export interface PawaPayError {
  errorCode: string;
  errorMessage: string;
  timestamp: string;
}

export interface PawaPayApiError extends Error {
  status?: number;
  code?: string;
  details?: any;
}

// ==================== PROVIDER CODES ====================

export const PAWAPAY_PROVIDERS = {
  // Zambia
  MTN_ZAMBIA: 'MTN_MOMO_ZMB',
  AIRTEL_ZAMBIA: 'AIRTEL_OAPI_ZMB',
  ZAMTEL_ZAMBIA: 'ZAMTEL_ZMB',

  // Uganda
  MTN_UGANDA: 'MTN_MOMO_UGA',
  AIRTEL_UGANDA: 'AIRTEL_OAPI_UGA',

  // Kenya
  MPESA_KENYA: 'MPESA_KEN',
  AIRTEL_KENYA: 'AIRTEL_OAPI_KEN',

  // Tanzania
  MPESA_TANZANIA: 'MPESA_TZA',
  AIRTEL_TANZANIA: 'AIRTEL_OAPI_TZA',
  TIGO_TANZANIA: 'TIGO_TZA',
  HALO_TANZANIA: 'HALOPESA_TZA',

  // Rwanda
  MTN_RWANDA: 'MTN_MOMO_RWA',
  AIRTEL_RWANDA: 'AIRTEL_OAPI_RWA',

  // Ghana
  MTN_GHANA: 'MTN_MOMO_GHA',
  AIRTEL_GHANA: 'AIRTEL_OAPI_GHA',
  VODAFONE_GHANA: 'VODAFONE_GHA',

  // Nigeria
  MTN_NIGERIA: 'MTN_MOMO_NGA',
  AIRTEL_NIGERIA: 'AIRTEL_OAPI_NGA',

  // Malawi
  AIRTEL_MALAWI: 'AIRTEL_OAPI_MWI',
  TNM_MALAWI: 'TNM_MWI',

  // Benin
  MTN_BENIN: 'MTN_MOMO_BEN',
  MOOV_BENIN: 'MOOV_BEN',

  // Cameroon
  MTN_CAMEROON: 'MTN_MOMO_CMR',
  ORANGE_CAMEROON: 'ORANGE_CMR',

  // DRC
  AIRTEL_DRC: 'AIRTEL_OAPI_COD',
  ORANGE_DRC: 'ORANGE_COD',
  VODACOM_DRC: 'VODACOM_COD',
} as const;

export type PawaPayProvider = typeof PAWAPAY_PROVIDERS[keyof typeof PAWAPAY_PROVIDERS];
