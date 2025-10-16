// routes/pawapay.callback.ts - PawaPay Webhook/Callback Handler

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { pawaPayService } from '../services/pawapay.service';
import { PawaPayWebhookData } from '../types/pawapay.types';
import { validatePawaPayWebhook, logPawaPayRequest } from '../middleware/pawapay.middleware';
import { EmailService } from '../services/email.service';
import { BrevoPaymentStatusMailingService } from '../utils/brevo.payment-status';

const router = Router();
const prisma = new PrismaClient();
const emailService = new EmailService();
const paymentEmailService = new BrevoPaymentStatusMailingService();

/**
 * Helper function to extract userId from PawaPay metadata
 * Metadata comes as an array of objects like [{ userId: "123", isPII: true }, { bookingId: "abc" }]
 */
function extractUserIdFromMetadata(metadata: any): number | null {
  if (!metadata || typeof metadata !== 'object') return null;

  // If metadata is an array (PawaPay format)
  if (Array.isArray(metadata)) {
    for (const item of metadata) {
      if (typeof item === 'object' && item !== null) {
        // Check for userId in various formats
        if ('userId' in item) return parseInt(String(item.userId));
        if ('userid' in item) return parseInt(String(item.userid));
        if ('user_id' in item) return parseInt(String(item.user_id));
      }
    }
  }

  // If metadata is an object (fallback)
  if ('userId' in metadata) return parseInt(String(metadata.userId));
  if ('userid' in metadata) return parseInt(String(metadata.userid));
  if ('user_id' in metadata) return parseInt(String(metadata.user_id));

  return null;
}

/**
 * Helper function to extract internalReference from PawaPay metadata
 */
