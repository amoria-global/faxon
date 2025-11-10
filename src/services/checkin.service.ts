/**
 * Check-In Service
 * Handles two-way verification for check-ins and releases funds to hosts/guides
 */

import { PrismaClient } from '@prisma/client';
import { verifyBookingCode, generateUniqueBookingCode } from '../utils/booking-code.utility';
import smsService from './sms.service';
import { EmailService } from './email.service';
import { encodeId } from '../utils/encoder.utils';
import { adminNotifications } from '../utils/admin-notifications';

const prisma = new PrismaClient();
const emailService = new EmailService();

export class CheckInService {
  /**
   * STEP 1: Verify booking ID and retrieve booking details
   * This allows staff to see booking information before confirming check-in
   * @param bookingId - Booking ID provided by guest
   * @param userId - ID of the user accessing the system (for ownership verification)
   * @returns Promise<{ success: boolean, message: string, booking?: any }>
   */
  async verifyBookingId(
    bookingId: string,
    userId: number
  ): Promise<{ success: boolean; message: string; booking?: any }> {
    try {
      console.log(`[CHECKIN] Step 1: Verifying booking ID ${bookingId} by user ${userId}`);

      // Try to find property booking
      const propertyBooking = await prisma.booking.findFirst({
        where: { id: bookingId },
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

      if (propertyBooking) {
        // Verify ownership: Check if user is the host or agent of this property
        const isHost = propertyBooking.property.hostId === userId;
        const isAgent = propertyBooking.property.agentId === userId;

        if (!isHost && !isAgent) {
          return {
            success: false,
            message: 'Unauthorized: You do not have permission to access this booking.'
          };
        }

        // Check if already checked in
        if (propertyBooking.checkInValidated) {
          return {
            success: false,
            message: 'This booking has already been checked in',
            booking: {
              id: propertyBooking.id,
              status: 'ALREADY_CHECKED_IN',
              checkInValidatedAt: propertyBooking.checkInValidatedAt
            }
          };
        }

        // Check transaction table for payment status using bookingId
        const transaction = await prisma.transaction.findFirst({
          where: {
            bookingId: bookingId
          },
          orderBy: {
            createdAt: 'desc'
          }
        });

        // Determine if this is pay-at-property based on transaction OR booking paymentStatus
        const isPayAtProperty =
          // Check booking paymentStatus first
          propertyBooking.paymentStatus === 'pending_property' ||
          // Then check transaction status
          (transaction &&
            (transaction.status.toLowerCase().includes('property') ||
             (transaction.status.toUpperCase() === 'PENDING' && propertyBooking.payAtProperty)));

        if (isPayAtProperty && transaction?.status.toUpperCase() !== 'COMPLETED') {
          // Pay at property - generate payment URL with encoded IDs
          const encodedPropertyId = encodeId(propertyBooking.propertyId);
          const encodedBookingId = encodeId(propertyBooking.id);
          const paymentUrl = `https://jambolush.com/spaces/${encodedPropertyId}/confirm-and-pay?bookingId=${encodedBookingId}`;

          return {
            success: true,
            message: 'This booking requires payment at the property. Please ask the guest for their transaction reference to verify payment.',
            booking: {
              id: propertyBooking.id,
              type: 'PROPERTY',
              payAtProperty: true,
              paymentUrl,
              propertyPaymentAmount: propertyBooking.propertyPaymentAmount || propertyBooking.totalPrice,
              paymentStatus: transaction?.status || propertyBooking.paymentStatus,
              propertyPaymentCollected: propertyBooking.propertyPaymentCollected,
              transactionReference: transaction?.externalId || transaction?.reference,
              property: {
                id: propertyBooking.property.id,
                name: propertyBooking.property.name,
                location: propertyBooking.property.location
              },
              guest: {
                id: propertyBooking.guest.id,
                firstName: propertyBooking.guest.firstName,
                lastName: propertyBooking.guest.lastName,
                email: propertyBooking.guest.email,
                phone: propertyBooking.guest.phone
              },
              checkIn: propertyBooking.checkIn,
              checkOut: propertyBooking.checkOut,
              guests: propertyBooking.guests,
              totalPrice: propertyBooking.totalPrice,
              bookingDate: propertyBooking.createdAt
            }
          };
        }

        // Check for failed or pending (non-property) payment status
        if (propertyBooking.paymentStatus === 'pending' || propertyBooking.paymentStatus === 'failed') {
          return {
            success: false,
            message: 'Payment must be completed before check-in',
            booking: {
              id: propertyBooking.id,
              status: 'PAYMENT_PENDING',
              paymentStatus: propertyBooking.paymentStatus
            }
          };
        }

        // Check if payment is completed (for online payments or collected at property)
        // Accept if: 1) Transaction is completed, 2) Payment collected at property, 3) Booking paymentStatus is completed
        const isPaymentCompleted =
          (transaction && transaction.status.toUpperCase() === 'COMPLETED') ||
          propertyBooking.propertyPaymentCollected ||
          propertyBooking.paymentStatus === 'completed';

        if (!isPaymentCompleted) {
          return {
            success: false,
            message: 'Payment must be completed before check-in',
            booking: {
              id: propertyBooking.id,
              status: 'PAYMENT_PENDING',
              paymentStatus: transaction?.status || propertyBooking.paymentStatus
            }
          };
        }

        // Check if booking code exists, if not generate and send it
        let bookingCodeGenerated = false;
        if (!propertyBooking.bookingCode) {
          console.log(`[CHECKIN] No booking code found for ${bookingId}, generating new code...`);

          try {
            const newBookingCode = await generateUniqueBookingCode();

            // Update the booking with the new code
            await prisma.booking.update({
              where: { id: bookingId },
              data: { bookingCode: newBookingCode }
            });

            // Send booking code to guest via SMS and Email
            await this.sendBookingCodeNotification(
              propertyBooking.guest.email,
              propertyBooking.guest.phone,
              propertyBooking.guest.firstName,
              newBookingCode,
              bookingId,
              propertyBooking.property.name
            );

            bookingCodeGenerated = true;
            console.log(`[CHECKIN] ✅ Generated and sent booking code for ${bookingId}`);
          } catch (error: any) {
            console.error(`[CHECKIN] Error generating booking code:`, error);
            // Continue without failing the verification
          }
        }

        // Return booking details for verification
        return {
          success: true,
          message: bookingCodeGenerated
            ? 'Booking found. A booking code has been sent to the guest. Please ask the guest for their booking code to complete check-in.'
            : 'Booking found. Please verify details and provide booking code to complete check-in.',
          booking: {
            id: propertyBooking.id,
            type: 'PROPERTY',
            property: {
              id: propertyBooking.property.id,
              name: propertyBooking.property.name,
              location: propertyBooking.property.location
            },
            guest: {
              id: propertyBooking.guest.id,
              firstName: propertyBooking.guest.firstName,
              lastName: propertyBooking.guest.lastName,
              email: propertyBooking.guest.email,
              phone: propertyBooking.guest.phone
            },
            checkIn: propertyBooking.checkIn,
            checkOut: propertyBooking.checkOut,
            guests: propertyBooking.guests,
            totalPrice: propertyBooking.totalPrice,
            paymentStatus: propertyBooking.paymentStatus,
            bookingDate: propertyBooking.createdAt,
            bookingCodeGenerated
          }
        };
      }

      // Try to find tour booking
      const tourBooking = await prisma.tourBooking.findFirst({
        where: { id: bookingId },
        include: {
          tour: {
            include: {
              tourGuide: true
            }
          },
          user: true
        }
      });

      if (tourBooking) {
        // Verify ownership: Check if user is the tour guide
        const isTourGuide = tourBooking.tour.tourGuide?.id === userId;

        if (!isTourGuide) {
          return {
            success: false,
            message: 'Unauthorized: You do not have permission to access this tour booking.'
          };
        }

        // Check if already checked in
        if (tourBooking.checkInValidated) {
          return {
            success: false,
            message: 'This booking has already been checked in',
            booking: {
              id: tourBooking.id,
              status: 'ALREADY_CHECKED_IN',
              checkInValidatedAt: tourBooking.checkInValidatedAt
            }
          };
        }

        // Check if payment is completed
        if (tourBooking.paymentStatus !== 'completed') {
          return {
            success: false,
            message: 'Payment must be completed before check-in',
            booking: {
              id: tourBooking.id,
              status: 'PAYMENT_PENDING',
              paymentStatus: tourBooking.paymentStatus
            }
          };
        }

        // Check if booking code exists, if not generate and send it
        let bookingCodeGenerated = false;
        if (!tourBooking.bookingCode) {
          console.log(`[CHECKIN] No booking code found for tour ${bookingId}, generating new code...`);

          try {
            const newBookingCode = await generateUniqueBookingCode();

            // Update the booking with the new code
            await prisma.tourBooking.update({
              where: { id: bookingId },
              data: { bookingCode: newBookingCode }
            });

            // Send booking code to guest via SMS and Email
            await this.sendBookingCodeNotification(
              tourBooking.user.email,
              tourBooking.user.phone,
              tourBooking.user.firstName,
              newBookingCode,
              bookingId,
              tourBooking.tour.title
            );

            bookingCodeGenerated = true;
            console.log(`[CHECKIN] ✅ Generated and sent booking code for tour ${bookingId}`);
          } catch (error: any) {
            console.error(`[CHECKIN] Error generating booking code for tour:`, error);
            // Continue without failing the verification
          }
        }

        // Return booking details for verification
        return {
          success: true,
          message: bookingCodeGenerated
            ? 'Booking found. A booking code has been sent to the guest. Please ask the guest for their booking code to complete check-in.'
            : 'Booking found. Please verify details and provide booking code to complete check-in.',
          booking: {
            id: tourBooking.id,
            type: 'TOUR',
            tour: {
              id: tourBooking.tour.id,
              title: tourBooking.tour.title,
              locationCountry: tourBooking.tour.locationCountry,
              locationState: tourBooking.tour.locationState
            },
            guest: {
              id: tourBooking.user.id,
              firstName: tourBooking.user.firstName,
              lastName: tourBooking.user.lastName,
              email: tourBooking.user.email,
              phone: tourBooking.user.phone
            },
            numberOfParticipants: tourBooking.numberOfParticipants,
            totalAmount: tourBooking.totalAmount,
            currency: tourBooking.currency,
            paymentStatus: tourBooking.paymentStatus,
            bookingDate: tourBooking.createdAt,
            bookingCodeGenerated
          }
        };
      }

      // Booking not found
      return {
        success: false,
        message: 'Booking not found. Please check the booking ID and try again.'
      };

    } catch (error: any) {
      console.error('[CHECKIN] Error verifying booking ID:', error);
      return {
        success: false,
        message: 'Error verifying booking. Please try again.'
      };
    }
  }

  /**
   * STEP 2: Confirm check-in with booking code
   * This completes the check-in process and releases funds
   * @param bookingId - Booking ID
   * @param bookingCode - 6-character booking code
   * @param checkInBy - User ID of person performing check-in (host/guide)
   * @param instructions - Optional instructions to send to the guest
   * @returns Promise<{ success: boolean, message: string, booking?: any }>
   */
  async confirmCheckIn(
    bookingId: string,
    bookingCode: string,
    checkInBy: number,
    instructions?: string
  ): Promise<{ success: boolean; message: string; booking?: any }> {
    try {
      console.log(`[CHECKIN] Step 2: Confirming check-in for booking ${bookingId} with code`);

      // Verify booking code (two-way verification)
      const verification = await verifyBookingCode(bookingId, bookingCode);

      if (!verification.valid) {
        return {
          success: false,
          message: verification.error || 'Invalid booking code. Please try again.'
        };
      }

      const booking = verification.booking;

      // Check if booking is property or tour
      const isPropertyBooking = booking.propertyId !== undefined;
      const isTourBooking = booking.tourId !== undefined;

      // Verify ownership before proceeding
      if (isPropertyBooking) {
        const isHost = booking.property?.hostId === checkInBy;
        const isAgent = booking.property?.agentId === checkInBy;

        if (!isHost && !isAgent) {
          return {
            success: false,
            message: 'Unauthorized: You do not have permission to confirm check-in for this booking.'
          };
        }
      } else if (isTourBooking) {
        const isTourGuide = booking.tour?.tourGuide?.id === checkInBy;

        if (!isTourGuide) {
          return {
            success: false,
            message: 'Unauthorized: You do not have permission to confirm check-in for this tour booking.'
          };
        }
      }

      // Check if already checked in
      if (booking.checkInValidated) {
        return {
          success: false,
          message: 'This booking has already been checked in',
          booking
        };
      }

      // Check if payment is completed (or if it's pay-at-property and payment was collected)
      if (isPropertyBooking && booking.payAtProperty) {
        // For pay-at-property, check if payment was collected
        if (!booking.propertyPaymentCollected) {
          return {
            success: false,
            message: 'Payment must be collected at the property before completing check-in. Please mark payment as collected first.'
          };
        }
      } else if (booking.paymentStatus !== 'completed') {
        // For online payments, payment must be completed
        return {
          success: false,
          message: 'Payment must be completed before check-in'
        };
      }

      // Process check-in based on type
      if (isPropertyBooking) {
        await this.processPropertyCheckIn(booking, checkInBy);
      } else if (isTourBooking) {
        await this.processTourCheckIn(booking, checkInBy);
      }

      // Retrieve updated booking
      const updatedBooking = isPropertyBooking
        ? await prisma.booking.findUnique({
            where: { id: bookingId },
            include: {
              property: { include: { host: true, agent: true } },
              guest: true
            }
          })
        : await prisma.tourBooking.findUnique({
            where: { id: bookingId },
            include: {
              tour: { include: { tourGuide: true } },
              user: true
            }
          });

      console.log(`[CHECKIN] ✅ Check-in confirmed for booking ${bookingId}`);

      // Send admin notification for check-in
      try {
        if (updatedBooking) {
          let guestInfo, propertyOrTourInfo, hostInfo;

          if (isPropertyBooking) {
            guestInfo = (updatedBooking as any).guest;
            propertyOrTourInfo = {
              id: (updatedBooking as any).property.id,
              name: (updatedBooking as any).property.name,
              type: 'property' as const
            };
            hostInfo = (updatedBooking as any).property.host;
          } else {
            guestInfo = (updatedBooking as any).user;
            propertyOrTourInfo = {
              id: (updatedBooking as any).tour.id,
              name: (updatedBooking as any).tour.title,
              type: 'tour' as const
            };
            hostInfo = (updatedBooking as any).tour.tourGuide;
          }

          await adminNotifications.sendCheckinNotification({
            bookingId,
            user: {
              id: guestInfo.id,
              email: guestInfo.email,
              firstName: guestInfo.firstName,
              lastName: guestInfo.lastName
            },
            propertyOrTour: propertyOrTourInfo,
            host: {
              id: hostInfo.id,
              firstName: hostInfo.firstName,
              lastName: hostInfo.lastName
            },
            checkInDate: new Date(),
            guests: isPropertyBooking ? (updatedBooking as any).guests : (updatedBooking as any).numberOfParticipants
          });
        }
      } catch (adminNotifError) {
        console.error(`[CHECKIN] Failed to send admin notification:`, adminNotifError);
        // Don't fail the check-in if admin notification fails
      }

      // Send check-in confirmation notification to guest
      if (updatedBooking) {
        try {
          let guestEmail: string;
          let guestPhone: string | null;
          let guestFirstName: string;
          let propertyOrTourName: string;
          let checkInDate: Date;
          let checkOutDate: Date | null = null;

          if (isPropertyBooking) {
            guestEmail = (updatedBooking as any).guest.email;
            guestPhone = (updatedBooking as any).guest.phone;
            guestFirstName = (updatedBooking as any).guest.firstName;
            propertyOrTourName = (updatedBooking as any).property.name;
            checkInDate = (updatedBooking as any).checkIn;
            checkOutDate = (updatedBooking as any).checkOut;
          } else {
            guestEmail = (updatedBooking as any).user.email;
            guestPhone = (updatedBooking as any).user.phone;
            guestFirstName = (updatedBooking as any).user.firstName;
            propertyOrTourName = (updatedBooking as any).tour.title;
            checkInDate = (updatedBooking as any).tourDate;
          }

          if (guestEmail && guestFirstName && propertyOrTourName) {
            await this.sendCheckInConfirmation(
              guestEmail,
              guestPhone,
              guestFirstName,
              bookingId,
              propertyOrTourName,
              checkInDate,
              checkOutDate
            );
            console.log(`[CHECKIN] ✅ Check-in confirmation sent to guest`);
          }
        } catch (notificationError) {
          console.error(`[CHECKIN] Failed to send check-in confirmation:`, notificationError);
          // Don't fail the check-in if notification fails to send
        }
      }

      // Send instructions to guest if provided
      if (instructions && instructions.trim() !== '' && updatedBooking) {
        try {
          let guestEmail: string;
          let guestPhone: string | null;
          let guestFirstName: string;
          let propertyOrTourName: string;

          if (isPropertyBooking) {
            guestEmail = (updatedBooking as any).guest.email;
            guestPhone = (updatedBooking as any).guest.phone;
            guestFirstName = (updatedBooking as any).guest.firstName;
            propertyOrTourName = (updatedBooking as any).property.name;
          } else {
            guestEmail = (updatedBooking as any).user.email;
            guestPhone = (updatedBooking as any).user.phone;
            guestFirstName = (updatedBooking as any).user.firstName;
            propertyOrTourName = (updatedBooking as any).tour.title;
          }

          if (guestEmail && guestFirstName && propertyOrTourName) {
            await this.sendCheckInInstructions(
              guestEmail,
              guestPhone,
              guestFirstName,
              instructions.trim(),
              bookingId,
              propertyOrTourName
            );
            console.log(`[CHECKIN] ✅ Check-in instructions sent to guest`);
          }
        } catch (instructionError) {
          console.error(`[CHECKIN] Failed to send check-in instructions:`, instructionError);
          // Don't fail the check-in if instructions fail to send
        }
      }

      return {
        success: true,
        message: 'Check-in successful! Funds are now available for withdrawal.',
        booking: updatedBooking
      };

    } catch (error: any) {
      console.error('[CHECKIN] Error confirming check-in:', error);
      return {
        success: false,
        message: 'Error confirming check-in. Please try again.'
      };
    }
  }

  /**
   * LEGACY METHOD: Process check-in with two-way verification (booking ID + booking code)
   * @deprecated Use verifyBookingId() and confirmCheckIn() instead for two-step flow
   */
  async processCheckIn(
    bookingId: string,
    bookingCode: string,
    checkInBy: number
  ): Promise<{ success: boolean; message: string; booking?: any }> {
    try {
      console.log(`[CHECKIN] Processing check-in for booking ${bookingId}`);

      // Step 1: Verify booking code (two-way verification)
      const verification = await verifyBookingCode(bookingId, bookingCode);

      if (!verification.valid) {
        return {
          success: false,
          message: verification.error || 'Invalid booking credentials'
        };
      }

      const booking = verification.booking;

      // Step 2: Check if booking is property or tour
      const isPropertyBooking = booking.propertyId !== undefined;
      const isTourBooking = booking.tourId !== undefined;

      // Step 3: Check if already checked in
      if (booking.checkInValidated) {
        return {
          success: false,
          message: 'This booking has already been checked in',
          booking
        };
      }

      // Step 4: Check if payment is completed
      if (booking.paymentStatus !== 'completed') {
        return {
          success: false,
          message: 'Payment must be completed before check-in'
        };
      }

      // Step 5: Process check-in based on type
      if (isPropertyBooking) {
        await this.processPropertyCheckIn(booking, checkInBy);
      } else if (isTourBooking) {
        await this.processTourCheckIn(booking, checkInBy);
      }

      // Step 6: Retrieve updated booking
      const updatedBooking = isPropertyBooking
        ? await prisma.booking.findUnique({
            where: { id: bookingId },
            include: {
              property: { include: { host: true, agent: true } },
              guest: true
            }
          })
        : await prisma.tourBooking.findUnique({
            where: { id: bookingId },
            include: {
              tour: { include: { tourGuide: true } },
              user: true
            }
          });

      console.log(`[CHECKIN] ✅ Check-in completed for booking ${bookingId}`);

      return {
        success: true,
        message: 'Check-in successful! Funds are now available for withdrawal.',
        booking: updatedBooking
      };

    } catch (error: any) {
      console.error('[CHECKIN] Error processing check-in:', error);
      return {
        success: false,
        message: 'Error processing check-in. Please try again.'
      };
    }
  }

  /**
   * Process property booking check-in
   * Releases funds to host and agent wallets
   */
  private async processPropertyCheckIn(booking: any, checkInBy: number): Promise<void> {
    console.log(`[CHECKIN] Processing property check-in for booking ${booking.id}`);

    // Update booking with check-in details and change status to checkedin
    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        checkInValidated: true,
        checkInValidatedAt: new Date(),
        checkInValidatedBy: checkInBy,
        status: 'checkedin' // Change status from 'confirmed' to 'checkedin'
      }
    });

