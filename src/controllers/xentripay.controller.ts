// controllers/xentripay.controller.ts - Refactored to use userId/recipientId pattern

import { Request, Response } from 'express';
import { XentriPayService } from '../services/xentripay.service';
import { XentriPayEscrowService, CreateEscrowRequest, BulkReleaseRequest, CancelEscrowRequest } from '../services/xentripay-escrow.service';
import { PhoneUtils } from '../utils/phone.utils';

export class XentriPayController {
  constructor(
    private escrowService: XentriPayEscrowService,
    private xentriPayService: XentriPayService
  ) {}

  // ==================== HEALTH & CONFIG ====================

  healthCheck = async (req: Request, res: Response): Promise<void> => {
    try {
      const isHealthy = await this.xentriPayService.healthCheck();

      res.status(200).json({
        success: true,
        message: 'XentriPay service is operational',
        data: {
          status: isHealthy ? 'healthy' : 'degraded',
          timestamp: new Date().toISOString(),
          supportedMethods: ['momo']
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: {
          code: 'HEALTH_CHECK_FAILED',
          message: error.message
        }
      });
    }
  };

  getSupportedCurrencies = async (req: Request, res: Response): Promise<void> => {
    res.status(200).json({
      success: true,
      data: {
        currencies: ['RWF'],
        default: 'RWF'
      }
    });
  };

  getSupportedMobileProviders = async (req: Request, res: Response): Promise<void> => {
    res.status(200).json({
      success: true,
      data: {
        providers: [
          { id: '63510', name: 'MTN Mobile Money', code: 'MTN' },
          { id: '63514', name: 'Airtel Money', code: 'AIRTEL' },
          { id: '63509', name: 'Spenn', code: 'SPENN' }
        ]
      }
    });
  };

  getPaymentMethods = async (req: Request, res: Response): Promise<void> => {
    res.status(200).json({
      success: true,
      data: {
        methods: [
          { id: 'momo', name: 'Mobile Money (MTN/Airtel)', providers: ['MTN', 'AIRTEL'] }
        ]
      }
    });
  };

  // ==================== VALIDATION ====================

  validateMobileNumber = async (req: Request, res: Response): Promise<void> => {
    try {
      const { phoneNumber, countryCode = 'RW' } = req.body;

      if (!phoneNumber) {
        res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_PHONE_NUMBER',
            message: 'Phone number is required'
          }
        });
        return;
      }

      const formatted = PhoneUtils.formatPhone(phoneNumber, true);
      const providerId = this.xentriPayService.getProviderIdFromPhone(phoneNumber);

