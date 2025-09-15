// src/services/brevo.booking.ts
import axios from 'axios';
import { config } from '../config/config';
import { PropertyBookingInfo, TourBookingInfo } from '../types/booking.types';

interface BrevoEmailData {
  sender: {
    name: string;
    email: string;
  };
  to: Array<{
    email: string;
    name?: string;
  }>;
  subject: string;
  htmlContent: string;
  textContent?: string;
  templateId?: number;
  params?: Record<string, any>;
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

export interface BookingMailingContext {
  user: UserInfo; // The primary recipient (guest, host, guide)
  company: CompanyInfo;
  booking: PropertyBookingInfo | TourBookingInfo;
  recipientType: 'guest' | 'host' | 'guide';
  cancellationReason?: string; // Optional for cancellation emails
}

// --- BOOKING MAILING SERVICE CLASS ---

export class BrevoBookingMailingService {
  private apiKey: string;
  private apiUrl = 'https://api.brevo.com/v3';
  private defaultSender: { name: string; email: string };

  constructor() {
    this.apiKey = config.brevoApiKey;
    this.defaultSender = {
      name: 'Jambolush Bookings',
      email: config.brevoSenderEmail
    };
  }

  private async makeRequest(endpoint: string, data: any, method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'POST') {
    try {
      const response = await axios({
        method,
        url: `${this.apiUrl}${endpoint}`,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'api-key': this.apiKey
        },
        data
      });
      return response.data;
    } catch (error: any) {
      console.error('Brevo API Error:', error.response?.data || error.message);
      throw new Error(`Failed to send booking email: ${error.response?.data?.message || error.message}`);
    }
  }

  // --- BOOKING EMAIL METHODS ---

  /**
   * Sends an email confirming a new booking to the guest.
   */
  async sendBookingConfirmationEmail(context: BookingMailingContext): Promise<void> {
    const bookingName = 'property' in context.booking ? context.booking.property.name : context.booking.tour.title;

    const emailData: BrevoEmailData = {
      sender: this.defaultSender,
      to: [{ email: context.user.email, name: `${context.user.firstName} ${context.user.lastName}` }],
      subject: `Your Booking is Confirmed: ${bookingName}!`,
      htmlContent: this.getBookingConfirmationTemplate(context),
      textContent: this.getBookingConfirmationTextTemplate(context)
    };

    await this.makeRequest('/smtp/email', emailData);
    console.log(`Booking confirmation email sent to ${context.user.email}`);
  }

  /**
   * Sends a notification to a host or tour guide about a new booking.
   */
  async sendNewBookingNotification(context: BookingMailingContext): Promise<void> {
    const bookingType = 'property' in context.booking ? 'Property' : 'Tour';
    const guestName = 'property' in context.booking 
        ? `${context.booking.guest.firstName} ${context.booking.guest.lastName}`
        : `${context.booking.user.firstName} ${context.booking.user.lastName}`;

    const emailData: BrevoEmailData = {
      sender: this.defaultSender,
      to: [{ email: context.user.email, name: `${context.user.firstName} ${context.user.lastName}` }],
      subject: `New ${bookingType} Booking Request from ${guestName}`,
      htmlContent: this.getNewBookingNotificationTemplate(context),
      textContent: this.getNewBookingNotificationTextTemplate(context)
    };

    await this.makeRequest('/smtp/email', emailData);
    console.log(`New booking notification sent to ${context.user.email}`);
  }

  /**
   * Sends a cancellation confirmation to the relevant user (guest, host, etc.).
   */
  async sendBookingCancellationEmail(context: BookingMailingContext): Promise<void> {
    const bookingName = 'property' in context.booking ? context.booking.property.name : context.booking.tour.title;

    const emailData: BrevoEmailData = {
      sender: this.defaultSender,
      to: [{ email: context.user.email, name: `${context.user.firstName} ${context.user.lastName}` }],
      subject: `Cancellation Confirmation for your booking at ${bookingName}`,
      htmlContent: this.getBookingCancellationTemplate(context),
      textContent: this.getBookingCancellationTextTemplate(context)
    };

    await this.makeRequest('/smtp/email', emailData);
    console.log(`Booking cancellation email sent to ${context.user.email}`);
  }

