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

  // Brevo API
  brevoApiKey: process.env.BREVO_API_KEY || '',
  brevoSenderEmail: process.env.BREVO_SENDER_EMAIL || '',

  // Jenga API Configuration (Existing)
  jenga: {
    baseUrl: process.env.JENGA_BASE_URL || 'https://sandbox.jengahq.io',
    username: process.env.JENGA_USERNAME!,
    password: process.env.JENGA_PASSWORD!,
    apiKey: process.env.JENGA_API_KEY!,
    privateKey: process.env.JENGA_PRIVATE_KEY!,
    environment: process.env.JENGA_ENVIRONMENT || 'sandbox',
    callbackUrl: process.env.JENGA_CALLBACK_URL || 'https://jambolush.com/payments/webhook/jenga',
    sourceAccount: process.env.JENGA_SOURCE_ACCOUNT!, // Your main account for withdrawals
  },

  // NEW: Escrow API Configuration
  escrow: {
    baseUrl: process.env.ESCROW_BASE_URL || 'https://api.escrowpayments.com',
    apiKey: process.env.ESCROW_API_KEY || '',
    secretKey: process.env.ESCROW_SECRET_KEY || '',
    merchantId: process.env.ESCROW_MERCHANT_ID || '',
    environment: process.env.ESCROW_ENVIRONMENT || 'sandbox',
    callbackUrl: process.env.ESCROW_CALLBACK_URL || 'https://jambolush.com/payments/webhook/escrow',
    webhookSecret: process.env.ESCROW_WEBHOOK_SECRET || '',
    
    // Escrow-specific settings
    defaultCurrency: process.env.ESCROW_DEFAULT_CURRENCY || 'USD',
    supportedCurrencies: (process.env.ESCROW_SUPPORTED_CURRENCIES || 'USD,RWF').split(','),
    maxTransactionAmount: parseFloat(process.env.ESCROW_MAX_TRANSACTION_AMOUNT || '1000000'),
    minTransactionAmount: parseFloat(process.env.ESCROW_MIN_TRANSACTION_AMOUNT || '1'),
    defaultDisputeDeadlineDays: parseInt(process.env.ESCROW_DEFAULT_DISPUTE_DEADLINE_DAYS || '30'),
    maxHoldingDays: parseInt(process.env.ESCROW_MAX_HOLDING_DAYS || '365'),
    
    // Escrow fee configuration
    fees: {
      escrowDeposit: parseFloat(process.env.ESCROW_DEPOSIT_FEE || '2.5'), // 2.5%
      p2pEscrow: parseFloat(process.env.ESCROW_P2P_FEE || '1.5'), // 1.5%
      escrowTransfer: parseFloat(process.env.ESCROW_TRANSFER_FEE || '1.0'), // 1.0%
      disputeFee: parseFloat(process.env.ESCROW_DISPUTE_FEE || '25'), // $25 USD
      expeditedReleaseFee: parseFloat(process.env.ESCROW_EXPEDITED_FEE || '10'), // $10 USD
      cancellationFee: parseFloat(process.env.ESCROW_CANCELLATION_FEE || '5') // $5 USD
    },
    
    // Rate limiting for escrow operations
    rateLimits: {
      escrowOperationsPerMinute: parseInt(process.env.ESCROW_RATE_LIMIT_PER_MINUTE || '10'),
      escrowOperationsPerHour: parseInt(process.env.ESCROW_RATE_LIMIT_PER_HOUR || '100'),
      maxConcurrentEscrows: parseInt(process.env.ESCROW_MAX_CONCURRENT || '50')
    }
  },

  // Enhanced Payment Configuration (Updated)
  payment: {
    defaultCurrency: 'USD', // Keeping your existing default
    
    // Traditional payment limits (your existing limits)
    limits: {
      daily: {
        deposit: 100000,
        withdrawal: 50000,
        transfer: 50000
      },
      monthly: {
        deposit: 1000000,
        withdrawal: 500000,
        transfer: 500000
      },
      perTransaction: {
        minDeposit: 10,
        maxDeposit: 100000,
        minWithdrawal: 50,
        maxWithdrawal: 50000,
        minTransfer: 10,
        maxTransfer: 50000
      }
    },
    
    // Traditional payment fees (your existing fees)
    fees: {
      deposit: {
        mobile_money: { type: 'percentage', amount: 1, min: 5, max: 100 }
      },
      withdrawal: {
        bank_transfer: { type: 'fixed', amount: 25 }
      },
      transfer: {
        mobile_money: { type: 'percentage', amount: 0.5, min: 10, max: 50 },
        bank_transfer: { type: 'fixed', amount: 50 }
      }
    },
    
    // NEW: Escrow-specific limits
    escrowLimits: {
      daily: {
        maxAmount: parseFloat(process.env.ESCROW_DAILY_LIMIT || '500000'), // KES 500,000
        maxTransactions: parseInt(process.env.ESCROW_DAILY_TRANSACTIONS || '20')
      },
      monthly: {
        maxAmount: parseFloat(process.env.ESCROW_MONTHLY_LIMIT || '5000000'), // KES 5,000,000
        maxTransactions: parseInt(process.env.ESCROW_MONTHLY_TRANSACTIONS || '200')
      },
      perTransaction: {
        minEscrowAmount: parseFloat(process.env.ESCROW_MIN_AMOUNT || '100'), // KES 100
        maxEscrowAmount: parseFloat(process.env.ESCROW_MAX_AMOUNT || '1000000'), // KES 1,000,000
        maxHoldingDays: parseInt(process.env.ESCROW_MAX_HOLDING_DAYS || '365')
      }
    }
  },

  // NEW: Currency Configuration (Multi-currency support)
  currencies: {
    default: 'KES', // Keeping your existing default
    supported: (process.env.SUPPORTED_CURRENCIES || 'KES,USD,RWF').split(','),
    exchangeApiKey: process.env.EXCHANGE_RATE_API_KEY || '',
    
    // Currency-specific settings
    kes: {
      symbol: 'KSh',
      decimals: 2,
      minAmount: 10,
      maxAmount: 10000000,
      country: 'Kenya'
    },
    usd: {
      symbol: '$',
      decimals: 2,
      minAmount: 1,
      maxAmount: 100000,
      country: 'United States'
    },
    rwf: {
      symbol: 'FRw',
      decimals: 0,
      minAmount: 100,
      maxAmount: 100000000,
      country: 'Rwanda'
    }
  },

  // Enhanced Webhook Security (Updated)
  webhooks: {
    // Existing Jenga webhook settings
    jengaSecret: process.env.JENGA_WEBHOOK_SECRET!,
    allowedIPs: process.env.JENGA_WEBHOOK_IPS?.split(',') || [],
    
    // NEW: Escrow webhook settings
    escrowSecret: process.env.ESCROW_WEBHOOK_SECRET || '',
    escrowAllowedIPs: process.env.ESCROW_WEBHOOK_IPS?.split(',') || [],
    
    // General webhook settings
    timeout: parseInt(process.env.WEBHOOK_TIMEOUT || '30000'), // 30 seconds
    retryAttempts: parseInt(process.env.WEBHOOK_RETRY_ATTEMPTS || '3'),
    verifySignatures: process.env.WEBHOOK_VERIFY_SIGNATURES !== 'false'
  },

  // NEW: Security Configuration
  security: {
    encryptionKey: process.env.ENCRYPTION_KEY || 'default-encryption-key-change-in-production',
    sessionSecret: process.env.SESSION_SECRET || 'default-session-secret',
    
    // Rate limiting
    rateLimiting: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
      maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
      escrowWindowMs: parseInt(process.env.ESCROW_RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
      escrowMaxRequests: parseInt(process.env.ESCROW_RATE_LIMIT_MAX_REQUESTS || '25')
    },
    
    // IP whitelisting
    trustedIPs: process.env.TRUSTED_IPS?.split(',') || [],
    blockSuspiciousIPs: process.env.BLOCK_SUSPICIOUS_IPS === 'true'
  },

  // NEW: Notification Configuration
  notifications: {
    // Email settings (using your existing Brevo)
    email: {
      provider: 'brevo',
      apiKey: process.env.BREVO_API_KEY || '',
      fromEmail: process.env.BREVO_SENDER_EMAIL || '',
      fromName: process.env.EMAIL_FROM_NAME || 'Jambolush Payments'
    },
    
    // SMS settings
    sms: {
      provider: process.env.SMS_PROVIDER || 'africastalking', // Popular in Kenya/Rwanda
      apiKey: process.env.SMS_API_KEY || '',
      username: process.env.SMS_USERNAME || '',
      from: process.env.SMS_FROM || 'JAMBOLUSH'
    },
    
    // Push notifications
    push: {
      fcmServerKey: process.env.FCM_SERVER_KEY || '',
      enabled: process.env.PUSH_NOTIFICATIONS_ENABLED === 'true'
    },
    
    // Notification preferences
    escrowNotifications: {
      emailEnabled: process.env.ESCROW_EMAIL_NOTIFICATIONS !== 'false',
      smsEnabled: process.env.ESCROW_SMS_NOTIFICATIONS === 'true',
      pushEnabled: process.env.ESCROW_PUSH_NOTIFICATIONS === 'true'
    }
  },

  // NEW: File Upload Configuration (for dispute evidence)
  fileUpload: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'), // 10MB
    allowedMimeTypes: (process.env.ALLOWED_MIME_TYPES || 'image/jpeg,image/png,image/gif,application/pdf,text/plain').split(','),
    uploadPath: process.env.UPLOAD_PATH || './uploads',
    cloudProvider: process.env.CLOUD_PROVIDER || 'local', // local, aws, cloudinary
    
    // Cloudinary configuration (popular in Africa)
    cloudinary: {
      cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
      apiKey: process.env.CLOUDINARY_API_KEY || '',
      apiSecret: process.env.CLOUDINARY_API_SECRET || ''
    }
  },

  // NEW: Feature Flags
  features: {
    enableEscrowPayments: process.env.ENABLE_ESCROW_PAYMENTS !== 'false',
    enableP2PEscrow: process.env.ENABLE_P2P_ESCROW !== 'false',
    enableEscrowTemplates: process.env.ENABLE_ESCROW_TEMPLATES === 'true',
    enableBulkEscrow: process.env.ENABLE_BULK_ESCROW === 'true',
    enableEscrowAnalytics: process.env.ENABLE_ESCROW_ANALYTICS === 'true',
    enableMultiCurrency: process.env.ENABLE_MULTI_CURRENCY !== 'false',
    enableMobileApp: process.env.ENABLE_MOBILE_APP === 'true',
    enableDisputeSystem: process.env.ENABLE_DISPUTE_SYSTEM !== 'false'
  },

  // NEW: Background Jobs Configuration
  jobs: {
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
    enableEscrowJobs: process.env.ENABLE_ESCROW_JOBS === 'true',
    jobConcurrency: parseInt(process.env.JOB_CONCURRENCY || '5'),
    
    // Job schedules (cron format)
    schedules: {
      autoReleaseCheck: process.env.AUTO_RELEASE_CHECK_SCHEDULE || '0 */10 * * * *', // Every 10 minutes
      disputeDeadlineCheck: process.env.DISPUTE_DEADLINE_CHECK_SCHEDULE || '0 0 */6 * * *', // Every 6 hours
      escrowExpiryCheck: process.env.ESCROW_EXPIRY_CHECK_SCHEDULE || '0 0 0 * * *', // Daily at midnight
      notificationRetry: process.env.NOTIFICATION_RETRY_SCHEDULE || '0 */5 * * * *' // Every 5 minutes
    }
  },

  // NEW: Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    enableEscrowLogs: process.env.ENABLE_ESCROW_LOGS !== 'false',
    enablePaymentLogs: process.env.ENABLE_PAYMENT_LOGS !== 'false',
    logWebhooks: process.env.LOG_WEBHOOKS === 'true',
    logSensitiveData: process.env.LOG_SENSITIVE_DATA === 'true' && process.env.NODE_ENV !== 'production',
    
    // File logging
    logToFile: process.env.LOG_TO_FILE === 'true',
    logPath: process.env.LOG_PATH || './logs',
    maxLogFiles: parseInt(process.env.MAX_LOG_FILES || '14'), // 2 weeks
    maxLogSize: process.env.MAX_LOG_SIZE || '20m' // 20MB
  },

  // NEW: Analytics Configuration
  analytics: {
    enableEscrowAnalytics: process.env.ENABLE_ESCROW_ANALYTICS === 'true',
    retentionDays: parseInt(process.env.ANALYTICS_RETENTION_DAYS || '90'),
    
    // Third-party integrations
    googleAnalyticsId: process.env.GOOGLE_ANALYTICS_ID || '',
    mixpanelToken: process.env.MIXPANEL_TOKEN || '',
    
    // Event tracking
    trackEscrowEvents: process.env.TRACK_ESCROW_EVENTS !== 'false',
    trackUserBehavior: process.env.TRACK_USER_BEHAVIOR === 'true'
  },

  // NEW: Regional Settings
  regional: {
    defaultTimezone: process.env.DEFAULT_TIMEZONE || 'Africa/Nairobi', // Kenya timezone
    defaultLocale: process.env.DEFAULT_LOCALE || 'en-KE',
    supportedLocales: (process.env.SUPPORTED_LOCALES || 'en-KE,sw-KE,en-RW,rw-RW').split(','),
    
    // Regional compliance
    kenyaCompliance: process.env.KENYA_COMPLIANCE === 'true',
    rwandaCompliance: process.env.RWANDA_COMPLIANCE === 'true',
    dataResidency: process.env.DATA_RESIDENCY || 'africa-east' // For data sovereignty
  }
};

