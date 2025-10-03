// routes/xentripay.routes.ts - Corrected based on API documentation

import { Router } from 'express';
import { XentriPayController } from '../controllers/xentripay.controller';
import { XentriPayEscrowService } from '../services/xentripay-escrow.service';
import { XentriPayService } from '../services/xentripay.service';
import { BrevoMailingService } from '../utils/brevo.xentripay';
import { authenticate, authorize } from '../middleware/auth.middleware';
import {
  rateLimitXentriPayOperations,
  rateLimitXentriPayWebhooks,
  validateXentriPayDeposit,
  validateXentriPayWithdrawal,
  validateXentriPayRefund,
  validateXentriPayRelease,
  validateTransactionId,
  sanitizeXentriPayData,
  logXentriPayRequest
} from '../middleware/xentripay.middleware';

const router = Router();

// ==================== INITIALIZE SERVICES ====================

// Determine base URL based on environment
const isProduction = process.env.NODE_ENV === 'production';
const baseUrl = isProduction 
  ? 'https://xentripay.com' 
  : 'https://test.xentripay.com';

const xentriPayService = new XentriPayService({
  apiKey: process.env.XENTRIPAY_API_KEY || '',
  baseUrl: process.env.XENTRIPAY_BASE_URL || baseUrl,
  environment: isProduction ? 'production' : 'sandbox',
  timeout: 30000
});

const brevoMailingService = new BrevoMailingService();
const xentriPayEscrowService = new XentriPayEscrowService(
  xentriPayService, 
  brevoMailingService
);
const xentriPayController = new XentriPayController(
  xentriPayEscrowService, 
  xentriPayService
);

// ==================== PUBLIC ROUTES ====================

// Health check endpoint
router.get('/health', xentriPayController.healthCheck);

// XentriPay webhook endpoint (must be public)
router.post(
  '/webhook',
  rateLimitXentriPayWebhooks,
  xentriPayController.handleXentriPayWebhook
);

// XentriPay callback endpoint (for payment redirects)
router.get('/callback', xentriPayController.handleXentriPayCallback);

// Configuration endpoints (public)
router.get('/currencies', xentriPayController.getSupportedCurrencies);
router.get('/mobile-providers', xentriPayController.getSupportedMobileProviders);

// Validation endpoints (public - useful for frontend validation)
router.post('/validate/mobile-number', xentriPayController.validateMobileNumber);
router.post('/validate/bank-account', xentriPayController.validateBankAccount);

// ==================== PROTECTED USER ROUTES ====================

// Apply authentication and logging to all protected routes
router.use(authenticate);
router.use(logXentriPayRequest);
router.use(sanitizeXentriPayData);

// === DEPOSIT OPERATIONS (Escrow Creation) ===
router.post(
  '/deposits',
  rateLimitXentriPayOperations,
  validateXentriPayDeposit,
  xentriPayController.createDeposit
);

// === TRANSACTION STATUS ===
router.get(
  '/transactions/:transactionId',
  validateTransactionId,
  xentriPayController.getTransactionStatus
);

// === ESCROW MANAGEMENT ===
router.post(
  '/transactions/:transactionId/release',
  rateLimitXentriPayOperations,
  validateTransactionId,
  validateXentriPayRelease,
  xentriPayController.releaseEscrow
);

router.post(
  '/transactions/:transactionId/refund',
  rateLimitXentriPayOperations,
  validateTransactionId,
  validateXentriPayRefund,
  xentriPayController.processRefund
);

// === WITHDRAWAL OPERATIONS ===
router.post(
  '/withdrawals',
  rateLimitXentriPayOperations,
  validateXentriPayWithdrawal,
  xentriPayController.createWithdrawal
);

// ==================== ADMIN ROUTES ====================

router.use('/admin', authorize('admin'));

// Admin can perform all operations on behalf of users
router.post(
  '/admin/transactions/:transactionId/release',
  rateLimitXentriPayOperations,
  validateTransactionId,
  validateXentriPayRelease,
  xentriPayController.releaseEscrow
);

router.post(
  '/admin/transactions/:transactionId/refund',
  rateLimitXentriPayOperations,
  validateTransactionId,
  validateXentriPayRefund,
  xentriPayController.processRefund
);

// ==================== TEST/DEBUG ROUTES ====================

// Test route for XentriPay connectivity (only in non-production)
if (!isProduction) {
  router.get('/test-connection', async (req, res) => {
    try {
      console.log('\n🔍 Testing XentriPay Connection...\n');
      
      console.log('Config Check:');
      console.log('- API Key:', process.env.XENTRIPAY_API_KEY ? '✅ SET' : '❌ NOT SET');
      console.log('- Base URL:', baseUrl);
      console.log('- Environment:', process.env.NODE_ENV || 'development');
      
      // Test health check
      const isHealthy = await xentriPayService.healthCheck();
      
      res.json({
        success: true,
        message: 'XentriPay connection test successful',
        data: {
          connected: isHealthy,
          provider: 'xentripay',
          version: '2.0',
          environment: process.env.NODE_ENV || 'development',
          baseUrl: baseUrl,
          apiKeyConfigured: !!process.env.XENTRIPAY_API_KEY
        }
      });
    } catch (error: any) {
      console.error('❌ Test failed:', error);
      res.status(500).json({
        success: false,
        message: 'Test failed',
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  });

  // Test collection endpoint
  router.post('/test-collection', authenticate, async (req, res) => {
    try {
      const { amount = 100, phone = '0780371519' } = req.body;

      console.log('🧪 Testing collection with:', { amount, phone });

      const result = await xentriPayService.initiateCollection({
        email: 'test@centrika.rw',
        cname: 'Test User',
        amount: Math.round(amount),
        cnumber: xentriPayService.formatPhoneNumber(phone, false),
        msisdn: xentriPayService.formatPhoneNumber(phone, true),
        currency: 'RWF',
        pmethod: 'momo',
        chargesIncluded: 'true'
      });

      res.json({
        success: true,
        message: 'Test collection initiated',
        data: result
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
}

// ==================== ERROR HANDLING ====================

router.use((error: any, req: any, res: any, next: any) => {
  console.error('[XENTRIPAY-ROUTES] Error:', error);
  
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

export default router;