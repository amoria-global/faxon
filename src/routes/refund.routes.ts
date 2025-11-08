// src/routes/refund.routes.ts - Refund Management Routes

import { Router, Request, Response } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { refundService } from '../services/refund.service';

const router = Router();

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
    userType?: string;
  };
}

/**
 * POST /api/refunds/request
 * Request a refund for a booking (User)
 */
router.post('/request', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = parseInt(req.user!.userId);
    const { bookingId, bookingType, reason } = req.body;

    if (!bookingId || !bookingType) {
      return res.status(400).json({
        success: false,
        message: 'Booking ID and type are required'
      });
    }

    if (!['property', 'tour'].includes(bookingType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid booking type. Must be "property" or "tour"'
      });
    }

    const result = await refundService.requestRefund({
      bookingId,
      bookingType,
      requestedBy: userId,
      reason
    });

    res.status(200).json({
      success: true,
      message: result.message,
      data: {
        cancellationCalculation: result.cancellationCalc
      }
    });
  } catch (error: any) {
    console.error('[REFUND_ROUTES] Request refund error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to request refund'
    });
  }
});

/**
 * GET /api/refunds/pending
 * Get all pending refund requests (Admin only)
 */
router.get('/pending', authenticate, authorize('admin'), async (req: Request, res: Response) => {
  try {
    const bookingType = req.query.type as 'property' | 'tour' | undefined;

    const refunds = await refundService.getPendingRefunds(bookingType);

    res.status(200).json({
      success: true,
      data: refunds
    });
  } catch (error: any) {
    console.error('[REFUND_ROUTES] Get pending refunds error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve pending refunds'
    });
  }
});

/**
 * POST /api/refunds/approve
 * Approve a refund request (Admin only)
 */
router.post('/approve', authenticate, authorize('admin'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const adminId = parseInt(req.user!.userId);
    const { bookingId, bookingType, refundChannel, notes } = req.body;

    if (!bookingId || !bookingType) {
      return res.status(400).json({
        success: false,
        message: 'Booking ID and type are required'
      });
    }

    if (!['property', 'tour'].includes(bookingType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid booking type'
      });
    }

    // Default to wallet refund (as per requirements)
    const channel = refundChannel || 'wallet';

    if (!['pawapay', 'xentripay', 'wallet'].includes(channel)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid refund channel. Must be "pawapay", "xentripay", or "wallet"'
      });
    }

    const result = await refundService.approveRefund({
      bookingId,
      bookingType,
      approvedBy: adminId,
      refundChannel: channel,
      notes
    });

    res.status(200).json({
      success: true,
      message: result.message
    });
  } catch (error: any) {
    console.error('[REFUND_ROUTES] Approve refund error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to approve refund'
    });
  }
});

/**
 * POST /api/refunds/reject
 * Reject a refund request (Admin only)
 */
router.post('/reject', authenticate, authorize('admin'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const adminId = parseInt(req.user!.userId);
    const { bookingId, bookingType, reason } = req.body;

    if (!bookingId || !bookingType || !reason) {
      return res.status(400).json({
        success: false,
        message: 'Booking ID, type, and rejection reason are required'
      });
    }

    if (!['property', 'tour'].includes(bookingType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid booking type'
      });
    }

    const result = await refundService.rejectRefund({
      bookingId,
      bookingType,
      rejectedBy: adminId,
      reason
    });

    res.status(200).json({
      success: true,
      message: result.message
    });
  } catch (error: any) {
    console.error('[REFUND_ROUTES] Reject refund error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to reject refund'
    });
  }
});

/**
 * POST /api/refunds/cancel-booking
 * Cancel a booking and request refund (User)
 * Combines cancellation with refund request
 */
router.post('/cancel-booking', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = parseInt(req.user!.userId);
    const { bookingId, bookingType, reason } = req.body;

    if (!bookingId || !bookingType) {
      return res.status(400).json({
        success: false,
        message: 'Booking ID and type are required'
      });
    }

    // Request refund (this also handles the cancellation)
    const result = await refundService.requestRefund({
      bookingId,
      bookingType,
      requestedBy: userId,
      reason
    });

    res.status(200).json({
      success: true,
      message: 'Booking cancellation requested. ' + result.message,
      data: {
        cancellationCalculation: result.cancellationCalc
      }
    });
  } catch (error: any) {
    console.error('[REFUND_ROUTES] Cancel booking error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to cancel booking'
    });
  }
});

export default router;
