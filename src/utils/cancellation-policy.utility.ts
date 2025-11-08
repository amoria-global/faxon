/**
 * Cancellation Policy Utility
 *
 * POLICY:
 * - Free cancellation if cancelled >24 hours before check-in
 * - 0% refund (no refund) if cancelled within 24 hours of check-in
 * - All refunds require admin approval
 * - Refunds are credited to user wallet pending balance
 * - Refunds processed via Xentripay
 */

export interface CancellationCalculation {
  canCancel: boolean;
  isFreeCancel: boolean;
  hoursUntilCheckIn: number;
  originalAmount: number;
  platformFee: number;
  refundAmount: number;
  refundPercentage: number;
  currency: string;
  reason?: string;
}

/**
 * Calculate cancellation fees and refund amount
 * @param checkInDate - Booking check-in date
 * @param totalAmount - Total booking amount paid
 * @param currency - Currency of the booking
 * @returns CancellationCalculation with fee details
 */
export function calculateCancellationRefund(
  checkInDate: Date,
  totalAmount: number,
  currency: string = 'USD'
): CancellationCalculation {
  const now = new Date();
  const checkIn = new Date(checkInDate);

  // Calculate hours until check-in
  const millisecondsUntilCheckIn = checkIn.getTime() - now.getTime();
  const hoursUntilCheckIn = millisecondsUntilCheckIn / (1000 * 60 * 60);

  // Check if check-in has already passed
  if (hoursUntilCheckIn < 0) {
    return {
      canCancel: false,
      isFreeCancel: false,
      hoursUntilCheckIn,
      originalAmount: totalAmount,
      platformFee: 0,
      refundAmount: 0,
      refundPercentage: 0,
      currency,
      reason: 'Cannot cancel after check-in date has passed'
    };
  }

  // Free cancellation if >24 hours before check-in
  const isFreeCancel = hoursUntilCheckIn > 24;

  let platformFee = 0;
  let refundAmount = totalAmount;

  if (!isFreeCancel) {
    // 0% refund for cancellations within 24 hours
    platformFee = totalAmount; // Full amount kept as fee
    refundAmount = 0;
  }

  const refundPercentage = (refundAmount / totalAmount) * 100;

  return {
    canCancel: true,
    isFreeCancel,
    hoursUntilCheckIn,
    originalAmount: totalAmount,
    platformFee,
    refundAmount,
    refundPercentage,
    currency
  };
}

/**
 * Format cancellation calculation for display
 */
export function formatCancellationDetails(calculation: CancellationCalculation): string {
  if (!calculation.canCancel) {
    return calculation.reason || 'Cancellation not allowed';
  }

  if (calculation.isFreeCancel) {
    return `Free cancellation - Full refund of ${calculation.refundAmount} ${calculation.currency} (${calculation.hoursUntilCheckIn.toFixed(1)} hours until check-in)`;
  }

  return `Late cancellation (within 24 hours) - No refund available. Full amount (${calculation.platformFee} ${calculation.currency}) retained as cancellation fee`;
}

export default {
  calculateCancellationRefund,
  formatCancellationDetails
};
