//src/middleware/admin.middleware.ts

import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { body, query, param, validationResult } from 'express-validator';
import { AdminPermission, AdminRole, AdminQueryParams } from '../types/admin.types';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

declare global {
  namespace Express {
    interface Request {
      adminPermissions?: AdminPermission[];
      adminRole?: AdminRole;
      bulkOperationId?: string;
    }
  }
}

// === CORE ADMIN AUTHENTICATION & AUTHORIZATION ===

/**
 * Ensures user is an admin
 */
export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ 
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
      timestamp: new Date().toISOString()
    });
  }

  if (req.user.userType !== 'admin') {
    return res.status(403).json({ 
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Admin access required',
      },
      timestamp: new Date().toISOString()
    });
  }

  next();
};

/**
 * Checks for specific admin permissions
 */
export const requirePermissions = (...permissions: AdminPermission[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
        timestamp: new Date().toISOString()
      });
    }

    try {
      // Get admin user with permissions (implement based on your permission system)
      const adminUser = await prisma.user.findUnique({
        where: { id: parseInt(req.user.userId) },
        select: {
          id: true,
          userType: true,
          // Add permission fields when you implement them
        }
      });

      if (!adminUser || adminUser.userType !== 'admin') {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Admin access required',
          },
          timestamp: new Date().toISOString()
        });
      }

      // For now, all admins have all permissions
      // TODO: Implement granular permissions system
      req.adminPermissions = permissions;
      req.adminRole = 'admin' as AdminRole;

      next();
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Permission check failed',
        },
        timestamp: new Date().toISOString()
      });
    }
  };
};

/**
 * Checks if admin can access user data (own data or has permission)
 */
export const canAccessUser = async (req: Request, res: Response, next: NextFunction) => {
  const targetUserId = parseInt(req.params.id || req.params.userId || '0');
  const currentUserId = parseInt(req.user?.userId || '0');
  
  if (!targetUserId || isNaN(targetUserId)) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_REQUEST',
        message: 'Valid user ID required',
      },
      timestamp: new Date().toISOString()
    });
  }

  // Super admin can access anyone
  if (req.user?.userType === 'admin') {
    return next();
  }

  // Users can access their own data
  if (targetUserId === currentUserId) {
    return next();
  }

  return res.status(403).json({
    success: false,
    error: {
      code: 'FORBIDDEN',
      message: 'Access denied for this user',
    },
    timestamp: new Date().toISOString()
  });
};

// === RATE LIMITING ===

export const adminRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each admin to 1000 requests per windowMs
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many admin requests, please try again later',
    },
    timestamp: new Date().toISOString()
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const bulkOperationRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit bulk operations to 10 per hour
  message: {
    success: false,
    error: {
      code: 'BULK_RATE_LIMIT_EXCEEDED',
      message: 'Too many bulk operations, please try again later',
    },
    timestamp: new Date().toISOString()
  },
});

export const exportRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour  
  max: 5, // Limit exports to 5 per hour
  message: {
    success: false,
    error: {
      code: 'EXPORT_RATE_LIMIT_EXCEEDED',
      message: 'Too many export requests, please try again later',
    },
    timestamp: new Date().toISOString()
  },
});

// === VALIDATION MIDDLEWARE ===

/**
 * Handles validation errors
 */
export const handleValidation = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: errors.array(),
      },
      timestamp: new Date().toISOString()
    });
  }
  next();
};

/**
 * Validate query parameters for admin endpoints
 */
export const validateAdminQuery = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('sort').optional().isString().trim(),
  query('order').optional().isIn(['asc', 'desc']),
  query('search').optional().isString().trim(),
  query('filters').optional().isJSON(),
  handleValidation
];

/**
 * Validate user management requests
 */
export const validateUserCreate = [
  body('email').isEmail().normalizeEmail(),
  body('firstName').optional().isString().trim().isLength({ min: 1, max: 50 }),
  body('lastName').optional().isString().trim().isLength({ min: 1, max: 50 }),
  body('userType').optional().isIn(['guest', 'host', 'tourguide', 'agent', 'admin']),
  body('status').optional().isIn(['active', 'inactive', 'pending', 'suspended', 'unverified']),
  body('country').optional().isString().isLength({ max: 50 }),
  body('phone').optional().isMobilePhone('any'),
  handleValidation
];

