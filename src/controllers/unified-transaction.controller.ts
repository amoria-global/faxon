// controllers/unified-transaction.controller.ts - Unified transaction API endpoints with wallet management

import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { unifiedTransactionService, UnifiedTransactionFilters } from '../services/unified-transaction.service';
import { PawaPayService } from '../services/pawapay.service';
import { XentriPayService } from '../services/xentripay.service';
import { logger } from '../utils/logger';
import config from '../config/config';
import { currencyExchangeService } from '../services/currency-exchange.service';
import { PhoneUtils } from '../utils/phone.utils';
import { TransactionSanitizer } from '../utils/transaction-sanitizer.utility';

const prisma = new PrismaClient();

// Initialize PawaPay service for provider information
const pawaPayService = new PawaPayService({
  apiKey: config.pawapay.apiKey,
  baseUrl: config.pawapay.baseUrl,
  environment: config.pawapay.environment
});

// Initialize XentriPay service
const isProduction = process.env.NODE_ENV === 'production';
const xentriPayBaseUrl = isProduction
  ? 'https://xentripay.com'
  : 'https://test.xentripay.com';

const xentriPayService = new XentriPayService({
  apiKey: process.env.XENTRIPAY_API_KEY || '',
  baseUrl: process.env.XENTRIPAY_BASE_URL || xentriPayBaseUrl,
  environment: isProduction ? 'production' : 'sandbox',
  timeout: 30000
});

export class UnifiedTransactionController {
  /**
   * Helper: Send booking notifications to user, host, and agent
   */
  private async sendBookingNotifications(
    bookingId: string,
    transactionReference: string,
    rwfAmount: number,
    paymentMethod: string,
    paymentInstructions?: string
  ): Promise<void> {
    try {
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        include: {
          property: {
            include: {
              host: true,
              agent: true
            }
          },
          guest: true
        }
      });

      if (!booking || !booking.property.host) {
        logger.warn('Cannot send notifications: Booking or host not found', 'UnifiedTransactionController', { bookingId });
        return;
      }

      const { BrevoPropertyMailingService } = require('../utils/brevo.property');
      const propertyEmailService = new BrevoPropertyMailingService();

      const company = {
        name: 'Jambolush',
        website: 'https://jambolush.com',
        supportEmail: 'support@jambolush.com',
        logo: 'https://jambolush.com/favicon.ico'
      };

      const isPropertyPayment = paymentMethod === 'Pay at Property' || paymentMethod === 'cash_at_property';
      const defaultInstructions = isPropertyPayment
        ? 'Please pay the full amount in cash when you check in at the property. A 5% service fee is included.'
        : 'Your payment is being processed. You will receive a confirmation once it\'s complete.';

      // Notify guest/user
      propertyEmailService.sendBookingNotificationToGuest({
        user: {
          firstName: booking.guest.firstName,
          lastName: booking.guest.lastName,
          email: booking.guest.email,
          id: booking.guestId
        },
        company,
        booking: {
          id: booking.id,
          propertyName: booking.property.name,
          checkIn: booking.checkIn.toISOString(),
          checkOut: booking.checkOut.toISOString(),
          totalPrice: rwfAmount,
          currency: 'RWF',
          transactionReference,
          paymentMethod,
          paymentInstructions: paymentInstructions || defaultInstructions
        }
      }).catch((err: any) => logger.error('Failed to send guest notification', 'UnifiedTransactionController', err));

      // Notify host/owner
      const hostInstructions = isPropertyPayment
        ? 'Guest will pay cash at check-in. Please collect the full amount and mark as collected in your dashboard.'
        : 'Payment is being processed online. You will be notified when the payment is complete.';

      propertyEmailService.sendBookingNotificationToHost({
        user: {
          firstName: booking.property.host.firstName,
          lastName: booking.property.host.lastName,
          email: booking.property.host.email,
          id: booking.property.hostId
        },
        company,
        booking: {
          id: booking.id,
          propertyName: booking.property.name,
          guestName: `${booking.guest.firstName} ${booking.guest.lastName}`,
          guestEmail: booking.guest.email,
          guestPhone: booking.guest.phone || 'Not provided',
          checkIn: booking.checkIn.toISOString(),
          checkOut: booking.checkOut.toISOString(),
          totalPrice: rwfAmount,
          currency: 'RWF',
          transactionReference,
          paymentMethod,
          collectionInstructions: hostInstructions
        }
      }).catch((err: any) => logger.error('Failed to send host notification', 'UnifiedTransactionController', err));

      // Notify agent if property has an agent
      if (booking.property.agent) {
        propertyEmailService.sendBookingNotificationToAgent({
          user: {
            firstName: booking.property.agent.firstName,
            lastName: booking.property.agent.lastName,
            email: booking.property.agent.email,
            id: booking.property.agent.id
          },
          company,
          booking: {
            id: booking.id,
            propertyName: booking.property.name,
            hostName: `${booking.property.host.firstName} ${booking.property.host.lastName}`,
            guestName: `${booking.guest.firstName} ${booking.guest.lastName}`,
            checkIn: booking.checkIn.toISOString(),
            checkOut: booking.checkOut.toISOString(),
            totalPrice: rwfAmount,
            currency: 'RWF',
            transactionReference,
            paymentMethod
          }
        }).catch((err: any) => logger.error('Failed to send agent notification', 'UnifiedTransactionController', err));
      }

