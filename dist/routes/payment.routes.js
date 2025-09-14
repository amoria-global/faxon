"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const payment_controller_1 = require("../controllers/payment.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const payment_middleware_1 = require("../middleware/payment.middleware");
const escrow_middleware_1 = require("../middleware/escrow.middleware");
const router = (0, express_1.Router)();
const paymentController = new payment_controller_1.PaymentController();
// --- PUBLIC ROUTES ---
// Traditional webhook endpoint
router.post('/webhook/jenga', payment_middleware_1.validateWebhookSignature, paymentController.handleJengaWebhook);
// New escrow webhook endpoint
router.post('/webhook/escrow', escrow_middleware_1.escrowIpWhitelist, escrow_middleware_1.validateEscrowWebhookSignature, paymentController.handleEscrowWebhook);
// Utility endpoints (public)
router.get('/banks', paymentController.getBanks);
router.get('/currencies', paymentController.getSupportedCurrencies);
router.post('/validate/bank-account', paymentController.validateBankAccount);
router.post('/validate/phone-number', paymentController.validatePhoneNumber);
// --- PROTECTED ROUTES (Authentication Required) ---
router.use(auth_middleware_1.authenticate); // All routes below require authentication
router.use(payment_middleware_1.logPaymentRequest); // Log all payment requests
router.use(payment_middleware_1.sanitizePaymentData); // Sanitize input data
// === TRADITIONAL PAYMENT OPERATIONS ===
// --- DEPOSIT OPERATIONS ---
router.post('/deposit', payment_middleware_1.rateLimitPayments, payment_middleware_1.validateDeposit, paymentController.deposit);
// Enhanced deposit (can use escrow)
router.post('/deposit/enhanced', payment_middleware_1.rateLimitPayments, escrow_middleware_1.sanitizeEscrowData, paymentController.enhancedDeposit);
// --- WITHDRAWAL OPERATIONS ---
router.post('/withdraw', payment_middleware_1.rateLimitPayments, payment_middleware_1.validateWithdrawal, paymentController.withdraw);
// --- TRANSFER OPERATIONS ---
router.post('/transfer', payment_middleware_1.rateLimitPayments, payment_middleware_1.validateTransfer, paymentController.transfer);
// Enhanced transfer (can use escrow for P2P)
router.post('/transfer/enhanced', payment_middleware_1.rateLimitPayments, escrow_middleware_1.sanitizeEscrowData, paymentController.enhancedTransfer);
// === ESCROW PAYMENT OPERATIONS ===
router.use('/escrow', escrow_middleware_1.logEscrowRequest); // Log all escrow requests
// --- ESCROW DEPOSIT ---
router.post('/escrow/deposit', escrow_middleware_1.rateLimitEscrowPayments, escrow_middleware_1.validateEscrowDeposit, escrow_middleware_1.sanitizeEscrowData, paymentController.createEscrowDeposit);
// --- ESCROW WITHDRAWAL (Release) ---
router.post('/escrow/withdraw', escrow_middleware_1.rateLimitEscrowPayments, escrow_middleware_1.validateEscrowWithdrawal, escrow_middleware_1.sanitizeEscrowData, paymentController.processEscrowWithdrawal);
// --- ESCROW TRANSFER ---
router.post('/escrow/transfer', escrow_middleware_1.rateLimitEscrowPayments, escrow_middleware_1.validateEscrowTransfer, escrow_middleware_1.sanitizeEscrowData, paymentController.processEscrowTransfer);
// --- PEER-TO-PEER ESCROW ---
router.post('/escrow/p2p', escrow_middleware_1.rateLimitEscrowPayments, escrow_middleware_1.validateP2PEscrow, escrow_middleware_1.sanitizeEscrowData, paymentController.createP2PEscrowPayment);
// --- ESCROW TRANSACTION MANAGEMENT ---
router.get('/escrow/transactions', paymentController.getUserEscrowTransactions);
router.get('/escrow/transactions/:id', paymentController.getEscrowTransaction);
// --- ESCROW DISPUTE MANAGEMENT ---
router.post('/escrow/dispute', escrow_middleware_1.rateLimitEscrowPayments, escrow_middleware_1.sanitizeEscrowData, paymentController.createEscrowDispute);
// === BALANCE OPERATIONS ===
router.post('/balance', payment_middleware_1.validateBalanceInquiry, paymentController.getBalance);
router.get('/wallet', paymentController.getUserWallet);
// === UNIFIED TRANSACTION MANAGEMENT ===
router.get('/transactions', paymentController.getTransactionHistory);
router.get('/transactions/all', paymentController.getAllUserTransactions); // Includes escrow
router.get('/transactions/:id', paymentController.getTransactionById);
router.post('/transactions/:id/retry', paymentController.retryTransaction);
router.post('/transactions/:id/cancel', paymentController.cancelTransaction);
// === USER SETTINGS & LIMITS ===
router.get('/limits', paymentController.getPaymentLimits);
router.get('/settings', paymentController.getPaymentSettings);
router.put('/settings', paymentController.updatePaymentSettings);
// === BANK ACCOUNT MANAGEMENT ===
router.get('/bank-accounts', paymentController.getUserBankAccounts);
router.post('/bank-accounts', paymentController.addBankAccount);
router.delete('/bank-accounts/:id', paymentController.removeBankAccount);
// === MOBILE MONEY ACCOUNT MANAGEMENT ===
router.get('/mobile-accounts', paymentController.getUserMobileMoneyAccounts);
router.post('/mobile-accounts', paymentController.addMobileMoneyAccount);
// === ESCROW-SPECIFIC FEATURES ===
// Escrow templates (for recurring escrow setups)
router.get('/escrow/templates', async (req, res) => {
    // TODO: Implement escrow templates functionality
    res.status(501).json({
        success: false,
        message: 'Escrow templates feature coming soon'
    });
});
router.post('/escrow/templates', async (req, res) => {
    // TODO: Implement create escrow template
    res.status(501).json({
        success: false,
        message: 'Escrow templates feature coming soon'
    });
});
// Bulk escrow operations
router.post('/escrow/bulk', async (req, res) => {
    // TODO: Implement bulk escrow operations
    res.status(501).json({
        success: false,
        message: 'Bulk escrow operations feature coming soon'
    });
});
// Escrow analytics
router.get('/escrow/analytics', async (req, res) => {
    // TODO: Implement escrow analytics
    res.status(501).json({
        success: false,
        message: 'Escrow analytics feature coming soon'
    });
});
// === ADMIN ROUTES (Require additional admin middleware) ===
// Note: You should add admin authorization middleware before these routes
// Admin: View all transactions (traditional + escrow)
router.get('/admin/transactions', paymentController.getAllTransactions);
// Admin: Escrow dispute management
router.get('/admin/escrow/disputes', async (req, res) => {
    // TODO: Implement admin dispute management
    res.status(501).json({
        success: false,
        message: 'Admin dispute management feature coming soon'
    });
});
// Admin: Escrow statistics
router.get('/admin/escrow/stats', async (req, res) => {
    // TODO: Implement admin escrow statistics
    res.status(501).json({
        success: false,
        message: 'Admin escrow statistics feature coming soon'
    });
});
// Admin: Manual escrow release (emergency cases)
router.post('/admin/escrow/:id/release', async (req, res) => {
    // TODO: Implement admin manual release
    res.status(501).json({
        success: false,
        message: 'Admin manual release feature coming soon'
    });
});
// Admin: Manual dispute resolution
router.post('/admin/escrow/disputes/:id/resolve', async (req, res) => {
    // TODO: Implement admin dispute resolution
    res.status(501).json({
        success: false,
        message: 'Admin dispute resolution feature coming soon'
    });
});
// === INTEGRATION HEALTH CHECKS ===
// Health check for traditional payment provider (Jenga)
router.get('/health/jenga', async (req, res) => {
    try {
        // TODO: Implement health check for Jenga API
        res.status(200).json({
            success: true,
            service: 'jenga',
            status: 'healthy',
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        res.status(503).json({
            success: false,
            service: 'jenga',
            status: 'unhealthy',
            error: 'Service unavailable',
            timestamp: new Date().toISOString()
        });
    }
});
// Health check for escrow payment provider
router.get('/health/escrow', async (req, res) => {
    try {
        // TODO: Implement health check for Escrow API
        res.status(200).json({
            success: true,
            service: 'escrow',
            status: 'healthy',
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        res.status(503).json({
            success: false,
            service: 'escrow',
            status: 'unhealthy',
            error: 'Service unavailable',
            timestamp: new Date().toISOString()
        });
    }
});
// Overall payment system health
router.get('/health', async (req, res) => {
    try {
        const health = {
            success: true,
            system: 'payment_system',
            status: 'healthy',
            services: {
                jenga: 'healthy', // TODO: Check actual service status
                escrow: 'healthy', // TODO: Check actual service status
                database: 'healthy', // TODO: Check database connection
            },
            features: {
                traditional_payments: true,
                escrow_payments: true,
                p2p_escrow: true,
                multi_currency: true,
                webhooks: true
            },
            supported_currencies: ['USD', 'RWF', 'KES'],
            timestamp: new Date().toISOString()
        };
        res.status(200).json(health);
    }
    catch (error) {
        res.status(503).json({
            success: false,
            system: 'payment_system',
            status: 'degraded',
            error: 'System health check failed',
            timestamp: new Date().toISOString()
        });
    }
});
exports.default = router;
