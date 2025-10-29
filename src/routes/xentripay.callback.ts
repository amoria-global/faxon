// routes/xentripay-callback.routes.ts
// NOTE: Escrow functionality has been deprecated and removed

import express, { Request, Response } from 'express';
import crypto from 'crypto';
import { XentriPayService } from '../services/xentripay.service';
import { BrevoPaymentStatusMailingService } from '../utils/brevo.payment-status';
import config from '../config/config';

const router = express.Router();

// ==================== INITIALIZE SERVICES ====================

const isProduction = process.env.NODE_ENV === 'production';
const baseUrl = isProduction
  ? 'https://xentripay.com'
  : 'https://test.xentripay.com';

const xentriPayService = new XentriPayService({
  apiKey: process.env.XENTRIPAY_API_KEY || '',
  baseUrl: process.env.XENTRIPAY_BASE_URL || baseUrl,
  environment: isProduction ? 'production' : 'sandbox',
  timeout: 30000
});

const paymentEmailService = new BrevoPaymentStatusMailingService();

// ==================== HELPER FUNCTIONS ====================

/**
 * Extracts callback data from request (GET or POST)
 */
function extractCallbackData(req: Request): any | null {
  try {
    const data = req.method === 'POST' ? req.body : req.query;
    
    console.log('[XENTRIPAY_CALLBACK] Extracting data from:', req.method, data);
    
    // XentriPay webhook/callback includes refid and status
    if (!data.refid && !data.reference) {
      console.error('[XENTRIPAY_CALLBACK] Missing required fields:', {
        hasRefid: !!data.refid,
        hasReference: !!data.reference
      });
      return null;
    }

    return {
      refid: data.refid || data.reference,
      status: data.status,
      amount: data.amount,
      transactionId: data.transactionId || data.tid,
      timestamp: data.timestamp || new Date().toISOString()
    };
  } catch (error) {
    console.error('[XENTRIPAY_CALLBACK] Error extracting callback data:', error);
    return null;
  }
}

/**
 * Verifies webhook signature (for POST requests)
 */
function verifyCallbackSignature(req: Request): boolean {
  try {
    const signature = req.headers['x-xentripay-signature'] as string;
    const secret = process.env.XENTRIPAY_WEBHOOK_SECRET;

    // Skip verification in sandbox if secret not configured
    if (!signature || !secret) {
      if (!isProduction) {
        console.warn('[XENTRIPAY_CALLBACK] Skipping signature verification in sandbox');
        return true;
      }
      console.warn('[XENTRIPAY_CALLBACK] Missing signature or secret');
      return false;
    }

    const payload = JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );

    console.log('[XENTRIPAY_CALLBACK] Signature verification:', isValid ? '✅' : '❌');
    return isValid;
  } catch (error) {
    console.error('[XENTRIPAY_CALLBACK] Error verifying signature:', error);
    return false;
  }
}

/**
 * Processes webhook by fetching current status and updating transaction
 */
async function processWebhook(callbackData: any): Promise<boolean> {
  try {
    console.log(`[XENTRIPAY_CALLBACK] Processing webhook for ${callbackData.refid}`);
    console.log(`[XENTRIPAY_CALLBACK] Status: ${callbackData.status}`);

    // Import prisma for database operations
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    // NOTE: Escrow system deprecated - now handling booking payments directly
    // Extract booking reference from callbackData if available
    const reference = callbackData.refid;

    // Handle payment based on status
    if (callbackData.status === 'SUCCESS') {
      await handlePaymentSuccessDirectly(reference, prisma);
    } else if (callbackData.status === 'FAILED') {
      await handlePaymentFailureDirectly(reference, prisma);
    }

    console.log(`[XENTRIPAY_CALLBACK] ✅ Webhook processed successfully: ${callbackData.refid}`);
    await prisma.$disconnect();
    return true;

  } catch (error: any) {
    console.error('[XENTRIPAY_CALLBACK] ❌ Webhook processing failed:', {
      error: error.message,
      refid: callbackData.refid
    });
    return false;
  }
}

