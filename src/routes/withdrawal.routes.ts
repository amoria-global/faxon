// src/routes/withdrawal.routes.ts - Withdrawal routes with SMS OTP

import { Router } from 'express';
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.middleware';
import smsService from '../services/sms.service';
import rateLimit from 'express-rate-limit';

const router = Router();
const prisma = new PrismaClient();

// Rate limiting for OTP requests
const otpRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // limit each IP to 3 OTP requests per windowMs
  message: {
    success: false,
    message: 'Too many OTP requests, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting for withdrawal requests
const withdrawalRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // limit each IP to 5 withdrawal requests per hour
  message: {
    success: false,
    message: 'Too many withdrawal attempts, please try again later.'
  }
});

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
    userType?: string;
  };
}

/**
 * Request withdrawal OTP
 * POST /api/payments/withdrawal/request-otp
 */
router.post('/request-otp', 
  authenticate,
  otpRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { amount } = req.body;
      const userId = parseInt(req.user!.userId);

      // Validation
      if (!amount || amount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Valid amount is required'
        });
      }

      if (amount < 500) {
        return res.status(400).json({
          success: false,
          message: 'Minimum withdrawal amount is 500 RWF'
        });
      }

      if (amount > 5000000) {
        return res.status(400).json({
          success: false,
          message: 'Maximum withdrawal amount is 5,000,000 RWF'
        });
      }

      // Get user details from database - OTP will ONLY be sent to registered phone
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          phoneCountryCode: true,
          kycCompleted: true,
          kycStatus: true,
          verificationStatus: true
        }
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // SECURITY: Only use phone number already registered in database
      if (!user.phone || user.phone.trim() === '') {
        return res.status(400).json({
          success: false,
          message: 'No phone number registered. Please add a phone number to your profile first.',
          requiresPhoneSetup: true
        });
      }

      // Optional: Check if phone should be verified for high-value withdrawals
      if (amount > 100000 && user.verificationStatus !== 'verified') {
        return res.status(400).json({
          success: false,
          message: 'Phone verification required for large withdrawals. Please verify your phone number first.',
          requiresPhoneVerification: true
        });
      }

      // Check KYC status
      if (!user.kycCompleted || user.kycStatus !== 'approved') {
        return res.status(403).json({
          success: false,
          message: 'KYC verification required for withdrawals',
          kycRequired: true
        });
      }

      // Check user wallet balance
      const wallet = await prisma.wallet.findUnique({
        where: { userId }
      });

      if (!wallet || wallet.balance < amount) {
        return res.status(400).json({
          success: false,
          message: 'Insufficient wallet balance',
          availableBalance: wallet?.balance || 0
        });
      }

      // Send OTP
      const result = await smsService.sendWithdrawalOTP(
        userId,
        user.phone,
        amount,
        wallet.currency
      );

      if (result.success) {
        // Mask phone number for security
        const maskedPhone = maskPhoneNumber(user.phone);

        res.status(200).json({
          success: true,
          message: 'OTP sent successfully',
          data: {
            messageId: result.messageId,
            expiresIn: result.expiresIn,
            maskedPhone,
            amount,
            currency: wallet.currency
          }
        });
      } else {
        res.status(500).json({
          success: false,
          message: result.message
        });
      }

    } catch (error: any) {
      console.error('Request withdrawal OTP error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to send OTP'
      });
    }
  }
);

/**
 * Verify OTP and process withdrawal
 * POST /api/payments/withdrawal/verify-and-withdraw
 */
