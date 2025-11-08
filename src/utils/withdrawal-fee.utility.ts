/**
 * Withdrawal Fee Utility
 * Calculates tiered withdrawal fees based on amount
 *
 * Fee Structure (in RWF):
 * - Up to 1,000,000 RWF: 600 RWF
 * - 1,000,001 to 5,000,000 RWF: 1,200 RWF
 * - Above 5,000,000 RWF: 3,000 RWF
 *
 * NEW BEHAVIOR:
 * - User receives the FULL requested withdrawal amount
 * - Fee is deducted from the remaining wallet balance
 * - NO fee doubling for any payment method (all methods use same base fee)
 */

import { currencyExchangeService } from '../services/currency-exchange.service';

export interface WithdrawalFeeCalculation {
  originalAmount: number;
  feeAmount: number;
  netAmount: number; // Amount user receives after fee deduction
  feeTier: string;
  currency: string;
  isDoubled: boolean;
  exchangeRate?: number; // The actual rate used for conversion
}

/**
 * Calculate withdrawal fee based on amount and currency (with live exchange rate)
 * @param amount - Withdrawal amount in specified currency (user will receive this exact amount)
 * @param currency - Currency code (RWF, USD, etc.)
 * @param isDoubled - Whether to double the fee (DEPRECATED - always false, no doubling)
 * @returns Promise<WithdrawalFeeCalculation> object with fee details
 */
export async function calculateWithdrawalFee(
  amount: number,
  currency: string = 'RWF',
  isDoubled: boolean = false
): Promise<WithdrawalFeeCalculation> {
  let baseFee: number;
  let feeTier: string;
  let exchangeRate: number | undefined;

  // Convert to RWF if needed for tier calculation using LIVE exchange rate
  let amountInRWF: number;

  if (currency.toUpperCase() === 'USD') {
    // Use payout rate for withdrawals (user is withdrawing USD, converting to RWF)
    const conversion = await currencyExchangeService.convertUSDToRWF_Payout(amount);
    amountInRWF = conversion.rwfAmount;
    exchangeRate = conversion.rate;
  } else {
    amountInRWF = amount;
  }

  // Determine base fee based on tier
  if (amountInRWF <= 1000000) {
    baseFee = 600;
    feeTier = 'Tier 1 (Up to 1M RWF)';
  } else if (amountInRWF <= 5000000) {
    baseFee = 1200;
    feeTier = 'Tier 2 (1M-5M RWF)';
  } else {
    baseFee = 3000;
    feeTier = 'Tier 3 (Above 5M RWF)';
  }

  // NO DOUBLING: Fee is always the base fee regardless of payment method
  const feeAmountInRWF = baseFee;

  // Convert fee back to original currency if needed
  let feeAmount: number;

  if (currency.toUpperCase() === 'USD') {
    // Convert RWF fee to USD using payout rate
    const feeConversion = await currencyExchangeService.convertRWFToUSD_Payout(feeAmountInRWF);
    feeAmount = feeConversion.usdAmount;
  } else {
    feeAmount = feeAmountInRWF;
  }

  // User receives the FULL requested amount (netAmount = originalAmount)
  // Fee is deducted from remaining balance separately
  const netAmount = amount;

  return {
    originalAmount: amount,
    feeAmount,
    netAmount,
    feeTier,
    currency: currency.toUpperCase(),
    isDoubled: false, // Always false - no doubling
    exchangeRate
  };
}

/**
 * Determine if withdrawal fee should be doubled
 * DEPRECATED: Fee doubling has been disabled - always returns false
 * @param paymentMethod - Payment method (MOBILE_MONEY, CARD, BANK_TRANSFER, etc.)
 * @returns boolean - always false (no fee doubling)
 */
export function shouldDoubleFee(paymentMethod: string): boolean {
  // NO DOUBLING: All withdrawal methods use the same base fee
  return false;
}

/**
 * Format fee calculation for display in admin transaction listing
 * @param calculation - WithdrawalFeeCalculation object
 * @returns Formatted string for admin display
 */
export function formatFeeForAdmin(calculation: WithdrawalFeeCalculation): string {
  return `Withdrawal Fee: ${calculation.feeAmount} ${calculation.currency} (${calculation.feeTier})`;
}

/**
 * Validate withdrawal amount and fee
 * Ensures amount is positive and meets minimum requirements
 * @param amount - Original withdrawal amount (user will receive this full amount)
 * @param currency - Currency code
 * @param isDoubled - Whether fee is doubled (DEPRECATED - ignored)
 * @returns Promise<{ valid: boolean, error?: string, calculation?: WithdrawalFeeCalculation }>
 */
export async function validateWithdrawalWithFee(
  amount: number,
  currency: string = 'RWF',
  isDoubled: boolean = false
): Promise<{ valid: boolean; error?: string; calculation?: WithdrawalFeeCalculation }> {
  const calculation = await calculateWithdrawalFee(amount, currency, false); // Always false for isDoubled

  // Minimum withdrawal amount requirements
  const minAmount = currency.toUpperCase() === 'USD' ? 1 : 100; // 1 USD or 100 RWF

  if (amount < minAmount) {
    return {
      valid: false,
      error: `Withdrawal amount (${amount} ${currency}) is below minimum withdrawal amount (${minAmount} ${currency})`
    };
  }

  return {
    valid: true,
    calculation
  };
}

export default {
  calculateWithdrawalFee,
  shouldDoubleFee,
  formatFeeForAdmin,
  validateWithdrawalWithFee
};
