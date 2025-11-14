// src/services/admin-bulk-mail.service.ts - Admin Bulk Mail Service with Customizable Templates

import * as Brevo from '@getbrevo/brevo';
import { config } from '../config/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ==================== TYPES ====================

export interface BulkMailRecipient {
  email: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  customData?: Record<string, any>;
}

export interface BulkMailTemplate {
  subject: string;
  htmlContent: string;
  textContent?: string;
  useDynamicVariables?: boolean; // If true, {{firstName}}, {{lastName}}, etc. will be replaced
}

export interface BulkMailOptions {
  sender?: {
    name: string;
    email: string;
  };
  batchSize?: number; // Number of emails to send per batch (default: 50)
  delayBetweenBatches?: number; // Delay in ms between batches (default: 1000ms)
  trackOpens?: boolean;
  trackClicks?: boolean;
  tags?: string[];
  attachments?: Array<{
    name: string;
    content: string; // Base64 encoded
    url?: string;
  }>;
}

export interface BulkMailRequest {
  recipients: BulkMailRecipient[];
  template: BulkMailTemplate;
  options?: BulkMailOptions;
}

export interface BulkMailResult {
  success: boolean;
  totalRecipients: number;
  successfulSends: number;
  failedSends: number;
  errors: Array<{
    email: string;
    error: string;
  }>;
  duration: number; // in ms
}

// Predefined template types
export type PredefinedTemplateType =
  | 'announcement'
  | 'promotion'
  | 'newsletter'
  | 'system_update'
  | 'payment_reminder'
  | 'booking_reminder'
  | 'custom';

export interface PredefinedTemplateData {
  type: PredefinedTemplateType;
  title: string;
  message: string;
  buttonText?: string;
  buttonUrl?: string;
  imageUrl?: string;
  additionalInfo?: string;
}

// User filtering options
export interface UserFilterOptions {
  role?: 'guest' | 'host' | 'guide' | 'admin';
  isVerified?: boolean;
  hasCompletedBooking?: boolean;
  createdAfter?: Date;
  createdBefore?: Date;
  country?: string;
  specificUserIds?: number[];
  specificEmails?: string[];
}

// ==================== SERVICE ====================

export class AdminBulkMailService {
  private transactionalEmailsApi: Brevo.TransactionalEmailsApi;
  private defaultSender: { name: string; email: string };

  constructor() {
    // Initialize API
    this.transactionalEmailsApi = new Brevo.TransactionalEmailsApi();

    // Validate configuration
    if (!config.brevoApiKey) {
      throw new Error('Brevo API key is required but not configured');
    }

    if (!config.brevoSenderEmail) {
      throw new Error('Brevo sender email is required but not configured');
    }

    // Set API key
    this.transactionalEmailsApi.setApiKey(
      Brevo.TransactionalEmailsApiApiKeys.apiKey,
      config.brevoApiKey
    );

    this.defaultSender = {
      name: 'Jambolush Admin',
      email: config.brevoSenderEmail
    };
  }

  /**
   * Send bulk emails to a list of recipients
   */
  async sendBulkMail(request: BulkMailRequest): Promise<BulkMailResult> {
    const startTime = Date.now();
    const result: BulkMailResult = {
      success: true,
      totalRecipients: request.recipients.length,
      successfulSends: 0,
      failedSends: 0,
      errors: [],
      duration: 0
    };

    // Validate recipients
    if (!request.recipients || request.recipients.length === 0) {
      throw new Error('At least one recipient is required');
    }

    // Set default options
    const options: BulkMailOptions = {
      batchSize: 50,
      delayBetweenBatches: 1000,
      trackOpens: true,
      trackClicks: true,
      ...request.options
    };

    const sender = options.sender || this.defaultSender;
    const batchSize = options.batchSize || 50;
    const delay = options.delayBetweenBatches || 1000;

    // Process recipients in batches
    for (let i = 0; i < request.recipients.length; i += batchSize) {
      const batch = request.recipients.slice(i, i + batchSize);

      // Send emails in parallel for each batch
      const batchPromises = batch.map(recipient =>
        this.sendSingleEmail(recipient, request.template, sender, options)
          .then(() => {
            result.successfulSends++;
          })
          .catch((error: any) => {
            result.failedSends++;
            result.errors.push({
              email: recipient.email,
              error: error.message || 'Unknown error'
            });
          })
      );

      await Promise.allSettled(batchPromises);

      // Delay between batches (except for the last batch)
      if (i + batchSize < request.recipients.length) {
        await this.delay(delay);
      }
    }

    result.duration = Date.now() - startTime;
    result.success = result.failedSends === 0;

    console.log(`[BULK_MAIL] Sent ${result.successfulSends}/${result.totalRecipients} emails in ${result.duration}ms`);

    return result;
  }

