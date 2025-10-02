// services/status-poller.service.ts
import { PrismaClient } from '@prisma/client';
import { PesapalService } from './pesapal.service';
import { EscrowService } from './escrow.service';

const prisma = new PrismaClient();

export class StatusPollerService {
  private pollingInterval: NodeJS.Timeout | null = null;
  private isPolling: boolean = false;
  private pesapalService: PesapalService;
  private escrowService: EscrowService;
  private pollIntervalMs: number;

  constructor(pesapalService: PesapalService, escrowService: EscrowService, pollIntervalMs: number = 30000) {
    this.pesapalService = pesapalService;
    this.escrowService = escrowService;
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
      // Find all PENDING transactions that have a tracking ID and are less than 24 hours old
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
        take: 50 // Limit to 50 at a time to avoid overload
      });

      if (pendingTransactions.length === 0) {
        console.log('[STATUS_POLLER] No pending transactions to check');
        return;
      }

      console.log(`[STATUS_POLLER] Checking ${pendingTransactions.length} pending transactions...`);

      let updated = 0;
      let failed = 0;

      for (const transaction of pendingTransactions) {
        try {
          await this.checkTransactionStatus(transaction);
          updated++;
        } catch (error: any) {
          console.error(`[STATUS_POLLER] Failed to check transaction ${transaction.reference}:`, error.message);
          failed++;
        }

        // Add small delay between requests to avoid rate limiting
        await this.delay(500); // 500ms delay
      }

      console.log(`[STATUS_POLLER] ✅ Poll complete: ${updated} checked, ${failed} failed`);

    } catch (error: any) {
      console.error('[STATUS_POLLER] ❌ Polling error:', error);
    }
  }

  /**
   * Check status of a single transaction
   */
  private async checkTransactionStatus(transaction: any): Promise<void> {
    try {
      if (!transaction.externalId) {
        console.log(`[STATUS_POLLER] Skipping ${transaction.reference} - no tracking ID`);
        return;
      }

      console.log(`[STATUS_POLLER] Checking ${transaction.reference} (${transaction.externalId})`);

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
      console.error(`[STATUS_POLLER] Error checking ${transaction.reference}:`, error.message);
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

      await this.checkTransactionStatus(transaction);

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

      await this.checkTransactionStatus(transaction);

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