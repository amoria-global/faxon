// routes/unified-transaction.routes.ts - Unified transaction routes with wallet & withdrawal management

import { Router } from 'express';
import { unifiedTransactionController } from '../controllers/unified-transaction.controller';

const router = Router();

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

export default router;
