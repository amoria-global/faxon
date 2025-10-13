//src/types/escrow.types.ts

// --- Base Escrow Types ---
export type EscrowType = 'escrow_deposit' | 'escrow_withdrawal' | 'escrow_transfer' | 'p2p_escrow' | 'escrow_release' | 'escrow_refund';
export type EscrowStatus = 'pending' | 'funded' | 'released' | 'disputed' | 'resolved' | 'cancelled' | 'expired';
export type EscrowReleaseType = 'manual' | 'automatic' | 'conditional' | 'milestone';
export type WithdrawalMethod = 'bank_transfer' | 'mobile_money' | 'card' | 'wallet';

// --- Escrow Configuration ---
export interface EscrowConfig {
  baseUrl: string;
  apiKey: string;
  secretKey: string;
  merchantId: string;
  environment: 'sandbox' | 'production';
  timeout: number;
  retryAttempts: number;
  webhookSecret: string;
  callbackUrl: string;
  defaultCurrency: string;
  supportedCurrencies: string[];
}

export interface EscrowCredentials {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
}

// --- Escrow DTOs ---
export interface EscrowDepositDto {
  amount: number;
  currency: string;
  reference: string;
  description?: string;
  recipientId?: number;
  escrowTerms: EscrowTerms;
  releaseConditions?: ReleaseCondition[];
  disputeDeadline?: Date;
  autoReleaseDate?: Date;
}

export interface EscrowWithdrawalDto {
  escrowTransactionId: string;
  amount?: number; // If partial withdrawal
  withdrawalMethod: WithdrawalMethod;
  accountNumber?: string;
  bankCode?: string;
  accountName?: string;
  phoneNumber?: string;
  releaseReason?: string;
}

export interface EscrowTransferDto {
  sourceEscrowId: string;
  recipientId: number;
  amount: number;
  currency: string;
  reference: string;
  description?: string;
  transferType?: 'full' | 'partial';
  escrowTerms?: EscrowTerms;
}

export interface EscrowP2PDto {
  recipientId: number;
  amount: number;
  currency: string;
  reference: string;
  description?: string;
  escrowTerms: EscrowTerms;
  releaseConditions?: ReleaseCondition[];
  disputeDeadline?: Date;
  autoReleaseDate?: Date;
  notifyBySMS?: boolean;
}

// --- Escrow Terms and Conditions ---
export interface EscrowTerms {
  type: EscrowReleaseType;
  description: string;
  conditions: string[];
  milestones?: Milestone[];
  autoRelease?: {
    enabled: boolean;
    date?: Date;
    conditions?: string[];
  };
  disputeSettings?: {
    allowDisputes: boolean;
    deadline?: Date;
    arbitrationRequired?: boolean;
  };
}

export interface ReleaseCondition {
  id: string;
  description: string;
  type: 'manual_approval' | 'document_upload' | 'milestone_completion' | 'time_based';
  required: boolean;
  completedAt?: Date;
  completedBy?: number;
  evidence?: string[];
}

export interface Milestone {
  id: string;
  title: string;
  description: string;
  amount: number;
  percentage: number;
  dueDate?: Date;
  status: 'pending' | 'completed' | 'failed';
  completedAt?: Date;
  completedBy?: number;
  evidence?: string[];
}

// --- Core Escrow Transaction Model ---
export interface EscrowTransaction {
  id: string;
  userId: number;
  recipientId?: number;
  type: EscrowType;
  amount: number;
  currency: string;
  status: EscrowStatus;
  reference: string;
  description?: string;
  
  // Escrow-specific fields
  escrowId?: string;
  externalId?: string;
  paymentUrl?: string;
  escrowTerms?: EscrowTerms;
  releaseConditions?: ReleaseCondition[];
  disputeDeadline?: string | any;
  sourceEscrowId?: string;
  isP2P: boolean;
  
