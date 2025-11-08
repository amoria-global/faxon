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
   * Get all transactions with filters - searches ONLY the unified Transaction table
   * For comprehensive search across all tables, use getAllTransactionsComprehensive()
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
    return transactions.map(tx => ({
      ...this.enrichTransactionWithPaymentType(tx),
      sourceTable: 'transactions'
    }));
  }

  /**
   * Get all transactions from ALL tables for a specific user
   * This searches across: transactions, wallet_transactions, payment_transactions,
   * owner_payments, host_payments, tour_earnings, owner_earnings, property_address_unlocks
   */
  async getAllTransactionsComprehensive(userId: number, filters: Omit<UnifiedTransactionFilters, 'userId'> = {}): Promise<any[]> {
    const allTransactions: any[] = [];

    const limit = filters.limit || 100;
    const dateFilter = filters.fromDate || filters.toDate ? {
      createdAt: {
        ...(filters.fromDate && { gte: filters.fromDate }),
        ...(filters.toDate && { lte: filters.toDate })
      }
    } : {};

    // 1. Get from unified Transaction table
    const transactions = await prisma.transaction.findMany({
      where: {
        OR: [
          { userId },
          { recipientId: userId }
        ],
        ...dateFilter,
        ...(filters.status && { status: filters.status }),
        ...(filters.transactionType && { transactionType: filters.transactionType })
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
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

    allTransactions.push(...transactions.map(tx => ({
      ...this.enrichTransactionWithPaymentType(tx),
      sourceTable: 'transactions'
    })));

    // 2. Get from WalletTransaction table
    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (wallet) {
      const walletTxs = await prisma.walletTransaction.findMany({
        where: {
          walletId: wallet.id,
          ...dateFilter
        },
        orderBy: { createdAt: 'desc' },
        take: limit
      });

      allTransactions.push(...walletTxs.map(tx => ({
        id: tx.id,
        reference: tx.reference,
        type: tx.type,
        amount: tx.amount,
        description: tx.description,
        createdAt: tx.createdAt,
        userId,
        sourceTable: 'wallet_transactions',
        balanceBefore: tx.balanceBefore,
        balanceAfter: tx.balanceAfter
      })));
    }

    // 3. Get from PaymentTransaction table
    const paymentTxs = await prisma.paymentTransaction.findMany({
      where: {
        userId,
        ...dateFilter,
        ...(filters.status && { status: filters.status })
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    allTransactions.push(...paymentTxs.map(tx => ({
      id: tx.id,
      reference: tx.reference,
      type: tx.type,
      method: tx.method,
      amount: tx.amount,
      currency: tx.currency,
      status: tx.status,
      description: tx.description,
      createdAt: tx.createdAt,
      completedAt: tx.completedAt,
      userId,
      sourceTable: 'payment_transactions'
    })));

    // 4. Get from OwnerPayment table
    const ownerPayments = await prisma.ownerPayment.findMany({
      where: {
        ownerId: userId,
        ...dateFilter,
        ...(filters.status && { status: filters.status })
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        property: {
          select: { id: true, name: true, location: true }
        },
        booking: {
          select: { id: true, checkIn: true, checkOut: true }
        }
      }
    });

    allTransactions.push(...ownerPayments.map(tx => ({
      id: tx.id,
      reference: tx.transactionId || tx.id,
      type: 'OWNER_PAYMENT',
      amount: tx.amount,
      netAmount: tx.netAmount,
      platformFee: tx.platformFee,
      currency: tx.currency,
      status: tx.status,
      bookingId: tx.bookingId,
      propertyId: tx.propertyId,
      createdAt: tx.createdAt,
      paidAt: tx.paidAt,
      userId,
      property: tx.property,
      booking: tx.booking,
      sourceTable: 'owner_payments'
    })));

    // 5. Get from HostPayment table (legacy)
    const hostPayments = await prisma.hostPayment.findMany({
      where: {
        hostId: userId,
        ...dateFilter,
        ...(filters.status && { status: filters.status })
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        booking: {
          select: { id: true, checkIn: true, checkOut: true }
        }
      }
    });

    allTransactions.push(...hostPayments.map(tx => ({
      id: tx.id,
      reference: tx.transactionId || tx.id,
      type: 'HOST_PAYMENT',
      amount: tx.amount,
      netAmount: tx.netAmount,
      platformFee: tx.platformFee,
      currency: tx.currency,
      status: tx.status,
      bookingId: tx.bookingId,
      createdAt: tx.createdAt,
      paidAt: tx.paidAt,
      userId,
      booking: tx.booking,
      sourceTable: 'host_payments'
    })));

    // 6. Get from TourEarnings table
    const tourEarnings = await prisma.tourEarnings.findMany({
      where: {
        tourGuideId: userId,
        ...dateFilter,
        ...(filters.status && { status: filters.status })
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        tour: {
          select: { id: true, title: true, category: true }
        }
      }
    });

    allTransactions.push(...tourEarnings.map(tx => ({
      id: tx.id,
      reference: tx.transactionId || tx.id,
      type: 'TOUR_EARNING',
      amount: tx.amount,
      netAmount: tx.netAmount,
      commission: tx.commission,
      currency: tx.currency,
      status: tx.status,
      bookingId: tx.bookingId,
      tourId: tx.tourId,
      createdAt: tx.createdAt,
      userId,
      tour: tx.tour,
      sourceTable: 'tour_earnings'
    })));

    // 7. Get from OwnerEarning table
    const ownerEarnings = await prisma.ownerEarning.findMany({
      where: {
        ownerId: userId,
        ...dateFilter,
        ...(filters.status && { status: filters.status })
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        property: {
          select: { id: true, name: true, location: true }
        },
        booking: {
          select: { id: true, checkIn: true, checkOut: true }
        }
      }
    });

    allTransactions.push(...ownerEarnings.map(tx => ({
      id: tx.id,
      reference: tx.id,
      type: 'OWNER_EARNING',
      grossAmount: tx.grossAmount,
      ownerEarning: tx.ownerEarning,
      platformFee: tx.platformFee,
      currency: tx.currency,
      status: tx.status,
      bookingId: tx.bookingId,
      propertyId: tx.propertyId,
      createdAt: tx.createdAt,
      userId,
      property: tx.property,
      booking: tx.booking,
      sourceTable: 'owner_earnings'
    })));

    // 8. Get from PropertyAddressUnlock table
    const addressUnlocks = await prisma.propertyAddressUnlock.findMany({
      where: {
        userId,
        ...dateFilter,
        ...(filters.status && { paymentStatus: filters.status })
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        property: {
          select: { id: true, name: true, location: true }
        }
      }
    });

    allTransactions.push(...addressUnlocks.map(tx => ({
      id: tx.unlockId,
      reference: tx.transactionReference || tx.unlockId,
      type: 'ADDRESS_UNLOCK',
      amount: parseFloat(tx.paymentAmountRwf.toString()),
      amountUsd: tx.paymentAmountUsd ? parseFloat(tx.paymentAmountUsd.toString()) : undefined,
      currency: 'RWF',
      status: tx.paymentStatus,
      paymentMethod: tx.paymentMethod,
      propertyId: tx.propertyId,
      createdAt: tx.createdAt,
      unlockedAt: tx.unlockedAt,
      userId,
      property: tx.property,
      sourceTable: 'property_address_unlocks'
    })));

    // Sort all transactions by date (most recent first) and apply limit
    const sorted = allTransactions.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return dateB - dateA;
    });

    // Apply offset and limit to final results
    const offset = filters.offset || 0;
    return sorted.slice(offset, offset + limit);
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
   * Get single transaction by ID - searches across ALL transaction tables
   * @param id - Transaction ID, reference, or identifier
   * @param userId - Optional user ID to verify access rights
   */
  async getTransactionById(id: string, userId?: number): Promise<any | null> {
    // 1. Try unified Transaction table first (by ID or reference)
    let transaction = await prisma.transaction.findFirst({
      where: {
        OR: [
          { id },
          { reference: id },
          { externalId: id },
          { providerTransactionId: id }
        ]
      },
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

    if (transaction) {
      return {
        ...this.enrichTransactionWithPaymentType(transaction),
        sourceTable: 'transactions',
        transactionId: transaction.id
      };
    }

    // 2. Try WalletTransaction table
    const walletTx = await prisma.walletTransaction.findFirst({
      where: {
        OR: [
          { id },
          { reference: id },
          { transactionId: id }
        ]
      },
      include: {
        wallet: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                phone: true
              }
            }
          }
        }
      }
    });

    if (walletTx) {
      return {
        id: walletTx.id,
        reference: walletTx.reference,
        type: walletTx.type,
        amount: walletTx.amount,
        balanceBefore: walletTx.balanceBefore,
        balanceAfter: walletTx.balanceAfter,
        description: walletTx.description,
        createdAt: walletTx.createdAt,
        user: walletTx.wallet.user,
        userId: walletTx.wallet.userId,
        sourceTable: 'wallet_transactions',
        transactionId: walletTx.id
      };
    }

    // 3. Try PaymentTransaction table
    const paymentTx = await prisma.paymentTransaction.findFirst({
      where: {
        OR: [
          { id },
          { reference: id },
          { externalId: id }
        ]
      },
      include: {
        user: {
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

    if (paymentTx) {
      return {
        id: paymentTx.id,
        reference: paymentTx.reference,
        type: paymentTx.type,
        method: paymentTx.method,
        amount: paymentTx.amount,
        currency: paymentTx.currency,
        status: paymentTx.status,
        description: paymentTx.description,
        phoneNumber: paymentTx.phoneNumber,
        createdAt: paymentTx.createdAt,
        completedAt: paymentTx.completedAt,
        user: paymentTx.user,
        userId: paymentTx.userId,
        sourceTable: 'payment_transactions',
        transactionId: paymentTx.id
      };
    }

    // 4. Try OwnerPayment table
    const ownerPayment = await prisma.ownerPayment.findFirst({
      where: {
        OR: [
          { id },
          { transactionId: id },
          { bookingId: id }
        ]
      },
      include: {
        owner: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true
          }
        },
        property: {
          select: {
            id: true,
            name: true,
            location: true
          }
        },
        booking: {
          select: {
            id: true,
            checkIn: true,
            checkOut: true,
            totalPrice: true
          }
        }
      }
    });

    if (ownerPayment) {
      return {
        id: ownerPayment.id,
        reference: ownerPayment.transactionId || ownerPayment.id,
        type: 'OWNER_PAYMENT',
        amount: ownerPayment.amount,
        netAmount: ownerPayment.netAmount,
        platformFee: ownerPayment.platformFee,
        currency: ownerPayment.currency,
        status: ownerPayment.status,
        bookingId: ownerPayment.bookingId,
        propertyId: ownerPayment.propertyId,
        createdAt: ownerPayment.createdAt,
        paidAt: ownerPayment.paidAt,
        user: ownerPayment.owner,
        userId: ownerPayment.ownerId,
        property: ownerPayment.property,
        booking: ownerPayment.booking,
        sourceTable: 'owner_payments',
        transactionId: ownerPayment.id
      };
    }

    // 5. Try HostPayment table (legacy)
    const hostPayment = await prisma.hostPayment.findFirst({
      where: {
        OR: [
          { id },
          { transactionId: id },
          { bookingId: id }
        ]
      },
      include: {
        host: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true
          }
        },
        booking: {
          select: {
            id: true,
            checkIn: true,
            checkOut: true,
            totalPrice: true
          }
        }
      }
    });

    if (hostPayment) {
      return {
        id: hostPayment.id,
        reference: hostPayment.transactionId || hostPayment.id,
        type: 'HOST_PAYMENT',
        amount: hostPayment.amount,
        netAmount: hostPayment.netAmount,
        platformFee: hostPayment.platformFee,
        currency: hostPayment.currency,
        status: hostPayment.status,
        bookingId: hostPayment.bookingId,
        createdAt: hostPayment.createdAt,
        paidAt: hostPayment.paidAt,
        user: hostPayment.host,
        userId: hostPayment.hostId,
        booking: hostPayment.booking,
        sourceTable: 'host_payments',
        transactionId: hostPayment.id
      };
    }

    // 6. Try TourEarnings table
    const tourEarning = await prisma.tourEarnings.findFirst({
      where: {
        OR: [
          { id },
          { transactionId: id },
          { bookingId: id }
        ]
      },
      include: {
        tourGuide: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true
          }
        },
        tour: {
          select: {
            id: true,
            title: true,
            category: true
          }
        },
        booking: {
          select: {
            id: true,
            totalAmount: true,
            status: true
          }
        }
      }
    });

    if (tourEarning) {
      return {
        id: tourEarning.id,
        reference: tourEarning.transactionId || tourEarning.id,
        type: 'TOUR_EARNING',
        amount: tourEarning.amount,
        netAmount: tourEarning.netAmount,
        commission: tourEarning.commission,
        currency: tourEarning.currency,
        status: tourEarning.status,
        bookingId: tourEarning.bookingId,
        tourId: tourEarning.tourId,
        createdAt: tourEarning.createdAt,
        payoutDate: tourEarning.payoutDate,
        user: tourEarning.tourGuide,
        userId: tourEarning.tourGuideId,
        tour: tourEarning.tour,
        booking: tourEarning.booking,
        sourceTable: 'tour_earnings',
        transactionId: tourEarning.id
      };
    }

    // 7. Try OwnerEarning table
    const ownerEarning = await prisma.ownerEarning.findFirst({
      where: {
        OR: [
          { id },
          { bookingId: id }
        ]
      },
      include: {
        owner: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true
          }
        },
        property: {
          select: {
            id: true,
            name: true,
            location: true
          }
        },
        booking: {
          select: {
            id: true,
            checkIn: true,
            checkOut: true,
            totalPrice: true
          }
        }
      }
    });

    if (ownerEarning) {
      return {
        id: ownerEarning.id,
        reference: ownerEarning.id,
        type: 'OWNER_EARNING',
        grossAmount: ownerEarning.grossAmount,
        ownerEarning: ownerEarning.ownerEarning,
        platformFee: ownerEarning.platformFee,
        currency: ownerEarning.currency,
        status: ownerEarning.status,
        bookingId: ownerEarning.bookingId,
        propertyId: ownerEarning.propertyId,
        createdAt: ownerEarning.createdAt,
        earnedAt: ownerEarning.earnedAt,
        user: ownerEarning.owner,
        userId: ownerEarning.ownerId,
        property: ownerEarning.property,
        booking: ownerEarning.booking,
        sourceTable: 'owner_earnings',
        transactionId: ownerEarning.id
      };
    }

    // 8. Try PropertyAddressUnlock table
    const addressUnlock = await prisma.propertyAddressUnlock.findFirst({
      where: {
        OR: [
          { id: isNaN(parseInt(id)) ? -1 : parseInt(id) },
          { unlockId: id },
          { transactionReference: id }
        ]
      },
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
        property: {
          select: {
            id: true,
            name: true,
            location: true
          }
        }
      }
    });

    if (addressUnlock) {
      return {
        id: addressUnlock.unlockId,
        reference: addressUnlock.transactionReference || addressUnlock.unlockId,
        type: 'ADDRESS_UNLOCK',
        amount: parseFloat(addressUnlock.paymentAmountRwf.toString()),
        amountUsd: addressUnlock.paymentAmountUsd ? parseFloat(addressUnlock.paymentAmountUsd.toString()) : undefined,
        currency: 'RWF',
        status: addressUnlock.paymentStatus,
        paymentMethod: addressUnlock.paymentMethod,
        propertyId: addressUnlock.propertyId,
        createdAt: addressUnlock.createdAt,
        unlockedAt: addressUnlock.unlockedAt,
        user: addressUnlock.user,
        userId: addressUnlock.userId,
        property: addressUnlock.property,
        sourceTable: 'property_address_unlocks',
        transactionId: addressUnlock.unlockId
      };
    }

    // Not found in any table
    return null;
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
