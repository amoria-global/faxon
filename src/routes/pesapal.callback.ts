// routes/pesapal-callback.routes.ts
import express, { Request, Response } from 'express';
import crypto from 'crypto';
import { EscrowService } from '../services/escrow.service';
import { PesapalService } from '../services/pesapal.service';
import { EmailService } from '../services/email.service';
import { PesapalWebhookData } from '../types/pesapal.types';
import config from '../config/config';

const router = express.Router();

// Initialize services
const pesapalService = new PesapalService({
  consumerKey: config.pesapal.consumerKey,
  consumerSecret: config.pesapal.consumerSecret,
  baseUrl: config.pesapal.baseUrl,
  environment: config.pesapal.environment,
  timeout: config.pesapal.timeout,
  retryAttempts: config.pesapal.retryAttempts,
  webhookSecret: config.pesapal.webhookSecret,
  callbackUrl: config.pesapal.callbackUrl,
  defaultCurrency: config.escrow.defaultCurrency,
  merchantAccount: config.pesapal.merchantAccount
});

const emailService = new EmailService();
const escrowService = new EscrowService(pesapalService, emailService);

// ==================== HELPER FUNCTIONS ====================

/**
 * Extracts callback data from request (GET or POST)
 */
function extractCallbackData(req: Request): any | null {
  try {
    const data = req.method === 'POST' ? req.body : req.query;
    
    console.log('[PESAPAL_CALLBACK] Extracting data from:', req.method, data);
    
    if (!data.OrderTrackingId || !data.OrderMerchantReference) {
      console.error('[PESAPAL_CALLBACK] Missing required fields:', {
        hasTrackingId: !!data.OrderTrackingId,
        hasReference: !!data.OrderMerchantReference
      });
      return null;
    }

    return {
      OrderTrackingId: data.OrderTrackingId,
      OrderMerchantReference: data.OrderMerchantReference,
      OrderNotificationType: data.OrderNotificationType || 'IPNCHANGE'
    };
  } catch (error) {
    console.error('[PESAPAL_CALLBACK] Error extracting callback data:', error);
    return null;
  }
}

/**
 * Verifies webhook signature (for POST requests)
 */
function verifyCallbackSignature(req: Request): boolean {
  try {
    const signature = req.headers['x-pesapal-signature'] as string;
    const secret = config.pesapal.webhookSecret;

    // Skip verification in sandbox if secret not configured
    if (!signature || !secret) {
      if (config.pesapal.environment === 'sandbox') {
        console.warn('[PESAPAL_CALLBACK] Skipping signature verification in sandbox');
        return true;
      }
      console.warn('[PESAPAL_CALLBACK] Missing signature or secret');
      return false;
    }

    const payload = JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch (error) {
    console.error('[PESAPAL_CALLBACK] Error verifying signature:', error);
    return false;
  }
}

/**
 * Processes webhook by fetching current status and updating transaction
 */
async function processWebhook(callbackData: any): Promise<boolean> {
  try {
    console.log(`[PESAPAL_CALLBACK] Processing webhook for ${callbackData.OrderMerchantReference}`);
    console.log(`[PESAPAL_CALLBACK] Tracking ID: ${callbackData.OrderTrackingId}`);
    
    const webhookData: PesapalWebhookData = {
      OrderTrackingId: callbackData.OrderTrackingId,
      OrderMerchantReference: callbackData.OrderMerchantReference,
      OrderNotificationType: callbackData.OrderNotificationType
    };

    // Process through escrow service which will fetch latest status
    await escrowService.handlePesapalWebhook(webhookData);

    console.log(`[PESAPAL_CALLBACK] ✅ Webhook processed successfully: ${callbackData.OrderMerchantReference}`);
    return true;

  } catch (error: any) {
    console.error('[PESAPAL_CALLBACK] ❌ Webhook processing failed:', {
      error: error.message,
      trackingId: callbackData.OrderTrackingId,
      reference: callbackData.OrderMerchantReference
    });
    return false;
  }
}

// ==================== ROUTES ====================

/**
 * GET callback handler (user redirects after payment)
 * GET /api/pesapal/callback
 */
router.get('/callback', async (req: Request, res: Response) => {
  try {
    console.log(`[PESAPAL_CALLBACK] GET callback received at ${new Date().toISOString()}`);
    console.log('[PESAPAL_CALLBACK] Query params:', req.query);

    const callbackData = extractCallbackData(req);
    if (!callbackData) {
      console.error('[PESAPAL_CALLBACK] Invalid callback data');
      const frontendUrl = config.clientUrl || 'https://jambolush.com';
      return res.redirect(
        `${frontendUrl}/payment/error?message=${encodeURIComponent('Invalid callback data')}`
      );
    }

    // Process webhook data in background (don't wait for it)
    processWebhook(callbackData).catch(err => {
      console.error('[PESAPAL_CALLBACK] Background webhook processing failed:', err);
    });

    // Immediately redirect user - they'll see pending status and page will auto-refresh
    const frontendUrl = config.clientUrl || 'https://jambolush.com';
    return res.redirect(
      `${frontendUrl}/payment/pending?ref=${callbackData.OrderMerchantReference}`
    );

  } catch (error: any) {
    console.error('[PESAPAL_CALLBACK] GET callback error:', error);
    const frontendUrl = config.clientUrl || 'https://jambolush.com';
    return res.redirect(
      `${frontendUrl}/payment/error?message=${encodeURIComponent('Payment processing error')}`
    );
  }
});

/**
 * POST callback handler (Pesapal IPN notifications)
 * POST /api/pesapal/callback
 */
router.post('/callback', async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    console.log(`[PESAPAL_CALLBACK] POST webhook received at ${new Date().toISOString()}`);
    console.log('[PESAPAL_CALLBACK] Headers:', JSON.stringify(req.headers, null, 2));
    console.log('[PESAPAL_CALLBACK] Body:', JSON.stringify(req.body, null, 2));

    // Verify signature (optional in sandbox)
    if (!verifyCallbackSignature(req)) {
      console.error('[PESAPAL_CALLBACK] Invalid callback signature');
      // Still return 200 to prevent retries
      return res.status(200).json({
        success: false,
        error: 'Invalid signature'
      });
    }

    // Extract and validate data
    const callbackData = extractCallbackData(req);
    if (!callbackData) {
      console.error('[PESAPAL_CALLBACK] Invalid callback data');
      return res.status(200).json({
        success: false,
        error: 'Invalid callback data'
      });
    }

    // Process webhook
    const processed = await processWebhook(callbackData);

    const processingTime = Date.now() - startTime;
    console.log(`[PESAPAL_CALLBACK] ${processed ? '✅' : '❌'} Webhook processed in ${processingTime}ms`);

    // Always respond with 200 to prevent Pesapal retries
    res.status(200).json({
      success: processed,
      message: processed ? 'Webhook processed successfully' : 'Webhook processing failed',
      reference: callbackData.OrderMerchantReference,
      processingTime: `${processingTime}ms`
    });

  } catch (error: any) {
    const processingTime = Date.now() - startTime;
    console.error('[PESAPAL_CALLBACK] POST webhook error:', error);
    console.error(`[PESAPAL_CALLBACK] Error after ${processingTime}ms`);
    
    // Return 200 to avoid retries but log error
    res.status(200).json({
      success: false,
      error: 'Internal server error',
      processingTime: `${processingTime}ms`,
      note: 'Error logged for investigation'
    });
  }
});

