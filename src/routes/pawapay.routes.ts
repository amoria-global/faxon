// routes/pawapay.routes.ts - PawaPay API Routes

import { Router } from 'express';
import { pawaPayController } from '../controllers/pawapay.controller';
import { authenticate } from '../middleware/auth.middleware';
import { adminOnly } from '../middleware/auth.middleware';
import { ensurePawaPayConfigured, logPawaPayRequest } from '../middleware/pawapay.middleware';

const router = Router();

// Apply PawaPay configuration check and logging to all routes
router.use(ensurePawaPayConfigured);
router.use(logPawaPayRequest);

// ==================== PUBLIC ROUTES ====================

/**
 * GET /api/pawapay/providers/:country
 * Get available providers for a specific country
 */
router.get('/providers/:country', pawaPayController.getAvailableProviders.bind(pawaPayController));

/**
 * GET /api/pawapay/config
 * Get active PawaPay configuration
 */
router.get('/config', pawaPayController.getActiveConfiguration.bind(pawaPayController));

// ==================== AUTHENTICATED USER ROUTES ====================

/**
 * POST /api/pawapay/deposit
 * Initiate a deposit (money in)
 * Requires authentication
 */
router.post('/deposit', authenticate, pawaPayController.initiateDeposit.bind(pawaPayController));

/**
 * GET /api/pawapay/deposit/:depositId
 * Get deposit status
 * Requires authentication
 */
router.get('/deposit/:depositId', authenticate, pawaPayController.getDepositStatus.bind(pawaPayController));

/**
 * POST /api/pawapay/payout
 * Initiate a payout (money out)
 * Requires authentication
 */
router.post('/payout', authenticate, pawaPayController.initiatePayout.bind(pawaPayController));

/**
 * GET /api/pawapay/payout/:payoutId
 * Get payout status
 * Requires authentication
 */
router.get('/payout/:payoutId', authenticate, pawaPayController.getPayoutStatus.bind(pawaPayController));

/**
 * POST /api/pawapay/refund
 * Initiate a refund
 * Requires authentication
 */
router.post('/refund', authenticate, pawaPayController.initiateRefund.bind(pawaPayController));

/**
 * GET /api/pawapay/refund/:refundId
 * Get refund status
 * Requires authentication
 */
router.get('/refund/:refundId', authenticate, pawaPayController.getRefundStatus.bind(pawaPayController));

// ==================== ADMIN ROUTES ====================

/**
 * POST /api/pawapay/admin/bulk-payout
 * Initiate bulk payouts
 * Requires admin authentication
 */
router.post('/admin/bulk-payout', authenticate, adminOnly, pawaPayController.initiateBulkPayout.bind(pawaPayController));

/**
 * GET /api/pawapay/admin/transactions
 * Get transaction history with filters
 * Requires admin authentication
 */
router.get('/admin/transactions', authenticate, adminOnly, pawaPayController.getTransactionHistory.bind(pawaPayController));

/**
 * GET /api/pawapay/admin/stats
 * Get transaction statistics
 * Requires admin authentication
 */
router.get('/admin/stats', authenticate, adminOnly, pawaPayController.getTransactionStats.bind(pawaPayController));

/**
 * POST /api/pawapay/admin/resend-callback/:transactionId
 * Resend callback for a specific transaction
 * Requires admin authentication
 */
router.post('/admin/resend-callback/:transactionId', authenticate, adminOnly, pawaPayController.resendCallback.bind(pawaPayController));

export default router;
