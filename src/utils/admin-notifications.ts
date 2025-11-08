// utils/admin-notifications.ts - Centralized Admin Email Notifications

import * as Brevo from '@getbrevo/brevo';
import { config } from '../config/config';

interface CompanyInfo {
  name: string;
  website: string;
  supportEmail: string;
  logo: string;
}

interface AdminNotificationData {
  type: 'checkin' | 'checkout' | 'withdrawal_method' | 'withdrawal_request' | 'completed_payment' | 'duplicate_detection' | 'property_submission' | 'tour_booking' | 'unlock_payment';
  title: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  user: {
    id: number;
    email: string;
    firstName: string;
    lastName: string;
  };
  resource: {
    id: string | number;
    name: string;
    type: 'property' | 'tour' | 'booking' | 'withdrawal' | 'payment';
  };
  metadata?: Record<string, any>;
  actionUrl?: string;
}

export class AdminNotificationService {
  private transactionalEmailsApi: Brevo.TransactionalEmailsApi;
  private companyInfo: CompanyInfo;
  private defaultSender: { name: string; email: string };
  private adminEmail: string;

  constructor() {
    this.transactionalEmailsApi = new Brevo.TransactionalEmailsApi();

    if (!config.brevoApiKey) {
      throw new Error('Brevo API key is required but not configured');
    }

    if (!config.brevoSenderEmail) {
      throw new Error('Brevo sender email is required but not configured');
    }

    this.transactionalEmailsApi.setApiKey(
      Brevo.TransactionalEmailsApiApiKeys.apiKey,
      config.brevoApiKey
    );

    this.defaultSender = {
      name: 'Jambolush Admin Notifications',
      email: config.brevoAdminSenderEmail || config.brevoSenderEmail
    };

    this.companyInfo = {
      name: process.env.COMPANY_NAME || 'Jambolush',
      website: process.env.COMPANY_WEBSITE || 'https://jambolush.com',
      supportEmail: process.env.COMPANY_SUPPORT_EMAIL || 'support@jambolush.com',
      logo: process.env.COMPANY_LOGO || 'https://jambolush.com/favicon.ico'
    };

    // Admin email for notifications
    this.adminEmail = process.env.ADMIN_EMAIL || 'admin@amoriaglobal.com';
  }

  /**
   * Send email notification to admin
   */
  async sendNotification(data: AdminNotificationData): Promise<void> {
    try {
      const { subject, html, text } = this.generateNotificationTemplate(data);

      await this.sendEmail({
        to: this.adminEmail,
        subject,
        html,
        text
      });

      console.log(`[ADMIN_NOTIFICATION] ${data.type} notification sent to ${this.adminEmail}`);
    } catch (error: any) {
      console.error(`[ADMIN_NOTIFICATION] Failed to send ${data.type} notification:`, error);
      // Don't throw - admin notifications are non-critical
    }
  }

  /**
   * Send notification for new check-in
   */
  async sendCheckinNotification(data: {
    bookingId: string;
    user: { id: number; email: string; firstName: string; lastName: string };
    propertyOrTour: { id: number | string; name: string; type: 'property' | 'tour' };
    host: { id: number; firstName: string; lastName: string };
    checkInDate: Date;
    guests?: number;
  }): Promise<void> {
    await this.sendNotification({
      type: 'checkin',
      title: 'New Check-In Completed',
      message: `${data.user.firstName} ${data.user.lastName} has checked in to ${data.propertyOrTour.name}`,
      severity: 'low',
      user: data.user,
      resource: {
        id: data.bookingId,
        name: data.propertyOrTour.name,
        type: 'booking'
      },
      metadata: {
        bookingId: data.bookingId,
        propertyOrTourId: data.propertyOrTour.id,
        propertyOrTourName: data.propertyOrTour.name,
        propertyOrTourType: data.propertyOrTour.type,
        hostId: data.host.id,
        hostName: `${data.host.firstName} ${data.host.lastName}`,
        checkInDate: data.checkInDate.toISOString(),
        guests: data.guests
      },
      actionUrl: `${this.companyInfo.website}/admin/bookings/${data.bookingId}`
    });
  }

