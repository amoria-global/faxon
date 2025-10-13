// routes/pawapay.callback.ts - PawaPay Webhook/Callback Handler

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { pawaPayService } from '../services/pawapay.service';
import { PawaPayWebhookData } from '../types/pawapay.types';
import { validatePawaPayWebhook, logPawaPayRequest } from '../middleware/pawapay.middleware';
import { BrevoPaymentStatusMailingService } from '../utils/brevo.payment-status';

const router = Router();
const prisma = new PrismaClient();
const paymentEmailService = new BrevoPaymentStatusMailingService();

/**
 * POST /api/pawapay/callback
 * Handle PawaPay webhook callbacks for deposits, payouts, and refunds
 * Validates bearer token and webhook signature
 */
router.post('/', logPawaPayRequest, validatePawaPayWebhook, async (req: Request, res: Response) => {
  try {
    const webhookData: PawaPayWebhookData = req.body;
    const signature = req.headers['x-pawapay-signature'] as string;
    const transactionId = webhookData.depositId || webhookData.payoutId || webhookData.refundId;
    const transactionType = webhookData.depositId ? 'DEPOSIT' : webhookData.payoutId ? 'PAYOUT' : 'REFUND';

    if (!transactionId) {
      res.status(400).json({ success: false, message: 'Missing transaction ID' });
      return;
    }

    // Validate signature first
    if (signature && process.env.PAWAPAY_WEBHOOK_SECRET) {
      const signatureValid = pawaPayService.validateWebhookSignature(JSON.stringify(req.body), signature);
      if (!signatureValid) {
        res.status(401).json({ success: false, message: 'Invalid signature' });
        return;
      }
    }

    // Process transaction update
    const transaction = await prisma.pawaPayTransaction.upsert({
      where: { transactionId },
      create: {
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
      },
      update: {
        status: webhookData.status,
        callbackReceived: true,
        callbackReceivedAt: new Date(),
        depositedAmount: webhookData.depositedAmount,
        providerTransactionId: webhookData.correspondentIds?.PROVIDER_TRANSACTION_ID,
        financialTransactionId: webhookData.correspondentIds?.FINANCIAL_TRANSACTION_ID,
        failureCode: webhookData.failureReason?.failureCode,
        failureMessage: webhookData.failureReason?.failureMessage,
        completedAt: webhookData.status === 'COMPLETED' ? new Date() : null
      }
    });

    // Handle status-specific logic asynchronously
    handleTransactionStatus(transaction, webhookData).catch(() => {});

    res.status(200).json({
      success: true,
      transactionId,
      status: webhookData.status
    });

  } catch (error) {
    res.status(200).json({
      success: false,
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
  const amount = pawaPayService.convertFromSmallestUnit(transaction.amount, currency);

  if (status === 'COMPLETED') {
    await handleCompletedTransaction(transaction, webhookData, amount);
  } else if (status === 'FAILED') {
    await handleFailedTransaction(transaction, webhookData);
  }
}

/**
 * Handle failed transactions
 */
async function handleFailedTransaction(
  transaction: any,
  webhookData: PawaPayWebhookData
): Promise<void> {
  const internalRef = transaction.internalReference || (transaction.metadata as any)?.internalReference;

  if (!internalRef) return;

  const failureReason = webhookData.failureReason?.failureMessage || 'Payment could not be processed';

  if (transaction.transactionType === 'DEPOSIT') {
    // Update property bookings
    const propertyBookings = await prisma.booking.updateMany({
      where: {
        OR: [{ transactionId: internalRef }, { id: internalRef }],
        paymentStatus: 'pending'
      },
      data: {
        paymentStatus: 'failed'
      }
    });

    if (propertyBookings.count > 0) {
      await sendPropertyBookingPaymentEmails(internalRef, 'failed', failureReason);
    }

    // Update tour bookings
    const tourBookings = await prisma.tourBooking.updateMany({
      where: {
        OR: [{ id: internalRef }],
        paymentStatus: 'pending'
      },
      data: {
        paymentStatus: 'failed'
      }
    });

    if (tourBookings.count > 0) {
      await sendTourBookingPaymentEmails(internalRef, 'failed', failureReason);
    }
  }
}

/**
 * Handle completed transactions
 */
async function handleCompletedTransaction(
  transaction: any,
  _webhookData: PawaPayWebhookData,
  amount: number
): Promise<void> {
  const internalRef = transaction.internalReference || (transaction.metadata as any)?.internalReference;

  if (!internalRef) return;

  if (transaction.transactionType === 'DEPOSIT') {
    await handleDepositCompletion(transaction, internalRef, amount);
  } else if (transaction.transactionType === 'PAYOUT') {
    await handlePayoutCompletion(transaction, internalRef, amount);
  } else if (transaction.transactionType === 'REFUND') {
    await handleRefundCompletion(transaction, internalRef, amount);
  }
}

/**
 * Handle deposit completion
 */
async function handleDepositCompletion(
  transaction: any,
  internalRef: string,
  _amount: number
): Promise<void> {
  try {
    if (internalRef.startsWith('ESC_') || internalRef.includes('escrow')) {
      await prisma.escrowTransaction.updateMany({
        where: { reference: internalRef, status: 'PENDING' },
        data: {
          status: 'FUNDED',
          fundedAt: new Date(),
          externalId: transaction.transactionId
        }
      });
    }

    if (internalRef.startsWith('BOOK_') || internalRef.includes('booking')) {
      // Update booking payment status and confirm booking
      const updatedBookings = await prisma.booking.updateMany({
        where: {
          OR: [{ transactionId: internalRef }, { id: internalRef }],
          paymentStatus: 'pending'
        },
        data: {
          paymentStatus: 'completed',
          status: 'confirmed', // Also confirm the booking when payment is completed
          transactionId: transaction.transactionId
        }
      });

      // Send payment confirmation emails to guest and host
      if (updatedBookings.count > 0) {
        await sendPropertyBookingPaymentEmails(internalRef, 'completed');
      }
    }

    // Handle tour bookings
    const tourBookings = await prisma.tourBooking.updateMany({
      where: {
        OR: [{ id: internalRef }],
        paymentStatus: 'pending'
      },
      data: {
        paymentStatus: 'completed'
      }
    });

    if (tourBookings.count > 0) {
      await sendTourBookingPaymentEmails(internalRef, 'completed');
    }
  } catch (error) {
    console.error('Error handling deposit completion:', error);
  }
}

/**
 * Send payment status emails for property bookings
 */
async function sendPropertyBookingPaymentEmails(
  bookingId: string,
  status: 'completed' | 'failed',
  failureReason?: string
): Promise<void> {
  try {
    const booking = await prisma.booking.findFirst({
      where: {
        OR: [{ id: bookingId }, { transactionId: bookingId }]
      },
      include: {
        property: { include: { host: true } },
        guest: true
      }
    });

    if (!booking || !booking.guest || !booking.property.host) return;

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
        paymentCurrency: 'USD'
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
        paymentCurrency: 'USD'
      });
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
        failureReason
      });
    }
  } catch (error) {
    console.error('Error sending property booking payment emails:', error);
  }
}

