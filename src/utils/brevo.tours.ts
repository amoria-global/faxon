// src/services/brevo.tours.ts
import axios from 'axios';
import { config } from '../config/config';
import { TourInfo, TourBookingInfo, TourReviewInfo } from '../types/tours.types';

// --- INTERFACES ---

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

export interface TourMailingContext {
  recipient: UserInfo; // The person receiving the email (guest or guide)
  company: CompanyInfo;
  tour: TourInfo;
  booking?: TourBookingInfo;
  review?: TourReviewInfo;
  message?: {
    senderName: string;
    messageSnippet: string;
  };
}

// --- TOUR MAILING SERVICE CLASS ---

export class BrevoTourMailingService {
  private apiKey: string;
  private apiUrl = 'https://api.brevo.com/v3';
  private defaultSender: { name: string; email: string };

  constructor() {
    this.apiKey = config.brevoApiKey;
    this.defaultSender = {
      name: 'Jambolush Tours',
      email: config.brevoSenderEmail
    };
  }

  private async makeRequest(endpoint: string, data: any) {
    try {
      await axios({
        method: 'POST',
        url: `${this.apiUrl}${endpoint}`,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'api-key': this.apiKey
        },
        data
      });
    } catch (error: any) {
      console.error('Brevo API Error:', error.response?.data || error.message);
      throw new Error(`Failed to send tour email: ${error.response?.data?.message || error.message}`);
    }
  }

  // --- TOUR EMAIL METHODS ---

  /**
   * Sends a confirmation to a guide after they create a new tour.
   */
  async sendNewTourConfirmationEmail(context: TourMailingContext): Promise<void> {
    const emailData: BrevoEmailData = {
      sender: this.defaultSender,
      to: [{ email: context.recipient.email, name: `${context.recipient.firstName} ${context.recipient.lastName}` }],
      subject: `Congratulations! Your new tour "${context.tour.title}" is live!`,
      htmlContent: this.getNewTourConfirmationTemplate(context),
      textContent: this.getNewTourConfirmationTextTemplate(context)
    };
    await this.makeRequest('/smtp/email', emailData);
    console.log(`New tour confirmation email sent to ${context.recipient.email}`);
  }

  /**
   * Sends a notification to a guide about a new booking request.
   */
  async sendNewBookingRequestEmail(context: TourMailingContext): Promise<void> {
    if (!context.booking) throw new Error("Booking context is required.");
    const emailData: BrevoEmailData = {
      sender: this.defaultSender,
      to: [{ email: context.recipient.email, name: `${context.recipient.firstName} ${context.recipient.lastName}` }],
      subject: `New Booking Request for "${context.tour.title}" from ${context.booking.userName}`,
      htmlContent: this.getNewBookingRequestTemplate(context),
      textContent: this.getNewBookingRequestTextTemplate(context)
    };
    await this.makeRequest('/smtp/email', emailData);
    console.log(`New tour booking request email sent to guide ${context.recipient.email}`);
  }

  /**
   * Sends a booking status update (e.g., confirmed, cancelled) to a guest.
   */
  async sendBookingStatusUpdateEmail(context: TourMailingContext): Promise<void> {
    if (!context.booking) throw new Error("Booking context is required.");
    const status = context.booking.status.charAt(0).toUpperCase() + context.booking.status.slice(1);
    const emailData: BrevoEmailData = {
      sender: this.defaultSender,
      to: [{ email: context.recipient.email, name: `${context.recipient.firstName} ${context.recipient.lastName}` }],
      subject: `Your Booking for "${context.tour.title}" is ${status}`,
      htmlContent: this.getBookingStatusUpdateTemplate(context),
      textContent: this.getBookingStatusUpdateTextTemplate(context)
    };
    await this.makeRequest('/smtp/email', emailData);
    console.log(`Tour booking status update email sent to guest ${context.recipient.email}`);
  }

  /**
   * Notifies a tour guide about a new review on their tour.
   */
  async sendNewReviewNotificationEmail(context: TourMailingContext): Promise<void> {
    if (!context.review) throw new Error("Review context is required.");
    const emailData: BrevoEmailData = {
      sender: this.defaultSender,
      to: [{ email: context.recipient.email, name: `${context.recipient.firstName} ${context.recipient.lastName}` }],
      subject: `You have a new ${context.review.rating}-star review for "${context.tour.title}"`,
      htmlContent: this.getNewReviewNotificationTemplate(context),
      textContent: this.getNewReviewNotificationTextTemplate(context)
    };
    await this.makeRequest('/smtp/email', emailData);
    console.log(`New tour review notification email sent to ${context.recipient.email}`);
  }

  // --- MODERNIZED EMAIL TEMPLATES ---

  private getBaseTemplate(): string {
    // This method contains the full, consistent CSS styling for all emails.
    return `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #374151; background-color: #f9fafb; }
        .email-wrapper { max-width: 600px; margin: 0 auto; background-color: #f9fafb; padding: 20px; }
        .email-container { background: white; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1); border: 1px solid #e5e7eb; }
        .header { background: linear-gradient(135deg, #083A85 0%, #0a4499 100%); padding: 40px 30px; text-align: center; color: white; }
        .logo { font-size: 28px; font-weight: 700; margin-bottom: 8px; letter-spacing: -0.025em; }
        .header-subtitle { font-size: 16px; font-weight: 400; opacity: 0.9; }
        .content { padding: 40px 30px; }
        .greeting { font-size: 24px; font-weight: 600; color: #111827; margin-bottom: 20px; letter-spacing: -0.025em; }
        .message { font-size: 16px; line-height: 1.7; color: #4b5563; margin-bottom: 24px; }
        .button { display: inline-block; background: linear-gradient(135deg, #083A85 0%, #0a4499 100%); color: white; text-decoration: none; padding: 14px 28px; border-radius: 12px; font-weight: 600; font-size: 16px; text-align: center; box-shadow: 0 4px 14px rgba(8, 58, 133, 0.3); }
        .button-center { text-align: center; margin: 32px 0; }
        .info-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin: 24px 0; }
        .info-card-header { font-weight: 600; color: #374151; margin-bottom: 16px; font-size: 15px; }
        .info-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #f1f5f9; }
        .info-row:last-child { border-bottom: none; }
        .info-label { font-weight: 500; color: #374151; font-size: 14px; }
        .info-value { color: #6b7280; font-size: 14px; text-align: right; }
        .alert-box { border-radius: 12px; padding: 20px; margin: 24px 0; border-left: 4px solid; }
        .alert-success { background: #f0fdf4; border-left-color: #22c55e; color: #15803d; }
        .alert-error { background: #fef2f2; border-left-color: #ef4444; color: #dc2626; }
        .alert-title { font-weight: 600; margin-bottom: 8px; }
        .footer { background: #083A85; color: white; padding: 32px 30px; text-align: center; }
        .footer-text { font-size: 13px; color: #cbd5e1; line-height: 1.5; }
        @media (max-width: 600px) {
          .content, .header { padding: 30px 20px; }
          .info-row { flex-direction: column; align-items: flex-start; gap: 4px; }
          .info-value { text-align: left; }
        }
      </style>
    `;
  }

  private getNewTourConfirmationTemplate(context: TourMailingContext): string {
    const { recipient, company, tour } = context;
    return `
      <!DOCTYPE html><html><head>${this.getBaseTemplate()}</head><body>
      <div class="email-wrapper"><div class="email-container">
        <div class="header">
          <div class="logo">${company.name}</div><div class="header-subtitle">Your New Tour is Live</div>
        </div>
        <div class="content">
          <div class="greeting">Congratulations, ${recipient.firstName}!</div>
          <div class="message">Your tour, "<strong>${tour.title}</strong>", has been successfully created and is now visible to guests on our platform.</div>
          <div class="info-card">
            <div class="info-card-header">Tour Snapshot</div>
            <div class="info-row"><span class="info-label">Location</span><span class="info-value">${tour.locationCity}, ${tour.locationCountry}</span></div>
            <div class="info-row"><span class="info-label">Price</span><span class="info-value">${tour.currency} ${tour.price.toFixed(2)}</span></div>
            <div class="info-row"><span class="info-label">Duration</span><span class="info-value">${tour.duration} Hours</span></div>
          </div>
          <div class="button-center">
            <a href="${company.website}/dashboard/tours/${tour.id}" class="button">Manage My Tour</a>
          </div>
        </div>
        <div class="footer"><div class="footer-text">© ${new Date().getFullYear()} ${company.name}</div></div>
      </div></div></body></html>
    `;
  }

  private getNewBookingRequestTemplate(context: TourMailingContext): string {
    const { recipient, company, tour, booking } = context;
    if (!booking) return '';
    return `
      <!DOCTYPE html><html><head>${this.getBaseTemplate()}</head><body>
      <div class="email-wrapper"><div class="email-container">
        <div class="header">
          <div class="logo">${company.name}</div><div class="header-subtitle">New Booking Request</div>
        </div>
        <div class="content">
          <div class="greeting">New Request for "${tour.title}"!</div>
          <div class="message">Hi ${recipient.firstName}, you have a new booking request from <strong>${booking.userName}</strong>. Please review the details and respond.</div>
          <div class="info-card">
            <div class="info-card-header">Booking Details</div>
            <div class="info-row"><span class="info-label">Guest Name</span><span class="info-value">${booking.userName}</span></div>
            <div class="info-row"><span class="info-label">Tour Date</span><span class="info-value">${new Date(booking.tourDate).toLocaleDateString()} at ${booking.tourTime}</span></div>
            <div class="info-row"><span class="info-label">Participants</span><span class="info-value">${booking.numberOfParticipants}</span></div>
            <div class="info-row"><span class="info-label">Total Amount</span><span class="info-value">${booking.currency} ${booking.totalAmount.toFixed(2)}</span></div>
          </div>
          <div class="button-center">
            <a href="${company.website}/dashboard/bookings/${booking.id}" class="button">View and Respond</a>
          </div>
        </div>
        <div class="footer"><div class="footer-text">© ${new Date().getFullYear()} ${company.name}</div></div>
      </div></div></body></html>
    `;
  }

  private getBookingStatusUpdateTemplate(context: TourMailingContext): string {
    const { recipient, company, tour, booking } = context;
    if (!booking) return '';
    const status = booking.status;
    let content = '';

    if (status === 'confirmed') {
      content = `
        <div class="greeting">Your Adventure is Confirmed!</div>
        <div class="message">Hi ${recipient.firstName}, get ready! Your booking for "<strong>${tour.title}</strong>" is confirmed. Please review the key details below.</div>
        <div class="alert-box alert-success"><div class="alert-title">Booking Confirmed</div></div>`;
    } else if (status === 'cancelled') {
      content = `
        <div class="greeting">Booking Cancellation</div>
        <div class="message">Hi ${recipient.firstName}, your booking for "<strong>${tour.title}</strong>" has been cancelled.</div>
        <div class="alert-box alert-error"><div class="alert-title">Booking Cancelled</div></div>`;
    }

    return `
      <!DOCTYPE html><html><head>${this.getBaseTemplate()}</head><body>
      <div class="email-wrapper"><div class="email-container">
        <div class="header">
          <div class="logo">${company.name}</div><div class="header-subtitle">Booking Update</div>
        </div>
        <div class="content">
          ${content}
          <div class="info-card">
            <div class="info-card-header">Booking Summary</div>
            <div class="info-row"><span class="info-label">Tour</span><span class="info-value">${tour.title}</span></div>
            <div class="info-row"><span class="info-label">Date & Time</span><span class="info-value">${new Date(booking.tourDate).toLocaleDateString()} at ${booking.tourTime}</span></div>
            <div class="info-row"><span class="info-label">Meeting Point</span><span class="info-value">${tour.meetingPoint}</span></div>
            <div class="info-row"><span class="info-label">Booking ID</span><span class="info-value">${booking.id}</span></div>
          </div>
          <div class="button-center">
            <a href="${company.website}/my-tours/bookings/${booking.id}" class="button">View Full Details</a>
          </div>
        </div>
        <div class="footer"><div class="footer-text">© ${new Date().getFullYear()} ${company.name}</div></div>
      </div></div></body></html>
    `;
  }
  
  private getNewReviewNotificationTemplate(context: TourMailingContext): string {
      const { recipient, company, tour, review } = context;
      if (!review) return '';
      const stars = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating);
      return `
        <!DOCTYPE html><html><head>${this.getBaseTemplate()}</head><body>
        <div class="email-wrapper"><div class="email-container">
          <div class="header">
            <div class="logo">${company.name}</div><div class="header-subtitle">New Guest Review</div>
          </div>
          <div class="content">
            <div class="greeting">You have a new review!</div>
            <div class="message">Hi ${recipient.firstName}, ${review.userName} left a review for your tour, "<strong>${tour.title}</strong>".</div>
            <div class="info-card">
              <div class="info-card-header">Review Details</div>
              <div class="info-row"><span class="info-label">Rating</span><span class="info-value" style="color:#f59e0b; font-size:18px;">${stars}</span></div>
              <div class="info-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                <span class="info-label">Comment Snippet</span>
                <p style="color:#6b7280; font-style:italic;">"${review.comment.substring(0, 100)}..."</p>
              </div>
            </div>
            <div class="button-center">
              <a href="${company.website}/dashboard/reviews" class="button">Read and Respond</a>
            </div>
          </div>
          <div class="footer"><div class="footer-text">© ${new Date().getFullYear()} ${company.name}</div></div>
        </div></div></body></html>
      `;
  }

  // --- TEXT TEMPLATES FOR FALLBACK ---

  private getNewTourConfirmationTextTemplate(context: TourMailingContext): string {
    return `
      New Tour Created!
      Hi ${context.recipient.firstName},
      Your tour, "${context.tour.title}", is now live.
      Manage it here: ${context.company.website}/dashboard/tours/${context.tour.id}
      - The ${context.company.name} Team
    `.trim();
  }

  private getNewBookingRequestTextTemplate(context: TourMailingContext): string {
    if (!context.booking) return '';
    return `
      New Booking Request
      Hi ${context.recipient.firstName},
      You have a new request from ${context.booking.userName} for "${context.tour.title}" on ${new Date(context.booking.tourDate).toLocaleDateString()}.
      Respond here: ${context.company.website}/dashboard/bookings/${context.booking.id}
      - The ${context.company.name} Team
    `.trim();
  }

  private getBookingStatusUpdateTextTemplate(context: TourMailingContext): string {
    if (!context.booking) return '';
    const status = context.booking.status.toUpperCase();
    return `
      Booking ${status}
      Hi ${context.recipient.firstName},
      Your booking for "${context.tour.title}" on ${new Date(context.booking.tourDate).toLocaleDateString()} is now ${status}.
      View details: ${context.company.website}/my-tours/bookings/${context.booking.id}
      - The ${context.company.name} Team
    `.trim();
  }

  private getNewReviewNotificationTextTemplate(context: TourMailingContext): string {
    if (!context.review) return '';
    return `
      New Review Received
      Hi ${context.recipient.firstName},
      You have a new ${context.review.rating}-star review from ${context.review.userName} for "${context.tour.title}".
      Read it here: ${context.company.website}/dashboard/reviews
      - The ${context.company.name} Team
    `.trim();
  }
}