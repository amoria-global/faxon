// src/routes/checkin.routes.ts - Two-step check-in verification routes

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import checkInService from '../services/checkin.service';

const router = Router();

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
    userType?: string;
  };
}

/**
 * STEP 1: Verify booking ID and retrieve booking details
 * POST /api/checkin/verify-booking
 *
 * This endpoint allows hosts/staff to verify a booking ID and see guest details
 * before completing the check-in process. The booking code is NOT required at this step.
 */
router.post(
  '/verify-booking',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { bookingId } = req.body;
      const userId = parseInt(req.user!.userId);

      // Validation
      if (!bookingId || typeof bookingId !== 'string' || bookingId.trim() === '') {
        return res.status(400).json({
          success: false,
          message: 'Booking ID is required'
        });
      }

      // Verify booking ID and retrieve details (with ownership verification)
      const result = await checkInService.verifyBookingId(bookingId.trim(), userId);

      if (!result.success) {
        return res.status(404).json({
          success: false,
          message: result.message
        });
      }

      return res.status(200).json({
        success: true,
        message: result.message,
        data: result.booking
      });

    } catch (error: any) {
      console.error('[CHECKIN_ROUTES] Error verifying booking ID:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to verify booking. Please try again.'
      });
    }
  }
);

/**
 * Resend existing booking code to guest
 * POST /api/checkin/resend-code
 *
 * This endpoint resends the existing booking code to the guest via SMS and email.
 * Useful when the guest has forgotten their booking code.
 */
router.post(
  '/resend-code',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { bookingId } = req.body;
      const userId = parseInt(req.user!.userId);

      // Validation
      if (!bookingId || typeof bookingId !== 'string' || bookingId.trim() === '') {
        return res.status(400).json({
          success: false,
          message: 'Booking ID is required'
        });
      }

      // Resend booking code (with ownership verification)
      const result = await checkInService.resendBookingCode(bookingId.trim(), userId);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      return res.status(200).json({
        success: true,
        message: result.message,
        data: {
          bookingId: result.booking?.id,
          bookingCodeSent: true
        }
      });

    } catch (error: any) {
      console.error('[CHECKIN_ROUTES] Error resending booking code:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to resend booking code. Please try again.'
      });
    }
  }
);

/**
 * Mark payment as collected for pay-at-property bookings
 * POST /api/checkin/collect-payment
 *
 * This endpoint verifies and marks payment as collected using transaction reference.
 * The transaction reference (or externalId) is provided to the guest when payment is confirmed.
 * Must be called before check-in can be completed for pay-at-property bookings.
 */
router.post(
  '/collect-payment',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { transactionReference } = req.body;
      const userId = parseInt(req.user!.userId);

      // Validation
      if (!transactionReference || typeof transactionReference !== 'string' || transactionReference.trim() === '') {
        return res.status(400).json({
          success: false,
          message: 'Transaction reference is required'
        });
      }

      // Verify transaction and mark payment as collected
      const result = await checkInService.markPaymentCollected(
        transactionReference.trim(),
        userId
      );

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      return res.status(200).json({
        success: true,
        message: result.message,
        data: {
          bookingId: result.booking?.id,
          paymentVerified: true,
          paymentCollectedAt: result.booking?.propertyPaymentCollectedAt || result.booking?.updatedAt,
          paymentAmount: result.booking?.propertyPaymentAmount || result.booking?.totalPrice || result.booking?.totalAmount,
          transaction: {
            reference: result.transaction?.reference,
            externalId: result.transaction?.externalId,
            amount: result.transaction?.amount,
            currency: result.transaction?.currency,
            status: result.transaction?.status,
            completedAt: result.transaction?.completedAt
          }
        }
      });

    } catch (error: any) {
      console.error('[CHECKIN_ROUTES] Error collecting payment:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to mark payment as collected. Please try again.'
      });
    }
  }
);

/**
 * STEP 2: Confirm check-in with booking code
 * POST /api/checkin/confirm
 *
 * This endpoint completes the check-in process by verifying the booking code.
 * After successful verification:
 * - Booking status is updated to CHECKED_IN
 * - Funds are released from pendingBalance to available balance
 * - Host/Agent/Guide can now withdraw their earnings
 * - Optional instructions are sent to the guest via SMS/Email
 */
