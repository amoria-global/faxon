"use strict";
// src/middleware/validation.middleware.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateContentType = exports.validateRequestSize = exports.sanitizeString = exports.validateEmail = exports.validatePasswordStrength = exports.validateToken = exports.validateUpdateProfile = exports.validateResetPassword = exports.validateEmailMiddleware = exports.validateLogin = exports.validateRegistration = void 0;
const zod_1 = require("zod");
const errors_1 = require("../utils/errors");
// Schema definitions
const registrationSchema = zod_1.z.object({
    firstName: zod_1.z
        .string()
        .min(1, 'First name is required')
        .max(50, 'First name must be less than 50 characters')
        .regex(/^[a-zA-Z\s-'\.]+$/, 'First name contains invalid characters'),
    lastName: zod_1.z
        .string()
        .min(1, 'Last name is required')
        .max(50, 'Last name must be less than 50 characters')
        .regex(/^[a-zA-Z\s-'\.]+$/, 'Last name contains invalid characters'),
    email: zod_1.z
        .string()
        .min(1, 'Email is required')
        .email('Invalid email format')
        .max(255, 'Email must be less than 255 characters')
        .toLowerCase(),
    password: zod_1.z
        .string()
        .min(8, 'Password must be at least 8 characters')
        .max(128, 'Password must be less than 128 characters')
        .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain at least one lowercase letter, one uppercase letter, and one number'),
});
const loginSchema = zod_1.z.object({
    email: zod_1.z
        .string()
        .min(1, 'Email is required')
        .email('Invalid email format')
        .toLowerCase(),
    password: zod_1.z
        .string()
        .min(1, 'Password is required'),
});
const emailSchema = zod_1.z.object({
    email: zod_1.z
        .string()
        .min(1, 'Email is required')
        .email('Invalid email format')
        .toLowerCase(),
});
const resetPasswordSchema = zod_1.z.object({
    token: zod_1.z
        .string()
        .min(1, 'Reset token is required'),
    password: zod_1.z
        .string()
        .min(8, 'Password must be at least 8 characters')
        .max(128, 'Password must be less than 128 characters')
        .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain at least one lowercase letter, one uppercase letter, and one number'),
});
const updateProfileSchema = zod_1.z.object({
    firstName: zod_1.z
        .string()
        .min(1, 'First name is required')
        .max(50, 'First name must be less than 50 characters')
        .regex(/^[a-zA-Z\s-'\.]+$/, 'First name contains invalid characters')
        .optional(),
    lastName: zod_1.z
        .string()
        .min(1, 'Last name is required')
        .max(50, 'Last name must be less than 50 characters')
        .regex(/^[a-zA-Z\s-'\.]+$/, 'Last name contains invalid characters')
        .optional(),
    email: zod_1.z
        .string()
        .email('Invalid email format')
        .max(255, 'Email must be less than 255 characters')
        .toLowerCase()
        .optional(),
});
const tokenSchema = zod_1.z.object({
    token: zod_1.z
        .string()
        .min(1, 'Token is required'),
});
// Validation middleware factory
const createValidationMiddleware = (schema) => {
    return (req, res, next) => {
        try {
            const result = schema.safeParse(req.body);
            if (!result.success) {
                const errors = result.error.issues.map(err => ({
                    field: err.path.join('.'),
                    message: err.message,
                }));
                throw new errors_1.AppError('Validation failed', 400, errors);
            }
            // Replace req.body with validated and sanitized data
            req.body = result.data;
            next();
        }
        catch (error) {
            next(error);
        }
    };
};
// Specific validation middlewares
exports.validateRegistration = createValidationMiddleware(registrationSchema);
exports.validateLogin = createValidationMiddleware(loginSchema);
exports.validateEmailMiddleware = createValidationMiddleware(emailSchema);
exports.validateResetPassword = createValidationMiddleware(resetPasswordSchema);
exports.validateUpdateProfile = createValidationMiddleware(updateProfileSchema);
exports.validateToken = createValidationMiddleware(tokenSchema);
// Custom validation helpers
const validatePasswordStrength = (password) => {
    const errors = [];
    if (password.length < 8) {
        errors.push('Password must be at least 8 characters long');
    }
    if (password.length > 128) {
        errors.push('Password must be less than 128 characters long');
    }
    if (!/[a-z]/.test(password)) {
        errors.push('Password must contain at least one lowercase letter');
    }
    if (!/[A-Z]/.test(password)) {
        errors.push('Password must contain at least one uppercase letter');
    }
    if (!/\d/.test(password)) {
        errors.push('Password must contain at least one number');
    }
    // Optional: Check for special characters
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
        errors.push('Password should contain at least one special character for better security');
    }
    // Check for common patterns
    if (/(.)\1{2,}/.test(password)) {
        errors.push('Password should not contain repeated characters');
    }
    // Check for sequential characters
    if (/123|234|345|456|567|678|789|890|abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz/i.test(password)) {
        errors.push('Password should not contain sequential characters');
    }
    // Check for common weak passwords
    const commonPasswords = [
        'password', '123456', '123456789', '12345678', '12345',
        'qwerty', 'abc123', 'password123', 'admin', 'letmein'
    ];
    if (commonPasswords.some(common => password.toLowerCase().includes(common))) {
        errors.push('Password is too common, please choose a more secure password');
    }
    return {
        isValid: errors.length === 0,
        errors,
    };
};
exports.validatePasswordStrength = validatePasswordStrength;
const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};
exports.validateEmail = validateEmail;
const sanitizeString = (str) => {
    return str
        .trim()
        .replace(/\s+/g, ' ') // Replace multiple spaces with single space
        .replace(/[<>]/g, ''); // Remove potential HTML tags
};
exports.sanitizeString = sanitizeString;
// Request size validation middleware
const validateRequestSize = (maxSizeBytes) => {
    return (req, res, next) => {
        const contentLength = req.get('Content-Length');
        if (contentLength && parseInt(contentLength) > maxSizeBytes) {
            throw new errors_1.AppError(`Request too large. Maximum size: ${maxSizeBytes} bytes`, 413);
        }
        next();
    };
};
exports.validateRequestSize = validateRequestSize;
// Content-Type validation middleware
const validateContentType = (allowedTypes) => {
    return (req, res, next) => {
        const contentType = req.get('Content-Type');
        if (!contentType || !allowedTypes.some(type => contentType.includes(type))) {
            throw new errors_1.AppError(`Invalid Content-Type. Allowed types: ${allowedTypes.join(', ')}`, 415);
        }
        next();
    };
};
exports.validateContentType = validateContentType;