export const validateUserUpdate = [
  param('id').isInt().toInt(),
  body('email').optional().isEmail().normalizeEmail(),
  body('firstName').optional().isString().trim().isLength({ min: 1, max: 50 }),
  body('lastName').optional().isString().trim().isLength({ min: 1, max: 50 }),
  body('userType').optional().isIn(['guest', 'host', 'tourguide', 'agent', 'admin']),
  body('status').optional().isIn(['active', 'inactive', 'pending', 'suspended', 'unverified']),
  body('isVerified').optional().isBoolean(),
  body('country').optional().isString().isLength({ max: 50 }),
  body('phone').optional().isMobilePhone('any'),
  handleValidation
];

/**
 * Validate property management requests  
 */
export const validatePropertyUpdate = [
  param('id').isInt().toInt(),
  body('name').optional().isString().trim().isLength({ min: 1, max: 200 }),
  body('location').optional().isString().trim().isLength({ min: 1, max: 200 }),
  body('type').optional().isString().trim(),
  body('category').optional().isString().trim(),
  body('pricePerNight').optional().isFloat({ min: 0 }),
  body('beds').optional().isInt({ min: 0 }),
  body('baths').optional().isInt({ min: 0 }),
  body('maxGuests').optional().isInt({ min: 1 }),
  body('status').optional().isIn(['pending', 'active', 'inactive', 'suspended', 'rejected']),
  body('isVerified').optional().isBoolean(),
  body('isInstantBook').optional().isBoolean(),
  handleValidation
];

/**
 * Validate tour management requests
 */
export const validateTourUpdate = [
  param('id').isString().trim(),
  body('title').optional().isString().trim().isLength({ min: 1, max: 200 }),
  body('description').optional().isString().trim(),
  body('category').optional().isString().trim(),
  body('type').optional().isString().trim(),
  body('duration').optional().isFloat({ min: 0 }),
  body('price').optional().isFloat({ min: 0 }),
  body('maxGroupSize').optional().isInt({ min: 1 }),
  body('difficulty').optional().isString().trim(),
  body('isActive').optional().isBoolean(),
  handleValidation
];

/**
 * Validate booking management requests
 */
export const validateBookingUpdate = [
  param('id').isString().trim(),
  body('status').optional().isIn(['pending', 'confirmed', 'cancelled', 'completed', 'refunded']),
  body('paymentStatus').optional().isIn(['pending', 'paid', 'failed', 'refunded', 'partially_refunded']),
  body('hostResponse').optional().isString().trim(),
  body('notes').optional().isString().trim(),
  handleValidation
];

/**
 * Validate payment transaction requests
 */
export const validatePaymentAction = [
  param('id').isString().trim(),
  body('action').isIn(['approve', 'reject', 'refund', 'dispute']),
  body('reason').optional().isString().trim(),
  body('amount').optional().isFloat({ min: 0 }),
  handleValidation
];

/**
 * Validate escrow transaction requests
 */
export const validateEscrowAction = [
  param('id').isString().trim(),
  body('action').isIn(['release', 'dispute', 'cancel', 'resolve']),
  body('reason').optional().isString().trim(),
  body('amount').optional().isFloat({ min: 0 }),
  handleValidation
];

/**
 * Validate bulk operation requests
 */
export const validateBulkOperation = [
  body('resource').isIn(['users', 'properties', 'tours', 'bookings', 'payments']),
  body('operation').isIn(['update', 'delete', 'export']),
  body('filters').optional().isObject(),
  body('updates').optional().isObject(),
  body('ids').optional().isArray(),
  body('dryRun').optional().isBoolean(),
  handleValidation
];

/**
 * Validate export requests
 */
export const validateExport = [
  body('resource').isIn(['users', 'properties', 'tours', 'bookings', 'payments', 'analytics']),
  body('format').isIn(['csv', 'excel', 'json', 'pdf']),
  body('filters').optional().isObject(),
  body('fields').optional().isArray(),
  body('includeRelations').optional().isBoolean(),
  handleValidation
];

/**
 * Validate analytics requests
 */
export const validateAnalytics = [
  query('period').optional().isIn(['day', 'week', 'month', 'quarter', 'year', 'custom']),
  query('startDate').optional().isISO8601().toDate(),
  query('endDate').optional().isISO8601().toDate(),
  query('metrics').optional().isString(),
  query('groupBy').optional().isString(),
  query('currency').optional().isString().isLength({ max: 3 }),
  handleValidation
];

// === AUDIT LOGGING MIDDLEWARE ===

/**
 * Log admin actions for audit trail
 */
