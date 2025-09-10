import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import {
  EscrowDepositDto,
  EscrowWithdrawalDto,
  EscrowTransferDto,
  EscrowP2PDto,
  EscrowWebhookData,
  EscrowTerms,
  WithdrawalMethod
} from '../types/escrow.types';

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
  };
}

// --- RATE LIMITING FOR ESCROW OPERATIONS ---
export const rateLimitEscrowPayments = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 25, // More restrictive for escrow operations
  message: {
    success: false,
    message: 'Too many escrow requests, please try again later.'
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

// --- ESCROW DEPOSIT VALIDATION ---
export const validateEscrowDeposit = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  try {
    const data: EscrowDepositDto = req.body;
    const errors: string[] = [];

    // Required fields validation
    if (!data.amount) {
      errors.push('Amount is required');
    } else if (typeof data.amount !== 'number' || data.amount <= 0) {
      errors.push('Amount must be a positive number');
    } else if (data.amount < 1) {
      errors.push('Minimum escrow amount is 1 USD/RWF');
    } else if (data.amount > 1000000) {
      errors.push('Maximum escrow amount is 1,000,000 USD/RWF');
    }

    if (!data.currency) {
      errors.push('Currency is required');
    } else if (!['USD', 'RWF'].includes(data.currency)) {
      errors.push('Currency must be USD or RWF');
    }

    if (!data.reference) {
      errors.push('Reference is required');
    } else if (typeof data.reference !== 'string' || data.reference.length < 3) {
      errors.push('Reference must be at least 3 characters long');
    } else if (data.reference.length > 100) {
      errors.push('Reference must be less than 100 characters');
    } else if (!/^[a-zA-Z0-9-_\s]+$/.test(data.reference)) {
      errors.push('Reference can only contain letters, numbers, hyphens, underscores, and spaces');
    }

    // Escrow terms validation
    if (!data.escrowTerms) {
      errors.push('Escrow terms are required');
    } else {
      const termsErrors = validateEscrowTerms(data.escrowTerms);
      errors.push(...termsErrors);
    }

    // Optional recipient validation
    if (data.recipientId && (typeof data.recipientId !== 'number' || data.recipientId <= 0)) {
      errors.push('Recipient ID must be a positive number');
    }

    // Description validation
    if (data.description && (typeof data.description !== 'string' || data.description.length > 500)) {
      errors.push('Description must be a string with maximum 500 characters');
    }

    // Date validations
    if (data.disputeDeadline) {
      const deadline = new Date(data.disputeDeadline);
      const now = new Date();
      const maxDeadline = new Date(now.getTime() + (365 * 24 * 60 * 60 * 1000)); // 1 year from now

      if (deadline <= now) {
        errors.push('Dispute deadline must be in the future');
      }
      if (deadline > maxDeadline) {
        errors.push('Dispute deadline cannot be more than 1 year from now');
      }
    }

    if (data.autoReleaseDate) {
      const releaseDate = new Date(data.autoReleaseDate);
      const now = new Date();
      const maxReleaseDate = new Date(now.getTime() + (365 * 24 * 60 * 60 * 1000)); // 1 year from now

      if (releaseDate <= now) {
        errors.push('Auto release date must be in the future');
      }
      if (releaseDate > maxReleaseDate) {
        errors.push('Auto release date cannot be more than 1 year from now');
      }
    }

    if (errors.length > 0) {
      res.status(400).json({
        success: false,
        message: 'Escrow deposit validation failed',
        errors
      });
      return;
    }

    next();
  } catch (error: any) {
    console.error('Escrow deposit validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Validation error'
    });
  }
};

