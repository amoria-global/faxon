// routes/xentripay-callback.routes.ts

import express, { Request, Response } from 'express';
import crypto from 'crypto';
import { XentriPayEscrowService } from '../services/xentripay-escrow.service';
import { XentriPayService } from '../services/xentripay.service';
import { BrevoMailingService } from '../utils/brevo.xentripay';
import config from '../config/config';

const router = express.Router();

// ==================== INITIALIZE SERVICES ====================

const isProduction = process.env.NODE_ENV === 'production';
const baseUrl = isProduction 
  ? 'https://xentripay.com' 
  : 'https://test.xentripay.com';

const xentriPayService = new XentriPayService({
  apiKey: process.env.XENTRIPAY_API_KEY || '',
  baseUrl: process.env.XENTRIPAY_BASE_URL || baseUrl,
  environment: isProduction ? 'production' : 'sandbox',
  timeout: 30000
});

const mailingService = new BrevoMailingService();
const escrowService = new XentriPayEscrowService(xentriPayService, mailingService);

// ==================== HELPER FUNCTIONS ====================

/**
 * Extracts callback data from request (GET or POST)
 */
function extractCallbackData(req: Request): any | null {
  try {
    const data = req.method === 'POST' ? req.body : req.query;
    
    console.log('[XENTRIPAY_CALLBACK] Extracting data from:', req.method, data);
    
    // XentriPay webhook/callback includes refid and status
    if (!data.refid && !data.reference) {
      console.error('[XENTRIPAY_CALLBACK] Missing required fields:', {
        hasRefid: !!data.refid,
        hasReference: !!data.reference
      });
      return null;
    }

    return {
      refid: data.refid || data.reference,
      status: data.status,
      amount: data.amount,
      transactionId: data.transactionId || data.tid,
      timestamp: data.timestamp || new Date().toISOString()
    };
  } catch (error) {
    console.error('[XENTRIPAY_CALLBACK] Error extracting callback data:', error);
    return null;
  }
}

/**
 * Verifies webhook signature (for POST requests)
 */
function verifyCallbackSignature(req: Request): boolean {
  try {
    const signature = req.headers['x-xentripay-signature'] as string;
    const secret = process.env.XENTRIPAY_WEBHOOK_SECRET;

    // Skip verification in sandbox if secret not configured
    if (!signature || !secret) {
      if (!isProduction) {
        console.warn('[XENTRIPAY_CALLBACK] Skipping signature verification in sandbox');
        return true;
      }
      console.warn('[XENTRIPAY_CALLBACK] Missing signature or secret');
      return false;
    }

    const payload = JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );

    console.log('[XENTRIPAY_CALLBACK] Signature verification:', isValid ? '✅' : '❌');
    return isValid;
  } catch (error) {
    console.error('[XENTRIPAY_CALLBACK] Error verifying signature:', error);
    return false;
  }
}

/**
 * Processes webhook by fetching current status and updating transaction
 */
async function processWebhook(callbackData: any): Promise<boolean> {
  try {
    console.log(`[XENTRIPAY_CALLBACK] Processing webhook for ${callbackData.refid}`);
    console.log(`[XENTRIPAY_CALLBACK] Status: ${callbackData.status}`);
    
    // Find transaction by refid
    const transactions = Array.from((escrowService as any).transactions.values());
    const transaction: any = transactions.find(
      (tx: any) => tx.xentriPayRefId === callbackData.refid
    );

    if (!transaction) {
      console.error('[XENTRIPAY_CALLBACK] Transaction not found for refid:', callbackData.refid);
      return false;
    }

    // Check latest status from XentriPay
    await escrowService.checkCollectionStatus(transaction.id);

    console.log(`[XENTRIPAY_CALLBACK] ✅ Webhook processed successfully: ${callbackData.refid}`);
    return true;

  } catch (error: any) {
    console.error('[XENTRIPAY_CALLBACK] ❌ Webhook processing failed:', {
      error: error.message,
      refid: callbackData.refid
    });
    return false;
  }
}

// ==================== ROUTES ====================

/**
 * GET callback handler (user redirects after payment)
 * GET /api/xentripay/callback
 */
