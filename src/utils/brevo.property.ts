// src/services/brevo.property.ts
import axios from 'axios';
import { config } from '../config/config';
import { PropertyInfo, PropertyReview } from '../types/property.types';

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

export interface PropertyMailingContext {
  host: UserInfo; // The property owner
  company: CompanyInfo;
  property: PropertyInfo;
  review?: PropertyReview; // For new review notifications
  newStatus?: 'active' | 'pending' | 'rejected' | 'inactive';
  rejectionReason?: string; // Optional for status updates
}

// --- PROPERTY MAILING SERVICE CLASS ---

export class BrevoPropertyMailingService {
  private apiKey: string;
  private apiUrl = 'https://api.brevo.com/v3';
  private defaultSender: { name: string; email: string };

  constructor() {
    this.apiKey = config.brevoApiKey;
    this.defaultSender = {
      name: 'Jambolush Properties',
      email: config.brevoSenderEmail
    };
  }

  private async makeRequest(endpoint: string, data: any, method: 'POST' | 'GET' = 'POST') {
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
      throw new Error(`Failed to send property email: ${error.response?.data?.message || error.message}`);
    }
  }

  // --- PROPERTY EMAIL METHODS ---

  /**
   * Sends an email to the host confirming their property has been submitted for review.
   */
  async sendPropertySubmissionEmail(context: PropertyMailingContext): Promise<void> {
    const emailData: BrevoEmailData = {
      sender: this.defaultSender,
      to: [{ email: context.host.email, name: `${context.host.firstName} ${context.host.lastName}` }],
      subject: `We've Received Your Property Submission: ${context.property.name}`,
      htmlContent: this.getPropertySubmissionTemplate(context),
      textContent: this.getPropertySubmissionTextTemplate(context)
    };

    await this.makeRequest('/smtp/email', emailData);
    console.log(`Property submission email sent to ${context.host.email}`);
  }

  /**
   * Notifies a host about a change in their property's status (e.g., approved, rejected).
   */
  async sendPropertyStatusUpdateEmail(context: PropertyMailingContext): Promise<void> {
    const subjectMap = {
      active: `Congratulations! Your Property "${context.property.name}" is Now Live!`,
      rejected: `Update on Your Property Submission: ${context.property.name}`,
      inactive: `Your Property "${context.property.name}" Has Been Deactivated`,
      pending: `Your Property "${context.property.name}" is Under Review`
    };
    
    const subject = subjectMap[context.newStatus || 'pending'];

    const emailData: BrevoEmailData = {
      sender: this.defaultSender,
      to: [{ email: context.host.email, name: `${context.host.firstName} ${context.host.lastName}` }],
      subject: subject,
      htmlContent: this.getPropertyStatusUpdateTemplate(context),
      textContent: this.getPropertyStatusUpdateTextTemplate(context)
    };

    await this.makeRequest('/smtp/email', emailData);
    console.log(`Property status update email sent to ${context.host.email}`);
  }

  /**
   * Notifies a host that a new review has been posted for their property.
   */
  async sendNewReviewNotificationEmail(context: PropertyMailingContext): Promise<void> {
    if (!context.review) {
      throw new Error("Review context is required for this email.");
    }

    const emailData: BrevoEmailData = {
      sender: this.defaultSender,
      to: [{ email: context.host.email, name: `${context.host.firstName} ${context.host.lastName}` }],
      subject: `You've Received a New ${context.review.rating}-Star Review for ${context.property.name}!`,
      htmlContent: this.getNewReviewNotificationTemplate(context),
      textContent: this.getNewReviewNotificationTextTemplate(context)
    };

    await this.makeRequest('/smtp/email', emailData);
    console.log(`New review notification email sent to ${context.host.email}`);
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
        .footer { background: #083A85; color: white; padding: 24px 20px; text-align: center; }
        .footer-text { font-size: 12px; color: #e5e7eb; line-height: 1.5; }
        @media (max-width: 600px) {
          .email-wrapper { width: 100%; }
          .content { padding: 20px 16px; }
          .header { padding: 24px 16px; }
          .footer { padding: 20px 16px; }
          .info-row { flex-direction: column; align-items: flex-start; gap: 4px; padding: 8px 0; }
          .info-label { min-width: auto; }
          .info-value { text-align: left; }
        }
      </style>
    `;
  }

  private getPropertySubmissionTemplate(context: PropertyMailingContext): string {
    const { host, company, property } = context;
    return `
      <!DOCTYPE html><html><head>${this.getBaseTemplate()}</head><body>
        <div class="email-wrapper"><div class="email-container">
          <div class="header">
            <div class="logo">${company.name}</div><div class="header-subtitle">Property Submission Received</div>
          </div>
          <div class="content">
            <div class="greeting">Thanks for your submission, ${host.firstName}!</div>
            <div class="message">
              We've received your request to list "<strong>${property.name}</strong>" on our platform. Our team will review it within the next 24-48 hours and notify you once it's complete.
            </div>
            <div class="info-card">
              <div class="info-card-header"><span class="info-card-icon">🏠</span>Property Details</div>
              <div class="info-row"><span class="info-label">Name</span><span class="info-value">${property.name}</span></div>
              <div class="info-row"><span class="info-label">Location</span><span class="info-value">${property.location}</span></div>
              <div class="info-row"><span class="info-label">Status</span><span class="info-value" style="color:#f59e0b; font-weight:bold;">Pending Review</span></div>
            </div>
            <div class="message">
              In the meantime, you can review your submission or add more details from your host dashboard.
            </div>
            <div class="button-center">
              <a href="${company.website}/dashboard/properties/${property.id}" class="button">View My Submission</a>
            </div>
          </div>
          <div class="footer">
            <div class="footer-text">Questions? Contact our support team at ${company.supportEmail}<br>© ${new Date().getFullYear()} ${company.name}</div>
          </div>
        </div></div>
      </body></html>
    `;
  }
  
  private getPropertyStatusUpdateTemplate(context: PropertyMailingContext): string {
    const { host, company, property, newStatus, rejectionReason } = context;
    let statusSpecificContent = '';

    switch (newStatus) {
      case 'active':
        statusSpecificContent = `
          <div class="greeting">Congratulations, ${host.firstName}!</div>
          <div class="message">Great news! Your property, "<strong>${property.name}</strong>", has been approved and is now live on ${company.name}. Guests can now view and book their stay.</div>
          <div class="alert-box alert-success">
            <div class="alert-title">Your Property is Live!</div>
            <div class="alert-text">Start sharing your listing to attract your first guests.</div>
          </div>
          <div class="button-center">
            <a href="${company.website}/properties/${property.id}" class="button">View My Live Listing</a>
          </div>`;
        break;
      case 'rejected':
        statusSpecificContent = `
          <div class="greeting">Update on your submission</div>
          <div class="message">Hi ${host.firstName}, after reviewing your property "<strong>${property.name}</strong>", we found it doesn't meet our current guidelines.</div>
          <div class="alert-box alert-error">
            <div class="alert-title">Submission Needs Attention</div>
            <div class="alert-text">${rejectionReason || 'Please review our listing guidelines and update your submission.'}</div>
          </div>
          <div class="button-center">
            <a href="${company.website}/dashboard/properties/${property.id}/edit" class="button">Edit My Submission</a>
          </div>`;
        break;
      default: // inactive or other
        statusSpecificContent = `
          <div class="greeting">Property Status Update</div>
          <div class="message">Hi ${host.firstName}, the status of your property "<strong>${property.name}</strong>" has been updated to <strong>${newStatus}</strong>. It is no longer visible to guests.</div>
          <div class="button-center">
            <a href="${company.website}/dashboard/properties/${property.id}" class="button">Manage My Property</a>
          </div>`;
        break;
    }

    return `
      <!DOCTYPE html><html><head>${this.getBaseTemplate()}</head><body>
        <div class="email-wrapper"><div class="email-container">
          <div class="header">
            <div class="logo">${company.name}</div><div class="header-subtitle">Property Status Update</div>
          </div>
          <div class="content">${statusSpecificContent}</div>
          <div class="footer">
            <div class="footer-text">For assistance, please contact our team at ${company.supportEmail}.<br>© ${new Date().getFullYear()} ${company.name}</div>
          </div>
        </div></div>
      </body></html>
    `;
  }
  
  private getNewReviewNotificationTemplate(context: PropertyMailingContext): string {
    const { host, company, property, review } = context;
    if (!review) return '';
    
    // Create star rating string
    const stars = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating);

    return `
      <!DOCTYPE html><html><head>${this.getBaseTemplate()}</head><body>
        <div class="email-wrapper"><div class="email-container">
          <div class="header">
            <div class="logo">${company.name}</div><div class="header-subtitle">New Guest Review</div>
          </div>
          <div class="content">
            <div class="greeting">You've got a new review!</div>
            <div class="message">
              Hi ${host.firstName}, a guest has shared their experience at "<strong>${property.name}</strong>". Positive reviews can help attract more guests!
            </div>
            <div class="info-card">
              <div class="info-card-header"><span class="info-card-icon">⭐</span>Review Details</div>
              <div class="info-row"><span class="info-label">Guest</span><span class="info-value">${review.userName}</span></div>
              <div class="info-row"><span class="info-label">Rating</span><span class="info-value" style="color:#f59e0b; font-size:18px;">${stars}</span></div>
              <div class="info-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
                <span class="info-label">Comment</span>
                <p style="color:#6b7280; font-size:14px; font-style:italic;">"${review.comment}"</p>
              </div>
            </div>
            <div class="message">
              You can view the full review and post a public response from your dashboard.
            </div>
            <div class="button-center">
              <a href="${company.website}/dashboard/reviews" class="button">Read and Respond</a>
            </div>
          </div>
          <div class="footer">
            <div class="footer-text">This notification was sent to ${host.email}<br>© ${new Date().getFullYear()} ${company.name}</div>
          </div>
        </div></div>
      </body></html>
    `;
  }


  // --- TEXT TEMPLATES FOR FALLBACK ---

  private getPropertySubmissionTextTemplate(context: PropertyMailingContext): string {
    return `
      Property Submission Received

      Hi ${context.host.firstName},

      We've received your submission for "${context.property.name}" and it is now pending review.
      Our team will get back to you within 24-48 hours.

      View your submission: ${context.company.website}/dashboard/properties/${context.property.id}

      Thanks,
      The ${context.company.name} Team
    `.trim();
  }

  private getPropertyStatusUpdateTextTemplate(context: PropertyMailingContext): string {
    const { host, property, newStatus } = context;
    let message = '';
    
    switch(newStatus) {
        case 'active':
            message = `Great news! Your property, "${property.name}", has been approved and is now live. View your listing: ${context.company.website}/properties/${property.id}`;
            break;
        case 'rejected':
            message = `There was an issue with your property submission for "${property.name}". Please log in to your dashboard to see the required changes: ${context.company.website}/dashboard/properties/${property.id}/edit`;
            break;
        default:
            message = `The status of your property, "${property.name}", has been updated to "${newStatus}".`;
            break;
    }

    return `
      Property Status Update

      Hi ${host.firstName},

      ${message}

      The ${context.company.name} Team
    `.trim();
  }

  private getNewReviewNotificationTextTemplate(context: PropertyMailingContext): string {
    const review = context.review!;
    return `
      New Guest Review for ${context.property.name}

      Hi ${context.host.firstName},

      You've received a new review from ${review.userName}.
      Rating: ${review.rating} out of 5 stars
      Comment: "${review.comment}"

      Respond to this review here: ${context.company.website}/dashboard/reviews

      The ${context.company.name} Team
    `.trim();
  }
}