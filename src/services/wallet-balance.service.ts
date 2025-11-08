// services/wallet-balance.service.ts - Wallet Balance Service for Admin

import axios from 'axios';
import { config } from '../config/config';
import { currencyExchangeService } from './currency-exchange.service';

// ==================== TYPES ====================

interface PawapayBalance {
  country: string;
  balance: string;
  currency: string;
  provider: string;
}

interface PawapayBalancesResponse {
  balances: PawapayBalance[];
}

interface XentripayWalletResponse {
  walletId: number;
  businessAccountId: number;
  businessName: string;
  balance: string;
  currency: string;
  active: boolean;
}

interface ConvertedBalance {
  original: {
    amount: number;
    currency: string;
  };
  usd: number;
  rwf: number;
  exchangeRate?: number;
}

interface ProviderBalance {
  provider: string;
  country?: string;
  balance: ConvertedBalance;
}

export interface WalletBalanceSummary {
  xentripay: {
    balances: ProviderBalance[];
    total: {
      usd: number;
      rwf: number;
    };
  };
  pawapay: {
    balances: ProviderBalance[];
    total: {
      usd: number;
      rwf: number;
    };
  };
  grandTotal: {
    usd: number;
    rwf: number;
  };
  timestamp: string;
}

// ==================== SERVICE ====================

export class WalletBalanceService {
  /**
   * Convert amount from any currency to USD and RWF
   */
  private async convertCurrency(amount: number, fromCurrency: string): Promise<ConvertedBalance> {
    const upperCurrency = fromCurrency.toUpperCase();

    // If already RWF, just convert to USD
    if (upperCurrency === 'RWF') {
      const conversionResult = await currencyExchangeService.convertRWFToUSD_Payout(amount);
      return {
        original: { amount, currency: 'RWF' },
        usd: conversionResult.usdAmount,
        rwf: amount,
        exchangeRate: conversionResult.rate
      };
    }

    // If already USD, just convert to RWF
    if (upperCurrency === 'USD') {
      const conversionResult = await currencyExchangeService.convertUSDToRWF_Payout(amount);
      return {
        original: { amount, currency: 'USD' },
        usd: amount,
        rwf: conversionResult.rwfAmount,
        exchangeRate: conversionResult.rate
      };
    }

    // For other currencies (UGX, ZMW, KES, TZS, etc.), convert to USD first, then to RWF
    // We'll use the exchange API to get rates
    try {
      const apiUrl = `${config.currencies.exchangeApiUrl}/${upperCurrency}?target=USD`;
      const response = await axios.get(apiUrl, { timeout: 10000 });

      if (response.data.status_code !== 200 || !response.data.data?.mid) {
        throw new Error(`Failed to fetch exchange rate for ${upperCurrency} to USD`);
      }

      const currencyToUsdRate = response.data.data.mid;
      const usdAmount = amount * currencyToUsdRate;

      // Now convert USD to RWF
      const conversionResult = await currencyExchangeService.convertUSDToRWF_Payout(usdAmount);

      return {
        original: { amount, currency: upperCurrency },
        usd: parseFloat(usdAmount.toFixed(2)),
        rwf: conversionResult.rwfAmount,
        exchangeRate: currencyToUsdRate
      };
    } catch (error) {
      console.error(`Error converting ${upperCurrency} to USD/RWF:`, error);
      // Fallback: treat as direct USD conversion with warning
      const conversionResult = await currencyExchangeService.convertUSDToRWF_Payout(amount);
      return {
        original: { amount, currency: upperCurrency },
        usd: amount,
        rwf: conversionResult.rwfAmount
      };
    }
  }

  /**
   * Fetch Xentripay wallet balance
   */
  private async fetchXentripayBalance(): Promise<ProviderBalance[]> {
    try {
      const url = `${config.xentripay.baseUrl}/api/wallets/my-business`;
      const response = await axios.get<XentripayWalletResponse>(url, {
        headers: {
          'X-XENTRIPAY-KEY': config.xentripay.apiKey,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      });

      const wallet = response.data;
      const balance = parseFloat(wallet.balance);
      const converted = await this.convertCurrency(balance, wallet.currency);

      return [{
        provider: wallet.businessName || 'Xentripay',
        balance: converted
      }];
    } catch (error: any) {
      console.error('Error fetching Xentripay balance:', error.message);
      throw new Error(`Failed to fetch Xentripay balance: ${error.message}`);
    }
  }

  /**
   * Fetch Pawapay wallet balances
   */
  private async fetchPawapayBalances(): Promise<ProviderBalance[]> {
    try {
      const url = `${config.pawapay.baseUrl}/wallet-balances`;
      const response = await axios.get<PawapayBalancesResponse>(url, {
        headers: {
          'Authorization': `Bearer ${config.pawapay.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      });

      const balances = response.data.balances;
      const providerBalances: ProviderBalance[] = [];

      for (const item of balances) {
        const balance = parseFloat(item.balance);
        const converted = await this.convertCurrency(balance, item.currency);

        providerBalances.push({
          provider: item.provider || 'Pawapay',
          country: item.country,
          balance: converted
        });
      }

      return providerBalances;
    } catch (error: any) {
      console.error('Error fetching Pawapay balances:', error.message);
      throw new Error(`Failed to fetch Pawapay balances: ${error.message}`);
    }
  }

  /**
   * Get comprehensive wallet balance summary from both providers
   */
  async getWalletBalances(): Promise<WalletBalanceSummary> {
    try {
      // Fetch both balances in parallel
      const [xentripayBalances, pawapayBalances] = await Promise.all([
        this.fetchXentripayBalance(),
        this.fetchPawapayBalances()
      ]);

      // Calculate Xentripay totals
      const xentripayTotalUsd = xentripayBalances.reduce((sum, item) => sum + item.balance.usd, 0);
      const xentripayTotalRwf = xentripayBalances.reduce((sum, item) => sum + item.balance.rwf, 0);

      // Calculate Pawapay totals
      const pawapayTotalUsd = pawapayBalances.reduce((sum, item) => sum + item.balance.usd, 0);
      const pawapayTotalRwf = pawapayBalances.reduce((sum, item) => sum + item.balance.rwf, 0);

      // Calculate grand totals
      const grandTotalUsd = xentripayTotalUsd + pawapayTotalUsd;
      const grandTotalRwf = xentripayTotalRwf + pawapayTotalRwf;

      return {
        xentripay: {
          balances: xentripayBalances,
          total: {
            usd: parseFloat(xentripayTotalUsd.toFixed(2)),
            rwf: Math.round(xentripayTotalRwf)
          }
        },
        pawapay: {
          balances: pawapayBalances,
          total: {
            usd: parseFloat(pawapayTotalUsd.toFixed(2)),
            rwf: Math.round(pawapayTotalRwf)
          }
        },
        grandTotal: {
          usd: parseFloat(grandTotalUsd.toFixed(2)),
          rwf: Math.round(grandTotalRwf)
        },
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      console.error('Error fetching wallet balances:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const walletBalanceService = new WalletBalanceService();
