"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// routes/email.test.routes.ts
const express_1 = __importDefault(require("express"));
const brevo_auth_1 = require("../utils/brevo.auth");
const router = express_1.default.Router();
// Test route for sending welcome email
router.post('/test-welcome', async (req, res) => {
    try {
        const { firstName, lastName, email } = req.body;
        // Validate required fields
        if (!firstName || !lastName || !email) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: firstName, lastName, email'
            });
        }
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email format'
            });
        }
        const brevoService = new brevo_auth_1.BrevoMailingService();
        const context = {
            user: {
                firstName,
                lastName,
                email,
                id: Date.now() // Use timestamp as fake ID for testing
            },
            company: {
                name: 'Jambolush',
                website: 'https://jambolush.com',
                supportEmail: 'support@jambolush.com',
                logo: 'https://jambolush.com/logo.png'
            }
        };
        console.log('🧪 Sending test welcome email to:', email);
        await brevoService.sendWelcomeEmail(context);
        res.json({
            success: true,
            message: `Welcome email sent successfully to ${email}`,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('❌ Email test error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send email',
            error: error.message
        });
    }
});
// Test route for sending email verification
router.post('/test-verification', async (req, res) => {
    try {
        const { firstName, lastName, email } = req.body;
        if (!firstName || !lastName || !email) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: firstName, lastName, email'
            });
        }
        const brevoService = new brevo_auth_1.BrevoMailingService();
        const context = {
            user: {
                firstName,
                lastName,
                email,
                id: Date.now()
            },
            company: {
                name: 'Jambolush',
                website: 'https://jambolush.com',
                supportEmail: 'support@jambolush.com',
                logo: 'https://jambolush.com/logo.png'
            },
            verification: {
                code: Math.floor(100000 + Math.random() * 900000).toString(), // Random 6-digit code
                expiresIn: '10 minutes'
            }
        };
        console.log('🧪 Sending test verification email to:', email);
        await brevoService.sendEmailVerification(context);
        res.json({
            success: true,
            message: `Verification email sent successfully to ${email}`,
            verificationCode: context.verification.code, // For testing only
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('❌ Email verification test error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send verification email',
            error: error.message
        });
    }
});
// Get email service status
router.get('/status', (req, res) => {
    res.json({
        success: true,
        message: 'Email service is running',
        timestamp: new Date().toISOString(),
        availableTests: [
            'POST /test-welcome - Send welcome email',
            'POST /test-verification - Send verification email',
            'GET /status - Check service status'
        ]
    });
});
exports.default = router;
