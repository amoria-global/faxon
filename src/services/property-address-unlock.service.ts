// src/services/property-address-unlock.service.ts - Property Address Unlock Service with Payment Integration

import { PrismaClient, Prisma } from '@prisma/client';
import { addressUnlockFeeUtility } from '../utils/address-unlock-fee.utility';
import { logger } from '../utils/logger';
import { PawaPayService } from './pawapay.service';
import { XentriPayService } from './xentripay.service';
import { CurrencyExchangeService } from './currency-exchange.service';
import { DepositRequest } from '../types/pawapay.types';

const prisma = new PrismaClient();

export interface UnlockAddressRequest {
  propertyId: number;
  userId: number;
  paymentMethod: 'non_refundable_fee' | 'three_month_30_percent';
  paymentAmountUSD: number; // Frontend sends USD only
  dealCode?: string;

  // Payment details
  paymentType: 'momo' | 'cc'; // Mobile money or credit card

  // For mobile money (momo)
  phoneNumber?: string; // Phone number for mobile money
  momoProvider?: 'MTN' | 'AIRTEL' | 'ORANGE' | 'VODACOM'; // MoMo provider
  countryCode?: string; // ISO country code (e.g., 'RW', 'UG', 'KE', 'TZ', 'ZM', 'BF', 'BJ', 'CI', 'GH', 'SN', 'CM')

  // For credit card (cc) - user data fetched from authenticated session, not from request body
  // Optional redirect URL for card payments (user will be redirected here after payment)
  redirectUrl?: string;
}

export interface InitiateUnlockPaymentResponse {
  success: boolean;
  message: string;
  data?: {
    unlockId: string;
    transactionReference: string;
    paymentStatus: string;
    amountRWF: number;
    amountUSD: number;
    paymentType: 'momo' | 'cc';
    paymentUrl?: string; // For card payments - user redirects here
    expiresAt?: Date;
  };
  errors?: string[];
}

export interface UnlockAddressResponse {
  success: boolean;
  message: string;
  data?: {
    unlockId: string;
    propertyId: number;
    address: string;
    googleMapsUrl: string;
    hostContactInfo: {
      hostId: number;
      hostName: string;
      hostPhone: string | null;
      hostEmail: string | null;
      hostProfileImage: string | null;
      preferredContactMethod: string | null;
    };
    unlockedAt: Date;
    paymentMethod: string;
  };
  errors?: string[];
}

export interface DealCodeValidationResult {
  valid: boolean;
  dealCodeId?: number;
  reason?: string;
}

export interface AppreciationSubmission {
  unlockId: string;
  propertyId: number;
  userId: number;
  appreciationLevel: 'appreciated' | 'neutral' | 'not_appreciated';
  feedback?: string;
}

export class PropertyAddressUnlockService {
  private pawapayService: PawaPayService;
  private xentripayService: XentriPayService;
  private currencyService: CurrencyExchangeService;

  constructor() {
    this.pawapayService = new PawaPayService({});
    this.currencyService = new CurrencyExchangeService();
    // Initialize XentriPay for card payments
    this.xentripayService = new XentriPayService({
      apiKey: process.env.XENTRIPAY_API_KEY || '',
      baseUrl: process.env.XENTRIPAY_BASE_URL || 'https://xentripay.com',
      environment: (process.env.XENTRIPAY_ENVIRONMENT as 'production' | 'sandbox') || 'production'
    });
  }

