// src/utils/price-reduction.utility.ts

/**
 * Utility for applying 14% tax reduction for host, agent, and tourguide roles
 */

const TAX_REDUCTION_PERCENTAGE = 0.14; // 14%
const ELIGIBLE_ROLES = ['host', 'agent', 'tourguide'];

export interface PriceReductionContext {
  userType?: string;
  amount: number;
  excludeReduction?: boolean; // For features like unlock that should not have reduction
}

export interface PriceReductionResult {
  originalAmount: number;
  reducedAmount: number;
  reductionAmount: number;
  reductionApplied: boolean;
  userType: string | undefined;
}

/**
 * Check if a user type is eligible for price reduction
 */
export function isEligibleForPriceReduction(userType?: string): boolean {
  if (!userType) return false;
  return ELIGIBLE_ROLES.includes(userType.toLowerCase());
}

/**
 * Calculate reduced price for eligible user types
 */
export function applyPriceReduction(context: PriceReductionContext): PriceReductionResult {
  const { userType, amount, excludeReduction = false } = context;

  // If reduction is explicitly excluded or user is not eligible
  if (excludeReduction || !isEligibleForPriceReduction(userType)) {
    return {
      originalAmount: amount,
      reducedAmount: amount,
      reductionAmount: 0,
      reductionApplied: false,
      userType
    };
  }

  // Calculate 14% reduction
  const reductionAmount = amount * TAX_REDUCTION_PERCENTAGE;
  const reducedAmount = amount - reductionAmount;

  return {
    originalAmount: amount,
    reducedAmount: Math.round(reducedAmount * 100) / 100, // Round to 2 decimals
    reductionAmount: Math.round(reductionAmount * 100) / 100, // Round to 2 decimals
    reductionApplied: true,
    userType
  };
}

/**
 * Apply price reduction to booking data
 */
export function applyBookingPriceReduction(
  booking: any,
  userType?: string,
  excludeReduction: boolean = false
): any {
  if (!booking) return booking;

  const result = applyPriceReduction({
    userType,
    amount: booking.totalPrice || booking.totalAmount || 0,
    excludeReduction
  });

  // Create a copy with reduced prices
  const modifiedBooking = { ...booking };

  if (modifiedBooking.totalPrice !== undefined) {
    modifiedBooking.totalPrice = result.reducedAmount;
    modifiedBooking.originalPrice = result.originalAmount;
    modifiedBooking.priceReduction = result.reductionAmount;
  }

  if (modifiedBooking.totalAmount !== undefined) {
    modifiedBooking.totalAmount = result.reducedAmount;
    modifiedBooking.originalAmount = result.originalAmount;
    modifiedBooking.amountReduction = result.reductionAmount;
  }

  modifiedBooking.taxReductionApplied = result.reductionApplied;

  return modifiedBooking;
}

/**
 * Apply price reduction to an array of bookings
 */
export function applyBookingsPriceReduction(
  bookings: any[],
  userType?: string,
  excludeReduction: boolean = false
): any[] {
  if (!Array.isArray(bookings)) return bookings;

  return bookings.map(booking =>
    applyBookingPriceReduction(booking, userType, excludeReduction)
  );
}

/**
 * Apply price reduction to payment details
 */
export function applyPaymentPriceReduction(
  payment: any,
  userType?: string,
  excludeReduction: boolean = false
): any {
  if (!payment) return payment;

  const result = applyPriceReduction({
    userType,
    amount: payment.amount || 0,
    excludeReduction
  });

  return {
    ...payment,
    amount: result.reducedAmount,
    originalAmount: result.originalAmount,
    reductionAmount: result.reductionAmount,
    taxReductionApplied: result.reductionApplied
  };
}

/**
 * Get reduction percentage as a formatted string
 */
export function getReductionPercentageString(): string {
  return `${TAX_REDUCTION_PERCENTAGE * 100}%`;
}

/**
 * Get eligible roles
 */
export function getEligibleRoles(): string[] {
  return [...ELIGIBLE_ROLES];
}
