// routes/pawapay.callback.ts - PawaPay Webhook/Callback Handler

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { pawaPayService } from '../services/pawapay.service';
import { PawaPayWebhookData } from '../types/pawapay.types';
import { validatePawaPayWebhook, logPawaPayRequest } from '../middleware/pawapay.middleware';
import { EmailService } from '../services/email.service';
import { BrevoPaymentStatusMailingService } from '../utils/brevo.payment-status';
import { generateUniqueBookingCode } from '../utils/booking-code.utility';
import smsService from '../services/sms.service';
import { BookingCleanupService } from '../services/booking-cleanup.service';
import config from '../config/config';

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

    const internalRef = extractInternalReferenceFromMetadata(metadataObj);

    // CRITICAL: Check if transaction already exists before creating
    // If it doesn't exist and we don't have a userId, we should NOT create it
    // This prevents creating transactions with null userId when webhook arrives before deposit initiation
    const existingTransaction = await prisma.transaction.findUnique({
      where: { reference: transactionId }
    });

    // If transaction doesn't exist and we don't have userId, skip creation
    if (!existingTransaction && !extractedUserId) {
      // Return success to PawaPay but don't create the transaction
      // The deposit initiation will create it with proper userId
      res.status(200).json({
        success: true,
        transactionId,
        status: webhookData.status,
        note: 'Transaction not created - awaiting deposit initiation'
      });
      return;
    }

    // Process transaction update using unified Transaction model
    const transaction = await prisma.transaction.upsert({
      where: { reference: transactionId },
      create: {
        reference: transactionId,
        provider: 'PAWAPAY',
        transactionType,
        paymentMethod: 'mobile_money',
        userId: extractedUserId, // This should now always have a value when creating
        amount: parseFloat(webhookData.requestedAmount),
        currency: webhookData.currency,
        requestedAmount: parseFloat(webhookData.requestedAmount),
        depositedAmount: webhookData.depositedAmount ? parseFloat(webhookData.depositedAmount) : undefined,
        status: webhookData.status,
        externalId: transactionId,
        providerTransactionId: webhookData.correspondentIds?.PROVIDER_TRANSACTION_ID,
        financialTransactionId: webhookData.correspondentIds?.FINANCIAL_TRANSACTION_ID,
        payerPhone: webhookData.payer?.address.value,
        recipientPhone: webhookData.recipient?.address.value,
        correspondent: webhookData.correspondent,
        statementDescription: webhookData.statementDescription,
        customerTimestamp: webhookData.customerTimestamp ? new Date(webhookData.customerTimestamp) : undefined,
        country: webhookData.country,
        bookingId: internalRef, // Store internal reference as bookingId
        isRefund: transactionType === 'REFUND',
        relatedTransactionId: transactionType === 'REFUND' ? webhookData.depositId : undefined,
        failureCode: webhookData.failureReason?.failureCode,
        failureReason: webhookData.failureReason?.failureMessage,
        callbackReceived: true,
        callbackReceivedAt: new Date(),
        receivedByProvider: webhookData.receivedByPawaPay ? new Date(webhookData.receivedByPawaPay) : undefined,
        completedAt: webhookData.status === 'COMPLETED' ? new Date() : undefined,
        metadata: (webhookData.metadata || {}) as any
      },
      update: {
        // IMPORTANT: Do NOT update userId - it should only be set on initial deposit creation
        // userId is preserved from original transaction and never updated during status checkups
        status: webhookData.status,
        callbackReceived: true,
        callbackReceivedAt: new Date(),
        depositedAmount: webhookData.depositedAmount ? parseFloat(webhookData.depositedAmount) : undefined,
        providerTransactionId: webhookData.correspondentIds?.PROVIDER_TRANSACTION_ID,
        financialTransactionId: webhookData.correspondentIds?.FINANCIAL_TRANSACTION_ID,
        failureCode: webhookData.failureReason?.failureCode,
        failureReason: webhookData.failureReason?.failureMessage,
        completedAt: webhookData.status === 'COMPLETED' ? new Date() : undefined,
        bookingId: internalRef // Update internal reference
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
  const internalRef = transaction.bookingId || (transaction.metadata as any)?.internalReference;

  if (!internalRef) {
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
          select: {
            name: true,
            location: true,
            images: true,
            pricePerNight: true
          }
        },
        guest: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
            profileImage: true
          }
        }
      }
    });

    if (booking) {
      console.log(`[PAWAPAY_CALLBACK] Found property booking ${booking.id} for failed payment`);

      // Prepare booking info for email BEFORE deletion
      const bookingInfo: any = {
        id: booking.id,
        propertyId: booking.propertyId,
        property: {
          name: booking.property.name,
          location: booking.property.location,
          images: typeof booking.property.images === 'string' ? JSON.parse(booking.property.images) : booking.property.images || {},
          pricePerNight: booking.property.pricePerNight,
          hostName: 'Property Host', // Generic name since we don't have host details in failed payment scenario
          hostEmail: '',
          hostPhone: undefined
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
        paymentStatus: 'failed',
        createdAt: booking.createdAt.toISOString(),
        updatedAt: booking.updatedAt.toISOString()
      };

      // Immediately remove blocked dates and archive the booking on payment failure
      console.log(`[PAWAPAY_CALLBACK] Immediately cleaning up failed booking ${booking.id}`);
      try {
        // Archive the booking
        await prisma.bookingArchive.create({
          data: {
            originalBookingId: booking.id,
            propertyId: booking.propertyId,
            propertyName: booking.property.name,
            propertyLocation: booking.property.location,
            guestId: booking.guestId,
            guestName: `${booking.guest.firstName} ${booking.guest.lastName}`,
            guestEmail: booking.guest.email,
            guestPhone: booking.guest.phone,
            checkIn: booking.checkIn,
            checkOut: booking.checkOut,
            guests: booking.guests,
            totalPrice: booking.totalPrice,
            message: booking.message,
            specialRequests: booking.specialRequests,
            status: booking.status,
            paymentStatus: 'failed',
            bookingCreatedAt: booking.createdAt,
            archiveReason: `Payment failed - ${failureReason}`,
            leadStatus: 'new',
            metadata: {
              transactionId: booking.transactionId,
              paymentMethod: booking.paymentMethod,
              failureReason,
              deletedAt: new Date().toISOString()
            } as any
          }
        });

        // Remove blocked dates for this booking
        const blockedDatesDeleted = await prisma.blockedDate.deleteMany({
          where: {
            reason: { contains: `Booking ID: ${booking.id}` },
            isActive: true
          }
        });

        // Delete the booking
        await prisma.booking.delete({
          where: { id: booking.id }
        });

        console.log(`[PAWAPAY_CALLBACK] ✅ Archived and removed failed booking ${booking.id} and ${blockedDatesDeleted.count} blocked date(s)`);
      } catch (cleanupError) {
        console.error(`[PAWAPAY_CALLBACK] ❌ Failed to cleanup booking ${booking.id}:`, cleanupError);
        // Continue to send email even if cleanup fails
      }

      // Log activity
      await logActivity(booking.guestId, 'PAYMENT_FAILED', 'booking', booking.id, {
        provider: 'PawaPay',
        failureReason,
        reference: internalRef
      });

      console.log(`[PAWAPAY_CALLBACK] Sending payment failure email for booking ${booking.id}`);

      const company = {
        name: 'Jambolush',
        website: 'https://jambolush.com',
        supportEmail: 'support@jambolush.com',
        logo: 'https://jambolush.com/favicon.ico'
      };

      // Send payment failed email using Brevo service
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
        paymentReference: transaction.externalId || internalRef
      }).catch(err => {
        console.error('[PAWAPAY_CALLBACK] Failed to send payment failed email to guest:', err);
      });
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
          include: { tourGuide: true }
        },
        schedule: true,
        user: true
      }
    });

    if (tourBooking) {
      console.log(`[PAWAPAY_CALLBACK] Found tour booking ${tourBooking.id} for failed payment`);

      // Prepare booking info for email BEFORE deletion
      if (tourBooking.user && tourBooking.tour.tourGuide) {
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
            images: JSON.parse(String(tourBooking.tour.images) || '{}'),
            price: tourBooking.tour.price,
            currency: tourBooking.tour.currency,
            inclusions: JSON.parse(String(tourBooking.tour.inclusions) || '[]'),
            exclusions: JSON.parse(String(tourBooking.tour.exclusions) || '[]'),
            requirements: JSON.parse(String(tourBooking.tour.requirements) || '[]'),
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
            profileImage: tourBooking.tour.tourGuide.profileImage || undefined,
            bio: tourBooking.tour.tourGuide.bio || undefined,
            rating: tourBooking.tour.tourGuide.rating || undefined,
            totalTours: tourBooking.tour.tourGuide.totalTours || undefined
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
          participants: JSON.parse(String(tourBooking.participants) || '[]'),
          totalAmount: tourBooking.totalAmount,
          currency: tourBooking.currency,
          status: tourBooking.status,
          paymentStatus: 'failed',
          bookingDate: tourBooking.bookingDate.toISOString(),
          createdAt: tourBooking.createdAt.toISOString(),
          updatedAt: tourBooking.updatedAt.toISOString()
        };

        // Immediately archive and clean up the failed tour booking
        console.log(`[PAWAPAY_CALLBACK] Immediately cleaning up failed tour booking ${tourBooking.id}`);
        try {
          // Archive the booking
          await prisma.tourBookingArchive.create({
            data: {
              originalBookingId: tourBooking.id,
              tourId: tourBooking.tourId,
              tourTitle: tourBooking.tour.title,
              tourLocation: `${tourBooking.tour.locationCity}, ${tourBooking.tour.locationCountry}`,
              userId: tourBooking.userId,
              userName: `${tourBooking.user.firstName} ${tourBooking.user.lastName}`,
              userEmail: tourBooking.user.email,
              userPhone: tourBooking.user.phone,
              tourGuideId: tourBooking.tourGuideId,
              scheduleId: tourBooking.scheduleId,
              scheduleStartDate: tourBooking.schedule.startDate,
              numberOfParticipants: tourBooking.numberOfParticipants,
              participants: tourBooking.participants as any,
              totalAmount: tourBooking.totalAmount,
              currency: tourBooking.currency,
              specialRequests: tourBooking.specialRequests,
              status: tourBooking.status,
              paymentStatus: 'failed',
              bookingCreatedAt: tourBooking.createdAt,
              archiveReason: `Payment failed - ${failureReason}`,
              leadStatus: 'new',
              metadata: {
                paymentId: tourBooking.paymentId,
                checkInStatus: tourBooking.checkInStatus,
                failureReason,
                deletedAt: new Date().toISOString()
              } as any
            }
          });

          // Decrement the booked slots in the tour schedule
          await prisma.tourSchedule.update({
            where: { id: tourBooking.scheduleId },
            data: {
              bookedSlots: { decrement: tourBooking.numberOfParticipants }
            }
          });

          // Delete the booking
          await prisma.tourBooking.delete({
            where: { id: tourBooking.id }
          });

          console.log(`[PAWAPAY_CALLBACK] ✅ Archived and removed failed tour booking ${tourBooking.id} and freed ${tourBooking.numberOfParticipants} slot(s)`);
        } catch (cleanupError) {
          console.error(`[PAWAPAY_CALLBACK] ❌ Failed to cleanup tour booking ${tourBooking.id}:`, cleanupError);
          // Continue to send email even if cleanup fails
        }

        // Log activity
        await logActivity(tourBooking.userId, 'TOUR_PAYMENT_FAILED', 'tour_booking', tourBooking.id, {
          provider: 'PawaPay',
          failureReason,
          reference: internalRef
        });

        console.log(`[PAWAPAY_CALLBACK] Sending payment failure email for tour booking ${tourBooking.id}`);

        const company = {
          name: 'Jambolush',
          website: 'https://jambolush.com',
          supportEmail: 'support@jambolush.com',
          logo: 'https://jambolush.com/favicon.ico'
        };

        // Send payment failed email using Brevo service
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
          failureReason,
          paymentReference: transaction.externalId || internalRef
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
  const internalRef = transaction.bookingId || (transaction.metadata as any)?.internalReference;

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
    // Removed escrow transaction handling as escrow system has been deprecated

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

        // ✅ GENERATE AND SEND BOOKING CODE IMMEDIATELY AFTER PAYMENT COMPLETION
        console.log('[PAWAPAY_CALLBACK] Generating booking code for guest...');
        try {
          // Check if booking code already exists
          if (!booking.bookingCode) {
            const bookingCode = await generateUniqueBookingCode();

            // Update booking with the generated code
            await prisma.booking.update({
              where: { id: booking.id },
              data: { bookingCode: bookingCode }
            });

            // Send booking code to guest via SMS and Email
            await sendBookingCodeNotification(
              booking.guest.email,
              booking.guest.phone,
              booking.guest.firstName,
              bookingCode,
              booking.id,
              booking.property.name
            );

            console.log(`[PAWAPAY_CALLBACK] ✅ Booking code generated and sent: ${bookingCode}`);
          }
        } catch (codeError) {
          console.error('[PAWAPAY_CALLBACK] Failed to generate/send booking code:', codeError);
          // Don't fail the payment completion if booking code generation fails
        }

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
            internalRef,
            booking.id
          ).catch(err => console.error('[PAWAPAY] Failed to update host wallet:', err));
        }

        // Update agent wallet (if exists)
        if (booking.property.agent && splitAmounts.agent > 0) {
          await updateWalletBalance(
            booking.property.agent.id,
            splitAmounts.agent,
            'COMMISSION_EARNED',
            internalRef,
            booking.id
          ).catch(err => console.error('[PAWAPAY] Failed to update agent wallet:', err));
        }

        // Update platform wallet
        if (splitAmounts.platform > 0) {
          await updateWalletBalance(
            1, // Platform account (user ID 1)
            splitAmounts.platform,
            'PLATFORM_FEE',
            internalRef,
            booking.id
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
          paymentCurrency: 'USD',
          paymentReference: transaction.externalId || transaction.reference
        }).catch(err => console.error('[PAWAPAY_CALLBACK] Failed to send booking confirmation email:', err));

        // Send admin notification for completed payment
        try {
          const { adminNotifications } = await import('../utils/admin-notifications.js');
          await adminNotifications.sendCompletedPaymentNotification({
            transactionId: transaction.id,
            bookingId: booking.id,
            user: {
              id: booking.guestId,
              email: booking.guest.email,
              firstName: booking.guest.firstName,
              lastName: booking.guest.lastName
            },
            amount: booking.totalPrice,
            currency: 'USD',
            paymentMethod: 'Mobile Money',
            propertyOrTour: {
              name: booking.property.name,
              type: 'property'
            }
          });
        } catch (adminNotifError) {
          console.error('[PAWAPAY_CALLBACK] Failed to send admin notification:', adminNotifError);
          // Don't fail payment processing if admin notification fails
        }

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
            paymentCurrency: 'USD',
            paymentReference: transaction.externalId || transaction.reference
          }).catch(err => console.error('[PAWAPAY_CALLBACK] Failed to send host notification email:', err));

          // Send SMS notification to host
          if (booking.property.host.phone) {
            try {
              const hostSmsMessage = `New booking confirmed! Guest: ${booking.guest.firstName} ${booking.guest.lastName}. Property: ${booking.property.name}. Check-in: ${new Date(booking.checkIn).toLocaleDateString()}. Amount: $${booking.totalPrice}. Payment completed.`;
              await smsService.sendNotificationSMS(booking.property.host.phone, hostSmsMessage);
              console.log(`[PAWAPAY_CALLBACK] SMS sent to host ${booking.property.host.phone}`);
            } catch (smsError) {
              console.error('[PAWAPAY_CALLBACK] Failed to send SMS to host:', smsError);
            }
          }
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
            paymentCurrency: 'USD',
            paymentReference: transaction.externalId || transaction.reference
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
            tourGuide: { select: { id: true, email: true, firstName: true, lastName: true, phone: true } }
          }
        },
        user: { select: { id: true, email: true, firstName: true, lastName: true, phone: true } },
        schedule: { select: { startDate: true, endDate: true } }
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

      // ✅ GENERATE AND SEND BOOKING CODE FOR TOUR BOOKINGS
      console.log('[PAWAPAY_CALLBACK] Generating booking code for tour guest...');
      try {
        // Check if booking code already exists
        if (!tourBooking.bookingCode) {
          const bookingCode = await generateUniqueBookingCode();

          // Update tour booking with the generated code
          await prisma.tourBooking.update({
            where: { id: tourBooking.id },
            data: { bookingCode: bookingCode }
          });

          // Send booking code to guest via SMS and Email
          await sendBookingCodeNotification(
            tourBooking.user.email,
            tourBooking.user.phone,
            tourBooking.user.firstName,
            bookingCode,
            tourBooking.id,
            tourBooking.tour.title
          );

          console.log(`[PAWAPAY_CALLBACK] ✅ Tour booking code generated and sent: ${bookingCode}`);
        }
      } catch (codeError) {
        console.error('[PAWAPAY_CALLBACK] Failed to generate/send tour booking code:', codeError);
        // Don't fail the payment completion if booking code generation fails
      }

      // Calculate platform fee (16%) and guide earning (84%)
      const platformFeePercentage = config.tourSplitRules.platform / 100; // 16%
      const guideEarningPercentage = config.tourSplitRules.guide / 100;   // 84%

      const platformFee = Math.round((tourBooking.totalAmount * platformFeePercentage) * 100) / 100;
      const guideEarning = Math.round((tourBooking.totalAmount * guideEarningPercentage) * 100) / 100;

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

      // Send admin notification for tour payment completion
      try {
        const { adminNotifications } = await import('../utils/admin-notifications.js');
        await adminNotifications.sendCompletedPaymentNotification({
          transactionId: transaction.id,
          bookingId: tourBooking.id,
          user: {
            id: tourBooking.userId,
            email: tourBooking.user.email,
            firstName: tourBooking.user.firstName || 'User',
            lastName: tourBooking.user.lastName || ''
          },
          amount: tourBooking.totalAmount,
          currency: tourBooking.currency,
          paymentMethod: 'Mobile Money',
          propertyOrTour: {
            name: tourBooking.tour.title,
            type: 'tour'
          }
        });
      } catch (adminNotifError) {
        console.error('[PAWAPAY_CALLBACK] Failed to send admin notification for tour payment:', adminNotifError);
        // Don't fail the payment completion if admin notification fails
      }

      // Send payment confirmation emails using EmailService
      console.log(`[PAWAPAY_CALLBACK] Sending tour booking payment confirmation emails for booking ${tourBooking.id}`);

      // Note: EmailService doesn't have tour-specific templates yet, so we'll use booking templates as fallback
      // TODO: Add tour-specific email templates to EmailService
      console.log(`[PAWAPAY_CALLBACK] ⚠️ Tour booking emails need tour-specific templates - using generic confirmation`);

      // Send SMS notification to tour guide
      if (tourBooking.tour.tourGuide && tourBooking.tour.tourGuide.phone) {
        try {
          const tourDate = new Date(tourBooking.schedule.startDate).toLocaleDateString();
          const guideSmsMessage = `New tour booking confirmed! Guest: ${tourBooking.user.firstName} ${tourBooking.user.lastName}. Tour: ${tourBooking.tour.title}. Date: ${tourDate}. Participants: ${tourBooking.numberOfParticipants}. Amount: ${tourBooking.totalAmount} ${tourBooking.currency}. Payment completed.`;
          await smsService.sendNotificationSMS(tourBooking.tour.tourGuide.phone, guideSmsMessage);
          console.log(`[PAWAPAY_CALLBACK] SMS sent to tour guide ${tourBooking.tour.tourGuide.phone}`);
        } catch (smsError) {
          console.error('[PAWAPAY_CALLBACK] Failed to send SMS to tour guide:', smsError);
        }
      }
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
 * Send booking code notification to guest via SMS and Email
 */
