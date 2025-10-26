// services/status-poller.service.ts
import { PrismaClient } from '@prisma/client';
import { PawaPayService } from './pawapay.service';
import { XentriPayService } from './xentripay.service';
import { BrevoPaymentStatusMailingService } from '../utils/brevo.payment-status';
import withdrawalNotificationService from './withdrawal-notification.service';

const prisma = new PrismaClient();
const paymentEmailService = new BrevoPaymentStatusMailingService();

export class StatusPollerService {
  private pollingInterval: NodeJS.Timeout | null = null;
  private isPolling: boolean = false;
  private pawaPayService: PawaPayService;
  private xentriPayService: XentriPayService;
  private pollIntervalMs: number;

  // Configuration constants
  private readonly MAX_AGE_DAYS = 30; // Maximum 30 days old (increased from 10)
  private readonly ADMIN_EMAIL = 'admin@amoriaglobal.com';
  private readonly RECHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes for FAILED/PROCESSING
  private readonly COMPLETED_RECHECK_MS = 2 * 60 * 1000; // 2 minutes for COMPLETED transactions/INITIATED/ACCEPTED

  constructor(
    pawaPayService: PawaPayService,
    xentriPayService: XentriPayService,
    pollIntervalMs: number = 30 * 1000 // Default: 30 seconds for instant checking
  ) {
    this.pawaPayService = pawaPayService;
    this.xentriPayService = xentriPayService;
    this.pollIntervalMs = pollIntervalMs;
  }

