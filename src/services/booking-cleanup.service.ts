// ============================================================================
// src/services/booking-cleanup.service.ts
// Automatic cleanup of expired pending bookings and their blocked dates
// ============================================================================

import { PrismaClient } from '@prisma/client';
import { BrevoBookingMailingService } from '../utils/brevo.booking';

const prisma = new PrismaClient();

export class BookingCleanupService {
  private emailService = new BrevoBookingMailingService();
  /**
   * Process expired pending bookings and remove them along with their blocked dates
   */
  async processExpiredBookings(): Promise<{
    propertyBookingsRemoved: number;
    tourBookingsRemoved: number;
    blockedDatesRemoved: number;
    propertyBookingsArchived: number;
    tourBookingsArchived: number;
    adminsNotified: number;
    errors: string[];
  }> {
    const results = {
      propertyBookingsRemoved: 0,
      tourBookingsRemoved: 0,
      blockedDatesRemoved: 0,
      propertyBookingsArchived: 0,
      tourBookingsArchived: 0,
      adminsNotified: 0,
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
      results.propertyBookingsArchived = propertyBookingsResult.archived;
      results.errors.push(...propertyBookingsResult.errors);

      // Clean up tour bookings
      const tourBookingsResult = await this.cleanupTourBookings(cutoffDate);
      results.tourBookingsRemoved = tourBookingsResult.removed;
      results.tourBookingsArchived = tourBookingsResult.archived;
      results.errors.push(...tourBookingsResult.errors);

      // Send admin notification if there are archived bookings
      const totalArchived = results.propertyBookingsArchived + results.tourBookingsArchived;
      if (totalArchived > 0) {
        try {
          await this.notifyAdminsOfExpiredBookings(results);
          results.adminsNotified = 1;
        } catch (emailError: any) {
          results.errors.push(`Admin notification failed: ${emailError.message}`);
          console.error('❌ Failed to notify admins:', emailError);
        }
      }

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
    archived: number;
    blockedDatesRemoved: number;
    errors: string[];
  }> {
    const result = {
      removed: 0,
      archived: 0,
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
        include: {
          property: {
            select: {
              name: true,
              location: true
            }
          },
          guest: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
              phone: true
            }
          }
        }
      });

      console.log(`📋 Found ${expiredBookings.length} expired property bookings to remove`);

      for (const booking of expiredBookings) {
        try {
          // Archive the booking first
          await prisma.bookingArchive.create({
            data: {
              originalBookingId: booking.id,
              propertyId: booking.propertyId,
              propertyName: booking.property.name,
              propertyLocation: booking.property.location,
              guestId: booking.guestId,
              guestName: `${booking.guest.firstName} ${booking.guest.lastName}`,
              guestEmail: booking.guest.email,
              guestPhone: booking.guest.phone,
              checkIn: booking.checkIn,
              checkOut: booking.checkOut,
              guests: booking.guests,
              totalPrice: booking.totalPrice,
              message: booking.message,
              specialRequests: booking.specialRequests,
              status: booking.status,
              paymentStatus: booking.paymentStatus,
              bookingCreatedAt: booking.createdAt,
              archiveReason: 'Expired - No payment received within 24 hours',
              leadStatus: 'new',
              metadata: {
                transactionId: booking.transactionId,
                paymentMethod: booking.paymentMethod,
                deletedAt: new Date().toISOString()
              } as any // Type assertion for JSON field
            }
          });

          result.archived++;

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

          console.log(`✅ Archived and removed expired booking ${booking.id} and ${blockedDatesDeleted.count} blocked date(s)`);

        } catch (error: any) {
          result.errors.push(`Failed to remove booking ${booking.id}: ${error.message}`);
          console.error(`❌ Error removing booking ${booking.id}:`, error);
        }
      }

      // Decrement total bookings count for affected properties (if needed)
      if (result.removed > 0) {
        console.log(`📊 Cleaned up ${result.removed} expired property bookings (${result.archived} archived) and ${result.blockedDatesRemoved} blocked dates`);
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
    archived: number;
    errors: string[];
  }> {
    const result = {
      removed: 0,
      archived: 0,
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
        include: {
          tour: {
            select: {
              title: true,
              locationCity: true,
              locationCountry: true
            }
          },
          schedule: {
            select: {
              startDate: true
            }
          },
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
              phone: true
            }
          }
        }
      });

      console.log(`📋 Found ${expiredBookings.length} expired tour bookings to remove`);

      for (const booking of expiredBookings) {
        try {
          // Archive the booking first
          await prisma.tourBookingArchive.create({
            data: {
              originalBookingId: booking.id,
              tourId: booking.tourId,
              tourTitle: booking.tour.title,
              tourLocation: `${booking.tour.locationCity}, ${booking.tour.locationCountry}`,
              userId: booking.userId,
              userName: `${booking.user.firstName} ${booking.user.lastName}`,
              userEmail: booking.user.email,
              userPhone: booking.user.phone,
              tourGuideId: booking.tourGuideId,
              scheduleId: booking.scheduleId,
              scheduleStartDate: booking.schedule.startDate,
              numberOfParticipants: booking.numberOfParticipants,
              participants: booking.participants as any, // Type assertion for JSON field
              totalAmount: booking.totalAmount,
              currency: booking.currency,
              specialRequests: booking.specialRequests,
              status: booking.status,
              paymentStatus: booking.paymentStatus,
              bookingCreatedAt: booking.createdAt,
              archiveReason: 'Expired - No payment received within 24 hours',
              leadStatus: 'new',
              metadata: {
                paymentId: booking.paymentId,
                checkInStatus: booking.checkInStatus,
                deletedAt: new Date().toISOString()
              } as any // Type assertion for JSON field
            }
          });

          result.archived++;

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

          console.log(`✅ Archived and removed expired tour booking ${booking.id} and freed ${booking.numberOfParticipants} slot(s)`);

        } catch (error: any) {
          result.errors.push(`Failed to remove tour booking ${booking.id}: ${error.message}`);
          console.error(`❌ Error removing tour booking ${booking.id}:`, error);
        }
      }

      if (result.removed > 0) {
        console.log(`📊 Cleaned up ${result.removed} expired tour bookings (${result.archived} archived)`);
      }

    } catch (error: any) {
      result.errors.push(`Tour bookings cleanup error: ${error.message}`);
      console.error('❌ Error during tour bookings cleanup:', error);
    }

    return result;
  }

  /**
   * Send notification to admins about expired bookings
   */
  private async notifyAdminsOfExpiredBookings(results: {
    propertyBookingsArchived: number;
    tourBookingsArchived: number;
    propertyBookingsRemoved: number;
    tourBookingsRemoved: number;
  }): Promise<void> {
    // Get all admin users
    const admins = await prisma.user.findMany({
      where: {
        userType: 'admin'
      },
      select: {
        email: true,
        firstName: true,
        lastName: true
      }
    });

    if (admins.length === 0) {
      console.log('⚠️ No admin users found to notify');
      return;
    }

    const totalArchived = results.propertyBookingsArchived + results.tourBookingsArchived;
    const totalRemoved = results.propertyBookingsRemoved + results.tourBookingsRemoved;

    // Send email to each admin
    for (const admin of admins) {
      try {
        await this.emailService.sendExpiredBookingsNotification({
          adminEmail: admin.email,
          adminName: `${admin.firstName} ${admin.lastName}`,
          propertyBookingsArchived: results.propertyBookingsArchived,
          tourBookingsArchived: results.tourBookingsArchived,
          totalArchived,
          totalRemoved,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error(`Failed to send notification to ${admin.email}:`, error);
      }
    }

    // Mark archived bookings as admin notified
    const now = new Date();
    await Promise.all([
      prisma.bookingArchive.updateMany({
        where: {
          adminNotified: false,
          archivedAt: { gte: new Date(Date.now() - 60000) } // Last minute
        },
        data: {
          adminNotified: true,
          adminNotifiedAt: now
        }
      }),
      prisma.tourBookingArchive.updateMany({
        where: {
          adminNotified: false,
          archivedAt: { gte: new Date(Date.now() - 60000) } // Last minute
        },
        data: {
          adminNotified: true,
          adminNotifiedAt: now
        }
      })
    ]);

    console.log(`📧 Notified ${admins.length} admin(s) about ${totalArchived} expired bookings`);
  }

  /**
   * Manually trigger cleanup (for testing or admin purposes)
   */
  async manualCleanup(): Promise<{
    propertyBookingsRemoved: number;
    tourBookingsRemoved: number;
    blockedDatesRemoved: number;
    propertyBookingsArchived: number;
    tourBookingsArchived: number;
    adminsNotified: number;
    errors: string[];
  }> {
    console.log('🔧 Manual cleanup triggered');
    return await this.processExpiredBookings();
  }
}
