/**
 * Seed Script for JamboLush Admin Settings
 * Initializes default payment operators, providers, and settings
 */

import { PrismaClient } from '@prisma/client';
import { encryptionService } from '../utils/encryption.utility';

const prisma = new PrismaClient();

async function seedJamboLushSettings() {
  console.log('🌱 Seeding JamboLush Admin Settings...\n');

  try {
    // ============================================
    // 1. CREATE PAYMENT PROVIDERS
    // ============================================
    console.log('📦 Creating payment providers...');

    const xentripayProvider = await prisma.paymentProvider.upsert({
      where: { id: 'xentripay' },
      update: {},
      create: {
        id: 'xentripay',
        name: 'XentriPay',
        type: 'mobile_money',
        region: 'Rwanda',
        enabled: true,
        testMode: false,
        credentials: {
          apiKey: process.env.XENTRIPAY_API_KEY || '',
          secretKey: process.env.XENTRIPAY_SECRET_KEY || '',
          merchantId: process.env.XENTRIPAY_MERCHANT_ID || '',
        } as any,
        config: {
          baseUrl: 'https://api.xentripay.rw',
          webhookUrl: `${process.env.API_BASE_URL}/api/xentripay/callback`,
          timeout: 30000,
          retryAttempts: 3,
        } as any,
      },
    });

    const pawapayProvider = await prisma.paymentProvider.upsert({
      where: { id: 'pawapay' },
      update: {},
      create: {
        id: 'pawapay',
        name: 'PawaPay',
        type: 'mobile_money',
        region: 'Pan-African',
        enabled: true,
        testMode: false,
        credentials: {
          apiKey: process.env.PAWAPAY_API_KEY || '',
          secretKey: process.env.PAWAPAY_SECRET || '',
        } as any,
        config: {
          baseUrl: process.env.PAWAPAY_BASE_URL || 'https://api.pawapay.cloud',
          webhookUrl: `${process.env.API_BASE_URL}/api/pawapay/callback`,
          timeout: 30000,
          retryAttempts: 3,
          bulkPayouts: {
            enabled: true,
            batchSize: 100,
          },
        } as any,
      },
    });

    console.log(`✅ Created/updated providers: XentriPay, PawaPay\n`);

    // ============================================
    // 2. CREATE MOBILE MONEY OPERATORS
    // ============================================
    console.log('📱 Creating mobile money operators...');

    const operators = [
      // Rwanda Operators
      {
        code: 'MTN_RW',
        name: 'MTN Rwanda (MoMo)',
        country: 'RW',
        type: 'mobile_money',
        enabled: true,
        primaryProviderId: xentripayProvider.id,
        alternativeProviderId: pawapayProvider.id,
        supportedOperations: {
          deposit: true,
          withdrawal: true,
          refund: true,
          disburse: true,
        },
        limits: {
          minAmount: 100,
          maxAmount: 5000000,
          dailyLimit: 10000000,
        },
        fees: {
          depositFee: 0,
          withdrawalFee: 100,
          currency: 'RWF',
        },
      },
      {
        code: 'AIRTEL_RW',
        name: 'Airtel Rwanda',
        country: 'RW',
        type: 'mobile_money',
        enabled: true,
        primaryProviderId: xentripayProvider.id,
        alternativeProviderId: pawapayProvider.id,
        supportedOperations: {
          deposit: true,
          withdrawal: true,
          refund: true,
          disburse: true,
        },
        limits: {
          minAmount: 100,
          maxAmount: 5000000,
          dailyLimit: 10000000,
        },
        fees: {
          depositFee: 0,
          withdrawalFee: 100,
          currency: 'RWF',
        },
      },
      // Kenya Operators
      {
        code: 'MPESA_KE',
        name: 'M-Pesa Kenya',
        country: 'KE',
        type: 'mobile_money',
        enabled: true,
        primaryProviderId: pawapayProvider.id,
        alternativeProviderId: null,
        supportedOperations: {
          deposit: true,
          withdrawal: true,
          refund: true,
          disburse: true,
        },
        limits: {
          minAmount: 10,
          maxAmount: 500000,
          dailyLimit: 1000000,
        },
        fees: {
          depositFee: 0,
          withdrawalFee: 50,
          currency: 'KES',
        },
      },
      {
        code: 'AIRTEL_KE',
        name: 'Airtel Kenya',
        country: 'KE',
        type: 'mobile_money',
        enabled: true,
        primaryProviderId: pawapayProvider.id,
        alternativeProviderId: null,
        supportedOperations: {
          deposit: true,
          withdrawal: true,
          refund: true,
          disburse: true,
        },
        limits: {
          minAmount: 10,
          maxAmount: 500000,
          dailyLimit: 1000000,
        },
        fees: {
          depositFee: 0,
          withdrawalFee: 50,
          currency: 'KES',
        },
      },
      // Uganda Operators
      {
        code: 'MTN_UG',
        name: 'MTN Uganda',
        country: 'UG',
        type: 'mobile_money',
        enabled: true,
        primaryProviderId: pawapayProvider.id,
        alternativeProviderId: null,
        supportedOperations: {
          deposit: true,
          withdrawal: true,
          refund: true,
          disburse: true,
        },
        limits: {
          minAmount: 500,
          maxAmount: 5000000,
          dailyLimit: 10000000,
        },
        fees: {
          depositFee: 0,
          withdrawalFee: 1000,
          currency: 'UGX',
        },
      },
      {
        code: 'AIRTEL_UG',
        name: 'Airtel Uganda',
        country: 'UG',
        type: 'mobile_money',
        enabled: true,
        primaryProviderId: pawapayProvider.id,
        alternativeProviderId: null,
        supportedOperations: {
          deposit: true,
          withdrawal: true,
          refund: true,
          disburse: true,
        },
        limits: {
          minAmount: 500,
          maxAmount: 5000000,
          dailyLimit: 10000000,
        },
        fees: {
          depositFee: 0,
          withdrawalFee: 1000,
          currency: 'UGX',
        },
      },
      // Tanzania Operators
      {
        code: 'VODACOM_TZ',
        name: 'Vodacom M-Pesa Tanzania',
        country: 'TZ',
        type: 'mobile_money',
        enabled: true,
        primaryProviderId: pawapayProvider.id,
        alternativeProviderId: null,
        supportedOperations: {
          deposit: true,
          withdrawal: true,
          refund: true,
          disburse: true,
        },
        limits: {
          minAmount: 1000,
          maxAmount: 10000000,
          dailyLimit: 20000000,
        },
        fees: {
          depositFee: 0,
          withdrawalFee: 2000,
          currency: 'TZS',
        },
      },
      {
        code: 'TIGO_TZ',
        name: 'Tigo Pesa Tanzania',
        country: 'TZ',
        type: 'mobile_money',
        enabled: true,
        primaryProviderId: pawapayProvider.id,
        alternativeProviderId: null,
        supportedOperations: {
          deposit: true,
          withdrawal: true,
          refund: true,
          disburse: true,
        },
        limits: {
          minAmount: 1000,
          maxAmount: 10000000,
          dailyLimit: 20000000,
        },
        fees: {
          depositFee: 0,
          withdrawalFee: 2000,
          currency: 'TZS',
        },
      },
      {
        code: 'AIRTEL_TZ',
        name: 'Airtel Tanzania',
        country: 'TZ',
        type: 'mobile_money',
        enabled: true,
        primaryProviderId: pawapayProvider.id,
        alternativeProviderId: null,
        supportedOperations: {
          deposit: true,
          withdrawal: true,
          refund: true,
          disburse: true,
        },
        limits: {
          minAmount: 1000,
          maxAmount: 10000000,
          dailyLimit: 20000000,
        },
        fees: {
          depositFee: 0,
          withdrawalFee: 2000,
          currency: 'TZS',
        },
      },
    ];

    let operatorCount = 0;
    for (const operator of operators) {
      await prisma.paymentOperator.upsert({
        where: { code: operator.code },
        update: operator,
        create: operator as any,
      });
      operatorCount++;
    }

    console.log(`✅ Created/updated ${operatorCount} mobile money operators\n`);

    // ============================================
    // 3. COMMUNICATION SETTINGS
    // ============================================
    console.log('📧 Creating communication settings...');

    await prisma.communicationSetting.upsert({
      where: { id: 'email' },
      update: {},
      create: {
        id: 'email',
        enabled: true,
        provider: 'brevo',
        config: {
          apiKey: process.env.BREVO_API_KEY || '',
          fromEmail: process.env.BREVO_SENDER_EMAIL || 'noreply@jambolush.com',
          fromName: 'JamboLush',
          dailyLimit: 10000,
        } as any,
        dailyLimit: 10000,
        currentUsage: 0,
      },
    });

    await prisma.communicationSetting.upsert({
      where: { id: 'sms' },
      update: {},
      create: {
        id: 'sms',
        enabled: true,
        provider: 'brevo',
        config: {
          apiKey: process.env.BREVO_SMS_API_KEY || '',
          senderId: 'JamboLush',
          username: process.env.BREVO_SMS_USERNAME || '',
          dailyLimit: 5000,
        } as any,
        dailyLimit: 5000,
        currentUsage: 0,
      },
    });

    await prisma.communicationSetting.upsert({
      where: { id: 'whatsapp' },
      update: {},
      create: {
        id: 'whatsapp',
        enabled: false,
        provider: 'brevo',
        config: {
          apiKey: '',
          phoneNumberId: '',
          dailyLimit: 3000,
        } as any,
        dailyLimit: 3000,
        currentUsage: 0,
      },
    });

    console.log(`✅ Created communication settings\n`);

    // ============================================
    // 4. SECURITY SETTINGS
    // ============================================
    console.log('🔒 Creating security settings...');

    await prisma.securitySetting.upsert({
      where: { id: 'twoFactor' },
      update: {},
      create: {
        category: 'twoFactor',
        settings: {
          enabled: true,
          method: 'sms',
          requireForAdmins: true,
          requireForHosts: false,
          requireForAgents: false,
          codeExpiryMinutes: 5,
        } as any,
      },
    });

    await prisma.securitySetting.upsert({
      where: { id: 'session' },
      update: {},
      create: {
        category: 'session',
        settings: {
          sessionTimeout: 30,
          maxActiveSessions: 5,
          requireReauthForSensitive: true,
          ipWhitelisting: false,
          whitelistedIPs: [],
        } as any,
      },
    });

    await prisma.securitySetting.upsert({
      where: { id: 'passwordPolicy' },
      update: {},
      create: {
        category: 'passwordPolicy',
        settings: {
          minLength: 8,
          requireUppercase: true,
          requireLowercase: true,
          requireNumbers: true,
          requireSpecialChars: false,
          expiryDays: 90,
          preventReuse: 5,
        } as any,
      },
    });

    console.log(`✅ Created security settings\n`);

    // ============================================
    // 5. BUSINESS RULES
    // ============================================
    console.log('📊 Creating business rules...');

    await prisma.businessRule.upsert({
      where: { id: 'booking' },
      update: {},
      create: {
        category: 'booking',
        rules: {
          minBookingAdvance: 2,
          maxBookingAdvance: 365,
          instantBooking: true,
          requireHostApproval: false,
        } as any,
      },
    });

    await prisma.businessRule.upsert({
      where: { id: 'cancellation' },
      update: {},
      create: {
        category: 'cancellation',
        rules: {
          freeCancellationWindow: 24,
          cancellationFee: 10,
          noShowFee: 100,
        } as any,
      },
    });

    await prisma.businessRule.upsert({
      where: { id: 'payment' },
      update: {},
      create: {
        category: 'payment',
        rules: {
          depositPercentage: 30,
          fullPaymentBefore: 3,
          refundProcessingDays: 7,
          autoRefundOnCancel: true,
        } as any,
      },
    });

    await prisma.businessRule.upsert({
      where: { id: 'commission' },
      update: {},
      create: {
        category: 'commission',
        rules: {
          platformCommission: 16.67,
          agentCommission: 4.39,
          tourGuideCommission: 16,
        } as any,
      },
    });

    await prisma.businessRule.upsert({
      where: { id: 'system' },
      update: {},
      create: {
        category: 'system',
        rules: {
          maintenanceMode: false,
          allowNewRegistrations: true,
          requireEmailVerification: true,
          requirePhoneVerification: false,
          requireKYC: false,
          autoApproveListings: false,
          enableReviews: true,
          enableMessaging: true,
        } as any,
      },
    });

    await prisma.businessRule.upsert({
      where: { id: 'financial' },
      update: {},
      create: {
        category: 'financial',
        rules: {
          baseCurrency: 'RWF',
          taxRate: 18,
          minWithdrawal: 5000,
          maxWithdrawal: 5000000,
          withdrawalFee: 2,
          escrowHoldDays: 3,
        } as any,
      },
    });

    await prisma.businessRule.upsert({
      where: { id: 'limits' },
      update: {},
      create: {
        category: 'limits',
        rules: {
          maxPropertyImages: 20,
          maxTourImages: 15,
          maxFileSize: 5,
          maxPropertiesPerHost: 50,
          maxActiveBookings: 10,
          maxGuestsPerBooking: 20,
        } as any,
      },
    });

    console.log(`✅ Created business rules\n`);

    console.log('✨ JamboLush Admin Settings seeded successfully!\n');
  } catch (error) {
    console.error('❌ Error seeding JamboLush settings:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run seed
if (require.main === module) {
  seedJamboLushSettings()
    .then(() => {
      console.log('✅ Seed completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Seed failed:', error);
      process.exit(1);
    });
}

export default seedJamboLushSettings;