router.get('/callback', async (req: Request, res: Response) => {
  try {
    console.log(`[XENTRIPAY_CALLBACK] GET callback received at ${new Date().toISOString()}`);
    console.log('[XENTRIPAY_CALLBACK] Query params:', req.query);

    const callbackData = extractCallbackData(req);
    if (!callbackData) {
      console.error('[XENTRIPAY_CALLBACK] Invalid callback data');
      const frontendUrl = config.clientUrl || 'http://localhost:3000';
      return res.redirect(
        `${frontendUrl}/payment/error?message=${encodeURIComponent('Invalid callback data')}`
      );
    }

    // Process webhook data in background (don't wait for it)
    processWebhook(callbackData).catch(err => {
      console.error('[XENTRIPAY_CALLBACK] Background webhook processing failed:', err);
    });

    // Immediately redirect user - they'll see pending status and page will auto-refresh
    const frontendUrl = config.clientUrl || 'http://localhost:3000';
    
    // Determine redirect based on status
    const redirectPath = callbackData.status === 'SUCCESS' 
      ? '/payment/success'
      : callbackData.status === 'FAILED'
      ? '/payment/failed'
      : '/payment/pending';

    return res.redirect(
      `${frontendUrl}${redirectPath}?ref=${callbackData.refid}`
    );

  } catch (error: any) {
    console.error('[XENTRIPAY_CALLBACK] GET callback error:', error);
    const frontendUrl = config.clientUrl || 'http://localhost:3000';
    return res.redirect(
      `${frontendUrl}/payment/error?message=${encodeURIComponent('Payment processing error')}`
    );
  }
});

/**
 * POST callback handler (XentriPay webhook notifications)
 * POST /api/xentripay/callback
 */
router.post('/callback', async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    console.log(`[XENTRIPAY_CALLBACK] POST webhook received at ${new Date().toISOString()}`);
    console.log('[XENTRIPAY_CALLBACK] Headers:', JSON.stringify(req.headers, null, 2));
    console.log('[XENTRIPAY_CALLBACK] Body:', JSON.stringify(req.body, null, 2));

    // Verify signature (optional in sandbox)
    if (!verifyCallbackSignature(req)) {
      console.error('[XENTRIPAY_CALLBACK] Invalid callback signature');
      // Still return 200 to prevent retries
      return res.status(200).json({
        success: false,
        error: 'Invalid signature',
        timestamp: new Date().toISOString()
      });
    }

    // Extract and validate data
    const callbackData = extractCallbackData(req);
    if (!callbackData) {
      console.error('[XENTRIPAY_CALLBACK] Invalid callback data');
      return res.status(200).json({
        success: false,
        error: 'Invalid callback data',
        timestamp: new Date().toISOString()
      });
    }

    // Process webhook
    const processed = await processWebhook(callbackData);

    const processingTime = Date.now() - startTime;
    console.log(`[XENTRIPAY_CALLBACK] ${processed ? '✅' : '❌'} Webhook processed in ${processingTime}ms`);

    // Always respond with 200 to prevent XentriPay retries
    res.status(200).json({
      success: processed,
      message: processed ? 'Webhook processed successfully' : 'Webhook processing failed',
      refid: callbackData.refid,
      processingTime: `${processingTime}ms`,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    const processingTime = Date.now() - startTime;
    console.error('[XENTRIPAY_CALLBACK] POST webhook error:', error);
    console.error(`[XENTRIPAY_CALLBACK] Error after ${processingTime}ms`);
    
    // Return 200 to avoid retries but log error
    res.status(200).json({
      success: false,
      error: 'Internal server error',
      processingTime: `${processingTime}ms`,
      timestamp: new Date().toISOString(),
      note: 'Error logged for investigation'
    });
  }
});

/**
 * POST webhook handler (alternative endpoint)
 * POST /api/xentripay/webhook
 */
