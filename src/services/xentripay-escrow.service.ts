// services/xentripay-escrow.service.ts - Refactored to use userId/recipientId and split payments to host agent and platform

import { XentriPayService, PayoutRequest, BulkPayoutRequest, BulkPayoutResponse } from './xentripay.service';
import { BrevoMailingService } from '../utils/brevo.xentripay';
import { PhoneUtils } from '../utils/phone.utils';
import { PrismaClient } from '@prisma/client';
import db from '../utils/db';

// ==================== TYPES ====================

export interface EscrowTransaction {
  id: string;
  userId: string; // Payer
  recipientId?: string; // Host agent
  amount: number;
  currency: string;
  description: string;
  status: EscrowStatus;
  paymentMethod: 'momo';
  xentriPayRefId?: string;
  xentriPayTid?: string;
  xentriPayInternalRef?: string;
  customerReference?: string;
  collectionResponse?: any;
  payoutResponse?: any;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  platformFee?: number;
  hostEarning?: number;
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
  paymentMethod: 'momo';
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

export interface CancelEscrowRequest {
  transactionId: string;
  requesterId: string;
  reason: string;
}

export interface BulkReleaseRequest {
  transactionIds: string[];
  requesterId: string;
  reason?: string;
}

// ==================== SERVICE ====================

export class XentriPayEscrowService {
  private readonly DEFAULT_PLATFORM_FEE_PERCENTAGE = 10; // 10% default platform fee

  constructor(
    private xentriPayService: XentriPayService,
    private mailingService: BrevoMailingService
  ) {}

  // ==================== CREATE ESCROW ====================

  /**
   * Create new escrow transaction and initiate payment collection
   */
  async createEscrow(request: CreateEscrowRequest): Promise<EscrowTransaction> {
    try {
      console.log('[ESCROW] Creating escrow transaction:', {
        userId: request.userId,
        recipientId: request.recipientId,
        amount: request.amount,
        paymentMethod: request.paymentMethod
      });

      // Validate amount is whole number
      const amount = Math.round(request.amount);
      if (amount !== request.amount) {
        throw new Error('Amount must be a whole number (no decimals)');
      }

      // Calculate platform fee and host earning
      const platformFeePercentage = request.platformFeePercentage || this.DEFAULT_PLATFORM_FEE_PERCENTAGE;
      const platformFee = Math.round((amount * platformFeePercentage) / 100);
      const hostEarning = amount - platformFee;

      // Generate unique reference
      const reference = this.generateTransactionId();

      // Create transaction record in database
      const transaction = await db.escrowTransaction.create({
        data: {
          userId: parseInt(request.userId),
          recipientId: request.recipientId ? parseInt(request.recipientId) : null,
          type: 'DEPOSIT',
          amount,
          currency: 'RWF',
          description: request.description,
          status: 'INITIATED',
          reference,
          metadata: {
            platformFee,
            hostEarning,
            platformFeePercentage,
            userEmail: request.userEmail,
            userName: request.userName,
            userPhone: request.userPhone,
            recipientEmail: request.recipientEmail,
            recipientName: request.recipientName,
            recipientPhone: request.recipientPhone,
            paymentMethod: request.paymentMethod,
            ...request.metadata
          }
        }
      });

      // Initiate payment collection via XentriPay
      const collectionRequest = {
        email: request.userEmail,
        cname: request.userName,
        amount,
        cnumber: PhoneUtils.formatPhone(request.userPhone, false),
        msisdn: PhoneUtils.formatPhone(request.userPhone, true),
        currency: 'RWF',
        pmethod: 'momo',
        chargesIncluded: 'true'
      };

      const collectionResponse = await this.xentriPayService.initiateCollection(collectionRequest);

      // Update transaction with collection details
      const updatedTransaction = await db.escrowTransaction.update({
        where: { id: transaction.id },
        data: {
          externalId: collectionResponse.refid,
          status: 'PENDING',
          metadata: {
            ...(transaction.metadata as any),
            xentriPayRefId: collectionResponse.refid,
            xentriPayTid: collectionResponse.tid,
            collectionResponse
          }
        }
      });

      // Send notification
      await this.mailingService.sendDepositInitiatedEmail({
        to: request.userEmail,
        buyerName: request.userName,
        amount,
        transactionId: updatedTransaction.id,
        description: request.description,
        instructions: collectionResponse?.reply || 'Payment initiated',
        paymentMethod: request.paymentMethod
      });

      console.log('[ESCROW] ✅ Escrow created:', {
        transactionId: updatedTransaction.id,
        refid: collectionResponse?.refid,
        status: updatedTransaction.status,
        platformFee,
        hostEarning
      });

      return this.mapDbToEscrowTransaction(updatedTransaction);
    } catch (error: any) {
      console.error('[ESCROW] ❌ Failed to create escrow:', error);
      throw error;
    }
  }

