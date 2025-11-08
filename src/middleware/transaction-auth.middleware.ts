// middleware/transaction-auth.middleware.ts - Authorization middleware for transaction access control

import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

/**
 * Verify user can only access their own transaction data
 * Checks if the authenticated user matches the userId in params/query
 */
export async function authorizeOwnTransactions(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authenticatedUserId = req.user?.userId ? parseInt(req.user.userId) : undefined;

    if (!authenticatedUserId) {
      res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
      return;
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: authenticatedUserId },
      select: { userType: true }
    });

    // Admins can access any transactions
    if (user?.userType === 'admin') {
      next();
      return;
    }

    // Get the userId being requested from params or query
    const requestedUserId = req.params.userId
      ? parseInt(req.params.userId)
      : req.query.userId
        ? parseInt(req.query.userId as string)
        : undefined;

    // If requesting specific user data, verify it's their own
    if (requestedUserId && requestedUserId !== authenticatedUserId) {
      logger.warn('Unauthorized transaction access attempt', 'TransactionAuth', {
        authenticatedUserId,
        requestedUserId
      });

      res.status(403).json({
        success: false,
        message: 'Access denied. You can only view your own transactions.'
      });
      return;
    }

    // For endpoints without userId param, add filter to req
    if (!requestedUserId) {
      // Force filter by authenticated user's ID
      req.query.userId = authenticatedUserId.toString();
    }

    next();
  } catch (error: any) {
    logger.error('Transaction authorization error', 'TransactionAuth', error);
    res.status(500).json({
      success: false,
      message: 'Authorization check failed',
      error: error.message
    });
  }
}

/**
 * Verify user can only access their own wallet
 */
export async function authorizeOwnWallet(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authenticatedUserId = req.user?.userId ? parseInt(req.user.userId) : undefined;

    if (!authenticatedUserId) {
      res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
      return;
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: authenticatedUserId },
      select: { userType: true }
    });

    // Admins can access any wallet
    if (user?.userType === 'admin') {
      next();
      return;
    }

    const requestedUserId = parseInt(req.params.userId);

    if (requestedUserId !== authenticatedUserId) {
      logger.warn('Unauthorized wallet access attempt', 'TransactionAuth', {
        authenticatedUserId,
        requestedUserId
      });

      res.status(403).json({
        success: false,
        message: 'Access denied. You can only view your own wallet.'
      });
      return;
    }

    next();
  } catch (error: any) {
    logger.error('Wallet authorization error', 'TransactionAuth', error);
    res.status(500).json({
      success: false,
      message: 'Authorization check failed',
      error: error.message
    });
  }
}

/**
 * Verify user can only access their own withdrawal methods
 */
export async function authorizeOwnWithdrawalMethods(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authenticatedUserId = req.user?.userId ? parseInt(req.user.userId) : undefined;

    if (!authenticatedUserId) {
      res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
      return;
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: authenticatedUserId },
      select: { userType: true }
    });

    // Admins can access any withdrawal methods
    if (user?.userType === 'admin') {
      next();
      return;
    }

    // For GET /withdrawal-methods/:userId
    if (req.params.userId) {
      const requestedUserId = parseInt(req.params.userId);

      if (requestedUserId !== authenticatedUserId) {
        logger.warn('Unauthorized withdrawal method access attempt', 'TransactionAuth', {
          authenticatedUserId,
          requestedUserId
        });

        res.status(403).json({
          success: false,
          message: 'Access denied. You can only view your own withdrawal methods.'
        });
        return;
      }
    }

    // For POST /withdrawal-methods (userId in body)
    if (req.method === 'POST' && req.body.userId) {
      const requestedUserId = parseInt(req.body.userId);

      if (requestedUserId !== authenticatedUserId) {
        logger.warn('Unauthorized withdrawal method creation attempt', 'TransactionAuth', {
          authenticatedUserId,
          requestedUserId
        });

        res.status(403).json({
          success: false,
          message: 'Access denied. You can only create withdrawal methods for yourself.'
        });
        return;
      }
    }

    // For PUT/DELETE /withdrawal-methods/:id
    if ((req.method === 'PUT' || req.method === 'DELETE') && req.params.id) {
      const method = await prisma.withdrawalMethod.findUnique({
        where: { id: req.params.id },
        select: { userId: true }
      });

      if (!method) {
        res.status(404).json({
          success: false,
          message: 'Withdrawal method not found'
        });
        return;
      }

      if (method.userId !== authenticatedUserId) {
        logger.warn('Unauthorized withdrawal method modification attempt', 'TransactionAuth', {
          authenticatedUserId,
          methodOwnerId: method.userId
        });

        res.status(403).json({
          success: false,
          message: 'Access denied. You can only modify your own withdrawal methods.'
        });
        return;
      }
    }

    next();
  } catch (error: any) {
    logger.error('Withdrawal method authorization error', 'TransactionAuth', error);
    res.status(500).json({
      success: false,
      message: 'Authorization check failed',
      error: error.message
    });
  }
}

/**
 * Verify user is admin
 */
