// services/status-poller.service.ts
import { PrismaClient } from '@prisma/client';
import { PesapalService } from './pesapal.service';
import { EscrowService } from './escrow.service';
import { PawaPayService } from './pawapay.service';
import { XentriPayService } from './xentripay.service';

const prisma = new PrismaClient();

export class StatusPollerService {
  private pollingInterval: NodeJS.Timeout | null = null;
  private isPolling: boolean = false;
  private pesapalService: PesapalService;
  private escrowService: EscrowService;
  private pawaPayService: PawaPayService;
  private xentriPayService: XentriPayService;
  private pollIntervalMs: number;

  constructor(
    pesapalService: PesapalService,
    escrowService: EscrowService,
    pawaPayService: PawaPayService,
    xentriPayService: XentriPayService,
    pollIntervalMs: number = 30000
  ) {
    this.pesapalService = pesapalService;
    this.escrowService = escrowService;
    this.pawaPayService = pawaPayService;
    this.xentriPayService = xentriPayService;
    this.pollIntervalMs = pollIntervalMs; // Default: 30 seconds
  }

  /**
   * Start polling for pending transactions
   */
  startPolling() {
    if (this.isPolling) {
      console.log('[STATUS_POLLER] Already polling');
      return;
    }

    console.log(`[STATUS_POLLER] Starting status polling (every ${this.pollIntervalMs / 1000}s)`);
    this.isPolling = true;

    // Run immediately on start
    this.pollPendingTransactions();

    // Then run on interval
    this.pollingInterval = setInterval(() => {
      this.pollPendingTransactions();
    }, this.pollIntervalMs);
  }

