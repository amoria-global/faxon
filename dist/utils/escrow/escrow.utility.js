"use strict";
//src/utils/escrow/escrow.utility.ts
// --- UTILITY FUNCTIONS ---
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EscrowNotificationHelper = exports.EscrowMonitoring = exports.EscrowTestUtils = exports.EscrowErrorCodes = exports.EscrowError = exports.EscrowJobHandlers = exports.EscrowUtils = void 0;
const crypto_1 = __importDefault(require("crypto"));
const config_1 = require("../../config/config");
class EscrowUtils {
    /**
     * Generate a unique escrow reference
     */
    static generateEscrowReference(prefix = 'ESC') {
        const timestamp = Date.now().toString(36);
        const randomBytes = crypto_1.default.randomBytes(4).toString('hex').toUpperCase();
        return `${prefix}-${timestamp}-${randomBytes}`;
    }
    /**
     * Validate escrow amount based on currency
     */
    static validateAmount(amount, currency) {
        const errors = [];
        const currencyConfig = config_1.config.currencies;
        const currencySettings = currencyConfig[currency.toLowerCase()];
        if (!currencySettings) {
            errors.push(`Unsupported currency: ${currency}`);
            return { isValid: false, errors };
        }
        if (amount < currencySettings.minAmount) {
            errors.push(`Minimum amount for ${currency} is ${currencySettings.minAmount}`);
        }
        if (amount > currencySettings.maxAmount) {
            errors.push(`Maximum amount for ${currency} is ${currencySettings.maxAmount}`);
        }
        // Check decimal places
        const decimalPlaces = (amount.toString().split('.')[1] || '').length;
        if (decimalPlaces > currencySettings.decimals) {
            errors.push(`${currency} supports maximum ${currencySettings.decimals} decimal places`);
        }
        return { isValid: errors.length === 0, errors };
    }
    /**
     * Calculate escrow fees
     */
    static calculateEscrowFees(amount, transactionType, currency = 'USD') {
        const feePercentage = config_1.config.escrow.fees[transactionType] || 0;
        let serviceFee = (amount * feePercentage) / 100;
        // Apply minimum and maximum fee limits
        const minFee = currency === 'USD' ? 0.5 : (currency === 'RWF' ? 500 : 10);
        const maxFee = currency === 'USD' ? 100 : (currency === 'RWF' ? 100000 : 10000);
        serviceFee = Math.max(minFee, Math.min(serviceFee, maxFee));
        const processingFee = currency === 'USD' ? 0.25 : (currency === 'RWF' ? 250 : 25);
        const totalFees = serviceFee + processingFee;
        const netAmount = amount - totalFees;
        return { serviceFee, processingFee, totalFees, netAmount };
    }
    /**
     * Format currency amount
     */
    static formatCurrency(amount, currency) {
        const currencyConfig = config_1.config.currencies;
        const currencySettings = currencyConfig[currency.toLowerCase()];
        if (!currencySettings) {
            return `${amount} ${currency}`;
        }
        const formattedAmount = amount.toFixed(currencySettings.decimals);
        return `${currencySettings.symbol}${formattedAmount}`;
    }
    /**
     * Generate secure webhook signature
     */
    static generateWebhookSignature(payload, secret) {
        return crypto_1.default.createHmac('sha256', secret).update(payload).digest('hex');
    }
    /**
     * Verify webhook signature
     */
    static verifyWebhookSignature(payload, signature, secret) {
        const expectedSignature = this.generateWebhookSignature(payload, secret);
        return crypto_1.default.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSignature, 'hex'));
    }
    /**
     * Calculate dispute deadline
     */
    static calculateDisputeDeadline(daysFromNow = 30) {
        const deadline = new Date();
        deadline.setDate(deadline.getDate() + daysFromNow);
        return deadline;
    }
    /**
     * Check if escrow is expired
     */
    static isEscrowExpired(createdAt, maxHoldingDays = 365) {
        const expiryDate = new Date(createdAt);
        expiryDate.setDate(expiryDate.getDate() + maxHoldingDays);
        return new Date() > expiryDate;
    }
    /**
     * Sanitize user input for escrow descriptions
     */
    static sanitizeDescription(description) {
        return description
            .replace(/[<>]/g, '') // Remove HTML tags
            .replace(/['"]/g, '') // Remove quotes
            .slice(0, 500) // Limit length
            .trim();
    }
    /**
     * Generate escrow terms template
     */
    static generateDefaultEscrowTerms(type) {
        const baseTerms = {
            type,
            description: '',
            conditions: [],
            autoRelease: { enabled: false },
            disputeSettings: { allowDisputes: true, deadline: this.calculateDisputeDeadline() }
        };
        switch (type) {
            case 'manual':
                return {
                    ...baseTerms,
                    description: 'Manual release escrow - funds released when both parties agree',
                    conditions: ['Buyer confirms goods/services received', 'Seller confirms delivery completion']
                };
            case 'automatic':
                return {
                    ...baseTerms,
                    description: 'Automatic release escrow - funds released automatically after time period',
                    conditions: ['Auto-release after specified time period'],
                    autoRelease: { enabled: true, date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } // 7 days
                };
            case 'milestone':
                return {
                    ...baseTerms,
                    description: 'Milestone-based escrow - funds released as milestones are completed',
                    conditions: ['Complete milestone 1', 'Complete milestone 2', 'Final delivery confirmation'],
                    milestones: [
                        { id: '1', title: 'Project Start', percentage: 25, amount: 0 },
                        { id: '2', title: 'Midpoint Review', percentage: 50, amount: 0 },
                        { id: '3', title: 'Final Delivery', percentage: 25, amount: 0 }
                    ]
                };
            case 'conditional':
                return {
                    ...baseTerms,
                    description: 'Conditional release escrow - funds released when specific conditions are met',
                    conditions: ['Condition 1 must be verified', 'Condition 2 must be approved', 'Documentation must be provided']
                };
            default:
                return baseTerms;
        }
    }
}
exports.EscrowUtils = EscrowUtils;
class EscrowJobHandlers {
    /**
     * Check for escrows ready for auto-release
     */
    static async checkAutoRelease() {
        try {
            console.log('🔄 Checking escrows for auto-release...');
            // Implementation would query database for escrows with auto-release dates that have passed
            // This is a placeholder - implement actual database query
            console.log('✅ Auto-release check completed');
        }
        catch (error) {
            console.error('❌ Auto-release check failed:', error);
        }
    }
    /**
     * Check for escrows approaching dispute deadline
     */
    static async checkDisputeDeadlines() {
        try {
            console.log('🔄 Checking dispute deadlines...');
            // Implementation would query database for escrows approaching dispute deadline
            // Send notifications to users about upcoming deadlines
            console.log('✅ Dispute deadline check completed');
        }
        catch (error) {
            console.error('❌ Dispute deadline check failed:', error);
        }
    }
    /**
     * Clean up expired escrows
     */
    static async cleanupExpiredEscrows() {
        try {
            console.log('🔄 Cleaning up expired escrows...');
            // Implementation would handle expired escrows based on business rules
            console.log('✅ Expired escrow cleanup completed');
        }
        catch (error) {
            console.error('❌ Expired escrow cleanup failed:', error);
        }
    }
}
exports.EscrowJobHandlers = EscrowJobHandlers;
// --- ERROR HANDLING ---
class EscrowError extends Error {
    constructor(message, code = 'ESCROW_ERROR', statusCode = 400, details) {
        super(message);
        this.name = 'EscrowError';
        this.code = code;
        this.statusCode = statusCode;
        this.details = details;
    }
}
exports.EscrowError = EscrowError;
exports.EscrowErrorCodes = {
    INVALID_AMOUNT: 'INVALID_AMOUNT',
    INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
    ESCROW_NOT_FOUND: 'ESCROW_NOT_FOUND',
    UNAUTHORIZED_RELEASE: 'UNAUTHORIZED_RELEASE',
    DISPUTE_DEADLINE_PASSED: 'DISPUTE_DEADLINE_PASSED',
    ESCROW_ALREADY_RELEASED: 'ESCROW_ALREADY_RELEASED',
    ESCROW_EXPIRED: 'ESCROW_EXPIRED',
    INVALID_CURRENCY: 'INVALID_CURRENCY',
    RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
    WEBHOOK_VERIFICATION_FAILED: 'WEBHOOK_VERIFICATION_FAILED'
};
// --- TESTING UTILITIES ---
class EscrowTestUtils {
    /**
     * Generate test escrow data
     */
    static generateTestEscrowData(overrides = {}) {
        return {
            amount: 100,
            currency: 'USD',
            reference: EscrowUtils.generateEscrowReference('TEST'),
            description: 'Test escrow transaction',
            recipientId: 2,
            escrowTerms: EscrowUtils.generateDefaultEscrowTerms('manual'),
            ...overrides
        };
    }
    /**
     * Generate test webhook payload
     */
    static generateTestWebhookPayload(eventType, escrowId) {
        return {
            event_type: eventType,
            escrow_id: escrowId,
            transaction_id: EscrowUtils.generateEscrowReference('TXN'),
            status: 'funded',
            timestamp: new Date().toISOString(),
            data: {
                amount: '100.00',
                currency: 'USD'
            }
        };
    }
    /**
     * Mock escrow API responses
     */
    static mockEscrowApiResponse(success = true) {
        if (success) {
            return {
                success: true,
                escrow_id: 'escrow_' + crypto_1.default.randomUUID(),
                transaction_id: 'txn_' + crypto_1.default.randomUUID(),
                status: 'pending',
                payment_url: 'https://example.com/pay/123'
            };
        }
        else {
            return {
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Invalid request data'
                }
            };
        }
    }
}
exports.EscrowTestUtils = EscrowTestUtils;
// --- MONITORING AND HEALTH CHECKS ---
class EscrowMonitoring {
    /**
     * Check escrow service health
     */
    static async checkEscrowServiceHealth() {
        const startTime = Date.now();
        try {
            // Make a simple API call to check service availability
            // This is a placeholder - implement actual health check
            const latency = Date.now() - startTime;
            return { status: 'healthy', latency };
        }
        catch (error) {
            const latency = Date.now() - startTime;
            return { status: 'unhealthy', latency, error: error.message };
        }
    }
    /**
     * Get escrow system metrics
     */
    static async getEscrowMetrics() {
        try {
            // Implementation would gather metrics from database
            return {
                totalEscrows: 0,
                activeEscrows: 0,
                completedEscrows: 0,
                disputedEscrows: 0,
                totalValue: 0,
                averageResolutionTime: 0
            };
        }
        catch (error) {
            console.error('Failed to get escrow metrics:', error);
            return null;
        }
    }
}
exports.EscrowMonitoring = EscrowMonitoring;
// --- NOTIFICATION HELPERS ---
class EscrowNotificationHelper {
    /**
     * Send escrow notification
     */
    static async sendEscrowNotification(userId, type, title, message, data) {
        try {
            // Implementation would create notification record and send via configured channels
            console.log(`📧 Sending ${type} notification to user ${userId}: ${title}`);
        }
        catch (error) {
            console.error('Failed to send escrow notification:', error);
        }
    }
    /**
     * Generate notification templates
     */
    static getNotificationTemplate(type, data) {
        const templates = {
            escrow_created: (data) => ({
                title: 'Escrow Created',
                message: `Your escrow payment of ${EscrowUtils.formatCurrency(data.amount, data.currency)} has been created. Reference: ${data.reference}`
            }),
            escrow_funded: (data) => ({
                title: 'Escrow Funded',
                message: `Escrow payment ${data.reference} has been successfully funded and is now active.`
            }),
            escrow_released: (data) => ({
                title: 'Escrow Released',
                message: `Escrow payment ${data.reference} has been released. Funds are being transferred to your account.`
            }),
            dispute_created: (data) => ({
                title: 'Dispute Created',
                message: `A dispute has been opened for escrow ${data.reference}. Please provide any supporting evidence.`
            })
        };
        return templates[type]?.(data) || { title: 'Escrow Update', message: 'Your escrow status has been updated.' };
    }
}
exports.EscrowNotificationHelper = EscrowNotificationHelper;
