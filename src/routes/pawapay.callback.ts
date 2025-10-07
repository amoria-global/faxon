// routes/pawapay.callback.ts - PawaPay Webhook/Callback Handler

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { pawaPayService } from '../services/pawapay.service';
import { logger } from '../utils/logger';
import { PawaPayWebhookData } from '../types/pawapay.types';
import { validatePawaPayWebhook, logPawaPayRequest } from '../middleware/pawapay.middleware';

const router = Router();
const prisma = new PrismaClient();

/**
 * POST /api/pawapay/callback
 * Handle PawaPay webhook callbacks for deposits, payouts, and refunds
 * Validates bearer token and webhook signature
 */
router.post('/', logPawaPayRequest, validatePawaPayWebhook, async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    logger.info('Received PawaPay webhook callback', 'PawaPayCallback');

    // Get raw body for signature validation
    const rawBody = JSON.stringify(req.body);
    const signature = req.headers['x-pawapay-signature'] as string;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];

    // Parse webhook data
    const webhookData: PawaPayWebhookData = req.body;

    // Determine transaction ID and type
    const transactionId = webhookData.depositId || webhookData.payoutId || webhookData.refundId;
    const transactionType = webhookData.depositId ? 'DEPOSIT' : webhookData.payoutId ? 'PAYOUT' : 'REFUND';

    if (!transactionId) {
      logger.error('Webhook missing transaction ID', 'PawaPayCallback');
      res.status(400).json({ success: false, message: 'Missing transaction ID' });
      return;
    }

    // Log webhook to database
    const webhookLog = await prisma.pawaPayWebhookLog.create({
      data: {
        transactionId,
        transactionType,
        payload: webhookData as any,
        signature: signature || null,
        signatureValid: false, // Will update after validation
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
        processed: false
      }
    });

    // Validate webhook signature if configured
    let signatureValid = true;
    if (signature && process.env.PAWAPAY_WEBHOOK_SECRET) {
      signatureValid = pawaPayService.validateWebhookSignature(rawBody, signature);

      await prisma.pawaPayWebhookLog.update({
        where: { id: webhookLog.id },
        data: { signatureValid }
      });

      if (!signatureValid) {
        logger.error('Invalid webhook signature', 'PawaPayCallback');
        res.status(401).json({ success: false, message: 'Invalid signature' });
        return;
      }
    }

    logger.info(`Processing ${transactionType} webhook for ${transactionId}`, 'PawaPayCallback');

    // Find existing transaction
    let transaction = await prisma.pawaPayTransaction.findUnique({
      where: { transactionId }
    });

    if (!transaction) {
      // Transaction doesn't exist in our database - this might be a callback for a transaction
      // initiated outside our system or an error
      logger.warn(`Transaction not found in database: ${transactionId}`, 'PawaPayCallback');

      // Create a new transaction record from webhook data
      transaction = await prisma.pawaPayTransaction.create({
        data: {
          transactionId,
          transactionType,
          status: webhookData.status,
          amount: webhookData.requestedAmount,
          currency: webhookData.currency,
          country: webhookData.country,
          correspondent: webhookData.correspondent,
          payerPhone: webhookData.payer?.address.value,
          recipientPhone: webhookData.recipient?.address.value,
          customerTimestamp: webhookData.customerTimestamp ? new Date(webhookData.customerTimestamp) : null,
          statementDescription: webhookData.statementDescription,
          requestedAmount: webhookData.requestedAmount,
          depositedAmount: webhookData.depositedAmount,
          providerTransactionId: webhookData.correspondentIds?.PROVIDER_TRANSACTION_ID,
          financialTransactionId: webhookData.correspondentIds?.FINANCIAL_TRANSACTION_ID,
          relatedDepositId: transactionType === 'REFUND' ? webhookData.depositId : null,
          failureCode: webhookData.failureReason?.failureCode,
          failureMessage: webhookData.failureReason?.failureMessage,
          metadata: (webhookData.metadata || {}) as any,
          callbackReceived: true,
          callbackReceivedAt: new Date(),
          receivedByPawaPay: webhookData.receivedByPawaPay ? new Date(webhookData.receivedByPawaPay) : null,
          completedAt: webhookData.status === 'COMPLETED' ? new Date() : null
        }
      });
    } else {
      // Update existing transaction
      const updateData: any = {
        status: webhookData.status,
        callbackReceived: true,
        callbackReceivedAt: new Date(),
        updatedAt: new Date()
      };

      // Update amounts if provided
      if (webhookData.depositedAmount) {
        updateData.depositedAmount = webhookData.depositedAmount;
      }

      // Update provider IDs if provided
      if (webhookData.correspondentIds?.PROVIDER_TRANSACTION_ID) {
        updateData.providerTransactionId = webhookData.correspondentIds.PROVIDER_TRANSACTION_ID;
      }
      if (webhookData.correspondentIds?.FINANCIAL_TRANSACTION_ID) {
        updateData.financialTransactionId = webhookData.correspondentIds.FINANCIAL_TRANSACTION_ID;
      }

      // Update failure information if present
      if (webhookData.failureReason) {
        updateData.failureCode = webhookData.failureReason.failureCode;
        updateData.failureMessage = webhookData.failureReason.failureMessage;
      }

      // Set completion timestamp for completed transactions
      if (webhookData.status === 'COMPLETED' && !transaction.completedAt) {
        updateData.completedAt = new Date();
      }

      transaction = await prisma.pawaPayTransaction.update({
        where: { transactionId },
        data: updateData
      });
    }

    // Handle status-specific logic
    await handleTransactionStatus(transaction, webhookData);

    // Mark webhook as processed
    await prisma.pawaPayWebhookLog.update({
      where: { id: webhookLog.id },
      data: {
        processed: true,
        processedAt: new Date()
      }
    });

    const processingTime = Date.now() - startTime;
    logger.info(
      `PawaPay webhook processed successfully in ${processingTime}ms: ${transactionId} - ${webhookData.status}`,
      'PawaPayCallback'
    );

    // Respond with success
    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully',
      transactionId,
      status: webhookData.status
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    logger.error(
      `Error processing PawaPay webhook (${processingTime}ms)`,
      'PawaPayCallback',
      error
    );

    // Try to update webhook log with error
    try {
      const transactionId = req.body?.depositId || req.body?.payoutId || req.body?.refundId;
      if (transactionId) {
        await prisma.pawaPayWebhookLog.updateMany({
          where: {
            transactionId,
            processed: false
          },
          data: {
            processingError: error instanceof Error ? error.message : 'Unknown error'
          }
        });
      }
    } catch (logError) {
      logger.error('Failed to update webhook log with error', 'PawaPayCallback', logError);
    }

    // Still return 200 to prevent PawaPay from retrying
    // Log the error for manual investigation
    res.status(200).json({
      success: false,
      message: 'Webhook received but processing failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Handle transaction status changes
 */
async function handleTransactionStatus(
  transaction: any,
  webhookData: PawaPayWebhookData
): Promise<void> {
  const { status, currency } = webhookData;
  const transactionType = transaction.transactionType;
  const amount = pawaPayService.convertFromSmallestUnit(transaction.amount, currency);

  logger.info(
    `Handling ${transactionType} status: ${status} for transaction ${transaction.transactionId}`,
    'PawaPayCallback'
  );

  switch (status) {
    case 'COMPLETED':
      await handleCompletedTransaction(transaction, webhookData, amount);
      break;

    case 'FAILED':
    case 'REJECTED':
      await handleFailedTransaction(transaction, webhookData);
      break;

    case 'CANCELLED':
      await handleCancelledTransaction(transaction, webhookData);
      break;

    case 'SUBMITTED':
      logger.info(`Transaction ${transaction.transactionId} in progress: ${status}`, 'PawaPayCallback');
      break;

    case 'ACCEPTED':
      logger.info(`Transaction ${transaction.transactionId} in progress: ${status}`, 'PawaPayCallback');
      break;

    default:
      logger.warn(`Unknown transaction status: ${status}`, 'PawaPayCallback');
  }
}

/**
 * Handle completed transactions
 */
async function handleCompletedTransaction(
  transaction: any,
  webhookData: PawaPayWebhookData,
  amount: number
): Promise<void> {
  logger.info(
    `Transaction completed: ${transaction.transactionId} - ${amount} ${webhookData.currency}`,
    'PawaPayCallback'
  );

  // Get internal reference from metadata
  const internalRef = transaction.internalReference || (transaction.metadata as any)?.internalReference;

  // Handle based on transaction type and internal reference
  if (transaction.transactionType === 'DEPOSIT' && internalRef) {
    // Update related booking, escrow, or wallet transaction
    await handleDepositCompletion(transaction, internalRef, amount);
  } else if (transaction.transactionType === 'PAYOUT' && internalRef) {
    // Update withdrawal request or payout status
    await handlePayoutCompletion(transaction, internalRef, amount);
  } else if (transaction.transactionType === 'REFUND' && internalRef) {
    // Update refund status
    await handleRefundCompletion(transaction, internalRef, amount);
  }

  // TODO: Send notification to user about successful transaction
  // await sendTransactionNotification(transaction, 'completed');
}

/**
 * Handle failed/rejected transactions
 */
async function handleFailedTransaction(
  transaction: any,
  webhookData: PawaPayWebhookData
): Promise<void> {
  const failureReason = webhookData.failureReason
    ? `${webhookData.failureReason.failureCode}: ${webhookData.failureReason.failureMessage}`
    : 'Unknown failure reason';

  logger.error(
    `Transaction failed: ${transaction.transactionId} - ${failureReason}`,
    'PawaPayCallback'
  );

  // TODO: Handle failed transaction (e.g., revert wallet changes, notify user)
  // await sendTransactionNotification(transaction, 'failed');
}

/**
 * Handle cancelled transactions
 */
async function handleCancelledTransaction(
  transaction: any,
  webhookData: PawaPayWebhookData
): Promise<void> {
  logger.info(`Transaction cancelled: ${transaction.transactionId}`, 'PawaPayCallback');

  // TODO: Handle cancelled transaction
  // await sendTransactionNotification(transaction, 'cancelled');
}

/**
 * Handle deposit completion
 */
async function handleDepositCompletion(
  transaction: any,
  internalRef: string,
  amount: number
): Promise<void> {
  try {
    // Check if this is related to an escrow transaction
    if (internalRef.startsWith('ESC_') || internalRef.includes('escrow')) {
      const escrowTransaction = await prisma.escrowTransaction.findUnique({
        where: { reference: internalRef }
      });

      if (escrowTransaction && escrowTransaction.status === 'PENDING') {
        await prisma.escrowTransaction.update({
          where: { reference: internalRef },
          data: {
            status: 'FUNDED',
            fundedAt: new Date(),
            externalId: transaction.transactionId
          }
        });

        logger.info(`Escrow transaction funded: ${internalRef}`, 'PawaPayCallback');
      }
    }

    // Check if this is related to a booking payment
    if (internalRef.startsWith('BOOK_') || internalRef.includes('booking')) {
      // Find booking by transactionId or reference
      const booking = await prisma.booking.findFirst({
        where: {
          OR: [
            { transactionId: internalRef },
            { id: internalRef }
          ]
        }
      });

      if (booking && booking.paymentStatus === 'pending') {
        await prisma.booking.update({
          where: { id: booking.id },
          data: {
            paymentStatus: 'completed',
            transactionId: transaction.transactionId
          }
        });

        logger.info(`Booking payment completed: ${internalRef}`, 'PawaPayCallback');
      }
    }

    logger.info(`Deposit completion handled for: ${internalRef}`, 'PawaPayCallback');
  } catch (error) {
    logger.error(`Error handling deposit completion for ${internalRef}`, 'PawaPayCallback', error);
  }
}

/**
 * Handle payout completion
 */
async function handlePayoutCompletion(
  transaction: any,
  internalRef: string,
  amount: number
): Promise<void> {
  try {
    // Check if this is related to a withdrawal request
    const withdrawalRequest = await prisma.withdrawalRequest.findFirst({
      where: { reference: internalRef }
    });

    if (withdrawalRequest && withdrawalRequest.status === 'PROCESSING') {
      await prisma.withdrawalRequest.update({
        where: { id: withdrawalRequest.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date()
        }
      });

      logger.info(`Withdrawal request completed: ${internalRef}`, 'PawaPayCallback');
    }

    logger.info(`Payout completion handled for: ${internalRef}`, 'PawaPayCallback');
  } catch (error) {
    logger.error(`Error handling payout completion for ${internalRef}`, 'PawaPayCallback', error);
  }
}

/**
 * Handle refund completion
 */
async function handleRefundCompletion(
  transaction: any,
  internalRef: string,
  amount: number
): Promise<void> {
  try {
    // Check if this is related to an escrow transaction
    const escrowTransaction = await prisma.escrowTransaction.findFirst({
      where: { reference: internalRef }
    });

    if (escrowTransaction) {
      await prisma.escrowTransaction.update({
        where: { id: escrowTransaction.id },
        data: {
          status: 'REFUNDED',
          refundedAt: new Date()
        }
      });

      logger.info(`Escrow transaction refunded: ${internalRef}`, 'PawaPayCallback');
    }

    logger.info(`Refund completion handled for: ${internalRef}`, 'PawaPayCallback');
  } catch (error) {
    logger.error(`Error handling refund completion for ${internalRef}`, 'PawaPayCallback', error);
  }
}

/**
 * GET /api/pawapay/callback
 * Handle GET requests (health check)
 */
router.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'PawaPay callback endpoint is active',
    timestamp: new Date().toISOString()
  });
});

export default router;
