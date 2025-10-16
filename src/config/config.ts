import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 5000,
  jwtSecret: process.env.JWT_SECRET || 'default-secret',
  googleClientId: process.env.GOOGLE_CLIENT_ID || '739960680632-g75378et3hgeu5qmukdqp8085369gh1t.apps.googleusercontent.com',
  appleClientId: process.env.APPLE_CLIENT_ID || '',
  clientUrl: process.env.CLIENT_URL || 'https://jambolush.com',
  supportEmail: process.env.SUPPORT_EMAIL || 'support@jambolush.com',
  companyLogo: 'https://jambolush.com/favicon.ico',
  companyPhone: process.env.COMPANY_PHONE || '+250788437347',

      // Default split rules for bookings
    defaultSplitRules: {
      host: parseFloat(process.env.DEFAULT_HOST_SPLIT || '78.95'), // 70% to service provider
      agent: parseFloat(process.env.DEFAULT_AGENT_SPLIT || '4.38'), // 20% to agent/affiliate
      platform: parseFloat(process.env.DEFAULT_PLATFORM_SPLIT || '16.67') // 10% to platform
    },

  // Brevo API
  brevoApiKey: process.env.BREVO_API_KEY || '',
  brevoSenderEmail: process.env.BREVO_SENDER_EMAIL || '',

  brevoAdminSenderEmail: "notification@jambolush.com",
  // PRIMARY: Pesapal Escrow Integration (NEW) - WITH AUTO IPN REGISTRATION
  pesapal: {
    consumerKey: process.env.PESAPAL_CONSUMER_KEY!,
    consumerSecret: process.env.PESAPAL_CONSUMER_SECRET!,
    baseUrl: process.env.PESAPAL_BASE_URL || "https://pay.pesapal.com/v3",
    environment: (process.env.NODE_ENV === 'production' ? 'production' : 'sandbox') as 'production' | 'sandbox',
    webhookSecret: process.env.PESAPAL_WEBHOOK_SECRET!,
    callbackUrl: process.env.PESAPAL_CALLBACK_URL || 'http://localhost:5000/api/pesapal/callback',
    ipnUrl: process.env.PESAPAL_IPN_URL || 'http://localhost:5000/api/pesapal/ipn', // IPN endpoint (different from callback)
    merchantAccount: process.env.PESAPAL_MERCHANT_ACCOUNT!,
    
    // AUTO IPN REGISTRATION SETTINGS
    autoRegisterIPN: process.env.PESAPAL_AUTO_REGISTER_IPN !== 'false', // Enabled by default
    ipnCacheDuration: parseInt(process.env.PESAPAL_IPN_CACHE_DURATION || '86400000'), // 24 hours in milliseconds
    ipnRetryAttempts: parseInt(process.env.PESAPAL_IPN_RETRY_ATTEMPTS || '3'),
    ipnRetryDelay: parseInt(process.env.PESAPAL_IPN_RETRY_DELAY || '5000'), // 5 seconds
    
    // Pesapal-specific escrow settings
    timeout: parseInt(process.env.PESAPAL_TIMEOUT || '30000'), // 30 seconds
    retryAttempts: parseInt(process.env.PESAPAL_RETRY_ATTEMPTS || '3'),
    
    // Supported payment methods via Pesapal
    supportedMethods: ['MOBILE', 'BANK', 'CARD'],
    supportedProviders: {
      mobile: ['MTN', 'AIRTEL', 'TIGO', 'RWANDATEL'],
      countries: ['RW', 'UG', 'TZ', 'KE'] // East Africa focus
    }
  },

  // XentriPay API Configuration (Mobile Money - Rwanda)
  xentripay: {
    apiKey: process.env.XENTRIPAY_API_KEY!,
    baseUrl: process.env.XENTRIPAY_BASE_URL || (process.env.NODE_ENV === 'production' ? 'https://xentripay.com' : 'https://test.xentripay.com'),
    environment: (process.env.NODE_ENV === 'production' ? 'production' : 'sandbox') as 'production' | 'sandbox',
    webhookSecret: process.env.XENTRIPAY_WEBHOOK_SECRET || '',
    callbackUrl: process.env.XENTRIPAY_CALLBACK_URL || 'http://localhost:5000/api/xentripay/callback',
    merchantAccount: process.env.XENTRIPAY_MERCHANT_ACCOUNT || '',
    timeout: parseInt(process.env.XENTRIPAY_TIMEOUT || '30000'), // 30 seconds

    // Supported payment methods via XentriPay
    supportedMethods: ['momo'],
    supportedProviders: {
      mobile: ['MTN', 'AIRTEL'],
      countries: ['RW'] // Rwanda focus
    }
  },

  // PawaPay API Configuration (Mobile Money - Pan-African)
  pawapay: {
    apiKey: process.env.PAWAPAY_API_KEY!,
    baseUrl: process.env.PAWAPAY_BASE_URL || (process.env.PAWAPAY_ENVIRONMENT === 'production' ? 'https://api.pawapay.io/v2' : 'https://api.sandbox.pawapay.io/v2'),
    environment: (process.env.PAWAPAY_ENVIRONMENT || 'sandbox') as 'production' | 'sandbox',
    webhookSecret: process.env.PAWAPAY_WEBHOOK_SECRET || '',
    callbackUrl: process.env.PAWAPAY_CALLBACK_URL || 'http://localhost:5000/api/pawapay/callback',
    timeout: parseInt(process.env.PAWAPAY_TIMEOUT || '30000'), // 30 seconds

    // Supported payment methods via PawaPay
    supportedMethods: ['deposit', 'payout', 'refund'],
    supportedProviders: {
      mobile: ['MTN', 'AIRTEL', 'MPESA', 'VODAFONE', 'TIGO', 'ORANGE', 'ZAMTEL'],
      countries: ['RW', 'KE', 'UG', 'TZ', 'ZM', 'GH', 'NG', 'MW', 'BJ', 'CM', 'CD'] // Pan-African
    },

    // PawaPay-specific settings
    enableBulkPayouts: process.env.PAWAPAY_ENABLE_BULK_PAYOUTS !== 'false',
    bulkPayoutBatchSize: parseInt(process.env.PAWAPAY_BULK_BATCH_SIZE || '100'),
    retryAttempts: parseInt(process.env.PAWAPAY_RETRY_ATTEMPTS || '3'),
    retryDelay: parseInt(process.env.PAWAPAY_RETRY_DELAY || '5000'), // 5 seconds
  },

  // Escrow Configuration (Pesapal-based)
  escrow: {
    // Primary provider is now Pesapal
    primaryProvider: 'pesapal',
    
    // Escrow business logic settings
    defaultCurrency: process.env.ESCROW_DEFAULT_CURRENCY || 'USD',
    supportedCurrencies: (process.env.ESCROW_SUPPORTED_CURRENCIES || 'RWF,USD,UGX,TZS,KES').split(','),
    
    // Transaction limits
    maxTransactionAmount: parseFloat(process.env.ESCROW_MAX_TRANSACTION_AMOUNT || '10000000'), // 10M RWF
    minTransactionAmount: parseFloat(process.env.ESCROW_MIN_TRANSACTION_AMOUNT || '10'), // 100 RWF
    
    // Escrow timing settings
    defaultHoldingPeriod: parseInt(process.env.ESCROW_DEFAULT_HOLDING_DAYS || '7'), // 7 days
    maxHoldingDays: parseInt(process.env.ESCROW_MAX_HOLDING_DAYS || '365'), // 1 year max
    autoReleaseAfterDays: parseInt(process.env.ESCROW_AUTO_RELEASE_DAYS || '30'), // Auto-release after 30 days
    disputeDeadlineDays: parseInt(process.env.ESCROW_DISPUTE_DEADLINE_DAYS || '14'), // 14 days to dispute
    
    // Default split rules for bookings
    defaultSplitRules: {
      host: parseFloat(process.env.DEFAULT_HOST_SPLIT || '78.95'), // 70% to service provider
      agent: parseFloat(process.env.DEFAULT_AGENT_SPLIT || '4.38'), // 20% to agent/affiliate
      platform: parseFloat(process.env.DEFAULT_PLATFORM_SPLIT || '16.67') // 10% to platform
    },
    
    // Escrow fee configuration (charged to payer)
    fees: {
      escrowDeposit: parseFloat(process.env.ESCROW_DEPOSIT_FEE || '0'), // No fee for deposits
      withdrawalMobile: parseFloat(process.env.ESCROW_WITHDRAWAL_MOBILE_FEE || '100'), // 100 RWF for mobile
      withdrawalBank: parseFloat(process.env.ESCROW_WITHDRAWAL_BANK_FEE || '200'), // 200 RWF for bank
      refundFee: parseFloat(process.env.ESCROW_REFUND_FEE || '0'), // No refund fee
      platformCommission: parseFloat(process.env.ESCROW_PLATFORM_COMMISSION || '5'), // 5% platform fee
      disputeFee: parseFloat(process.env.ESCROW_DISPUTE_FEE || '1000'), // 1000 RWF dispute fee
    },
    
    // Rate limiting for escrow operations
    rateLimits: {
      depositsPerHour: parseInt(process.env.ESCROW_DEPOSITS_PER_HOUR || '20'),
      withdrawalsPerHour: parseInt(process.env.ESCROW_WITHDRAWALS_PER_HOUR || '10'),
      releasesPerHour: parseInt(process.env.ESCROW_RELEASES_PER_HOUR || '50'),
      maxConcurrentEscrows: parseInt(process.env.ESCROW_MAX_CONCURRENT || '100')
    }
  },

  // UPDATED: Payment Configuration (Integrated with Escrow)
  payment: {
    // Primary payment mode is now escrow-based
    defaultMode: process.env.PAYMENT_DEFAULT_MODE || 'escrow', // 'escrow' or 'direct'
    defaultCurrency: 'RWF', // Rwanda Franc as primary

    // Traditional payment limits
    limits: {
      daily: {
        deposit: parseFloat(process.env.DAILY_DEPOSIT_LIMIT || '500000'), // 500K RWF
        withdrawal: parseFloat(process.env.DAILY_WITHDRAWAL_LIMIT || '200000'), // 200K RWF
        transfer: parseFloat(process.env.DAILY_TRANSFER_LIMIT || '300000') // 300K RWF
      },
      monthly: {
        deposit: parseFloat(process.env.MONTHLY_DEPOSIT_LIMIT || '5000000'), // 5M RWF
        withdrawal: parseFloat(process.env.MONTHLY_WITHDRAWAL_LIMIT || '2000000'), // 2M RWF
        transfer: parseFloat(process.env.MONTHLY_TRANSFER_LIMIT || '3000000') // 3M RWF
      },
      perTransaction: {
        minDeposit: parseFloat(process.env.MIN_DEPOSIT_AMOUNT || '100'), // 100 RWF
        maxDeposit: parseFloat(process.env.MAX_DEPOSIT_AMOUNT || '1000000'), // 1M RWF
        minWithdrawal: parseFloat(process.env.MIN_WITHDRAWAL_AMOUNT || '500'), // 500 RWF
        maxWithdrawal: parseFloat(process.env.MAX_WITHDRAWAL_AMOUNT || '500000'), // 500K RWF
        minTransfer: parseFloat(process.env.MIN_TRANSFER_AMOUNT || '100'), // 100 RWF
        maxTransfer: parseFloat(process.env.MAX_TRANSFER_AMOUNT || '500000') // 500K RWF
      }
    },
    
    // Traditional payment fees (for direct payments)
    fees: {
      deposit: {
        mobile_money: { type: 'percentage', amount: 0, min: 0, max: 0 } // No deposit fees
      },
      withdrawal: {
        mobile_money: { type: 'fixed', amount: 100 }, // 100 RWF
        bank_transfer: { type: 'fixed', amount: 200 } // 200 RWF
      },
      transfer: {
        mobile_money: { type: 'percentage', amount: 0.5, min: 50, max: 500 }, // 0.5%
        bank_transfer: { type: 'fixed', amount: 100 } // 100 RWF
      }
    },
    
    // NEW: Escrow-specific limits (higher limits for escrow transactions)
    escrowLimits: {
      daily: {
        maxAmount: parseFloat(process.env.ESCROW_DAILY_LIMIT || '2000000'), // 2M RWF daily
        maxTransactions: parseInt(process.env.ESCROW_DAILY_TRANSACTIONS || '50')
      },
      monthly: {
        maxAmount: parseFloat(process.env.ESCROW_MONTHLY_LIMIT || '20000000'), // 20M RWF monthly
        maxTransactions: parseInt(process.env.ESCROW_MONTHLY_TRANSACTIONS || '500')
      },
      perTransaction: {
        minEscrowAmount: parseFloat(process.env.ESCROW_MIN_AMOUNT || '500'), // 500 RWF minimum
        maxEscrowAmount: parseFloat(process.env.ESCROW_MAX_AMOUNT || '5000000'), // 5M RWF maximum
        maxHoldingDays: parseInt(process.env.ESCROW_MAX_HOLDING_DAYS || '365')
      }
    }
  },

  // UPDATED: Currency Configuration (East Africa focus)
  currencies: {
    default: 'RWF', // Rwanda Franc primary
    supported: (process.env.SUPPORTED_CURRENCIES || 'RWF,USD,UGX,TZS,KES').split(','),
    exchangeApiUrl: 'https://hexarate.paikama.co/api/rates/latest',
    
    // Currency-specific settings for East Africa
    rwf: {
      symbol: 'FRw',
      name: 'Rwandan Franc',
      decimals: 0, // Rwanda Franc doesn't use decimals
      minAmount: 100,
      maxAmount: 50000000, // 50M RWF
      country: 'Rwanda',
      countryCode: 'RW'
    },
    usd: {
      symbol: '$',
      name: 'US Dollar',
      decimals: 2,
      minAmount: 1,
      maxAmount: 50000, // $50K USD
      country: 'United States',
      countryCode: 'US'
    },
    ugx: {
      symbol: 'UGX',
      name: 'Ugandan Shilling',
      decimals: 0,
      minAmount: 1000,
      maxAmount: 100000000, // 100M UGX
      country: 'Uganda',
      countryCode: 'UG'
    },
    tzs: {
      symbol: 'TZS',
      name: 'Tanzanian Shilling',
      decimals: 0,
      minAmount: 1000,
      maxAmount: 50000000, // 50M TZS
      country: 'Tanzania',
      countryCode: 'TZ'
    },
    kes: {
      symbol: 'KSh',
      name: 'Kenyan Shilling',
      decimals: 2,
      minAmount: 100,
      maxAmount: 50000000, // 50M KES
      country: 'Kenya',
      countryCode: 'KE'
    }
  },

  // Enhanced Webhook Security
  webhooks: {
    // Pesapal webhook settings
    pesapalSecret: process.env.PESAPAL_WEBHOOK_SECRET || '',
    pesapalAllowedIPs: process.env.PESAPAL_WEBHOOK_IPS?.split(',') || [],

    // General webhook settings
    timeout: parseInt(process.env.WEBHOOK_TIMEOUT || '30000'), // 30 seconds
    retryAttempts: parseInt(process.env.WEBHOOK_RETRY_ATTEMPTS || '3'),
    verifySignatures: process.env.WEBHOOK_VERIFY_SIGNATURES !== 'false',
    logWebhooks: process.env.LOG_WEBHOOKS !== 'false'
  },

  // UPDATED: Security Configuration
  security: {
    encryptionKey: process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || 'change-in-production',
    sessionSecret: process.env.SESSION_SECRET || 'default-session-secret',
    
    // Rate limiting (more restrictive for escrow)
    rateLimiting: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
      maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
      
      // Escrow-specific rate limits
      escrowWindowMs: parseInt(process.env.ESCROW_RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
      escrowMaxRequests: parseInt(process.env.ESCROW_RATE_LIMIT_MAX_REQUESTS || '20'),
      
      // Webhook rate limits
      webhookWindowMs: parseInt(process.env.WEBHOOK_RATE_LIMIT_WINDOW_MS || '60000'), // 1 minute
      webhookMaxRequests: parseInt(process.env.WEBHOOK_RATE_LIMIT_MAX_REQUESTS || '100')
    },
    
    // IP whitelisting and security
    trustedIPs: process.env.TRUSTED_IPS?.split(',') || [],
    blockSuspiciousIPs: process.env.BLOCK_SUSPICIOUS_IPS === 'true',
    adminUserIds: process.env.ADMIN_USER_IDS?.split(',').map(id => parseInt(id)) || [1],
    
    // CORS settings
    corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['https://jambolush.com'],
    corsCredentials: process.env.CORS_CREDENTIALS === 'true'
  },

  // UPDATED: Notification Configuration (Enhanced for Escrow)
  notifications: {
    // Email settings (using Brevo)
    email: {
      provider: 'brevo',
      apiKey: process.env.BREVO_API_KEY || '',
      fromEmail: process.env.BREVO_SENDER_EMAIL || 'noreply@jambolush.com',
      fromName: process.env.EMAIL_FROM_NAME || 'Jambolush',
      replyTo: process.env.SUPPORT_EMAIL || 'support@jambolush.com'
    },
    
    // SMS settings (Africa's Talking - popular in East Africa)
    sms: {
      provider: process.env.SMS_PROVIDER || 'africastalking',
      apiKey: process.env.BREVO_SMS_API_KEY || '',
      username: process.env.SMS_USERNAME || 'jambolush',
      from: process.env.SMS_FROM || 'JAMBOLUSH',
      enabled: process.env.SMS_NOTIFICATIONS_ENABLED === 'true'
    },
    
    // Push notifications
    push: {
      fcmServerKey: process.env.FCM_SERVER_KEY || '',
      enabled: process.env.PUSH_NOTIFICATIONS_ENABLED === 'true'
    },
    
    // Escrow-specific notification settings
    escrowNotifications: {
      emailEnabled: process.env.ESCROW_EMAIL_NOTIFICATIONS !== 'false',
      smsEnabled: process.env.ESCROW_SMS_NOTIFICATIONS === 'true',
      pushEnabled: process.env.ESCROW_PUSH_NOTIFICATIONS === 'true',
      
      // Notification timing
      depositCreated: true,
      paymentCompleted: true,
      fundsHeld: true,
      releaseRequested: true,
      fundsReleased: true,
      withdrawalRequested: true,
      withdrawalCompleted: true,
      refundProcessed: true,
      disputeCreated: true,
      
      // Reminder notifications
      autoReleaseReminder: parseInt(process.env.AUTO_RELEASE_REMINDER_DAYS || '3'), // 3 days before
      disputeDeadlineReminder: parseInt(process.env.DISPUTE_DEADLINE_REMINDER_DAYS || '2') // 2 days before
    }
  },

  // UPDATED: Feature Flags (Escrow-focused)
  features: {
    // Core escrow features
    enableEscrowPayments: process.env.ENABLE_ESCROW_PAYMENTS !== 'false', // Enabled by default
    enableP2PEscrow: process.env.ENABLE_P2P_ESCROW !== 'false',
    enableBulkEscrow: process.env.ENABLE_BULK_ESCROW === 'true',
    enableEscrowTemplates: process.env.ENABLE_ESCROW_TEMPLATES === 'true',
    enableDisputeSystem: process.env.ENABLE_DISPUTE_SYSTEM !== 'false',
    
    // Payment method features
    enableMobileMoneyPayments: process.env.ENABLE_MOBILE_MONEY !== 'false',
    enableBankTransfers: process.env.ENABLE_BANK_TRANSFERS !== 'false',
    enableCardPayments: process.env.ENABLE_CARD_PAYMENTS !== 'false',
    
    // Advanced features
    enableMultiCurrency: process.env.ENABLE_MULTI_CURRENCY !== 'false',
    enableEscrowAnalytics: process.env.ENABLE_ESCROW_ANALYTICS !== 'false',
    enableAutoRelease: process.env.ENABLE_AUTO_RELEASE !== 'false',
    enableEmailNotifications: process.env.ENABLE_EMAIL_NOTIFICATIONS !== 'false',

    // Integration features
    enableMobileApp: process.env.ENABLE_MOBILE_APP === 'true',
    enableWebhookLogs: process.env.ENABLE_WEBHOOK_LOGS !== 'false',
    enableApiDocumentation: process.env.ENABLE_API_DOCS !== 'false'
  },

  // NEW: Background Jobs Configuration (for escrow automation)
  jobs: {
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
    enableEscrowJobs: process.env.ENABLE_ESCROW_JOBS !== 'false',
    jobConcurrency: parseInt(process.env.JOB_CONCURRENCY || '5'),
    
    // Job schedules (cron format)
    schedules: {
      autoReleaseCheck: process.env.AUTO_RELEASE_CHECK_SCHEDULE || '0 */10 * * * *', // Every 10 minutes
      disputeDeadlineCheck: process.env.DISPUTE_DEADLINE_CHECK_SCHEDULE || '0 0 */6 * * *', // Every 6 hours
      escrowExpiryCheck: process.env.ESCROW_EXPIRY_CHECK_SCHEDULE || '0 0 0 * * *', // Daily at midnight
      notificationRetry: process.env.NOTIFICATION_RETRY_SCHEDULE || '0 */5 * * * *', // Every 5 minutes
      webhookRetry: process.env.WEBHOOK_RETRY_SCHEDULE || '0 */2 * * * *', // Every 2 minutes
      analyticsUpdate: process.env.ANALYTICS_UPDATE_SCHEDULE || '0 0 1 * * *', // Daily at 1 AM
      ipnHealthCheck: process.env.IPN_HEALTH_CHECK_SCHEDULE || '0 0 */12 * * *' // Every 12 hours
    }
  },

  // UPDATED: Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    enableEscrowLogs: process.env.ENABLE_ESCROW_LOGS !== 'false',
    enablePaymentLogs: process.env.ENABLE_PAYMENT_LOGS !== 'false',
    enableWebhookLogs: process.env.ENABLE_WEBHOOK_LOGS !== 'false',
    enableIPNLogs: process.env.ENABLE_IPN_LOGS !== 'false', // New: IPN registration logging
    logSensitiveData: process.env.LOG_SENSITIVE_DATA === 'true' && process.env.NODE_ENV !== 'production',
    
    // File logging
    logToFile: process.env.LOG_TO_FILE === 'true',
    logPath: process.env.LOG_PATH || './logs',
    maxLogFiles: parseInt(process.env.MAX_LOG_FILES || '14'), // 2 weeks
    maxLogSize: process.env.MAX_LOG_SIZE || '20m', // 20MB
    
    // Structured logging
    enableStructuredLogs: process.env.ENABLE_STRUCTURED_LOGS === 'true',
    logFormat: process.env.LOG_FORMAT || 'combined' // 'combined', 'json', 'simple'
  },

  // NEW: Analytics Configuration
  analytics: {
    enableEscrowAnalytics: process.env.ENABLE_ESCROW_ANALYTICS !== 'false',
    retentionDays: parseInt(process.env.ANALYTICS_RETENTION_DAYS || '90'),
    
    // Third-party integrations
    googleAnalyticsId: process.env.GOOGLE_ANALYTICS_ID || '',
    mixpanelToken: process.env.MIXPANEL_TOKEN || '',
    
    // Event tracking
    trackEscrowEvents: process.env.TRACK_ESCROW_EVENTS !== 'false',
    trackUserBehavior: process.env.TRACK_USER_BEHAVIOR === 'true',
    trackPaymentMethods: process.env.TRACK_PAYMENT_METHODS !== 'false',
    
    // Business metrics
    calculateConversionRates: process.env.CALCULATE_CONVERSION_RATES !== 'false',
    trackRevenueMetrics: process.env.TRACK_REVENUE_METRICS !== 'false'
  },

  // UPDATED: Regional Settings (East Africa focus)
  regional: {
    defaultTimezone: process.env.DEFAULT_TIMEZONE || 'Africa/Kigali', // Rwanda timezone
    defaultLocale: process.env.DEFAULT_LOCALE || 'en-RW',
    supportedLocales: (process.env.SUPPORTED_LOCALES || 'en-RW,rw-RW,en-KE,sw-KE,en-UG,en-TZ').split(','),
    
    // Regional compliance and regulations
    rwandaCompliance: process.env.RWANDA_COMPLIANCE !== 'false',
    kenyaCompliance: process.env.KENYA_COMPLIANCE === 'true',
    ugandaCompliance: process.env.UGANDA_COMPLIANCE === 'true',
    tanzaniaCompliance: process.env.TANZANIA_COMPLIANCE === 'true',
    
    // Data residency (important for financial data)
    dataResidency: process.env.DATA_RESIDENCY || 'africa-east',
    requireLocalDataStorage: process.env.REQUIRE_LOCAL_DATA_STORAGE === 'true',
    
    // Regional business settings
    businessHours: {
      timezone: 'Africa/Kigali',
      start: process.env.BUSINESS_HOURS_START || '08:00',
      end: process.env.BUSINESS_HOURS_END || '18:00',
      workingDays: (process.env.WORKING_DAYS || 'MON,TUE,WED,THU,FRI').split(',')
    }
  },

  // NEW: File Upload Configuration (for dispute evidence, KYC documents)
  fileUpload: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'), // 10MB
    allowedMimeTypes: (process.env.ALLOWED_MIME_TYPES || 'image/jpeg,image/png,image/gif,application/pdf,text/plain').split(','),
    uploadPath: process.env.UPLOAD_PATH || './uploads',
    cloudProvider: process.env.CLOUD_PROVIDER || 'local', // local, aws, cloudinary
    
    // Cloudinary configuration (popular and reliable in Africa)
    cloudinary: {
      cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
      apiKey: process.env.CLOUDINARY_API_KEY || '',
      apiSecret: process.env.CLOUDINARY_API_SECRET || '',
      folder: process.env.CLOUDINARY_FOLDER || 'jambolush/escrow'
    }
  }
};

