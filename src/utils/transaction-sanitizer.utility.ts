// utils/transaction-sanitizer.utility.ts - Utility to sanitize transaction data for privacy

import { Transaction } from '@prisma/client';
import { logger } from './logger';

export interface SanitizedTransaction {
  id: string;
  reference: string;
  transactionType: string;
  status: string;
  description?: string;
  bookingId?: string | null;
  propertyId?: number | null;
  tourId?: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date | null;
  // Amount fields only shown to transaction owner
  amount?: number;
  currency?: string;
  // Related entity info WITHOUT amounts
  relatedInfo?: {
    type: 'booking' | 'property' | 'tour';
    id: string | number;
    description: string;
  };
}

export class TransactionSanitizer {
  /**
   * Sanitize a single transaction based on viewer's relationship to it
   * @param transaction - The transaction to sanitize
   * @param viewerId - ID of the user viewing the transaction
   * @returns Sanitized transaction data
   */
  static sanitizeTransaction(transaction: any, viewerId: number): SanitizedTransaction {
    const isOwner = transaction.userId === viewerId;
    const isRecipient = transaction.recipientId === viewerId;
    const isInvolved = isOwner || isRecipient;

    // Base info visible to all involved parties
    const sanitized: SanitizedTransaction = {
      id: transaction.id,
      reference: transaction.reference,
      transactionType: transaction.transactionType,
      status: transaction.status,
      description: transaction.description,
      bookingId: transaction.bookingId,
      propertyId: transaction.propertyId,
      tourId: transaction.tourId,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
      completedAt: transaction.completedAt
    };

    // Only show amounts if user is directly involved (sender or recipient)
    if (isInvolved) {
      sanitized.amount = transaction.amount;
      sanitized.currency = transaction.currency;
    } else {
      // For non-involved parties (e.g., agents/hosts), show minimal info
      sanitized.relatedInfo = {
        type: transaction.bookingId
          ? 'booking'
          : transaction.propertyId
            ? 'property'
            : transaction.tourId
              ? 'tour'
              : 'booking',
        id: transaction.bookingId || transaction.propertyId || transaction.tourId || 'N/A',
        description: isOwner
          ? 'Payment sent'
          : isRecipient
            ? 'Payment received'
            : 'Related transaction'
      };
    }

    return sanitized;
  }

  /**
   * Sanitize multiple transactions
   */
  static sanitizeTransactions(transactions: any[], viewerId: number): SanitizedTransaction[] {
    return transactions.map(tx => this.sanitizeTransaction(tx, viewerId));
  }

  /**
   * Remove platform fees from metadata for non-admin users
   * @param transaction - Transaction with metadata
   * @param isAdmin - Whether the viewer is an admin
   */
  static sanitizeMetadata(transaction: any, isAdmin: boolean): any {
    if (!transaction.metadata) {
      return transaction;
    }

    const metadata = transaction.metadata as any;

    if (isAdmin) {
      // Admins see everything
      return transaction;
    }

    // Remove platform-specific fields from metadata
    const sanitizedMetadata = { ...metadata };
    delete sanitizedMetadata.platformFee;
    delete sanitizedMetadata.platformPercentage;
    delete sanitizedMetadata.splitRules;
    delete sanitizedMetadata.internalSplitDetails;

    return {
      ...transaction,
      metadata: sanitizedMetadata
    };
  }

  /**
   * Get transaction summary for related users (host/agent/tour guide)
   * Shows that a transaction occurred but hides amounts
   */
  static getRelatedTransactionSummary(transaction: any): {
    id: string;
    reference: string;
    type: string;
    status: string;
    bookingId?: string | null;
    propertyId?: number | null;
    tourId?: string | null;
    description: string;
    createdAt: Date;
  } {
    return {
      id: transaction.id,
      reference: transaction.reference,
      type: transaction.transactionType,
      status: transaction.status,
      bookingId: transaction.bookingId,
      propertyId: transaction.propertyId,
      tourId: transaction.tourId,
      description: 'A transaction occurred for this booking/property/tour',
      createdAt: transaction.createdAt
    };
  }

  /**
   * Filter transactions to only show user's own transactions
   * Used in conjunction with authorization middleware
   */
  static filterUserTransactions(transactions: any[], userId: number): any[] {
    return transactions.filter(
      tx => tx.userId === userId || tx.recipientId === userId
    );
  }

  /**
   * Get transaction display for user based on their role in the transaction
   */
  static getTransactionDisplay(transaction: any, viewerId: number): {
    title: string;
    subtitle: string;
    amount?: number;
    currency?: string;
    showAmount: boolean;
  } {
    const isOwner = transaction.userId === viewerId;
    const isRecipient = transaction.recipientId === viewerId;

    if (isOwner) {
      return {
        title: 'Payment Sent',
        subtitle: transaction.description || 'Transaction',
        amount: transaction.amount,
        currency: transaction.currency,
        showAmount: true
      };
    }

    if (isRecipient) {
      return {
        title: 'Payment Received',
        subtitle: transaction.description || 'Transaction',
        amount: transaction.amount,
        currency: transaction.currency,
        showAmount: true
      };
    }

    // For related users (e.g., agent seeing guest->host payment)
    return {
      title: 'Related Transaction',
      subtitle: 'A payment was processed',
      showAmount: false
    };
  }

  /**
   * Sanitize wallet balance for user
   * Hosts/agents/tour guides only see their withdrawal amounts, not guest payments
   */
  static sanitizeWalletBalance(wallet: any, userId: number): any {
    // Only show balance that belongs to the user
    // For hosts/agents: This is their commission/earnings only
    // For guests: This is their deposit/refund balance
    return {
      id: wallet.id,
      userId: wallet.userId,
      balance: wallet.balance,
      pendingBalance: wallet.pendingBalance,
      currency: wallet.currency,
      walletNumber: wallet.walletNumber,
      availableBalance: wallet.balance,
      totalBalance: wallet.balance + wallet.pendingBalance,
      // Hide any platform-specific calculations
      note: 'Balance reflects your available funds only'
    };
  }

  /**
   * Sanitize withdrawal/payment received transactions for hosts/agents
   * They should only see their withdrawal amounts, not guest payment details
   */
  static sanitizePayoutTransaction(transaction: any): any {
    return {
      id: transaction.id,
      reference: transaction.reference,
      type: 'PAYOUT',
      amount: transaction.amount,
      currency: transaction.currency,
      status: transaction.status,
      description: 'Withdrawal to your account',
      paymentMethod: transaction.paymentMethod,
      createdAt: transaction.createdAt,
      completedAt: transaction.completedAt,
      // Hide guest payment info
      relatedBooking: transaction.bookingId ? {
        id: transaction.bookingId,
        note: 'Related to a booking'
      } : undefined
    };
  }

  /**
   * Check if user should see full transaction details
   */
  static canViewFullDetails(transaction: any, userId: number, userType?: string): boolean {
    // Admins can see everything
    if (userType === 'admin') {
      return true;
    }

    // Users can see full details of their own transactions
    return transaction.userId === userId || transaction.recipientId === userId;
  }

  /**
   * Log access attempts for audit trail
   */
  static logAccess(
    transactionId: string,
    viewerId: number,
    accessGranted: boolean,
    reason?: string
  ): void {
    logger.info('Transaction access attempt', 'TransactionSanitizer', {
      transactionId,
      viewerId,
      accessGranted,
      reason: reason || 'Standard access check'
    });
  }
}
