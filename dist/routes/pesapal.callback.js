"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeServices = initializeServices;
// routes/pesapal-callback.ts
const express_1 = __importDefault(require("express"));
const crypto_1 = __importDefault(require("crypto"));
const config_1 = __importDefault(require("../config/config"));
const router = express_1.default.Router();
// Initialize services (adjust based on your DI setup)
let escrowService;
let pesapalService;
// Initialize services - adjust this based on your dependency injection setup
function initializeServices(escrowSvc, pesapalSvc) {
    escrowService = escrowSvc;
    pesapalService = pesapalSvc;
}
// Payment status enum - matches Pesapal's status codes
var PaymentStatus;
(function (PaymentStatus) {
    PaymentStatus[PaymentStatus["PENDING"] = 0] = "PENDING";
    PaymentStatus[PaymentStatus["COMPLETED"] = 1] = "COMPLETED";
    PaymentStatus[PaymentStatus["FAILED"] = 2] = "FAILED";
    PaymentStatus[PaymentStatus["INVALID"] = 3] = "INVALID";
})(PaymentStatus || (PaymentStatus = {}));
/**
 * Extract callback data from request (handles both POST body and GET query params)
 */
function extractCallbackData(req) {
    try {
        const data = req.method === 'POST' ? req.body : req.query;
        if (!data.OrderTrackingId || !data.OrderMerchantReference) {
            console.error('[PESAPAL_CALLBACK] Missing required fields in callback data');
            return null;
        }
        return {
            OrderTrackingId: data.OrderTrackingId,
            OrderMerchantReference: data.OrderMerchantReference,
            OrderNotificationType: data.OrderNotificationType || 'IPNCHANGE',
            Status: parseInt(data.Status) || 0,
            Amount: parseFloat(data.Amount) || 0,
            Currency: data.Currency || 'USD',
            PaymentMethod: data.PaymentMethod,
            PhoneNumber: data.PhoneNumber,
            EmailAddress: data.EmailAddress,
            FirstName: data.FirstName,
            LastName: data.LastName,
            MiddleName: data.MiddleName,
            PaymentAccount: data.PaymentAccount,
            TransactionId: data.TransactionId,
            Error: data.Error,
            ErrorMessage: data.ErrorMessage
        };
    }
    catch (error) {
        console.error('[PESAPAL_CALLBACK] Error extracting callback data:', error);
        return null;
    }
}
/**
 * Verify Pesapal callback authenticity using webhook secret
 */
function verifyCallbackSignature(req) {
    try {
        const signature = req.headers['x-pesapal-signature'];
        const secret = config_1.default.pesapal.webhookSecret;
        if (!signature || !secret) {
            console.warn('[PESAPAL_CALLBACK] Missing signature or secret for verification');
            return true; // Skip verification if not configured
        }
        const payload = JSON.stringify(req.body);
        const expectedSignature = crypto_1.default
            .createHmac('sha256', secret)
            .update(payload)
            .digest('hex');
        return crypto_1.default.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSignature, 'hex'));
    }
    catch (error) {
        console.error('[PESAPAL_CALLBACK] Error verifying signature:', error);
        return false;
    }
}
/**
 * Process webhook through EscrowService - this replaces the placeholder updatePaymentStatus
 */
async function processWebhook(callbackData) {
    try {
        if (!escrowService) {
            console.error('[PESAPAL_CALLBACK] EscrowService not initialized');
            return false;
        }
        console.log(`[PESAPAL_CALLBACK] Processing webhook for ${callbackData.OrderMerchantReference}`);
        // Convert callback data to webhook format expected by EscrowService
        const webhookData = {
            OrderTrackingId: callbackData.OrderTrackingId,
            OrderMerchantReference: callbackData.OrderMerchantReference,
            OrderNotificationType: callbackData.OrderNotificationType
        };
        // Use EscrowService to handle the webhook - this will:
        // 1. Find the transaction by tracking ID
        // 2. Query Pesapal for current status
        // 3. Update transaction status in database
        // 4. Send notifications
        await escrowService.handlePesapalWebhook(webhookData);
        console.log(`[PESAPAL_CALLBACK] Webhook processed successfully for ${callbackData.OrderMerchantReference}`);
        return true;
    }
    catch (error) {
        console.error('[PESAPAL_CALLBACK] Error processing webhook:', error);
        return false;
    }
}
/**
 * Shared handler for processing POST webhooks
 * This extracts the common logic to avoid duplication
 */
