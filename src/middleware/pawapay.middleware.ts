// middleware/pawapay.middleware.ts - PawaPay Webhook Authentication Middleware

import { Request, Response, NextFunction } from 'express';
import { config } from '../config/config';
import { logger } from '../utils/logger';
import { pawaPayService } from '../services/pawapay.service';

/**
 * Middleware to validate PawaPay webhook requests
 * Validates signature and optionally IP whitelist
 */
export const validatePawaPayWebhook = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    logger.info('Validating PawaPay webhook request', 'PawaPayWebhookMiddleware');

    // Get raw body for signature validation
    const rawBody = JSON.stringify(req.body);
    const signature = req.headers['x-pawapay-signature'] as string;
    const bearerToken = req.headers['authorization'] as string;

    // Log incoming headers for debugging
    logger.info('PawaPay webhook headers', 'PawaPayWebhookMiddleware', {
      hasSignature: !!signature,
      hasBearer: !!bearerToken,
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip || req.connection.remoteAddress
    });

    // If PawaPay sends bearer token, validate it
    if (bearerToken) {
      const expectedToken = `Bearer ${config.pawapay.apiKey}`;

      if (bearerToken !== expectedToken) {
        logger.error('Invalid PawaPay bearer token', 'PawaPayWebhookMiddleware');
        res.status(401).json({
          success: false,
          message: 'Unauthorized: Invalid bearer token'
        });
        return;
      }

      logger.info('PawaPay bearer token validated successfully', 'PawaPayWebhookMiddleware');
    }

    // Validate webhook signature if available and secret is configured
    if (signature && config.pawapay.webhookSecret) {
      const isValid = pawaPayService.validateWebhookSignature(rawBody, signature);

      if (!isValid) {
        logger.error('Invalid PawaPay webhook signature', 'PawaPayWebhookMiddleware');
        res.status(401).json({
          success: false,
          message: 'Unauthorized: Invalid webhook signature'
        });
        return;
      }

      logger.info('PawaPay webhook signature validated successfully', 'PawaPayWebhookMiddleware');
    } else if (config.pawapay.webhookSecret && !signature) {
      logger.warn('Webhook secret configured but no signature provided', 'PawaPayWebhookMiddleware');

      // In production, you might want to reject requests without signature
      if (config.pawapay.environment === 'production') {
        res.status(401).json({
          success: false,
          message: 'Unauthorized: Missing webhook signature'
        });
        return;
      }
    }

    // Optional: Validate IP whitelist (if configured)
    const allowedIPs = process.env.PAWAPAY_ALLOWED_IPS?.split(',') || [];
    if (allowedIPs.length > 0) {
      const clientIP = (req.ip || req.connection.remoteAddress || '').replace('::ffff:', '');

      if (!allowedIPs.includes(clientIP)) {
        logger.error(`Webhook from unauthorized IP: ${clientIP}`, 'PawaPayWebhookMiddleware');
        res.status(403).json({
          success: false,
          message: 'Forbidden: IP not whitelisted'
        });
        return;
      }

      logger.info(`IP ${clientIP} validated against whitelist`, 'PawaPayWebhookMiddleware');
    }

    // All validations passed
    logger.info('PawaPay webhook validation successful', 'PawaPayWebhookMiddleware');
    next();

  } catch (error) {
    logger.error('Error validating PawaPay webhook', 'PawaPayWebhookMiddleware', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during webhook validation',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Middleware to ensure PawaPay API key is configured
 */
export const ensurePawaPayConfigured = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!config.pawapay.apiKey) {
    logger.error('PawaPay API key not configured', 'PawaPayMiddleware');
    res.status(503).json({
      success: false,
      message: 'Service unavailable: PawaPay not configured'
    });
    return;
  }

  next();
};

/**
 * Middleware to log all PawaPay requests (useful for debugging)
 */
export const logPawaPayRequest = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  logger.info('PawaPay request received', 'PawaPayMiddleware', {
    method: req.method,
    path: req.path,
    query: req.query,
    hasBody: !!req.body && Object.keys(req.body).length > 0,
    headers: {
      authorization: req.headers.authorization ? 'Bearer ***' : undefined,
      'x-pawapay-signature': req.headers['x-pawapay-signature'] ? '***' : undefined,
      'user-agent': req.headers['user-agent'],
      'content-type': req.headers['content-type']
    },
    ip: req.ip || req.connection.remoteAddress
  });

  next();
};