export async function authorizeAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authenticatedUserId = req.user?.userId ? parseInt(req.user.userId) : undefined;

    if (!authenticatedUserId) {
      res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: authenticatedUserId },
      select: { userType: true }
    });

    if (user?.userType !== 'admin') {
      logger.warn('Unauthorized admin access attempt', 'TransactionAuth', {
        authenticatedUserId,
        userType: user?.userType
      });

      res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.'
      });
      return;
    }

    next();
  } catch (error: any) {
    logger.error('Admin authorization error', 'TransactionAuth', error);
    res.status(500).json({
      success: false,
      message: 'Authorization check failed',
      error: error.message
    });
  }
}

/**
 * Helper: Check if user is authorized to access a transaction from ANY table
 * Searches across all transaction-related tables and verifies relationship
 */
async function isUserAuthorizedForTransaction(
  transactionId: string,
  authenticatedUserId: number
): Promise<{ authorized: boolean; found: boolean; table?: string }> {
  // 1. Check unified Transaction table
  const transaction = await prisma.transaction.findFirst({
    where: {
      OR: [
        { id: transactionId },
        { reference: transactionId },
        { externalId: transactionId }
      ]
    },
    select: { userId: true, recipientId: true }
  });

  if (transaction) {
    const authorized =
      transaction.userId === authenticatedUserId ||
      transaction.recipientId === authenticatedUserId;
    return { authorized, found: true, table: 'transactions' };
  }

  // 2. Check WalletTransaction table
  const walletTx = await prisma.walletTransaction.findFirst({
    where: {
      OR: [{ id: transactionId }, { reference: transactionId }]
    },
    include: { wallet: { select: { userId: true } } }
  });

  if (walletTx) {
    return {
      authorized: walletTx.wallet.userId === authenticatedUserId,
      found: true,
      table: 'wallet_transactions'
    };
  }

  // 3. Check PaymentTransaction table
  const paymentTx = await prisma.paymentTransaction.findFirst({
    where: {
      OR: [{ id: transactionId }, { reference: transactionId }]
    },
    select: { userId: true }
  });

  if (paymentTx) {
    return {
      authorized: paymentTx.userId === authenticatedUserId,
      found: true,
      table: 'payment_transactions'
    };
  }

  // 4. Check OwnerPayment table
  const ownerPayment = await prisma.ownerPayment.findFirst({
    where: {
      OR: [{ id: transactionId }, { transactionId: transactionId }]
    },
    select: { ownerId: true }
  });

  if (ownerPayment) {
    return {
      authorized: ownerPayment.ownerId === authenticatedUserId,
      found: true,
      table: 'owner_payments'
    };
  }

  // 5. Check HostPayment table
  const hostPayment = await prisma.hostPayment.findFirst({
    where: {
      OR: [{ id: transactionId }, { transactionId: transactionId }]
    },
    select: { hostId: true }
  });

  if (hostPayment) {
    return {
      authorized: hostPayment.hostId === authenticatedUserId,
      found: true,
      table: 'host_payments'
    };
  }

  // 6. Check TourEarnings table
  const tourEarning = await prisma.tourEarnings.findFirst({
    where: {
      OR: [{ id: transactionId }, { transactionId: transactionId }]
    },
    select: { tourGuideId: true }
  });

  if (tourEarning) {
    return {
      authorized: tourEarning.tourGuideId === authenticatedUserId,
      found: true,
      table: 'tour_earnings'
    };
  }

  // 7. Check OwnerEarning table
  const ownerEarning = await prisma.ownerEarning.findFirst({
    where: { id: transactionId },
    select: { ownerId: true }
  });

  if (ownerEarning) {
    return {
      authorized: ownerEarning.ownerId === authenticatedUserId,
      found: true,
      table: 'owner_earnings'
    };
  }

  // 8. Check PropertyAddressUnlock table
  const addressUnlock = await prisma.propertyAddressUnlock.findFirst({
    where: {
      OR: [
        { unlockId: transactionId },
        { transactionReference: transactionId },
        { id: isNaN(parseInt(transactionId)) ? -1 : parseInt(transactionId) }
      ]
    },
    select: { userId: true }
  });

  if (addressUnlock) {
    return {
      authorized: addressUnlock.userId === authenticatedUserId,
      found: true,
      table: 'property_address_unlocks'
    };
  }

  // Not found in any table
  return { authorized: false, found: false };
}

/**
 * Verify user can only access transaction by ID if they are involved
 * Searches across ALL transaction tables to validate access
 */
export async function authorizeTransactionById(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authenticatedUserId = req.user?.userId ? parseInt(req.user.userId) : undefined;

    if (!authenticatedUserId) {
      res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
      return;
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: authenticatedUserId },
      select: { userType: true }
    });

    // Admins can access any transaction
    if (user?.userType === 'admin') {
      next();
      return;
    }

    const transactionId = req.params.id;

    // Check across all transaction tables
    const { authorized, found, table } = await isUserAuthorizedForTransaction(
      transactionId,
      authenticatedUserId
    );

    if (!found) {
      res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
      return;
    }

    if (!authorized) {
      logger.warn('Unauthorized transaction access by ID', 'TransactionAuth', {
        authenticatedUserId,
        transactionId,
        sourceTable: table
      });

      res.status(403).json({
        success: false,
        message: 'Access denied. You can only view your own transactions.'
      });
      return;
    }

    next();
  } catch (error: any) {
    logger.error('Transaction by ID authorization error', 'TransactionAuth', error);
    res.status(500).json({
      success: false,
      message: 'Authorization check failed',
      error: error.message
    });
  }
}