function extractInternalReferenceFromMetadata(metadata: any): string | null {
  if (!metadata || typeof metadata !== 'object') return null;

  // If metadata is an array (PawaPay format)
  if (Array.isArray(metadata)) {
    for (const item of metadata) {
      if (typeof item === 'object' && item !== null) {
        // Check for various reference field names
        if ('internalReference' in item) return String(item.internalReference);
        if ('clientReferenceId' in item) return String(item.clientReferenceId);
        if ('bookingId' in item) return String(item.bookingId);
        if ('booking_id' in item) return String(item.booking_id);
      }
    }
  }

  // If metadata is an object (fallback)
  if ('internalReference' in metadata) return String(metadata.internalReference);
  if ('clientReferenceId' in metadata) return String(metadata.clientReferenceId);
  if ('bookingId' in metadata) return String(metadata.bookingId);
  if ('booking_id' in metadata) return String(metadata.booking_id);

  return null;
}

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

    // Extract userId from metadata if present
    const metadataObj = webhookData.metadata || {};
    const extractedUserId = extractUserIdFromMetadata(metadataObj);

    // Process transaction update
    const transaction = await prisma.pawaPayTransaction.upsert({
      where: { transactionId },
      create: {
        userId: extractedUserId, // Extract userId from metadata
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
        internalReference: extractInternalReferenceFromMetadata(metadataObj), // Also extract internal reference
        completedAt: webhookData.status === 'COMPLETED' ? new Date() : null
      },
      update: {
        userId: extractedUserId, // Update userId if it was null
        status: webhookData.status,
        callbackReceived: true,
        callbackReceivedAt: new Date(),
        depositedAmount: webhookData.depositedAmount,
        providerTransactionId: webhookData.correspondentIds?.PROVIDER_TRANSACTION_ID,
        financialTransactionId: webhookData.correspondentIds?.FINANCIAL_TRANSACTION_ID,
        failureCode: webhookData.failureReason?.failureCode,
        failureMessage: webhookData.failureReason?.failureMessage,
        completedAt: webhookData.status === 'COMPLETED' ? new Date() : null,
        internalReference: extractInternalReferenceFromMetadata(metadataObj) // Also update internal reference
      }
    });

    // Handle status-specific logic asynchronously
    handleTransactionStatus(transaction, webhookData).catch((error) => {
      console.error('[PAWAPAY_CALLBACK] Error handling transaction status:', error);
    });

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

  if (!internalRef) {
    console.log('[PAWAPAY_CALLBACK] No internal reference found for failed transaction');
    return;
  }

  const failureReason = webhookData.failureReason?.failureMessage || 'Payment could not be processed';
  console.log(`[PAWAPAY_CALLBACK] Handling failed transaction for ${internalRef}: ${failureReason}`);

  if (transaction.transactionType === 'DEPOSIT') {
    // Handle property booking failures
    const booking = await prisma.booking.findFirst({
      where: {
        OR: [{ transactionId: internalRef }, { id: internalRef }]
        // Remove paymentStatus filter to find booking regardless of current status
      },
      include: {
        property: {
          select: { name: true }
        },
        guest: {
          select: {
            id: true,
            email: true,
            firstName: true
          }
        }
      }
    });

    if (booking) {
      console.log(`[PAWAPAY_CALLBACK] Found property booking ${booking.id} for failed payment`);

      await prisma.booking.update({
        where: { id: booking.id },
        data: {
          paymentStatus: 'failed'
        }
      });

      // Log activity
      await logActivity(booking.guestId, 'PAYMENT_FAILED', 'booking', booking.id, {
        provider: 'PawaPay',
        failureReason,
        reference: internalRef
      });

      console.log(`[PAWAPAY_CALLBACK] Sending payment failure email for booking ${booking.id}`);

      // Fetch full booking details for Brevo email service
      const fullBooking = await prisma.booking.findFirst({
        where: { id: booking.id },
        include: {
          property: {
            include: {
              host: true
            }
          },
          guest: true
        }
      });

      if (fullBooking && fullBooking.guest && fullBooking.property.host) {
        const bookingInfo: any = {
          id: fullBooking.id,
          propertyId: fullBooking.propertyId,
          property: {
            name: fullBooking.property.name,
            location: fullBooking.property.location,
            images: typeof fullBooking.property.images === 'string' ? JSON.parse(fullBooking.property.images) : fullBooking.property.images || {},
            pricePerNight: fullBooking.property.pricePerNight,
            hostName: `${fullBooking.property.host.firstName} ${fullBooking.property.host.lastName}`,
            hostEmail: fullBooking.property.host.email,
            hostPhone: fullBooking.property.host.phone || undefined
          },
          guestId: fullBooking.guestId,
          guest: {
            firstName: fullBooking.guest.firstName,
            lastName: fullBooking.guest.lastName,
            email: fullBooking.guest.email,
            phone: fullBooking.guest.phone || undefined,
            profileImage: fullBooking.guest.profileImage || undefined
          },
          checkIn: fullBooking.checkIn.toISOString(),
          checkOut: fullBooking.checkOut.toISOString(),
          guests: fullBooking.guests,
          nights: Math.ceil((fullBooking.checkOut.getTime() - fullBooking.checkIn.getTime()) / (1000 * 60 * 60 * 24)),
          totalPrice: fullBooking.totalPrice,
          status: fullBooking.status,
          paymentStatus: fullBooking.paymentStatus,
          createdAt: fullBooking.createdAt.toISOString(),
          updatedAt: fullBooking.updatedAt.toISOString()
        };

        const company = {
          name: 'Jambolush',
          website: 'https://jambolush.com',
          supportEmail: 'support@jambolush.com',
          logo: 'https://jambolush.com/favicon.ico'
        };

        // Send payment failed email using Brevo service
        await paymentEmailService.sendPaymentFailedEmail({
          user: {
            firstName: fullBooking.guest.firstName,
            lastName: fullBooking.guest.lastName,
            email: fullBooking.guest.email,
            id: fullBooking.guestId
          },
          company,
          booking: bookingInfo,
          recipientType: 'guest',
          paymentStatus: 'failed',
          failureReason
        }).catch(err => {
          console.error('[PAWAPAY_CALLBACK] Failed to send payment failed email to guest:', err);
        });
      }
    } else {
      console.log(`[PAWAPAY_CALLBACK] No property booking found for reference ${internalRef}`);
    }

    // Handle tour booking failures
    const tourBooking = await prisma.tourBooking.findFirst({
      where: {
        OR: [{ id: internalRef }]
        // Remove paymentStatus filter to find booking regardless of current status
      },
      include: {
        tour: {
          select: { title: true }
        },
        user: {
          select: {
            id: true,
            email: true,
            firstName: true
          }
        }
      }
    });

    if (tourBooking) {
      console.log(`[PAWAPAY_CALLBACK] Found tour booking ${tourBooking.id} for failed payment`);

      await prisma.tourBooking.update({
        where: { id: tourBooking.id },
        data: {
          paymentStatus: 'failed'
        }
      });

      // Log activity
      await logActivity(tourBooking.userId, 'TOUR_PAYMENT_FAILED', 'tour_booking', tourBooking.id, {
        provider: 'PawaPay',
        failureReason,
        reference: internalRef
      });

      console.log(`[PAWAPAY_CALLBACK] Sending payment failure email for tour booking ${tourBooking.id}`);

      // Fetch full tour booking details for Brevo email service
      const fullTourBooking = await prisma.tourBooking.findFirst({
        where: { id: tourBooking.id },
        include: {
          tour: { include: { tourGuide: true } },
          schedule: true,
          user: true
        }
      });

      if (fullTourBooking && fullTourBooking.user && fullTourBooking.tour.tourGuide) {
        const bookingInfo: any = {
          id: fullTourBooking.id,
          tourId: String(fullTourBooking.tourId),
          tour: {
            title: fullTourBooking.tour.title,
            description: fullTourBooking.tour.description,
            category: fullTourBooking.tour.category,
            type: fullTourBooking.tour.type,
            duration: fullTourBooking.tour.duration,
            difficulty: fullTourBooking.tour.difficulty,
            location: `${fullTourBooking.tour.locationCity}, ${fullTourBooking.tour.locationCountry}`,
            images: JSON.parse(String(fullTourBooking.tour.images) || '{}'),
            price: fullTourBooking.tour.price,
            currency: fullTourBooking.tour.currency,
            inclusions: JSON.parse(String(fullTourBooking.tour.inclusions) || '[]'),
            exclusions: JSON.parse(String(fullTourBooking.tour.exclusions) || '[]'),
            requirements: JSON.parse(String(fullTourBooking.tour.requirements) || '[]'),
            meetingPoint: fullTourBooking.tour.meetingPoint
          },
          scheduleId: fullTourBooking.scheduleId,
          schedule: {
            startDate: fullTourBooking.schedule.startDate.toISOString(),
            endDate: fullTourBooking.schedule.endDate.toISOString(),
            startTime: fullTourBooking.schedule.startTime,
            endTime: fullTourBooking.schedule.endTime || undefined,
            availableSlots: fullTourBooking.schedule.availableSlots,
            bookedSlots: fullTourBooking.schedule.bookedSlots
          },
          tourGuideId: fullTourBooking.tourGuideId,
          tourGuide: {
            firstName: fullTourBooking.tour.tourGuide.firstName,
            lastName: fullTourBooking.tour.tourGuide.lastName,
            email: fullTourBooking.tour.tourGuide.email,
            phone: fullTourBooking.tour.tourGuide.phone || undefined,
            profileImage: fullTourBooking.tour.tourGuide.profileImage || undefined,
            bio: fullTourBooking.tour.tourGuide.bio || undefined,
            rating: fullTourBooking.tour.tourGuide.rating || undefined,
            totalTours: fullTourBooking.tour.tourGuide.totalTours || undefined
          },
          userId: fullTourBooking.userId,
          user: {
            firstName: fullTourBooking.user.firstName,
            lastName: fullTourBooking.user.lastName,
            email: fullTourBooking.user.email,
            phone: fullTourBooking.user.phone || undefined,
            profileImage: fullTourBooking.user.profileImage || undefined
          },
          numberOfParticipants: fullTourBooking.numberOfParticipants,
          participants: JSON.parse(String(fullTourBooking.participants) || '[]'),
          totalAmount: fullTourBooking.totalAmount,
          currency: fullTourBooking.currency,
          status: fullTourBooking.status,
          paymentStatus: fullTourBooking.paymentStatus,
          bookingDate: fullTourBooking.bookingDate.toISOString(),
          createdAt: fullTourBooking.createdAt.toISOString(),
          updatedAt: fullTourBooking.updatedAt.toISOString()
        };

        const company = {
          name: 'Jambolush',
          website: 'https://jambolush.com',
          supportEmail: 'support@jambolush.com',
          logo: 'https://jambolush.com/favicon.ico'
        };

        // Send payment failed email using Brevo service
        await paymentEmailService.sendPaymentFailedEmail({
          user: {
            firstName: fullTourBooking.user.firstName,
            lastName: fullTourBooking.user.lastName,
            email: fullTourBooking.user.email,
            id: fullTourBooking.userId
          },
          company,
          booking: bookingInfo,
          recipientType: 'guest',
          paymentStatus: 'failed',
          failureReason
        }).catch(err => {
          console.error('[PAWAPAY_CALLBACK] Failed to send tour booking failure email:', err);
        });
      }
    } else {
      console.log(`[PAWAPAY_CALLBACK] No tour booking found for reference ${internalRef}`);
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
      // Fetch full booking details with all relationships
      const booking = await prisma.booking.findFirst({
        where: {
          OR: [{ transactionId: internalRef }, { id: internalRef }]
        },
        include: {
          property: {
            include: {
              host: true, // Get full host details
              agent: true // Get full agent details
            }
          },
          guest: true // Get full guest details
        }
      });

      if (booking) {
        // Update booking payment status and confirm booking
        await prisma.booking.update({
          where: { id: booking.id },
          data: {
            paymentStatus: 'completed',
            status: 'confirmed', // Also confirm the booking when payment is completed
            transactionId: transaction.transactionId
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
              status: 'pending', // Requires check-in validation
              checkInRequired: true,
              checkInValidated: false
            }
          }).catch(err => console.error('[PAWAPAY] Failed to create owner payment record:', err));
        }

        // Create agent commission record if agent exists
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
          }).catch(err => console.error('[PAWAPAY] Failed to create agent commission record:', err));
        }

        // ✅ UPDATE WALLET BALANCES IMMEDIATELY ON PAYMENT COMPLETION
        console.log('[PAWAPAY] Updating wallet balances for payment completion', {
          bookingId: booking.id,
          splitAmounts
        });

        // Update host wallet
        if (booking.property.host) {
          await updateWalletBalance(
            booking.property.host.id,
            splitAmounts.host,
            'PAYMENT_RECEIVED',
            internalRef
          ).catch(err => console.error('[PAWAPAY] Failed to update host wallet:', err));
        }

        // Update agent wallet (if exists)
        if (booking.property.agent && splitAmounts.agent > 0) {
          await updateWalletBalance(
            booking.property.agent.id,
            splitAmounts.agent,
            'COMMISSION_EARNED',
            internalRef
          ).catch(err => console.error('[PAWAPAY] Failed to update agent wallet:', err));
        }

        // Update platform wallet
        if (splitAmounts.platform > 0) {
          await updateWalletBalance(
            1, // Platform account (user ID 1)
            splitAmounts.platform,
            'PLATFORM_FEE',
            internalRef
          ).catch(err => console.error('[PAWAPAY] Failed to update platform wallet:', err));
        }

        console.log('[PAWAPAY] Wallet balances updated successfully');

        // Mark booking as wallet distributed
        await prisma.booking.update({
          where: { id: booking.id },
          data: {
            walletDistributed: true,
            walletDistributedAt: new Date()
          }
        }).catch(err => console.error('[PAWAPAY] Failed to mark booking as wallet distributed:', err));

        // Log activity for all parties
        await logActivity(booking.guestId, 'PAYMENT_COMPLETED', 'booking', booking.id, {
          amount: booking.totalPrice,
          currency: 'USD',
          provider: 'PawaPay',
          reference: internalRef
        });

        if (booking.property.host) {
          await logActivity(booking.property.host.id, 'BOOKING_PAYMENT_RECEIVED', 'booking', booking.id, {
            amount: booking.totalPrice,
            netAmount: splitAmounts.host,
            platformFee: splitAmounts.platform,
            provider: 'PawaPay'
          });
        }

        if (booking.property.agent) {
          await logActivity(booking.property.agent.id, 'AGENT_COMMISSION_EARNED', 'booking', booking.id, {
            amount: splitAmounts.agent,
            commissionRate: splitRules.agent,
            provider: 'PawaPay'
          });
        }

        // Send booking confirmation email using Brevo service
        console.log(`[PAWAPAY_CALLBACK] Sending payment confirmation emails for booking ${booking.id}`);

        // Prepare booking data for Brevo service
        if (!booking.guest || !booking.property.host) {
          console.error('[PAWAPAY_CALLBACK] Missing guest or host data for booking', booking.id);
          return;
        }

        const bookingForEmail: any = {
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
          createdAt: booking.createdAt.toISOString(),
          updatedAt: booking.updatedAt.toISOString()
        };

        const company = {
          name: 'Jambolush',
          website: 'https://jambolush.com',
          supportEmail: 'support@jambolush.com',
          logo: 'https://jambolush.com/favicon.ico'
        };

        // Send email to guest
        await paymentEmailService.sendPaymentCompletedEmail({
          user: {
            firstName: booking.guest.firstName,
            lastName: booking.guest.lastName,
            email: booking.guest.email,
            id: booking.guestId
          },
          company,
          booking: bookingForEmail,
          recipientType: 'guest',
          paymentStatus: 'completed',
          paymentAmount: booking.totalPrice,
          paymentCurrency: 'USD'
        }).catch(err => console.error('[PAWAPAY_CALLBACK] Failed to send booking confirmation email:', err));

        // Send notification to host
        if (booking.property.host) {
          await paymentEmailService.sendPaymentConfirmedToHost({
            user: {
              firstName: booking.property.host.firstName,
              lastName: booking.property.host.lastName,
              email: booking.property.host.email,
              id: booking.property.hostId || 0
            },
            company,
            booking: bookingForEmail,
            recipientType: 'host',
            paymentStatus: 'completed',
            paymentAmount: booking.totalPrice,
            paymentCurrency: 'USD'
          }).catch(err => console.error('[PAWAPAY_CALLBACK] Failed to send host notification email:', err));
        }

        // Send notification to agent
        if (booking.property.agent) {
          await paymentEmailService.sendPaymentConfirmedToHost({
            user: {
              firstName: booking.property.agent.firstName,
              lastName: booking.property.agent.lastName,
              email: booking.property.agent.email,
              id: booking.property.agent.id
            },
            company,
            booking: bookingForEmail,
            recipientType: 'host',
            paymentStatus: 'completed',
            paymentAmount: splitAmounts.agent,
            paymentCurrency: 'USD'
          }).catch(err => console.error('[PAWAPAY_CALLBACK] Failed to send agent notification email:', err));
        }
      }
    }

    // Handle tour bookings
    const tourBooking = await prisma.tourBooking.findFirst({
      where: { id: internalRef },
      include: {
        tour: {
          include: {
            tourGuide: { select: { id: true, email: true, firstName: true, lastName: true } }
          }
        },
        user: { select: { id: true, email: true, firstName: true, lastName: true } }
      }
    });

    if (tourBooking) {
      await prisma.tourBooking.update({
        where: { id: tourBooking.id },
        data: {
          paymentStatus: 'completed',
          status: 'confirmed'
        }
      });

      // Calculate platform fee (14%)
      const platformFee = tourBooking.totalAmount * 0.14;
      const guideEarning = tourBooking.totalAmount - platformFee;

      // Create tour earnings record
      await prisma.tourEarnings.create({
        data: {
          tourGuideId: tourBooking.tourGuideId,
          bookingId: tourBooking.id,
          tourId: tourBooking.tourId,
          amount: tourBooking.totalAmount,
          commission: platformFee,
          netAmount: guideEarning,
          currency: tourBooking.currency,
          status: 'pending'
        }
      }).catch(err => console.error('[PAWAPAY] Failed to create tour earnings record:', err));

      // Log activity
      await logActivity(tourBooking.userId, 'TOUR_PAYMENT_COMPLETED', 'tour_booking', tourBooking.id, {
        amount: tourBooking.totalAmount,
        currency: tourBooking.currency,
        provider: 'PawaPay'
      });

      await logActivity(tourBooking.tourGuideId, 'TOUR_BOOKING_PAYMENT_RECEIVED', 'tour_booking', tourBooking.id, {
        amount: tourBooking.totalAmount,
        netAmount: guideEarning,
        platformFee,
        provider: 'PawaPay'
      });

      // Send payment confirmation emails using EmailService
      console.log(`[PAWAPAY_CALLBACK] Sending tour booking payment confirmation emails for booking ${tourBooking.id}`);

      // Note: EmailService doesn't have tour-specific templates yet, so we'll use booking templates as fallback
      // TODO: Add tour-specific email templates to EmailService
      console.log(`[PAWAPAY_CALLBACK] ⚠️ Tour booking emails need tour-specific templates - using generic confirmation`);
    }
  } catch (error) {
    console.error('[PAWAPAY] Error handling deposit completion:', error);
  }
}

