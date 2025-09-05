"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const payment_controller_1 = require("../controllers/payment.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const payment_middleware_1 = require("../middleware/payment.middleware");
const router = (0, express_1.Router)();
const paymentController = new payment_controller_1.PaymentController();
// --- PUBLIC ROUTES ---
// Webhook endpoint - must be before authentication middleware
router.post('/webhook/jenga', payment_middleware_1.validateWebhookSignature, paymentController.handleJengaWebhook);
// Utility endpoints (public)
router.get('/banks', paymentController.getBanks);
router.post('/validate/bank-account', paymentController.validateBankAccount);
router.post('/validate/phone-number', paymentController.validatePhoneNumber);
// --- PROTECTED ROUTES (Authentication Required) ---
router.use(auth_middleware_1.authenticate); // All routes below require authentication
router.use(payment_middleware_1.logPaymentRequest); // Log all payment requests
router.use(payment_middleware_1.sanitizePaymentData); // Sanitize input data
// --- DEPOSIT OPERATIONS ---
router.post('/deposit', payment_middleware_1.rateLimitPayments, payment_middleware_1.validateDeposit, paymentController.deposit);
// --- WITHDRAWAL OPERATIONS ---
router.post('/withdraw', payment_middleware_1.rateLimitPayments, payment_middleware_1.validateWithdrawal, paymentController.withdraw);
// --- TRANSFER OPERATIONS ---
router.post('/transfer', payment_middleware_1.rateLimitPayments, payment_middleware_1.validateTransfer, paymentController.transfer);
// --- BALANCE OPERATIONS ---
router.post('/balance', payment_middleware_1.validateBalanceInquiry, paymentController.getBalance);
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
exports.default = router;