  /**
   * Send notification for check-out
   */
  async sendCheckoutNotification(data: {
    bookingId: string;
    user: { id: number; email: string; firstName: string; lastName: string };
    propertyOrTour: { id: number | string; name: string; type: 'property' | 'tour' };
    host: { id: number; firstName: string; lastName: string };
    checkOutDate: Date;
  }): Promise<void> {
    await this.sendNotification({
      type: 'checkout',
      title: 'Check-Out Completed',
      message: `${data.user.firstName} ${data.user.lastName} has checked out from ${data.propertyOrTour.name}`,
      severity: 'low',
      user: data.user,
      resource: {
        id: data.bookingId,
        name: data.propertyOrTour.name,
        type: 'booking'
      },
      metadata: {
        bookingId: data.bookingId,
        propertyOrTourId: data.propertyOrTour.id,
        propertyOrTourName: data.propertyOrTour.name,
        propertyOrTourType: data.propertyOrTour.type,
        hostId: data.host.id,
        hostName: `${data.host.firstName} ${data.host.lastName}`,
        checkOutDate: data.checkOutDate.toISOString()
      },
      actionUrl: `${this.companyInfo.website}/admin/bookings/${data.bookingId}`
    });
  }

  /**
   * Send notification for new withdrawal request
   */
  async sendWithdrawalRequestNotification(data: {
    withdrawalId: string;
    user: { id: number; email: string; firstName: string; lastName: string };
    amount: number;
    currency: string;
    method: string;
    accountDetails: any;
  }): Promise<void> {
    await this.sendNotification({
      type: 'withdrawal_request',
      title: 'New Withdrawal Request',
      message: `${data.user.firstName} ${data.user.lastName} requested withdrawal of ${data.amount.toLocaleString()} ${data.currency}`,
      severity: 'medium',
      user: data.user,
      resource: {
        id: data.withdrawalId,
        name: `Withdrawal Request - ${data.amount.toLocaleString()} ${data.currency}`,
        type: 'withdrawal'
      },
      metadata: {
        withdrawalId: data.withdrawalId,
        amount: data.amount,
        currency: data.currency,
        method: data.method,
        accountDetails: data.accountDetails
      },
      actionUrl: `${this.companyInfo.website}/admin/withdrawals/${data.withdrawalId}`
    });
  }

  /**
   * Send notification for completed payment
   */
  async sendCompletedPaymentNotification(data: {
    transactionId: string;
    bookingId?: string;
    user: { id: number; email: string; firstName: string; lastName: string };
    amount: number;
    currency: string;
    paymentMethod: string;
    propertyOrTour?: { name: string; type: 'property' | 'tour' };
  }): Promise<void> {
    await this.sendNotification({
      type: 'completed_payment',
      title: 'Payment Completed',
      message: `${data.user.firstName} ${data.user.lastName} completed payment of ${data.amount.toLocaleString()} ${data.currency}`,
      severity: 'low',
      user: data.user,
      resource: {
        id: data.transactionId,
        name: `Payment - ${data.amount.toLocaleString()} ${data.currency}`,
        type: 'payment'
      },
      metadata: {
        transactionId: data.transactionId,
        bookingId: data.bookingId,
        amount: data.amount,
        currency: data.currency,
        paymentMethod: data.paymentMethod,
        propertyOrTourName: data.propertyOrTour?.name,
        propertyOrTourType: data.propertyOrTour?.type
      },
      actionUrl: data.bookingId
        ? `${this.companyInfo.website}/admin/bookings/${data.bookingId}`
        : `${this.companyInfo.website}/admin/transactions/${data.transactionId}`
    });
  }

  // === TEMPLATE GENERATORS ===

