// routes/unified-transaction.routes.ts - Unified transaction routes with wallet & withdrawal management

import { Router } from 'express';
import { unifiedTransactionController } from '../controllers/unified-transaction.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// ==================== UNIFIED PAYMENT ENDPOINTS ====================

/**
 * @route POST /api/transactions/deposit
 * @desc Unified deposit endpoint - routes based on payment method
 * @body paymentMethod - "momo" (mobile money via PawaPay), "card" (card via XentriPay), or "property" (pay at property)
 * @body amount - Amount in USD (will be converted to RWF)
 *
 * For Mobile Money (momo):
 * @body phoneNumber - Required
 * @body provider - Mobile provider (MTN_RWANDA, AIRTEL_RWANDA)
 * @body country - Country code (default: RW)
 * @body description - Optional
 * @body internalReference - Optional booking/transaction reference
 * @body metadata - Optional additional data
 *
 * For Card Payment (card):
 * @body email - Required
 * @body customerName - Customer's full name
 * @body phoneNumber - Optional (for contact)
 * @body description - Optional
 * @body internalReference - Optional booking/transaction reference
 * @body metadata - Optional additional data
 *
 * For Property Payment (property):
 * @body amount - Required
 * @body internalReference - Required (booking ID)
 * @body email - Optional
 * @body customerName - Optional
 * @body phoneNumber - Optional
 * @body description - Optional
 * @body metadata - Optional additional data
 *
 * @access Protected - Requires authentication (JWT token in Authorization header)
 * @header Authorization - Bearer <token>
 *
 * @example Mobile Money
 * {
 *   "paymentMethod": "momo",
 *   "amount": 100,
 *   "phoneNumber": "0788123456",
 *   "provider": "MTN_RWANDA",
 *   "country": "RW",
 *   "description": "Booking payment",
 *   "internalReference": "BOOKING-123"
 * }
 *
 * @example Card Payment
 * {
 *   "paymentMethod": "card",
 *   "amount": 100,
 *   "email": "user@example.com",
 *   "customerName": "John Doe",
 *   "phoneNumber": "0788123456",
 *   "description": "Booking payment",
 *   "internalReference": "BOOKING-123"
 * }
 *
 * @example Property Payment
 * {
 *   "paymentMethod": "property",
 *   "amount": 100,
 *   "email": "user@example.com",
 *   "customerName": "John Doe",
 *   "phoneNumber": "0788123456",
 *   "description": "Booking payment",
 *   "internalReference": "BOOKING-123"
 * }
 */
router.post('/deposit', authenticate, (req, res) => unifiedTransactionController.initiateUnifiedDeposit(req, res));

// ==================== WALLET & BALANCE ====================

/**
 * @route GET /api/transactions/wallet/:userId
 * @desc Get user wallet balance and information
 * @access Public (add auth middleware as needed)
 */
router.get('/wallet/:userId', (req, res) => unifiedTransactionController.getUserWallet(req, res));

/**
 * @route GET /api/transactions/wallet/:userId/history
 * @desc Get wallet transaction history
 * @access Public (add auth middleware as needed)
 */
router.get('/wallet/:userId/history', (req, res) => unifiedTransactionController.getWalletHistory(req, res));

// ==================== WITHDRAWAL METHODS ====================

/**
 * @route GET /api/transactions/withdrawal-methods/available
 * @desc Get available PawaPay withdrawal methods for a country
 * @query country - ISO 3166-1 alpha-3 country code (default: RWA)
 * @access Public
 */
router.get('/withdrawal-methods/available', (req, res) => unifiedTransactionController.getAvailableWithdrawalMethods(req, res));

/**
 * @route GET /api/transactions/withdrawal-methods/rwanda
 * @desc Get Rwanda-specific withdrawal providers (MTN, Airtel)
 * @access Public
 */
router.get('/withdrawal-methods/rwanda', (req, res) => unifiedTransactionController.getRwandaWithdrawalMethods(req, res));

/**
 * @route GET /api/transactions/withdrawal-methods/:userId
 * @desc Get user's saved withdrawal methods
 * @access Public (add auth middleware as needed)
 */
router.get('/withdrawal-methods/:userId', (req, res) => unifiedTransactionController.getWithdrawalMethods(req, res));

/**
 * @route POST /api/transactions/withdrawal-methods
 * @desc Add a new withdrawal method
 * @access Public (add auth middleware as needed)
 */
router.post('/withdrawal-methods', (req, res) => unifiedTransactionController.addWithdrawalMethod(req, res));

