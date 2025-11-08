// routes/unified-transaction.routes.ts - Unified transaction routes with wallet & withdrawal management

import { Router } from 'express';
import { unifiedTransactionController } from '../controllers/unified-transaction.controller';
import { authenticate } from '../middleware/auth.middleware';
import {
  authorizeOwnTransactions,
  authorizeOwnWallet,
  authorizeOwnWithdrawalMethods,
  authorizeAdmin,
  authorizeTransactionById
} from '../middleware/transaction-auth.middleware';

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
 * @access Protected - User can only access their own wallet
 */
router.get('/wallet/:userId', authenticate, authorizeOwnWallet, (req, res) => unifiedTransactionController.getUserWallet(req, res));

/**
 * @route GET /api/transactions/wallet/:userId/history
 * @desc Get wallet transaction history
 * @access Protected - User can only access their own wallet history
 */
router.get('/wallet/:userId/history', authenticate, authorizeOwnWallet, (req, res) => unifiedTransactionController.getWalletHistory(req, res));

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
 * @access Protected - User can only access their own withdrawal methods
 */
router.get('/withdrawal-methods/:userId', authenticate, authorizeOwnWithdrawalMethods, (req, res) => unifiedTransactionController.getWithdrawalMethods(req, res));

/**
 * @route POST /api/transactions/withdrawal-methods
 * @desc Add a new withdrawal method
 * @access Protected - User can only add methods for themselves
 */
router.post('/withdrawal-methods', authenticate, authorizeOwnWithdrawalMethods, (req, res) => unifiedTransactionController.addWithdrawalMethod(req, res));

/**
 * @route PUT /api/transactions/withdrawal-methods/:id
 * @desc Update withdrawal method
 * @access Protected - User can only update their own methods
 */
router.put('/withdrawal-methods/:id', authenticate, authorizeOwnWithdrawalMethods, (req, res) => unifiedTransactionController.updateWithdrawalMethod(req, res));

/**
 * @route DELETE /api/transactions/withdrawal-methods/:id
 * @desc Delete withdrawal method
 * @access Protected - User can only delete their own methods
 */
router.delete('/withdrawal-methods/:id', authenticate, authorizeOwnWithdrawalMethods, (req, res) => unifiedTransactionController.deleteWithdrawalMethod(req, res));

/**
 * @route PUT /api/transactions/withdrawal-methods/:id/set-default
 * @desc Set default withdrawal method
 * @access Protected - User can only set default for their own methods
 */
router.put('/withdrawal-methods/:id/set-default', authenticate, authorizeOwnWithdrawalMethods, (req, res) => unifiedTransactionController.setDefaultWithdrawalMethod(req, res));

// ==================== ADMIN: WITHDRAWAL METHOD APPROVAL ====================

/**
 * @route GET /api/transactions/withdrawal-methods/pending/all
 * @desc Get all pending withdrawal methods (admin only)
 * @access Admin only
 */
router.get('/withdrawal-methods/pending/all', authenticate, authorizeAdmin, (req, res) => unifiedTransactionController.getPendingWithdrawalMethods(req, res));

/**
 * @route POST /api/transactions/withdrawal-methods/:id/approve
 * @desc Approve a withdrawal method (admin only)
 * @body adminId - ID of admin approving the method
 * @access Admin only
 */
router.post('/withdrawal-methods/:id/approve', authenticate, authorizeAdmin, (req, res) => unifiedTransactionController.approveWithdrawalMethod(req, res));

/**
 * @route POST /api/transactions/withdrawal-methods/:id/reject
 * @desc Reject a withdrawal method (admin only)
 * @body adminId - ID of admin rejecting the method
 * @body reason - Reason for rejection
 * @access Admin only
 */
router.post('/withdrawal-methods/:id/reject', authenticate, authorizeAdmin, (req, res) => unifiedTransactionController.rejectWithdrawalMethod(req, res));

// ==================== ACCOUNT INFORMATION ====================

/**
 * @route GET /api/transactions/account/:userId
 * @desc Get user account information (wallet + withdrawal methods + basic info)
 * @access Protected - User can only access their own account
 */
router.get('/account/:userId', authenticate, authorizeOwnWallet, (req, res) => unifiedTransactionController.getAccountInfo(req, res));

// ==================== TRANSACTIONS ====================

/**
 * @route GET /api/transactions/stats
 * @desc Get transaction statistics
 * @access Protected - Shows stats for authenticated user only (or all if admin)
 */
router.get('/stats', authenticate, authorizeOwnTransactions, (req, res) => unifiedTransactionController.getTransactionStats(req, res));

/**
 * @route GET /api/transactions/user/:userId
 * @desc Get all transactions for a specific user
 * @access Protected - User can only access their own transactions
 */
router.get('/user/:userId', authenticate, authorizeOwnTransactions, (req, res) => unifiedTransactionController.getTransactionsByUserId(req, res));

/**
 * @route GET /api/transactions/recipient/:recipientId
 * @desc Get all transactions for a specific recipient
 * @access Protected - User can only access their own received transactions
 */
router.get('/recipient/:recipientId', authenticate, authorizeOwnTransactions, (req, res) => unifiedTransactionController.getTransactionsByRecipientId(req, res));

/**
 * @route GET /api/transactions/:id
 * @desc Get single transaction by ID
 * @access Protected - User must be involved in the transaction
 */
router.get('/:id', authenticate, authorizeTransactionById, (req, res) => unifiedTransactionController.getTransactionById(req, res));

/**
 * @route GET /api/transactions
 * @desc Get all transactions with optional filters
 * @access Protected - Shows authenticated user's transactions only (or all if admin)
 */
router.get('/', authenticate, (req, res) => unifiedTransactionController.getAllTransactions(req, res));

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
