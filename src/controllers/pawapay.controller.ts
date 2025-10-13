// controllers/pawapay.controller.ts - PawaPay Payment Controller with Admin Management (Corrected)

import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { pawaPayService } from '../services/pawapay.service';
import { currencyExchangeService } from '../services/currency-exchange.service';
import {
  DepositRequest,
  PayoutRequest,
  RefundRequest,
  BulkPayoutRequest,
  PawaPayWebhookData
} from '../types/pawapay.types';

const prisma = new PrismaClient();

export class PawaPayController {
  // ==================== HELPER METHOD ====================

  /**
   * Builds the metadata array in the format required by PawaPay.
   * This centralizes logic to ensure consistency and prevent duplicate keys.
   * @param baseMetadata - The metadata object from the request body.
   * @param priorityMetadata - Higher-priority key-value pairs (like userId) that will overwrite base values.
   * @returns A formatted array for the PawaPay API request.
   */
  private _buildMetadataArray(
    baseMetadata?: { [key: string]: any },
    priorityMetadata?: { [key: string]: any }
  ): { [key: string]: any }[] {
    const metadataMap: { [key: string]: string } = {};

    // 1. Add base metadata from the request body's nested object first
    if (baseMetadata) {
      for (const [key, value] of Object.entries(baseMetadata)) {
        metadataMap[key] = String(value);
      }
    }

    // 2. Add/overwrite with priority metadata to give them precedence
    if (priorityMetadata) {
      for (const [key, value] of Object.entries(priorityMetadata)) {
        // Ensure we don't add null or undefined values
        if (value !== undefined && value !== null) {
          metadataMap[key] = String(value);
        }
      }
    }

    // 3. Convert the unique map into the PawaPay-required array format
    return Object.entries(metadataMap).map(([key, value]) => {
      const isPII = key.toLowerCase() === 'userid' || key.toLowerCase().includes('customer');
      const entry: { [key: string]: any } = { [key]: value };

      if (isPII) {
        entry.isPII = true;
      }
      return entry;
    });
  }

  // ==================== DEPOSIT OPERATIONS ====================

