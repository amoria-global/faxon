// routes/payment-distribution.routes.ts - Admin routes for payment distribution

import { Router } from 'express';
import { paymentDistributionController } from '../controllers/payment-distribution.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// All routes require authentication and admin privileges
// Note: Add admin authorization middleware as needed

/**
 * GET /api/admin/payment-distribution/check
 * Check for undistributed completed payments
 */
router.get(
  '/check',
  authenticate,
  // Add admin middleware here: requireAdmin,
  (req, res) => paymentDistributionController.checkUndistributedPayments(req, res)
);

/**
 * GET /api/admin/payment-distribution/stats
 * Get distribution statistics
 */
router.get(
  '/stats',
  authenticate,
  // Add admin middleware here: requireAdmin,
  (req, res) => paymentDistributionController.getDistributionStats(req, res)
);

/**
 * POST /api/admin/payment-distribution/distribute/property/:bookingId
 * Manually distribute wallet for a specific property booking
 */
router.post(
  '/distribute/property/:bookingId',
  authenticate,
  // Add admin middleware here: requireAdmin,
  (req, res) => paymentDistributionController.distributePropertyBooking(req, res)
);

/**
 * POST /api/admin/payment-distribution/distribute/tour/:bookingId
 * Manually distribute wallet for a specific tour booking
 */
router.post(
  '/distribute/tour/:bookingId',
  authenticate,
  // Add admin middleware here: requireAdmin,
  (req, res) => paymentDistributionController.distributeTourBooking(req, res)
);

/**
 * POST /api/admin/payment-distribution/distribute/all
 * Batch distribute all undistributed payments
 * WARNING: This can be time-consuming for large volumes
 */
router.post(
  '/distribute/all',
  authenticate,
  // Add admin middleware here: requireAdmin,
  (req, res) => paymentDistributionController.distributeAll(req, res)
);

export default router;