  /**
   * Send a single email with dynamic variable replacement
   */
  private async sendSingleEmail(
    recipient: BulkMailRecipient,
    template: BulkMailTemplate,
    sender: { name: string; email: string },
    options: BulkMailOptions
  ): Promise<void> {
    const sendSmtpEmail = new Brevo.SendSmtpEmail();

    sendSmtpEmail.sender = sender;
    sendSmtpEmail.to = [{
      email: recipient.email,
      name: recipient.name || `${recipient.firstName || ''} ${recipient.lastName || ''}`.trim() || undefined
    }];

    // Replace dynamic variables if enabled
    let htmlContent = template.htmlContent;
    let textContent = template.textContent || '';
    let subject = template.subject;

    if (template.useDynamicVariables) {
      const variables = {
        firstName: recipient.firstName || recipient.customData?.firstName || '',
        lastName: recipient.lastName || recipient.customData?.lastName || '',
        email: recipient.email,
        name: recipient.name || `${recipient.firstName || ''} ${recipient.lastName || ''}`.trim(),
        ...recipient.customData
      };

      htmlContent = this.replaceDynamicVariables(htmlContent, variables);
      textContent = this.replaceDynamicVariables(textContent, variables);
      subject = this.replaceDynamicVariables(subject, variables);
    }

    sendSmtpEmail.subject = subject;
    sendSmtpEmail.htmlContent = htmlContent;

    if (textContent) {
      sendSmtpEmail.textContent = textContent;
    }

    // Add tracking
    if (options.trackOpens !== undefined) {
      sendSmtpEmail.params = { ...sendSmtpEmail.params, trackOpens: options.trackOpens };
    }

    if (options.trackClicks !== undefined) {
      sendSmtpEmail.params = { ...sendSmtpEmail.params, trackClicks: options.trackClicks };
    }

    // Add tags
    if (options.tags && options.tags.length > 0) {
      sendSmtpEmail.tags = options.tags;
    }

    // Add attachments
    if (options.attachments && options.attachments.length > 0) {
      sendSmtpEmail.attachment = options.attachments.map(att => ({
        name: att.name,
        content: att.content,
        url: att.url
      }));
    }

    await this.transactionalEmailsApi.sendTransacEmail(sendSmtpEmail);
  }