// Enhanced Configuration Validation with IPN Auto-Registration
export function validateConfig() {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Critical XentriPay configuration validation
  const requiredXentriPayVars = [
    'XENTRIPAY_API_KEY'
  ];

  const missingXentriPayVars = requiredXentriPayVars.filter(varName => !process.env[varName]);
  if (missingXentriPayVars.length > 0) {
    warnings.push(`Missing XentriPay environment variables: ${missingXentriPayVars.join(', ')}`);
  }

  // Critical Pesapal configuration validation
  const requiredPesapalVars = [
    'PESAPAL_CONSUMER_KEY',
    'PESAPAL_CONSUMER_SECRET',
    'PESAPAL_WEBHOOK_SECRET',
    'PESAPAL_MERCHANT_ACCOUNT'
  ];

  const missingPesapalVars = requiredPesapalVars.filter(varName => !process.env[varName]);
  if (missingPesapalVars.length > 0) {
    warnings.push(`Missing Pesapal environment variables: ${missingPesapalVars.join(', ')}`);
  }

  // Validate Pesapal URLs for auto-registration
  if (!config.pesapal.callbackUrl || !config.pesapal.callbackUrl.includes('http')) {
    errors.push('PESAPAL_CALLBACK_URL must be a valid HTTP/HTTPS URL');
  }

  // Auto-registration specific validation
  if (config.pesapal.autoRegisterIPN) {
    if (!config.pesapal.ipnUrl || !config.pesapal.ipnUrl.includes('http')) {
      warnings.push('Auto IPN registration enabled but IPN URL is invalid. Using callback URL as fallback.');
    }
    console.log('✅ Auto IPN registration is enabled');
  } else {
    // If auto-registration is disabled, check for manual IPN ID
    if (!process.env.PESAPAL_IPN_ID) {
      warnings.push('Auto IPN registration disabled and no manual PESAPAL_IPN_ID provided');
    }
  }

  // Validate currency configurations
  if (!config.currencies.supported.includes(config.currencies.default)) {
    errors.push(`Default currency ${config.currencies.default} is not in supported currencies list`);
  }

  // Validate split rules
  const { host, agent, platform } = config.escrow.defaultSplitRules;
  const total = host + agent + platform;
  if (Math.abs(total - 100) > 0.01) {
    errors.push(`Invalid default split rules: Host(${host}%) + Agent(${agent}%) + Platform(${platform}%) = ${total}% (must equal 100%)`);
  }

  // Validate notification settings
  if (config.features.enableEmailNotifications && !config.notifications.email.apiKey) {
    warnings.push('Email notifications enabled but Brevo API key is missing');
  }

  // Production-specific validations
  if (process.env.NODE_ENV === 'production') {
    if (config.security.encryptionKey === 'change-in-production') {
      errors.push('Must set ENCRYPTION_KEY in production environment');
    }
    
    if (!config.security.corsOrigins.some(origin => origin.includes('jambolush.com'))) {
      warnings.push('No jambolush.com domain in CORS origins for production');
    }

    // Production should use HTTPS URLs
    if (!config.pesapal.callbackUrl.startsWith('https://')) {
      warnings.push('Production environment should use HTTPS for callback URLs');
    }
  }

  // Display results
  if (errors.length > 0) {
    console.error('❌ Configuration validation failed:');
    errors.forEach(error => console.error(`   - ${error}`));
    throw new Error(`Configuration validation failed: ${errors.join('; ')}`);
  }

  if (warnings.length > 0) {
    console.warn('⚠️  Configuration warnings:');
    warnings.forEach(warning => console.warn(`   - ${warning}`));
  }

  console.log('✅ Configuration validated successfully');
}

