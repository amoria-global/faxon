// services/status-poller.service.ts
import { PrismaClient } from '@prisma/client';
import { PawaPayService } from './pawapay.service';
import { XentriPayService } from './xentripay.service';
import { BrevoPaymentStatusMailingService } from '../utils/brevo.payment-status';

const prisma = new PrismaClient();
const paymentEmailService = new BrevoPaymentStatusMailingService();

export class StatusPollerService {
  private pollingInterval: NodeJS.Timeout | null = null;
  private isPolling: boolean = false;
  private pawaPayService: PawaPayService;
  private xentriPayService: XentriPayService;
  private pollIntervalMs: number;

  // Configuration constants
  private readonly MIN_AGE_HOURS = 2; // Minimum 2 hours old
  private readonly MAX_AGE_DAYS = 10; // Maximum 10 days old
  private readonly ADMIN_EMAIL = 'admin@amoriaglobal.com';

  constructor(
    pawaPayService: PawaPayService,
    xentriPayService: XentriPayService,
    pollIntervalMs: number = 3 * 60 * 60 * 1000 // Default: 3 hours
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

    const intervalHours = this.pollIntervalMs / (60 * 60 * 1000);
    console.log(`[STATUS_POLLER] Starting comprehensive status polling (every ${intervalHours} hours)`);
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
   * Poll all transactions (2 hours to 10 days old) for all payment providers
   */
  private async pollAllTransactions() {
    try {
      console.log('[STATUS_POLLER] Starting comprehensive polling cycle...');

      const now = new Date();
      const minDate = new Date(now.getTime() - this.MAX_AGE_DAYS * 24 * 60 * 60 * 1000); // 10 days ago
      const maxDate = new Date(now.getTime() - this.MIN_AGE_HOURS * 60 * 60 * 1000); // 2 hours ago

      console.log(`[STATUS_POLLER] Checking transactions from ${minDate.toISOString()} to ${maxDate.toISOString()}`);

      // Run all checks in parallel
      await Promise.allSettled([
        this.pollCompletedAndFailedPawaPayTransactions(minDate, maxDate),
        this.pollCompletedAndFailedXentriPayTransactions(minDate, maxDate)
      ]);

      console.log('[STATUS_POLLER] ✅ Comprehensive polling cycle complete');

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
   * Poll PawaPay transactions that are COMPLETED or FAILED (2 hours to 10 days old)
   */
  private async pollCompletedAndFailedPawaPayTransactions(minDate: Date, maxDate: Date) {
    try {
      console.log('[STATUS_POLLER] Checking completed/failed PawaPay transactions...');

      const transactions = await prisma.transaction.findMany({
        where: {
          provider: 'PAWAPAY',
          status: { in: ['COMPLETED', 'FAILED'] },
          transactionType: 'DEPOSIT', // Only deposits (payments for bookings)
          createdAt: {
            gte: minDate,
            lte: maxDate
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
          completedAt: true,
          failureCode: true,
          failureReason: true,
          statusCheckCount: true,
          lastStatusCheck: true,
          notificationCount: true,
          notificationSentAt: true
        },
        take: 100
      });

      if (transactions.length === 0) {
        console.log('[STATUS_POLLER] No completed/failed PawaPay transactions to check');
        return;
      }

      console.log(`[STATUS_POLLER] Found ${transactions.length} completed/failed PawaPay transactions to process`);

      let processed = 0;
      let errors = 0;

      for (const transaction of transactions) {
        try {
          await this.processPawaPayTransactionForBooking(transaction);
          processed++;
        } catch (error: any) {
          console.error(`[STATUS_POLLER] Failed to process PawaPay transaction ${transaction.reference}:`, error.message);
          errors++;
        }

        await this.delay(500); // Rate limiting
      }

      console.log(`[STATUS_POLLER] ✅ PawaPay: ${processed} processed, ${errors} errors`);

    } catch (error: any) {
      console.error('[STATUS_POLLER] ❌ PawaPay polling error:', error);
    }
  }

  /**
   * Poll XentriPay transactions - checks PENDING transactions from provider API
   * Also processes COMPLETED/FAILED transactions for booking confirmations
   * Handles both DEPOSIT (card/mobile money collections) and PAYOUT (withdrawals/refunds)
   */
  private async pollCompletedAndFailedXentriPayTransactions(minDate: Date, maxDate: Date) {
    try {
      console.log('[STATUS_POLLER] Checking XentriPay transactions...');

      // Get PENDING transactions to check status from provider
      const pendingTransactions = await prisma.transaction.findMany({
        where: {
          provider: 'XENTRIPAY',
          status: 'PENDING',
          createdAt: {
            gte: minDate,
            lte: maxDate
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
        take: 50
      });

      // Get COMPLETED/FAILED transactions that need booking processing
      const completedTransactions = await prisma.transaction.findMany({
        where: {
          provider: 'XENTRIPAY',
          status: { in: ['COMPLETED', 'FAILED'] },
          createdAt: {
            gte: minDate,
            lte: maxDate
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
          completedAt: true,
          failureCode: true,
          failureReason: true,
          statusCheckCount: true,
          lastStatusCheck: true,
          notificationCount: true,
          notificationSentAt: true
        },
        take: 50
      });

      if (pendingTransactions.length === 0 && completedTransactions.length === 0) {
        console.log('[STATUS_POLLER] No XentriPay transactions to check');
        return;
      }

      console.log(`[STATUS_POLLER] Found ${pendingTransactions.length} pending + ${completedTransactions.length} completed/failed XentriPay transactions`);

      let polled = 0;
      let processed = 0;
      let errors = 0;

      // First, poll PENDING transactions from provider API
      for (const transaction of pendingTransactions) {
        try {
          await this.pollXentriPayTransactionStatus(transaction);
          polled++;
        } catch (error: any) {
          console.error(`[STATUS_POLLER] Failed to poll XentriPay transaction ${transaction.reference}:`, error.message);
          errors++;
        }

        await this.delay(500); // Rate limiting
      }

      // Then, process COMPLETED/FAILED transactions for booking confirmations
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

        await this.delay(500); // Rate limiting
      }

      console.log(`[STATUS_POLLER] ✅ XentriPay: ${polled} polled, ${processed} processed, ${errors} errors`);

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