/**
 * Calculate split rules for booking payments - uses config values
 */
function calculateSplitRules(hasAgent: boolean): { platform: number; agent: number; host: number } {
  const config = require('../config/config').default;
  const configRules = config.escrow.defaultSplitRules;

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
 * Calculate split amounts from total amount
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
    console.error('[PAWAPAY] Failed to log activity:', error);
    // Don't throw - logging is non-critical
  }
}

/**
 * Update wallet balance for a user
 */
async function updateWalletBalance(
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

    console.log('[PAWAPAY] Wallet updated successfully', {
      userId,
      amount,
      previousBalance: wallet.balance,
      newBalance
    });
  } catch (error) {
    console.error('[PAWAPAY] Failed to update wallet balance:', error);
    throw error;
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
    const withdrawal = await prisma.withdrawalRequest.findFirst({
      where: { reference: internalRef, status: 'PROCESSING' },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } }
      }
    });

    if (withdrawal) {
      await prisma.withdrawalRequest.update({
        where: { id: withdrawal.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date()
        }
      });

      // Log activity
      await logActivity(withdrawal.userId, 'WITHDRAWAL_COMPLETED', 'withdrawal', withdrawal.id, {
        amount: withdrawal.amount,
        currency: withdrawal.currency,
        provider: 'PawaPay',
        reference: internalRef
      });

      console.log('[PAWAPAY] ✅ Payout completed successfully for withdrawal:', withdrawal.id);
    }
  } catch (error) {
    console.error('[PAWAPAY] Error handling payout completion:', error);
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
    const escrowTx = await prisma.escrowTransaction.findFirst({
      where: { reference: internalRef },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } }
      }
    });

    if (escrowTx) {
      await prisma.escrowTransaction.update({
        where: { id: escrowTx.id },
        data: {
          status: 'REFUNDED',
          refundedAt: new Date()
        }
      });

      // Log activity
      await logActivity(escrowTx.userId, 'REFUND_COMPLETED', 'escrow', escrowTx.id, {
        amount: escrowTx.amount,
        currency: escrowTx.currency,
        provider: 'PawaPay',
        reference: internalRef
      });

      console.log('[PAWAPAY] ✅ Refund completed successfully for escrow transaction:', escrowTx.id);
    }
  } catch (error) {
    console.error('[PAWAPAY] Error handling refund completion:', error);
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
