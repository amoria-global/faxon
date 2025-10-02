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

interface IPNRegistration {
  ipn_id: string;
  url: string;
  registered_at: Date;
  expires_at?: Date;
}

export class PesapalService {
  private client: AxiosInstance;
  private config: PesapalConfig;
  private credentials: PesapalCredentials = {};
  private ipnRegistration: IPNRegistration | null = null;
  private ipnRegistrationPromise: Promise<string> | null = null;
  private authPromise: Promise<string | null> | null = null;

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
          console.log('[PESAPAL] 401 error - clearing credentials and retrying');
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
      console.error('Pesapal authentication failed:', error.response?.data || error.message);
      return null;
    }
  }

  private async fetchNewToken(): Promise<string | null> {
    try {
      console.log('[PESAPAL] Fetching new authentication token...');
      
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
        throw new Error(`Pesapal auth error: ${response.data.error.message}`);
      }

      if (!response.data.token) {
        throw new Error('No token received from Pesapal');
      }

      const expiresAt = new Date(response.data.expiryDate).getTime();
      
      this.credentials = {
        accessToken: response.data.token,
        expiresAt
      };

      console.log('[PESAPAL] ✅ Authentication successful. Token expires:', new Date(expiresAt).toISOString());

      return this.credentials.accessToken;
    } catch (error: any) {
      console.error('[PESAPAL] ❌ Authentication failed:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      
      this.credentials = {};
      
      throw new Error(
        error.response?.data?.error?.message || 
        error.message || 
        'Failed to authenticate with Pesapal'
      );
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
      console.error('[PESAPAL] Failed to get valid IPN ID:', error);
      throw new Error(`IPN registration failed: ${error.message}`);
    }
  }

  private async registerIPNUrl(): Promise<string> {
    try {
      console.log('[PESAPAL] Registering IPN URL with Pesapal...');
      
      const token = await this.getValidToken();
      if (!token) {
        throw new Error('Failed to obtain authentication token for IPN registration');
      }
      
      const ipnUrl = this.config.callbackUrl.replace('/callback', '/ipn');
      
      console.log('[PESAPAL] IPN URL:', ipnUrl);
      
      const registrationData = {
        url: ipnUrl,
        ipn_notification_type: 'GET'
      };

      const response = await this.client.post('/api/URLSetup/RegisterIPN', registrationData);

      console.log('[PESAPAL] IPN registration response:', {
        status: response.status,
        data: response.data
      });

      if (response.data.error) {
        throw new Error(`IPN registration error: ${response.data.error.message}`);
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

      console.log(`[PESAPAL] ✅ IPN URL registered successfully. IPN ID: ${response.data.ipn_id}`);
      
      return response.data.ipn_id;
    } catch (error: any) {
      console.error('[PESAPAL] ❌ IPN registration failed:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        url: error.config?.url
      });
      
      this.ipnRegistration = null;
      
      throw new Error(
        error.response?.data?.error?.message || 
        error.message || 
        'Failed to register IPN URL'
      );
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
      console.error('[PESAPAL] Failed to get registered IPNs:', error);
      return [];
    }
  }

  // === CHECKOUT (DEPOSIT) OPERATIONS ===
  
  async createCheckout(request: PesapalCheckoutRequest): Promise<PesapalCheckoutResponse> {
    try {
      const ipnId = await this.getValidIPNId();
      
      const checkoutRequestWithIPN = {
        ...request,
        notification_id: ipnId
      };

      console.log('[PESAPAL] Creating checkout with IPN ID:', ipnId);

      const response = await this.client.post<PesapalCheckoutResponse>(
        '/api/Transactions/SubmitOrderRequest',
        checkoutRequestWithIPN
      );

      if (response.data.error) {
        throw new Error(`Pesapal checkout error: ${response.data.error.message}`);
      }

      return response.data;
    } catch (error: any) {
      console.error('[PESAPAL] Checkout failed:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      throw new Error(
        error.response?.data?.error?.message || 
        error.message || 
        'Checkout request failed'
      );
    }
  }

  // === TRANSACTION STATUS (FIXED) ===
  
  async getTransactionStatus(orderTrackingId: string): Promise<PesapalTransactionStatus> {
    try {
      console.log(`[PESAPAL] Fetching status for tracking ID: ${orderTrackingId}`);
      
      const response = await this.client.get<PesapalTransactionStatus>(
        `/api/Transactions/GetTransactionStatus?orderTrackingId=${orderTrackingId}`
      );

      console.log('[PESAPAL] Status response:', {
        payment_status_description: response.data.payment_status_description,
        status_code: response.data.status_code,
        merchant_reference: response.data.merchant_reference
      });

      return response.data;
    } catch (error: any) {
      console.error('[PESAPAL] Get transaction status failed:', error);
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
      console.error('[PESAPAL] Payout failed:', error);
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
      console.error('[PESAPAL] Get payout status failed:', error);
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
      console.error('[PESAPAL] Refund failed:', error);
      throw new Error(
        error.response?.data?.error|| error.message || 
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
      console.error('[PESAPAL] Webhook validation failed:', error);
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

      let provider: string;
      const prefix = nationalNumber.substring(1, 3);

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

    console.log('[PESAPAL] Mapping status:', {
      status_code: statusCode,
      payment_status_description: paymentStatusDescription,
      status: status
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
          console.warn(`[PESAPAL] Unknown status_code: ${statusCode}`);
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
    console.warn('[PESAPAL] Could not determine payment status, defaulting to PENDING');
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