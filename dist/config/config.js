"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.config = {
    port: process.env.PORT || 3000,
    jwtSecret: process.env.JWT_SECRET || 'default-secret',
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    appleClientId: process.env.APPLE_CLIENT_ID || '',
    clientUrl: process.env.CLIENT_URL || 'http://localhost:3000',
    // Jenga API Configuration
    jenga: {
        baseUrl: process.env.JENGA_BASE_URL || 'https://sandbox.jengahq.io',
        username: process.env.JENGA_USERNAME,
        password: process.env.JENGA_PASSWORD,
        apiKey: process.env.JENGA_API_KEY,
        privateKey: process.env.JENGA_PRIVATE_KEY,
        environment: process.env.JENGA_ENVIRONMENT || 'sandbox',
        callbackUrl: process.env.JENGA_CALLBACK_URL || 'https://jambolush.com/payments/webhook/jenga',
        sourceAccount: process.env.JENGA_SOURCE_ACCOUNT, // Your main account for withdrawals
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
        jengaSecret: process.env.JENGA_WEBHOOK_SECRET,
        allowedIPs: process.env.JENGA_WEBHOOK_IPS?.split(',') || []
    }
};
