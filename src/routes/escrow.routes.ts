// routes/escrow.routes.ts

import { Router } from 'express';
import { EscrowController } from '../controllers/escrow.controller';
import { EscrowService } from '../services/escrow.service';
import { PesapalService } from '../services/pesapal.service';
import { authenticate } from '../middleware/auth.middleware';
import {
  // Rate limiting
  rateLimitEscrowOperations,
  rateLimitWebhooks,
  
  // Validation middleware
  validateDeposit,
  validateWithdrawal,
  validateRefund,
  validateRelease,
  validateTransactionId,
  
  // Security middleware
  validatePesapalWebhook,
  ipWhitelist,
  sanitizeEscrowData,
  logEscrowRequest
} from '../middleware/escrow.middleware';
import { config } from '../config/config';
import { EmailService } from '../services/email.service';

const router = Router();

// Initialize services
const pesapalService = new PesapalService({
  consumerKey: config.pesapal.consumerKey,
  consumerSecret: config.pesapal.consumerSecret,
  baseUrl: config.pesapal.baseUrl,
  environment: config.pesapal.environment,
  timeout: 30000,
  retryAttempts: 3,
  webhookSecret: config.pesapal.webhookSecret,
  callbackUrl: config.pesapal.callbackUrl,
  defaultCurrency: 'RWF',
  merchantAccount: config.pesapal.merchantAccount
});

const emailService = new EmailService();
const escrowService = new EscrowService(pesapalService, emailService);
const escrowController = new EscrowController(escrowService, pesapalService);

// === PUBLIC ROUTES ===

// Health check endpoint
router.get('/health', escrowController.healthCheck);

// Pesapal webhook endpoint (must be public)
router.post('/webhook/pesapal',
  rateLimitWebhooks,
  ipWhitelist,
  validatePesapalWebhook,
  escrowController.handlePesapalWebhook
);

// Pesapal callback endpoint (for payment redirects)
router.get('/callback',
  escrowController.handlePesapalCallback
);

// Configuration endpoints (public)
router.get('/currencies', escrowController.getSupportedCurrencies);
router.get('/mobile-providers', escrowController.getSupportedMobileProviders);

// Validation endpoints (public)
router.post('/validate/mobile-number', escrowController.validateMobileNumber);
router.post('/validate/bank-account', escrowController.validateBankAccount);

// === PROTECTED ROUTES ===
// All routes below require authentication
router.use(authenticate);
router.use(logEscrowRequest);
router.use(sanitizeEscrowData);

// === DEPOSIT OPERATIONS ===

router.post('/deposits',
  rateLimitEscrowOperations,
  validateDeposit,
  escrowController.createDeposit
);

// === ESCROW MANAGEMENT ===

// Release escrow funds
router.post('/transactions/:transactionId/release',
  rateLimitEscrowOperations,
  validateTransactionId,
  validateRelease,
  escrowController.releaseEscrow
);

// Process refunds
router.post('/transactions/:transactionId/refund',
  rateLimitEscrowOperations,
  validateTransactionId,
  validateRefund,
  escrowController.processRefund
);

// === WITHDRAWAL OPERATIONS ===

router.post('/withdrawals',
  rateLimitEscrowOperations,
  validateWithdrawal,
  escrowController.createWithdrawal
);

// === TRANSACTION QUERIES ===

// Get specific transaction
router.get('/transactions/:transactionId',
  validateTransactionId,
  escrowController.getTransaction
);

// Get user's transactions
router.get('/transactions',
  escrowController.getUserTransactions
);

// === WALLET OPERATIONS ===

router.get('/wallet',
  escrowController.getUserWallet
);

// === ADMIN ROUTES ===
// Note: These routes require additional admin middleware in production

// Get all transactions (admin only)
router.get('/admin/transactions',
  escrowController.getAllTransactions
);

// Admin release escrow (emergency cases)
router.post('/admin/transactions/:transactionId/release',
  rateLimitEscrowOperations,
  validateTransactionId,
  validateRelease,
  escrowController.adminReleaseEscrow
);

// === ANALYTICS & REPORTING ROUTES ===

// User transaction summary
router.get('/analytics/summary', async (req, res) => {
  try {
    // TODO: Implement analytics service
    res.status(501).json({
      success: false,
      message: 'Analytics feature coming soon'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'ANALYTICS_ERROR',
        message: error.message,
        timestamp: new Date().toISOString()
      }
    });
  }
});

// Platform statistics (admin only)
router.get('/admin/analytics/platform', async (req, res) => {
  try {
    // TODO: Implement platform analytics
    res.status(501).json({
      success: false,
      message: 'Platform analytics feature coming soon'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'ANALYTICS_ERROR',
        message: error.message,
        timestamp: new Date().toISOString()
      }
    });
  }
});

// === FUTURE FEATURES (PLACEHOLDERS) ===

// Recurring payments
router.post('/recurring', async (req, res) => {
  res.status(501).json({
    success: false,
    message: 'Recurring payments feature coming soon'
  });
});

// Bulk operations
router.post('/bulk/deposits', async (req, res) => {
  res.status(501).json({
    success: false,
    message: 'Bulk deposits feature coming soon'
  });
});

// Dispute management
router.post('/transactions/:transactionId/dispute', async (req, res) => {
  res.status(501).json({
    success: false,
    message: 'Dispute management feature coming soon'
  });
});

// Payment links
router.post('/payment-links', async (req, res) => {
  res.status(501).json({
    success: false,
    message: 'Payment links feature coming soon'
  });
});

// === ERROR HANDLING MIDDLEWARE ===

router.use((error: any, req: any, res: any, next: any) => {
  console.error('Escrow route error:', error);
  
  // Handle specific error types
  if (error.name === 'ValidationError') {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: error.message,
        timestamp: new Date().toISOString()
      }
    });
    return;
  }

  if (error.name === 'UnauthorizedError') {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
        timestamp: new Date().toISOString()
      }
    });
    return;
  }

  // Generic error response
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
      timestamp: new Date().toISOString()
    }
  });
});

export default router;