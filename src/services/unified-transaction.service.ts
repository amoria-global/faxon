// services/unified-transaction.service.ts - Unified transaction retrieval for all payment providers

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface UnifiedTransaction {
  id: string;
  provider: 'PESAPAL' | 'PAWAPAY' | 'XENTRIPAY';
  type: 'DEPOSIT' | 'PAYOUT' | 'REFUND' | 'ESCROW';
  status: string;
  amount: number | string;
  currency: string;
  reference: string;
  externalId?: string;
  userId?: number;
  recipientId?: number;
  recipientPhone?: string;
  payerPhone?: string;
  description?: string;
  metadata?: any;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  failureReason?: string;
  providerTransactionId?: string;
  financialTransactionId?: string;
}

export interface UnifiedTransactionFilters {
  userId?: number;
  recipientId?: number;
  provider?: 'PESAPAL' | 'PAWAPAY' | 'XENTRIPAY';
  type?: 'DEPOSIT' | 'PAYOUT' | 'REFUND' | 'ESCROW';
  status?: string;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}

export class UnifiedTransactionService {
  /**
   * Get all transactions across all providers
   */
  async getAllTransactions(filters: UnifiedTransactionFilters = {}): Promise<UnifiedTransaction[]> {
    const limit = filters.limit || 100;
    const offset = filters.offset || 0;

    // Build where clauses for each provider
    const whereClause: any = {};
    const pawaPayWhere: any = {};

    if (filters.userId) {
      whereClause.userId = filters.userId;
      pawaPayWhere.userId = filters.userId;
    }

    if (filters.status) {
      whereClause.status = filters.status;
      pawaPayWhere.status = filters.status;
    }

    if (filters.fromDate) {
      whereClause.createdAt = { ...whereClause.createdAt, gte: filters.fromDate };
      pawaPayWhere.createdAt = { ...pawaPayWhere.createdAt, gte: filters.fromDate };
    }

    if (filters.toDate) {
      whereClause.createdAt = { ...whereClause.createdAt, lte: filters.toDate };
      pawaPayWhere.createdAt = { ...pawaPayWhere.createdAt, lte: filters.toDate };
    }

    // Fetch from all sources in parallel
    const [escrowTransactions, pawaPayTransactions] = await Promise.all([
      // Escrow transactions (includes Pesapal and XentriPay)
      prisma.escrowTransaction.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset
      }),

      // PawaPay transactions
      prisma.pawaPayTransaction.findMany({
        where: pawaPayWhere,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset
      })
    ]);

    // Map to unified format
    const unifiedTransactions: UnifiedTransaction[] = [];

    // Map escrow transactions (Pesapal and XentriPay)
    for (const tx of escrowTransactions) {
      const metadata = tx.metadata as any;
      const provider = metadata?.xentriPayRefId ? 'XENTRIPAY' : 'PESAPAL';

      // Apply provider filter if specified
      if (filters.provider && filters.provider !== provider) {
        continue;
      }

      // Apply type filter
      const txType = tx.type === 'DEPOSIT' ? 'ESCROW' : tx.type as any;
      if (filters.type && filters.type !== txType && filters.type !== 'DEPOSIT') {
        continue;
      }

      unifiedTransactions.push({
        id: tx.id,
        provider,
        type: txType,
        status: tx.status,
        amount: tx.amount,
        currency: tx.currency,
        reference: tx.reference,
        externalId: tx.externalId || undefined,
        userId: tx.userId,
        recipientId: tx.recipientId || undefined,
        description: tx.description || undefined,
        metadata: metadata,
        createdAt: tx.createdAt,
        updatedAt: tx.updatedAt,
        completedAt: tx.releasedAt || tx.cancelledAt || tx.refundedAt || undefined,
        failureReason: undefined
      });
    }

    // Map PawaPay transactions
    for (const tx of pawaPayTransactions) {
      // Apply provider filter
      if (filters.provider && filters.provider !== 'PAWAPAY') {
        continue;
      }

      // Apply type filter
      if (filters.type && filters.type !== tx.transactionType as any) {
        continue;
      }

      unifiedTransactions.push({
        id: tx.id,
        provider: 'PAWAPAY',
        type: tx.transactionType as any,
        status: tx.status,
        amount: tx.amount,
        currency: tx.currency,
        reference: tx.transactionId,
        externalId: tx.providerTransactionId || undefined,
        userId: tx.userId || undefined,
        recipientId: undefined,
        recipientPhone: tx.recipientPhone || undefined,
        payerPhone: tx.payerPhone || undefined,
        description: tx.statementDescription || undefined,
        metadata: tx.metadata,
        createdAt: tx.createdAt,
        updatedAt: tx.updatedAt,
        completedAt: tx.completedAt || undefined,
        failureReason: tx.failureMessage || undefined,
        providerTransactionId: tx.providerTransactionId || undefined,
        financialTransactionId: tx.financialTransactionId || undefined
      });
    }

    // Sort by creation date (newest first)
    unifiedTransactions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // Apply limit
    return unifiedTransactions.slice(0, limit);
  }

  /**
   * Get transactions by user ID
   */
  async getTransactionsByUserId(userId: number, filters: Omit<UnifiedTransactionFilters, 'userId'> = {}): Promise<UnifiedTransaction[]> {
    return this.getAllTransactions({ ...filters, userId });
  }

  /**
   * Get transactions by recipient ID (escrow only)
   */
  async getTransactionsByRecipientId(recipientId: number, filters: Omit<UnifiedTransactionFilters, 'recipientId'> = {}): Promise<UnifiedTransaction[]> {
    return this.getAllTransactions({ ...filters, recipientId });
  }

  /**
   * Get single transaction by ID and provider
   */
  async getTransactionById(id: string, provider?: 'PESAPAL' | 'PAWAPAY' | 'XENTRIPAY'): Promise<UnifiedTransaction | null> {
    // Try to find in escrow transactions first
    if (!provider || provider === 'PESAPAL' || provider === 'XENTRIPAY') {
      const escrowTx = await prisma.escrowTransaction.findUnique({
        where: { id }
      });

      if (escrowTx) {
        const metadata = escrowTx.metadata as any;
        const txProvider = metadata?.xentriPayRefId ? 'XENTRIPAY' : 'PESAPAL';

        return {
          id: escrowTx.id,
          provider: txProvider,
          type: escrowTx.type === 'DEPOSIT' ? 'ESCROW' : escrowTx.type as any,
          status: escrowTx.status,
          amount: escrowTx.amount,
          currency: escrowTx.currency,
          reference: escrowTx.reference,
          externalId: escrowTx.externalId || undefined,
          userId: escrowTx.userId,
          recipientId: escrowTx.recipientId || undefined,
          description: escrowTx.description || undefined,
          metadata: metadata,
          createdAt: escrowTx.createdAt,
          updatedAt: escrowTx.updatedAt,
          completedAt: escrowTx.releasedAt || escrowTx.cancelledAt || escrowTx.refundedAt || undefined,
          failureReason: undefined
        };
      }
    }

    // Try to find in PawaPay transactions
    if (!provider || provider === 'PAWAPAY') {
      const pawaPayTx = await prisma.pawaPayTransaction.findUnique({
        where: { id }
      });

      if (pawaPayTx) {
        return {
          id: pawaPayTx.id,
          provider: 'PAWAPAY',
          type: pawaPayTx.transactionType as any,
          status: pawaPayTx.status,
          amount: pawaPayTx.amount,
          currency: pawaPayTx.currency,
          reference: pawaPayTx.transactionId,
          externalId: pawaPayTx.providerTransactionId || undefined,
          userId: pawaPayTx.userId || undefined,
          recipientId: undefined,
          recipientPhone: pawaPayTx.recipientPhone || undefined,
          payerPhone: pawaPayTx.payerPhone || undefined,
          description: pawaPayTx.statementDescription || undefined,
          metadata: pawaPayTx.metadata,
          createdAt: pawaPayTx.createdAt,
          updatedAt: pawaPayTx.updatedAt,
          completedAt: pawaPayTx.completedAt || undefined,
          failureReason: pawaPayTx.failureMessage || undefined,
          providerTransactionId: pawaPayTx.providerTransactionId || undefined,
          financialTransactionId: pawaPayTx.financialTransactionId || undefined
        };
      }
    }

    return null;
  }

  /**
   * Get transaction statistics
   */
  async getTransactionStats(userId?: number): Promise<{
    totalTransactions: number;
    byProvider: Record<string, number>;
    byStatus: Record<string, number>;
    byType: Record<string, number>;
    totalVolume: Record<string, number>; // By currency
  }> {
    const transactions = await this.getAllTransactions({ userId, limit: 10000 });

    const stats = {
      totalTransactions: transactions.length,
      byProvider: {} as Record<string, number>,
      byStatus: {} as Record<string, number>,
      byType: {} as Record<string, number>,
      totalVolume: {} as Record<string, number>
    };

    for (const tx of transactions) {
      // Count by provider
      stats.byProvider[tx.provider] = (stats.byProvider[tx.provider] || 0) + 1;

      // Count by status
      stats.byStatus[tx.status] = (stats.byStatus[tx.status] || 0) + 1;

      // Count by type
      stats.byType[tx.type] = (stats.byType[tx.type] || 0) + 1;

      // Sum volume by currency
      const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : tx.amount;
      if (!isNaN(amount)) {
        stats.totalVolume[tx.currency] = (stats.totalVolume[tx.currency] || 0) + amount;
      }
    }

    return stats;
  }
}

export const unifiedTransactionService = new UnifiedTransactionService();
