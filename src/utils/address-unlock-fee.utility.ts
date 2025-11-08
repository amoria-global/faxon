// src/utils/address-unlock-fee.utility.ts - Address Unlock Fee Calculation Utility

import { CurrencyExchangeService } from '../services/currency-exchange.service';
import { applyGuestPriceMarkup } from './guest-price-markup.utility';

export interface UnlockFeeCalculation {
  feeRWF: number;
  feeUSD: number;
  exchangeRate: number;
  paymentMethod: 'non_refundable_fee' | 'three_month_30_percent';
  propertyPricePerNight: number;
  calculatedAt: Date;
}

export class AddressUnlockFeeUtility {
  private currencyService = new CurrencyExchangeService();

  /**
   * Calculate unlock fee based on property price and payment method
   * Only works for monthly properties
   * @param monthlyPriceUSD - Monthly property price in USD (will NOT apply markup - already applied in DB)
   * @param paymentMethod - Payment method type
   * @returns UnlockFeeCalculation object with fee details
   */
  async calculateUnlockFee(
    monthlyPriceUSD: number,
    paymentMethod: 'non_refundable_fee' | 'three_month_30_percent'
  ): Promise<UnlockFeeCalculation> {
    let feeRWF: number;
    let feeUSD: number;

    // Get current exchange rate
    const exchangeRateData = await this.currencyService.getExchangeRate('USD', 'RWF');
    const exchangeRate = exchangeRateData.base; // Extract the base rate

    if (paymentMethod === 'non_refundable_fee') {
      // Non-refundable fee for monthly properties
      // < $300/month → 8,000 RWF
      // ≥ $300/month → 15,000 RWF
      if (monthlyPriceUSD < 300) {
        feeRWF = 8000;
      } else {
        feeRWF = 15000;
      }
      feeUSD = feeRWF / exchangeRate;
    } else {
      // three_month_30_percent method
      // 30% of (monthly price with 14% tax × 3 months)
      const monthlyPriceWithTax = monthlyPriceUSD * 1.14;
      const threeMonthsWithTax = monthlyPriceWithTax * 3;
      feeUSD = threeMonthsWithTax * 0.3;
      feeRWF = feeUSD * exchangeRate;
    }

    return {
      feeRWF: Math.round(feeRWF),
      feeUSD: Math.round(feeUSD * 100) / 100, // Round to 2 decimal places
      exchangeRate,
      paymentMethod,
      propertyPricePerNight: monthlyPriceUSD, // Store monthly price (field name is legacy)
      calculatedAt: new Date()
    };
  }

  /**
   * Validate if payment amount matches expected fee
   * @param providedAmountRWF - Amount provided by user
   * @param expectedFee - Expected fee calculation
   * @param toleranceRWF - Tolerance for rate fluctuations (default 100 RWF)
   * @returns boolean indicating if payment is valid
   */
  validatePaymentAmount(
    providedAmountRWF: number,
    expectedFee: UnlockFeeCalculation,
    toleranceRWF: number = 100
  ): { valid: boolean; reason?: string } {
    const difference = Math.abs(providedAmountRWF - expectedFee.feeRWF);

    if (difference > toleranceRWF) {
      return {
        valid: false,
        reason: `Payment amount ${providedAmountRWF} RWF does not match expected fee ${expectedFee.feeRWF} RWF (tolerance: ${toleranceRWF} RWF)`
      };
    }

    return { valid: true };
  }

  /**
   * Determine appropriate payment method based on property price
   * Only for monthly properties
   * @param monthlyPriceUSD - Monthly property price in USD
   * @returns Recommended payment method
   */
  getRecommendedPaymentMethod(monthlyPriceUSD: number): 'non_refundable_fee' | 'three_month_30_percent' {
    // Calculate both fees to compare
    const nonRefundableFee = monthlyPriceUSD < 300 ? 8000 : 15000;

    // 30% of 3 months with 14% tax
    const monthlyPriceWithTax = monthlyPriceUSD * 1.14;
    const threeMonthFee = monthlyPriceWithTax * 3 * 0.3;

    // Compare in USD
    // Convert nonRefundableFee to USD (assume ~1200 RWF = 1 USD)
    const nonRefundableFeeUSD = nonRefundableFee / 1200;

    // Recommend the cheaper option
    return threeMonthFee < nonRefundableFeeUSD ? 'three_month_30_percent' : 'non_refundable_fee';
  }

  /**
   * Generate unlock ID
   * @returns Unique unlock ID
   */
  generateUnlockId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `unlock-${timestamp}-${random}`;
  }

  /**
   * Generate deal code
   * @returns Unique deal code
   */
  generateDealCode(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9).toUpperCase();
    return `UNLOCK-${timestamp}-${random}`;
  }

  /**
   * Calculate refund amount for dissatisfied users
   * @returns Refund amount in RWF (always 15,000)
   */
  getRefundAmount(): number {
    return 15000; // 15,000 RWF refund for not appreciated unlocks
  }

  /**
   * Get deal code expiry date (6 months from now)
   * @returns Expiry date
   */
  getDealCodeExpiry(): Date {
    const expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + 6);
    return expiryDate;
  }

  /**
   * Generate Google Maps embed URL
   * @param address - Property full address
   * @returns Google Maps embed URL
   */
  generateGoogleMapsUrl(address: string): string {
    const encodedAddress = encodeURIComponent(address);
    return `https://maps.google.com/maps?q=${encodedAddress}&t=k&z=15&ie=UTF8&iwloc=&output=embed`;
  }

  /**
   * Format currency for display
   * @param amount - Amount to format
   * @param currency - Currency code
   * @returns Formatted currency string
   */
  formatCurrency(amount: number, currency: 'RWF' | 'USD'): string {
    if (currency === 'RWF') {
      return `${Math.round(amount).toLocaleString()} RWF`;
    } else {
      return `$${amount.toFixed(2)}`;
    }
  }

  /**
   * Calculate fee breakdown for display
   * Only for monthly properties
   * @param monthlyPriceUSD - Monthly property price in USD
   * @returns Fee breakdown for both payment methods
   */
  async getFeesBreakdown(monthlyPriceUSD: number): Promise<{
    nonRefundable: UnlockFeeCalculation;
    threeMonth: UnlockFeeCalculation;
    recommended: 'non_refundable_fee' | 'three_month_30_percent';
  }> {
    const [nonRefundable, threeMonth] = await Promise.all([
      this.calculateUnlockFee(monthlyPriceUSD, 'non_refundable_fee'),
      this.calculateUnlockFee(monthlyPriceUSD, 'three_month_30_percent')
    ]);

    const recommended = this.getRecommendedPaymentMethod(monthlyPriceUSD);

    return {
      nonRefundable,
      threeMonth,
      recommended
    };
  }
}

// Export singleton instance
export const addressUnlockFeeUtility = new AddressUnlockFeeUtility();