/**
 * Handle successful payment completion (direct booking payment - no escrow)
 */
async function handlePaymentSuccessDirectly(reference: string, prisma: any): Promise<void> {
  try {
    // Check if this is a booking payment
    if (reference && reference.startsWith('BOOKING-')) {
      // Find booking by transaction reference
      const booking = await prisma.booking.findFirst({
        where: { transactionId: reference },
        include: {
          property: {
            include: {
              host: { select: { id: true, email: true, firstName: true, lastName: true } },
              agent: { select: { id: true, email: true, firstName: true, lastName: true } }
            }
          },
          guest: { select: { id: true, email: true, firstName: true, lastName: true } }
        }
      });

      if (booking) {
        console.log('[XENTRIPAY_CALLBACK] Processing booking payment:', booking.id);

        // Update booking status
        await prisma.booking.update({
          where: { id: booking.id },
          data: {
            paymentStatus: 'completed',
            status: 'confirmed'
          }
        });

        // Calculate split amounts (platform gets 14%)
        const hasAgent = booking.property.agent !== null;
        const splitRules = calculateSplitRules(hasAgent);
        const splitAmounts = calculateSplitAmounts(booking.totalPrice, splitRules);

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
          }).catch((err: any) => console.error('[XENTRIPAY_CALLBACK] Failed to create owner payment:', err));
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
          }).catch((err: any) => console.error('[XENTRIPAY_CALLBACK] Failed to create agent commission:', err));
        }

        // ✅ UPDATE WALLET BALANCES IMMEDIATELY ON PAYMENT COMPLETION
        console.log('[XENTRIPAY_CALLBACK] Updating wallet balances for payment completion', {
          bookingId: booking.id,
          splitAmounts
        });

        // Update host wallet
        if (booking.property.host) {
          await updateWalletBalance(
            prisma,
            booking.property.host.id,
            splitAmounts.host,
            'PAYMENT_RECEIVED',
            reference,
            booking.id
          ).catch((err: any) => console.error('[XENTRIPAY_CALLBACK] Failed to update host wallet:', err));
        }

        // Update agent wallet (if exists)
        if (booking.property.agent && splitAmounts.agent > 0) {
          await updateWalletBalance(
            prisma,
            booking.property.agent.id,
            splitAmounts.agent,
            'COMMISSION_EARNED',
            reference,
            booking.id
          ).catch((err: any) => console.error('[XENTRIPAY_CALLBACK] Failed to update agent wallet:', err));
        }

        // Update platform wallet
        if (splitAmounts.platform > 0) {
          await updateWalletBalance(
            prisma,
            1, // Platform account (user ID 1)
            splitAmounts.platform,
            'PLATFORM_FEE',
            reference,
            booking.id
          ).catch((err: any) => console.error('[XENTRIPAY_CALLBACK] Failed to update platform wallet:', err));
        }

        console.log('[XENTRIPAY_CALLBACK] Wallet balances updated successfully');

        // Mark booking as wallet distributed
        await prisma.booking.update({
          where: { id: booking.id },
          data: {
            walletDistributed: true,
            walletDistributedAt: new Date()
          }
        }).catch((err: any) => console.error('[XENTRIPAY_CALLBACK] Failed to mark booking as wallet distributed:', err));

        // Log activities
        await logActivity(prisma, booking.guestId, 'PAYMENT_COMPLETED', 'booking', booking.id, {
          amount: booking.totalPrice,
          currency: 'USD',
          provider: 'Xentripay',
          reference
        });

        if (booking.property.host) {
          await logActivity(prisma, booking.property.host.id, 'BOOKING_PAYMENT_RECEIVED', 'booking', booking.id, {
            amount: booking.totalPrice,
            netAmount: splitAmounts.host,
            platformFee: splitAmounts.platform,
            provider: 'Xentripay'
          });
        }

        if (booking.property.agent) {
          await logActivity(prisma, booking.property.agent.id, 'AGENT_COMMISSION_EARNED', 'booking', booking.id, {
            amount: splitAmounts.agent,
            commissionRate: splitRules.agent,
            provider: 'Xentripay'
          });
        }

        console.log('[XENTRIPAY_CALLBACK] ✅ Booking payment processed successfully');

        // Send payment confirmation emails to guest, host, and agent
        await sendPropertyBookingPaymentEmails(reference, 'completed', undefined, reference);
      }
    }
  } catch (error) {
    console.error('[XENTRIPAY_CALLBACK] Error handling payment success:', error);
  }
}

