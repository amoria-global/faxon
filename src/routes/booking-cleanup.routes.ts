// ============================================================================
// src/routes/booking-cleanup.routes.ts
// Routes for manual booking cleanup operations (admin only)
// ============================================================================

import { Router } from 'express';
import { BookingCleanupService } from '../services/booking-cleanup.service';
import { authenticate } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/admin.middleware';

const router = Router();
const cleanupService = new BookingCleanupService();

/**
 * POST /api/booking-cleanup/manual
 * Manually trigger cleanup of expired bookings
 * Admin only
 */
router.post('/manual', authenticate, requireAdmin, async (req, res) => {
  try {
    console.log('🔧 Manual booking cleanup triggered by admin');
    const results = await cleanupService.manualCleanup();

    res.json({
      success: true,
      message: 'Booking cleanup completed',
      results: {
        propertyBookingsRemoved: results.propertyBookingsRemoved,
        tourBookingsRemoved: results.tourBookingsRemoved,
        blockedDatesRemoved: results.blockedDatesRemoved,
        totalRemoved: results.propertyBookingsRemoved + results.tourBookingsRemoved,
        errors: results.errors
      }
    });
  } catch (error: any) {
    console.error('❌ Error in manual cleanup:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to complete booking cleanup',
      error: error.message
    });
  }
});

/**
 * GET /api/booking-cleanup/status
 * Get cleanup service status
 */
router.get('/status', authenticate, requireAdmin, async (req, res) => {
  try {
    // Calculate cutoff date
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - 24);

    res.json({
      success: true,
      status: {
        cutoffDate: cutoffDate.toISOString(),
        message: 'Bookings older than 24 hours with pending payment will be removed'
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to get cleanup status',
      error: error.message
    });
  }
});

export default router;
