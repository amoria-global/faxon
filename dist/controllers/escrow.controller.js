"use strict";
// controllers/escrow.controller.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.EscrowController = void 0;
class EscrowController {
    constructor(escrowService, pesapalService) {
        // === DEPOSIT OPERATIONS ===
        this.createDeposit = async (req, res) => {
            try {
                const userId = parseInt(req.user.userId);
                const depositData = req.body;
                const result = await this.escrowService.createDeposit(userId, depositData);
                const response = {
                    success: true,
                    data: {
                        transaction: result.transaction,
                        checkoutUrl: result.checkoutUrl
                    },
                    message: 'Deposit created successfully. Please complete payment.'
                };
                res.status(201).json(response);
            }
            catch (error) {
                console.error('Create deposit controller error:', error);
                const errorResponse = {
                    success: false,
                    error: {
                        code: 'DEPOSIT_CREATION_FAILED',
                        message: error.message || 'Failed to create deposit',
                        timestamp: new Date().toISOString()
                    }
                };
                res.status(400).json(errorResponse);
            }
        };
        // === RELEASE OPERATIONS ===
        this.releaseEscrow = async (req, res) => {
            try {
                const { transactionId } = req.params;
                const releaseData = req.body;
                // Verify user has permission to release this escrow
                const transaction = await this.escrowService.getEscrowTransactionById(transactionId);
                const userId = parseInt(req.user.userId);
                // Only the guest (payer) or admin can release escrow
                if (transaction.guestId !== userId && !this.isAdmin(userId)) {
                    const errorResponse = {
                        success: false,
                        error: {
                            code: 'UNAUTHORIZED_RELEASE',
                            message: 'You are not authorized to release this escrow',
                            timestamp: new Date().toISOString()
                        }
                    };
                    res.status(403).json(errorResponse);
                    return;
                }
                const releasedTransaction = await this.escrowService.releaseEscrow(transactionId, releaseData);
                const response = {
                    success: true,
                    data: releasedTransaction,
                    message: 'Escrow funds released successfully'
                };
                res.status(200).json(response);
            }
            catch (error) {
                console.error('Release escrow controller error:', error);
                const errorResponse = {
                    success: false,
                    error: {
                        code: 'ESCROW_RELEASE_FAILED',
                        message: error.message || 'Failed to release escrow',
                        timestamp: new Date().toISOString()
                    }
                };
                res.status(400).json(errorResponse);
            }
        };
        // === WITHDRAWAL OPERATIONS ===
        this.createWithdrawal = async (req, res) => {
            try {
                const userId = parseInt(req.user.userId);
                const withdrawData = req.body;
                const withdrawal = await this.escrowService.createWithdrawal(userId, withdrawData);
                const response = {
                    success: true,
                    data: withdrawal,
                    message: 'Withdrawal request created successfully'
                };
                res.status(201).json(response);
            }
            catch (error) {
                console.error('Create withdrawal controller error:', error);
                const errorResponse = {
                    success: false,
                    error: {
                        code: 'WITHDRAWAL_CREATION_FAILED',
                        message: error.message || 'Failed to create withdrawal',
                        timestamp: new Date().toISOString()
                    }
                };
                res.status(400).json(errorResponse);
            }
        };
        // === REFUND OPERATIONS ===
        this.processRefund = async (req, res) => {
            try {
                const { transactionId } = req.params;
                const refundData = {
                    transactionId,
                    ...req.body
                };
                // Verify user has permission to refund this transaction
                const transaction = await this.escrowService.getEscrowTransactionById(transactionId);
                const userId = parseInt(req.user.userId);
                // Only the host (service provider) or admin can initiate refunds
                if (transaction.hostId !== userId && !this.isAdmin(userId)) {
                    const errorResponse = {
                        success: false,
                        error: {
                            code: 'UNAUTHORIZED_REFUND',
                            message: 'You are not authorized to refund this transaction',
                            timestamp: new Date().toISOString()
                        }
                    };
                    res.status(403).json(errorResponse);
                    return;
                }
                const refundedTransaction = await this.escrowService.processRefund(refundData);
                const response = {
                    success: true,
                    data: refundedTransaction,
                    message: 'Refund processed successfully'
                };
                res.status(200).json(response);
            }
            catch (error) {
                console.error('Process refund controller error:', error);
                const errorResponse = {
                    success: false,
                    error: {
                        code: 'REFUND_PROCESSING_FAILED',
                        message: error.message || 'Failed to process refund',
                        timestamp: new Date().toISOString()
                    }
                };
                res.status(400).json(errorResponse);
            }
        };
        // === TRANSACTION QUERIES ===
        this.getTransaction = async (req, res) => {
            try {
                const { transactionId } = req.params;
                const userId = parseInt(req.user.userId);
                const transaction = await this.escrowService.getEscrowTransactionById(transactionId);
                // Verify user has access to this transaction
                if (transaction.guestId !== userId &&
                    transaction.hostId !== userId &&
                    transaction.agentId !== userId &&
                    !this.isAdmin(userId)) {
                    const errorResponse = {
                        success: false,
                        error: {
                            code: 'TRANSACTION_NOT_FOUND',
                            message: 'Transaction not found',
                            timestamp: new Date().toISOString()
                        }
                    };
                    res.status(404).json(errorResponse);
                    return;
                }
                const response = {
                    success: true,
                    data: transaction,
                    message: 'Transaction retrieved successfully'
                };
                res.status(200).json(response);
            }
            catch (error) {
                console.error('Get transaction controller error:', error);
                const errorResponse = {
                    success: false,
                    error: {
                        code: 'TRANSACTION_RETRIEVAL_FAILED',
                        message: error.message || 'Failed to retrieve transaction',
                        timestamp: new Date().toISOString()
                    }
                };
                res.status(500).json(errorResponse);
            }
        };
        this.getUserTransactions = async (req, res) => {
            try {
                const userId = parseInt(req.user.userId);
                const status = req.query.status;
                const type = req.query.type;
                const page = parseInt(req.query.page) || 1;
                const limit = parseInt(req.query.limit) || 20;
                const result = await this.escrowService.getUserEscrowTransactions(userId, status, type, page, limit);
                const response = {
                    success: true,
                    data: result,
                    message: 'User transactions retrieved successfully'
                };
                res.status(200).json(response);
            }
            catch (error) {
                console.error('Get user transactions controller error:', error);
                const errorResponse = {
                    success: false,
                    error: {
                        code: 'USER_TRANSACTIONS_RETRIEVAL_FAILED',
                        message: error.message || 'Failed to retrieve user transactions',
                        timestamp: new Date().toISOString()
                    }
                };
                res.status(500).json(errorResponse);
            }
        };
        // === WALLET OPERATIONS ===
        this.getUserWallet = async (req, res) => {
            try {
                const userId = parseInt(req.user.userId);
                const wallet = await this.escrowService.getUserWallet(userId);
                const response = {
                    success: true,
                    data: wallet,
                    message: 'Wallet retrieved successfully'
                };
                res.status(200).json(response);
            }
            catch (error) {
                console.error('Get wallet controller error:', error);
                const errorResponse = {
                    success: false,
                    error: {
                        code: 'WALLET_RETRIEVAL_FAILED',
                        message: error.message || 'Failed to retrieve wallet',
                        timestamp: new Date().toISOString()
                    }
                };
                res.status(500).json(errorResponse);
            }
        };
        // === WEBHOOK HANDLING ===
        this.handlePesapalWebhook = async (req, res) => {
            try {
                const webhookData = req.body;
                console.log('Received Pesapal webhook:', JSON.stringify(webhookData, null, 2));
                await this.escrowService.handlePesapalWebhook(webhookData);
                res.status(200).json({
                    success: true,
                    message: 'Webhook processed successfully'
                });
            }
            catch (error) {
                console.error('Pesapal webhook controller error:', error);
                // Still respond with 200 to prevent Pesapal from retrying
                res.status(200).json({
                    success: false,
                    error: 'Webhook processing failed'
                });
            }
        };
        // === CALLBACK HANDLING (for Pesapal redirects) ===
        this.handlePesapalCallback = async (req, res) => {
            try {
                const { OrderTrackingId, OrderMerchantReference } = req.query;
                if (!OrderTrackingId || !OrderMerchantReference) {
                    res.redirect(`${process.env.FRONTEND_URL}/payment/error?error=missing_parameters`);
                    return;
                }
                // Get transaction status from Pesapal
                const status = await this.pesapalService.getTransactionStatus(OrderTrackingId);
                // Determine redirect URL based on status
                let redirectUrl;
                if (status.status === 'COMPLETED') {
                    redirectUrl = `${process.env.FRONTEND_URL}/payment/success?reference=${OrderMerchantReference}`;
                }
                else if (status.status === 'FAILED' || status.status === 'INVALID') {
                    redirectUrl = `${process.env.FRONTEND_URL}/payment/failed?reference=${OrderMerchantReference}`;
                }
                else {
                    redirectUrl = `${process.env.FRONTEND_URL}/payment/pending?reference=${OrderMerchantReference}`;
                }
                res.redirect(redirectUrl);
            }
            catch (error) {
                console.error('Pesapal callback error:', error);
                res.redirect(`${process.env.FRONTEND_URL}/payment/error?error=callback_failed`);
            }
        };
        // === HEALTH CHECK ===
        this.healthCheck = async (req, res) => {
            try {
                const pesapalHealth = await this.pesapalService.healthCheck();
                const health = {
                    success: true,
                    system: 'escrow_payment_system',
                    status: pesapalHealth.healthy ? 'healthy' : 'degraded',
                    services: {
                        pesapal: {
                            status: pesapalHealth.healthy ? 'healthy' : 'unhealthy',
                            message: pesapalHealth.message
                        },
                        database: 'healthy' // Would implement actual DB health check
                    },
                    features: {
                        deposits: true,
                        escrow_release: true,
                        withdrawals: true,
                        refunds: true,
                        mobile_money: true,
                        bank_transfers: true
                    },
                    supported_currencies: ['RWF', 'USD', 'UGX', 'TZS', 'KES'],
                    supported_providers: ['MTN', 'AIRTEL', 'TIGO', 'RWANDATEL'],
                    timestamp: new Date().toISOString()
                };
                res.status(pesapalHealth.healthy ? 200 : 503).json(health);
            }
            catch (error) {
                res.status(503).json({
                    success: false,
                    system: 'escrow_payment_system',
                    status: 'unhealthy',
                    error: 'Health check failed',
                    timestamp: new Date().toISOString()
                });
            }
        };
        // === ADMIN OPERATIONS ===
        this.getAllTransactions = async (req, res) => {
            try {
                const userId = parseInt(req.user.userId);
                if (!this.isAdmin(userId)) {
                    const errorResponse = {
                        success: false,
                        error: {
                            code: 'UNAUTHORIZED_ACCESS',
                            message: 'Admin access required',
                            timestamp: new Date().toISOString()
                        }
                    };
                    res.status(403).json(errorResponse);
                    return;
                }
                const status = req.query.status;
                const type = req.query.type;
                const page = parseInt(req.query.page) || 1;
                const limit = parseInt(req.query.limit) || 50;
                // For admin, we can get all transactions regardless of user
                const result = await this.escrowService.getUserEscrowTransactions(0, // Use 0 to indicate admin query (would need to modify service method)
                status, type, page, limit);
                const response = {
                    success: true,
                    data: result,
                    message: 'All transactions retrieved successfully'
                };
                res.status(200).json(response);
            }
            catch (error) {
                console.error('Get all transactions controller error:', error);
                const errorResponse = {
                    success: false,
                    error: {
                        code: 'ALL_TRANSACTIONS_RETRIEVAL_FAILED',
                        message: error.message || 'Failed to retrieve all transactions',
                        timestamp: new Date().toISOString()
                    }
                };
                res.status(500).json(errorResponse);
            }
        };
        this.adminReleaseEscrow = async (req, res) => {
            try {
                const userId = parseInt(req.user.userId);
                if (!this.isAdmin(userId)) {
                    const errorResponse = {
                        success: false,
                        error: {
                            code: 'UNAUTHORIZED_ACCESS',
                            message: 'Admin access required',
                            timestamp: new Date().toISOString()
                        }
                    };
                    res.status(403).json(errorResponse);
                    return;
                }
                const { transactionId } = req.params;
                const releaseData = req.body;
                const releasedTransaction = await this.escrowService.releaseEscrow(transactionId, releaseData);
                const response = {
                    success: true,
                    data: releasedTransaction,
                    message: 'Admin escrow release completed successfully'
                };
                res.status(200).json(response);
            }
            catch (error) {
                console.error('Admin release escrow controller error:', error);
                const errorResponse = {
                    success: false,
                    error: {
                        code: 'ADMIN_ESCROW_RELEASE_FAILED',
                        message: error.message || 'Failed to release escrow',
                        timestamp: new Date().toISOString()
                    }
                };
                res.status(400).json(errorResponse);
            }
        };
        // === VALIDATION HELPERS ===
        this.validateMobileNumber = async (req, res) => {
            try {
                const { phoneNumber, countryCode } = req.body;
                if (!phoneNumber) {
                    const errorResponse = {
                        success: false,
                        error: {
                            code: 'VALIDATION_ERROR',
                            message: 'Phone number is required',
                            timestamp: new Date().toISOString()
                        }
                    };
                    res.status(400).json(errorResponse);
                    return;
                }
                const validation = this.pesapalService.validateMobileNumber(phoneNumber, countryCode);
                const response = {
                    success: true,
                    data: validation,
                    message: 'Mobile number validation completed'
                };
                res.status(200).json(response);
            }
            catch (error) {
                console.error('Validate mobile number controller error:', error);
                const errorResponse = {
                    success: false,
                    error: {
                        code: 'VALIDATION_FAILED',
                        message: error.message || 'Failed to validate mobile number',
                        timestamp: new Date().toISOString()
                    }
                };
                res.status(400).json(errorResponse);
            }
        };
        this.validateBankAccount = async (req, res) => {
            try {
                const { accountNumber, bankCode } = req.body;
                if (!accountNumber || !bankCode) {
                    const errorResponse = {
                        success: false,
                        error: {
                            code: 'VALIDATION_ERROR',
                            message: 'Account number and bank code are required',
                            timestamp: new Date().toISOString()
                        }
                    };
                    res.status(400).json(errorResponse);
                    return;
                }
                const validation = this.pesapalService.validateBankAccount(accountNumber, bankCode);
                const response = {
                    success: true,
                    data: validation,
                    message: 'Bank account validation completed'
                };
                res.status(200).json(response);
            }
            catch (error) {
                console.error('Validate bank account controller error:', error);
                const errorResponse = {
                    success: false,
                    error: {
                        code: 'VALIDATION_FAILED',
                        message: error.message || 'Failed to validate bank account',
                        timestamp: new Date().toISOString()
                    }
                };
                res.status(400).json(errorResponse);
            }
        };
        // === CONFIGURATION ENDPOINTS ===
        this.getSupportedCurrencies = async (req, res) => {
            try {
                const currencies = [
                    { code: 'RWF', name: 'Rwandan Franc', symbol: 'FRw', isDefault: true },
                    { code: 'USD', name: 'US Dollar', symbol: '$', isDefault: false },
                    { code: 'UGX', name: 'Ugandan Shilling', symbol: 'UGX', isDefault: false },
                    { code: 'TZS', name: 'Tanzanian Shilling', symbol: 'TZS', isDefault: false },
                    { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh', isDefault: false }
                ];
                const response = {
                    success: true,
                    data: currencies,
                    message: 'Supported currencies retrieved successfully'
                };
                res.status(200).json(response);
            }
            catch (error) {
                console.error('Get supported currencies controller error:', error);
                const errorResponse = {
                    success: false,
                    error: {
                        code: 'CURRENCIES_RETRIEVAL_FAILED',
                        message: error.message || 'Failed to retrieve supported currencies',
                        timestamp: new Date().toISOString()
                    }
                };
                res.status(500).json(errorResponse);
            }
        };
        this.getSupportedMobileProviders = async (req, res) => {
            try {
                const providers = [
                    { code: 'MTN', name: 'MTN Rwanda', country: 'RW' },
                    { code: 'AIRTEL', name: 'Airtel Rwanda', country: 'RW' },
                    { code: 'TIGO', name: 'Tigo Rwanda', country: 'RW' },
                    { code: 'RWANDATEL', name: 'Rwandatel', country: 'RW' }
                ];
                const response = {
                    success: true,
                    data: providers,
                    message: 'Supported mobile providers retrieved successfully'
                };
                res.status(200).json(response);
            }
            catch (error) {
                console.error('Get supported providers controller error:', error);
                const errorResponse = {
                    success: false,
                    error: {
                        code: 'PROVIDERS_RETRIEVAL_FAILED',
                        message: error.message || 'Failed to retrieve supported providers',
                        timestamp: new Date().toISOString()
                    }
                };
                res.status(500).json(errorResponse);
            }
        };
        this.escrowService = escrowService;
        this.pesapalService = pesapalService;
    }
    // === UTILITY METHODS ===
    isAdmin(userId) {
        // Implement admin check logic
        // This could check a database for admin roles or use environment variables
        const adminIds = process.env.ADMIN_USER_IDS?.split(',').map(id => parseInt(id)) || [1];
        return adminIds.includes(userId);
    }
}
exports.EscrowController = EscrowController;
