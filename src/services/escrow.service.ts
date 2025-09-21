// services/escrow.service.ts

import { PrismaClient } from '@prisma/client';
import { PesapalService } from './pesapal.service';
import {
  CreateDepositDto,
  ReleaseEscrowDto,
  WithdrawDto,
  RefundDto,
  EscrowTransaction,
  EscrowTransactionStatus,
  EscrowTransactionType,
  UserWallet,
  WithdrawalRequest,
  PesapalCheckoutRequest,
  PesapalPayoutRequest,
  PesapalWebhookData,
  SplitRules,
  EscrowParticipant,
  PayoutMethod,
  EscrowLimits
} from '../types/pesapal.types';
import { EmailService } from './email.service';
import config from '../config/config';

const prisma = new PrismaClient();

export class EscrowService {
  private pesapalService: PesapalService;
  private emailService: EmailService;

  constructor(pesapalService: PesapalService, emailService: EmailService) {
    this.pesapalService = pesapalService;
    this.emailService = emailService;
  }

  // === DEPOSIT OPERATIONS ===

  async createDeposit(guestId: number, depositData: CreateDepositDto): Promise<{
    transaction: EscrowTransaction;
    checkoutUrl: string;
  }> {
    try {
      // Validate deposit amount and limits
      await this.validateEscrowLimits(guestId, 'DEPOSIT', depositData.amount);

      // Validate split rules
      this.validateSplitRules(depositData.splitRules);

      // Get participants
      const [guest, host, agent] = await Promise.all([
        this.getUserById(guestId),
        this.getUserById(depositData.hostId),
        depositData.agentId ? this.getUserById(depositData.agentId) : null
      ]);

      // Create escrow transaction
      const merchantReference = this.pesapalService.generateMerchantReference('DEP');
      
      const escrowTransaction = await this.createEscrowTransaction({
        guestId,
        hostId: depositData.hostId,
        agentId: depositData.agentId,
        type: 'DEPOSIT',
        status: 'PENDING',
        amount: depositData.amount,
        currency: depositData.currency,
        reference: merchantReference,
        description: depositData.description,
        splitRules: depositData.splitRules,
        billingInfo: depositData.billingInfo
      });

      // Create Pesapal checkout request (without notification_id - auto-registration will handle it)
      const checkoutRequest: PesapalCheckoutRequest = {
        id: merchantReference,
        currency: depositData.currency,
        amount: this.pesapalService.formatAmount(depositData.amount),
        description: depositData.description || `Payment for booking ${merchantReference}`,
        callback_url: `${config.pesapal.callbackUrl}`,
        billing_address: {
          email_address: depositData.billingInfo.email,
          phone_number: depositData.billingInfo.phone,
          first_name: depositData.billingInfo.firstName,
          last_name: depositData.billingInfo.lastName,
          country_code: depositData.billingInfo.countryCode || 'RW'
        }
      };

      console.log('Creating Pesapal checkout with request:', JSON.stringify(checkoutRequest, null, 2));

      // The PesapalService will automatically handle IPN registration
      const checkoutResponse = await this.pesapalService.createCheckout(checkoutRequest);

      // Update transaction with Pesapal order details
      await this.updateEscrowTransaction(escrowTransaction.id, {
        pesapalOrderId: checkoutResponse.merchant_reference,
        pesapalTrackingId: checkoutResponse.order_tracking_id
      });

      // Send deposit notification
      await this.sendDepositNotification(escrowTransaction, checkoutResponse.redirect_url);

      return {
        transaction: await this.getEscrowTransactionById(escrowTransaction.id),
        checkoutUrl: checkoutResponse.redirect_url
      };

    } catch (error: any) {
      console.error('Create deposit failed:', error);
      
      // Enhanced error handling with better error categorization
      let errorMessage = 'Failed to create deposit';
      let errorCode = 'DEPOSIT_CREATION_FAILED';
      
      if (error.message?.includes('IPN registration failed')) {
        errorMessage = 'Payment system configuration error. Please try again later.';
        errorCode = 'IPN_REGISTRATION_FAILED';
      } else if (error.message?.includes('authentication failed')) {
        errorMessage = 'Payment authentication failed. Please contact support.';
        errorCode = 'PAYMENT_AUTH_FAILED';
      } else if (error.response?.data?.error?.message) {
        errorMessage = `Payment Error: ${error.response.data.error.message}`;
        errorCode = 'PESAPAL_API_ERROR';
      } else if (error.response?.status) {
        errorMessage = `Payment service error (${error.response.status})`;
        errorCode = 'PAYMENT_SERVICE_ERROR';
        
        // Specific handling for common HTTP errors
        switch (error.response.status) {
          case 404:
            errorMessage = 'Payment service endpoint not found. Please contact support.';
            break;
          case 401:
            errorMessage = 'Payment authentication failed. Please contact support.';
            break;
          case 403:
            errorMessage = 'Payment access denied. Please contact support.';
            break;
          case 429:
            errorMessage = 'Too many payment requests. Please try again in a few minutes.';
            break;
          case 500:
          case 502:
          case 503:
            errorMessage = 'Payment service temporarily unavailable. Please try again later.';
            break;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      const enhancedError = new Error(errorMessage);
      (enhancedError as any).code = errorCode;
      (enhancedError as any).originalError = error;
      
      throw enhancedError;
    }
  }

  // === WEBHOOK HANDLING ===

  async handlePesapalWebhook(webhookData: PesapalWebhookData): Promise<void> {
    try {
      console.log('Processing Pesapal webhook:', webhookData);

      // Find transaction by tracking ID
      const transaction = await this.findTransactionByTrackingId(webhookData.OrderTrackingId);
      
      if (!transaction) {
        console.error('Transaction not found for tracking ID:', webhookData.OrderTrackingId);
        return;
      }

      // Get current status from Pesapal
      const statusResponse = await this.pesapalService.getTransactionStatus(webhookData.OrderTrackingId);
      
      const newStatus = this.pesapalService.mapPesapalStatusToEscrowStatus(statusResponse.status);

      // Update transaction status
      const updates: any = {
        status: newStatus as EscrowTransactionStatus
      };

      if (newStatus === 'HELD') {
        updates.heldAt = new Date();
        updates.readyAt = new Date(); // Ready for release
      } else if (newStatus === 'FAILED') {
        updates.failedAt = new Date();
        updates.failureReason = statusResponse.message || 'Payment failed';
      }

      await this.updateEscrowTransaction(transaction.id, updates);

      // Send status notification
      await this.sendStatusUpdateNotification(transaction, newStatus as EscrowTransactionStatus);

      console.log(`Transaction ${transaction.id} updated to status: ${newStatus}`);

    } catch (error: any) {
      console.error('Webhook processing failed:', error);
      throw error;
    }
  }

  // === RELEASE OPERATIONS ===

  async releaseEscrow(transactionId: string, releaseData: ReleaseEscrowDto): Promise<EscrowTransaction> {
    try {
      const transaction = await this.getEscrowTransactionById(transactionId);

      if (!transaction) {
        throw new Error('Transaction not found');
      }

      if (transaction.status !== 'READY' && transaction.status !== 'HELD') {
        throw new Error(`Cannot release transaction with status: ${transaction.status}`);
      }

      // Calculate split amounts
      const splitAmounts = this.calculateSplitAmounts(transaction.amount, transaction.splitRules);

      // Update wallets
      await this.updateWalletsOnRelease(transaction, splitAmounts);

      // Update transaction status
      const updatedTransaction = await this.updateEscrowTransaction(transactionId, {
        status: 'RELEASED',
        releasedAt: new Date(),
        splitAmounts
      });

      // Send release notifications
      await this.sendReleaseNotification(updatedTransaction);

      return updatedTransaction;

    } catch (error: any) {
      console.error('Release escrow failed:', error);
      throw new Error(error.message || 'Failed to release escrow');
    }
  }

  // === WITHDRAWAL OPERATIONS ===

  async createWithdrawal(userId: number, withdrawData: WithdrawDto): Promise<WithdrawalRequest> {
    try {
      // Check user wallet balance
      const wallet = await this.getUserWallet(userId);
      
      if (wallet.balance < withdrawData.amount) {
        throw new Error('Insufficient wallet balance');
      }

      // Validate withdrawal limits
      await this.validateEscrowLimits(userId, 'WITHDRAWAL', withdrawData.amount);

      // Validate destination
      await this.validateWithdrawalDestination(withdrawData);

      // Create withdrawal request
      const withdrawalRequest = await this.createWithdrawalRequest({
        userId,
        amount: withdrawData.amount,
        currency: wallet.currency,
        method: withdrawData.method,
        destination: withdrawData.destination,
        reference: withdrawData.reference,
        status: 'PENDING'
      });

      // Deduct from wallet (hold the amount)
      await this.updateWalletBalance(userId, -withdrawData.amount, 'WITHDRAWAL_HOLD', withdrawalRequest.id);

      // Create Pesapal payout request
      const payoutRequest = this.buildPayoutRequest(withdrawalRequest, withdrawData);
      const payoutResponse = await this.pesapalService.createPayout(payoutRequest);

      // Update withdrawal with Pesapal details
      const updatedWithdrawal = await this.updateWithdrawalRequest(withdrawalRequest.id, {
        status: 'PROCESSING',
        pesapalPayoutId: payoutResponse.requestId
      });

      // Send withdrawal notification
      await this.sendWithdrawalNotification(updatedWithdrawal);

      return updatedWithdrawal;

    } catch (error: any) {
      console.error('Create withdrawal failed:', error);
      throw new Error(error.message || 'Failed to create withdrawal');
    }
  }

  // === REFUND OPERATIONS ===

  async processRefund(refundData: RefundDto): Promise<EscrowTransaction> {
    try {
      const transaction = await this.getEscrowTransactionById(refundData.transactionId);

      if (!transaction) {
        throw new Error('Transaction not found');
      }

      if (!['HELD', 'READY'].includes(transaction.status)) {
        throw new Error(`Cannot refund transaction with status: ${transaction.status}`);
      }

      if (!transaction.pesapalTrackingId) {
        throw new Error('No Pesapal tracking ID found for refund');
      }

      const refundAmount = refundData.amount || transaction.amount;

      // Process refund with Pesapal
      await this.pesapalService.processRefund(
        transaction.pesapalTrackingId, 
        refundAmount
      );

      // Update transaction
      const updatedTransaction = await this.updateEscrowTransaction(refundData.transactionId, {
        status: 'REFUNDED',
        refundedAt: new Date(),
        failureReason: refundData.reason
      });

      // Send refund notification
      await this.sendRefundNotification(updatedTransaction, refundAmount);

      return updatedTransaction;

    } catch (error: any) {
      console.error('Process refund failed:', error);
      throw new Error(error.message || 'Failed to process refund');
    }
  }

  // === QUERY OPERATIONS ===

  async getEscrowTransactionById(id: string): Promise<EscrowTransaction> {
    const transaction = await prisma.escrowTransaction.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true }
        },
        recipient: {
          select: { id: true, email: true, firstName: true, lastName: true }
        }
      }
    });

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    return this.transformToEscrowTransaction(transaction);
  }

  async getUserEscrowTransactions(
    userId: number,
    status?: EscrowTransactionStatus,
    type?: EscrowTransactionType,
    page: number = 1,
    limit: number = 20
  ) {
    const skip = (page - 1) * limit;
    
    const whereClause: any = {
      OR: [
        { userId },
        { recipientId: userId }
      ]
    };

    if (status) {
      whereClause.status = status;
    }

    if (type) {
      whereClause.type = type;
    }

    const [transactions, total] = await Promise.all([
      prisma.escrowTransaction.findMany({
        where: whereClause,
        include: {
          user: {
            select: { id: true, email: true, firstName: true, lastName: true }
          },
          recipient: {
            select: { id: true, email: true, firstName: true, lastName: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.escrowTransaction.count({ where: whereClause })
    ]);

    return {
      transactions: transactions.map(t => this.transformToEscrowTransaction(t)),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async getUserWallet(userId: number): Promise<UserWallet> {
    let wallet = await prisma.wallet.findUnique({
      where: { userId }
    });

    if (!wallet) {
      wallet = await prisma.wallet.create({
        data: {
          userId,
          balance: 0,
          currency: 'RWF', // Default currency
          isActive: true
        }
      });
    }

    return {
      id: wallet.id,
      userId: wallet.userId,
      balance: wallet.balance,
      currency: wallet.currency,
      isActive: wallet.isActive,
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt
    };
  }

  // === PAYMENT SYSTEM HEALTH CHECK ===

  async checkPaymentSystemHealth(): Promise<{
    healthy: boolean;
    pesapalStatus: any;
    ipnStatus?: string;
    message?: string;
  }> {
    try {
      const pesapalHealth = await this.pesapalService.healthCheck();
      
      return {
        healthy: pesapalHealth.healthy,
        pesapalStatus: pesapalHealth,
        ipnStatus: pesapalHealth.ipnStatus,
        message: pesapalHealth.healthy 
          ? 'Payment system is operational' 
          : 'Payment system issues detected'
      };
    } catch (error: any) {
      return {
        healthy: false,
        pesapalStatus: { healthy: false, error: error.message },
        message: 'Payment system health check failed'
      };
    }
  }

  // === HELPER METHODS ===

  private async createEscrowTransaction(data: {
    guestId: number;
    hostId: number;
    agentId?: number;
    type: EscrowTransactionType;
    status: EscrowTransactionStatus;
    amount: number;
    currency: string;
    reference: string;
    description?: string;
    splitRules: SplitRules;
    billingInfo?: any;
  }): Promise<EscrowTransaction> {
    const transaction = await prisma.escrowTransaction.create({
      data: {
        userId: data.guestId,
        recipientId: data.hostId,
        type: data.type,
        status: data.status,
        amount: data.amount,
        currency: data.currency,
        reference: data.reference,
        description: data.description,
        isP2P: false,
        metadata: JSON.stringify({
          splitRules: data.splitRules,
          agentId: data.agentId,
          billingInfo: data.billingInfo
        })
      }
    });

    return this.transformToEscrowTransaction(transaction);
  }

  private async updateEscrowTransaction(id: string, updates: any): Promise<EscrowTransaction> {
    const transaction = await prisma.escrowTransaction.update({
      where: { id },
      data: {
        ...updates,
        updatedAt: new Date()
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

    return this.transformToEscrowTransaction(transaction);
  }

  private validateSplitRules(rules: SplitRules): void {
    const total = rules.host + rules.agent + rules.platform;
    
    if (Math.abs(total - 100) > 0.01) {
      throw new Error('Split rules must total 100%');
    }

    if (rules.host < 0 || rules.agent < 0 || rules.platform < 0) {
      throw new Error('Split percentages must be positive');
    }
  }

  private calculateSplitAmounts(amount: number, rules: SplitRules) {
    return {
      host: Math.round((amount * rules.host / 100) * 100) / 100,
      agent: Math.round((amount * rules.agent / 100) * 100) / 100,
      platform: Math.round((amount * rules.platform / 100) * 100) / 100
    };
  }

  private async updateWalletsOnRelease(transaction: EscrowTransaction, splitAmounts: any): Promise<void> {
    const metadata = JSON.parse(transaction.metadata || '{}');
    
    // Update host wallet
    await this.updateWalletBalance(
      transaction.hostId, 
      splitAmounts.host, 
      'ESCROW_RELEASE', 
      transaction.reference
    );

    // Update agent wallet if exists
    if (metadata.agentId && splitAmounts.agent > 0) {
      await this.updateWalletBalance(
        metadata.agentId, 
        splitAmounts.agent, 
        'ESCROW_RELEASE', 
        transaction.reference
      );
    }

    // Platform fee goes to platform wallet (user ID 1 or dedicated platform account)
    if (splitAmounts.platform > 0) {
      await this.updateWalletBalance(
        1, // Platform user ID
        splitAmounts.platform, 
        'PLATFORM_FEE', 
        transaction.reference
      );
    }
  }

  private async updateWalletBalance(
    userId: number, 
    amount: number, 
    type: string, 
    reference: string
  ): Promise<void> {
    const wallet = await this.getUserWallet(userId);
    const newBalance = wallet.balance + amount;

    await prisma.wallet.update({
      where: { userId },
      data: { balance: newBalance }
    });

    // Create wallet transaction record
    await prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: amount > 0 ? 'credit' : 'debit',
        amount: Math.abs(amount),
        balanceBefore: wallet.balance,
        balanceAfter: newBalance,
        reference,
        description: `${type} - ${reference}`
      }
    });
  }

  private async validateEscrowLimits(
    userId: number, 
    type: EscrowTransactionType, 
    amount: number
  ): Promise<void> {
    // Implementation would check user-specific limits
    // For now, basic validation
    if (amount < 100) { // Min 100 RWF
      throw new Error('Minimum amount is 100 RWF');
    }

    if (amount > 1000000) { // Max 1M RWF
      throw new Error('Maximum amount is 1,000,000 RWF');
    }
  }

  private async validateWithdrawalDestination(withdrawData: WithdrawDto): Promise<void> {
    if (withdrawData.method === 'MOBILE') {
      const validation = this.pesapalService.validateMobileNumber(
        withdrawData.destination.accountNumber,
        withdrawData.destination.countryCode
      );
      
      if (!validation.isValid) {
        throw new Error(validation.errors?.[0] || 'Invalid mobile number');
      }
    } else if (withdrawData.method === 'BANK') {
      const validation = this.pesapalService.validateBankAccount(
        withdrawData.destination.accountNumber,
        withdrawData.destination.bankCode || ''
      );
      
      if (!validation.isValid) {
        throw new Error(validation.errors?.[0] || 'Invalid bank account');
      }
    }
  }

  private buildPayoutRequest(withdrawal: WithdrawalRequest, withdrawData: WithdrawDto): PesapalPayoutRequest {
    const destinationType = withdrawData.method;
    
    const request: PesapalPayoutRequest = {
      source_type: 'MERCHANT',
      source: {
        account_number: process.env.PESAPAL_MERCHANT_ACCOUNT!
      },
      destination_type: destinationType,
      destination: {
        type: destinationType,
        country_code: withdrawData.destination.countryCode || 'RW',
        holder_name: withdrawData.destination.holderName,
        account_number: withdrawData.destination.accountNumber
      },
      transfer_details: {
        amount: this.pesapalService.formatAmount(withdrawData.amount),
        currency_code: withdrawal.currency,
        date: new Date().toISOString().split('T')[0],
        particulars: withdrawData.particulars || 'Wallet withdrawal',
        reference: withdrawData.reference
      }
    };

    if (destinationType === 'MOBILE' && withdrawData.destination.mobileProvider) {
      request.destination.mobile_provider = withdrawData.destination.mobileProvider;
    }

    if (destinationType === 'BANK' && withdrawData.destination.bankCode) {
      request.destination.bank_code = withdrawData.destination.bankCode;
    }

    return request;
  }

  private async createWithdrawalRequest(data: any): Promise<WithdrawalRequest | any> {
    const withdrawal: any = await prisma.withdrawalRequest.create({
      data: {
        userId: data.userId,
        amount: data.amount,
        currency: data.currency,
        method: data.method,
        destination: JSON.stringify(data.destination),
        status: data.status,
        reference: data.reference
      }
    });

    return {
      id: withdrawal.id,
      userId: withdrawal.userId,
      amount: withdrawal.amount,
      currency: withdrawal.currency,
      method: withdrawal.method as PayoutMethod,
      destination: JSON.parse(withdrawal.destination),
      status: withdrawal.status as any,
      pesapalPayoutId: withdrawal.pesapalPayoutId,
      reference: withdrawal.reference,
      failureReason: withdrawal.failureReason,
      createdAt: withdrawal.createdAt,
      updatedAt: withdrawal.updatedAt,
      completedAt: withdrawal.completedAt
    };
  }

  private async updateWithdrawalRequest(id: string, updates: any): Promise<WithdrawalRequest> {
    const withdrawal: any = await prisma.withdrawalRequest.update({
      where: { id },
      data: {
        ...updates,
        updatedAt: new Date()
      }
    });

    return {
      id: withdrawal.id,
      userId: withdrawal.userId,
      amount: withdrawal.amount,
      currency: withdrawal.currency,
      method: withdrawal.method as PayoutMethod,
      destination: JSON.parse(withdrawal.destination),
      status: withdrawal.status as any,
      pesapalPayoutId: withdrawal.pesapalPayoutId,
      reference: withdrawal.reference,
      failureReason: withdrawal.failureReason,
      createdAt: withdrawal.createdAt,
      updatedAt: withdrawal.updatedAt,
      completedAt: withdrawal.completedAt
    };
  }

  private async getUserById(id: number): Promise<EscrowParticipant> {
    const user: any = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true
      }
    });

    if (!user) {
      throw new Error(`User with ID ${id} not found`);
    }

    return {
      id: user.id,
      role: 'GUEST', // Default role, would be determined by context
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone
    };
  }

  private async findTransactionByTrackingId(trackingId: string): Promise<EscrowTransaction | null> {
    const transaction = await prisma.escrowTransaction.findFirst({
      where: { externalId: trackingId },
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true }
        },
        recipient: {
          select: { id: true, email: true, firstName: true, lastName: true }
        }
      }
    });

    return transaction ? this.transformToEscrowTransaction(transaction) : null;
  }

  private transformToEscrowTransaction(transaction: any): EscrowTransaction {
    const metadata = JSON.parse(transaction.metadata || '{}');
    
    return {
      id: transaction.id,
      guestId: transaction.userId,
      hostId: transaction.recipientId || 0,
      agentId: metadata.agentId,
      type: transaction.type as EscrowTransactionType,
      status: transaction.status as EscrowTransactionStatus,
      amount: transaction.amount,
      currency: transaction.currency,
      reference: transaction.reference,
      description: transaction.description,
      pesapalOrderId: transaction.escrowId,
      pesapalTrackingId: transaction.externalId,
      pesapalPayoutId: transaction.jengaTransactionId, // Reusing field
      splitRules: metadata.splitRules || { host: 70, agent: 20, platform: 10 },
      splitAmounts: metadata.splitAmounts,
      heldAt: transaction.fundedAt,
      readyAt: transaction.fundedAt,
      releasedAt: transaction.releasedAt,
      refundedAt: transaction.refundedAt,
      failedAt: transaction.resolvedAt, // Reusing field
      billingInfo: metadata.billingInfo,
      failureReason: transaction.disputeReason,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
      guest: transaction.user ? {
        id: transaction.user.id,
        role: 'GUEST',
        email: transaction.user.email,
        firstName: transaction.user.firstName,
        lastName: transaction.user.lastName
      } : undefined,
      host: transaction.recipient ? {
        id: transaction.recipient.id,
        role: 'HOST',
        email: transaction.recipient.email,
        firstName: transaction.recipient.firstName,
        lastName: transaction.recipient.lastName
      } : undefined
    };
  }

  // === NOTIFICATION METHODS ===

  private async sendDepositNotification(transaction: EscrowTransaction, checkoutUrl: string): Promise<void> {
    try {
      if (transaction.guest) {
        await this.emailService.sendDepositCreatedEmail({
          user: transaction.guest,
          transaction,
          checkoutUrl
        });
      }
    } catch (error) {
      console.error('Failed to send deposit notification:', error);
    }
  }

  private async sendStatusUpdateNotification(transaction: EscrowTransaction, status: EscrowTransactionStatus): Promise<void> {
    try {
      if (transaction.guest) {
        await this.emailService.sendTransactionStatusEmail({
          user: transaction.guest,
          transaction,
          status
        });
      }
    } catch (error) {
      console.error('Failed to send status update notification:', error);
    }
  }

  private async sendReleaseNotification(transaction: EscrowTransaction): Promise<void> {
    try {
      // Notify host
      if (transaction.host) {
        await this.emailService.sendFundsReleasedEmail({
          user: transaction.host,
          transaction
        });
      }
    } catch (error) {
      console.error('Failed to send release notification:', error);
    }
  }

  private async sendWithdrawalNotification(withdrawal: WithdrawalRequest): Promise<void> {
    try {
      const user = await this.getUserById(withdrawal.userId);
      await this.emailService.sendWithdrawalRequestEmail({
        user,
        withdrawal
      });
    } catch (error) {
      console.error('Failed to send withdrawal notification:', error);
    }
  }

  private async sendRefundNotification(transaction: EscrowTransaction, amount: number): Promise<void> {
    try {
      if (transaction.guest) {
        await this.emailService.sendRefundProcessedEmail({
          user: transaction.guest,
          transaction,
          refundAmount: amount
        });
      }
    } catch (error) {
      console.error('Failed to send refund notification:', error);
    }
  }
}