  /**
   * Start polling for transactions
   */
  startPolling() {
    if (this.isPolling) {
      console.log('[STATUS_POLLER] Already polling');
      return;
    }

    const intervalSeconds = this.pollIntervalMs / 1000;
    console.log(`[STATUS_POLLER] Starting instant transaction status polling (every ${intervalSeconds} seconds)`);
    this.isPolling = true;

    // Run immediately on start
    this.pollAllTransactions();

    // Then run on interval
    this.pollingInterval = setInterval(() => {
      this.pollAllTransactions();
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
   * Poll all transactions instantly - no age restrictions for PENDING status
   * Checks all transaction types: deposits, payouts, withdrawals, refunds
   */
  private async pollAllTransactions() {
    try {
      console.log('[STATUS_POLLER] Starting instant polling cycle...');

      const now = new Date();
      const minDate = new Date(now.getTime() - this.MAX_AGE_DAYS * 24 * 60 * 60 * 1000); // 30 days ago
      const recheckDate = new Date(now.getTime() - this.RECHECK_INTERVAL_MS); // 10 minutes ago
      const completedRecheckDate = new Date(now.getTime() - this.COMPLETED_RECHECK_MS); // 2 minutes ago

      console.log(`[STATUS_POLLER] Checking all PENDING transactions (last ${this.MAX_AGE_DAYS} days)`);
      console.log(`[STATUS_POLLER] Rechecking FAILED/PROCESSING transactions (last 10 minutes)`);
      console.log(`[STATUS_POLLER] Rechecking COMPLETED transactions (last 2 minutes) for notifications/wallet updates`);

      // Run all checks in parallel
      await Promise.allSettled([
        this.pollPawaPayTransactions(minDate, recheckDate, completedRecheckDate),
        this.pollXentriPayTransactions(minDate, recheckDate, completedRecheckDate),
        this.pollWithdrawalRequests()
      ]);

      console.log('[STATUS_POLLER] ✅ Instant polling cycle complete');

    } catch (error: any) {
      console.error('[STATUS_POLLER] ❌ Polling error:', error);
    }
  }

  /**
   * DEPRECATED: Escrow system has been removed
   * Poll Pesapal/Escrow transactions that are COMPLETED or FAILED (2 hours to 10 days old)
   */
  // private async pollCompletedAndFailedEscrowTransactions(minDate: Date, maxDate: Date) {
  //   try {
  //     console.log('[STATUS_POLLER] Checking completed/failed Pesapal transactions...');
  //
  //     const transactions = await prisma.escrowTransaction.findMany({
  //       where: {
  //         status: { in: ['HELD', 'FAILED'] }, // HELD = payment successful, FAILED = payment failed
  //         externalId: { not: null },
  //         createdAt: {
  //           gte: minDate,
  //           lte: maxDate
  //         }
  //       },
  //       select: {
  //         id: true,
  //         reference: true,
  //         externalId: true,
  //         status: true,
  //         createdAt: true,
  //         statusCheckCount: true,
  //         lastStatusCheck: true,
  //         notificationCount: true,
  //         notificationSentAt: true
  //       },
  //       take: 100
  //     });
  //
  //     if (transactions.length === 0) {
  //       console.log('[STATUS_POLLER] No completed/failed escrow transactions to check');
  //       return;
  //     }
  //
  //     console.log(`[STATUS_POLLER] Found ${transactions.length} completed/failed escrow transactions to process`);
  //
  //     let processed = 0;
  //     let errors = 0;
  //
  //     for (const transaction of transactions) {
  //       try {
  //         await this.processEscrowTransactionForBooking(transaction);
  //         processed++;
  //       } catch (error: any) {
  //         console.error(`[STATUS_POLLER] Failed to process escrow transaction ${transaction.reference}:`, error.message);
  //         errors++;
  //       }
  //
  //       await this.delay(500); // Rate limiting
  //     }
  //
  //     console.log(`[STATUS_POLLER] ✅ Escrow: ${processed} processed, ${errors} errors`);
  //
  //   } catch (error: any) {
  //     console.error('[STATUS_POLLER] ❌ Escrow polling error:', error);
  //   }
  // }

  /**
   * Poll PawaPay transactions - instant check for PENDING, recheck FAILED/PROCESSING every 10 mins, COMPLETED every 2 mins
   * @param minDate - Oldest transaction to check (30 days ago)
   * @param recheckDate - Date for rechecking FAILED/PROCESSING (10 minutes ago)
   * @param completedRecheckDate - Date for rechecking COMPLETED transactions (2 minutes ago)
   */
  private async pollPawaPayTransactions(minDate: Date, recheckDate: Date, completedRecheckDate: Date) {
    try {
      console.log('[STATUS_POLLER] Checking PawaPay transactions...');

      // 1. Check ALL PENDING transactions (instant, no age limit except minDate)
      const pendingTransactions = await prisma.transaction.findMany({
        where: {
          provider: 'PAWAPAY',
          status: 'PENDING',
          createdAt: {
            gte: minDate
          }
        },
        select: {
          id: true,
          userId: true,
          reference: true,
          transactionType: true,
          status: true,
          createdAt: true,
          bookingId: true,
          metadata: true,
          statusCheckCount: true,
          lastStatusCheck: true
        },
        take: 100
      });

      // 2. Check FAILED/PROCESSING transactions that haven't been checked in last 10 minutes
      const recheckTransactions = await prisma.transaction.findMany({
        where: {
          provider: 'PAWAPAY',
          status: { in: ['FAILED', 'PROCESSING'] },
          createdAt: {
            gte: minDate
          },
          OR: [
            { lastStatusCheck: null },
            { lastStatusCheck: { lt: recheckDate } }
          ]
        },
        select: {
          id: true,
          userId: true,
          reference: true,
          transactionType: true,
          status: true,
          createdAt: true,
          bookingId: true,
          metadata: true,
          statusCheckCount: true,
          lastStatusCheck: true,
          failureCode: true,
          failureReason: true
        },
        take: 50
      });

      // 3. Check COMPLETED transactions every 2 minutes to ensure notifications/wallet updates
      // Check both: (a) never notified OR (b) not checked in last 2 minutes
      const completedTransactions = await prisma.transaction.findMany({
        where: {
          provider: 'PAWAPAY',
          status: 'COMPLETED',
          createdAt: {
            gte: minDate
          },
          OR: [
            { notificationSentAt: null }, // Never notified
            {
              AND: [
                { notificationSentAt: { not: null } }, // Already notified
                {
                  OR: [
                    { lastStatusCheck: null }, // Never checked
                    { lastStatusCheck: { lt: completedRecheckDate } } // Not checked in last 2 mins
                  ]
                }
              ]
            }
          ]
        },
        select: {
          id: true,
          userId: true,
          reference: true,
          transactionType: true,
          status: true,
          createdAt: true,
          bookingId: true,
          metadata: true,
          completedAt: true,
          notificationCount: true,
          notificationSentAt: true
        },
        take: 50
      });

      const totalCount = pendingTransactions.length + recheckTransactions.length + completedTransactions.length;
      if (totalCount === 0) {
        console.log('[STATUS_POLLER] No PawaPay transactions to check');
        return;
      }

      console.log(`[STATUS_POLLER] Found ${pendingTransactions.length} pending + ${recheckTransactions.length} recheck + ${completedTransactions.length} completed PawaPay transactions`);

      let polled = 0;
      let processed = 0;
      let errors = 0;

      // 1. Poll PENDING transactions to check their status (INSTANT)
      for (const transaction of pendingTransactions) {
        try {
          // Update status check tracking
          await prisma.transaction.update({
            where: { id: transaction.id },
            data: {
              statusCheckCount: { increment: 1 },
              lastStatusCheck: new Date()
            }
          });

          // Check status from PawaPay API
          const depositId = (transaction.metadata as any)?.depositId;
          if (depositId) {
            const status = await this.pawaPayService.getDepositStatus(depositId);

            // Update transaction if status changed
            const newStatus = this.mapPawaPayStatus(status.status);
            if (newStatus !== transaction.status) {
              // Extract failure reason as string
              let failureReasonStr: string | undefined;
              if (status.failureReason) {
                failureReasonStr = typeof status.failureReason === 'string'
                  ? status.failureReason
                  : JSON.stringify(status.failureReason);
              }

              await prisma.transaction.update({
                where: { id: transaction.id },
                data: {
                  status: newStatus,
                  completedAt: newStatus === 'COMPLETED' ? new Date() : null,
                  failureReason: failureReasonStr,
                  metadata: {
                    ...(transaction.metadata as any),
                    lastProviderCheck: status
                  }
                }
              });
              console.log(`[STATUS_POLLER] ✅ Updated PawaPay transaction ${transaction.reference}: ${transaction.status} → ${newStatus}`);
            }
          }

          polled++;
        } catch (error: any) {
          console.error(`[STATUS_POLLER] Failed to poll PawaPay transaction ${transaction.reference}:`, error.message);
          errors++;
        }

        await this.delay(300); // Rate limiting
      }

      // 2. Recheck FAILED/PROCESSING transactions (every 10 minutes)
      for (const transaction of recheckTransactions) {
        try {
          // Update status check tracking
          await prisma.transaction.update({
            where: { id: transaction.id },
            data: {
              statusCheckCount: { increment: 1 },
              lastStatusCheck: new Date()
            }
          });

          // Check status from PawaPay API
          const depositId = (transaction.metadata as any)?.depositId;
          if (depositId) {
            const status = await this.pawaPayService.getDepositStatus(depositId);
            const newStatus = this.mapPawaPayStatus(status.status);

            if (newStatus !== transaction.status) {
              let failureReasonStr: string | undefined;
              if (status.failureReason) {
                failureReasonStr = typeof status.failureReason === 'string'
                  ? status.failureReason
                  : JSON.stringify(status.failureReason);
              }

              await prisma.transaction.update({
                where: { id: transaction.id },
                data: {
                  status: newStatus,
                  completedAt: newStatus === 'COMPLETED' ? new Date() : null,
                  failureReason: failureReasonStr,
                  metadata: {
                    ...(transaction.metadata as any),
                    lastProviderCheck: status
                  }
                }
              });
              console.log(`[STATUS_POLLER] ✅ Rechecked PawaPay transaction ${transaction.reference}: ${transaction.status} → ${newStatus}`);
            }
          }

          polled++;
        } catch (error: any) {
          console.error(`[STATUS_POLLER] Failed to recheck PawaPay transaction ${transaction.reference}:`, error.message);
          errors++;
        }

        await this.delay(300); // Rate limiting
      }

      // 3. Process COMPLETED transactions for booking confirmations and notifications
      for (const transaction of completedTransactions) {
        try {
          await this.processPawaPayTransactionForBooking(transaction);
          processed++;
        } catch (error: any) {
          console.error(`[STATUS_POLLER] Failed to process PawaPay transaction ${transaction.reference}:`, error.message);
          errors++;
        }

        await this.delay(300); // Rate limiting
      }

      console.log(`[STATUS_POLLER] ✅ PawaPay: ${polled} polled/rechecked, ${processed} processed, ${errors} errors`);

    } catch (error: any) {
      console.error('[STATUS_POLLER] ❌ PawaPay polling error:', error);
    }
  }

  /**
   * Poll XentriPay transactions - instant check for PENDING, recheck FAILED/PROCESSING every 10 mins, COMPLETED every 2 mins
   * Handles both DEPOSIT (card/mobile money collections) and PAYOUT (withdrawals/refunds)
   * @param minDate - Oldest transaction to check (30 days ago)
   * @param recheckDate - Date for rechecking FAILED/PROCESSING (10 minutes ago)
   * @param completedRecheckDate - Date for rechecking COMPLETED transactions (2 minutes ago)
   */
  private async pollXentriPayTransactions(minDate: Date, recheckDate: Date, completedRecheckDate: Date) {
    try {
      console.log('[STATUS_POLLER] Checking XentriPay transactions...');

      // 1. Check ALL PENDING transactions (instant, no age limit except minDate)
      const pendingTransactions = await prisma.transaction.findMany({
        where: {
          provider: 'XENTRIPAY',
          status: 'PENDING',
          createdAt: {
            gte: minDate
          }
        },
        select: {
          id: true,
          userId: true,
          reference: true,
          transactionType: true,
          status: true,
          createdAt: true,
          bookingId: true,
          metadata: true,
          statusCheckCount: true,
          lastStatusCheck: true
        },
        take: 100
      });

      // 2. Check FAILED/PROCESSING transactions that haven't been checked in last 10 minutes
      const recheckTransactions = await prisma.transaction.findMany({
        where: {
          provider: 'XENTRIPAY',
          status: { in: ['FAILED', 'PROCESSING'] },
          createdAt: {
            gte: minDate
          },
          OR: [
            { lastStatusCheck: null },
            { lastStatusCheck: { lt: recheckDate } }
          ]
        },
        select: {
          id: true,
          userId: true,
          reference: true,
          transactionType: true,
          status: true,
          createdAt: true,
          bookingId: true,
          metadata: true,
          statusCheckCount: true,
          lastStatusCheck: true,
          failureCode: true,
          failureReason: true
        },
        take: 50
      });

      // 3. Check COMPLETED transactions every 2 minutes to ensure notifications/wallet updates
      // Check both: (a) never notified OR (b) not checked in last 2 minutes
      const completedTransactions = await prisma.transaction.findMany({
        where: {
          provider: 'XENTRIPAY',
          status: 'COMPLETED',
          createdAt: {
            gte: minDate
          },
          OR: [
            { notificationSentAt: null }, // Never notified
            {
              AND: [
                { notificationSentAt: { not: null } }, // Already notified
                {
                  OR: [
                    { lastStatusCheck: null }, // Never checked
                    { lastStatusCheck: { lt: completedRecheckDate } } // Not checked in last 2 mins
                  ]
                }
              ]
            }
          ]
        },
        select: {
          id: true,
          userId: true,
          reference: true,
          transactionType: true,
          status: true,
          createdAt: true,
          bookingId: true,
          metadata: true,
          completedAt: true,
          notificationCount: true,
          notificationSentAt: true
        },
        take: 50
      });

      const totalCount = pendingTransactions.length + recheckTransactions.length + completedTransactions.length;
      if (totalCount === 0) {
        console.log('[STATUS_POLLER] No XentriPay transactions to check');
        return;
      }

      console.log(`[STATUS_POLLER] Found ${pendingTransactions.length} pending + ${recheckTransactions.length} recheck + ${completedTransactions.length} completed XentriPay transactions`);

      let polled = 0;
      let processed = 0;
      let errors = 0;

      // 1. Poll PENDING transactions from provider API (INSTANT)
      for (const transaction of pendingTransactions) {
        try {
          await this.pollXentriPayTransactionStatus(transaction);
          polled++;
        } catch (error: any) {
          console.error(`[STATUS_POLLER] Failed to poll XentriPay transaction ${transaction.reference}:`, error.message);
          errors++;
        }

        await this.delay(300); // Rate limiting
      }

      // 2. Recheck FAILED/PROCESSING transactions (every 10 minutes)
      for (const transaction of recheckTransactions) {
        try {
          await this.pollXentriPayTransactionStatus(transaction);
          polled++;
        } catch (error: any) {
          console.error(`[STATUS_POLLER] Failed to recheck XentriPay transaction ${transaction.reference}:`, error.message);
          errors++;
        }

        await this.delay(300); // Rate limiting
      }

      // 3. Process COMPLETED transactions for booking confirmations and notifications
      for (const transaction of completedTransactions) {
        try {
          // Handle both DEPOSIT (card/collections) and PAYOUT (withdrawals)
          if (transaction.transactionType === 'DEPOSIT') {
            await this.processXentriPayDepositForBooking(transaction);
          } else if (transaction.transactionType === 'PAYOUT') {
            await this.processXentriPayPayout(transaction);
          }
          processed++;
        } catch (error: any) {
          console.error(`[STATUS_POLLER] Failed to process XentriPay transaction ${transaction.reference}:`, error.message);
          errors++;
        }

        await this.delay(300); // Rate limiting
      }

      console.log(`[STATUS_POLLER] ✅ XentriPay: ${polled} polled/rechecked, ${processed} processed, ${errors} errors`);

    } catch (error: any) {
      console.error('[STATUS_POLLER] ❌ XentriPay polling error:', error);
    }
  }

  /**
   * Poll XentriPay API for transaction status and update database
   */
  private async pollXentriPayTransactionStatus(transaction: any): Promise<void> {
    try {
      console.log(`[STATUS_POLLER] Polling XentriPay status for ${transaction.reference} (${transaction.transactionType})`);

      // Update status check tracking
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          statusCheckCount: { increment: 1 },
          lastStatusCheck: new Date()
        }
      });

      const metadata = transaction.metadata as any;
      let providerStatus: any;

      // Check status based on transaction type
      if (transaction.transactionType === 'DEPOSIT') {
        // For deposits (collections), use refid from metadata
        const refid = metadata?.refid || metadata?.xentriPayRefId;
        if (!refid) {
          console.warn(`[STATUS_POLLER] No refid found for deposit ${transaction.reference}`);
          return;
        }

        providerStatus = await this.xentriPayService.getCollectionStatus(refid);
        console.log(`[STATUS_POLLER] Collection status for ${refid}: ${providerStatus.status}`);

        // Update transaction status based on provider response
        const newStatus = this.mapXentriPayStatus(providerStatus.status);

        if (newStatus !== transaction.status) {
          await prisma.transaction.update({
            where: { id: transaction.id },
            data: {
              status: newStatus,
              completedAt: newStatus === 'COMPLETED' ? new Date() : null,
              metadata: {
                ...metadata,
                lastProviderCheck: providerStatus
              }
            }
          });

          console.log(`[STATUS_POLLER] ✅ Updated deposit ${transaction.reference}: ${transaction.status} → ${newStatus}`);
        }

      } else if (transaction.transactionType === 'PAYOUT') {
        // For payouts, use customerReference
        const customerRef = transaction.reference;

        providerStatus = await this.xentriPayService.getPayoutStatus(customerRef);
        console.log(`[STATUS_POLLER] Payout status for ${customerRef}: ${providerStatus.data?.status}`);

        // Update transaction status based on provider response
        const newStatus = this.mapXentriPayStatus(providerStatus.data?.status || providerStatus.status);

        if (newStatus !== transaction.status) {
          await prisma.transaction.update({
            where: { id: transaction.id },
            data: {
              status: newStatus,
              completedAt: newStatus === 'COMPLETED' ? new Date() : null,
              failureReason: providerStatus.message || undefined,
              metadata: {
                ...metadata,
                lastProviderCheck: providerStatus
              }
            }
          });

          console.log(`[STATUS_POLLER] ✅ Updated payout ${transaction.reference}: ${transaction.status} → ${newStatus}`);
        }
      }

    } catch (error: any) {
      console.error(`[STATUS_POLLER] Error polling XentriPay transaction:`, error);
      throw error;
    }
  }

