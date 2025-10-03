// controllers/xentripay.controller.ts

import { Request, Response } from 'express';
import { XentriPayService } from '../services/xentripay.service';
import { XentriPayEscrowService } from '../services/xentripay-escrow.service';

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
          timestamp: new Date().toISOString()
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

      const formatted = this.xentriPayService.formatPhoneNumber(phoneNumber, true);
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
        buyerId,
        buyerEmail,
        buyerName,
        buyerPhone,
        sellerId,
        sellerEmail,
        sellerName,
        sellerPhone,
        amount,
        description,
        metadata
      } = req.body;

      // Validate required fields
      if (!buyerId || !buyerEmail || !buyerName || !buyerPhone) {
        res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_BUYER_INFO',
            message: 'Buyer information is incomplete'
          }
        });
        return;
      }

      if (!sellerId || !sellerName || !sellerPhone) {
        res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_SELLER_INFO',
            message: 'Seller information is incomplete'
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

      // Create escrow transaction
      const transaction = await this.escrowService.createEscrow({
        buyerId,
        buyerEmail,
        buyerName,
        buyerPhone,
        sellerId,
        sellerName,
        sellerPhone,
        amount: Math.round(amount),
        description: description || 'Escrow payment',
        metadata: {
          ...metadata,
          buyerEmail,
          buyerPhone,
          sellerEmail,
          sellerPhone,
          buyerName,
          sellerName
        }
      });

      res.status(201).json({
        success: true,
        message: 'Escrow transaction created successfully',
        data: {
          transactionId: transaction.id,
          status: transaction.status,
          amount: transaction.amount,
          currency: transaction.currency,
          xentriPayRefId: transaction.xentriPayRefId,
          instructions: transaction.collectionResponse?.reply,
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
      await this.escrowService.checkCollectionStatus(transactionId);

      // Release escrow
      const transaction = await this.escrowService.releaseEscrow({
        transactionId,
        requesterId,
        reason
      });

      res.status(200).json({
        success: true,
        message: 'Escrow released successfully',
        data: {
          transactionId: transaction.id,
          status: transaction.status,
          amount: transaction.amount,
          xentriPayInternalRef: transaction.xentriPayInternalRef,
          completedAt: transaction.completedAt
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

  processRefund = async (req: Request, res: Response): Promise<void> => {
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
            message: 'Refund reason is required'
          }
        });
        return;
      }

      // Process refund
      const transaction = await this.escrowService.refundEscrow({
        transactionId,
        requesterId,
        reason
      });

      res.status(200).json({
        success: true,
        message: 'Refund processed successfully',
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
      console.error('[CONTROLLER] Process refund failed:', error);
      res.status(400).json({
        success: false,
        error: {
          code: 'REFUND_FAILED',
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
        msisdn: this.xentriPayService.formatPhoneNumber(phoneNumber, false),
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
      if (transaction.status === 'PENDING' && transaction.xentriPayRefId) {
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