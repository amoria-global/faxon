// services/escrow.service.ts
import { PrismaClient } from '@prisma/client';
import { PesapalService } from './pesapal.service';
import { PhoneUtils } from '../utils/phone.utils';
import { logger } from '../utils/logger';
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
  PayoutMethod
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

  // ==================== HELPER METHOD FOR TYPE CONVERSION ====================
  
  private parseUserId(userId: number | string | any): number {
    const idNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    
    if (isNaN(idNum) || idNum <= 0) {
      throw new Error('Invalid user ID format '+userId);
    }
    
    return idNum;
  }

  // ==================== BOOKING PAYMENT OPERATIONS (SECURE SERVER-SIDE) ====================

  /**
   * Create a secure Pesapal payment for a booking
   * All sensitive data is calculated and validated server-side
   * Client only provides bookingId
   * @param bookingId - The booking ID
   * @param userId - Authenticated user ID from session
   * @returns Payment transaction, checkout URL, and booking details
   */
  async createBookingPayment(bookingId: string, userId: number | string): Promise<{
    transaction: EscrowTransaction;
    checkoutUrl: string;
    bookingDetails: any;
    splitBreakdown: any;
  }> {
    try {
      const userIdNum = this.parseUserId(userId);

      logger.info('Creating booking payment (server-side)', 'EscrowService', { bookingId, userId: userIdNum });

      // 1. Fetch booking with all related data (server-side validation)
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        include: {
          property: {
            include: {
              host: {
                select: {
                  id: true,
                  email: true,
                  firstName: true,
                  lastName: true,
                  phone: true
                }
              },
              agent: {
                select: {
                  id: true,
                  email: true,
                  firstName: true,
                  lastName: true
                }
              }
            }
          },
          guest: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              phone: true,
              country: true
            }
          }
        }
      });

      // 2. Validate booking exists
      if (!booking) {
        throw new Error(`Booking not found: ${bookingId}`);
      }

      // 3. Validate user is the booking guest (authorization check)
      if (booking.guestId !== userIdNum) {
        throw new Error('Unauthorized: You are not the guest for this booking');
      }

      // 4. Validate property has a host
      if (!booking.property.host) {
        throw new Error('Property does not have a host assigned');
      }

      // 5. Validate booking status
      if (booking.status === 'cancelled') {
        throw new Error('Cannot pay for a cancelled booking');
      }

      if (booking.paymentStatus === 'completed') {
        throw new Error('Booking has already been paid');
      }

      // 6. Calculate split rules (server-controlled, based on agent existence)
      const hasAgent = booking.property.agent !== null;
      const splitRules = this.calculateBookingSplitRules(hasAgent);

      // 7. Validate platform commission is exactly 14%
      this.validatePlatformCommission(splitRules);

      // 8. Calculate split amounts in actual currency
      const splitAmounts = this.calculateSplitAmounts(booking.totalPrice, splitRules);

      // 9. Build billing info from authenticated user session (not from client)
      const billingInfo = {
        email: booking.guest.email,
        phone: booking.guest.phone || '+250788000000',
        firstName: booking.guest.firstName || 'Guest',
        lastName: booking.guest.lastName || 'User',
        countryCode: booking.guest.country || 'RW'
      };

      // 10. Create deposit payload (all values are server-controlled)
      const depositData: CreateDepositDto = {
        amount: booking.totalPrice,
        currency: 'RWF',
        reference: `BOOKING-${booking.id}-${Date.now()}`,
        description: `Payment for ${booking.property.name} (${new Date(booking.checkIn).toLocaleDateString()} - ${new Date(booking.checkOut).toLocaleDateString()})`,
        hostId: booking.property.host.id,
        agentId: booking.property.agent?.id,
        splitRules,
        billingInfo
      };

      logger.info('Booking payment payload prepared', 'EscrowService', {
        bookingId,
        amount: depositData.amount,
        splitRules,
        splitAmounts,
        hostId: depositData.hostId,
        agentId: depositData.agentId
      });

      // 11. Create escrow deposit using existing method
      const result = await this.createDeposit(userIdNum, depositData);

      // 12. Update booking with transaction reference
      await prisma.booking.update({
        where: { id: bookingId },
        data: {
          transactionId: result.transaction.reference,
          paymentMethod: 'pesapal',
          paymentStatus: 'pending'
        }
      });

      logger.info('Booking payment created successfully', 'EscrowService', {
        bookingId,
        transactionId: result.transaction.id,
        reference: result.transaction.reference
      });

      return {
        transaction: result.transaction,
        checkoutUrl: result.checkoutUrl,
        bookingDetails: {
          id: booking.id,
          propertyName: booking.property.name,
          totalPrice: booking.totalPrice,
          checkIn: booking.checkIn,
          checkOut: booking.checkOut
        },
        splitBreakdown: splitAmounts
      };

    } catch (error: any) {
      logger.error('Booking payment creation failed', 'EscrowService', error);
      throw this.handleError(error, 'BOOKING_PAYMENT_FAILED');
    }
  }

  /**
   * Calculate split rules for booking payments
   * Platform always gets 14% commission
   * @param hasAgent - Whether the property has an agent
   * @returns Split rules object
   */
  private calculateBookingSplitRules(hasAgent: boolean): SplitRules {
    const PLATFORM_COMMISSION = 14; // Fixed at 14%

    if (hasAgent) {
      // With agent: Platform 14%, Agent 7%, Host 79%
      return {
        platform: PLATFORM_COMMISSION,
        agent: 7,
        host: 79
      };
    } else {
      // Without agent: Platform 14%, Agent 0%, Host 86%
      return {
        platform: PLATFORM_COMMISSION,
        agent: 0,
        host: 86
      };
    }
  }

  /**
   * Validates that platform commission is exactly 14%
   * Throws error if validation fails
   * @param splitRules - The split rules to validate
   */
  private validatePlatformCommission(splitRules: SplitRules): void {
    const REQUIRED_PLATFORM_COMMISSION = 14;

    if (splitRules.platform !== REQUIRED_PLATFORM_COMMISSION) {
      const errorMsg = `CRITICAL: Platform commission must be exactly ${REQUIRED_PLATFORM_COMMISSION}%. Current: ${splitRules.platform}%`;
      logger.error('Platform commission validation failed', 'EscrowService', {
        required: REQUIRED_PLATFORM_COMMISSION,
        actual: splitRules.platform,
        splitRules
      });
      throw new Error(errorMsg);
    }

    logger.info('Platform commission validated ✓', 'EscrowService', {
      platformCommission: splitRules.platform,
      splitRules
    });
  }

  /**
   * Get booking payment status
   * @param bookingId - The booking ID
   * @param userId - Authenticated user ID
   * @returns Payment status information
   */
  async getBookingPaymentStatus(bookingId: string, userId: number | string) {
    try {
      const userIdNum = this.parseUserId(userId);

      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        include: {
          guest: {
            select: { id: true }
          }
        }
      });

      if (!booking) {
        throw new Error(`Booking not found: ${bookingId}`);
      }

      if (booking.guestId !== userIdNum) {
        throw new Error('Unauthorized: You are not the guest for this booking');
      }

      if (!booking.transactionId) {
        return {
          bookingId,
          paymentStatus: booking.paymentStatus,
          hasTransaction: false
        };
      }

      // Fetch escrow transaction
      const transaction = await prisma.escrowTransaction.findFirst({
        where: { reference: booking.transactionId }
      });

      return {
        bookingId,
        paymentStatus: booking.paymentStatus,
        hasTransaction: true,
        transaction: transaction ? {
          id: transaction.id,
          reference: transaction.reference,
          status: transaction.status,
          amount: transaction.amount,
          currency: transaction.currency,
          createdAt: transaction.createdAt,
          fundedAt: transaction.fundedAt
        } : null
      };

    } catch (error: any) {
      logger.error('Failed to get booking payment status', 'EscrowService', error);
      throw this.handleError(error, 'GET_BOOKING_STATUS_FAILED');
    }
  }

  // ==================== DEPOSIT OPERATIONS ====================

  async createDeposit(guestId: number | string, depositData: CreateDepositDto): Promise<{
    transaction: EscrowTransaction;
    checkoutUrl: string;
  }> {
    try {
      const guestIdNum = this.parseUserId(guestId);
      
      logger.info('Creating deposit', 'EscrowService', { userId: guestIdNum, amount: depositData.amount });

      // Validate users exist
      const [guest, host, agent] = await Promise.all([
        this.getUserById(guestIdNum),
        this.getUserById(depositData.hostId),
        depositData.agentId ? this.getUserById(depositData.agentId) : null
      ]);

      // Validate deposit amount
      this.validateAmount(depositData.amount, depositData.currency);

      // Validate split rules
      this.validateSplitRules(depositData.splitRules);

      // Create escrow transaction in database
      // Use provided reference or generate a new one
      const merchantReference = depositData.reference || this.pesapalService.generateMerchantReference('DEP');
      
      const escrowTransaction = await prisma.escrowTransaction.create({
        data: {
          userId: guestIdNum,
          recipientId: depositData.hostId,
          type: 'DEPOSIT',
          status: 'PENDING',
          amount: depositData.amount,
          currency: depositData.currency,
          reference: merchantReference,
          description: depositData.description || `Deposit ${merchantReference}`,
          isP2P: false,
          metadata: JSON.stringify({
            splitRules: depositData.splitRules,
            agentId: depositData.agentId,
            billingInfo: depositData.billingInfo
          })
        },
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
          recipient: { select: { id: true, email: true, firstName: true, lastName: true } }
        }
      });


      // Create Pesapal checkout
      const checkoutRequest: PesapalCheckoutRequest = {
        id: merchantReference,
        currency: depositData.currency,
        amount: depositData.amount,
        description: depositData.description || `Payment for ${merchantReference}`,
        callback_url: config.pesapal.callbackUrl,
        billing_address: {
          email_address: depositData.billingInfo.email,
          phone_number: depositData.billingInfo.phone,
          first_name: depositData.billingInfo.firstName,
          last_name: depositData.billingInfo.lastName,
          country_code: depositData.billingInfo.countryCode || 'RW'
        }
      };

      const checkoutResponse = await this.pesapalService.createCheckout(checkoutRequest);

      // Update transaction with Pesapal details
      await prisma.escrowTransaction.update({
        where: { id: escrowTransaction.id },
        data: {
          escrowId: checkoutResponse.merchant_reference,
          externalId: checkoutResponse.order_tracking_id,
          paymentUrl: checkoutResponse.redirect_url
        }
      });

      logger.info('Deposit created successfully', 'EscrowService', {
        transactionId: escrowTransaction.id,
        reference: merchantReference
      });

      // Send notification
      await this.sendDepositNotification(
        this.transformToEscrowTransaction(escrowTransaction),
        checkoutResponse.redirect_url
      );

      return {
        transaction: this.transformToEscrowTransaction({
          ...escrowTransaction,
          escrowId: checkoutResponse.merchant_reference,
          externalId: checkoutResponse.order_tracking_id,
          paymentUrl: checkoutResponse.redirect_url
        }),
        checkoutUrl: checkoutResponse.redirect_url
      };

    } catch (error: any) {
      logger.error('Deposit creation failed', 'EscrowService', error);
      throw this.handleError(error, 'CREATE_DEPOSIT_FAILED');
    }
  }

  // ==================== WEBHOOK HANDLING ====================

  async handlePesapalWebhook(webhookData: PesapalWebhookData): Promise<void> {
    try {
      logger.debug('Processing webhook', 'EscrowService', { trackingId: webhookData.OrderTrackingId });

      // Find transaction by tracking ID OR by reference
      let transaction = await prisma.escrowTransaction.findFirst({
        where: { externalId: webhookData.OrderTrackingId },
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
          recipient: { select: { id: true, email: true, firstName: true, lastName: true } }
        }
      });

      // If not found by tracking ID, try by merchant reference
      if (!transaction) {
        console.log('[ESCROW] Transaction not found by tracking ID, trying by reference...');
        transaction = await prisma.escrowTransaction.findFirst({
          where: { reference: webhookData.OrderMerchantReference },
          include: {
            user: { select: { id: true, email: true, firstName: true, lastName: true } },
            recipient: { select: { id: true, email: true, firstName: true, lastName: true } }
          }
        });
      }
      
      if (!transaction) {
        const error = `Transaction not found for tracking ID: ${webhookData.OrderTrackingId} or reference: ${webhookData.OrderMerchantReference}`;
        logger.error('Transaction not found', 'EscrowService', error);
        throw new Error(error);
      }

      // Get current status from Pesapal
      const statusResponse: any = await this.pesapalService.getTransactionStatus(
        webhookData.OrderTrackingId
      );

      // Map Pesapal status to escrow status using the FIXED mapper
      const newStatus = this.pesapalService.mapPesapalStatusToEscrowStatus(
        statusResponse
      ) as EscrowTransactionStatus;

      console.log(`[ESCROW] Status mapping: ${transaction.status} → ${newStatus}`);

      // Only update if status has actually changed
      if (newStatus === transaction.status) {
        console.log('[ESCROW] Status unchanged, skipping update');
        return;
      }

      // Prepare update data
      const updates: any = {
        status: newStatus,
        updatedAt: new Date()
      };

      // Update specific timestamp fields based on new status
      if (newStatus === 'HELD') {
        updates.fundedAt = new Date();
        console.log('[ESCROW] ✅ Payment completed - funds now in escrow');
      } else if (newStatus === 'FAILED') {
        updates.cancelledAt = new Date();
        updates.cancellationReason = statusResponse.description || 
                                      statusResponse.payment_status_description || 
                                      'Payment failed';
        console.log('[ESCROW] ❌ Payment failed:', updates.cancellationReason);
      } else if (newStatus === 'REFUNDED') {
        updates.refundedAt = new Date();
        updates.cancellationReason = statusResponse.description || 'Payment refunded';
        console.log('[ESCROW] 💰 Payment refunded');
      }

      // Ensure we have the tracking ID stored
      if (!transaction.externalId && webhookData.OrderTrackingId) {
        updates.externalId = webhookData.OrderTrackingId;
        console.log('[ESCROW] Setting tracking ID:', webhookData.OrderTrackingId);
      }

      // Update transaction status in database
      console.log('[ESCROW] Updating transaction in database...');
      await prisma.escrowTransaction.update({
        where: { id: transaction.id },
        data: updates
      });

      // Transaction updated

      // Update booking status if this is a booking payment
      await this.updateBookingPaymentStatus(transaction.reference, newStatus);

      // Send status notification (non-blocking)
      this.sendStatusUpdateNotification(
        this.transformToEscrowTransaction({ ...transaction, ...updates }),
        newStatus
      ).catch(err => {
        logger.error('Failed to send notification', 'EscrowService', err);
      });

    } catch (error: any) {
      logger.error('Webhook processing failed', 'EscrowService', {
        message: error.message,
        trackingId: webhookData.OrderTrackingId
      });
      throw error;
    }
  }

  // ==================== RELEASE OPERATIONS ====================

  async releaseEscrow(
    transactionId: string, 
    releaseData: ReleaseEscrowDto,
    releasedBy?: number | string
  ): Promise<EscrowTransaction> {
    try {
      console.log(`[ESCROW] Releasing escrow: ${transactionId}`);

      const transaction: any = await prisma.escrowTransaction.findUnique({
        where: { id: transactionId },
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
          recipient: { select: { id: true, email: true, firstName: true, lastName: true } }
        }
      });

      if (!transaction) {
        throw new Error('Transaction not found');
      }

      if (transaction.status !== 'HELD') {
        throw new Error(
          `Cannot release transaction with status: ${transaction.status}. Transaction must be in HELD status.`
        );
      }

      const metadata = JSON.parse(transaction.metadata || '{}');
      const splitRules = metadata.splitRules || config.escrow.defaultSplitRules;

      // Calculate split amounts
      const splitAmounts = this.calculateSplitAmounts(transaction.amount, splitRules);

      console.log('[ESCROW] Split amounts:', splitAmounts);

      // Update wallets
      await this.updateWalletsOnRelease(transaction, splitAmounts);

      // Convert releasedBy to number if provided
      const releasedByNum = releasedBy ? this.parseUserId(releasedBy) : transaction.userId;

      // Update transaction
      const updatedTransaction = await prisma.escrowTransaction.update({
        where: { id: transactionId },
        data: {
          status: 'RELEASED',
          releasedAt: new Date(),
          releasedBy: releasedByNum,
          releaseReason: releaseData.releaseReason,
          metadata: JSON.stringify({
            ...metadata,
            splitAmounts
          })
        },
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
          recipient: { select: { id: true, email: true, firstName: true, lastName: true } }
        }
      });

      console.log(`[ESCROW] ✅ Escrow released successfully: ${transactionId}`);

      // Send notification
      await this.sendReleaseNotification(
        this.transformToEscrowTransaction(updatedTransaction)
      );

      return this.transformToEscrowTransaction(updatedTransaction);

    } catch (error: any) {
      logger.error('Release failed', 'EscrowService', error);
      throw this.handleError(error, 'RELEASE_FAILED');
    }
  }

  // ==================== WITHDRAWAL OPERATIONS ====================

  async createWithdrawal(userId: number | string, withdrawData: WithdrawDto): Promise<WithdrawalRequest> {
    try {
      const userIdNum = this.parseUserId(userId);
      
      console.log(`[ESCROW] Creating withdrawal for user ${userIdNum}`, {
        amount: withdrawData.amount,
        method: withdrawData.method
      });

      // Check wallet balance
      const wallet = await this.getUserWallet(userIdNum);
      
      if (wallet.balance < withdrawData.amount) {
        throw new Error(
          `Insufficient balance. Available: ${wallet.balance} ${wallet.currency}, Requested: ${withdrawData.amount}`
        );
      }

      // Validate destination
      await this.validateWithdrawalDestination(withdrawData);

      // ✅ Generate unique reference server-side
      const withdrawalReference = this.pesapalService.generateMerchantReference('WTD');

      // Create withdrawal request
      const withdrawal = await prisma.withdrawalRequest.create({
        data: {
          userId: userIdNum,
          amount: withdrawData.amount,
          currency: wallet.currency,
          method: withdrawData.method,
          destination: JSON.stringify(withdrawData.destination),
          status: 'PENDING',
          reference: withdrawalReference  // ✅ Use generated reference
        }
      });


      // Deduct from wallet (hold amount)
      await this.updateWalletBalance(
        userIdNum,
        -withdrawData.amount,
        'WITHDRAWAL_HOLD',
        withdrawal.id
      );

      // Create Pesapal payout
      const payoutRequest = this.buildPayoutRequest(withdrawal, withdrawData);
      const payoutResponse = await this.pesapalService.createPayout(payoutRequest);

      // Update withdrawal with Pesapal details
      const updatedWithdrawal = await prisma.withdrawalRequest.update({
        where: { id: withdrawal.id },
        data: {
          status: 'PROCESSING',
          pesapalPayoutId: payoutResponse.requestId
        }
      });

      console.log(`[ESCROW] ✅ Withdrawal created: ${withdrawal.id}`);

      // Send notification
      await this.sendWithdrawalNotification(
        this.transformWithdrawalRequest(updatedWithdrawal)
      );

      return this.transformWithdrawalRequest(updatedWithdrawal);

    } catch (error: any) {
      logger.error('Withdrawal creation failed', 'EscrowService', error);
      throw this.handleError(error, 'WITHDRAWAL_FAILED');
    }
  }

  // ==================== REFUND OPERATIONS ====================

  async processRefund(refundData: RefundDto): Promise<EscrowTransaction> {
    try {
      console.log(`[ESCROW] Processing refund for: ${refundData.transactionId}`);

      const transaction = await prisma.escrowTransaction.findUnique({
        where: { id: refundData.transactionId },
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
          recipient: { select: { id: true, email: true, firstName: true, lastName: true } }
        }
      });

      if (!transaction) {
        throw new Error('Transaction not found');
      }

      if (!['HELD', 'PENDING'].includes(transaction.status)) {
        throw new Error(
          `Cannot refund transaction with status: ${transaction.status}. Only HELD or PENDING transactions can be refunded.`
        );
      }

      if (!transaction.externalId) {
        throw new Error('No Pesapal tracking ID found for refund');
      }

      const refundAmount = refundData.amount || transaction.amount;

      // Process refund with Pesapal
      await this.pesapalService.processRefund(
        transaction.externalId,
        refundAmount
      );

      // Update transaction
      const updatedTransaction = await prisma.escrowTransaction.update({
        where: { id: refundData.transactionId },
        data: {
          status: 'REFUNDED',
          refundedAt: new Date(),
          cancellationReason: refundData.reason
        },
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
          recipient: { select: { id: true, email: true, firstName: true, lastName: true } }
        }
      });

      console.log(`[ESCROW] ✅ Refund processed: ${refundData.transactionId}`);

      // Send notification
      await this.sendRefundNotification(
        this.transformToEscrowTransaction(updatedTransaction),
        refundAmount
      );

      return this.transformToEscrowTransaction(updatedTransaction);

    } catch (error: any) {
      logger.error('Refund processing failed', 'EscrowService', error);
      throw this.handleError(error, 'REFUND_FAILED');
    }
  }

  // ==================== QUERY OPERATIONS ====================

  async getEscrowTransactionById(id: string): Promise<EscrowTransaction> {
    const transaction = await prisma.escrowTransaction.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        recipient: { select: { id: true, email: true, firstName: true, lastName: true } }
      }
    });

    if (!transaction) {
      throw new Error(`Transaction not found: ${id}`);
    }

    return this.transformToEscrowTransaction(transaction);
  }

  async getUserEscrowTransactions(
    userId: number | string,
    options: {
      status?: EscrowTransactionStatus;
      type?: EscrowTransactionType;
      page?: number;
      limit?: number;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ) {
    const userIdNum = this.parseUserId(userId);
    const { status, type, page = 1, limit = 20, startDate, endDate } = options;
    const skip = (page - 1) * limit;
    
    const whereClause: any = {
      OR: [
        { userId: userIdNum },
        { recipientId: userIdNum }
      ]
    };

    if (status) whereClause.status = status;
    if (type) whereClause.type = type;
    
    if (startDate || endDate) {
      whereClause.createdAt = {};
      if (startDate) whereClause.createdAt.gte = startDate;
      if (endDate) whereClause.createdAt.lte = endDate;
    }

    const [transactions, total] = await Promise.all([
      prisma.escrowTransaction.findMany({
        where: whereClause,
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
          recipient: { select: { id: true, email: true, firstName: true, lastName: true } }
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

  async getUserWallet(userId: number | string): Promise<UserWallet> {
    const userIdNum = this.parseUserId(userId);
    
    let wallet = await prisma.wallet.findUnique({
      where: { userId: userIdNum }
    });

    if (!wallet) {
      wallet = await prisma.wallet.create({
        data: {
          userId: userIdNum,
          balance: 0,
          currency: config.escrow.defaultCurrency,
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

  // ==================== ADMIN OPERATIONS ====================

  async getAllTransactions(options: {
    status?: EscrowTransactionStatus;
    type?: EscrowTransactionType;
    page?: number;
    limit?: number;
    search?: string;
  } = {}) {
    const { status, type, page = 1, limit = 50, search } = options;
    const skip = (page - 1) * limit;
    
    const whereClause: any = {};
    if (status) whereClause.status = status;
    if (type) whereClause.type = type;
    
    if (search) {
      whereClause.OR = [
        { reference: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { user: { email: { contains: search, mode: 'insensitive' } } }
      ];
    }

    const [transactions, total] = await Promise.all([
      prisma.escrowTransaction.findMany({
        where: whereClause,
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
          recipient: { select: { id: true, email: true, firstName: true, lastName: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.escrowTransaction.count({ where: whereClause })
    ]);

    return {
      transactions: transactions.map(t => this.transformToEscrowTransaction(t)),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
    };
  }

  async getTransactionStats(userId?: number | string) {
    const whereClause: any = userId ? {
      OR: [
        { userId: this.parseUserId(userId) }, 
        { recipientId: this.parseUserId(userId) }
      ]
    } : {};

    const [totalTransactions, totalVolume, statusBreakdown] = await Promise.all([
      prisma.escrowTransaction.count({ where: whereClause }),
      prisma.escrowTransaction.aggregate({
        where: whereClause,
        _sum: { amount: true }
      }),
      prisma.escrowTransaction.groupBy({
        by: ['status'],
        where: whereClause,
        _count: true
      })
    ]);

    return {
      totalTransactions,
      totalVolume: totalVolume._sum.amount || 0,
      byStatus: statusBreakdown.reduce((acc, item) => {
        acc[item.status] = item._count;
        return acc;
      }, {} as Record<string, number>)
    };
  }

  // ==================== HELPER METHODS ====================

  /**
   * Update booking payment status when escrow transaction status changes
   * @param transactionReference - The transaction reference (links to booking.transactionId)
   * @param escrowStatus - The new escrow transaction status
   */
  private async updateBookingPaymentStatus(
    transactionReference: string,
    escrowStatus: EscrowTransactionStatus
  ): Promise<void> {
    try {
      // Check if this is a booking payment (reference starts with "BOOKING-")
      if (!transactionReference.startsWith('BOOKING-')) {
        return; // Not a booking payment, skip
      }

      // Find booking by transaction reference
      const booking = await prisma.booking.findFirst({
        where: { transactionId: transactionReference }
      });

      if (!booking) {
        logger.warn('Booking not found for transaction', 'EscrowService', { transactionReference });
        return;
      }

      // Fetch full booking details with property and guest info for notifications
      const fullBooking = await prisma.booking.findUnique({
        where: { id: booking.id },
        include: {
          property: { select: { name: true } },
          guest: { select: { email: true, firstName: true, lastName: true } }
        }
      });

      if (!fullBooking) return;

      // Map escrow status to booking payment status
      let bookingPaymentStatus = booking.paymentStatus;
      let bookingStatus = booking.status;

      if (escrowStatus === 'HELD') {
        bookingPaymentStatus = 'completed';
        // Also confirm booking if it was pending
        if (bookingStatus === 'pending') {
          bookingStatus = 'confirmed';
        }
        logger.info('Payment completed - booking confirmed', 'EscrowService', {
          bookingId: booking.id,
          transactionReference
        });

        // Send booking confirmation email
        this.emailService.sendBookingPaymentConfirmationEmail({
          userEmail: fullBooking.guest.email,
          userName: fullBooking.guest.firstName || 'Guest',
          bookingId: booking.id,
          propertyName: fullBooking.property.name,
          amount: booking.totalPrice,
          currency: 'RWF',
          checkIn: fullBooking.checkIn,
          checkOut: fullBooking.checkOut,
          reference: transactionReference
        }).catch(err => logger.error('Failed to send booking confirmation email', 'EscrowService', err));

      } else if (escrowStatus === 'FAILED') {
        bookingPaymentStatus = 'failed';
        logger.info('Payment failed - booking payment marked as failed', 'EscrowService', {
          bookingId: booking.id
        });

        // Send payment failed email
        this.emailService.sendBookingPaymentStatusEmail({
          userEmail: fullBooking.guest.email,
          userName: fullBooking.guest.firstName || 'Guest',
          bookingId: booking.id,
          propertyName: fullBooking.property.name,
          amount: booking.totalPrice,
          status: 'failed',
          reference: transactionReference
        }).catch(err => logger.error('Failed to send payment failed email', 'EscrowService', err));

      } else if (escrowStatus === 'REFUNDED') {
        bookingPaymentStatus = 'refunded';
        logger.info('Payment refunded', 'EscrowService', {
          bookingId: booking.id
        });

        // Send refund notification
        this.emailService.sendBookingPaymentStatusEmail({
          userEmail: fullBooking.guest.email,
          userName: fullBooking.guest.firstName || 'Guest',
          bookingId: booking.id,
          propertyName: fullBooking.property.name,
          amount: booking.totalPrice,
          status: 'refunded',
          reference: transactionReference
        }).catch(err => logger.error('Failed to send refund email', 'EscrowService', err));

      } else if (escrowStatus === 'PENDING') {
        bookingPaymentStatus = 'pending';
      }

      // Update booking
      await prisma.booking.update({
        where: { id: booking.id },
        data: {
          paymentStatus: bookingPaymentStatus,
          status: bookingStatus
        }
      });

      logger.info('Booking status updated', 'EscrowService', {
        bookingId: booking.id,
        paymentStatus: bookingPaymentStatus,
        bookingStatus
      });

    } catch (error: any) {
      logger.error('Failed to update booking payment status', 'EscrowService', error);
      // Don't throw - this is a non-critical operation
    }
  }

  private validateAmount(amount: number, currency: string): void {
    const min = config.escrow.minTransactionAmount;
    const max = config.escrow.maxTransactionAmount;

    if (amount < min) {
      throw new Error(`Amount must be at least ${min} ${currency}`);
    }

    if (amount > max) {
      throw new Error(`Amount cannot exceed ${max} ${currency}`);
    }
  }

  private validateSplitRules(rules: SplitRules): void {
    const total = rules.host + rules.agent + rules.platform;
    
    if (Math.abs(total - 100) > 0.01) {
      throw new Error(`Split rules must total 100%. Current total: ${total}%`);
    }

    if (rules.host < 0 || rules.agent < 0 || rules.platform < 0) {
      throw new Error('Split percentages cannot be negative');
    }
  }

  private calculateSplitAmounts(amount: number, rules: SplitRules) {
    return {
      host: Math.round((amount * rules.host / 100) * 100) / 100,
      agent: Math.round((amount * rules.agent / 100) * 100) / 100,
      platform: Math.round((amount * rules.platform / 100) * 100) / 100
    };
  }

  private async updateWalletsOnRelease(transaction: any, splitAmounts: any): Promise<void> {
    const metadata = JSON.parse(transaction.metadata || '{}');
    
    // Host wallet
    await this.updateWalletBalance(
      transaction.recipientId,
      splitAmounts.host,
      'ESCROW_RELEASE',
      transaction.reference
    );

    // Agent wallet (if exists)
    if (metadata.agentId && splitAmounts.agent > 0) {
      await this.updateWalletBalance(
        metadata.agentId,
        splitAmounts.agent,
        'ESCROW_RELEASE',
        transaction.reference
      );
    }

    // Platform fee
    if (splitAmounts.platform > 0) {
      await this.updateWalletBalance(
        1, // Platform account
        splitAmounts.platform,
        'PLATFORM_FEE',
        transaction.reference
      );
    }
  }

  private async updateWalletBalance(
    userId: number | string,
    amount: number,
    type: string,
    reference: string
  ): Promise<void> {
    const userIdNum = this.parseUserId(userId);
    const wallet = await this.getUserWallet(userIdNum);
    const newBalance = wallet.balance + amount;

    await prisma.wallet.update({
      where: { userId: userIdNum },
      data: { balance: newBalance }
    });

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

  private async validateWithdrawalDestination(withdrawData: WithdrawDto): Promise<void> {
    if (withdrawData.method === 'MOBILE') {
      const validation = PhoneUtils.validateRwandaPhone(
        withdrawData.destination.accountNumber
      );

      if (!validation.isValid) {
        throw new Error(validation.error || 'Invalid mobile number');
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

  private buildPayoutRequest(
    withdrawal: any,
    withdrawData: WithdrawDto
  ): PesapalPayoutRequest {
    return {
      source_type: 'MERCHANT',
      source: {
        account_number: config.pesapal.merchantAccount
      },
      destination_type: withdrawData.method,
      destination: {
        type: withdrawData.method,
        country_code: withdrawData.destination.countryCode || 'RW',
        holder_name: withdrawData.destination.holderName,
        account_number: withdrawData.destination.accountNumber,
        mobile_provider: withdrawData.destination.mobileProvider,
        bank_code: withdrawData.destination.bankCode
      },
      transfer_details: {
        amount: this.pesapalService.formatAmount(withdrawData.amount),
        currency_code: withdrawal.currency,
        date: new Date().toISOString().split('T')[0],
        particulars: withdrawData.particulars || 'Wallet withdrawal',
        reference: withdrawData.reference
      }
    };
  }

  private async getUserById(id: number | string): Promise<EscrowParticipant> {
    const idNum = this.parseUserId(id);

    const user = await prisma.user.findUnique({
      where: { id: idNum },
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
      role: 'GUEST',
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone
    };
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
      splitRules: metadata.splitRules || config.escrow.defaultSplitRules,
      splitAmounts: metadata.splitAmounts,
      heldAt: transaction.fundedAt,
      readyAt: transaction.fundedAt,
      releasedAt: transaction.releasedAt,
      refundedAt: transaction.refundedAt,
      failedAt: transaction.cancelledAt,
      billingInfo: metadata.billingInfo,
      failureReason: transaction.cancellationReason,
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

  private transformWithdrawalRequest(withdrawal: any): WithdrawalRequest {
    return {
      id: withdrawal.id,
      userId: withdrawal.userId,
      amount: withdrawal.amount,
      currency: withdrawal.currency,
      method: withdrawal.method as PayoutMethod,
      destination: JSON.parse(withdrawal.destination),
      status: withdrawal.status,
      pesapalPayoutId: withdrawal.pesapalPayoutId,
      reference: withdrawal.reference,
      failureReason: withdrawal.failureReason,
      createdAt: withdrawal.createdAt,
      updatedAt: withdrawal.updatedAt,
      completedAt: withdrawal.completedAt
    };
  }

  private handleError(error: any, code: string): Error {
    const message = error.message || 'An unexpected error occurred';
    const enhancedError = new Error(message);
    (enhancedError as any).code = code;
    (enhancedError as any).originalError = error;
    return enhancedError;
  }

  // ==================== NOTIFICATION METHODS ====================

  private async sendDepositNotification(
    transaction: EscrowTransaction,
    checkoutUrl: string
  ): Promise<void> {
    try {
      if (transaction.guest) {
        await this.emailService.sendDepositCreatedEmail({
          user: transaction.guest,
          transaction,
          checkoutUrl
        });
      }
    } catch (error) {
      logger.error('Notification failed', 'EscrowService', error);
    }
  }

  private async sendStatusUpdateNotification(
    transaction: EscrowTransaction,
    status: EscrowTransactionStatus
  ): Promise<void> {
    try {
      if (transaction.guest) {
        await this.emailService.sendTransactionStatusEmail({
          user: transaction.guest,
          transaction,
          status
        });
      }
    } catch (error) {
      logger.error('Notification failed', 'EscrowService', error);
    }
  }

  private async sendReleaseNotification(transaction: EscrowTransaction): Promise<void> {
    try {
      if (transaction.host) {
        await this.emailService.sendFundsReleasedEmail({
          user: transaction.host,
          transaction
        });
      }
    } catch (error) {
      logger.error('Notification failed', 'EscrowService', error);
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
      logger.error('Notification failed', 'EscrowService', error);
    }
  }

  private async sendRefundNotification(
    transaction: EscrowTransaction,
    amount: number
  ): Promise<void> {
    try {
      if (transaction.guest) {
        await this.emailService.sendRefundProcessedEmail({
          user: transaction.guest,
          transaction,
          refundAmount: amount
        });
      }
    } catch (error) {
      logger.error('Notification failed', 'EscrowService', error);
    }
  }

  // ==================== HEALTH CHECK ====================

  async checkPaymentSystemHealth(): Promise<{
    healthy: boolean;
    pesapalStatus: string;
    databaseStatus: string;
    message?: string;
  }> {
    try {
      // Check Pesapal connection
      const pesapalHealthy = await this.pesapalService.healthCheck();
      
      // Check database connection
      let databaseHealthy = false;
      try {
        await prisma.$queryRaw`SELECT 1`;
        databaseHealthy = true;
      } catch (dbError) {
        logger.error('Database health check failed', 'EscrowService', dbError);
      }

      const healthy = pesapalHealthy && databaseHealthy;

      return {
        healthy,
        pesapalStatus: pesapalHealthy ? 'connected' : 'disconnected',
        databaseStatus: databaseHealthy ? 'connected' : 'disconnected',
        message: healthy ? 'All systems operational' : 'Some systems are experiencing issues'
      };
    } catch (error: any) {
      logger.error('Health check error', 'EscrowService', error);
      return {
        healthy: false,
        pesapalStatus: 'unknown',
        databaseStatus: 'unknown',
        message: error.message
      };
    }
  }
}