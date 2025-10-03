// middleware/xentripay.middleware.ts

import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';

// ==================== RATE LIMITING ====================

export const rateLimitXentriPayOperations = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 requests per window
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please try again later.'
    }
  },
  standardHeaders: true,
  legacyHeaders: false
});

export const rateLimitXentriPayWebhooks = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 webhooks per minute
  message: {
    success: false,
    error: {
      code: 'WEBHOOK_RATE_LIMIT',
      message: 'Webhook rate limit exceeded'
    }
  },
  skip: (req) => {
    // Skip rate limiting for webhooks from XentriPay IPs (optional)
    // Add XentriPay webhook IPs here if known
    return false;
  }
});

// ==================== VALIDATION MIDDLEWARE ====================

export const validateXentriPayDeposit = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const {
    buyerId,
    buyerEmail,
    buyerName,
    buyerPhone,
    sellerId,
    sellerName,
    sellerPhone,
    amount,
    description
  } = req.body;

  const errors: string[] = [];

  // Buyer validation
  if (!buyerId) errors.push('buyerId is required');
  if (!buyerEmail) errors.push('buyerEmail is required');
  if (!buyerName) errors.push('buyerName is required');
  if (!buyerPhone) errors.push('buyerPhone is required');

  // Seller validation
  if (!sellerId) errors.push('sellerId is required');
  if (!sellerName) errors.push('sellerName is required');
  if (!sellerPhone) errors.push('sellerPhone is required');

  // Amount validation
  if (!amount) {
    errors.push('amount is required');
  } else if (typeof amount !== 'number' || amount <= 0) {
    errors.push('amount must be a positive number');
  } else if (!Number.isInteger(amount)) {
    errors.push('amount must be a whole number (no decimals)');
  }

  // Email validation
  if (buyerEmail && !isValidEmail(buyerEmail)) {
    errors.push('buyerEmail must be a valid email address');
  }

  // Phone validation
  if (buyerPhone && !isValidRwandaPhone(buyerPhone)) {
    errors.push('buyerPhone must be a valid Rwanda phone number');
  }
  if (sellerPhone && !isValidRwandaPhone(sellerPhone)) {
    errors.push('sellerPhone must be a valid Rwanda phone number');
  }

  if (errors.length > 0) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid deposit request',
        errors
      }
    });
    return;
  }

  next();
};

export const validateXentriPayWithdrawal = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const { userId, phoneNumber, recipientName, amount } = req.body;

  const errors: string[] = [];

  if (!userId) errors.push('userId is required');
  if (!phoneNumber) errors.push('phoneNumber is required');
  if (!recipientName) errors.push('recipientName is required');
  
  if (!amount) {
    errors.push('amount is required');
  } else if (typeof amount !== 'number' || amount <= 0) {
    errors.push('amount must be a positive number');
  } else if (!Number.isInteger(amount)) {
    errors.push('amount must be a whole number (no decimals)');
  }

  if (phoneNumber && !isValidRwandaPhone(phoneNumber)) {
    errors.push('phoneNumber must be a valid Rwanda phone number');
  }

  if (errors.length > 0) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid withdrawal request',
        errors
      }
    });
    return;
  }

  next();
};

export const validateXentriPayRelease = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const { requesterId } = req.body;

  if (!requesterId) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'requesterId is required'
      }
    });
    return;
  }

  next();
};

export const validateXentriPayRefund = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const { requesterId, reason } = req.body;

  const errors: string[] = [];

  if (!requesterId) errors.push('requesterId is required');
  if (!reason) errors.push('reason is required');
  if (reason && typeof reason !== 'string') errors.push('reason must be a string');
  if (reason && reason.length < 10) errors.push('reason must be at least 10 characters');

  if (errors.length > 0) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid refund request',
        errors
      }
    });
    return;
  }

  next();
};

export const validateTransactionId = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const { transactionId } = req.params;

  if (!transactionId) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'transactionId is required'
      }
    });
    return;
  }

  if (typeof transactionId !== 'string' || transactionId.length < 5) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid transactionId format'
      }
    });
    return;
  }

  next();
};

export const validateXentriPayWebhook = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Basic webhook validation
  const { refid, status } = req.body;

  if (!refid || !status) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_WEBHOOK',
        message: 'Webhook data is incomplete'
      }
    });
    return;
  }

  next();
};

// ==================== SANITIZATION ====================

export const sanitizeXentriPayData = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (req.body) {
    // Trim string values
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        req.body[key] = req.body[key].trim();
      }
    });

    // Remove extra spaces from phone numbers
    if (req.body.buyerPhone) {
      req.body.buyerPhone = req.body.buyerPhone.replace(/\s+/g, '');
    }
    if (req.body.sellerPhone) {
      req.body.sellerPhone = req.body.sellerPhone.replace(/\s+/g, '');
    }
    if (req.body.phoneNumber) {
      req.body.phoneNumber = req.body.phoneNumber.replace(/\s+/g, '');
    }

    // Ensure amount is a number
    if (req.body.amount && typeof req.body.amount === 'string') {
      req.body.amount = parseFloat(req.body.amount);
    }
  }

  next();
};

// ==================== LOGGING ====================

export const logXentriPayRequest = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const timestamp = new Date().toISOString();
  const method = req.method;
  const path = req.path;
  const userId = (req as any).user?.id || 'anonymous';

  console.log(`[XENTRIPAY] ${timestamp} | ${method} ${path} | User: ${userId}`);

  // Log request body (excluding sensitive data)
  if (req.body && Object.keys(req.body).length > 0) {
    const sanitizedBody = { ...req.body };
    
    // Remove sensitive fields from logs
    if (sanitizedBody.buyerPhone) sanitizedBody.buyerPhone = '***';
    if (sanitizedBody.sellerPhone) sanitizedBody.sellerPhone = '***';
    if (sanitizedBody.phoneNumber) sanitizedBody.phoneNumber = '***';
    
    console.log('[XENTRIPAY] Request body:', JSON.stringify(sanitizedBody, null, 2));
  }

  next();
};

// ==================== HELPER FUNCTIONS ====================

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function isValidRwandaPhone(phone: string): boolean {
  // Remove all non-digit characters
  const cleaned = phone.replace(/\D/g, '');
  
  // Check if it matches Rwanda phone format
  // Valid formats: 0XXXXXXXXX (10 digits) or 250XXXXXXXXX (12 digits)
  if (cleaned.length === 10 && cleaned.startsWith('0')) {
    return true;
  }
  if (cleaned.length === 12 && cleaned.startsWith('250')) {
    return true;
  }
  
  return false;
}