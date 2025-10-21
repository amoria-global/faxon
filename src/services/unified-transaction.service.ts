// services/unified-transaction.service.ts - Unified transaction service using new Transaction model

import { PrismaClient, Transaction, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

export interface UnifiedTransactionFilters {
  userId?: number;
  recipientId?: number;
  provider?: 'PAWAPAY' | 'XENTRIPAY' | 'PROPERTY';
  transactionType?: 'DEPOSIT' | 'PAYOUT' | 'REFUND' | 'TRANSFER' | 'COMMISSION' | 'FEE';
  paymentMethod?: string; // Filter by payment method (mobile_money, card, cash_at_property, etc.)
  status?: string;
  isRefund?: boolean;
  bookingId?: string;
  propertyId?: number;
  tourId?: string;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}

export interface TransactionStats {
  totalTransactions: number;
  byProvider: Record<string, number>;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  totalVolume: Record<string, number>; // By currency
  completedVolume: Record<string, number>;
  pendingVolume: Record<string, number>;
}

export class UnifiedTransactionService {
  /**
   * Helper: Add payment type classification to transaction
   * NOTE: Payment method 'cc' is used by provider but we save as 'card' in DB
   */
  private enrichTransactionWithPaymentType(transaction: any) {
    // Determine if this is a cash/property payment or direct online payment
    const isCashPayment = transaction.provider === 'PROPERTY' ||
                          transaction.paymentMethod === 'cash_at_property' ||
                          transaction.paymentMethod === 'cash';

    const paymentType = isCashPayment ? 'cash_at_property' : 'online';

    const paymentTypeLabel = isCashPayment
      ? 'Cash at Property'
      : transaction.paymentMethod === 'mobile_money'
        ? 'Mobile Money (Online)'
        : (transaction.paymentMethod === 'card' || transaction.paymentMethod === 'cc')
          ? 'Card Payment (Online)'
          : 'Online Payment';

    return {
      ...transaction,
      paymentType,
      paymentTypeLabel,
      isCashPayment,
      isOnlinePayment: !isCashPayment
    };
  }

  /**
   * Get all transactions with filters
   */
  async getAllTransactions(filters: UnifiedTransactionFilters = {}): Promise<any[]> {
    const limit = filters.limit || 100;
    const offset = filters.offset || 0;

    // Build where clause
    const where: Prisma.TransactionWhereInput = {};

    if (filters.userId) {
      where.userId = filters.userId;
    }

    if (filters.recipientId) {
      where.recipientId = filters.recipientId;
    }

    if (filters.provider) {
      where.provider = filters.provider;
    }

    if (filters.transactionType) {
      where.transactionType = filters.transactionType;
    }

    if (filters.paymentMethod) {
      where.paymentMethod = filters.paymentMethod;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.isRefund !== undefined) {
      where.isRefund = filters.isRefund;
    }

    if (filters.bookingId) {
      where.bookingId = filters.bookingId;
    }

    if (filters.propertyId) {
      where.propertyId = filters.propertyId;
    }

    if (filters.tourId) {
      where.tourId = filters.tourId;
    }

    if (filters.fromDate || filters.toDate) {
      where.createdAt = {};
      if (filters.fromDate) {
        where.createdAt.gte = filters.fromDate;
      }
      if (filters.toDate) {
        where.createdAt.lte = filters.toDate;
      }
    }

    const transactions = await prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true
          }
        },
        recipient: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true
          }
        }
      }
    });

    // Enrich each transaction with payment type classification
    return transactions.map(tx => this.enrichTransactionWithPaymentType(tx));
  }

  /**
   * Get transactions by user ID
   */
  async getTransactionsByUserId(
    userId: number,
    filters: Omit<UnifiedTransactionFilters, 'userId'> = {}
  ): Promise<Transaction[]> {
    return this.getAllTransactions({ ...filters, userId });
  }

  /**
   * Get transactions by recipient ID
   */
  async getTransactionsByRecipientId(
    recipientId: number,
    filters: Omit<UnifiedTransactionFilters, 'recipientId'> = {}
  ): Promise<Transaction[]> {
    return this.getAllTransactions({ ...filters, recipientId });
  }

  /**
   * Get single transaction by ID
   */
  async getTransactionById(id: string): Promise<any | null> {
    const transaction = await prisma.transaction.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true
          }
        },
        recipient: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true
          }
        }
      }
    });

    if (!transaction) {
      return null;
    }

    return this.enrichTransactionWithPaymentType(transaction);
  }

  /**
   * Get transaction by reference
   */
  async getTransactionByReference(reference: string): Promise<Transaction | null> {
    return prisma.transaction.findUnique({
      where: { reference },
      include: {
        user: true,
        recipient: true
      }
    });
  }

  /**
   * Get transaction by provider transaction ID
   */
  async getTransactionByProviderTransactionId(
    providerTransactionId: string
  ): Promise<Transaction | null> {
    return prisma.transaction.findFirst({
      where: { providerTransactionId },
      include: {
        user: true,
        recipient: true
      }
    });
  }

  /**
   * Get transaction by booking ID
   */
  async getTransactionsByBookingId(bookingId: string): Promise<Transaction[]> {
    return prisma.transaction.findMany({
      where: { bookingId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: true,
        recipient: true
      }
    });
  }

  /**
   * Get transaction statistics
   */
  async getTransactionStats(userId?: number): Promise<TransactionStats> {
    const filters: UnifiedTransactionFilters = { limit: 10000 };
    if (userId) {
      filters.userId = userId;
    }

    const transactions = await this.getAllTransactions(filters);

    const stats: TransactionStats = {
      totalTransactions: transactions.length,
      byProvider: {},
      byStatus: {},
      byType: {},
      totalVolume: {},
      completedVolume: {},
      pendingVolume: {}
    };

    for (const tx of transactions) {
      // Count by provider
      stats.byProvider[tx.provider] = (stats.byProvider[tx.provider] || 0) + 1;

      // Count by status
      stats.byStatus[tx.status] = (stats.byStatus[tx.status] || 0) + 1;

      // Count by type
      stats.byType[tx.transactionType] = (stats.byType[tx.transactionType] || 0) + 1;

      // Sum volume by currency
      const amount = tx.amount;
      stats.totalVolume[tx.currency] = (stats.totalVolume[tx.currency] || 0) + amount;

      // Completed volume
      if (tx.status === 'COMPLETED' || tx.status === 'HELD') {
        stats.completedVolume[tx.currency] = (stats.completedVolume[tx.currency] || 0) + amount;
      }

      // Pending volume
      if (tx.status === 'PENDING' || tx.status === 'PROCESSING') {
        stats.pendingVolume[tx.currency] = (stats.pendingVolume[tx.currency] || 0) + amount;
      }
    }

    return stats;
  }

  /**
   * Get recent transactions
   */
  async getRecentTransactions(limit: number = 10): Promise<Transaction[]> {
    return prisma.transaction.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        },
        recipient: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });
  }

  /**
   * Get pending transactions (for status polling)
   */
  async getPendingTransactions(): Promise<Transaction[]> {
    return prisma.transaction.findMany({
      where: {
        status: {
          in: ['PENDING', 'PROCESSING']
        }
      },
      orderBy: { createdAt: 'asc' }
    });
  }

  /**
   * Get transactions requiring status check
   */
  async getTransactionsNeedingStatusCheck(maxAge: number = 24): Promise<Transaction[]> {
    const maxAgeDate = new Date();
    maxAgeDate.setHours(maxAgeDate.getHours() - maxAge);

    return prisma.transaction.findMany({
      where: {
        status: {
          in: ['PENDING', 'PROCESSING', 'HELD']
        },
        OR: [
          { lastStatusCheck: null },
          { lastStatusCheck: { lt: maxAgeDate } }
        ]
      },
      orderBy: { createdAt: 'asc' }
    });
  }

  /**
   * Update transaction status
   */
  async updateTransactionStatus(
    id: string,
    status: string,
    additionalData?: Partial<Transaction>
  ): Promise<Transaction> {
    // Build update data carefully to avoid type issues with metadata
    const updateData: any = {
      status,
      updatedAt: new Date(),
      lastStatusCheck: new Date(),
      statusCheckCount: {
        increment: 1
      }
    };

    // Add additional data if provided, handling metadata specially
    if (additionalData) {
      const { metadata, ...rest } = additionalData;
      Object.assign(updateData, rest);

      // Only include metadata if it's not null
      if (metadata !== null && metadata !== undefined) {
        updateData.metadata = metadata;
      }
    }

    // Set completed timestamp if status is final
    if (['COMPLETED', 'FAILED', 'CANCELLED', 'REFUNDED'].includes(status) && !additionalData?.completedAt) {
      updateData.completedAt = new Date();
    }

    return prisma.transaction.update({
      where: { id },
      data: updateData
    });
  }

  /**
   * Create a new transaction
   */
  async createTransaction(data: Prisma.TransactionCreateInput): Promise<Transaction> {
    return prisma.transaction.create({
      data
    });
  }

  /**
   * Get transactions by provider
   */
  async getTransactionsByProvider(
    provider: 'PAWAPAY' | 'XENTRIPAY',
    filters: Omit<UnifiedTransactionFilters, 'provider'> = {}
  ): Promise<Transaction[]> {
    return this.getAllTransactions({ ...filters, provider });
  }

  /**
   * Search transactions by phone number
   */
  async searchByPhoneNumber(phoneNumber: string): Promise<Transaction[]> {
    return prisma.transaction.findMany({
      where: {
        OR: [
          { payerPhone: { contains: phoneNumber } },
          { recipientPhone: { contains: phoneNumber } }
        ]
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
  }

  /**
   * Get failed transactions
   */
  async getFailedTransactions(limit: number = 100): Promise<Transaction[]> {
    return prisma.transaction.findMany({
      where: {
        status: 'FAILED'
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: true,
        recipient: true
      }
    });
  }

  /**
   * Get refund transactions
   */
  async getRefundTransactions(originalTransactionId?: string): Promise<Transaction[]> {
    const where: Prisma.TransactionWhereInput = {
      isRefund: true
    };

    if (originalTransactionId) {
      where.relatedTransactionId = originalTransactionId;
    }

    return prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: true,
        recipient: true
      }
    });
  }
}

export const unifiedTransactionService = new UnifiedTransactionService();
