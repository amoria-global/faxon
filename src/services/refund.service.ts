// src/services/refund.service.ts - Refund Management Service
import { PrismaClient } from '@prisma/client';
import { calculateCancellationRefund, CancellationCalculation } from '../utils/cancellation-policy.utility';
import { pawaPayService } from './pawapay.service';
import { EmailService } from './email.service';
import { BrevoMailingService } from '../utils/brevo.admin';

const prisma = new PrismaClient();
const emailService = new EmailService();
const adminNotificationService = new BrevoMailingService();

export interface RefundRequest {
  bookingId: string;
  bookingType: 'property' | 'tour';
  requestedBy: number;
  reason?: string;
}

export interface RefundApproval {
  bookingId: string;
  bookingType: 'property' | 'tour';
  approvedBy: number;
  refundChannel: 'pawapay' | 'xentripay' | 'wallet';
  notes?: string;
}

export interface RefundRejection {
  bookingId: string;
  bookingType: 'property' | 'tour';
  rejectedBy: number;
  reason: string;
}

export class RefundService {
  /**
   * Request cancellation and refund for a booking
   * Calculates refund amount based on 24-hour policy
   */
  async requestRefund(request: RefundRequest): Promise<{
    success: boolean;
    message: string;
    cancellationCalc?: CancellationCalculation;
  }> {
    try {
      if (request.bookingType === 'property') {
        return await this.requestPropertyRefund(request);
      } else {
        return await this.requestTourRefund(request);
      }
    } catch (error) {
      console.error('[REFUND_SERVICE] Error requesting refund:', error);
      throw error;
    }
  }

  /**
   * Request refund for property booking
   */
  private async requestPropertyRefund(request: RefundRequest) {
    const booking = await prisma.booking.findUnique({
      where: { id: request.bookingId },
      include: {
        guest: true,
        property: {
          include: {
            host: true
          }
        }
      }
    });

    if (!booking) {
      throw new Error('Booking not found');
    }

    if (booking.status === 'cancelled') {
      throw new Error('Booking is already cancelled');
    }

    if (booking.refundRequested) {
      throw new Error('Refund has already been requested for this booking');
    }

    // Calculate refund based on 24-hour policy
    const cancellationCalc = calculateCancellationRefund(
      booking.checkIn,
      booking.totalPrice,
      'USD'
    );

    if (!cancellationCalc.canCancel) {
      throw new Error(cancellationCalc.reason || 'Cannot cancel this booking');
    }

    // Credit pending balance immediately if there's a refund amount
    if (cancellationCalc.refundAmount > 0) {
      await this.creditPendingWallet(
        booking.guestId,
        cancellationCalc.refundAmount,
        'USD',
        `Pending refund for booking ${booking.id}`,
        booking.id
      );
    }

    // Remove blocked dates immediately
    await prisma.blockedDate.deleteMany({
      where: {
        reason: { contains: `Booking ID: ${booking.id}` },
        isActive: true
      }
    });

    // Update booking with refund request
    await prisma.booking.update({
      where: { id: request.bookingId },
      data: {
        refundRequested: true,
        refundRequestedAt: new Date(),
        refundRequestedBy: request.requestedBy,
        refundAmount: cancellationCalc.refundAmount,
        refundPlatformFee: cancellationCalc.platformFee,
        cancellationReason: request.reason,
        status: 'cancelled',
        paymentStatus: cancellationCalc.refundAmount > 0 ? 'pending_refund' : 'completed',
        cancelledAt: new Date()
      }
    });

    // Send instant notification to admin
    try {
      await adminNotificationService.sendPendingRefundNotification({
        bookingId: booking.id,
        bookingType: 'property',
        guestName: `${booking.guest.firstName} ${booking.guest.lastName}`,
        guestEmail: booking.guest.email,
        propertyName: booking.property.name,
        checkInDate: booking.checkIn.toISOString().split('T')[0],
        checkOutDate: booking.checkOut.toISOString().split('T')[0],
        totalAmount: booking.totalPrice,
        refundAmount: cancellationCalc.refundAmount,
        platformFee: cancellationCalc.platformFee,
        reason: request.reason || 'Not specified',
        isFreeCancel: cancellationCalc.isFreeCancel
      });
    } catch (notificationError) {
      console.error('[REFUND_SERVICE] Failed to send admin notification:', notificationError);
      // Don't fail the request if notification fails
    }

    // Send confirmation to guest
    try {
      await emailService.sendEmail({
        to: booking.guest.email,
        subject: 'Booking Cancellation Confirmed',
        html: this.generateCancellationConfirmationEmail(
          booking.guest.firstName,
          booking.property.name,
          booking.checkIn.toISOString().split('T')[0],
          cancellationCalc
        ),
        text: `Hi ${booking.guest.firstName}, Your booking has been cancelled. ${cancellationCalc.isFreeCancel ? `Full refund of ${cancellationCalc.refundAmount} USD will be processed.` : 'No refund available for late cancellation.'}`
      });
    } catch (emailError) {
      console.error('[REFUND_SERVICE] Failed to send guest email:', emailError);
    }

    return {
      success: true,
      message: cancellationCalc.refundAmount > 0
        ? `Booking cancelled. ${cancellationCalc.isFreeCancel ? 'Full refund' : `Refund of ${cancellationCalc.refundAmount} USD`} has been credited to your pending balance and will be processed by admin.`
        : 'Booking cancelled. No refund available for cancellations within 24 hours of check-in.',
      cancellationCalc
    };
  }

