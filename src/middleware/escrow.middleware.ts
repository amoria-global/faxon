// middleware/escrow.middleware.ts

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import {
  CreateDepositDto,
  WithdrawDto,
  RefundDto,
  ReleaseEscrowDto,
  SplitRules,
  PayoutMethod,
  MobileProvider
} from '../types/pesapal.types';

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
    firstName?: string;
    lastName?: string;
  };
}

// === RATE LIMITING ===

export const rateLimitEscrowOperations = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 escrow requests per windowMs
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many escrow requests, please try again later.',
      timestamp: new Date().toISOString()
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: (req) => {
    const whitelistedIPs = process.env.ESCROW_WHITELISTED_IPS?.split(',') || [];
    const clientIP = req.ip;
    return clientIP ? whitelistedIPs.includes(clientIP) : false;
  }
});

export const rateLimitWebhooks = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // Allow more webhook requests
  message: {
    success: false,
    message: 'Webhook rate limit exceeded'
  }
});

// === VALIDATION MIDDLEWARE ===

export const validateDeposit = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  try {
    const data: CreateDepositDto = req.body;
    const errors: string[] = [];

    // Amount validation
    if (!data.amount) {
      errors.push('Amount is required');
    } else if (typeof data.amount !== 'number' || data.amount <= 0) {
      errors.push('Amount must be a positive number');
    } else if (data.amount < 100 && data.currency != 'USD') {
      errors.push('Minimum deposit amount is 100 RWF');
    } else if (data.amount > 10000000) {
      errors.push('Maximum deposit amount is 10,000,000 RWF');
    }

    // Currency validation
    if (!data.currency) {
      errors.push('Currency is required');
    } else if (!['RWF', 'USD', 'UGX', 'TZS', 'KES'].includes(data.currency)) {
      errors.push('Unsupported currency. Use RWF, USD, UGX, TZS, or KES');
    }

    // Reference validation
    if (!data.reference) {
      errors.push('Reference is required');
    } else if (typeof data.reference !== 'string' || data.reference.length < 3) {
      errors.push('Reference must be at least 3 characters long');
    } else if (data.reference.length > 50) {
      errors.push('Reference must be less than 50 characters');
    } else if (!/^[a-zA-Z0-9-_\s]+$/.test(data.reference)) {
      errors.push('Reference can only contain letters, numbers, hyphens, underscores, and spaces');
    }

    // Host ID validation
    if (!data.hostId) {
      errors.push('Host ID is required');
    } else if (typeof data.hostId !== 'number' || data.hostId <= 0) {
      errors.push('Host ID must be a positive number');
    }

    // Agent ID validation (optional)
    if (data.agentId && (typeof data.agentId !== 'number' || data.agentId <= 0)) {
      errors.push('Agent ID must be a positive number');
    }

    // Split rules validation
    if (!data.splitRules) {
      errors.push('Split rules are required');
    } else {
      const splitErrors = validateSplitRules(data.splitRules);
      errors.push(...splitErrors);
    }

    // Billing info validation
    if (!data.billingInfo) {
      errors.push('Billing information is required');
    } else {
      const billingErrors = validateBillingInfo(data.billingInfo);
      errors.push(...billingErrors);
    }

    // Description validation (optional)
    if (data.description && (typeof data.description !== 'string' || data.description.length > 200)) {
      errors.push('Description must be a string with maximum 200 characters');
    }

    if (errors.length > 0) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Deposit validation failed',
          details: { errors },
          timestamp: new Date().toISOString()
        }
      });
      return;
    }

    next();
  } catch (error: any) {
    console.error('Deposit validation error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation error occurred',
        timestamp: new Date().toISOString()
      }
    });
  }
};