  // Status tracking
  fundedAt?: string;
  releasedAt?: string | any;
  releasedBy?: number;
  releaseReason?: string;
  disputedAt?: string | any;
  disputedBy?: number;
  disputeReason?: string;
  resolvedAt?: string;
  cancelledAt?: string;
  cancellationReason?: string;
  
  // Timestamps
  createdAt: string;
  updatedAt: string;
  
  // Relations
  user?: {
    id: number;
    email: string;
    firstName: string;
    lastName: string;
  };
  recipient?: {
    id: number;
    email: string;
    firstName: string;
    lastName: string;
  };
}

// --- Escrow API Types ---
export interface EscrowApiResponse {
  success: boolean;
  escrow_id: string;
  transaction_id: string;
  status: string;
  payment_url?: string;
  message?: string;
  data?: Record<string, any>;
}

export interface EscrowWebhookData {
  event_type: 'escrow_created' | 'escrow_funded' | 'escrow_released' | 'escrow_disputed' | 'escrow_resolved' | 'escrow_cancelled' | 'escrow_expired';
  escrow_id: string;
  transaction_id: string;
  status: string;
  timestamp: string;
  data?: {
    amount?: string;
    currency?: string;
    released_by?: string;
    disputed_by?: string;
    dispute_reason?: string;
    resolution_reason?: string;
    cancellation_reason?: string;
  };
  signature: string;
}

// --- Escrow Validation Types ---
export interface EscrowValidationResponse {
  isValid: boolean;
  errors?: string[];
  warnings?: string[];
}

// --- Escrow Statistics and Analytics ---
export interface EscrowAnalytics {
  userId: number;
  period: {
    start: string;
    end: string;
  };
  summary: {
    totalEscrowVolume: number;
    totalEscrowCount: number;
    totalReleased: number;
    totalDisputed: number;
    totalCancelled: number;
    averageEscrowAmount: number;
    averageResolutionTime: number; // in hours
  };
  breakdown: {
    byStatus: Record<EscrowStatus, number>;
    byType: Record<EscrowType, number>;
    byCurrency: Record<string, number>;
  };
  trends: {
    monthly: Array<{
      month: string;
      volume: number;
      count: number;
      disputeRate: number;
    }>;
  };
}

// --- Escrow Dispute Management ---
export interface EscrowDispute {
  id: string;
  escrowTransactionId: string;
  disputedBy: number;
  disputeReason: string;
  disputeDate: string;
  status: 'open' | 'under_review' | 'resolved' | 'escalated';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  evidence: DisputeEvidence[];
  resolution?: {
    decision: 'release_to_recipient' | 'refund_to_payer' | 'partial_split' | 'custom';
    reason: string;
    resolvedBy: number;
    resolvedAt: string;
    splitPercentage?: {
      payer: number;
      recipient: number;
    };
  };
  createdAt: string;
  updatedAt: string;
}

export interface DisputeEvidence {
  id: string;
  type: 'document' | 'image' | 'video' | 'message' | 'transaction_proof';
  title: string;
  description?: string;
  fileUrl?: string;
  uploadedBy: number;
  uploadedAt: string;
}

export interface CreateDisputeDto {
  escrowTransactionId: string;
  reason: string;
  evidence?: Array<{
    type: DisputeEvidence['type'];
    title: string;
    description?: string;
    fileUrl?: string;
  }>;
}