  /**
   * Request refund for tour booking
   */
  private async requestTourRefund(request: RefundRequest) {
    const booking = await prisma.tourBooking.findUnique({
      where: { id: request.bookingId },
      include: {
        user: true,
        tour: {
          include: {
            tourGuide: true
          }
        },
        schedule: true
      }
    });

    if (!booking) {
      throw new Error('Tour booking not found');
    }

    if (booking.status === 'cancelled') {
      throw new Error('Booking is already cancelled');
    }

    if (booking.refundRequested) {
      throw new Error('Refund has already been requested for this booking');
    }

    // Calculate refund based on 24-hour policy (using schedule start date)
    const cancellationCalc = calculateCancellationRefund(
      booking.schedule.startDate,
      booking.totalAmount,
      booking.currency
    );

    if (!cancellationCalc.canCancel) {
      throw new Error(cancellationCalc.reason || 'Cannot cancel this booking');
    }

    // Credit pending balance immediately if there's a refund amount
    if (cancellationCalc.refundAmount > 0) {
      await this.creditPendingWallet(
        booking.userId,
        cancellationCalc.refundAmount,
        booking.currency,
        `Pending refund for tour booking ${booking.id}`,
        booking.id
      );
    }

    // Free up tour slots immediately
    await prisma.tourSchedule.update({
      where: { id: booking.scheduleId },
      data: {
        bookedSlots: { decrement: booking.numberOfParticipants }
      }
    });

    // Update booking with refund request
    await prisma.tourBooking.update({
      where: { id: request.bookingId },
      data: {
        refundRequested: true,
        refundRequestedAt: new Date(),
        refundRequestedBy: request.requestedBy,
        refundAmount: cancellationCalc.refundAmount,
        refundPlatformFee: cancellationCalc.platformFee,
        refundReason: request.reason,
        status: 'cancelled',
        paymentStatus: cancellationCalc.refundAmount > 0 ? 'pending_refund' : 'completed'
      }
    });

    // Send instant notification to admin
    try {
      await adminNotificationService.sendPendingRefundNotification({
        bookingId: booking.id,
        bookingType: 'tour',
        guestName: `${booking.user.firstName} ${booking.user.lastName}`,
        guestEmail: booking.user.email,
        tourTitle: booking.tour.title,
        tourDate: booking.schedule.startDate.toISOString().split('T')[0],
        numberOfParticipants: booking.numberOfParticipants,
        totalAmount: booking.totalAmount,
        refundAmount: cancellationCalc.refundAmount,
        platformFee: cancellationCalc.platformFee,
        reason: request.reason || 'Not specified',
        isFreeCancel: cancellationCalc.isFreeCancel
      });
    } catch (notificationError) {
      console.error('[REFUND_SERVICE] Failed to send admin notification:', notificationError);
    }

    // Send confirmation to guest
    try {
      await emailService.sendEmail({
        to: booking.user.email,
        subject: 'Tour Booking Cancellation Confirmed',
        html: this.generateCancellationConfirmationEmail(
          booking.user.firstName,
          booking.tour.title,
          booking.schedule.startDate.toISOString().split('T')[0],
          cancellationCalc
        ),
        text: `Hi ${booking.user.firstName}, Your tour booking has been cancelled. ${cancellationCalc.isFreeCancel ? `Full refund of ${cancellationCalc.refundAmount} ${booking.currency} will be processed.` : 'No refund available for late cancellation.'}`
      });
    } catch (emailError) {
      console.error('[REFUND_SERVICE] Failed to send guest email:', emailError);
    }

    return {
      success: true,
      message: cancellationCalc.refundAmount > 0
        ? `Tour booking cancelled. ${cancellationCalc.isFreeCancel ? 'Full refund' : `Refund of ${cancellationCalc.refundAmount} ${booking.currency}`} has been credited to your pending balance and will be processed by admin.`
        : 'Tour booking cancelled. No refund available for cancellations within 24 hours of tour start.',
      cancellationCalc
    };
  }

