// routes/escrow.routes.ts
import { Router } from 'express';
import { EscrowController } from '../controllers/escrow.controller';
import { EscrowService } from '../services/escrow.service';
import { PesapalService } from '../services/pesapal.service';
import { EmailService } from '../services/email.service';
import { authenticate, authorize } from '../middleware/auth.middleware';
import {
  rateLimitEscrowOperations,
  rateLimitWebhooks,
  validateDeposit,
  validateWithdrawal,
  validateRefund,
  validateRelease,
  validateTransactionId,
  validatePesapalWebhook,
  ipWhitelist,
  sanitizeEscrowData,
  logEscrowRequest
} from '../middleware/escrow.middleware';
import config from '../config/config';

const router = Router();

// Initialize services
const pesapalService = new PesapalService({
  consumerKey: config.pesapal.consumerKey,
  consumerSecret: config.pesapal.consumerSecret,
  baseUrl: config.pesapal.baseUrl,
  environment: config.pesapal.environment,
  timeout: config.pesapal.timeout,
  retryAttempts: config.pesapal.retryAttempts,
  webhookSecret: config.pesapal.webhookSecret,
  callbackUrl: config.pesapal.callbackUrl,
  defaultCurrency: config.escrow.defaultCurrency,
  merchantAccount: config.pesapal.merchantAccount
});

const emailService = new EmailService();
const escrowService = new EscrowService(pesapalService, emailService);
const escrowController = new EscrowController(escrowService, pesapalService);

// ==================== PUBLIC ROUTES ====================

// Health check endpoint
router.get('/health', escrowController.healthCheck);

// Pesapal webhook endpoint (must be public)
router.post(
  '/webhook/pesapal',
  rateLimitWebhooks,
  ipWhitelist,
  validatePesapalWebhook,
  escrowController.handlePesapalWebhook
);

// Pesapal callback endpoint (for payment redirects)
router.get('/callback', escrowController.handlePesapalCallback);

// Configuration endpoints (public)
router.get('/currencies', escrowController.getSupportedCurrencies);
router.get('/mobile-providers', escrowController.getSupportedMobileProviders);

// Validation endpoints (public)
router.post('/validate/mobile-number', escrowController.validateMobileNumber);
router.post('/validate/bank-account', escrowController.validateBankAccount);

// Public transaction lookup by reference
router.get(
  '/transactions/reference/:reference',
  escrowController.getTransactionByReference
);

// Public status check by reference (for payment status page)
router.get(
  '/transactions/reference/:reference/status',
  escrowController.checkStatusByReference
);

// ==================== PROTECTED USER ROUTES ====================
router.use(authenticate);
router.use(logEscrowRequest);
router.use(sanitizeEscrowData);

// === DEPOSIT OPERATIONS ===
router.post(
  '/deposits',
  rateLimitEscrowOperations,
  validateDeposit,
  escrowController.createDeposit
);

// === ESCROW MANAGEMENT ===
router.post(
  '/transactions/:transactionId/release',
  rateLimitEscrowOperations,
  validateTransactionId,
  validateRelease,
  escrowController.releaseEscrow
);

router.post(
  '/transactions/:transactionId/refund',
  rateLimitEscrowOperations,
  validateTransactionId,
  validateRefund,
  escrowController.processRefund
);

// === STATUS CHECKING ===
router.post(
  '/transactions/:transactionId/check-status',
  validateTransactionId,
  escrowController.checkTransactionStatus
);

// === WITHDRAWAL OPERATIONS ===
router.post(
  '/withdrawals',
  rateLimitEscrowOperations,
  validateWithdrawal,
  escrowController.createWithdrawal
);

// === TRANSACTION QUERIES ===
router.get(
  '/transactions/:transactionId',
  validateTransactionId,
  escrowController.getTransaction
);

router.get('/transactions', escrowController.getUserTransactions);

// === WALLET OPERATIONS ===
router.get('/wallet', escrowController.getUserWallet);

// ==================== ADMIN ROUTES ====================
router.use('/admin', authorize('admin'));

// Transaction management
router.get('/admin/transactions', escrowController.getAllTransactions);
router.get('/admin/stats', escrowController.getTransactionStats);

router.post(
  '/admin/transactions/:transactionId/release',
  rateLimitEscrowOperations,
  validateTransactionId,
  validateRelease,
  escrowController.adminReleaseEscrow
);

// Admin status checking
router.post(
  '/admin/transactions/:transactionId/check-status',
  validateTransactionId,
  escrowController.checkTransactionStatus
);

// IPN management
router.post('/admin/ipn/register', escrowController.forceIPNRegistration);
router.get('/admin/ipn/info', escrowController.getIPNInfo);

// ==================== ERROR HANDLING ====================
router.use((error: any, req: any, res: any, next: any) => {
  console.error('Escrow route error:', error);
  
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: error.message,
        timestamp: new Date().toISOString()
      }
    });
  }

  if (error.name === 'UnauthorizedError') {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
        timestamp: new Date().toISOString()
      }
    });
  }

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
      timestamp: new Date().toISOString()
    }
  });
});

// Test route for Pesapal authentication
router.get('/test-pesapal-auth', async (req, res) => {
  try {
    console.log('\n🔍 Testing Pesapal Authentication...\n');
    
    console.log('Config Check:');
    console.log('- Consumer Key:', config.pesapal.consumerKey ? '✅ SET' : '❌ NOT SET');
    console.log('- Consumer Secret:', config.pesapal.consumerSecret ? '✅ SET' : '❌ NOT SET');
    console.log('- Base URL:', config.pesapal.baseUrl);
    console.log('- Environment:', config.pesapal.environment);
    
    // Test IPN registration
    let ipnId;
    try {
      ipnId = await pesapalService.forceRegisterIPN();
    } catch (ipnError: any) {
      return res.status(500).json({
        success: false,
        message: 'Authentication successful but IPN registration failed',
        error: ipnError.message
      });
    }
    
    res.json({
      success: true,
      message: 'Pesapal authentication and IPN registration successful',
      data: {
        authenticated: true,
        ipnRegistered: true,
        ipnId,
        environment: config.pesapal.environment,
        baseUrl: config.pesapal.baseUrl
      }
    });
  } catch (error: any) {
    console.error('Test failed:', error);
    res.status(500).json({
      success: false,
      message: 'Test failed',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

export default router;