  // ==================== CHECK PAYMENT STATUS ====================

  /**
   * Check collection status and update transaction
   */
  async checkCollectionStatus(transactionId: string): Promise<EscrowTransaction> {
    try {
      const dbTransaction = await db.escrowTransaction.findUnique({
        where: { id: transactionId }
      });

      if (!dbTransaction) {
        throw new Error('Transaction not found');
      }

      const metadata = dbTransaction.metadata as any;
      const xentriPayRefId = metadata?.xentriPayRefId;

      if (!xentriPayRefId) {
        throw new Error('No XentriPay reference ID found');
      }

      console.log('[ESCROW] Checking collection status:', {
        transactionId,
        refid: xentriPayRefId
      });

      const statusResponse = await this.xentriPayService.getCollectionStatus(xentriPayRefId);

      const previousStatus = dbTransaction.status;
      let newStatus = dbTransaction.status;

      if (statusResponse.status === 'SUCCESS') {
        newStatus = 'HELD';
        console.log('[ESCROW] ✅ Funds held in escrow');
      } else if (statusResponse.status === 'FAILED') {
        newStatus = 'FAILED';
        console.log('[ESCROW] ❌ Collection failed');
      } else {
        newStatus = 'PENDING';
      }

      const updatedTransaction = await db.escrowTransaction.update({
        where: { id: transactionId },
        data: { status: newStatus }
      });

      // Send notification if status changed to HELD
      if (previousStatus !== 'HELD' && newStatus === 'HELD') {
        await this.notifyFundsHeld(this.mapDbToEscrowTransaction(updatedTransaction));
      }

      return this.mapDbToEscrowTransaction(updatedTransaction);
    } catch (error: any) {
      console.error('[ESCROW] ❌ Failed to check status:', error);
      throw error;
    }
  }

  // ==================== RELEASE ESCROW ====================