  /**
   * Initiate unlock payment (Step 1: Create unlock record and initiate payment)
   */
  async initiateUnlockPayment(request: UnlockAddressRequest): Promise<InitiateUnlockPaymentResponse> {
    try {
      logger.info('Initiating unlock payment', 'PropertyAddressUnlock', {
        propertyId: request.propertyId,
        userId: request.userId,
        paymentMethod: request.paymentMethod
      });

      // 1. Check if already unlocked or has pending payment
      const existingUnlock = await prisma.propertyAddressUnlock.findUnique({
        where: {
          userId_propertyId: {
            userId: request.userId,
            propertyId: request.propertyId
          }
        }
      });

      if (existingUnlock) {
        if (existingUnlock.paymentStatus === 'COMPLETED') {
          // Allow re-unlock with deal code (user wants updated info)
          if (!request.dealCode) {
            return {
              success: false,
              message: 'Property already unlocked',
              errors: ['You have already unlocked this property']
            };
          }

          // If using deal code, delete old unlock and create new one
          logger.info('Deleting existing unlock to allow deal code re-unlock', 'PropertyAddressUnlock', {
            unlockId: existingUnlock.unlockId,
            userId: request.userId,
            propertyId: request.propertyId
          });

          await prisma.propertyAddressUnlock.delete({
            where: {
              userId_propertyId: {
                userId: request.userId,
                propertyId: request.propertyId
              }
            }
          });
        }

        // If payment is pending or submitted, return existing transaction
        if (existingUnlock.paymentStatus === 'PENDING' || existingUnlock.paymentStatus === 'SUBMITTED') {
          // Determine payment type from provider
          const paymentType = existingUnlock.paymentProvider?.includes('XENTRIPAY') ? 'cc' : 'momo';

          // For card payments (XentriPay), include the payment URL
          const paymentUrl = existingUnlock.paymentUrl || undefined;

          return {
            success: true,
            message: 'Payment already initiated',
            data: {
              unlockId: existingUnlock.unlockId,
              transactionReference: existingUnlock.transactionReference!,
              paymentStatus: existingUnlock.paymentStatus,
              amountRWF: Number(existingUnlock.paymentAmountRwf),
              amountUSD: Number(existingUnlock.paymentAmountUsd),
              paymentType: paymentType as 'momo' | 'cc',
              paymentUrl // Include payment URL for card payments
            }
          };
        }

        // If payment failed, delete the old record and allow retry
        if (existingUnlock.paymentStatus === 'FAILED') {
          logger.info('Deleting failed unlock record to allow retry', 'PropertyAddressUnlock', {
            unlockId: existingUnlock.unlockId,
            previousTransactionRef: existingUnlock.transactionReference
          });

          await prisma.propertyAddressUnlock.delete({
            where: {
              userId_propertyId: {
                userId: request.userId,
                propertyId: request.propertyId
              }
            }
          });
        }
      }

      // 2. Verify property exists
      const property = await prisma.property.findUnique({
        where: { id: request.propertyId },
        include: { host: true }
      });

      if (!property) {
        return {
          success: false,
          message: 'Property not found',
          errors: ['The specified property does not exist']
        };
      }

      let dealCodeId: number | null = null;

      // 3. Process deal code if provided (no payment needed)
      if (request.dealCode) {
        const dealCodeResult = await this.validateAndUseDealCode(
          request.dealCode,
          request.userId,
          request.propertyId
        );

        if (!dealCodeResult.valid) {
          return {
            success: false,
            message: 'Invalid deal code',
            errors: [dealCodeResult.reason || 'Deal code validation failed']
          };
        }

        dealCodeId = dealCodeResult.dealCodeId!;

        // Create unlock with deal code (no payment needed)
        const unlockId = addressUnlockFeeUtility.generateUnlockId();
        const unlock = await prisma.propertyAddressUnlock.create({
          data: {
            unlockId,
            propertyId: request.propertyId,
            userId: request.userId,
            paymentMethod: request.paymentMethod,
            paymentAmountRwf: new Prisma.Decimal(0),
            paymentAmountUsd: new Prisma.Decimal(0),
            exchangeRate: new Prisma.Decimal(0), // No exchange rate for deal codes
            dealCodeId,
            paymentStatus: 'COMPLETED',
            paymentProvider: 'DEAL_CODE',
            unlockedAt: new Date()
          }
        });

        // Decrement deal code remaining unlocks AFTER successful unlock creation
        await prisma.dealCode.update({
          where: { id: dealCodeId },
          data: {
            remainingUnlocks: { decrement: 1 }
          }
        });

        await this.recordDealCodeUsage(dealCodeId, unlockId, request.propertyId, request.userId);

        // Fetch the full unlock data with property and host info
        const fullUnlock = await prisma.propertyAddressUnlock.findUnique({
          where: { unlockId },
          include: {
            property: {
              include: { host: true }
            }
          }
        });

        return {
          success: true,
          message: 'Property unlocked with deal code',
          data: {
            unlockId: unlock.unlockId,
            transactionReference: 'DEAL_CODE',
            paymentStatus: 'COMPLETED',
            amountRWF: 0,
            amountUSD: 0,
            paymentType: request.paymentType || 'momo',
            // Include unlock data (address, host contact) since payment is COMPLETED
            ...this.formatUnlockData(fullUnlock!)
          }
        };
      }

      // 4. Fetch current exchange rate (USD to RWF)
      const exchangeRateData = await this.currencyService.getExchangeRate('USD', 'RWF');
      const exchangeRate = exchangeRateData.base; // Extract base rate

      logger.info('Fetched exchange rate', 'PropertyAddressUnlock', {
        exchangeRate,
        paymentAmountUSD: request.paymentAmountUSD
      });

      // 5. Convert USD to RWF
      let paymentAmountRWF = Math.round(request.paymentAmountUSD * exchangeRate);

      // 6. Calculate payment amount based on payment method (monthly properties only)
      if (request.paymentMethod === 'non_refundable_fee') {
        // Non-refundable fee: Only for monthly properties
        // < $300/month → 8,000 RWF
        // ≥ $300/month → 15,000 RWF
        // No validation, just charge based on DB price

        if (!property.pricePerMonth) {
          return {
            success: false,
            message: 'This property does not support non-refundable fee method',
            errors: ['Non-refundable fee is only available for monthly properties']
          };
        }

        const monthlyPrice = property.pricePerMonth;
        const correctFeeRWF = monthlyPrice < 300 ? 8000 : 15000;

        // Override the payment amount with the correct fee from DB
        paymentAmountRWF = correctFeeRWF;

        logger.info('Non-refundable fee calculated', 'PropertyAddressUnlock', {
          monthlyPrice,
          tier: correctFeeRWF === 8000 ? '8k (<$300/month)' : '15k (≥$300/month)',
          chargedAmountRWF: correctFeeRWF
        });
      } else {
        // For three_month_30_percent: Only for monthly properties
        // Calculate: 30% of (monthly price with 14% tax × 3 months)
        // No validation, just process based on DB

        if (!property.pricePerMonth) {
          return {
            success: false,
            message: 'This property does not support 30% of 3 months method',
            errors: ['30% of 3 months is only available for monthly properties']
          };
        }

        const monthlyPrice = property.pricePerMonth;
        // Add 14% tax to monthly price first
        const monthlyPriceWithTax = monthlyPrice * 1.14;
        // Calculate 3 months
        const threeMonthsWithTax = monthlyPriceWithTax * 3;
        // Take 30%
        const expectedAmountUSD = threeMonthsWithTax * 0.3;
        const expectedAmountRWF = Math.round(expectedAmountUSD * exchangeRate);

        // Override the payment amount with the calculated amount from DB
        paymentAmountRWF = expectedAmountRWF;

        logger.info('30% of 3 months calculated', 'PropertyAddressUnlock', {
          monthlyPrice,
          monthlyPriceWithTax,
          threeMonthsWithTax,
          thirtyPercent: expectedAmountUSD,
          chargedAmountRWF: expectedAmountRWF
        });
      }

      // 7. Generate unlock ID and transaction reference
      const unlockId = addressUnlockFeeUtility.generateUnlockId();
      const transactionReference = `UNLOCK-${Date.now()}-${request.userId}-${request.propertyId}`;

      // 8. Determine payment provider based on payment type
      const paymentProvider = request.paymentType === 'cc' ? 'XENTRIPAY_CARD' :
                            request.momoProvider ? `${request.momoProvider}_${request.countryCode || 'RW'}` :
                            'MTN_RW';

      // 9. Create unlock record with pending payment
      await prisma.propertyAddressUnlock.create({
        data: {
          unlockId,
          propertyId: request.propertyId,
          userId: request.userId,
          paymentMethod: request.paymentMethod,
          paymentAmountRwf: new Prisma.Decimal(paymentAmountRWF),
          paymentAmountUsd: new Prisma.Decimal(request.paymentAmountUSD),
          exchangeRate: new Prisma.Decimal(exchangeRate),
          transactionReference,
          paymentStatus: 'PENDING',
          paymentProvider
        }
      });

      // 10. Initiate payment based on type
      try {
        if (request.paymentType === 'cc') {
          // CARD PAYMENT via XentriPay
          // Fetch user details from database (don't accept from request body for security)
          const user = await prisma.user.findUnique({
            where: { id: request.userId },
            select: {
              email: true,
              firstName: true,
              lastName: true,
              phone: true
            }
          });

          if (!user || !user.email) {
            throw new Error('User not found or email not available');
          }

          const customerName = `${user.firstName} ${user.lastName}`;
          const customerEmail = user.email;

          // For card payments, XentriPay still requires valid phone numbers even though it's a card transaction
          // Use user's phone from database, or use a Rwanda default if not available
          let phoneNumber = user.phone || request.phoneNumber;

          if (!phoneNumber) {
            // If no phone provided, use a valid Rwanda mobile number format
            // XentriPay requires real-looking numbers, not all zeros
            phoneNumber = '0788123456'; // Valid MTN Rwanda format
            logger.warn('No phone number provided for card payment, using default', 'PropertyAddressUnlock', {
              unlockId,
              email: customerEmail,
              userId: request.userId
            });
          }

          // Ensure cnumber is exactly 10 digits starting with 0
          let cnumber = phoneNumber;
          if (!cnumber.startsWith('0')) {
            // If it starts with country code, extract last 9 digits and add 0
            cnumber = '0' + cnumber.slice(-9);
          }
          // Ensure it's exactly 10 digits
          if (cnumber.length !== 10) {
            cnumber = '0788123456'; // Fallback to valid format
          }

          // Ensure msisdn has country code (no +)
          let msisdn = phoneNumber;
          if (msisdn.startsWith('0')) {
            // Add Rwanda country code
            msisdn = '250' + msisdn.substring(1);
          } else if (msisdn.startsWith('+')) {
            // Remove + sign
            msisdn = msisdn.substring(1);
          } else if (!msisdn.startsWith('250')) {
            // Assume Rwanda if no country code
            msisdn = '250' + msisdn;
          }

          logger.debug('Card payment phone number formatting', 'PropertyAddressUnlock', {
            originalPhone: user.phone || request.phoneNumber,
            cnumber,
            msisdn,
            customerEmail,
            customerName
          });

          const collectionRequest = {
            email: customerEmail,
            cname: customerName,
            amount: request.paymentAmountUSD, // XentriPay service will convert USD to RWF internally
            cnumber, // 10 digits with leading 0 (e.g., "0788123456")
            msisdn, // Full international format without + (e.g., "250788123456")
            currency: 'USD', // XentriPay service handles conversion to RWF
            pmethod: 'cc',
            chargesIncluded: true,
            description: `Property unlock: ${property.name}`,
            internalReference: transactionReference,
            redirecturl: request.redirectUrl || `${process.env.FRONTEND_URL}/properties/${property.id}/unlock-success`
          };

          const xentripayResponse = await this.xentripayService.initiateCollection(collectionRequest);

          // Update unlock with XentriPay response
          await prisma.propertyAddressUnlock.update({
            where: { unlockId },
            data: {
              paymentStatus: 'PENDING',
              transactionReference: xentripayResponse.refid, // Use XentriPay refid
              paymentUrl: xentripayResponse.url // Store payment URL for later retrieval
            }
          });

          logger.info('Card payment initiated via XentriPay', 'PropertyAddressUnlock', {
            unlockId,
            refid: xentripayResponse.refid,
            paymentUrl: xentripayResponse.url
          });

          return {
            success: true,
            message: 'Card payment initiated - redirect user to payment URL',
            data: {
              unlockId,
              transactionReference: xentripayResponse.refid,
              paymentStatus: 'PENDING',
              amountRWF: paymentAmountRWF,
              amountUSD: request.paymentAmountUSD,
              paymentType: 'cc',
              paymentUrl: xentripayResponse.url // User must visit this URL to complete payment
            }
          };
        } else {
          // MOBILE MONEY via PawaPay
          if (!request.phoneNumber) {
            throw new Error('Phone number is required for mobile money payments');
          }

          // Map provider to PawaPay format
          const pawapayProvider = this.mapToPawapayProvider(
            request.momoProvider || 'MTN',
            request.countryCode || 'RW'
          );

          // Statement description must be 4-22 characters for PawaPay
          // "Unlock: " = 8 chars, so we have 14 chars left for property name
          const maxPropertyNameLength = 14;
          const propertyNameTruncated = property.name.length > maxPropertyNameLength
            ? property.name.substring(0, maxPropertyNameLength)
            : property.name;

          const depositRequest: DepositRequest = {
            depositId: transactionReference,
            amount: paymentAmountRWF.toString(),
            currency: 'RWF',
            payer: {
              type: 'MMO',
              accountDetails: {
                phoneNumber: request.phoneNumber,
                provider: pawapayProvider
              }
            },
            customerTimestamp: new Date().toISOString(),
            statementDescription: `Unlock: ${propertyNameTruncated}`, // Max 22 chars total
            metadata: [
              { fieldName: 'unlockId', fieldValue: unlockId, isPII: false },
              { fieldName: 'propertyId', fieldValue: request.propertyId.toString(), isPII: false },
              { fieldName: 'userId', fieldValue: request.userId.toString(), isPII: true }
            ]
          };

          const paymentResponse = await this.pawapayService.initiateDeposit(depositRequest);

          // Update unlock with payment response
          await prisma.propertyAddressUnlock.update({
            where: { unlockId },
            data: {
              paymentStatus: paymentResponse.status || 'SUBMITTED'
            }
          });

          logger.info('Mobile money payment initiated via PawaPay', 'PropertyAddressUnlock', {
            unlockId,
            transactionReference,
            paymentStatus: paymentResponse.status,
            provider: pawapayProvider
          });

          return {
            success: true,
            message: 'Mobile money payment initiated successfully',
            data: {
              unlockId,
              transactionReference,
              paymentStatus: paymentResponse.status || 'SUBMITTED',
              amountRWF: paymentAmountRWF,
              amountUSD: request.paymentAmountUSD,
              paymentType: 'momo'
            }
          };
        }
      } catch (paymentError) {
        logger.error('Payment initiation failed', 'PropertyAddressUnlock', {
          error: paymentError instanceof Error ? paymentError.message : 'Unknown error',
          unlockId,
          transactionReference,
          paymentType: request.paymentType
        });

        // Update unlock as failed
        await prisma.propertyAddressUnlock.update({
          where: { unlockId },
          data: {
            paymentStatus: 'FAILED'
          }
        });

        return {
          success: false,
          message: 'Payment initiation failed',
          errors: [paymentError instanceof Error ? paymentError.message : 'Payment service error']
        };
      }
    } catch (error) {
      logger.error('Error initiating unlock payment', 'PropertyAddressUnlock', {
        error: error instanceof Error ? error.message : 'Unknown error',
        request
      });

      return {
        success: false,
        message: 'Failed to initiate unlock payment',
        errors: [error instanceof Error ? error.message : 'Internal server error']
      };
    }
  }