  private generateNotificationTemplate(data: AdminNotificationData): { subject: string; html: string; text: string } {
    const severityEmoji = {
      low: 'ℹ️',
      medium: '⚠️',
      high: '🔴',
      critical: '🚨'
    };

    const subject = `${severityEmoji[data.severity]} ${data.title} - ${this.companyInfo.name} Admin`;

    const html = `
      ${this.getBaseTemplate()}
      <body>
        <div class="email-wrapper">
          <div class="email-container">
            <div class="header">
              <img src="${this.companyInfo.logo}" alt="${this.companyInfo.name}" class="logo">
              <div class="header-title">${data.title}</div>
              <div class="header-subtitle">Admin Notification</div>
            </div>

            <div class="content">
              <div class="greeting">Hello Admin,</div>

              <div class="alert-box alert-${this.getSeverityClass(data.severity)}">
                <div class="alert-title">${severityEmoji[data.severity]} ${data.title}</div>
                <div class="alert-text">${data.message}</div>
              </div>

              <div class="info-card">
                <div class="info-card-header">👤 User Information</div>
                <table class="info-table">
                  <tr><td>User ID</td><td>${data.user.id}</td></tr>
                  <tr><td>Name</td><td>${data.user.firstName} ${data.user.lastName}</td></tr>
                  <tr><td>Email</td><td>${data.user.email}</td></tr>
                </table>
              </div>

              <div class="info-card">
                <div class="info-card-header">📋 Resource Details</div>
                <table class="info-table">
                  <tr><td>Resource ID</td><td>${data.resource.id}</td></tr>
                  <tr><td>Name</td><td>${data.resource.name}</td></tr>
                  <tr><td>Type</td><td>${data.resource.type.toUpperCase()}</td></tr>
                  ${this.formatMetadata(data.metadata)}
                </table>
              </div>

              ${data.actionUrl ? `
              <div class="button-center">
                <a href="${data.actionUrl}" class="button">View Details</a>
              </div>
              ` : ''}

              <div class="message" style="margin-top: 24px; font-size: 13px; color: #6b7280;">
                This is an automated admin notification from ${this.companyInfo.name}
              </div>
            </div>

            <div class="footer">
              <div class="footer-text">
                © ${new Date().getFullYear()} ${this.companyInfo.name}. All rights reserved.<br>
                This is an automated notification. Please do not reply to this email.
              </div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
${data.title}

Hello Admin,

${data.message}

USER INFORMATION:
- User ID: ${data.user.id}
- Name: ${data.user.firstName} ${data.user.lastName}
- Email: ${data.user.email}

RESOURCE DETAILS:
- Resource ID: ${data.resource.id}
- Name: ${data.resource.name}
- Type: ${data.resource.type.toUpperCase()}

${this.formatMetadataText(data.metadata)}

${data.actionUrl ? `View Details: ${data.actionUrl}` : ''}

---
This is an automated admin notification from ${this.companyInfo.name}
    `.trim();

    return { subject, html, text };
  }

  private getSeverityClass(severity: string): string {
    switch (severity) {
      case 'low': return 'info';
      case 'medium': return 'warning';
      case 'high': return 'warning';
      case 'critical': return 'error';
      default: return 'info';
    }
  }

  private formatMetadata(metadata?: Record<string, any>): string {
    if (!metadata) return '';

    return Object.entries(metadata)
      .map(([key, value]) => {
        const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
        const formattedValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
        return `<tr><td>${label}</td><td>${formattedValue}</td></tr>`;
      })
      .join('');
  }

  private formatMetadataText(metadata?: Record<string, any>): string {
    if (!metadata) return '';

    return Object.entries(metadata)
      .map(([key, value]) => {
        const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
        const formattedValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
        return `- ${label}: ${formattedValue}`;
      })
      .join('\n');
  }

  // === BASE TEMPLATE WITH FIXED MOBILE RESPONSIVENESS ===

