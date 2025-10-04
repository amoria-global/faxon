// services/pesapal.service.ts

import axios, { AxiosInstance, AxiosError } from 'axios';
import crypto from 'crypto';
import { config } from '../config/config';
import { PhoneUtils } from '../utils/phone.utils';
import { CurrencyUtils } from '../utils/currency.utils';
import { logger } from '../utils/logger';
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

interface IPNRegistration {
  ipn_id: string;
  url: string;
  registered_at: Date;
  expires_at?: Date;
}

// Exchange Rate Response from API (Hexarate)
interface ExchangeRateResponse {
  success: boolean;
  base: string;
  date: string;
  rates: {
    [key: string]: number;
  };
}

export class PesapalService {
  createOrder(arg0: { amount: number; description: any; buyerEmail: any; buyerPhone: any; reference: string; }) {
    throw new Error('Method not implemented.');
  }
  private client: AxiosInstance;
  private config: PesapalConfig;
  private credentials: PesapalCredentials = {};
  private ipnRegistration: IPNRegistration | null = null;
  private ipnRegistrationPromise: Promise<string> | null = null;
  private authPromise: Promise<string | null> | null = null;
  private exchangeRateCache: { rate: number; timestamp: number } | null = null;
  private readonly CACHE_DURATION = 3600000; // 1 hour in milliseconds

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