// --- ESCROW WITHDRAWAL VALIDATION ---
export const validateEscrowWithdrawal = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  try {
    const data: EscrowWithdrawalDto = req.body;
    const errors: string[] = [];

    // Required fields validation
    if (!data.escrowTransactionId) {
      errors.push('Escrow transaction ID is required');
    } else if (typeof data.escrowTransactionId !== 'string' || data.escrowTransactionId.length < 10) {
      errors.push('Invalid escrow transaction ID format');
    }

    if (!data.withdrawalMethod) {
      errors.push('Withdrawal method is required');
    } else if (!['bank_transfer', 'mobile_money', 'card', 'wallet'].includes(data.withdrawalMethod)) {
      errors.push('Invalid withdrawal method');
    }

    // Amount validation (for partial withdrawals)
    if (data.amount !== undefined) {
      if (typeof data.amount !== 'number' || data.amount <= 0) {
        errors.push('Amount must be a positive number');
      } else if (data.amount < 1) {
        errors.push('Minimum withdrawal amount is 1 USD/RWF');
      }
    }

    // Method-specific validations
    if (data.withdrawalMethod === 'bank_transfer') {
      if (!data.accountNumber) {
        errors.push('Account number is required for bank transfers');
      } else if (typeof data.accountNumber !== 'string' || data.accountNumber.length < 8) {
        errors.push('Account number must be at least 8 characters long');
      } else if (!/^\d+$/.test(data.accountNumber)) {
        errors.push('Account number must contain only digits');
      }

      if (!data.bankCode) {
        errors.push('Bank code is required for bank transfers');
      } else if (typeof data.bankCode !== 'string' || data.bankCode.length < 2) {
        errors.push('Bank code must be at least 2 characters long');
      }

      if (!data.accountName) {
        errors.push('Account name is required for bank transfers');
      } else if (typeof data.accountName !== 'string' || data.accountName.length < 2) {
        errors.push('Account name must be at least 2 characters long');
      } else if (!/^[a-zA-Z\s.-]+$/.test(data.accountName)) {
        errors.push('Account name can only contain letters, spaces, dots, and hyphens');
      }
    }

    if (data.withdrawalMethod === 'mobile_money') {
      if (!data.phoneNumber) {
        errors.push('Phone number is required for mobile money');
      } else if (typeof data.phoneNumber !== 'string') {
        errors.push('Phone number must be a string');
      } else {
        const phoneRegex = /^(\+250|250|0)?[17]\d{8}$/; // Rwanda phone format
        const cleanPhone = data.phoneNumber.replace(/\s|-/g, '');
        if (!phoneRegex.test(cleanPhone)) {
          errors.push('Invalid Rwandan phone number format');
        }
      }
    }

    // Release reason validation
    if (data.releaseReason && (typeof data.releaseReason !== 'string' || data.releaseReason.length > 200)) {
      errors.push('Release reason must be a string with maximum 200 characters');
    }

    if (errors.length > 0) {
      res.status(400).json({
        success: false,
        message: 'Escrow withdrawal validation failed',
        errors
      });
      return;
    }

    next();
  } catch (error: any) {
    console.error('Escrow withdrawal validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Validation error'
    });
  }
};