router.post('/verify-and-withdraw',
  authenticate,
  withdrawalRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { otp, amount, withdrawalMethodId, method = 'MOBILE', destination } = req.body;
      const userId = parseInt(req.user!.userId);

      // Validation
      if (!otp || !amount) {
        return res.status(400).json({
          success: false,
          message: 'OTP and amount are required'
        });
      }

      if (!['MOBILE', 'BANK', 'MOBILE_MONEY'].includes(method)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid withdrawal method. Use MOBILE, BANK, or MOBILE_MONEY'
        });
      }

      // Verify OTP
      const otpResult = await smsService.verifyWithdrawalOTP(userId, otp, amount);

      if (!otpResult.success) {
        return res.status(400).json({
          success: false,
          message: otpResult.message
        });
      }

      // Get user details
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Check wallet balance again
      const wallet = await prisma.wallet.findUnique({
        where: { userId }
      });

      if (!wallet || wallet.balance < amount) {
        return res.status(400).json({
          success: false,
          message: 'Insufficient wallet balance'
        });
      }

      // Prepare withdrawal destination
      let withdrawalDestination = destination;
      let savedMethodId = withdrawalMethodId;

      // If withdrawalMethodId is provided, use the saved withdrawal method
      if (withdrawalMethodId) {
        const savedMethod = await prisma.withdrawalMethod.findUnique({
          where: { id: withdrawalMethodId }
        });

        if (!savedMethod) {
          return res.status(404).json({
            success: false,
            message: 'Withdrawal method not found'
          });
        }

        if (savedMethod.userId !== userId) {
          return res.status(403).json({
            success: false,
            message: 'Unauthorized: This withdrawal method does not belong to you'
          });
        }

        if (!savedMethod.isApproved) {
          return res.status(400).json({
            success: false,
            message: 'Withdrawal method is not yet approved by admin. Please wait for approval or use a different method.'
          });
        }

        // Extract account details from saved method
        const accountDetails = savedMethod.accountDetails as any;
        withdrawalDestination = {
          holderName: savedMethod.accountName,
          accountNumber: accountDetails.accountNumber,
          providerCode: accountDetails.providerCode,
          providerName: accountDetails.providerName,
          providerType: accountDetails.providerType || savedMethod.methodType,
          countryCode: accountDetails.country || 'RWA',
          currency: accountDetails.currency || 'RWF'
        };
      } else if (!withdrawalDestination) {
        // Use user's phone as default for mobile withdrawal
        if ((method === 'MOBILE' || method === 'MOBILE_MONEY') && user.phone) {
          withdrawalDestination = {
            holderName: `${user.firstName} ${user.lastName}`,
            accountNumber: user.phone,
            countryCode: user.phoneCountryCode || 'RW',
            mobileProvider: 'MTN' // Default, should be configurable
          };
        } else {
          return res.status(400).json({
            success: false,
            message: 'Withdrawal destination details are required. Please provide withdrawalMethodId or destination details.'
          });
        }
      }

      // Create withdrawal request with link to saved withdrawal method
      const reference = `WD-${Date.now()}-${userId}`;
      const withdrawal = await prisma.withdrawalRequest.create({
        data: {
          userId,
          amount,
          currency: wallet.currency,
          method: method as 'MOBILE' | 'BANK',
          destination: JSON.stringify(withdrawalDestination),
          reference,
          status: 'PENDING',
          withdrawalMethodId: savedMethodId || undefined
        }
      });

      // Update wallet balance
      await prisma.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: wallet.balance - amount,
          pendingBalance: wallet.pendingBalance + amount
        }
      });

      // Create wallet transaction record
      await prisma.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'WITHDRAWAL',
          amount: -amount,
          balanceBefore: wallet.balance,
          balanceAfter: wallet.balance - amount,
          reference,
          description: `Withdrawal request - ${method}`,
          transactionId: withdrawal.id
        }
      });

      // Send confirmation SMS
      try {
        await smsService.sendTransactionStatusSMS(
          userId,
          user.phone!,
          'withdrawal',
          amount,
          wallet.currency,
          'pending'
        );
      } catch (smsError) {
        console.error('Failed to send withdrawal confirmation SMS:', smsError);
      }

      res.status(200).json({
        success: true,
        message: 'Withdrawal processed successfully',
        data: {
          withdrawalId: withdrawal.id,
          amount: withdrawal.amount,
          currency: withdrawal.currency,
          method: withdrawal.method,
          status: withdrawal.status,
          reference: withdrawal.reference,
          estimatedDelivery: '1-3 business days',
          newBalance: wallet.balance - amount
        }
      });

    } catch (error: any) {
      console.error('Withdrawal verification error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Withdrawal processing failed'
      });
    }
  }
);

/**
 * Resend withdrawal OTP
 * POST /api/payments/withdrawal/resend-otp
 */
router.post('/resend-otp',
  authenticate,
  otpRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { amount } = req.body;
      const userId = parseInt(req.user!.userId);

      if (!amount) {
        return res.status(400).json({
          success: false,
          message: 'Amount is required'
        });
      }

      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user || !user.phone) {
        return res.status(400).json({
          success: false,
          message: 'Phone number not found'
        });
      }

      const wallet = await prisma.wallet.findUnique({
        where: { userId }
      });

      if (!wallet) {
        return res.status(404).json({
          success: false,
          message: 'Wallet not found'
        });
      }

      const result = await smsService.resendWithdrawalOTP(
        userId,
        user.phone,
        amount,
        wallet.currency
      );

      if (result.success) {
        res.status(200).json({
          success: true,
          message: 'OTP resent successfully',
          data: {
            messageId: result.messageId,
            expiresIn: result.expiresIn
          }
        });
      } else {
        res.status(400).json({
          success: false,
          message: result.message
        });
      }

    } catch (error: any) {
      console.error('Resend OTP error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to resend OTP'
      });
    }
  }
);

/**
 * Get withdrawal history
 * GET /api/payments/withdrawal/history
 */
