// ============================================================================
// src/services/booking-cleanup.service.ts
// Automatic cleanup of expired pending bookings and their blocked dates
// ============================================================================

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class BookingCleanupService {
  /**
   * Process expired pending bookings and remove them along with their blocked dates
   */
  async processExpiredBookings(): Promise<{
    propertyBookingsRemoved: number;
    tourBookingsRemoved: number;
    blockedDatesRemoved: number;
    errors: string[];
  }> {
    const results = {
      propertyBookingsRemoved: 0,
      tourBookingsRemoved: 0,
      blockedDatesRemoved: 0,
      errors: [] as string[]
    };

    try {
      // Calculate cutoff time (24 hours ago)
      const cutoffDate = new Date();
      cutoffDate.setHours(cutoffDate.getHours() - 24);

      console.log(`🧹 Checking for expired bookings created before ${cutoffDate.toISOString()}`);

      // Clean up property bookings
      const propertyBookingsResult = await this.cleanupPropertyBookings(cutoffDate);
      results.propertyBookingsRemoved = propertyBookingsResult.removed;
      results.blockedDatesRemoved = propertyBookingsResult.blockedDatesRemoved;
      results.errors.push(...propertyBookingsResult.errors);

      // Clean up tour bookings
      const tourBookingsResult = await this.cleanupTourBookings(cutoffDate);
      results.tourBookingsRemoved = tourBookingsResult.removed;
      results.errors.push(...tourBookingsResult.errors);

    } catch (error: any) {
      results.errors.push(`General cleanup error: ${error.message}`);
      console.error('❌ Error during booking cleanup:', error);
    }

    return results;
  }

  /**
   * Clean up expired property bookings
   */
  private async cleanupPropertyBookings(cutoffDate: Date): Promise<{
    removed: number;
    blockedDatesRemoved: number;
    errors: string[];
  }> {
    const result = {
      removed: 0,
      blockedDatesRemoved: 0,
      errors: [] as string[]
    };

    try {
      // Find all pending bookings created more than 24 hours ago with pending payment
      const expiredBookings = await prisma.booking.findMany({
        where: {
          createdAt: { lt: cutoffDate },
          status: 'pending',
          paymentStatus: 'pending'
        },
        select: {
          id: true,
          propertyId: true,
          checkIn: true,
          checkOut: true,
          totalPrice: true,
          guestId: true
        }
      });

      console.log(`📋 Found ${expiredBookings.length} expired property bookings to remove`);

      for (const booking of expiredBookings) {
        try {
          // Remove blocked dates for this booking
          const blockedDatesDeleted = await prisma.blockedDate.deleteMany({
            where: {
              reason: { contains: `Booking ID: ${booking.id}` },
              isActive: true
            }
          });

          result.blockedDatesRemoved += blockedDatesDeleted.count;

          // Delete the booking
          await prisma.booking.delete({
            where: { id: booking.id }
          });

          result.removed++;

          console.log(`✅ Removed expired booking ${booking.id} and ${blockedDatesDeleted.count} blocked date(s)`);

        } catch (error: any) {
          result.errors.push(`Failed to remove booking ${booking.id}: ${error.message}`);
          console.error(`❌ Error removing booking ${booking.id}:`, error);
        }
      }

      // Decrement total bookings count for affected properties (if needed)
      if (result.removed > 0) {
        console.log(`📊 Cleaned up ${result.removed} expired property bookings and ${result.blockedDatesRemoved} blocked dates`);
      }

    } catch (error: any) {
      result.errors.push(`Property bookings cleanup error: ${error.message}`);
      console.error('❌ Error during property bookings cleanup:', error);
    }

    return result;
  }

  /**
   * Clean up expired tour bookings
   */
  private async cleanupTourBookings(cutoffDate: Date): Promise<{
    removed: number;
    errors: string[];
  }> {
    const result = {
      removed: 0,
      errors: [] as string[]
    };

    try {
      // Find all pending tour bookings created more than 24 hours ago with pending payment
      const expiredBookings = await prisma.tourBooking.findMany({
        where: {
          createdAt: { lt: cutoffDate },
          status: 'pending',
          paymentStatus: 'pending'
        },
        select: {
          id: true,
          tourId: true,
          scheduleId: true,
          numberOfParticipants: true
        }
      });

      console.log(`📋 Found ${expiredBookings.length} expired tour bookings to remove`);

      for (const booking of expiredBookings) {
        try {
          // Decrement the booked slots in the tour schedule
          await prisma.tourSchedule.update({
            where: { id: booking.scheduleId },
            data: {
              bookedSlots: { decrement: booking.numberOfParticipants }
            }
          });

          // Delete the booking
          await prisma.tourBooking.delete({
            where: { id: booking.id }
          });

          result.removed++;

          console.log(`✅ Removed expired tour booking ${booking.id} and freed ${booking.numberOfParticipants} slot(s)`);

        } catch (error: any) {
          result.errors.push(`Failed to remove tour booking ${booking.id}: ${error.message}`);
          console.error(`❌ Error removing tour booking ${booking.id}:`, error);
        }
      }

      if (result.removed > 0) {
        console.log(`📊 Cleaned up ${result.removed} expired tour bookings`);
      }

    } catch (error: any) {
      result.errors.push(`Tour bookings cleanup error: ${error.message}`);
      console.error('❌ Error during tour bookings cleanup:', error);
    }

    return result;
  }

  /**
   * Manually trigger cleanup (for testing or admin purposes)
   */
  async manualCleanup(): Promise<{
    propertyBookingsRemoved: number;
    tourBookingsRemoved: number;
    blockedDatesRemoved: number;
    errors: string[];
  }> {
    console.log('🔧 Manual cleanup triggered');
    return await this.processExpiredBookings();
  }
}
