// ============================================================================
// src/services/booking-cleanup-scheduler.service.ts
// Scheduler for automatic cleanup of expired pending bookings
// ============================================================================

import { BookingCleanupService } from './booking-cleanup.service';

export class BookingCleanupSchedulerService {
  private cleanupService: BookingCleanupService;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private checkIntervalMs: number;

  constructor(checkIntervalHours: number = 6) {
    this.cleanupService = new BookingCleanupService();
    this.checkIntervalMs = checkIntervalHours * 60 * 60 * 1000; // Convert hours to milliseconds
  }

  /**
   * Start the booking cleanup scheduler
   */
  start(): void {
    if (this.isRunning) {
      console.log('⏸️  Booking cleanup scheduler already running');
      return;
    }

    console.log(`🚀 Starting Booking Cleanup Scheduler (checking every ${this.checkIntervalMs / (60 * 60 * 1000)} hours)`);

    this.isRunning = true;

    // Run immediately on start
    this.runCleanup();

    // Then run on interval
    this.intervalId = setInterval(() => {
      this.runCleanup();
    }, this.checkIntervalMs);

    console.log('✅ Booking Cleanup Scheduler started successfully');
  }

  /**
   * Stop the booking cleanup scheduler
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('🛑 Booking Cleanup Scheduler stopped');
  }

  /**
   * Run a single cleanup cycle
   */
  private async runCleanup(): Promise<void> {
    try {
      console.log('🧹 Running booking cleanup cycle...');
      const results = await this.cleanupService.processExpiredBookings();

      const totalRemoved = results.propertyBookingsRemoved + results.tourBookingsRemoved;

      if (totalRemoved > 0 || results.errors.length > 0) {
        console.log('📊 Cleanup Results:', {
          propertyBookingsRemoved: results.propertyBookingsRemoved,
          tourBookingsRemoved: results.tourBookingsRemoved,
          blockedDatesRemoved: results.blockedDatesRemoved,
          totalRemoved,
          errors: results.errors.length
        });
      } else {
        console.log('✨ No expired bookings found');
      }

      if (results.errors.length > 0) {
        console.error('⚠️  Errors during cleanup:', results.errors);
      }
    } catch (error: any) {
      console.error('❌ Error in cleanup cycle:', error);
    }
  }

  /**
   * Get scheduler status
   */
  getStatus(): { isRunning: boolean; intervalMs: number; intervalHours: number } {
    return {
      isRunning: this.isRunning,
      intervalMs: this.checkIntervalMs,
      intervalHours: this.checkIntervalMs / (60 * 60 * 1000)
    };
  }

  /**
   * Manually trigger cleanup
   */
  async triggerManualCleanup(): Promise<void> {
    await this.runCleanup();
  }
}
