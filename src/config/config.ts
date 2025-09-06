import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 3000,
  jwtSecret: process.env.JWT_SECRET || 'default-secret',
  googleClientId: process.env.GOOGLE_CLIENT_ID || '739960680632-g75378et3hgeu5qmukdqp8085369gh1t.apps.googleusercontent.com',
  appleClientId: process.env.APPLE_CLIENT_ID || '',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:3000',

  //brevo api
  brevoApiKey: process.env.BREVO_API_KEY || '',
  brevoSenderEmail: process.env.BREVO_SENDER_EMAIL || '',

  // Jenga API Configuration
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

  // Payment Configuration
  payment: {
    defaultCurrency: 'KES',
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
    }
  },

  // Webhook Security
  webhooks: {
    jengaSecret: process.env.JENGA_WEBHOOK_SECRET!,
    allowedIPs: process.env.JENGA_WEBHOOK_IPS?.split(',') || []
  }
};