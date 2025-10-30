/**
 * Withdrawal Fee Utility
 * Calculates tiered withdrawal fees based on amount
 *
 * Fee Structure (in RWF):
 * - Up to 1,000,000 RWF: 600 RWF
 * - 1,000,001 to 5,000,000 RWF: 1,200 RWF
 * - Above 5,000,000 RWF: 3,000 RWF
 *
 * Note: Fees can be doubled for certain withdrawal types (e.g., card withdrawals)
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
 * @param amount - Withdrawal amount in specified currency
 * @param currency - Currency code (RWF, USD, etc.)
 * @param isDoubled - Whether to double the fee (for specific withdrawal types)
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

  // Double fee if specified
  const feeAmountInRWF = isDoubled ? baseFee * 2 : baseFee;

  // Convert fee back to original currency if needed
  let feeAmount: number;

  if (currency.toUpperCase() === 'USD') {
    // Convert RWF fee to USD using payout rate
    const feeConversion = await currencyExchangeService.convertRWFToUSD_Payout(feeAmountInRWF);
    feeAmount = feeConversion.usdAmount;
  } else {
    feeAmount = feeAmountInRWF;
  }

  // Calculate net amount after fee deduction
  const netAmount = Math.round((amount - feeAmount) * 100) / 100;

  return {
    originalAmount: amount,
    feeAmount,
    netAmount,
    feeTier: isDoubled ? `${feeTier} (Doubled)` : feeTier,
    currency: currency.toUpperCase(),
    isDoubled,
    exchangeRate
  };
}

/**
 * Determine if withdrawal fee should be doubled
 * Currently based on withdrawal method/type
 * @param paymentMethod - Payment method (MOBILE_MONEY, CARD, BANK_TRANSFER, etc.)
 * @returns boolean - true if fee should be doubled
 */
export function shouldDoubleFee(paymentMethod: string): boolean {
  // Double fees for card/bank withdrawals (higher processing costs)
  const doubledMethods = ['CARD', 'BANK', 'BANK_TRANSFER', 'VISA', 'MASTERCARD'];
  return doubledMethods.includes(paymentMethod.toUpperCase());
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
 * Validate withdrawal amount after fee deduction
 * Ensures net amount is still positive and meets minimum requirements
 * @param amount - Original withdrawal amount
 * @param currency - Currency code
 * @param isDoubled - Whether fee is doubled
 * @returns Promise<{ valid: boolean, error?: string, calculation?: WithdrawalFeeCalculation }>
 */
export async function validateWithdrawalWithFee(
  amount: number,
  currency: string = 'RWF',
  isDoubled: boolean = false
): Promise<{ valid: boolean; error?: string; calculation?: WithdrawalFeeCalculation }> {
  const calculation = await calculateWithdrawalFee(amount, currency, isDoubled);

  // Check if net amount is positive
  if (calculation.netAmount <= 0) {
    return {
      valid: false,
      error: `Withdrawal amount (${amount} ${currency}) is insufficient to cover withdrawal fee (${calculation.feeAmount} ${currency})`
    };
  }

  // Minimum net amount requirements (in RWF)
  const minNetAmount = currency.toUpperCase() === 'USD' ? 1 : 100; // 1 USD or 100 RWF

  if (calculation.netAmount < minNetAmount) {
    return {
      valid: false,
      error: `Net amount after fees (${calculation.netAmount} ${currency}) is below minimum withdrawal amount (${minNetAmount} ${currency})`
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