  /**
   * Process payment callback (called by webhook/status poller)
   */
  async processPaymentCallback(transactionReference: string, status: string): Promise<void> {
    try {
      logger.info('Processing payment callback', 'PropertyAddressUnlock', {
        transactionReference,
        status
      });

      const unlock = await prisma.propertyAddressUnlock.findUnique({
        where: { transactionReference }
      });

      if (!unlock) {
        logger.warn('Unlock not found for transaction', 'PropertyAddressUnlock', {
          transactionReference
        });
        return;
      }

      // Update payment status
      const updatedUnlock = await prisma.propertyAddressUnlock.update({
        where: { transactionReference },
        data: {
          paymentStatus: status,
          unlockedAt: status === 'COMPLETED' ? new Date() : unlock.unlockedAt
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true
            }
          },
          property: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });

      logger.info('Payment status updated', 'PropertyAddressUnlock', {
        transactionReference,
        status,
        unlocked: status === 'COMPLETED'
      });

      // Send admin notification for completed unlock payment
      if (status === 'COMPLETED') {
        try {
          const { adminNotifications } = await import('../utils/admin-notifications.js');
          const paymentMethodDisplay = updatedUnlock.paymentProvider?.includes('PawaPay')
            ? 'Mobile Money'
            : updatedUnlock.paymentProvider?.includes('XentriPay')
            ? 'Credit Card'
            : updatedUnlock.paymentMethod || 'Unknown';

          await adminNotifications.sendUnlockPaymentNotification({
            unlockId: updatedUnlock.id,
            user: {
              id: updatedUnlock.user.id,
              email: updatedUnlock.user.email,
              firstName: updatedUnlock.user.firstName || 'User',
              lastName: updatedUnlock.user.lastName || ''
            },
            property: {
              id: updatedUnlock.property.id,
              name: updatedUnlock.property.name
            },
            amount: Number(updatedUnlock.paymentAmountRwf),
            currency: 'RWF',
            paymentMethod: paymentMethodDisplay
          });
        } catch (adminNotifError) {
          logger.error('Failed to send admin notification for unlock payment', 'PropertyAddressUnlock', {
            error: adminNotifError instanceof Error ? adminNotifError.message : 'Unknown error',
            unlockId: updatedUnlock.id
          });
          // Don't fail the payment completion if admin notification fails
        }
      }
    } catch (error) {
      logger.error('Error processing payment callback', 'PropertyAddressUnlock', {
        error: error instanceof Error ? error.message : 'Unknown error',
        transactionReference
      });
    }
  }

  /**
   * Get unlock status (returns unlock data if payment is completed)
   */
  async getUnlockStatus(propertyId: number, userId: number): Promise<UnlockAddressResponse> {
    try {
      const unlock = await prisma.propertyAddressUnlock.findUnique({
        where: {
          userId_propertyId: {
            userId,
            propertyId
          }
        },
        include: {
          property: {
            include: { host: true }
          }
        }
      });

      if (!unlock) {
        return {
          success: true,
          message: 'Property not unlocked',
          data: undefined
        };
      }

      // Only return full data if payment is completed
      if (unlock.paymentStatus !== 'COMPLETED') {
        return {
          success: true,
          message: `Payment ${unlock.paymentStatus.toLowerCase()}`,
          data: undefined
        };
      }

      return {
        success: true,
        message: 'Property unlock status retrieved',
        data: this.formatUnlockData(unlock)
      };
    } catch (error) {
      logger.error('Error checking unlock status', 'PropertyAddressUnlock', {
        error: error instanceof Error ? error.message : 'Unknown error',
        propertyId,
        userId
      });

      return {
        success: false,
        message: 'Failed to check unlock status',
        errors: [error instanceof Error ? error.message : 'Internal server error']
      };
    }
  }

  /**
   * Check payment status
   */
  async checkPaymentStatus(unlockId: string): Promise<{
    success: boolean;
    data: {
      unlockId: string;
      paymentStatus: string;
      transactionReference: string | null;
      canRetry: boolean;
    };
  }> {
    const unlock = await prisma.propertyAddressUnlock.findUnique({
      where: { unlockId }
    });

    if (!unlock) {
      throw new Error('Unlock not found');
    }

    return {
      success: true,
      data: {
        unlockId: unlock.unlockId,
        paymentStatus: unlock.paymentStatus,
        transactionReference: unlock.transactionReference,
        canRetry: ['FAILED', 'CANCELLED'].includes(unlock.paymentStatus)
      }
    };
  }

  /**
   * Submit appreciation feedback
   */
  async submitAppreciation(submission: AppreciationSubmission): Promise<{
    success: boolean;
    message: string;
    data?: {
      dealCode?: {
        code: string;
        userId: number;
        generatedAt: Date;
        expiresAt: Date;
        remainingUnlocks: number;
        isActive: boolean;
        sourcePropertyId: number;
      };
    };
    errors?: string[];
  }> {
    try {
      logger.info('Submitting appreciation', 'PropertyAddressUnlock', submission);

      const unlock = await prisma.propertyAddressUnlock.findFirst({
        where: {
          unlockId: submission.unlockId,
          userId: submission.userId
        }
      });

      if (!unlock) {
        return {
          success: false,
          message: 'Unlock not found',
          errors: ['No unlock found for this user and property']
        };
      }

      if (unlock.paymentStatus !== 'COMPLETED') {
        return {
          success: false,
          message: 'Payment not completed',
          errors: ['Cannot submit appreciation until payment is completed']
        };
      }

      if (unlock.appreciationSubmitted) {
        return {
          success: false,
          message: 'Appreciation already submitted',
          errors: ['You have already submitted appreciation for this unlock']
        };
      }

      await prisma.propertyAddressUnlock.update({
        where: { unlockId: submission.unlockId },
        data: {
          appreciationSubmitted: true,
          appreciationLevel: submission.appreciationLevel,
          appreciationFeedback: submission.feedback,
          appreciationSubmittedAt: new Date()
        }
      });

      let dealCode: any = undefined;

      // Generate deal code for 'not_appreciated' OR 'neutral' (only for 30% payment method)
      if (
        (submission.appreciationLevel === 'not_appreciated' || submission.appreciationLevel === 'neutral') &&
        unlock.paymentMethod === 'three_month_30_percent'
      ) {
        const code = addressUnlockFeeUtility.generateDealCode();
        const expiresAt = addressUnlockFeeUtility.getDealCodeExpiry();

        const createdDealCode = await prisma.dealCode.create({
          data: {
            code,
            userId: submission.userId,
            sourcePropertyId: submission.propertyId,
            expiresAt
          }
        });

        dealCode = {
          code: createdDealCode.code,
          userId: createdDealCode.userId,
          generatedAt: createdDealCode.generatedAt,
          expiresAt: createdDealCode.expiresAt,
          remainingUnlocks: createdDealCode.remainingUnlocks,
          isActive: createdDealCode.isActive,
          sourcePropertyId: createdDealCode.sourcePropertyId
        };

        logger.info('Deal code generated for appreciation feedback', 'PropertyAddressUnlock', {
          unlockId: submission.unlockId,
          appreciationLevel: submission.appreciationLevel,
          dealCode: code
        });
      }

      return {
        success: true,
        message: dealCode
          ? 'Appreciation feedback submitted successfully. Deal code generated for future unlocks.'
          : 'Appreciation feedback submitted successfully',
        data: {
          dealCode
        }
      };
    } catch (error) {
      logger.error('Error submitting appreciation', 'PropertyAddressUnlock', {
        error: error instanceof Error ? error.message : 'Unknown error',
        submission
      });

      return {
        success: false,
        message: 'Failed to submit appreciation',
        errors: [error instanceof Error ? error.message : 'Internal server error']
      };
    }
  }

  /**
   * Get all deal codes for a user
   */
  async getUserDealCodes(userId: number): Promise<{
    success: boolean;
    message: string;
    data: {
      totalDealCodes: number;
      activeDealCodes: number;
      dealCodes: any[];
    };
  }> {
    try {
      const dealCodes = await prisma.dealCode.findMany({
        where: {
          userId
        },
        include: {
          sourceProperty: {
            select: {
              id: true,
              name: true,
              location: true,
              images: true
            }
          },
          usage: {
            include: {
              property: {
                select: {
                  id: true,
                  name: true,
                  location: true
                }
              }
            },
            orderBy: {
              usedAt: 'desc'
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      const now = new Date();
      const activeDealCodes = dealCodes.filter(
        dc => dc.isActive && dc.remainingUnlocks > 0 && dc.expiresAt > now
      );

      const formattedDealCodes = dealCodes.map(dc => ({
        id: dc.id,
        code: dc.code,
        remainingUnlocks: dc.remainingUnlocks,
        isActive: dc.isActive,
        generatedAt: dc.generatedAt,
        expiresAt: dc.expiresAt,
        isExpired: dc.expiresAt < now,
        isValid: dc.isActive && dc.remainingUnlocks > 0 && dc.expiresAt > now,
        sourceProperty: {
          id: dc.sourceProperty.id,
          name: dc.sourceProperty.name,
          location: dc.sourceProperty.location,
          image: dc.sourceProperty.images ? (Array.isArray(dc.sourceProperty.images) ? dc.sourceProperty.images[0] : null) : null
        },
        usageHistory: dc.usage.map(u => ({
          propertyId: u.property.id,
          propertyName: u.property.name,
          propertyLocation: u.property.location,
          usedAt: u.usedAt
        }))
      }));

      return {
        success: true,
        message: 'User deal codes retrieved successfully',
        data: {
          totalDealCodes: dealCodes.length,
          activeDealCodes: activeDealCodes.length,
          dealCodes: formattedDealCodes
        }
      };
    } catch (error) {
      logger.error('Error getting user deal codes', 'PropertyAddressUnlock', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId
      });

      return {
        success: false,
        message: 'Failed to retrieve deal codes',
        data: {
          totalDealCodes: 0,
          activeDealCodes: 0,
          dealCodes: []
        }
      };
    }
  }

  /**
   * Validate deal code
   */
  async validateDealCode(code: string, userId: number): Promise<{
    success: boolean;
    message?: string;
    data: {
      valid: boolean;
      reason?: string;
      dealCodeData?: {
        code: string;
        remainingUnlocks: number;
        expiresAt: Date;
      };
    };
  }> {
    try {
      const dealCode = await prisma.dealCode.findUnique({
        where: { code }
      });

      if (!dealCode) {
        return {
          success: true,
          data: {
            valid: false,
            reason: 'Deal code does not exist'
          }
        };
      }

      if (dealCode.userId !== userId) {
        return {
          success: true,
          data: {
            valid: false,
            reason: 'This deal code belongs to another user'
          }
        };
      }

      if (!dealCode.isActive) {
        return {
          success: true,
          data: {
            valid: false,
            reason: 'Deal code is no longer active'
          }
        };
      }

      if (dealCode.remainingUnlocks <= 0) {
        return {
          success: true,
          data: {
            valid: false,
            reason: 'All unlocks have been used'
          }
        };
      }

      if (new Date() > dealCode.expiresAt) {
        return {
          success: true,
          data: {
            valid: false,
            reason: 'Deal code has expired'
          }
        };
      }

      return {
        success: true,
        message: 'Deal code is valid',
        data: {
          valid: true,
          dealCodeData: {
            code: dealCode.code,
            remainingUnlocks: dealCode.remainingUnlocks,
            expiresAt: dealCode.expiresAt
          }
        }
      };
    } catch (error) {
      logger.error('Error validating deal code', 'PropertyAddressUnlock', {
        error: error instanceof Error ? error.message : 'Unknown error',
        code,
        userId
      });

      return {
        success: false,
        message: 'Failed to validate deal code',
        data: {
          valid: false,
          reason: 'Internal error validating deal code'
        }
      };
    }
  }

  /**
   * Get unlock fee calculation for a property
   * Only works for monthly properties
   */
  async getUnlockFeeCalculation(propertyId: number) {
    const property = await prisma.property.findUnique({
      where: { id: propertyId }
    });

    if (!property) {
      throw new Error('Property not found');
    }

    if (!property.pricePerMonth) {
      throw new Error('Address unlock is only available for monthly properties');
    }

    return await addressUnlockFeeUtility.getFeesBreakdown(property.pricePerMonth);
  }

  /**
   * Get all unlock requests for a user (guest view) - including PENDING
   */
  async getUserUnlocks(userId: number): Promise<{
    success: boolean;
    message: string;
    data: {
      totalUnlocks: number;
      unlocks: any[];
    };
  }> {
    try {
      const unlocks = await prisma.propertyAddressUnlock.findMany({
        where: {
          userId
          // Include all statuses: PENDING, SUBMITTED, COMPLETED, FAILED, CANCELLED
        },
        include: {
          property: {
            include: {
              host: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                  phone: true,
                  profileImage: true
                }
              }
            }
          }
        },
        orderBy: {
          createdAt: 'desc' // Order by creation date to show all requests, not just unlocked
        }
      });

      const formattedUnlocks = unlocks.map(unlock => ({
        // Only include unlock data (address, host contact) if payment is COMPLETED
        ...(unlock.paymentStatus === 'COMPLETED' ? this.formatUnlockData(unlock) : {}),
        unlockId: unlock.unlockId,
        paymentStatus: unlock.paymentStatus,
        paymentMethod: unlock.paymentMethod,
        paymentAmountRwf: parseFloat(unlock.paymentAmountRwf.toString()),
        paymentAmountUsd: unlock.paymentAmountUsd ? parseFloat(unlock.paymentAmountUsd.toString()) : null,
        createdAt: unlock.createdAt,
        unlockedAt: unlock.unlockedAt,
        property: {
          id: unlock.property.id,
          name: unlock.property.name,
          location: unlock.property.location,
          type: unlock.property.type,
          pricePerNight: unlock.property.pricePerNight,
          images: unlock.property.images,
          status: unlock.property.status
        }
      }));

      return {
        success: true,
        message: 'User unlocked properties retrieved successfully',
        data: {
          totalUnlocks: unlocks.length,
          unlocks: formattedUnlocks
        }
      };
    } catch (error) {
      logger.error('Error getting user unlocks', 'PropertyAddressUnlock', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId
      });

      return {
        success: false,
        message: 'Failed to retrieve unlocked properties',
        data: {
          totalUnlocks: 0,
          unlocks: []
        }
      };
    }
  }

  /**
   * Get unlock activities for all properties owned by a host
   */
  async getHostUnlockActivities(hostId: number): Promise<{
    success: boolean;
    message: string;
    data: {
      totalUnlocks: number;
      totalRevenue: number;
      unlocksByProperty: any[];
    };
  }> {
    try {
      // Get all properties owned by the host
      const hostProperties = await prisma.property.findMany({
        where: { hostId },
        select: { id: true }
      });

      const propertyIds = hostProperties.map(p => p.id);

      if (propertyIds.length === 0) {
        return {
          success: true,
          message: 'No properties found for this host',
          data: {
            totalUnlocks: 0,
            totalRevenue: 0,
            unlocksByProperty: []
          }
        };
      }

      // Get all unlocks for host's properties
      const unlocks = await prisma.propertyAddressUnlock.findMany({
        where: {
          propertyId: { in: propertyIds },
          paymentStatus: 'COMPLETED',
          unlockedAt: { not: null }
        },
        include: {
          property: {
            select: {
              id: true,
              name: true,
              location: true,
              type: true,
              images: true
            }
          },
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              profileImage: true
            }
          }
        },
        orderBy: {
          unlockedAt: 'desc'
        }
      });

      // Calculate total revenue
      const totalRevenue = unlocks.reduce((sum, unlock) => {
        return sum + parseFloat(unlock.paymentAmountRwf.toString());
      }, 0);

      // Group unlocks by property
      const unlocksByProperty = propertyIds.map(propertyId => {
        const propertyUnlocks = unlocks.filter(u => u.propertyId === propertyId);
        const property = propertyUnlocks[0]?.property;

        return {
          propertyId,
          propertyName: property?.name || 'Unknown',
          propertyLocation: property?.location || 'Unknown',
          propertyType: property?.type || 'Unknown',
          propertyImage: property?.images ? (Array.isArray(property.images) ? property.images[0] : null) : null,
          totalUnlocks: propertyUnlocks.length,
          revenue: propertyUnlocks.reduce((sum, u) => sum + parseFloat(u.paymentAmountRwf.toString()), 0),
          unlocks: propertyUnlocks.map(unlock => ({
            unlockId: unlock.unlockId,
            unlockedAt: unlock.unlockedAt,
            paymentMethod: unlock.paymentMethod,
            paymentAmountRwf: parseFloat(unlock.paymentAmountRwf.toString()),
            paymentAmountUsd: unlock.paymentAmountUsd ? parseFloat(unlock.paymentAmountUsd.toString()) : null,
            appreciationLevel: unlock.appreciationLevel,
            appreciationSubmitted: unlock.appreciationSubmitted,
            guest: {
              id: unlock.user.id,
              name: `${unlock.user.firstName} ${unlock.user.lastName}`,
              email: unlock.user.email,
              phone: unlock.user.phone,
              profileImage: unlock.user.profileImage
            }
          }))
        };
      }).filter(p => p.totalUnlocks > 0); // Only include properties with unlocks

      return {
        success: true,
        message: 'Host unlock activities retrieved successfully',
        data: {
          totalUnlocks: unlocks.length,
          totalRevenue: Math.round(totalRevenue),
          unlocksByProperty
        }
      };
    } catch (error) {
      logger.error('Error getting host unlock activities', 'PropertyAddressUnlock', {
        error: error instanceof Error ? error.message : 'Unknown error',
        hostId
      });

      return {
        success: false,
        message: 'Failed to retrieve unlock activities',
        data: {
          totalUnlocks: 0,
          totalRevenue: 0,
          unlocksByProperty: []
        }
      };
    }
  }

  // Private helper methods

  private async validateAndUseDealCode(
    code: string,
    userId: number,
    propertyId: number
  ): Promise<DealCodeValidationResult> {
    const validation = await this.validateDealCode(code, userId);

    if (!validation.data.valid) {
      return {
        valid: false,
        reason: validation.data.reason
      };
    }

    const dealCode = await prisma.dealCode.findUnique({
      where: { code }
    });

    if (!dealCode) {
      return {
        valid: false,
        reason: 'Deal code not found'
      };
    }

    // Note: remainingUnlocks will be decremented AFTER unlock is successfully created
    // This prevents decrementing on failed unlock attempts

    return {
      valid: true,
      dealCodeId: dealCode.id
    };
  }

  private async recordDealCodeUsage(
    dealCodeId: number,
    unlockId: string,
    propertyId: number,
    userId: number
  ): Promise<void> {
    await prisma.dealCodeUsage.create({
      data: {
        dealCodeId,
        unlockId,
        propertyId,
        userId
      }
    });

    logger.info('Deal code usage recorded', 'PropertyAddressUnlock', {
      dealCodeId,
      unlockId,
      propertyId,
      userId
    });
  }

  /**
   * Map provider and country code to PawaPay provider format
   * PawaPay format: PROVIDER_COUNTRY (e.g., MTN_MOMO_RWA, AIRTEL_UGA, ORANGE_SEN)
   */
  private mapToPawapayProvider(provider: string, countryCode: string): string {
    const countryMap: Record<string, string> = {
      'RW': 'RWA',  // Rwanda
      'UG': 'UGA',  // Uganda
      'KE': 'KEN',  // Kenya
      'TZ': 'TZA',  // Tanzania
      'ZM': 'ZMB',  // Zambia
      'BF': 'BFA',  // Burkina Faso
      'BJ': 'BEN',  // Benin
      'CI': 'CIV',  // Ivory Coast
      'GH': 'GHA',  // Ghana
      'SN': 'SEN',  // Senegal
      'CM': 'CMR'   // Cameroon
    };

    const pawapayCountry = countryMap[countryCode.toUpperCase()] || 'RWA';

    // Map provider names
    switch (provider.toUpperCase()) {
      case 'MTN':
        return `MTN_MOMO_${pawapayCountry}`;
      case 'AIRTEL':
        return `AIRTEL_${pawapayCountry}`;
      case 'ORANGE':
        return `ORANGE_${pawapayCountry}`;
      case 'VODACOM':
        return `VODACOM_${pawapayCountry}`;
      default:
        return `MTN_MOMO_${pawapayCountry}`;
    }
  }

  private formatUnlockData(unlock: any): any {
    const property = unlock.property;
    const host = property.host;

    return {
      unlockId: unlock.unlockId,
      propertyId: property.id,
      address: property.fullAddress || property.propertyAddress || property.location,
      coordinates: property.coordinates || null,
      googleMapsUrl: addressUnlockFeeUtility.generateGoogleMapsUrl(
        property.fullAddress || property.propertyAddress || property.location
      ),
      hostContactInfo: {
        hostId: host?.id,
        hostName: host ? `${host.firstName} ${host.lastName}` : 'Host',
        hostPhone: property.hostPhone || host?.phone,
        hostEmail: property.hostEmail || host?.email,
        hostProfileImage: host?.profileImage,
        preferredContactMethod: property.preferredContactMethod || 'email'
      },
      unlockedAt: unlock.unlockedAt!,
      paymentMethod: unlock.paymentMethod,
      appreciationSubmitted: unlock.appreciationSubmitted
    };
  }

  /**
   * Cancel unlock request (only available for 30% payment method before appreciation)
   * Guest can cancel and optionally get deal code if not appreciated
   */
  async cancelUnlockRequest(unlockId: string, userId: number, reason?: string): Promise<{
    success: boolean;
    message: string;
    data?: {
      cancelled: boolean;
      refundEligible: boolean;
      dealCode?: {
        code: string;
        remainingUnlocks: number;
        expiresAt: Date;
      };
      refundAmount?: number;
    };
    errors?: string[];
  }> {
    try {
      const unlock = await prisma.propertyAddressUnlock.findUnique({
        where: { unlockId },
        include: {
          property: {
            include: {
              host: {
                select: { id: true, firstName: true, lastName: true }
              }
            }
          }
        }
      });

      if (!unlock) {
        return {
          success: false,
          message: 'Unlock request not found',
          errors: ['Invalid unlock ID']
        };
      }

      if (unlock.userId !== userId) {
        return {
          success: false,
          message: 'Unauthorized',
          errors: ['You can only cancel your own unlock requests']
        };
      }

      if (unlock.paymentStatus !== 'COMPLETED') {
        return {
          success: false,
          message: 'Cannot cancel pending unlock',
          errors: ['Unlock payment is not completed yet']
        };
      }

      if (unlock.appreciationSubmitted) {
        return {
          success: false,
          message: 'Cannot cancel after submitting appreciation',
          errors: ['You have already submitted appreciation for this unlock']
        };
      }

      // Only 30% payment method is eligible for cancellation
      const refundEligible = unlock.paymentMethod === 'three_month_30_percent';

      // Mark as cancelled
      await prisma.propertyAddressUnlock.update({
        where: { unlockId },
        data: {
          paymentStatus: 'CANCELLED',
          appreciationLevel: 'cancelled',
          appreciationFeedback: reason || 'Cancelled by user',
          appreciationSubmittedAt: new Date()
        }
      });

      let dealCode: any = undefined;
      let refundAmount: number | undefined = undefined;

      // Generate deal code and calculate refund if eligible (30% method only)
      if (refundEligible) {
        const code = addressUnlockFeeUtility.generateDealCode();
        const expiresAt = addressUnlockFeeUtility.getDealCodeExpiry();

        const createdDealCode = await prisma.dealCode.create({
          data: {
            code,
            userId,
            sourcePropertyId: unlock.propertyId,
            expiresAt
          }
        });

        dealCode = {
          code: createdDealCode.code,
          remainingUnlocks: createdDealCode.remainingUnlocks,
          expiresAt: createdDealCode.expiresAt
        };

        // Calculate refund: payment amount - 15,000 RWF service fee
        const serviceFee = 15000;
        const paidAmount = parseFloat(unlock.paymentAmountRwf.toString());
        refundAmount = Math.max(0, paidAmount - serviceFee);

        // Create refund record
        await prisma.addressUnlockRefund.create({
          data: {
            unlockId: unlock.unlockId,
            userId,
            refundAmountRwf: new Prisma.Decimal(refundAmount)
          }
        });

        logger.info('Deal code created and refund calculated for cancelled unlock', 'PropertyAddressUnlock', {
          unlockId,
          dealCode: code,
          paidAmount,
          serviceFee,
          refundAmount
        });
      }

      // Send notifications (guest and host)
      const { unifiedNotificationService } = await import('./unified-notification.service.js');
      await unifiedNotificationService.notifyUnlockCancellation({
        guestId: userId,
        hostId: unlock.property.host?.id || 0,
        propertyId: unlock.propertyId,
        propertyName: unlock.property.name,
        unlockId
      });

      // Log activity
      await unifiedNotificationService.logUnlockActivity({
        userId,
        action: 'cancel_unlock_request',
        resourceType: 'property_unlock',
        resourceId: unlockId,
        details: {
          propertyId: unlock.propertyId,
          reason,
          refundEligible,
          dealCodeGenerated: !!dealCode
        },
        status: 'success'
      });

      return {
        success: true,
        message: refundEligible
          ? 'Unlock request cancelled. Deal code generated and refund initiated (payment amount - 15,000 RWF service fee).'
          : 'Unlock request cancelled.',
        data: {
          cancelled: true,
          refundEligible,
          dealCode,
          refundAmount
        }
      };
    } catch (error) {
      logger.error('Error cancelling unlock request', 'PropertyAddressUnlock', {
        error: error instanceof Error ? error.message : 'Unknown error',
        unlockId,
        userId
      });

      return {
        success: false,
        message: 'Failed to cancel unlock request',
        errors: [error instanceof Error ? error.message : 'Internal server error']
      };
    }
  }

  /**
   * Get host unlock requests - NO MONEY DETAILS
   * Host can see: requests list, guest contact info, request status
   * Host CANNOT see: payment amounts, transaction details, unlock codes
   */
  async getHostUnlockRequests(hostId: number): Promise<{
    success: boolean;
    message: string;
    data: {
      totalRequests: number;
      pendingRequests: number;
      completedRequests: number;
      requestsByProperty: any[];
    };
  }> {
    try {
      // Get all properties owned by the host
      const hostProperties = await prisma.property.findMany({
        where: { hostId },
        select: { id: true }
      });

      const propertyIds = hostProperties.map(p => p.id);

      if (propertyIds.length === 0) {
        return {
          success: true,
          message: 'No properties found for this host',
          data: {
            totalRequests: 0,
            pendingRequests: 0,
            completedRequests: 0,
            requestsByProperty: []
          }
        };
      }

      // Get all unlock requests for host's properties
      const unlocks = await prisma.propertyAddressUnlock.findMany({
        where: {
          propertyId: { in: propertyIds },
          paymentStatus: { in: ['COMPLETED', 'PENDING'] }
        },
        include: {
          property: {
            select: {
              id: true,
              name: true,
              location: true,
              type: true,
              images: true
            }
          },
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              profileImage: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      const pendingCount = unlocks.filter(u => u.paymentStatus === 'PENDING').length;
      const completedCount = unlocks.filter(u => u.paymentStatus === 'COMPLETED').length;

      // Group requests by property - NO MONEY DETAILS
      const requestsByProperty = propertyIds.map(propertyId => {
        const propertyUnlocks = unlocks.filter(u => u.propertyId === propertyId);
        const property = propertyUnlocks[0]?.property;

        return {
          propertyId,
          propertyName: property?.name || 'Unknown',
          propertyLocation: property?.location || 'Unknown',
          propertyType: property?.type || 'Unknown',
          propertyImage: property?.images ? (Array.isArray(property.images) ? property.images[0] : null) : null,
          totalRequests: propertyUnlocks.length,
          pendingRequests: propertyUnlocks.filter(u => u.paymentStatus === 'PENDING').length,
          completedRequests: propertyUnlocks.filter(u => u.paymentStatus === 'COMPLETED').length,
          requests: propertyUnlocks.map(unlock => ({
            // Request info - no unlock ID or codes exposed to host
            requestDate: unlock.createdAt,
            status: unlock.paymentStatus === 'COMPLETED' ? 'Directions Requested' : 'Pending',
            requestType: unlock.paymentMethod === 'three_month_30_percent' ? 'Booking Interest' : 'Quick View',

            // Guest contact info - so host can reach out
            guest: {
              id: unlock.user.id,
              name: `${unlock.user.firstName} ${unlock.user.lastName}`,
              email: unlock.user.email,
              phone: unlock.user.phone,
              profileImage: unlock.user.profileImage
            },

            // Appreciation/feedback if submitted
            appreciationSubmitted: unlock.appreciationSubmitted,
            appreciationLevel: unlock.appreciationLevel,

            // NO payment amounts, NO transaction reference, NO unlock codes
          }))
        };
      }).filter(p => p.totalRequests > 0);

      return {
        success: true,
        message: 'Host unlock requests retrieved successfully',
        data: {
          totalRequests: unlocks.length,
          pendingRequests: pendingCount,
          completedRequests: completedCount,
          requestsByProperty
        }
      };
    } catch (error) {
      logger.error('Error getting host unlock requests', 'PropertyAddressUnlock', {
        error: error instanceof Error ? error.message : 'Unknown error',
        hostId
      });

      return {
        success: false,
        message: 'Failed to retrieve unlock requests',
        data: {
          totalRequests: 0,
          pendingRequests: 0,
          completedRequests: 0,
          requestsByProperty: []
        }
      };
    }
  }

  /**
   * Create booking from unlock (30% already paid)
   * Creates a booking with 30% marked as paid, remaining 70% pending
   */
  async createBookingFromUnlock(data: {
    unlockId: string;
    userId: number;
    checkIn: string;
    checkOut: string;
    guests: number;
    totalPrice: number;
    message?: string;
    specialRequests?: string;
  }): Promise<{
    success: boolean;
    message: string;
    data?: {
      bookingId: string;
      totalAmount: number;
      paidAmount: number; // 30%
      remainingAmount: number; // 70%
      paymentUrl: string; // jambolush.com/spaces/{spaceId}/confirm-and-pay?bookingId={bookingId}
    };
    errors?: string[];
  }> {
    try {
      // Verify unlock exists and belongs to user
      const unlock = await prisma.propertyAddressUnlock.findUnique({
        where: { unlockId: data.unlockId },
        include: {
          property: {
            include: {
              host: {
                select: { id: true, firstName: true, lastName: true }
              }
            }
          }
        }
      });

      if (!unlock) {
        return {
          success: false,
          message: 'Unlock not found',
          errors: ['Invalid unlock ID']
        };
      }

      if (unlock.userId !== data.userId) {
        return {
          success: false,
          message: 'Unauthorized',
          errors: ['This unlock does not belong to you']
        };
      }

      if (unlock.paymentMethod !== 'three_month_30_percent') {
        return {
          success: false,
          message: 'Invalid payment method',
          errors: ['Only 30% unlock method can create bookings']
        };
      }

      if (unlock.paymentStatus !== 'COMPLETED') {
        return {
          success: false,
          message: 'Unlock not completed',
          errors: ['Unlock payment must be completed first']
        };
      }

      // Calculate amounts
      const totalAmount = data.totalPrice;
      const paidAmount = totalAmount * 0.30; // 30% already paid via unlock
      const remainingAmount = totalAmount - paidAmount; // 70% pending

      // Create booking
      // Note: unlockId and paidAmount fields need to be added to Booking schema
      const booking = await prisma.booking.create({
        data: {
          id: `BK-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`.toUpperCase(),
          propertyId: unlock.propertyId,
          guestId: data.userId,
          checkIn: new Date(data.checkIn),
          checkOut: new Date(data.checkOut),
          guests: data.guests,
          totalPrice: totalAmount, // Float not Decimal
          status: 'pending',
          paymentStatus: 'PARTIAL', // 30% paid
          message: data.message,
          specialRequests: data.specialRequests,
          // unlockId: data.unlockId, // TODO: Add to schema
          // paidAmount: paidAmount, // TODO: Add to schema
          notes: `Unlock ID: ${data.unlockId}, Paid Amount: ${paidAmount} RWF (30%)`, // Store in notes for now
          createdAt: new Date()
        }
      });

      // Generate payment URL
      const propertySlug = unlock.property.name.toLowerCase().replace(/\s+/g, '-');
      const paymentUrl = `https://jambolush.com/spaces/${propertySlug}-${unlock.propertyId}/confirm-and-pay?bookingId=${booking.id}`;

      // Send notifications
      const { unifiedNotificationService } = await import('./unified-notification.service.js');
      await unifiedNotificationService.notifyUnlockBookingCreated({
        guestId: data.userId,
        hostId: unlock.property.host?.id || 0,
        bookingId: booking.id,
        propertyName: unlock.property.name,
        checkIn: data.checkIn,
        checkOut: data.checkOut,
        totalAmount,
        paidAmount
      });

      // Log activity
      await unifiedNotificationService.logUnlockActivity({
        userId: data.userId,
        action: 'create_booking_from_unlock',
        resourceType: 'unlock_booking',
        resourceId: booking.id,
        details: {
          unlockId: data.unlockId,
          propertyId: unlock.propertyId,
          totalAmount,
          paidAmount,
          remainingAmount,
          checkIn: data.checkIn,
          checkOut: data.checkOut
        },
        status: 'success'
      });

      return {
        success: true,
        message: 'Booking created successfully. Complete payment to confirm.',
        data: {
          bookingId: booking.id,
          totalAmount,
          paidAmount,
          remainingAmount,
          paymentUrl
        }
      };
    } catch (error) {
      logger.error('Error creating booking from unlock', 'PropertyAddressUnlock', {
        error: error instanceof Error ? error.message : 'Unknown error',
        unlockId: data.unlockId,
        userId: data.userId
      });

      return {
        success: false,
        message: 'Failed to create booking',
        errors: [error instanceof Error ? error.message : 'Internal server error']
      };
    }
  }

  /**
   * Admin: Get unlock analytics and transaction data
   */
  async getAdminUnlockAnalytics(filters?: {
    startDate?: Date;
    endDate?: Date;
    propertyId?: number;
    paymentMethod?: string;
  }): Promise<{
    success: boolean;
    message: string;
    data: {
      overview: {
        totalUnlocks: number;
        totalRevenue: number;
        totalNonRefundable: number;
        total30Percent: number;
        totalCancelled: number;
        totalDealCodesGenerated: number;
        conversionToBooking: number;
      };
      unlocks: any[];
      recentActivity: any[];
    };
  }> {
    try {
      const where: any = {
        paymentStatus: { in: ['COMPLETED', 'CANCELLED'] }
      };

      if (filters?.startDate) where.createdAt = { gte: filters.startDate };
      if (filters?.endDate) where.createdAt = { ...where.createdAt, lte: filters.endDate };
      if (filters?.propertyId) where.propertyId = filters.propertyId;
      if (filters?.paymentMethod) where.paymentMethod = filters.paymentMethod;

      const [unlocks, dealCodes, bookingsFromUnlocks] = await Promise.all([
        prisma.propertyAddressUnlock.findMany({
          where,
          include: {
            property: {
              select: {
                id: true,
                name: true,
                location: true,
                host: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true
                  }
                }
              }
            },
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        }),
        prisma.dealCode.count(),
        // TODO: Once unlockId field is added to Booking schema, use this:
        // prisma.booking.count({ where: { unlockId: { not: null } } })
        // For now, count bookings with "Unlock ID:" in notes
        prisma.booking.count({
          where: {
            notes: { contains: 'Unlock ID:' }
          }
        })
      ]);

      const totalRevenue = unlocks.reduce((sum, u) => sum + parseFloat(u.paymentAmountRwf.toString()), 0);
      const nonRefundable = unlocks.filter(u => u.paymentMethod === 'non_refundable_fee');
      const thirtyPercent = unlocks.filter(u => u.paymentMethod === 'three_month_30_percent');
      const cancelled = unlocks.filter(u => u.paymentStatus === 'CANCELLED');

      return {
        success: true,
        message: 'Admin unlock analytics retrieved successfully',
        data: {
          overview: {
            totalUnlocks: unlocks.length,
            totalRevenue: Math.round(totalRevenue),
            totalNonRefundable: nonRefundable.length,
            total30Percent: thirtyPercent.length,
            totalCancelled: cancelled.length,
            totalDealCodesGenerated: dealCodes,
            conversionToBooking: bookingsFromUnlocks
          },
          unlocks: unlocks.map(unlock => ({
            unlockId: unlock.unlockId,
            propertyId: unlock.propertyId,
            propertyName: unlock.property.name,
            propertyLocation: unlock.property.location,
            hostName: `${unlock.property.host?.firstName} ${unlock.property.host?.lastName}`,
            hostEmail: unlock.property.host?.email,
            guestName: `${unlock.user.firstName} ${unlock.user.lastName}`,
            guestEmail: unlock.user.email,
            guestPhone: unlock.user.phone,
            paymentMethod: unlock.paymentMethod,
            paymentAmountRwf: parseFloat(unlock.paymentAmountRwf.toString()),
            paymentAmountUsd: unlock.paymentAmountUsd ? parseFloat(unlock.paymentAmountUsd.toString()) : null,
            paymentStatus: unlock.paymentStatus,
            transactionReference: unlock.transactionReference,
            unlockedAt: unlock.unlockedAt,
            appreciationLevel: unlock.appreciationLevel,
            appreciationSubmitted: unlock.appreciationSubmitted,
            createdAt: unlock.createdAt
          })),
          recentActivity: unlocks.slice(0, 10).map(u => ({
            unlockId: u.unlockId, // Fixed typo: was 'unlock.id', should be 'u.unlockId'
            propertyName: u.property.name,
            guestName: `${u.user.firstName} ${u.user.lastName}`,
            action: u.paymentStatus === 'CANCELLED' ? 'Cancelled' : 'Unlocked',
            timestamp: u.unlockedAt || u.createdAt
          }))
        }
      };
    } catch (error) {
      logger.error('Error getting admin unlock analytics', 'PropertyAddressUnlock', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        success: false,
        message: 'Failed to retrieve unlock analytics',
        data: {
          overview: {
            totalUnlocks: 0,
            totalRevenue: 0,
            totalNonRefundable: 0,
            total30Percent: 0,
            totalCancelled: 0,
            totalDealCodesGenerated: 0,
            conversionToBooking: 0
          },
          unlocks: [],
          recentActivity: []
        }
      };
    }
  }
}

// Export singleton instance
export const propertyAddressUnlockService = new PropertyAddressUnlockService();