async function handlePostWebhook(req, res) {
    const startTime = Date.now();
    try {
        console.log(`[PESAPAL_CALLBACK] POST webhook received at ${new Date().toISOString()}`);
        console.log(`[PESAPAL_CALLBACK] Headers:`, JSON.stringify(req.headers, null, 2));
        console.log(`[PESAPAL_CALLBACK] Body:`, JSON.stringify(req.body, null, 2));
        // Verify callback authenticity
        if (!verifyCallbackSignature(req)) {
            console.error('[PESAPAL_CALLBACK] Invalid callback signature');
            res.status(401).json({
                success: false,
                error: 'Invalid signature'
            });
            return;
        }
        // Extract and validate callback data
        const callbackData = extractCallbackData(req);
        if (!callbackData) {
            console.error('[PESAPAL_CALLBACK] Invalid callback data received');
            res.status(400).json({
                success: false,
                error: 'Invalid callback data'
            });
            return;
        }
        console.log(`[PESAPAL_CALLBACK] Processing payment: ${callbackData.OrderMerchantReference}`);
        console.log(`[PESAPAL_CALLBACK] Payment status: ${PaymentStatus[callbackData.Status]} (${callbackData.Status})`);
        // Process webhook through EscrowService
        const processed = await processWebhook(callbackData);
        if (!processed) {
            console.error('[PESAPAL_CALLBACK] Failed to process webhook');
            res.status(500).json({
                success: false,
                error: 'Failed to process webhook'
            });
            return;
        }
        // Log processing time
        const processingTime = Date.now() - startTime;
        console.log(`[PESAPAL_CALLBACK] Webhook processed successfully in ${processingTime}ms`);
        // Respond to Pesapal (they expect a 200 response)
        res.status(200).json({
            success: true,
            message: 'Webhook processed successfully',
            reference: callbackData.OrderMerchantReference,
            status: PaymentStatus[callbackData.Status],
            processingTime: `${processingTime}ms`
        });
    }
    catch (error) {
        const processingTime = Date.now() - startTime;
        console.error('[PESAPAL_CALLBACK] POST webhook error:', error);
        console.error(`[PESAPAL_CALLBACK] Error occurred after ${processingTime}ms`);
        // Still return 200 to Pesapal to avoid retries, but log the error
        res.status(200).json({
            success: false,
            error: 'Internal server error',
            processingTime: `${processingTime}ms`,
            note: 'Error logged for investigation'
        });
    }
}
/**
 * GET callback handler (for user redirects after payment)
 */
router.get('/callback', async (req, res) => {
    try {
        console.log(`[PESAPAL_CALLBACK] GET callback received at ${new Date().toISOString()}`);
        console.log(`[PESAPAL_CALLBACK] Query params:`, req.query);
        const callbackData = extractCallbackData(req);
        if (!callbackData) {
            return res.status(400).json({
                success: false,
                error: 'Invalid callback data'
            });
        }
        // Process the webhook data
        const processed = await processWebhook(callbackData);
        if (!processed) {
            console.warn('[PESAPAL_CALLBACK] Webhook processing failed, but continuing with redirect');
        }
        // Redirect user to appropriate page based on payment status
        const frontendUrl = config_1.default.clientUrl || 'http://localhost:3000';
        const status = callbackData.Status;
        if (status === PaymentStatus.COMPLETED) {
            return res.redirect(`${frontendUrl}/payment/success?ref=${callbackData.OrderMerchantReference}`);
        }
        else if (status === PaymentStatus.FAILED) {
            return res.redirect(`${frontendUrl}/payment/failed?ref=${callbackData.OrderMerchantReference}&error=${encodeURIComponent(callbackData.ErrorMessage || 'Payment failed')}`);
        }
        else {
            return res.redirect(`${frontendUrl}/payment/pending?ref=${callbackData.OrderMerchantReference}`);
        }
    }
    catch (error) {
        console.error('[PESAPAL_CALLBACK] GET callback error:', error);
        const frontendUrl = config_1.default.clientUrl || 'http://localhost:3000';
        return res.redirect(`${frontendUrl}/payment/error?message=${encodeURIComponent('Payment processing error')}`);
    }
});
/**
 * POST callback handler (for Pesapal IPN notifications)
 * This is the main webhook endpoint that Pesapal calls
 */
router.post('/callback', async (req, res) => {
    await handlePostWebhook(req, res);
});
/**
 * Separate IPN endpoint (alternative endpoint name for webhooks)
 * Uses the same logic as the main callback handler
 */
router.post('/ipn', async (req, res) => {
    await handlePostWebhook(req, res);
});
/**
 * Health check endpoint
 */
router.get('/callback/health', (req, res) => {
    const escrowHealthy = !!escrowService;
    const pesapalHealthy = !!pesapalService;
    res.status(200).json({
        success: true,
        message: 'Pesapal callback handler is running',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        services: {
            escrow: escrowHealthy,
            pesapal: pesapalHealthy
        }
    });
});
/**
 * Test endpoint for webhook simulation (development only)
 */
if (process.env.NODE_ENV === 'development') {
    router.post('/callback/test', async (req, res) => {
        try {
            const testData = {
                OrderTrackingId: req.body.OrderTrackingId || 'test-tracking-id',
                OrderMerchantReference: req.body.OrderMerchantReference || 'DEP-test-123',
                OrderNotificationType: 'IPNCHANGE',
                Status: req.body.Status || PaymentStatus.COMPLETED,
                Amount: req.body.Amount || 100,
                Currency: req.body.Currency || 'USD'
            };
            const processed = await processWebhook(testData);
            res.json({
                success: processed,
                message: processed ? 'Test webhook processed' : 'Test webhook failed',
                testData
            });
        }
        catch (error) {
            res.status(500).json({
                success: false,
                error: 'Test webhook failed',
                details: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });
}
exports.default = router;