/**
 * Handle payment failure (direct booking payment - no escrow)
 */
async function handlePaymentFailureDirectly(reference: string, prisma: any): Promise<void> {
  try {
    const failureReason = 'Payment was not completed';

    if (reference && reference.startsWith('BOOKING-')) {
      const booking = await prisma.booking.findFirst({
        where: { transactionId: reference },
        include: {
          guest: { select: { id: true } }
        }
      });

      if (booking) {
        await prisma.booking.update({
          where: { id: booking.id },
          data: {
            paymentStatus: 'failed'
          }
        });

        await logActivity(prisma, booking.guestId, 'PAYMENT_FAILED', 'booking', booking.id, {
          provider: 'Xentripay',
          reference,
          failureReason
        });

        // Send payment failure email to guest
        await sendPropertyBookingPaymentEmails(reference, 'failed', failureReason, reference);

        console.log('[XENTRIPAY_CALLBACK] Booking payment marked as failed');
      }
    }
  } catch (error) {
    console.error('[XENTRIPAY_CALLBACK] Error handling payment failure:', error);
  }
}

/**
 * Calculate split rules for bookings - uses config values
 */
function calculateSplitRules(hasAgent: boolean): { platform: number; agent: number; host: number } {
  const config = require('../config/config').default;
  const configRules = config.defaultSplitRules;

  if (hasAgent) {
    return {
      platform: configRules.platform,
      agent: configRules.agent,
      host: configRules.host
    };
  } else {
    return {
      platform: configRules.platform,
      agent: 0,
      host: configRules.host + configRules.agent
    };
  }
}

/**
 * Calculate split amounts
 */
function calculateSplitAmounts(amount: number, rules: { platform: number; agent: number; host: number }) {
  return {
    platform: Math.round((amount * rules.platform / 100) * 100) / 100,
    agent: Math.round((amount * rules.agent / 100) * 100) / 100,
    host: Math.round((amount * rules.host / 100) * 100) / 100
  };
}

/**
 * Log activity for a user
 */
async function logActivity(
  prisma: any,
  userId: number,
  action: string,
  resourceType: string,
  resourceId: string,
  details?: any
): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        userId,
        action,
        resourceType,
        resourceId,
        details: details || undefined,
        status: 'success'
      }
    });
  } catch (error) {
    console.error('[XENTRIPAY_CALLBACK] Failed to log activity:', error);
  }
}

/**
 * Update wallet balance for a user
 * Credits pendingBalance (not available for withdrawal until check-in)
 */
async function updateWalletBalance(
  prisma: any,
  userId: number,
  amount: number,
  type: string,
  reference: string,
  bookingId: string
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
          pendingBalance: 0,
          currency: 'USD',
          isActive: true
        }
      });
    }

    // Credit to pendingBalance (not available for withdrawal until check-in)
    const newPendingBalance = (wallet.pendingBalance || 0) + amount;

    // Update wallet pendingBalance
    await prisma.wallet.update({
      where: { userId },
      data: { pendingBalance: newPendingBalance }
    });

    // Create wallet transaction record
    await prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: amount > 0 ? 'credit' : 'debit',
        amount: Math.abs(amount),
        balanceBefore: wallet.pendingBalance || 0,
        balanceAfter: newPendingBalance,
        reference,
        description: `${type} - PENDING CHECK-IN - Booking: ${bookingId}`,
        transactionId: bookingId
      }
    });

    console.log('[XENTRIPAY_CALLBACK] Wallet pending balance updated successfully', {
      userId,
      amount,
      bookingId,
      previousPendingBalance: wallet.pendingBalance || 0,
      newPendingBalance,
      note: 'Funds will be available for withdrawal after check-in'
    });
  } catch (error) {
    console.error('[XENTRIPAY_CALLBACK] Failed to update wallet pending balance:', error);
    throw error;
  }
}