  /**
   * Initiate a deposit (money in) request
   * NOTE: Frontend sends amount in USD, we convert to RWF using deposit rate
   */
  async initiateDeposit(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      const { amount, currency, phoneNumber, provider, country, description, internalReference, metadata } = req.body;

      if (!amount || !phoneNumber || !provider) {
        res.status(400).json({
          success: false,
          message: 'Missing required fields: amount, phoneNumber, provider'
        });
        return;
      }

      // Frontend sends amount in USD, we need to convert to RWF
      const usdAmount = parseFloat(amount);

      // Convert USD to RWF using deposit rate (+0.5%)
      const { rwfAmount, rate: depositRate, exchangeRate } = await currencyExchangeService.convertUSDToRWF_Deposit(usdAmount);

      const countryISO3 = pawaPayService.convertToISO3CountryCode(country || 'RW');
      const formattedPhone = pawaPayService.formatPhoneNumber(phoneNumber, country === 'RW' ? '250' : undefined);
      const providerCode = pawaPayService.getProviderCode(provider, countryISO3);

      // PawaPay expects amount in RWF (no decimal places for RWF)
      const amountInSmallestUnit = rwfAmount.toString();
      const depositId = pawaPayService.generateTransactionId();

      const metadataArray: any = this._buildMetadataArray(metadata, {
        clientReferenceId: internalReference,
        userId: userId
      });

      const depositRequest: DepositRequest = {
        depositId,
        amount: amountInSmallestUnit,
        currency: 'RWF', // Always RWF for PawaPay
        payer: {
          type: 'MMO',
          accountDetails: {
            phoneNumber: formattedPhone,
            provider: providerCode
          }
        },
        metadata: metadataArray
      };

      const response = await pawaPayService.initiateDeposit(depositRequest);

      // Store in database with both USD and RWF amounts
      await prisma.pawaPayTransaction.create({
        data: {
          userId,
          transactionId: depositId,
          transactionType: 'DEPOSIT',
          status: response.status,
          amount: amountInSmallestUnit, // RWF amount
          currency: 'RWF',
          country: countryISO3,
          correspondent: providerCode,
          payerPhone: formattedPhone,
          customerTimestamp: response.customerTimestamp ? new Date(response.customerTimestamp) : new Date(),
          statementDescription: description,
          requestedAmount: amountInSmallestUnit,
          providerTransactionId: response.correspondentIds?.PROVIDER_TRANSACTION_ID,
          financialTransactionId: response.correspondentIds?.FINANCIAL_TRANSACTION_ID,
          metadata: {
            ...(metadata || {}),
            originalAmountUSD: usdAmount,
            exchangeRate: depositRate,
            baseRate: exchangeRate.base,
            depositRate: exchangeRate.depositRate,
            payoutRate: exchangeRate.payoutRate,
            spread: exchangeRate.spread,
            amountRWF: rwfAmount
          },
          internalReference,
          receivedByPawaPay: response.receivedByPawaPay ? new Date(response.receivedByPawaPay) : undefined,
          failureCode: response.failureReason?.failureCode,
          failureMessage: response.failureReason?.failureMessage
        }
      });

      res.status(200).json({
        success: true,
        message: 'Deposit initiated successfully',
        data: {
          depositId,
          status: response.status,
          amountUSD: usdAmount,
          amountRWF: rwfAmount,
          currency: 'RWF',
          exchangeRate: {
            rate: depositRate,
            base: exchangeRate.base,
            depositRate: exchangeRate.depositRate,
            payoutRate: exchangeRate.payoutRate,
            spread: exchangeRate.spread
          },
          country: countryISO3,
          provider: providerCode,
          failureReason: response.failureReason,
          created: response.created
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to initiate deposit',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get deposit status
   */
  async getDepositStatus(req: Request, res: Response): Promise<void> {
    try {
      const { depositId } = req.params;

      if (!depositId) {
        res.status(400).json({
          success: false,
          message: 'Deposit ID is required'
        });
        return;
      }

      const response = await pawaPayService.getDepositStatus(depositId);

      await prisma.pawaPayTransaction.update({
        where: { transactionId: depositId },
        data: {
          status: response.status,
          depositedAmount: response.requestedAmount,
          providerTransactionId: response.correspondentIds?.PROVIDER_TRANSACTION_ID,
          financialTransactionId: response.correspondentIds?.FINANCIAL_TRANSACTION_ID,
          failureCode: response.failureReason?.failureCode,
          failureMessage: response.failureReason?.failureMessage,
          completedAt: response.status === 'COMPLETED' ? new Date() : undefined
        }
      });

      res.status(200).json({
        success: true,
        data: response
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to get deposit status',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // ==================== PAYOUT OPERATIONS ====================

  /**
   * Initiate a payout (money out) request
   * NOTE: Frontend sends amount in USD, we convert to RWF using payout rate
   */
  async initiatePayout(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      const {
        amount,
        currency,
        phoneNumber,
        provider,
        country,
        description,
        internalReference,
        metadata
      } = req.body;

      if (!amount || !phoneNumber || !provider) {
        res.status(400).json({
          success: false,
          message: 'Missing required fields: amount, phoneNumber, provider'
        });
        return;
      }

      // Frontend sends amount in USD, we need to convert to RWF
      const usdAmount = parseFloat(amount);

      // Convert USD to RWF using payout rate (-2.5%)
      const { rwfAmount, rate: payoutRateValue, exchangeRate } = await currencyExchangeService.convertUSDToRWF_Payout(usdAmount);

      const countryISO3 = pawaPayService.convertToISO3CountryCode(country || 'RW');
      const formattedPhone = pawaPayService.formatPhoneNumber(phoneNumber, country === 'RW' ? '250' : undefined);
      const providerCode = pawaPayService.getProviderCode(provider, countryISO3);

      // PawaPay expects amount in RWF (no decimal places for RWF)
      const amountInSmallestUnit = rwfAmount.toString();
      const payoutId = pawaPayService.generateTransactionId();

      const statementDesc = (description || `Payout from ${process.env.APP_NAME || 'YourApp'}`)
        .substring(0, 22)
        .padEnd(4, ' ');

      // Use the centralized helper for consistent metadata handling
      const metadataArray: any = this._buildMetadataArray(metadata, {
        clientReferenceId: internalReference,
        userId: userId
      });

      const payoutRequest: PayoutRequest = {
        payoutId,
        amount: amountInSmallestUnit,
        currency: 'RWF', // Always RWF for PawaPay
        statementDescription: statementDesc, // Payouts support statementDescription
        recipient: {
          type: 'MMO',
          accountDetails: {
            phoneNumber: formattedPhone,
            provider: providerCode
          }
        },
        metadata: metadataArray
      };

      const response = await pawaPayService.initiatePayout(payoutRequest);

      // Store in database with both USD and RWF amounts
      await prisma.pawaPayTransaction.create({
        data: {
          userId,
          transactionId: payoutId,
          transactionType: 'PAYOUT',
          status: response.status,
          amount: amountInSmallestUnit, // RWF amount
          currency: 'RWF',
          country: countryISO3,
          correspondent: providerCode,
          recipientPhone: formattedPhone,
          customerTimestamp: response.customerTimestamp ? new Date(response.customerTimestamp) : new Date(),
          statementDescription: statementDesc,
          requestedAmount: amountInSmallestUnit,
          depositedAmount: response.depositedAmount,
          providerTransactionId: response.correspondentIds?.PROVIDER_TRANSACTION_ID,
          financialTransactionId: response.correspondentIds?.FINANCIAL_TRANSACTION_ID,
          metadata: {
            ...(metadata || {}),
            originalAmountUSD: usdAmount,
            exchangeRate: payoutRateValue,
            baseRate: exchangeRate.base,
            depositRate: exchangeRate.depositRate,
            payoutRate: exchangeRate.payoutRate,
            spread: exchangeRate.spread,
            amountRWF: rwfAmount
          },
          internalReference,
          receivedByPawaPay: response.receivedByPawaPay ? new Date(response.receivedByPawaPay) : undefined,
          failureCode: response.failureReason?.failureCode,
          failureMessage: response.failureReason?.failureMessage
        }
      });

      res.status(200).json({
        success: true,
        message: 'Payout initiated successfully',
        data: {
          payoutId,
          status: response.status,
          amountUSD: usdAmount,
          amountRWF: rwfAmount,
          currency: 'RWF',
          exchangeRate: {
            rate: payoutRateValue,
            base: exchangeRate.base,
            depositRate: exchangeRate.depositRate,
            payoutRate: exchangeRate.payoutRate,
            spread: exchangeRate.spread
          },
          country: countryISO3,
          provider: providerCode,
          created: response.created
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to initiate payout: '+error,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  
  /**
   * Get payout status
   */
  async getPayoutStatus(req: Request, res: Response): Promise<void> {
    try {
      const { payoutId } = req.params;

      if (!payoutId) {
        res.status(400).json({
          success: false,
          message: 'Payout ID is required'
        });
        return;
      }

      const response = await pawaPayService.getPayoutStatus(payoutId);

      await prisma.pawaPayTransaction.update({
        where: { transactionId: payoutId },
        data: {
          status: response.status,
          depositedAmount: response.depositedAmount,
          providerTransactionId: response.correspondentIds?.PROVIDER_TRANSACTION_ID,
          financialTransactionId: response.correspondentIds?.FINANCIAL_TRANSACTION_ID,
          failureCode: response.failureReason?.failureCode,
          failureMessage: response.failureReason?.failureMessage,
          completedAt: response.status === 'COMPLETED' ? new Date() : undefined
        }
      });

      res.status(200).json({
        success: true,
        data: response
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to get payout status',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // ==================== BULK PAYOUT OPERATIONS ====================

  /**
   * Initiate bulk payouts
   */
  async initiateBulkPayout(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      const { payouts, description } = req.body;

      if (!payouts || !Array.isArray(payouts) || payouts.length === 0) {
        res.status(400).json({
          success: false,
          message: 'Payouts array is required and must not be empty'
        });
        return;
      }
      
      const bulkPayoutId = pawaPayService.generateTransactionId();

      const payoutRequests: PayoutRequest[] = payouts.map((payout: any) => {
        const countryISO3 = pawaPayService.convertToISO3CountryCode(payout.country || 'RW');
        const formattedPhone = pawaPayService.formatPhoneNumber(payout.phoneNumber, payout.country === 'RW' ? '250' : undefined);
        const providerCode = pawaPayService.getProviderCode(payout.provider, countryISO3);
        const amountInSmallestUnit = pawaPayService.convertToSmallestUnit(payout.amount, payout.currency);
        const payoutId = pawaPayService.generateTransactionId();

        // Use the centralized helper for each payout in the bulk request
        const metadataArray: any = this._buildMetadataArray(payout.metadata, {
          clientReferenceId: payout.internalReference,
          userId: userId, // The user who initiated the bulk job
          bulkPayoutId: bulkPayoutId, // Link to the parent bulk operation
        });
        
        const statementDesc = (payout.description || description || `Bulk payout`)
          .substring(0, 22)
          .padEnd(4, ' ');

        return {
          payoutId,
          amount: amountInSmallestUnit,
          currency: payout.currency.toUpperCase(),
          recipient: {
            type: 'MMO',
            accountDetails: {
              phoneNumber: formattedPhone,
              provider: providerCode
            }
          },
          statementDescription: statementDesc,
          metadata: metadataArray,
        };
      });
      
      const bulkRequest: BulkPayoutRequest = {
        bulkPayoutId,
        payouts: payoutRequests
      };

      const response = await pawaPayService.initiateBulkPayout(bulkRequest);

      const totalAmount = payoutRequests.reduce((sum, p) => sum + parseFloat(p.amount), 0).toString();

      await prisma.pawaPayBulkPayout.create({
        data: {
          userId,
          bulkPayoutId,
          totalPayouts: response.totalPayouts,
          successfulPayouts: response.successfulPayouts,
          failedPayouts: response.failedPayouts,
          status: response.status,
          totalAmount,
          currency: payoutRequests[0]?.currency,
          description,
          metadata: { payoutIds: payoutRequests.map(p => p.payoutId) },
          completedAt: response.status === 'COMPLETED' ? new Date() : undefined
        }
      });

      for (const payoutResponse of response.payouts) {
        await prisma.pawaPayTransaction.create({
          data: {
            userId,
            transactionId: payoutResponse.payoutId,
            transactionType: 'PAYOUT',
            status: payoutResponse.status,
            amount: payoutResponse.requestedAmount,
            currency: payoutResponse.currency,
            country: payoutResponse.country,
            correspondent: payoutResponse.recipient.accountDetails?.provider || '',
            recipientPhone: payoutResponse.recipient.accountDetails?.phoneNumber || '',
            customerTimestamp: payoutResponse.customerTimestamp ? new Date(payoutResponse.customerTimestamp) : new Date(),
            statementDescription: payoutResponse.statementDescription,
            requestedAmount: payoutResponse.requestedAmount,
            depositedAmount: payoutResponse.depositedAmount,
            providerTransactionId: payoutResponse.correspondentIds?.PROVIDER_TRANSACTION_ID,
            financialTransactionId: payoutResponse.correspondentIds?.FINANCIAL_TRANSACTION_ID,
            metadata: { bulkPayoutId },
            receivedByPawaPay: payoutResponse.receivedByPawaPay ? new Date(payoutResponse.receivedByPawaPay) : undefined,
            failureCode: payoutResponse.failureReason?.failureCode,
            failureMessage: payoutResponse.failureReason?.failureMessage
          }
        });
      }

      res.status(200).json({
        success: true,
        message: 'Bulk payout initiated successfully',
        data: {
          bulkPayoutId,
          totalPayouts: response.totalPayouts,
          successfulPayouts: response.successfulPayouts,
          failedPayouts: response.failedPayouts,
          status: response.status
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to initiate bulk payout',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // ==================== REFUND OPERATIONS ====================

  /**
   * Initiate a refund
   */
  async initiateRefund(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      const { depositId, amount } = req.body;

      if (!depositId) {
        res.status(400).json({
          success: false,
          message: 'Deposit ID is required'
        });
        return;
      }

      const deposit = await prisma.pawaPayTransaction.findUnique({
        where: { transactionId: depositId }
      });

      if (!deposit) {
        res.status(404).json({
          success: false,
          message: 'Original deposit not found'
        });
        return;
      }

      const refundAmount = amount ? pawaPayService.convertToSmallestUnit(amount, deposit.currency) : deposit.amount;
      const refundId = pawaPayService.generateTransactionId();

      const refundRequest: RefundRequest = {
        refundId,
        depositId,
        amount: refundAmount
      };

      const response = await pawaPayService.initiateRefund(refundRequest);

      await prisma.pawaPayTransaction.create({
        data: {
          userId,
          transactionId: refundId,
          transactionType: 'REFUND',
          status: response.status,
          amount: refundAmount,
          currency: response.currency,
          country: response.country,
          correspondent: response.correspondent,
          relatedDepositId: depositId,
          requestedAmount: refundAmount,
          refundedAmount: response.refundedAmount,
          providerTransactionId: response.correspondentIds?.PROVIDER_TRANSACTION_ID,
          financialTransactionId: response.correspondentIds?.FINANCIAL_TRANSACTION_ID,
          metadata: { originalDepositId: depositId },
          receivedByPawaPay: response.receivedByPawaPay ? new Date(response.receivedByPawaPay) : undefined,
          failureCode: response.failureReason?.failureCode,
          failureMessage: response.failureReason?.failureMessage
        }
      });

      res.status(200).json({
        success: true,
        message: 'Refund initiated successfully',
        data: {
          refundId,
          depositId,
          status: response.status,
          amount: pawaPayService.convertFromSmallestUnit(refundAmount, response.currency),
          currency: response.currency,
          created: response.created
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to initiate refund',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get refund status
   */
  async getRefundStatus(req: Request, res: Response): Promise<void> {
    try {
      const { refundId } = req.params;

      if (!refundId) {
        res.status(400).json({
          success: false,
          message: 'Refund ID is required'
        });
        return;
      }

      const response = await pawaPayService.getRefundStatus(refundId);

      await prisma.pawaPayTransaction.update({
        where: { transactionId: refundId },
        data: {
          status: response.status,
          refundedAmount: response.refundedAmount,
          providerTransactionId: response.correspondentIds?.PROVIDER_TRANSACTION_ID,
          financialTransactionId: response.correspondentIds?.FINANCIAL_TRANSACTION_ID,
          failureCode: response.failureReason?.failureCode,
          failureMessage: response.failureReason?.failureMessage,
          completedAt: response.status === 'COMPLETED' ? new Date() : undefined
        }
      });

      res.status(200).json({
        success: true,
        data: response
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to get refund status',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // ==================== CONFIGURATION & ADMIN ====================

  /**
   * Get active configuration (available providers)
   */
  async getActiveConfiguration(req: Request, res: Response): Promise<void> {
    try {
      const forceRefresh = req.query.refresh === 'true';
      const config = await pawaPayService.getActiveConfiguration(forceRefresh);

      res.status(200).json({
        success: true,
        data: config
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to get active configuration',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get available providers for a country
   */
  async getAvailableProviders(req: Request, res: Response): Promise<void> {
    try {
      const { country } = req.params;

      if (!country) {
        res.status(400).json({
          success: false,
          message: 'Country code is required'
        });
        return;
      }

      const providers = await pawaPayService.getAvailableProviders(country.toUpperCase());

      res.status(200).json({
        success: true,
        data: providers
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to get available providers',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get transaction history (admin)
   */
  async getTransactionHistory(req: Request, res: Response): Promise<void> {
    try {
      const {
        type,
        status,
        userId,
        startDate,
        endDate,
        page = 1,
        limit = 50
      } = req.query;

      const where: any = {};

      if (type) where.transactionType = type;
      if (status) where.status = status;
      if (userId) where.userId = parseInt(userId as string);
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate as string);
        if (endDate) where.createdAt.lte = new Date(endDate as string);
      }

      const [transactions, total] = await Promise.all([
        prisma.pawaPayTransaction.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: parseInt(limit as string),
          skip: (parseInt(page as string) - 1) * parseInt(limit as string)
        }),
        prisma.pawaPayTransaction.count({ where })
      ]);

      res.status(200).json({
        success: true,
        data: transactions,
        pagination: {
          total,
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          pages: Math.ceil(total / parseInt(limit as string))
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to get transaction history',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Resend callback for a transaction (admin)
   */
  async resendCallback(req: Request, res: Response): Promise<void> {
    try {
      const { transactionId } = req.params;
      const { type } = req.body;

      if (!transactionId || !type) {
        res.status(400).json({
          success: false,
          message: 'Transaction ID and type are required'
        });
        return;
      }

      const success = await pawaPayService.resendCallback(transactionId, type);

      res.status(200).json({
        success,
        message: success ? 'Callback resent successfully' : 'Failed to resend callback'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to resend callback',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get transaction statistics (admin)
   */
  async getTransactionStats(req: Request, res: Response): Promise<void> {
    try {
      const { startDate, endDate } = req.query;

      const where: any = {};
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate as string);
        if (endDate) where.createdAt.lte = new Date(endDate as string);
      }

      const [
        totalTransactions,
        totalDeposits,
        totalPayouts,
        totalRefunds,
        completedTransactions,
        failedTransactions,
        pendingTransactions
      ] = await Promise.all([
        prisma.pawaPayTransaction.count({ where }),
        prisma.pawaPayTransaction.count({ where: { ...where, transactionType: 'DEPOSIT' } }),
        prisma.pawaPayTransaction.count({ where: { ...where, transactionType: 'PAYOUT' } }),
        prisma.pawaPayTransaction.count({ where: { ...where, transactionType: 'REFUND' } }),
        prisma.pawaPayTransaction.count({ where: { ...where, status: 'COMPLETED' } }),
        prisma.pawaPayTransaction.count({ where: { ...where, status: 'FAILED' } }),
        prisma.pawaPayTransaction.count({ where: { ...where, status: { in: ['PENDING', 'ACCEPTED', 'SUBMITTED'] } } })
      ]);

      res.status(200).json({
        success: true,
        data: {
          total: totalTransactions,
          byType: {
            deposits: totalDeposits,
            payouts: totalPayouts,
            refunds: totalRefunds
          },
          byStatus: {
            completed: completedTransactions,
            failed: failedTransactions,
            pending: pendingTransactions
          }
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to get transaction statistics',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

export const pawaPayController = new PawaPayController();