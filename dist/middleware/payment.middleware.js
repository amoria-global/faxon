"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logPaymentRequest = exports.ipWhitelist = exports.sanitizePaymentData = exports.validateAccountNumber = exports.validateKenyanPhoneNumber = exports.validateAmount = exports.validateTransactionReference = exports.validateWebhookSignature = exports.validateBalanceInquiry = exports.validateTransfer = exports.validateWithdrawal = exports.validateDeposit = exports.rateLimitPayments = void 0;
const crypto_1 = __importDefault(require("crypto"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
// --- RATE LIMITING ---
exports.rateLimitPayments = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // Limit each IP to 50 payment requests per windowMs
    message: {
        success: false,
        message: 'Too many payment requests, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Skip successful requests
    skipSuccessfulRequests: true,
    // Skip requests from whitelisted IPs (if needed)
    skip: (req) => {
        const whitelistedIPs = process.env.WHITELISTED_IPS?.split(',') || [];
        const clientIP = req.ip;
        return clientIP ? whitelistedIPs.includes(clientIP) : false;
    }
});
// --- DEPOSIT VALIDATION ---
const validateDeposit = (req, res, next) => {
    try {
        const data = req.body;
        const errors = [];
        // Required fields validation
        if (!data.amount) {
            errors.push('Amount is required');
        }
        else if (typeof data.amount !== 'number' || data.amount <= 0) {
            errors.push('Amount must be a positive number');
        }
        else if (data.amount < 10) {
            errors.push('Minimum deposit amount is 10 KES');
        }
        else if (data.amount > 100000) {
            errors.push('Maximum deposit amount is 100,000 KES');
        }
        if (!data.phoneNumber) {
            errors.push('Phone number is required');
        }
        else if (typeof data.phoneNumber !== 'string') {
            errors.push('Phone number must be a string');
        }
        else {
            // Validate Kenyan phone number format
            const phoneRegex = /^(\+254|254|0)?[17]\d{8}$/;
            const cleanPhone = data.phoneNumber.replace(/\s|-/g, '');
            if (!phoneRegex.test(cleanPhone)) {
                errors.push('Invalid Kenyan phone number format. Use format: 0712345678, 254712345678, or +254712345678');
            }
        }
        if (!data.reference) {
            errors.push('Reference is required');
        }
        else if (typeof data.reference !== 'string' || data.reference.length < 3) {
            errors.push('Reference must be at least 3 characters long');
        }
        else if (data.reference.length > 50) {
            errors.push('Reference must be less than 50 characters');
        }
        else if (!/^[a-zA-Z0-9-_]+$/.test(data.reference)) {
            errors.push('Reference can only contain letters, numbers, hyphens, and underscores');
        }
        // Optional fields validation
        if (data.description && (typeof data.description !== 'string' || data.description.length > 200)) {
            errors.push('Description must be a string with maximum 200 characters');
        }
        if (data.callbackUrl && !isValidUrl(data.callbackUrl)) {
            errors.push('Callback URL must be a valid HTTPS URL');
        }
        if (errors.length > 0) {
            res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors
            });
            return;
        }
        next();
    }
    catch (error) {
        console.error('Deposit validation error:', error);
        res.status(500).json({
            success: false,
            message: 'Validation error'
        });
    }
};
exports.validateDeposit = validateDeposit;
// --- WITHDRAWAL VALIDATION ---
const validateWithdrawal = (req, res, next) => {
    try {
        const data = req.body;
        const errors = [];
        // Required fields validation
        if (!data.amount) {
            errors.push('Amount is required');
        }
        else if (typeof data.amount !== 'number' || data.amount <= 0) {
            errors.push('Amount must be a positive number');
        }
        else if (data.amount < 50) {
            errors.push('Minimum withdrawal amount is 50 KES');
        }
        else if (data.amount > 50000) {
            errors.push('Maximum withdrawal amount is 50,000 KES');
        }
        if (!data.accountNumber) {
            errors.push('Account number is required');
        }
        else if (typeof data.accountNumber !== 'string' || data.accountNumber.length < 8) {
            errors.push('Account number must be at least 8 characters long');
        }
        else if (data.accountNumber.length > 20) {
            errors.push('Account number must be less than 20 characters');
        }
        else if (!/^\d+$/.test(data.accountNumber)) {
            errors.push('Account number must contain only digits');
        }
        if (!data.bankCode) {
            errors.push('Bank code is required');
        }
        else if (typeof data.bankCode !== 'string' || data.bankCode.length < 2) {
            errors.push('Bank code must be at least 2 characters long');
        }
        else if (data.bankCode.length > 10) {
            errors.push('Bank code must be less than 10 characters');
        }
        if (!data.accountName) {
            errors.push('Account name is required');
        }
        else if (typeof data.accountName !== 'string' || data.accountName.length < 2) {
            errors.push('Account name must be at least 2 characters long');
        }
        else if (data.accountName.length > 100) {
            errors.push('Account name must be less than 100 characters');
        }
        else if (!/^[a-zA-Z\s.-]+$/.test(data.accountName)) {
            errors.push('Account name can only contain letters, spaces, dots, and hyphens');
        }
        if (!data.reference) {
            errors.push('Reference is required');
        }
        else if (typeof data.reference !== 'string' || data.reference.length < 3) {
            errors.push('Reference must be at least 3 characters long');
        }
        else if (data.reference.length > 50) {
            errors.push('Reference must be less than 50 characters');
        }
        else if (!/^[a-zA-Z0-9-_]+$/.test(data.reference)) {
            errors.push('Reference can only contain letters, numbers, hyphens, and underscores');
        }
        // Optional fields validation
        if (data.description && (typeof data.description !== 'string' || data.description.length > 200)) {
            errors.push('Description must be a string with maximum 200 characters');
        }
        if (data.callbackUrl && !isValidUrl(data.callbackUrl)) {
            errors.push('Callback URL must be a valid HTTPS URL');
        }
        if (errors.length > 0) {
            res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors
            });
            return;
        }
        next();
    }
    catch (error) {
        console.error('Withdrawal validation error:', error);
        res.status(500).json({
            success: false,
            message: 'Validation error'
        });
    }
};
exports.validateWithdrawal = validateWithdrawal;
// --- TRANSFER VALIDATION ---
const validateTransfer = (req, res, next) => {
    try {
        const data = req.body;
        const errors = [];
        // Required fields validation
        if (!data.amount) {
            errors.push('Amount is required');
        }
        else if (typeof data.amount !== 'number' || data.amount <= 0) {
            errors.push('Amount must be a positive number');
        }
        else if (data.amount < 10) {
            errors.push('Minimum transfer amount is 10 KES');
        }
        else if (data.amount > 50000) {
            errors.push('Maximum transfer amount is 50,000 KES');
        }
        if (!data.sourceAccount) {
            errors.push('Source account is required');
        }
        else if (typeof data.sourceAccount !== 'string' || data.sourceAccount.length < 8) {
            errors.push('Source account must be at least 8 characters long');
        }
        if (!data.destinationAccount) {
            errors.push('Destination account is required');
        }
        else if (typeof data.destinationAccount !== 'string' || data.destinationAccount.length < 8) {
            errors.push('Destination account must be at least 8 characters long');
        }
        if (!data.transferType) {
            errors.push('Transfer type is required');
        }
        else {
            const validTypes = ['internal', 'rtgs', 'swift', 'mobile', 'instant'];
            if (!validTypes.includes(data.transferType)) {
                errors.push(`Transfer type must be one of: ${validTypes.join(', ')}`);
            }
        }
        if (!data.reference) {
            errors.push('Reference is required');
        }
        else if (typeof data.reference !== 'string' || data.reference.length < 3) {
            errors.push('Reference must be at least 3 characters long');
        }
        else if (data.reference.length > 50) {
            errors.push('Reference must be less than 50 characters');
        }
        else if (!/^[a-zA-Z0-9-_]+$/.test(data.reference)) {
            errors.push('Reference can only contain letters, numbers, hyphens, and underscores');
        }
        // Validate mobile transfer specific fields
        if (data.transferType === 'mobile') {
            const phoneRegex = /^(\+254|254|0)?[17]\d{8}$/;
            const cleanPhone = data.destinationAccount.replace(/\s|-/g, '');
            if (!phoneRegex.test(cleanPhone)) {
                errors.push('Invalid mobile number format for mobile transfer');
            }
        }
        else {
            // Bank transfer validation
            if (!data.destinationBankCode) {
                errors.push('Destination bank code is required for bank transfers');
            }
            else if (typeof data.destinationBankCode !== 'string' || data.destinationBankCode.length < 2) {
                errors.push('Destination bank code must be at least 2 characters long');
            }
        }
        // Source and destination cannot be the same
        if (data.sourceAccount === data.destinationAccount) {
            errors.push('Source and destination accounts cannot be the same');
        }
        // Optional fields validation
        if (data.description && (typeof data.description !== 'string' || data.description.length > 200)) {
            errors.push('Description must be a string with maximum 200 characters');
        }
        if (data.callbackUrl && !isValidUrl(data.callbackUrl)) {
            errors.push('Callback URL must be a valid HTTPS URL');
        }
        if (errors.length > 0) {
            res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors
            });
            return;
        }
        next();
    }
    catch (error) {
        console.error('Transfer validation error:', error);
        res.status(500).json({
            success: false,
            message: 'Validation error'
        });
    }
};
exports.validateTransfer = validateTransfer;
// --- BALANCE INQUIRY VALIDATION ---
const validateBalanceInquiry = (req, res, next) => {
    try {
        const data = req.body;
        const errors = [];
        // Required fields validation
        if (!data.accountNumber) {
            errors.push('Account number is required');
        }
        else if (typeof data.accountNumber !== 'string' || data.accountNumber.length < 8) {
            errors.push('Account number must be at least 8 characters long');
        }
        else if (data.accountNumber.length > 20) {
            errors.push('Account number must be less than 20 characters');
        }
        else if (!/^\d+$/.test(data.accountNumber)) {
            errors.push('Account number must contain only digits');
        }
        // Optional fields validation
        if (data.countryCode) {
            if (typeof data.countryCode !== 'string' || data.countryCode.length !== 2) {
                errors.push('Country code must be a 2-character string (e.g., KE)');
            }
            else if (!/^[A-Z]{2}$/.test(data.countryCode)) {
                errors.push('Country code must be uppercase letters (e.g., KE)');
            }
        }
        if (errors.length > 0) {
            res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors
            });
            return;
        }
        next();
    }
    catch (error) {
        console.error('Balance inquiry validation error:', error);
        res.status(500).json({
            success: false,
            message: 'Validation error'
        });
    }
};
exports.validateBalanceInquiry = validateBalanceInquiry;
// --- WEBHOOK SIGNATURE VALIDATION ---
const validateWebhookSignature = (req, res, next) => {
    try {
        const signature = req.headers['x-jenga-signature'];
        const webhookSecret = process.env.JENGA_WEBHOOK_SECRET;
        if (!webhookSecret) {
            console.error('Webhook secret not configured');
            res.status(500).json({
                success: false,
                message: 'Webhook configuration error'
            });
            return;
        }
        if (!signature) {
            res.status(401).json({
                success: false,
                message: 'Missing webhook signature'
            });
            return;
        }
        // Verify signature
        const payload = JSON.stringify(req.body);
        const expectedSignature = crypto_1.default
            .createHmac('sha256', webhookSecret)
            .update(payload)
            .digest('hex');
        const receivedSignature = signature.replace('sha256=', '');
        // Use constant time comparison to prevent timing attacks
        const isValidSignature = crypto_1.default.timingSafeEqual(Buffer.from(expectedSignature, 'hex'), Buffer.from(receivedSignature, 'hex'));
        if (!isValidSignature) {
            res.status(401).json({
                success: false,
                message: 'Invalid webhook signature'
            });
            return;
        }
        // Validate webhook timestamp to prevent replay attacks
        const timestamp = req.headers['x-jenga-timestamp'];
        if (timestamp) {
            const webhookTime = parseInt(timestamp) * 1000;
            const currentTime = Date.now();
            const fiveMinutes = 5 * 60 * 1000;
            if (currentTime - webhookTime > fiveMinutes) {
                res.status(401).json({
                    success: false,
                    message: 'Webhook timestamp too old'
                });
                return;
            }
        }
        next();
    }
    catch (error) {
        console.error('Webhook signature validation error:', error);
        res.status(500).json({
            success: false,
            message: 'Webhook validation error'
        });
    }
};
exports.validateWebhookSignature = validateWebhookSignature;
// --- TRANSACTION REFERENCE VALIDATION ---
const validateTransactionReference = (reference) => {
    // Check if reference is unique and valid
    if (!reference || typeof reference !== 'string')
        return false;
    if (reference.length < 3 || reference.length > 50)
        return false;
    if (!/^[a-zA-Z0-9-_]+$/.test(reference))
        return false;
    return true;
};
exports.validateTransactionReference = validateTransactionReference;
// --- AMOUNT VALIDATION ---
const validateAmount = (amount, min = 0, max = Number.MAX_SAFE_INTEGER) => {
    if (typeof amount !== 'number')
        return false;
    if (amount <= min || amount > max)
        return false;
    if (!Number.isFinite(amount))
        return false;
    // Check for reasonable decimal places (max 2 for currency)
    if (Math.round(amount * 100) !== amount * 100)
        return false;
    return true;
};
exports.validateAmount = validateAmount;
// --- PHONE NUMBER VALIDATION ---
const validateKenyanPhoneNumber = (phoneNumber) => {
    const phoneRegex = /^(\+254|254|0)?[17]\d{8}$/;
    const cleanPhone = phoneNumber.replace(/\s|-/g, '');
    return phoneRegex.test(cleanPhone);
};
exports.validateKenyanPhoneNumber = validateKenyanPhoneNumber;
// --- ACCOUNT NUMBER VALIDATION ---
const validateAccountNumber = (accountNumber) => {
    if (!accountNumber || typeof accountNumber !== 'string')
        return false;
    if (accountNumber.length < 8 || accountNumber.length > 20)
        return false;
    if (!/^\d+$/.test(accountNumber))
        return false;
    return true;
};
exports.validateAccountNumber = validateAccountNumber;
// --- SECURITY MIDDLEWARE ---
const sanitizePaymentData = (req, res, next) => {
    try {
        // Remove any potential XSS or injection attempts
        const sanitizeString = (str) => {
            if (typeof str !== 'string')
                return str;
            return str
                .replace(/[<>]/g, '') // Remove HTML tags
                .replace(/['"]/g, '') // Remove quotes
                .trim();
        };
        if (req.body) {
            if (req.body.description) {
                req.body.description = sanitizeString(req.body.description);
            }
            if (req.body.reference) {
                req.body.reference = sanitizeString(req.body.reference);
            }
            if (req.body.accountName) {
                req.body.accountName = sanitizeString(req.body.accountName);
            }
        }
        next();
    }
    catch (error) {
        console.error('Payment data sanitization error:', error);
        res.status(500).json({
            success: false,
            message: 'Data processing error'
        });
    }
};
exports.sanitizePaymentData = sanitizePaymentData;
// --- IP WHITELIST MIDDLEWARE (for production) ---
const ipWhitelist = (req, res, next) => {
    if (process.env.NODE_ENV === 'production') {
        const allowedIPs = process.env.JENGA_WEBHOOK_IPS?.split(',') || [];
        const clientIP = req.ip || req.connection.remoteAddress;
        if (allowedIPs.length > 0 && clientIP && !allowedIPs.includes(clientIP)) {
            res.status(403).json({
                success: false,
                message: 'IP not whitelisted'
            });
            return;
        }
    }
    next();
};
exports.ipWhitelist = ipWhitelist;
// --- UTILITY FUNCTIONS ---
function isValidUrl(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.protocol === 'https:';
    }
    catch {
        return false;
    }
}
// --- REQUEST LOGGING MIDDLEWARE ---
const logPaymentRequest = (req, res, next) => {
    const userId = req.user?.userId || 'anonymous';
    const endpoint = req.path;
    const method = req.method;
    const ip = req.ip;
    const userAgent = req.get('User-Agent');
    console.log(`[PAYMENT] ${method} ${endpoint} - User: ${userId}, IP: ${ip}, UA: ${userAgent}`);
    // Log sensitive data carefully (don't log full request body)
    if (req.body?.amount) {
        console.log(`[PAYMENT] Amount: ${req.body.amount}, Type: ${endpoint.replace('/api/payments/', '')}`);
    }
    next();
};
exports.logPaymentRequest = logPaymentRequest;
