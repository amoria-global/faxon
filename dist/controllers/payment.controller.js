"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentController = void 0;
const payment_service_1 = require("../services/payment.service");
class PaymentController {
    constructor() {
        // --- DEPOSIT OPERATIONS ---
        this.deposit = async (req, res) => {
            try {
                const userId = parseInt(req.user.userId);
                const depositData = req.body;
                const transaction = await this.paymentService.deposit(userId, depositData);
                const response = {
                    success: true,
                    data: transaction,
                    message: 'Deposit initiated successfully'
                };
                res.status(201).json(response);
            }
            catch (error) {
                console.error('Deposit controller error:', error);
                const errorResponse = {
                    success: false,
                    error: {
                        code: 'DEPOSIT_FAILED',
                        message: error.message || 'Failed to process deposit',
                        timestamp: new Date().toISOString()
                    }
                };
                res.status(400).json(errorResponse);
            }
        };
        // --- WITHDRAWAL OPERATIONS ---
        this.withdraw = async (req, res) => {
            try {
                const userId = parseInt(req.user.userId);
                const withdrawalData = req.body;
                const transaction = await this.paymentService.withdraw(userId, withdrawalData);
                const response = {
                    success: true,
                    data: transaction,
                    message: 'Withdrawal initiated successfully'
                };
                res.status(201).json(response);
            }
            catch (error) {
                console.error('Withdrawal controller error:', error);
                const errorResponse = {
                    success: false,
                    error: {
                        code: 'WITHDRAWAL_FAILED',
                        message: error.message || 'Failed to process withdrawal',
                        timestamp: new Date().toISOString()
                    }
                };
                res.status(400).json(errorResponse);
            }
        };
        // --- TRANSFER OPERATIONS ---
        this.transfer = async (req, res) => {
            try {
                const userId = parseInt(req.user.userId);
                const transferData = req.body;
                const transaction = await this.paymentService.transfer(userId, transferData);
                const response = {
                    success: true,
                    data: transaction,
                    message: 'Transfer initiated successfully'
                };
                res.status(201).json(response);
            }
            catch (error) {
                console.error('Transfer controller error:', error);
                const errorResponse = {
                    success: false,
                    error: {
                        code: 'TRANSFER_FAILED',
                        message: error.message || 'Failed to process transfer',
                        timestamp: new Date().toISOString()
                    }
                };
                res.status(400).json(errorResponse);
            }
        };
        // --- BALANCE OPERATIONS ---
        this.getBalance = async (req, res) => {
            try {
                const userId = parseInt(req.user.userId);
                const balanceInquiry = req.body;
                const balance = await this.paymentService.getBalance(userId, balanceInquiry);
                const response = {
                    success: true,
                    data: balance,
                    message: 'Balance retrieved successfully'
                };
                res.status(200).json(response);
            }
            catch (error) {
                console.error('Balance inquiry controller error:', error);
                const errorResponse = {
                    success: false,
                    error: {
                        code: 'BALANCE_INQUIRY_FAILED',
                        message: error.message || 'Failed to retrieve balance',
                        timestamp: new Date().toISOString()
                    }
                };
                res.status(400).json(errorResponse);
            }
        };
        this.getUserWallet = async (req, res) => {
            try {
                const userId = parseInt(req.user.userId);
                const wallet = await this.paymentService.getUserWallet(userId);
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
        // --- TRANSACTION MANAGEMENT ---
        this.getTransactionHistory = async (req, res) => {
            try {
                const userId = parseInt(req.user.userId);
                const page = parseInt(req.query.page) || 1;
                const limit = parseInt(req.query.limit) || 20;
                // Parse filters from query parameters
                const filters = {
                    userId,
                    type: req.query.type ? req.query.type.split(',') : undefined,
                    method: req.query.method ? req.query.method.split(',') : undefined,
                    status: req.query.status ? req.query.status.split(',') : undefined,
                    dateFrom: req.query.dateFrom,
                    dateTo: req.query.dateTo,
                    minAmount: req.query.minAmount ? parseFloat(req.query.minAmount) : undefined,
                    maxAmount: req.query.maxAmount ? parseFloat(req.query.maxAmount) : undefined,
                    reference: req.query.reference,
                    phoneNumber: req.query.phoneNumber,
                    accountNumber: req.query.accountNumber
                };
                const history = await this.paymentService.getTransactionHistory(userId, filters, page, limit);
                const response = {
                    success: true,
                    data: history,
                    message: 'Transaction history retrieved successfully'
                };
                res.status(200).json(response);
            }
            catch (error) {
                console.error('Get transaction history controller error:', error);
                const errorResponse = {
                    success: false,
                    error: {
                        code: 'TRANSACTION_HISTORY_FAILED',
                        message: error.message || 'Failed to retrieve transaction history',
                        timestamp: new Date().toISOString()
                    }
                };
                res.status(500).json(errorResponse);
            }
        };
        this.getTransactionById = async (req, res) => {
            try {
                const userId = parseInt(req.user.userId);
                const transactionId = req.params.id;
                if (!transactionId) {
                    const errorResponse = {
                        success: false,
                        error: {
                            code: 'INVALID_TRANSACTION_ID',
                            message: 'Transaction ID is required',
                            timestamp: new Date().toISOString()
                        }
                    };
                    res.status(400).json(errorResponse);
                    return;
                }
                const transaction = await this.paymentService.getTransactionById(transactionId, userId);
                if (!transaction) {
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
                console.error('Get transaction by ID controller error:', error);
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
        // --- RETRY AND CANCEL OPERATIONS ---
        this.retryTransaction = async (req, res) => {
            try {
                const userId = parseInt(req.user.userId);
                const transactionId = req.params.id;
                if (!transactionId) {
                    const errorResponse = {
                        success: false,
                        error: {
                            code: 'INVALID_TRANSACTION_ID',
                            message: 'Transaction ID is required',
                            timestamp: new Date().toISOString()
                        }
                    };
                    res.status(400).json(errorResponse);
                    return;
                }
                const transaction = await this.paymentService.retryFailedTransaction(transactionId, userId);
                const response = {
                    success: true,
                    data: transaction,
                    message: 'Transaction retry initiated successfully'
                };
                res.status(201).json(response);
            }
            catch (error) {
                console.error('Retry transaction controller error:', error);
                const errorResponse = {
                    success: false,
                    error: {
                        code: 'TRANSACTION_RETRY_FAILED',
                        message: error.message || 'Failed to retry transaction',
                        timestamp: new Date().toISOString()
                    }
                };
                res.status(400).json(errorResponse);
            }
        };
        this.cancelTransaction = async (req, res) => {
            try {
                const userId = parseInt(req.user.userId);
                const transactionId = req.params.id;
                if (!transactionId) {
                    const errorResponse = {
                        success: false,
                        error: {
                            code: 'INVALID_TRANSACTION_ID',
                            message: 'Transaction ID is required',
                            timestamp: new Date().toISOString()
                        }
                    };
                    res.status(400).json(errorResponse);
                    return;
                }
                await this.paymentService.cancelPendingTransaction(transactionId, userId);
                const response = {
                    success: true,
                    data: { transactionId, status: 'cancelled' },
                    message: 'Transaction cancelled successfully'
                };
                res.status(200).json(response);
            }
            catch (error) {
                console.error('Cancel transaction controller error:', error);
                const errorResponse = {
                    success: false,
                    error: {
                        code: 'TRANSACTION_CANCEL_FAILED',
                        message: error.message || 'Failed to cancel transaction',
                        timestamp: new Date().toISOString()
                    }
                };
                res.status(400).json(errorResponse);
            }
        };
        // --- USER SETTINGS & LIMITS ---
        this.getPaymentLimits = async (req, res) => {
            try {
                const userId = parseInt(req.user.userId);
                // This method would need to be implemented in PaymentService
                const limits = await this.paymentService.getUserPaymentLimits(userId);
                const response = {
                    success: true,
                    data: limits,
                    message: 'Payment limits retrieved successfully'
                };
                res.status(200).json(response);
            }
            catch (error) {
                console.error('Get payment limits controller error:', error);
                const errorResponse = {
                    success: false,
                    error: {
                        code: 'LIMITS_RETRIEVAL_FAILED',
                        message: error.message || 'Failed to retrieve payment limits',
                        timestamp: new Date().toISOString()
                    }
                };
                res.status(500).json(errorResponse);
            }
        };
        this.getPaymentSettings = async (req, res) => {
            try {
                const userId = parseInt(req.user.userId);
                const settings = await this.paymentService.getPaymentSettings(userId);
                const response = {
                    success: true,
                    data: settings,
                    message: 'Payment settings retrieved successfully'
                };
                res.status(200).json(response);
            }
            catch (error) {
                console.error('Get payment settings controller error:', error);
                const errorResponse = {
                    success: false,
                    error: {
                        code: 'SETTINGS_RETRIEVAL_FAILED',
                        message: error.message || 'Failed to retrieve payment settings',
                        timestamp: new Date().toISOString()
                    }
                };
                res.status(500).json(errorResponse);
            }
        };
        this.updatePaymentSettings = async (req, res) => {
            try {
                const userId = parseInt(req.user.userId);
                const updates = req.body;
                const settings = await this.paymentService.updatePaymentSettings(userId, updates);
                const response = {
                    success: true,
                    data: settings,
                    message: 'Payment settings updated successfully'
                };
                res.status(200).json(response);
            }
            catch (error) {
                console.error('Update payment settings controller error:', error);
                const errorResponse = {
                    success: false,
                    error: {
                        code: 'SETTINGS_UPDATE_FAILED',
                        message: error.message || 'Failed to update payment settings',
                        timestamp: new Date().toISOString()
                    }
                };
                res.status(500).json(errorResponse);
            }
        };
        // --- BANK ACCOUNT MANAGEMENT ---
        this.addBankAccount = async (req, res) => {
            try {
                const userId = parseInt(req.user.userId);
                const accountData = req.body;
                const bankAccount = await this.paymentService.addBankAccount(userId, accountData);
                const response = {
                    success: true,
                    data: bankAccount,
                    message: 'Bank account added successfully'
                };
                res.status(201).json(response);
            }
            catch (error) {
                console.error('Add bank account controller error:', error);
                const errorResponse = {
                    success: false,
                    error: {
                        code: 'BANK_ACCOUNT_ADD_FAILED',
                        message: error.message || 'Failed to add bank account',
                        timestamp: new Date().toISOString()
                    }
                };
                res.status(400).json(errorResponse);
            }
        };
        this.getUserBankAccounts = async (req, res) => {
            try {
                const userId = parseInt(req.user.userId);
                const bankAccounts = await this.paymentService.getUserBankAccounts(userId);
                const response = {
                    success: true,
                    data: bankAccounts,
                    message: 'Bank accounts retrieved successfully'
                };
                res.status(200).json(response);
            }
            catch (error) {
                console.error('Get user bank accounts controller error:', error);
                const errorResponse = {
                    success: false,
                    error: {
                        code: 'BANK_ACCOUNTS_RETRIEVAL_FAILED',
                        message: error.message || 'Failed to retrieve bank accounts',
                        timestamp: new Date().toISOString()
                    }
                };
                res.status(500).json(errorResponse);
            }
        };
        this.removeBankAccount = async (req, res) => {
            try {
                const userId = parseInt(req.user.userId);
                const accountId = req.params.id;
                await this.paymentService.removeBankAccount(userId, accountId);
                const response = {
                    success: true,
                    data: { accountId },
                    message: 'Bank account removed successfully'
                };
                res.status(200).json(response);
            }
            catch (error) {
                console.error('Remove bank account controller error:', error);
                const errorResponse = {
                    success: false,
                    error: {
                        code: 'BANK_ACCOUNT_REMOVE_FAILED',
                        message: error.message || 'Failed to remove bank account',
                        timestamp: new Date().toISOString()
                    }
                };
                res.status(400).json(errorResponse);
            }
        };
        // --- MOBILE MONEY ACCOUNT MANAGEMENT ---
        this.addMobileMoneyAccount = async (req, res) => {
            try {
                const userId = parseInt(req.user.userId);
                const accountData = req.body;
                const mobileAccount = await this.paymentService.addMobileMoneyAccount(userId, accountData);
                const response = {
                    success: true,
                    data: mobileAccount,
                    message: 'Mobile money account added successfully'
                };
                res.status(201).json(response);
            }
            catch (error) {
                console.error('Add mobile money account controller error:', error);
                const errorResponse = {
                    success: false,
                    error: {
                        code: 'MOBILE_ACCOUNT_ADD_FAILED',
                        message: error.message || 'Failed to add mobile money account',
                        timestamp: new Date().toISOString()
                    }
                };
                res.status(400).json(errorResponse);
            }
        };
        this.getUserMobileMoneyAccounts = async (req, res) => {
            try {
                const userId = parseInt(req.user.userId);
                const mobileAccounts = await this.paymentService.getUserMobileMoneyAccounts(userId);
                const response = {
                    success: true,
                    data: mobileAccounts,
                    message: 'Mobile money accounts retrieved successfully'
                };
                res.status(200).json(response);
            }
            catch (error) {
                console.error('Get user mobile money accounts controller error:', error);
                const errorResponse = {
                    success: false,
                    error: {
                        code: 'MOBILE_ACCOUNTS_RETRIEVAL_FAILED',
                        message: error.message || 'Failed to retrieve mobile money accounts',
                        timestamp: new Date().toISOString()
                    }
                };
                res.status(500).json(errorResponse);
            }
        };
        // --- ADMIN OPERATIONS ---
        this.getAllTransactions = async (req, res) => {
            try {
                // Note: This would require admin role verification middleware
                const page = parseInt(req.query.page) || 1;
                const limit = parseInt(req.query.limit) || 50;
                // Parse filters from query parameters
                const filters = {
                    userId: req.query.userId ? parseInt(req.query.userId) : undefined,
                    type: req.query.type ? req.query.type.split(',') : undefined,
                    status: req.query.status ? req.query.status.split(',') : undefined,
                    dateFrom: req.query.dateFrom,
                    dateTo: req.query.dateTo,
                    minAmount: req.query.minAmount ? parseFloat(req.query.minAmount) : undefined,
                    maxAmount: req.query.maxAmount ? parseFloat(req.query.maxAmount) : undefined
                };
                const result = await this.paymentService.getAllTransactions(filters, page, limit);
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
        // --- WEBHOOK HANDLING ---
        this.handleJengaWebhook = async (req, res) => {
            try {
                const callbackData = req.body;
                console.log('Received Jenga webhook:', JSON.stringify(callbackData, null, 2));
                await this.paymentService.handleJengaCallback(callbackData);
                // Respond to Jenga that we received the webhook
                res.status(200).json({
                    success: true,
                    message: 'Webhook processed successfully'
                });
            }
            catch (error) {
                console.error('Jenga webhook controller error:', error);
                // Still respond with 200 to prevent Jenga from retrying
                res.status(200).json({
                    success: false,
                    error: 'Webhook processing failed'
                });
            }
        };
        // --- UTILITY ENDPOINTS ---
        this.getBanks = async (req, res) => {
            try {
                // This would typically fetch from a database or external service
                const banks = [
                    { code: '01', name: 'Kenya Commercial Bank', shortName: 'KCB' },
                    { code: '02', name: 'Standard Chartered Bank', shortName: 'SCB' },
                    { code: '03', name: 'Barclays Bank of Kenya', shortName: 'Barclays' },
                    { code: '04', name: 'Citibank N.A', shortName: 'Citibank' },
                    { code: '05', name: 'Bank of Baroda', shortName: 'BOB' },
                    { code: '06', name: 'Commercial Bank of Africa', shortName: 'CBA' },
                    { code: '07', name: 'Co-operative Bank of Kenya', shortName: 'Co-op Bank' },
                    { code: '08', name: 'National Bank of Kenya', shortName: 'NBK' },
                    { code: '09', name: 'Prime Bank', shortName: 'Prime Bank' },
                    { code: '10', name: 'Imperial Bank', shortName: 'Imperial' },
                    { code: '11', name: 'Equity Bank', shortName: 'Equity' },
                    { code: '12', name: 'Diamond Trust Bank', shortName: 'DTB' },
                    { code: '13', name: 'Housing Finance Company of Kenya', shortName: 'HFC' },
                    { code: '14', name: 'NIC Bank', shortName: 'NIC' },
                    { code: '15', name: 'Bank of Africa', shortName: 'BOA' },
                    { code: '16', name: 'Family Bank', shortName: 'Family Bank' },
                    { code: '17', name: 'African Banking Corporation', shortName: 'ABC Bank' },
                    { code: '18', name: 'Consolidated Bank of Kenya', shortName: 'Consolidated' },
                    { code: '19', name: 'Credit Bank', shortName: 'Credit Bank' },
                    { code: '20', name: 'Stanbic Bank Kenya', shortName: 'Stanbic' }
                ];
                const response = {
                    success: true,
                    data: banks,
                    message: 'Banks retrieved successfully'
                };
                res.status(200).json(response);
            }
            catch (error) {
                console.error('Get banks controller error:', error);
                const errorResponse = {
                    success: false,
                    error: {
                        code: 'BANKS_RETRIEVAL_FAILED',
                        message: error.message || 'Failed to retrieve banks',
                        timestamp: new Date().toISOString()
                    }
                };
                res.status(500).json(errorResponse);
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
                // Use private method from PaymentService (would need to make it public or create a separate validation service)
                const validation = await this.paymentService.validateBankAccount(accountNumber, bankCode);
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
        this.validatePhoneNumber = async (req, res) => {
            try {
                const { phoneNumber } = req.body;
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
                // Use private method from PaymentService (would need to make it public or create a separate validation service)
                const validation = await this.paymentService.validatePhoneNumber(phoneNumber);
                const response = {
                    success: true,
                    data: validation,
                    message: 'Phone number validation completed'
                };
                res.status(200).json(response);
            }
            catch (error) {
                console.error('Validate phone number controller error:', error);
                const errorResponse = {
                    success: false,
                    error: {
                        code: 'VALIDATION_FAILED',
                        message: error.message || 'Failed to validate phone number',
                        timestamp: new Date().toISOString()
                    }
                };
                res.status(400).json(errorResponse);
            }
        };
        this.paymentService = new payment_service_1.PaymentService();
    }
}
exports.PaymentController = PaymentController;