// --- ESCROW TRANSFER VALIDATION ---
export const validateEscrowTransfer = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  try {
    const data: EscrowTransferDto = req.body;
    const errors: string[] = [];

    // Required fields validation
    if (!data.sourceEscrowId) {
      errors.push('Source escrow ID is required');
    } else if (typeof data.sourceEscrowId !== 'string' || data.sourceEscrowId.length < 10) {
      errors.push('Invalid source escrow ID format');
    }

    if (!data.recipientId) {
      errors.push('Recipient ID is required');
    } else if (typeof data.recipientId !== 'number' || data.recipientId <= 0) {
      errors.push('Recipient ID must be a positive number');
    }

    if (!data.amount) {
      errors.push('Amount is required');
    } else if (typeof data.amount !== 'number' || data.amount <= 0) {
      errors.push('Amount must be a positive number');
    } else if (data.amount < 1) {
      errors.push('Minimum transfer amount is 1 USD/RWF');
    }

    if (!data.currency) {
      errors.push('Currency is required');
    } else if (!['USD', 'RWF'].includes(data.currency)) {
      errors.push('Currency must be USD or RWF');
    }

    if (!data.reference) {
      errors.push('Reference is required');
    } else if (typeof data.reference !== 'string' || data.reference.length < 3) {
      errors.push('Reference must be at least 3 characters long');
    } else if (data.reference.length > 100) {
      errors.push('Reference must be less than 100 characters');
    }

    // Transfer type validation
    if (data.transferType && !['full', 'partial'].includes(data.transferType)) {
      errors.push('Transfer type must be "full" or "partial"');
    }

    // Escrow terms validation (if provided)
    if (data.escrowTerms) {
      const termsErrors = validateEscrowTerms(data.escrowTerms);
      errors.push(...termsErrors);
    }

    // Description validation
    if (data.description && (typeof data.description !== 'string' || data.description.length > 500)) {
      errors.push('Description must be a string with maximum 500 characters');
    }

    if (errors.length > 0) {
      res.status(400).json({
        success: false,
        message: 'Escrow transfer validation failed',
        errors
      });
      return;
    }

    next();
  } catch (error: any) {
    console.error('Escrow transfer validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Validation error'
    });
  }
};

// --- P2P ESCROW VALIDATION ---
export const validateP2PEscrow = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  try {
    const data: EscrowP2PDto = req.body;
    const errors: string[] = [];

    // Required fields validation
    if (!data.recipientId) {
      errors.push('Recipient ID is required');
    } else if (typeof data.recipientId !== 'number' || data.recipientId <= 0) {
      errors.push('Recipient ID must be a positive number');
    }

    // Check if sender is not the same as recipient
    const senderId = parseInt(req.user!.userId);
    if (data.recipientId === senderId) {
      errors.push('Cannot create P2P escrow payment to yourself');
    }

    if (!data.amount) {
      errors.push('Amount is required');
    } else if (typeof data.amount !== 'number' || data.amount <= 0) {
      errors.push('Amount must be a positive number');
    } else if (data.amount < 1) {
      errors.push('Minimum P2P escrow amount is 1 USD/RWF');
    } else if (data.amount > 100000) {
      errors.push('Maximum P2P escrow amount is 100,000 USD/RWF');
    }

    if (!data.currency) {
      errors.push('Currency is required');
    } else if (!['USD', 'RWF'].includes(data.currency)) {
      errors.push('Currency must be USD or RWF');
    }

    if (!data.reference) {
      errors.push('Reference is required');
    } else if (typeof data.reference !== 'string' || data.reference.length < 3) {
      errors.push('Reference must be at least 3 characters long');
    } else if (data.reference.length > 100) {
      errors.push('Reference must be less than 100 characters');
    }

    // Escrow terms validation
    if (!data.escrowTerms) {
      errors.push('Escrow terms are required for P2P payments');
    } else {
      const termsErrors = validateEscrowTerms(data.escrowTerms);
      errors.push(...termsErrors);
    }

    // Description validation
    if (data.description && (typeof data.description !== 'string' || data.description.length > 500)) {
      errors.push('Description must be a string with maximum 500 characters');
    }

    // Date validations
    if (data.disputeDeadline) {
      const deadline = new Date(data.disputeDeadline);
      const now = new Date();
      const maxDeadline = new Date(now.getTime() + (90 * 24 * 60 * 60 * 1000)); // 90 days for P2P

      if (deadline <= now) {
        errors.push('Dispute deadline must be in the future');
      }
      if (deadline > maxDeadline) {
        errors.push('Dispute deadline cannot be more than 90 days from now for P2P payments');
      }
    }

    if (data.autoReleaseDate) {
      const releaseDate = new Date(data.autoReleaseDate);
      const now = new Date();
      const maxReleaseDate = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000)); // 30 days for P2P

      if (releaseDate <= now) {
        errors.push('Auto release date must be in the future');
      }
      if (releaseDate > maxReleaseDate) {
        errors.push('Auto release date cannot be more than 30 days from now for P2P payments');
      }
    }

    if (errors.length > 0) {
      res.status(400).json({
        success: false,
        message: 'P2P escrow validation failed',
        errors
      });
      return;
    }

    next();
  } catch (error: any) {
    console.error('P2P escrow validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Validation error'
    });
  }
};