    this.client.interceptors.request.use(async (config) => {
      if (config.url?.includes('/api/Auth/RequestToken')) {
        return config;
      }

      const token = await this.getValidToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }

      return config;
    });

    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        if (error.response?.status === 401) {
          logger.warn('401 error - clearing credentials and retrying', 'PesapalService');
          this.credentials = {};
          this.authPromise = null;

          if (error.config && !error.config.headers['X-Retry']) {
            const token = await this.getValidToken();
            if (token) {
              error.config.headers.Authorization = `Bearer ${token}`;
              error.config.headers['X-Retry'] = 'true';
              return this.client.request(error.config);
            }
          }
        }
        return Promise.reject(error);
      }
    );
  }

  // === AUTHENTICATION ===
  
  private async getValidToken(): Promise<string | null> {
    try {
      if (this.authPromise) {
        return await this.authPromise;
      }

      if (this.credentials.accessToken && this.credentials.expiresAt) {
        if (Date.now() < this.credentials.expiresAt - 60000) {
          return this.credentials.accessToken;
        }
      }

      this.authPromise = this.fetchNewToken();
      
      try {
        const token = await this.authPromise;
        return token;
      } finally {
        this.authPromise = null;
      }

    } catch (error: any) {
      this.authPromise = null;
      logger.error('Pesapal authentication failed', 'PesapalService', error);
      return null;
    }
  }

  private async fetchNewToken(): Promise<string | null> {
    try {
      logger.info('Fetching new authentication token', 'PesapalService');

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
          },
          timeout: this.config.timeout
        }
      );

      if (response.data.error) {
        const errorMessage = typeof response.data.error === 'object' && response.data.error.message
          ? response.data.error.message
          : String(response.data.error);
        throw new Error(`Pesapal auth error: ${errorMessage}`);
      }

      if (!response.data.token) {
        throw new Error('No token received from Pesapal');
      }

      const expiresAt = new Date(response.data.expiryDate).getTime();

      this.credentials = {
        accessToken: response.data.token,
        expiresAt
      };

      logger.info('Authentication successful', 'PesapalService', { expiresAt: new Date(expiresAt).toISOString() });

      return this.credentials.accessToken;
    } catch (error: any) {
      logger.error('Authentication failed', 'PesapalService', {
        message: error.message,
        status: error.response?.status
      });

      this.credentials = {};

      const errorMessage = error.response?.data?.error
        ? (typeof error.response.data.error === 'object' && error.response.data.error.message
          ? error.response.data.error.message
          : String(error.response.data.error))
        : error.message || 'Failed to authenticate with Pesapal';
      throw new Error(errorMessage);
    }
  }

  // === IPN MANAGEMENT ===
  
  private async getValidIPNId(): Promise<string> {
    try {
      if (this.ipnRegistrationPromise) {
        return await this.ipnRegistrationPromise;
      }

      if (this.ipnRegistration && this.isIPNValid(this.ipnRegistration)) {
        return this.ipnRegistration.ipn_id;
      }

      this.ipnRegistrationPromise = this.registerIPNUrl();
      
      try {
        const ipnId = await this.ipnRegistrationPromise;
        return ipnId;
      } finally {
        this.ipnRegistrationPromise = null;
      }
    } catch (error: any) {
      logger.error('Failed to get valid IPN ID', 'PesapalService', error);
      throw new Error(`IPN registration failed: ${error.message}`);
    }
  }

  private async registerIPNUrl(): Promise<string> {
    try {
      logger.info('Registering IPN URL with Pesapal', 'PesapalService');

      const token = await this.getValidToken();
      if (!token) {
        throw new Error('Failed to obtain authentication token for IPN registration');
      }

      const ipnUrl = this.config.callbackUrl.replace('/callback', '/ipn');

      const registrationData = {
        url: ipnUrl,
        ipn_notification_type: 'GET'
      };

      const response = await this.client.post('/api/URLSetup/RegisterIPN', registrationData);

      if (response.data.error) {
        const errorMessage = typeof response.data.error === 'object' && response.data.error.message
          ? response.data.error.message
          : String(response.data.error);
        throw new Error(`IPN registration error: ${errorMessage}`);
      }

      if (!response.data.ipn_id) {
        throw new Error('IPN registration did not return an IPN ID');
      }

      this.ipnRegistration = {
        ipn_id: response.data.ipn_id,
        url: ipnUrl,
        registered_at: new Date(),
        expires_at: response.data.expires_at ? new Date(response.data.expires_at) : undefined
      };

      logger.info('IPN URL registered successfully', 'PesapalService', { ipnId: response.data.ipn_id });

      return response.data.ipn_id;
    } catch (error: any) {
      logger.error('IPN registration failed', 'PesapalService', {
        message: error.message,
        status: error.response?.status
      });

      this.ipnRegistration = null;

      const errorMessage = error.response?.data?.error
        ? (typeof error.response.data.error === 'object' && error.response.data.error.message
          ? error.response.data.error.message
          : String(error.response.data.error))
        : error.message || 'Failed to register IPN URL';
      throw new Error(errorMessage);
    }
  }

  private isIPNValid(registration: IPNRegistration): boolean {
    const maxAge = 24 * 60 * 60 * 1000;
    const age = Date.now() - registration.registered_at.getTime();
    
    if (age > maxAge) {
      return false;
    }

    if (registration.expires_at) {
      return registration.expires_at.getTime() > Date.now();
    }

    return true;
  }

  async getRegisteredIPNs(): Promise<any[]> {
    try {
      const response = await this.client.get('/api/URLSetup/GetIpnList');
      return response.data || [];
    } catch (error: any) {
      logger.error('Failed to get registered IPNs', 'PesapalService', error);
      return [];
    }
  }

  // === EXCHANGE RATE METHODS ===

  /**
   * Fetch the latest USD to RWF exchange rate
   */
  async getExchangeRate(): Promise<number> {
    try {
      // Check cache first
      if (this.exchangeRateCache) {
        const now = Date.now();
        if (now - this.exchangeRateCache.timestamp < this.CACHE_DURATION) {
          return this.exchangeRateCache.rate;
        }
      }

      // Fetch fresh rate from Hexarate API
      const apiUrl = config.currencies.exchangeApiUrl;
      const url = `${apiUrl}/USD?target=RWF`;

      const response = await axios.get<ExchangeRateResponse>(url, {
        timeout: 10000 // 10 seconds timeout
      });

      if (!response.data.success) {
        throw new Error('Failed to fetch exchange rate');
      }

      const rate = response.data.rates.RWF;
      if (!rate) {
        throw new Error('RWF rate not found in response');
      }

      // Cache the rate
      this.exchangeRateCache = {
        rate,
        timestamp: Date.now()
      };

      logger.debug('Exchange rate fetched and cached', 'PesapalService', { rate });

      return rate;
    } catch (error: any) {
      logger.warn('Failed to fetch exchange rate', 'PesapalService', { error: error.message });

      // Return cached rate if available, even if expired
      if (this.exchangeRateCache) {
        return this.exchangeRateCache.rate;
      }

      // Last resort: use a default rate (should be configured)
      const fallbackRate = 1300; // Approximate USD to RWF rate
      logger.warn('Using fallback exchange rate', 'PesapalService', { fallbackRate });
      return fallbackRate;
    }
  }


  // === CHECKOUT (DEPOSIT) OPERATIONS ===

  async createCheckout(request: PesapalCheckoutRequest): Promise<PesapalCheckoutResponse> {
    try {
      const ipnId = await this.getValidIPNId();

      // Convert USD amount to RWF if currency is USD
      let finalAmount = request.amount;
      const originalCurrency = request.currency;

      if (originalCurrency.toUpperCase() === 'USD') {
        const usdAmount = request.amount;
        finalAmount = await CurrencyUtils.convertUsdToRwf(usdAmount);

        logger.debug('Checkout currency conversion', 'PesapalService', {
          originalAmount: usdAmount,
          originalCurrency: 'USD',
          convertedAmount: finalAmount,
          convertedCurrency: 'RWF'
        });
      }

      const checkoutRequestWithIPN = {
        ...request,
        amount: finalAmount,
        currency: 'RWF', // Pesapal processes in RWF
        notification_id: ipnId
      };

      logger.debug('Creating checkout with IPN', 'PesapalService', { ipnId });

      const response = await this.client.post<PesapalCheckoutResponse>(
        '/api/Transactions/SubmitOrderRequest',
        checkoutRequestWithIPN
      );

      if (response.data.error) {
        const errorMessage = typeof response.data.error === 'object' && response.data.error.message
          ? response.data.error.message
          : String(response.data.error);
        throw new Error(`Pesapal checkout error: ${errorMessage}`);
      }

      logger.info('Checkout created successfully', 'PesapalService', {
        orderTrackingId: response.data.order_tracking_id,
        merchantReference: response.data.merchant_reference
      });

      return response.data;
    } catch (error: any) {
      logger.error('Checkout failed', 'PesapalService', {
        message: error.message,
        status: error.response?.status
      });
      const errorMessage = error.response?.data?.error
        ? (typeof error.response.data.error === 'object' && error.response.data.error.message
          ? error.response.data.error.message
          : String(error.response.data.error))
        : error.message || 'Checkout request failed';
      throw new Error(errorMessage);
    }
  }

  // === TRANSACTION STATUS (FIXED) ===
  
  async getTransactionStatus(orderTrackingId: string): Promise<PesapalTransactionStatus> {
    try {
      logger.debug('Fetching transaction status', 'PesapalService', { orderTrackingId });

      const response = await this.client.get<PesapalTransactionStatus>(
        `/api/Transactions/GetTransactionStatus?orderTrackingId=${orderTrackingId}`
      );

      return response.data;
    } catch (error: any) {
      logger.error('Get transaction status failed', 'PesapalService', error);
      const errorMessage = error.response?.data?.error
        ? (typeof error.response.data.error === 'object' && error.response.data.error.message
          ? error.response.data.error.message
          : String(error.response.data.error))
        : error.message || 'Failed to get transaction status';
      throw new Error(errorMessage);
    }
  }

  // === PAYOUT OPERATIONS ===

  async createPayout(request: PesapalPayoutRequest): Promise<PesapalPayoutResponse> {
    try {
      // Convert USD amount to RWF if currency is USD
      let finalAmount = request.transfer_details.amount;
      const originalCurrency = request.transfer_details.currency_code;

      if (originalCurrency.toUpperCase() === 'USD') {
        const usdAmount = request.transfer_details.amount;
        finalAmount = await CurrencyUtils.convertUsdToRwf(usdAmount);

        logger.debug('Payout currency conversion', 'PesapalService', {
          originalAmount: usdAmount,
          originalCurrency: 'USD',
          convertedAmount: finalAmount,
          convertedCurrency: 'RWF'
        });
      }

      const payoutRequest: PesapalPayoutRequest = {
        ...request,
        transfer_details: {
          ...request.transfer_details,
          amount: finalAmount,
          currency_code: 'RWF' // Pesapal processes in RWF
        }
      };

      const response = await this.client.post<PesapalPayoutResponse>(
        '/api/Transactions/Openfloat/SubmitDirectPayRequest',
        payoutRequest
      );

      if (response.data.error) {
        const errorMessage = typeof response.data.error === 'object' && response.data.error.message
          ? response.data.error.message
          : String(response.data.error);
        throw new Error(`Pesapal payout error: ${errorMessage}`);
      }

      logger.info('Payout created successfully', 'PesapalService', {
        requestId: response.data.requestId
      });

      return response.data;
    } catch (error: any) {
      logger.error('Payout failed', 'PesapalService', error);
      const errorMessage = error.response?.data?.error
        ? (typeof error.response.data.error === 'object' && error.response.data.error.message
          ? error.response.data.error.message
          : String(error.response.data.error))
        : error.message || 'Payout request failed';
      throw new Error(errorMessage);
    }
  }

  async getPayoutStatus(requestId: string): Promise<any> {
    try {
      const response = await this.client.get(
        `/api/Transactions/Openfloat/GetTransactionStatus?requestId=${requestId}`
      );

      return response.data;
    } catch (error: any) {
      logger.error('Get payout status failed', 'PesapalService', error);
      const errorMessage = error.response?.data?.error
        ? (typeof error.response.data.error === 'object' && error.response.data.error.message
          ? error.response.data.error.message
          : String(error.response.data.error))
        : error.message || 'Failed to get payout status';
      throw new Error(errorMessage);
    }
  }

  // === REFUND OPERATIONS ===

  async processRefund(orderTrackingId: string, amount?: number, currency?: string): Promise<any> {
    try {
      const requestData: any = {
        order_tracking_id: orderTrackingId
      };

      if (amount) {
        // Convert USD amount to RWF if currency is USD
        let finalAmount = amount;

        if (currency && currency.toUpperCase() === 'USD') {
          const usdAmount = amount;
          finalAmount = await CurrencyUtils.convertUsdToRwf(usdAmount);

          logger.debug('Refund currency conversion', 'PesapalService', {
            originalAmount: usdAmount,
            originalCurrency: 'USD',
            convertedAmount: finalAmount,
            convertedCurrency: 'RWF'
          });
        }

        requestData.amount = finalAmount;
      }

      const response = await this.client.post(
        '/api/Transactions/RefundRequest',
        requestData
      );

      if (response.data.error) {
        const errorMessage = typeof response.data.error === 'object' && response.data.error.message
          ? response.data.error.message
          : String(response.data.error);
        throw new Error(`Pesapal refund error: ${errorMessage}`);
      }

      logger.info('Refund processed successfully', 'PesapalService', {
        orderTrackingId,
        amount: requestData.amount
      });

      return response.data;
    } catch (error: any) {
      logger.error('Refund failed', 'PesapalService', error);
      const errorMessage = error.response?.data?.error
        ? (typeof error.response.data.error === 'object' && error.response.data.error.message
          ? error.response.data.error.message
          : String(error.response.data.error))
        : error.message || 'Refund request failed';
      throw new Error(errorMessage);
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
      logger.error('Webhook validation failed', 'PesapalService', error);
      return false;
    }
  }

  // === UTILITY METHODS ===
  
  generateMerchantReference(prefix: string = 'TXN'): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${prefix}-${timestamp}-${random}`;
  }


  validateBankAccount(accountNumber: string, bankCode: string): {
    isValid: boolean;
    errors?: string[];
  } {
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
    return Math.round(amount * 100) / 100;
  }

  // === STATUS MAPPING (FIXED) ===
  
  /**
   * Maps Pesapal payment status to escrow status
   * Pesapal status codes:
   * 0 = INVALID
   * 1 = COMPLETED
   * 2 = FAILED
   * 3 = REVERSED
   */
  mapPesapalStatusToEscrowStatus(pesapalResponse: PesapalTransactionStatus | any): string {
    // Try to get status from different possible fields
    const statusCode = pesapalResponse.status_code;
    const paymentStatusDescription = pesapalResponse.payment_status_description;
    const status = pesapalResponse.status;

    logger.debug('Mapping Pesapal status', 'PesapalService', {
      status_code: statusCode,
      payment_status_description: paymentStatusDescription
    });

    // Priority 1: Check status_code (most reliable)
    if (typeof statusCode === 'number') {
      switch (statusCode) {
        case 0:
          return 'FAILED'; // INVALID
        case 1:
          return 'HELD'; // COMPLETED - funds in escrow
        case 2:
          return 'FAILED'; // FAILED
        case 3:
          return 'REFUNDED'; // REVERSED
        default:
          logger.warn('Unknown status_code from Pesapal', 'PesapalService', { statusCode });
          return 'PENDING';
      }
    }

    // Priority 2: Check payment_status_description
    if (paymentStatusDescription) {
      const statusUpper = paymentStatusDescription.toUpperCase();
      
      if (statusUpper.includes('COMPLETED') || statusUpper.includes('SUCCESS')) {
        return 'HELD';
      }
      
      if (statusUpper.includes('FAILED') || statusUpper.includes('INVALID')) {
        return 'FAILED';
      }
      
      if (statusUpper.includes('REVERSED') || statusUpper.includes('REFUND')) {
        return 'REFUNDED';
      }
      
      if (statusUpper.includes('PENDING')) {
        return 'PENDING';
      }
    }

    // Priority 3: Check status field (least reliable, might be HTTP status)
    if (status) {
      const statusUpper = status.toString().toUpperCase();
      
      // Ignore HTTP status codes (200, 201, etc.)
      if (!/^\d+$/.test(status) || parseInt(status) < 100) {
        if (statusUpper === 'COMPLETED' || statusUpper === 'SUCCESS') {
          return 'HELD';
        }
        
        if (statusUpper === 'FAILED' || statusUpper === 'INVALID') {
          return 'FAILED';
        }
        
        if (statusUpper === 'REVERSED' || statusUpper === 'REFUNDED') {
          return 'REFUNDED';
        }
        
        if (statusUpper === 'PENDING') {
          return 'PENDING';
        }
      }
    }

    // Default to PENDING if we can't determine status
    logger.warn('Could not determine payment status, defaulting to PENDING', 'PesapalService');
    return 'PENDING';
  }

  async forceRegisterIPN(): Promise<string> {
    this.ipnRegistration = null;
    return await this.getValidIPNId();
  }

  getCurrentIPNInfo(): IPNRegistration | null {
    return this.ipnRegistration;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const token = await this.getValidToken();
      return !!token;
    } catch {
      return false;
    }
  }
}