  /**
   * Sends a reminder email to the guest before their check-in or tour date.
   */
  async sendBookingReminderEmail(context: BookingMailingContext): Promise<void> {
    const bookingName = 'property' in context.booking ? context.booking.property.name : context.booking.tour.title;

    const emailData: BrevoEmailData = {
      sender: this.defaultSender,
      to: [{ email: context.user.email, name: `${context.user.firstName} ${context.user.lastName}` }],
      subject: `Reminder: Your upcoming booking for ${bookingName}`,
      htmlContent: this.getBookingReminderTemplate(context),
      textContent: this.getBookingReminderTextTemplate(context)
    };

    await this.makeRequest('/smtp/email', emailData);
    console.log(`Booking reminder email sent to ${context.user.email}`);
  }

  // --- MODERNIZED EMAIL TEMPLATES ---
  
  // Base template (styles) remains the same as in brevo.auth.ts
  private getBaseTemplate(): string {
    // This function would contain the exact same CSS content as brevo.auth.ts
    // For brevity, it is omitted here but should be copied directly.
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
          background-color: #f9fafb;
        }
        
        .email-wrapper {
          max-width: 600px;
          margin: 0 auto;
          background-color: #f9fafb;
          padding: 20px;
        }
        
        .email-container {
          background: white;
          border-radius: 20px;
          overflow: hidden;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
          border: 1px solid #e5e7eb;
        }
        
