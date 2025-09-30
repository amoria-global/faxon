"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const brevo_sms_auth_1 = require("../utils/brevo.sms.auth");
const router = express_1.default.Router();
const smsService = new brevo_sms_auth_1.BrevoSMSService();
// Test SMS endpoint
router.post('/test', async (req, res) => {
    try {
        const { phoneNumber, message } = req.body;
        if (!phoneNumber) {
            return res.status(400).json({
                success: false,
                message: 'Phone number is required'
            });
        }
        // Default test message if none provided
        const testMessage = message || 'This is a test message from Jambolush SMS service. If you received this, SMS is working correctly!';
        // Format phone number (add + if missing)
        let formattedPhone = phoneNumber.trim();
        if (!formattedPhone.startsWith('+')) {
            // If it starts with 250 (Rwanda), add +
            if (formattedPhone.startsWith('250')) {
                formattedPhone = '+' + formattedPhone;
            }
            else if (formattedPhone.startsWith('0')) {
                // If it starts with 0, assume Rwanda and replace with +250
                formattedPhone = '+250' + formattedPhone.substring(1);
            }
            else {
                // Otherwise just add + at the beginning
                formattedPhone = '+' + formattedPhone;
            }
        }
        console.log(`Sending test SMS to: ${formattedPhone}`);
        // Send the SMS
        const reference = await smsService.sendTransactionalSMS({
            sender: 'Jambolush',
            recipient: formattedPhone,
            content: testMessage,
            type: 'transactional',
            tag: 'sms_test'
        });
        res.json({
            success: true,
            message: 'SMS sent successfully',
            data: {
                recipient: formattedPhone,
                reference: reference,
                content: testMessage,
                timestamp: new Date().toISOString()
            }
        });
    }
    catch (error) {
        console.error('SMS Test Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send SMS',
            error: error.message
        });
    }
});
// Get SMS service status
router.get('/status', (req, res) => {
    res.json({
        success: true,
        message: 'SMS service is available',
        service: 'Brevo SMS API',
        timestamp: new Date().toISOString()
    });
});
// Send bulk test SMS
router.post('/bulk-test', async (req, res) => {
    try {
        const { phoneNumbers, message } = req.body;
        if (!phoneNumbers || !Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Phone numbers array is required'
            });
        }
        if (phoneNumbers.length > 10) {
            return res.status(400).json({
                success: false,
                message: 'Maximum 10 phone numbers allowed for bulk test'
            });
        }
        const testMessage = message || 'Bulk test message from Jambolush SMS service!';
        // Format all phone numbers
        const formattedNumbers = phoneNumbers.map(phone => {
            let formatted = phone.trim();
            if (!formatted.startsWith('+')) {
                if (formatted.startsWith('250')) {
                    formatted = '+' + formatted;
                }
                else if (formatted.startsWith('0')) {
                    formatted = '+250' + formatted.substring(1);
                }
                else {
                    formatted = '+' + formatted;
                }
            }
            return formatted;
        });
        console.log(`Sending bulk test SMS to: ${formattedNumbers.join(', ')}`);
        // Send bulk SMS
        await smsService.sendBulkSMS(formattedNumbers, testMessage, 'bulk_test');
        res.json({
            success: true,
            message: 'Bulk SMS sent successfully',
            data: {
                recipients: formattedNumbers,
                content: testMessage,
                count: formattedNumbers.length,
                timestamp: new Date().toISOString()
            }
        });
    }
    catch (error) {
        console.error('Bulk SMS Test Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send bulk SMS',
            error: error.message
        });
    }
});
// Test specific SMS templates
router.post('/template-test', async (req, res) => {
    try {
        const { phoneNumber, template, data } = req.body;
        if (!phoneNumber || !template) {
            return res.status(400).json({
                success: false,
                message: 'Phone number and template type are required'
            });
        }
        // Format phone number
        let formattedPhone = phoneNumber.trim();
        if (!formattedPhone.startsWith('+')) {
            if (formattedPhone.startsWith('250')) {
                formattedPhone = '+' + formattedPhone;
            }
            else if (formattedPhone.startsWith('0')) {
                formattedPhone = '+250' + formattedPhone.substring(1);
            }
            else {
                formattedPhone = '+' + formattedPhone;
            }
        }
        // Create mock context for testing templates
        const mockContext = {
            user: {
                firstName: data?.firstName || 'Test',
                lastName: data?.lastName || 'User',
                phone: formattedPhone,
                phoneCountryCode: '+250',
                id: 1
            },
            company: {
                name: 'Jambolush',
                website: 'https://jambolush.com',
                supportPhone: '+250788437347'
            },
            security: {
                device: 'Test Device',
                browser: 'Test Browser',
                location: 'Test Location',
                ipAddress: '127.0.0.1',
                timestamp: new Date().toISOString()
            },
            verification: {
                code: '123456',
                expiresIn: '10 minutes'
            }
        };
        let result;
        switch (template) {
            case 'welcome':
                result = await smsService.sendWelcomeSMS(mockContext);
                break;
            case 'verification':
                result = await smsService.sendPhoneVerificationSMS(mockContext);
                break;
            case 'password_reset':
                result = await smsService.sendPasswordResetSMS(mockContext);
                break;
            case 'login_notification':
                result = await smsService.sendLoginNotificationSMS(mockContext);
                break;
            case 'two_factor':
                result = await smsService.sendTwoFactorSMS(mockContext);
                break;
            default:
                return res.status(400).json({
                    success: false,
                    message: 'Invalid template type. Available: welcome, verification, password_reset, login_notification, two_factor'
                });
        }
        res.json({
            success: true,
            message: `${template} SMS template sent successfully`,
            data: {
                recipient: formattedPhone,
                template: template,
                timestamp: new Date().toISOString()
            }
        });
    }
    catch (error) {
        console.error('Template SMS Test Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send template SMS',
            error: error.message
        });
    }
});
exports.default = router;
