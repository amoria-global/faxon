// controllers/xentripay.controller.ts - Refactored to use userId/recipientId pattern
// NOTE: Escrow functionality has been deprecated and removed

import { Request, Response } from 'express';
import { XentriPayService } from '../services/xentripay.service';
import { PhoneUtils } from '../utils/phone.utils';

export class XentriPayController {
  constructor(
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
  // DEPRECATED: Escrow system has been removed

  createDeposit = async (req: Request, res: Response): Promise<void> => {
    res.status(410).json({
      success: false,
      error: {
        code: 'FEATURE_DEPRECATED',
        message: 'Escrow deposit functionality has been deprecated. Please use unified payment system instead.'
      }
    });
  };

  // ==================== ESCROW MANAGEMENT ====================
  // DEPRECATED: Escrow system has been removed

  releaseEscrow = async (req: Request, res: Response): Promise<void> => {
    res.status(410).json({
      success: false,
      error: {
        code: 'FEATURE_DEPRECATED',
        message: 'Escrow release functionality has been deprecated.'
      }
    });
  };

  cancelEscrow = async (req: Request, res: Response): Promise<void> => {
    res.status(410).json({
      success: false,
      error: {
        code: 'FEATURE_DEPRECATED',
        message: 'Escrow cancellation functionality has been deprecated.'
      }
    });
  };

  // ==================== ADMIN BULK OPERATIONS ====================
  // DEPRECATED: Escrow system has been removed

  bulkReleaseWithdrawals = async (req: Request, res: Response): Promise<void> => {
    res.status(410).json({
      success: false,
      error: {
        code: 'FEATURE_DEPRECATED',
        message: 'Bulk release functionality has been deprecated.'
      }
    });
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
    res.status(410).json({
      success: false,
      error: {
        code: 'FEATURE_DEPRECATED',
        message: 'Escrow transaction status check has been deprecated. Please use unified transaction system.'
      }
    });
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