  /**
   * Replace dynamic variables in template
   */
  private replaceDynamicVariables(content: string, variables: Record<string, any>): string {
    let result = content;

    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, String(value || ''));
    }

    return result;
  }

  /**
   * Get recipients from database based on filters
   */
  async getRecipientsFromFilters(filters: UserFilterOptions): Promise<BulkMailRecipient[]> {
    const where: any = {};

    // Apply filters
    if (filters.role) {
      where.role = filters.role;
    }

    if (filters.isVerified !== undefined) {
      where.isVerified = filters.isVerified;
    }

    if (filters.createdAfter || filters.createdBefore) {
      where.createdAt = {};
      if (filters.createdAfter) {
        where.createdAt.gte = filters.createdAfter;
      }
      if (filters.createdBefore) {
        where.createdAt.lte = filters.createdBefore;
      }
    }

    if (filters.country) {
      where.country = filters.country;
    }

    if (filters.specificUserIds && filters.specificUserIds.length > 0) {
      where.id = { in: filters.specificUserIds };
    }

    if (filters.specificEmails && filters.specificEmails.length > 0) {
      where.email = { in: filters.specificEmails };
    }

    // Fetch users
    const users = await prisma.user.findMany({
      where,
      select: {
        email: true,
        firstName: true,
        lastName: true,
        id: true
      }
    });

    // Filter by booking status if needed
    if (filters.hasCompletedBooking !== undefined) {
      const usersWithBookings = await Promise.all(
        users.map(async (user) => {
          const hasBooking = await prisma.booking.findFirst({
            where: {
              guestId: user.id,
              status: 'confirmed'
            }
          });

          return filters.hasCompletedBooking ? hasBooking : !hasBooking;
        })
      );

      return users
        .filter((_, index) => usersWithBookings[index])
        .map(user => ({
          email: user.email,
          firstName: user.firstName || '',
          lastName: user.lastName || '',
          name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
          customData: {
            userId: user.id
          }
        }));
    }

    return users.map(user => ({
      email: user.email,
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
      customData: {
        userId: user.id
      }
    }));
  }

  /**
   * Generate predefined template
   */
  generatePredefinedTemplate(data: PredefinedTemplateData): BulkMailTemplate {
    const baseStyles = this.getBaseTemplateStyles();

    let htmlContent = '';
    let textContent = '';

    switch (data.type) {
      case 'announcement':
        htmlContent = this.getAnnouncementTemplate(data, baseStyles);
        textContent = this.getAnnouncementTextTemplate(data);
        break;

      case 'promotion':
        htmlContent = this.getPromotionTemplate(data, baseStyles);
        textContent = this.getPromotionTextTemplate(data);
        break;

      case 'newsletter':
        htmlContent = this.getNewsletterTemplate(data, baseStyles);
        textContent = this.getNewsletterTextTemplate(data);
        break;

      case 'system_update':
        htmlContent = this.getSystemUpdateTemplate(data, baseStyles);
        textContent = this.getSystemUpdateTextTemplate(data);
        break;

      case 'payment_reminder':
        htmlContent = this.getPaymentReminderTemplate(data, baseStyles);
        textContent = this.getPaymentReminderTextTemplate(data);
        break;

      case 'booking_reminder':
        htmlContent = this.getBookingReminderTemplate(data, baseStyles);
        textContent = this.getBookingReminderTextTemplate(data);
        break;

      case 'custom':
      default:
        htmlContent = this.getCustomTemplate(data, baseStyles);
        textContent = this.getCustomTextTemplate(data);
        break;
    }

    return {
      subject: data.title,
      htmlContent,
      textContent,
      useDynamicVariables: true
    };
  }

  // ==================== TEMPLATE STYLES ====================

  private getBaseTemplateStyles(): string {
    return `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          line-height: 1.6;
          color: #374151;
          background: #f9fafb;
          padding: 10px;
        }
        .email-wrapper { width: 100%; max-width: 600px; margin: 0 auto; }
        .email-container {
          background: #ffffff;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
          border: 1px solid #e5e7eb;
          overflow: hidden;
        }
        .header {
          background: linear-gradient(135deg, #083A85 0%, #0a4499 100%);
          padding: 32px 24px;
          text-align: center;
          color: white;
        }
        .logo { font-size: 24px; font-weight: 600; margin-bottom: 6px; }
        .header-subtitle { font-size: 14px; font-weight: 400; opacity: 0.9; }
        .content { padding: 32px 24px; }
        .greeting { font-size: 20px; font-weight: 600; color: #111827; margin-bottom: 16px; }
        .message { font-size: 15px; line-height: 1.8; color: #4b5563; margin-bottom: 20px; }
        .button {
          display: inline-block;
          background: #083A85;
          color: #ffffff;
          text-decoration: none;
          padding: 14px 28px;
          border-radius: 8px;
          font-weight: 600;
          font-size: 15px;
          text-align: center;
          margin: 10px 0;
        }
        .button:hover { background: #0a4499; }
        .button-center { text-align: center; margin: 24px 0; }
        .image-container { text-align: center; margin: 24px 0; }
        .image-container img { max-width: 100%; height: auto; border-radius: 8px; }
        .alert-box {
          border-radius: 8px;
          padding: 18px;
          margin: 24px 0;
          border-left: 4px solid;
        }
        .alert-info { background: #eff6ff; border-left-color: #3b82f6; color: #1e40af; }
        .alert-success { background: #f0fdf4; border-left-color: #22c55e; color: #15803d; }
        .alert-warning { background: #fffbeb; border-left-color: #f59e0b; color: #d97706; }
        .alert-title { font-weight: 600; margin-bottom: 8px; font-size: 15px; }
        .alert-text { font-size: 14px; line-height: 1.6; }
        .footer {
          background: #f9fafb;
          color: #6b7280;
          padding: 24px;
          text-align: center;
          border-top: 1px solid #e5e7eb;
        }
        .footer-text { font-size: 13px; line-height: 1.6; }
        @media (max-width: 600px) {
          body { padding: 5px; }
          .content { padding: 24px 16px; }
          .header { padding: 24px 16px; }
          .greeting { font-size: 18px; }
          .button { display: block; width: 100%; }
        }
      </style>
    `;
  }

  // ==================== TEMPLATE GENERATORS ====================

  private getAnnouncementTemplate(data: PredefinedTemplateData, styles: string): string {
    return `
      <!DOCTYPE html><html><head>${styles}</head><body>
        <div class="email-wrapper"><div class="email-container">
          <div class="header">
            <div class="logo">Jambolush</div>
            <div class="header-subtitle">📢 Important Announcement</div>
          </div>
          <div class="content">
            <div class="greeting">Hello {{firstName}}!</div>
            <div class="alert-box alert-info">
              <div class="alert-title">${data.title}</div>
              <div class="alert-text">${data.message}</div>
            </div>
            ${data.imageUrl ? `
              <div class="image-container">
                <img src="${data.imageUrl}" alt="Announcement" />
              </div>
            ` : ''}
            ${data.additionalInfo ? `<div class="message">${data.additionalInfo}</div>` : ''}
            ${data.buttonText && data.buttonUrl ? `
              <div class="button-center">
                <a href="${data.buttonUrl}" class="button">${data.buttonText}</a>
              </div>
            ` : ''}
          </div>
          <div class="footer">
            <div class="footer-text">
              © ${new Date().getFullYear()} Jambolush. All rights reserved.
            </div>
          </div>
        </div></div>
      </body></html>
    `;
  }

  private getPromotionTemplate(data: PredefinedTemplateData, styles: string): string {
    return `
      <!DOCTYPE html><html><head>${styles}</head><body>
        <div class="email-wrapper"><div class="email-container">
          <div class="header">
            <div class="logo">Jambolush</div>
            <div class="header-subtitle">🎉 Special Offer</div>
          </div>
          <div class="content">
            <div class="greeting">Hi {{firstName}}!</div>
            ${data.imageUrl ? `
              <div class="image-container">
                <img src="${data.imageUrl}" alt="Promotion" />
              </div>
            ` : ''}
            <div class="alert-box alert-success">
              <div class="alert-title">${data.title}</div>
              <div class="alert-text">${data.message}</div>
            </div>
            ${data.additionalInfo ? `<div class="message">${data.additionalInfo}</div>` : ''}
            ${data.buttonText && data.buttonUrl ? `
              <div class="button-center">
                <a href="${data.buttonUrl}" class="button">${data.buttonText}</a>
              </div>
            ` : ''}
          </div>
          <div class="footer">
            <div class="footer-text">
              © ${new Date().getFullYear()} Jambolush. All rights reserved.
            </div>
          </div>
        </div></div>
      </body></html>
    `;
  }

  private getNewsletterTemplate(data: PredefinedTemplateData, styles: string): string {
    return `
      <!DOCTYPE html><html><head>${styles}</head><body>
        <div class="email-wrapper"><div class="email-container">
          <div class="header">
            <div class="logo">Jambolush</div>
            <div class="header-subtitle">📰 Newsletter</div>
          </div>
          <div class="content">
            <div class="greeting">Hello {{firstName}}!</div>
            <div class="message"><strong>${data.title}</strong></div>
            ${data.imageUrl ? `
              <div class="image-container">
                <img src="${data.imageUrl}" alt="Newsletter" />
              </div>
            ` : ''}
            <div class="message">${data.message}</div>
            ${data.additionalInfo ? `<div class="message">${data.additionalInfo}</div>` : ''}
            ${data.buttonText && data.buttonUrl ? `
              <div class="button-center">
                <a href="${data.buttonUrl}" class="button">${data.buttonText}</a>
              </div>
            ` : ''}
          </div>
          <div class="footer">
            <div class="footer-text">
              © ${new Date().getFullYear()} Jambolush. All rights reserved.
            </div>
          </div>
        </div></div>
      </body></html>
    `;
  }

  private getSystemUpdateTemplate(data: PredefinedTemplateData, styles: string): string {
    return `
      <!DOCTYPE html><html><head>${styles}</head><body>
        <div class="email-wrapper"><div class="email-container">
          <div class="header">
            <div class="logo">Jambolush</div>
            <div class="header-subtitle">🔧 System Update</div>
          </div>
          <div class="content">
            <div class="greeting">Hello {{firstName}},</div>
            <div class="alert-box alert-warning">
              <div class="alert-title">${data.title}</div>
              <div class="alert-text">${data.message}</div>
            </div>
            ${data.additionalInfo ? `<div class="message">${data.additionalInfo}</div>` : ''}
            ${data.buttonText && data.buttonUrl ? `
              <div class="button-center">
                <a href="${data.buttonUrl}" class="button">${data.buttonText}</a>
              </div>
            ` : ''}
          </div>
          <div class="footer">
            <div class="footer-text">
              © ${new Date().getFullYear()} Jambolush. All rights reserved.
            </div>
          </div>
        </div></div>
      </body></html>
    `;
  }

  private getPaymentReminderTemplate(data: PredefinedTemplateData, styles: string): string {
    return `
      <!DOCTYPE html><html><head>${styles}</head><body>
        <div class="email-wrapper"><div class="email-container">
          <div class="header">
            <div class="logo">Jambolush</div>
            <div class="header-subtitle">💳 Payment Reminder</div>
          </div>
          <div class="content">
            <div class="greeting">Hi {{firstName}},</div>
            <div class="alert-box alert-warning">
              <div class="alert-title">${data.title}</div>
              <div class="alert-text">${data.message}</div>
            </div>
            ${data.additionalInfo ? `<div class="message">${data.additionalInfo}</div>` : ''}
            ${data.buttonText && data.buttonUrl ? `
              <div class="button-center">
                <a href="${data.buttonUrl}" class="button">${data.buttonText}</a>
              </div>
            ` : ''}
          </div>
          <div class="footer">
            <div class="footer-text">
              Questions? Contact us at support@jambolush.com<br>
              © ${new Date().getFullYear()} Jambolush. All rights reserved.
            </div>
          </div>
        </div></div>
      </body></html>
    `;
  }

  private getBookingReminderTemplate(data: PredefinedTemplateData, styles: string): string {
    return `
      <!DOCTYPE html><html><head>${styles}</head><body>
        <div class="email-wrapper"><div class="email-container">
          <div class="header">
            <div class="logo">Jambolush</div>
            <div class="header-subtitle">📅 Booking Reminder</div>
          </div>
          <div class="content">
            <div class="greeting">Hi {{firstName}}!</div>
            <div class="alert-box alert-info">
              <div class="alert-title">${data.title}</div>
              <div class="alert-text">${data.message}</div>
            </div>
            ${data.additionalInfo ? `<div class="message">${data.additionalInfo}</div>` : ''}
            ${data.buttonText && data.buttonUrl ? `
              <div class="button-center">
                <a href="${data.buttonUrl}" class="button">${data.buttonText}</a>
              </div>
            ` : ''}
          </div>
          <div class="footer">
            <div class="footer-text">
              © ${new Date().getFullYear()} Jambolush. All rights reserved.
            </div>
          </div>
        </div></div>
      </body></html>
    `;
  }

  private getCustomTemplate(data: PredefinedTemplateData, styles: string): string {
    return `
      <!DOCTYPE html><html><head>${styles}</head><body>
        <div class="email-wrapper"><div class="email-container">
          <div class="header">
            <div class="logo">Jambolush</div>
            <div class="header-subtitle">${data.title}</div>
          </div>
          <div class="content">
            <div class="greeting">Hello {{firstName}}!</div>
            ${data.imageUrl ? `
              <div class="image-container">
                <img src="${data.imageUrl}" alt="${data.title}" />
              </div>
            ` : ''}
            <div class="message">${data.message}</div>
            ${data.additionalInfo ? `<div class="message">${data.additionalInfo}</div>` : ''}
            ${data.buttonText && data.buttonUrl ? `
              <div class="button-center">
                <a href="${data.buttonUrl}" class="button">${data.buttonText}</a>
              </div>
            ` : ''}
          </div>
          <div class="footer">
            <div class="footer-text">
              © ${new Date().getFullYear()} Jambolush. All rights reserved.
            </div>
          </div>
        </div></div>
      </body></html>
    `;
  }

  // ==================== TEXT TEMPLATES ====================

  private getAnnouncementTextTemplate(data: PredefinedTemplateData): string {
    return `
      📢 ANNOUNCEMENT

      Hello {{firstName}}!

      ${data.title}

      ${data.message}

      ${data.additionalInfo || ''}

      ${data.buttonText && data.buttonUrl ? `${data.buttonText}: ${data.buttonUrl}` : ''}

      © ${new Date().getFullYear()} Jambolush. All rights reserved.
    `.trim();
  }

  private getPromotionTextTemplate(data: PredefinedTemplateData): string {
    return `
      🎉 SPECIAL OFFER

      Hi {{firstName}}!

      ${data.title}

      ${data.message}

      ${data.additionalInfo || ''}

      ${data.buttonText && data.buttonUrl ? `${data.buttonText}: ${data.buttonUrl}` : ''}

      © ${new Date().getFullYear()} Jambolush. All rights reserved.
    `.trim();
  }

  private getNewsletterTextTemplate(data: PredefinedTemplateData): string {
    return `
      📰 NEWSLETTER

      Hello {{firstName}}!

      ${data.title}

      ${data.message}

      ${data.additionalInfo || ''}

      ${data.buttonText && data.buttonUrl ? `${data.buttonText}: ${data.buttonUrl}` : ''}

      © ${new Date().getFullYear()} Jambolush. All rights reserved.
    `.trim();
  }

  private getSystemUpdateTextTemplate(data: PredefinedTemplateData): string {
    return `
      🔧 SYSTEM UPDATE

      Hello {{firstName}},

      ${data.title}

      ${data.message}

      ${data.additionalInfo || ''}

      ${data.buttonText && data.buttonUrl ? `${data.buttonText}: ${data.buttonUrl}` : ''}

      © ${new Date().getFullYear()} Jambolush. All rights reserved.
    `.trim();
  }

  private getPaymentReminderTextTemplate(data: PredefinedTemplateData): string {
    return `
      💳 PAYMENT REMINDER

      Hi {{firstName}},

      ${data.title}

      ${data.message}

      ${data.additionalInfo || ''}

      ${data.buttonText && data.buttonUrl ? `${data.buttonText}: ${data.buttonUrl}` : ''}

      Questions? Contact us at support@jambolush.com

      © ${new Date().getFullYear()} Jambolush. All rights reserved.
    `.trim();
  }

  private getBookingReminderTextTemplate(data: PredefinedTemplateData): string {
    return `
      📅 BOOKING REMINDER

      Hi {{firstName}}!

      ${data.title}

      ${data.message}

      ${data.additionalInfo || ''}

      ${data.buttonText && data.buttonUrl ? `${data.buttonText}: ${data.buttonUrl}` : ''}

      © ${new Date().getFullYear()} Jambolush. All rights reserved.
    `.trim();
  }

  private getCustomTextTemplate(data: PredefinedTemplateData): string {
    return `
      ${data.title.toUpperCase()}

      Hello {{firstName}}!

      ${data.message}

      ${data.additionalInfo || ''}

      ${data.buttonText && data.buttonUrl ? `${data.buttonText}: ${data.buttonUrl}` : ''}

      © ${new Date().getFullYear()} Jambolush. All rights reserved.
    `.trim();
  }

  // ==================== UTILITIES ====================

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
