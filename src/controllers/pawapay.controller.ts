// controllers/pawapay.controller.ts - PawaPay Payment Controller with Admin Management (Corrected)

import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { pawaPayService } from '../services/pawapay.service';
import { logger } from '../utils/logger';
import {
  DepositRequest,
  PayoutRequest,
  RefundRequest,
  BulkPayoutRequest,
  PawaPayWebhookData
} from '../types/pawapay.types';

const prisma = new PrismaClient();

export class PawaPayController {
  // ==================== DEPOSIT OPERATIONS ====================

  /**
   * Initiate a deposit (money in) request
   */
  async initiateDeposit(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      const {
        amount,
        currency,
        phoneNumber,
        provider,
        country,
        description, // Kept for internal DB logging
        internalReference,
        metadata
      } = req.body;

      if (!amount || !currency || !phoneNumber || !provider) {
        res.status(400).json({
          success: false,
          message: 'Missing required fields: amount, currency, phoneNumber, provider'
        });
        return;
      }

      const countryISO3 = pawaPayService.convertToISO3CountryCode(country || 'RW');
      const formattedPhone = pawaPayService.formatPhoneNumber(phoneNumber, country === 'RW' ? '250' : undefined);
      const providerCode = pawaPayService.getProviderCode(provider, countryISO3);
      const amountInSmallestUnit = pawaPayService.convertToSmallestUnit(amount, currency);
      
      // Generate a compliant UUID for the transaction ID
      const depositId = pawaPayService.generateTransactionId();

      // Convert metadata object to PawaPay array format
      const metadataArray = [];
      if (userId) {
        metadataArray.push({ fieldName: 'userId', fieldValue: userId.toString(), isPII: true });
      }
      if (internalReference) {
        metadataArray.push({ fieldName: 'internalReference', fieldValue: internalReference });
      }
      if (metadata) {
        Object.entries(metadata).forEach(([key, value]) => {
          metadataArray.push({
            fieldName: key,
            fieldValue: String(value),
            isPII: key.toLowerCase().includes('user') || key.toLowerCase().includes('customer')
          });
        });
      }

      // Create a compliant deposit request for PawaPay v2 API
      const depositRequest: DepositRequest = {
        depositId,
        amount: amountInSmallestUnit,
        currency: currency.toUpperCase(),
        payer: {
          type: 'MMO',
          accountDetails: {
            phoneNumber: formattedPhone,
            provider: providerCode
          }
        },
        metadata: metadataArray
        // REMOVED: statementDescription and customerTimestamp are not supported for deposits
      };

      const response = await pawaPayService.initiateDeposit(depositRequest);

      // Save transaction to database (we can still save the description for our records)
      await prisma.pawaPayTransaction.create({
        data: {
          userId,
          transactionId: depositId,
          transactionType: 'DEPOSIT',
          status: response.status,
          amount: amountInSmallestUnit,
          currency: currency.toUpperCase(),
          country: countryISO3,
          correspondent: providerCode,
          payerPhone: formattedPhone,
          customerTimestamp: response.customerTimestamp ? new Date(response.customerTimestamp) : new Date(),
          statementDescription: description, // Saving original description internally
          requestedAmount: amountInSmallestUnit,
          providerTransactionId: response.correspondentIds?.PROVIDER_TRANSACTION_ID,
          financialTransactionId: response.correspondentIds?.FINANCIAL_TRANSACTION_ID,
          metadata: metadata || {},
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
          amount: pawaPayService.convertFromSmallestUnit(amountInSmallestUnit, currency),
          currency,
          country: countryISO3,
          provider: providerCode,
          created: response.created
        }
      });
    } catch (error) {
      logger.error('Error initiating deposit', 'PawaPayController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to initiate deposit: ' + (error instanceof Error ? error.message : 'Unknown error'),
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

      // Get status from PawaPay
      const response = await pawaPayService.getDepositStatus(depositId);

      // Update database
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
      logger.error('Error getting deposit status', 'PawaPayController', error);
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

      if (!amount || !currency || !phoneNumber || !provider) {
        res.status(400).json({
          success: false,
          message: 'Missing required fields: amount, currency, phoneNumber, provider'
        });
        return;
      }

      const countryISO3 = pawaPayService.convertToISO3CountryCode(country || 'RW');
      const formattedPhone = pawaPayService.formatPhoneNumber(phoneNumber, country === 'RW' ? '250' : undefined);
      const providerCode = pawaPayService.getProviderCode(provider, countryISO3);
      const amountInSmallestUnit = pawaPayService.convertToSmallestUnit(amount, currency);
      
      // Generate a compliant UUID for the transaction ID
      const payoutId = pawaPayService.generateTransactionId();

      const statementDesc = (description || `Payout from ${process.env.APP_NAME || 'Jambolush'}`)
        .substring(0, 22)
        .padEnd(4, ' ');

      const metadataArray = [];
      if (userId) {
        metadataArray.push({ fieldName: 'userId', fieldValue: userId.toString(), isPII: true });
      }
      if (internalReference) {
        metadataArray.push({ fieldName: 'internalReference', fieldValue: internalReference });
      }
      if (metadata) {
        Object.entries(metadata).forEach(([key, value]) => {
          metadataArray.push({
            fieldName: key,
            fieldValue: String(value),
            isPII: key.toLowerCase().includes('user') || key.toLowerCase().includes('customer')
          });
        });
      }

      // Create a compliant payout request
      const payoutRequest: PayoutRequest = {
        payoutId,
        amount: amountInSmallestUnit,
        currency: currency.toUpperCase(),
        recipient: {
          type: 'MMO',
          accountDetails: {
            phoneNumber: formattedPhone,
            provider: providerCode
          }
        },
        metadata: metadataArray
        // REMOVED: customerTimestamp is a legacy field
      };

      const response = await pawaPayService.initiatePayout(payoutRequest);

      await prisma.pawaPayTransaction.create({
        data: {
          userId,
          transactionId: payoutId,
          transactionType: 'PAYOUT',
          status: response.status,
          amount: amountInSmallestUnit,
          currency: currency.toUpperCase(),
          country: countryISO3,
          correspondent: providerCode,
          recipientPhone: formattedPhone,
          customerTimestamp: response.customerTimestamp ? new Date(response.customerTimestamp) : new Date(),
          statementDescription: statementDesc,
          requestedAmount: amountInSmallestUnit,
          depositedAmount: response.depositedAmount,
          providerTransactionId: response.correspondentIds?.PROVIDER_TRANSACTION_ID,
          financialTransactionId: response.correspondentIds?.FINANCIAL_TRANSACTION_ID,
          metadata: metadata || {},
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
          amount: pawaPayService.convertFromSmallestUnit(amountInSmallestUnit, currency),
          currency,
          country: countryISO3,
          provider: providerCode,
          created: response.created
        }
      });
    } catch (error) {
      logger.error('Error initiating payout', 'PawaPayController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to initiate payout: ' + (error instanceof Error ? error.message : 'Unknown error'),
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

      // Get status from PawaPay
      const response = await pawaPayService.getPayoutStatus(payoutId);

      // Update database
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
      logger.error('Error getting payout status', 'PawaPayController', error);
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
      
      // Generate a compliant UUID for the bulk transaction ID
      const bulkPayoutId = pawaPayService.generateTransactionId();

      // Prepare payout requests
      const payoutRequests: PayoutRequest[] = payouts.map((payout: any) => {
        const formattedPhone = pawaPayService.formatPhoneNumber(payout.phoneNumber, payout.country === 'RW' ? '250' : undefined);
        const providerCode = pawaPayService.getProviderCode(payout.provider, payout.country || 'RW');
        const amountInSmallestUnit = pawaPayService.convertToSmallestUnit(payout.amount, payout.currency);
        const payoutId = pawaPayService.generateTransactionId();

        // --- METADATA CORRECTION: Must be an array of objects ---
        const metadataArray = [];
        if (userId) {
          metadataArray.push({ fieldName: 'userId', fieldValue: String(userId), isPII: true });
        }
        if (bulkPayoutId) {
          metadataArray.push({ fieldName: 'bulkPayoutId', fieldValue: bulkPayoutId });
        }
        if (payout.metadata) {
          Object.entries(payout.metadata).forEach(([key, value]) => {
            metadataArray.push({
              fieldName: key,
              fieldValue: String(value),
              isPII: key.toLowerCase().includes('user') || key.toLowerCase().includes('customer')
            });
          });
        }
        // --- END CORRECTION ---

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
          statementDescription: payout.description || `Bulk payout from ${process.env.APP_NAME || 'Jambolush'}`,
          metadata: metadataArray,
          // REMOVED: customerTimestamp
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
      logger.error('Error initiating bulk payout', 'PawaPayController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to initiate bulk payout: ' + (error instanceof Error ? error.message : 'Unknown error'),
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

      // Get original deposit
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

      // Use deposit amount if not specified
      const refundAmount = amount ? pawaPayService.convertToSmallestUnit(amount, deposit.currency) : deposit.amount;

      // Generate unique refund ID
      const refundId = pawaPayService.generateTransactionId();

      // Create refund request
      const refundRequest: RefundRequest = {
        refundId,
        depositId,
        amount: refundAmount
      };

      // Initiate refund with PawaPay
      const response = await pawaPayService.initiateRefund(refundRequest);

      // Save transaction to database
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
      logger.error('Error initiating refund', 'PawaPayController', error);
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

      // Get status from PawaPay
      const response = await pawaPayService.getRefundStatus(refundId);

      // Update database
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
      logger.error('Error getting refund status', 'PawaPayController', error);
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
      logger.error('Error getting active configuration', 'PawaPayController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get active configuration' + error,
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
      logger.error('Error getting available providers', 'PawaPayController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get available providers' + error,
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
      logger.error('Error getting transaction history', 'PawaPayController', error);
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
      logger.error('Error resending callback', 'PawaPayController', error);
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
      logger.error('Error getting transaction stats', 'PawaPayController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get transaction statistics',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

export const pawaPayController = new PawaPayController();