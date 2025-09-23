// Enhanced Property Types with Transaction Monitoring Support

// === ENHANCED AGENT DASHBOARD TYPES ===
export interface AgentDashboard {
  totalClients: number;
  activeClients: number;
  totalCommissions: number;
  pendingCommissions: number;
  failedCommissions?: number;
  paidCommissions?: number;
  escrowHeldAmount?: number;
  avgCommissionPerBooking: number;
  recentBookings: AgentBookingInfo[];
  monthlyCommissions: MonthlyCommissionData[];
  transactionBreakdown?: TransactionBreakdown;
}

export interface TransactionBreakdown {
  escrowTransactions: EscrowTransactionInfo[];
  paymentTransactions: PaymentTransactionInfo[];
  summary: TransactionSummary;
}

export interface TransactionSummary {
  totalCommissions: number;
  pendingCommissions: number;
  failedCommissions: number;
  paidCommissions: number;
  escrowHeldAmount: number;
  avgCommissionPerBooking: number;
  escrowTransactionCount: number;
  paymentTransactionCount: number;
  totalTransactionAmount: number;
}

// === TRANSACTION TYPES ===
export interface EscrowTransactionInfo {
  id: string;
  userId: number;
  recipientId?: number;
  type: 'DEPOSIT' | 'RELEASE' | 'WITHDRAWAL' | 'REFUND';
  amount: number;
  currency: string;
  status: 'PENDING' | 'HELD' | 'READY' | 'RELEASED' | 'REFUNDED' | 'FAILED' | 'CANCELLED';
  reference: string;
  description?: string;
  escrowId?: string;
  externalId?: string;
  pesapalOrderId?: string;
  pesapalTrackingId?: string;
  paymentUrl?: string;
  isP2P: boolean;
  sourceEscrowId?: string;
  transferType?: 'full' | 'partial';
  notifyBySMS: boolean;
  fundedAt?: string;
  releasedAt?: string;
  releasedBy?: number;
  releaseReason?: string;
  disputedAt?: string;
  disputedBy?: number;
  disputeReason?: string;
  resolvedAt?: string;
  resolvedBy?: number;
  resolutionReason?: string;
  cancelledAt?: string;
  cancellationReason?: string;
  refundedAt?: string;
  metadata?: any;
  createdAt: string;
  updatedAt: string;
  user?: {
    firstName: string;
    lastName: string;
  };
  recipient?: {
    firstName: string;
    lastName: string;
  };
}

export interface PaymentTransactionInfo {
  id: string;
  userId: number;
  type: string;
  method: string;
  amount: number;
  currency: string;
  status: 'pending' | 'processing' | 'completed' | 'success' | 'failed' | 'cancelled';
  reference: string;
  externalId?: string;
  jengaTransactionId?: string;
  description?: string;
  metadata?: any;
  charges?: number;
  netAmount?: number;
  sourceAccount?: string;
  destinationAccount?: string;
  phoneNumber?: string;
  bankCode?: string;
  accountName?: string;
  escrowTransactionId?: string;
  isEscrowBased: boolean;
  escrowStatus?: string;
  failureReason?: string;
  callbackUrl?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  user?: {
    firstName: string;
    lastName: string;
  };
}

