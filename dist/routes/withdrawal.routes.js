"use strict";
// src/routes/withdrawal.routes.ts - Withdrawal routes with SMS OTP
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const auth_middleware_1 = require("../middleware/auth.middleware");
const sms_service_1 = __importDefault(require("../services/sms.service"));
const escrow_service_1 = require("../services/escrow.service");
const pesapal_service_1 = require("../services/pesapal.service");
const email_service_1 = require("../services/email.service");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const config_1 = require("../config/config");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
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
// Rate limiting for OTP requests
const otpRateLimit = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 30, // limit each IP to 3 OTP requests per windowMs
    message: {
        success: false,
        message: 'Too many OTP requests, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});
// Rate limiting for withdrawal requests
const withdrawalRateLimit = (0, express_rate_limit_1.default)({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // limit each IP to 5 withdrawal requests per hour
    message: {
        success: false,
        message: 'Too many withdrawal attempts, please try again later.'
    }
});
/**
 * Request withdrawal OTP
 * POST /api/payments/withdrawal/request-otp
 */
router.post('/request-otp', auth_middleware_1.authenticate, otpRateLimit, async (req, res) => {
    try {
        const { amount } = req.body;
        const userId = parseInt(req.user.userId);
        // Validation
        if (!amount || amount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Valid amount is required'
            });
        }
        if (amount < 500) {
            return res.status(400).json({
                success: false,
                message: 'Minimum withdrawal amount is 500 RWF'
            });
        }
        if (amount > 5000000) {
            return res.status(400).json({
                success: false,
                message: 'Maximum withdrawal amount is 5,000,000 RWF'
            });
        }
        // Get user details from database - OTP will ONLY be sent to registered phone
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                phone: true,
                phoneCountryCode: true,
                kycCompleted: true,
                kycStatus: true,
                verificationStatus: true
            }
        });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        // SECURITY: Only use phone number already registered in database
        if (!user.phone || user.phone.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'No phone number registered. Please add a phone number to your profile first.',
                requiresPhoneSetup: true
            });
        }
        // Optional: Check if phone should be verified for high-value withdrawals
        if (amount > 100000 && user.verificationStatus !== 'verified') {
            return res.status(400).json({
                success: false,
                message: 'Phone verification required for large withdrawals. Please verify your phone number first.',
                requiresPhoneVerification: true
            });
        }
        // Check KYC status
        if (!user.kycCompleted || user.kycStatus !== 'approved') {
            return res.status(403).json({
                success: false,
                message: 'KYC verification required for withdrawals',
                kycRequired: true
            });
        }
        // Check user wallet balance
        const wallet = await escrowService.getUserWallet(userId);
        if (!wallet || wallet.balance < amount) {
            return res.status(400).json({
                success: false,
                message: 'Insufficient wallet balance',
                availableBalance: wallet?.balance || 0
            });
        }
        // Send OTP
        const result = await sms_service_1.default.sendWithdrawalOTP(userId, user.phone, amount, wallet.currency);
        if (result.success) {
            // Mask phone number for security
            const maskedPhone = maskPhoneNumber(user.phone);
            res.status(200).json({
                success: true,
                message: 'OTP sent successfully',
                data: {
                    messageId: result.messageId,
                    expiresIn: result.expiresIn,
                    maskedPhone,
                    amount,
                    currency: wallet.currency
                }
            });
        }
        else {
            res.status(500).json({
                success: false,
                message: result.message
            });
        }
    }
    catch (error) {
        console.error('Request withdrawal OTP error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send OTP'
        });
    }
});
/**
 * Verify OTP and process withdrawal
 * POST /api/payments/withdrawal/verify-and-withdraw
 */
