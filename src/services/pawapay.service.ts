// services/pawapay.service.ts - Complete PawaPay Integration Service

import axios, { AxiosInstance, AxiosError } from 'axios';
import crypto from 'crypto';
import { config } from '../config/config';
import {
  PawaPayConfig,
  DepositRequest,
  DepositResponse,
  PayoutRequest,
  PayoutResponse,
  RefundRequest,
  RefundResponse,
  BulkPayoutRequest,
  BulkPayoutResponse,
  ActiveConfiguration,
  PawaPayWebhookData,
  PawaPayApiError,
  PAWAPAY_PROVIDERS,
  PawaPayProvider,
  TransactionStatus,
  PawaPayMetadataField
} from '../types/pawapay.types';

export class PawaPayService {
  private client: AxiosInstance;
  private config: PawaPayConfig;
  private activeConfigCache: ActiveConfiguration | null = null;
  private cacheTimestamp: number = 0;
  private readonly CACHE_DURATION = 3600000; // 1 hour

  constructor(configOverride?: Partial<PawaPayConfig>) {
    this.config = {
      apiKey: configOverride?.apiKey || config.pawapay.apiKey,
      baseUrl: configOverride?.baseUrl || config.pawapay.baseUrl || 'https://api.pawapay.cloud',
      environment: configOverride?.environment || config.pawapay.environment || 'production',
      timeout: configOverride?.timeout || 30000,
    };

    this.client = axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    // Response interceptor for error handling only
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => this.handleApiError(error)
    );
  }

  // ==================== DEPOSIT OPERATIONS (Money In) ====================

  /**
   * Initiate a deposit (money in) request
   * @param request Deposit request parameters
   * @returns Deposit response with transaction details
   */
  async initiateDeposit(request: DepositRequest): Promise<DepositResponse> {
    const response = await this.client.post<DepositResponse>('/deposits', request);
    return response.data;
  }

  /**
   * Get deposit status by depositId
   * @param depositId Unique deposit identifier
   * @returns Deposit response with current status
   */
  async getDepositStatus(depositId: string): Promise<DepositResponse> {
    const response: any = await this.client.get<DepositResponse>(`/deposits/${depositId}`);
    return response.data.data;
  }

  /**
   * Predict deposit status (for testing/validation)
   * @param depositId Unique deposit identifier
   * @returns Predicted deposit response
   */
  async predictDeposit(depositId: string): Promise<DepositResponse> {
    const response = await this.client.post<DepositResponse>(`/deposits/${depositId}/predict`, {});
    return response.data;
  }

  // ==================== PAYOUT OPERATIONS (Money Out) ====================

  /**
   * Initiate a payout (money out) request
   * @param request Payout request parameters
   * @returns Payout response with transaction details
   */
  async initiatePayout(request: PayoutRequest): Promise<PayoutResponse> {
    const response = await this.client.post<PayoutResponse>('/payouts', request);
    return response.data;
  }

  /**
   * Get payout status by payoutId
   * @param payoutId Unique payout identifier
   * @returns Payout response with current status
   */
  async getPayoutStatus(payoutId: string): Promise<PayoutResponse> {
    const response = await this.client.get<PayoutResponse>(`/payouts/${payoutId}`);
    return response.data;
  }

  // ==================== BULK PAYOUT OPERATIONS ====================

  /**
   * Initiate bulk payouts
   * @param request Bulk payout request with multiple payouts
   * @returns Bulk payout response with results
   */
  async initiateBulkPayout(request: BulkPayoutRequest): Promise<BulkPayoutResponse> {
    const results: PayoutResponse[] = [];
    let successCount = 0;
    let failCount = 0;

    for (const payout of request.payouts) {
      try {
        const result = await this.initiatePayout(payout);
        results.push(result);
        if (result.status === 'COMPLETED' || result.status === 'ACCEPTED' || result.status === 'SUBMITTED') {
          successCount++;
        } else {
          failCount++;
        }
      } catch (error) {
        failCount++;
        results.push({
          payoutId: payout.payoutId,
          status: 'FAILED',
          requestedAmount: payout.amount,
          currency: payout.currency,
          country: '',
          recipient: payout.recipient,
          customerTimestamp: payout.customerTimestamp,
          statementDescription: payout.statementDescription,
          created: new Date().toISOString(),
          failureReason: {
            failureCode: 'BULK_PAYOUT_ERROR',
            failureMessage: error instanceof Error ? error.message : 'Unknown error'
          }
        });
      }
    }

    return {
      bulkPayoutId: request.bulkPayoutId,
      status: failCount === 0 ? 'COMPLETED' : successCount > 0 ? 'PARTIAL_SUCCESS' : 'FAILED',
      totalPayouts: request.payouts.length,
      successfulPayouts: successCount,
      failedPayouts: failCount,
      payouts: results,
      created: new Date().toISOString()
    };
  }

  // ==================== REFUND OPERATIONS ====================

  /**
   * Initiate a refund for a completed deposit
   * @param request Refund request parameters
   * @returns Refund response with transaction details
   */
  async initiateRefund(request: RefundRequest): Promise<RefundResponse> {
    const response = await this.client.post<RefundResponse>('/refunds', request);
    return response.data;
  }

  /**
   * Get refund status by refundId
   * @param refundId Unique refund identifier
   * @returns Refund response with current status
   */
  async getRefundStatus(refundId: string): Promise<RefundResponse> {
    const response = await this.client.get<RefundResponse>(`/refunds/${refundId}`);
    return response.data;
  }

  // ==================== CONFIGURATION & AVAILABILITY ====================

  /**
   * Get active configuration (available correspondents/providers)
   * @param forceRefresh Force cache refresh
   * @returns Active configuration with available providers
   */
  async getActiveConfiguration(forceRefresh = false): Promise<ActiveConfiguration> {
    const now = Date.now();

    if (!forceRefresh && this.activeConfigCache && (now - this.cacheTimestamp < this.CACHE_DURATION)) {
      return this.activeConfigCache;
    }

    const response = await this.client.get<ActiveConfiguration>('/active-conf');
    this.activeConfigCache = response.data;
    this.cacheTimestamp = now;

    return response.data;
  }

  /**
   * Get available correspondents for a specific country
   * @param countryCode ISO 3166-1 alpha-3 country code (e.g., "ZMB", "KEN")
   * @returns List of available correspondents
   */
  async getAvailableProviders(countryCode: string): Promise<any[]> {
    const config = await this.getActiveConfiguration();
    return config.correspondents.filter((c) => c.country === countryCode && c.active);
  }

  // ==================== CALLBACK/WEBHOOK OPERATIONS ====================

  /**
   * Resend callback for a specific transaction
   * @param transactionId depositId, payoutId, or refundId
   * @param type Transaction type
   * @returns Success status
   */
  async resendCallback(transactionId: string, type: 'DEPOSIT' | 'PAYOUT' | 'REFUND'): Promise<boolean> {
    const endpoint = type === 'DEPOSIT'
      ? `/deposits/${transactionId}/resend-callback`
      : type === 'PAYOUT'
      ? `/payouts/${transactionId}/resend-callback`
      : `/refunds/${transactionId}/resend-callback`;

    await this.client.post(endpoint);
    return true;
  }

  /**
   * Validate PawaPay webhook signature
   * @param payload Webhook payload
   * @param signature Signature from webhook header
   * @returns Whether signature is valid
   */
  validateWebhookSignature(payload: string, signature: string): boolean {
    try {
      const webhookSecret = config.pawapay.webhookSecret || '';
      if (!webhookSecret) return false;

      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(payload)
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (error) {
      return false;
    }
  }

  // ==================== HELPER METHODS ====================

  /**
   * Convert 2-letter country code to 3-letter ISO 3166-1 alpha-3 format
   * @param countryCode 2-letter or 3-letter country code
   * @returns ISO 3166-1 alpha-3 country code
   */
  convertToISO3CountryCode(countryCode: string): string {
    const upperCode = countryCode.toUpperCase();

    // If already 3 letters, return as is
    if (upperCode.length === 3) {
      return upperCode;
    }

    // Country code mapping (ISO 3166-1 alpha-2 to alpha-3)
    const countryMap: Record<string, string> = {
      'RW': 'RWA', 'RWANDA': 'RWA',
      'KE': 'KEN', 'KENYA': 'KEN',
      'UG': 'UGA', 'UGANDA': 'UGA',
      'TZ': 'TZA', 'TANZANIA': 'TZA',
      'ZM': 'ZMB', 'ZAMBIA': 'ZMB',
      'GH': 'GHA', 'GHANA': 'GHA',
      'NG': 'NGA', 'NIGERIA': 'NGA',
      'MW': 'MWI', 'MALAWI': 'MWI',
      'BJ': 'BEN', 'BENIN': 'BEN',
      'CM': 'CMR', 'CAMEROON': 'CMR',
      'CD': 'COD', 'DRC': 'COD',
      'CI': 'CIV', 'IVORY COAST': 'CIV',
      'SN': 'SEN', 'SENEGAL': 'SEN',
      'ZW': 'ZWE', 'ZIMBABWE': 'ZWE',
      'BW': 'BWA', 'BOTSWANA': 'BWA',
      'ET': 'ETH', 'ETHIOPIA': 'ETH',
      'ZA': 'ZAF', 'SOUTH AFRICA': 'ZAF'
    };

    return countryMap[upperCode] || upperCode;
  }

  /**
   * Format phone number for PawaPay (international format without +)
   * @param phone Phone number in any format
   * @param countryCode Default country code if not in phone
   * @returns Formatted phone number
   */
  formatPhoneNumber(phone: string, countryCode = '250'): string {
    // Remove all non-numeric characters
    let cleaned = phone.replace(/\D/g, '');

    // If starts with country code, return as is
    if (cleaned.startsWith(countryCode)) {
      return cleaned;
    }

    // If starts with 0, remove it and add country code
    if (cleaned.startsWith('0')) {
      return countryCode + cleaned.substring(1);
    }

    // Otherwise, add country code
    return countryCode + cleaned;
  }

  /**
   * Convert amount to smallest currency unit (cents)
   * @param amount Amount in major units
   * @param currency Currency code
   * @returns Amount in smallest units as string
   */
  convertToSmallestUnit(amount: number, currency: string): string {
    // Most African currencies use 2 decimal places except:
    // - RWF (0 decimals)
    // - UGX (0 decimals)
    const zeroDecimalCurrencies = ['RWF', 'UGX', 'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'PYG', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'];

    if (zeroDecimalCurrencies.includes(currency.toUpperCase())) {
      return Math.round(amount).toString();
    }

    return Math.round(amount * 100).toString();
  }

  /**
   * Convert amount from smallest currency unit to major units
   * @param amount Amount in smallest units
   * @param currency Currency code
   * @returns Amount in major units
   */
  convertFromSmallestUnit(amount: string, currency: string): number {
    const zeroDecimalCurrencies = ['RWF', 'UGX', 'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'PYG', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'];

    const numAmount = parseFloat(amount);

    if (zeroDecimalCurrencies.includes(currency.toUpperCase())) {
      return numAmount;
    }

    return numAmount / 100;
  }

  /**
   * Get provider code from friendly name or country
   * @param provider Provider name or code
   * @param country Country code
   * @returns PawaPay provider code
   */
  getProviderCode(provider: string, country: string): string {
    const upperProvider = provider.toUpperCase();
    const upperCountry = country.toUpperCase();

    // Direct match
    if (Object.values(PAWAPAY_PROVIDERS).includes(upperProvider as PawaPayProvider)) {
      return upperProvider;
    }

    // Try to construct from provider name and country
    const countryMap: Record<string, string> = {
      'RW': 'RWA', 'RWA': 'RWA', 'RWANDA': 'RWA',
      'KE': 'KEN', 'KEN': 'KEN', 'KENYA': 'KEN',
      'UG': 'UGA', 'UGA': 'UGA', 'UGANDA': 'UGA',
      'TZ': 'TZA', 'TZA': 'TZA', 'TANZANIA': 'TZA',
      'ZM': 'ZMB', 'ZMB': 'ZMB', 'ZAMBIA': 'ZMB',
      'GH': 'GHA', 'GHA': 'GHA', 'GHANA': 'GHA',
      'NG': 'NGA', 'NGA': 'NGA', 'NIGERIA': 'NGA',
      'MW': 'MWI', 'MWI': 'MWI', 'MALAWI': 'MWI',
    };

    const isoCountry = countryMap[upperCountry] || upperCountry;

    // Common provider mappings
    if (upperProvider.includes('MTN')) {
      return `MTN_MOMO_${isoCountry}`;
    }
    if (upperProvider.includes('AIRTEL')) {
      return `AIRTEL_${isoCountry}`;
    }
    if (upperProvider.includes('MPESA') || upperProvider.includes('M-PESA')) {
      return `MPESA_${isoCountry}`;
    }
    if (upperProvider.includes('VODAFONE')) {
      return `VODAFONE_${isoCountry}`;
    }
    if (upperProvider.includes('TIGO')) {
      return `TIGO_${isoCountry}`;
    }
    if (upperProvider.includes('ORANGE')) {
      return `ORANGE_${isoCountry}`;
    }

    return `${upperProvider}_${isoCountry}`;
  }

  /**
    * Generate a unique transaction ID in format: Ref891288A6CEDD
    * @param prefix (No longer used, kept for compatibility if other code calls it)
    * @returns Unique transaction ID with 'Ref' prefix followed by 12 hex characters
  */
  generateTransactionId(prefix?: string): string {
    // Generate 12 random hex characters (uppercase)
    const randomHex = crypto.randomBytes(6).toString('hex').toUpperCase();
    return `Ref${randomHex}`;
  }


  // ==================== ERROR HANDLING ====================

  private handleApiError(error: AxiosError<any>): Promise<never> {
    const apiError: PawaPayApiError = new Error('PawaPay API Error') as PawaPayApiError;

    if (error.response) {
      const data = error.response.data as any;
      apiError.message = data?.errorMessage || data?.message || error.message;
      apiError.status = error.response.status;
      apiError.code = data?.errorCode || data?.code;
      apiError.details = data;
    } else if (error.request) {
      apiError.message = 'No response from PawaPay API';
    } else {
      apiError.message = error.message;
    }

    return Promise.reject(apiError);
  }

  // ==================== ADMIN/MANAGEMENT METHODS ====================

  /**
   * Get transaction history (deposits and payouts)
   * @param options Filter options
   * @returns List of transactions
   */
  async getTransactionHistory(_options: {
    type?: 'DEPOSIT' | 'PAYOUT' | 'REFUND';
    status?: TransactionStatus;
    from?: string;
    to?: string;
    limit?: number;
  }): Promise<any[]> {
    return [];
  }

  /**
   * Get account balance (if supported by PawaPay)
   * Note: PawaPay may not provide this endpoint - check docs
   */
  async getBalance(): Promise<any> {
    throw new Error('Balance endpoint not available in PawaPay API');
  }
}

// Export singleton instance
export const pawaPayService = new PawaPayService();
