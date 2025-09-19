// services/pesapal.service.ts

import axios, { AxiosInstance, AxiosError } from 'axios';
import crypto from 'crypto';
import {
  PesapalConfig,
  PesapalCredentials,
  PesapalAuthRequest,
  PesapalAuthResponse,
  PesapalCheckoutRequest,
  PesapalCheckoutResponse,
  PesapalPayoutRequest,
  PesapalPayoutResponse,
  PesapalTransactionStatus,
  PesapalWebhookData
} from '../types/pesapal.types';

export class PesapalService {
  private client: AxiosInstance;
  private config: PesapalConfig;
  private credentials: PesapalCredentials = {};

  constructor(config: PesapalConfig) {
    this.config = config;
    
    this.client = axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      }
    });

    // Request interceptor for authentication
    this.client.interceptors.request.use(async (config) => {
      // Skip auth for token endpoint
      if (config.url?.includes('/api/Auth/RequestToken')) {
        return config;
      }

      const token = await this.getValidToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }

      return config;
    });

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        if (error.response?.status === 401) {
          // Token expired, refresh and retry
          this.credentials = {};
          const token = await this.getValidToken();
          if (token && error.config) {
            error.config.headers.Authorization = `Bearer ${token}`;
            return this.client.request(error.config);
          }
        }
        return Promise.reject(error);
      }
    );
  }

  // === AUTHENTICATION ===
  
  private async getValidToken(): Promise<any | null> {
    try {
      // Check if current token is still valid
      if (this.credentials.accessToken && this.credentials.expiresAt) {
        if (Date.now() < this.credentials.expiresAt - 60000) { // 1 minute buffer
          return this.credentials.accessToken;
        }
      }

      // Get new token
      const authData: PesapalAuthRequest = {
        consumer_key: this.config.consumerKey,
        consumer_secret: this.config.consumerSecret
      };

      const response = await axios.post<PesapalAuthResponse>(
        `${this.config.baseUrl}/api/Auth/RequestToken`,
        authData,
        {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.error) {
        throw new Error(`Pesapal auth error: ${response.data.error.message}`);
      }

      const expiresAt = new Date(response.data.expiryDate).getTime();
      
      this.credentials = {
        accessToken: response.data.token,
        expiresAt
      };

      return this.credentials.accessToken;
    } catch (error: any) {
      console.error('Pesapal authentication failed:', error.response?.data || error.message);
      return null;
    }
  }

  // === CHECKOUT (DEPOSIT) OPERATIONS ===
  
  async createCheckout(request: PesapalCheckoutRequest): Promise<PesapalCheckoutResponse> {
    try {
      const response = await this.client.post<PesapalCheckoutResponse>(
        '/api/Transactions/SubmitOrderRequest',
        request
      );

      if (response.data.error) {
        throw new Error(`Pesapal checkout error: ${response.data.error.message}`);
      }

      return response.data;
    } catch (error: any) {
      console.error('Pesapal checkout failed:', error);
      throw new Error(
        error.response?.data?.error?.message || 
        error.message || 
        'Checkout request failed'
      );
    }
  }

  // === TRANSACTION STATUS ===
  
  async getTransactionStatus(orderTrackingId: string): Promise<PesapalTransactionStatus> {
    try {
      const response = await this.client.get<PesapalTransactionStatus>(
        `/api/Transactions/GetTransactionStatus?orderTrackingId=${orderTrackingId}`
      );

      return response.data;
    } catch (error: any) {
      console.error('Get transaction status failed:', error);
      throw new Error(
        error.response?.data?.error?.message || 
        error.message || 
        'Failed to get transaction status'
      );
    }
  }

  // === PAYOUT OPERATIONS ===
  
  async createPayout(request: PesapalPayoutRequest): Promise<PesapalPayoutResponse> {
    try {
      const response = await this.client.post<PesapalPayoutResponse>(
        '/api/Transactions/Openfloat/SubmitDirectPayRequest',
        request
      );

      if (response.data.error) {
        throw new Error(`Pesapal payout error: ${response.data.error.message}`);
      }

      return response.data;
    } catch (error: any) {
      console.error('Pesapal payout failed:', error);
      throw new Error(
        error.response?.data?.error?.message || 
        error.message || 
        'Payout request failed'
      );
    }
  }

  async getPayoutStatus(requestId: string): Promise<any> {
    try {
      const response = await this.client.get(
        `/api/Transactions/Openfloat/GetTransactionStatus?requestId=${requestId}`
      );

      return response.data;
    } catch (error: any) {
      console.error('Get payout status failed:', error);
      throw new Error(
        error.response?.data?.error?.message || 
        error.message || 
        'Failed to get payout status'
      );
    }
  }

  // === REFUND OPERATIONS ===
  
  async processRefund(orderTrackingId: string, amount?: number): Promise<any> {
    try {
      const requestData: any = {
        order_tracking_id: orderTrackingId
      };

      if (amount) {
        requestData.amount = amount;
      }

      const response = await this.client.post(
        '/api/Transactions/RefundRequest',
        requestData
      );

      if (response.data.error) {
        throw new Error(`Pesapal refund error: ${response.data.error.message}`);
      }

      return response.data;
    } catch (error: any) {
      console.error('Pesapal refund failed:', error);
      throw new Error(
        error.response?.data?.error?.message || 
        error.message || 
        'Refund request failed'
      );
    }
  }

  // === WEBHOOK VALIDATION ===
  
  validateWebhook(payload: string, signature: string): boolean {
    try {
      const expectedSignature = crypto
        .createHmac('sha256', this.config.webhookSecret)
        .update(payload)
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      );
    } catch (error) {
      console.error('Webhook validation failed:', error);
      return false;
    }
  }

  // === UTILITY METHODS ===
  
  generateMerchantReference(prefix: string = 'TXN'): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${prefix}-${timestamp}-${random}`;
  }

  validateMobileNumber(phoneNumber: string, countryCode: string = 'RW'): {
    isValid: boolean;
    formattedNumber?: string;
    provider?: string;
    errors?: string[];
  } {
    // Rwanda phone number validation
    if (countryCode === 'RW') {
      const cleanPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');
      const rwandaRegex = /^(\+250|250|0)?(7[0-9]{8})$/;
      const match = cleanPhone.match(rwandaRegex);

      if (!match) {
        return {
          isValid: false,
          errors: ['Invalid Rwanda phone number format']
        };
      }

      const nationalNumber = match[2];
      const formattedNumber = '250' + nationalNumber;

      // Determine provider based on prefix
      let provider: string;
      const prefix = nationalNumber.substring(1, 3); // Get 2nd and 3rd digits

      if (['70', '71', '72', '73'].includes(prefix)) {
        provider = 'MTN';
      } else if (['75', '76'].includes(prefix)) {
        provider = 'AIRTEL';
      } else if (['78', '79'].includes(prefix)) {
        provider = 'TIGO';
      } else {
        return {
          isValid: false,
          errors: ['Unsupported mobile provider']
        };
      }

      return {
        isValid: true,
        formattedNumber,
        provider
      };
    }

    return {
      isValid: false,
      errors: ['Unsupported country code']
    };
  }

  validateBankAccount(accountNumber: string, bankCode: string): {
    isValid: boolean;
    errors?: string[];
  } {
    // Basic bank account validation
    if (!accountNumber || accountNumber.length < 8 || accountNumber.length > 20) {
      return {
        isValid: false,
        errors: ['Account number must be 8-20 digits long']
      };
    }

    if (!/^\d+$/.test(accountNumber)) {
      return {
        isValid: false,
        errors: ['Account number must contain only digits']
      };
    }

    if (!bankCode || bankCode.length < 3) {
      return {
        isValid: false,
        errors: ['Invalid bank code']
      };
    }

    return { isValid: true };
  }

  formatAmount(amount: number): number {
    // Ensure amount has max 2 decimal places
    return Math.round(amount * 100) / 100;
  }

  mapPesapalStatusToEscrowStatus(pesapalStatus: string): string {
    switch (pesapalStatus.toUpperCase()) {
      case 'PENDING':
        return 'PENDING';
      case 'COMPLETED':
        return 'HELD';
      case 'FAILED':
      case 'INVALID':
        return 'FAILED';
      case 'REVERSED':
        return 'REFUNDED';
      default:
        return 'PENDING';
    }
  }

  // === ERROR HANDLING ===
  
  private handlePesapalError(error: any): Error {
    if (error.response?.data?.error) {
      const pesapalError = error.response.data.error;
      return new Error(`Pesapal API Error (${pesapalError.code}): ${pesapalError.message}`);
    }
    
    if (error.response?.status === 401) {
      return new Error('Pesapal authentication failed');
    }
    
    if (error.response?.status === 429) {
      return new Error('Pesapal rate limit exceeded. Please try again later');
    }
    
    if (error.response?.status >= 500) {
      return new Error('Pesapal service temporarily unavailable');
    }
    
    return new Error(error.message || 'Unknown Pesapal error');
  }

  // === HEALTH CHECK ===
  
  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    try {
      const token = await this.getValidToken();
      
      if (!token) {
        return {
          healthy: false,
          message: 'Authentication failed'
        };
      }

      return {
        healthy: true,
        message: 'Pesapal service is healthy'
      };
    } catch (error: any) {
      return {
        healthy: false,
        message: error.message || 'Health check failed'
      };
    }
  }
}