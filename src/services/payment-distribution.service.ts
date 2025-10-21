// services/payment-distribution.service.ts - Payment Distribution Checker & Handler

import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import config from '../config/config';

const prisma = new PrismaClient();

export class PaymentDistributionService {

  /**
   * Find all completed payments that haven't been distributed to wallets
   * This helps identify stuck transactions that need manual intervention
   */
  async findUndistributedPayments(): Promise<{
    propertyBookings: any[];
    tourBookings: any[];
    totalUndistributed: number;
    totalAmount: number;
  }> {
    try {
      logger.info('Checking for undistributed payments', 'PaymentDistributionService');

      // Find property bookings with completed payments but no wallet distribution
      const propertyBookings = await prisma.booking.findMany({
        where: {
          paymentStatus: 'completed',
          status: 'confirmed',
          walletDistributed: false,
          // Only check bookings created in the last 30 days to avoid old data
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          }
        },
        include: {
          property: {
            include: {
              host: {
                select: { id: true, email: true, firstName: true, lastName: true }
              },
              agent: {
                select: { id: true, email: true, firstName: true, lastName: true }
              }
            }
          },
          guest: {
            select: { id: true, email: true, firstName: true, lastName: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      // Find tour bookings with completed payments but no wallet distribution
      const tourBookings = await prisma.tourBooking.findMany({
        where: {
          paymentStatus: 'completed',
          status: 'confirmed',
          walletDistributed: false,
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          }
        },
        include: {
          tour: {
            include: {
              tourGuide: {
                select: { id: true, email: true, firstName: true, lastName: true }
              }
            }
          },
          user: {
            select: { id: true, email: true, firstName: true, lastName: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      const totalAmount =
        propertyBookings.reduce((sum, b) => sum + b.totalPrice, 0) +
        tourBookings.reduce((sum, b) => sum + b.totalAmount, 0);

      const result = {
        propertyBookings,
        tourBookings,
        totalUndistributed: propertyBookings.length + tourBookings.length,
        totalAmount
      };

      if (result.totalUndistributed > 0) {
        logger.warn('Found undistributed payments', 'PaymentDistributionService', {
          propertyBookings: propertyBookings.length,
          tourBookings: tourBookings.length,
          totalAmount
        });
      } else {
        logger.info('No undistributed payments found', 'PaymentDistributionService');
      }

      return result;

    } catch (error: any) {
      logger.error('Error finding undistributed payments', 'PaymentDistributionService', error);
      throw error;
    }
  }

  /**
   * Manually distribute wallet balances for a specific property booking
   * Used when automatic distribution failed or for manual reconciliation
   */
  async distributePropertyBookingWallets(bookingId: string): Promise<{
    success: boolean;
    message: string;
    distribution?: any;
  }> {
    try {
      logger.info('Manually distributing wallet for property booking', 'PaymentDistributionService', { bookingId });

      // Fetch booking with all relationships
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        include: {
          property: {
            include: {
              host: true,
              agent: true
            }
          },
          guest: true
        }
      });

      if (!booking) {
        return {
          success: false,
          message: `Booking not found: ${bookingId}`
        };
      }

      // Validate booking is completed
      if (booking.paymentStatus !== 'completed') {
        return {
          success: false,
          message: `Booking payment is not completed. Status: ${booking.paymentStatus}`
        };
      }

      // Check if already distributed
      if (booking.walletDistributed) {
        return {
          success: false,
          message: `Wallet already distributed on ${booking.walletDistributedAt?.toISOString()}`
        };
      }

      // Calculate split amounts
      const hasAgent = booking.property.agent !== null;
      const splitRules = this.calculateSplitRules(hasAgent);
      const splitAmounts = this.calculateSplitAmounts(booking.totalPrice, splitRules);

      logger.info('Calculated split amounts', 'PaymentDistributionService', {
        bookingId,
        totalPrice: booking.totalPrice,
        splitAmounts
      });

      // Update wallets
      const updates: any[] = [];

      // Host wallet
      if (booking.property.host) {
        const hostUpdate = await this.updateWalletBalance(
          booking.property.host.id,
          splitAmounts.host,
          'PAYMENT_RECEIVED',
          booking.transactionId || `MANUAL-${bookingId}`
        );
        updates.push({ user: 'host', ...hostUpdate });
      }

      // Agent wallet (if exists)
      if (booking.property.agent && splitAmounts.agent > 0) {
        const agentUpdate = await this.updateWalletBalance(
          booking.property.agent.id,
          splitAmounts.agent,
          'COMMISSION_EARNED',
          booking.transactionId || `MANUAL-${bookingId}`
        );
        updates.push({ user: 'agent', ...agentUpdate });
      }

      // Platform wallet
      if (splitAmounts.platform > 0) {
        const platformUpdate = await this.updateWalletBalance(
          1, // Platform account
          splitAmounts.platform,
          'PLATFORM_FEE',
          booking.transactionId || `MANUAL-${bookingId}`
        );
        updates.push({ user: 'platform', ...platformUpdate });
      }

      // Mark booking as distributed
      await prisma.booking.update({
        where: { id: bookingId },
        data: {
          walletDistributed: true,
          walletDistributedAt: new Date(),
          distributionAttempts: booking.distributionAttempts + 1,
          distributionError: null
        }
      });

      logger.info('Wallet distribution completed successfully', 'PaymentDistributionService', {
        bookingId,
        updates
      });

      return {
        success: true,
        message: 'Wallet distribution completed successfully',
        distribution: {
          bookingId,
          totalPrice: booking.totalPrice,
          splitAmounts,
          updates
        }
      };

    } catch (error: any) {
      logger.error('Error distributing wallet for property booking', 'PaymentDistributionService', {
        bookingId,
        error: error.message
      });

      // Update booking with error
      await prisma.booking.update({
        where: { id: bookingId },
        data: {
          distributionAttempts: { increment: 1 },
          distributionError: error.message
        }
      }).catch(err => logger.error('Failed to update booking error', 'PaymentDistributionService', err));

      return {
        success: false,
        message: `Distribution failed: ${error.message}`
      };
    }
  }

  /**
   * Manually distribute wallet balances for a specific tour booking
   */
  async distributeTourBookingWallets(bookingId: string): Promise<{
    success: boolean;
    message: string;
    distribution?: any;
  }> {
    try {
      logger.info('Manually distributing wallet for tour booking', 'PaymentDistributionService', { bookingId });

      const booking = await prisma.tourBooking.findUnique({
        where: { id: bookingId },
        include: {
          tour: {
            include: {
              tourGuide: true
            }
          },
          user: true
        }
      });

      if (!booking) {
        return {
          success: false,
          message: `Tour booking not found: ${bookingId}`
        };
      }

      if (booking.paymentStatus !== 'completed') {
        return {
          success: false,
          message: `Tour booking payment is not completed. Status: ${booking.paymentStatus}`
        };
      }

      if (booking.walletDistributed) {
        return {
          success: false,
          message: `Wallet already distributed on ${booking.walletDistributedAt?.toISOString()}`
        };
      }

      // Calculate platform fee (14%)
      const platformFee = booking.totalAmount * 0.14;
      const guideEarning = booking.totalAmount - platformFee;

      logger.info('Calculated tour split amounts', 'PaymentDistributionService', {
        bookingId,
        totalAmount: booking.totalAmount,
        platformFee,
        guideEarning
      });

      const updates: any[] = [];

      // Tour guide wallet
      const guideUpdate = await this.updateWalletBalance(
        booking.tourGuideId,
        guideEarning,
        'TOUR_PAYMENT_RECEIVED',
        booking.paymentId || `MANUAL-TOUR-${bookingId}`
      );
      updates.push({ user: 'tourGuide', ...guideUpdate });

      // Platform wallet
      const platformUpdate = await this.updateWalletBalance(
        1,
        platformFee,
        'PLATFORM_FEE',
        booking.paymentId || `MANUAL-TOUR-${bookingId}`
      );
      updates.push({ user: 'platform', ...platformUpdate });

      // Mark booking as distributed
      await prisma.tourBooking.update({
        where: { id: bookingId },
        data: {
          walletDistributed: true,
          walletDistributedAt: new Date(),
          distributionAttempts: booking.distributionAttempts + 1,
          distributionError: null
        }
      });

      logger.info('Tour wallet distribution completed successfully', 'PaymentDistributionService', {
        bookingId,
        updates
      });

      return {
        success: true,
        message: 'Tour wallet distribution completed successfully',
        distribution: {
          bookingId,
          totalAmount: booking.totalAmount,
          platformFee,
          guideEarning,
          updates
        }
      };

    } catch (error: any) {
      logger.error('Error distributing wallet for tour booking', 'PaymentDistributionService', {
        bookingId,
        error: error.message
      });

      await prisma.tourBooking.update({
        where: { id: bookingId },
        data: {
          distributionAttempts: { increment: 1 },
          distributionError: error.message
        }
      }).catch(err => logger.error('Failed to update tour booking error', 'PaymentDistributionService', err));

      return {
        success: false,
        message: `Distribution failed: ${error.message}`
      };
    }
  }

  /**
   * Batch distribute all undistributed payments
   */
  async distributeAllUndistributed(): Promise<{
    success: boolean;
    message: string;
    stats: {
      propertyBookingsProcessed: number;
      propertyBookingsSuccess: number;
      propertyBookingsFailed: number;
      tourBookingsProcessed: number;
      tourBookingsSuccess: number;
      tourBookingsFailed: number;
    };
    details?: any[];
  }> {
    try {
      logger.info('Starting batch distribution of all undistributed payments', 'PaymentDistributionService');

      const undistributed = await this.findUndistributedPayments();
      const details: any[] = [];

      const stats = {
        propertyBookingsProcessed: 0,
        propertyBookingsSuccess: 0,
        propertyBookingsFailed: 0,
        tourBookingsProcessed: 0,
        tourBookingsSuccess: 0,
        tourBookingsFailed: 0
      };

      // Process property bookings
      for (const booking of undistributed.propertyBookings) {
        stats.propertyBookingsProcessed++;
        const result = await this.distributePropertyBookingWallets(booking.id);

        if (result.success) {
          stats.propertyBookingsSuccess++;
        } else {
          stats.propertyBookingsFailed++;
        }

        details.push({
          type: 'property',
          bookingId: booking.id,
          ...result
        });
      }

      // Process tour bookings
      for (const booking of undistributed.tourBookings) {
        stats.tourBookingsProcessed++;
        const result = await this.distributeTourBookingWallets(booking.id);

        if (result.success) {
          stats.tourBookingsSuccess++;
        } else {
          stats.tourBookingsFailed++;
        }

        details.push({
          type: 'tour',
          bookingId: booking.id,
          ...result
        });
      }

      logger.info('Batch distribution completed', 'PaymentDistributionService', stats);

      return {
        success: true,
        message: `Batch distribution completed. ${stats.propertyBookingsSuccess + stats.tourBookingsSuccess} successful, ${stats.propertyBookingsFailed + stats.tourBookingsFailed} failed`,
        stats,
        details
      };

    } catch (error: any) {
      logger.error('Error in batch distribution', 'PaymentDistributionService', error);
      throw error;
    }
  }

  // ==================== HELPER METHODS ====================

  /**
   * Calculate split rules based on whether property has an agent
   * Uses configuration from config.defaultSplitRules
   * - Platform: 16.67%
   * - Agent: 4.38% (if exists, otherwise goes to host)
   * - Host: 78.95% (or 83.33% if no agent)
   */
  private calculateSplitRules(hasAgent: boolean): { platform: number; agent: number; host: number } {
    const configRules = config.defaultSplitRules;

    if (hasAgent) {
      // With agent: Use configured splits
      return {
        platform: configRules.platform, // 16.67%
        agent: configRules.agent,       // 4.38%
        host: configRules.host          // 78.95%
      };
    } else {
      // Without agent: Platform stays same, agent portion goes to host
      return {
        platform: configRules.platform,              // 16.67%
        agent: 0,                                    // 0%
        host: configRules.host + configRules.agent  // 78.95% + 4.38% = 83.33%
      };
    }
  }

  private calculateSplitAmounts(amount: number, rules: { platform: number; agent: number; host: number }) {
    return {
      platform: Math.round((amount * rules.platform / 100) * 100) / 100,
      agent: Math.round((amount * rules.agent / 100) * 100) / 100,
      host: Math.round((amount * rules.host / 100) * 100) / 100
    };
  }

  private async updateWalletBalance(
    userId: number,
    amount: number,
    type: string,
    reference: string
  ): Promise<{ userId: number; amount: number; previousBalance: number; newBalance: number }> {
    // Get or create wallet for user
    let wallet = await prisma.wallet.findUnique({
      where: { userId }
    });

    if (!wallet) {
      wallet = await prisma.wallet.create({
        data: {
          userId,
          balance: 0,
          currency: 'USD',
          isActive: true
        }
      });
    }

    const previousBalance = wallet.balance;
    const newBalance = wallet.balance + amount;

    // Update wallet balance
    await prisma.wallet.update({
      where: { userId },
      data: { balance: newBalance }
    });

    // Create wallet transaction record
    await prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: amount > 0 ? 'credit' : 'debit',
        amount: Math.abs(amount),
        balanceBefore: previousBalance,
        balanceAfter: newBalance,
        reference,
        description: `${type} - ${reference}`
      }
    });

    logger.info('Wallet updated', 'PaymentDistributionService', {
      userId,
      amount,
      previousBalance,
      newBalance
    });

    return {
      userId,
      amount,
      previousBalance,
      newBalance
    };
  }
}

// Export singleton instance
export const paymentDistributionService = new PaymentDistributionService();