export const validateWithdrawal = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  try {
    const data: WithdrawDto = req.body;
    const errors: string[] = [];

    // Amount validation
    if (!data.amount) {
      errors.push('Amount is required');
    } else if (typeof data.amount !== 'number' || data.amount <= 0) {
      errors.push('Amount must be a positive number');
    } else if (data.amount < 500) {
      errors.push('Minimum withdrawal amount is 500 RWF');
    } else if (data.amount > 5000000) {
      errors.push('Maximum withdrawal amount is 5,000,000 RWF');
    }

    // Method validation
    if (!data.method) {
      errors.push('Withdrawal method is required');
    } else if (!['MOBILE', 'BANK'].includes(data.method)) {
      errors.push('Withdrawal method must be MOBILE or BANK');
    }

    // Destination validation
    if (!data.destination) {
      errors.push('Destination details are required');
    } else {
      const destinationErrors = validateDestination(data.destination, data.method);
      errors.push(...destinationErrors);
    }

    // Reference validation
    if (!data.reference) {
      errors.push('Reference is required');
    } else if (typeof data.reference !== 'string' || data.reference.length < 3) {
      errors.push('Reference must be at least 3 characters long');
    } else if (data.reference.length > 50) {
      errors.push('Reference must be less than 50 characters');
    }

    // Particulars validation (optional)
    if (data.particulars && (typeof data.particulars !== 'string' || data.particulars.length > 100)) {
      errors.push('Particulars must be a string with maximum 100 characters');
    }

    if (errors.length > 0) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Withdrawal validation failed',
          details: { errors },
          timestamp: new Date().toISOString()
        }
      });
      return;
    }

    next();
  } catch (error: any) {
    console.error('Withdrawal validation error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation error occurred',
        timestamp: new Date().toISOString()
      }
    });
  }
};

export const validateRefund = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  try {
    const data: RefundDto = req.body;
    const errors: string[] = [];

    // Amount validation (optional for full refunds)
    if (data.amount !== undefined) {
      if (typeof data.amount !== 'number' || data.amount <= 0) {
        errors.push('Amount must be a positive number');
      } else if (data.amount < 100) {
        errors.push('Minimum refund amount is 100 RWF');
      }
    }

    // Reason validation
    if (!data.reason) {
      errors.push('Refund reason is required');
    } else if (typeof data.reason !== 'string' || data.reason.length < 10) {
      errors.push('Refund reason must be at least 10 characters long');
    } else if (data.reason.length > 500) {
      errors.push('Refund reason must be less than 500 characters');
    }

    if (errors.length > 0) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Refund validation failed',
          details: { errors },
          timestamp: new Date().toISOString()
        }
      });
      return;
    }

    next();
  } catch (error: any) {
    console.error('Refund validation error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation error occurred',
        timestamp: new Date().toISOString()
      }
    });
  }
};

export const validateRelease = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  try {
    const data: ReleaseEscrowDto = req.body;
    const errors: string[] = [];

    // Release reason validation (optional)
    if (data.releaseReason && (typeof data.releaseReason !== 'string' || data.releaseReason.length > 200)) {
      errors.push('Release reason must be a string with maximum 200 characters');
    }

    if (errors.length > 0) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Release validation failed',
          details: { errors },
          timestamp: new Date().toISOString()
        }
      });
      return;
    }

    next();
  } catch (error: any) {
    console.error('Release validation error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation error occurred',
        timestamp: new Date().toISOString()
      }
    });
  }
};

// === WEBHOOK SECURITY ===

export const validatePesapalWebhook = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const signature = req.headers['x-pesapal-signature'] as string;
    const timestamp = req.headers['x-pesapal-timestamp'] as string;
    const webhookSecret = process.env.PESAPAL_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error('Pesapal webhook secret not configured');
      res.status(500).json({
        success: false,
        message: 'Webhook configuration error'
      });
      return;
    }

    if (!signature) {
      res.status(401).json({
        success: false,
        message: 'Missing Pesapal webhook signature'
      });
      return;
    }

    // Verify timestamp to prevent replay attacks
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

    // Verify signature
    const payload = JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(payload)
      .digest('hex');

    const receivedSignature = signature.replace('sha256=', '');

    // Use constant time comparison to prevent timing attacks
    const isValidSignature = crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(receivedSignature, 'hex')
    );

    if (!isValidSignature) {
      res.status(401).json({
        success: false,
        message: 'Invalid webhook signature'
      });
      return;
    }

    next();
  } catch (error: any) {
    console.error('Webhook validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Webhook validation error'
    });
  }
};