/**
 * Send payment status emails for property bookings
 */
async function sendPropertyBookingPaymentEmails(
  bookingId: string,
  status: 'completed' | 'failed',
  failureReason?: string,
  paymentReference?: string
): Promise<void> {
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    const booking = await prisma.booking.findFirst({
      where: {
        OR: [{ id: bookingId }, { transactionId: bookingId }]
      },
      include: {
        property: {
          include: {
            host: true,
            agent: {
              select: { id: true, email: true, firstName: true, lastName: true }
            }
          }
        },
        guest: true
      }
    });

    if (!booking || !booking.guest || !booking.property.host) {
      await prisma.$disconnect();
      return;
    }

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

    if (status === 'completed') {
      // Send confirmation to guest
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
        paymentCurrency: 'USD',
        paymentReference: paymentReference || bookingId
      });

      // Send notification to host
      await paymentEmailService.sendPaymentConfirmedToHost({
        user: {
          firstName: booking.property.host.firstName,
          lastName: booking.property.host.lastName,
          email: booking.property.host.email,
          id: booking.property.hostId || 0
        },
        company,
        booking: bookingInfo,
        recipientType: 'host',
        paymentStatus: 'completed',
        paymentAmount: booking.totalPrice,
        paymentCurrency: 'USD',
        paymentReference: paymentReference || bookingId
      });

      // Send notification to agent if exists
      if (booking.property.agent && booking.property.agent.id) {
        const agent = await prisma.user.findUnique({
          where: { id: booking.property.agent.id },
          select: { id: true, email: true, firstName: true, lastName: true }
        });

        if (agent) {
          await paymentEmailService.sendPaymentConfirmedToHost({
            user: {
              firstName: agent.firstName,
              lastName: agent.lastName,
              email: agent.email,
              id: agent.id
            },
            company,
            booking: bookingInfo,
            recipientType: 'host', // Using 'host' as recipient type for agent too
            paymentStatus: 'completed',
            paymentAmount: booking.totalPrice,
            paymentCurrency: 'USD',
            paymentReference: paymentReference || bookingId
          }).catch(err => console.error('[XENTRIPAY_CALLBACK] Error sending agent notification:', err));
        }
      }
    } else if (status === 'failed') {
      // Send failure notification to guest
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
        failureReason,
        paymentReference: paymentReference || bookingId
      });
    }

    await prisma.$disconnect();
  } catch (error) {
    console.error('[XENTRIPAY_CALLBACK] Error sending property booking payment emails:', error);
  }
}

// ==================== ROUTES ====================

/**
 * GET callback handler (user redirects after payment)
 * GET /api/xentripay/callback
 */
router.get('/callback', async (req: Request, res: Response) => {
  try {
    console.log(`[XENTRIPAY_CALLBACK] GET callback received at ${new Date().toISOString()}`);
    console.log('[XENTRIPAY_CALLBACK] Query params:', req.query);

    const callbackData = extractCallbackData(req);
    if (!callbackData) {
      console.error('[XENTRIPAY_CALLBACK] Invalid callback data');
      const frontendUrl = config.clientUrl || 'http://localhost:3000';
      return res.redirect(
        `${frontendUrl}/payment/error?message=${encodeURIComponent('Invalid callback data')}`
      );
    }

    // Process webhook data in background (don't wait for it)
    processWebhook(callbackData).catch(err => {
      console.error('[XENTRIPAY_CALLBACK] Background webhook processing failed:', err);
    });

    // Immediately redirect user - they'll see pending status and page will auto-refresh
    const frontendUrl = config.clientUrl || 'http://localhost:3000';
    
    // Determine redirect based on status
    const redirectPath = callbackData.status === 'SUCCESS' 
      ? '/payment/success'
      : callbackData.status === 'FAILED'
      ? '/payment/failed'
      : '/payment/pending';

    return res.redirect(
      `${frontendUrl}${redirectPath}?ref=${callbackData.refid}`
    );

  } catch (error: any) {
    console.error('[XENTRIPAY_CALLBACK] GET callback error:', error);
    const frontendUrl = config.clientUrl || 'http://localhost:3000';
    return res.redirect(
      `${frontendUrl}/payment/error?message=${encodeURIComponent('Payment processing error')}`
    );
  }
});

