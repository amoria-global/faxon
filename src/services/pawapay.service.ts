// services/pawapay.service.ts - Complete PawaPay Integration Service

import axios, { AxiosInstance, AxiosError } from 'axios';
import crypto from 'crypto';
import { config } from '../config/config';
import { logger } from '../utils/logger';
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

    // Request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.info(`PawaPay API Request: ${config.method?.toUpperCase()} ${config.url}`, 'PawaPayService');
        return config;
      },
      (error) => {
        logger.error('PawaPay Request Error', 'PawaPayService', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => {
        logger.info(`PawaPay API Response: ${response.status}`, 'PawaPayService');
        return response;
      },
      (error: AxiosError) => {
        return this.handleApiError(error);
      }
    );
  }

  // ==================== DEPOSIT OPERATIONS (Money In) ====================

  /**
   * Initiate a deposit (money in) request
   * @param request Deposit request parameters
   * @returns Deposit response with transaction details
   */
  async initiateDeposit(request: DepositRequest): Promise<DepositResponse> {
    try {
      logger.info(`Initiating deposit: ${request.depositId}`, 'PawaPayService');

      const response = await this.client.post<DepositResponse>('/deposits', request);

      logger.info(`Deposit initiated: ${request.depositId} - Status: ${response.data.status}`, 'PawaPayService');
      return response.data;
    } catch (error) {
      logger.error(`Failed to initiate deposit: ${request.depositId}`, 'PawaPayService', error);
      throw error;
    }
  }

  /**
   * Get deposit status by depositId
   * @param depositId Unique deposit identifier
   * @returns Deposit response with current status
   */
  async getDepositStatus(depositId: string): Promise<DepositResponse> {
    try {
      logger.info(`Fetching deposit status: ${depositId}`, 'PawaPayService');

      const response = await this.client.get<DepositResponse>(`/deposits/${depositId}`);

      logger.info(`Deposit status: ${depositId} - ${response.data.status}`, 'PawaPayService');
      return response.data;
    } catch (error) {
      logger.error(`Failed to get deposit status: ${depositId}`, 'PawaPayService', error);
      throw error;
    }
  }

  /**
   * Predict deposit status (for testing/validation)
   * @param depositId Unique deposit identifier
   * @returns Predicted deposit response
   */
  async predictDeposit(depositId: string): Promise<DepositResponse> {
    try {
      logger.info(`Predicting deposit: ${depositId}`, 'PawaPayService');

      const response = await this.client.post<DepositResponse>(`/deposits/${depositId}/predict`, {});

      logger.info(`Deposit predicted: ${depositId} - Status: ${response.data.status}`, 'PawaPayService');
      return response.data;
    } catch (error) {
      logger.error(`Failed to predict deposit: ${depositId}`, 'PawaPayService', error);
      throw error;
    }
  }

  // ==================== PAYOUT OPERATIONS (Money Out) ====================

  /**
   * Initiate a payout (money out) request
   * @param request Payout request parameters
   * @returns Payout response with transaction details
   */
  async initiatePayout(request: PayoutRequest): Promise<PayoutResponse> {
    try {
      logger.info(`Initiating payout: ${request.payoutId}`, 'PawaPayService');

      const response = await this.client.post<PayoutResponse>('/payouts', request);

      logger.info(`Payout initiated: ${request.payoutId} - Status: ${response.data.status}`, 'PawaPayService');
      return response.data;
    } catch (error) {
      logger.error(`Failed to initiate payout: ${request.payoutId}`, 'PawaPayService', error);
      throw error;
    }
  }

  /**
   * Get payout status by payoutId
   * @param payoutId Unique payout identifier
   * @returns Payout response with current status
   */
  async getPayoutStatus(payoutId: string): Promise<PayoutResponse> {
    try {
      logger.info(`Fetching payout status: ${payoutId}`, 'PawaPayService');

      const response = await this.client.get<PayoutResponse>(`/payouts/${payoutId}`);

      logger.info(`Payout status: ${payoutId} - ${response.data.status}`, 'PawaPayService');
      return response.data;
    } catch (error) {
      logger.error(`Failed to get payout status: ${payoutId}`, 'PawaPayService', error);
      throw error;
    }
  }

  // ==================== BULK PAYOUT OPERATIONS ====================

  /**
   * Initiate bulk payouts
   * @param request Bulk payout request with multiple payouts
   * @returns Bulk payout response with results
   */
  async initiateBulkPayout(request: BulkPayoutRequest): Promise<BulkPayoutResponse> {
    try {
      logger.info(`Initiating bulk payout: ${request.bulkPayoutId} (${request.payouts.length} payouts)`, 'PawaPayService');

      // PawaPay doesn't have a native bulk endpoint, so we process individually
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
          // Create a failed response
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

      const bulkResponse: BulkPayoutResponse = {
        bulkPayoutId: request.bulkPayoutId,
        status: failCount === 0 ? 'COMPLETED' : successCount > 0 ? 'PARTIAL_SUCCESS' : 'FAILED',
        totalPayouts: request.payouts.length,
        successfulPayouts: successCount,
        failedPayouts: failCount,
        payouts: results,
        created: new Date().toISOString()
      };

      logger.info(`Bulk payout completed: ${request.bulkPayoutId} - ${successCount}/${request.payouts.length} successful`, 'PawaPayService');
      return bulkResponse;
    } catch (error) {
      logger.error(`Failed to process bulk payout: ${request.bulkPayoutId}`, 'PawaPayService', error);
      throw error;
    }
  }

  // ==================== REFUND OPERATIONS ====================

  /**
   * Initiate a refund for a completed deposit
   * @param request Refund request parameters
   * @returns Refund response with transaction details
   */
  async initiateRefund(request: RefundRequest): Promise<RefundResponse> {
    try {
      logger.info(`Initiating refund: ${request.refundId} for deposit: ${request.depositId}`, 'PawaPayService');

      const response = await this.client.post<RefundResponse>('/refunds', request);

      logger.info(`Refund initiated: ${request.refundId} - Status: ${response.data.status}`, 'PawaPayService');
      return response.data;
    } catch (error) {
      logger.error(`Failed to initiate refund: ${request.refundId}`, 'PawaPayService', error);
      throw error;
    }
  }

  /**
   * Get refund status by refundId
   * @param refundId Unique refund identifier
   * @returns Refund response with current status
   */
  async getRefundStatus(refundId: string): Promise<RefundResponse> {
    try {
      logger.info(`Fetching refund status: ${refundId}`, 'PawaPayService');

      const response = await this.client.get<RefundResponse>(`/refunds/${refundId}`);

      logger.info(`Refund status: ${refundId} - ${response.data.status}`, 'PawaPayService');
      return response.data;
    } catch (error) {
      logger.error(`Failed to get refund status: ${refundId}`, 'PawaPayService', error);
      throw error;
    }
  }

  // ==================== CONFIGURATION & AVAILABILITY ====================

  /**
   * Get active configuration (available correspondents/providers)
   * @param forceRefresh Force cache refresh
   * @returns Active configuration with available providers
   */
  async getActiveConfiguration(forceRefresh = false): Promise<ActiveConfiguration> {
    try {
      const now = Date.now();

      // Return cached config if still valid
      if (!forceRefresh && this.activeConfigCache && (now - this.cacheTimestamp < this.CACHE_DURATION)) {
        logger.info('Returning cached active configuration', 'PawaPayService');
        return this.activeConfigCache;
      }

      logger.info('Fetching active configuration', 'PawaPayService');

      const response = await this.client.get<ActiveConfiguration>('/active-conf');

      this.activeConfigCache = response.data;
      this.cacheTimestamp = now;

      logger.info(`Active configuration retrieved: ${response.data.correspondents.length} correspondents`, 'PawaPayService');
      return response.data;
    } catch (error) {
      logger.error('Failed to get active configuration', 'PawaPayService', error);
      throw error;
    }
  }

  /**
   * Get available correspondents for a specific country
   * @param countryCode ISO 3166-1 alpha-3 country code (e.g., "ZMB", "KEN")
   * @returns List of available correspondents
   */
  async getAvailableProviders(countryCode: string): Promise<any[]> {
    try {
      const config = await this.getActiveConfiguration();
      const providers = config.correspondents.filter(
        (c) => c.country === countryCode && c.active
      );

      logger.info(`Found ${providers.length} providers for ${countryCode}`, 'PawaPayService');
      return providers;
    } catch (error) {
      logger.error(`Failed to get providers for ${countryCode}`, 'PawaPayService', error);
      throw error;
    }
  }

  // ==================== CALLBACK/WEBHOOK OPERATIONS ====================

  /**
   * Resend callback for a specific transaction
   * @param transactionId depositId, payoutId, or refundId
   * @param type Transaction type
   * @returns Success status
   */
  async resendCallback(transactionId: string, type: 'DEPOSIT' | 'PAYOUT' | 'REFUND'): Promise<boolean> {
    try {
      logger.info(`Resending callback for ${type}: ${transactionId}`, 'PawaPayService');

      const endpoint = type === 'DEPOSIT'
        ? `/deposits/${transactionId}/resend-callback`
        : type === 'PAYOUT'
        ? `/payouts/${transactionId}/resend-callback`
        : `/refunds/${transactionId}/resend-callback`;

      await this.client.post(endpoint);

      logger.info(`Callback resent for ${type}: ${transactionId}`, 'PawaPayService');
      return true;
    } catch (error) {
      logger.error(`Failed to resend callback for ${type}: ${transactionId}`, 'PawaPayService', error);
      throw error;
    }
  }

  /**
   * Validate PawaPay webhook signature
   * @param payload Webhook payload
   * @param signature Signature from webhook header
   * @returns Whether signature is valid
   */
  validateWebhookSignature(payload: string, signature: string): boolean {
    try {
      // PawaPay uses HMAC-SHA256 for webhook signatures
      // Note: You'll need to configure webhook secret in PawaPay dashboard
      const webhookSecret = config.pawapay.webhookSecret || '';

      if (!webhookSecret) {
        logger.warn('Webhook secret not configured', 'PawaPayService');
        return false;
      }

      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(payload)
        .digest('hex');

      const isValid = crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );

      logger.info(`Webhook signature validation: ${isValid ? 'VALID' : 'INVALID'}`, 'PawaPayService');
      return isValid;
    } catch (error) {
      logger.error('Error validating webhook signature', 'PawaPayService', error);
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

    const iso3Code = countryMap[upperCode];
    if (!iso3Code) {
      logger.warn(`Unknown country code: ${countryCode}, using as-is`, 'PawaPayService');
      return upperCode;
    }

    return iso3Code;
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

    logger.warn(`Unable to map provider: ${provider} for country: ${country}`, 'PawaPayService');
    return `${upperProvider}_${isoCountry}`;
  }

  /**
    * Generate a unique v4 UUID transaction ID
    * @param prefix (No longer used, kept for compatibility if other code calls it)
    * @returns Unique 36-character UUID
  */
  generateTransactionId(prefix?: string): string {
    return crypto.randomUUID();
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

      logger.error(
        `PawaPay API Error: ${error.response.status} - ${apiError.message}`,
        data,
        'PawaPayService'
      );
    } else if (error.request) {
      apiError.message = 'No response from PawaPay API';
      logger.error('PawaPay API No Response', 'PawaPayService', error.request);
    } else {
      apiError.message = error.message;
      logger.error('PawaPay Request Setup Error', 'PawaPayService', error);
    }

    return Promise.reject(apiError);
  }

  // ==================== ADMIN/MANAGEMENT METHODS ====================

  /**
   * Get transaction history (deposits and payouts)
   * @param options Filter options
   * @returns List of transactions
   */
  async getTransactionHistory(options: {
    type?: 'DEPOSIT' | 'PAYOUT' | 'REFUND';
    status?: TransactionStatus;
    from?: string;
    to?: string;
    limit?: number;
  }): Promise<any[]> {
    try {
      logger.info('Fetching transaction history', 'PawaPayService');

      // Note: PawaPay doesn't have a unified transactions endpoint
      // You'll need to query deposits and payouts separately and merge

      const transactions: any[] = [];

      // This is a simplified implementation
      // In production, you'd implement proper pagination and filtering

      logger.info(`Retrieved ${transactions.length} transactions`, 'PawaPayService');
      return transactions;
    } catch (error) {
      logger.error('Failed to get transaction history', 'PawaPayService', error);
      throw error;
    }
  }

  /**
   * Get account balance (if supported by PawaPay)
   * Note: PawaPay may not provide this endpoint - check docs
   */
  async getBalance(): Promise<any> {
    try {
      logger.info('Fetching account balance', 'PawaPayService');

      // PawaPay doesn't provide a balance endpoint in standard API
      // This would need to be implemented through their dashboard or custom integration

      throw new Error('Balance endpoint not available in PawaPay API');
    } catch (error) {
      logger.error('Failed to get balance', 'PawaPayService', error);
      throw error;
    }
  }
}

// Export singleton instance
export const pawaPayService = new PawaPayService();
