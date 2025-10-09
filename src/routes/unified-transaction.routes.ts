// routes/unified-transaction.routes.ts - Unified transaction routes

import { Router } from 'express';
import { unifiedTransactionController } from '../controllers/unified-transaction.controller';

const router = Router();

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
