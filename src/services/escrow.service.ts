import axios, { AxiosInstance, AxiosError } from 'axios';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { config } from '../config/config';
import {
  PaymentTransaction,
  TransactionStatus
} from '../types/payment.types';
import { EscrowConfig, EscrowCredentials, EscrowDepositDto, EscrowTransaction, EscrowApiResponse, EscrowWithdrawalDto, EscrowTransferDto, EscrowP2PDto, EscrowStatus, EscrowWebhookData } from '../types/escrow.types';

const prisma = new PrismaClient();

export class EscrowService {
  private escrowClient: AxiosInstance;
  private escrowConfig: EscrowConfig;
  private escrowCredentials: EscrowCredentials = {};

  constructor() {
    this.escrowConfig = {
      baseUrl: config.escrow.baseUrl || 'https://api.escrowpayments.com',
      apiKey: config.escrow.apiKey,
      secretKey: config.escrow.secretKey,
      merchantId: config.escrow.merchantId,
      environment: (config.escrow.environment === 'production' ? 'production' : 'sandbox'),
      timeout: 30000,
      retryAttempts: 3,
      webhookSecret: config.escrow.webhookSecret,
      callbackUrl: config.escrow.callbackUrl,
      defaultCurrency: 'USD', // USD as default
      supportedCurrencies: ['USD', 'RWF'] // USD and RWF support
    };

    this.escrowClient = axios.create({
      baseURL: this.escrowConfig.baseUrl,
      timeout: this.escrowConfig.timeout,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.escrowConfig.apiKey}`,
        'X-Merchant-ID': this.escrowConfig.merchantId
      }
    });

    // Request interceptor for authentication and signatures
    this.escrowClient.interceptors.request.use(async (config) => {
      // Add timestamp and signature for security
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = this.generateSignature(JSON.stringify(config.data), timestamp);
      
      config.headers['X-Timestamp'] = timestamp;
      config.headers['X-Signature'] = signature;
      
      return config;
    });

    // Response interceptor for error handling
    this.escrowClient.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        console.error('Escrow API Error:', error.response?.data || error.message);
        return Promise.reject(error);
      }
    );
  }

  private generateSignature(data: string, timestamp: string): string {
    const payload = `${timestamp}${data}${this.escrowConfig.secretKey}`;
    return crypto.createHmac('sha256', this.escrowConfig.secretKey)
      .update(payload)
      .digest('hex');
  }

  // --- ESCROW DEPOSIT (Funding escrow account) ---
  async createEscrowDeposit(userId: number, data: EscrowDepositDto): Promise<EscrowTransaction> {
    try {
      // Validate currency
      if (!this.escrowConfig.supportedCurrencies.includes(data.currency)) {
        throw new Error(`Unsupported currency: ${data.currency}. Supported: ${this.escrowConfig.supportedCurrencies.join(', ')}`);
      }

      // Create escrow transaction record
      const escrowTransaction = await this.createEscrowTransaction({
        userId,
        type: 'escrow_deposit',
        amount: data.amount,
        currency: data.currency,
        status: 'pending',
        reference: data.reference,
        description: data.description,
        recipientId: data.recipientId,
        escrowTerms: data.escrowTerms,
        releaseConditions: data.releaseConditions,
        disputeDeadline: data.disputeDeadline
      });

      // Prepare escrow API request
      const escrowRequest = {
        transaction_id: escrowTransaction.id,
        payer_id: userId.toString(),
        recipient_id: data.recipientId?.toString() || null,
        amount: data.amount,
        currency: data.currency,
        purpose: data.description || 'Escrow deposit',
        terms: data.escrowTerms,
        release_conditions: data.releaseConditions,
        dispute_deadline: data.disputeDeadline,
        auto_release_date: data.autoReleaseDate,
        callback_url: `${this.escrowConfig.callbackUrl}/escrow`,
        metadata: {
          user_id: userId,
          reference: data.reference,
          platform: 'payment_system'
        }
      };

      // Submit to Escrow API
      const response = await this.escrowClient.post<EscrowApiResponse>(
        '/v1/escrow/create',
        escrowRequest
      );

      // Update transaction with escrow response
      const updatedTransaction = await this.updateEscrowTransaction(escrowTransaction.id, {
        escrowId: response.data.escrow_id,
        externalId: response.data.transaction_id,
        status: this.mapEscrowStatusToTransactionStatus(response.data.status),
        paymentUrl: response.data.payment_url
      });

      return updatedTransaction;
    } catch (error: any) {
      console.error('Escrow deposit failed:', error);
      throw new Error(error.response?.data?.message || error.message || 'Escrow deposit failed');
    }
  }

  // --- ESCROW WITHDRAWAL (Release from escrow) ---
  async processEscrowWithdrawal(userId: number, data: EscrowWithdrawalDto): Promise<EscrowTransaction> {
    try {
      // Find existing escrow transaction
      const escrowTransaction = await prisma.escrowTransaction.findFirst({
        where: {
          id: data.escrowTransactionId,
          OR: [
            { userId },
            { recipientId: userId }
          ],
          status: 'funded'
        }
      });

      if (!escrowTransaction) {
        throw new Error('Escrow transaction not found or not eligible for withdrawal');
      }

      // Verify user has permission to release
      const canRelease = await this.verifyReleasePermission(escrowTransaction.id, userId);
      if (!canRelease) {
        throw new Error('You do not have permission to release this escrow');
      }

      // Prepare escrow release request
      const releaseRequest = {
        escrow_id: escrowTransaction.escrowId,
        released_by: userId.toString(),
        release_reason: data.releaseReason || 'Conditions met',
        release_amount: data.amount || escrowTransaction.amount,
        recipient_account: {
          type: data.withdrawalMethod,
          account_number: data.accountNumber,
          bank_code: data.bankCode,
          account_name: data.accountName,
          phone_number: data.phoneNumber
        }
      };

      // Submit release request to Escrow API
      const response = await this.escrowClient.post<EscrowApiResponse>(
        `/v1/escrow/${escrowTransaction.escrowId}/release`,
        releaseRequest
      );

      // Update transaction status
      const updatedTransaction = await this.updateEscrowTransaction(escrowTransaction.id, {
        status: this.mapEscrowStatusToTransactionStatus(response.data.status),
        releasedAt: new Date(),
        releasedBy: userId,
        releaseReason: data.releaseReason
      });

      return updatedTransaction;
    } catch (error: any) {
      console.error('Escrow withdrawal failed:', error);
      throw new Error(error.response?.data?.message || error.message || 'Escrow withdrawal failed');
    }
  }

  // --- ESCROW TRANSFER (Internal escrow transfer) ---
  async processEscrowTransfer(userId: number, data: EscrowTransferDto): Promise<EscrowTransaction> {
    try {
      // Create escrow transfer transaction
      const escrowTransaction = await this.createEscrowTransaction({
        userId,
        type: 'escrow_transfer',
        amount: data.amount,
        currency: data.currency,
        status: 'pending',
        reference: data.reference,
        description: data.description,
        recipientId: data.recipientId,
        sourceEscrowId: data.sourceEscrowId,
        escrowTerms: data.escrowTerms
      });

      // Prepare transfer request
      const transferRequest = {
        source_escrow_id: data.sourceEscrowId,
        recipient_id: data.recipientId.toString(),
        amount: data.amount,
        currency: data.currency,
        transfer_type: data.transferType || 'partial',
        reason: data.description,
        new_terms: data.escrowTerms,
        callback_url: `${this.escrowConfig.callbackUrl}/escrow/transfer`
      };

      // Submit to Escrow API
      const response = await this.escrowClient.post<EscrowApiResponse>(
        '/v1/escrow/transfer',
        transferRequest
      );

      // Update transaction
      const updatedTransaction = await this.updateEscrowTransaction(escrowTransaction.id, {
        escrowId: response.data.escrow_id,
        externalId: response.data.transaction_id,
        status: this.mapEscrowStatusToTransactionStatus(response.data.status)
      });

      return updatedTransaction;
    } catch (error: any) {
      console.error('Escrow transfer failed:', error);
      throw new Error(error.response?.data?.message || error.message || 'Escrow transfer failed');
    }
  }

  // --- PEER-TO-PEER ESCROW PAYMENTS ---
  async createP2PEscrowPayment(userId: number, data: EscrowP2PDto): Promise<EscrowTransaction> {
    try {
      // Validate recipient exists
      const recipient = await prisma.user.findUnique({
        where: { id: data.recipientId },
        select: { id: true, email: true, firstName: true, lastName: true }
      });

      if (!recipient) {
        throw new Error('Recipient not found');
      }

      // Create P2P escrow transaction
      const escrowTransaction = await this.createEscrowTransaction({
        userId,
        type: 'p2p_escrow',
        amount: data.amount,
        currency: data.currency,
        status: 'pending',
        reference: data.reference,
        description: data.description,
        recipientId: data.recipientId,
        escrowTerms: data.escrowTerms,
        releaseConditions: data.releaseConditions,
        disputeDeadline: data.disputeDeadline,
        isP2P: true
      });

      // Prepare P2P escrow request
      const p2pRequest = {
        transaction_id: escrowTransaction.id,
        payer: {
          id: userId.toString(),
          type: 'platform_user'
        },
        recipient: {
          id: data.recipientId.toString(),
          type: 'platform_user',
          email: recipient.email,
          name: `${recipient.firstName} ${recipient.lastName}`
        },
        amount: data.amount,
        currency: data.currency,
        purpose: data.description || 'P2P payment',
        terms: data.escrowTerms,
        release_conditions: data.releaseConditions,
        dispute_deadline: data.disputeDeadline,
        auto_release_date: data.autoReleaseDate,
        notification_preferences: {
          email: true,
          sms: data.notifyBySMS || false,
          in_app: true
        },
        callback_url: `${this.escrowConfig.callbackUrl}/escrow/p2p`,
        metadata: {
          payer_id: userId,
          recipient_id: data.recipientId,
          reference: data.reference,
          platform: 'p2p_payment'
        }
      };

      // Submit to Escrow API
      const response = await this.escrowClient.post<EscrowApiResponse>(
        '/v1/escrow/p2p/create',
        p2pRequest
      );

      // Update transaction with response
      const updatedTransaction = await this.updateEscrowTransaction(escrowTransaction.id, {
        escrowId: response.data.escrow_id,
        externalId: response.data.transaction_id,
        status: this.mapEscrowStatusToTransactionStatus(response.data.status),
        paymentUrl: response.data.payment_url
      });

      // Send notification to recipient
      await this.notifyRecipient(data.recipientId, escrowTransaction.id, data.amount, data.currency);

      return updatedTransaction;
    } catch (error: any) {
      console.error('P2P escrow payment failed:', error);
      throw new Error(error.response?.data?.message || error.message || 'P2P escrow payment failed');
    }
  }

  // --- ESCROW MANAGEMENT OPERATIONS ---
  async getEscrowTransaction(transactionId: string, userId: number): Promise<EscrowTransaction | null> {
    try {
      const transaction = await prisma.escrowTransaction.findFirst({
        where: {
          id: transactionId,
          OR: [
            { userId },
            { recipientId: userId }
          ]
        },
        include: {
          user: {
            select: { id: true, email: true, firstName: true, lastName: true }
          },
          recipient: {
            select: { id: true, email: true, firstName: true, lastName: true }
          }
        }
      });

      if (!transaction) return null;

      return this.transformToEscrowTransaction(transaction);
    } catch (error: any) {
      console.error('Error getting escrow transaction:', error);
      throw new Error('Failed to retrieve escrow transaction');
    }
  }

  async getUserEscrowTransactions(userId: number, status?: EscrowStatus) {
    try {
      const whereClause: any = {
        OR: [
          { userId },
          { recipientId: userId }
        ]
      };

      if (status) {
        whereClause.status = status;
      }

      const transactions = await prisma.escrowTransaction.findMany({
        where: whereClause,
        include: {
          user: {
            select: { id: true, email: true, firstName: true, lastName: true }
          },
          recipient: {
            select: { id: true, email: true, firstName: true, lastName: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      return transactions.map(t => this.transformToEscrowTransaction(t));
    } catch (error: any) {
      console.error('Error getting user escrow transactions:', error);
      throw new Error('Failed to retrieve escrow transactions');
    }
  }

  async disputeEscrowTransaction(transactionId: string, userId: number, disputeReason: string) {
    try {
      const transaction = await prisma.escrowTransaction.findFirst({
        where: {
          id: transactionId,
          OR: [
            { userId },
            { recipientId: userId }
          ],
          status: 'funded'
        }
      });

      if (!transaction) {
        throw new Error('Escrow transaction not found or not eligible for dispute');
      }

      // Submit dispute to escrow API
      const disputeRequest = {
        escrow_id: transaction.escrowId,
        disputed_by: userId.toString(),
        dispute_reason: disputeReason,
        evidence_urls: [] // Can be extended to include evidence
      };

      const response = await this.escrowClient.post<EscrowApiResponse>(
        `/v1/escrow/${transaction.escrowId}/dispute`,
        disputeRequest
      );

      // Update transaction status
      await this.updateEscrowTransaction(transaction.id, {
        status: 'disputed',
        disputedAt: new Date(),
        disputedBy: userId,
        disputeReason
      });

      return response.data;
    } catch (error: any) {
      console.error('Escrow dispute failed:', error);
      throw new Error(error.response?.data?.message || error.message || 'Failed to create dispute');
    }
  }

  // --- WEBHOOK HANDLING ---
  async handleEscrowWebhook(webhookData: EscrowWebhookData): Promise<void> {
    try {
      const transaction = await prisma.escrowTransaction.findFirst({
        where: {
          OR: [
            { escrowId: webhookData.escrow_id },
            { externalId: webhookData.transaction_id }
          ]
        }
      });

      if (!transaction) {
        console.error('Escrow transaction not found for webhook:', webhookData);
        return;
      }

      const status = this.mapEscrowStatusToTransactionStatus(webhookData.status);
      const updates: any = {
        status,
        updatedAt: new Date()
      };

      // Handle different webhook events
      switch (webhookData.event_type) {
        case 'escrow_funded':
          updates.fundedAt = new Date();
          break;
        case 'escrow_released':
          updates.releasedAt = new Date();
          updates.releasedBy = parseInt(webhookData.data?.released_by || '0');
          break;
        case 'escrow_disputed':
          updates.disputedAt = new Date();
          updates.disputedBy = parseInt(webhookData.data?.disputed_by || '0');
          updates.disputeReason = webhookData.data?.dispute_reason;
          break;
        case 'escrow_resolved':
          updates.resolvedAt = new Date();
          break;
        case 'escrow_cancelled':
          updates.cancelledAt = new Date();
          updates.cancellationReason = webhookData.data?.cancellation_reason;
          break;
      }

      await prisma.escrowTransaction.update({
        where: { id: transaction.id },
        data: updates
      });

      // Send notifications
      await this.sendEscrowNotification(transaction.userId, transaction.id, webhookData.event_type);
      if (transaction.recipientId) {
        await this.sendEscrowNotification(transaction.recipientId, transaction.id, webhookData.event_type);
      }

    } catch (error: any) {
      console.error('Error handling escrow webhook:', error);
      throw error;
    }
  }

  // --- UTILITY METHODS ---
  private async createEscrowTransaction(data: Partial<EscrowTransaction>): Promise<EscrowTransaction> {
    const transaction = await prisma.escrowTransaction.create({
      data: {
        userId: data.userId!,
        type: data.type!,
        amount: data.amount!,
        currency: data.currency || this.escrowConfig.defaultCurrency,
        status: data.status || 'pending',
        reference: data.reference!,
        description: data.description,
        recipientId: data.recipientId,
        escrowTerms: data.escrowTerms ? JSON.stringify(data.escrowTerms) : undefined,
        releaseConditions: data.releaseConditions ? JSON.stringify(data.releaseConditions) : undefined,
        disputeDeadline: data.disputeDeadline,
        sourceEscrowId: data.sourceEscrowId,
        isP2P: data.isP2P || false
      }
    });

    return this.transformToEscrowTransaction(transaction);
  }

  private async updateEscrowTransaction(id: string, updates: Partial<EscrowTransaction>): Promise<EscrowTransaction> {
    const transaction = await prisma.escrowTransaction.update({
      where: { id },
      data: {
        ...(updates.escrowId && { escrowId: updates.escrowId }),
        ...(updates.externalId && { externalId: updates.externalId }),
        ...(updates.status && { status: updates.status }),
        ...(updates.paymentUrl && { paymentUrl: updates.paymentUrl }),
        ...(updates.fundedAt && { fundedAt: updates.fundedAt }),
        ...(updates.releasedAt && { releasedAt: updates.releasedAt }),
        ...(updates.releasedBy && { releasedBy: updates.releasedBy }),
        ...(updates.releaseReason && { releaseReason: updates.releaseReason }),
        ...(updates.disputedAt && { disputedAt: updates.disputedAt }),
        ...(updates.disputedBy && { disputedBy: updates.disputedBy }),
        ...(updates.disputeReason && { disputeReason: updates.disputeReason }),
        updatedAt: new Date()
      }
    });

    return this.transformToEscrowTransaction(transaction);
  }

  private async verifyReleasePermission(transactionId: string, userId: number): Promise<boolean> {
    const transaction = await prisma.escrowTransaction.findUnique({
      where: { id: transactionId }
    });

    if (!transaction) return false;

    // Both payer and recipient can release (depending on escrow terms)
    // This logic can be customized based on your business rules
    return transaction.userId === userId || transaction.recipientId === userId;
  }

  private async notifyRecipient(recipientId: number, transactionId: string, amount: number, currency: string) {
    // Implement notification logic (email, SMS, push notification)
    console.log(`Notifying recipient ${recipientId} about escrow payment ${transactionId}: ${amount} ${currency}`);
  }

  private async sendEscrowNotification(userId: number, transactionId: string, eventType: string) {
    // Implement notification logic based on event type
    console.log(`Sending escrow notification to user ${userId} for transaction ${transactionId}: ${eventType}`);
  }

  private mapEscrowStatusToTransactionStatus(escrowStatus: string): EscrowStatus {
    const statusMap: Record<string, EscrowStatus> = {
      'pending': 'pending',
      'funded': 'funded',
      'released': 'released',
      'disputed': 'disputed',
      'resolved': 'resolved',
      'cancelled': 'cancelled',
      'expired': 'expired'
    };

    return statusMap[escrowStatus.toLowerCase()] || 'pending';
  }

  private transformToEscrowTransaction(transaction: any): EscrowTransaction {
    return {
      id: transaction.id,
      userId: transaction.userId,
      recipientId: transaction.recipientId,
      type: transaction.type,
      amount: transaction.amount,
      currency: transaction.currency,
      status: transaction.status,
      reference: transaction.reference,
      description: transaction.description,
      escrowId: transaction.escrowId,
      externalId: transaction.externalId,
      paymentUrl: transaction.paymentUrl,
      escrowTerms: transaction.escrowTerms ? JSON.parse(transaction.escrowTerms) : undefined,
      releaseConditions: transaction.releaseConditions ? JSON.parse(transaction.releaseConditions) : undefined,
      disputeDeadline: transaction.disputeDeadline?.toISOString(),
      sourceEscrowId: transaction.sourceEscrowId,
      isP2P: transaction.isP2P,
      fundedAt: transaction.fundedAt?.toISOString(),
      releasedAt: transaction.releasedAt?.toISOString(),
      releasedBy: transaction.releasedBy,
      releaseReason: transaction.releaseReason,
      disputedAt: transaction.disputedAt?.toISOString(),
      disputedBy: transaction.disputedBy,
      disputeReason: transaction.disputeReason,
      resolvedAt: transaction.resolvedAt?.toISOString(),
      cancelledAt: transaction.cancelledAt?.toISOString(),
      cancellationReason: transaction.cancellationReason,
      createdAt: transaction.createdAt.toISOString(),
      updatedAt: transaction.updatedAt.toISOString(),
      user: transaction.user,
      recipient: transaction.recipient
    };
  }
}