    // Update OwnerPayment to mark as ready for withdrawal
    await prisma.ownerPayment.updateMany({
      where: {
        bookingId: booking.id,
        checkInRequired: true,
        checkInValidated: false
      },
      data: {
        checkInValidated: true,
        checkInValidatedAt: new Date(),
        status: 'approved' // Change from 'pending' to 'approved'
      }
    });

    // Update AgentCommission if agent exists
    if (booking.property?.agent) {
      await prisma.agentCommission.updateMany({
        where: {
          bookingId: booking.id,
          status: 'pending'
        },
        data: {
          status: 'approved'
        }
      });
    }

    // Move funds from pendingBalance to available balance
    // For host
    const hostId = booking.property.host.id;
    await this.releasePendingFunds(hostId, booking.id, 'host');

    // For agent (if exists)
    if (booking.property?.agent) {
      const agentId = booking.property.agent.id;
      await this.releasePendingFunds(agentId, booking.id, 'agent');
    }

    console.log(`[CHECKIN] ✅ Property check-in completed, funds released`);
  }

  /**
   * Process tour booking check-in
   * Releases funds to tour guide wallet
   */
  private async processTourCheckIn(booking: any, checkInBy: number): Promise<void> {
    console.log(`[CHECKIN] Processing tour check-in for booking ${booking.id}`);

    // Update tour booking with check-in details and change status to checkedin
    await prisma.tourBooking.update({
      where: { id: booking.id },
      data: {
        checkInStatus: 'checkedin',
        checkInTime: new Date(),
        checkInValidated: true,
        checkInValidatedAt: new Date(),
        status: 'checkedin' // Change status from 'confirmed' to 'checkedin'
      }
    });

    // Update TourEarnings to mark as ready for withdrawal
    await prisma.tourEarnings.updateMany({
      where: {
        bookingId: booking.id,
        status: 'pending'
      },
      data: {
        status: 'approved'
      }
    });

    // Move funds from pendingBalance to available balance for tour guide
    const tourGuideId = booking.tour.tourGuide.id;
    await this.releasePendingFunds(tourGuideId, booking.id, 'tour_guide');

    console.log(`[CHECKIN] ✅ Tour check-in completed, funds released`);
  }

  /**
   * Release pending funds to available balance
   * Moves funds from pendingBalance to balance so they can be withdrawn
   * @param userId - User ID (host/agent/tour guide)
   * @param bookingId - Booking ID
   * @param userType - Type of user (host/agent/tour_guide)
   */
  private async releasePendingFunds(
    userId: number,
    bookingId: string,
    userType: 'host' | 'agent' | 'tour_guide'
  ): Promise<void> {
    try {
      // Get wallet
      const wallet = await prisma.wallet.findUnique({
        where: { userId }
      });

      if (!wallet) {
        console.warn(`[CHECKIN] No wallet found for user ${userId}`);
        return;
      }

      // Find the wallet transaction related to this booking to get the amount
      // Search by either transactionId or description containing the bookingId
      const walletTransaction = await prisma.walletTransaction.findFirst({
        where: {
          walletId: wallet.id,
          description: { contains: 'PENDING CHECK-IN' },
          OR: [
            { transactionId: { contains: bookingId } },
            { description: { contains: bookingId } },
            { reference: { contains: bookingId } }
          ]
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      if (!walletTransaction) {
        console.warn(`[CHECKIN] No pending wallet transaction found for booking ${bookingId}`);
        console.warn(`[CHECKIN] Wallet ID: ${wallet.id}, User ID: ${userId}, Booking ID: ${bookingId}`);
        return;
      }

      const amount = walletTransaction.amount;

      // Move funds from pendingBalance to balance
      const newPendingBalance = Math.max(0, wallet.pendingBalance - amount);
      const newBalance = wallet.balance + amount;

      console.log(`[CHECKIN] Releasing $${amount} from pending to available for ${userType} ${userId}`);
      console.log(`[CHECKIN] Pending: ${wallet.pendingBalance} → ${newPendingBalance}, Available: ${wallet.balance} → ${newBalance}`);

      // Update wallet
      await prisma.wallet.update({
        where: { userId },
        data: {
          balance: newBalance,
          pendingBalance: newPendingBalance
        }
      });

      // Create wallet transaction record for the release
      await prisma.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'credit',
          amount: amount,
          balanceBefore: wallet.balance,
          balanceAfter: newBalance,
          reference: `CHECKIN-RELEASE-${bookingId}`,
          description: `Check-in completed - Funds released for ${userType} (Booking: ${bookingId})`,
          transactionId: bookingId
        }
      });

      console.log(`[CHECKIN] ✅ Released $${amount} to available balance for ${userType} ${userId}`);

    } catch (error: any) {
      console.error(`[CHECKIN] Error releasing pending funds for user ${userId}:`, error);
    }
  }

  /**
   * Confirm check-out for a booking
   * Sends notification to the guest
   * @param bookingId - Booking ID
   * @param checkOutBy - User ID of person performing check-out
   * @returns Promise<{ success: boolean, message: string, booking?: any }>
   */
  async confirmCheckOut(
    bookingId: string,
    checkOutBy: number
  ): Promise<{ success: boolean; message: string; booking?: any }> {
    try {
      console.log(`[CHECKOUT] Confirming check-out for booking ${bookingId}`);

      // Try to find property booking
      const propertyBooking = await prisma.booking.findFirst({
        where: { id: bookingId },
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

      if (propertyBooking) {
        // Verify ownership
        const isHost = propertyBooking.property.hostId === checkOutBy;
        const isAgent = propertyBooking.property.agentId === checkOutBy;

        if (!isHost && !isAgent) {
          return {
            success: false,
            message: 'Unauthorized: You do not have permission to confirm check-out for this booking.'
          };
        }

        // Check if already checked out
        if (propertyBooking.checkOutValidated) {
          return {
            success: false,
            message: 'This booking has already been checked out'
          };
        }

        // Check if checked in
        if (!propertyBooking.checkInValidated) {
          return {
            success: false,
            message: 'Guest must check in before checking out'
          };
        }

        // Update booking with check-out details and change status to checkout
        const updatedBooking = await prisma.booking.update({
          where: { id: bookingId },
          data: {
            checkOutValidated: true,
            checkOutValidatedAt: new Date(),
            checkOutValidatedBy: checkOutBy,
            status: 'checkout' // Change status from 'checkedin' to 'checkout'
          },
          include: {
            property: true,
            guest: true
          }
        });

        // Send check-out notification to guest
        try {
          await this.sendCheckOutConfirmation(
            updatedBooking.guest.email,
            updatedBooking.guest.phone,
            updatedBooking.guest.firstName,
            bookingId,
            updatedBooking.property.name,
            updatedBooking.checkOut
          );
          console.log(`[CHECKOUT] ✅ Check-out confirmation sent to guest`);
        } catch (notificationError) {
          console.error(`[CHECKOUT] Failed to send check-out confirmation:`, notificationError);
          // Don't fail the check-out if notification fails
        }

        console.log(`[CHECKOUT] ✅ Check-out confirmed for booking ${bookingId}`);

        // Send admin notification for check-out
        try {
          if (propertyBooking.property.host) {
            await adminNotifications.sendCheckoutNotification({
              bookingId,
              user: {
                id: updatedBooking.guest.id,
                email: updatedBooking.guest.email,
                firstName: updatedBooking.guest.firstName,
                lastName: updatedBooking.guest.lastName
              },
              propertyOrTour: {
                id: updatedBooking.property.id,
                name: updatedBooking.property.name,
                type: 'property'
              },
              host: {
                id: propertyBooking.property.host.id,
                firstName: propertyBooking.property.host.firstName,
                lastName: propertyBooking.property.host.lastName
              },
              checkOutDate: updatedBooking.checkOut
            });
          }
        } catch (adminNotifError) {
          console.error(`[CHECKOUT] Failed to send admin notification:`, adminNotifError);
          // Don't fail the checkout if admin notification fails
        }

        return {
          success: true,
          message: 'Check-out confirmed successfully!',
          booking: updatedBooking
        };
      }

      // Try to find tour booking
      const tourBooking = await prisma.tourBooking.findFirst({
        where: { id: bookingId },
        include: {
          tour: {
            include: {
              tourGuide: true
            }
          },
          user: true
        }
      });

      if (tourBooking) {
        // Verify ownership
        const isTourGuide = tourBooking.tour.tourGuide?.id === checkOutBy;

        if (!isTourGuide) {
          return {
            success: false,
            message: 'Unauthorized: You do not have permission to confirm check-out for this tour booking.'
          };
        }

        // Check if already checked out
        if (tourBooking.checkOutTime) {
          return {
            success: false,
            message: 'This tour has already been checked out'
          };
        }

        // Check if checked in
        if (!tourBooking.checkInValidated) {
          return {
            success: false,
            message: 'Guest must check in before checking out'
          };
        }

        // Update tour booking with check-out time and change status to completed
        const updatedTourBooking = await prisma.tourBooking.update({
          where: { id: bookingId },
          data: {
            checkOutTime: new Date(),
            status: 'completed' // Change status from 'checkedin' to 'completed'
          },
          include: {
            tour: true,
            user: true
          }
        });

        console.log(`[CHECKOUT] ✅ Check-out confirmed for tour booking ${bookingId}`);

        // Send admin notification for tour check-out
        try {
          await adminNotifications.sendCheckoutNotification({
            bookingId,
            user: {
              id: updatedTourBooking.user.id,
              email: updatedTourBooking.user.email,
              firstName: updatedTourBooking.user.firstName,
              lastName: updatedTourBooking.user.lastName
            },
            propertyOrTour: {
              id: tourBooking.tour.id,
              name: updatedTourBooking.tour.title,
              type: 'tour'
            },
            host: {
              id: tourBooking.tour.tourGuide.id,
              firstName: tourBooking.tour.tourGuide.firstName,
              lastName: tourBooking.tour.tourGuide.lastName
            },
            checkOutDate: updatedTourBooking.checkOutTime!
          });
        } catch (adminNotifError) {
          console.error(`[CHECKOUT] Failed to send admin notification:`, adminNotifError);
          // Don't fail the checkout if admin notification fails
        }

        return {
          success: true,
          message: 'Tour check-out confirmed successfully!',
          booking: updatedTourBooking
        };
      }

      // Booking not found
      return {
        success: false,
        message: 'Booking not found'
      };

    } catch (error: any) {
      console.error('[CHECKOUT] Error confirming check-out:', error);
      return {
        success: false,
        message: 'Error confirming check-out. Please try again.'
      };
    }
  }

  /**
   * Check if user can withdraw funds from a specific booking
   * @param userId - User ID
   * @param bookingId - Booking ID
   * @returns Promise<{ canWithdraw: boolean, reason?: string }>
   */
  async canWithdrawFromBooking(
    userId: number,
    bookingId: string
  ): Promise<{ canWithdraw: boolean; reason?: string }> {
    try {
      // Check property booking
      const propertyBooking = await prisma.booking.findFirst({
        where: {
          id: bookingId,
          paymentStatus: 'completed'
        },
        include: {
          property: {
            include: {
              host: true,
              agent: true
            }
          }
        }
      });

      if (propertyBooking) {
        // Check if user is host or agent
        const isHost = propertyBooking.property.host?.id === userId;
        const isAgent = propertyBooking.property.agent?.id === userId;

        if (!isHost && !isAgent) {
          return {
            canWithdraw: false,
            reason: 'You are not associated with this booking'
          };
        }

        // Check if check-in has occurred
        if (!propertyBooking.checkInValidated) {
          return {
            canWithdraw: false,
            reason: 'Guest must check in before funds can be withdrawn'
          };
        }

        return {
          canWithdraw: true
        };
      }

      // Check tour booking
      const tourBooking = await prisma.tourBooking.findFirst({
        where: {
          id: bookingId,
          paymentStatus: 'completed'
        },
        include: {
          tour: {
            include: {
              tourGuide: true
            }
          }
        }
      });

      if (tourBooking) {
        // Check if user is tour guide
        const isTourGuide = tourBooking.tour.tourGuide.id === userId;

        if (!isTourGuide) {
          return {
            canWithdraw: false,
            reason: 'You are not associated with this booking'
          };
        }

        // Check if check-in has occurred
        if (tourBooking.checkInStatus !== 'checkedin') {
          return {
            canWithdraw: false,
            reason: 'Guest must check in before funds can be withdrawn'
          };
        }

        return {
          canWithdraw: true
        };
      }

      return {
        canWithdraw: false,
        reason: 'Booking not found'
      };

    } catch (error: any) {
      console.error('[CHECKIN] Error checking withdrawal eligibility:', error);
      return {
        canWithdraw: false,
        reason: 'Error checking withdrawal eligibility'
      };
    }
  }

  /**
   * Send booking code notification to guest via SMS and Email
   * @param email - Guest email
   * @param phone - Guest phone number
   * @param firstName - Guest first name
   * @param bookingCode - Generated booking code
   * @param bookingId - Booking ID
   * @param propertyOrTourName - Property or tour name
   */
  private async sendBookingCodeNotification(
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
          console.log(`[CHECKIN] Booking code SMS sent to ${phone}`);
        } catch (smsError) {
          console.error(`[CHECKIN] Failed to send booking code SMS:`, smsError);
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
                <p>Your booking is confirmed! Here is your check-in code that you'll need to present when you arrive:</p>

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

Your booking is confirmed! Here is your check-in code:

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

        // Use the email service to send
        await emailService.sendEmail({
          to: email,
          subject: emailSubject,
          html: emailHtml,
          text: emailText
        });

        console.log(`[CHECKIN] Booking code email sent to ${email}`);
      } catch (emailError) {
        console.error(`[CHECKIN] Failed to send booking code email:`, emailError);
      }
    } catch (error) {
      console.error(`[CHECKIN] Error sending booking code notification:`, error);
    }
  }

  /**
   * Send check-in confirmation notification to guest
   * @param email - Guest email
   * @param phone - Guest phone number
   * @param firstName - Guest first name
   * @param bookingId - Booking ID
   * @param propertyOrTourName - Property or tour name
   * @param checkInDate - Check-in date
   * @param checkOutDate - Check-out date (null for tours)
   */
  private async sendCheckInConfirmation(
    email: string,
    phone: string | null,
    firstName: string,
    bookingId: string,
    propertyOrTourName: string,
    checkInDate: Date,
    checkOutDate: Date | null
  ): Promise<void> {
    try {
      // Format dates
      const checkInFormatted = new Date(checkInDate).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      const checkOutFormatted = checkOutDate
        ? new Date(checkOutDate).toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })
        : null;

      // Send SMS notification
      if (phone) {
        const smsMessage = checkOutDate
          ? `Hi ${firstName}, your check-in at ${propertyOrTourName} has been confirmed! Check-in: ${checkInFormatted}. Check-out: ${checkOutFormatted}. Booking: ${bookingId.toUpperCase()}. Enjoy your stay! - Jambolush`
          : `Hi ${firstName}, your check-in for ${propertyOrTourName} has been confirmed! Date: ${checkInFormatted}. Booking: ${bookingId.toUpperCase()}. Have a great experience! - Jambolush`;

        await smsService.sendNotificationSMS(phone, smsMessage);
        console.log(`[CHECKIN] Check-in confirmation SMS sent to ${phone}`);
      }

      // Send Email notification
      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
            .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px; }
            .success-icon { font-size: 48px; text-align: center; margin-bottom: 20px; }
            .info-box { background-color: white; padding: 20px; border-left: 4px solid #4CAF50; margin: 20px 0; border-radius: 4px; }
            .info-row { margin: 10px 0; padding: 8px 0; border-bottom: 1px solid #eee; }
            .info-label { font-weight: bold; color: #666; }
            .info-value { color: #333; margin-left: 10px; }
            .badge { background-color: #4CAF50; color: white; padding: 5px 15px; border-radius: 20px; font-weight: bold; display: inline-block; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✓ Check-In Confirmed!</h1>
            </div>
            <div class="content">
              <div class="success-icon">🎉</div>
              <h2>Welcome, ${firstName}!</h2>
              <p>Great news! Your check-in has been successfully confirmed.</p>

              <div class="info-box">
                <div class="info-row">
                  <span class="info-label">Booking Reference:</span>
                  <span class="badge">${bookingId.toUpperCase()}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">${checkOutDate ? 'Property' : 'Tour'}:</span>
                  <span class="info-value">${propertyOrTourName}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Check-In Date:</span>
                  <span class="info-value">${checkInFormatted}</span>
                </div>
                ${checkOutDate ? `
                <div class="info-row">
                  <span class="info-label">Check-Out Date:</span>
                  <span class="info-value">${checkOutFormatted}</span>
                </div>
                ` : ''}
              </div>

              <p><strong>${checkOutDate ? 'Enjoy your stay!' : 'Have a wonderful experience!'}</strong></p>
              <p>If you have any questions or need assistance, feel free to reach out to us.</p>

              <div class="footer">
                <p>Thank you for choosing Jambolush!</p>
                <p>© ${new Date().getFullYear()} Jambolush. All rights reserved.</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `;

      const emailText = `
Hi ${firstName},

Great news! Your check-in has been successfully confirmed.

Booking Details:
- Booking Reference: ${bookingId.toUpperCase()}
- ${checkOutDate ? 'Property' : 'Tour'}: ${propertyOrTourName}
- Check-In Date: ${checkInFormatted}
${checkOutDate ? `- Check-Out Date: ${checkOutFormatted}` : ''}

${checkOutDate ? 'Enjoy your stay!' : 'Have a wonderful experience!'}

If you have any questions or need assistance, feel free to reach out to us.

Thank you for choosing Jambolush!

© ${new Date().getFullYear()} Jambolush. All rights reserved.
      `;

      await emailService.sendEmail({
        to: email,
        subject: `Check-In Confirmed - ${propertyOrTourName}`,
        html: emailHtml,
        text: emailText
      });

      console.log(`[CHECKIN] Check-in confirmation email sent to ${email}`);
    } catch (error) {
      console.error('[CHECKIN] Error sending check-in confirmation:', error);
      throw error;
    }
  }

  /**
   * Send check-out confirmation notification to guest
   * @param email - Guest email
   * @param phone - Guest phone number
   * @param firstName - Guest first name
   * @param bookingId - Booking ID
   * @param propertyOrTourName - Property or tour name
   * @param checkOutDate - Check-out date
   */
  private async sendCheckOutConfirmation(
    email: string,
    phone: string | null,
    firstName: string,
    bookingId: string,
    propertyOrTourName: string,
    checkOutDate: Date
  ): Promise<void> {
    try {
      // Format date
      const checkOutFormatted = new Date(checkOutDate).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      // Send SMS notification
      if (phone) {
        const smsMessage = `Hi ${firstName}, thank you for staying at ${propertyOrTourName}! Your check-out has been confirmed. We hope you had a wonderful experience. Booking: ${bookingId.toUpperCase()} - Jambolush`;

        await smsService.sendNotificationSMS(phone, smsMessage);
        console.log(`[CHECKOUT] Check-out confirmation SMS sent to ${phone}`);
      }

      // Send Email notification
      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #2196F3; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
            .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px; }
            .icon { font-size: 48px; text-align: center; margin-bottom: 20px; }
            .info-box { background-color: white; padding: 20px; border-left: 4px solid #2196F3; margin: 20px 0; border-radius: 4px; }
            .info-row { margin: 10px 0; padding: 8px 0; border-bottom: 1px solid #eee; }
            .info-label { font-weight: bold; color: #666; }
            .info-value { color: #333; margin-left: 10px; }
            .badge { background-color: #2196F3; color: white; padding: 5px 15px; border-radius: 20px; font-weight: bold; display: inline-block; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
            .rating-box { background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0; text-align: center; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Thank You for Staying with Us!</h1>
            </div>
            <div class="content">
              <div class="icon">👋</div>
              <h2>Goodbye, ${firstName}!</h2>
              <p>Your check-out has been confirmed. We hope you had a wonderful stay!</p>

              <div class="info-box">
                <div class="info-row">
                  <span class="info-label">Booking Reference:</span>
                  <span class="badge">${bookingId.toUpperCase()}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Property:</span>
                  <span class="info-value">${propertyOrTourName}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Check-Out Date:</span>
                  <span class="info-value">${checkOutFormatted}</span>
                </div>
              </div>

              <div class="rating-box">
                <h3>🌟 Share Your Experience!</h3>
                <p>We'd love to hear about your stay. Your feedback helps us improve and helps other travelers.</p>
              </div>

              <p>We hope to welcome you back soon!</p>

              <div class="footer">
                <p>Thank you for choosing Jambolush!</p>
                <p>© ${new Date().getFullYear()} Jambolush. All rights reserved.</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `;

      const emailText = `
Hi ${firstName},

Thank you for staying with us! Your check-out has been confirmed.

Booking Details:
- Booking Reference: ${bookingId.toUpperCase()}
- Property: ${propertyOrTourName}
- Check-Out Date: ${checkOutFormatted}

We hope you had a wonderful stay! We'd love to hear about your experience - your feedback helps us improve and helps other travelers.

We hope to welcome you back soon!

Thank you for choosing Jambolush!

© ${new Date().getFullYear()} Jambolush. All rights reserved.
      `;

      await emailService.sendEmail({
        to: email,
        subject: `Thank You for Your Stay - ${propertyOrTourName}`,
        html: emailHtml,
        text: emailText
      });

      console.log(`[CHECKOUT] Check-out confirmation email sent to ${email}`);
    } catch (error) {
      console.error('[CHECKOUT] Error sending check-out confirmation:', error);
      throw error;
    }
  }

  /**
   * Verify payment transaction and mark as collected for pay-at-property bookings
   * The guest pays via the payment link on the website, creating a completed transaction.
   * This method verifies the transaction exists and is completed, then updates the booking.
   * @param transactionReference - Payment transaction reference (or externalId)
   * @param collectedBy - User ID of person verifying payment (host/staff)
   * @returns Promise<{ success: boolean, message: string }>
   */
  async markPaymentCollected(
    transactionReference: string,
    collectedBy: number
  ): Promise<{ success: boolean; message: string; booking?: any; transaction?: any }> {
    try {
      console.log(`[CHECKIN] Verifying payment transaction: ${transactionReference}`);

      // Find the transaction by reference or externalId
      const transaction = await prisma.transaction.findFirst({
        where: {
          OR: [
            { reference: transactionReference },
            { externalId: transactionReference }
          ]
        }
      });

      if (!transaction) {
        return {
          success: false,
          message: 'Payment transaction not found. Please verify the transaction reference and try again.'
        };
      }

      // Check if transaction is completed
      if (transaction.status.toUpperCase() !== 'COMPLETED') {
        return {
          success: false,
          message: `Payment transaction status is "${transaction.status}". Payment must be completed before check-in. Please ask the guest to complete payment via the payment link.`
        };
      }

      // Get booking ID from transaction bookingId field
      const bookingId = transaction.bookingId;

      if (!bookingId) {
        return {
          success: false,
          message: 'Booking ID not found in transaction. Invalid transaction reference.'
        };
      }

      console.log(`[CHECKIN] Transaction verified as completed. Updating booking ${bookingId}`);

      // Find the booking
      const booking = await prisma.booking.findFirst({
        where: { id: bookingId },
        include: {
          property: true,
          guest: true
        }
      });

      if (!booking) {
        // Try to find tour booking
        const tourBooking = await prisma.tourBooking.findFirst({
          where: { id: bookingId },
          include: {
            tour: true,
            user: true
          }
        });

        if (!tourBooking) {
          return {
            success: false,
            message: 'Booking not found for this transaction'
          };
        }

        // For tour bookings - update tour booking
        const updatedTourBooking = await prisma.tourBooking.update({
          where: { id: bookingId },
          data: {
            paymentStatus: 'completed',
            paymentId: transaction.reference
          },
          include: {
            tour: true,
            user: true
          }
        });

        console.log(`[CHECKIN] ✅ Payment verified for tour booking ${bookingId}`);

        return {
          success: true,
          message: 'Payment has been successfully verified. You can now proceed with check-in.',
          booking: updatedTourBooking,
          transaction: {
            reference: transaction.reference,
            externalId: transaction.externalId,
            amount: transaction.amount,
            currency: transaction.currency,
            status: transaction.status,
            completedAt: transaction.completedAt
          }
        };
      }

      // Check if payment was already marked as collected
      if (booking.propertyPaymentCollected) {
        return {
          success: true,
          message: 'Payment has already been verified and marked as collected. You can proceed with check-in.',
          booking
        };
      }

      // Update booking - mark payment as collected
      const updatedBooking = await prisma.booking.update({
        where: { id: bookingId },
        data: {
          propertyPaymentCollected: true,
          propertyPaymentCollectedAt: new Date(),
          propertyPaymentCollectedBy: collectedBy,
          paymentStatus: 'completed',
          transactionId: transaction.reference
        },
        include: {
          property: true,
          guest: true
        }
      });

      console.log(`[CHECKIN] ✅ Payment verified for booking ${bookingId}. Transaction: ${transaction.reference}`);

      return {
        success: true,
        message: 'Payment has been successfully verified and marked as collected. You can now proceed with check-in.',
        booking: updatedBooking,
        transaction: {
          reference: transaction.reference,
          externalId: transaction.externalId,
          amount: transaction.amount,
          currency: transaction.currency,
          status: transaction.status,
          completedAt: transaction.completedAt
        }
      };

    } catch (error: any) {
      console.error('[CHECKIN] Error verifying payment:', error);
      return {
        success: false,
        message: 'Error verifying payment. Please try again.'
      };
    }
  }

  /**
   * Resend existing booking code to guest
   * @param bookingId - Booking ID
   * @param userId - ID of the user requesting the resend (for ownership verification)
   * @returns Promise<{ success: boolean, message: string }>
   */
  async resendBookingCode(
    bookingId: string,
    userId: number
  ): Promise<{ success: boolean; message: string; booking?: any }> {
    try {
      console.log(`[CHECKIN] Resending booking code for booking ${bookingId} by user ${userId}`);

      // Try to find property booking
      const propertyBooking = await prisma.booking.findFirst({
        where: { id: bookingId },
        include: {
          property: true,
          guest: true
        }
      });

      if (propertyBooking) {
        // Verify ownership: Check if user is the host or agent of this property
        const isHost = propertyBooking.property.hostId === userId;
        const isAgent = propertyBooking.property.agentId === userId;

        if (!isHost && !isAgent) {
          return {
            success: false,
            message: 'Unauthorized: You do not have permission to access this booking.'
          };
        }

        // Check if booking code exists
        if (!propertyBooking.bookingCode) {
          return {
            success: false,
            message: 'No booking code found for this booking. Please verify the booking first to generate a code.'
          };
        }

        // Check if already checked in
        if (propertyBooking.checkInValidated) {
          return {
            success: false,
            message: 'This booking has already been checked in. Booking code is no longer needed.'
          };
        }

        // Check if payment is completed
        if (propertyBooking.paymentStatus !== 'completed' && !propertyBooking.propertyPaymentCollected) {
          return {
            success: false,
            message: 'Payment must be completed before resending booking code.'
          };
        }

        // Resend booking code to guest
        await this.sendBookingCodeNotification(
          propertyBooking.guest.email,
          propertyBooking.guest.phone,
          propertyBooking.guest.firstName,
          propertyBooking.bookingCode,
          bookingId,
          propertyBooking.property.name
        );

        console.log(`[CHECKIN] ✅ Booking code resent for ${bookingId}`);

        return {
          success: true,
          message: 'Booking code has been resent to the guest via SMS and email.',
          booking: {
            id: propertyBooking.id,
            bookingCodeSent: true
          }
        };
      }

      // Try to find tour booking
      const tourBooking = await prisma.tourBooking.findFirst({
        where: { id: bookingId },
        include: {
          tour: {
            include: {
              tourGuide: true
            }
          },
          user: true
        }
      });

      if (tourBooking) {
        // Verify ownership: Check if user is the tour guide
        const isTourGuide = tourBooking.tour.tourGuide?.id === userId;

        if (!isTourGuide) {
          return {
            success: false,
            message: 'Unauthorized: You do not have permission to access this tour booking.'
          };
        }

        // Check if booking code exists
        if (!tourBooking.bookingCode) {
          return {
            success: false,
            message: 'No booking code found for this booking. Please verify the booking first to generate a code.'
          };
        }

        // Check if already checked in
        if (tourBooking.checkInValidated) {
          return {
            success: false,
            message: 'This booking has already been checked in. Booking code is no longer needed.'
          };
        }

        // Check if payment is completed
        if (tourBooking.paymentStatus !== 'completed') {
          return {
            success: false,
            message: 'Payment must be completed before resending booking code.'
          };
        }

        // Resend booking code to guest
        await this.sendBookingCodeNotification(
          tourBooking.user.email,
          tourBooking.user.phone,
          tourBooking.user.firstName,
          tourBooking.bookingCode,
          bookingId,
          tourBooking.tour.title
        );

        console.log(`[CHECKIN] ✅ Booking code resent for tour ${bookingId}`);

        return {
          success: true,
          message: 'Booking code has been resent to the guest via SMS and email.',
          booking: {
            id: tourBooking.id,
            bookingCodeSent: true
          }
        };
      }

      // Booking not found
      return {
        success: false,
        message: 'Booking not found. Please check the booking ID and try again.'
      };

    } catch (error: any) {
      console.error('[CHECKIN] Error resending booking code:', error);
      return {
        success: false,
        message: 'Error resending booking code. Please try again.'
      };
    }
  }

  /**
   * Send check-in instructions to guest via SMS and Email
   * @param email - Guest email
   * @param phone - Guest phone number
   * @param firstName - Guest first name
   * @param instructions - Instructions from host/staff
   * @param bookingId - Booking ID
   * @param propertyOrTourName - Property or tour name
   */
  private async sendCheckInInstructions(
    email: string,
    phone: string | null,
    firstName: string,
    instructions: string,
    bookingId: string,
    propertyOrTourName: string
  ): Promise<void> {
    try {
      // Send SMS if phone number exists
      if (phone) {
        try {
          const smsMessage = `Hi ${firstName}, Welcome to ${propertyOrTourName}! Important info: ${instructions} - Booking: ${bookingId.toUpperCase()} - Jambolush`;
          await smsService.sendNotificationSMS(phone, smsMessage);
          console.log(`[CHECKIN] Check-in instructions SMS sent to ${phone}`);
        } catch (smsError) {
          console.error(`[CHECKIN] Failed to send instructions SMS:`, smsError);
          // Continue to send email even if SMS fails
        }
      }

      // Send Email (always)
      try {
        const emailSubject = `Welcome! Check-In Instructions for ${propertyOrTourName}`;
        const emailHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #083A85 0%, #0a4499 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: #f9f9f9; padding: 30px; border: 1px solid #ddd; }
              .welcome-box { background: #e8f4f8; padding: 20px; border-left: 4px solid #083A85; margin: 20px 0; border-radius: 5px; }
              .instructions-box { background: white; padding: 20px; border: 2px solid #083A85; margin: 20px 0; border-radius: 8px; }
              .instructions-title { color: #083A85; font-weight: bold; font-size: 18px; margin-bottom: 15px; }
              .instructions-content { color: #333; font-size: 15px; line-height: 1.8; white-space: pre-wrap; }
              .info-box { background: white; padding: 15px; border-left: 4px solid #083A85; margin: 20px 0; }
              .footer { text-align: center; padding: 20px; color: #777; font-size: 12px; }
              .badge { background: #083A85; color: white; padding: 5px 10px; border-radius: 5px; font-size: 14px; display: inline-block; margin-top: 10px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>🎉 Welcome!</h1>
                <p style="margin: 0; font-size: 16px;">You've Successfully Checked In</p>
              </div>
              <div class="content">
                <div class="welcome-box">
                  <p style="margin: 0; font-size: 16px;">
                    <strong>Hi ${firstName},</strong><br><br>
                    Welcome to <strong>${propertyOrTourName}</strong>! Your check-in has been confirmed.
                  </p>
                </div>

                <div class="instructions-box">
                  <div class="instructions-title">📋 Important Instructions</div>
                  <div class="instructions-content">${instructions.replace(/\n/g, '<br>')}</div>
                </div>

                <div class="info-box">
                  <strong>Booking Reference:</strong><br>
                  <span class="badge">${bookingId.toUpperCase()}</span>
                </div>

                <p style="margin-top: 20px;">
                  If you have any questions or need assistance, please don't hesitate to contact the host or our support team.
                </p>

                <p style="margin-top: 20px; color: #083A85; font-weight: bold;">
                  Enjoy your stay! 🌟
                </p>
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
Welcome to ${propertyOrTourName}!

Hi ${firstName},

Your check-in has been confirmed. Here are your important instructions:

INSTRUCTIONS:
${instructions}

Booking Reference: ${bookingId.toUpperCase()}

If you have any questions or need assistance, please contact the host or our support team.

Enjoy your stay!

Jambolush
        `;

        // Use the email service to send
        await emailService.sendEmail({
          to: email,
          subject: emailSubject,
          html: emailHtml,
          text: emailText
        });

        console.log(`[CHECKIN] Check-in instructions email sent to ${email}`);
      } catch (emailError) {
        console.error(`[CHECKIN] Failed to send instructions email:`, emailError);
      }
    } catch (error) {
      console.error(`[CHECKIN] Error sending check-in instructions:`, error);
    }
  }
}

export default new CheckInService();
