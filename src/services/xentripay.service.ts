// services/xentripay.service.ts - Regenerated to match API documentation exactly, with validation fixes and provider mapping enhancements

import axios, { AxiosInstance, AxiosError } from 'axios';
import crypto from 'crypto';
import { config } from '../config/config';
import { PhoneUtils } from '../utils/phone.utils';
import { CurrencyUtils } from '../utils/currency.utils';
import { logger } from '../utils/logger';

// ==================== TYPES ====================

export interface XentriPayConfig {
  apiKey: string;
  baseUrl: string; // https://xentripay.com or https://test.xentripay.com
  environment: 'production' | 'sandbox';
  timeout?: number;
}

// Exchange Rate Response from API (Hexarate)
interface ExchangeRateResponse {
  status_code: number;
  data: {
    base: string;
    target: string;
    mid: number;
    unit: number;
    timestamp: string;
  };
}

// COLLECTIONS (Deposits)
export interface CollectionRequest {
  email: string;
  cname: string;
  amount: number; // USD amount - will be converted to RWF
  cnumber: string; // 10 digits, customer phone without country code
  msisdn: string; // Full phone with country code e.g. 250780371519
  currency: string; // Currency of the amount (USD)
  pmethod: string; // e.g. "momo"
  chargesIncluded?: string; // "true" or "false"
}

export interface CollectionResponse {
  reply: string;
  url: string;
  success: number; // 1 for success
  authkey: string;
  tid: string;
  refid: string;
  retcode: number;
}

export interface CollectionStatusResponse {
  refid: string;
  status: string; // "SUCCESS", "PENDING", "FAILED"
  updatedAt: string;
}

// PAYOUTS (Withdrawals/Refunds)
export interface PayoutRequest {
  customerReference: string; // Unique reference from your business
  telecomProviderId: string; // e.g. "63510" for MTN, "63514" for Airtel
  msisdn: string; // Phone without country code e.g. "0795876908"
  name: string; // Recipient's registered name
  transactionType: string; // "PAYOUT"
  currency: string; // Currency of the amount (USD)
  amount: number; // USD amount - will be converted to RWF
}

export interface PayoutResponse {
  id: number;
  businessName: string;
  customerReference: string;
  telecomProvider: string;
  telecomProviderId: string;
  msisdn: string;
  transactionType: string;
  currency: string;
  amount: number;
  txnCharge: number;
  status: string; // "PENDING", "COMPLETED", "FAILED", "REVERSED"
  statusMessage: string;
  internalRef: string;
  remoteIp: string;
  paymentChanel: string;
  validatedAccountName: string;
  externalTransactionRef: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PayoutStatusResponse {
  timestamp: string;
  message: string;
  data: {
    status: string; // "COMPLETED", "PENDING", "FAILED"
    reference_number: string;
    amount: string;
  };
}

export interface AccountValidationRequest {
  accountNumber: string; // Phone or account number
  bankId: string; // Provider ID from documentation
}

export interface AccountValidationResponse {
  registeredName: string;
}

export interface WalletBalanceResponse {
  walletId: number;
  businessAccountId: number;
  businessName: string;
  balance: string;
  currency: string;
  active: boolean;
}

// Bulk Payout Request (for admin bulk releases)
export interface BulkPayoutRequest {
  payouts: PayoutRequest[];
}

// Bulk Payout Response
export interface BulkPayoutResponse {
  success: number;
  failed: number;
  results: Array<{
    customerReference: string;
    status: string;
    internalRef?: string;
    error?: string;
  }>;
}

// ==================== SERVICE ====================

export class XentriPayService {
  private client: AxiosInstance;
  private config: XentriPayConfig;
  private exchangeRateCache: { rate: number; timestamp: number } | null = null;
  private readonly CACHE_DURATION = 3600000; // 1 hour in milliseconds

  constructor(config: XentriPayConfig) {
    this.config = {
      ...config,
      timeout: config.timeout || 30000
    };

    this.client = axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      headers: {
        'X-XENTRIPAY-KEY': this.config.apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        logger.debug('XentriPay API request', 'XentriPayService', {
          method: config.method?.toUpperCase(),
          url: config.url
        });
        return config;
      },
      (error) => {
        logger.error('XentriPay request error', 'XentriPayService', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        return response;
      },
      async (error: AxiosError) => {
        logger.error('XentriPay API error', 'XentriPayService', {
          status: error.response?.status,
          message: error.message
        });
        return Promise.reject(this.handleError(error));
      }
    );
  }

  // ==================== EXCHANGE RATE METHODS ====================

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

      if (response.data.status_code !== 200) {
        throw new Error('Failed to fetch exchange rate');
      }

      const rate = response.data.data.mid;
      if (!rate) {
        throw new Error('Exchange rate not found in response');
      }