export const auditLog = (action: string, resource: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    
    // Store original send function
    const originalSend = res.send;
    
    // Override send to capture response
    res.send = function(body: any) {
      const endTime = Date.now();
      const duration = endTime - startTime;
      const success = res.statusCode < 400;
      
      // Log the admin action (implement your logging system)
      logAdminAction({
        adminId: parseInt(req.user?.userId || '0'),
        adminEmail: req.user?.email || 'unknown',
        action,
        resource,
        resourceId: req.params.id || req.params.userId || undefined,
        oldValues: req.body?.oldValues,
        newValues: req.body,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        success,
        errorMessage: success ? undefined : body,
        duration,
        timestamp: new Date().toISOString()
      });
      
      return originalSend.call(this, body);
    };
    
    next();
  };
};

async function logAdminAction(auditData: any) {
  try {
    // Implement your audit logging system here
    // Could be database, file, external service, etc.
    console.log('Admin Action:', JSON.stringify(auditData, null, 2));
  } catch (error) {
    console.error('Failed to log admin action:', error);
  }
}

// === SECURITY MIDDLEWARE ===

/**
 * Prevent self-modification for critical operations
 */
export const preventSelfModification = (req: Request, res: Response, next: NextFunction) => {
  const targetUserId = parseInt(req.params.id || req.params.userId || '0');
  const currentUserId = parseInt(req.user?.userId || '0');
  
  if (targetUserId === currentUserId) {
    const dangerousActions = ['delete', 'suspend', 'deactivate', 'demote'];
    const action = req.body.action || req.method.toLowerCase();
    
    if (dangerousActions.some(da => req.path.includes(da) || action.includes(da))) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'SELF_MODIFICATION_DENIED',
          message: 'Cannot perform this action on your own account',
        },
        timestamp: new Date().toISOString()
      });
    }
  }
  
  next();
};

/**
 * Validate date ranges
 */
export const validateDateRange = (req: Request, res: Response, next: NextFunction) => {
  const { startDate, endDate } = req.query;
  
  if (startDate && endDate) {
    const start = new Date(startDate as string);
    const end = new Date(endDate as string);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_DATE_RANGE',
          message: 'Invalid date format',
        },
        timestamp: new Date().toISOString()
      });
    }
    
    if (start >= end) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_DATE_RANGE',
          message: 'Start date must be before end date',
        },
        timestamp: new Date().toISOString()
      });
    }
    
    // Limit date range to 2 years for performance
    const twoYears = 2 * 365 * 24 * 60 * 60 * 1000;
    if (end.getTime() - start.getTime() > twoYears) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'DATE_RANGE_TOO_LARGE',
          message: 'Date range cannot exceed 2 years',
        },
        timestamp: new Date().toISOString()
      });
    }
  }
  
  next();
};

/**
 * Parse and validate filters
 */
export const parseFilters = (req: Request, res: Response, next: NextFunction) => {
  if (req.query.filters) {
    try {
      const filters = JSON.parse(req.query.filters as string);
      req.query.parsedFilters = filters;
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_FILTERS',
          message: 'Filters must be valid JSON',
        },
        timestamp: new Date().toISOString()
      });
    }
  }
  
  next();
};

// === FEATURE FLAGS MIDDLEWARE ===

/**
 * Check if admin feature is enabled
 */
export const requireFeature = (feature: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Implement your feature flag system
    const featureEnabled = true; // Placeholder
    
    if (!featureEnabled) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'FEATURE_DISABLED',
          message: `Feature ${feature} is currently disabled`,
        },
        timestamp: new Date().toISOString()
      });
    }
    
    next();
  };
};

// === MAINTENANCE MODE MIDDLEWARE ===

/**
 * Check if system is in maintenance mode
 */
export const checkMaintenanceMode = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Check system settings for maintenance mode
    // This is a placeholder - implement your settings system
    const maintenanceMode = false;
    
    if (maintenanceMode) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'MAINTENANCE_MODE',
          message: 'System is currently under maintenance',
        },
        timestamp: new Date().toISOString()
      });
    }
    
    next();
  } catch (error) {
    next(error);
  }
};

// === ERROR HANDLING ===

/**
 * Admin error handler
 */
export const adminErrorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Admin API Error:', err);
  
  // Audit log error
  logAdminAction({
    adminId: parseInt(req.user?.userId || '0'),
    adminEmail: req.user?.email || 'unknown',
    action: 'ERROR',
    resource: req.path,
    resourceId: req.params.id,
    ipAddress: req.ip,
    userAgent: req.get('User-Agent'),
    success: false,
    errorMessage: err.message || 'Unknown error',
    timestamp: new Date().toISOString()
  });
  
  if (res.headersSent) {
    return next(err);
  }
  
  const isDev = process.env.NODE_ENV === 'development';
  
  res.status(err.statusCode || 500).json({
    success: false,
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: err.message || 'Internal server error',
      ...(isDev && { stack: err.stack, details: err })
    },
    timestamp: new Date().toISOString()
  });
};