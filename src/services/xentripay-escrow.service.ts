// services/xentripay-escrow.service.ts

import { XentriPayService, CollectionRequest, PayoutRequest } from './xentripay.service';
import { BrevoMailingService } from '../utils/brevo.xentripay';

// ==================== TYPES ====================

export interface EscrowTransaction {
  id: string;
  buyerId: string;
  sellerId: string;
  amount: number;
  currency: string;
  description: string;
  status: EscrowStatus;
  xentriPayRefId?: string;
  xentriPayTid?: string;
  xentriPayInternalRef?: string;
  customerReference?: string;
  collectionResponse?: any;
  payoutResponse?: any;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  metadata?: Record<string, any>;
}

export type EscrowStatus = 
  | 'INITIATED'      // Transaction created
  | 'PENDING'        // Waiting for payment
  | 'HELD'           // Funds received and held in escrow
  | 'RELEASED'       // Funds released to seller
  | 'REFUNDED'       // Funds returned to buyer
  | 'FAILED'         // Transaction failed
  | 'CANCELLED';     // Transaction cancelled

export interface CreateEscrowRequest {
  buyerId: string;
  buyerEmail: string;
  buyerName: string;
  buyerPhone: string;
  sellerId: string;
  sellerName: string;
  sellerPhone: string;
  amount: number;
  description: string;
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

// ==================== SERVICE ====================

export class XentriPayEscrowService {
  private transactions: Map<string, EscrowTransaction> = new Map();

  constructor(
    private xentriPayService: XentriPayService,
    private mailingService: BrevoMailingService
  ) {}

  // ==================== CREATE ESCROW ====================

  /**
   * Create new escrow transaction and initiate collection from buyer
   */
  async createEscrow(request: CreateEscrowRequest): Promise<EscrowTransaction> {
    try {
      console.log('[ESCROW] Creating escrow transaction:', {
        buyerId: request.buyerId,
        sellerId: request.sellerId,
        amount: request.amount
      });

      // Validate amount is whole number
      const amount = Math.round(request.amount);
      if (amount !== request.amount) {
        throw new Error('Amount must be a whole number (no decimals)');
      }

      // Generate unique transaction ID
      const transactionId = this.generateTransactionId();

      // Create transaction record
      const transaction: EscrowTransaction = {
        id: transactionId,
        buyerId: request.buyerId,
        sellerId: request.sellerId,
        amount,
        currency: 'RWF',
        description: request.description,
        status: 'INITIATED',
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: request.metadata
      };

      // Save transaction
      this.transactions.set(transactionId, transaction);

      // Initiate collection from buyer
      const collectionRequest: CollectionRequest = {
        email: request.buyerEmail,
        cname: request.buyerName,
        amount,
        cnumber: this.xentriPayService.formatPhoneNumber(request.buyerPhone, false),
        msisdn: this.xentriPayService.formatPhoneNumber(request.buyerPhone, true),
        currency: 'RWF',
        pmethod: 'momo',
        chargesIncluded: 'true'
      };

      const collectionResponse = await this.xentriPayService.initiateCollection(
        collectionRequest
      );

      // Update transaction with collection details
      transaction.xentriPayRefId = collectionResponse.refid;
      transaction.xentriPayTid = collectionResponse.tid;
      transaction.collectionResponse = collectionResponse;
      transaction.status = 'PENDING';
      transaction.updatedAt = new Date();

      this.transactions.set(transactionId, transaction);

      // Send notification to buyer
      await this.mailingService.sendDepositInitiatedEmail({
        to: request.buyerEmail,
        buyerName: request.buyerName,
        amount,
        transactionId,
        description: request.description,
        instructions: collectionResponse.reply
      });

      console.log('[ESCROW] ✅ Escrow created:', {
        transactionId,
        refid: collectionResponse.refid,
        status: transaction.status
      });

      return transaction;
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
      const transaction = this.transactions.get(transactionId);
      if (!transaction) {
        throw new Error('Transaction not found');
      }

      if (!transaction.xentriPayRefId) {
        throw new Error('No collection reference found');
      }

      console.log('[ESCROW] Checking collection status:', {
        transactionId,
        refid: transaction.xentriPayRefId
      });

      const statusResponse = await this.xentriPayService.getCollectionStatus(
        transaction.xentriPayRefId
      );

      // Update transaction status based on collection status
      const previousStatus = transaction.status;
      
      if (statusResponse.status === 'SUCCESS') {
        transaction.status = 'HELD';
        console.log('[ESCROW] ✅ Funds held in escrow');
      } else if (statusResponse.status === 'FAILED') {
        transaction.status = 'FAILED';
        console.log('[ESCROW] ❌ Collection failed');
      } else {
        transaction.status = 'PENDING';
      }

      transaction.updatedAt = new Date();
      this.transactions.set(transactionId, transaction);

      // Send notification if status changed to HELD
      if (previousStatus !== 'HELD' && transaction.status === 'HELD') {
        await this.notifyFundsHeld(transaction);
      }

      return transaction;
    } catch (error: any) {
      console.error('[ESCROW] ❌ Failed to check status:', error);
      throw error;
    }
  }