/**
 * Send payment status emails for tour bookings
 */
async function sendTourBookingPaymentEmails(
  bookingId: string,
  status: 'completed' | 'failed',
  failureReason?: string
): Promise<void> {
  try {
    const booking = await prisma.tourBooking.findFirst({
      where: { id: bookingId },
      include: {
        tour: { include: { tourGuide: true } },
        schedule: true,
        user: true
      }
    });

    if (!booking || !booking.user || !booking.tour.tourGuide) return;

    const bookingInfo: any = {
      id: booking.id,
      tourId: String(booking.tourId),
      tour: {
        title: booking.tour.title,
        description: booking.tour.description,
        category: booking.tour.category,
        type: booking.tour.type,
        duration: booking.tour.duration,
        difficulty: booking.tour.difficulty,
        location: `${booking.tour.locationCity}, ${booking.tour.locationCountry}`,
        images: JSON.parse(String(booking.tour.images) || '{}'),
        price: booking.tour.price,
        currency: booking.tour.currency,
        inclusions: JSON.parse(String(booking.tour.inclusions) || '[]'),
        exclusions: JSON.parse(String(booking.tour.exclusions) || '[]'),
        requirements: JSON.parse(String(booking.tour.requirements) || '[]'),
        meetingPoint: booking.tour.meetingPoint
      },
      scheduleId: booking.scheduleId,
      schedule: {
        startDate: booking.schedule.startDate.toISOString(),
        endDate: booking.schedule.endDate.toISOString(),
        startTime: booking.schedule.startTime,
        endTime: booking.schedule.endTime || undefined,
        availableSlots: booking.schedule.availableSlots,
        bookedSlots: booking.schedule.bookedSlots
      },
      tourGuideId: booking.tourGuideId,
      tourGuide: {
        firstName: booking.tour.tourGuide.firstName,
        lastName: booking.tour.tourGuide.lastName,
        email: booking.tour.tourGuide.email,
        phone: booking.tour.tourGuide.phone || undefined,
        profileImage: booking.tour.tourGuide.profileImage || undefined,
        bio: booking.tour.tourGuide.bio || undefined,
        rating: booking.tour.tourGuide.rating || undefined,
        totalTours: booking.tour.tourGuide.totalTours || undefined
      },
      userId: booking.userId,
      user: {
        firstName: booking.user.firstName,
        lastName: booking.user.lastName,
        email: booking.user.email,
        phone: booking.user.phone || undefined,
        profileImage: booking.user.profileImage || undefined
      },
      numberOfParticipants: booking.numberOfParticipants,
      participants: JSON.parse(String(booking.participants) || '[]'),
      totalAmount: booking.totalAmount,
      currency: booking.currency,
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      checkInStatus: booking.checkInStatus,
      checkInTime: booking.checkInTime?.toISOString(),
      checkOutTime: booking.checkOutTime?.toISOString(),
      specialRequests: booking.specialRequests || undefined,
      refundAmount: booking.refundAmount || undefined,
      refundReason: booking.refundReason || undefined,
      bookingDate: booking.bookingDate.toISOString(),
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
          firstName: booking.user.firstName,
          lastName: booking.user.lastName,
          email: booking.user.email,
          id: booking.userId
        },
        company,
        booking: bookingInfo,
        recipientType: 'guest',
        paymentStatus: 'completed',
        paymentAmount: booking.totalAmount,
        paymentCurrency: booking.currency
      });

      // Send notification to tour guide
      await paymentEmailService.sendPaymentConfirmedToHost({
        user: {
          firstName: booking.tour.tourGuide.firstName,
          lastName: booking.tour.tourGuide.lastName,
          email: booking.tour.tourGuide.email,
          id: booking.tourGuideId
        },
        company,
        booking: bookingInfo,
        recipientType: 'guide',
        paymentStatus: 'completed',
        paymentAmount: booking.totalAmount,
        paymentCurrency: booking.currency
      });
    } else if (status === 'failed') {
      // Send failure notification to guest
      await paymentEmailService.sendPaymentFailedEmail({
        user: {
          firstName: booking.user.firstName,
          lastName: booking.user.lastName,
          email: booking.user.email,
          id: booking.userId
        },
        company,
        booking: bookingInfo,
        recipientType: 'guest',
        paymentStatus: 'failed',
        failureReason
      });
    }
  } catch (error) {
    console.error('Error sending tour booking payment emails:', error);
  }
}

/**
 * Handle payout completion
 */
async function handlePayoutCompletion(
  _transaction: any,
  internalRef: string,
  _amount: number
): Promise<void> {
  try {
    await prisma.withdrawalRequest.updateMany({
      where: { reference: internalRef, status: 'PROCESSING' },
      data: {
        status: 'COMPLETED',
        completedAt: new Date()
      }
    });
  } catch (error) {
    // Silent fail
  }
}

/**
 * Handle refund completion
 */
async function handleRefundCompletion(
  _transaction: any,
  internalRef: string,
  _amount: number
): Promise<void> {
  try {
    await prisma.escrowTransaction.updateMany({
      where: { reference: internalRef },
      data: {
        status: 'REFUNDED',
        refundedAt: new Date()
      }
    });
  } catch (error) {
    // Silent fail
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
