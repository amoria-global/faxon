// src/services/kyc-reminder.service.ts
import { PrismaClient } from '@prisma/client';
import { BrevoMailingService } from '../utils/brevo.auth';

const prisma = new PrismaClient();

interface ReminderStage {
    stage: string;
    hoursAfterRegistration: number;
    emailType: 'kyc_incomplete' | 'kyc_warning' | 'password_setup' | 'account_deactivation';
}

interface ReminderLog {
    userId: number;
    stage: string;
    sentAt: Date;
    emailType: string;
}

export class KYCReminderService {
    private brevoService: BrevoMailingService;
    private isRunning: boolean = false;

    // Define reminder stages
    private readonly reminderStages: ReminderStage[] = [
        { stage: '2_hours', hoursAfterRegistration: 2, emailType: 'kyc_incomplete' },
        { stage: '8_hours', hoursAfterRegistration: 8, emailType: 'kyc_incomplete' },
        { stage: '24_hours', hoursAfterRegistration: 24, emailType: 'kyc_incomplete' },
        { stage: '3_days', hoursAfterRegistration: 72, emailType: 'kyc_incomplete' },
        { stage: '5_days', hoursAfterRegistration: 120, emailType: 'kyc_incomplete' },
        { stage: '7_days', hoursAfterRegistration: 168, emailType: 'kyc_warning' },
    ];

    // Account deactivation threshold (90 days)
    private readonly deactivationThresholdHours = 90 * 24; // 90 days

    constructor() {
        this.brevoService = new BrevoMailingService();
    }

    /**
     * Main processing method - runs every 2 minutes
     */
    async processReminders(): Promise<{
        kycReminders: number;
        passwordReminders: number;
        deactivations: number;
        errors: string[];
    }> {
        if (this.isRunning) {
            console.log('⏸️  KYC Reminder service already running, skipping...');
            return { kycReminders: 0, passwordReminders: 0, deactivations: 0, errors: [] };
        }

        this.isRunning = true;
        const startTime = Date.now();
        console.log(`🔄 Starting KYC Reminder Service at ${new Date().toISOString()}`);

        const results = {
            kycReminders: 0,
            passwordReminders: 0,
            deactivations: 0,
            errors: [] as string[]
        };

        try {
            // Process KYC reminders for service providers
            const kycResults = await this.processKYCReminders();
            results.kycReminders = kycResults.sent;
            results.errors.push(...kycResults.errors);

            // Process password setup reminders
            const passwordResults = await this.processPasswordSetupReminders();
            results.passwordReminders = passwordResults.sent;
            results.errors.push(...passwordResults.errors);

            // Process account deactivations (90+ days)
            const deactivationResults = await this.processAccountDeactivations();
            results.deactivations = deactivationResults.deactivated;
            results.errors.push(...deactivationResults.errors);

            const duration = Date.now() - startTime;
            console.log(`✅ KYC Reminder Service completed in ${duration}ms:`, {
                kycReminders: results.kycReminders,
                passwordReminders: results.passwordReminders,
                deactivations: results.deactivations,
                errorCount: results.errors.length
            });

        } catch (error: any) {
            console.error('❌ KYC Reminder Service error:', error);
            results.errors.push(`Fatal error: ${error.message}`);
        } finally {
            this.isRunning = false;
        }

        return results;
    }

    /**
     * Process KYC completion reminders
     */
    private async processKYCReminders(): Promise<{ sent: number; errors: string[] }> {
        const sent: number[] = [];
        const errors: string[] = [];

        try {
            // Get service providers without completed KYC
            const usersNeedingReminders = await prisma.user.findMany({
                where: {
                    userType: { in: ['host', 'agent', 'tourguide'] },
                    kycCompleted: false,
                    status: { notIn: ['suspended', 'inactive'] },
                    createdAt: {
                        lte: new Date(Date.now() - 2 * 60 * 60 * 1000) // At least 2 hours old
                    }
                },
                select: {
                    id: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                    userType: true,
                    createdAt: true,
                    hostNotes: true, // We'll use this to track sent reminders
                }
            });

            console.log(`📧 Found ${usersNeedingReminders.length} users needing KYC reminders`);

            for (const user of usersNeedingReminders) {
                try {
                    const hoursSinceRegistration = this.getHoursSince(user.createdAt);
                    const sentReminders = this.parseReminderLog(user.hostNotes);

                    // Find the appropriate reminder stage
                    const dueStage = this.findDueReminderStage(hoursSinceRegistration, sentReminders);

                    if (dueStage) {
                        await this.sendKYCReminder(user, dueStage);
                        await this.logReminderSent(user.id, dueStage.stage, dueStage.emailType);
                        sent.push(user.id);

                        console.log(`✉️  Sent ${dueStage.stage} KYC reminder to ${user.email}`);
                    }
                } catch (error: any) {
                    errors.push(`User ${user.id}: ${error.message}`);
                    console.error(`❌ Error sending reminder to ${user.email}:`, error);
                }
            }
        } catch (error: any) {
            errors.push(`KYC processing error: ${error.message}`);
            console.error('❌ Error in processKYCReminders:', error);
        }

        return { sent: sent.length, errors };
    }