/**
 * POST callback handler (XentriPay webhook notifications)
 * POST /api/xentripay/callback
 */
router.post('/callback', async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    console.log(`[XENTRIPAY_CALLBACK] POST webhook received at ${new Date().toISOString()}`);
    console.log('[XENTRIPAY_CALLBACK] Headers:', JSON.stringify(req.headers, null, 2));
    console.log('[XENTRIPAY_CALLBACK] Body:', JSON.stringify(req.body, null, 2));

    // Verify signature (optional in sandbox)
    if (!verifyCallbackSignature(req)) {
      console.error('[XENTRIPAY_CALLBACK] Invalid callback signature');
      // Still return 200 to prevent retries
      return res.status(200).json({
        success: false,
        error: 'Invalid signature',
        timestamp: new Date().toISOString()
      });
    }

    // Extract and validate data
    const callbackData = extractCallbackData(req);
    if (!callbackData) {
      console.error('[XENTRIPAY_CALLBACK] Invalid callback data');
      return res.status(200).json({
        success: false,
        error: 'Invalid callback data',
        timestamp: new Date().toISOString()
      });
    }

    // Process webhook
    const processed = await processWebhook(callbackData);

    const processingTime = Date.now() - startTime;
    console.log(`[XENTRIPAY_CALLBACK] ${processed ? '✅' : '❌'} Webhook processed in ${processingTime}ms`);

    // Always respond with 200 to prevent XentriPay retries
    res.status(200).json({
      success: processed,
      message: processed ? 'Webhook processed successfully' : 'Webhook processing failed',
      refid: callbackData.refid,
      processingTime: `${processingTime}ms`,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    const processingTime = Date.now() - startTime;
    console.error('[XENTRIPAY_CALLBACK] POST webhook error:', error);
    console.error(`[XENTRIPAY_CALLBACK] Error after ${processingTime}ms`);
    
    // Return 200 to avoid retries but log error
    res.status(200).json({
      success: false,
      error: 'Internal server error',
      processingTime: `${processingTime}ms`,
      timestamp: new Date().toISOString(),
      note: 'Error logged for investigation'
    });
  }
});

/**
 * POST webhook handler (alternative endpoint)
 * POST /api/xentripay/webhook
 */
router.post('/webhook', async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    console.log(`[XENTRIPAY_WEBHOOK] POST webhook received at ${new Date().toISOString()}`);
    console.log('[XENTRIPAY_WEBHOOK] Headers:', JSON.stringify(req.headers, null, 2));
    console.log('[XENTRIPAY_WEBHOOK] Body:', JSON.stringify(req.body, null, 2));

    // Verify signature
    if (!verifyCallbackSignature(req)) {
      console.error('[XENTRIPAY_WEBHOOK] Invalid webhook signature');
      return res.status(200).json({
        success: false,
        error: 'Invalid signature',
        timestamp: new Date().toISOString()
      });
    }

    // Extract and validate data
    const callbackData = extractCallbackData(req);
    if (!callbackData) {
      console.error('[XENTRIPAY_WEBHOOK] Invalid webhook data');
      return res.status(200).json({
        success: false,
        error: 'Invalid webhook data',
        timestamp: new Date().toISOString()
      });
    }

    // Process webhook
    const processed = await processWebhook(callbackData);

    const processingTime = Date.now() - startTime;
    console.log(`[XENTRIPAY_WEBHOOK] ${processed ? '✅' : '❌'} Webhook processed in ${processingTime}ms`);

    res.status(200).json({
      success: processed,
      message: processed ? 'Webhook processed successfully' : 'Webhook processing failed',
      refid: callbackData.refid,
      processingTime: `${processingTime}ms`,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    const processingTime = Date.now() - startTime;
    console.error('[XENTRIPAY_WEBHOOK] POST webhook error:', error);
    
    res.status(200).json({
      success: false,
      error: 'Internal server error',
      processingTime: `${processingTime}ms`,
      timestamp: new Date().toISOString(),
      note: 'Error logged for investigation'
    });
  }
});

