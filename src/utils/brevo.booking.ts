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

  private getBaseTemplate(): string {
    return `
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #374151; background: #f9fafb; padding: 10px; }
        .email-wrapper { width: 98%; max-width: 600px; margin: 0 auto; }
        .email-container { background: #ffffff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08); border: 1px solid #e5e7eb; overflow: hidden; }
        .header { background: linear-gradient(135deg, #083A85 0%, #0a4499 100%); padding: 32px 24px; text-align: center; color: white; }
        .logo { font-size: 24px; font-weight: 600; margin-bottom: 6px; }
        .header-subtitle { font-size: 14px; font-weight: 400; opacity: 0.9; }
        .content { padding: 28px 20px; background: #ffffff; }
        .greeting { font-size: 20px; font-weight: 600; color: #111827; margin-bottom: 16px; }
        .message { font-size: 15px; line-height: 1.6; color: #4b5563; margin-bottom: 20px; }
        .button { display: inline-block; background: #083A85; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 15px; text-align: center; }
        .button:hover { background: #0a4499; }
        .button-center { text-align: center; margin: 24px 0; }
        .info-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px; margin: 20px 0; }
        .info-card-header { display: flex; align-items: center; font-weight: 600; color: #374151; margin-bottom: 12px; font-size: 14px; }
        .info-card-icon { margin-right: 6px; font-size: 16px; }
        .info-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #f1f5f9; }
        .info-row:last-child { border-bottom: none; }
        .info-label { font-weight: 500; color: #374151; font-size: 13px; }
        .info-value { color: #6b7280; font-size: 13px; text-align: right; }
        .alert-box { border-radius: 8px; padding: 16px; margin: 20px 0; border-left: 3px solid; }
        .alert-success { background: #f0fdf4; border-left-color: #22c55e; color: #15803d; }
        .alert-warning { background: #fffbeb; border-left-color: #f59e0b; color: #d97706; }
        .alert-error { background: #fef2f2; border-left-color: #ef4444; color: #dc2626; }
        .alert-title { font-weight: 600; margin-bottom: 6px; font-size: 14px; }
        .alert-text { font-size: 13px; line-height: 1.5; }
        .divider { height: 1px; background: #e5e7eb; margin: 24px 0; }
        .footer { background: #083A85; color: white; padding: 24px 20px; text-align: center; }
        .footer-links { margin-bottom: 16px; }
        .footer-links a { color: rgba(255, 255, 255, 0.9); text-decoration: none; margin: 0 10px; font-weight: 500; font-size: 13px; }
        .footer-links a:hover { color: #ffffff; }
        .footer-text { font-size: 12px; color: #e5e7eb; line-height: 1.5; }
        .feature-list { list-style: none; padding: 0; margin: 14px 0; }
        .feature-list li { padding: 6px 0; color: #4b5563; font-size: 14px; }
        .feature-list li:before { content: "✓"; color: #22c55e; font-weight: bold; margin-right: 6px; }
        @media (max-width: 600px) {
          .email-wrapper { width: 100%; }
          .content { padding: 20px 16px; }
          .header { padding: 24px 16px; }
          .footer { padding: 20px 16px; }
          .greeting { font-size: 18px; }
          .info-row { flex-direction: column; align-items: flex-start; gap: 4px; padding: 8px 0; }
          .info-label { min-width: auto; }
          .info-value { text-align: left; }
        }
      </style>
    `;
  }

  private getBookingDetailsHtml(booking: PropertyBookingInfo | TourBookingInfo): string {
    if ('property' in booking) { // Property Booking
      return `
        <div class="info-row"><span class="info-label">Booking ID</span><span class="info-value">${booking.id.toUpperCase()}</span></div>
        <div class="info-row"><span class="info-label">Property</span><span class="info-value">${booking.property.name}</span></div>
        <div class="info-row"><span class="info-label">Location</span><span class="info-value">${booking.property.location}</span></div>
        <div class="info-row"><span class="info-label">Check-in</span><span class="info-value">${new Date(booking.checkIn).toDateString()}</span></div>
        <div class="info-row"><span class="info-label">Check-out</span><span class="info-value">${new Date(booking.checkOut).toDateString()}</span></div>
        <div class="info-row"><span class="info-label">Guests</span><span class="info-value">${booking.guests}</span></div>
        <div class="info-row"><span class="info-label">Total Price</span><span class="info-value">$${booking.totalPrice.toFixed(2)}</span></div>
      `;
    } else { // Tour Booking
      return `
        <div class="info-row"><span class="info-label">Booking ID</span><span class="info-value">${booking.id.toUpperCase()}</span></div>
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
              <a href="https://app.jambolush.com/view-details?ref=${encodeURIComponent(booking.id.toUpperCase())}&type=booking" class="button">View My Booking</a>
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
              <a href="https://app.jambolush.com/view-details?ref=${encodeURIComponent(booking.id.toUpperCase())}&type=booking" class="button">Manage Booking</a>
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
              Hi ${user.firstName}, this email confirms that your booking (ID: ${booking.id.toUpperCase()}) has been successfully canceled.
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
              <a href="https://app.jambolush.com/view-details?ref=${encodeURIComponent(booking.id.toUpperCase())}&type=booking" class="button">View Cancelled Booking</a>
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
              <a href="https://app.jambolush.com/view-details?ref=${encodeURIComponent(booking.id.toUpperCase())}&type=booking" class="button">View Full Details</a>
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
      Booking ID: ${booking.id.toUpperCase()}
      ${dateLabel}: ${dateValue}

      View your booking details: https://app.jambolush.com/view-details?ref=${encodeURIComponent(booking.id.toUpperCase())}&type=booking

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
      Booking ID: ${booking.id.toUpperCase()}

      Please manage this booking from your dashboard: https://app.jambolush.com/view-details?ref=${encodeURIComponent(booking.id.toUpperCase())}&type=booking

      The ${context.company.name} Team
    `.trim();
  }
  
  private getBookingCancellationTextTemplate(context: BookingMailingContext): string {
    return `
      Booking Cancellation Confirmation

      Hi ${context.user.firstName},

      This email confirms the cancellation of your booking (ID: ${context.booking.id.toUpperCase()}).

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

      View full details here: https://app.jambolush.com/view-details?ref=${encodeURIComponent(booking.id.toUpperCase())}&type=booking

      We look forward to seeing you!

      The ${context.company.name} Team
    `.trim();
  }

  // --- USER NOTIFICATION: BOOKING EXPIRED ---
  async sendBookingExpiredNotification(data: {
    userEmail: string;
    userName: string;
    bookingId: string;
    propertyName: string;
    checkIn: string;
    checkOut: string;
    totalPrice: number;
    timeoutMinutes: number;
  }): Promise<void> {
    const emailData: BrevoEmailData = {
      sender: this.defaultSender,
      to: [{
        email: data.userEmail,
        name: data.userName
      }],
      subject: `⏰ Booking Expired - ${data.propertyName}`,
      htmlContent: this.buildBookingExpiredHtmlContent(data),
      textContent: this.buildBookingExpiredTextContent(data)
    };

    await this.makeRequest('/smtp/email', emailData);
    console.log(`Booking expiration notification sent to ${data.userEmail}`);
  }

  private buildBookingExpiredHtmlContent(data: {
    userName: string;
    bookingId: string;
    propertyName: string;
    checkIn: string;
    checkOut: string;
    totalPrice: number;
    timeoutMinutes: number;
  }): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #ff6b35; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
          .info-box { background-color: white; padding: 15px; margin: 15px 0; border-left: 4px solid #ff6b35; }
          .button { display: inline-block; padding: 12px 24px; background-color: #083A85; color: white; text-decoration: none; border-radius: 5px; margin: 15px 0; }
          .footer { text-align: center; padding: 20px; color: #777; font-size: 12px; }
          .alert { background-color: #fff3cd; border: 1px solid #ffc107; padding: 12px; margin: 15px 0; border-radius: 4px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>⏰ Booking Expired</h1>
          </div>
          <div class="content">
            <p>Hi ${data.userName},</p>

            <div class="alert">
              <strong>⚠️ Your booking reservation has expired</strong><br>
              Payment was not completed within ${data.timeoutMinutes} minutes.
            </div>

            <p>Your booking request for <strong>${data.propertyName}</strong> could not be confirmed because payment was not received within the required time frame.</p>

            <div class="info-box">
              <h3>Booking Details</h3>
              <p><strong>Booking ID:</strong> ${data.bookingId.toUpperCase()}</p>
              <p><strong>Property:</strong> ${data.propertyName}</p>
              <p><strong>Check-in:</strong> ${new Date(data.checkIn).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
              <p><strong>Check-out:</strong> ${new Date(data.checkOut).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
              <p><strong>Total Price:</strong> $${data.totalPrice.toFixed(2)}</p>
            </div>

            <h3>What Happens Now?</h3>
            <ul>
              <li>The dates you selected are now available for other guests</li>
              <li>You can create a new booking if you'd still like to reserve this property</li>
              <li>Complete payment within ${data.timeoutMinutes} minutes to secure your reservation</li>
            </ul>

            <div style="text-align: center;">
              <a href="https://jambolush.com/properties/${data.propertyName.toLowerCase().replace(/\s+/g, '-')}" class="button">
                Book Again
              </a>
            </div>

            <p style="margin-top: 20px;">If you have any questions or need assistance, please contact our support team.</p>

            <div class="footer">
              <p>Thank you for choosing Jambolush!</p>
              <p>© ${new Date().getFullYear()} Jambolush. All rights reserved.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private buildBookingExpiredTextContent(data: {
    userName: string;
    bookingId: string;
    propertyName: string;
    checkIn: string;
    checkOut: string;
    totalPrice: number;
    timeoutMinutes: number;
  }): string {
    return `
      BOOKING EXPIRED

      Hi ${data.userName},

      Your booking request for ${data.propertyName} has expired because payment was not completed within ${data.timeoutMinutes} minutes.

      BOOKING DETAILS
      ================
      Booking ID: ${data.bookingId.toUpperCase()}
      Property: ${data.propertyName}
      Check-in: ${new Date(data.checkIn).toLocaleDateString()}
      Check-out: ${new Date(data.checkOut).toLocaleDateString()}
      Total Price: $${data.totalPrice.toFixed(2)}

      WHAT HAPPENS NOW?
      - The dates you selected are now available for other guests
      - You can create a new booking if you'd still like to reserve this property
      - Complete payment within ${data.timeoutMinutes} minutes to secure your reservation

      Book again at: https://jambolush.com

      If you have any questions, please contact our support team.

      Thank you for choosing Jambolush!
      © ${new Date().getFullYear()} Jambolush. All rights reserved.
    `.trim();
  }

  // --- USER NOTIFICATION: TOUR BOOKING EXPIRED ---
  async sendTourBookingExpiredNotification(data: {
    userEmail: string;
    userName: string;
    bookingId: string;
    tourName: string;
    tourDate: string;
    totalAmount: number;
    currency: string;
    timeoutMinutes: number;
  }): Promise<void> {
    const emailData: BrevoEmailData = {
      sender: this.defaultSender,
      to: [{
        email: data.userEmail,
        name: data.userName
      }],
      subject: `⏰ Tour Booking Expired - ${data.tourName}`,
      htmlContent: this.buildTourBookingExpiredHtmlContent(data),
      textContent: this.buildTourBookingExpiredTextContent(data)
    };

    await this.makeRequest('/smtp/email', emailData);
    console.log(`Tour booking expiration notification sent to ${data.userEmail}`);
  }

  private buildTourBookingExpiredHtmlContent(data: {
    userName: string;
    bookingId: string;
    tourName: string;
    tourDate: string;
    totalAmount: number;
    currency: string;
    timeoutMinutes: number;
  }): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #ff6b35; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
          .info-box { background-color: white; padding: 15px; margin: 15px 0; border-left: 4px solid #ff6b35; }
          .button { display: inline-block; padding: 12px 24px; background-color: #083A85; color: white; text-decoration: none; border-radius: 5px; margin: 15px 0; }
          .footer { text-align: center; padding: 20px; color: #777; font-size: 12px; }
          .alert { background-color: #fff3cd; border: 1px solid #ffc107; padding: 12px; margin: 15px 0; border-radius: 4px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>⏰ Tour Booking Expired</h1>
          </div>
          <div class="content">
            <p>Hi ${data.userName},</p>

            <div class="alert">
              <strong>⚠️ Your tour booking reservation has expired</strong><br>
              Payment was not completed within ${data.timeoutMinutes} minutes.
            </div>

            <p>Your booking request for <strong>${data.tourName}</strong> could not be confirmed because payment was not received within the required time frame.</p>

            <div class="info-box">
              <h3>Booking Details</h3>
              <p><strong>Booking ID:</strong> ${data.bookingId.toUpperCase()}</p>
              <p><strong>Tour:</strong> ${data.tourName}</p>
              <p><strong>Tour Date:</strong> ${new Date(data.tourDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
              <p><strong>Total Amount:</strong> ${data.totalAmount.toFixed(2)} ${data.currency}</p>
            </div>

            <h3>What Happens Now?</h3>
            <ul>
              <li>Your reserved spots have been released and are now available for other guests</li>
              <li>You can create a new booking if you'd still like to join this tour</li>
              <li>Complete payment within ${data.timeoutMinutes} minutes to secure your spots</li>
            </ul>

            <div style="text-align: center;">
              <a href="https://jambolush.com/tours" class="button">
                Browse Tours
              </a>
            </div>

            <p style="margin-top: 20px;">If you have any questions or need assistance, please contact our support team.</p>

            <div class="footer">
              <p>Thank you for choosing Jambolush!</p>
              <p>© ${new Date().getFullYear()} Jambolush. All rights reserved.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private buildTourBookingExpiredTextContent(data: {
    userName: string;
    bookingId: string;
    tourName: string;
    tourDate: string;
    totalAmount: number;
    currency: string;
    timeoutMinutes: number;
  }): string {
    return `
      TOUR BOOKING EXPIRED

      Hi ${data.userName},

      Your tour booking request for ${data.tourName} has expired because payment was not completed within ${data.timeoutMinutes} minutes.

      BOOKING DETAILS
      ================
      Booking ID: ${data.bookingId.toUpperCase()}
      Tour: ${data.tourName}
      Tour Date: ${new Date(data.tourDate).toLocaleDateString()}
      Total Amount: ${data.totalAmount.toFixed(2)} ${data.currency}

      WHAT HAPPENS NOW?
      - Your reserved spots have been released and are now available for other guests
      - You can create a new booking if you'd still like to join this tour
      - Complete payment within ${data.timeoutMinutes} minutes to secure your spots

      Browse tours at: https://jambolush.com/tours

      If you have any questions, please contact our support team.

      Thank you for choosing Jambolush!
      © ${new Date().getFullYear()} Jambolush. All rights reserved.
    `.trim();
  }

  // --- ADMIN NOTIFICATION: EXPIRED BOOKINGS ---
  async sendExpiredBookingsNotification(data: {
    adminEmail: string;
    adminName: string;
    propertyBookingsArchived: number;
    tourBookingsArchived: number;
    totalArchived: number;
    totalRemoved: number;
    timestamp: string;
    timeoutMinutes?: number;
  }): Promise<void> {
    const emailData: BrevoEmailData = {
      sender: this.defaultSender,
      to: [
        {
          email: data.adminEmail,
          name: data.adminName
        }
      ],
      subject: `🔔 ${data.totalArchived} Expired Bookings Archived - Admin Alert`,
      htmlContent: this.buildExpiredBookingsHtmlContent(data),
      textContent: this.buildExpiredBookingsTextContent(data)
    };

    await this.makeRequest('/smtp/email', emailData);
    console.log(`Expired bookings notification sent to ${data.adminEmail}`);
  }

  private buildExpiredBookingsHtmlContent(data: {
    adminName: string;
    propertyBookingsArchived: number;
    tourBookingsArchived: number;
    totalArchived: number;
    totalRemoved: number;
    timestamp: string;
    timeoutMinutes?: number;
  }): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #ff6b35; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
          .stats-box { background-color: white; padding: 15px; margin: 15px 0; border-left: 4px solid #ff6b35; }
          .stat-item { display: flex; justify-content: space-between; margin: 10px 0; }
          .stat-label { font-weight: bold; color: #555; }
          .stat-value { color: #ff6b35; font-weight: bold; font-size: 18px; }
          .button { display: inline-block; padding: 12px 24px; background-color: #ff6b35; color: white; text-decoration: none; border-radius: 5px; margin: 15px 0; }
          .footer { text-align: center; padding: 20px; color: #777; font-size: 12px; }
          .alert { background-color: #fff3cd; border: 1px solid #ffc107; padding: 12px; margin: 15px 0; border-radius: 4px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔔 Expired Bookings Alert</h1>
          </div>
          <div class="content">
            <p>Hi ${data.adminName},</p>

            <div class="alert">
              <strong>⚠️ Automatic Cleanup Report</strong><br>
              The system has automatically cleaned up expired bookings that were created more than ${data.timeoutMinutes || 30} minutes ago with pending payments.
            </div>

            <div class="stats-box">
              <h3>Cleanup Summary</h3>
              <div class="stat-item">
                <span class="stat-label">Property Bookings Archived:</span>
                <span class="stat-value">${data.propertyBookingsArchived}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Tour Bookings Archived:</span>
                <span class="stat-value">${data.tourBookingsArchived}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label"><strong>Total Archived:</strong></span>
                <span class="stat-value">${data.totalArchived}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Bookings Removed:</span>
                <span class="stat-value">${data.totalRemoved}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Timestamp:</span>
                <span style="color: #666;">${new Date(data.timestamp).toLocaleString()}</span>
              </div>
            </div>

            <h3>📊 What This Means</h3>
            <ul>
              <li><strong>Archived Bookings:</strong> All booking data has been saved to the archive for lead tracking</li>
              <li><strong>Lead Opportunities:</strong> These are potential customers who showed interest but didn't complete payment</li>
              <li><strong>Next Steps:</strong> Review the archived bookings to identify follow-up opportunities</li>
            </ul>

            <div style="text-align: center;">
              <a href="${process.env.ADMIN_PANEL_URL || 'http://localhost:3000'}/admin/booking-leads" class="button">
                View Booking Leads
              </a>
            </div>

            <p style="margin-top: 20px; color: #666; font-size: 14px;">
              <strong>Note:</strong> The original bookings have been deleted to free up inventory, but all customer contact information and booking details are preserved in the archive for lead generation purposes.
            </p>
          </div>
          <div class="footer">
            <p>This is an automated notification from the Jambolush Booking System</p>
            <p>&copy; ${new Date().getFullYear()} Jambolush. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private buildExpiredBookingsTextContent(data: {
    adminName: string;
    propertyBookingsArchived: number;
    tourBookingsArchived: number;
    totalArchived: number;
    totalRemoved: number;
    timestamp: string;
    timeoutMinutes?: number;
  }): string {
    return `
      EXPIRED BOOKINGS ALERT

      Hi ${data.adminName},

      The system has automatically cleaned up expired bookings that were created more than ${data.timeoutMinutes || 30} minutes ago with pending payments.

      CLEANUP SUMMARY
      ================
      Property Bookings Archived: ${data.propertyBookingsArchived}
      Tour Bookings Archived: ${data.tourBookingsArchived}
      Total Archived: ${data.totalArchived}
      Bookings Removed: ${data.totalRemoved}
      Timestamp: ${new Date(data.timestamp).toLocaleString()}

      WHAT THIS MEANS
      ===============
      - Archived Bookings: All booking data has been saved to the archive for lead tracking
      - Lead Opportunities: These are potential customers who showed interest but didn't complete payment
      - Next Steps: Review the archived bookings to identify follow-up opportunities

      View booking leads at: ${process.env.ADMIN_PANEL_URL || 'http://localhost:3000'}/admin/booking-leads

      NOTE: The original bookings have been deleted to free up inventory, but all customer contact information
      and booking details are preserved in the archive for lead generation purposes.

      ---
      This is an automated notification from the Jambolush Booking System
      © ${new Date().getFullYear()} Jambolush. All rights reserved.
    `.trim();
  }
}