  /**
   * Release funds - split to host agent and platform
   */
  async releaseEscrow(request: ReleaseEscrowRequest): Promise<EscrowTransaction> {
    try {
      const dbTransaction = await db.escrowTransaction.findUnique({
        where: { id: request.transactionId }
      });

      if (!dbTransaction) {
        throw new Error('Transaction not found');
      }

      if (dbTransaction.status !== 'HELD') {
        throw new Error(`Cannot release escrow in status: ${dbTransaction.status}. Funds must be HELD.`);
      }

      const metadata = dbTransaction.metadata as any;
      const platformFee = metadata?.platformFee || 0;
      const hostEarning = metadata?.hostEarning || 0;

      console.log('[ESCROW] Releasing escrow:', {
        transactionId: request.transactionId,
        totalAmount: dbTransaction.amount,
        platformFee,
        hostEarning
      });

      let updatedMetadata = { ...metadata };

      // Only payout to host agent if recipient exists
      if (dbTransaction.recipientId && metadata?.recipientPhone && metadata?.recipientName) {
        const recipientPhone = metadata.recipientPhone as string;
        const recipientName = metadata.recipientName as string;

        if (hostEarning > 0) {
          const providerId = this.xentriPayService.getProviderIdFromPhone(recipientPhone);
          const customerReference = this.xentriPayService.generateCustomerReference('HOST-PAYOUT');

          const payoutRequest: PayoutRequest = {
            customerReference,
            telecomProviderId: providerId,
            msisdn: PhoneUtils.formatPhone(recipientPhone, false),
            name: recipientName,
            transactionType: 'PAYOUT',
            currency: 'RWF',
            amount: hostEarning
          };

          const payoutResponse = await this.xentriPayService.createPayout(payoutRequest);

          updatedMetadata = {
            ...updatedMetadata,
            xentriPayInternalRef: payoutResponse.internalRef,
            customerReference,
            payoutResponse
          };

          console.log('[ESCROW] ✅ Host agent payout created:', {
            hostEarning,
            internalRef: payoutResponse.internalRef
          });
        }
      }

      // Platform fee stays in platform wallet (no payout needed)
      console.log('[ESCROW] Platform fee retained:', platformFee);

      const updatedTransaction = await db.escrowTransaction.update({
        where: { id: request.transactionId },
        data: {
          status: 'RELEASED',
          releasedAt: new Date(),
          releasedBy: parseInt(request.requesterId),
          releaseReason: request.reason,
          metadata: updatedMetadata
        }
      });

      await this.notifyEscrowReleased(this.mapDbToEscrowTransaction(updatedTransaction));

      console.log('[ESCROW] ✅ Escrow released successfully');
      return this.mapDbToEscrowTransaction(updatedTransaction);
    } catch (error: any) {
      console.error('[ESCROW] ❌ Failed to release escrow:', error);
      throw error;
    }
  }

  /**
   * Bulk release escrows (for admin)
   */
  async bulkReleaseEscrow(request: BulkReleaseRequest): Promise<BulkPayoutResponse> {
    try {
      const results: BulkPayoutResponse['results'] = [];
      let successCount = 0;
      let failedCount = 0;

      const bulkPayouts: PayoutRequest[] = [];
      const transactionUpdates: Array<{ id: string; customerReference: string }> = [];

      for (const txId of request.transactionIds) {
        const dbTransaction = await db.escrowTransaction.findUnique({
          where: { id: txId }
        });

        if (!dbTransaction || dbTransaction.status !== 'HELD') {
          results.push({
            customerReference: txId,
            status: 'FAILED',
            error: 'Transaction not found or not in HELD status'
          });
          failedCount++;
          continue;
        }

        const metadata = dbTransaction.metadata as any;
        const recipientPhone = metadata?.recipientPhone as string;
        const recipientName = metadata?.recipientName as string;
        const hostEarning = metadata?.hostEarning || 0;

        if (recipientPhone && recipientName && hostEarning > 0) {
          const providerId = this.xentriPayService.getProviderIdFromPhone(recipientPhone);
          const customerReference = this.xentriPayService.generateCustomerReference('BULK-RELEASE');

          bulkPayouts.push({
            customerReference,
            telecomProviderId: providerId,
            msisdn: PhoneUtils.formatPhone(recipientPhone, false),
            name: recipientName,
            transactionType: 'PAYOUT',
            currency: 'RWF',
            amount: hostEarning
          });

          transactionUpdates.push({ id: txId, customerReference });
        }
      }

      if (bulkPayouts.length > 0) {
        const bulkResult = await this.xentriPayService.createBulkPayouts({ payouts: bulkPayouts });

        // Update transactions in database
        for (const update of transactionUpdates) {
          await db.escrowTransaction.update({
            where: { id: update.id },
            data: {
              status: 'RELEASED',
              releasedAt: new Date(),
              releasedBy: parseInt(request.requesterId),
              releaseReason: request.reason,
              metadata: {
                ...(await db.escrowTransaction.findUnique({ where: { id: update.id } }))?.metadata as any,
                customerReference: update.customerReference
              }
            }
          });
        }

        bulkResult.results.forEach(res => {
          results.push(res);
          if (res.status === 'PENDING' || res.status === 'COMPLETED') successCount++;
          else failedCount++;
        });
      }

      await this.notifyBulkReleased(request.transactionIds, request.reason || 'Bulk release approved');

      console.log(`[ESCROW] Bulk release completed: ${successCount} success, ${failedCount} failed`);

      return { success: successCount, failed: failedCount, results };
    } catch (error: any) {
      console.error('[ESCROW] ❌ Bulk release failed:', error);
      throw error;
    }
  }