async function sendBookingCodeNotification(
  email: string,
  phone: string | null,
  firstName: string,
  bookingCode: string,
  bookingId: string,
  propertyOrTourName: string
): Promise<void> {
  try {
    // Send SMS if phone number exists
    if (phone) {
      try {
        const smsMessage = `Hi ${firstName}, your check-in code for ${propertyOrTourName} (Booking: ${bookingId.toUpperCase()}) is: ${bookingCode}. Please present this code at check-in. - Jambolush`;
        await smsService.sendNotificationSMS(phone, smsMessage);
        console.log(`[PAWAPAY_CALLBACK] Booking code SMS sent to ${phone}`);
      } catch (smsError) {
        console.error(`[PAWAPAY_CALLBACK] Failed to send booking code SMS:`, smsError);
        // Continue to send email even if SMS fails
      }
    }

    // Send Email (always)
    try {
      const emailSubject = `Your Check-In Code for ${propertyOrTourName}`;
      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #083A85 0%, #0a4499 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border: 1px solid #ddd; }
            .code-box { background: #083A85; color: white; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px; }
            .code { font-size: 36px; font-weight: bold; letter-spacing: 8px; font-family: 'Courier New', monospace; }
            .info-box { background: white; padding: 15px; border-left: 4px solid #083A85; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; color: #777; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Your Check-In Code</h1>
            </div>
            <div class="content">
              <p>Hi ${firstName},</p>
              <p>Your payment has been confirmed! Here is your check-in code that you'll need to present when you arrive:</p>

              <div class="code-box">
                <div style="font-size: 14px; margin-bottom: 10px;">Your Check-In Code:</div>
                <div class="code">${bookingCode}</div>
              </div>

              <div class="info-box">
                <strong>Booking Details:</strong><br>
                <strong>Booking ID:</strong> ${bookingId.toUpperCase()}<br>
                <strong>${propertyOrTourName.includes('Tour') ? 'Tour' : 'Property'}:</strong> ${propertyOrTourName}
              </div>

              <p><strong>Important:</strong></p>
              <ul>
                <li>Please keep this code safe and present it at check-in</li>
                <li>The host/staff will ask you for this code to verify your booking</li>
                <li>Do not share this code with anyone except authorized staff</li>
              </ul>

              <p>If you have any questions, please contact our support team.</p>
            </div>
            <div class="footer">
              <p>This is an automated message from Jambolush</p>
              <p>&copy; ${new Date().getFullYear()} Jambolush. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `;

      const emailText = `
Hi ${firstName},

Your payment has been confirmed! Here is your check-in code:

CHECK-IN CODE: ${bookingCode}

Booking Details:
- Booking ID: ${bookingId.toUpperCase()}
- ${propertyOrTourName.includes('Tour') ? 'Tour' : 'Property'}: ${propertyOrTourName}

Important:
- Please keep this code safe and present it at check-in
- The host/staff will ask you for this code to verify your booking
- Do not share this code with anyone except authorized staff

If you have any questions, please contact our support team.

Jambolush
      `;

      await emailService.sendEmail({
        to: email,
        subject: emailSubject,
        html: emailHtml,
        text: emailText
      });

      console.log(`[PAWAPAY_CALLBACK] Booking code email sent to ${email}`);
    } catch (emailError) {
      console.error(`[PAWAPAY_CALLBACK] Failed to send booking code email:`, emailError);
    }
  } catch (error) {
    console.error(`[PAWAPAY_CALLBACK] Error sending booking code notification:`, error);
  }
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
 * Credits pendingBalance (not available for withdrawal until check-in)
 */
async function updateWalletBalance(
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

    console.log('[PAWAPAY] Wallet pending balance updated successfully', {
      userId,
      amount,
      bookingId,
      previousPendingBalance: wallet.pendingBalance || 0,
      newPendingBalance,
      note: 'Funds will be available for withdrawal after check-in'
    });
  } catch (error) {
    console.error('[PAWAPAY] Failed to update wallet pending balance:', error);
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

      // ⚠️ CRITICAL: Release pending balance (withdrawal completed, remove from pending)
      // Only the withdrawal amount was in pending (fee was already deducted)
      const wallet = await prisma.wallet.findUnique({
        where: { userId: withdrawal.userId }
      });

      if (wallet && wallet.pendingBalance >= withdrawal.amount) {
        await prisma.wallet.update({
          where: { userId: withdrawal.userId },
          data: {
            pendingBalance: wallet.pendingBalance - withdrawal.amount  // Remove from pending (money sent out)
          }
        });

        // Create transaction record for pending balance release
        await prisma.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type: 'WITHDRAWAL_COMPLETED',
            amount: -withdrawal.amount,
            balanceBefore: wallet.pendingBalance,
            balanceAfter: wallet.pendingBalance - withdrawal.amount,
            reference: internalRef,
            description: `Withdrawal completed - ${withdrawal.amount} ${withdrawal.currency} released from pending balance`,
            transactionId: withdrawal.id
          }
        });

        console.log('[PAWAPAY] ✅ Released pending balance for withdrawal:', {
          withdrawalId: withdrawal.id,
          amount: withdrawal.amount,
          previousPending: wallet.pendingBalance,
          newPending: wallet.pendingBalance - withdrawal.amount
        });
      } else if (wallet) {
        console.warn('[PAWAPAY] ⚠️ Insufficient pending balance for withdrawal completion:', {
          withdrawalId: withdrawal.id,
          requestedAmount: withdrawal.amount,
          availablePending: wallet.pendingBalance
        });
      }

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
    // Check for booking refunds
    const booking = await prisma.booking.findFirst({
      where: {
        OR: [{ transactionId: internalRef }, { id: internalRef }]
      },
      include: {
        guest: { select: { id: true, email: true, firstName: true, lastName: true } }
      }
    });

    if (booking) {
      await prisma.booking.update({
        where: { id: booking.id },
        data: {
          paymentStatus: 'refunded',
          status: 'cancelled'
        }
      });

      // Log activity
      await logActivity(booking.guestId, 'REFUND_COMPLETED', 'booking', booking.id, {
        amount: booking.totalPrice,
        currency: 'USD',
        provider: 'PawaPay',
        reference: internalRef
      });

      console.log('[PAWAPAY] ✅ Refund completed successfully for booking:', booking.id);
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