/**
 * @route PUT /api/transactions/withdrawal-methods/:id
 * @desc Update withdrawal method
 * @access Public (add auth middleware as needed)
 */
router.put('/withdrawal-methods/:id', (req, res) => unifiedTransactionController.updateWithdrawalMethod(req, res));

/**
 * @route DELETE /api/transactions/withdrawal-methods/:id
 * @desc Delete withdrawal method
 * @access Public (add auth middleware as needed)
 */
router.delete('/withdrawal-methods/:id', (req, res) => unifiedTransactionController.deleteWithdrawalMethod(req, res));

/**
 * @route PUT /api/transactions/withdrawal-methods/:id/set-default
 * @desc Set default withdrawal method
 * @access Public (add auth middleware as needed)
 */
router.put('/withdrawal-methods/:id/set-default', (req, res) => unifiedTransactionController.setDefaultWithdrawalMethod(req, res));

// ==================== ADMIN: WITHDRAWAL METHOD APPROVAL ====================

/**
 * @route GET /api/transactions/withdrawal-methods/pending/all
 * @desc Get all pending withdrawal methods (admin only)
 * @access Admin
 */
router.get('/withdrawal-methods/pending/all', (req, res) => unifiedTransactionController.getPendingWithdrawalMethods(req, res));

/**
 * @route POST /api/transactions/withdrawal-methods/:id/approve
 * @desc Approve a withdrawal method (admin only)
 * @body adminId - ID of admin approving the method
 * @access Admin
 */
router.post('/withdrawal-methods/:id/approve', (req, res) => unifiedTransactionController.approveWithdrawalMethod(req, res));

/**
 * @route POST /api/transactions/withdrawal-methods/:id/reject
 * @desc Reject a withdrawal method (admin only)
 * @body adminId - ID of admin rejecting the method
 * @body reason - Reason for rejection
 * @access Admin
 */
router.post('/withdrawal-methods/:id/reject', (req, res) => unifiedTransactionController.rejectWithdrawalMethod(req, res));

// ==================== ACCOUNT INFORMATION ====================

/**
 * @route GET /api/transactions/account/:userId
 * @desc Get user account information (wallet + withdrawal methods + basic info)
 * @access Public (add auth middleware as needed)
 */
router.get('/account/:userId', (req, res) => unifiedTransactionController.getAccountInfo(req, res));

// ==================== TRANSACTIONS ====================

/**
 * @route GET /api/transactions/stats
 * @desc Get transaction statistics
 * @access Public (add auth middleware as needed)
 */
router.get('/stats', (req, res) => unifiedTransactionController.getTransactionStats(req, res));

/**
 * @route GET /api/transactions/user/:userId
 * @desc Get all transactions for a specific user
 * @access Public (add auth middleware as needed)
 */
router.get('/user/:userId', (req, res) => unifiedTransactionController.getTransactionsByUserId(req, res));

/**
 * @route GET /api/transactions/recipient/:recipientId
 * @desc Get all transactions for a specific recipient
 * @access Public (add auth middleware as needed)
 */
router.get('/recipient/:recipientId', (req, res) => unifiedTransactionController.getTransactionsByRecipientId(req, res));

/**
 * @route GET /api/transactions/:id
 * @desc Get single transaction by ID
 * @access Public (add auth middleware as needed)
 */
router.get('/:id', (req, res) => unifiedTransactionController.getTransactionById(req, res));

/**
 * @route GET /api/transactions
 * @desc Get all transactions with optional filters
 * @access Public (add auth middleware as needed)
 */
router.get('/', (req, res) => unifiedTransactionController.getAllTransactions(req, res));

// ==================== PROPERTY PAYMENT COLLECTION ====================

/**
 * @route POST /api/transactions/property-payment/collect/:bookingId
 * @desc Mark property payment as collected (host/owner only)
 * @body collectedBy - ID of host/admin who collected payment
 * @body collectedAmount - Amount collected in RWF (optional, defaults to booking total)
 * @access Host/Owner
 *
 * @example
 * {
 *   "collectedBy": 123,
 *   "collectedAmount": 50000
 * }
 */
router.post('/property-payment/collect/:bookingId', (req, res) => unifiedTransactionController.collectPropertyPayment(req, res));

/**
 * @route GET /api/transactions/property-payments/pending/:hostId
 * @desc Get pending property payments for a host
 * @access Host/Owner
 */
router.get('/property-payments/pending/:hostId', (req, res) => unifiedTransactionController.getPendingPropertyPayments(req, res));

export default router;
