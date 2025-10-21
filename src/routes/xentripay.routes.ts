// routes/xentripay.routes.ts - Regenerated with added routes for bulk admin, cancellations, payment methods, and user collections/payouts
// NOTE: Escrow functionality has been deprecated and removed

import { Router } from 'express';
import { XentriPayController } from '../controllers/xentripay.controller';
import { XentriPayService } from '../services/xentripay.service';
import { PhoneUtils } from '../utils/phone.utils';
import { authenticate, authorize } from '../middleware/auth.middleware';
import {
  rateLimitXentriPayOperations,
  rateLimitXentriPayWebhooks,
  validateXentriPayDeposit,
  validateXentriPayWithdrawal,
  validateXentriPayRefund,
  validateXentriPayRelease,
  validateTransactionId,
  validateBulkRelease,
  validateCancelEscrow,
  sanitizeXentriPayData,
  logXentriPayRequest
} from '../middleware/xentripay.middleware'; // Assume updated middleware for bulk/cancel

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

const xentriPayController = new XentriPayController(
  xentriPayService
);

// ==================== PUBLIC ROUTES ====================

// Health check endpoint
router.get('/health', xentriPayController.healthCheck);

// Configuration endpoints (public - for frontend payment choice)
router.get('/currencies', xentriPayController.getSupportedCurrencies);
router.get('/mobile-providers', xentriPayController.getSupportedMobileProviders);
router.get('/payment-methods', xentriPayController.getPaymentMethods); // Added for frontend choice

// Validation endpoints (public - useful for frontend validation)
router.post('/validate/mobile-number', xentriPayController.validateMobileNumber);
router.post('/validate/bank-account', xentriPayController.validateBankAccount);

// XentriPay webhook endpoint (must be public)
router.post(
  '/webhook',
  rateLimitXentriPayWebhooks,
  xentriPayController.handleXentriPayWebhook
);

// XentriPay callback endpoint (for payment redirects)
router.get('/callback', xentriPayController.handleXentriPayCallback);

// ==================== PROTECTED USER ROUTES ====================

// Apply authentication and logging to all protected routes
router.use(authenticate);
router.use(logXentriPayRequest);
router.use(sanitizeXentriPayData);

// === COLLECTIONS/DEPOSITS ===
router.post(
  '/deposits',
  rateLimitXentriPayOperations,
  validateXentriPayDeposit,
  xentriPayController.createDeposit
);

// === PAYOUTS/WITHDRAWALS ===
router.post(
  '/withdrawals',
  rateLimitXentriPayOperations,
  validateXentriPayWithdrawal,
  xentriPayController.createWithdrawal
);

// === TRANSACTION STATUS ===
router.get(
  '/transactions/:transactionId',
  validateTransactionId,
  xentriPayController.getTransactionStatus
);

// === ESCROW MANAGEMENT (User) ===
router.post(
  '/transactions/:transactionId/release',
  rateLimitXentriPayOperations,
  validateTransactionId,
  validateXentriPayRelease,
  xentriPayController.releaseEscrow
);

router.post(
  '/transactions/:transactionId/cancel',
  rateLimitXentriPayOperations,
  validateTransactionId,
  validateCancelEscrow,
  xentriPayController.cancelEscrow
);

// ==================== ADMIN ROUTES ====================

router.use('/admin', authorize('admin'));

// Admin bulk release for withdrawals/escrows (agents/hosts/platform)
router.post(
  '/admin/bulk-release',
  rateLimitXentriPayOperations,
  validateBulkRelease,
  xentriPayController.bulkReleaseWithdrawals
);

// Admin can perform all operations on behalf of users
router.post(
  '/admin/transactions/:transactionId/release',
  rateLimitXentriPayOperations,
  validateTransactionId,
  validateXentriPayRelease,
  xentriPayController.releaseEscrow
);

router.post(
  '/admin/transactions/:transactionId/cancel',
  rateLimitXentriPayOperations,
  validateTransactionId,
  validateCancelEscrow,
  xentriPayController.cancelEscrow
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
      const { amount = 100, phone = '0780371519', userId = 1, recipientId } = req.body;

      console.log('🧪 Testing collection with:', { amount, phone, userId, recipientId });

      const result = await xentriPayService.initiateCollection({
        email: 'test@centrika.rw',
        cname: 'Test User',
        amount: Math.round(amount),
        cnumber: PhoneUtils.formatPhone(phone, false),
        msisdn: PhoneUtils.formatPhone(phone, true),
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