router.post(
  '/confirm',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { bookingId, bookingCode, instructions } = req.body;
      const userId = parseInt(req.user!.userId);

      // Validation
      if (!bookingId || typeof bookingId !== 'string' || bookingId.trim() === '') {
        return res.status(400).json({
          success: false,
          message: 'Booking ID is required'
        });
      }

      if (!bookingCode || typeof bookingCode !== 'string' || bookingCode.trim() === '') {
        return res.status(400).json({
          success: false,
          message: 'Booking code is required'
        });
      }

      // Validate booking code format (6 uppercase alphanumeric characters)
      const codeRegex = /^[A-Z0-9]{6}$/;
      if (!codeRegex.test(bookingCode.trim().toUpperCase())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid booking code format. Must be 6 uppercase alphanumeric characters.'
        });
      }

      // Validate instructions (optional, but if provided must be string and not empty)
      if (instructions !== undefined && instructions !== null) {
        if (typeof instructions !== 'string' || instructions.trim() === '') {
          return res.status(400).json({
            success: false,
            message: 'Instructions must be a non-empty string'
          });
        }
      }

      // Confirm check-in with booking code and optional instructions
      const result = await checkInService.confirmCheckIn(
        bookingId.trim(),
        bookingCode.trim().toUpperCase(),
        userId,
        instructions?.trim()
      );

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      return res.status(200).json({
        success: true,
        message: result.message,
        data: {
          bookingId: result.booking?.id,
          checkInValidated: true,
          checkInValidatedAt: result.booking?.checkInValidatedAt || result.booking?.checkInTime,
          fundsReleased: true,
          instructionsSent: !!instructions
        }
      });

    } catch (error: any) {
      console.error('[CHECKIN_ROUTES] Error confirming check-in:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to confirm check-in. Please try again.'
      });
    }
  }
);

/**
 * Confirm check-out for a booking
 * POST /api/checkin/confirm-checkout
 *
 * This endpoint allows hosts/tour guides to confirm when a guest has checked out.
 * Sends a thank you notification to the guest.
 */
router.post(
  '/confirm-checkout',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { bookingId } = req.body;
      const userId = parseInt(req.user!.userId);

      // Validation
      if (!bookingId || typeof bookingId !== 'string' || bookingId.trim() === '') {
        return res.status(400).json({
          success: false,
          message: 'Booking ID is required'
        });
      }

      // Confirm check-out (with ownership verification)
      const result = await checkInService.confirmCheckOut(
        bookingId.trim(),
        userId
      );

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      return res.status(200).json({
        success: true,
        message: result.message,
        data: {
          bookingId: result.booking?.id,
          checkOutConfirmed: true,
          checkOutValidatedAt: result.booking?.checkOutValidatedAt
        }
      });

    } catch (error: any) {
      console.error('[CHECKIN_ROUTES] Error confirming check-out:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to confirm check-out. Please try again.'
      });
    }
  }
);

/**
 * Check if user can withdraw from a specific booking
 * GET /api/checkin/can-withdraw/:bookingId
 *
 * This endpoint checks if the authenticated user is eligible to withdraw
 * funds from a specific booking. Requires check-in to have occurred.
 */
router.get(
  '/can-withdraw/:bookingId',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { bookingId } = req.params;
      const userId = parseInt(req.user!.userId);

      if (!bookingId) {
        return res.status(400).json({
          success: false,
          message: 'Booking ID is required'
        });
      }

      const result = await checkInService.canWithdrawFromBooking(userId, bookingId);

      return res.status(200).json({
        success: true,
        data: {
          canWithdraw: result.canWithdraw,
          reason: result.reason
        }
      });

    } catch (error: any) {
      console.error('[CHECKIN_ROUTES] Error checking withdrawal eligibility:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to check withdrawal eligibility'
      });
    }
  }
);

/**
 * Get check-in status for a booking
 * GET /api/checkin/status/:bookingId
 *
 * This endpoint returns the current check-in status of a booking
 */
router.get(
  '/status/:bookingId',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { bookingId } = req.params;
      const userId = parseInt(req.user!.userId);

      if (!bookingId) {
        return res.status(400).json({
          success: false,
          message: 'Booking ID is required'
        });
      }

      // Verify booking and get status (with ownership verification)
      const result = await checkInService.verifyBookingId(bookingId, userId);

      if (!result.success) {
        return res.status(404).json({
          success: false,
          message: result.message
        });
      }

      // Extract check-in status
      const booking = result.booking;
      const isCheckedIn = booking.status === 'ALREADY_CHECKED_IN';

      return res.status(200).json({
        success: true,
        data: {
          bookingId: booking.id,
          isCheckedIn,
          checkInValidatedAt: booking.checkInValidatedAt || null,
          paymentStatus: booking.paymentStatus,
          status: booking.status || 'PENDING_CHECKIN'
        }
      });

    } catch (error: any) {
      console.error('[CHECKIN_ROUTES] Error getting check-in status:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to get check-in status'
      });
    }
  }
);

export default router;