// === IP WHITELISTING ===

export const ipWhitelist = (req: Request, res: Response, next: NextFunction): void => {
  if (process.env.NODE_ENV === 'production') {
    const allowedIPs = process.env.PESAPAL_WEBHOOK_IPS?.split(',') || [];
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

// === DATA SANITIZATION ===

export const sanitizeEscrowData = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const sanitizeString = (str: string): string => {
      if (typeof str !== 'string') return str;
      return str
        .replace(/[<>]/g, '') // Remove HTML tags
        .replace(/["']/g, '') // Remove quotes
        .trim();
    };

    if (req.body) {
      // Sanitize string fields
      if (req.body.description) {
        req.body.description = sanitizeString(req.body.description);
      }
      if (req.body.reference) {
        req.body.reference = sanitizeString(req.body.reference);
      }
      if (req.body.reason) {
        req.body.reason = sanitizeString(req.body.reason);
      }
      if (req.body.releaseReason) {
        req.body.releaseReason = sanitizeString(req.body.releaseReason);
      }
      if (req.body.particulars) {
        req.body.particulars = sanitizeString(req.body.particulars);
      }

      // Sanitize nested objects
      if (req.body.billingInfo) {
        Object.keys(req.body.billingInfo).forEach(key => {
          if (typeof req.body.billingInfo[key] === 'string') {
            req.body.billingInfo[key] = sanitizeString(req.body.billingInfo[key]);
          }
        });
      }

      if (req.body.destination) {
        Object.keys(req.body.destination).forEach(key => {
          if (typeof req.body.destination[key] === 'string') {
            req.body.destination[key] = sanitizeString(req.body.destination[key]);
          }
        });
      }
    }

    next();
  } catch (error: any) {
    console.error('Data sanitization error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DATA_PROCESSING_ERROR',
        message: 'Data processing error occurred',
        timestamp: new Date().toISOString()
      }
    });
  }
};

// === REQUEST LOGGING ===

export const logEscrowRequest = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const userId = req.user?.userId || 'anonymous';
  const endpoint = req.path;
  const method = req.method;
  const ip = req.ip;
  const userAgent = req.get('User-Agent');

  console.log(`[ESCROW] ${method} ${endpoint} - User: ${userId}, IP: ${ip}, UA: ${userAgent?.substring(0, 50)}...`);
  
  // Log operation type and amount (without exposing sensitive data)
  if (req.body?.amount) {
    const operationType = endpoint.split('/').pop() || 'unknown';
    console.log(`[ESCROW] Operation: ${operationType}, Amount: ${req.body.amount} ${req.body.currency || 'RWF'}`);
  }

  next();
};

// === HELPER FUNCTIONS ===

function validateSplitRules(rules: SplitRules): string[] {
  const errors: string[] = [];

  if (!rules.host || typeof rules.host !== 'number' || rules.host < 0 || rules.host > 100) {
    errors.push('Host split percentage must be between 0 and 100');
  }

  if (!rules.agent || typeof rules.agent !== 'number' || rules.agent < 0 || rules.agent > 100) {
    errors.push('Agent split percentage must be between 0 and 100');
  }

  if (!rules.platform || typeof rules.platform !== 'number' || rules.platform < 0 || rules.platform > 100) {
    errors.push('Platform split percentage must be between 0 and 100');
  }

  const total = rules.host + rules.agent + rules.platform;
  if (Math.abs(total - 100) > 0.01) {
    errors.push('Split percentages must total exactly 100%');
  }

  return errors;
}

