"use strict";
// routes/escrow.routes.ts
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const escrow_controller_1 = require("../controllers/escrow.controller");
const escrow_service_1 = require("../services/escrow.service");
const pesapal_service_1 = require("../services/pesapal.service");
const auth_middleware_1 = require("../middleware/auth.middleware");
const escrow_middleware_1 = require("../middleware/escrow.middleware");
const config_1 = require("../config/config");
const email_service_1 = require("../services/email.service");
const router = (0, express_1.Router)();
// Initialize services
const pesapalService = new pesapal_service_1.PesapalService({
    consumerKey: config_1.config.pesapal.consumerKey,
    consumerSecret: config_1.config.pesapal.consumerSecret,
    baseUrl: config_1.config.pesapal.baseUrl,
    environment: config_1.config.pesapal.environment,
    timeout: 30000,
    retryAttempts: 3,
    webhookSecret: config_1.config.pesapal.webhookSecret,
    callbackUrl: config_1.config.pesapal.callbackUrl,
    defaultCurrency: 'RWF',
    merchantAccount: config_1.config.pesapal.merchantAccount
});
const emailService = new email_service_1.EmailService();
const escrowService = new escrow_service_1.EscrowService(pesapalService, emailService);
const escrowController = new escrow_controller_1.EscrowController(escrowService, pesapalService);
// === PUBLIC ROUTES ===
// Health check endpoint
router.get('/health', escrowController.healthCheck);
// Pesapal webhook endpoint (must be public)
router.post('/webhook/pesapal', escrow_middleware_1.rateLimitWebhooks, escrow_middleware_1.ipWhitelist, escrow_middleware_1.validatePesapalWebhook, escrowController.handlePesapalWebhook);
// Pesapal callback endpoint (for payment redirects)
router.get('/callback', escrowController.handlePesapalCallback);
// Configuration endpoints (public)
router.get('/currencies', escrowController.getSupportedCurrencies);
router.get('/mobile-providers', escrowController.getSupportedMobileProviders);
// Validation endpoints (public)
router.post('/validate/mobile-number', escrowController.validateMobileNumber);
router.post('/validate/bank-account', escrowController.validateBankAccount);
// === PROTECTED ROUTES ===
// All routes below require authentication
router.use(auth_middleware_1.authenticate);
router.use(escrow_middleware_1.logEscrowRequest);
router.use(escrow_middleware_1.sanitizeEscrowData);
// === DEPOSIT OPERATIONS ===
router.post('/deposits', escrow_middleware_1.rateLimitEscrowOperations, escrow_middleware_1.validateDeposit, escrowController.createDeposit);
// === ESCROW MANAGEMENT ===
// Release escrow funds
router.post('/transactions/:transactionId/release', escrow_middleware_1.rateLimitEscrowOperations, escrow_middleware_1.validateTransactionId, escrow_middleware_1.validateRelease, escrowController.releaseEscrow);
// Process refunds
router.post('/transactions/:transactionId/refund', escrow_middleware_1.rateLimitEscrowOperations, escrow_middleware_1.validateTransactionId, escrow_middleware_1.validateRefund, escrowController.processRefund);
// === WITHDRAWAL OPERATIONS ===
router.post('/withdrawals', escrow_middleware_1.rateLimitEscrowOperations, escrow_middleware_1.validateWithdrawal, escrowController.createWithdrawal);
// === TRANSACTION QUERIES ===
// Get specific transaction
router.get('/transactions/:transactionId', escrow_middleware_1.validateTransactionId, escrowController.getTransaction);
// Get user's transactions
router.get('/transactions', escrowController.getUserTransactions);
// === WALLET OPERATIONS ===
router.get('/wallet', escrowController.getUserWallet);
// === ADMIN ROUTES ===
// Note: These routes require additional admin middleware in production
// Get all transactions (admin only)
router.get('/admin/transactions', escrowController.getAllTransactions);
// Admin release escrow (emergency cases)
router.post('/admin/transactions/:transactionId/release', escrow_middleware_1.rateLimitEscrowOperations, escrow_middleware_1.validateTransactionId, escrow_middleware_1.validateRelease, escrowController.adminReleaseEscrow);
// === ANALYTICS & REPORTING ROUTES ===
// User transaction summary
router.get('/analytics/summary', async (req, res) => {
    try {
        // TODO: Implement analytics service
        res.status(501).json({
            success: false,
            message: 'Analytics feature coming soon'
        });
    }
    catch (error) {
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
    }
    catch (error) {
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
router.use((error, req, res, next) => {
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
exports.default = router;
