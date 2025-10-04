// controllers/escrow.controller.ts
import { Request, Response } from 'express';
import { EscrowService } from '../services/escrow.service';
import { PesapalService } from '../services/pesapal.service';
import { PhoneUtils } from '../utils/phone.utils';
import { logger } from '../utils/logger';
import {
  CreateDepositDto,
  ReleaseEscrowDto,
  WithdrawDto,
  RefundDto,
  EscrowTransactionStatus,
  EscrowTransactionType
} from '../types/pesapal.types';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class EscrowController {
  constructor(
    private escrowService: EscrowService,
    private pesapalService: PesapalService
  ) {}

  // ==================== USER OPERATIONS ====================

  /**
   * Create a new deposit (payment into escrow)
   * POST /api/escrow/deposits
   */
  createDeposit = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User authentication required'
          }
        });
      }

      const depositData: CreateDepositDto = req.body;
      
      const result = await this.escrowService.createDeposit(userId, depositData);

      res.status(201).json({
        success: true,
        data: {
          transaction: result.transaction,
          checkoutUrl: result.checkoutUrl
        },
        message: 'Deposit created successfully. Complete payment at the checkout URL.'
      });

    } catch (error: any) {
      logger.error('Failed to create deposit', 'EscrowController', error);
      res.status(error.code === 'VALIDATION_ERROR' ? 400 : 500).json({
        success: false,
        error: {
          code: error.code || 'CREATE_DEPOSIT_FAILED',
          message: error.message || 'Failed to create deposit',
          timestamp: new Date().toISOString()
        }
      });
    }
  };

  // In escrow.controller.ts, add this method:

  getTransactionByReference = async (req: Request, res: Response): Promise<void> => {
    try {
      const { reference } = req.params;

      const transaction = await prisma.escrowTransaction.findFirst({
        where: { reference },
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
          recipient: { select: { id: true, email: true, firstName: true, lastName: true } }
        }
      });
      
      if (!transaction) {
        res.status(404).json({
          success: false,
          error: {
            code: 'TRANSACTION_NOT_FOUND',
            message: 'Transaction not found',
            timestamp: new Date().toISOString()
          }
        });
        return;
      }
      
      // If transaction is still pending, check Pesapal for latest status
      if (transaction.status === 'PENDING' && transaction.externalId) {
        try {
          const pesapalStatus = await this.pesapalService.getTransactionStatus(
            transaction.externalId
          );
          
          const newStatus = this.pesapalService.mapPesapalStatusToEscrowStatus(
            pesapalStatus.status
          );
          
          // Update if status changed
          if (newStatus !== 'PENDING') {
            await this.escrowService.handlePesapalWebhook({
              OrderTrackingId: transaction.externalId,
              OrderMerchantReference: transaction.reference,
              OrderNotificationType: 'STATUSCHECK'
            });
            
            // Re-fetch updated transaction
            const updatedTransaction = await prisma.escrowTransaction.findFirst({
              where: { reference },
              include: {
                user: { select: { id: true, email: true, firstName: true, lastName: true } },
                recipient: { select: { id: true, email: true, firstName: true, lastName: true } }
              }
            });
            
            res.json({
              success: true,
              data: this.transformTransaction(updatedTransaction!)
            });
            return;
          }
        } catch (error) {
          logger.error('Error checking Pesapal status', 'EscrowController', error);
          // Continue with current status
        }
      }
      
      res.json({
        success: true,
        data: this.transformTransaction(transaction)
      });
      
    } catch (error: any) {
      logger.error('Failed to fetch transaction', 'EscrowController', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_FAILED',
          message: error.message || 'Failed to fetch transaction',
          timestamp: new Date().toISOString()
        }
      });
    }
  };
    checkTransactionStatus = async (req: Request, res: Response) => {
    try {
      const { transactionId } = req.params;

      // Get transaction
      const transaction = await prisma.escrowTransaction.findUnique({
        where: { id: transactionId },
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
          recipient: { select: { id: true, email: true, firstName: true, lastName: true } }
        }
      });

      if (!transaction) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'TRANSACTION_NOT_FOUND',
            message: 'Transaction not found'
          }
        });
      }

      // Check if user has access to this transaction
      const userId = (req as any).user?.userId;
      if (userId && transaction.userId !== userId && transaction.recipientId !== userId) {
        // Admin can check any transaction
        const isAdmin = (req as any).user?.role === 'admin';
        if (!isAdmin) {
          return res.status(403).json({
            success: false,
            error: {
              code: 'ACCESS_DENIED',
              message: 'You do not have access to this transaction'
            }
          });
        }
      }

      if (!transaction.externalId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'NO_TRACKING_ID',
            message: 'Transaction does not have a Pesapal tracking ID'
          }
        });
      }

      // Get latest status from Pesapal
      const statusResponse = await this.pesapalService.getTransactionStatus(
        transaction.externalId
      );

      // Map to escrow status
      const newStatus = this.pesapalService.mapPesapalStatusToEscrowStatus(statusResponse);

      // If status changed, update via webhook handler
      if (newStatus !== transaction.status) {
        await this.escrowService.handlePesapalWebhook({
          OrderTrackingId: transaction.externalId,
          OrderMerchantReference: transaction.reference,
          OrderNotificationType: 'MANUAL_CHECK'
        });

        // Fetch updated transaction
        const updatedTransaction = await prisma.escrowTransaction.findUnique({
          where: { id: transactionId },
          include: {
            user: { select: { id: true, email: true, firstName: true, lastName: true } },
            recipient: { select: { id: true, email: true, firstName: true, lastName: true } }
          }
        });

        res.json({
          success: true,
          data: {
            transaction: this.transformTransaction(updatedTransaction!),
            statusChanged: true,
            oldStatus: transaction.status,
            newStatus: updatedTransaction!.status,
            pesapalDetails: {
              payment_status: statusResponse.payment_status_description,
              status_code: statusResponse.status_code,
              confirmation_code: statusResponse.confirmation_code
            }
          },
          message: `Status updated from ${transaction.status} to ${updatedTransaction!.status}`
        });
      } else {
        res.json({
          success: true,
          data: {
            transaction: this.transformTransaction(transaction),
            statusChanged: false,
            currentStatus: transaction.status,
            pesapalDetails: {
              payment_status: statusResponse.payment_status_description,
              status_code: statusResponse.status_code,
              confirmation_code: statusResponse.confirmation_code
            }
          },
          message: 'Transaction status is up to date'
        });
      }

    } catch (error: any) {
      logger.error('Failed to check transaction status', 'EscrowController', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'STATUS_CHECK_FAILED',
          message: error.message || 'Failed to check transaction status',
          timestamp: new Date().toISOString()
        }
      });
    }
  };

  private transformTransaction(transaction: any) {
    const metadata = JSON.parse(transaction.metadata || '{}');
    
    return {
      id: transaction.id,
      reference: transaction.reference,
      amount: transaction.amount,
      currency: transaction.currency,
      status: transaction.status,
      description: transaction.description,
      type: transaction.type,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
      fundedAt: transaction.fundedAt,
      releasedAt: transaction.releasedAt,
      refundedAt: transaction.refundedAt,
      cancelledAt: transaction.cancelledAt,
      cancellationReason: transaction.cancellationReason,
      splitAmounts: metadata.splitAmounts,
      guest: transaction.user ? {
        firstName: transaction.user.firstName,
        lastName: transaction.user.lastName,
        email: transaction.user.email
      } : null,
      host: transaction.recipient ? {
        firstName: transaction.recipient.firstName,
        lastName: transaction.recipient.lastName,
        email: transaction.recipient.email
      } : null
    };
  }

  checkStatusByReference = async (req: Request, res: Response) => {
    try {
      const { reference } = req.params;

      // Find transaction
      const transaction = await prisma.escrowTransaction.findFirst({
        where: { reference },
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
          recipient: { select: { id: true, email: true, firstName: true, lastName: true } }
        }
      });

      if (!transaction) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'TRANSACTION_NOT_FOUND',
            message: 'Transaction not found'
          }
        });
      }

      if (!transaction.externalId) {
        return res.json({
          success: true,
          data: {
            transaction: this.transformTransaction(transaction),
            statusChanged: false,
            message: 'Transaction does not have tracking ID yet'
          }
        });
      }

      // Get latest status from Pesapal
      const statusResponse = await this.pesapalService.getTransactionStatus(
        transaction.externalId
      );

      // Map to escrow status
      const newStatus = this.pesapalService.mapPesapalStatusToEscrowStatus(statusResponse);

      // If status changed, update via webhook handler
      if (newStatus !== transaction.status) {
        await this.escrowService.handlePesapalWebhook({
          OrderTrackingId: transaction.externalId,
          OrderMerchantReference: transaction.reference,
          OrderNotificationType: 'REFERENCE_CHECK'
        });

        // Fetch updated transaction
        const updatedTransaction = await prisma.escrowTransaction.findFirst({
          where: { reference },
          include: {
            user: { select: { id: true, email: true, firstName: true, lastName: true } },
            recipient: { select: { id: true, email: true, firstName: true, lastName: true } }
          }
        });

        res.json({
          success: true,
          data: {
            transaction: this.transformTransaction(updatedTransaction!),
            statusChanged: true,
            oldStatus: transaction.status,
            newStatus: updatedTransaction!.status
          }
        });
      } else {
        res.json({
          success: true,
          data: {
            transaction: this.transformTransaction(transaction),
            statusChanged: false
          }
        });
      }

    } catch (error: any) {
      logger.error('Failed to check status by reference', 'EscrowController', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'STATUS_CHECK_FAILED',
          message: error.message || 'Failed to check transaction status',
          timestamp: new Date().toISOString()
        }
      });
    }
  };
  /**
   * Release escrow funds to recipient
   * POST /api/escrow/transactions/:transactionId/release
   */
  releaseEscrow = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.userId;
      const { transactionId } = req.params;
      const releaseData: ReleaseEscrowDto = req.body;

      const transaction = await this.escrowService.releaseEscrow(
        transactionId,
        releaseData,
        userId
      );

      res.status(200).json({
        success: true,
        data: transaction,
        message: 'Escrow funds released successfully'
      });

    } catch (error: any) {
      logger.error('Failed to release escrow', 'EscrowController', error);
      res.status(error.code === 'VALIDATION_ERROR' ? 400 : 500).json({
        success: false,
        error: {
          code: error.code || 'RELEASE_FAILED',
          message: error.message || 'Failed to release escrow',
          timestamp: new Date().toISOString()
        }
      });
    }
  };

  /**
   * Process refund
   * POST /api/escrow/transactions/:transactionId/refund
   */
  processRefund = async (req: Request, res: Response) => {
    try {
      const { transactionId } = req.params;
      const refundData: RefundDto = {
        transactionId,
        ...req.body
      };

      const transaction = await this.escrowService.processRefund(refundData);

      res.status(200).json({
        success: true,
        data: transaction,
        message: 'Refund processed successfully'
      });

    } catch (error: any) {
      logger.error('Failed to process refund', 'EscrowController', error);
      res.status(error.code === 'VALIDATION_ERROR' ? 400 : 500).json({
        success: false,
        error: {
          code: error.code || 'REFUND_FAILED',
          message: error.message || 'Failed to process refund',
          timestamp: new Date().toISOString()
        }
      });
    }
  };

  /**
   * Create withdrawal request
   * POST /api/escrow/withdrawals
   */
  createWithdrawal = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.userId;
      const withdrawData: WithdrawDto = req.body;

      const withdrawal = await this.escrowService.createWithdrawal(userId, withdrawData);

      res.status(201).json({
        success: true,
        data: withdrawal,
        message: 'Withdrawal request created successfully'
      });

    } catch (error: any) {
      logger.error('Failed to create withdrawal', 'EscrowController', error);
      res.status(error.code === 'VALIDATION_ERROR' ? 400 : 500).json({
        success: false,
        error: {
          code: error.code || 'WITHDRAWAL_FAILED',
          message: error.message || 'Failed to create withdrawal',
          timestamp: new Date().toISOString()
        }
      });
    }
  };

  /**
   * Get specific transaction
   * GET /api/escrow/transactions/:transactionId
   */
  getTransaction = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.userId;
      const { transactionId } = req.params;

      const transaction = await this.escrowService.getEscrowTransactionById(transactionId);

      // Verify user has access to this transaction
      if (transaction.guestId !== userId && transaction.hostId !== userId) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'ACCESS_DENIED',
            message: 'You do not have access to this transaction'
          }
        });
      }

      res.status(200).json({
        success: true,
        data: transaction
      });

    } catch (error: any) {
      logger.error('Failed to get transaction', 'EscrowController', error);
      res.status(error.message?.includes('not found') ? 404 : 500).json({
        success: false,
        error: {
          code: 'TRANSACTION_NOT_FOUND',
          message: error.message || 'Failed to get transaction',
          timestamp: new Date().toISOString()
        }
      });
    }
  };

  /**
   * Get user's transactions with filters
   * GET /api/escrow/transactions
   */
  getUserTransactions = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.userId;
      const {
        status,
        type,
        page,
        limit,
        startDate,
        endDate
      } = req.query;

      const result = await this.escrowService.getUserEscrowTransactions(userId, {
        status: status as EscrowTransactionStatus,
        type: type as EscrowTransactionType,
        page: page ? parseInt(page as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined
      });

      res.status(200).json({
        success: true,
        data: result.transactions,
        pagination: result.pagination
      });

    } catch (error: any) {
      logger.error('Failed to get user transactions', 'EscrowController', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_TRANSACTIONS_FAILED',
          message: error.message || 'Failed to fetch transactions',
          timestamp: new Date().toISOString()
        }
      });
    }
  };

  /**
   * Get user's wallet
   * GET /api/escrow/wallet
   */
  getUserWallet = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.userId;

      const wallet = await this.escrowService.getUserWallet(userId);

      res.status(200).json({
        success: true,
        data: wallet
      });

    } catch (error: any) {
      logger.error('Failed to get user wallet', 'EscrowController', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'WALLET_FETCH_FAILED',
          message: error.message || 'Failed to fetch wallet',
          timestamp: new Date().toISOString()
        }
      });
    }
  };

  // ==================== ADMIN OPERATIONS ====================

  /**
   * Get all transactions (admin only)
   * GET /api/escrow/admin/transactions
   */
  getAllTransactions = async (req: Request, res: Response) => {
    try {
      const {
        status,
        type,
        page,
        limit,
        search
      } = req.query;

      const result = await this.escrowService.getAllTransactions({
        status: status as EscrowTransactionStatus,
        type: type as EscrowTransactionType,
        page: page ? parseInt(page as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        search: search as string
      });

      res.status(200).json({
        success: true,
        data: result.transactions,
        pagination: result.pagination
      });

    } catch (error: any) {
      logger.error('Failed to get all transactions', 'EscrowController', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_TRANSACTIONS_FAILED',
          message: error.message || 'Failed to fetch transactions',
          timestamp: new Date().toISOString()
        }
      });
    }
  };

  /**
   * Admin release escrow (emergency)
   * POST /api/escrow/admin/transactions/:transactionId/release
   */
  adminReleaseEscrow = async (req: Request, res: Response) => {
    try {
      const adminId = (req as any).user?.userId; // ✅ Changed from .id to .userId
      const { transactionId } = req.params;
      const releaseData: ReleaseEscrowDto = req.body;

      const transaction = await this.escrowService.releaseEscrow(
        transactionId,
        releaseData,
        adminId
      );

      res.status(200).json({
        success: true,
        data: transaction,
        message: 'Escrow released by admin'
      });

    } catch (error: any) {
      logger.error('Failed to admin release escrow', 'EscrowController', error);
      res.status(error.code === 'VALIDATION_ERROR' ? 400 : 500).json({
        success: false,
        error: {
          code: error.code || 'ADMIN_RELEASE_FAILED',
          message: error.message || 'Failed to release escrow',
          timestamp: new Date().toISOString()
        }
      });
    }
  };

  /**
   * Get transaction statistics
   * GET /api/escrow/admin/stats
   */
  getTransactionStats = async (req: Request, res: Response) => {
    try {
      const { userId } = req.query;

      const stats = await this.escrowService.getTransactionStats(
        userId ? parseInt(userId as string) : undefined
      );

      res.status(200).json({
        success: true,
        data: stats
      });

    } catch (error: any) {
      logger.error('Failed to get transaction stats', 'EscrowController', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'STATS_FETCH_FAILED',
          message: error.message || 'Failed to fetch statistics',
          timestamp: new Date().toISOString()
        }
      });
    }
  };

  // ==================== WEBHOOK HANDLERS ====================

  /**
   * Handle Pesapal webhook
   * POST /api/escrow/webhook/pesapal
   */
  handlePesapalWebhook = async (req: Request, res: Response) => {
    try {
      const webhookData = req.body;

      await this.escrowService.handlePesapalWebhook(webhookData);

      res.status(200).json({
        success: true,
        message: 'Webhook processed successfully'
      });

    } catch (error: any) {
      logger.error('Failed to process Pesapal webhook', 'EscrowController', error);

      // Still return 200 to prevent Pesapal retries
      res.status(200).json({
        success: false,
        error: 'Webhook processing failed',
        note: 'Error logged for investigation'
      });
    }
  };

  /**
   * Handle Pesapal callback (user redirect)
   * GET /api/escrow/callback
   */
  handlePesapalCallback = async (req: Request, res: Response) => {
    try {
      const { OrderTrackingId, OrderMerchantReference, Status } = req.query;

      // Process webhook data
      if (OrderTrackingId) {
        await this.escrowService.handlePesapalWebhook({
          OrderTrackingId: OrderTrackingId as string,
          OrderMerchantReference: OrderMerchantReference as string,
          OrderNotificationType: 'IPNCHANGE'
        });
      }

      // Redirect to frontend
      const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
      const status = parseInt(Status as string || '0');
      
      if (status === 1) {
        return res.redirect(`${clientUrl}/payment/success?ref=${OrderMerchantReference}`);
      } else if (status === 2) {
        return res.redirect(`${clientUrl}/payment/failed?ref=${OrderMerchantReference}`);
      } else {
        return res.redirect(`${clientUrl}/payment/pending?ref=${OrderMerchantReference}`);
      }

    } catch (error: any) {
      logger.error('Failed to handle Pesapal callback', 'EscrowController', error);
      const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
      return res.redirect(`${clientUrl}/payment/error`);
    }
  };

  // ==================== UTILITY ENDPOINTS ====================

  /**
   * Health check
   * GET /api/escrow/health
   */
  healthCheck = async (req: Request, res: Response) => {
    try {
      const health = await this.escrowService.checkPaymentSystemHealth();

      res.status(health.healthy ? 200 : 503).json({
        success: health.healthy,
        data: {
          status: health.healthy ? 'healthy' : 'unhealthy',
          pesapal: health.pesapalStatus,
          database: health.databaseStatus,
          environment: process.env.NODE_ENV || 'development',
          timestamp: new Date().toISOString()
        },
        message: health.message
      });

    } catch (error: any) {
      logger.error('Health check failed', 'EscrowController', error);
      res.status(503).json({
        success: false,
        error: {
          code: 'HEALTH_CHECK_FAILED',
          message: 'Health check failed',
          timestamp: new Date().toISOString()
        }
      });
    }
  };

  /**
   * Get supported currencies
   * GET /api/escrow/currencies
   */
  getSupportedCurrencies = async (req: Request, res: Response) => {
    try {
      const currencies = [
        {
          code: 'RWF',
          name: 'Rwandan Franc',
          symbol: 'FRw',
          decimals: 0
        },
        {
          code: 'USD',
          name: 'US Dollar',
          symbol: '$',
          decimals: 2
        },
        {
          code: 'UGX',
          name: 'Ugandan Shilling',
          symbol: 'UGX',
          decimals: 0
        },
        {
          code: 'TZS',
          name: 'Tanzanian Shilling',
          symbol: 'TZS',
          decimals: 0
        },
        {
          code: 'KES',
          name: 'Kenyan Shilling',
          symbol: 'KSh',
          decimals: 2
        }
      ];

      res.status(200).json({
        success: true,
        data: currencies
      });

    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_CURRENCIES_FAILED',
          message: 'Failed to fetch currencies',
          timestamp: new Date().toISOString()
        }
      });
    }
  };

  /**
   * Get supported mobile providers
   * GET /api/escrow/mobile-providers
   */
  getSupportedMobileProviders = async (req: Request, res: Response) => {
    try {
      const providers = [
        {
          code: 'MTN',
          name: 'MTN Mobile Money',
          countries: ['RW', 'UG'],
          prefixes: ['70', '71', '72', '73']
        },
        {
          code: 'AIRTEL',
          name: 'Airtel Money',
          countries: ['RW', 'UG', 'TZ', 'KE'],
          prefixes: ['75', '76']
        },
        {
          code: 'TIGO',
          name: 'Tigo Pesa',
          countries: ['RW', 'TZ'],
          prefixes: ['78', '79']
        }
      ];

      res.status(200).json({
        success: true,
        data: providers
      });

    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_PROVIDERS_FAILED',
          message: 'Failed to fetch mobile providers',
          timestamp: new Date().toISOString()
        }
      });
    }
  };

  /**
   * Validate mobile number
   * POST /api/escrow/validate/mobile-number
   */
  validateMobileNumber = async (req: Request, res: Response) => {
    try {
      const { phoneNumber, countryCode } = req.body;

      const validation = PhoneUtils.validateRwandaPhone(phoneNumber);

      res.status(200).json({
        success: validation.isValid,
        data: validation.isValid ? {
          formattedNumber: validation.formattedPhone,
          provider: validation.provider
        } : null,
        errors: validation.error ? [validation.error] : []
      });

    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Failed to validate mobile number',
          timestamp: new Date().toISOString()
        }
      });
    }
  };

  /**
   * Validate bank account
   * POST /api/escrow/validate/bank-account
   */
  validateBankAccount = async (req: Request, res: Response) => {
    try {
      const { accountNumber, bankCode } = req.body;

      const validation = this.pesapalService.validateBankAccount(
        accountNumber,
        bankCode
      );

      res.status(200).json({
        success: validation.isValid,
        errors: validation.errors
      });

    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Failed to validate bank account',
          timestamp: new Date().toISOString()
        }
      });
    }
  };

  // ==================== MANUAL IPN MANAGEMENT ====================

  /**
   * Force IPN re-registration (admin only)
   * POST /api/escrow/admin/ipn/register
   */
  forceIPNRegistration = async (req: Request, res: Response) => {
    try {
      const ipnId = await this.pesapalService.forceRegisterIPN();

      res.status(200).json({
        success: true,
        data: {
          ipn_id: ipnId,
          ipn_info: this.pesapalService.getCurrentIPNInfo()
        },
        message: 'IPN re-registered successfully'
      });

    } catch (error: any) {
      logger.error('Failed to force IPN registration', 'EscrowController', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'IPN_REGISTRATION_FAILED',
          message: error.message || 'Failed to register IPN',
          timestamp: new Date().toISOString()
        }
      });
    }
  };

  /**
   * Get current IPN info (admin only)
   * GET /api/escrow/admin/ipn/info
   */
  getIPNInfo = async (req: Request, res: Response) => {
    try {
      const ipnInfo = this.pesapalService.getCurrentIPNInfo();
      const registeredIPNs = await this.pesapalService.getRegisteredIPNs();

      res.status(200).json({
        success: true,
        data: {
          current: ipnInfo,
          all_registered: registeredIPNs
        }
      });

    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: {
          code: 'IPN_INFO_FETCH_FAILED',
          message: error.message || 'Failed to fetch IPN info',
          timestamp: new Date().toISOString()
        }
      });
    }
  };
}