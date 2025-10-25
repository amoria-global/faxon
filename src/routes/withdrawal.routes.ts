// src/routes/withdrawal.routes.ts - Withdrawal routes with SMS OTP

import { Router } from 'express';
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.middleware';
import smsService from '../services/sms.service';
import { EmailService } from '../services/email.service';
import withdrawalNotificationService from '../services/withdrawal-notification.service';
import rateLimit from 'express-rate-limit';

const router = Router();
const prisma = new PrismaClient();
const emailService = new EmailService();

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

      // Wallet operates in USD - validate USD amount
      const minWithdrawalUSD = 0.35; // approximately 500 RWF
      const maxWithdrawalUSD = 3500; // approximately 5,000,000 RWF

      if (amount < minWithdrawalUSD) {
        return res.status(400).json({
          success: false,
          message: `Minimum withdrawal amount is ${minWithdrawalUSD} USD`
        });
      }

      if (amount > maxWithdrawalUSD) {
        return res.status(400).json({
          success: false,
          message: `Maximum withdrawal amount is ${maxWithdrawalUSD} USD`
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
      if (amount > 100 && user.verificationStatus !== 'verified') {
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

      // Check user wallet balance (wallet is in USD)
      const wallet = await prisma.wallet.findUnique({
        where: { userId }
      });

      if (!wallet || wallet.balance < amount) {
        return res.status(400).json({
          success: false,
          message: 'Insufficient wallet balance',
          availableBalance: wallet?.balance || 0,
          currency: 'USD',
          requestedAmount: amount
        });
      }

      // Send OTP to phone (SMS) first - this is the primary method
      const smsResult = await smsService.sendWithdrawalOTP(
        userId,
        user.phone,
        amount,
        'USD'
      );

      let emailSent = false;

      // If SMS fails, use email as fallback
      if (!smsResult.success) {
        console.log('SMS failed, sending OTP via email as fallback');

        // Ensure we have an OTP to send
        if (!smsResult.otp) {
          return res.status(500).json({
            success: false,
            message: 'Failed to generate OTP. Please try again later.'
          });
        }

        try {
          await emailService.sendWithdrawalOTPEmail({
            userEmail: user.email,
            userName: `${user.firstName} ${user.lastName}`,
            otp: smsResult.otp,
            amount: amount,
            currency: 'USD',
            expiresIn: smsResult.expiresIn || 300
          });
          emailSent = true;
        } catch (emailError) {
          console.error('Failed to send OTP email as fallback:', emailError);
          // Both SMS and email failed
          return res.status(500).json({
            success: false,
            message: 'Failed to send OTP via SMS and email. Please try again later or contact support.'
          });
        }
      }

      // Mask phone number and email for security
      const maskedPhone = maskPhoneNumber(user.phone);
      const maskedEmail = maskEmail(user.email);

      const responseData: any = {
        messageId: smsResult.messageId,
        expiresIn: smsResult.expiresIn || 300,
        maskedPhone,
        maskedEmail,
        sentToPhone: smsResult.success,
        sentToEmail: emailSent,
        amount: amount,
        currency: 'USD'
      };

      // Different messages based on delivery method
      let message = '';
      if (smsResult.success) {
        message = 'OTP sent successfully to your phone';
      } else if (emailSent) {
        message = 'SMS delivery failed. OTP has been sent to your email instead. Please check your email.';
      }

      res.status(200).json({
        success: true,
        message: message,
        data: responseData
      });

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

      // Verify OTP with the USD amount (wallet is in USD)
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

      // Check wallet balance again (wallet is in USD)
      const wallet = await prisma.wallet.findUnique({
        where: { userId }
      });

      if (!wallet || wallet.balance < amount) {
        return res.status(400).json({
          success: false,
          message: 'Insufficient wallet balance',
          availableBalance: wallet?.balance || 0,
          currency: 'USD',
          requestedAmount: amount
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
          amount: amount,
          currency: 'USD',
          method: method as 'MOBILE' | 'BANK',
          destination: JSON.stringify(withdrawalDestination),
          reference,
          status: 'PENDING',
          withdrawalMethodId: savedMethodId || undefined
        }
      });

      // Update wallet balance (wallet is in USD)
      // Move from balance to pendingBalance (funds are locked for withdrawal)
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
          description: `Withdrawal request - ${method} (moved to pending)`,
          transactionId: withdrawal.id
        }
      });

      // Send notification for withdrawal request (PENDING status)
      try {
        await withdrawalNotificationService.notifyWithdrawalRequested({
          withdrawalId: withdrawal.id,
          userId,
          userEmail: user.email,
          userFirstName: user.firstName || 'User',
          userLastName: user.lastName || '',
          userPhone: user.phone,
          amount: amount,
          currency: 'USD',
          method: method,
          status: 'PENDING',
          reference: reference,
          destination: withdrawalDestination
        });
      } catch (notificationError) {
        console.error('Failed to send withdrawal notification:', notificationError);
        // Don't fail the request if notification fails
      }

      const responseData: any = {
        withdrawalId: withdrawal.id,
        amount: withdrawal.amount,
        currency: withdrawal.currency,
        method: withdrawal.method,
        status: withdrawal.status,
        reference: withdrawal.reference,
        estimatedDelivery: '1-3 business days',
        newBalance: wallet.balance - amount
      };

      res.status(200).json({
        success: true,
        message: 'Withdrawal processed successfully',
        data: responseData
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
        where: { id: userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true
        }
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

      // Resend OTP to phone (wallet is in USD) - this is the primary method
      const smsResult = await smsService.resendWithdrawalOTP(
        userId,
        user.phone,
        amount,
        'USD'
      );

      let emailSent = false;

      // If SMS fails, use email as fallback
      if (!smsResult.success) {
        console.log('SMS resend failed, sending OTP via email as fallback');

        // Ensure we have an OTP to send
        if (!smsResult.otp) {
          return res.status(500).json({
            success: false,
            message: 'Failed to generate OTP. Please try again later.'
          });
        }

        try {
          await emailService.sendWithdrawalOTPEmail({
            userEmail: user.email,
            userName: `${user.firstName} ${user.lastName}`,
            otp: smsResult.otp,
            amount: amount,
            currency: 'USD',
            expiresIn: smsResult.expiresIn || 300
          });
          emailSent = true;
        } catch (emailError) {
          console.error('Failed to resend OTP email as fallback:', emailError);
          // Both SMS and email failed
          return res.status(500).json({
            success: false,
            message: 'Failed to resend OTP via SMS and email. Please try again later or contact support.'
          });
        }
      }

      const responseData: any = {
        messageId: smsResult.messageId,
        expiresIn: smsResult.expiresIn || 300,
        sentToPhone: smsResult.success,
        sentToEmail: emailSent,
        amount: amount,
        currency: 'USD'
      };

      // Different messages based on delivery method
      let message = '';
      if (smsResult.success) {
        message = 'OTP resent successfully to your phone';
      } else if (emailSent) {
        message = 'SMS delivery failed. OTP has been sent to your email instead. Please check your email.';
      }

      res.status(200).json({
        success: true,
        message: message,
        data: responseData
      });

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
            currency: 'USD',
            isActive: wallet.isActive
          },
          limits: {
            minimum: 0.35,  // USD
            maximum: 3500,  // USD
            daily: 1400,    // USD
            monthly: 7000   // USD
          },
          kyc: {
            completed: user.kycCompleted,
            status: user.kycStatus,
            required: !user.kycCompleted || user.kycStatus !== 'approved'
          },
          phoneVerified: !!user.phone,
          supportedMethods: ['MOBILE', 'BANK'],
          currency: 'USD'
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

function maskEmail(email: string): string {
  const [username, domain] = email.split('@');
  if (!domain) return email;

  if (username.length <= 2) {
    return `${username[0]}***@${domain}`;
  }

  const visibleChars = Math.min(3, Math.floor(username.length / 2));
  const start = username.substring(0, visibleChars);
  const masked = '*'.repeat(Math.min(5, username.length - visibleChars));
  return `${start}${masked}@${domain}`;
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