  // ==================== RELEASE ESCROW ====================

  /**
   * Release funds to seller
   */
  async releaseEscrow(request: ReleaseEscrowRequest): Promise<EscrowTransaction> {
    try {
      const transaction = this.transactions.get(request.transactionId);
      if (!transaction) {
        throw new Error('Transaction not found');
      }

      // Validate transaction status
      if (transaction.status !== 'HELD') {
        throw new Error(
          `Cannot release escrow in status: ${transaction.status}. Funds must be HELD.`
        );
      }

      // Validate requester is buyer
      if (transaction.buyerId !== request.requesterId) {
        throw new Error('Only buyer can release escrow');
      }

      console.log('[ESCROW] Releasing escrow:', {
        transactionId: request.transactionId,
        amount: transaction.amount
      });

      // Get seller details from metadata
      const sellerPhone = transaction.metadata?.sellerPhone;
      const sellerName = transaction.metadata?.sellerName;

      if (!sellerPhone || !sellerName) {
        throw new Error('Seller details not found in transaction metadata');
      }

      // Determine provider ID from phone number
      const providerId = this.xentriPayService.getProviderIdFromPhone(sellerPhone);

      // Generate unique customer reference
      const customerReference = this.xentriPayService.generateCustomerReference('ESCROW-RELEASE');

      // Create payout to seller
      const payoutRequest: PayoutRequest = {
        customerReference,
        telecomProviderId: providerId,
        msisdn: this.xentriPayService.formatPhoneNumber(sellerPhone, false),
        name: sellerName,
        transactionType: 'PAYOUT',
        currency: 'RWF',
        amount: transaction.amount
      };

      const payoutResponse = await this.xentriPayService.createPayout(payoutRequest);

      // Update transaction
      transaction.status = 'RELEASED';
      transaction.xentriPayInternalRef = payoutResponse.internalRef;
      transaction.customerReference = customerReference;
      transaction.payoutResponse = payoutResponse;
      transaction.completedAt = new Date();
      transaction.updatedAt = new Date();

      this.transactions.set(request.transactionId, transaction);

      // Send notifications
      await this.notifyEscrowReleased(transaction);

      console.log('[ESCROW] ✅ Escrow released:', {
        transactionId: request.transactionId,
        internalRef: payoutResponse.internalRef
      });

      return transaction;
    } catch (error: any) {
      console.error('[ESCROW] ❌ Failed to release escrow:', error);
      throw error;
    }
  }

  // ==================== REFUND ESCROW ====================

  /**
   * Refund funds to buyer
   */
  async refundEscrow(request: RefundEscrowRequest): Promise<EscrowTransaction> {
    try {
      const transaction = this.transactions.get(request.transactionId);
      if (!transaction) {
        throw new Error('Transaction not found');
      }

      // Validate transaction status
      if (transaction.status !== 'HELD') {
        throw new Error(
          `Cannot refund escrow in status: ${transaction.status}. Funds must be HELD.`
        );
      }

      console.log('[ESCROW] Refunding escrow:', {
        transactionId: request.transactionId,
        amount: transaction.amount,
        reason: request.reason
      });

      // Get buyer details from metadata
      const buyerPhone = transaction.metadata?.buyerPhone;
      const buyerName = transaction.metadata?.buyerName;

      if (!buyerPhone || !buyerName) {
        throw new Error('Buyer details not found in transaction metadata');
      }

      // Determine provider ID from phone number
      const providerId = this.xentriPayService.getProviderIdFromPhone(buyerPhone);

      // Generate unique customer reference
      const customerReference = this.xentriPayService.generateCustomerReference('ESCROW-REFUND');

      // Create payout to buyer (refund)
      const payoutRequest: PayoutRequest = {
        customerReference,
        telecomProviderId: providerId,
        msisdn: this.xentriPayService.formatPhoneNumber(buyerPhone, false),
        name: buyerName,
        transactionType: 'PAYOUT',
        currency: 'RWF',
        amount: transaction.amount
      };

      const payoutResponse = await this.xentriPayService.createPayout(payoutRequest);

      // Update transaction
      transaction.status = 'REFUNDED';
      transaction.xentriPayInternalRef = payoutResponse.internalRef;
      transaction.customerReference = customerReference;
      transaction.payoutResponse = payoutResponse;
      transaction.completedAt = new Date();
      transaction.updatedAt = new Date();
      transaction.metadata = {
        ...transaction.metadata,
        refundReason: request.reason
      };

      this.transactions.set(request.transactionId, transaction);

      // Send notifications
      await this.notifyEscrowRefunded(transaction, request.reason);

      console.log('[ESCROW] ✅ Escrow refunded:', {
        transactionId: request.transactionId,
        internalRef: payoutResponse.internalRef
      });

      return transaction;
    } catch (error: any) {
      console.error('[ESCROW] ❌ Failed to refund escrow:', error);
      throw error;
    }
  }