        .header {
          background: linear-gradient(135deg, #083A85 0%, #0a4499 100%);
          padding: 40px 30px;
          text-align: center;
          color: white;
        }
        
        .logo {
          font-size: 28px;
          font-weight: 700;
          margin-bottom: 8px;
          letter-spacing: -0.025em;
        }
        
        .header-subtitle {
          font-size: 16px;
          font-weight: 400;
          opacity: 0.9;
        }
        
        .content {
          padding: 40px 30px;
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
        
        .highlight-box {
          background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
          border: 2px solid #083A85;
          border-radius: 16px;
          padding: 24px;
          margin: 24px 0;
          text-align: center;
        }
        
        .verification-code {
          font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
          font-size: 32px;
          font-weight: 700;
          color: #083A85;
          letter-spacing: 6px;
          margin: 12px 0;
        }
        
        .code-label {
          font-size: 14px;
          font-weight: 500;
          color: #6b7280;
          margin-bottom: 8px;
        }
        
        .code-expiry {
          font-size: 14px;
          color: #9ca3af;
          margin-top: 8px;
        }
        
        .button {
          display: inline-block;
          background: linear-gradient(135deg, #083A85 0%, #0a4499 100%);
          color: white;
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
        }
        
        .button-center {
          text-align: center;
          margin: 32px 0;
        }
        
        .info-card {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 20px;
          margin: 24px 0;
        }
        
        .info-card-header {
          display: flex;
          align-items: center;
          font-weight: 600;
          color: #374151;
          margin-bottom: 16px;
          font-size: 15px;
        }
        
        .info-card-icon {
          margin-right: 8px;
          font-size: 18px;
        }
        
        .info-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 0;
          border-bottom: 1px solid #f1f5f9;
        }
        
        .info-row:last-child {
          border-bottom: none;
        }
        
        .info-label {
          font-weight: 500;
          color: #374151;
          font-size: 14px;
        }
        
        .info-value {
          font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
          color: #6b7280;
          font-size: 14px;
          text-align: right;
        }
        
        .alert-box {
          border-radius: 12px;
          padding: 20px;
          margin: 24px 0;
          border-left: 4px solid;
        }
        
        .alert-success {
          background: #f0fdf4;
          border-left-color: #22c55e;
          color: #15803d;
        }
        
        .alert-warning {
          background: #fffbeb;
          border-left-color: #f59e0b;
          color: #d97706;
        }
        
        .alert-error {
          background: #fef2f2;
          border-left-color: #ef4444;
          color: #dc2626;
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
        
        .divider {
          height: 1px;
          background: linear-gradient(90deg, transparent, #e5e7eb, transparent);
          margin: 32px 0;
        }
        
        .footer {
          background: #083A85;
          color: white;
          padding: 32px 30px;
          text-align: center;
        }
        
        .footer-links {
          margin-bottom: 20px;
        }
        
        .footer-links a {
          color: #93c5fd;
          text-decoration: none;
          margin: 0 12px;
          font-weight: 500;
          font-size: 14px;
        }
        
        .footer-links a:hover {
          color: white;
        }
        
        .footer-text {
          font-size: 13px;
          color: #cbd5e1;
          line-height: 1.5;
        }
        
        .security-badge {
          display: inline-flex;
          align-items: center;
          background: #dbeafe;
          color: #1e40af;
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 13px;
          font-weight: 500;
          margin-top: 16px;
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
        }
        
        .feature-list li:before {
          content: "✓";
          color: #22c55e;
          font-weight: bold;
          margin-right: 8px;
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
          
          .verification-code {
            font-size: 28px;
            letter-spacing: 4px;
          }
          
          .greeting {
            font-size: 20px;
          }
          
          .info-row {
            flex-direction: column;
            align-items: flex-start;
            gap: 4px;
          }
          
          .info-value {
            text-align: left;
          }
        }
      </style>
    `;
  }

  private getBookingDetailsHtml(booking: PropertyBookingInfo | TourBookingInfo): string {
    if ('property' in booking) { // Property Booking
      return `
        <div class="info-row"><span class="info-label">Booking ID</span><span class="info-value">${booking.id}</span></div>
        <div class="info-row"><span class="info-label">Property</span><span class="info-value">${booking.property.name}</span></div>
        <div class="info-row"><span class="info-label">Location</span><span class="info-value">${booking.property.location}</span></div>
        <div class="info-row"><span class="info-label">Check-in</span><span class="info-value">${new Date(booking.checkIn).toDateString()}</span></div>
        <div class="info-row"><span class="info-label">Check-out</span><span class="info-value">${new Date(booking.checkOut).toDateString()}</span></div>
        <div class="info-row"><span class="info-label">Guests</span><span class="info-value">${booking.guests}</span></div>
        <div class="info-row"><span class="info-label">Total Price</span><span class="info-value">$${booking.totalPrice.toFixed(2)}</span></div>
      `;
    } else { // Tour Booking
      return `
        <div class="info-row"><span class="info-label">Booking ID</span><span class="info-value">${booking.id}</span></div>
        <div class="info-row"><span class="info-label">Tour</span><span class="info-value">${booking.tour.title}</span></div>
        <div class="info-row"><span class="info-label">Location</span><span class="info-value">${booking.tour.location}</span></div>
        <div class="info-row"><span class="info-label">Date</span><span class="info-value">${new Date(booking.schedule.startDate).toDateString()}</span></div>
        <div class="info-row"><span class="info-label">Time</span><span class="info-value">${booking.schedule.startTime}</span></div>
        <div class="info-row"><span class="info-label">Participants</span><span class="info-value">${booking.numberOfParticipants}</span></div>
        <div class="info-row"><span class="info-label">Total Amount</span><span class="info-value">$${booking.totalAmount.toFixed(2)} ${booking.currency}</span></div>
      `;
    }
  }

  private getBookingConfirmationTemplate(context: BookingMailingContext): string {
    const { user, company, booking } = context;
    const bookingDetailsHtml = this.getBookingDetailsHtml(booking);

    return `
      <!DOCTYPE html><html><head>${this.getBaseTemplate()}</head><body>
        <div class="email-wrapper"><div class="email-container">
          <div class="header">
            <div class="logo">${company.name}</div><div class="header-subtitle">Your Booking is Confirmed!</div>
          </div>
          <div class="content">
            <div class="greeting">Get Ready, ${user.firstName}!</div>
            <div class="message">
              We are delighted to confirm your booking. An amazing experience awaits you! Here are your booking details:
            </div>
            <div class="info-card">
              <div class="info-card-header"><span class="info-card-icon">📄</span>Booking Summary</div>
              ${bookingDetailsHtml}
            </div>
            <div class="message">
              You can view your full booking details, manage your reservation, or contact the host/guide through your dashboard.
            </div>
            <div class="button-center">
              <a href="${company.website}/bookings/${booking.id}" class="button">View My Booking</a>
            </div>
          </div>
          <div class="footer">
            <div class="footer-text">
              Questions? Contact our support team at ${company.supportEmail}<br>
              © ${new Date().getFullYear()} ${company.name}.
            </div>
          </div>
        </div></div>
      </body></html>
    `;
  }

  private getNewBookingNotificationTemplate(context: BookingMailingContext): string {
    const { user, company, booking } = context;
    const guestInfo = 'property' in booking ? booking.guest : booking.user;
    const bookingDetailsHtml = this.getBookingDetailsHtml(booking);

    return `
      <!DOCTYPE html><html><head>${this.getBaseTemplate()}</head><body>
        <div class="email-wrapper"><div class="email-container">
          <div class="header">
            <div class="logo">${company.name}</div><div class="header-subtitle">You Have a New Booking!</div>
          </div>
          <div class="content">
            <div class="greeting">Congratulations, ${user.firstName}!</div>
            <div class="message">
              You have received a new booking from ${guestInfo.firstName} ${guestInfo.lastName}. Please review the details below.
            </div>
            <div class="info-card">
              <div class="info-card-header"><span class="info-card-icon">🔔</span>New Booking Details</div>
              ${bookingDetailsHtml}
            </div>
            <div class="message">
              Please respond to this booking request promptly via your dashboard to confirm or decline.
            </div>
            <div class="button-center">
              <a href="${company.website}/dashboard/bookings/${booking.id}" class="button">Manage Booking</a>
            </div>
          </div>
          <div class="footer">
             <div class="footer-text">
              This notification was sent to ${user.email}<br>
              © ${new Date().getFullYear()} ${company.name}.
            </div>
          </div>
        </div></div>
      </body></html>
    `;
  }

  private getBookingCancellationTemplate(context: BookingMailingContext): string {
    const { user, company, booking } = context;

    return `
      <!DOCTYPE html><html><head>${this.getBaseTemplate()}</head><body>
        <div class="email-wrapper"><div class="email-container">
          <div class="header">
            <div class="logo">${company.name}</div><div class="header-subtitle">Booking Cancellation</div>
          </div>
          <div class="content">
            <div class="greeting">Booking Canceled</div>
            <div class="message">
              Hi ${user.firstName}, this email confirms that your booking (ID: ${booking.id}) has been successfully canceled.
            </div>
            <div class="alert-box alert-warning">
              <div class="alert-title">Cancellation Details</div>
              <div class="alert-text">
                ${context.cancellationReason || 'The booking has been canceled as per your request. Please check our cancellation policy regarding any applicable refunds.'}
              </div>
            </div>
            <div class="message">
              We're sorry to see you go. We hope you'll consider booking with us again in the future.
            </div>
            <div class="button-center">
              <a href="${company.website}" class="button">Explore Other Options</a>
            </div>
          </div>
          <div class="footer">
            <div class="footer-text">
              If you did not request this cancellation, please contact us immediately at ${company.supportEmail}.<br>
              © ${new Date().getFullYear()} ${company.name}.
            </div>
          </div>
        </div></div>
      </body></html>
    `;
  }

  private getBookingReminderTemplate(context: BookingMailingContext): string {
    const { user, company, booking } = context;
    const bookingDetailsHtml = this.getBookingDetailsHtml(booking);

    return `
      <!DOCTYPE html><html><head>${this.getBaseTemplate()}</head><body>
        <div class="email-wrapper"><div class="email-container">
          <div class="header">
            <div class="logo">${company.name}</div><div class="header-subtitle">Your Adventure is Almost Here!</div>
          </div>
          <div class="content">
            <div class="greeting">Friendly Reminder, ${user.firstName}!</div>
            <div class="message">
              This is a reminder about your upcoming booking. We're excited to host you! Here are the details to help you prepare:
            </div>
            <div class="info-card">
              <div class="info-card-header"><span class="info-card-icon">🗓️</span>Upcoming Booking</div>
              ${bookingDetailsHtml}
            </div>
            <div class="message">
              Please double-check any check-in instructions or tour requirements. If you have any questions, don't hesitate to reach out.
            </div>
            <div class="button-center">
              <a href="${company.website}/bookings/${booking.id}" class="button">View Full Details</a>
            </div>
          </div>
          <div class="footer">
            <div class="footer-text">
              We look forward to seeing you soon!<br>
              © ${new Date().getFullYear()} ${company.name}.
            </div>
          </div>
        </div></div>
      </body></html>
    `;
  }


  // --- TEXT TEMPLATES FOR FALLBACK ---
  
  private getBookingConfirmationTextTemplate(context: BookingMailingContext): string {
    const booking = context.booking;
    const bookingName = 'property' in booking ? booking.property.name : booking.tour.title;
    const dateLabel = 'property' in booking ? 'Check-in' : 'Date';
    const dateValue = 'property' in booking ? new Date(booking.checkIn).toDateString() : new Date(booking.schedule.startDate).toDateString();

    return `
      Booking Confirmed!

      Hi ${context.user.firstName},

      Your booking for ${bookingName} is confirmed.
      Booking ID: ${booking.id}
      ${dateLabel}: ${dateValue}

      View your booking details: ${context.company.website}/bookings/${booking.id}

      Thank you,
      The ${context.company.name} Team
    `.trim();
  }

  private getNewBookingNotificationTextTemplate(context: BookingMailingContext): string {
    const booking = context.booking;
    const bookingType = 'property' in booking ? 'Property' : 'Tour';
    const guestName = 'property' in booking 
        ? `${booking.guest.firstName} ${booking.guest.lastName}`
        : `${booking.user.firstName} ${booking.user.lastName}`;

    return `
      New Booking Request

      Hi ${context.user.firstName},

      You have a new ${bookingType} booking request from ${guestName}.
      Booking ID: ${booking.id}

      Please manage this booking from your dashboard: ${context.company.website}/dashboard/bookings/${booking.id}

      The ${context.company.name} Team
    `.trim();
  }
  
  private getBookingCancellationTextTemplate(context: BookingMailingContext): string {
    return `
      Booking Cancellation Confirmation

      Hi ${context.user.firstName},

      This email confirms the cancellation of your booking (ID: ${context.booking.id}).

      ${context.cancellationReason || 'If you have questions about refunds, please consult our cancellation policy or contact support.'}

      We hope to see you again soon.

      The ${context.company.name} Team
    `.trim();
  }

  private getBookingReminderTextTemplate(context: BookingMailingContext): string {
    const booking = context.booking;
    const bookingName = 'property' in booking ? booking.property.name : booking.tour.title;
    const dateLabel = 'property' in booking ? 'Check-in' : 'Date';
    const dateValue = 'property' in booking ? new Date(booking.checkIn).toDateString() : new Date(booking.schedule.startDate).toDateString();

    return `
      Booking Reminder

      Hi ${context.user.firstName},

      This is a friendly reminder for your upcoming booking at ${bookingName}.
      ${dateLabel}: ${dateValue}

      View full details here: ${context.company.website}/bookings/${booking.id}

      We look forward to seeing you!

      The ${context.company.name} Team
    `.trim();
  }
}