// Enhanced Configuration Helper Functions
export const configUtils = {
  // Get currency configuration
  getCurrencyConfig: (currencyCode: string) => {
    const code = currencyCode.toLowerCase();
    return (config.currencies as any)[code] || null;
  },

  // Check if feature is enabled
  isFeatureEnabled: (featureName: keyof typeof config.features): boolean => {
    return config.features[featureName] === true;
  },

  // Get escrow fee for transaction type
  getEscrowFee: (transactionType: string): number => {
    const fees = config.escrow.fees as any;
    return fees[transactionType] || 0;
  },

  // Check if currency is supported
  isCurrencySupported: (currencyCode: string): boolean => {
    return config.currencies.supported.includes(currencyCode.toUpperCase());
  },

  // Environment helpers
  isDevelopment: (): boolean => process.env.NODE_ENV === 'development',
  isProduction: (): boolean => process.env.NODE_ENV === 'production',
  isTest: (): boolean => process.env.NODE_ENV === 'test',

  // Get webhook URLs
  getWebhookUrls: () => ({
    pesapal: config.pesapal.callbackUrl,
    pesapalIpn: config.pesapal.ipnUrl
  }),

  // Get payment provider settings
  getPaymentProvider: () => ({
    primary: 'pesapal',
    escrowEnabled: config.features.enableEscrowPayments,
    autoIPNRegistration: config.pesapal.autoRegisterIPN
  }),

  // Format currency amount based on currency config
  formatCurrency: (amount: number, currencyCode: string): string => {
    const currencyConfig = configUtils.getCurrencyConfig(currencyCode);
    if (!currencyConfig) {
      return `${amount} ${currencyCode}`;
    }
    
    const formattedAmount = currencyConfig.decimals === 0 
      ? Math.round(amount).toString()
      : amount.toFixed(currencyConfig.decimals);
    return `${currencyConfig.symbol}${formattedAmount}`;
  },

  // Validate transaction limits
  validateTransactionLimits: (amount: number, type: 'escrow' | 'direct', currency: string = 'RWF') => {
    const limits = type === 'escrow' ? config.payment.escrowLimits : config.payment.limits;
    const currencyConfig = configUtils.getCurrencyConfig(currency);
    
    if (!currencyConfig) {
      throw new Error(`Unsupported currency: ${currency}`);
    }

    if (amount < currencyConfig.minAmount) {
      throw new Error(`Amount below minimum for ${currency}: ${configUtils.formatCurrency(currencyConfig.minAmount, currency)}`);
    }

    if (amount > currencyConfig.maxAmount) {
      throw new Error(`Amount exceeds maximum for ${currency}: ${configUtils.formatCurrency(currencyConfig.maxAmount, currency)}`);
    }

    return true;
  },

  // Get business hours info
  getBusinessHours: () => {
    const now = new Date();
    const rwandaTime = new Intl.DateTimeFormat('en', {
      timeZone: config.regional.defaultTimezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(now);

    const dayName = new Intl.DateTimeFormat('en', {
      timeZone: config.regional.defaultTimezone,
      weekday: 'short'
    }).format(now).toUpperCase();

    const isWorkingDay = config.regional.businessHours.workingDays.includes(dayName);
    const currentTime = rwandaTime;
    const startTime = config.regional.businessHours.start;
    const endTime = config.regional.businessHours.end;
    
    const isBusinessHours = isWorkingDay && 
      currentTime >= startTime && 
      currentTime <= endTime;

    return {
      isBusinessHours,
      isWorkingDay,
      currentTime,
      timezone: config.regional.defaultTimezone,
      businessHours: `${startTime} - ${endTime}`,
      workingDays: config.regional.businessHours.workingDays.join(', ')
    };
  },

  // IPN configuration helpers
  getIPNConfiguration: () => ({
    autoRegister: config.pesapal.autoRegisterIPN,
    ipnUrl: config.pesapal.ipnUrl,
    callbackUrl: config.pesapal.callbackUrl,
    cacheDuration: config.pesapal.ipnCacheDuration,
    retryAttempts: config.pesapal.ipnRetryAttempts,
    retryDelay: config.pesapal.ipnRetryDelay
  }),

  // Get all environment URLs for debugging
  getAllUrls: () => ({
    callback: config.pesapal.callbackUrl,
    ipn: config.pesapal.ipnUrl,
    webhook: config.pesapal.callbackUrl,
    client: config.clientUrl,
    base: config.pesapal.baseUrl
  })
};

export default config;