  // ==================== REFUND/CANCEL ESCROW ====================

  async refundEscrow(request: RefundEscrowRequest): Promise<EscrowTransaction> {
    return this.cancelEscrow({ ...request, reason: `Refund: ${request.reason}` });
  }

  async cancelEscrow(request: CancelEscrowRequest): Promise<EscrowTransaction> {
    try {
      const dbTransaction = await db.escrowTransaction.findUnique({
        where: { id: request.transactionId }
      });

      if (!dbTransaction) {
        throw new Error('Transaction not found');
      }

      if (dbTransaction.status !== 'PENDING' && dbTransaction.status !== 'HELD') {
        throw new Error(`Cannot cancel escrow in status: ${dbTransaction.status}`);
      }

      console.log('[ESCROW] Cancelling escrow with refund:', {
        transactionId: request.transactionId,
        amount: dbTransaction.amount,
        reason: request.reason
      });

      const metadata = dbTransaction.metadata as any;
      let updatedMetadata = { ...metadata, cancelReason: request.reason };

      if (dbTransaction.status === 'HELD') {
        const userPhone = metadata?.userPhone as string;
        const userName = metadata?.userName as string;

        if (!userPhone || !userName) {
          throw new Error('User details not found in transaction metadata');
        }

        const providerId = this.xentriPayService.getProviderIdFromPhone(userPhone);
        const customerReference = this.xentriPayService.generateCustomerReference('REFUND');

        const payoutRequest: PayoutRequest = {
          customerReference,
          telecomProviderId: providerId,
          msisdn: PhoneUtils.formatPhone(userPhone, false),
          name: userName,
          transactionType: 'PAYOUT',
          currency: 'RWF',
          amount: dbTransaction.amount
        };

        const payoutResponse = await this.xentriPayService.createPayout(payoutRequest);

        updatedMetadata = {
          ...updatedMetadata,
          xentriPayInternalRef: payoutResponse.internalRef,
          customerReference,
          payoutResponse
        };
      }

      const updatedTransaction = await db.escrowTransaction.update({
        where: { id: request.transactionId },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancellationReason: request.reason,
          metadata: updatedMetadata
        }
      });

      await this.notifyEscrowCancelled(this.mapDbToEscrowTransaction(updatedTransaction), request.reason);

      console.log('[ESCROW] ✅ Escrow cancelled and refunded');
      return this.mapDbToEscrowTransaction(updatedTransaction);
    } catch (error: any) {
      console.error('[ESCROW] ❌ Failed to cancel escrow:', error);
      throw error;
    }
  }

  // ==================== QUERY METHODS ====================

  async getTransaction(transactionId: string): Promise<EscrowTransaction | null> {
    const dbTransaction = await db.escrowTransaction.findUnique({
      where: { id: transactionId }
    });
    return dbTransaction ? this.mapDbToEscrowTransaction(dbTransaction) : null;
  }

  async getTransactionsByUser(userId: string): Promise<EscrowTransaction[]> {
    const dbTransactions = await db.escrowTransaction.findMany({
      where: { userId: parseInt(userId) },
      orderBy: { createdAt: 'desc' }
    });
    return dbTransactions.map(tx => this.mapDbToEscrowTransaction(tx));
  }

  async getTransactionsByRecipient(recipientId: string): Promise<EscrowTransaction[]> {
    const dbTransactions = await db.escrowTransaction.findMany({
      where: { recipientId: parseInt(recipientId) },
      orderBy: { createdAt: 'desc' }
    });
    return dbTransactions.map(tx => this.mapDbToEscrowTransaction(tx));
  }

  // ==================== NOTIFICATION METHODS ====================

