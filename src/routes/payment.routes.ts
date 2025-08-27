import { Router } from 'express';
import { PaymentController } from '../controllers/payment.controller';
import { authenticate } from '../middleware/auth.middleware';
import { 
  validateDeposit, 
  validateWithdrawal, 
  validateTransfer,
  validateBalanceInquiry,
  rateLimitPayments,
  validateWebhookSignature,
  sanitizePaymentData,
  logPaymentRequest
} from '../middleware/payment.middleware';

const router = Router();
const paymentController = new PaymentController();

// --- PUBLIC ROUTES ---
// Webhook endpoint - must be before authentication middleware
router.post('/webhook/jenga', 
  validateWebhookSignature, 
  paymentController.handleJengaWebhook
);

// Utility endpoints (public)
router.get('/banks', paymentController.getBanks);
router.post('/validate/bank-account', paymentController.validateBankAccount);
router.post('/validate/phone-number', paymentController.validatePhoneNumber);

// --- PROTECTED ROUTES (Authentication Required) ---
router.use(authenticate); // All routes below require authentication
router.use(logPaymentRequest); // Log all payment requests
router.use(sanitizePaymentData); // Sanitize input data

// --- DEPOSIT OPERATIONS ---
router.post('/deposit', 
  rateLimitPayments, 
  validateDeposit, 
  paymentController.deposit
);

// --- WITHDRAWAL OPERATIONS ---
router.post('/withdraw', 
  rateLimitPayments, 
  validateWithdrawal, 
  paymentController.withdraw
);

// --- TRANSFER OPERATIONS ---
router.post('/transfer', 
  rateLimitPayments, 
  validateTransfer, 
  paymentController.transfer
);

// --- BALANCE OPERATIONS ---
router.post('/balance', 
  validateBalanceInquiry, 
  paymentController.getBalance
);
router.get('/wallet', paymentController.getUserWallet);

// --- TRANSACTION MANAGEMENT ---
router.get('/transactions', paymentController.getTransactionHistory);
router.get('/transactions/:id', paymentController.getTransactionById);
router.post('/transactions/:id/retry', paymentController.retryTransaction);
router.post('/transactions/:id/cancel', paymentController.cancelTransaction);

// --- USER SETTINGS & LIMITS ---
router.get('/limits', paymentController.getPaymentLimits);
router.get('/settings', paymentController.getPaymentSettings);
router.put('/settings', paymentController.updatePaymentSettings);

// --- BANK ACCOUNT MANAGEMENT ---
router.get('/bank-accounts', paymentController.getUserBankAccounts);
router.post('/bank-accounts', paymentController.addBankAccount);
router.delete('/bank-accounts/:id', paymentController.removeBankAccount);

// --- MOBILE MONEY ACCOUNT MANAGEMENT ---
router.get('/mobile-accounts', paymentController.getUserMobileMoneyAccounts);
router.post('/mobile-accounts', paymentController.addMobileMoneyAccount);

// --- ADMIN ROUTES (Would need additional admin middleware) ---
// Note: You should add admin authorization middleware before these routes
router.get('/admin/transactions', paymentController.getAllTransactions);

export default router;