      res.status(200).json({
        success: true,
        data: {
          isValid: true,
          formattedNumber: formatted,
          providerId,
          countryCode
        }
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PHONE_NUMBER',
          message: error.message
        }
      });
    }
  };

  validateBankAccount = async (req: Request, res: Response): Promise<void> => {
    try {
      const { accountNumber, bankId } = req.body;

      if (!accountNumber || !bankId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_PARAMETERS',
            message: 'Account number and bank ID are required'
          }
        });
        return;
      }

      const validation = await this.xentriPayService.validateAccountName(
        accountNumber,
        bankId
      );

      res.status(200).json({
        success: true,
        data: {
          isValid: true,
          registeredName: validation.registeredName,
          accountNumber,
          bankId
        }
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_FAILED',
          message: error.message
        }
      });
    }
  };

  // ==================== DEPOSITS (ESCROW CREATION) ====================

  createDeposit = async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        userId,
        userEmail,
        userName,
        userPhone,
        recipientId,
        recipientEmail,
        recipientName,
        recipientPhone,
        amount,
        description,
        paymentMethod,
        platformFeePercentage,
        metadata
      } = req.body;

      // Validate required fields
      if (!userId || !userEmail || !userName || !userPhone) {
        res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_USER_INFO',
            message: 'User information is incomplete'
          }
        });
        return;
      }

      if (!amount || amount <= 0) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_AMOUNT',
            message: 'Amount must be greater than 0'
          }
        });
        return;
      }

      if (!paymentMethod || paymentMethod !== 'momo') {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PAYMENT_METHOD',
            message: 'Payment method must be "momo"'
          }
        });
        return;
      }

      // Create escrow transaction
      const transaction = await this.escrowService.createEscrow({
        userId,
        userEmail,
        userName,
        userPhone,
        recipientId,
        recipientEmail,
        recipientName,
        recipientPhone,
        amount: Math.round(amount),
        description: description || 'Payment',
        paymentMethod,
        platformFeePercentage,
        metadata: {
          ...metadata,
          userEmail,
          userPhone,
          recipientEmail,
          recipientPhone,
          userName,
          recipientName
        }
      });

      res.status(201).json({
        success: true,
        message: 'Payment initiated successfully',
        data: {
          transactionId: transaction.id,
          status: transaction.status,
          amount: transaction.amount,
          platformFee: transaction.platformFee,
          hostEarning: transaction.hostEarning,
          currency: transaction.currency,
          paymentMethod,
          xentriPayRefId: transaction.xentriPayRefId,
          instructions: transaction.collectionResponse?.reply || 'Payment initiated',
          createdAt: transaction.createdAt
        }
      });
    } catch (error: any) {
      console.error('[CONTROLLER] Create deposit failed:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'DEPOSIT_CREATION_FAILED',
          message: error.message
        }
      });
    }
  };

  // ==================== ESCROW MANAGEMENT ====================

  releaseEscrow = async (req: Request, res: Response): Promise<void> => {
    try {
      const { transactionId } = req.params;
      const { requesterId, reason } = req.body;

      if (!requesterId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_REQUESTER_ID',
            message: 'Requester ID is required'
          }
        });
        return;
      }

      // Check current status first
      const transaction = await this.escrowService.getTransaction(transactionId);
      if (transaction?.paymentMethod === 'momo') {
        await this.escrowService.checkCollectionStatus(transactionId);
      }

      // Release escrow
      const updatedTransaction = await this.escrowService.releaseEscrow({
        transactionId,
        requesterId,
        reason
      });

      res.status(200).json({
        success: true,
        message: 'Payment released successfully',
        data: {
          transactionId: updatedTransaction.id,
          status: updatedTransaction.status,
          amount: updatedTransaction.amount,
          platformFee: updatedTransaction.platformFee,
          hostEarning: updatedTransaction.hostEarning,
          xentriPayInternalRef: updatedTransaction.xentriPayInternalRef,
          completedAt: updatedTransaction.completedAt
        }
      });
    } catch (error: any) {
      console.error('[CONTROLLER] Release escrow failed:', error);
      res.status(400).json({
        success: false,
        error: {
          code: 'RELEASE_FAILED',
          message: error.message
        }
      });
    }
  };

  cancelEscrow = async (req: Request, res: Response): Promise<void> => {
    try {
      const { transactionId } = req.params;
      const { requesterId, reason } = req.body;

      if (!requesterId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_REQUESTER_ID',
            message: 'Requester ID is required'
          }
        });
        return;
      }

      if (!reason) {
        res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_REASON',
            message: 'Cancellation reason is required'
          }
        });
        return;
      }

      // Cancel with refund
      const transaction = await this.escrowService.cancelEscrow({
        transactionId,
        requesterId,
        reason
      });

      res.status(200).json({
        success: true,
        message: 'Payment cancelled and refunded successfully',
        data: {
          transactionId: transaction.id,
          status: transaction.status,
          amount: transaction.amount,
          xentriPayInternalRef: transaction.xentriPayInternalRef,
          completedAt: transaction.completedAt,
          reason
        }
      });
    } catch (error: any) {
      console.error('[CONTROLLER] Cancel escrow failed:', error);
      res.status(400).json({
        success: false,
        error: {
          code: 'CANCEL_FAILED',
          message: error.message
        }
      });
    }
  };

  // ==================== ADMIN BULK OPERATIONS ====================

  bulkReleaseWithdrawals = async (req: Request, res: Response): Promise<void> => {
    try {
      const { transactionIds, requesterId, reason } = req.body;

      if (!transactionIds || !Array.isArray(transactionIds) || transactionIds.length === 0) {
        res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_TRANSACTION_IDS',
            message: 'Array of transaction IDs is required'
          }
        });
        return;
      }

      if (!requesterId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_REQUESTER_ID',
            message: 'Admin requester ID is required'
          }
        });
        return;
      }

      // Bulk release (for host agents/platform approvals)
      const result = await this.escrowService.bulkReleaseEscrow({
        transactionIds,
        requesterId,
        reason
      });

      res.status(200).json({
        success: true,
        message: `Bulk release processed: ${result.success} successful, ${result.failed} failed`,
        data: result
      });
    } catch (error: any) {
      console.error('[CONTROLLER] Bulk release failed:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'BULK_RELEASE_FAILED',
          message: error.message
        }
      });
    }
  };

  // ==================== WITHDRAWALS ====================

  createWithdrawal = async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        userId,
        phoneNumber,
        recipientName,
        amount,
        providerId,
        reference
      } = req.body;

      // Validate inputs
      if (!userId || !phoneNumber || !recipientName || !amount) {
        res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_PARAMETERS',
            message: 'All withdrawal parameters are required'
          }
        });
        return;
      }

      // Determine provider ID if not provided
      const finalProviderId = providerId ||
        this.xentriPayService.getProviderIdFromPhone(phoneNumber);

      // Generate customer reference
      const customerReference = reference ||
        this.xentriPayService.generateCustomerReference('WD');

      // Create payout
      const payoutResponse = await this.xentriPayService.createPayout({
        customerReference,
        telecomProviderId: finalProviderId,
        msisdn: PhoneUtils.formatPhone(phoneNumber, true),
        name: recipientName,
        transactionType: 'PAYOUT',
        currency: 'RWF',
        amount: Math.round(amount)
      });

      res.status(201).json({
        success: true,
        message: 'Withdrawal initiated successfully',
        data: {
          id: payoutResponse.id,
          customerReference: payoutResponse.customerReference,
          internalRef: payoutResponse.internalRef,
          status: payoutResponse.status,
          amount: payoutResponse.amount,
          charge: payoutResponse.txnCharge,
          statusMessage: payoutResponse.statusMessage,
          createdAt: payoutResponse.createdAt
        }
      });
    } catch (error: any) {
      console.error('[CONTROLLER] Create withdrawal failed:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'WITHDRAWAL_FAILED',
          message: error.message
        }
      });
    }
  };

  // ==================== TRANSACTION STATUS ====================

  getTransactionStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const { transactionId } = req.params;

      // Get transaction from escrow service
      const transaction = await this.escrowService.getTransaction(transactionId);

      if (!transaction) {
        res.status(404).json({
          success: false,
          error: {
            code: 'TRANSACTION_NOT_FOUND',
            message: 'Transaction not found'
          }
        });
        return;
      }

      // Update status if needed
      if (transaction.status === 'PENDING' && transaction.paymentMethod === 'momo' && transaction.xentriPayRefId) {
        await this.escrowService.checkCollectionStatus(transactionId);
      }

      res.status(200).json({
        success: true,
        data: transaction
      });
    } catch (error: any) {
      console.error('[CONTROLLER] Get transaction status failed:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'STATUS_CHECK_FAILED',
          message: error.message
        }
      });
    }
  };

  // ==================== WEBHOOKS ====================

  handleXentriPayWebhook = async (req: Request, res: Response): Promise<void> => {
    try {
      console.log('[CONTROLLER] Received XentriPay webhook:', req.body);

      const { refid, status, amount, transactionId } = req.body;

      // Find transaction by refid
      // Note: In production, you'd query database by xentriPayRefId

      // Acknowledge webhook
      res.status(200).json({
        success: true,
        message: 'Webhook received'
      });

      // Process webhook asynchronously
      // Update transaction status based on webhook data
      console.log('[CONTROLLER] Processing webhook for refid:', refid);
    } catch (error: any) {
      console.error('[CONTROLLER] Webhook processing failed:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'WEBHOOK_FAILED',
          message: error.message
        }
      });
    }
  };

  handleXentriPayCallback = async (req: Request, res: Response): Promise<void> => {
    try {
      const { transactionId, status } = req.query;

      console.log('[CONTROLLER] Payment callback:', { transactionId, status });

      // Redirect to appropriate page based on status
      const redirectUrl = status === 'success'
        ? `/payment/success?tx=${transactionId}`
        : `/payment/failed?tx=${transactionId}`;

      res.redirect(redirectUrl);
    } catch (error: any) {
      console.error('[CONTROLLER] Callback handling failed:', error);
      res.redirect('/payment/error');
    }
  };

}