    /**
     * Process password setup reminders for service providers
     */
    private async processPasswordSetupReminders(): Promise<{ sent: number; errors: string[] }> {
        const sent: number[] = [];
        const errors: string[] = [];

        try {
            const usersNeedingPassword = await prisma.user.findMany({
                where: {
                    userType: { in: ['host', 'agent', 'tourguide'] },
                    password: null,
                    status: { notIn: ['suspended', 'inactive'] },
                    createdAt: {
                        lte: new Date(Date.now() - 2 * 60 * 60 * 1000) // At least 2 hours old
                    }
                },
                select: {
                    id: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                    userType: true,
                    createdAt: true,
                    hostNotes: true,
                }
            });

            console.log(`🔑 Found ${usersNeedingPassword.length} users needing password setup`);

            for (const user of usersNeedingPassword) {
                try {
                    const hoursSinceRegistration = this.getHoursSince(user.createdAt);
                    const sentReminders = this.parseReminderLog(user.hostNotes);

                    // Send reminders at similar intervals
                    const dueStage = this.findDueReminderStage(hoursSinceRegistration, sentReminders);

                    if (dueStage) {
                        await this.sendPasswordSetupReminder(user);
                        await this.logReminderSent(user.id, dueStage.stage, 'password_setup');
                        sent.push(user.id);

                        console.log(`🔑 Sent password setup reminder to ${user.email}`);
                    }
                } catch (error: any) {
                    errors.push(`User ${user.id}: ${error.message}`);
                    console.error(`❌ Error sending password reminder to ${user.email}:`, error);
                }
            }
        } catch (error: any) {
            errors.push(`Password setup error: ${error.message}`);
            console.error('❌ Error in processPasswordSetupReminders:', error);
        }

        return { sent: sent.length, errors };
    }

    /**
     * Process account deactivations for 90+ days without KYC
     */
    private async processAccountDeactivations(): Promise<{ deactivated: number; errors: string[] }> {
        const deactivated: number[] = [];
        const errors: string[] = [];

        try {
            const accountsToDeactivate = await prisma.user.findMany({
                where: {
                    userType: { in: ['host', 'agent', 'tourguide'] },
                    kycCompleted: false,
                    status: { notIn: ['suspended', 'inactive'] },
                    createdAt: {
                        lte: new Date(Date.now() - this.deactivationThresholdHours * 60 * 60 * 1000)
                    }
                },
                select: {
                    id: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                    userType: true,
                    createdAt: true,
                }
            });

            console.log(`⚠️  Found ${accountsToDeactivate.length} accounts to deactivate`);

            for (const user of accountsToDeactivate) {
                try {
                    // Deactivate account
                    await prisma.user.update({
                        where: { id: user.id },
                        data: {
                            status: 'inactive',
                            hostNotes: `Account deactivated on ${new Date().toISOString()} - KYC not completed within 90 days`
                        }
                    });

                    // Send deactivation email
                    await this.sendDeactivationEmail(user);
                    deactivated.push(user.id);

                    console.log(`🚫 Deactivated account: ${user.email}`);
                } catch (error: any) {
                    errors.push(`User ${user.id}: ${error.message}`);
                    console.error(`❌ Error deactivating ${user.email}:`, error);
                }
            }

            // Schedule permanent deletion after 90 days of inactivity
            await this.schedulePermanentDeletions();

        } catch (error: any) {
            errors.push(`Deactivation error: ${error.message}`);
            console.error('❌ Error in processAccountDeactivations:', error);
        }

        return { deactivated: deactivated.length, errors };
    }

