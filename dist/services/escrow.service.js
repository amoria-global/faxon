"use strict";
// services/escrow.service.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EscrowService = void 0;
const client_1 = require("@prisma/client");
const config_1 = __importDefault(require("../config/config"));
const prisma = new client_1.PrismaClient();
class EscrowService {
    constructor(pesapalService, emailService) {
        this.pesapalService = pesapalService;
        this.emailService = emailService;
    }
    // === DEPOSIT OPERATIONS ===
    async createDeposit(guestId, depositData) {
        try {
            // Validate deposit amount and limits
            await this.validateEscrowLimits(guestId, 'DEPOSIT', depositData.amount);
            // Validate split rules
            this.validateSplitRules(depositData.splitRules);
            // Get participants
            const [guest, host, agent] = await Promise.all([
                this.getUserById(guestId),
                this.getUserById(depositData.hostId),
                depositData.agentId ? this.getUserById(depositData.agentId) : null
            ]);
            // Create escrow transaction
            const merchantReference = this.pesapalService.generateMerchantReference('DEP');
            const escrowTransaction = await this.createEscrowTransaction({
                guestId,
                hostId: depositData.hostId,
                agentId: depositData.agentId,
                type: 'DEPOSIT',
                status: 'PENDING',
                amount: depositData.amount,
                currency: depositData.currency,
                reference: merchantReference,
                description: depositData.description,
                splitRules: depositData.splitRules,
                billingInfo: depositData.billingInfo
            });
            // Create Pesapal checkout request (without notification_id - auto-registration will handle it)
            const checkoutRequest = {
                id: merchantReference,
                currency: depositData.currency,
                amount: this.pesapalService.formatAmount(depositData.amount),
                description: depositData.description || `Payment for booking ${merchantReference}`,
                callback_url: `${config_1.default.pesapal.callbackUrl}`,
                billing_address: {
                    email_address: depositData.billingInfo.email,
                    phone_number: depositData.billingInfo.phone,
                    first_name: depositData.billingInfo.firstName,
                    last_name: depositData.billingInfo.lastName,
                    country_code: depositData.billingInfo.countryCode || 'RW'
                }
            };
            console.log('Creating Pesapal checkout with request:', JSON.stringify(checkoutRequest, null, 2));
            // The PesapalService will automatically handle IPN registration
            const checkoutResponse = await this.pesapalService.createCheckout(checkoutRequest);
            // Update transaction with Pesapal order details
            await this.updateEscrowTransaction(escrowTransaction.id, {
                pesapalOrderId: checkoutResponse.merchant_reference,
                pesapalTrackingId: checkoutResponse.order_tracking_id
            });
            // Send deposit notification
            await this.sendDepositNotification(escrowTransaction, checkoutResponse.redirect_url);
            return {
                transaction: await this.getEscrowTransactionById(escrowTransaction.id),
                checkoutUrl: checkoutResponse.redirect_url
            };
        }
        catch (error) {
            console.error('Create deposit failed:', error);
            // Enhanced error handling with better error categorization
            let errorMessage = 'Failed to create deposit';
            let errorCode = 'DEPOSIT_CREATION_FAILED';
            if (error.message?.includes('IPN registration failed')) {
                errorMessage = 'Payment system configuration error. Please try again later.';
                errorCode = 'IPN_REGISTRATION_FAILED';
            }
            else if (error.message?.includes('authentication failed')) {
                errorMessage = 'Payment authentication failed. Please contact support.';
                errorCode = 'PAYMENT_AUTH_FAILED';
            }
            else if (error.response?.data?.error?.message) {
                errorMessage = `Payment Error: ${error.response.data.error.message}`;
                errorCode = 'PESAPAL_API_ERROR';
            }
            else if (error.response?.status) {
                errorMessage = `Payment service error (${error.response.status})`;
                errorCode = 'PAYMENT_SERVICE_ERROR';
                // Specific handling for common HTTP errors
                switch (error.response.status) {
                    case 404:
                        errorMessage = 'Payment service endpoint not found. Please contact support.';
                        break;
                    case 401:
                        errorMessage = 'Payment authentication failed. Please contact support.';
                        break;
                    case 403:
                        errorMessage = 'Payment access denied. Please contact support.';
                        break;
                    case 429:
                        errorMessage = 'Too many payment requests. Please try again in a few minutes.';
                        break;
                    case 500:
                    case 502:
                    case 503:
                        errorMessage = 'Payment service temporarily unavailable. Please try again later.';
                        break;
                }
            }
            else if (error.message) {
                errorMessage = error.message;
            }
            const enhancedError = new Error(errorMessage);
            enhancedError.code = errorCode;
            enhancedError.originalError = error;
            throw enhancedError;
        }
    }
    // === WEBHOOK HANDLING ===
    async handlePesapalWebhook(webhookData) {
        try {
            console.log('Processing Pesapal webhook:', webhookData);
            // Find transaction by tracking ID
            const transaction = await this.findTransactionByTrackingId(webhookData.OrderTrackingId);
            if (!transaction) {
                console.error('Transaction not found for tracking ID:', webhookData.OrderTrackingId);
                return;
            }
            // Get current status from Pesapal
            const statusResponse = await this.pesapalService.getTransactionStatus(webhookData.OrderTrackingId);
            const newStatus = this.pesapalService.mapPesapalStatusToEscrowStatus(statusResponse.status);
            // Update transaction status
            const updates = {
                status: newStatus
            };
            if (newStatus === 'HELD') {
                updates.heldAt = new Date();
                updates.readyAt = new Date(); // Ready for release
            }
            else if (newStatus === 'FAILED') {
                updates.failedAt = new Date();
                updates.failureReason = statusResponse.message || 'Payment failed';
            }
            await this.updateEscrowTransaction(transaction.id, updates);
            // Send status notification
            await this.sendStatusUpdateNotification(transaction, newStatus);
            console.log(`Transaction ${transaction.id} updated to status: ${newStatus}`);
        }
        catch (error) {
            console.error('Webhook processing failed:', error);
            throw error;
        }
    }
    // === RELEASE OPERATIONS ===
    async releaseEscrow(transactionId, releaseData) {
        try {
            const transaction = await this.getEscrowTransactionById(transactionId);
            if (!transaction) {
                throw new Error('Transaction not found');
            }
            if (transaction.status !== 'READY' && transaction.status !== 'HELD') {
                throw new Error(`Cannot release transaction with status: ${transaction.status}`);
            }
            // Calculate split amounts
            const splitAmounts = this.calculateSplitAmounts(transaction.amount, transaction.splitRules);
            // Update wallets
            await this.updateWalletsOnRelease(transaction, splitAmounts);
            // Update transaction status
            const updatedTransaction = await this.updateEscrowTransaction(transactionId, {
                status: 'RELEASED',
                releasedAt: new Date(),
                splitAmounts
            });
            // Send release notifications
            await this.sendReleaseNotification(updatedTransaction);
            return updatedTransaction;
        }
        catch (error) {
            console.error('Release escrow failed:', error);
            throw new Error(error.message || 'Failed to release escrow');
        }
    }
    // === WITHDRAWAL OPERATIONS ===
    async createWithdrawal(userId, withdrawData) {
        try {
            // Check user wallet balance
            const wallet = await this.getUserWallet(userId);
            if (wallet.balance < withdrawData.amount) {
                throw new Error('Insufficient wallet balance');
            }
            // Validate withdrawal limits
            await this.validateEscrowLimits(userId, 'WITHDRAWAL', withdrawData.amount);
            // Validate destination
            await this.validateWithdrawalDestination(withdrawData);
            // Create withdrawal request
            const withdrawalRequest = await this.createWithdrawalRequest({
                userId,
                amount: withdrawData.amount,
                currency: wallet.currency,
                method: withdrawData.method,
                destination: withdrawData.destination,
                reference: withdrawData.reference,
                status: 'PENDING'
            });
            // Deduct from wallet (hold the amount)
            await this.updateWalletBalance(userId, -withdrawData.amount, 'WITHDRAWAL_HOLD', withdrawalRequest.id);
            // Create Pesapal payout request
            const payoutRequest = this.buildPayoutRequest(withdrawalRequest, withdrawData);
            const payoutResponse = await this.pesapalService.createPayout(payoutRequest);
            // Update withdrawal with Pesapal details
            const updatedWithdrawal = await this.updateWithdrawalRequest(withdrawalRequest.id, {
                status: 'PROCESSING',
                pesapalPayoutId: payoutResponse.requestId
            });
            // Send withdrawal notification
            await this.sendWithdrawalNotification(updatedWithdrawal);
            return updatedWithdrawal;
        }
        catch (error) {
            console.error('Create withdrawal failed:', error);
            throw new Error(error.message || 'Failed to create withdrawal');
        }
    }
    // === REFUND OPERATIONS ===
    async processRefund(refundData) {
        try {
            const transaction = await this.getEscrowTransactionById(refundData.transactionId);
            if (!transaction) {
                throw new Error('Transaction not found');
            }
            if (!['HELD', 'READY'].includes(transaction.status)) {
                throw new Error(`Cannot refund transaction with status: ${transaction.status}`);
            }
            if (!transaction.pesapalTrackingId) {
                throw new Error('No Pesapal tracking ID found for refund');
            }
            const refundAmount = refundData.amount || transaction.amount;
            // Process refund with Pesapal
            await this.pesapalService.processRefund(transaction.pesapalTrackingId, refundAmount);
            // Update transaction
            const updatedTransaction = await this.updateEscrowTransaction(refundData.transactionId, {
                status: 'REFUNDED',
                refundedAt: new Date(),
                failureReason: refundData.reason
            });
            // Send refund notification
            await this.sendRefundNotification(updatedTransaction, refundAmount);
            return updatedTransaction;
        }
        catch (error) {
            console.error('Process refund failed:', error);
            throw new Error(error.message || 'Failed to process refund');
        }
    }
    // === QUERY OPERATIONS ===
    async getEscrowTransactionById(id) {
        const transaction = await prisma.escrowTransaction.findUnique({
            where: { id },
            include: {
                user: {
                    select: { id: true, email: true, firstName: true, lastName: true }
                },
                recipient: {
                    select: { id: true, email: true, firstName: true, lastName: true }
                }
            }
        });
        if (!transaction) {
            throw new Error('Transaction not found');
        }
        return this.transformToEscrowTransaction(transaction);
    }
    async getUserEscrowTransactions(userId, status, type, page = 1, limit = 20) {
        const skip = (page - 1) * limit;
        const whereClause = {
            OR: [
                { userId },
                { recipientId: userId }
            ]
        };
        if (status) {
            whereClause.status = status;
        }
        if (type) {
            whereClause.type = type;
        }
        const [transactions, total] = await Promise.all([
            prisma.escrowTransaction.findMany({
                where: whereClause,
                include: {
                    user: {
                        select: { id: true, email: true, firstName: true, lastName: true }
                    },
                    recipient: {
                        select: { id: true, email: true, firstName: true, lastName: true }
                    }
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit
            }),
            prisma.escrowTransaction.count({ where: whereClause })
        ]);
        return {
            transactions: transactions.map(t => this.transformToEscrowTransaction(t)),
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        };
    }
    async getUserWallet(userId) {
        let wallet = await prisma.wallet.findUnique({
            where: { userId }
        });
        if (!wallet) {
            wallet = await prisma.wallet.create({
                data: {
                    userId,
                    balance: 0,
                    currency: 'RWF', // Default currency
                    isActive: true
                }
            });
        }
        return {
            id: wallet.id,
            userId: wallet.userId,
            balance: wallet.balance,
            currency: wallet.currency,
            isActive: wallet.isActive,
            createdAt: wallet.createdAt,
            updatedAt: wallet.updatedAt
        };
    }
    // === PAYMENT SYSTEM HEALTH CHECK ===
    async checkPaymentSystemHealth() {
        try {
            const pesapalHealth = await this.pesapalService.healthCheck();
            return {
                healthy: pesapalHealth.healthy,
                pesapalStatus: pesapalHealth,
                ipnStatus: pesapalHealth.ipnStatus,
                message: pesapalHealth.healthy
                    ? 'Payment system is operational'
                    : 'Payment system issues detected'
            };
        }
        catch (error) {
            return {
                healthy: false,
                pesapalStatus: { healthy: false, error: error.message },
                message: 'Payment system health check failed'
            };
        }
    }
    // === HELPER METHODS ===
    async createEscrowTransaction(data) {
        const transaction = await prisma.escrowTransaction.create({
            data: {
                userId: data.guestId,
                recipientId: data.hostId,
                type: data.type,
                status: data.status,
                amount: data.amount,
                currency: data.currency,
                reference: data.reference,
                description: data.description,
                isP2P: false,
                metadata: JSON.stringify({
                    splitRules: data.splitRules,
                    agentId: data.agentId,
                    billingInfo: data.billingInfo
                })
            }
        });
        return this.transformToEscrowTransaction(transaction);
    }
    async updateEscrowTransaction(id, updates) {
        const transaction = await prisma.escrowTransaction.update({
            where: { id },
            data: {
                ...updates,
                updatedAt: new Date()
            },
            include: {
                user: {
                    select: { id: true, email: true, firstName: true, lastName: true }
                },
                recipient: {
                    select: { id: true, email: true, firstName: true, lastName: true }
                }
            }
        });
        return this.transformToEscrowTransaction(transaction);
    }
    validateSplitRules(rules) {
        const total = rules.host + rules.agent + rules.platform;
        if (Math.abs(total - 100) > 0.01) {
            throw new Error('Split rules must total 100%');
        }
        if (rules.host < 0 || rules.agent < 0 || rules.platform < 0) {
            throw new Error('Split percentages must be positive');
        }
    }
    calculateSplitAmounts(amount, rules) {
        return {
            host: Math.round((amount * rules.host / 100) * 100) / 100,
            agent: Math.round((amount * rules.agent / 100) * 100) / 100,
            platform: Math.round((amount * rules.platform / 100) * 100) / 100
        };
    }
    async updateWalletsOnRelease(transaction, splitAmounts) {
        const metadata = JSON.parse(transaction.metadata || '{}');
        // Update host wallet
        await this.updateWalletBalance(transaction.hostId, splitAmounts.host, 'ESCROW_RELEASE', transaction.reference);
        // Update agent wallet if exists
        if (metadata.agentId && splitAmounts.agent > 0) {
            await this.updateWalletBalance(metadata.agentId, splitAmounts.agent, 'ESCROW_RELEASE', transaction.reference);
        }
        // Platform fee goes to platform wallet (user ID 1 or dedicated platform account)
        if (splitAmounts.platform > 0) {
            await this.updateWalletBalance(1, // Platform user ID
            splitAmounts.platform, 'PLATFORM_FEE', transaction.reference);
        }
    }
    async updateWalletBalance(userId, amount, type, reference) {
        const wallet = await this.getUserWallet(userId);
        const newBalance = wallet.balance + amount;
        await prisma.wallet.update({
            where: { userId },
            data: { balance: newBalance }
        });
        // Create wallet transaction record
        await prisma.walletTransaction.create({
            data: {
                walletId: wallet.id,
                type: amount > 0 ? 'credit' : 'debit',
                amount: Math.abs(amount),
                balanceBefore: wallet.balance,
                balanceAfter: newBalance,
                reference,
                description: `${type} - ${reference}`
            }
        });
    }
    async validateEscrowLimits(userId, type, amount) {
        // Implementation would check user-specific limits
        // For now, basic validation
        if (amount < 100) { // Min 100 RWF
            throw new Error('Minimum amount is 100 RWF');
        }
        if (amount > 1000000) { // Max 1M RWF
            throw new Error('Maximum amount is 1,000,000 RWF');
        }
    }
    async validateWithdrawalDestination(withdrawData) {
        if (withdrawData.method === 'MOBILE') {
            const validation = this.pesapalService.validateMobileNumber(withdrawData.destination.accountNumber, withdrawData.destination.countryCode);
            if (!validation.isValid) {
                throw new Error(validation.errors?.[0] || 'Invalid mobile number');
            }
        }
        else if (withdrawData.method === 'BANK') {
            const validation = this.pesapalService.validateBankAccount(withdrawData.destination.accountNumber, withdrawData.destination.bankCode || '');
            if (!validation.isValid) {
                throw new Error(validation.errors?.[0] || 'Invalid bank account');
            }
        }
    }
    buildPayoutRequest(withdrawal, withdrawData) {
        const destinationType = withdrawData.method;
        const request = {
            source_type: 'MERCHANT',
            source: {
                account_number: process.env.PESAPAL_MERCHANT_ACCOUNT
            },
            destination_type: destinationType,
            destination: {
                type: destinationType,
                country_code: withdrawData.destination.countryCode || 'RW',
                holder_name: withdrawData.destination.holderName,
                account_number: withdrawData.destination.accountNumber
            },
            transfer_details: {
                amount: this.pesapalService.formatAmount(withdrawData.amount),
                currency_code: withdrawal.currency,
                date: new Date().toISOString().split('T')[0],
                particulars: withdrawData.particulars || 'Wallet withdrawal',
                reference: withdrawData.reference
            }
        };
        if (destinationType === 'MOBILE' && withdrawData.destination.mobileProvider) {
            request.destination.mobile_provider = withdrawData.destination.mobileProvider;
        }
        if (destinationType === 'BANK' && withdrawData.destination.bankCode) {
            request.destination.bank_code = withdrawData.destination.bankCode;
        }
        return request;
    }
    async createWithdrawalRequest(data) {
        const withdrawal = await prisma.withdrawalRequest.create({
            data: {
                userId: data.userId,
                amount: data.amount,
                currency: data.currency,
                method: data.method,
                destination: JSON.stringify(data.destination),
                status: data.status,
                reference: data.reference
            }
        });
        return {
            id: withdrawal.id,
            userId: withdrawal.userId,
            amount: withdrawal.amount,
            currency: withdrawal.currency,
            method: withdrawal.method,
            destination: JSON.parse(withdrawal.destination),
            status: withdrawal.status,
            pesapalPayoutId: withdrawal.pesapalPayoutId,
            reference: withdrawal.reference,
            failureReason: withdrawal.failureReason,
            createdAt: withdrawal.createdAt,
            updatedAt: withdrawal.updatedAt,
            completedAt: withdrawal.completedAt
        };
    }
    async updateWithdrawalRequest(id, updates) {
        const withdrawal = await prisma.withdrawalRequest.update({
            where: { id },
            data: {
                ...updates,
                updatedAt: new Date()
            }
        });
        return {
            id: withdrawal.id,
            userId: withdrawal.userId,
            amount: withdrawal.amount,
            currency: withdrawal.currency,
            method: withdrawal.method,
            destination: JSON.parse(withdrawal.destination),
            status: withdrawal.status,
            pesapalPayoutId: withdrawal.pesapalPayoutId,
            reference: withdrawal.reference,
            failureReason: withdrawal.failureReason,
            createdAt: withdrawal.createdAt,
            updatedAt: withdrawal.updatedAt,
            completedAt: withdrawal.completedAt
        };
    }
    async getUserById(id) {
        const user = await prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                phone: true
            }
        });
        if (!user) {
            throw new Error(`User with ID ${id} not found`);
        }
        return {
            id: user.id,
            role: 'GUEST', // Default role, would be determined by context
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            phone: user.phone
        };
    }
    async findTransactionByTrackingId(trackingId) {
        const transaction = await prisma.escrowTransaction.findFirst({
            where: { externalId: trackingId },
            include: {
                user: {
                    select: { id: true, email: true, firstName: true, lastName: true }
                },
                recipient: {
                    select: { id: true, email: true, firstName: true, lastName: true }
                }
            }
        });
        return transaction ? this.transformToEscrowTransaction(transaction) : null;
    }
    transformToEscrowTransaction(transaction) {
        const metadata = JSON.parse(transaction.metadata || '{}');
        return {
            id: transaction.id,
            guestId: transaction.userId,
            hostId: transaction.recipientId || 0,
            agentId: metadata.agentId,
            type: transaction.type,
            status: transaction.status,
            amount: transaction.amount,
            currency: transaction.currency,
            reference: transaction.reference,
            description: transaction.description,
            pesapalOrderId: transaction.escrowId,
            pesapalTrackingId: transaction.externalId,
            pesapalPayoutId: transaction.jengaTransactionId, // Reusing field
            splitRules: metadata.splitRules || { host: 70, agent: 20, platform: 10 },
            splitAmounts: metadata.splitAmounts,
            heldAt: transaction.fundedAt,
            readyAt: transaction.fundedAt,
            releasedAt: transaction.releasedAt,
            refundedAt: transaction.refundedAt,
            failedAt: transaction.resolvedAt, // Reusing field
            billingInfo: metadata.billingInfo,
            failureReason: transaction.disputeReason,
            createdAt: transaction.createdAt,
            updatedAt: transaction.updatedAt,
            guest: transaction.user ? {
                id: transaction.user.id,
                role: 'GUEST',
                email: transaction.user.email,
                firstName: transaction.user.firstName,
                lastName: transaction.user.lastName
            } : undefined,
            host: transaction.recipient ? {
                id: transaction.recipient.id,
                role: 'HOST',
                email: transaction.recipient.email,
                firstName: transaction.recipient.firstName,
                lastName: transaction.recipient.lastName
            } : undefined
        };
    }
    // === NOTIFICATION METHODS ===
    async sendDepositNotification(transaction, checkoutUrl) {
        try {
            if (transaction.guest) {
                await this.emailService.sendDepositCreatedEmail({
                    user: transaction.guest,
                    transaction,
                    checkoutUrl
                });
            }
        }
        catch (error) {
            console.error('Failed to send deposit notification:', error);
        }
    }
    async sendStatusUpdateNotification(transaction, status) {
        try {
            if (transaction.guest) {
                await this.emailService.sendTransactionStatusEmail({
                    user: transaction.guest,
                    transaction,
                    status
                });
            }
        }
        catch (error) {
            console.error('Failed to send status update notification:', error);
        }
    }
    async sendReleaseNotification(transaction) {
        try {
            // Notify host
            if (transaction.host) {
                await this.emailService.sendFundsReleasedEmail({
                    user: transaction.host,
                    transaction
                });
            }
        }
        catch (error) {
            console.error('Failed to send release notification:', error);
        }
    }
    async sendWithdrawalNotification(withdrawal) {
        try {
            const user = await this.getUserById(withdrawal.userId);
            await this.emailService.sendWithdrawalRequestEmail({
                user,
                withdrawal
            });
        }
        catch (error) {
            console.error('Failed to send withdrawal notification:', error);
        }
    }
    async sendRefundNotification(transaction, amount) {
        try {
            if (transaction.guest) {
                await this.emailService.sendRefundProcessedEmail({
                    user: transaction.guest,
                    transaction,
                    refundAmount: amount
                });
            }
        }
        catch (error) {
            console.error('Failed to send refund notification:', error);
        }
    }
}
exports.EscrowService = EscrowService;