  /**
   * Approve refund and process it (Admin only)
   */
  async approveRefund(approval: RefundApproval): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      if (approval.bookingType === 'property') {
        return await this.approvePropertyRefund(approval);
      } else {
        return await this.approveTourRefund(approval);
      }
    } catch (error) {
      console.error('[REFUND_SERVICE] Error approving refund:', error);
      throw error;
    }
  }

  /**
   * Approve property booking refund
   * Processes refund via Xentripay (moves from pending to balance, then to mobile money)
   */
  private async approvePropertyRefund(approval: RefundApproval) {
    const booking = await prisma.booking.findUnique({
      where: { id: approval.bookingId },
      include: {
        guest: true,
        property: true
      }
    });

    if (!booking) {
      throw new Error('Booking not found');
    }

    if (!booking.refundRequested) {
      throw new Error('No refund has been requested for this booking');
    }

    if (booking.refundApproved) {
      throw new Error('Refund has already been approved');
    }

    const refundAmount = booking.refundAmount || 0;

    if (refundAmount <= 0) {
      throw new Error('No refund amount available for this booking');
    }

    // Get wallet and move from pending to balance (processed via Xentripay)
    const wallet = await prisma.wallet.findUnique({
      where: { userId: booking.guestId }
    });

    if (!wallet) {
      throw new Error('Wallet not found for user');
    }

    // Deduct from pending balance
    const newPendingBalance = wallet.pendingBalance - refundAmount;
    if (newPendingBalance < 0) {
      throw new Error('Insufficient pending balance for refund');
    }

    // Update wallet - move from pending to actual withdrawal
    await prisma.wallet.update({
      where: { userId: booking.guestId },
      data: {
        pendingBalance: newPendingBalance
      }
    });

    // Create wallet transaction for pending deduction
    await prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: 'PENDING_REFUND_APPROVED',
        amount: -refundAmount,
        balanceBefore: wallet.pendingBalance,
        balanceAfter: newPendingBalance,
        reference: `REFUND-APPROVED-${booking.id}`,
        description: `Refund approved and processed via Xentripay for booking ${booking.id}`,
        transactionId: booking.id
      }
    });

    // Note: Actual Xentripay payout is handled by admin via the withdrawal/payout system
    // The refund request is treated similar to a withdrawal request

    // Update booking status
    await prisma.booking.update({
      where: { id: approval.bookingId },
      data: {
        refundApproved: true,
        refundApprovedAt: new Date(),
        refundApprovedBy: approval.approvedBy,
        refundChannel: 'xentripay',
        status: 'cancelled',
        paymentStatus: 'refunded',
        cancelledAt: booking.cancelledAt || new Date()
      }
    });

    // Send notification to guest
    try {
      await emailService.sendEmail({
        to: booking.guest.email,
        subject: 'Refund Processed - Payment on the Way',
        html: this.generateRefundApprovedEmail(booking.guest.firstName, refundAmount, 'USD'),
        text: `Hi ${booking.guest.firstName}, Your refund of ${refundAmount} USD has been approved and is being processed via mobile money transfer. You should receive the funds shortly.`
      });
    } catch (emailError) {
      console.error('[REFUND_SERVICE] Failed to send refund email:', emailError);
    }

    return {
      success: true,
      message: `Refund approved and ${refundAmount} USD is being processed via Xentripay`
    };
  }

  /**
   * Approve tour booking refund
   * Processes refund via Xentripay (moves from pending to balance, then to mobile money)
   */
  private async approveTourRefund(approval: RefundApproval) {
    const booking = await prisma.tourBooking.findUnique({
      where: { id: approval.bookingId },
      include: {
        user: true,
        tour: true,
        schedule: true
      }
    });

    if (!booking) {
      throw new Error('Tour booking not found');
    }

    if (!booking.refundRequested) {
      throw new Error('No refund has been requested for this booking');
    }

    if (booking.refundApproved) {
      throw new Error('Refund has already been approved');
    }

    const refundAmount = booking.refundAmount || 0;

    if (refundAmount <= 0) {
      throw new Error('No refund amount available for this booking');
    }

    // Get wallet and move from pending to balance (processed via Xentripay)
    const wallet = await prisma.wallet.findUnique({
      where: { userId: booking.userId }
    });

    if (!wallet) {
      throw new Error('Wallet not found for user');
    }

    // Deduct from pending balance
    const newPendingBalance = wallet.pendingBalance - refundAmount;
    if (newPendingBalance < 0) {
      throw new Error('Insufficient pending balance for refund');
    }

    // Update wallet - move from pending to actual withdrawal
    await prisma.wallet.update({
      where: { userId: booking.userId },
      data: {
        pendingBalance: newPendingBalance
      }
    });

    // Create wallet transaction for pending deduction
    await prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: 'PENDING_REFUND_APPROVED',
        amount: -refundAmount,
        balanceBefore: wallet.pendingBalance,
        balanceAfter: newPendingBalance,
        reference: `REFUND-APPROVED-${booking.id}`,
        description: `Refund approved and processed via Xentripay for tour booking ${booking.id}`,
        transactionId: booking.id
      }
    });

    // Update booking status
    await prisma.tourBooking.update({
      where: { id: approval.bookingId },
      data: {
        refundApproved: true,
        refundApprovedAt: new Date(),
        refundApprovedBy: approval.approvedBy,
        refundChannel: 'xentripay',
        status: 'cancelled',
        paymentStatus: 'refunded'
      }
    });

    // Send notification to guest
    try {
      await emailService.sendEmail({
        to: booking.user.email,
        subject: 'Refund Processed - Payment on the Way',
        html: this.generateRefundApprovedEmail(booking.user.firstName, refundAmount, booking.currency),
        text: `Hi ${booking.user.firstName}, Your refund of ${refundAmount} ${booking.currency} has been approved and is being processed via mobile money transfer. You should receive the funds shortly.`
      });
    } catch (emailError) {
      console.error('[REFUND_SERVICE] Failed to send refund email:', emailError);
    }

    return {
      success: true,
      message: `Refund approved and ${refundAmount} ${booking.currency} is being processed via Xentripay`
    };
  }

  /**
   * Reject refund request (Admin only)
   */
  async rejectRefund(rejection: RefundRejection): Promise<{
    success: boolean;
    message: string;
  }> {
    const updateData: any = {
      refundRejected: true,
      refundRejectedAt: new Date(),
      refundRejectedBy: rejection.rejectedBy,
      refundRejectionReason: rejection.reason,
      status: 'confirmed' // Restore to confirmed status
    };

    if (rejection.bookingType === 'property') {
      await prisma.booking.update({
        where: { id: rejection.bookingId },
        data: updateData
      });
    } else {
      await prisma.tourBooking.update({
        where: { id: rejection.bookingId },
        data: updateData
      });
    }

    return {
      success: true,
      message: 'Refund request rejected'
    };
  }

  /**
   * Credit amount to user pending wallet balance (create wallet if doesn't exist)
   * Similar to withdrawal requests - money moves to pending, admin processes to actual refund
   */
  private async creditPendingWallet(
    userId: number,
    amount: number,
    currency: string,
    description: string,
    bookingId: string
  ): Promise<void> {
    // Get or create wallet
    let wallet = await prisma.wallet.findUnique({
      where: { userId }
    });

    if (!wallet) {
      console.log(`[REFUND_SERVICE] Creating wallet for user ${userId}`);
      wallet = await prisma.wallet.create({
        data: {
          userId,
          balance: 0,
          pendingBalance: 0,
          currency: currency || 'USD',
          isActive: true
        }
      });
    }

    const newPendingBalance = wallet.pendingBalance + amount;

    // Update wallet pending balance
    await prisma.wallet.update({
      where: { userId },
      data: { pendingBalance: newPendingBalance }
    });

    // Create wallet transaction record
    await prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: 'PENDING_REFUND',
        amount: amount,
        balanceBefore: wallet.pendingBalance,
        balanceAfter: newPendingBalance,
        reference: `PENDING-REFUND-${bookingId}`,
        description,
        transactionId: bookingId
      }
    });

    console.log(`[REFUND_SERVICE] Credited ${amount} ${currency} to user ${userId} pending balance (new pending: ${newPendingBalance})`);
  }

  /**
   * Credit amount to user wallet (create wallet if doesn't exist)
   */
  private async creditWallet(
    userId: number,
    amount: number,
    currency: string,
    description: string,
    bookingId: string
  ): Promise<void> {
    // Get or create wallet
    let wallet = await prisma.wallet.findUnique({
      where: { userId }
    });

    if (!wallet) {
      console.log(`[REFUND_SERVICE] Creating wallet for user ${userId}`);
      wallet = await prisma.wallet.create({
        data: {
          userId,
          balance: 0,
          pendingBalance: 0,
          currency: currency || 'USD',
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
        type: 'REFUND_CREDIT',
        amount: amount,
        balanceBefore: wallet.balance,
        balanceAfter: newBalance,
        reference: `REFUND-${bookingId}`,
        description,
        transactionId: bookingId
      }
    });

    console.log(`[REFUND_SERVICE] Credited ${amount} ${currency} to user ${userId} wallet (new balance: ${newBalance})`);
  }

  /**
   * Get pending refund requests (Admin)
   */
  async getPendingRefunds(bookingType?: 'property' | 'tour') {
    if (!bookingType || bookingType === 'property') {
      const propertyRefunds = await prisma.booking.findMany({
        where: {
          refundRequested: true,
          refundApproved: null,
          refundRejected: null
        },
        include: {
          guest: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              phone: true
            }
          },
          property: {
            select: {
              id: true,
              name: true,
              location: true
            }
          }
        },
        orderBy: { refundRequestedAt: 'desc' }
      });

      if (bookingType === 'property') {
        return { propertyRefunds };
      }
    }

    if (!bookingType || bookingType === 'tour') {
      const tourRefunds = await prisma.tourBooking.findMany({
        where: {
          refundRequested: true,
          refundApproved: null,
          refundRejected: null
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              phone: true
            }
          },
          tour: {
            select: {
              id: true,
              title: true,
              locationCity: true
            }
          },
          schedule: {
            select: {
              startDate: true,
              endDate: true
            }
          }
        },
        orderBy: { refundRequestedAt: 'desc' }
      });

      if (bookingType === 'tour') {
        return { tourRefunds };
      }
    }

    // Return both if no type specified
    const [propertyRefunds, tourRefunds] = await Promise.all([
      prisma.booking.findMany({
        where: {
          refundRequested: true,
          refundApproved: null,
          refundRejected: null
        },
        include: {
          guest: true,
          property: true
        },
        orderBy: { refundRequestedAt: 'desc' }
      }),
      prisma.tourBooking.findMany({
        where: {
          refundRequested: true,
          refundApproved: null,
          refundRejected: null
        },
        include: {
          user: true,
          tour: true,
          schedule: true
        },
        orderBy: { refundRequestedAt: 'desc' }
      })
    ]);

    return { propertyRefunds, tourRefunds };
  }

  /**
   * Generate cancellation confirmation email HTML
   */
  private generateCancellationConfirmationEmail(
    userName: string,
    itemName: string,
    date: string,
    calculation: CancellationCalculation
  ): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border: 1px solid #ddd; }
          .amount-box { background: ${calculation.refundAmount > 0 ? '#10b981' : '#ef4444'}; color: white; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px; }
          .amount { font-size: 32px; font-weight: bold; }
          .info-box { background: white; padding: 15px; margin: 15px 0; border-left: 4px solid #3b82f6; }
          .footer { text-align: center; padding: 20px; color: #777; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Booking Cancelled</h1>
          </div>
          <div class="content">
            <p>Hi ${userName},</p>
            <p>Your booking has been successfully cancelled.</p>

            <div class="info-box">
              <strong>Booking Details:</strong><br>
              ${itemName}<br>
              Date: ${date}
            </div>

            <div class="amount-box">
              <div>${calculation.refundAmount > 0 ? 'Refund Amount' : 'No Refund'}</div>
              <div class="amount">${calculation.refundAmount.toFixed(2)} ${calculation.currency}</div>
              ${calculation.refundAmount > 0 ? '<small>Credited to your pending balance</small>' : '<small>Late cancellation - within 24 hours</small>'}
            </div>

            ${calculation.refundAmount > 0 ? `
              <p><strong>Your refund has been credited to your pending wallet balance.</strong></p>
              <p>The admin team will process your refund via Xentripay shortly. You will receive a notification once the refund has been completed.</p>
            ` : `
              <p><strong>Unfortunately, no refund is available for cancellations made within 24 hours of check-in/tour start.</strong></p>
              <p>As per our cancellation policy, the full amount (${calculation.platformFee.toFixed(2)} ${calculation.currency}) has been retained as a cancellation fee.</p>
            `}

            <p>Thank you for your understanding!</p>
          </div>
          <div class="footer">
            <p>This is an automated message from Jambolush</p>
            <p>&copy; ${new Date().getFullYear()} Jambolush. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate refund approved email HTML
   */
  private generateRefundApprovedEmail(userName: string, amount: number, currency: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border: 1px solid #ddd; }
          .amount-box { background: #10b981; color: white; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px; }
          .amount { font-size: 36px; font-weight: bold; }
          .footer { text-align: center; padding: 20px; color: #777; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Refund Approved</h1>
          </div>
          <div class="content">
            <p>Hi ${userName},</p>
            <p>Good news! Your refund request has been approved.</p>

            <div class="amount-box">
              <div>Refund Amount:</div>
              <div class="amount">${amount.toFixed(2)} ${currency}</div>
            </div>

            <p><strong>The refund has been credited to your wallet.</strong></p>

            <p>You can now use this balance for new bookings or request a withdrawal to your mobile money account.</p>

            <p>Thank you for your understanding!</p>
          </div>
          <div class="footer">
            <p>This is an automated message from Jambolush</p>
            <p>&copy; ${new Date().getFullYear()} Jambolush. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}

export const refundService = new RefundService();