// --- ESCROW WEBHOOK SIGNATURE VALIDATION ---
export const validateEscrowWebhookSignature = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const signature = req.headers['x-escrow-signature'] as string;
    const timestamp = req.headers['x-escrow-timestamp'] as string;
    const webhookSecret = process.env.ESCROW_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error('Escrow webhook secret not configured');
      res.status(500).json({
        success: false,
        message: 'Webhook configuration error'
      });
      return;
    }

    if (!signature) {
      res.status(401).json({
        success: false,
        message: 'Missing escrow webhook signature'
      });
      return;
    }

    if (!timestamp) {
      res.status(401).json({
        success: false,
        message: 'Missing escrow webhook timestamp'
      });
      return;
    }

    // Verify timestamp to prevent replay attacks
    const webhookTime = parseInt(timestamp) * 1000;
    const currentTime = Date.now();
    const fiveMinutes = 5 * 60 * 1000;

    if (currentTime - webhookTime > fiveMinutes) {
      res.status(401).json({
        success: false,
        message: 'Escrow webhook timestamp too old'
      });
      return;
    }

    // Verify signature
    const payload = `${timestamp}${JSON.stringify(req.body)}`;
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
        message: 'Invalid escrow webhook signature'
      });
      return;
    }

    next();
  } catch (error: any) {
    console.error('Escrow webhook signature validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Webhook validation error'
    });
  }
};

// --- ESCROW TERMS VALIDATION HELPER ---
function validateEscrowTerms(terms: EscrowTerms): string[] {
  const errors: string[] = [];

  if (!terms.type) {
    errors.push('Escrow terms type is required');
  } else if (!['manual', 'automatic', 'conditional', 'milestone'].includes(terms.type)) {
    errors.push('Invalid escrow terms type');
  }

  if (!terms.description) {
    errors.push('Escrow terms description is required');
  } else if (typeof terms.description !== 'string' || terms.description.length < 10) {
    errors.push('Escrow terms description must be at least 10 characters long');
  } else if (terms.description.length > 1000) {
    errors.push('Escrow terms description must be less than 1000 characters');
  }

  if (!terms.conditions || !Array.isArray(terms.conditions) || terms.conditions.length === 0) {
    errors.push('At least one escrow condition is required');
  } else {
    terms.conditions.forEach((condition: any, index: any) => {
      if (typeof condition !== 'string' || condition.length < 5) {
        errors.push(`Condition ${index + 1} must be at least 5 characters long`);
      } else if (condition.length > 200) {
        errors.push(`Condition ${index + 1} must be less than 200 characters`);
      }
    });

    if (terms.conditions.length > 10) {
      errors.push('Maximum 10 conditions allowed');
    }
  }

  // Milestone validation
  if (terms.milestones && Array.isArray(terms.milestones)) {
    if (terms.milestones.length > 20) {
      errors.push('Maximum 20 milestones allowed');
    }

    let totalPercentage = 0;
    terms.milestones.forEach((milestone: any, index: any) => {
      if (!milestone.title || typeof milestone.title !== 'string' || milestone.title.length < 3) {
        errors.push(`Milestone ${index + 1} title must be at least 3 characters long`);
      }

      if (!milestone.description || typeof milestone.description !== 'string' || milestone.description.length < 10) {
        errors.push(`Milestone ${index + 1} description must be at least 10 characters long`);
      }

      if (typeof milestone.amount !== 'number' || milestone.amount <= 0) {
        errors.push(`Milestone ${index + 1} amount must be a positive number`);
      }

      if (typeof milestone.percentage !== 'number' || milestone.percentage <= 0 || milestone.percentage > 100) {
        errors.push(`Milestone ${index + 1} percentage must be between 1 and 100`);
      } else {
        totalPercentage += milestone.percentage;
      }

      if (milestone.dueDate) {
        const dueDate = new Date(milestone.dueDate);
        const now = new Date();
        if (dueDate <= now) {
          errors.push(`Milestone ${index + 1} due date must be in the future`);
        }
      }
    });

    if (Math.abs(totalPercentage - 100) > 0.01) {
      errors.push('Total milestone percentages must equal 100%');
    }
  }

  // Auto release validation
  if (terms.autoRelease) {
    if (terms.autoRelease.enabled && !terms.autoRelease.date) {
      errors.push('Auto release date is required when auto release is enabled');
    }

    if (terms.autoRelease.date) {
      const releaseDate = new Date(terms.autoRelease.date);
      const now = new Date();
      if (releaseDate <= now) {
        errors.push('Auto release date must be in the future');
      }
    }

    if (terms.autoRelease.conditions && Array.isArray(terms.autoRelease.conditions)) {
      if (terms.autoRelease.conditions.length > 5) {
        errors.push('Maximum 5 auto release conditions allowed');
      }
    }
  }

  // Dispute settings validation
  if (terms.disputeSettings) {
    if (terms.disputeSettings.deadline) {
      const deadline = new Date(terms.disputeSettings.deadline);
      const now = new Date();
      if (deadline <= now) {
        errors.push('Dispute deadline must be in the future');
      }
    }
  }

  return errors;
}