  /**
   * Map XentriPay status to internal status
   */
  private mapXentriPayStatus(xentriPayStatus: string): 'PENDING' | 'COMPLETED' | 'FAILED' {
    const statusMap: Record<string, 'PENDING' | 'COMPLETED' | 'FAILED'> = {
      'SUCCESS': 'COMPLETED',
      'COMPLETED': 'COMPLETED',
      'PENDING': 'PENDING',
      'PROCESSING': 'PENDING',
      'FAILED': 'FAILED',
      'REJECTED': 'FAILED',
      'CANCELLED': 'FAILED'
    };

    return statusMap[xentriPayStatus?.toUpperCase()] || 'PENDING';
  }

  /**
   * Map PawaPay status to internal status
   */
  private mapPawaPayStatus(pawaPayStatus: string): 'PENDING' | 'COMPLETED' | 'FAILED' {
    const statusMap: Record<string, 'PENDING' | 'COMPLETED' | 'FAILED'> = {
      'ACCEPTED': 'PENDING',
      'SUBMITTED': 'PENDING',
      'COMPLETED': 'COMPLETED',
      'FAILED': 'FAILED',
      'REJECTED': 'FAILED'
    };

    return statusMap[pawaPayStatus?.toUpperCase()] || 'PENDING';
  }

  /**
   * DEPRECATED: Escrow system has been removed
   * Process escrow transaction (Pesapal) and update booking status
   */
  // private async processEscrowTransactionForBooking(transaction: any): Promise<void> {
  //   try {
  //     console.log(`[STATUS_POLLER] Processing escrow transaction ${transaction.reference} (status: ${transaction.status})`);
  //
  //     // Update status check tracking
  //     await prisma.escrowTransaction.update({
  //       where: { id: transaction.id },
  //       data: {
  //         statusCheckCount: { increment: 1 },
  //         lastStatusCheck: new Date()
  //       }
  //     });
  //
  //     // Find related booking
  //     const booking = await prisma.booking.findFirst({
  //       where: { transactionId: transaction.reference },
  //       include: {
  //         property: {
  //           include: {
  //             host: true,
  //             agent: true
  //           }
  //         },
  //         guest: true
  //       }
  //     });
  //
  //     if (!booking) {
  //       console.log(`[STATUS_POLLER] No booking found for transaction ${transaction.reference}`);
  //       return;
  //     }
  //
  //     console.log(`[STATUS_POLLER] Found booking ${booking.id} for transaction ${transaction.reference}`);
  //
  //     if (transaction.status === 'HELD') {
  //       // Payment successful
  //       await this.handleSuccessfulPayment('ESCROW', transaction.id, booking);
  //     } else if (transaction.status === 'FAILED') {
  //       // Payment failed
  //       await this.handleFailedPayment('ESCROW', transaction.id, booking);
  //     }
  //
  //   } catch (error: any) {
  //     console.error(`[STATUS_POLLER] Error processing escrow transaction:`, error);
  //     throw error;
  //   }
  // }