  private async notifyFundsHeld(transaction: EscrowTransaction): Promise<void> {
    try {
      await this.mailingService.sendFundsHeldEmail({
        to: transaction.metadata?.userEmail || '',
        buyerName: transaction.metadata?.userName || '',
        transactionId: transaction.id,
        amount: transaction.amount,
        description: transaction.description,
        paymentMethod: transaction.paymentMethod
      });

      if (transaction.recipientId && transaction.metadata?.recipientEmail) {
        await this.mailingService.sendFundsHeldSellerEmail({
          to: transaction.metadata.recipientEmail,
          sellerName: transaction.metadata?.recipientName || '',
          transactionId: transaction.id,
          amount: transaction.hostEarning || 0,
          description: transaction.description
        });
      }
    } catch (error) {
      console.error('[ESCROW] Failed to send notifications:', error);
    }
  }

  private async notifyEscrowReleased(transaction: EscrowTransaction): Promise<void> {
    try {
      if (transaction.recipientId && transaction.metadata?.recipientEmail) {
        await this.mailingService.sendPayoutCompletedEmail({
          to: transaction.metadata.recipientEmail,
          sellerName: transaction.metadata?.recipientName || '',
          transactionId: transaction.id,
          amount: transaction.hostEarning || 0,
          description: transaction.description
        });
      }

      await this.mailingService.sendEscrowReleasedEmail({
        to: transaction.metadata?.userEmail || '',
        buyerName: transaction.metadata?.userName || '',
        transactionId: transaction.id,
        amount: transaction.amount,
        description: transaction.description
      });
    } catch (error) {
      console.error('[ESCROW] Failed to send notifications:', error);
    }
  }

  private async notifyEscrowCancelled(transaction: EscrowTransaction, reason: string): Promise<void> {
    try {
      await this.mailingService.sendRefundCompletedEmail({
        to: transaction.metadata?.userEmail || '',
        buyerName: transaction.metadata?.userName || '',
        transactionId: transaction.id,
        amount: transaction.amount,
        reason
      });

      if (transaction.recipientId && transaction.metadata?.recipientEmail) {
        await this.mailingService.sendRefundNoticeEmail({
          to: transaction.metadata.recipientEmail,
          sellerName: transaction.metadata?.recipientName || '',
          transactionId: transaction.id,
          amount: transaction.amount,
          reason
        });
      }
    } catch (error) {
      console.error('[ESCROW] Failed to send notifications:', error);
    }
  }

  private async notifyBulkReleased(transactionIds: string[], reason?: string): Promise<void> {
    try {
      console.log('[ESCROW] Bulk notifications sent for:', transactionIds);
    } catch (error) {
      console.error('[ESCROW] Failed to send bulk notifications:', error);
    }
  }

  // ==================== UTILITY METHODS ====================

  private generateTransactionId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10).toUpperCase();
    return `ESC-${timestamp}-${random}`;
  }

  private mapDbToEscrowTransaction(dbTransaction: any): EscrowTransaction {
    const metadata = dbTransaction.metadata as any || {};
    return {
      id: dbTransaction.id,
      userId: dbTransaction.userId.toString(),
      recipientId: dbTransaction.recipientId?.toString(),
      amount: dbTransaction.amount,
      currency: dbTransaction.currency,
      description: dbTransaction.description || '',
      status: dbTransaction.status as EscrowStatus,
      paymentMethod: metadata.paymentMethod || 'momo',
      xentriPayRefId: metadata.xentriPayRefId,
      xentriPayTid: metadata.xentriPayTid,
      xentriPayInternalRef: metadata.xentriPayInternalRef,
      customerReference: metadata.customerReference,
      collectionResponse: metadata.collectionResponse,
      payoutResponse: metadata.payoutResponse,
      createdAt: dbTransaction.createdAt,
      updatedAt: dbTransaction.updatedAt,
      completedAt: dbTransaction.releasedAt || dbTransaction.cancelledAt || dbTransaction.refundedAt,
      platformFee: metadata.platformFee,
      hostEarning: metadata.hostEarning,
      metadata
    };
  }
}