// --- ESCROW SECURITY MIDDLEWARE ---
export const sanitizeEscrowData = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const sanitizeString = (str: string): string => {
      if (typeof str !== 'string') return str;
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
      if (req.body.releaseReason) {
        req.body.releaseReason = sanitizeString(req.body.releaseReason);
      }
      if (req.body.escrowTerms && req.body.escrowTerms.description) {
        req.body.escrowTerms.description = sanitizeString(req.body.escrowTerms.description);
      }
    }

    next();
  } catch (error: any) {
    console.error('Escrow data sanitization error:', error);
    res.status(500).json({
      success: false,
      message: 'Data processing error'
    });
  }
};

// --- ESCROW IP WHITELIST MIDDLEWARE ---
export const escrowIpWhitelist = (req: Request, res: Response, next: NextFunction): void => {
  if (process.env.NODE_ENV === 'production') {
    const allowedIPs = process.env.ESCROW_WEBHOOK_IPS?.split(',') || [];
    const clientIP = req.ip || req.connection.remoteAddress;

    if (allowedIPs.length > 0 && clientIP && !allowedIPs.includes(clientIP)) {
      res.status(403).json({
        success: false,
        message: 'IP not whitelisted for escrow operations'
      });
      return;
    }
  }
  
  next();
};

// --- ESCROW REQUEST LOGGING MIDDLEWARE ---
export const logEscrowRequest = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const userId = req.user?.userId || 'anonymous';
  const endpoint = req.path;
  const method = req.method;
  const ip = req.ip;
  const userAgent = req.get('User-Agent');

  console.log(`[ESCROW] ${method} ${endpoint} - User: ${userId}, IP: ${ip}, UA: ${userAgent}`);
  
  // Log sensitive data carefully (don't log full request body)
  if (req.body?.amount) {
    console.log(`[ESCROW] Amount: ${req.body.amount} ${req.body.currency || 'USD'}, Type: ${endpoint.replace('/api/payments/escrow/', '')}`);
  }
  if (req.body?.recipientId) {
    console.log(`[ESCROW] Recipient: ${req.body.recipientId}`);
  }

  next();
};