export interface WithdrawalRequestInfo {
  id: string;
  userId: number;
  amount: number;
  currency: string;
  method: 'MOBILE' | 'BANK';
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  destination: any; // JSON with destination details
  pesapalPayoutId?: string;
  reference: string;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

// === ENHANCED MONTHLY COMMISSION DATA ===
export interface MonthlyCommissionData {
  month: string;
  commission: number;
  bookings: number;
  escrowAmount?: number;
  paymentAmount?: number;
  pendingAmount?: number;
  paidAmount?: number;
  failedAmount?: number;
}

// === ENHANCED AGENT BOOKING INFO ===
export interface AgentBookingInfo {
  id: string;
  clientName: string;
  bookingType: 'property' | 'tour';
  commission: number;
  commissionStatus: 'pending' | 'earned' | 'paid';
  bookingDate: string;
  createdAt: string;
  transactionData?: BookingTransactionData;
}

export interface BookingTransactionData {
  escrowTransaction?: EscrowTransactionInfo;
  paymentTransaction?: PaymentTransactionInfo;
  hasActiveTransaction: boolean;
  transactionStatus: string;
}

// === ENHANCED EARNINGS TYPES ===
export interface EnhancedAgentEarnings {
  totalEarnings: number;
  totalBookings: number;
  periodEarnings: number;
  periodBookings: number;
  transactionBreakdown: {
    escrow: EscrowBreakdown;
    payments: PaymentBreakdown;
    withdrawals: WithdrawalRequestInfo[];
  };
  status: {
    pending: number;
    held: number;
    paid: number;
    failed: number;
  };
  timeRange: 'week' | 'month' | 'quarter' | 'year';
}

export interface EscrowBreakdown {
  total: number;
  pending: number;
  held: number;
  released: number;
  failed: number;
  totalAmount: number;
  transactions: EscrowTransactionInfo[];
}

export interface PaymentBreakdown {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  totalAmount: number;
  transactions: PaymentTransactionInfo[];
}

// === TRANSACTION MONITORING DASHBOARD ===
export interface TransactionMonitoringDashboard {
  overview: {
    escrow: EscrowOverview;
    payments: PaymentOverview;
  };
  recentActivity: TransactionActivity[];
  pendingActions: {
    withdrawals: WithdrawalRequestInfo[];
    failedTransactions: (EscrowTransactionInfo | PaymentTransactionInfo)[];
  };
  alerts: TransactionAlert[];
}

export interface EscrowOverview {
  [status: string]: {
    count: number;
    amount: number;
  };
}

export interface PaymentOverview {
  [status: string]: {
    count: number;
    amount: number;
  };
}

export interface TransactionActivity {
  id: string;
  source: 'escrow' | 'payment';
  type?: string;
  amount: number;
  currency: string;
  status: string;
  description?: string;
  createdAt: string;
  user?: {
    firstName: string;
    lastName: string;
  };
  recipient?: {
    firstName: string;
    lastName: string;
  };
}

export interface TransactionAlert {
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  action?: string;
}

// === WALLET TYPES ===
export interface WalletInfo {
  id: string;
  userId: number;
  balance: number;
  currency: string;
  accountNumber?: string;
  isActive: boolean;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
  transactions?: WalletTransactionInfo[];
}

export interface WalletTransactionInfo {
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

// === COMMISSION STATE TYPES ===
export interface CommissionStates {
  pending: number;
  held: number;
  ready: number;
  paid: number;
  failed: number;
  refunded?: number;
  processing?: number;
  completed?: number;
}

// === ENHANCED DASHBOARD WIDGET TYPES ===
export interface TransactionWidget {
  id: string;
  title: string;
  type: 'transaction_chart' | 'commission_breakdown' | 'escrow_status' | 'payment_status';
  data: {
    escrowTransactions?: EscrowTransactionInfo[];
    paymentTransactions?: PaymentTransactionInfo[];
    commissionSummary?: TransactionSummary;
    timeRange?: string;
  };
  config: {
    refreshInterval?: number;
    chartType?: 'line' | 'bar' | 'pie' | 'donut';
    showBreakdown?: boolean;
    showStatus?: boolean;
  };
}

// === PESAPAL INTEGRATION TYPES ===
export interface PesapalTransaction {
  orderId: string;
  trackingId: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'INVALID';
  amount: number;
  currency: string;
  description: string;
  callback_url?: string;
  notification_id?: string;
  payment_method?: string;
  payment_account?: string;
  confirmation_code?: string;
  payment_status_description?: string;
  created_date: string;
  confirmation_date?: string;
}

export interface PesapalEscrowRequest {
  amount: number;
  currency: string;
  description: string;
  callback_url: string;
  notification_id?: string;
  billing_address?: {
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

export interface PesapalWithdrawalRequest {
  amount: number;
  currency: string;
  account_number: string;
  account_name: string;
  bank_code?: string;
  mobile_provider?: string;
  description?: string;
}

// === ADVANCED TRANSACTION FILTERS ===
export interface TransactionFilters {
  status?: string[];
  type?: string[];
  amount?: {
    min?: number;
    max?: number;
  };
  dateRange?: {
    start: string;
    end: string;
  };
  currency?: string;
  source?: 'escrow' | 'payment' | 'all';
  userId?: number;
  recipientId?: number;
}

// === TRANSACTION ANALYTICS ===
export interface TransactionAnalytics {
  totalVolume: number;
  totalCount: number;
  averageAmount: number;
  successRate: number;
  failureRate: number;
  processingTime: {
    average: number;
    median: number;
  };
  trendsOverTime: {
    date: string;
    volume: number;
    count: number;
    successRate: number;
  }[];
  statusDistribution: {
    status: string;
    count: number;
    percentage: number;
  }[];
  methodDistribution?: {
    method: string;
    count: number;
    percentage: number;
  }[];
}

// === REAL-TIME UPDATES ===
export interface TransactionUpdate {
  transactionId: string;
  type: 'escrow' | 'payment';
  previousStatus: string;
  newStatus: string;
  amount: number;
  currency: string;
  timestamp: string;
  metadata?: any;
}

export interface EscrowNotificationInfo {
  id: string;
  userId: number;
  escrowTransactionId?: string;
  type: string;
  title: string;
  message: string;
  data?: any;
  channels: string[];
  isRead: boolean;
  readAt?: string;
  sentAt?: string;
  emailSent: boolean;
  smsSent: boolean;
  pushSent: boolean;
  createdAt: string;
  updatedAt: string;
}

// === API RESPONSE TYPES ===
export interface TransactionApiResponse<T> {
  success: boolean;
  message: string;
  data?: T;
  errors?: string[];
  metadata?: {
    totalCount?: number;
    pageCount?: number;
    currentPage?: number;
    hasNext?: boolean;
    hasPrevious?: boolean;
  };
}

export interface PaginatedTransactionResponse<T> {
  success: boolean;
  message: string;
  data: {
    transactions: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}

// === BULK TRANSACTION OPERATIONS ===
export interface BulkTransactionOperation {
  transactionIds: string[];
  operation: 'release' | 'cancel' | 'dispute' | 'retry';
  reason?: string;
  metadata?: any;
}

export interface BulkTransactionResult {
  total: number;
  successful: number;
  failed: number;
  results: {
    transactionId: string;
    success: boolean;
    result?: any;
    error?: string;
  }[];
  summary: string;
}

// === DASHBOARD CONFIGURATION ===
export interface AgentDashboardConfig {
  refreshInterval: number;
  autoRefresh: boolean;
  widgets: {
    showTransactionBreakdown: boolean;
    showEscrowStatus: boolean;
    showPaymentStatus: boolean;
    showRecentActivity: boolean;
    showCommissionTrends: boolean;
    showWithdrawalRequests: boolean;
  };
  notifications: {
    enabled: boolean;
    channels: ('email' | 'sms' | 'push' | 'in_app')[];
    frequency: 'immediate' | 'hourly' | 'daily';
  };
}

// === EXPORT/IMPORT TYPES ===
export interface TransactionExportRequest {
  format: 'csv' | 'xlsx' | 'pdf';
  filters: TransactionFilters;
  columns: string[];
  includeMetadata: boolean;
}

export interface TransactionExportResult {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  downloadUrl?: string;
  expiresAt?: string;
  error?: string;
  createdAt: string;
}