/**
 * Alternative IPN endpoint
 * GET /api/pesapal/ipn
 */
router.get('/ipn', async (req: Request, res: Response) => {
  try {
    console.log(`[PESAPAL_IPN] GET IPN received at ${new Date().toISOString()}`);
    console.log('[PESAPAL_IPN] Query params:', req.query);

    const callbackData = extractCallbackData(req);
    if (!callbackData) {
      console.error('[PESAPAL_IPN] Invalid IPN data');
      return res.status(200).json({
        success: false,
        error: 'Invalid IPN data'
      });
    }

    // Process webhook
    const processed = await processWebhook(callbackData);

    res.status(200).json({
      success: processed,
      message: processed ? 'IPN processed successfully' : 'IPN processing failed',
      reference: callbackData.OrderMerchantReference
    });

  } catch (error: any) {
    console.error('[PESAPAL_IPN] GET IPN error:', error);
    
    res.status(200).json({
      success: false,
      error: 'Internal server error',
      note: 'Error logged for investigation'
    });
  }
});

/**
 * Alternative IPN endpoint (POST)
 * POST /api/pesapal/ipn
 */
router.post('/ipn', async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    console.log(`[PESAPAL_IPN] POST IPN received at ${new Date().toISOString()}`);
    console.log('[PESAPAL_IPN] Body:', JSON.stringify(req.body, null, 2));

    // Verify signature
    if (!verifyCallbackSignature(req)) {
      console.error('[PESAPAL_IPN] Invalid IPN signature');
      return res.status(200).json({
        success: false,
        error: 'Invalid signature'
      });
    }

    // Extract and validate data
    const callbackData = extractCallbackData(req);
    if (!callbackData) {
      console.error('[PESAPAL_IPN] Invalid IPN data');
      return res.status(200).json({
        success: false,
        error: 'Invalid IPN data'
      });
    }

    // Process webhook
    const processed = await processWebhook(callbackData);

    const processingTime = Date.now() - startTime;
    console.log(`[PESAPAL_IPN] ${processed ? '✅' : '❌'} IPN processed in ${processingTime}ms`);

    res.status(200).json({
      success: processed,
      message: processed ? 'IPN processed successfully' : 'IPN processing failed',
      reference: callbackData.OrderMerchantReference,
      processingTime: `${processingTime}ms`
    });

  } catch (error: any) {
    const processingTime = Date.now() - startTime;
    console.error('[PESAPAL_IPN] POST IPN error:', error);
    
    res.status(200).json({
      success: false,
      error: 'Internal server error',
      processingTime: `${processingTime}ms`,
      note: 'Error logged for investigation'
    });
  }
});

/**
 * Health check endpoint
 * GET /api/pesapal/health
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const pesapalHealth = await pesapalService.healthCheck();
    
    res.status(200).json({
      success: true,
      message: 'Pesapal callback handler is running',
      timestamp: new Date().toISOString(),
      environment: config.pesapal.environment,
      services: {
        pesapal: pesapalHealth ? 'healthy' : 'unhealthy',
        escrow: true
      }
    });
  } catch (error: any) {
    res.status(503).json({
      success: false,
      error: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Test endpoint for webhook simulation (development only)
 * POST /api/pesapal/test-webhook
 */
if (process.env.NODE_ENV === 'development' || config.pesapal.environment === 'sandbox') {
  router.post('/test-webhook', async (req, res: Response) => {
    try {
      const testData = {
        OrderTrackingId: req.body.OrderTrackingId || 'test-tracking-id',
        OrderMerchantReference: req.body.OrderMerchantReference || 'DEP-test-123',
        OrderNotificationType: 'IPNCHANGE'
      };

      console.log('[TEST_WEBHOOK] Processing test webhook:', testData);

      const processed = await processWebhook(testData);
      
      res.json({
        success: processed,
        message: processed ? 'Test webhook processed' : 'Test webhook failed',
        testData
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: 'Test webhook failed',
        details: error.message
      });
    }
  });
}

export default router;