  // ==================== QUERY METHODS ====================

  /**
   * Get transaction by ID
   */
  async getTransaction(transactionId: string): Promise<EscrowTransaction | null> {
    return this.transactions.get(transactionId) || null;
  }

  /**
   * Get transactions by buyer ID
   */
  async getTransactionsByBuyer(buyerId: string): Promise<EscrowTransaction[]> {
    return Array.from(this.transactions.values())
      .filter(tx => tx.buyerId === buyerId);
  }

  /**
   * Get transactions by seller ID
   */
  async getTransactionsBySeller(sellerId: string): Promise<EscrowTransaction[]> {
    return Array.from(this.transactions.values())
      .filter(tx => tx.sellerId === sellerId);
  }

  // ==================== NOTIFICATION METHODS ====================

  private async notifyFundsHeld(transaction: EscrowTransaction): Promise<void> {
    try {
      // Notify buyer
      await this.mailingService.sendFundsHeldEmail({
        to: transaction.metadata?.buyerEmail || '',
        buyerName: transaction.metadata?.buyerName || '',
        transactionId: transaction.id,
        amount: transaction.amount,
        description: transaction.description
      });

      // Notify seller
      await this.mailingService.sendFundsHeldSellerEmail({
        to: transaction.metadata?.sellerEmail || '',
        sellerName: transaction.metadata?.sellerName || '',
        transactionId: transaction.id,
        amount: transaction.amount,
        description: transaction.description
      });
    } catch (error) {
      console.error('[ESCROW] Failed to send notifications:', error);
    }
  }

  private async notifyEscrowReleased(transaction: EscrowTransaction): Promise<void> {
    try {
      // Notify seller
      await this.mailingService.sendPayoutCompletedEmail({
        to: transaction.metadata?.sellerEmail || '',
        sellerName: transaction.metadata?.sellerName || '',
        transactionId: transaction.id,
        amount: transaction.amount,
        description: transaction.description
      });

      // Notify buyer
      await this.mailingService.sendEscrowReleasedEmail({
        to: transaction.metadata?.buyerEmail || '',
        buyerName: transaction.metadata?.buyerName || '',
        transactionId: transaction.id,
        amount: transaction.amount,
        description: transaction.description
      });
    } catch (error) {
      console.error('[ESCROW] Failed to send notifications:', error);
    }
  }

  private async notifyEscrowRefunded(
    transaction: EscrowTransaction,
    reason: string
  ): Promise<void> {
    try {
      // Notify buyer
      await this.mailingService.sendRefundCompletedEmail({
        to: transaction.metadata?.buyerEmail || '',
        buyerName: transaction.metadata?.buyerName || '',
        transactionId: transaction.id,
        amount: transaction.amount,
        reason
      });

      // Notify seller
      await this.mailingService.sendRefundNoticeEmail({
        to: transaction.metadata?.sellerEmail || '',
        sellerName: transaction.metadata?.sellerName || '',
        transactionId: transaction.id,
        amount: transaction.amount,
        reason
      });
    } catch (error) {
      console.error('[ESCROW] Failed to send notifications:', error);
    }
  }

  // ==================== UTILITY METHODS ====================

  private generateTransactionId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10).toUpperCase();
    return `ESC-${timestamp}-${random}`;
  }
}