  private getBaseTemplate(): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #374151; background: #f9fafb; padding: 10px; }
          .email-wrapper { width: 100%; max-width: 600px; margin: 0 auto; }
          .email-container { background: #ffffff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08); border: 1px solid #e5e7eb; overflow: hidden; }
          .header { background: linear-gradient(135deg, #083A85 0%, #0a4499 100%); padding: 32px 24px; text-align: center; color: white; }
          .logo { max-width: 120px; margin-bottom: 8px; height: auto; }
          .header-title { font-size: 24px; font-weight: 600; margin-bottom: 6px; word-wrap: break-word; }
          .header-subtitle { font-size: 14px; font-weight: 400; opacity: 0.9; }
          .content { padding: 28px 20px; background: #ffffff; }
          .greeting { font-size: 20px; font-weight: 600; color: #111827; margin-bottom: 16px; }
          .message { font-size: 15px; line-height: 1.6; color: #4b5563; margin-bottom: 20px; word-wrap: break-word; }
          .button { display: inline-block; background: #083A85; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 15px; text-align: center; }
          .button:hover { background: #0a4499; }
          .button-center { text-align: center; margin: 24px 0; }

          /* Fixed responsive table styling */
          .info-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px; margin: 20px 0; overflow-x: auto; }
          .info-card-header { font-weight: 600; color: #374151; margin-bottom: 12px; font-size: 14px; }
          .info-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
          .info-table tr { border-bottom: 1px solid #f1f5f9; }
          .info-table tr:last-child { border-bottom: none; }
          .info-table td { padding: 10px 8px; font-size: 13px; vertical-align: top; word-wrap: break-word; overflow-wrap: break-word; }
          .info-table td:first-child { font-weight: 500; color: #374151; width: 40%; }
          .info-table td:last-child { color: #6b7280; text-align: right; width: 60%; }

          .alert-box { border-radius: 8px; padding: 16px; margin: 20px 0; border-left: 3px solid; word-wrap: break-word; }
          .alert-success { background: #f0fdf4; border-left-color: #22c55e; color: #15803d; }
          .alert-warning { background: #fffbeb; border-left-color: #f59e0b; color: #d97706; }
          .alert-error { background: #fef2f2; border-left-color: #ef4444; color: #dc2626; }
          .alert-info { background: #eff6ff; border-left-color: #3b82f6; color: #1e40af; }
          .alert-title { font-weight: 600; margin-bottom: 6px; font-size: 14px; }
          .alert-text { font-size: 13px; line-height: 1.5; word-wrap: break-word; }

          .footer { background: #083A85; color: white; padding: 24px 20px; text-align: center; }
          .footer-text { font-size: 12px; color: #e5e7eb; line-height: 1.5; }
          ul { margin: 12px 0; padding-left: 24px; }
          li { font-size: 13px; color: #4b5563; margin-bottom: 6px; }

          /* Mobile responsive adjustments */
          @media (max-width: 600px) {
            body { padding: 5px; }
            .email-wrapper { width: 100%; max-width: 100%; }
            .email-container { border-radius: 8px; }
            .content { padding: 20px 16px; }
            .header { padding: 24px 16px; }
            .header-title { font-size: 20px; }
            .footer { padding: 20px 16px; }

            /* Fix table overflow on mobile */
            .info-card { padding: 12px; overflow-x: auto; -webkit-overflow-scrolling: touch; }
            .info-table { min-width: 280px; }
            .info-table td { padding: 8px 6px; font-size: 12px; }
            .info-table td:first-child { width: 45%; }
            .info-table td:last-child { width: 55%; text-align: left; }

            /* Better text wrapping on mobile */
            .message, .alert-text { font-size: 14px; }
            .button { display: block; width: 100%; padding: 14px 20px; }
          }

          @media (max-width: 480px) {
            .header-title { font-size: 18px; }
            .greeting { font-size: 18px; }
            .info-table td { font-size: 11px; padding: 6px 4px; }
          }
        </style>
      </head>
    `;
  }

  // === UTILITY METHODS ===

  private async sendEmail(options: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<void> {
    const sendEmailRequest: any = {
      sender: this.defaultSender,
      to: [{ email: options.to }],
      subject: options.subject,
      htmlContent: options.html,
      textContent: options.text
    };

    await this.transactionalEmailsApi.sendTransacEmail(sendEmailRequest);
  }

  /**
   * Send notification for new property submission
   */
  async sendPropertySubmissionNotification(data: {
    propertyId: number;
    user: { id: number; email: string; firstName: string; lastName: string };
    property: { name: string; location?: string; type?: string };
    checkInDate?: Date;
  }): Promise<void> {
    await this.sendNotification({
      type: 'property_submission',
      title: 'New Property Submitted for Review',
      message: `${data.user.firstName} ${data.user.lastName} has submitted a new property "${data.property.name}" for review`,
      severity: 'medium',
      user: data.user,
      resource: {
        id: data.propertyId,
        name: data.property.name,
        type: 'property'
      },
      metadata: {
        propertyId: data.propertyId,
        propertyName: data.property.name,
        propertyLocation: data.property.location || 'N/A',
        propertyType: data.property.type || 'N/A',
        submittedAt: data.checkInDate?.toISOString() || new Date().toISOString(),
        status: 'Pending Review'
      },
      actionUrl: `${this.companyInfo.website}/admin/properties/${data.propertyId}`
    });
  }

  /**
   * Send notification for new tour booking
   */
  async sendTourBookingNotification(data: {
    bookingId: string;
    user: { id: number; email: string; firstName: string; lastName: string };
    tour: { id: number | string; title: string; type?: string };
    tourGuide: { id: number; firstName: string; lastName: string };
    numberOfParticipants?: number;
    totalAmount?: number;
    currency?: string;
    scheduleDate?: Date;
  }): Promise<void> {
    await this.sendNotification({
      type: 'tour_booking',
      title: 'New Tour Booking Created',
      message: `${data.user.firstName} ${data.user.lastName} has booked the tour "${data.tour.title}"`,
      severity: 'low',
      user: data.user,
      resource: {
        id: data.bookingId,
        name: data.tour.title,
        type: 'tour'
      },
      metadata: {
        bookingId: data.bookingId,
        tourId: data.tour.id,
        tourTitle: data.tour.title,
        tourType: data.tour.type || 'Tour',
        tourGuideId: data.tourGuide.id,
        tourGuideName: `${data.tourGuide.firstName} ${data.tourGuide.lastName}`,
        numberOfParticipants: data.numberOfParticipants || 1,
        totalAmount: data.totalAmount,
        currency: data.currency || 'USD',
        scheduleDate: data.scheduleDate?.toISOString(),
        status: 'Confirmed'
      },
      actionUrl: `${this.companyInfo.website}/admin/bookings/${data.bookingId}`
    });
  }

  /**
   * Send notification for unlock payment
   */
  async sendUnlockPaymentNotification(data: {
    unlockId: string | number;
    user: { id: number; email: string; firstName: string; lastName: string };
    property: { id: number | string; name: string };
    amount: number;
    currency: string;
    paymentMethod: string;
  }): Promise<void> {
    await this.sendNotification({
      type: 'unlock_payment',
      title: 'Property Address Unlock Payment',
      message: `${data.user.firstName} ${data.user.lastName} paid ${data.amount.toLocaleString()} ${data.currency} to unlock property address for "${data.property.name}"`,
      severity: 'low',
      user: data.user,
      resource: {
        id: data.unlockId,
        name: `Address Unlock - ${data.property.name}`,
        type: 'payment'
      },
      metadata: {
        unlockId: data.unlockId,
        propertyId: data.property.id,
        propertyName: data.property.name,
        amount: data.amount,
        currency: data.currency,
        paymentMethod: data.paymentMethod,
        unlockedAt: new Date().toISOString()
      },
      actionUrl: `${this.companyInfo.website}/admin/properties/${data.property.id}`
    });
  }

  /**
   * Send notification for duplicate detection
   */
  async sendDuplicateDetectionNotification(data: {
    entityType: 'property' | 'tour';
    entityId: string;
    duplicateOfId: string;
    uploader: { id: number; email: string; firstName: string; lastName: string };
    originalOwner?: { id: number; firstName: string; lastName: string };
    entityName: string;
    duplicateEntityName: string;
    similarityScore: number;
    similarityReasons: string[];
  }): Promise<void> {
    await this.sendNotification({
      type: 'duplicate_detection',
      title: `⚠️ Duplicate ${data.entityType.toUpperCase()} Detected`,
      message: `A potential duplicate ${data.entityType} has been detected during upload. The system blocked the creation with ${data.similarityScore}% similarity to an existing ${data.entityType}.`,
      severity: 'high',
      user: data.uploader,
      resource: {
        id: data.entityId,
        name: data.entityName,
        type: data.entityType
      },
      metadata: {
        'Duplicate Of ID': data.duplicateOfId,
        'Duplicate Name': data.duplicateEntityName,
        'Similarity Score': `${data.similarityScore}%`,
        'Reasons': data.similarityReasons.join('; '),
        'Original Owner': data.originalOwner
          ? `${data.originalOwner.firstName} ${data.originalOwner.lastName} (ID: ${data.originalOwner.id})`
          : 'N/A',
        'Uploader': `${data.uploader.firstName} ${data.uploader.lastName} (ID: ${data.uploader.id})`,
        'Status': 'Blocked - Requires Review'
      },
      actionUrl: `${this.companyInfo.website}/admin/duplicates`
    });
  }
}

// Export singleton instance
export const adminNotifications = new AdminNotificationService();