function validateBillingInfo(billingInfo: any): string[] {
  const errors: string[] = [];

  if (!billingInfo.email) {
    errors.push('Billing email is required');
  } else if (typeof billingInfo.email !== 'string' || !isValidEmail(billingInfo.email)) {
    errors.push('Valid billing email is required');
  }

  if (billingInfo.phone && !isValidPhoneNumber(billingInfo.phone)) {
    errors.push('Invalid phone number format');
  }

  if (billingInfo.firstName && (typeof billingInfo.firstName !== 'string' || billingInfo.firstName.length < 1)) {
    errors.push('First name must be a non-empty string');
  }

  if (billingInfo.lastName && (typeof billingInfo.lastName !== 'string' || billingInfo.lastName.length < 1)) {
    errors.push('Last name must be a non-empty string');
  }

  if (billingInfo.countryCode && (typeof billingInfo.countryCode !== 'string' || billingInfo.countryCode.length !== 2)) {
    errors.push('Country code must be a 2-character string');
  }

  return errors;
}

function validateDestination(destination: any, method: PayoutMethod): string[] {
  const errors: string[] = [];

  if (!destination.holderName) {
    errors.push('Account holder name is required');
  } else if (typeof destination.holderName !== 'string' || destination.holderName.length < 2) {
    errors.push('Account holder name must be at least 2 characters long');
  } else if (destination.holderName.length > 100) {
    errors.push('Account holder name must be less than 100 characters');
  }

  if (!destination.accountNumber) {
    errors.push('Account number is required');
  } else if (typeof destination.accountNumber !== 'string') {
    errors.push('Account number must be a string');
  }

  if (method === 'MOBILE') {
    // Validate mobile number
    if (!isValidPhoneNumber(destination.accountNumber)) {
      errors.push('Invalid mobile number format');
    }

    if (destination.mobileProvider) {
      const validProviders: MobileProvider[] = ['MTN', 'AIRTEL', 'TIGO', 'RWANDATEL'];
      if (!validProviders.includes(destination.mobileProvider)) {
        errors.push('Invalid mobile provider. Use MTN, AIRTEL, TIGO, or RWANDATEL');
      }
    }
  } else if (method === 'BANK') {
    // Validate bank account
    if (destination.accountNumber.length < 8 || destination.accountNumber.length > 20) {
      errors.push('Bank account number must be 8-20 characters long');
    }

    if (!/^\d+$/.test(destination.accountNumber)) {
      errors.push('Bank account number must contain only digits');
    }

    if (!destination.bankCode) {
      errors.push('Bank code is required for bank transfers');
    } else if (typeof destination.bankCode !== 'string' || destination.bankCode.length < 3) {
      errors.push('Bank code must be at least 3 characters long');
    }
  }

  if (destination.countryCode && (typeof destination.countryCode !== 'string' || destination.countryCode.length !== 2)) {
    errors.push('Country code must be a 2-character string');
  }

  return errors;
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function isValidPhoneNumber(phone: string): boolean {
  // Basic phone number validation - can be enhanced for specific countries
  const phoneRegex = /^(\+250|250|0)?(7[0-9]{8})$/;
  const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');
  return phoneRegex.test(cleanPhone);
}

export const validateTransactionId = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const { transactionId } = req.params;

    if (!transactionId) {
      res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_FAILED",
          message: "Transaction ID is required",
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Regex for Pesapal UUID (orderTrackingId)
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    // Regex for internal DB IDs (cuid/nanoid style: alphanumeric, underscores, hyphens, 10+ chars)
    const customIdRegex = /^[a-zA-Z0-9_-]{10,}$/;

    const isValid =
      uuidRegex.test(transactionId) || customIdRegex.test(transactionId);

    if (!isValid) {
      res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_FAILED",
          message: "Invalid transaction ID format",
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Passed validation
    next();
  } catch (error: any) {
    console.error("Transaction ID validation error:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Validation error occurred",
        timestamp: new Date().toISOString(),
      },
    });
  }
}