/**
 * Manual status check endpoint
 * POST /api/xentripay/check-status
 */
router.post('/check-status', async (req: Request, res: Response) => {
  try {
    const { refid, transactionId } = req.body;

    if (!refid && !transactionId) {
      return res.status(400).json({
        success: false,
        error: 'Either refid or transactionId is required'
      });
    }

    console.log('[XENTRIPAY_CHECK] Manual status check:', { refid, transactionId });

    let status;

    if (refid) {
      // Check collection status by refid
      status = await xentriPayService.getCollectionStatus(refid);
    } else {
      throw new Error('refid is required for status check');
    }

    res.json({
      success: true,
      data: status,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('[XENTRIPAY_CHECK] Status check error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Health check endpoint
 * GET /api/xentripay/health
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const xentriPayHealth = await xentriPayService.healthCheck();
    
    res.status(200).json({
      success: true,
      message: 'XentriPay callback handler is running',
      timestamp: new Date().toISOString(),
      environment: isProduction ? 'production' : 'sandbox',
      services: {
        xentripay: xentriPayHealth ? 'healthy' : 'unhealthy',
        escrow: true
      },
      endpoints: {
        callback: '/api/xentripay/callback',
        webhook: '/api/xentripay/webhook',
        checkStatus: '/api/xentripay/check-status'
      }
    });
  } catch (error: any) {
    res.status(503).json({
      success: false,
      error: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Test endpoint for webhook simulation (development only)
 * POST /api/xentripay/test-webhook
 */
if (!isProduction) {
  router.post('/test-webhook', async (req: Request, res: Response) => {
    try {
      const testData = {
        refid: req.body.refid || 'RefTEST123456',
        status: req.body.status || 'SUCCESS',
        amount: req.body.amount || 1000,
        transactionId: req.body.transactionId || 'test-tid-123',
        timestamp: new Date().toISOString()
      };

      console.log('[TEST_WEBHOOK] Processing test webhook:', testData);

      const processed = await processWebhook(testData);
      
      res.json({
        success: processed,
        message: processed ? 'Test webhook processed' : 'Test webhook failed',
        testData,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: 'Test webhook failed',
        details: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * Simulate collection completion (development only)
   * POST /api/xentripay/simulate-payment
   */
  router.post('/simulate-payment', async (req: Request, res: Response) => {
    try {
      const { refid, status = 'SUCCESS' } = req.body;

      if (!refid) {
        return res.status(400).json({
          success: false,
          error: 'refid is required'
        });
      }

      console.log('[SIMULATE_PAYMENT] Simulating payment:', { refid, status });

      // Simulate webhook callback
      const webhookData = {
        refid,
        status,
        amount: 1000,
        transactionId: `sim-${Date.now()}`,
        timestamp: new Date().toISOString()
      };

      const processed = await processWebhook(webhookData);

      res.json({
        success: processed,
        message: `Payment ${status} simulated`,
        webhookData,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: 'Simulation failed',
        details: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });
}

/**
 * Get callback/webhook logs (development only)
 * GET /api/xentripay/logs
 */
if (!isProduction) {
  router.get('/logs', (req: Request, res: Response) => {
    res.json({
      success: true,
      message: 'Callback logs are available in server console',
      tip: 'Check your terminal/console for detailed logs',
      timestamp: new Date().toISOString()
    });
  });
}

export default router;