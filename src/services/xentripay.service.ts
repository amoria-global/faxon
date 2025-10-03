// services/xentripay.service.ts - Corrected to match API documentation

import axios, { AxiosInstance, AxiosError } from 'axios';
import crypto from 'crypto';

// ==================== TYPES ====================

export interface XentriPayConfig {
  apiKey: string;
  baseUrl: string; // https://xentripay.com or https://test.xentripay.com
  environment: 'production' | 'sandbox';
  timeout?: number;
}

// COLLECTIONS (Deposits)
export interface CollectionRequest {
  email: string;
  cname: string;
  amount: number; // Must be whole number (no decimals)
  cnumber: string; // 10 digits, customer phone without country code
  msisdn: string; // Full phone with country code e.g. 250780371519
  currency: string; // Must be "RWF"
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

// PAYOUTS (Withdrawals)
export interface PayoutRequest {
  customerReference: string; // Unique reference from your business
  telecomProviderId: string; // e.g. "63510" for MTN, "63514" for Airtel
  msisdn: string; // Phone without country code e.g. "0795876908"
  name: string; // Recipient's registered name
  transactionType: string; // "PAYOUT"
  currency: string; // "RWF"
  amount: number; // Must be whole number (no decimals)
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

// ==================== SERVICE ====================

export class XentriPayService {
  private client: AxiosInstance;
  private config: XentriPayConfig;

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
        console.log('[XENTRIPAY] Request:', {
          method: config.method?.toUpperCase(),
          url: config.url,
          data: config.data
        });
        return config;
      },
      (error) => {
        console.error('[XENTRIPAY] Request error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        console.log('[XENTRIPAY] Response:', {
          status: response.status,
          data: response.data
        });
        return response;
      },
      async (error: AxiosError) => {
        console.error('[XENTRIPAY] API Error:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          message: error.message
        });
        return Promise.reject(this.handleError(error));
      }
    );
  }

  // ==================== COLLECTIONS API ====================

  /**
   * Initiate a collection (deposit) from customer
   * Endpoint: POST /api/collections/initiate
   */
  async initiateCollection(request: CollectionRequest): Promise<CollectionResponse> {
    try {
      // Validate amount is whole number
      if (!Number.isInteger(request.amount)) {
        throw new Error('Amount must be a whole number (no decimals)');
      }

      // Validate customer number format (10 digits)
      if (!/^\d{10}$/.test(request.cnumber)) {
        throw new Error('Customer number must be exactly 10 digits');
      }

      // Ensure currency is RWF
      const payload = {
        ...request,
        currency: 'RWF'
      };

      const response = await this.client.post<CollectionResponse>(
        '/api/collections/initiate',
        payload
      );

      if (response.data.success !== 1) {
        throw new Error(response.data.reply || 'Collection initiation failed');
      }

      console.log('[XENTRIPAY] ✅ Collection initiated:', {
        refid: response.data.refid,
        tid: response.data.tid
      });

      return response.data;
    } catch (error: any) {
      console.error('[XENTRIPAY] ❌ Collection initiation failed:', error);
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

      console.log('[XENTRIPAY] Collection status:', {
        refid: response.data.refid,
        status: response.data.status
      });

      return response.data;
    } catch (error: any) {
      console.error('[XENTRIPAY] ❌ Failed to get collection status:', error);
      throw error;
    }
  }

  // ==================== PAYOUTS API ====================

  /**
   * Create a payout (withdrawal) to customer
   * Endpoint: POST /api/payment-requests
   */
  async createPayout(request: PayoutRequest): Promise<PayoutResponse> {
    try {
      // Validate amount is whole number
      if (!Number.isInteger(request.amount)) {
        throw new Error('Amount must be a whole number (no decimals)');
      }

      // Ensure required fields
      const payload: PayoutRequest = {
        customerReference: request.customerReference,
        telecomProviderId: request.telecomProviderId,
        msisdn: request.msisdn,
        name: request.name,
        transactionType: 'PAYOUT',
        currency: 'RWF',
        amount: request.amount
      };

      const response = await this.client.post<PayoutResponse>(
        '/api/payment-requests',
        payload
      );

      console.log('[XENTRIPAY] ✅ Payout created:', {
        internalRef: response.data.internalRef,
        status: response.data.status,
        customerReference: response.data.customerReference
      });

      return response.data;
    } catch (error: any) {
      console.error('[XENTRIPAY] ❌ Payout creation failed:', error);
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

      console.log('[XENTRIPAY] Payout status:', {
        customerRef,
        status: response.data.data.status
      });

      return response.data;
    } catch (error: any) {
      console.error('[XENTRIPAY] ❌ Failed to get payout status:', error);
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

      console.log('[XENTRIPAY] Account validated:', {
        accountNumber,
        registeredName: response.data.registeredName
      });

      return response.data;
    } catch (error: any) {
      console.error('[XENTRIPAY] ❌ Account validation failed:', error);
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

      console.log('[XENTRIPAY] Wallet balance:', {
        businessName: response.data.businessName,
        balance: response.data.balance,
        currency: response.data.currency
      });

      return response.data;
    } catch (error: any) {
      console.error('[XENTRIPAY] ❌ Failed to get wallet balance:', error);
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
   * Format phone number to required format
   * Collections: needs full format with country code (250780371519)
   * Payouts: needs format without country code (0780371519)
   */
  formatPhoneNumber(phone: string, includeCountryCode: boolean = true): string {
    // Remove all non-digit characters
    const cleaned = phone.replace(/\D/g, '');
    
    // Remove leading country code if present
    let nationalNumber = cleaned;
    if (cleaned.startsWith('250')) {
      nationalNumber = cleaned.substring(3);
    }
    
    // Ensure it starts with 0
    if (!nationalNumber.startsWith('0')) {
      nationalNumber = '0' + nationalNumber;
    }
    
    // Return based on requirement
    if (includeCountryCode) {
      // For collections: 250780371519
      return '250' + nationalNumber.substring(1);
    } else {
      // For payouts: 0780371519
      return nationalNumber;
    }
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