// src/utils/brevo.payment-status.ts - Payment Status Email Templates
import * as Brevo from '@getbrevo/brevo';
import { config } from '../config/config';
import { PropertyBookingInfo, TourBookingInfo } from '../types/booking.types';

interface BrevoEmailData {
  sender: { name: string; email: string };
  to: Array<{ email: string; name?: string }>;
  subject: string;
  htmlContent: string;
  textContent?: string;
}

interface UserInfo {
  firstName: string;
  lastName: string;
  email: string;
  id: number;
}

interface CompanyInfo {
  name: string;
  website: string;
  supportEmail: string;
  logo: string;
}

export interface PaymentStatusMailingContext {
  user: UserInfo;
  company: CompanyInfo;
  booking: PropertyBookingInfo | TourBookingInfo;
  recipientType: 'guest' | 'host' | 'guide' | 'admin';
  paymentStatus: 'pending' | 'deposit_received' | 'completed' | 'failed';
  paymentAmount?: number;
  paymentCurrency?: string;
  failureReason?: string;
  paymentReference?: string; // External payment reference (externalId from Transaction)
}

interface BrevoErrorResponse {
  code?: string;
  message?: string;
  details?: any;
}

interface BrevoApiError extends Error {
  response?: {
    status?: number;
    statusText?: string;
    body?: BrevoErrorResponse;
  };
  code?: string;
}

export class BrevoPaymentStatusMailingService {
  private transactionalEmailsApi: Brevo.TransactionalEmailsApi;
  private defaultSender: { name: string; email: string };

