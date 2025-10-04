import { config } from '../config/config';
import { logger } from './logger';

interface ExchangeRateCache {
  rate: number;
  timestamp: number;
}

export class CurrencyUtils {
  private static rateCache: ExchangeRateCache | null = null;
  private static readonly CACHE_DURATION = 3600000; // 1 hour
  private static readonly FALLBACK_RATE = 1300; // Fallback USD to RWF rate

  /**
   * Get current USD to RWF exchange rate from API
   */
  static async getExchangeRate(): Promise<number> {
    try {
      // Check cache
      if (this.rateCache && Date.now() - this.rateCache.timestamp < this.CACHE_DURATION) {
        return this.rateCache.rate;
      }

      const response = await fetch(`${config.currencies.exchangeApiUrl}/USD?target=RWF`);

      if (!response.ok) {
        logger.warn('Exchange rate API failed, using fallback', 'CurrencyUtils');
        return this.FALLBACK_RATE;
      }

      const data: any = await response.json();
      const rate = data?.data?.mid || this.FALLBACK_RATE;

      // Update cache
      this.rateCache = {
        rate,
        timestamp: Date.now()
      };

      return rate;
    } catch (error) {
      logger.error('Failed to fetch exchange rate', 'CurrencyUtils', error);
      return this.FALLBACK_RATE;
    }
  }

  /**
   * Convert USD amount to RWF
   */
  static async convertUsdToRwf(usdAmount: number): Promise<number> {
    const rate = await this.getExchangeRate();
    return Math.round(usdAmount * rate);
  }

  /**
   * Convert RWF amount to USD
   */
  static async convertRwfToUsd(rwfAmount: number): Promise<number> {
    const rate = await this.getExchangeRate();
    return parseFloat((rwfAmount / rate).toFixed(2));
  }

  /**
   * Clear exchange rate cache (useful for testing or manual refresh)
   */
  static clearCache(): void {
    this.rateCache = null;
  }
}