      // Cache the rate
      this.exchangeRateCache = {
        rate,
        timestamp: Date.now()
      };

      return rate;
    } catch (error: any) {
      logger.warn('Failed to fetch exchange rate', 'XentriPayService', { error: error.message });

      // Return cached rate if available, even if expired
      if (this.exchangeRateCache) {
        return this.exchangeRateCache.rate;
      }

      // Last resort: use a default rate (should be configured)
      const fallbackRate = 1300; // Approximate USD to RWF rate
      logger.warn('Using fallback exchange rate', 'XentriPayService', { fallbackRate });
      return fallbackRate;
    }
  }


  // ==================== COLLECTIONS API ====================

  /**
   * Initiate a collection (deposit) from customer
   * Endpoint: POST /api/collections/initiate
   * Note: Accepts USD amount but processes in RWF
   */
  async initiateCollection(request: CollectionRequest): Promise<CollectionResponse> {
    try {
      // Convert USD amount to RWF
      const usdAmount = request.amount;
      const rwfAmount = await CurrencyUtils.convertUsdToRwf(usdAmount);

      // Validate customer number format (10 digits)
      if (!/^\d{10}$/.test(request.cnumber)) {
        throw new Error('Customer number must be exactly 10 digits with no spaces or letters');
      }

      // Prepare payload with RWF amount and currency
      const payload = {
        ...request,
        amount: rwfAmount, // Send RWF amount to XentriPay
        currency: 'RWF' // XentriPay processes in RWF
      };

      logger.debug('Collection currency conversion', 'XentriPayService', {
        originalAmount: usdAmount,
        convertedAmount: rwfAmount
      });

      const response = await this.client.post<CollectionResponse>(
        '/api/collections/initiate',
        payload
      );

      if (response.data.success !== 1) {
        throw new Error(response.data.reply || 'Collection initiation failed');
      }

      logger.info('Collection initiated successfully', 'XentriPayService', {
        refid: response.data.refid
      });

      return response.data;
    } catch (error: any) {
      logger.error('Collection initiation failed', 'XentriPayService', error);
      throw error;
    }
  }

  /**
   * Check collection status using refid
   * Endpoint: GET /api/collections/status/{refid}
   */
  async getCollectionStatus(refid: string): Promise<CollectionStatusResponse> {
    try {
      const response = await this.client.get<CollectionStatusResponse>(
        `/api/collections/status/${refid}`
      );

      return response.data;
    } catch (error: any) {
      logger.error('Failed to get collection status', 'XentriPayService', error);
      throw error;
    }
  }

  // ==================== PAYOUTS API ====================

  /**
   * Create a payout (withdrawal/refund) to customer
   * Endpoint: POST /api/payment-requests
   * Note: Accepts USD amount but processes in RWF
   */
  async createPayout(request: PayoutRequest): Promise<PayoutResponse> {
    try {
      // Convert USD amount to RWF
      const usdAmount = request.amount;
      const rwfAmount = await CurrencyUtils.convertUsdToRwf(usdAmount);

      // Prepare payload with RWF amount and currency
      const payload: PayoutRequest = {
        customerReference: request.customerReference,
        telecomProviderId: request.telecomProviderId,
        msisdn: request.msisdn,
        name: request.name,
        transactionType: 'PAYOUT',
        currency: 'RWF', // XentriPay processes in RWF
        amount: rwfAmount // Send RWF amount to XentriPay
      };

      const response = await this.client.post<PayoutResponse>(
        '/api/payment-requests',
        payload
      );

      logger.info('Payout created successfully', 'XentriPayService', {
        internalRef: response.data.internalRef,
        status: response.data.status
      });

      return response.data;
    } catch (error: any) {
      logger.error('Payout creation failed', 'XentriPayService', error);
      throw error;
    }
  }

  /**
   * Bulk create payouts (for admin bulk approvals)
   * Endpoint: POST /api/payment-requests (loop with validation)
   */
  async createBulkPayouts(request: BulkPayoutRequest): Promise<BulkPayoutResponse> {
    try {
      const results: BulkPayoutResponse['results'] = [];
      let successCount = 0;
      let failedCount = 0;

      for (const payoutReq of request.payouts) {
        try {
          const result = await this.createPayout(payoutReq);
          results.push({
            customerReference: payoutReq.customerReference,
            status: result.status,
            internalRef: result.internalRef
          });
          successCount++;
        } catch (error: any) {
          results.push({
            customerReference: payoutReq.customerReference,
            status: 'FAILED',
            error: error.message
          });
          failedCount++;
        }
      }

      logger.info('Bulk payout completed', 'XentriPayService', { successCount, failedCount });

      return {
        success: successCount,
        failed: failedCount,
        results
      };
    } catch (error: any) {
      logger.error('Bulk payout failed', 'XentriPayService', error);
      throw error;
    }
  }

  /**
   * Check payout status using customer reference
   * Endpoint: GET /api/payment-requests/check-status?customerRef={customerRef}
   */
  async getPayoutStatus(customerRef: string): Promise<PayoutStatusResponse> {
    try {
      const response = await this.client.get<PayoutStatusResponse>(
        `/api/payment-requests/check-status`,
        {
          params: { customerRef }
        }
      );

      return response.data;
    } catch (error: any) {
      logger.error('Failed to get payout status', 'XentriPayService', error);
      throw error;
    }
  }

  /**
   * Validate account name before payout
   * Endpoint: POST /api/payment-requests/validate-name
   */
  async validateAccountName(
    accountNumber: string,
    bankId: string
  ): Promise<AccountValidationResponse> {
    try {
      const response = await this.client.post<AccountValidationResponse>(
        '/api/payment-requests/validate-name',
        {
          accountNumber,
          bankId
        }
      );

      return response.data;
    } catch (error: any) {
      logger.error('Account validation failed', 'XentriPayService', error);
      throw error;
    }
  }

  /**
   * Get wallet balance for authenticated business
   * Endpoint: GET /api/wallets/my-business
   */
  async getWalletBalance(): Promise<WalletBalanceResponse> {
    try {
      const response = await this.client.get<WalletBalanceResponse>(
        '/api/wallets/my-business'
      );

      return response.data;
    } catch (error: any) {
      logger.error('Failed to get wallet balance', 'XentriPayService', error);
      throw error;
    }
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Generate unique customer reference for payouts
   */
  generateCustomerReference(prefix: string = 'TXN'): string {
    const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const random = Math.random().toString(36).substring(2, 10).toUpperCase();
    return `${prefix}-${timestamp}-${random}`;
  }


  /**
   * Validate and get provider ID from phone number
   */
  getProviderIdFromPhone(phone: string): string {
    const cleaned = phone.replace(/\D/g, '');
    let nationalNumber = cleaned;
    
    if (cleaned.startsWith('250')) {
      nationalNumber = cleaned.substring(3);
    }
    if (nationalNumber.startsWith('0')) {
      nationalNumber = nationalNumber.substring(1);
    }

    const prefix = nationalNumber.substring(0, 2);

    // MTN: 78, 79
    if (['78', '79'].includes(prefix)) {
      return '63510'; // MTN Rwanda
    }
    // Airtel: 73
    if (prefix === '73') {
      return '63514'; // Airtel Rwanda
    }

    throw new Error(`Unsupported mobile provider for prefix: ${prefix}`);
  }

  /**
   * Map XentriPay status to standard escrow status
   */
  mapStatusToEscrowStatus(xentriPayStatus: string): string {
    const statusMap: Record<string, string> = {
      'SUCCESS': 'COMPLETED',
      'COMPLETED': 'COMPLETED',
      'PENDING': 'PENDING',
      'FAILED': 'FAILED',
      'REVERSED': 'REFUNDED'
    };

    return statusMap[xentriPayStatus.toUpperCase()] || 'PENDING';
  }

  /**
   * Handle API errors
   */
  private handleError(error: AxiosError): Error {
    if (error.response) {
      const data: any = error.response.data;
      
      // XentriPay error format
      if (data.message) {
        return new Error(data.message);
      }
      
      // Generic error
      return new Error(
        `XentriPay API Error: ${error.response.status} - ${error.response.statusText}`
      );
    }
    
    if (error.request) {
      return new Error('No response received from XentriPay API');
    }
    
    return new Error(error.message || 'Unknown error occurred');
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Try to get wallet balance as a health check
      await this.getWalletBalance();
      return true;
    } catch {
      return false;
    }
  }
}

// ==================== PROVIDER IDS (from documentation) ====================

export const XENTRIPAY_PROVIDERS = {
  // Mobile Money
  MTN_RWANDA: '63510',
  AIRTEL_RWANDA: '63514',
  SPENN: '63509',
  
  // Banks
  INVESTMENT_MORTGAGE_BANK: '010',
  BANQUE_DE_KIGALI: '040',
  GUARANTY_TRUST_BANK: '070',
  NATIONAL_COMMERCIAL_BANK: '025',
  ECOBANK_RWANDA: '100',
  ACCESS_BANK: '115',
  URWEGO_OPPORTUNITY_BANK: '145',
  EQUITY_BANK: '192',
  BANQUE_POPULAIRE: '400',
  ZIGAMA_CSS: '800',
  BANK_OF_AFRICA: '900',
  UNGUKA_BANK: '950',
  BANQUE_NATIONALE: '951'
} as const;