// Configuration validation function
export function validateConfig() {
  const requiredVars = [
    'JENGA_USERNAME',
    'JENGA_PASSWORD',
    'JENGA_API_KEY',
    'JENGA_PRIVATE_KEY',
    'JENGA_SOURCE_ACCOUNT',
    'JENGA_WEBHOOK_SECRET'
  ];

  // Only validate escrow vars if escrow is enabled
  if (config.features.enableEscrowPayments) {
    requiredVars.push(
      'ESCROW_API_KEY',
      'ESCROW_SECRET_KEY',
      'ESCROW_MERCHANT_ID',
      'ESCROW_WEBHOOK_SECRET'
    );
  }

  const missingVars = requiredVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    console.warn(`⚠️  Missing environment variables: ${missingVars.join(', ')}`);
    
    // Only throw error for critical Jenga vars
    const criticalMissing = missingVars.filter(v => v.startsWith('JENGA_'));
    if (criticalMissing.length > 0) {
      throw new Error(`Missing critical environment variables: ${criticalMissing.join(', ')}`);
    }
  }

  // Validate currency configurations
  if (!config.currencies.supported.includes(config.currencies.default)) {
    throw new Error(`Default currency ${config.currencies.default} is not in supported currencies list`);
  }

  console.log('✅ Configuration validated successfully');
  console.log(`🌍 Supported currencies: ${config.currencies.supported.join(', ')}`);
  console.log(`💰 Default currency: ${config.currencies.default}`);
  console.log(`🔒 Escrow payments: ${config.features.enableEscrowPayments ? 'Enabled' : 'Disabled'}`);
}

// Configuration helper functions
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

  // Get environment-specific configurations
  isDevelopment: (): boolean => process.env.NODE_ENV === 'development',
  isProduction: (): boolean => process.env.NODE_ENV === 'production',
  isTest: (): boolean => process.env.NODE_ENV === 'test',

  // Get webhook URLs
  getWebhookUrls: () => ({
    jenga: config.jenga.callbackUrl,
    escrow: config.escrow.callbackUrl
  }),

  // Format currency amount based on currency config
  formatCurrency: (amount: number, currencyCode: string): string => {
    const currencyConfig = configUtils.getCurrencyConfig(currencyCode);
    if (!currencyConfig) {
      return `${amount} ${currencyCode}`;
    }
    
    const formattedAmount = amount.toFixed(currencyConfig.decimals);
    return `${currencyConfig.symbol}${formattedAmount}`;
  }
};

export default config;