  /**
   * Process PawaPay transaction and update booking status
   */
  private async processPawaPayTransactionForBooking(transaction: any): Promise<void> {
    try {
      console.log(`[STATUS_POLLER] Processing PawaPay transaction ${transaction.reference} (status: ${transaction.status})`);

      // Update status check tracking
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          statusCheckCount: { increment: 1 },
          lastStatusCheck: new Date()
        }
      });

      const internalRef = transaction.bookingId || (transaction.metadata as any)?.internalReference;

      if (!internalRef) {
        console.log(`[STATUS_POLLER] No internal reference found for PawaPay transaction ${transaction.reference}`);
        return;
      }

      // Find property booking
      const booking = await prisma.booking.findFirst({
        where: { OR: [{ id: internalRef }, { transactionId: internalRef }] },
        include: {
          property: {
            include: {
              host: true,
              agent: true
            }
          },
          guest: true
        }
      });

      if (booking) {
        console.log(`[STATUS_POLLER] Found property booking ${booking.id}`);

        if (transaction.status === 'COMPLETED') {
          await this.handleSuccessfulPayment('PAWAPAY', transaction.id, booking);
        } else if (transaction.status === 'FAILED') {
          await this.handleFailedPayment('PAWAPAY', transaction.id, booking, transaction.failureReason);
        }
        return;
      }

      // Try tour booking
      const tourBooking = await prisma.tourBooking.findFirst({
        where: { id: internalRef },
        include: {
          tour: { include: { tourGuide: true } },
          schedule: true,
          user: true
        }
      });

      if (tourBooking) {
        console.log(`[STATUS_POLLER] Found tour booking ${tourBooking.id}`);

        if (transaction.status === 'COMPLETED') {
          await this.handleSuccessfulTourPayment('PAWAPAY', transaction.id, tourBooking);
        } else if (transaction.status === 'FAILED') {
          await this.handleFailedTourPayment('PAWAPAY', transaction.id, tourBooking, transaction.failureReason);
        }
        return;
      }

      console.log(`[STATUS_POLLER] No booking found for internal reference ${internalRef}`);

    } catch (error: any) {
      console.error(`[STATUS_POLLER] Error processing PawaPay transaction:`, error);
      throw error;
    }
  }

  /**
   * Process XentriPay deposit (card/mobile money collection) and update booking status
   */
  private async processXentriPayDepositForBooking(transaction: any): Promise<void> {
    try {
      console.log(`[STATUS_POLLER] Processing XentriPay deposit ${transaction.reference} (status: ${transaction.status})`);

      // Update status check tracking
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          statusCheckCount: { increment: 1 },
          lastStatusCheck: new Date()
        }
      });

      const internalRef = transaction.bookingId || (transaction.metadata as any)?.internalReference;

      if (!internalRef) {
        console.log(`[STATUS_POLLER] No internal reference found for XentriPay transaction ${transaction.reference}`);
        return;
      }

      // Find property booking
      const booking = await prisma.booking.findFirst({
        where: { OR: [{ id: internalRef }, { transactionId: internalRef }] },
        include: {
          property: {
            include: {
              host: true,
              agent: true
            }
          },
          guest: true
        }
      });

      if (booking) {
        console.log(`[STATUS_POLLER] Found property booking ${booking.id}`);

        if (transaction.status === 'COMPLETED') {
          await this.handleSuccessfulPayment('XENTRIPAY', transaction.id, booking);
        } else if (transaction.status === 'FAILED') {
          await this.handleFailedPayment('XENTRIPAY', transaction.id, booking, transaction.failureReason);
        }
        return;
      }

      // Try tour booking
      const tourBooking = await prisma.tourBooking.findFirst({
        where: { id: internalRef },
        include: {
          tour: { include: { tourGuide: true } },
          schedule: true,
          user: true
        }
      });

      if (tourBooking) {
        console.log(`[STATUS_POLLER] Found tour booking ${tourBooking.id}`);

        if (transaction.status === 'COMPLETED') {
          await this.handleSuccessfulTourPayment('XENTRIPAY', transaction.id, tourBooking);
        } else if (transaction.status === 'FAILED') {
          await this.handleFailedTourPayment('XENTRIPAY', transaction.id, tourBooking, transaction.failureReason);
        }
        return;
      }

      console.log(`[STATUS_POLLER] No booking found for internal reference ${internalRef}`);

    } catch (error: any) {
      console.error(`[STATUS_POLLER] Error processing XentriPay deposit:`, error);
      throw error;
    }
  }

  /**
   * Process XentriPay payout (withdrawal/refund) status
   * This handles withdrawals from PaymentTransaction table
   */
  private async processXentriPayPayout(transaction: any): Promise<void> {
    try {
      console.log(`[STATUS_POLLER] Processing XentriPay payout ${transaction.reference} (status: ${transaction.status})`);

      // Update status check tracking
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          statusCheckCount: { increment: 1 },
          lastStatusCheck: new Date()
        }
      });

      // For payouts, we mainly track status changes and send notifications
      const metadata = transaction.metadata as any;

      if (transaction.status === 'COMPLETED') {
        console.log(`[STATUS_POLLER] XentriPay payout ${transaction.reference} completed successfully`);

        // Check if notification was already sent
        const shouldNotify = await this.shouldSendNotification('XENTRIPAY', transaction.id);
        if (shouldNotify && metadata?.recipientEmail) {
          // TODO: Send payout completion notification
          await this.markNotificationSent('XENTRIPAY', transaction.id);
        }
      } else if (transaction.status === 'FAILED') {
        console.log(`[STATUS_POLLER] XentriPay payout ${transaction.reference} failed: ${transaction.failureReason}`);

        // Check if notification was already sent
        const shouldNotify = await this.shouldSendNotification('XENTRIPAY', transaction.id);
        if (shouldNotify && metadata?.recipientEmail) {
          // TODO: Send payout failure notification
          await this.markNotificationSent('XENTRIPAY', transaction.id);
        }
      }

    } catch (error: any) {
      console.error(`[STATUS_POLLER] Error processing XentriPay payout:`, error);
      throw error;
    }
  }

  /**
   * Poll APPROVED and FAILED withdrawal requests directly from withdrawal_requests table
   * Handles:
   * - APPROVED withdrawals (check status from XentriPay)
   * - FAILED withdrawals (ensure wallet refund processed)
   * - 24-hour expiry for APPROVED withdrawals
   * - Wallet updates and notifications for status changes
   *
   * Note: PENDING withdrawals are left alone - they await admin approval
   */
  async pollWithdrawalRequests(): Promise<void> {
    try {
      console.log('[STATUS_POLLER] Checking withdrawal requests (instant for PENDING/APPROVED)...');

      const now = new Date();
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const recheckDate = new Date(now.getTime() - 10 * 60 * 1000); // 10 minutes ago for rechecking
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Get ALL PENDING, APPROVED, and FAILED withdrawal requests (instant checking)
      const activeWithdrawals = await prisma.withdrawalRequest.findMany({
        where: {
          status: {
            in: ['PENDING', 'APPROVED', 'FAILED']
          },
          createdAt: {
            gte: thirtyDaysAgo // Last 30 days
          }
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true
            }
          }
        },
        orderBy: {
          createdAt: 'asc'
        },
        take: 100
      });

      console.log(`[STATUS_POLLER] Found ${activeWithdrawals.length} withdrawal requests to process (PENDING/APPROVED/FAILED)`);

      let pendingCount = 0;
      let approvedCount = 0;
      let failedCount = 0;
      let expiredCount = 0;
      let processedCount = 0;
      let refundedCount = 0;

      for (const withdrawal of activeWithdrawals) {
        try {
          if (withdrawal.status === 'PENDING') {
            pendingCount++;
            // PENDING withdrawals await admin approval - just log them
            console.log(`[STATUS_POLLER] Withdrawal ${withdrawal.reference} is PENDING admin approval`);

          } else if (withdrawal.status === 'APPROVED') {
            approvedCount++;

            // Check if approved more than 24 hours ago (expired)
            if (withdrawal.approvedAt && withdrawal.approvedAt < twentyFourHoursAgo) {
              expiredCount++;
              await this.handleExpiredWithdrawal(withdrawal);
            }
            // INSTANT CHECK: Check all APPROVED withdrawals immediately
            else {
              await this.checkWithdrawalStatusFromProvider(withdrawal);
              processedCount++;
            }

          } else if (withdrawal.status === 'FAILED') {
            failedCount++;

            // Check if this FAILED withdrawal has been refunded
            const wallet = await prisma.wallet.findUnique({
              where: { userId: withdrawal.userId }
            });

            if (!wallet) {
              console.warn(`[STATUS_POLLER] No wallet found for user ${withdrawal.userId} - skipping refund check`);
              continue;
            }

            // Check if refund has been processed by looking for wallet transaction
            const refundTransaction = await prisma.walletTransaction.findFirst({
              where: {
                walletId: wallet.id,
                reference: `REFUND-${withdrawal.reference}`,
                type: 'credit'
              }
            });

            if (!refundTransaction) {
              // Refund not yet processed - process it now
              console.log(`[STATUS_POLLER] Processing refund for FAILED withdrawal ${withdrawal.reference}`);

              await this.refundWalletForFailedWithdrawal(
                withdrawal.userId,
                withdrawal.amount,
                withdrawal.currency,
                withdrawal.reference,
                withdrawal.failureReason || 'Withdrawal failed'
              );

              // Send failure notification if not already sent
              await withdrawalNotificationService.notifyWithdrawalFailed({
                withdrawalId: withdrawal.id,
                userId: withdrawal.userId,
                userEmail: withdrawal.user.email,
                userFirstName: withdrawal.user.firstName,
                userLastName: withdrawal.user.lastName,
                userPhone: withdrawal.user.phone,
                amount: withdrawal.amount,
                currency: withdrawal.currency,
                method: withdrawal.method,
                status: 'FAILED',
                reference: withdrawal.reference,
                failureReason: withdrawal.failureReason || 'Withdrawal processing failed'
              });

              refundedCount++;
            } else {
              console.log(`[STATUS_POLLER] Withdrawal ${withdrawal.reference} already refunded - skipping`);
            }
          }

          await this.delay(300); // Rate limiting
        } catch (error: any) {
          console.error(`[STATUS_POLLER] Error processing withdrawal ${withdrawal.reference}:`, error);
        }
      }

      console.log('[STATUS_POLLER] ✅ Withdrawal polling complete:', {
        total: activeWithdrawals.length,
        pending: pendingCount,
        approved: approvedCount,
        failed: failedCount,
        expired: expiredCount,
        processed: processedCount,
        refunded: refundedCount
      });

    } catch (error: any) {
      console.error('[STATUS_POLLER] ❌ Withdrawal polling error:', error);
    }
  }

  /**
   * Handle expired withdrawal (APPROVED > 24 hours)
   */
  private async handleExpiredWithdrawal(withdrawal: any): Promise<void> {
    try {
      console.log(`[STATUS_POLLER] Marking withdrawal ${withdrawal.id} as expired`);

      // Update withdrawal request as failed
      await prisma.withdrawalRequest.update({
        where: { id: withdrawal.id },
        data: {
          status: 'FAILED',
          failureReason: 'Withdrawal expired after 24 hours',
          updatedAt: new Date()
        }
      });

      // Find associated payment transaction and mark as failed
      const paymentTransaction = await prisma.paymentTransaction.findFirst({
        where: {
          metadata: {
            path: ['withdrawalRequestId'],
            equals: withdrawal.id
          }
        }
      });

      if (paymentTransaction && paymentTransaction.status === 'PROCESSING') {
        await prisma.paymentTransaction.update({
          where: { id: paymentTransaction.id },
          data: {
            status: 'FAILED',
            failureReason: 'Withdrawal expired after 24 hours'
          }
        });
      }

      // Refund wallet for expired withdrawal
      await this.refundWalletForFailedWithdrawal(
        withdrawal.userId,
        withdrawal.amount,
        withdrawal.currency,
        withdrawal.reference,
        'Withdrawal expired after 24 hours'
      );

      // Send expiry notification using withdrawal notification service
      await withdrawalNotificationService.notifyWithdrawalExpired({
        withdrawalId: withdrawal.id,
        userId: withdrawal.userId,
        userEmail: withdrawal.user.email,
        userFirstName: withdrawal.user.firstName,
        userLastName: withdrawal.user.lastName,
        userPhone: withdrawal.user.phone,
        amount: withdrawal.amount,
        currency: withdrawal.currency,
        method: withdrawal.method,
        status: 'EXPIRED',
        reference: withdrawal.reference,
        failureReason: 'Withdrawal expired after 24 hours without processing'
      });

      console.log(`[STATUS_POLLER] ✅ Withdrawal ${withdrawal.id} marked as expired and refunded`);

    } catch (error: any) {
      console.error(`[STATUS_POLLER] Error handling expired withdrawal:`, error);
    }
  }

  /**
   * Check withdrawal status from XentriPay provider
   * Works directly with withdrawal_requests table
   */
  private async checkWithdrawalStatusFromProvider(withdrawal: any): Promise<void> {
    try {
      console.log(`[STATUS_POLLER] Checking withdrawal ${withdrawal.reference} status from provider`);

      // Check status from XentriPay using withdrawal reference
      const providerStatus = await this.xentriPayService.getPayoutStatus(withdrawal.reference);
      console.log(`[STATUS_POLLER] XentriPay status for ${withdrawal.reference}:`, providerStatus.data?.status);

      const newStatus = this.mapXentriPayStatus(providerStatus.data?.status);

      if (newStatus !== withdrawal.status) {
        console.log(`[STATUS_POLLER] Status changed: ${withdrawal.status} → ${newStatus}`);

        // Update withdrawal request
        await prisma.withdrawalRequest.update({
          where: { id: withdrawal.id },
          data: {
            status: newStatus,
            completedAt: newStatus === 'COMPLETED' ? new Date() : null,
            failureReason: newStatus === 'FAILED' ? (providerStatus.message || 'Provider reported failure') : undefined,
            updatedAt: new Date()
          }
        });

        // Process wallet changes and notifications based on new status
        if (newStatus === 'COMPLETED') {
          // Finalize successful withdrawal - reduce pending balance
          await this.finalizeSuccessfulWithdrawal(
            withdrawal.userId,
            withdrawal.amount,
            withdrawal.currency,
            withdrawal.reference
          );

          // Send completion notification
          await withdrawalNotificationService.notifyWithdrawalCompleted({
            withdrawalId: withdrawal.id,
            userId: withdrawal.userId,
            userEmail: withdrawal.user.email,
            userFirstName: withdrawal.user.firstName,
            userLastName: withdrawal.user.lastName,
            userPhone: withdrawal.user.phone,
            amount: withdrawal.amount,
            currency: withdrawal.currency,
            method: withdrawal.method,
            status: 'COMPLETED',
            reference: withdrawal.reference
          });

        } else if (newStatus === 'FAILED') {
          // Refund wallet for failed withdrawal
          await this.refundWalletForFailedWithdrawal(
            withdrawal.userId,
            withdrawal.amount,
            withdrawal.currency,
            withdrawal.reference,
            providerStatus.message || 'Provider reported failure'
          );

          // Send failure notification
          await withdrawalNotificationService.notifyWithdrawalFailed({
            withdrawalId: withdrawal.id,
            userId: withdrawal.userId,
            userEmail: withdrawal.user.email,
            userFirstName: withdrawal.user.firstName,
            userLastName: withdrawal.user.lastName,
            userPhone: withdrawal.user.phone,
            amount: withdrawal.amount,
            currency: withdrawal.currency,
            method: withdrawal.method,
            status: 'FAILED',
            reference: withdrawal.reference,
            failureReason: providerStatus.message || 'Provider reported failure'
          });
        }

        console.log(`[STATUS_POLLER] ✅ Updated withdrawal ${withdrawal.reference}: ${withdrawal.status} → ${newStatus}`);
      } else {
        console.log(`[STATUS_POLLER] No status change for ${withdrawal.reference} - still ${withdrawal.status}`);
      }

    } catch (error: any) {
      // Handle case where XentriPay doesn't have the payment record
      if (error.message?.includes('not found') || error.response?.status === 404) {
        console.warn(`[STATUS_POLLER] ⚠️ Withdrawal ${withdrawal.reference} not found at XentriPay - payout may not have been sent`);

        // Check if approved more than 1 hour ago - if so, mark as failed
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        if (withdrawal.approvedAt && withdrawal.approvedAt < oneHourAgo) {
          console.log(`[STATUS_POLLER] Marking withdrawal ${withdrawal.reference} as FAILED - not found at provider after 1 hour`);

          // Update withdrawal as failed
          await prisma.withdrawalRequest.update({
            where: { id: withdrawal.id },
            data: {
              status: 'FAILED',
              failureReason: 'Payment not found at provider - payout may not have been sent',
              updatedAt: new Date()
            }
          });

          // Refund wallet
          await this.refundWalletForFailedWithdrawal(
            withdrawal.userId,
            withdrawal.amount,
            withdrawal.currency,
            withdrawal.reference,
            'Payment not found at provider - payout may not have been sent'
          );

          // Send failure notification
          await withdrawalNotificationService.notifyWithdrawalFailed({
            withdrawalId: withdrawal.id,
            userId: withdrawal.userId,
            userEmail: withdrawal.user.email,
            userFirstName: withdrawal.user.firstName,
            userLastName: withdrawal.user.lastName,
            userPhone: withdrawal.user.phone,
            amount: withdrawal.amount,
            currency: withdrawal.currency,
            method: withdrawal.method,
            status: 'FAILED',
            reference: withdrawal.reference,
            failureReason: 'Payment not found at provider - payout may not have been sent'
          });
        } else {
          console.log(`[STATUS_POLLER] Withdrawal ${withdrawal.reference} recently approved - will retry later`);
        }
      } else {
        console.error(`[STATUS_POLLER] ❌ Error checking withdrawal status from provider:`, error);
      }
    }
  }

  /**
   * DEPRECATED: Check withdrawal payment status from XentriPay
   * Use checkWithdrawalStatusFromProvider instead
   */
  private async checkWithdrawalPaymentStatus(payment: any): Promise<void> {
    try {
      console.log(`[STATUS_POLLER] Checking withdrawal payment status: ${payment.reference}`);

      const metadata = payment.metadata as any;
      const withdrawalReference = metadata?.withdrawalReference;

      if (!withdrawalReference) {
        console.warn(`[STATUS_POLLER] No withdrawal reference found for payment ${payment.id}`);
        return;
      }

      // Check status from XentriPay
      const providerStatus = await this.xentriPayService.getPayoutStatus(withdrawalReference);
      console.log(`[STATUS_POLLER] XentriPay status for ${withdrawalReference}:`, providerStatus.data?.status);

      const newStatus = this.mapXentriPayStatus(providerStatus.data?.status);

      if (newStatus !== payment.status) {
        // Update payment transaction
        await prisma.paymentTransaction.update({
          where: { id: payment.id },
          data: {
            status: newStatus,
            completedAt: newStatus === 'COMPLETED' ? new Date() : null,
            failureReason: newStatus === 'FAILED' ? providerStatus.message : undefined,
            metadata: {
              ...metadata,
              lastProviderCheck: {
                checkedAt: new Date().toISOString(),
                response: providerStatus
              }
            }
          }
        });

        // Update associated withdrawal request
        const withdrawalRequestId = metadata?.withdrawalRequestId;
        if (withdrawalRequestId) {
          await prisma.withdrawalRequest.update({
            where: { id: withdrawalRequestId },
            data: {
              status: newStatus === 'COMPLETED' ? 'COMPLETED' : newStatus === 'FAILED' ? 'FAILED' : 'APPROVED',
              completedAt: newStatus === 'COMPLETED' ? new Date() : null,
              failureReason: newStatus === 'FAILED' ? providerStatus.message : undefined,
              updatedAt: new Date()
            }
          });
        }

        console.log(`[STATUS_POLLER] ✅ Updated withdrawal payment ${payment.reference}: ${payment.status} → ${newStatus}`);
      }

    } catch (error: any) {
      console.error(`[STATUS_POLLER] Error checking withdrawal payment status:`, error);
    }
  }

  /**
   * DEPRECATED: Process withdrawal payment completion (refund wallet if failed)
   * Now handled by checkWithdrawalStatusFromProvider which works directly with withdrawal_requests
   */
  private async processWithdrawalPaymentCompletion(payment: any): Promise<void> {
    try {
      console.log(`[STATUS_POLLER] Processing withdrawal payment completion: ${payment.reference} (${payment.status})`);

      const metadata = payment.metadata as any;
      const withdrawalRequestId = metadata?.withdrawalRequestId;

      // Get withdrawal request and user
      const withdrawal = withdrawalRequestId ? await prisma.withdrawalRequest.findUnique({
        where: { id: withdrawalRequestId },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true
            }
          }
        }
      }) : null;

      if (!withdrawal) {
        console.warn(`[STATUS_POLLER] No withdrawal request found for payment ${payment.id}`);
        // Mark as processed even if not found
        await prisma.paymentTransaction.update({
          where: { id: payment.id },
          data: {
            metadata: {
              ...metadata,
              walletProcessed: true,
              processedAt: new Date().toISOString()
            }
          }
        });
        return;
      }

      if (payment.status === 'FAILED') {
        // Refund wallet for failed withdrawal
        console.log(`[STATUS_POLLER] Refunding wallet for failed withdrawal: ${payment.amount} ${payment.currency}`);

        await this.refundWalletForFailedWithdrawal(
          withdrawal.userId,
          payment.amount,
          payment.currency,
          payment.reference,
          payment.failureReason || 'Withdrawal failed'
        );

        // Update withdrawal request status to FAILED
        await prisma.withdrawalRequest.update({
          where: { id: withdrawal.id },
          data: {
            status: 'FAILED',
            failureReason: payment.failureReason || 'Withdrawal processing failed',
            updatedAt: new Date()
          }
        });

        // Send failure notification using withdrawal notification service
        await withdrawalNotificationService.notifyWithdrawalFailed({
          withdrawalId: withdrawal.id,
          userId: withdrawal.userId,
          userEmail: withdrawal.user.email,
          userFirstName: withdrawal.user.firstName,
          userLastName: withdrawal.user.lastName,
          userPhone: withdrawal.user.phone,
          amount: payment.amount,
          currency: payment.currency,
          method: withdrawal.method,
          status: 'FAILED',
          reference: withdrawal.reference,
          failureReason: payment.failureReason || 'Withdrawal processing failed'
        });

      } else if (payment.status === 'COMPLETED') {
        // Reduce pending balance for successful withdrawal
        console.log(`[STATUS_POLLER] Finalizing successful withdrawal: ${payment.amount} ${payment.currency}`);

        await this.finalizeSuccessfulWithdrawal(
          withdrawal.userId,
          payment.amount,
          payment.currency,
          payment.reference
        );

        // Update withdrawal request status to COMPLETED
        await prisma.withdrawalRequest.update({
          where: { id: withdrawal.id },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            updatedAt: new Date()
          }
        });

        // Send success notification using withdrawal notification service
        await withdrawalNotificationService.notifyWithdrawalCompleted({
          withdrawalId: withdrawal.id,
          userId: withdrawal.userId,
          userEmail: withdrawal.user.email,
          userFirstName: withdrawal.user.firstName,
          userLastName: withdrawal.user.lastName,
          userPhone: withdrawal.user.phone,
          amount: payment.amount,
          currency: payment.currency,
          method: withdrawal.method,
          status: 'COMPLETED',
          reference: withdrawal.reference
        });
      }

      // Mark as processed
      await prisma.paymentTransaction.update({
        where: { id: payment.id },
        data: {
          metadata: {
            ...metadata,
            walletProcessed: true,
            processedAt: new Date().toISOString()
          }
        }
      });

      console.log(`[STATUS_POLLER] ✅ Withdrawal payment completion processed`);

    } catch (error: any) {
      console.error(`[STATUS_POLLER] Error processing withdrawal completion:`, error);
    }
  }

  /**
   * Finalize successful withdrawal
   * Reduces pendingBalance since money has been sent out
   */
  private async finalizeSuccessfulWithdrawal(
    userId: number,
    amount: number,
    currency: string,
    reference: string
  ): Promise<void> {
    try {
      console.log(`[STATUS_POLLER] Finalizing successful withdrawal: ${amount} ${currency} for user ${userId}`);

      // Get wallet
      const wallet = await prisma.wallet.findUnique({
        where: { userId }
      });

      if (!wallet) {
        console.warn(`[STATUS_POLLER] Wallet not found for user ${userId} during withdrawal finalization`);
        return;
      }

      // Calculate new pending balance (reduce by withdrawal amount)
      const newPendingBalance = Math.max(0, wallet.pendingBalance - amount);

      console.log(`[STATUS_POLLER] Finalizing withdrawal for user ${userId}:`, {
        balance: wallet.balance,
        oldPending: wallet.pendingBalance,
        newPending: newPendingBalance,
        withdrawalAmount: amount
      });

      // Update wallet - reduce pending balance
      await prisma.wallet.update({
        where: { userId },
        data: {
          pendingBalance: newPendingBalance
        }
      });

      // Create wallet transaction record for completed withdrawal
      await prisma.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'debit',
          amount: amount,
          balanceBefore: wallet.balance,
          balanceAfter: wallet.balance, // Balance doesn't change (was already deducted)
          reference: `WITHDRAWAL-COMPLETE-${reference}`,
          description: `Withdrawal completed - funds sent successfully (pending balance reduced)`,
          transactionId: reference
        }
      });

      console.log(`[STATUS_POLLER] ✅ Withdrawal finalized: pending reduced by ${amount} ${currency}`);

    } catch (error: any) {
      console.error(`[STATUS_POLLER] Error finalizing successful withdrawal:`, error);
      throw error;
    }
  }

  /**
   * Refund wallet for failed withdrawal
   * Moves money from pendingBalance back to balance
   */
  private async refundWalletForFailedWithdrawal(
    userId: number,
    amount: number,
    currency: string,
    reference: string,
    failureReason: string
  ): Promise<void> {
    try {
      console.log(`[STATUS_POLLER] Refunding ${amount} ${currency} to user ${userId}'s wallet`);

      // Get or create wallet
      let wallet = await prisma.wallet.findUnique({
        where: { userId }
      });

      if (!wallet) {
        console.warn(`[STATUS_POLLER] Wallet not found for user ${userId}, creating new wallet`);
        wallet = await prisma.wallet.create({
          data: {
            userId,
            balance: amount, // Set initial balance to refund amount
            pendingBalance: 0,
            currency: currency,
            isActive: true
          }
        });

        // Create initial wallet transaction
        await prisma.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type: 'credit',
            amount: amount,
            balanceBefore: 0,
            balanceAfter: amount,
            reference: `REFUND-${reference}`,
            description: `Withdrawal refund - ${failureReason}`,
            transactionId: reference
          }
        });

        console.log(`[STATUS_POLLER] ✅ New wallet created and funded with refund: ${amount} ${currency}`);
        return;
      }

      // Calculate new balances
      // Move from pendingBalance back to balance
      const newPendingBalance = Math.max(0, wallet.pendingBalance - amount);
      const newBalance = wallet.balance + amount;

      console.log(`[STATUS_POLLER] Wallet balances for user ${userId}:`, {
        oldBalance: wallet.balance,
        oldPending: wallet.pendingBalance,
        newBalance,
        newPending: newPendingBalance,
        refundAmount: amount
      });

      // Update wallet - move from pending to balance
      await prisma.wallet.update({
        where: { userId },
        data: {
          balance: newBalance,
          pendingBalance: newPendingBalance
        }
      });

      // Create wallet transaction record for refund
      // This shows the money moving from pending back to available balance
      await prisma.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'credit',
          amount: amount,
          balanceBefore: wallet.balance,
          balanceAfter: newBalance,
          reference: `REFUND-${reference}`,
          description: `Withdrawal refund - ${failureReason} (moved from pending to balance)`,
          transactionId: reference
        }
      });

      console.log(`[STATUS_POLLER] ✅ Wallet refunded: +${amount} to balance, -${amount} from pending (Reason: ${failureReason})`);

    } catch (error: any) {
      console.error(`[STATUS_POLLER] Error refunding wallet:`, error);
      throw error;
    }
  }


  /**
   * Handle successful payment - confirm booking and send notifications
   * Works for ALL providers: PAWAPAY, XENTRIPAY, etc.
   */
  private async handleSuccessfulPayment(
    provider: 'ESCROW' | 'PAWAPAY' | 'XENTRIPAY',
    transactionId: string,
    booking: any
  ): Promise<void> {
    try {
      console.log(`[STATUS_POLLER] Handling successful payment for booking ${booking.id} (provider: ${provider})`);

      const isAlreadyConfirmed = booking.status === 'confirmed' && booking.paymentStatus === 'completed';
      const shouldSendNotification = await this.shouldSendNotification(provider, transactionId);

      // Skip if already confirmed AND notifications already sent
      if (isAlreadyConfirmed && !shouldSendNotification) {
        console.log(`[STATUS_POLLER] Booking ${booking.id} already confirmed and notifications sent - skipping`);
        return;
      }

      // Update booking status to confirmed (if not already)
      if (!isAlreadyConfirmed) {
        await prisma.booking.update({
          where: { id: booking.id },
          data: {
            paymentStatus: 'completed',
            status: 'confirmed'
          }
        });
        console.log(`[STATUS_POLLER] ✅ Booking ${booking.id} marked as confirmed`);
      } else {
        console.log(`[STATUS_POLLER] Booking ${booking.id} already confirmed, skipping status update`);
      }

      // Fund wallets for host, agent (if exists), and platform
      const transaction = await prisma.transaction.findUnique({
        where: { id: transactionId },
        select: { reference: true }
      });
      if (transaction) {
        await this.fundWalletsForBooking(booking, transaction.reference).catch(err =>
          console.error('[STATUS_POLLER] Failed to fund wallets:', err)
        );
      }

      // Send notifications (if not already sent)
      if (shouldSendNotification) {
        await this.sendSuccessfulPaymentNotifications(provider, transactionId, booking);
      } else {
        console.log(`[STATUS_POLLER] Notifications already sent for transaction ${transactionId}`);
      }

    } catch (error: any) {
      console.error(`[STATUS_POLLER] Error handling successful payment:`, error);
      throw error;
    }
  }

  /**
   * Handle failed payment - mark booking as failed and send notifications
   */
  private async handleFailedPayment(
    provider: 'ESCROW' | 'PAWAPAY' | 'XENTRIPAY',
    transactionId: string,
    booking: any,
    failureReason?: string
  ): Promise<void> {
    try {
      console.log(`[STATUS_POLLER] Handling failed payment for booking ${booking.id} (provider: ${provider})`);

      // Check if booking is already failed
      if (booking.status === 'failed' && booking.paymentStatus === 'failed') {
        // Only skip if both payment and booking are failed
        console.log(`[STATUS_POLLER] Booking ${booking.id} already marked as failed - skipping notification`);
        return; // Don't send notification if already failed
      }

      // Update booking status to failed
      await prisma.booking.update({
        where: { id: booking.id },
        data: {
          paymentStatus: 'failed',
          status: 'failed'
        }
      });

      console.log(`[STATUS_POLLER] ✅ Booking ${booking.id} marked as failed`);

      // Send notifications (only if not already sent)
      const shouldNotify = await this.shouldSendNotification(provider, transactionId);
      if (shouldNotify) {
        await this.sendFailedPaymentNotifications(provider, transactionId, booking, failureReason);
      } else {
        console.log(`[STATUS_POLLER] Notifications already sent for failed transaction ${transactionId}`);
      }

    } catch (error: any) {
      console.error(`[STATUS_POLLER] Error handling failed payment:`, error);
      throw error;
    }
  }

  /**
   * Handle successful tour payment
   * Works for ALL providers: PAWAPAY, XENTRIPAY, etc.
   */
  private async handleSuccessfulTourPayment(
    provider: 'PAWAPAY' | 'XENTRIPAY',
    transactionId: string,
    tourBooking: any
  ): Promise<void> {
    try {
      console.log(`[STATUS_POLLER] Handling successful tour payment for booking ${tourBooking.id}`);

      const isAlreadyConfirmed = tourBooking.status === 'confirmed' && tourBooking.paymentStatus === 'completed';
      const shouldSendNotification = await this.shouldSendNotification(provider, transactionId);

      // Skip if already confirmed AND notifications already sent
      if (isAlreadyConfirmed && !shouldSendNotification) {
        console.log(`[STATUS_POLLER] Tour booking ${tourBooking.id} already confirmed and notifications sent - skipping`);
        return;
      }

      // Update booking status to confirmed (if not already)
      if (!isAlreadyConfirmed) {
        await prisma.tourBooking.update({
          where: { id: tourBooking.id },
          data: {
            paymentStatus: 'completed',
            status: 'confirmed'
          }
        });
        console.log(`[STATUS_POLLER] ✅ Tour booking ${tourBooking.id} marked as confirmed`);
      } else {
        console.log(`[STATUS_POLLER] Tour booking ${tourBooking.id} already confirmed, skipping status update`);
      }

      // Fund wallets for tour guide and platform
      const transaction = await prisma.transaction.findUnique({
        where: { id: transactionId },
        select: { reference: true }
      });
      if (transaction) {
        await this.fundWalletsForTourBooking(tourBooking, transaction.reference).catch(err =>
          console.error('[STATUS_POLLER] Failed to fund tour wallets:', err)
        );
      }

      // Send notifications (if not already sent)
      if (shouldSendNotification) {
        await this.sendSuccessfulTourPaymentNotifications(provider, transactionId, tourBooking);
      } else {
        console.log(`[STATUS_POLLER] Notifications already sent for transaction ${transactionId}`);
      }

    } catch (error: any) {
      console.error(`[STATUS_POLLER] Error handling successful tour payment:`, error);
      throw error;
    }
  }

  /**
   * Handle failed tour payment
   */
  private async handleFailedTourPayment(
    provider: 'PAWAPAY' | 'XENTRIPAY',
    transactionId: string,
    tourBooking: any,
    failureReason?: string
  ): Promise<void> {
    try {
      console.log(`[STATUS_POLLER] Handling failed tour payment for booking ${tourBooking.id}`);

      if (tourBooking.status === 'failed' && tourBooking.paymentStatus === 'failed') {
        console.log(`[STATUS_POLLER] Tour booking ${tourBooking.id} already marked as failed - skipping`);
        return;
      }

      await prisma.tourBooking.update({
        where: { id: tourBooking.id },
        data: {
          paymentStatus: 'failed',
          status: 'failed'
        }
      });

      const shouldNotify = await this.shouldSendNotification(provider, transactionId);
      if (shouldNotify) {
        await this.sendFailedTourPaymentNotifications(provider, transactionId, tourBooking, failureReason);
      }

    } catch (error: any) {
      console.error(`[STATUS_POLLER] Error handling failed tour payment:`, error);
      throw error;
    }
  }

  /**
   * Check if we should send notification (prevent duplicates)
   */
  private async shouldSendNotification(provider: 'ESCROW' | 'PAWAPAY' | 'XENTRIPAY', transactionId: string): Promise<boolean> {
    try {
      let transaction: any;

      if (provider === 'PAWAPAY' || provider === 'XENTRIPAY') {
        transaction = await prisma.transaction.findUnique({
          where: { id: transactionId },
          select: { notificationSentAt: true, notificationCount: true }
        });
      } else {
        // DEPRECATED: Escrow system has been removed
        console.warn('[STATUS_POLLER] Escrow notification check called but system is deprecated');
        return false;
      }

      if (!transaction) {
        return false;
      }

      // If never sent notification, send it
      if (!transaction.notificationSentAt) {
        return true;
      }

      // If sent more than once, don't send again
      if (transaction.notificationCount > 0) {
        return false;
      }

      return true;

    } catch (error: any) {
      console.error('[STATUS_POLLER] Error checking notification status:', error);
      return false;
    }
  }

  /**
   * Mark notification as sent
   */
  private async markNotificationSent(provider: 'ESCROW' | 'PAWAPAY' | 'XENTRIPAY', transactionId: string): Promise<void> {
    try {
      if (provider === 'PAWAPAY' || provider === 'XENTRIPAY') {
        await prisma.transaction.update({
          where: { id: transactionId },
          data: {
            notificationSentAt: new Date(),
            notificationCount: { increment: 1 }
          }
        });
      } else {
        // DEPRECATED: Escrow system has been removed
        console.warn('[STATUS_POLLER] Escrow notification marking called but system is deprecated');
      }
    } catch (error: any) {
      console.error('[STATUS_POLLER] Error marking notification as sent:', error);
    }
  }

  /**
   * Send successful payment notifications to all parties
   */
  private async sendSuccessfulPaymentNotifications(
    provider: 'ESCROW' | 'PAWAPAY' | 'XENTRIPAY',
    transactionId: string,
    booking: any
  ): Promise<void> {
    try {
      console.log(`[STATUS_POLLER] Sending successful payment notifications for booking ${booking.id}`);

      const bookingInfo: any = {
        id: booking.id,
        propertyId: booking.propertyId,
        property: {
          name: booking.property.name,
          location: booking.property.location,
          images: typeof booking.property.images === 'string' ? JSON.parse(booking.property.images) : booking.property.images || {},
          pricePerNight: booking.property.pricePerNight,
          hostName: `${booking.property.host.firstName} ${booking.property.host.lastName}`,
          hostEmail: booking.property.host.email,
          hostPhone: booking.property.host.phone || undefined
        },
        guestId: booking.guestId,
        guest: {
          firstName: booking.guest.firstName,
          lastName: booking.guest.lastName,
          email: booking.guest.email,
          phone: booking.guest.phone || undefined,
          profileImage: booking.guest.profileImage || undefined
        },
        checkIn: booking.checkIn.toISOString(),
        checkOut: booking.checkOut.toISOString(),
        guests: booking.guests,
        nights: Math.ceil((booking.checkOut.getTime() - booking.checkIn.getTime()) / (1000 * 60 * 60 * 24)),
        totalPrice: booking.totalPrice,
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        message: booking.message || undefined,
        specialRequests: booking.specialRequests || undefined,
        checkInInstructions: booking.checkInInstructions || undefined,
        checkOutInstructions: booking.checkOutInstructions || undefined,
        createdAt: booking.createdAt.toISOString(),
        updatedAt: booking.updatedAt.toISOString()
      };

      const company = {
        name: 'Jambolush',
        website: 'https://jambolush.com',
        supportEmail: 'support@jambolush.com',
        logo: 'https://jambolush.com/favicon.ico'
      };

      // Send to guest
      await paymentEmailService.sendPaymentCompletedEmail({
        user: {
          firstName: booking.guest.firstName,
          lastName: booking.guest.lastName,
          email: booking.guest.email,
          id: booking.guestId
        },
        company,
        booking: bookingInfo,
        recipientType: 'guest',
        paymentStatus: 'completed',
        paymentAmount: booking.totalPrice,
        paymentCurrency: 'USD'
      }).catch(err => console.error('[STATUS_POLLER] Failed to send guest email:', err));

      // Send to host
      if (booking.property.host) {
        await paymentEmailService.sendPaymentConfirmedToHost({
          user: {
            firstName: booking.property.host.firstName,
            lastName: booking.property.host.lastName,
            email: booking.property.host.email,
            id: booking.property.host.id
          },
          company,
          booking: bookingInfo,
          recipientType: 'host',
          paymentStatus: 'completed',
          paymentAmount: booking.totalPrice,
          paymentCurrency: 'USD'
        }).catch(err => console.error('[STATUS_POLLER] Failed to send host email:', err));
      }

      // Send to agent if exists
      if (booking.property.agent) {
        await paymentEmailService.sendPaymentConfirmedToHost({
          user: {
            firstName: booking.property.agent.firstName,
            lastName: booking.property.agent.lastName,
            email: booking.property.agent.email,
            id: booking.property.agent.id
          },
          company,
          booking: bookingInfo,
          recipientType: 'host',
          paymentStatus: 'completed',
          paymentAmount: booking.totalPrice,
          paymentCurrency: 'USD'
        }).catch(err => console.error('[STATUS_POLLER] Failed to send agent email:', err));
      }

      // Send to admin
      await this.sendAdminNotification(
        'Payment Successful',
        `Booking ${booking.id} payment completed. Guest: ${booking.guest.email}, Host: ${booking.property.host.email}, Amount: $${booking.totalPrice}`
      ).catch(err => console.error('[STATUS_POLLER] Failed to send admin email:', err));

      // Mark notification as sent
      await this.markNotificationSent(provider, transactionId);

      console.log(`[STATUS_POLLER] ✅ Successful payment notifications sent for booking ${booking.id}`);

    } catch (error: any) {
      console.error('[STATUS_POLLER] Error sending successful payment notifications:', error);
    }
  }

  /**
   * Send failed payment notifications
   */
  private async sendFailedPaymentNotifications(
    provider: 'ESCROW' | 'PAWAPAY' | 'XENTRIPAY',
    transactionId: string,
    booking: any,
    failureReason?: string
  ): Promise<void> {
    try {
      console.log(`[STATUS_POLLER] Sending failed payment notifications for booking ${booking.id}`);

      const bookingInfo: any = {
        id: booking.id,
        propertyId: booking.propertyId,
        property: {
          name: booking.property.name,
          location: booking.property.location,
          images: typeof booking.property.images === 'string' ? JSON.parse(booking.property.images) : booking.property.images || {},
          pricePerNight: booking.property.pricePerNight,
          hostName: `${booking.property.host.firstName} ${booking.property.host.lastName}`,
          hostEmail: booking.property.host.email,
          hostPhone: booking.property.host.phone || undefined
        },
        guestId: booking.guestId,
        guest: {
          firstName: booking.guest.firstName,
          lastName: booking.guest.lastName,
          email: booking.guest.email,
          phone: booking.guest.phone || undefined,
          profileImage: booking.guest.profileImage || undefined
        },
        checkIn: booking.checkIn.toISOString(),
        checkOut: booking.checkOut.toISOString(),
        guests: booking.guests,
        totalPrice: booking.totalPrice,
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        createdAt: booking.createdAt.toISOString(),
        updatedAt: booking.updatedAt.toISOString()
      };

      const company = {
        name: 'Jambolush',
        website: 'https://jambolush.com',
        supportEmail: 'support@jambolush.com',
        logo: 'https://jambolush.com/favicon.ico'
      };

      // Send to guest
      await paymentEmailService.sendPaymentFailedEmail({
        user: {
          firstName: booking.guest.firstName,
          lastName: booking.guest.lastName,
          email: booking.guest.email,
          id: booking.guestId
        },
        company,
        booking: bookingInfo,
        recipientType: 'guest',
        paymentStatus: 'failed',
        failureReason
      }).catch(err => console.error('[STATUS_POLLER] Failed to send guest failure email:', err));

      // Send to admin
      await this.sendAdminNotification(
        'Payment Failed',
        `Booking ${booking.id} payment failed. Guest: ${booking.guest.email}, Reason: ${failureReason || 'Unknown'}`
      ).catch(err => console.error('[STATUS_POLLER] Failed to send admin email:', err));

      // Mark notification as sent
      await this.markNotificationSent(provider, transactionId);

      console.log(`[STATUS_POLLER] ✅ Failed payment notifications sent for booking ${booking.id}`);

    } catch (error: any) {
      console.error('[STATUS_POLLER] Error sending failed payment notifications:', error);
    }
  }

  /**
   * Send successful tour payment notifications
   */
  private async sendSuccessfulTourPaymentNotifications(
    provider: 'PAWAPAY' | 'XENTRIPAY',
    transactionId: string,
    tourBooking: any
  ): Promise<void> {
    try {
      const bookingInfo: any = {
        id: tourBooking.id,
        tourId: String(tourBooking.tourId),
        tour: {
          title: tourBooking.tour.title,
          description: tourBooking.tour.description,
          category: tourBooking.tour.category,
          type: tourBooking.tour.type,
          duration: tourBooking.tour.duration,
          difficulty: tourBooking.tour.difficulty,
          location: `${tourBooking.tour.locationCity}, ${tourBooking.tour.locationCountry}`,
          images: tourBooking.tour.images || {},
          price: tourBooking.tour.price,
          currency: tourBooking.tour.currency,
          inclusions: tourBooking.tour.inclusions || [],
          exclusions: tourBooking.tour.exclusions || [],
          requirements: tourBooking.tour.requirements || [],
          meetingPoint: tourBooking.tour.meetingPoint
        },
        scheduleId: tourBooking.scheduleId,
        schedule: {
          startDate: tourBooking.schedule.startDate.toISOString(),
          endDate: tourBooking.schedule.endDate.toISOString(),
          startTime: tourBooking.schedule.startTime,
          endTime: tourBooking.schedule.endTime || undefined,
          availableSlots: tourBooking.schedule.availableSlots,
          bookedSlots: tourBooking.schedule.bookedSlots
        },
        tourGuideId: tourBooking.tourGuideId,
        tourGuide: {
          firstName: tourBooking.tour.tourGuide.firstName,
          lastName: tourBooking.tour.tourGuide.lastName,
          email: tourBooking.tour.tourGuide.email,
          phone: tourBooking.tour.tourGuide.phone || undefined,
          profileImage: tourBooking.tour.tourGuide.profileImage || undefined
        },
        userId: tourBooking.userId,
        user: {
          firstName: tourBooking.user.firstName,
          lastName: tourBooking.user.lastName,
          email: tourBooking.user.email,
          phone: tourBooking.user.phone || undefined,
          profileImage: tourBooking.user.profileImage || undefined
        },
        numberOfParticipants: tourBooking.numberOfParticipants,
        participants: tourBooking.participants || [],
        totalAmount: tourBooking.totalAmount,
        currency: tourBooking.currency,
        status: tourBooking.status,
        paymentStatus: tourBooking.paymentStatus,
        createdAt: tourBooking.createdAt.toISOString()
      };

      const company = {
        name: 'Jambolush',
        website: 'https://jambolush.com',
        supportEmail: 'support@jambolush.com',
        logo: 'https://jambolush.com/favicon.ico'
      };

      // Send to guest
      await paymentEmailService.sendPaymentCompletedEmail({
        user: {
          firstName: tourBooking.user.firstName,
          lastName: tourBooking.user.lastName,
          email: tourBooking.user.email,
          id: tourBooking.userId
        },
        company,
        booking: bookingInfo,
        recipientType: 'guest',
        paymentStatus: 'completed',
        paymentAmount: tourBooking.totalAmount,
        paymentCurrency: tourBooking.currency
      }).catch(err => console.error('[STATUS_POLLER] Failed to send tour guest email:', err));

      // Send to tour guide
      await paymentEmailService.sendPaymentConfirmedToHost({
        user: {
          firstName: tourBooking.tour.tourGuide.firstName,
          lastName: tourBooking.tour.tourGuide.lastName,
          email: tourBooking.tour.tourGuide.email,
          id: tourBooking.tourGuideId
        },
        company,
        booking: bookingInfo,
        recipientType: 'guide',
        paymentStatus: 'completed',
        paymentAmount: tourBooking.totalAmount,
        paymentCurrency: tourBooking.currency
      }).catch(err => console.error('[STATUS_POLLER] Failed to send tour guide email:', err));

      // Send to admin
      await this.sendAdminNotification(
        'Tour Payment Successful',
        `Tour booking ${tourBooking.id} payment completed. Guest: ${tourBooking.user.email}, Amount: ${tourBooking.totalAmount} ${tourBooking.currency}`
      ).catch(err => console.error('[STATUS_POLLER] Failed to send admin email:', err));

      await this.markNotificationSent(provider, transactionId);

    } catch (error: any) {
      console.error('[STATUS_POLLER] Error sending tour payment notifications:', error);
    }
  }

  /**
   * Send failed tour payment notifications
   */
  private async sendFailedTourPaymentNotifications(
    provider: 'PAWAPAY' | 'XENTRIPAY',
    transactionId: string,
    tourBooking: any,
    failureReason?: string
  ): Promise<void> {
    try {
      const bookingInfo: any = {
        id: tourBooking.id,
        tour: {
          title: tourBooking.tour.title,
          location: `${tourBooking.tour.locationCity}, ${tourBooking.tour.locationCountry}`
        },
        totalAmount: tourBooking.totalAmount,
        currency: tourBooking.currency,
        status: tourBooking.status,
        paymentStatus: tourBooking.paymentStatus,
        createdAt: tourBooking.createdAt.toISOString()
      };

      const company = {
        name: 'Jambolush',
        website: 'https://jambolush.com',
        supportEmail: 'support@jambolush.com',
        logo: 'https://jambolush.com/favicon.ico'
      };

      // Send to guest
      await paymentEmailService.sendPaymentFailedEmail({
        user: {
          firstName: tourBooking.user.firstName,
          lastName: tourBooking.user.lastName,
          email: tourBooking.user.email,
          id: tourBooking.userId
        },
        company,
        booking: bookingInfo,
        recipientType: 'guest',
        paymentStatus: 'failed',
        failureReason
      }).catch(err => console.error('[STATUS_POLLER] Failed to send tour guest failure email:', err));

      // Send to admin
      await this.sendAdminNotification(
        'Tour Payment Failed',
        `Tour booking ${tourBooking.id} payment failed. Guest: ${tourBooking.user.email}, Reason: ${failureReason || 'Unknown'}`
      ).catch(err => console.error('[STATUS_POLLER] Failed to send admin email:', err));

      await this.markNotificationSent(provider, transactionId);

    } catch (error: any) {
      console.error('[STATUS_POLLER] Error sending failed tour payment notifications:', error);
    }
  }

  /**
   * Send admin notification email
   */
  private async sendAdminNotification(subject: string, message: string): Promise<void> {
    try {
      // You can implement this using Brevo or another email service
      // For now, just log it
      console.log(`[ADMIN_NOTIFICATION] ${subject}: ${message}`);

      // TODO: Implement actual admin email sending
      // await adminEmailService.sendEmail({
      //   to: this.ADMIN_EMAIL,
      //   subject,
      //   body: message
      // });

    } catch (error: any) {
      console.error('[STATUS_POLLER] Error sending admin notification:', error);
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

  /**
   * Calculate split rules based on whether agent exists
   */
  private calculateSplitRules(hasAgent: boolean): { platform: number; agent: number; host: number } {
    // Default split: Platform 14%, Agent 6%, Host 80%
    if (hasAgent) {
      return {
        platform: 14,
        agent: 6,
        host: 80
      };
    } else {
      return {
        platform: 14,
        agent: 0,
        host: 86 // Host gets agent's share too
      };
    }
  }

  /**
   * Calculate split amounts based on rules
   */
  private calculateSplitAmounts(amount: number, rules: { platform: number; agent: number; host: number }) {
    return {
      platform: Math.round((amount * rules.platform / 100) * 100) / 100,
      agent: Math.round((amount * rules.agent / 100) * 100) / 100,
      host: Math.round((amount * rules.host / 100) * 100) / 100
    };
  }

  /**
   * Update wallet balance for a user
   */
  private async updateWalletBalance(
    userId: number,
    amount: number,
    type: string,
    reference: string
  ): Promise<void> {
    try {
      // Get or create wallet for user
      let wallet = await prisma.wallet.findUnique({
        where: { userId }
      });

      if (!wallet) {
        wallet = await prisma.wallet.create({
          data: {
            userId,
            balance: 0,
            currency: 'USD',
            isActive: true
          }
        });
      }

      const newBalance = wallet.balance + amount;

      // Update wallet balance
      await prisma.wallet.update({
        where: { userId },
        data: { balance: newBalance }
      });

      // Create wallet transaction record
      await prisma.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: amount > 0 ? 'credit' : 'debit',
          amount: Math.abs(amount),
          balanceBefore: wallet.balance,
          balanceAfter: newBalance,
          reference,
          description: `${type} - ${reference}`
        }
      });

      console.log(`[STATUS_POLLER] Wallet updated for user ${userId}: +$${amount} (${type})`);
    } catch (error: any) {
      console.error(`[STATUS_POLLER] Failed to update wallet for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Fund wallets for host, agent, and platform based on split rules
   */
  private async fundWalletsForBooking(booking: any, transactionReference: string): Promise<void> {
    try {
      // Check if already funded
      if (booking.walletDistributed) {
        console.log(`[STATUS_POLLER] Wallets already funded for booking ${booking.id}`);
        return;
      }

      console.log(`[STATUS_POLLER] Funding wallets for booking ${booking.id}`);

      // Calculate split amounts
      const hasAgent = booking.property.agent !== null;
      const splitRules = this.calculateSplitRules(hasAgent);
      const splitAmounts = this.calculateSplitAmounts(booking.totalPrice, splitRules);

      console.log(`[STATUS_POLLER] Split amounts:`, splitAmounts);

      // Create owner payment record
      if (booking.property.host) {
        await prisma.ownerPayment.create({
          data: {
            ownerId: booking.property.host.id,
            propertyId: booking.propertyId,
            bookingId: booking.id,
            amount: booking.totalPrice,
            platformFee: splitAmounts.platform,
            netAmount: splitAmounts.host,
            currency: 'USD',
            status: 'pending',
            checkInRequired: true,
            checkInValidated: false
          }
        }).catch((err: any) => console.error('[STATUS_POLLER] Failed to create owner payment:', err));
      }

      // Create agent commission record
      if (booking.property.agent && splitAmounts.agent > 0) {
        await prisma.agentCommission.create({
          data: {
            agentId: booking.property.agent.id,
            propertyId: booking.propertyId,
            bookingId: booking.id,
            amount: splitAmounts.agent,
            commissionRate: splitRules.agent,
            status: 'pending'
          }
        }).catch((err: any) => console.error('[STATUS_POLLER] Failed to create agent commission:', err));
      }

      // Update host wallet
      if (booking.property.host) {
        await this.updateWalletBalance(
          booking.property.host.id,
          splitAmounts.host,
          'PAYMENT_RECEIVED',
          transactionReference
        ).catch((err: any) => console.error('[STATUS_POLLER] Failed to update host wallet:', err));
      }

      // Update agent wallet (if exists)
      if (booking.property.agent && splitAmounts.agent > 0) {
        await this.updateWalletBalance(
          booking.property.agent.id,
          splitAmounts.agent,
          'COMMISSION_EARNED',
          transactionReference
        ).catch((err: any) => console.error('[STATUS_POLLER] Failed to update agent wallet:', err));
      }

      // Update platform wallet
      if (splitAmounts.platform > 0) {
        await this.updateWalletBalance(
          1, // Platform account (user ID 1)
          splitAmounts.platform,
          'PLATFORM_FEE',
          transactionReference
        ).catch((err: any) => console.error('[STATUS_POLLER] Failed to update platform wallet:', err));
      }

      // Mark booking as wallet distributed
      await prisma.booking.update({
        where: { id: booking.id },
        data: {
          walletDistributed: true,
          walletDistributedAt: new Date()
        }
      });

      console.log(`[STATUS_POLLER] ✅ Wallets funded successfully for booking ${booking.id}`);
    } catch (error: any) {
      console.error(`[STATUS_POLLER] Error funding wallets:`, error);
      throw error;
    }
  }

  /**
   * Fund wallet for tour guide based on tour booking
   */
  private async fundWalletsForTourBooking(tourBooking: any, transactionReference: string): Promise<void> {
    try {
      // Check if already funded
      if (tourBooking.walletDistributed) {
        console.log(`[STATUS_POLLER] Wallets already funded for tour booking ${tourBooking.id}`);
        return;
      }

      console.log(`[STATUS_POLLER] Funding wallets for tour booking ${tourBooking.id}`);

      // For tours, simple split: Platform 14%, Guide 86%
      const platformFee = Math.round((tourBooking.totalAmount * 14 / 100) * 100) / 100;
      const guideAmount = tourBooking.totalAmount - platformFee;

      // Update tour guide wallet
      if (tourBooking.tour?.tourGuide) {
        await this.updateWalletBalance(
          tourBooking.tour.tourGuide.id,
          guideAmount,
          'TOUR_PAYMENT_RECEIVED',
          transactionReference
        ).catch((err: any) => console.error('[STATUS_POLLER] Failed to update guide wallet:', err));
      }

      // Update platform wallet
      if (platformFee > 0) {
        await this.updateWalletBalance(
          1, // Platform account (user ID 1)
          platformFee,
          'PLATFORM_FEE',
          transactionReference
        ).catch((err: any) => console.error('[STATUS_POLLER] Failed to update platform wallet:', err));
      }

      // Mark tour booking as wallet distributed
      await prisma.tourBooking.update({
        where: { id: tourBooking.id },
        data: {
          walletDistributed: true,
          walletDistributedAt: new Date()
        }
      });

      console.log(`[STATUS_POLLER] ✅ Wallets funded successfully for tour booking ${tourBooking.id}`);
    } catch (error: any) {
      console.error(`[STATUS_POLLER] Error funding wallets for tour:`, error);
      throw error;
    }
  }
}

export default StatusPollerService;