router.post('/webhook', async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    console.log(`[XENTRIPAY_WEBHOOK] POST webhook received at ${new Date().toISOString()}`);
    console.log('[XENTRIPAY_WEBHOOK] Headers:', JSON.stringify(req.headers, null, 2));
    console.log('[XENTRIPAY_WEBHOOK] Body:', JSON.stringify(req.body, null, 2));

    // Verify signature
    if (!verifyCallbackSignature(req)) {
      console.error('[XENTRIPAY_WEBHOOK] Invalid webhook signature');
      return res.status(200).json({
        success: false,
        error: 'Invalid signature',
        timestamp: new Date().toISOString()
      });
    }

    // Extract and validate data
    const callbackData = extractCallbackData(req);
    if (!callbackData) {
      console.error('[XENTRIPAY_WEBHOOK] Invalid webhook data');
      return res.status(200).json({
        success: false,
        error: 'Invalid webhook data',
        timestamp: new Date().toISOString()
      });
    }

    // Process webhook
    const processed = await processWebhook(callbackData);

    const processingTime = Date.now() - startTime;
    console.log(`[XENTRIPAY_WEBHOOK] ${processed ? '✅' : '❌'} Webhook processed in ${processingTime}ms`);

    res.status(200).json({
      success: processed,
      message: processed ? 'Webhook processed successfully' : 'Webhook processing failed',
      refid: callbackData.refid,
      processingTime: `${processingTime}ms`,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    const processingTime = Date.now() - startTime;
    console.error('[XENTRIPAY_WEBHOOK] POST webhook error:', error);
    
    res.status(200).json({
      success: false,
      error: 'Internal server error',
      processingTime: `${processingTime}ms`,
      timestamp: new Date().toISOString(),
      note: 'Error logged for investigation'
    });
  }
});

/**
 * Manual status check endpoint
 * POST /api/xentripay/check-status
 */
router.post('/check-status', async (req: Request, res: Response) => {
  try {
    const { refid, transactionId } = req.body;

    if (!refid && !transactionId) {
      return res.status(400).json({
        success: false,
        error: 'Either refid or transactionId is required'
      });
    }

    console.log('[XENTRIPAY_CHECK] Manual status check:', { refid, transactionId });

    let status;
    
    if (refid) {
      // Check collection status by refid
      status = await xentriPayService.getCollectionStatus(refid);
    } else if (transactionId) {
      // Check transaction status in escrow service
      const transaction = await escrowService.getTransaction(transactionId);
      if (transaction?.xentriPayRefId) {
        status = await xentriPayService.getCollectionStatus(transaction.xentriPayRefId);
      } else {
        throw new Error('Transaction not found or has no XentriPay reference');
      }
    }

    res.json({
      success: true,
      data: status,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('[XENTRIPAY_CHECK] Status check error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Health check endpoint
 * GET /api/xentripay/health
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const xentriPayHealth = await xentriPayService.healthCheck();
    
    res.status(200).json({
      success: true,
      message: 'XentriPay callback handler is running',
      timestamp: new Date().toISOString(),
      environment: isProduction ? 'production' : 'sandbox',
      services: {
        xentripay: xentriPayHealth ? 'healthy' : 'unhealthy',
        escrow: true
      },
      endpoints: {
        callback: '/api/xentripay/callback',
        webhook: '/api/xentripay/webhook',
        checkStatus: '/api/xentripay/check-status'
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
 * POST /api/xentripay/test-webhook
 */
if (!isProduction) {
  router.post('/test-webhook', async (req: Request, res: Response) => {
    try {
      const testData = {
        refid: req.body.refid || 'RefTEST123456',
        status: req.body.status || 'SUCCESS',
        amount: req.body.amount || 1000,
        transactionId: req.body.transactionId || 'test-tid-123',
        timestamp: new Date().toISOString()
      };

      console.log('[TEST_WEBHOOK] Processing test webhook:', testData);

      const processed = await processWebhook(testData);
      
      res.json({
        success: processed,
        message: processed ? 'Test webhook processed' : 'Test webhook failed',
        testData,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: 'Test webhook failed',
        details: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * Simulate collection completion (development only)
   * POST /api/xentripay/simulate-payment
   */
  router.post('/simulate-payment', async (req: Request, res: Response) => {
    try {
      const { refid, status = 'SUCCESS' } = req.body;

      if (!refid) {
        return res.status(400).json({
          success: false,
          error: 'refid is required'
        });
      }

      console.log('[SIMULATE_PAYMENT] Simulating payment:', { refid, status });

      // Simulate webhook callback
      const webhookData = {
        refid,
        status,
        amount: 1000,
        transactionId: `sim-${Date.now()}`,
        timestamp: new Date().toISOString()
      };

      const processed = await processWebhook(webhookData);

      res.json({
        success: processed,
        message: `Payment ${status} simulated`,
        webhookData,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: 'Simulation failed',
        details: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });
}

/**
 * Get callback/webhook logs (development only)
 * GET /api/xentripay/logs
 */
if (!isProduction) {
  router.get('/logs', (req: Request, res: Response) => {
    res.json({
      success: true,
      message: 'Callback logs are available in server console',
      tip: 'Check your terminal/console for detailed logs',
      timestamp: new Date().toISOString()
    });
  });
}

export default router;