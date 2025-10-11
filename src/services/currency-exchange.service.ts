// services/currency-exchange.service.ts - Currency Exchange Rate Service

import axios from 'axios';
import { config } from '../config/config';

export interface ExchangeRate {
  base: number;
  depositRate: number;  // +0.5% for deposits
  payoutRate: number;   // -2.5% for payouts
  spread: string;
}

export interface HexarateResponse {
  status_code: number;
  data: {
    base: string;
    target: string;
    mid: number;
    unit: number;
    timestamp: string;
  };
}

export class CurrencyExchangeService {
  private rateCache: Map<string, { rate: ExchangeRate; timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 3600000; // 1 hour in milliseconds

  /**
   * Fetch exchange rate from Hexarate API
   * @param fromCurrency Source currency (default: USD)
   * @param toCurrency Target currency (default: RWF)
   * @returns Exchange rate with deposit and payout rates
   */
  async getExchangeRate(fromCurrency: string = 'USD', toCurrency: string = 'RWF'): Promise<ExchangeRate> {
    const cacheKey = `${fromCurrency}_${toCurrency}`;
    const cached = this.rateCache.get(cacheKey);

    // Return cached rate if still valid
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.rate;
    }

    try {
      // Fetch latest rates from Hexarate API using the correct URL format
      const url = `${config.currencies.exchangeApiUrl}/${fromCurrency}?target=${toCurrency}`;
      console.log(`[CurrencyExchange] Fetching rate from: ${url}`);

      const response = await axios.get<HexarateResponse>(url, {
        timeout: 10000
      });

      console.log(`[CurrencyExchange] API Response:`, JSON.stringify(response.data));

      if (response.data.status_code !== 200 || !response.data.data?.mid) {
        throw new Error(`Failed to fetch exchange rate for ${fromCurrency} to ${toCurrency}`);
      }

      const baseRate = response.data.data.mid;

      // Calculate deposit rate (+0.5% markup)
      const depositRate = baseRate * 1.005;

      // Calculate payout rate (-2.5% markup)
      const payoutRate = baseRate * 0.975;

      // Calculate spread percentage
      const spread = ((depositRate - payoutRate) / baseRate * 100).toFixed(2);

      const exchangeRate: ExchangeRate = {
        base: baseRate,
        depositRate,
        payoutRate,
        spread
      };

      // Cache the rate
      this.rateCache.set(cacheKey, {
        rate: exchangeRate,
        timestamp: Date.now()
      });

      return exchangeRate;
    } catch (error) {
      console.error('Failed to fetch exchange rate from Hexarate:', error);

      // Fallback to cached rate if available (even if expired)
      if (cached) {
        console.warn('Using expired cached rate as fallback');
        return cached.rate;
      }

      // Fallback to default rate if no cache available
      console.warn('Using default fallback rate: 1450 RWF/USD');
      const fallbackBaseRate = 1450; // Updated to match current market rate
      return {
        base: fallbackBaseRate,
        depositRate: fallbackBaseRate * 1.005,
        payoutRate: fallbackBaseRate * 0.975,
        spread: '2.50'
      };
    }
  }

  /**
   * Convert USD amount to RWF using deposit rate
   * @param usdAmount Amount in USD
   * @returns Amount in RWF (rounded to nearest whole number)
   */
  async convertUSDToRWF_Deposit(usdAmount: number): Promise<{ rwfAmount: number; rate: number; exchangeRate: ExchangeRate }> {
    const exchangeRate = await this.getExchangeRate('USD', 'RWF');
    const rwfAmount = Math.round(usdAmount * exchangeRate.depositRate);

    return {
      rwfAmount,
      rate: exchangeRate.depositRate,
      exchangeRate
    };
  }

  /**
   * Convert USD amount to RWF using payout rate
   * @param usdAmount Amount in USD
   * @returns Amount in RWF (rounded to nearest whole number)
   */
  async convertUSDToRWF_Payout(usdAmount: number): Promise<{ rwfAmount: number; rate: number; exchangeRate: ExchangeRate }> {
    const exchangeRate = await this.getExchangeRate('USD', 'RWF');
    const rwfAmount = Math.round(usdAmount * exchangeRate.payoutRate);

    return {
      rwfAmount,
      rate: exchangeRate.payoutRate,
      exchangeRate
    };
  }

  /**
   * Convert RWF amount to USD using deposit rate (reverse calculation)
   * @param rwfAmount Amount in RWF
   * @returns Amount in USD
   */
  async convertRWFToUSD_Deposit(rwfAmount: number): Promise<{ usdAmount: number; rate: number; exchangeRate: ExchangeRate }> {
    const exchangeRate = await this.getExchangeRate('USD', 'RWF');
    const usdAmount = rwfAmount / exchangeRate.depositRate;

    return {
      usdAmount: parseFloat(usdAmount.toFixed(2)),
      rate: exchangeRate.depositRate,
      exchangeRate
    };
  }

  /**
   * Convert RWF amount to USD using payout rate (reverse calculation)
   * @param rwfAmount Amount in RWF
   * @returns Amount in USD
   */
  async convertRWFToUSD_Payout(rwfAmount: number): Promise<{ usdAmount: number; rate: number; exchangeRate: ExchangeRate }> {
    const exchangeRate = await this.getExchangeRate('USD', 'RWF');
    const usdAmount = rwfAmount / exchangeRate.payoutRate;

    return {
      usdAmount: parseFloat(usdAmount.toFixed(2)),
      rate: exchangeRate.payoutRate,
      exchangeRate
    };
  }

  /**
   * Clear the rate cache (useful for testing or manual refresh)
   */
  clearCache(): void {
    this.rateCache.clear();
  }

  /**
   * Get current cached rates (for debugging)
   */
  getCachedRates(): Map<string, { rate: ExchangeRate; timestamp: number }> {
    return this.rateCache;
  }
}

// Export singleton instance
export const currencyExchangeService = new CurrencyExchangeService();