  constructor() {
    try {
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
        name: 'Jambolush Bookings',
        email: config.brevoSenderEmail
      };

    } catch (error: any) {
      throw error;
    }
  }

  // --- ERROR HANDLING UTILITIES ---
  private logBrevoError(context: string, error: BrevoApiError, additionalData?: any): void {
    const errorInfo = {
      service: 'BrevoPaymentStatusMailingService',
      context,
      timestamp: new Date().toISOString(),
      error: {
        message: error.message,
        code: error.code,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      brevoResponse: error.response ? {
        status: error.response.status,
        statusText: error.response.statusText,
        body: error.response.body,
      } : null,
      additionalData: additionalData ? JSON.stringify(additionalData) : null,
    };

    console.error('Brevo API Error:', JSON.stringify(errorInfo, null, 2));
  }

  private handleBrevoError(context: string, error: BrevoApiError, additionalData?: any): Error {
    this.logBrevoError(context, error, additionalData);

    // Handle specific Brevo error codes
    if (error.response?.status) {
      switch (error.response.status) {
        case 400:
          return new Error(`Invalid request to Brevo API: ${error.response.body?.message || error.message}`);
        case 401:
          return new Error('Brevo API authentication failed - check your API key configuration');
        case 402:
          return new Error('Brevo account has insufficient credits - please add credits to your account');
        case 403:
          return new Error('Brevo API access forbidden - check your account permissions and plan limits');
        case 404:
          return new Error(`Brevo resource not found: ${error.response.body?.message || error.message}`);
        case 429:
          return new Error('Brevo API rate limit exceeded - please retry after some time');
        case 500:
        case 502:
        case 503:
          return new Error('Brevo service temporarily unavailable - please retry later');
        default:
          return new Error(`Brevo API error (${error.response.status}): ${error.response.body?.message || error.message}`);
      }
    }

    // Handle network errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return new Error('Unable to connect to Brevo API - check your internet connection');
    }

    if (error.code === 'ETIMEDOUT') {
      return new Error('Brevo API request timed out - please retry');
    }

    // Default error
    return new Error(`Brevo API error: ${error.message}`);
  }

  private async sendEmail(data: BrevoEmailData): Promise<void> {
    try {
      const sendSmtpEmail = new Brevo.SendSmtpEmail();
      sendSmtpEmail.sender = data.sender;
      sendSmtpEmail.to = data.to;
      sendSmtpEmail.subject = data.subject;
      sendSmtpEmail.htmlContent = data.htmlContent;
      if (data.textContent) {
        sendSmtpEmail.textContent = data.textContent;
      }

      await this.transactionalEmailsApi.sendTransacEmail(sendSmtpEmail);
    } catch (error: any) {
      throw this.handleBrevoError('sendEmail', error, data);
    }
  }

  // === BOOKING RECEIVED - AWAITING PAYMENT EMAIL ===
  async sendBookingReceivedEmail(context: PaymentStatusMailingContext): Promise<void> {
    const bookingName = 'property' in context.booking ? context.booking.property.name : context.booking.tour.title;

    const emailData: BrevoEmailData = {
      sender: this.defaultSender,
      to: [{ email: context.user.email, name: `${context.user.firstName} ${context.user.lastName}` }],
      subject: `Booking Request Received - Complete Your Payment for ${bookingName}`,
      htmlContent: this.getBookingReceivedTemplate(context),
      textContent: this.getBookingReceivedTextTemplate(context)
    };

    await this.sendEmail(emailData);
    console.log(`Booking received (awaiting payment) email sent to ${context.user.email}`);
  }

  // === DEPOSIT RECEIVED EMAIL ===
  async sendDepositReceivedEmail(context: PaymentStatusMailingContext): Promise<void> {
    const bookingName = 'property' in context.booking ? context.booking.property.name : context.booking.tour.title;

    const emailData: BrevoEmailData = {
      sender: this.defaultSender,
      to: [{ email: context.user.email, name: `${context.user.firstName} ${context.user.lastName}` }],
      subject: `Deposit Received - Booking Pending Confirmation for ${bookingName}`,
      htmlContent: this.getDepositReceivedTemplate(context),
      textContent: this.getDepositReceivedTextTemplate(context)
    };

    await this.sendEmail(emailData);
    console.log(`Deposit received email sent to ${context.user.email}`);
  }

  // === PAYMENT COMPLETED - CONFIRMED BOOKING EMAIL ===
  async sendPaymentCompletedEmail(context: PaymentStatusMailingContext): Promise<void> {
    const bookingName = 'property' in context.booking ? context.booking.property.name : context.booking.tour.title;

    const emailData: BrevoEmailData = {
      sender: this.defaultSender,
      to: [{ email: context.user.email, name: `${context.user.firstName} ${context.user.lastName}` }],
      subject: `Payment Complete - ${bookingName} Booking Confirmed!`,
      htmlContent: this.getPaymentCompletedTemplate(context),
      textContent: this.getPaymentCompletedTextTemplate(context)
    };

    await this.sendEmail(emailData);
    console.log(`Payment completed email sent to ${context.user.email}`);
  }

  // === PAYMENT FAILED EMAIL ===
  async sendPaymentFailedEmail(context: PaymentStatusMailingContext): Promise<void> {
    try {
      const bookingName = 'property' in context.booking ? context.booking.property.name : context.booking.tour.title;

      console.log(`[BREVO] Preparing to send payment failed email to ${context.user.email} for booking ${context.booking.id}`);

      const emailData: BrevoEmailData = {
        sender: this.defaultSender,
        to: [{ email: context.user.email, name: `${context.user.firstName} ${context.user.lastName}` }],
        subject: `Payment Failed - Action Required for ${bookingName}`,
        htmlContent: this.getPaymentFailedTemplate(context),
        textContent: this.getPaymentFailedTextTemplate(context)
      };

      await this.sendEmail(emailData);
      console.log(`[BREVO] ✅ Payment failed email sent successfully to ${context.user.email}`);
    } catch (error: any) {
      console.error(`[BREVO] ❌ Failed to send payment failed email to ${context.user.email}:`, error.message);
      throw error;
    }
  }

  // === HOST/GUIDE NOTIFICATION EMAILS ===
  async sendNewBookingAlertToHost(context: PaymentStatusMailingContext): Promise<void> {
    const bookingName = 'property' in context.booking ? context.booking.property.name : context.booking.tour.title;
    const guestInfo = 'property' in context.booking ? context.booking.guest : context.booking.user;

    const emailData: BrevoEmailData = {
      sender: this.defaultSender,
      to: [{ email: context.user.email, name: `${context.user.firstName} ${context.user.lastName}` }],
      subject: `New Booking Request from ${guestInfo.firstName} ${guestInfo.lastName} - Payment Pending`,
      htmlContent: this.getHostNewBookingTemplate(context),
      textContent: this.getHostNewBookingTextTemplate(context)
    };

    await this.sendEmail(emailData);
    console.log(`New booking alert sent to host/guide ${context.user.email}`);
  }

  async sendPaymentConfirmedToHost(context: PaymentStatusMailingContext): Promise<void> {
    const bookingName = 'property' in context.booking ? context.booking.property.name : context.booking.tour.title;
    const guestInfo = 'property' in context.booking ? context.booking.guest : context.booking.user;

    const emailData: BrevoEmailData = {
      sender: this.defaultSender,
      to: [{ email: context.user.email, name: `${context.user.firstName} ${context.user.lastName}` }],
      subject: `Payment Confirmed - Booking by ${guestInfo.firstName} ${guestInfo.lastName} is Ready for Confirmation`,
      htmlContent: this.getHostPaymentConfirmedTemplate(context),
      textContent: this.getHostPaymentConfirmedTextTemplate(context)
    };

    await this.sendEmail(emailData);
    console.log(`Payment confirmed notification sent to host/guide ${context.user.email}`);
  }

  // === EMAIL TEMPLATES ===
  private getBaseTemplate(): string {
    return `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #374151; background: #f9fafb; }
        .email-wrapper { width: 100%; max-width: 600px; margin: 0 auto; padding: 20px; }
        .email-container { background: #ffffff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08); border: 1px solid #e5e7eb; overflow: hidden; }
        .header { background: linear-gradient(135deg, #083A85 0%, #0a4499 100%); padding: 32px 24px; text-align: center; color: white; }
        .logo { font-size: 24px; font-weight: 600; margin-bottom: 6px; }
        .header-subtitle { font-size: 14px; font-weight: 400; opacity: 0.9; }
        .content { padding: 32px 24px; }
        .greeting { font-size: 20px; font-weight: 600; color: #111827; margin-bottom: 16px; }
        .message { font-size: 15px; line-height: 1.8; color: #4b5563; margin-bottom: 20px; }
        .button { display: inline-block; background: #083A85; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; text-align: center; margin: 10px 0; }
        .button:hover { background: #0a4499; }
        .button-center { text-align: center; margin: 24px 0; }

        /* Better Table Styling */
        .info-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; margin: 24px 0; }
        .info-card-header { font-weight: 600; color: #374151; margin-bottom: 16px; font-size: 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; }
        .info-table { width: 100%; border-collapse: separate; border-spacing: 0; }
        .info-table tr { border-bottom: 1px solid #f1f5f9; }
        .info-table tr:last-child { border-bottom: none; }
        .info-table td { padding: 12px 8px; font-size: 14px; vertical-align: top; }
        .info-table td:first-child { font-weight: 500; color: #374151; width: 40%; }
        .info-table td:last-child { color: #6b7280; text-align: right; }

        .alert-box { border-radius: 8px; padding: 18px; margin: 24px 0; border-left: 4px solid; }
        .alert-success { background: #f0fdf4; border-left-color: #22c55e; color: #15803d; }
        .alert-warning { background: #fffbeb; border-left-color: #f59e0b; color: #d97706; }
        .alert-error { background: #fef2f2; border-left-color: #ef4444; color: #dc2626; }
        .alert-info { background: #eff6ff; border-left-color: #3b82f6; color: #1e40af; }
        .alert-title { font-weight: 600; margin-bottom: 8px; font-size: 15px; }
        .alert-text { font-size: 14px; line-height: 1.6; }

        .footer { background: #f9fafb; color: #6b7280; padding: 24px; text-align: center; border-top: 1px solid #e5e7eb; }
        .footer-text { font-size: 13px; line-height: 1.6; }

        @media (max-width: 600px) {
          .email-wrapper { padding: 10px; }
          .content { padding: 24px 16px; }
          .header { padding: 24px 16px; }
          .footer { padding: 20px 16px; }
          .info-table td { padding: 10px 4px; font-size: 13px; }
          .info-table td:first-child { width: 45%; }
        }
      </style>
    `;
  }

  private getBookingDetailsTable(booking: PropertyBookingInfo | TourBookingInfo, paymentReference?: string): string {
    if ('property' in booking) {
      return `
        <table class="info-table">
          <tr><td>Booking ID</td><td>${booking.id.toUpperCase()}</td></tr>
          ${paymentReference ? `<tr><td>Payment Reference</td><td><strong>${paymentReference}</strong></td></tr>` : ''}
          <tr><td>Property</td><td>${booking.property.name}</td></tr>
          <tr><td>Location</td><td>${booking.property.location}</td></tr>
          <tr><td>Check-in</td><td>${new Date(booking.checkIn).toLocaleDateString()}</td></tr>
          <tr><td>Check-out</td><td>${new Date(booking.checkOut).toLocaleDateString()}</td></tr>
          <tr><td>Guests</td><td>${booking.guests}</td></tr>
          <tr><td>Total Price</td><td><strong>${booking.totalPrice.toFixed(2)} USD</strong></td></tr>
        </table>
      `;
    } else {
      return `
        <table class="info-table">
          <tr><td>Booking ID</td><td>${booking.id.toUpperCase()}</td></tr>
          ${paymentReference ? `<tr><td>Payment Reference</td><td><strong>${paymentReference}</strong></td></tr>` : ''}
          <tr><td>Tour</td><td>${booking.tour.title}</td></tr>
          <tr><td>Location</td><td>${booking.tour.location}</td></tr>
          <tr><td>Date</td><td>${new Date(booking.schedule.startDate).toLocaleDateString()}</td></tr>
          <tr><td>Time</td><td>${booking.schedule.startTime}</td></tr>
          <tr><td>Participants</td><td>${booking.numberOfParticipants}</td></tr>
          <tr><td>Total Amount</td><td><strong>${booking.totalAmount.toFixed(2)} ${booking.currency}</strong></td></tr>
        </table>
      `;
    }
  }

  // BOOKING RECEIVED TEMPLATE
  private getBookingReceivedTemplate(context: PaymentStatusMailingContext): string {
    const { user, company, booking, paymentReference } = context;
    const detailsTable = this.getBookingDetailsTable(booking, paymentReference);

    return `
      <!DOCTYPE html><html><head>${this.getBaseTemplate()}</head><body>
        <div class="email-wrapper"><div class="email-container">
          <div class="header">
            <div class="logo">${company.name}</div>
            <div class="header-subtitle">Booking Request Received</div>
          </div>
          <div class="content">
            <div class="greeting">Hi ${user.firstName}!</div>
            <div class="message">
              Thank you for choosing ${company.name}! We've received your booking request.
              <strong>Please complete your payment to secure your reservation.</strong>
            </div>
            <div class="alert-box alert-warning">
              <div class="alert-title">⏰ Action Required: Complete Payment</div>
              <div class="alert-text">
                Your booking is currently pending payment. Please complete your payment within 24 hours to confirm your reservation.
                If payment is not received, this booking will be automatically cancelled.
              </div>
            </div>
            <div class="info-card">
              <div class="info-card-header">📋 Booking Summary</div>
              ${detailsTable}
            </div>
            <div class="button-center">
              <a href="https://app.jambolush.com/view-details?ref=${encodeURIComponent(booking.id.toUpperCase())}&type=booking" class="button">View Booking Details</a>
            </div>
            <div class="message" style="margin-top: 24px; font-size: 14px; color: #6b7280;">
              <strong>What happens next?</strong><br>
              1. Complete your payment<br>
              2. Your host/guide will confirm your booking<br>
              3. You'll receive a confirmation email with all details
            </div>
          </div>
          <div class="footer">
            <div class="footer-text">
              Questions? Contact us at ${company.supportEmail}<br>
              © ${new Date().getFullYear()} ${company.name}. All rights reserved.
            </div>
          </div>
        </div></div>
      </body></html>
    `;
  }

  // PAYMENT COMPLETED TEMPLATE
  private getPaymentCompletedTemplate(context: PaymentStatusMailingContext): string {
    const { user, company, booking, paymentReference } = context;
    const detailsTable = this.getBookingDetailsTable(booking, paymentReference);

    return `
      <!DOCTYPE html><html><head>${this.getBaseTemplate()}</head><body>
        <div class="email-wrapper"><div class="email-container">
          <div class="header">
            <div class="logo">${company.name}</div>
            <div class="header-subtitle">🎉 Booking Confirmed!</div>
          </div>
          <div class="content">
            <div class="greeting">Excellent News, ${user.firstName}!</div>
            <div class="alert-box alert-success">
              <div class="alert-title">✅ Payment Received & Booking Confirmed</div>
              <div class="alert-text">
                Your payment has been successfully processed and your booking is now confirmed!
                Get ready for an amazing experience!
              </div>
            </div>
            <div class="info-card">
              <div class="info-card-header">📋 Confirmed Booking Details</div>
              ${detailsTable}
            </div>
            <div class="message">
              Your host/guide will be in touch with check-in details and any special instructions.
              You can view your full booking details and contact information anytime from your dashboard.
            </div>
            <div class="button-center">
              <a href="https://app.jambolush.com/view-details?ref=${encodeURIComponent(booking.id.toUpperCase())}&type=booking" class="button">View Booking Details</a>
            </div>
          </div>
          <div class="footer">
            <div class="footer-text">
              We're excited to host you!<br>
              © ${new Date().getFullYear()} ${company.name}. All rights reserved.
            </div>
          </div>
        </div></div>
      </body></html>
    `;
  }

  // PAYMENT FAILED TEMPLATE
  private getPaymentFailedTemplate(context: PaymentStatusMailingContext): string {
    const { user, company, booking, failureReason, paymentReference } = context;

    return `
      <!DOCTYPE html><html><head>${this.getBaseTemplate()}</head><body>
        <div class="email-wrapper"><div class="email-container">
          <div class="header">
            <div class="logo">${company.name}</div>
            <div class="header-subtitle">Payment Issue</div>
          </div>
          <div class="content">
            <div class="greeting">Hi ${user.firstName},</div>
            <div class="alert-box alert-error">
              <div class="alert-title">❌ Payment Could Not Be Processed</div>
              <div class="alert-text">
                Unfortunately, we couldn't process your payment for booking ID ${booking.id.toUpperCase()}.
                ${paymentReference ? `<br><strong>Payment Reference:</strong> ${paymentReference}` : ''}
                ${failureReason ? `<br><br><strong>Reason:</strong> ${failureReason}` : ''}
              </div>
            </div>
            <div class="message">
              Don't worry! You can try again with a different payment method or contact our support team for assistance.
            </div>
            <div class="button-center">
              <a href="https://app.jambolush.com/view-details?ref=${encodeURIComponent(booking.id.toUpperCase())}&type=booking" class="button">View Booking & Retry Payment</a>
            </div>
          </div>
          <div class="footer">
            <div class="footer-text">
              Need help? Contact us at ${company.supportEmail}<br>
              © ${new Date().getFullYear()} ${company.name}. All rights reserved.
            </div>
          </div>
        </div></div>
      </body></html>
    `;
  }

  // HOST NEW BOOKING TEMPLATE
  private getHostNewBookingTemplate(context: PaymentStatusMailingContext): string {
    const { user, company, booking, paymentReference } = context;
    const guestInfo = 'property' in context.booking ? context.booking.guest : context.booking.user;
    const detailsTable = this.getBookingDetailsTable(booking, paymentReference);

    return `
      <!DOCTYPE html><html><head>${this.getBaseTemplate()}</head><body>
        <div class="email-wrapper"><div class="email-container">
          <div class="header">
            <div class="logo">${company.name}</div>
            <div class="header-subtitle">New Booking Request</div>
          </div>
          <div class="content">
            <div class="greeting">Hi ${user.firstName},</div>
            <div class="message">
              You have received a new booking request from <strong>${guestInfo.firstName} ${guestInfo.lastName}</strong>.
            </div>
            <div class="alert-box alert-info">
              <div class="alert-title">💰 Payment Status: Pending</div>
              <div class="alert-text">
                The guest has not yet completed payment. You will be notified when payment is confirmed
                so you can review and confirm the booking.
              </div>
            </div>
            <div class="info-card">
              <div class="info-card-header">📋 Booking Details</div>
              ${detailsTable}
            </div>
            <div class="message">
              You'll receive another notification once the guest completes payment, at which point you can
              confirm or decline the booking through your dashboard.
            </div>
          </div>
          <div class="footer">
            <div class="footer-text">
              © ${new Date().getFullYear()} ${company.name}. All rights reserved.
            </div>
          </div>
        </div></div>
      </body></html>
    `;
  }

  // HOST PAYMENT CONFIRMED TEMPLATE
  private getHostPaymentConfirmedTemplate(context: PaymentStatusMailingContext): string {
    const { user, company, booking, paymentReference } = context;
    const guestInfo = 'property' in context.booking ? context.booking.guest : context.booking.user;
    const detailsTable = this.getBookingDetailsTable(booking, paymentReference);

    return `
      <!DOCTYPE html><html><head>${this.getBaseTemplate()}</head><body>
        <div class="email-wrapper"><div class="email-container">
          <div class="header">
            <div class="logo">${company.name}</div>
            <div class="header-subtitle">Payment Confirmed - Action Required</div>
          </div>
          <div class="content">
            <div class="greeting">Great News, ${user.firstName}!</div>
            <div class="alert-box alert-success">
              <div class="alert-title">✅ Payment Received</div>
              <div class="alert-text">
                ${guestInfo.firstName} ${guestInfo.lastName} has completed payment for their booking.
                <strong>Please review and confirm this booking.</strong>
              </div>
            </div>
            <div class="info-card">
              <div class="info-card-header">📋 Booking Details</div>
              ${detailsTable}
            </div>
            <div class="message">
              <strong>Next Steps:</strong><br>
              1. Review the booking details<br>
              2. Confirm or decline the booking through your dashboard<br>
              3. If confirmed, provide check-in instructions to your guest
            </div>
            <div class="button-center">
              <a href="https://app.jambolush.com/view-details?ref=${encodeURIComponent(booking.id.toUpperCase())}&type=booking" class="button">Review & Confirm Booking</a>
            </div>
          </div>
          <div class="footer">
            <div class="footer-text">
              © ${new Date().getFullYear()} ${company.name}. All rights reserved.
            </div>
          </div>
        </div></div>
      </body></html>
    `;
  }

  // TEXT TEMPLATES
  private getBookingReceivedTextTemplate(context: PaymentStatusMailingContext): string {
    const booking = context.booking;
    const bookingName = 'property' in booking ? booking.property.name : booking.tour.title;

    return `
      Booking Request Received - Complete Your Payment

      Hi ${context.user.firstName},

      Thank you for choosing ${context.company.name}! We've received your booking request for ${bookingName}.

      IMPORTANT: Please complete your payment within 24 hours to secure your reservation.

      Booking ID: ${booking.id.toUpperCase()}
      ${context.paymentReference ? `Payment Reference: ${context.paymentReference}` : ''}

      View booking & complete payment: https://app.jambolush.com/view-details?ref=${encodeURIComponent(booking.id.toUpperCase())}&type=booking

      Questions? Contact us at ${context.company.supportEmail}
    `.trim();
  }

  private getPaymentCompletedTextTemplate(context: PaymentStatusMailingContext): string {
    return `
      Payment Confirmed - Booking Confirmed!

      Excellent news, ${context.user.firstName}!

      Your payment has been successfully processed and your booking (ID: ${context.booking.id.toUpperCase()}) is now confirmed!
      ${context.paymentReference ? `Payment Reference: ${context.paymentReference}` : ''}

      View booking details: https://app.jambolush.com/view-details?ref=${encodeURIComponent(context.booking.id.toUpperCase())}&type=booking

      We're excited to host you!
    `.trim();
  }

  private getPaymentFailedTextTemplate(context: PaymentStatusMailingContext): string {
    return `
      Payment Failed - Action Required

      Hi ${context.user.firstName},

      Unfortunately, we couldn't process your payment for booking ID ${context.booking.id.toUpperCase()}.
      ${context.paymentReference ? `Payment Reference: ${context.paymentReference}` : ''}
      ${context.failureReason ? `\nReason: ${context.failureReason}` : ''}

      View booking & retry payment: https://app.jambolush.com/view-details?ref=${encodeURIComponent(context.booking.id.toUpperCase())}&type=booking

      Need help? Contact us at ${context.company.supportEmail}
    `.trim();
  }

  private getDepositReceivedTemplate(_context: PaymentStatusMailingContext): string {
    return ''; // Implement if needed for partial payments
  }

  private getDepositReceivedTextTemplate(_context: PaymentStatusMailingContext): string {
    return '';
  }

  private getHostNewBookingTextTemplate(context: PaymentStatusMailingContext): string {
    const guestInfo = 'property' in context.booking ? context.booking.guest : context.booking.user;

    return `
      New Booking Request (Payment Pending)

      Hi ${context.user.firstName},

      You have a new booking request from ${guestInfo.firstName} ${guestInfo.lastName}.

      Status: Awaiting guest payment
      Booking ID: ${context.booking.id.toUpperCase()}

      You'll be notified when payment is confirmed so you can review and confirm the booking.
    `.trim();
  }

  private getHostPaymentConfirmedTextTemplate(context: PaymentStatusMailingContext): string {
    const guestInfo = 'property' in context.booking ? context.booking.guest : context.booking.user;

    return `
      Payment Confirmed - Please Review Booking

      Hi ${context.user.firstName},

      ${guestInfo.firstName} ${guestInfo.lastName} has completed payment for booking ID ${context.booking.id.toUpperCase()}.

      Please review and confirm this booking: https://app.jambolush.com/view-details?ref=${encodeURIComponent(context.booking.id.toUpperCase())}&type=booking
    `.trim();
  }
}