router.post('/verify-and-withdraw', auth_middleware_1.authenticate, withdrawalRateLimit, async (req, res) => {
    try {
        const { otp, amount, accountId, method = 'MOBILE', destination } = req.body;
        const userId = parseInt(req.user.userId);
        // Validation
        if (!otp || !amount) {
            return res.status(400).json({
                success: false,
                message: 'OTP and amount are required'
            });
        }
        if (!['MOBILE', 'BANK'].includes(method)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid withdrawal method. Use MOBILE or BANK'
            });
        }
        // Verify OTP
        const otpResult = await sms_service_1.default.verifyWithdrawalOTP(userId, otp, amount);
        if (!otpResult.success) {
            return res.status(400).json({
                success: false,
                message: otpResult.message
            });
        }
        // Get user details
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        // Check wallet balance again
        const wallet = await escrowService.getUserWallet(userId);
        if (!wallet || wallet.balance < amount) {
            return res.status(400).json({
                success: false,
                message: 'Insufficient wallet balance'
            });
        }
        // Prepare withdrawal destination
        let withdrawalDestination = destination;
        if (!withdrawalDestination) {
            // Use user's phone as default for mobile withdrawal
            if (method === 'MOBILE' && user.phone) {
                withdrawalDestination = {
                    holderName: `${user.firstName} ${user.lastName}`,
                    accountNumber: user.phone,
                    countryCode: user.phoneCountryCode || 'RW',
                    mobileProvider: 'MTN' // Default, should be configurable
                };
            }
            else {
                return res.status(400).json({
                    success: false,
                    message: 'Withdrawal destination details are required'
                });
            }
        }
        // Create withdrawal using escrow service
        const withdrawalData = {
            amount,
            method: method,
            destination: withdrawalDestination,
            reference: `WD-${Date.now()}-${userId}`,
            particulars: `Wallet withdrawal - ${amount} ${wallet.currency}`
        };
        const withdrawal = await escrowService.createWithdrawal(userId, withdrawalData);
        // Send confirmation SMS
        try {
            await sms_service_1.default.sendTransactionStatusSMS(userId, user.phone, 'withdrawal', amount, wallet.currency, 'pending');
        }
        catch (smsError) {
            console.error('Failed to send withdrawal confirmation SMS:', smsError);
        }
        res.status(200).json({
            success: true,
            message: 'Withdrawal processed successfully',
            data: {
                withdrawalId: withdrawal.id,
                amount: withdrawal.amount,
                currency: withdrawal.currency,
                method: withdrawal.method,
                status: withdrawal.status,
                reference: withdrawal.reference,
                estimatedDelivery: '1-3 business days',
                newBalance: wallet.balance - amount
            }
        });
    }
    catch (error) {
        console.error('Withdrawal verification error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Withdrawal processing failed'
        });
    }
});
/**
 * Resend withdrawal OTP
 * POST /api/payments/withdrawal/resend-otp
 */
router.post('/resend-otp', auth_middleware_1.authenticate, otpRateLimit, async (req, res) => {
    try {
        const { amount } = req.body;
        const userId = parseInt(req.user.userId);
        if (!amount) {
            return res.status(400).json({
                success: false,
                message: 'Amount is required'
            });
        }
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });
        if (!user || !user.phone) {
            return res.status(400).json({
                success: false,
                message: 'Phone number not found'
            });
        }
        const wallet = await escrowService.getUserWallet(userId);
        const result = await sms_service_1.default.resendWithdrawalOTP(userId, user.phone, amount, wallet.currency);
        if (result.success) {
            res.status(200).json({
                success: true,
                message: 'OTP resent successfully',
                data: {
                    messageId: result.messageId,
                    expiresIn: result.expiresIn
                }
            });
        }
        else {
            res.status(400).json({
                success: false,
                message: result.message
            });
        }
    }
    catch (error) {
        console.error('Resend OTP error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to resend OTP'
        });
    }
});
/**
 * Get withdrawal history
 * GET /api/payments/withdrawal/history
 */
router.get('/history', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const userId = parseInt(req.user.userId);
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        const [withdrawals, total] = await Promise.all([
            prisma.withdrawalRequest.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit
            }),
            prisma.withdrawalRequest.count({
                where: { userId }
            })
        ]);
        const totalPages = Math.ceil(total / limit);
        res.status(200).json({
            success: true,
            data: {
                withdrawals: withdrawals.map(w => ({
                    id: w.id,
                    amount: w.amount,
                    currency: w.currency,
                    method: w.method,
                    status: w.status,
                    reference: w.reference,
                    destination: JSON.parse(w.destination),
                    failureReason: w.failureReason,
                    createdAt: w.createdAt,
                    completedAt: w.completedAt
                })),
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages,
                    hasNext: page < totalPages,
                    hasPrev: page > 1
                }
            }
        });
    }
    catch (error) {
        console.error('Get withdrawal history error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve withdrawal history'
        });
    }
});
/**
 * Get withdrawal limits and wallet info
 * GET /api/payments/withdrawal/info
 */
