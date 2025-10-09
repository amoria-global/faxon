// ============================================================================
// src/routes/booking-leads.routes.ts
// Routes for managing archived bookings (leads) - Admin only
// ============================================================================

import { Router } from 'express';
import { BookingLeadsController } from '../controllers/booking-leads.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/admin.middleware';

const router = Router();
const bookingLeadsController = new BookingLeadsController();

/**
 * All routes require authentication and admin privileges
 */
router.use(authenticate);
router.use(requireAdmin);

/**
 * GET /api/admin/booking-leads/stats
 * Get booking lead statistics
 */
router.get('/stats', bookingLeadsController.getLeadStats.bind(bookingLeadsController));

/**
 * GET /api/admin/booking-leads/export
 * Export booking leads as CSV
 */
router.get('/export', bookingLeadsController.exportLeads.bind(bookingLeadsController));

/**
 * GET /api/admin/booking-leads
 * Get all booking leads with optional filters
 */
router.get('/', bookingLeadsController.getAllLeads.bind(bookingLeadsController));

/**
 * GET /api/admin/booking-leads/:type/:leadId
 * Get a specific booking lead by ID
 */
router.get('/:type/:leadId', bookingLeadsController.getLeadById.bind(bookingLeadsController));

/**
 * PATCH /api/admin/booking-leads/:type/:leadId/status
 * Update lead status
 */
router.patch('/:type/:leadId/status', bookingLeadsController.updateLeadStatus.bind(bookingLeadsController));

/**
 * DELETE /api/admin/booking-leads/:type/:leadId
 * Delete a booking lead from archive
 */
router.delete('/:type/:leadId', bookingLeadsController.deleteLead.bind(bookingLeadsController));

export default router;
