// controllers/pawapay.controller.ts - PawaPay Payment Controller with Admin Management (Corrected)

import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { pawaPayService } from '../services/pawapay.service';
import { currencyExchangeService } from '../services/currency-exchange.service';
import { BrevoPaymentStatusMailingService } from '../utils/brevo.payment-status';
import {
  DepositRequest,
  PayoutRequest,
  RefundRequest,
  BulkPayoutRequest,
  PawaPayWebhookData
} from '../types/pawapay.types';

const prisma = new PrismaClient();
const paymentEmailService = new BrevoPaymentStatusMailingService();

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

      // Fetch user email for metadata
      const user = userId ? await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, firstName: true, lastName: true, phone: true }
      }) : null;

      const metadataArray: any = this._buildMetadataArray(metadata, {
        clientReferenceId: internalReference,
        userId: userId,
        userEmail: user?.email,
        userFirstName: user?.firstName,
        userLastName: user?.lastName,
        userPhone: user?.phone
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
            amountRWF: rwfAmount,
            userEmail: user?.email,
            userFirstName: user?.firstName,
            userLastName: user?.lastName,
            userPhone: user?.phone,
            internalReference
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

      // Fetch current transaction from database to compare status
      const currentTransaction = await prisma.pawaPayTransaction.findUnique({
        where: { transactionId: depositId }
      });

      if (!currentTransaction) {
        res.status(404).json({
          success: false,
          message: 'Transaction not found'
        });
        return;
      }

      const previousStatus = currentTransaction.status;

      // Fetch latest status from PawaPay
      const response = await pawaPayService.getDepositStatus(depositId);
      const newStatus = response.status;

      // Update transaction in database
      await prisma.pawaPayTransaction.update({
        where: { transactionId: depositId },
        data: {
          status: newStatus,
          depositedAmount: response.requestedAmount,
          providerTransactionId: response.correspondentIds?.PROVIDER_TRANSACTION_ID,
          financialTransactionId: response.correspondentIds?.FINANCIAL_TRANSACTION_ID,
          failureCode: response.failureReason?.failureCode,
          failureMessage: response.failureReason?.failureMessage,
          completedAt: newStatus === 'COMPLETED' ? new Date() : undefined
        }
      });

      // If status has changed, handle the change
      if (newStatus !== previousStatus) {
        console.log(`[PAWAPAY_STATUS_CHECK] Status changed for ${depositId}: ${previousStatus} → ${newStatus}`);

        const internalRef = currentTransaction.internalReference || (currentTransaction.metadata as any)?.internalReference;

        console.log(`[PAWAPAY_STATUS_CHECK] Internal reference: ${internalRef || 'NOT FOUND'}`);
        console.log(`[PAWAPAY_STATUS_CHECK] Transaction internalReference field: ${currentTransaction.internalReference || 'null'}`);
        console.log(`[PAWAPAY_STATUS_CHECK] Transaction metadata: ${JSON.stringify(currentTransaction.metadata)}`);

        if (internalRef) {
          if (newStatus === 'COMPLETED') {
            // Update related booking and send completion emails
            await this.handleDepositCompletion(internalRef).catch(err => {
              console.error(`[PAWAPAY_STATUS_CHECK] Failed to handle completion for ${internalRef}:`, err);
            });
          } else if (newStatus === 'FAILED') {
            // Send failure emails
            const failureReason = response.failureReason?.failureMessage || 'Payment could not be processed';
            await this.handleDepositFailure(internalRef, failureReason).catch(err => {
              console.error(`[PAWAPAY_STATUS_CHECK] Failed to handle failure for ${internalRef}:`, err);
            });
          }
        } else {
          console.log(`[PAWAPAY_STATUS_CHECK] ⚠️ No internal reference found - cannot send emails for ${depositId}`);
        }
      }

      res.status(200).json({
        success: true,
        data: response,
        statusChanged: newStatus !== previousStatus,
        previousStatus,
        newStatus
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

      // Fetch user email for metadata
      const user = userId ? await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, firstName: true, lastName: true, phone: true }
      }) : null;

      // Use the centralized helper for consistent metadata handling
      const metadataArray: any = this._buildMetadataArray(metadata, {
        clientReferenceId: internalReference,
        userId: userId,
        userEmail: user?.email,
        userFirstName: user?.firstName,
        userLastName: user?.lastName,
        userPhone: user?.phone
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
            amountRWF: rwfAmount,
            userEmail: user?.email,
            userFirstName: user?.firstName,
            userLastName: user?.lastName,
            userPhone: user?.phone,
            internalReference
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

  // ==================== HELPER METHODS FOR STATUS CHECK ====================

  /**
   * Handle deposit completion - update booking and send emails
   */
  private async handleDepositCompletion(internalRef: string): Promise<void> {
    try {
      // Check property bookings first (they use both id and transactionId)
      const propertyBooking = await prisma.booking.findFirst({
        where: {
          OR: [{ id: internalRef }, { transactionId: internalRef }]
        }
      });

      if (propertyBooking) {
        console.log(`[PAWAPAY_STATUS_CHECK] Found property booking ${propertyBooking.id}`);

        // Update booking status to completed
        await prisma.booking.update({
          where: { id: propertyBooking.id },
          data: {
            paymentStatus: 'completed',
            status: 'confirmed'
          }
        });

        console.log(`[PAWAPAY_STATUS_CHECK] Updated property booking ${propertyBooking.id} to completed`);

        // Send emails
        await this.sendPropertyBookingPaymentEmails(internalRef, 'completed');
        return;
      }

      // Check if this is a tour booking
      const tourBooking = await prisma.tourBooking.findFirst({
        where: { id: internalRef }
      });

      if (tourBooking) {
        console.log(`[PAWAPAY_STATUS_CHECK] Found tour booking ${tourBooking.id}`);

        // Update tour booking status to completed
        await prisma.tourBooking.update({
          where: { id: tourBooking.id },
          data: {
            paymentStatus: 'completed',
            status: 'confirmed'
          }
        });

        console.log(`[PAWAPAY_STATUS_CHECK] Updated tour booking ${tourBooking.id} to completed`);

        // Send emails
        await this.sendTourBookingPaymentEmails(internalRef, 'completed');
        return;
      }

      console.log(`[PAWAPAY_STATUS_CHECK] ⚠️ No booking found for reference ${internalRef}`);
    } catch (error) {
      console.error('[PAWAPAY_STATUS_CHECK] Error handling deposit completion:', error);
    }
  }

  /**
   * Handle deposit failure - send failure emails
   */
  private async handleDepositFailure(internalRef: string, failureReason: string): Promise<void> {
    try {
      console.log(`[PAWAPAY_STATUS_CHECK] Handling deposit failure for ${internalRef}: ${failureReason}`);

      // Check property bookings first (they use both id and transactionId)
      const propertyBooking = await prisma.booking.findFirst({
        where: {
          OR: [{ id: internalRef }, { transactionId: internalRef }]
        }
      });

      if (propertyBooking) {
        console.log(`[PAWAPAY_STATUS_CHECK] Found property booking ${propertyBooking.id}`);

        // Update booking status to failed
        await prisma.booking.update({
          where: { id: propertyBooking.id },
          data: { paymentStatus: 'failed' }
        });

        console.log(`[PAWAPAY_STATUS_CHECK] Updated property booking ${propertyBooking.id} to failed`);

        // Send failure email
        await this.sendPropertyBookingPaymentEmails(internalRef, 'failed', failureReason).catch(err => {
          console.error(`[PAWAPAY_STATUS_CHECK] Failed to send property booking failure email:`, err);
        });

        console.log(`[PAWAPAY_STATUS_CHECK] Payment failure email sent for property booking ${propertyBooking.id}`);
        return;
      }

      // Check if this is a tour booking
      const tourBooking = await prisma.tourBooking.findFirst({
        where: { id: internalRef }
      });

      if (tourBooking) {
        console.log(`[PAWAPAY_STATUS_CHECK] Found tour booking ${tourBooking.id}`);

        // Update tour booking status to failed
        await prisma.tourBooking.update({
          where: { id: tourBooking.id },
          data: { paymentStatus: 'failed' }
        });

        console.log(`[PAWAPAY_STATUS_CHECK] Updated tour booking ${tourBooking.id} to failed`);

        // Send failure email
        await this.sendTourBookingPaymentEmails(internalRef, 'failed', failureReason).catch(err => {
          console.error(`[PAWAPAY_STATUS_CHECK] Failed to send tour booking failure email:`, err);
        });

        console.log(`[PAWAPAY_STATUS_CHECK] Payment failure email sent for tour booking ${tourBooking.id}`);
        return;
      }

      console.log(`[PAWAPAY_STATUS_CHECK] ⚠️ No booking found for reference ${internalRef}`);
    } catch (error) {
      console.error('[PAWAPAY_STATUS_CHECK] Error handling deposit failure:', error);
    }
  }

  /**
   * Send payment status emails for property bookings
   */
  private async sendPropertyBookingPaymentEmails(
    bookingId: string,
    status: 'completed' | 'failed',
    failureReason?: string
  ): Promise<void> {
    try {
      const booking = await prisma.booking.findFirst({
        where: {
          OR: [{ id: bookingId }, { transactionId: bookingId }]
        },
        include: {
          property: {
            include: {
              host: true,
              agent: { select: { id: true, email: true, firstName: true, lastName: true } }
            }
          },
          guest: true
        }
      });

      if (!booking || !booking.guest || !booking.property.host) return;

      const bookingInfo: any = {
        id: booking.id,
        propertyId: booking.propertyId,
        property: {
          name: booking.property.name,
          location: booking.property.location,
          images: typeof booking.property.images === 'string' ? JSON.parse(booking.property.images) : booking.property.images || {},
          pricePerNight: booking.property.pricePerNight,
          hostName: `${booking.property.host.firstName} ${booking.property.host.lastName}`,
          hostEmail: booking.property.host.email,
          hostPhone: booking.property.host.phone || undefined
        },
        guestId: booking.guestId,
        guest: {
          firstName: booking.guest.firstName,
          lastName: booking.guest.lastName,
          email: booking.guest.email,
          phone: booking.guest.phone || undefined,
          profileImage: booking.guest.profileImage || undefined
        },
        checkIn: booking.checkIn.toISOString(),
        checkOut: booking.checkOut.toISOString(),
        guests: booking.guests,
        nights: Math.ceil((booking.checkOut.getTime() - booking.checkIn.getTime()) / (1000 * 60 * 60 * 24)),
        totalPrice: booking.totalPrice,
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        message: booking.message || undefined,
        specialRequests: booking.specialRequests || undefined,
        checkInInstructions: booking.checkInInstructions || undefined,
        checkOutInstructions: booking.checkOutInstructions || undefined,
        createdAt: booking.createdAt.toISOString(),
        updatedAt: booking.updatedAt.toISOString()
      };

      const company = {
        name: 'Jambolush',
        website: 'https://jambolush.com',
        supportEmail: 'support@jambolush.com',
        logo: 'https://jambolush.com/favicon.ico'
      };

      if (status === 'completed') {
        // Send confirmation to guest
        await paymentEmailService.sendPaymentCompletedEmail({
          user: {
            firstName: booking.guest.firstName,
            lastName: booking.guest.lastName,
            email: booking.guest.email,
            id: booking.guestId
          },
          company,
          booking: bookingInfo,
          recipientType: 'guest',
          paymentStatus: 'completed',
          paymentAmount: booking.totalPrice,
          paymentCurrency: 'USD'
        });

        // Send notification to host
        await paymentEmailService.sendPaymentConfirmedToHost({
          user: {
            firstName: booking.property.host.firstName,
            lastName: booking.property.host.lastName,
            email: booking.property.host.email,
            id: booking.property.hostId || 0
          },
          company,
          booking: bookingInfo,
          recipientType: 'host',
          paymentStatus: 'completed',
          paymentAmount: booking.totalPrice,
          paymentCurrency: 'USD'
        });

        // Send notification to agent if exists
        if (booking.property.agent) {
          await paymentEmailService.sendPaymentConfirmedToHost({
            user: {
              firstName: booking.property.agent.firstName,
              lastName: booking.property.agent.lastName,
              email: booking.property.agent.email,
              id: booking.property.agent.id
            },
            company,
            booking: bookingInfo,
            recipientType: 'host',
            paymentStatus: 'completed',
            paymentAmount: booking.totalPrice,
            paymentCurrency: 'USD'
          }).catch(err => console.error('[PAWAPAY_STATUS_CHECK] Error sending agent notification:', err));
        }
      } else if (status === 'failed') {
        // Send failure notification to guest
        await paymentEmailService.sendPaymentFailedEmail({
          user: {
            firstName: booking.guest.firstName,
            lastName: booking.guest.lastName,
            email: booking.guest.email,
            id: booking.guestId
          },
          company,
          booking: bookingInfo,
          recipientType: 'guest',
          paymentStatus: 'failed',
          failureReason
        });
      }
    } catch (error) {
      console.error('[PAWAPAY_STATUS_CHECK] Error sending property booking payment emails:', error);
    }
  }

  /**
   * Send payment status emails for tour bookings
   */
  private async sendTourBookingPaymentEmails(
    bookingId: string,
    status: 'completed' | 'failed',
    failureReason?: string
  ): Promise<void> {
    try {
      const booking = await prisma.tourBooking.findFirst({
        where: { id: bookingId },
        include: {
          tour: { include: { tourGuide: true } },
          schedule: true,
          user: true
        }
      });

      if (!booking || !booking.user || !booking.tour.tourGuide) return;

      const bookingInfo: any = {
        id: booking.id,
        tourId: String(booking.tourId),
        tour: {
          title: booking.tour.title,
          description: booking.tour.description,
          category: booking.tour.category,
          type: booking.tour.type,
          duration: booking.tour.duration,
          difficulty: booking.tour.difficulty,
          location: `${booking.tour.locationCity}, ${booking.tour.locationCountry}`,
          images: booking.tour.images || {},
          price: booking.tour.price,
          currency: booking.tour.currency,
          inclusions: booking.tour.inclusions || [],
          exclusions: booking.tour.exclusions || [],
          requirements: booking.tour.requirements || [],
          meetingPoint: booking.tour.meetingPoint
        },
        scheduleId: booking.scheduleId,
        schedule: {
          startDate: booking.schedule.startDate.toISOString(),
          endDate: booking.schedule.endDate.toISOString(),
          startTime: booking.schedule.startTime,
          endTime: booking.schedule.endTime || undefined,
          availableSlots: booking.schedule.availableSlots,
          bookedSlots: booking.schedule.bookedSlots
        },
        tourGuideId: booking.tourGuideId,
        tourGuide: {
          firstName: booking.tour.tourGuide.firstName,
          lastName: booking.tour.tourGuide.lastName,
          email: booking.tour.tourGuide.email,
          phone: booking.tour.tourGuide.phone || undefined,
          profileImage: booking.tour.tourGuide.profileImage || undefined,
          bio: booking.tour.tourGuide.bio || undefined,
          rating: booking.tour.tourGuide.rating || undefined,
          totalTours: booking.tour.tourGuide.totalTours || undefined
        },
        userId: booking.userId,
        user: {
          firstName: booking.user.firstName,
          lastName: booking.user.lastName,
          email: booking.user.email,
          phone: booking.user.phone || undefined,
          profileImage: booking.user.profileImage || undefined
        },
        numberOfParticipants: booking.numberOfParticipants,
        participants: booking.participants || [],
        totalAmount: booking.totalAmount,
        currency: booking.currency,
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        checkInStatus: booking.checkInStatus,
        checkInTime: booking.checkInTime?.toISOString(),
        checkOutTime: booking.checkOutTime?.toISOString(),
        specialRequests: booking.specialRequests || undefined,
        refundAmount: booking.refundAmount || undefined,
        refundReason: booking.refundReason || undefined,
        bookingDate: booking.bookingDate.toISOString(),
        createdAt: booking.createdAt.toISOString(),
        updatedAt: booking.updatedAt.toISOString()
      };

      const company = {
        name: 'Jambolush',
        website: 'https://jambolush.com',
        supportEmail: 'support@jambolush.com',
        logo: 'https://jambolush.com/favicon.ico'
      };

      if (status === 'completed') {
        // Send confirmation to guest
        await paymentEmailService.sendPaymentCompletedEmail({
          user: {
            firstName: booking.user.firstName,
            lastName: booking.user.lastName,
            email: booking.user.email,
            id: booking.userId
          },
          company,
          booking: bookingInfo,
          recipientType: 'guest',
          paymentStatus: 'completed',
          paymentAmount: booking.totalAmount,
          paymentCurrency: booking.currency
        });

        // Send notification to tour guide
        await paymentEmailService.sendPaymentConfirmedToHost({
          user: {
            firstName: booking.tour.tourGuide.firstName,
            lastName: booking.tour.tourGuide.lastName,
            email: booking.tour.tourGuide.email,
            id: booking.tourGuideId
          },
          company,
          booking: bookingInfo,
          recipientType: 'guide',
          paymentStatus: 'completed',
          paymentAmount: booking.totalAmount,
          paymentCurrency: booking.currency
        });
      } else if (status === 'failed') {
        // Send failure notification to guest
        await paymentEmailService.sendPaymentFailedEmail({
          user: {
            firstName: booking.user.firstName,
            lastName: booking.user.lastName,
            email: booking.user.email,
            id: booking.userId
          },
          company,
          booking: bookingInfo,
          recipientType: 'guest',
          paymentStatus: 'failed',
          failureReason
        });
      }
    } catch (error) {
      console.error('[PAWAPAY_STATUS_CHECK] Error sending tour booking payment emails:', error);
    }
  }
}

export const pawaPayController = new PawaPayController();