router.get('/history',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = parseInt(req.user!.userId);
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const skip = (page - 1) * limit;

      const [withdrawals, total] = await Promise.all([
        prisma.withdrawalRequest.findMany({
          where: { userId },
          include: {
            withdrawalMethod: {
              select: {
                id: true,
                methodType: true,
                accountName: true,
                accountDetails: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit
        }),
        prisma.withdrawalRequest.count({
          where: { userId }
        })
      ]);

      const totalPages = Math.ceil(total / limit);

      res.status(200).json({
        success: true,
        data: {
          withdrawals: withdrawals.map(w => {
            let destination: any = {};
            try {
              destination = typeof w.destination === 'string'
                ? JSON.parse(w.destination)
                : w.destination;
            } catch (e) {
              destination = w.destination;
            }

            return {
              id: w.id,
              amount: w.amount,
              currency: w.currency,
              method: w.method,
              status: w.status,
              reference: w.reference,
              destination: destination,
              withdrawalMethod: w.withdrawalMethod ? {
                id: w.withdrawalMethod.id,
                methodType: w.withdrawalMethod.methodType,
                accountName: w.withdrawalMethod.accountName,
                providerName: (w.withdrawalMethod.accountDetails as any)?.providerName,
                providerCode: (w.withdrawalMethod.accountDetails as any)?.providerCode,
                accountNumber: (w.withdrawalMethod.accountDetails as any)?.accountNumber,
              } : null,
              failureReason: w.failureReason,
              createdAt: w.createdAt,
              completedAt: w.completedAt
            };
          }),
          pagination: {
            page,
            limit,
            total,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1
          }
        }
      });

    } catch (error: any) {
      console.error('Get withdrawal history error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve withdrawal history'
      });
    }
  }
);

/**
 * Get withdrawal limits and wallet info
 * GET /api/payments/withdrawal/info
 */
router.get('/info',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = parseInt(req.user!.userId);

      const [user, wallet] = await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          select: {
            kycCompleted: true,
            kycStatus: true,
            phone: true,
            phoneCountryCode: true
          }
        }),
        prisma.wallet.findUnique({
          where: { userId }
        })
      ]);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      if (!wallet) {
        return res.status(404).json({
          success: false,
          message: 'Wallet not found'
        });
      }

      res.status(200).json({
        success: true,
        data: {
          wallet: {
            balance: wallet.balance,
            currency: wallet.currency,
            isActive: wallet.isActive
          },
          limits: {
            minimum: 500,
            maximum: 5000000,
            daily: 2000000,
            monthly: 10000000
          },
          kyc: {
            completed: user.kycCompleted,
            status: user.kycStatus,
            required: !user.kycCompleted || user.kycStatus !== 'approved'
          },
          phoneVerified: !!user.phone,
          supportedMethods: ['MOBILE', 'BANK'],
          currency: wallet.currency
        }
      });

    } catch (error: any) {
      console.error('Get withdrawal info error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve withdrawal information'
      });
    }
  }
);

// === HELPER FUNCTIONS ===

function maskPhoneNumber(phoneNumber: string): string {
  if (phoneNumber.length < 4) return phoneNumber;
  const start = phoneNumber.substring(0, 4);
  const end = phoneNumber.substring(phoneNumber.length - 4);
  const masked = '*'.repeat(phoneNumber.length - 8);
  return start + masked + end;
}

// === ADMIN ROUTES ===

/**
 * Get all withdrawal requests (admin only)
 * GET /api/payments/withdrawal/admin/all
 */
router.get('/admin/all',
  authenticate,
  authorize('admin'),
  async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const status = req.query.status as string;
      const skip = (page - 1) * limit;

      const whereClause: any = {};
      if (status && status !== 'all') {
        whereClause.status = status;
      }

      const [withdrawals, total] = await Promise.all([
        prisma.withdrawalRequest.findMany({
          where: whereClause,
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                phone: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit
        }),
        prisma.withdrawalRequest.count({ where: whereClause })
      ]);

      res.status(200).json({
        success: true,
        data: {
          withdrawals,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
          }
        }
      });

    } catch (error: any) {
      console.error('Admin get withdrawals error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve withdrawal requests'
      });
    }
  }
);

/**
 * Update withdrawal status (admin only)
 * PATCH /api/payments/withdrawal/admin/:id/status
 */
router.patch('/admin/:id/status',
  authenticate,
  authorize('admin'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { status, reason } = req.body;

      if (!['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'].includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status'
        });
      }

      const updateData: any = { status };
      if (status === 'COMPLETED') {
        updateData.completedAt = new Date();
      } else if (status === 'FAILED' && reason) {
        updateData.failureReason = reason;
      }

      const withdrawal = await prisma.withdrawalRequest.update({
        where: { id },
        data: updateData,
        include: {
          user: {
            select: { phone: true, firstName: true, lastName: true }
          }
        }
      });

      // Send SMS notification
      if (withdrawal.user.phone) {
        try {
          await smsService.sendTransactionStatusSMS(
            withdrawal.userId,
            withdrawal.user.phone,
            'withdrawal',
            withdrawal.amount,
            withdrawal.currency,
            status.toLowerCase()
          );
        } catch (smsError) {
          console.error('Failed to send status SMS:', smsError);
        }
      }

      res.status(200).json({
        success: true,
        message: 'Withdrawal status updated successfully',
        data: withdrawal
      });

    } catch (error: any) {
      console.error('Update withdrawal status error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update withdrawal status'
      });
    }
  }
);

export default router;