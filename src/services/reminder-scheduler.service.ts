
// ============================================================================
// src/services/reminder-scheduler.service.ts
// ============================================================================
import { KYCReminderService } from './kyc-reminder.service';

export class ReminderSchedulerService {
  private kycReminderService: KYCReminderService;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private checkIntervalMs: number;

  constructor(checkIntervalMinutes: number = 2) {
    this.kycReminderService = new KYCReminderService();
    this.checkIntervalMs = checkIntervalMinutes * 60 * 1000;
  }

  /**
   * Start the reminder scheduler
   */
  start(): void {
    if (this.isRunning) {
      console.log('⏸️  Reminder scheduler already running');
      return;
    }

    console.log(`🚀 Starting KYC Reminder Scheduler (checking every ${this.checkIntervalMs / 60000} minutes)`);
    
    this.isRunning = true;

    // Run immediately on start
    this.runCheck();

    // Then run on interval
    this.intervalId = setInterval(() => {
      this.runCheck();
    }, this.checkIntervalMs);

    console.log('✅ KYC Reminder Scheduler started successfully');
  }

  /**
   * Stop the reminder scheduler
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('🛑 KYC Reminder Scheduler stopped');
  }

  /**
   * Run a single check cycle
   */
  private async runCheck(): Promise<void> {
    try {
      const results = await this.kycReminderService.processReminders();
      
      if (results.kycReminders > 0 || results.passwordReminders > 0 || results.deactivations > 0) {
        console.log('📊 Reminder Check Results:', {
          kycReminders: results.kycReminders,
          passwordReminders: results.passwordReminders,
          deactivations: results.deactivations,
          errors: results.errors.length
        });
      }

      if (results.errors.length > 0) {
        console.error('⚠️  Errors during reminder check:', results.errors);
      }
    } catch (error: any) {
      console.error('❌ Error in reminder check cycle:', error);
    }
  }

  /**
   * Get scheduler status
   */
  getStatus(): { isRunning: boolean; intervalMs: number; intervalMinutes: number } {
    return {
      isRunning: this.isRunning,
      intervalMs: this.checkIntervalMs,
      intervalMinutes: this.checkIntervalMs / 60000
    };
  }
}