  /**
   * Stop polling
   */
  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    this.isPolling = false;
    console.log('[STATUS_POLLER] Stopped status polling');
  }

  /**
   * Poll all pending transactions and update their status
   */
  private async pollPendingTransactions() {
    try {
      console.log('[STATUS_POLLER] Starting polling cycle...');

      // Run all checks in parallel
      await Promise.allSettled([
        this.pollPendingEscrowTransactions(),
        this.pollPendingPawaPayTransactions(),
        this.pollPendingXentriPayTransactions()
      ]);

      console.log('[STATUS_POLLER] ✅ Polling cycle complete');

    } catch (error: any) {
      console.error('[STATUS_POLLER] ❌ Polling error:', error);
    }
  }

  /**
   * Poll Pesapal escrow transactions
   */
  private async pollPendingEscrowTransactions() {
    try {
      const cutoffDate = new Date();
      cutoffDate.setHours(cutoffDate.getHours() - 24);

      const pendingTransactions = await prisma.escrowTransaction.findMany({
        where: {
          status: 'PENDING',
          externalId: { not: null },
          createdAt: { gte: cutoffDate }
        },
        select: {
          id: true,
          reference: true,
          externalId: true,
          createdAt: true
        },
        take: 50
      });

      if (pendingTransactions.length === 0) {
        console.log('[STATUS_POLLER] No pending escrow transactions to check');
        return;
      }

      console.log(`[STATUS_POLLER] Checking ${pendingTransactions.length} pending escrow transactions...`);

      let updated = 0;
      let failed = 0;

      for (const transaction of pendingTransactions) {
        try {
          await this.checkEscrowTransactionStatus(transaction);
          updated++;
        } catch (error: any) {
          console.error(`[STATUS_POLLER] Failed to check escrow transaction ${transaction.reference}:`, error.message);
          failed++;
        }

        await this.delay(500);
      }

      console.log(`[STATUS_POLLER] ✅ Escrow poll complete: ${updated} checked, ${failed} failed`);

    } catch (error: any) {
      console.error('[STATUS_POLLER] ❌ Escrow polling error:', error);
    }
  }

  /**
   * Poll PawaPay transactions (deposits and payouts)
   */
  private async pollPendingPawaPayTransactions() {
    try {
      const cutoffDate = new Date();
      cutoffDate.setHours(cutoffDate.getHours() - 24);

      const pendingTransactions = await prisma.pawaPayTransaction.findMany({
        where: {
          status: { in: ['PENDING', 'ACCEPTED', 'SUBMITTED'] },
          createdAt: { gte: cutoffDate }
        },
        select: {
          id: true,
          transactionId: true,
          transactionType: true,
          status: true,
          createdAt: true
        },
        take: 50
      });

      if (pendingTransactions.length === 0) {
        console.log('[STATUS_POLLER] No pending PawaPay transactions to check');
        return;
      }

      console.log(`[STATUS_POLLER] Checking ${pendingTransactions.length} pending PawaPay transactions...`);

      let updated = 0;
      let failed = 0;

      for (const transaction of pendingTransactions) {
        try {
          await this.checkPawaPayTransactionStatus(transaction);
          updated++;
        } catch (error: any) {
          console.error(`[STATUS_POLLER] Failed to check PawaPay transaction ${transaction.transactionId}:`, error.message);
          failed++;
        }

        await this.delay(500);
      }

      console.log(`[STATUS_POLLER] ✅ PawaPay poll complete: ${updated} checked, ${failed} failed`);

    } catch (error: any) {
      console.error('[STATUS_POLLER] ❌ PawaPay polling error:', error);
    }
  }

  /**
   * Poll XentriPay transactions (collections and payouts)
   */
  private async pollPendingXentriPayTransactions() {
    try {
      const cutoffDate = new Date();
      cutoffDate.setHours(cutoffDate.getHours() - 24);

      // Check escrow transactions that use XentriPay
      const pendingTransactions = await prisma.escrowTransaction.findMany({
        where: {
          status: { in: ['PENDING', 'INITIATED'] },
          createdAt: { gte: cutoffDate }
        },
        select: {
          id: true,
          reference: true,
          status: true,
          metadata: true,
          createdAt: true
        },
        take: 50
      });

      if (pendingTransactions.length === 0) {
        console.log('[STATUS_POLLER] No pending XentriPay transactions to check');
        return;
      }

      console.log(`[STATUS_POLLER] Checking ${pendingTransactions.length} pending XentriPay transactions...`);

      let updated = 0;
      let failed = 0;

      for (const transaction of pendingTransactions) {
        try {
          await this.checkXentriPayTransactionStatus(transaction);
          updated++;
        } catch (error: any) {
          console.error(`[STATUS_POLLER] Failed to check XentriPay transaction ${transaction.reference}:`, error.message);
          failed++;
        }

        await this.delay(500);
      }

      console.log(`[STATUS_POLLER] ✅ XentriPay poll complete: ${updated} checked, ${failed} failed`);

    } catch (error: any) {
      console.error('[STATUS_POLLER] ❌ XentriPay polling error:', error);
    }
  }

  /**
   * Check status of a single escrow transaction (Pesapal)
   */
  private async checkEscrowTransactionStatus(transaction: any): Promise<void> {
    try {
      if (!transaction.externalId) {
        console.log(`[STATUS_POLLER] Skipping ${transaction.reference} - no tracking ID`);
        return;
      }

      console.log(`[STATUS_POLLER] Checking escrow ${transaction.reference} (${transaction.externalId})`);

      // Get current status from Pesapal
      const statusResponse = await this.pesapalService.getTransactionStatus(
        transaction.externalId
      );

      // Map to escrow status
      const newStatus = this.pesapalService.mapPesapalStatusToEscrowStatus(statusResponse);

      // If status changed, trigger webhook handler
      if (newStatus !== 'PENDING') {
        console.log(`[STATUS_POLLER] Status changed for ${transaction.reference}: PENDING → ${newStatus}`);

        await this.escrowService.handlePesapalWebhook({
          OrderTrackingId: transaction.externalId,
          OrderMerchantReference: transaction.reference,
          OrderNotificationType: 'STATUSCHECK'
        });
      } else {
        console.log(`[STATUS_POLLER] ${transaction.reference} still PENDING`);
      }

    } catch (error: any) {
      // Log but don't throw - we want to continue checking other transactions
      console.error(`[STATUS_POLLER] Error checking escrow ${transaction.reference}:`, error.message);
    }
  }

  /**
   * Check status of a single PawaPay transaction
   */
  private async checkPawaPayTransactionStatus(transaction: any): Promise<void> {
    try {
      console.log(`[STATUS_POLLER] Checking PawaPay ${transaction.transactionType} ${transaction.transactionId}`);

      let statusResponse: any;

      // Check based on transaction type
      if (transaction.transactionType === 'DEPOSIT') {
        statusResponse = await this.pawaPayService.getDepositStatus(transaction.transactionId);
      } else if (transaction.transactionType === 'PAYOUT') {
        statusResponse = await this.pawaPayService.getPayoutStatus(transaction.transactionId);
      } else if (transaction.transactionType === 'REFUND') {
        statusResponse = await this.pawaPayService.getRefundStatus(transaction.transactionId);
      } else {
        console.log(`[STATUS_POLLER] Unknown transaction type: ${transaction.transactionType}`);
        return;
      }

      const previousStatus = transaction.status;
      const newStatus = statusResponse.status;

      // Update if status changed
      if (newStatus !== previousStatus) {
        console.log(`[STATUS_POLLER] PawaPay status changed: ${previousStatus} → ${newStatus}`);

        const updateData: any = {
          status: newStatus,
          updatedAt: new Date()
        };

        // Add type-specific fields
        if (transaction.transactionType === 'DEPOSIT' && statusResponse.depositedAmount) {
          updateData.depositedAmount = statusResponse.depositedAmount;
        } else if (transaction.transactionType === 'PAYOUT' && statusResponse.amount) {
          updateData.depositedAmount = statusResponse.amount;
        } else if (transaction.transactionType === 'REFUND' && statusResponse.amount) {
          updateData.refundedAmount = statusResponse.amount;
        }

        // Add failure information
        if (statusResponse.failureReason) {
          updateData.failureCode = statusResponse.failureReason.failureCode;
          updateData.failureMessage = statusResponse.failureReason.failureMessage;
        }

        // Add provider transaction IDs if available
        if (statusResponse.providerTransactionId) {
          updateData.providerTransactionId = statusResponse.providerTransactionId;
        }
        if (statusResponse.financialTransactionId) {
          updateData.financialTransactionId = statusResponse.financialTransactionId;
        }

        // Set completion timestamp
        if (newStatus === 'COMPLETED' && !transaction.completedAt) {
          updateData.completedAt = new Date();
        }

        await prisma.pawaPayTransaction.update({
          where: { id: transaction.id },
          data: updateData
        });

        console.log(`[STATUS_POLLER] ✅ Updated PawaPay transaction ${transaction.transactionId}`);
      } else {
        console.log(`[STATUS_POLLER] PawaPay ${transaction.transactionId} still ${newStatus}`);
      }

    } catch (error: any) {
      console.error(`[STATUS_POLLER] Error checking PawaPay ${transaction.transactionId}:`, error.message);
    }
  }

  /**
   * Check status of a single XentriPay transaction
   */
  private async checkXentriPayTransactionStatus(transaction: any): Promise<void> {
    try {
      const metadata = transaction.metadata as any;
      const xentriPayRefId = metadata?.xentriPayRefId;
      const xentriPayInternalRef = metadata?.xentriPayInternalRef;

      console.log(`[STATUS_POLLER] Checking XentriPay ${transaction.reference}`);

      let statusResponse;
      let newStatus = transaction.status;

      // Check collection status if we have refId (deposit)
      if (xentriPayRefId && (transaction.status === 'PENDING' || transaction.status === 'INITIATED')) {
        statusResponse = await this.xentriPayService.getCollectionStatus(xentriPayRefId);

        if (statusResponse.status === 'SUCCESS') {
          newStatus = 'HELD';
        } else if (statusResponse.status === 'FAILED') {
          newStatus = 'FAILED';
        }
      }

      // Check payout status if we have customerReference (payout/release)
      if (xentriPayInternalRef && transaction.status === 'RELEASED') {
        const customerRef = metadata?.customerReference;
        if (customerRef) {
          const payoutStatus = await this.xentriPayService.getPayoutStatus(customerRef);

          // Update metadata with payout status
          metadata.payoutStatus = payoutStatus;
        }
      }

      // Update if status changed
      if (newStatus !== transaction.status) {
        console.log(`[STATUS_POLLER] XentriPay status changed: ${transaction.status} → ${newStatus}`);

        await prisma.escrowTransaction.update({
          where: { id: transaction.id },
          data: {
            status: newStatus,
            metadata: metadata,
            updatedAt: new Date()
          }
        });

        console.log(`[STATUS_POLLER] ✅ Updated XentriPay transaction ${transaction.reference}`);
      } else {
        console.log(`[STATUS_POLLER] XentriPay ${transaction.reference} still ${newStatus}`);
      }

    } catch (error: any) {
      console.error(`[STATUS_POLLER] Error checking XentriPay ${transaction.reference}:`, error.message);
    }
  }

  /**
   * Check a specific transaction by reference
   */
  async checkTransactionByReference(reference: string): Promise<void> {
    try {
      const transaction = await prisma.escrowTransaction.findFirst({
        where: { reference },
        select: {
          id: true,
          reference: true,
          externalId: true,
          status: true,
          createdAt: true
        }
      });

      if (!transaction) {
        throw new Error(`Transaction not found: ${reference}`);
      }

      if (transaction.status !== 'PENDING') {
        console.log(`[STATUS_POLLER] Transaction ${reference} is not pending (${transaction.status})`);
        return;
      }

      await this.checkEscrowTransactionStatus(transaction);

    } catch (error: any) {
      console.error(`[STATUS_POLLER] Failed to check transaction ${reference}:`, error);
      throw error;
    }
  }

  /**
   * Check a specific transaction by tracking ID
   */
  async checkTransactionByTrackingId(trackingId: string): Promise<void> {
    try {
      const transaction = await prisma.escrowTransaction.findFirst({
        where: { externalId: trackingId },
        select: {
          id: true,
          reference: true,
          externalId: true,
          status: true,
          createdAt: true
        }
      });

      if (!transaction) {
        throw new Error(`Transaction not found for tracking ID: ${trackingId}`);
      }

      if (transaction.status !== 'PENDING') {
        console.log(`[STATUS_POLLER] Transaction ${transaction.reference} is not pending (${transaction.status})`);
        return;
      }

      await this.checkEscrowTransactionStatus(transaction);

    } catch (error: any) {
      console.error(`[STATUS_POLLER] Failed to check transaction with tracking ID ${trackingId}:`, error);
      throw error;
    }
  }

  /**
   * Get polling status
   */
  getStatus(): {
    isPolling: boolean;
    pollIntervalMs: number;
  } {
    return {
      isPolling: this.isPolling,
      pollIntervalMs: this.pollIntervalMs
    };
  }

  /**
   * Utility function to add delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default StatusPollerService;