    /**
     * Delete accounts that have been inactive for 90 days
     */
    private async schedulePermanentDeletions(): Promise<void> {
        try {
            const accountsToDelete = await prisma.user.findMany({
                where: {
                    status: 'inactive',
                    updatedAt: {
                        lte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) // 90 days since deactivation
                    }
                },
                select: { id: true, email: true }
            });

            if (accountsToDelete.length > 0) {
                console.log(`🗑️  Scheduling ${accountsToDelete.length} accounts for permanent deletion`);

                // In production, you might want to archive data first
                // For now, we'll just log it
                for (const user of accountsToDelete) {
                    console.log(`📋 Account ready for deletion: ${user.email} (ID: ${user.id})`);
                    // Uncomment to actually delete:
                    // await prisma.user.delete({ where: { id: user.id } });
                }
            }
        } catch (error: any) {
            console.error('❌ Error in schedulePermanentDeletions:', error);
        }
    }

    /**
     * Send KYC completion reminder email
     */
    private async sendKYCReminder(user: any, stage: ReminderStage): Promise<void> {
        const context = {
            user: {
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                id: user.id
            },
            company: {
                name: 'Jambolush',
                website: 'https://jambolush.com',
                supportEmail: 'support@jambolush.com',
                logo: 'https://jambolush.com/favicon.ico'
            }
        };

        const isWarning = stage.emailType === 'kyc_warning';
        const userTypeLabel = this.getUserTypeLabel(user.userType);
        const daysRemaining = Math.ceil((this.deactivationThresholdHours - this.getHoursSince(user.createdAt)) / 24);

        const emailData = {
            sender: { name: 'Jambolush', email: 'support@jambolush.com' },
            to: [{ email: user.email, name: `${user.firstName} ${user.lastName}` }],
            subject: isWarning
                ? `⚠️ Action Required: Complete Your ${userTypeLabel} KYC - ${daysRemaining} Days Remaining`
                : `Complete Your ${userTypeLabel} Profile - KYC Verification Required`,
            htmlContent: this.getKYCReminderTemplate(context, stage, userTypeLabel, daysRemaining),
            textContent: this.getKYCReminderTextTemplate(context, stage, userTypeLabel, daysRemaining)
        };

        await this.brevoService.sendTransactionalEmail(emailData);
    }

    /**
     * Send password setup reminder
     */
    private async sendPasswordSetupReminder(user: any): Promise<void> {
        const context = {
            user: {
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                id: user.id
            },
            company: {
                name: 'Jambolush',
                website: 'https://jambolush.com',
                supportEmail: 'support@jambolush.com',
                logo: 'https://jambolush.com/favicon.ico'
            }
        };

        const userTypeLabel = this.getUserTypeLabel(user.userType);

        const emailData = {
            sender: { name: 'Jambolush', email: 'support@jambolush.com' },
            to: [{ email: user.email, name: `${user.firstName} ${user.lastName}` }],
            subject: `Set Up Your Password - Complete Your ${userTypeLabel} Account`,
            htmlContent: this.getPasswordSetupTemplate(context, userTypeLabel),
            textContent: this.getPasswordSetupTextTemplate(context, userTypeLabel)
        };

        await this.brevoService.sendTransactionalEmail(emailData);
    }

    /**
     * Send account deactivation email
     */
    private async sendDeactivationEmail(user: any): Promise<void> {
        const context = {
            user: {
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                id: user.id
            },
            company: {
                name: 'Jambolush',
                website: 'https://jambolush.com',
                supportEmail: 'support@jambolush.com',
                logo: 'https://jambolush.com/favicon.ico'
            }
        };

        const userTypeLabel = this.getUserTypeLabel(user.userType);

        const emailData = {
            sender: { name: 'Jambolush', email: 'support@jambolush.com' },
            to: [{ email: user.email, name: `${user.firstName} ${user.lastName}` }],
            subject: `Account Deactivated - ${userTypeLabel} KYC Not Completed`,
            htmlContent: this.getDeactivationTemplate(context, userTypeLabel),
            textContent: this.getDeactivationTextTemplate(context, userTypeLabel)
        };

        await this.brevoService.sendTransactionalEmail(emailData);
    }

    /**
     * Calculate hours since a date
     */
    private getHoursSince(date: Date): number {
        return (Date.now() - date.getTime()) / (1000 * 60 * 60);
    }

    /**
     * Parse reminder log from hostNotes field
     */
    private parseReminderLog(hostNotes: string | null): Set<string> {
        if (!hostNotes) return new Set();

        const reminderMatch = hostNotes.match(/REMINDERS_SENT:\[(.*?)\]/);
        if (!reminderMatch) return new Set();

        return new Set(reminderMatch[1].split(',').filter(s => s.trim()));
    }

    /**
     * Find which reminder stage is due
     */
    private findDueReminderStage(hoursSinceRegistration: number, sentReminders: Set<string>): ReminderStage | null {
        for (const stage of this.reminderStages) {
            if (hoursSinceRegistration >= stage.hoursAfterRegistration && !sentReminders.has(stage.stage)) {
                return stage;
            }
        }
        return null;
    }

    /**
     * Log that a reminder was sent
     */
    private async logReminderSent(userId: number, stage: string, emailType: string): Promise<void> {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { hostNotes: true }
        });

        const sentReminders = this.parseReminderLog(user?.hostNotes || null);
        sentReminders.add(stage);

        const newNotes = `REMINDERS_SENT:[${Array.from(sentReminders).join(',')}] Last: ${new Date().toISOString()}`;

        await prisma.user.update({
            where: { id: userId },
            data: { hostNotes: newNotes }
        });
    }

    /**
     * Get user type label for display
     */
    private getUserTypeLabel(userType: string): string {
        const labels: Record<string, string> = {
            host: 'Property Host',
            agent: 'Real Estate Agent',
            tourguide: 'Tour Guide'
        };
        return labels[userType] || userType;
    }

    /**
     * Get activity text for user type
     */
    private getActivityText(userType: string): string {
        const activities: Record<string, string> = {
            'Property Host': 'listing properties and earning income',
            'Real Estate Agent': 'managing clients and closing deals',
            'Tour Guide': 'offering tours and connecting with guests'
        };
        return activities[userType] || 'using the platform';
    }

    /**
     * Get base template styles (reuse from brevo.auth.ts)
     */
    private getBaseTemplate(): string {
        return `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        
        * { 
          margin: 0; 
          padding: 0; 
          box-sizing: border-box; 
        }
        
        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          line-height: 1.6;
          color: #374151;
          background: linear-gradient(135deg, #f0fdfa 0%, #cffafe 50%, #e0f2fe 100%);
          min-height: 100vh;
          padding: 20px;
        }
        
        .email-wrapper {
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        
        /* Main card container */
        .email-container {
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(8px);
          border-radius: 24px;
          box-shadow: 0 25px 50px rgba(0, 0, 0, 0.15);
          border: 1px solid rgba(20, 184, 166, 0.2);
          overflow: hidden;
          transition: all 0.5s ease;
        }
        
        /* Header */
        .header {
          background: linear-gradient(135deg, #083A85 0%, #0a4499 100%);
          padding: 40px 30px;
          text-align: center;
          color: white;
          position: relative;
        }
        
        .header::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, transparent 50%);
          pointer-events: none;
        }
        
        .header-critical {
          background: linear-gradient(135deg, #ea580c 0%, #f97316 100%);
        }
        
        .logo {
          font-size: 28px;
          font-weight: 700;
          margin-bottom: 8px;
          letter-spacing: -0.025em;
          position: relative;
          z-index: 1;
        }
        
        .header-subtitle {
          font-size: 16px;
          font-weight: 400;
          opacity: 0.95;
          position: relative;
          z-index: 1;
        }
        
        /* Content section */
        .content {
          padding: 40px 30px;
          background: rgba(255, 255, 255, 0.95);
        }
        
        .greeting {
          font-size: 24px;
          font-weight: 600;
          color: #111827;
          margin-bottom: 20px;
          letter-spacing: -0.025em;
        }
        
        .message {
          font-size: 16px;
          line-height: 1.7;
          color: #4b5563;
          margin-bottom: 24px;
        }
        
        .button {
          display: inline-block;
          background: linear-gradient(135deg, #083A85 0%, #0a4499 100%);
          color: #ffffff;
          text-decoration: none;
          padding: 14px 28px;
          border-radius: 12px;
          font-weight: 600;
          font-size: 16px;
          text-align: center;
          box-shadow: 0 4px 14px rgba(8, 58, 133, 0.3);
          transition: all 0.3s ease;
        }
        
        .button:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(8, 58, 133, 0.4);
          background: linear-gradient(135deg, #1e40af 0%, #1d4ed8 100%);
          color: white !important;
        }
        
        .button-center {
          text-align: center;
          margin: 32px 0;
        }
        
        .alert-box {
          border-radius: 12px;
          padding: 20px;
          margin: 24px 0;
          border-left: 4px solid;
          backdrop-filter: blur(4px);
        }
        
        .alert-warning {
          background: rgba(255, 251, 235, 0.9);
          border-left-color: #f59e0b;
          color: #d97706;
        }
        
        .alert-error {
          background: rgba(254, 242, 242, 0.9);
          border-left-color: #ef4444;
          color: #dc2626;
        }
        
        .alert-info {
          background: rgba(239, 246, 255, 0.9);
          border-left-color: #3b82f6;
          color: #1e40af;
        }
        
        .alert-title {
          font-weight: 600;
          margin-bottom: 8px;
          font-size: 15px;
        }
        
        .alert-text {
          font-size: 14px;
          line-height: 1.5;
        }
        
        .info-card {
          background: linear-gradient(135deg, #083A85 0%, #0a4499 100%);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 12px;
          padding: 20px;
          margin: 24px 0;
          backdrop-filter: blur(4px);
          box-shadow: 0 4px 12px rgba(8, 58, 133, 0.2);
        }
        
        .info-card-header {
          display: flex;
          align-items: center;
          font-weight: 600;
          color: white;
          margin-bottom: 16px;
          font-size: 15px;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        
        .info-card-icon {
          margin-right: 8px;
          font-size: 18px;
        }
        
        .feature-list {
          list-style: none;
          padding: 0;
          margin: 16px 0;
        }
        
        .feature-list li {
          padding: 8px 0;
          color: #4b5563;
          font-size: 15px;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        
        .feature-list li:before {
          content: "✓";
          color: #22c55e;
          font-weight: bold;
          margin-right: 8px;
        }
        
        .divider {
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(229, 231, 235, 0.8), transparent);
          margin: 32px 0;
        }
        
        /* Footer */
        .footer {
          background: linear-gradient(135deg, #083A85 0%, #0a4499 100%);
          color: white;
          padding: 32px 30px;
          text-align: center;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          position: relative;
        }
        
        .footer::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, transparent 50%);
          pointer-events: none;
        }
        
        .footer-links {
          margin-bottom: 20px;
          position: relative;
          z-index: 1;
        }
        
        .footer-links a {
          color: rgba(255, 255, 255, 0.9);
          text-decoration: none;
          margin: 0 12px;
          font-weight: 500;
          font-size: 14px;
          transition: color 0.3s ease;
        }
        
        .footer-links a:hover {
          color: #52e000;
        }
        
        .footer-text {
          font-size: 13px;
          color: #ffffff;
          line-height: 1.5;
          position: relative;
          z-index: 1;
        }
        
        .footer-email {
          color: #23f8ed;
          font-weight: 500;
          text-decoration: none;
        }
        
        @media (max-width: 600px) {
          .email-wrapper {
            padding: 10px;
          }
          
          .content {
            padding: 30px 20px;
          }
          
          .header {
            padding: 30px 20px;
          }
          
          .footer {
            padding: 24px 20px;
          }
          
          .greeting {
            font-size: 20px;
          }
        }
      </style>
    `;
    }

    /**
     * KYC Reminder Email Template
     */
    private getKYCReminderTemplate(context: any, stage: ReminderStage, userTypeLabel: string, daysRemaining: number): string {
        const isWarning = stage.emailType === 'kyc_warning';
        const headerClass = isWarning ? 'header-critical' : '';

        return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${isWarning ? 'Urgent: ' : ''}Complete Your KYC Verification</title>
        ${this.getBaseTemplate()}
      </head>
      <body>
        <div class="email-wrapper">
          <div class="email-container">
            <div class="header ${headerClass}">
              <div class="logo">${context.company.name}</div>
              <div class="header-subtitle">${userTypeLabel} Verification</div>
            </div>
            
            <div class="content">
              <div class="greeting">${isWarning ? '⚠️ Urgent: ' : ''}Complete Your KYC Verification</div>
              
              <div class="message">
                Hi ${context.user.firstName}, you're almost ready to start ${this.getActivityText(userTypeLabel)} on ${context.company.name}! To unlock your full ${userTypeLabel.toLowerCase()} account and begin earning, please complete your Know Your Customer (KYC) verification.
              </div>
              
              ${isWarning ? `
                <div class="alert-box alert-error">
                  <div class="alert-title">Urgent: Account Deactivation Warning</div>
                  <div class="alert-text">
                    Your account will be automatically deactivated in <strong>${daysRemaining} days</strong> if KYC verification is not completed. Complete it now to maintain access to all platform features and continue your real estate journey.
                  </div>
                </div>
              ` : `
                <div class="alert-box alert-warning">
                  <div class="alert-title">Action Required: KYC Verification Pending</div>
                  <div class="alert-text">
                    Complete your KYC verification to unlock all platform features, list your properties, connect with clients, and start earning on ${context.company.name}.
                  </div>
                </div>
              `}
              
              <div class="message">
                <strong>Why KYC verification matters:</strong>
              </div>
              
              <ul class="feature-list">
                <li>Builds trust with clients and guests on the platform</li>
                <li>Ensures secure and compliant real estate transactions</li>
                <li>Unlocks full access to all ${userTypeLabel.toLowerCase()} features</li>
                <li>Required for receiving payments and withdrawals</li>
                <li>Protects your account and business from fraud</li>
              </ul>
              
              <div class="button-center">
                <a href="https://app.jambolush.com/all/kyc" class="button">
                  Complete KYC Verification Now
                </a>
              </div>
              
              ${isWarning ? `
                <div class="info-card">
                  <div class="info-card-header">
                    <span class="info-card-icon">⏰</span>
                    Timeline & Next Steps
                  </div>
                  <div class="message" style="color: white; font-size: 14px; line-height: 1.6; margin: 0;">
                    <strong>Account registered:</strong> ${new Date(context.user.createdAt || Date.now()).toLocaleDateString()}<br>
                    <strong>Days remaining:</strong> ${daysRemaining} days<br>
                    <strong>Deactivation date:</strong> ${new Date(Date.now() + (daysRemaining * 24 * 60 * 60 * 1000)).toLocaleDateString()}<br><br>
                    After deactivation, you'll need to contact support to reactivate your account. Avoid delays by completing your KYC verification today.
                  </div>
                </div>
              ` : ''}
              
              <div class="divider"></div>
              
              <div style="text-align: center; color: #6b7280;">
                <p>Need help with KYC verification?</p>
                <p style="margin-top: 8px;">
                  <a href="mailto:${context.company.supportEmail}" style="color: #083A85; text-decoration: none; font-weight: 500;">Contact Our Support Team</a>
                </p>
              </div>
            </div>
            
            <div class="footer">
              <div class="footer-links">
                <a href="https://app.jambolush.com/all/kyc">Complete KYC</a>
                <a href="https://app.jambolush.com/all/support-page">Support</a>
                <a href="https://jambolush.com/all/get-started">KYC Guide</a>
              </div>
              <div class="footer-text">
                © ${new Date().getFullYear()} ${context.company.name}. Secure verification enables your success.
                <br>
                This verification reminder was sent to <span class="footer-email">${context.user.email}</span>
              </div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
    }

    /**
     * Password Setup Reminder Template
     */
    private getPasswordSetupTemplate(context: any, userTypeLabel: string): string {
        return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Set Up Your Password</title>
        ${this.getBaseTemplate()}
      </head>
      <body>
        <div class="email-wrapper">
          <div class="email-container">
            <div class="header">
              <div class="logo">${context.company.name}</div>
              <div class="header-subtitle">Account Setup Required</div>
            </div>
            
            <div class="content">
              <div class="greeting">Secure Your ${userTypeLabel} Account</div>
              
              <div class="message">
                Hi ${context.user.firstName}, welcome to ${context.company.name}! To complete your ${userTypeLabel.toLowerCase()} account setup and ensure secure access to all features, please create your account password.
              </div>
              
              <div class="alert-box alert-info">
                <div class="alert-title">Password Setup Required</div>
                <div class="alert-text">
                  Setting up a strong password protects your account, client information, and business data. This is a required step to access your dashboard and start ${this.getActivityText(userTypeLabel)}.
                </div>
              </div>
              
              <div class="message">
                <strong>Your password should:</strong>
              </div>
              
              <ul class="feature-list">
                <li>Be at least 8 characters long</li>
                <li>Include uppercase and lowercase letters</li>
                <li>Contain at least one number</li>
                <li>Include at least one special character</li>
                <li>Be unique and not used on other platforms</li>
              </ul>
              
              <div class="button-center">
                <a href="https://jambolush.com/all/login" class="button">
                  Set Up Password Now
                </a>
              </div>
              
              <div class="info-card">
                <div class="info-card-header">
                  <span class="info-card-icon">🔐</span>
                  Security Tips
                </div>
                <div class="message" style="color: white; font-size: 14px; line-height: 1.6; margin: 0;">
                  <strong>Keep your account secure:</strong><br>
                  • Never share your password with anyone<br>
                  • Use a unique password for ${context.company.name}<br>
                  • Enable two-factor authentication after setup<br>
                  • Update your password regularly<br>
                  • Log out from shared devices
                </div>
              </div>
              
              <div class="divider"></div>
              
              <div style="text-align: center; color: #6b7280;">
                <p>Having trouble setting up your password?</p>
                <p style="margin-top: 8px;">
                  <a href="mailto:${context.company.supportEmail}" style="color: #083A85; text-decoration: none; font-weight: 500;">Get Help from Support</a>
                </p>
              </div>
            </div>
            
            <div class="footer">
              <div class="footer-links">
                <a href="https://jambolush.com/all/login">Set Password</a>
                <a href="https://app.jambolush.com/all/support-page">Support</a>
              </div>
              <div class="footer-text">
                © ${new Date().getFullYear()} ${context.company.name}. Your security enables your success.
                <br>
                This account setup reminder was sent to <span class="footer-email">${context.user.email}</span>
              </div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
    }

    /**
     * Account Deactivation Template
     */
    private getDeactivationTemplate(context: any, userTypeLabel: string): string {
        return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Account Deactivated</title>
        ${this.getBaseTemplate()}
        <style>
          .header-deactivated {
            background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%);
          }
        </style>
      </head>
      <body>
        <div class="email-wrapper">
          <div class="email-container">
            <div class="header header-deactivated">
              <div class="logo">${context.company.name}</div>
              <div class="header-subtitle">Account Status Update</div>
            </div>
            
            <div class="content">
              <div class="greeting" style="color: #dc2626;">Account Deactivated</div>
              
              <div class="message">
                Hi ${context.user.firstName}, your ${context.company.name} ${userTypeLabel.toLowerCase()} account has been deactivated due to incomplete KYC verification within the required 90-day period.
              </div>
              
              <div class="alert-box alert-error">
                <div class="alert-title">Access Restricted</div>
                <div class="alert-text">
                  Your account is currently inactive and you no longer have access to ${userTypeLabel.toLowerCase()} features, dashboard, or platform services. This action was taken in accordance with our compliance and security policies.
                </div>
              </div>
              
              <div class="message">
                <strong>What this means:</strong>
              </div>
              
              <ul class="feature-list" style="color: #6b7280;">
                <li style="color: #6b7280;">All access to your ${userTypeLabel.toLowerCase()} dashboard has been suspended</li>
                <li style="color: #6b7280;">You cannot list properties or manage existing listings</li>
                <li style="color: #6b7280;">Client communications and bookings are paused</li>
                <li style="color: #6b7280;">Your account data remains secure and preserved</li>
                <li style="color: #6b7280;">Account will be permanently deleted after 90 days of inactivity</li>
              </ul>
              
              <div class="info-card" style="background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%);">
                <div class="info-card-header">
                  <span class="info-card-icon">🔄</span>
                  Reactivation Process
                </div>
                <div class="message" style="color: white; font-size: 14px; line-height: 1.6; margin: 0;">
                  To reactivate your account, you must complete your KYC verification. Contact our support team to begin the reactivation process. Our team will guide you through the verification steps and restore your account access once compliance requirements are met.
                </div>
              </div>
              
              <div class="button-center">
                <a href="mailto:${context.company.supportEmail}?subject=Account%20Reactivation%20Request" class="button" style="background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%);">
                  Request Account Reactivation
                </a>
              </div>
              
              <div class="alert-box alert-warning">
                <div class="alert-title">Permanent Deletion Warning</div>
                <div class="alert-text">
                  If your account remains inactive for 90 days, it will be permanently deleted along with all associated data. Contact support before ${new Date(Date.now() + (90 * 24 * 60 * 60 * 1000)).toLocaleDateString()} to prevent permanent deletion.
                </div>
              </div>
              
              <div class="divider"></div>
              
              <div style="text-align: center; color: #6b7280;">
                <p>Questions about your account status?</p>
                <p style="margin-top: 8px;">
                  <a href="mailto:${context.company.supportEmail}" style="color: #083A85; text-decoration: none; font-weight: 500;">Contact Support Team</a>
                </p>
              </div>
            </div>
            
            <div class="footer">
              <div class="footer-links">
                <a href="mailto:${context.company.supportEmail}">Contact Support</a>
                <a href="https://jambolush.com/all/terms-and-conditions">Terms of Service</a>
                <a href="https://jambolush.com/all/privacy-policy">Privacy Policy</a>
              </div>
              <div class="footer-text">
                © ${new Date().getFullYear()} ${context.company.name}. Committed to secure and compliant service.
                <br>
                This account status notification was sent to <span class="footer-email">${context.user.email}</span>
              </div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
    }

    /**
     * Text Templates for Fallback
     */
    private getKYCReminderTextTemplate(context: any, stage: ReminderStage, userTypeLabel: string, daysRemaining: number): string {
        const isWarning = stage.emailType === 'kyc_warning';

        return `
${isWarning ? '⚠️ URGENT: ' : ''}Complete Your KYC Verification - ${context.company.name}

Hi ${context.user.firstName}, complete your ${userTypeLabel} KYC verification to start ${this.getActivityText(userTypeLabel)}.

${isWarning ? `⚠️ WARNING: Your account will be deactivated in ${daysRemaining} days if KYC verification is not completed.` : 'Complete your KYC verification to unlock all platform features and start earning.'}

Complete now: https://app.jambolush.com/all/kyc

Why KYC matters:
- Builds trust with clients
- Ensures secure transactions
- Unlocks full platform features
- Required for payments
- Protects your business

Need help? Contact support: ${context.company.supportEmail}

© ${new Date().getFullYear()} ${context.company.name}
This verification reminder was sent to ${context.user.email}
    `.trim();
    }

    private getPasswordSetupTextTemplate(context: any, userTypeLabel: string): string {
        return `
Set Up Your Password - ${context.company.name}

Hi ${context.user.firstName}, complete your ${userTypeLabel} account setup by creating a secure password.

Set up now: https://jambolush.com/all/login

Your password should:
- Be at least 8 characters long
- Include uppercase and lowercase letters
- Contain numbers and special characters
- Be unique to ${context.company.name}

Security tips:
- Never share your password
- Enable two-factor authentication
- Log out from shared devices

Need help? Contact: ${context.company.supportEmail}

© ${new Date().getFullYear()} ${context.company.name}
Your security enables your success.
    `.trim();
    }

    private getDeactivationTextTemplate(context: any, userTypeLabel: string): string {
        return `
Account Deactivated - ${context.company.name}

Hi ${context.user.firstName}, your ${userTypeLabel} account has been deactivated due to incomplete KYC verification within 90 days.

What this means:
- Dashboard access suspended
- Cannot list or manage properties
- Client communications paused
- Account data preserved
- Permanent deletion in 90 days

To reactivate your account:
1. Contact support: ${context.company.supportEmail}
2. Complete KYC verification
3. Restore full account access

Request reactivation: ${context.company.supportEmail}

⚠️ WARNING: Account will be permanently deleted after 90 days of inactivity.

© ${new Date().getFullYear()} ${context.company.name}
Committed to secure and compliant service.
    `.trim();
    }
}