// --- Escrow Templates ---
export interface EscrowTemplate {
  id: string;
  userId: number;
  name: string;
  description?: string;
  type: EscrowType;
  defaultTerms: EscrowTerms;
  isPublic: boolean;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEscrowTemplateDto {
  name: string;
  description?: string;
  type: EscrowType;
  defaultTerms: EscrowTerms;
  isPublic?: boolean;
}

// --- Bulk Escrow Operations ---
export interface BulkEscrowRequest {
  templateId?: string;
  transactions: Array<{
    recipientId: number;
    amount: number;
    currency: string;
    reference: string;
    description?: string;
    customTerms?: Partial<EscrowTerms>;
  }>;
  commonTerms?: EscrowTerms;
  scheduleDate?: string;
}

export interface BulkEscrowResponse {
  batchId: string;
  totalTransactions: number;
  successCount: number;
  failureCount: number;
  status: 'processing' | 'completed' | 'partial' | 'failed';
  results: Array<{
    reference: string;
    status: EscrowStatus;
    escrowTransactionId?: string;
    error?: string;
  }>;
  createdAt: string;
  completedAt?: string;
}

// --- Escrow Notifications ---
export interface EscrowNotification {
  id: string;
  userId: number;
  escrowTransactionId: string;
  type: 'escrow_created' | 'escrow_funded' | 'release_requested' | 'dispute_created' | 'escrow_released' | 'escrow_cancelled';
  title: string;
  message: string;
  data?: Record<string, any>;
  channels: Array<'email' | 'sms' | 'push' | 'in_app'>;
  isRead: boolean;
  sentAt?: string;
  createdAt: string;
}

// --- Smart Contract Integration (for blockchain-based escrow) ---
export interface SmartContractEscrow {
  id: string;
  escrowTransactionId: string;
  contractAddress: string;
  blockchain: 'ethereum' | 'polygon' | 'binance' | 'solana';
  transactionHash?: string;
  gasUsed?: number;
  status: 'deployed' | 'funded' | 'released' | 'disputed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
}

// --- Escrow Fee Structure ---
export interface EscrowFeeStructure {
  id: string;
  type: EscrowType;
  currency: string;
  feeType: 'percentage' | 'fixed' | 'tiered';
  
  // Percentage fees
  percentage?: number;
  minFee?: number;
  maxFee?: number;
  
  // Fixed fees
  fixedAmount?: number;
  
  // Tiered fees
  tiers?: Array<{
    minAmount: number;
    maxAmount: number;
    percentage?: number;
    fixedAmount?: number;
  }>;
  
  // Additional fees
  disputeFee?: number;
  expeditedReleaseFee?: number;
  cancellationFee?: number;
  
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// --- Escrow Integration with existing Payment Types ---
export interface EnhancedPaymentTransaction {
  // All existing PaymentTransaction fields
  id: string;
  userId: number;
  type: string; // Now includes escrow types
  method: string;
  amount: number;
  currency: string;
  status: string;
  reference: string;
  // ... other existing fields
  
  // New escrow-specific fields
  escrowTransactionId?: string;
  isEscrowBased?: boolean;
  escrowStatus?: EscrowStatus;
}

// --- Response Types ---
export interface EscrowSuccessResponse<T = any> {
  success: true;
  data: T;
  message?: string;
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

export type EscrowResponse<T = any> = EscrowSuccessResponse<T> | EscrowErrorResponse;

// --- Escrow Limits and Restrictions ---
export interface EscrowLimits {
  userId: number;
  limits: {
    daily: {
      maxAmount: number;
      maxTransactions: number;
    };
    monthly: {
      maxAmount: number;
      maxTransactions: number;
    };
    perTransaction: {
      minAmount: number;
      maxAmount: number;
    };
    holdingPeriod: {
      minDays: number;
      maxDays: number;
    };
  };
  usedLimits: {
    daily: {
      amount: number;
      transactions: number;
      date: string;
    };
    monthly: {
      amount: number;
      transactions: number;
      month: string;
    };
  };
  currency: string;
  updatedAt: string;
}

// --- Escrow KYC Requirements ---
export interface EscrowKYCRequirements {
  userId: number;
  level: 'basic' | 'intermediate' | 'advanced' | 'enterprise';
  requiresKYC: boolean;
  requiredDocuments: string[];
  verificationStatus: 'pending' | 'verified' | 'rejected';
  limits: {
    withoutKYC: {
      maxAmount: number;
      maxTransactions: number;
    };
    withKYC: {
      maxAmount: number;
      maxTransactions: number;
    };
  };
  updatedAt: string;
}