router.get('/info', auth_middleware_1.authenticate, async (req, res) => {
    try {
        const userId = parseInt(req.user.userId);
        const [user, wallet] = await Promise.all([
            prisma.user.findUnique({
                where: { id: userId },
                select: {
                    kycCompleted: true,
                    kycStatus: true,
                    phone: true,
                    phoneCountryCode: true
                }
            }),
            escrowService.getUserWallet(userId)
        ]);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        res.status(200).json({
            success: true,
            data: {
                wallet: {
                    balance: wallet.balance,
                    currency: wallet.currency,
                    isActive: wallet.isActive
                },
                limits: {
                    minimum: 500,
                    maximum: 5000000,
                    daily: 2000000,
                    monthly: 10000000
                },
                kyc: {
                    completed: user.kycCompleted,
                    status: user.kycStatus,
                    required: !user.kycCompleted || user.kycStatus !== 'approved'
                },
                phoneVerified: !!user.phone,
                supportedMethods: ['MOBILE', 'BANK'],
                currency: wallet.currency
            }
        });
    }
    catch (error) {
        console.error('Get withdrawal info error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve withdrawal information'
        });
    }
});
// === HELPER FUNCTIONS ===
function maskPhoneNumber(phoneNumber) {
    if (phoneNumber.length < 4)
        return phoneNumber;
    const start = phoneNumber.substring(0, 4);
    const end = phoneNumber.substring(phoneNumber.length - 4);
    const masked = '*'.repeat(phoneNumber.length - 8);
    return start + masked + end;
}
// === ADMIN ROUTES ===
/**
 * Get all withdrawal requests (admin only)
 * GET /api/payments/withdrawal/admin/all
 */
router.get('/admin/all', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin'), async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const status = req.query.status;
        const skip = (page - 1) * limit;
        const whereClause = {};
        if (status && status !== 'all') {
            whereClause.status = status;
        }
        const [withdrawals, total] = await Promise.all([
            prisma.withdrawalRequest.findMany({
                where: whereClause,
                include: {
                    user: {
                        select: {
                            id: true,
                            email: true,
                            firstName: true,
                            lastName: true,
                            phone: true
                        }
                    }
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit
            }),
            prisma.withdrawalRequest.count({ where: whereClause })
        ]);
        res.status(200).json({
            success: true,
            data: {
                withdrawals,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit)
                }
            }
        });
    }
    catch (error) {
        console.error('Admin get withdrawals error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve withdrawal requests'
        });
    }
});
/**
 * Update withdrawal status (admin only)
 * PATCH /api/payments/withdrawal/admin/:id/status
 */
router.patch('/admin/:id/status', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const { status, reason } = req.body;
        if (!['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status'
            });
        }
        const updateData = { status };
        if (status === 'COMPLETED') {
            updateData.completedAt = new Date();
        }
        else if (status === 'FAILED' && reason) {
            updateData.failureReason = reason;
        }
        const withdrawal = await prisma.withdrawalRequest.update({
            where: { id },
            data: updateData,
            include: {
                user: {
                    select: { phone: true, firstName: true, lastName: true }
                }
            }
        });
        // Send SMS notification
        if (withdrawal.user.phone) {
            try {
                await sms_service_1.default.sendTransactionStatusSMS(withdrawal.userId, withdrawal.user.phone, 'withdrawal', withdrawal.amount, withdrawal.currency, status.toLowerCase());
            }
            catch (smsError) {
                console.error('Failed to send status SMS:', smsError);
            }
        }
        res.status(200).json({
            success: true,
            message: 'Withdrawal status updated successfully',
            data: withdrawal
        });
    }
    catch (error) {
        console.error('Update withdrawal status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update withdrawal status'
        });
    }
});
exports.default = router;
