"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentService = void 0;
const axios_1 = __importDefault(require("axios"));
const crypto_1 = __importDefault(require("crypto"));
const client_1 = require("@prisma/client");
const config_1 = require("../config/config");
const prisma = new client_1.PrismaClient();
class PaymentService {
    constructor() {
        this.jengaCredentials = {};
        this.jengaConfig = {
            baseUrl: config_1.config.jenga.baseUrl || 'https://sandbox.jengahq.io',
            username: config_1.config.jenga.username,
            password: config_1.config.jenga.password,
            apiKey: config_1.config.jenga.apiKey,
            privateKey: config_1.config.jenga.privateKey,
            environment: (config_1.config.jenga.environment === 'production' ? 'production' : 'sandbox'),
            timeout: 30000,
            retryAttempts: 3,
            callbackUrl: config_1.config.jenga.callbackUrl
        };
        this.jengaClient = axios_1.default.create({
            baseURL: this.jengaConfig.baseUrl,
            timeout: this.jengaConfig.timeout,
            headers: {
                'Content-Type': 'application/json',
                'Api-Key': this.jengaConfig.apiKey
            }
        });
        // Request interceptor for authentication
        this.jengaClient.interceptors.request.use(async (config) => {
            const token = await this.getValidToken();
            if (token) {
                config.headers.Authorization = `Bearer ${token}`;
            }
            // Add signature for sensitive operations
            if (['post', 'put', 'patch'].includes(config.method?.toLowerCase() || '')) {
                config.headers['Signature'] = this.generateSignature(JSON.stringify(config.data));
            }
            return config;
        });
        // Response interceptor for error handling
        this.jengaClient.interceptors.response.use((response) => response, async (error) => {
            if (error.response?.status === 401) {
                // Token expired, refresh and retry
                this.jengaCredentials = {};
                const token = await this.getValidToken();
                if (token && error.config) {
                    error.config.headers.Authorization = `Bearer ${token}`;
                    return this.jengaClient.request(error.config);
                }
            }
            return Promise.reject(error);
        });
    }
    // --- AUTHENTICATION ---
    async getValidToken() {
        try {
            // Check if current token is still valid
            if (this.jengaCredentials.accessToken && this.jengaCredentials.expiresAt) {
                if (Date.now() < this.jengaCredentials.expiresAt - 60000) { // 1 minute buffer
                    return this.jengaCredentials.accessToken ?? null;
                }
            }
            // Get new token
            const authData = {
                username: this.jengaConfig.username,
                password: this.jengaConfig.password
            };
            const response = await axios_1.default.post(`${this.jengaConfig.baseUrl}/identity/v2/token`, `username=${authData.username}&password=${authData.password}`, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Api-Key': this.jengaConfig.apiKey
                }
            });
            this.jengaCredentials = {
                accessToken: response.data.access_token,
                refreshToken: response.data.refresh_token,
                tokenType: response.data.token_type,
                expiresAt: Date.now() + (response.data.expires_in * 1000)
            };
            return this.jengaCredentials.accessToken ?? null;
        }
        catch (error) {
            console.error('Jenga authentication failed:', error.response?.data || error.message);
            return null;
        }
    }
    generateSignature(data) {
        const privateKey = this.jengaConfig.privateKey;
        const sign = crypto_1.default.createSign('RSA-SHA256');
        sign.write(data);
        sign.end();
        return sign.sign(privateKey, 'base64');
    }
    // --- DEPOSIT OPERATIONS ---
    async deposit(userId, data) {
        try {
            // Validate deposit amount and limits
            await this.validatePaymentLimits(userId, 'deposit', data.amount);
            // Validate phone number
            const phoneValidation = await this.validatePhoneNumber(data.phoneNumber);
            if (!phoneValidation.isValid) {
                throw new Error('Invalid phone number format');
            }
            // Create pending transaction
            const transaction = await this.createTransaction({
                userId,
                type: 'deposit',
                method: 'mobile_money',
                amount: data.amount,
                currency: 'KES',
                status: 'pending',
                reference: data.reference,
                description: data.description,
                phoneNumber: phoneValidation.formattedNumber,
                callbackUrl: data.callbackUrl || this.jengaConfig.callbackUrl
            });
            // Prepare Jenga mobile money request
            const jengaRequest = {
                customer: {
                    countryCode: 'KE',
                    mobileNumber: phoneValidation.formattedNumber
                },
                transaction: {
                    amount: data.amount.toString(),
                    description: data.description || `Deposit - ${data.reference}`,
                    type: 'CustomerPayBillOnline',
                    id: transaction.reference
                }
            };
            // Submit to Jenga API
            const response = await this.jengaClient.post('/transaction/v2/payments', jengaRequest);
            // Update transaction with Jenga response
            const updatedTransaction = await this.updateTransaction(transaction.id, {
                jengaTransactionId: response.data.transactionId,
                externalId: response.data.transactionCode,
                status: this.mapJengaStatusToTransactionStatus(response.data.status)
            });
            return updatedTransaction;
        }
        catch (error) {
            console.error('Deposit failed:', error);
            throw new Error(error.response?.data?.message || error.message || 'Deposit failed');
        }
    }
    // --- WITHDRAWAL OPERATIONS ---
    async withdraw(userId, data) {
        try {
            // Check user balance
            const wallet = await this.getUserWallet(userId);
            if (wallet.balance < data.amount) {
                throw new Error('Insufficient balance');
            }
            // Validate withdrawal limits
            await this.validatePaymentLimits(userId, 'withdrawal', data.amount);
            // Validate bank account
            const bankValidation = await this.validateBankAccount(data.accountNumber, data.bankCode);
            if (!bankValidation.isValid) {
                throw new Error('Invalid bank account details');
            }
            // Calculate fees
            const fees = await this.calculateTransactionFees('withdrawal', 'bank_transfer', data.amount);
            // Check if user has enough balance including fees
            if (wallet.balance < (data.amount + fees.totalFees)) {
                throw new Error('Insufficient balance to cover withdrawal and fees');
            }
            // Create pending transaction
            const transaction = await this.createTransaction({
                userId,
                type: 'withdrawal',
                method: 'bank_transfer',
                amount: data.amount,
                currency: 'KES',
                status: 'pending',
                reference: data.reference,
                description: data.description,
                destinationAccount: data.accountNumber,
                bankCode: data.bankCode,
                accountName: data.accountName,
                charges: fees.totalFees,
                netAmount: data.amount - fees.totalFees,
                callbackUrl: data.callbackUrl || this.jengaConfig.callbackUrl
            });
            // Deduct from wallet (pending)
            await this.updateWalletBalance(userId, -data.amount, 'debit', transaction.reference);
            // Prepare Jenga bank transfer request
            const jengaRequest = {
                source: {
                    countryCode: 'KE',
                    name: 'Platform Account',
                    accountNumber: config_1.config.jenga.sourceAccount
                },
                destination: {
                    countryCode: 'KE',
                    name: data.accountName,
                    bankCode: data.bankCode,
                    accountNumber: data.accountNumber,
                    type: 'bank'
                },
                transfer: {
                    type: 'InternalFundsTransfer',
                    amount: transaction.netAmount.toString(),
                    currencyCode: 'KES',
                    reference: data.reference,
                    date: new Date().toISOString().split('T')[0],
                    description: data.description || `Withdrawal - ${data.reference}`
                }
            };
            // Submit to Jenga API
            const response = await this.jengaClient.post('/transaction/v2/remittance', jengaRequest);
            // Update transaction with Jenga response
            const updatedTransaction = await this.updateTransaction(transaction.id, {
                jengaTransactionId: response.data.transactionId,
                externalId: response.data.transactionCode,
                status: this.mapJengaStatusToTransactionStatus(response.data.status)
            });
            return updatedTransaction;
        }
        catch (error) {
            console.error('Withdrawal failed:', error);
            throw new Error(error.response?.data?.message || error.message || 'Withdrawal failed');
        }
    }
    // --- TRANSFER OPERATIONS ---
    async transfer(userId, data) {
        try {
            // Check user balance
            const wallet = await this.getUserWallet(userId);
            if (wallet.balance < data.amount) {
                throw new Error('Insufficient balance');
            }
            // Validate transfer limits
            await this.validatePaymentLimits(userId, 'transfer', data.amount);
            // Calculate fees based on transfer type
            const fees = await this.calculateTransactionFees('transfer', this.getPaymentMethodFromTransferType(data.transferType), data.amount);
            // Check if user has enough balance including fees
            if (wallet.balance < (data.amount + fees.totalFees)) {
                throw new Error('Insufficient balance to cover transfer and fees');
            }
            // Create pending transaction
            const transaction = await this.createTransaction({
                userId,
                type: 'transfer',
                method: this.getPaymentMethodFromTransferType(data.transferType),
                amount: data.amount,
                currency: 'KES',
                status: 'pending',
                reference: data.reference,
                description: data.description,
                sourceAccount: data.sourceAccount,
                destinationAccount: data.destinationAccount,
                charges: fees.totalFees,
                netAmount: data.amount - fees.totalFees,
                callbackUrl: data.callbackUrl || this.jengaConfig.callbackUrl,
                metadata: { transferType: data.transferType }
            });
            // Deduct from wallet (pending)
            await this.updateWalletBalance(userId, -data.amount, 'debit', transaction.reference);
            let jengaResponse;
            if (data.transferType === 'mobile') {
                // Mobile money transfer
                const mobileRequest = {
                    customer: {
                        countryCode: 'KE',
                        mobileNumber: data.destinationAccount
                    },
                    transaction: {
                        amount: transaction.netAmount.toString(),
                        description: data.description || `Transfer - ${data.reference}`,
                        type: 'CustomerPayBillOnline',
                        id: transaction.reference
                    }
                };
                const response = await this.jengaClient.post('/transaction/v2/payments', mobileRequest);
                jengaResponse = response.data;
            }
            else {
                // Bank transfer
                const bankRequest = {
                    source: {
                        countryCode: 'KE',
                        name: 'Platform Account',
                        accountNumber: data.sourceAccount
                    },
                    destination: {
                        countryCode: 'KE',
                        name: 'Recipient',
                        bankCode: data.destinationBankCode,
                        accountNumber: data.destinationAccount,
                        type: 'bank'
                    },
                    transfer: {
                        type: this.getJengaTransferType(data.transferType),
                        amount: transaction.netAmount.toString(),
                        currencyCode: 'KES',
                        reference: data.reference,
                        date: new Date().toISOString().split('T')[0],
                        description: data.description || `Transfer - ${data.reference}`
                    }
                };
                const response = await this.jengaClient.post('/transaction/v2/remittance', bankRequest);
                jengaResponse = response.data;
            }
            // Update transaction with Jenga response
            const updatedTransaction = await this.updateTransaction(transaction.id, {
                jengaTransactionId: jengaResponse.transactionId,
                externalId: jengaResponse.transactionCode,
                status: this.mapJengaStatusToTransactionStatus(jengaResponse.status)
            });
            return updatedTransaction;
        }
        catch (error) {
            console.error('Transfer failed:', error);
            throw new Error(error.response?.data?.message || error.message || 'Transfer failed');
        }
    }
    // --- BALANCE OPERATIONS ---
    async getBalance(userId, data) {
        try {
            const jengaRequest = {
                countryCode: data.countryCode || 'KE',
                accountNumber: data.accountNumber
            };
            const response = await this.jengaClient.post('/account/v2/accounts/balances', jengaRequest);
            const jengaBalance = response.data;
            const mainBalance = jengaBalance.balances.find(b => b.type === 'Available') || jengaBalance.balances[0];
            // Also get user's wallet balance
            const wallet = await this.getUserWallet(userId);
            return {
                available: parseFloat(mainBalance?.amount || '0'),
                pending: wallet.balance - parseFloat(mainBalance?.amount || '0'), // Difference indicates pending
                total: wallet.balance,
                currency: mainBalance?.currencyCode || 'KES',
                accountNumber: jengaBalance.accountNumber,
                accountName: jengaBalance.accountName,
                lastUpdated: new Date().toISOString()
            };
        }
        catch (error) {
            console.error('Balance inquiry failed:', error);
            throw new Error(error.response?.data?.message || error.message || 'Balance inquiry failed');
        }
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
                    currency: 'KES',
                    isActive: true,
                    isVerified: false
                }
            });
        }
        return {
            id: wallet.id,
            userId: wallet.userId,
            balance: wallet.balance,
            currency: wallet.currency,
            accountNumber: wallet.accountNumber || undefined,
            isActive: wallet.isActive,
            isVerified: wallet.isVerified,
            createdAt: wallet.createdAt.toISOString(),
            updatedAt: wallet.updatedAt.toISOString()
        };
    }
    // --- TRANSACTION MANAGEMENT ---
    async createTransaction(data) {
        const transaction = await prisma.paymentTransaction.create({
            data: {
                userId: data.userId,
                type: data.type,
                method: data.method,
                amount: data.amount,
                currency: data.currency || 'KES',
                status: data.status || 'pending',
                reference: data.reference,
                description: data.description,
                sourceAccount: data.sourceAccount,
                destinationAccount: data.destinationAccount,
                phoneNumber: data.phoneNumber,
                bankCode: data.bankCode,
                accountName: data.accountName,
                charges: data.charges,
                netAmount: data.netAmount,
                callbackUrl: data.callbackUrl,
                metadata: data.metadata ? JSON.stringify(data.metadata) : undefined // Fix: use undefined instead of null
            }
        });
        return this.transformToPaymentTransaction(transaction);
    }
    async updateTransaction(id, updates) {
        const transaction = await prisma.paymentTransaction.update({
            where: { id },
            data: {
                ...(updates.jengaTransactionId && { jengaTransactionId: updates.jengaTransactionId }),
                ...(updates.externalId && { externalId: updates.externalId }),
                ...(updates.status && { status: updates.status }),
                ...(updates.failureReason && { failureReason: updates.failureReason }),
                ...(updates.status === 'completed' && { completedAt: new Date() }),
                updatedAt: new Date()
            }
        });
        return this.transformToPaymentTransaction(transaction);
    }
    async getTransactionHistory(userId, filters, page = 1, limit = 20) {
        const skip = (page - 1) * limit;
        const whereClause = { userId };
        // Apply filters
        if (filters.type && filters.type.length > 0) {
            whereClause.type = { in: filters.type };
        }
        if (filters.method && filters.method.length > 0) {
            whereClause.method = { in: filters.method };
        }
        if (filters.status && filters.status.length > 0) {
            whereClause.status = { in: filters.status };
        }
        if (filters.dateFrom && filters.dateTo) {
            whereClause.createdAt = {
                gte: new Date(filters.dateFrom),
                lte: new Date(filters.dateTo)
            };
        }
        if (filters.minAmount || filters.maxAmount) {
            whereClause.amount = {};
            if (filters.minAmount)
                whereClause.amount.gte = filters.minAmount;
            if (filters.maxAmount)
                whereClause.amount.lte = filters.maxAmount;
        }
        if (filters.reference) {
            whereClause.reference = { contains: filters.reference, mode: 'insensitive' };
        }
        if (filters.phoneNumber) {
            whereClause.phoneNumber = { contains: filters.phoneNumber };
        }
        if (filters.accountNumber) {
            whereClause.OR = [
                { sourceAccount: { contains: filters.accountNumber } },
                { destinationAccount: { contains: filters.accountNumber } }
            ];
        }
        const [transactions, total, summary] = await Promise.all([
            prisma.paymentTransaction.findMany({
                where: whereClause,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit
            }),
            prisma.paymentTransaction.count({ where: whereClause }),
            this.calculateTransactionSummary(userId, whereClause)
        ]);
        return {
            transactions: transactions.map(t => this.transformToPaymentTransaction(t)),
            summary,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        };
    }
    // --- WEBHOOK HANDLING ---
    async handleJengaCallback(callbackData) {
        try {
            const transaction = await prisma.paymentTransaction.findFirst({
                where: {
                    OR: [
                        { jengaTransactionId: callbackData.transactionId },
                        { reference: callbackData.merchantTransactionId }
                    ]
                }
            });
            if (!transaction) {
                console.error('Transaction not found for callback:', callbackData);
                return;
            }
            const status = this.mapJengaCallbackStatusToTransactionStatus(callbackData.status);
            const updates = {
                status,
                charges: parseFloat(callbackData.charges || '0'),
                updatedAt: new Date()
            };
            if (status === 'completed') {
                updates.completedAt = new Date();
                // Update wallet balance for successful deposits
                if (transaction.type === 'deposit') {
                    await this.updateWalletBalance(transaction.userId, transaction.amount, 'credit', transaction.reference);
                }
            }
            else if (status === 'failed') {
                updates.failureReason = callbackData.resultDesc;
                // Reverse wallet changes for failed withdrawals/transfers
                if (['withdrawal', 'transfer'].includes(transaction.type)) {
                    await this.updateWalletBalance(transaction.userId, transaction.amount, 'credit', // Refund
                    `${transaction.reference}-refund`);
                }
            }
            await prisma.paymentTransaction.update({
                where: { id: transaction.id },
                data: updates
            });
            // Send notification to user
            await this.sendTransactionNotification(transaction.userId, transaction.id, status);
        }
        catch (error) {
            console.error('Error handling Jenga callback:', error);
            throw error;
        }
    }
    // --- WALLET OPERATIONS ---
    async updateWalletBalance(userId, amount, type, reference) {
        const wallet = await this.getUserWallet(userId);
        const newBalance = type === 'credit' ? wallet.balance + amount : wallet.balance - amount;
        // Update wallet
        await prisma.wallet.update({
            where: { userId },
            data: { balance: newBalance }
        });
        // Create wallet transaction record
        await prisma.walletTransaction.create({
            data: {
                walletId: wallet.id,
                type,
                amount: Math.abs(amount),
                balanceBefore: wallet.balance,
                balanceAfter: newBalance,
                reference,
                description: `${type === 'credit' ? 'Credit' : 'Debit'} - ${reference}`
            }
        });
    }
    // --- VALIDATION HELPERS ---
    async validatePaymentLimits(userId, type, amount) {
        // Only validate limits for supported transaction types
        const supportedTypes = ['deposit', 'withdrawal', 'transfer'];
        if (!supportedTypes.includes(type)) {
            return; // Skip validation for unsupported types like 'refund'
        }
        const limits = await this.getUserPaymentLimits(userId);
        switch (type) {
            case 'deposit':
                if (amount < limits.limits.perTransaction.minDeposit) {
                    throw new Error(`Minimum deposit amount is ${limits.limits.perTransaction.minDeposit} ${limits.limits.currency}`);
                }
                if (amount > limits.limits.perTransaction.maxDeposit) {
                    throw new Error(`Maximum deposit amount is ${limits.limits.perTransaction.maxDeposit} ${limits.limits.currency}`);
                }
                break;
            case 'withdrawal':
                if (amount < limits.limits.perTransaction.minWithdrawal) {
                    throw new Error(`Minimum withdrawal amount is ${limits.limits.perTransaction.minWithdrawal} ${limits.limits.currency}`);
                }
                if (amount > limits.limits.perTransaction.maxWithdrawal) {
                    throw new Error(`Maximum withdrawal amount is ${limits.limits.perTransaction.maxWithdrawal} ${limits.limits.currency}`);
                }
                break;
            case 'transfer':
                if (amount < limits.limits.perTransaction.minTransfer) {
                    throw new Error(`Minimum transfer amount is ${limits.limits.perTransaction.minTransfer} ${limits.limits.currency}`);
                }
                if (amount > limits.limits.perTransaction.maxTransfer) {
                    throw new Error(`Maximum transfer amount is ${limits.limits.perTransaction.maxTransfer} ${limits.limits.currency}`);
                }
                break;
        }
        // Check daily and monthly limits - with type safety
        const today = new Date().toISOString().split('T')[0];
        const thisMonth = new Date().toISOString().substring(0, 7);
        // Type-safe access to daily limits
        if (limits.usedLimits.dailyUsed.date === today) {
            const dailyUsed = this.getDailyUsedAmount(limits.usedLimits.dailyUsed, type);
            const dailyLimit = this.getDailyLimit(limits.limits.daily, type);
            if (dailyUsed + amount > dailyLimit) {
                throw new Error(`Daily ${type} limit exceeded`);
            }
        }
        // Type-safe access to monthly limits
        if (limits.usedLimits.monthlyUsed.month === thisMonth) {
            const monthlyUsed = this.getMonthlyUsedAmount(limits.usedLimits.monthlyUsed, type);
            const monthlyLimit = this.getMonthlyLimit(limits.limits.monthly, type);
            if (monthlyUsed + amount > monthlyLimit) {
                throw new Error(`Monthly ${type} limit exceeded`);
            }
        }
    }
    // Helper methods for type-safe limit access
    getDailyUsedAmount(dailyUsed, type) {
        switch (type) {
            case 'deposit':
                return dailyUsed.deposit;
            case 'withdrawal':
                return dailyUsed.withdrawal;
            case 'transfer':
                return dailyUsed.transfer;
            default:
                return 0;
        }
    }
    getDailyLimit(daily, type) {
        switch (type) {
            case 'deposit':
                return daily.deposit;
            case 'withdrawal':
                return daily.withdrawal;
            case 'transfer':
                return daily.transfer;
            default:
                return 0;
        }
    }
    getMonthlyUsedAmount(monthlyUsed, type) {
        switch (type) {
            case 'deposit':
                return monthlyUsed.deposit;
            case 'withdrawal':
                return monthlyUsed.withdrawal;
            case 'transfer':
                return monthlyUsed.transfer;
            default:
                return 0;
        }
    }
    getMonthlyLimit(monthly, type) {
        switch (type) {
            case 'deposit':
                return monthly.deposit;
            case 'withdrawal':
                return monthly.withdrawal;
            case 'transfer':
                return monthly.transfer;
            default:
                return 0;
        }
    }
    async validatePhoneNumber(phoneNumber) {
        // Clean phone number
        const cleanPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');
        // Kenyan phone number validation
        const kenyaRegex = /^(\+254|254|0)?([17]\d{8})$/;
        const match = cleanPhone.match(kenyaRegex);
        if (!match) {
            return {
                isValid: false,
                errors: ['Invalid Kenyan phone number format']
            };
        }
        const nationalNumber = match[2];
        const formattedNumber = '254' + nationalNumber;
        // Determine provider
        let provider;
        const prefix = nationalNumber.substring(0, 3);
        if (['701', '702', '703', '704', '705', '706', '707', '708', '709'].includes(prefix)) {
            provider = 'mpesa';
        }
        else if (['730', '731', '732', '733', '734', '735', '736', '737', '738', '739'].includes(prefix)) {
            provider = 'airtel';
        }
        else if (['750', '751', '752', '753'].includes(prefix)) {
            provider = 'orange';
        }
        else if (['771', '772', '773', '774', '775', '776'].includes(prefix)) {
            provider = 'mtn';
        }
        else if (['765', '766', '767'].includes(prefix)) {
            provider = 'tigo';
        }
        else {
            return {
                isValid: false,
                errors: ['Unsupported mobile money provider']
            };
        }
        return {
            isValid: true,
            formattedNumber,
            provider
        };
    }
    async validateBankAccount(accountNumber, bankCode) {
        try {
            const response = await this.jengaClient.post('/account/v2/accounts/inquiry', {
                countryCode: 'KE',
                accountNumber,
                bankCode
            });
            return {
                isValid: true,
                accountName: response.data.account?.accountName,
                bankName: response.data.bank?.bankName
            };
        }
        catch (error) {
            // If Jenga API is not available, do basic validation
            if (error.code === 'ECONNREFUSED' || error.response?.status >= 500) {
                console.warn('Jenga API unavailable, performing basic validation');
                // Basic validation rules
                if (accountNumber.length < 8 || accountNumber.length > 20) {
                    return { isValid: false, errors: ['Invalid account number length'] };
                }
                if (!/^\d+$/.test(accountNumber)) {
                    return { isValid: false, errors: ['Account number must contain only digits'] };
                }
                // Return valid for basic checks (in production, you might want stricter validation)
                return { isValid: true };
            }
            return {
                isValid: false,
                errors: [error.response?.data?.message || 'Invalid bank account']
            };
        }
    }
    // --- TRANSACTION FEE CALCULATION ---
    async calculateTransactionFees(type, method, amount) {
        // Get fee structure from database or config
        const feeStructure = await this.getFeeStructure(type, method);
        let serviceFee = 0;
        let processingFee = 0;
        let commissionFee = 0;
        if (feeStructure) {
            if (feeStructure.feeType === 'percentage') {
                serviceFee = (amount * feeStructure.amount) / 100;
                if (feeStructure.minFee && serviceFee < feeStructure.minFee)
                    serviceFee = feeStructure.minFee;
                if (feeStructure.maxFee && serviceFee > feeStructure.maxFee)
                    serviceFee = feeStructure.maxFee;
            }
            else {
                serviceFee = feeStructure.amount;
            }
        }
        // Additional processing fees based on method
        if (method === 'mobile_money') {
            processingFee = Math.min(amount * 0.005, 50); // 0.5% max 50
        }
        else if (method === 'bank_transfer') {
            processingFee = 25; // Fixed bank transfer fee
        }
        const totalFees = serviceFee + processingFee + commissionFee;
        const netAmount = amount - totalFees;
        return {
            serviceFee,
            processingFee,
            commissionFee,
            totalFees,
            netAmount,
            currency: 'KES'
        };
    }
    // --- TRANSACTION QUERIES ---
    async getTransactionById(transactionId, userId) {
        try {
            const transaction = await prisma.paymentTransaction.findFirst({
                where: {
                    id: transactionId,
                    userId
                }
            });
            if (!transaction)
                return null;
            return this.transformToPaymentTransaction(transaction);
        }
        catch (error) {
            console.error('Error getting transaction by ID:', error);
            throw new Error('Failed to retrieve transaction');
        }
    }
    async getAllTransactions(filters, page = 1, limit = 50) {
        const skip = (page - 1) * limit;
        const whereClause = {};
        // Apply admin filters
        if (filters.userId) {
            whereClause.userId = filters.userId;
        }
        if (filters.type && filters.type.length > 0) {
            whereClause.type = { in: filters.type };
        }
        if (filters.status && filters.status.length > 0) {
            whereClause.status = { in: filters.status };
        }
        if (filters.dateFrom && filters.dateTo) {
            whereClause.createdAt = {
                gte: new Date(filters.dateFrom),
                lte: new Date(filters.dateTo)
            };
        }
        const [transactions, total] = await Promise.all([
            prisma.paymentTransaction.findMany({
                where: whereClause,
                include: { user: true },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit
            }),
            prisma.paymentTransaction.count({ where: whereClause })
        ]);
        return {
            transactions: transactions.map(t => this.transformToPaymentTransaction(t)),
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        };
    }
    // --- BANK ACCOUNT MANAGEMENT ---
    async addBankAccount(userId, accountData) {
        try {
            // Validate bank account first
            const validation = await this.validateBankAccount(accountData.accountNumber, accountData.bankCode);
            if (!validation.isValid) {
                throw new Error('Invalid bank account details');
            }
            // If setting as default, unset other defaults
            if (accountData.isDefault) {
                await prisma.bankAccount.updateMany({
                    where: { userId },
                    data: { isDefault: false }
                });
            }
            const bankAccount = await prisma.bankAccount.create({
                data: {
                    userId,
                    accountNumber: accountData.accountNumber,
                    accountName: accountData.accountName,
                    bankCode: accountData.bankCode,
                    bankName: accountData.bankName,
                    branchCode: accountData.branchCode,
                    isDefault: accountData.isDefault || false,
                    isVerified: validation.isValid
                }
            });
            return bankAccount;
        }
        catch (error) {
            console.error('Error adding bank account:', error);
            throw error;
        }
    }
    async getUserBankAccounts(userId) {
        return await prisma.bankAccount.findMany({
            where: { userId },
            orderBy: [
                { isDefault: 'desc' },
                { createdAt: 'desc' }
            ]
        });
    }
    async removeBankAccount(userId, accountId) {
        const account = await prisma.bankAccount.findFirst({
            where: { id: accountId, userId }
        });
        if (!account) {
            throw new Error('Bank account not found');
        }
        await prisma.bankAccount.delete({
            where: { id: accountId }
        });
    }
    // --- MOBILE MONEY ACCOUNT MANAGEMENT ---
    async addMobileMoneyAccount(userId, accountData) {
        try {
            // Validate phone number
            const phoneValidation = await this.validatePhoneNumber(accountData.phoneNumber);
            if (!phoneValidation.isValid) {
                throw new Error('Invalid phone number');
            }
            // If setting as default, unset other defaults
            if (accountData.isDefault) {
                await prisma.mobileMoneyAccount.updateMany({
                    where: { userId },
                    data: { isDefault: false }
                });
            }
            const mobileAccount = await prisma.mobileMoneyAccount.create({
                data: {
                    userId,
                    phoneNumber: phoneValidation.formattedNumber,
                    provider: phoneValidation.provider,
                    accountName: accountData.accountName,
                    isDefault: accountData.isDefault || false,
                    isVerified: true // Auto-verify for now
                }
            });
            return mobileAccount;
        }
        catch (error) {
            console.error('Error adding mobile money account:', error);
            throw error;
        }
    }
    async getUserMobileMoneyAccounts(userId) {
        return await prisma.mobileMoneyAccount.findMany({
            where: { userId },
            orderBy: [
                { isDefault: 'desc' },
                { createdAt: 'desc' }
            ]
        });
    }
    // --- PAYMENT SETTINGS ---
    async getPaymentSettings(userId) {
        let settings = await prisma.paymentSettings.findUnique({
            where: { userId }
        });
        if (!settings) {
            settings = await prisma.paymentSettings.create({
                data: {
                    userId,
                    defaultCurrency: 'KES',
                    autoWithdrawal: false,
                    notificationPreferences: JSON.stringify({
                        emailNotifications: true,
                        smsNotifications: true,
                        pushNotifications: true,
                        transactionAlerts: true,
                        lowBalanceAlerts: true,
                        largeTransactionAlerts: true
                    })
                }
            });
        }
        return {
            ...settings,
            // Fix: handle potential null value
            notificationPreferences: settings.notificationPreferences
                ? JSON.parse(settings.notificationPreferences)
                : {
                    emailNotifications: true,
                    smsNotifications: true,
                    pushNotifications: true,
                    transactionAlerts: true,
                    lowBalanceAlerts: true,
                    largeTransactionAlerts: true
                }
        };
    }
    async updatePaymentSettings(userId, updates) {
        return await prisma.paymentSettings.update({
            where: { userId },
            data: {
                ...updates,
                ...(updates.notificationPreferences && {
                    notificationPreferences: JSON.stringify(updates.notificationPreferences)
                })
            }
        });
    }
    // --- TRANSACTION STATUS HELPERS ---
    async retryFailedTransaction(transactionId, userId) {
        const transaction = await prisma.paymentTransaction.findFirst({
            where: { id: transactionId, userId, status: 'failed' }
        });
        if (!transaction) {
            throw new Error('Transaction not found or cannot be retried');
        }
        // Create new transaction with retry logic
        const retryData = {
            userId,
            type: transaction.type,
            method: transaction.method,
            amount: transaction.amount,
            currency: transaction.currency,
            reference: `${transaction.reference}-retry-${Date.now()}`,
            description: `Retry: ${transaction.description}`,
            sourceAccount: transaction.sourceAccount,
            destinationAccount: transaction.destinationAccount,
            phoneNumber: transaction.phoneNumber,
            bankCode: transaction.bankCode,
            accountName: transaction.accountName
        };
        // Process based on transaction type
        if (transaction.type === 'deposit') {
            return await this.deposit(userId, {
                amount: transaction.amount,
                phoneNumber: transaction.phoneNumber,
                reference: retryData.reference,
                description: retryData.description
            });
        }
        else if (transaction.type === 'withdrawal') {
            return await this.withdraw(userId, {
                amount: transaction.amount,
                accountNumber: transaction.destinationAccount,
                bankCode: transaction.bankCode,
                accountName: transaction.accountName,
                reference: retryData.reference,
                description: retryData.description
            });
        }
        else if (transaction.type === 'transfer') {
            // Fix: handle potential null value and parse metadata safely
            const metadata = transaction.metadata && typeof transaction.metadata === 'string'
                ? JSON.parse(transaction.metadata)
                : {};
            return await this.transfer(userId, {
                amount: transaction.amount,
                sourceAccount: transaction.sourceAccount,
                destinationAccount: transaction.destinationAccount,
                destinationBankCode: transaction.bankCode ?? undefined,
                reference: retryData.reference,
                description: retryData.description,
                transferType: metadata.transferType || 'internal'
            });
        }
        else {
            throw new Error('Unsupported transaction type for retry');
        }
    }
    async cancelPendingTransaction(transactionId, userId) {
        const transaction = await prisma.paymentTransaction.findFirst({
            where: {
                id: transactionId,
                userId,
                status: { in: ['pending', 'processing'] }
            }
        });
        if (!transaction) {
            throw new Error('Transaction not found or cannot be cancelled');
        }
        // Update transaction status
        await prisma.paymentTransaction.update({
            where: { id: transactionId },
            data: {
                status: 'cancelled',
                failureReason: 'Cancelled by user',
                updatedAt: new Date()
            }
        });
        // Refund wallet balance for withdrawals/transfers
        if (['withdrawal', 'transfer'].includes(transaction.type)) {
            await this.updateWalletBalance(userId, transaction.amount, 'credit', `${transaction.reference}-cancelled`);
        }
    }
    // --- UTILITY METHODS ---
    async getUserPaymentLimits(userId) {
        // In production, fetch from database based on user verification level, etc.
        // For now, return default limits
        const today = new Date().toISOString().split('T')[0];
        const thisMonth = new Date().toISOString().substring(0, 7);
        // Get current usage
        const [dailyUsage, monthlyUsage] = await Promise.all([
            this.getDailyUsage(userId, today),
            this.getMonthlyUsage(userId, thisMonth)
        ]);
        return {
            userId,
            limits: {
                daily: { deposit: 100000, withdrawal: 50000, transfer: 50000 },
                monthly: { deposit: 1000000, withdrawal: 500000, transfer: 500000 },
                perTransaction: {
                    minDeposit: 10, maxDeposit: 100000,
                    minWithdrawal: 50, maxWithdrawal: 50000,
                    minTransfer: 10, maxTransfer: 50000
                },
                currency: 'KES'
            },
            usedLimits: {
                dailyUsed: {
                    deposit: dailyUsage.deposit,
                    withdrawal: dailyUsage.withdrawal,
                    transfer: dailyUsage.transfer,
                    date: today
                },
                monthlyUsed: {
                    deposit: monthlyUsage.deposit,
                    withdrawal: monthlyUsage.withdrawal,
                    transfer: monthlyUsage.transfer,
                    month: thisMonth
                }
            },
            updatedAt: new Date().toISOString()
        };
    }
    async getDailyUsage(userId, date) {
        const startOfDay = new Date(date + 'T00:00:00.000Z');
        const endOfDay = new Date(date + 'T23:59:59.999Z');
        const usage = await prisma.paymentTransaction.groupBy({
            by: ['type'],
            where: {
                userId,
                status: 'completed',
                createdAt: {
                    gte: startOfDay,
                    lte: endOfDay
                }
            },
            _sum: { amount: true }
        });
        const result = { deposit: 0, withdrawal: 0, transfer: 0 };
        usage.forEach(item => {
            if (item.type in result) {
                result[item.type] = item._sum.amount || 0;
            }
        });
        return result;
    }
    async getMonthlyUsage(userId, month) {
        const startOfMonth = new Date(month + '-01T00:00:00.000Z');
        const endOfMonth = new Date(startOfMonth);
        endOfMonth.setMonth(endOfMonth.getMonth() + 1);
        endOfMonth.setMilliseconds(endOfMonth.getMilliseconds() - 1);
        const usage = await prisma.paymentTransaction.groupBy({
            by: ['type'],
            where: {
                userId,
                status: 'completed',
                createdAt: {
                    gte: startOfMonth,
                    lte: endOfMonth
                }
            },
            _sum: { amount: true }
        });
        const result = { deposit: 0, withdrawal: 0, transfer: 0 };
        usage.forEach(item => {
            if (item.type in result) {
                result[item.type] = item._sum.amount || 0;
            }
        });
        return result;
    }
    async getFeeStructure(type, method) {
        // In production, fetch from database
        // For now, return hardcoded fee structure
        const defaultFees = {
            deposit: {
                mobile_money: {
                    feeType: 'percentage',
                    amount: 1, // 1%
                    minFee: 5,
                    maxFee: 100,
                    currency: 'KES'
                }
            },
            withdrawal: {
                bank_transfer: {
                    feeType: 'fixed',
                    amount: 25,
                    currency: 'KES'
                }
            },
            transfer: {
                mobile_money: {
                    feeType: 'percentage',
                    amount: 0.5, // 0.5%
                    minFee: 10,
                    maxFee: 50,
                    currency: 'KES'
                },
                bank_transfer: {
                    feeType: 'fixed',
                    amount: 50,
                    currency: 'KES'
                }
            }
        };
        return defaultFees[type]?.[method];
    }
    async sendTransactionNotification(userId, transactionId, status) {
        try {
            // Get user details
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { email: true, firstName: true, lastName: true, phone: true }
            });
            if (!user)
                return;
            // Get payment settings
            const settings = await this.getPaymentSettings(userId);
            const notificationPrefs = settings.notificationPreferences;
            // Get transaction details
            const transaction = await this.getTransactionById(transactionId, userId);
            if (!transaction)
                return;
            const message = this.buildNotificationMessage(transaction, status);
            // Send email notification
            if (notificationPrefs.emailNotifications) {
                await this.sendEmailNotification(user.email, message.subject, message.body);
            }
            // Send SMS notification
            if (notificationPrefs.smsNotifications && user.phone) {
                await this.sendSMSNotification(user.phone, message.sms);
            }
            // Log notification sent
            console.log(`Notification sent to user ${userId} for transaction ${transactionId}: ${status}`);
        }
        catch (error) {
            console.error('Error sending transaction notification:', error);
        }
    }
    buildNotificationMessage(transaction, status) {
        const amount = `KES ${transaction.amount.toFixed(2)}`;
        const reference = transaction.reference;
        let subject = '';
        let body = '';
        let sms = '';
        switch (status) {
            case 'completed':
                subject = `${transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1)} Successful`;
                body = `Your ${transaction.type} of ${amount} (Ref: ${reference}) has been completed successfully.`;
                sms = `${transaction.type.toUpperCase()} SUCCESS: ${amount} (${reference}). Thank you for using our service.`;
                break;
            case 'failed':
                subject = `${transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1)} Failed`;
                body = `Your ${transaction.type} of ${amount} (Ref: ${reference}) has failed. ${transaction.failureReason || 'Please try again or contact support.'}`;
                sms = `${transaction.type.toUpperCase()} FAILED: ${amount} (${reference}). Please try again.`;
                break;
            case 'processing':
                subject = `${transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1)} Processing`;
                body = `Your ${transaction.type} of ${amount} (Ref: ${reference}) is being processed. You will be notified once complete.`;
                sms = `${transaction.type.toUpperCase()} PROCESSING: ${amount} (${reference}). Please wait for confirmation.`;
                break;
            default:
                subject = `${transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1)} Update`;
                body = `Your ${transaction.type} of ${amount} (Ref: ${reference}) status: ${status}.`;
                sms = `${transaction.type.toUpperCase()}: ${amount} (${reference}) - ${status.toUpperCase()}.`;
        }
        return { subject, body, sms };
    }
    async sendEmailNotification(email, subject, body) {
        // Implement email sending logic here
        // This could integrate with services like SendGrid, AWS SES, etc.
        console.log(`EMAIL to ${email}: ${subject} - ${body}`);
    }
    async sendSMSNotification(phone, message) {
        // Implement SMS sending logic here
        // This could integrate with services like Twilio, Africa's Talking, etc.
        console.log(`SMS to ${phone}: ${message}`);
    }
    mapJengaStatusToTransactionStatus(jengaStatus) {
        switch (jengaStatus.toLowerCase()) {
            case 'success':
            case 'successful':
                return 'completed';
            case 'failed':
            case 'failure':
                return 'failed';
            case 'pending':
                return 'processing';
            default:
                return 'pending';
        }
    }
    mapJengaCallbackStatusToTransactionStatus(callbackStatus) {
        switch (callbackStatus) {
            case 'SUCCESS':
                return 'completed';
            case 'FAILED':
                return 'failed';
            case 'PENDING':
                return 'processing';
            default:
                return 'pending';
        }
    }
    getPaymentMethodFromTransferType(transferType) {
        switch (transferType) {
            case 'mobile':
                return 'mobile_money';
            case 'internal':
            case 'rtgs':
            case 'swift':
            case 'instant':
            default:
                return 'bank_transfer';
        }
    }
    getJengaTransferType(transferType) {
        switch (transferType) {
            case 'internal':
                return 'InternalFundsTransfer';
            case 'rtgs':
                return 'RtgsTransfer';
            case 'swift':
                return 'SwiftTransfer';
            case 'instant':
                return 'InstantTransfer';
            default:
                return 'InternalFundsTransfer';
        }
    }
    transformToPaymentTransaction(transaction) {
        return {
            id: transaction.id,
            userId: transaction.userId,
            type: transaction.type,
            method: transaction.method,
            amount: transaction.amount,
            currency: transaction.currency,
            status: transaction.status,
            reference: transaction.reference,
            externalId: transaction.externalId,
            jengaTransactionId: transaction.jengaTransactionId,
            description: transaction.description,
            metadata: transaction.metadata && typeof transaction.metadata === 'string'
                ? JSON.parse(transaction.metadata)
                : undefined, // Fix: safely parse metadata
            charges: transaction.charges,
            netAmount: transaction.netAmount,
            sourceAccount: transaction.sourceAccount,
            destinationAccount: transaction.destinationAccount,
            phoneNumber: transaction.phoneNumber,
            bankCode: transaction.bankCode,
            accountName: transaction.accountName,
            failureReason: transaction.failureReason,
            callbackUrl: transaction.callbackUrl,
            createdAt: transaction.createdAt.toISOString(),
            updatedAt: transaction.updatedAt.toISOString(),
            completedAt: transaction.completedAt?.toISOString()
        };
    }
    async calculateTransactionSummary(userId, whereClause) {
        const result = await prisma.paymentTransaction.aggregate({
            where: whereClause,
            _sum: {
                amount: true,
                charges: true
            },
            _count: true
        });
        const [deposits, withdrawals, transfers] = await Promise.all([
            prisma.paymentTransaction.aggregate({
                where: { ...whereClause, type: 'deposit', status: 'completed' },
                _sum: { amount: true },
                _count: true
            }),
            prisma.paymentTransaction.aggregate({
                where: { ...whereClause, type: 'withdrawal', status: 'completed' },
                _sum: { amount: true },
                _count: true
            }),
            prisma.paymentTransaction.aggregate({
                where: { ...whereClause, type: 'transfer', status: 'completed' },
                _sum: { amount: true },
                _count: true
            })
        ]);
        return {
            totalDeposits: deposits._sum.amount || 0,
            totalWithdrawals: withdrawals._sum.amount || 0,
            totalTransfers: transfers._sum.amount || 0,
            totalCharges: result._sum.charges || 0,
            netAmount: (deposits._sum.amount || 0) - (withdrawals._sum.amount || 0) - (transfers._sum.amount || 0),
            transactionCount: result._count
        };
    }
}
exports.PaymentService = PaymentService;