      logger.info('Booking notifications sent', 'UnifiedTransactionController', { bookingId, paymentMethod });
    } catch (error) {
      logger.error('Failed to send booking notifications', 'UnifiedTransactionController', error);
      // Don't throw - notifications are non-critical
    }
  }

  // ==================== UNIFIED DEPOSIT (PAYMENTS) ====================

  /**
   * Unified deposit endpoint - routes based on payment method
   * POST /api/transactions/deposit
   * @body paymentMethod - "momo" (mobile money via PawaPay), "card" (card via XentriPay), or "property" (pay at property)
   * @body amount - Amount in USD (will be converted to RWF for both providers)
   * @body phoneNumber - Phone number (required for momo, optional for card)
   * @body email - Email (required for card, optional for momo)
   * @body For momo: provider (MTN_RWANDA, AIRTEL_RWANDA), country, description, internalReference
   * @body For card: customerName, description, internalReference
   * @body For property: internalReference (booking ID), amount, customerName, email
   */
  async initiateUnifiedDeposit(req: Request, res: Response): Promise<void> {
    try {
      const { paymentMethod, ...depositData } = req.body;

      // Validate payment method
      if (!paymentMethod || !['momo', 'card', 'property'].includes(paymentMethod)) {
        res.status(400).json({
          success: false,
          message: 'Invalid or missing paymentMethod. Must be "momo" (mobile money), "card", or "property" (pay at property)'
        });
        return;
      }

      logger.info('Initiating unified deposit', 'UnifiedTransactionController', {
        paymentMethod,
        amount: depositData.amount
      });

      // Route based on payment method:
      // - "momo" (mobile money) -> PawaPay
      // - "card" -> XentriPay
      // - "property" -> Cash payment at property (no provider)
      if (paymentMethod === 'momo') {
        await this.handlePawaPayDeposit(req, res, depositData);
      } else if (paymentMethod === 'card') {
        await this.handleXentriPayCardDeposit(req, res, depositData);
      } else if (paymentMethod === 'property') {
        await this.handlePropertyPayment(req, res, depositData);
      }
    } catch (error: any) {
      logger.error('Failed to initiate unified deposit', 'UnifiedTransactionController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to initiate deposit',
        error: error.message
      });
    }
  }

  /**
   * Handle PawaPay deposit
   */
  private async handlePawaPayDeposit(req: Request, res: Response, depositData: any): Promise<void> {
    const userId = req.user?.userId ? parseInt(req.user.userId) : undefined;
    const { amount, phoneNumber, provider: mobileProvider, country, description, internalReference, metadata } = depositData;

    // CRITICAL: Validate userId exists before creating transaction
    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Authentication required. User must be logged in to initiate deposit.'
      });
      return;
    }

    if (!amount || !phoneNumber || !mobileProvider) {
      res.status(400).json({
        success: false,
        message: 'Missing required fields for PawaPay: amount, phoneNumber, provider (mobile provider)'
      });
      return;
    }

    // Frontend sends amount in USD, we need to convert to RWF
    const usdAmount = parseFloat(amount);

    // Convert USD to RWF using deposit rate (+0.5%)
    const { rwfAmount, rate: depositRate, exchangeRate } = await currencyExchangeService.convertUSDToRWF_Deposit(usdAmount);

    const countryISO3 = pawaPayService.convertToISO3CountryCode(country || 'RW');
    const formattedPhone = pawaPayService.formatPhoneNumber(phoneNumber, country === 'RW' ? '250' : undefined);
    const providerCode = pawaPayService.getProviderCode(mobileProvider, countryISO3);

    // PawaPay expects amount in RWF (no decimal places for RWF)
    const amountInSmallestUnit = rwfAmount.toString();
    const depositId = pawaPayService.generateTransactionId();

    // Fetch user email for metadata
    const user = userId ? await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true, lastName: true, phone: true }
    }) : null;

    const metadataArray: any[] = Object.entries({
      ...(metadata || {}),
      clientReferenceId: internalReference,
      userId: userId,
      userEmail: user?.email,
      userFirstName: user?.firstName,
      userLastName: user?.lastName,
      userPhone: user?.phone
    }).map(([key, value]) => {
      if (value === undefined || value === null) return null;
      const isPII = key.toLowerCase() === 'userid' || key.toLowerCase().includes('customer');
      const entry: { [key: string]: any } = { [key]: String(value) };
      if (isPII) entry.isPII = true;
      return entry;
    }).filter(Boolean);

    const depositRequest = {
      depositId,
      amount: amountInSmallestUnit,
      currency: 'RWF' as 'RWF',
      payer: {
        type: 'MMO' as 'MMO',
        accountDetails: {
          phoneNumber: formattedPhone,
          provider: providerCode
        }
      },
      metadata: metadataArray
    };

    const response = await pawaPayService.initiateDeposit(depositRequest);

    // Store in unified Transaction table
    await prisma.transaction.create({
      data: {
        reference: depositId,
        provider: 'PAWAPAY',
        transactionType: 'DEPOSIT',
        paymentMethod: 'mobile_money',
        userId,
        amount: parseFloat(amountInSmallestUnit),
        currency: 'RWF',
        requestedAmount: parseFloat(amountInSmallestUnit),
        status: response.status,
        externalId: depositId,
        providerTransactionId: response.correspondentIds?.PROVIDER_TRANSACTION_ID,
        financialTransactionId: response.correspondentIds?.FINANCIAL_TRANSACTION_ID,
        payerPhone: formattedPhone,
        correspondent: providerCode,
        description: description,
        statementDescription: description,
        customerTimestamp: response.customerTimestamp ? new Date(response.customerTimestamp) : new Date(),
        country: countryISO3,
        bookingId: internalReference,
        failureCode: response.failureReason?.failureCode,
        failureReason: response.failureReason?.failureMessage,
        receivedByProvider: response.receivedByPawaPay ? new Date(response.receivedByPawaPay) : undefined,
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
          internalReference,
          // Default split percentages from config
          splitRules: {
            host: config.defaultSplitRules.host,
            agent: config.defaultSplitRules.agent,
            platform: config.defaultSplitRules.platform
          }
        }
      }
    });

    // Send notifications to user, host, and agent if this is a booking payment
    if (internalReference) {
      await this.sendBookingNotifications(
        internalReference,
        depositId,
        rwfAmount,
        'Mobile Money',
        'Your mobile money payment is being processed. You will receive a confirmation once it\'s complete.'
      );
    }

    res.status(200).json({
      success: true,
      provider: 'pawapay',
      message: 'Deposit initiated successfully via PawaPay',
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
  }

  /**
   * Handle XentriPay card deposit
   * NOTE: We send pmethod='cc' to the provider but save paymentMethod='card' in database
   * This is to match provider's expected format while maintaining consistent DB schema
   */
  private async handleXentriPayCardDeposit(req: Request, res: Response, depositData: any): Promise<void> {
    const userId = req.user?.userId ? parseInt(req.user.userId) : undefined;
    const { amount, phoneNumber, email, customerName, description, internalReference, metadata, redirecturl } = depositData;

    // CRITICAL: Validate userId exists before creating transaction
    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Authentication required. User must be logged in to initiate deposit.'
      });
      return;
    }

    if (!amount || !email) {
      res.status(400).json({
        success: false,
        message: 'Missing required fields for card payment: amount, email'
      });
      return;
    }

    // Frontend sends amount in USD
    const usdAmount = parseFloat(amount);

    // Get exchange rate for response (XentriPayService will do conversion internally)
    const { rwfAmount, rate: depositRate, exchangeRate } = await currencyExchangeService.convertUSDToRWF_Deposit(usdAmount);

    // Fetch user info if not provided
    const user = userId ? await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true, lastName: true, phone: true }
    }) : null;

    const customerReference = internalReference || xentriPayService.generateCustomerReference('CARD');

    // Check if transaction with this reference already exists
    const existingTransaction = await prisma.transaction.findUnique({
      where: { reference: customerReference }
    });

    if (existingTransaction) {
      // If transaction exists and was created recently (within last 10 minutes), return it
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      if (existingTransaction.createdAt > tenMinutesAgo) {
        logger.info('Returning existing transaction for duplicate reference', 'UnifiedTransactionController', {
          reference: customerReference,
          existingStatus: existingTransaction.status
        });

        res.status(200).json({
          success: true,
          message: 'Transaction already exists',
          data: {
            transaction: existingTransaction,
            exchangeRate: {
              rate: depositRate,
              amountUSD: usdAmount,
              amountRWF: rwfAmount
            }
          }
        });
        return;
      } else {
        // If old transaction exists, generate a new reference
        const newReference = xentriPayService.generateCustomerReference('CARD');
        logger.warn('Old transaction with reference exists, generating new reference', 'UnifiedTransactionController', {
          oldReference: customerReference,
          newReference: newReference
        });
        // Update customerReference to use the new one
        depositData.internalReference = newReference;
        // Recursively call with new reference
        return this.handleXentriPayCardDeposit(req, res, depositData);
      }
    }

    // Get phone number from request or user session - REQUIRED for payment processing
    const contactNumber = phoneNumber || user?.phone;

    // Phone number is required for card payments
    if (!contactNumber) {
      res.status(400).json({
        success: false,
        message: 'Phone number is required. Please provide a valid Rwanda phone number or update your profile.'
      });
      return;
    }

    // Validate and format phone number
    const phoneValidation = PhoneUtils.validateRwandaPhone(contactNumber);
    if (!phoneValidation.isValid) {
      res.status(400).json({
        success: false,
        message: `Invalid phone number: ${phoneValidation.error}. Please provide a valid Rwanda phone number (e.g., 0780000000).`
      });
      return;
    }

    const cnumberFormatted = PhoneUtils.formatPhone(contactNumber, false); // e.g., "0780371519"
    const msisdnFormatted = PhoneUtils.formatPhone(contactNumber, true); // e.g., "250780371519"

    // Validate cnumber is 10 digits
    if (!/^\d{10}$/.test(cnumberFormatted)) {
      res.status(400).json({
        success: false,
        message: 'Phone number must be exactly 10 digits (e.g., 0780371519)'
      });
      return;
    }

    // Validate email is available
    const userEmail = email || user?.email;
    if (!userEmail) {
      res.status(400).json({
        success: false,
        message: 'Email is required. Please provide an email address or update your profile.'
      });
      return;
    }

    // Validate customer name
    const fullName = customerName || `${user?.firstName || ''} ${user?.lastName || ''}`.trim();
    if (!fullName) {
      res.status(400).json({
        success: false,
        message: 'Customer name is required. Please provide your name or update your profile.'
      });
      return;
    }

    // Initiate card collection via XentriPay
    // NOTE: XentriPayService.initiateCollection() expects USD amount and converts to RWF internally
    // Send 'cc' as pmethod to provider, but save 'card' in database
    // XentriPay expects: cnumber with leading 0, msisdn without +, chargesIncluded as boolean
    const collectionResponse = await xentriPayService.initiateCollection({
      email: userEmail,
      cname: fullName,
      amount: usdAmount, // Send USD - service will convert to RWF
      cnumber: cnumberFormatted, // 10 digits with leading 0: "0780371519"
      msisdn: msisdnFormatted.replace(/^\+/, ''), // Full without +: "250780371519"
      currency: 'USD', // Service will convert to RWF
      pmethod: 'cc', // Card payment method
      chargesIncluded: true, // Boolean, not string
      description: description || `Card deposit for ${internalReference}`,
      internalReference: internalReference,
      redirecturl: redirecturl || 'https://app.jambolush.com/all/guest/bookings' // Use redirecturl from frontend, fallback to default
    });

    // Store in unified Transaction table
    await prisma.transaction.create({
      data: {
        reference: customerReference,
        provider: 'XENTRIPAY',
        transactionType: 'DEPOSIT',
        paymentMethod: 'card',
        userId,
        amount: rwfAmount,
        currency: 'RWF',
        requestedAmount: rwfAmount,
        status: 'PENDING',
        externalId: collectionResponse.refid || customerReference,
        payerPhone: msisdnFormatted,
        description: description,
        bookingId: internalReference,
        metadata: {
          ...(metadata || {}),
          originalAmountUSD: usdAmount,
          exchangeRate: depositRate,
          baseRate: exchangeRate.base,
          depositRate: exchangeRate.depositRate,
          payoutRate: exchangeRate.payoutRate,
          spread: exchangeRate.spread,
          amountRWF: rwfAmount,
          xentriPayRefId: collectionResponse.refid,
          xentriPayTid: collectionResponse.tid,
          xentriPayAuthkey: collectionResponse.authkey,
          xentriPayReply: collectionResponse.reply,
          paymentMethod: 'card',
          userEmail: userEmail,
          customerName: fullName,
          cnumber: cnumberFormatted,
          msisdn: msisdnFormatted,
          userFirstName: user?.firstName,
          userLastName: user?.lastName,
          internalReference,
          // Default split percentages from config
          splitRules: {
            host: config.defaultSplitRules.host,
            agent: config.defaultSplitRules.agent,
            platform: config.defaultSplitRules.platform
          }
        }
      }
    });

    // Send notifications to user, host, and agent if this is a booking payment
    if (internalReference) {
      await this.sendBookingNotifications(
        internalReference,
        customerReference,
        rwfAmount,
        'Card Payment',
        'Your card payment is being processed. You will receive a confirmation once it\'s complete.'
      );
    }

    res.status(200).json({
      success: true,
      provider: 'xentripay',
      paymentMethod: 'card',
      message: 'Card payment initiated successfully via XentriPay',
      data: {
        depositId: customerReference,
        refId: collectionResponse.refid,
        tid: collectionResponse.tid,
        status: 'PENDING',
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
        paymentUrl: collectionResponse.url,
        reply: collectionResponse.reply,
        instructions: 'Redirect user to paymentUrl to complete card payment'
      }
    });
  }

  /**
   * Handle property payment (pay at property / cash payment)
   */
  private async handlePropertyPayment(req: Request, res: Response, depositData: any): Promise<void> {
    const userId = req.user?.userId ? parseInt(req.user.userId) : undefined;
    const { amount, email, customerName, phoneNumber, description, internalReference, metadata } = depositData;

    // CRITICAL: Validate userId exists before creating transaction
    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Authentication required. User must be logged in to initiate deposit.'
      });
      return;
    }

    if (!amount || !internalReference) {
      res.status(400).json({
        success: false,
        message: 'Missing required fields for property payment: amount, internalReference (booking ID)'
      });
      return;
    }

    // Frontend sends amount in USD
    const usdAmount = parseFloat(amount);

    // Get exchange rate for RWF conversion (even though payment is at property)
    const { rwfAmount, rate: depositRate, exchangeRate } = await currencyExchangeService.convertUSDToRWF_Deposit(usdAmount);

    // Fetch user info
    const user = userId ? await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true, lastName: true, phone: true }
    }) : null;

    const propertyPaymentRef = `PROP-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    // Create a transaction record with status PENDING_PROPERTY_PAYMENT
    const transaction = await prisma.transaction.create({
      data: {
        reference: propertyPaymentRef,
        provider: 'PROPERTY', // No external provider for property payments
        transactionType: 'DEPOSIT',
        paymentMethod: 'cash_at_property',
        userId,
        amount: rwfAmount,
        currency: 'RWF',
        requestedAmount: rwfAmount,
        status: 'PENDING_PROPERTY_PAYMENT', // Special status for property payments
        description: description || 'Pay at property',
        bookingId: internalReference,
        payerPhone: phoneNumber || user?.phone,
        payerEmail: email || user?.email,
        metadata: {
          ...(metadata || {}),
          originalAmountUSD: usdAmount,
          exchangeRate: depositRate,
          baseRate: exchangeRate.base,
          depositRate: exchangeRate.depositRate,
          payoutRate: exchangeRate.payoutRate,
          spread: exchangeRate.spread,
          amountRWF: rwfAmount,
          paymentMethod: 'property',
          userEmail: email || user?.email,
          customerName: customerName || `${user?.firstName || ''} ${user?.lastName || ''}`.trim(),
          userFirstName: user?.firstName,
          userLastName: user?.lastName,
          internalReference,
          paymentInstructions: 'Payment to be collected at property check-in',
          // Default split percentages from config
          splitRules: {
            host: config.defaultSplitRules.host,
            agent: config.defaultSplitRules.agent,
            platform: config.defaultSplitRules.platform
          }
        }
      }
    });

    // Update booking record to reflect "pay at property" selection
    if (internalReference) {
      try {
        await prisma.booking.update({
          where: { id: internalReference },
          data: {
            paymentMethod: 'property',
            payAtProperty: true,
            paymentStatus: 'pending_property',
            transactionId: transaction.id,
            status: 'confirmed' // Booking is confirmed even though payment is pending
          }
        });
      } catch (bookingError) {
        logger.warn('Failed to update booking for property payment', 'UnifiedTransactionController', {
          bookingId: internalReference,
          error: bookingError
        });
      }
    }

    // Send notifications to user, host, and agent (if applicable)
    await this.sendBookingNotifications(
      internalReference,
      propertyPaymentRef,
      rwfAmount,
      'Pay at Property',
      'Please pay the full amount in cash when you check in at the property. A 5% service fee is included.'
    );

    logger.info('Property payment initiated', 'UnifiedTransactionController', {
      reference: propertyPaymentRef,
      bookingId: internalReference,
      amountUSD: usdAmount,
      amountRWF: rwfAmount
    });

    res.status(200).json({
      success: true,
      provider: 'property',
      paymentMethod: 'property',
      message: 'Pay at property selected successfully. Payment will be collected when you check in.',
      data: {
        depositId: propertyPaymentRef,
        transactionId: transaction.id,
        status: 'PENDING_PROPERTY_PAYMENT',
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
        bookingId: internalReference,
        instructions: 'Please pay the full amount in cash when you check in at the property. A 5% service fee is included.'
      }
    });
  }

  // ==================== TRANSACTION QUERIES ====================

  /**
   * Get all transactions with optional filters
   * GET /api/transactions
   * SECURITY: Admin-only endpoint OR filtered to authenticated user's transactions
   * NOTE: For non-admin users, automatically uses comprehensive search across ALL transaction tables
   * @query userId - Filter by user ID (non-admins can only query their own)
   * @query recipientId - Filter by recipient ID
   * @query provider - Filter by provider (PAWAPAY, XENTRIPAY, PROPERTY)
   * @query paymentMethod - Filter by payment method (mobile_money, card, cash_at_property)
   * @query type - Filter by transaction type (DEPOSIT, PAYOUT, etc.)
   * @query status - Filter by status
   * @query fromDate - Filter by date range (start)
   * @query toDate - Filter by date range (end)
   * @query limit - Limit results (default: 100)
   * @query offset - Offset for pagination (default: 0)
   */
  async getAllTransactions(req: Request, res: Response): Promise<void> {
    try {
      const authenticatedUserId = req.user?.userId ? parseInt(req.user.userId) : undefined;

      if (!authenticatedUserId) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      // Get user role for admin check
      const user = await prisma.user.findUnique({
        where: { id: authenticatedUserId },
        select: { userType: true }
      });
      const isAdmin = user?.userType === 'admin';

      const filters: UnifiedTransactionFilters = {
        userId: req.query.userId ? parseInt(req.query.userId as string) : undefined,
        recipientId: req.query.recipientId ? parseInt(req.query.recipientId as string) : undefined,
        provider: req.query.provider as any,
        transactionType: req.query.type as any,
        paymentMethod: req.query.paymentMethod as string,
        status: req.query.status as string,
        fromDate: req.query.fromDate ? new Date(req.query.fromDate as string) : undefined,
        toDate: req.query.toDate ? new Date(req.query.toDate as string) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 100,
        offset: req.query.offset ? parseInt(req.query.offset as string) : 0
      };

      // Non-admins can only see their own transactions
      if (!isAdmin) {
        filters.userId = authenticatedUserId;
      }

      logger.info('Fetching unified transactions', 'UnifiedTransactionController', { filters, isAdmin });

      // For non-admin users, use comprehensive search across ALL tables
      // For admin users, use standard search (transactions table only) for better performance
      let transactions: any[];
      if (!isAdmin && filters.userId) {
        // User query - search ALL tables
        transactions = await unifiedTransactionService.getAllTransactionsComprehensive(filters.userId, filters);
      } else {
        // Admin query - standard search (transactions table only)
        transactions = await unifiedTransactionService.getAllTransactions(filters);
      }

      // Sanitize for non-admin users
      const sanitizedTransactions = isAdmin
        ? transactions
        : transactions.map(tx => TransactionSanitizer.sanitizeMetadata(tx, false));

      // Count payment types for summary
      const cashPayments = sanitizedTransactions.filter(tx => tx.isCashPayment).length;
      const onlinePayments = sanitizedTransactions.filter(tx => tx.isOnlinePayment).length;

      // Group by source table for non-admin comprehensive search
      const byTable: Record<string, number> = {};
      if (!isAdmin) {
        sanitizedTransactions.forEach(tx => {
          const table = (tx as any).sourceTable || 'unknown';
          byTable[table] = (byTable[table] || 0) + 1;
        });
      }

      res.status(200).json({
        success: true,
        count: sanitizedTransactions.length,
        comprehensive: !isAdmin, // Users always get comprehensive search
        summary: {
          total: sanitizedTransactions.length,
          cashPayments,
          onlinePayments,
          ...((!isAdmin && Object.keys(byTable).length > 0) && { byTable })
        },
        data: sanitizedTransactions
      });
    } catch (error: any) {
      logger.error('Failed to fetch transactions', 'UnifiedTransactionController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch transactions',
        error: error.message
      });
    }
  }

  /**
   * Get transactions by user ID
   * GET /api/transactions/user/:userId
   * SECURITY: Authorization middleware ensures user can only see their own transactions
   * NOTE: Automatically uses comprehensive search across ALL transaction tables (default behavior)
   * @query status - Filter by transaction status
   * @query type - Filter by transaction type
   * @query fromDate - Filter by date range (start)
   * @query toDate - Filter by date range (end)
   * @query limit - Limit results (default: 100)
   * @query offset - Offset for pagination (default: 0)
   */
  async getTransactionsByUserId(req: Request, res: Response): Promise<void> {
    try {
      const userId = parseInt(req.params.userId);
      const authenticatedUserId = req.user?.userId ? parseInt(req.user.userId) : undefined;

      if (isNaN(userId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid user ID'
        });
        return;
      }

      // Get user role for admin check
      const user = await prisma.user.findUnique({
        where: { id: authenticatedUserId },
        select: { userType: true }
      });
      const isAdmin = user?.userType === 'admin';

      const filters: Omit<UnifiedTransactionFilters, 'userId'> = {
        provider: req.query.provider as any,
        transactionType: req.query.type as any,
        status: req.query.status as string,
        fromDate: req.query.fromDate ? new Date(req.query.fromDate as string) : undefined,
        toDate: req.query.toDate ? new Date(req.query.toDate as string) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 100,
        offset: req.query.offset ? parseInt(req.query.offset as string) : 0
      };

      logger.info('Fetching transactions for user', 'UnifiedTransactionController', {
        userId,
        filters
      });

      // Always use comprehensive search - searches ALL transaction tables
      const transactions = await unifiedTransactionService.getAllTransactionsComprehensive(userId, filters);

      // Sanitize transactions for non-admin users
      const sanitizedTransactions = isAdmin
        ? transactions
        : transactions.map(tx => TransactionSanitizer.sanitizeMetadata(tx, false));

      // Group by source table for summary
      const byTable: Record<string, number> = {};
      sanitizedTransactions.forEach(tx => {
        const table = (tx as any).sourceTable || 'unknown';
        byTable[table] = (byTable[table] || 0) + 1;
      });

      res.status(200).json({
        success: true,
        userId,
        count: sanitizedTransactions.length,
        comprehensive: true, // Always comprehensive
        summary: {
          total: sanitizedTransactions.length,
          byTable
        },
        data: sanitizedTransactions
      });
    } catch (error: any) {
      logger.error('Failed to fetch user transactions', 'UnifiedTransactionController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch user transactions',
        error: error.message
      });
    }
  }

  /**
   * Get transactions by recipient ID
   * GET /api/transactions/recipient/:recipientId
   * SECURITY: Authorization middleware ensures user can only see their own received transactions
   */
  async getTransactionsByRecipientId(req: Request, res: Response): Promise<void> {
    try {
      const recipientId = parseInt(req.params.recipientId);
      const authenticatedUserId = req.user?.userId ? parseInt(req.user.userId) : undefined;

      if (isNaN(recipientId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid recipient ID'
        });
        return;
      }

      // Get user role for admin check
      const user = await prisma.user.findUnique({
        where: { id: authenticatedUserId },
        select: { userType: true }
      });
      const isAdmin = user?.userType === 'admin';

      const filters: Omit<UnifiedTransactionFilters, 'recipientId'> = {
        provider: req.query.provider as any,
        transactionType: req.query.type as any,
        status: req.query.status as string,
        fromDate: req.query.fromDate ? new Date(req.query.fromDate as string) : undefined,
        toDate: req.query.toDate ? new Date(req.query.toDate as string) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 100,
        offset: req.query.offset ? parseInt(req.query.offset as string) : 0
      };

      logger.info('Fetching transactions for recipient', 'UnifiedTransactionController', { recipientId, filters });

      const transactions = await unifiedTransactionService.getTransactionsByRecipientId(recipientId, filters);

      // Sanitize transactions for non-admin users - hide platform fees
      const sanitizedTransactions = isAdmin
        ? transactions
        : transactions.map(tx => TransactionSanitizer.sanitizeMetadata(tx, false));

      res.status(200).json({
        success: true,
        recipientId,
        count: sanitizedTransactions.length,
        data: sanitizedTransactions
      });
    } catch (error: any) {
      logger.error('Failed to fetch recipient transactions', 'UnifiedTransactionController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch recipient transactions',
        error: error.message
      });
    }
  }

  /**
   * Get single transaction by ID
   * GET /api/transactions/:id
   * SECURITY: Authorization middleware ensures user is involved in transaction
   */
  async getTransactionById(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id;
      const authenticatedUserId = req.user?.userId ? parseInt(req.user.userId) : undefined;

      logger.info('Fetching transaction by ID', 'UnifiedTransactionController', { id });

      const transaction = await unifiedTransactionService.getTransactionById(id);

      if (!transaction) {
        res.status(404).json({
          success: false,
          message: 'Transaction not found'
        });
        return;
      }

      // Get user role for admin check
      const user = await prisma.user.findUnique({
        where: { id: authenticatedUserId },
        select: { userType: true }
      });
      const isAdmin = user?.userType === 'admin';

      // Sanitize transaction for non-admin users
      const sanitizedTransaction = isAdmin
        ? transaction
        : TransactionSanitizer.sanitizeMetadata(transaction, false);

      // Log access for audit trail
      TransactionSanitizer.logAccess(
        id,
        authenticatedUserId!,
        true,
        'Transaction details accessed'
      );

      res.status(200).json({
        success: true,
        data: sanitizedTransaction
      });
    } catch (error: any) {
      logger.error('Failed to fetch transaction', 'UnifiedTransactionController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch transaction',
        error: error.message
      });
    }
  }

  /**
   * Get transaction statistics
   * GET /api/transactions/stats
   */
  async getTransactionStats(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;

      logger.info('Fetching transaction statistics', 'UnifiedTransactionController', { userId });

      const stats = await unifiedTransactionService.getTransactionStats(userId);

      res.status(200).json({
        success: true,
        data: stats
      });
    } catch (error: any) {
      logger.error('Failed to fetch transaction stats', 'UnifiedTransactionController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch transaction statistics',
        error: error.message
      });
    }
  }

  // ==================== WALLET & BALANCE ====================

  /**
   * Get user wallet balance and information
   * GET /api/transactions/wallet/:userId
   * SECURITY: Authorization middleware ensures user can only view own wallet
   */
  async getUserWallet(req: Request, res: Response): Promise<void> {
    try {
      const userId = parseInt(req.params.userId);

      if (isNaN(userId)) {
        res.status(400).json({ success: false, message: 'Invalid user ID' });
        return;
      }

      const wallet = await prisma.wallet.findUnique({
        where: { userId },
        select: {
          id: true,
          userId: true,
          balance: true,
          pendingBalance: true,
          currency: true,
          walletNumber: true,
          accountNumber: true,
          createdAt: true,
          updatedAt: true
        }
      });

      if (!wallet) {
        res.status(404).json({ success: false, message: 'Wallet not found' });
        return;
      }

      // Sanitize wallet data - only show user their own balance
      const sanitizedWallet = TransactionSanitizer.sanitizeWalletBalance(wallet, userId);

      res.status(200).json({
        success: true,
        data: sanitizedWallet
      });
    } catch (error: any) {
      logger.error('Failed to fetch wallet', 'UnifiedTransactionController', error);
      res.status(500).json({ success: false, message: 'Failed to fetch wallet', error: error.message });
    }
  }

  /**
   * Get wallet transaction history
   * GET /api/transactions/wallet/:userId/history
   */
  async getWalletHistory(req: Request, res: Response): Promise<void> {
    try {
      const userId = parseInt(req.params.userId);
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

      if (isNaN(userId)) {
        res.status(400).json({ success: false, message: 'Invalid user ID' });
        return;
      }

      // First get the wallet
      const wallet = await prisma.wallet.findUnique({ where: { userId } });

      if (!wallet) {
        res.status(404).json({ success: false, message: 'Wallet not found' });
        return;
      }

      const history = await prisma.walletTransaction.findMany({
        where: { walletId: wallet.id },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          type: true,
          amount: true,
          balanceBefore: true,
          balanceAfter: true,
          reference: true,
          description: true,
          createdAt: true
        }
      });

      const total = await prisma.walletTransaction.count({ where: { walletId: wallet.id } });

      res.status(200).json({
        success: true,
        data: history,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total
        }
      });
    } catch (error: any) {
      logger.error('Failed to fetch wallet history', 'UnifiedTransactionController', error);
      res.status(500).json({ success: false, message: 'Failed to fetch wallet history', error: error.message });
    }
  }

  // ==================== WITHDRAWAL METHODS ====================

  /**
   * Get available PawaPay withdrawal methods for a country
   * GET /api/transactions/withdrawal-methods/available?country=RWA
   */
  async getAvailableWithdrawalMethods(req: Request, res: Response): Promise<void> {
    try {
      const countryCode = (req.query.country as string || 'RWA').toUpperCase();

      logger.info('Fetching available withdrawal methods', 'UnifiedTransactionController', { countryCode });

      let formattedProviders: any[] = [];

      try {
        // Try to get active providers from PawaPay
        const providers = await pawaPayService.getAvailableProviders(countryCode);

        if (providers && providers.length > 0) {
          formattedProviders = providers.map(provider => ({
            code: provider.correspondent,
            name: provider.correspondent.replace(/_/g, ' '),
            country: provider.country,
            currency: provider.currency,
            active: provider.active,
            supportsDeposits: true,
            supportsPayouts: true
          }));
        }
      } catch (pawaPayError) {
        logger.warn('PawaPay API unavailable, using static providers', 'UnifiedTransactionController', pawaPayError);
      }

      res.status(200).json({
        success: true,
        country: countryCode,
        count: formattedProviders.length,
        data: formattedProviders,
        source: formattedProviders.length > 0 ? 'pawapay' : 'static'
      });
    } catch (error: any) {
      logger.error('Failed to fetch available withdrawal methods', 'UnifiedTransactionController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch available withdrawal methods',
        error: error.message
      });
    }
  }

  /**
   * Get Rwanda-specific withdrawal providers (optimized for Rwanda)
   * GET /api/transactions/withdrawal-methods/rwanda
   * Returns both banks and mobile money providers supported in Rwanda
   */
  async getRwandaWithdrawalMethods(req: Request, res: Response): Promise<void> {
    try {
      logger.info('Fetching Rwanda withdrawal methods', 'UnifiedTransactionController');

      const {
        ALL_RWANDA_WITHDRAWAL_PROVIDERS,
        getBankProviders,
        getMobileMoneyProviders
      } = require('../types/withdrawal-providers.types');

      const banks = getBankProviders();
      const mobileMoney = getMobileMoneyProviders();

      res.status(200).json({
        success: true,
        country: 'RWA',
        countryName: 'Rwanda',
        currency: 'RWF',
        count: ALL_RWANDA_WITHDRAWAL_PROVIDERS.length,
        data: {
          banks: banks.map((bank: any) => ({
            id: bank.id,
            code: bank.code,
            name: bank.name,
            type: bank.type,
            country: bank.country,
            currency: bank.currency,
            active: bank.active,
            accountFormat: bank.accountFormat,
            logo: bank.logo,
            color: bank.color
          })),
          mobileMoney: mobileMoney.map((provider: any) => ({
            id: provider.id,
            code: provider.code,
            name: provider.name,
            type: provider.type,
            country: provider.country,
            currency: provider.currency,
            active: provider.active,
            accountFormat: provider.accountFormat,
            fees: provider.fees,
            logo: provider.logo,
            color: provider.color,
            supportsDeposits: true,
            supportsPayouts: true
          })),
          all: ALL_RWANDA_WITHDRAWAL_PROVIDERS
        },
        summary: {
          totalProviders: ALL_RWANDA_WITHDRAWAL_PROVIDERS.length,
          banks: banks.length,
          mobileMoney: mobileMoney.length
        },
        info: {
          supportedBanks: [
            'Investment and Mortgage Bank',
            'Banque de Kigali',
            'Guaranty Trust Bank',
            'National Commercial Bank of Africa',
            'Ecobank Rwanda',
            'Access Bank Rwanda',
            'Urwego Opportunity Bank',
            'Equity Bank',
            'Banque Populaire du Rwanda',
            'Zigama CSS',
            'Bank of Africa Rwanda',
            'Unguka Bank',
            'Banque Nationale du Rwanda'
          ],
          supportedMobileMoney: ['MTN Mobile Money', 'Airtel Rwanda', 'SPENN'],
          processingTime: 'Instant to few minutes',
          availability: '24/7',
          note: 'All withdrawals are processed according to provider specifications'
        }
      });
    } catch (error: any) {
      logger.error('Failed to fetch Rwanda withdrawal methods', 'UnifiedTransactionController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch Rwanda withdrawal methods',
        error: error.message
      });
    }
  }

  /**
   * Get user's saved withdrawal methods
   * GET /api/transactions/withdrawal-methods/:userId
   * Query params: ?approved=true (filter by approval status)
   */
  async getWithdrawalMethods(req: Request, res: Response): Promise<void> {
    try {
      const userId = parseInt(req.params.userId);
      const approvedOnly = req.query.approved === 'true';

      if (isNaN(userId)) {
        res.status(400).json({ success: false, message: 'Invalid user ID' });
        return;
      }

      // Build where clause - optionally filter by approval status
      const whereClause: any = { userId };
      if (approvedOnly) {
        whereClause.isApproved = true;
      }

      const methods = await prisma.withdrawalMethod.findMany({
        where: whereClause,
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          userId: true,
          methodType: true,
          accountName: true,
          accountDetails: true,
          isDefault: true,
          isVerified: true,
          isApproved: true,
          verificationStatus: true,
          createdAt: true,
          updatedAt: true
        }
      });

      // Categorize methods
      const approved = methods.filter(m => m.isApproved);
      const pending = methods.filter(m => !m.isApproved && m.verificationStatus === 'pending');
      const rejected = methods.filter(m => !m.isApproved && m.verificationStatus === 'rejected');

      res.status(200).json({
        success: true,
        count: methods.length,
        data: methods,
        summary: {
          total: methods.length,
          approved: approved.length,
          pending: pending.length,
          rejected: rejected.length,
          hasDefault: methods.some(m => m.isDefault)
        }
      });
    } catch (error: any) {
      logger.error('Failed to fetch withdrawal methods', 'UnifiedTransactionController', error);
      res.status(500).json({ success: false, message: 'Failed to fetch withdrawal methods', error: error.message });
    }
  }

  /**
   * Add a new withdrawal method
   * POST /api/transactions/withdrawal-methods
   * @body userId - User ID
   * @body methodType - BANK or MOBILE_MONEY
   * @body accountName - Account holder name
   * @body accountDetails - { providerCode, accountNumber, bankName?, phoneNumber? }
   * @body isDefault - Set as default withdrawal method
   */
  async addWithdrawalMethod(req: Request, res: Response): Promise<void> {
    try {
      const { userId, methodType, accountName, accountDetails, isDefault } = req.body;

      if (!userId || !methodType || !accountName || !accountDetails) {
        res.status(400).json({
          success: false,
          message: 'Missing required fields: userId, methodType, accountName, accountDetails'
        });
        return;
      }

      // Validate methodType
      if (!['BANK', 'MOBILE_MONEY'].includes(methodType)) {
        res.status(400).json({
          success: false,
          message: 'Invalid methodType. Must be either BANK or MOBILE_MONEY'
        });
        return;
      }

      // Validate account details structure
      const { providerCode, accountNumber } = accountDetails;
      if (!providerCode || !accountNumber) {
        res.status(400).json({
          success: false,
          message: 'accountDetails must include providerCode and accountNumber'
        });
        return;
      }

      // Validate provider code and account number format
      const { getProviderByCode, validateAccountNumber } = require('../types/withdrawal-providers.types');
      const provider = getProviderByCode(providerCode);

      if (!provider) {
        res.status(400).json({
          success: false,
          message: `Invalid provider code: ${providerCode}. Please use a valid Rwanda bank or mobile money provider code.`
        });
        return;
      }

      // Validate that methodType matches provider type
      if (provider.type !== methodType) {
        res.status(400).json({
          success: false,
          message: `Provider type mismatch. Provider ${provider.name} is of type ${provider.type}, but you specified ${methodType}`
        });
        return;
      }

      // Validate account number format
      const isValidAccountNumber = validateAccountNumber(providerCode, accountNumber);
      if (!isValidAccountNumber) {
        res.status(400).json({
          success: false,
          message: `Invalid account number format for ${provider.name}. ${provider.accountFormat?.label || 'Account number'} should match: ${provider.accountFormat?.example || 'valid format'}`,
          accountFormat: provider.accountFormat
        });
        return;
      }

      // Enhance account details with provider information
      const enhancedAccountDetails = {
        ...accountDetails,
        providerName: provider.name,
        providerType: provider.type,
        currency: provider.currency,
        country: provider.country
      };

      // If setting as default, unset other defaults first
      if (isDefault) {
        await prisma.withdrawalMethod.updateMany({
          where: { userId: parseInt(userId), isDefault: true },
          data: { isDefault: false }
        });
      }

      const method = await prisma.withdrawalMethod.create({
        data: {
          userId: parseInt(userId),
          methodType,
          accountName,
          accountDetails: enhancedAccountDetails,
          isDefault: isDefault || false,
          isVerified: false,
          isApproved: false,
          verificationStatus: 'pending'
        }
      });

      logger.info('Withdrawal method added', 'UnifiedTransactionController', {
        userId,
        methodId: method.id,
        methodType,
        providerCode,
        providerName: provider.name
      });

      // Send email notification to admin for approval
      try {
        const user = await prisma.user.findUnique({
          where: { id: parseInt(userId) },
          select: { email: true, firstName: true, lastName: true }
        });

        if (user) {
          const { BrevoWithdrawalMethodService } = require('../utils/brevo.withdrawal-method');
          const emailService = new BrevoWithdrawalMethodService();

          await emailService.sendAdminNotificationForNewMethod({
            id: method.id,
            userId: parseInt(userId),
            userEmail: user.email,
            userFirstName: user.firstName,
            userLastName: user.lastName,
            methodType,
            accountName,
            accountDetails: enhancedAccountDetails,
            createdAt: method.createdAt
          });

          logger.info('Admin notification sent for new withdrawal method', 'UnifiedTransactionController', {
            methodId: method.id
          });
        }
      } catch (emailError: any) {
        // Don't fail the request if email fails
        logger.error('Failed to send admin notification email', 'UnifiedTransactionController', emailError);
      }

      res.status(201).json({
        success: true,
        message: `${provider.name} withdrawal method added successfully (pending approval)`,
        data: {
          ...method,
          providerInfo: {
            code: provider.code,
            name: provider.name,
            type: provider.type,
            currency: provider.currency
          }
        }
      });
    } catch (error: any) {
      logger.error('Failed to add withdrawal method', 'UnifiedTransactionController', error);
      res.status(500).json({ success: false, message: 'Failed to add withdrawal method', error: error.message });
    }
  }

  /**
   * Update withdrawal method
   * PUT /api/transactions/withdrawal-methods/:id
   */
  async updateWithdrawalMethod(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id;
      const { accountName, accountDetails } = req.body;

      const method = await prisma.withdrawalMethod.update({
        where: { id },
        data: {
          accountName: accountName || undefined,
          accountDetails: accountDetails || undefined,
          verificationStatus: 'pending', // Re-verify after update
          isVerified: false,
          updatedAt: new Date()
        }
      });

      res.status(200).json({
        success: true,
        message: 'Withdrawal method updated successfully (requires re-verification)',
        data: method
      });
    } catch (error: any) {
      logger.error('Failed to update withdrawal method', 'UnifiedTransactionController', error);
      res.status(500).json({ success: false, message: 'Failed to update withdrawal method', error: error.message });
    }
  }

  /**
   * Delete withdrawal method
   * DELETE /api/transactions/withdrawal-methods/:id
   */
  async deleteWithdrawalMethod(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id;

      await prisma.withdrawalMethod.delete({
        where: { id }
      });

      res.status(200).json({
        success: true,
        message: 'Withdrawal method deleted successfully'
      });
    } catch (error: any) {
      logger.error('Failed to delete withdrawal method', 'UnifiedTransactionController', error);
      res.status(500).json({ success: false, message: 'Failed to delete withdrawal method', error: error.message });
    }
  }

  /**
   * Set default withdrawal method
   * PUT /api/transactions/withdrawal-methods/:id/set-default
   */
  async setDefaultWithdrawalMethod(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id;

      const method = await prisma.withdrawalMethod.findUnique({ where: { id } });

      if (!method) {
        res.status(404).json({ success: false, message: 'Withdrawal method not found' });
        return;
      }

      // Unset all other defaults for this user
      await prisma.withdrawalMethod.updateMany({
        where: { userId: method.userId, isDefault: true },
        data: { isDefault: false }
      });

      // Set this as default
      const updated = await prisma.withdrawalMethod.update({
        where: { id },
        data: { isDefault: true, updatedAt: new Date() }
      });

      res.status(200).json({
        success: true,
        message: 'Default withdrawal method updated successfully',
        data: updated
      });
    } catch (error: any) {
      logger.error('Failed to set default withdrawal method', 'UnifiedTransactionController', error);
      res.status(500).json({ success: false, message: 'Failed to set default withdrawal method', error: error.message });
    }
  }

  // ==================== ADMIN: WITHDRAWAL METHOD APPROVAL ====================

  /**
   * Get all pending withdrawal methods (admin only)
   * GET /api/transactions/withdrawal-methods/pending/all
   */
  async getPendingWithdrawalMethods(req: Request, res: Response): Promise<void> {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

      logger.info('Fetching pending withdrawal methods', 'UnifiedTransactionController', { limit, offset });

      const methods = await prisma.withdrawalMethod.findMany({
        where: {
          verificationStatus: 'pending',
          isApproved: false
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              phone: true,
              kycStatus: true
            }
          }
        }
      });

      const total = await prisma.withdrawalMethod.count({
        where: {
          verificationStatus: 'pending',
          isApproved: false
        }
      });

      res.status(200).json({
        success: true,
        count: methods.length,
        total,
        data: methods,
        pagination: {
          limit,
          offset,
          hasMore: offset + limit < total
        }
      });
    } catch (error: any) {
      logger.error('Failed to fetch pending withdrawal methods', 'UnifiedTransactionController', error);
      res.status(500).json({ success: false, message: 'Failed to fetch pending withdrawal methods', error: error.message });
    }
  }

  /**
   * Approve a withdrawal method (admin only)
   * POST /api/transactions/withdrawal-methods/:id/approve
   */
  async approveWithdrawalMethod(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id;
      const { adminId } = req.body;

      if (!adminId) {
        res.status(400).json({ success: false, message: 'Admin ID is required' });
        return;
      }

      const method = await prisma.withdrawalMethod.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true
            }
          }
        }
      });

      if (!method) {
        res.status(404).json({ success: false, message: 'Withdrawal method not found' });
        return;
      }

      if (method.isApproved) {
        res.status(400).json({ success: false, message: 'Withdrawal method is already approved' });
        return;
      }

      const updated = await prisma.withdrawalMethod.update({
        where: { id },
        data: {
          isApproved: true,
          isVerified: true,
          verificationStatus: 'verified',
          approvedBy: parseInt(adminId),
          approvedAt: new Date(),
          updatedAt: new Date()
        }
      });

      logger.info('Withdrawal method approved', 'UnifiedTransactionController', {
        methodId: id,
        userId: method.userId,
        adminId
      });

      // Send approval email notification to user
      try {
        const { BrevoWithdrawalMethodService } = require('../utils/brevo.withdrawal-method');
        const emailService = new BrevoWithdrawalMethodService();

        const accountDetails = method.accountDetails as any;

        await emailService.sendUserApprovalNotification({
          id: method.id,
          userId: method.userId,
          userEmail: method.user.email,
          userFirstName: method.user.firstName,
          userLastName: method.user.lastName,
          methodType: method.methodType,
          accountName: method.accountName,
          accountDetails: accountDetails || {},
          createdAt: method.createdAt,
          approvedBy: adminId.toString(),
          approvedAt: updated.approvedAt || new Date()
        });

        logger.info('User approval notification sent', 'UnifiedTransactionController', {
          methodId: id,
          userEmail: method.user.email
        });
      } catch (emailError: any) {
        // Don't fail the request if email fails
        logger.error('Failed to send user approval notification', 'UnifiedTransactionController', emailError);
      }

      res.status(200).json({
        success: true,
        message: `Withdrawal method approved successfully for ${method.user.firstName} ${method.user.lastName}`,
        data: updated
      });
    } catch (error: any) {
      logger.error('Failed to approve withdrawal method', 'UnifiedTransactionController', error);
      res.status(500).json({ success: false, message: 'Failed to approve withdrawal method', error: error.message });
    }
  }

  /**
   * Reject a withdrawal method (admin only)
   * POST /api/transactions/withdrawal-methods/:id/reject
   */
  async rejectWithdrawalMethod(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id;
      const { adminId, reason } = req.body;

      if (!adminId) {
        res.status(400).json({ success: false, message: 'Admin ID is required' });
        return;
      }

      if (!reason) {
        res.status(400).json({ success: false, message: 'Rejection reason is required' });
        return;
      }

      const method = await prisma.withdrawalMethod.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true
            }
          }
        }
      });

      if (!method) {
        res.status(404).json({ success: false, message: 'Withdrawal method not found' });
        return;
      }

      const updated = await prisma.withdrawalMethod.update({
        where: { id },
        data: {
          isApproved: false,
          isVerified: false,
          verificationStatus: 'rejected',
          rejectedBy: parseInt(adminId),
          rejectedAt: new Date(),
          rejectionReason: reason,
          updatedAt: new Date()
        }
      });

      logger.info('Withdrawal method rejected', 'UnifiedTransactionController', {
        methodId: id,
        userId: method.userId,
        adminId,
        reason
      });

      // Send rejection email notification to user
      try {
        const { BrevoWithdrawalMethodService } = require('../utils/brevo.withdrawal-method');
        const emailService = new BrevoWithdrawalMethodService();

        const accountDetails = method.accountDetails as any;

        await emailService.sendUserRejectionNotification({
          id: method.id,
          userId: method.userId,
          userEmail: method.user.email,
          userFirstName: method.user.firstName,
          userLastName: method.user.lastName,
          methodType: method.methodType,
          accountName: method.accountName,
          accountDetails: accountDetails || {},
          createdAt: method.createdAt,
          rejectedBy: adminId.toString(),
          rejectionReason: reason,
          rejectedAt: updated.rejectedAt || new Date()
        });

        logger.info('User rejection notification sent', 'UnifiedTransactionController', {
          methodId: id,
          userEmail: method.user.email
        });
      } catch (emailError: any) {
        // Don't fail the request if email fails
        logger.error('Failed to send user rejection notification', 'UnifiedTransactionController', emailError);
      }

      res.status(200).json({
        success: true,
        message: `Withdrawal method rejected for ${method.user.firstName} ${method.user.lastName}`,
        data: updated
      });
    } catch (error: any) {
      logger.error('Failed to reject withdrawal method', 'UnifiedTransactionController', error);
      res.status(500).json({ success: false, message: 'Failed to reject withdrawal method', error: error.message });
    }
  }

  // ==================== ACCOUNT INFORMATION ====================

  /**
   * Get user account information (wallet + withdrawal methods + basic info)
   * GET /api/transactions/account/:userId
   */
  async getAccountInfo(req: Request, res: Response): Promise<void> {
    try {
      const userId = parseInt(req.params.userId);

      if (isNaN(userId)) {
        res.status(400).json({ success: false, message: 'Invalid user ID' });
        return;
      }

      // Fetch user info
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          kycStatus: true
        }
      });

      if (!user) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }

      // Fetch wallet
      const wallet = await prisma.wallet.findUnique({
        where: { userId },
        select: {
          balance: true,
          pendingBalance: true,
          currency: true,
          walletNumber: true
        }
      });

      // Fetch withdrawal methods (all, not just approved)
      const withdrawalMethods = await prisma.withdrawalMethod.findMany({
        where: { userId },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          methodType: true,
          accountName: true,
          accountDetails: true,
          isDefault: true,
          isVerified: true,
          isApproved: true,
          verificationStatus: true,
          createdAt: true,
          updatedAt: true
        }
      });

      // Categorize methods
      const approvedMethods = withdrawalMethods.filter(m => m.isApproved);
      const pendingMethods = withdrawalMethods.filter(m => !m.isApproved && m.verificationStatus === 'pending');

      res.status(200).json({
        success: true,
        data: {
          user,
          wallet: wallet ? {
            ...wallet,
            totalBalance: wallet.balance + wallet.pendingBalance,
            availableBalance: wallet.balance
          } : null,
          withdrawalMethods,
          stats: {
            totalWithdrawalMethods: withdrawalMethods.length,
            approvedMethods: approvedMethods.length,
            pendingMethods: pendingMethods.length,
            hasDefaultMethod: withdrawalMethods.some(m => m.isDefault),
            verifiedMethods: withdrawalMethods.filter(m => m.isVerified).length
          }
        }
      });
    } catch (error: any) {
      logger.error('Failed to fetch account info', 'UnifiedTransactionController', error);
      res.status(500).json({ success: false, message: 'Failed to fetch account info', error: error.message });
    }
  }

  // ==================== PROPERTY PAYMENT COLLECTION ====================

  /**
   * Mark property payment as collected (host/owner only)
   * POST /api/transactions/property-payment/collect/:bookingId
   * @body collectedBy - ID of host/admin who collected payment
   * @body collectedAmount - Amount collected in RWF
   */
  async collectPropertyPayment(req: Request, res: Response): Promise<void> {
    try {
      const bookingId = req.params.bookingId;
      const { collectedBy, collectedAmount } = req.body;

      if (!collectedBy) {
        res.status(400).json({
          success: false,
          message: 'Missing required field: collectedBy (host/admin ID)'
        });
        return;
      }

      // Fetch booking to verify it exists and is a property payment
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        include: {
          property: {
            select: {
              id: true,
              name: true,
              hostId: true
            }
          },
          guest: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });

      if (!booking) {
        res.status(404).json({
          success: false,
          message: 'Booking not found'
        });
        return;
      }

      if (booking.paymentMethod !== 'property' || !booking.payAtProperty) {
        res.status(400).json({
          success: false,
          message: 'This booking is not set for property payment'
        });
        return;
      }

      if (booking.propertyPaymentCollected) {
        res.status(400).json({
          success: false,
          message: 'Property payment has already been collected'
        });
        return;
      }

      // Verify the collectedBy user is the property owner
      if (booking.property.hostId !== parseInt(collectedBy)) {
        logger.warn('Unauthorized attempt to collect property payment', 'UnifiedTransactionController', {
          bookingId,
          propertyOwnerId: booking.property.hostId,
          attemptedBy: collectedBy
        });
        // Still allow admin to collect, but log the warning
      }

      const amount = collectedAmount ? parseFloat(collectedAmount) : booking.totalPrice;

      // Update booking
      const updatedBooking = await prisma.booking.update({
        where: { id: bookingId },
        data: {
          propertyPaymentCollected: true,
          propertyPaymentCollectedAt: new Date(),
          propertyPaymentCollectedBy: parseInt(collectedBy),
          propertyPaymentAmount: amount,
          paymentStatus: 'collected'
        }
      });

      // Update transaction status
      if (booking.transactionId) {
        await prisma.transaction.update({
          where: { id: booking.transactionId },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            metadata: {
              ...((booking as any).metadata || {}),
              collectedBy,
              collectedAt: new Date().toISOString(),
              collectedAmount: amount
            }
          }
        });
      }

      logger.info('Property payment collected', 'UnifiedTransactionController', {
        bookingId,
        propertyId: booking.property.id,
        collectedBy,
        amount
      });

      res.status(200).json({
        success: true,
        message: 'Property payment marked as collected successfully',
        data: {
          bookingId: updatedBooking.id,
          propertyPaymentCollected: true,
          collectedAt: updatedBooking.propertyPaymentCollectedAt,
          collectedBy: updatedBooking.propertyPaymentCollectedBy,
          collectedAmount: amount,
          paymentStatus: updatedBooking.paymentStatus
        }
      });
    } catch (error: any) {
      logger.error('Failed to collect property payment', 'UnifiedTransactionController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to mark property payment as collected',
        error: error.message
      });
    }
  }

  /**
   * Get pending property payments for a host
   * GET /api/transactions/property-payments/pending/:hostId
   */
  async getPendingPropertyPayments(req: Request, res: Response): Promise<void> {
    try {
      const hostId = parseInt(req.params.hostId);

      if (isNaN(hostId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid host ID'
        });
        return;
      }

      const pendingPayments = await prisma.booking.findMany({
        where: {
          property: {
            hostId
          },
          payAtProperty: true,
          propertyPaymentCollected: false,
          paymentStatus: 'pending_property'
        },
        include: {
          property: {
            select: {
              id: true,
              name: true,
              location: true
            }
          },
          guest: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true
            }
          }
        },
        orderBy: {
          checkIn: 'asc'
        }
      });

      res.status(200).json({
        success: true,
        count: pendingPayments.length,
        data: pendingPayments
      });
    } catch (error: any) {
      logger.error('Failed to fetch pending property payments', 'UnifiedTransactionController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch pending property payments',
        error: error.message
      });
    }
  }

  /**
   * Get user bonuses (list all bonuses for a user)
   */
  async getUserBonuses(req: Request, res: Response): Promise<void> {
    try {
      const userId = parseInt(req.params.userId);

      if (isNaN(userId)) {
        res.status(400).json({ success: false, message: 'Invalid user ID' });
        return;
      }

      const bonuses = await prisma.bonus.findMany({
        where: { userId },
        include: {
          property: {
            select: {
              id: true,
              name: true,
              location: true,
              images: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      const summary = {
        totalBonuses: bonuses.length,
        totalPending: bonuses.filter(b => b.status === 'pending').length,
        totalClaimed: bonuses.filter(b => b.status === 'claimed').length,
        totalExpired: bonuses.filter(b => b.status === 'expired').length,
        totalAmountPending: bonuses.filter(b => b.status === 'pending').reduce((sum, b) => sum + b.amount, 0),
        totalAmountClaimed: bonuses.filter(b => b.status === 'claimed').reduce((sum, b) => sum + b.amount, 0)
      };

      res.status(200).json({
        success: true,
        data: {
          bonuses: bonuses.map(b => ({
            id: b.id,
            amount: b.amount,
            currency: b.currency,
            sourceType: b.sourceType,
            sourceId: b.sourceId,
            propertyId: b.propertyId,
            property: b.property ? {
              id: b.property.id,
              name: b.property.name,
              location: b.property.location,
              image: b.property.images ? (Array.isArray(b.property.images) ? b.property.images[0] : null) : null
            } : null,
            description: b.description,
            status: b.status,
            claimedAt: b.claimedAt,
            expiresAt: b.expiresAt,
            metadata: b.metadata,
            createdAt: b.createdAt
          })),
          summary
        }
      });
    } catch (error) {
      logger.error('Error getting user bonuses', 'UnifiedTransactionController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get user bonuses',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get wallet history with bonuses included
   */
  async getWalletHistoryWithBonuses(req: Request, res: Response): Promise<void> {
    try {
      const userId = parseInt(req.params.userId);

      if (isNaN(userId)) {
        res.status(400).json({ success: false, message: 'Invalid user ID' });
        return;
      }

      // Get wallet
      const wallet = await prisma.wallet.findUnique({
        where: { userId }
      });

      if (!wallet) {
        res.status(404).json({ success: false, message: 'Wallet not found' });
        return;
      }

      // Get wallet transactions
      const walletTransactions = await prisma.walletTransaction.findMany({
        where: { walletId: wallet.id },
        orderBy: { createdAt: 'desc' },
        take: 50 // Limit to last 50 transactions
      });

      // Get bonuses
      const bonuses = await prisma.bonus.findMany({
        where: { userId },
        include: {
          property: {
            select: {
              id: true,
              name: true,
              location: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      res.status(200).json({
        success: true,
        data: {
          wallet: {
            balance: wallet.balance,
            pendingBalance: wallet.pendingBalance,
            currency: wallet.currency,
            isActive: wallet.isActive
          },
          transactions: walletTransactions.map(t => ({
            id: t.id,
            type: t.type,
            amount: t.amount,
            balanceBefore: t.balanceBefore,
            balanceAfter: t.balanceAfter,
            reference: t.reference,
            description: t.description,
            transactionId: t.transactionId,
            createdAt: t.createdAt
          })),
          bonuses: bonuses.map(b => ({
            id: b.id,
            amount: b.amount,
            currency: b.currency,
            sourceType: b.sourceType,
            sourceId: b.sourceId,
            propertyId: b.propertyId,
            property: b.property ? {
              id: b.property.id,
              name: b.property.name,
              location: b.property.location
            } : null,
            description: b.description,
            status: b.status,
            claimedAt: b.claimedAt,
            expiresAt: b.expiresAt,
            createdAt: b.createdAt
          }))
        }
      });
    } catch (error) {
      logger.error('Error getting wallet history with bonuses', 'UnifiedTransactionController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get wallet history',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Claim a bonus (mark as claimed and add to wallet if not already claimed)
   */
  async claimBonus(req: Request, res: Response): Promise<void> {
    try {
      const { bonusId } = req.params;
      const userId = (req as any).user?.id;

      if (!userId) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
      }

      // Get bonus
      const bonus = await prisma.bonus.findUnique({
        where: { id: bonusId }
      });

      if (!bonus) {
        res.status(404).json({ success: false, message: 'Bonus not found' });
        return;
      }

      // Check if bonus belongs to user
      if (bonus.userId !== userId) {
        res.status(403).json({ success: false, message: 'This bonus does not belong to you' });
        return;
      }

      // Check if already claimed
      if (bonus.status === 'claimed') {
        res.status(400).json({ success: false, message: 'Bonus already claimed' });
        return;
      }

      // Check if expired
      if (bonus.expiresAt && bonus.expiresAt < new Date()) {
        // Mark as expired
        await prisma.bonus.update({
          where: { id: bonusId },
          data: { status: 'expired' }
        });
        res.status(400).json({ success: false, message: 'Bonus has expired' });
        return;
      }

      // Note: For address unlock bonuses, wallet is already funded when created (status = 'claimed')
      // This endpoint is for future use where bonuses might be created as 'pending'
      // and need to be manually claimed

      // Mark bonus as claimed
      const updatedBonus = await prisma.bonus.update({
        where: { id: bonusId },
        data: {
          status: 'claimed',
          claimedAt: new Date()
        }
      });

      res.status(200).json({
        success: true,
        message: 'Bonus claimed successfully',
        data: {
          bonus: updatedBonus
        }
      });
    } catch (error) {
      logger.error('Error claiming bonus', 'UnifiedTransactionController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to claim bonus',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

export const unifiedTransactionController = new UnifiedTransactionController();
