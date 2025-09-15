// src/services/brevo.payment.ts
import axios from 'axios';
import { config } from '../config/config';
import { PaymentTransaction } from '../types/payment.types';

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

export interface PaymentMailingContext {
  user: UserInfo;
  company: CompanyInfo;
  transaction?: PaymentTransaction;
  paymentMethod?: {
    type: 'Bank Account' | 'Mobile Money';
    details: string; // e.g., "Equity Bank ending in ••••1234"
  };
  alert?: {
    type: 'Large Transaction' | 'Suspicious Activity';
    details: string;
  };
}

// --- PAYMENT MAILING SERVICE CLASS ---

export class BrevoPaymentMailingService {
  private apiKey: string;
  private apiUrl = 'https://api.brevo.com/v3';
  private defaultSender: { name: string; email: string };

  constructor() {
    this.apiKey = config.brevoApiKey;
    this.defaultSender = {
      name: 'Jambolush Payments',
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
      throw new Error(`Failed to send payment email: ${error.response?.data?.message || error.message}`);
    }
  }

  // --- PAYMENT EMAIL METHODS ---

  /**
   * Sends an email about a transaction's status (completed, failed, processing).
   * This is the primary method for payment notifications.
   */
 async sendTransactionStatusEmail(context: PaymentMailingContext): Promise<void> {
    if (!context.transaction) throw new Error("Transaction context is required.");
    
    // Assume TransactionStatus is a string union type from your types file
    type TransactionStatus = 'completed' | 'failed' | 'processing' | 'pending' | 'cancelled' | 'expired';

    const { status, type } = context.transaction;
    const typeTitle = type.charAt(0).toUpperCase() + type.slice(1);

    // FIX 1: Explicitly type `subjectMap` using Record<TransactionStatus, string>
    // This tells TypeScript that this object MUST have a key for every possible TransactionStatus.
    const subjectMap: Record<TransactionStatus, string> = {
      completed: `${typeTitle} Successful`,
      failed: `${typeTitle} Failed`,
      processing: `Your ${typeTitle} is Processing`,
      pending: `Your ${typeTitle} is Pending`,
      cancelled: `${typeTitle} Cancelled`,
      expired: `${typeTitle} Link/Request Expired` // FIX 2: Add the missing 'expired' key
    };

    // Now, this access is type-safe because TypeScript knows `status` will always be a valid key.
    const subject = subjectMap[status as TransactionStatus] || `${typeTitle} Status Update`;

    const emailData: BrevoEmailData = {
      sender: this.defaultSender,
      to: [{ email: context.user.email, name: `${context.user.firstName} ${context.user.lastName}` }],
      subject: subject,
      htmlContent: this.getTransactionStatusTemplate(context),
      textContent: this.getTransactionStatusTextTemplate(context)
    };

    await this.makeRequest('/smtp/email', emailData);
    console.log(`Transaction ${status} email sent to ${context.user.email}`);
  }

  /**
   * Confirms that a new payment method has been added to the user's account.
   */
  async sendPaymentMethodAddedEmail(context: PaymentMailingContext): Promise<void> {
    if (!context.paymentMethod) throw new Error("Payment method context is required.");

    const emailData: BrevoEmailData = {
        sender: this.defaultSender,
        to: [{ email: context.user.email, name: `${context.user.firstName} ${context.user.lastName}` }],
        subject: `A New ${context.paymentMethod.type} Has Been Added to Your Account`,
        htmlContent: this.getPaymentMethodAddedTemplate(context),
        textContent: this.getPaymentMethodAddedTextTemplate(context)
    };

    await this.makeRequest('/smtp/email', emailData);
    console.log(`Payment method added email sent to ${context.user.email}`);
  }

  // --- MODERNIZED EMAIL TEMPLATES ---

  private getBaseTemplate(): string {
    // This method contains the full, consistent CSS styling used across all brevo services.
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
        .button { display: inline-block; background: linear-gradient(135deg, #083A85 0%, #0a4499 100%); color: white; text-decoration: none; padding: 14px 28px; border-radius: 12px; font-weight: 600; font-size: 16px; text-align: center; box-shadow: 0 4px 14px rgba(8, 58, 133, 0.3); transition: all 0.3s ease; }
        .button-center { text-align: center; margin: 32px 0; }
        .info-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin: 24px 0; }
        .info-card-header { display: flex; align-items: center; font-weight: 600; color: #374151; margin-bottom: 16px; font-size: 15px; }
        .info-card-icon { margin-right: 8px; font-size: 18px; }
        .info-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #f1f5f9; }
        .info-row:last-child { border-bottom: none; }
        .info-label { font-weight: 500; color: #374151; font-size: 14px; }
        .info-value { font-family: 'Monaco', 'Menlo', 'Consolas', monospace; color: #6b7280; font-size: 14px; text-align: right; }
        .alert-box { border-radius: 12px; padding: 20px; margin: 24px 0; border-left: 4px solid; }
        .alert-success { background: #f0fdf4; border-left-color: #22c55e; color: #15803d; }
        .alert-warning { background: #fffbeb; border-left-color: #f59e0b; color: #d97706; }
        .alert-error { background: #fef2f2; border-left-color: #ef4444; color: #dc2626; }
        .alert-title { font-weight: 600; margin-bottom: 8px; font-size: 15px; }
        .alert-text { font-size: 14px; line-height: 1.5; }
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

  private getTransactionStatusTemplate(context: PaymentMailingContext): string {
    const { user, company, transaction } = context;
    if (!transaction) return '';

    const { status, type, amount, currency, reference, failureReason } = transaction;
    const typeTitle = type.charAt(0).toUpperCase() + type.slice(1);
    let statusContent = '';

    switch (status) {
      case 'completed':
        statusContent = `
          <div class="greeting">${typeTitle} Successful!</div>
          <div class="message">Hi ${user.firstName}, your ${type} of <strong>${currency} ${amount.toFixed(2)}</strong> has been processed successfully.</div>
          <div class="alert-box alert-success"><div class="alert-title">Transaction Complete</div></div>`;
        break;
      case 'failed':
        statusContent = `
          <div class="greeting">${typeTitle} Failed</div>
          <div class="message">Hi ${user.firstName}, unfortunately your ${type} of <strong>${currency} ${amount.toFixed(2)}</strong> could not be processed.</div>
          <div class="alert-box alert-error">
            <div class="alert-title">Reason for Failure</div>
            <div class="alert-text">${failureReason || 'An unknown error occurred. Please try again or contact support.'}</div>
          </div>`;
        break;
      default: // processing, pending, etc.
        statusContent = `
          <div class="greeting">Your ${typeTitle} is Processing</div>
          <div class="message">Hi ${user.firstName}, your ${type} of <strong>${currency} ${amount.toFixed(2)}</strong> is currently being processed. We will notify you again once it's complete.</div>
          <div class="alert-box alert-warning"><div class="alert-title">Status: ${status.toUpperCase()}</div></div>`;
        break;
    }

    return `
      <!DOCTYPE html><html><head>${this.getBaseTemplate()}</head><body>
        <div class="email-wrapper"><div class="email-container">
          <div class="header">
            <div class="logo">${company.name}</div><div class="header-subtitle">Transaction Notification</div>
          </div>
          <div class="content">
            ${statusContent}
            <div class="info-card">
              <div class="info-card-header"><span class="info-card-icon">receipt</span>Transaction Details</div>
              <div class="info-row"><span class="info-label">Amount</span><span class="info-value">${currency} ${amount.toFixed(2)}</span></div>
              <div class="info-row"><span class="info-label">Date</span><span class="info-value">${new Date(transaction.createdAt).toLocaleString()}</span></div>
              <div class="info-row"><span class="info-label">Reference ID</span><span class="info-value">${reference}</span></div>
            </div>
            <div class="button-center">
              <a href="${company.website}/dashboard/payments" class="button">View My Transactions</a>
            </div>
          </div>
          <div class="footer">
            <div class="footer-text">Questions? Contact support at ${company.supportEmail}<br>© ${new Date().getFullYear()} ${company.name}</div>
          </div>
        </div></div>
      </body></html>
    `;
  }

  private getPaymentMethodAddedTemplate(context: PaymentMailingContext): string {
    const { user, company, paymentMethod } = context;
    if (!paymentMethod) return '';
  
    return `
      <!DOCTYPE html><html><head>${this.getBaseTemplate()}</head><body>
        <div class="email-wrapper"><div class="email-container">
          <div class="header">
            <div class="logo">${company.name}</div><div class="header-subtitle">Security Notification</div>
          </div>
          <div class="content">
            <div class="greeting">New Payment Method Added</div>
            <div class="message">
              Hi ${user.firstName}, a new <strong>${paymentMethod.type}</strong> has been successfully added to your ${company.name} account.
            </div>
            <div class="info-card">
              <div class="info-card-header"><span class="info-card-icon">💳</span>Details</div>
              <div class="info-row"><span class="info-label">${paymentMethod.type}</span><span class="info-value">${paymentMethod.details}</span></div>
              <div class="info-row"><span class="info-label">Date Added</span><span class="info-value">${new Date().toLocaleString()}</span></div>
            </div>
            <div class="alert-box alert-warning">
              <div class="alert-title">Didn't Authorize This?</div>
              <div class="alert-text">If you did not add this payment method, please contact our support team immediately to secure your account.</div>
            </div>
            <div class="button-center">
              <a href="${company.website}/dashboard/settings/payment" class="button">Manage Payment Methods</a>
            </div>
          </div>
          <div class="footer">
            <div class="footer-text">This security alert was sent to ${user.email}<br>© ${new Date().getFullYear()} ${company.name}</div>
          </div>
        </div></div>
      </body></html>
    `;
  }

  // --- TEXT TEMPLATES FOR FALLBACK ---

  private getTransactionStatusTextTemplate(context: PaymentMailingContext): string {
    const { user, transaction } = context;
    if (!transaction) return '';
    const { status, type, amount, currency, reference } = transaction;

    return `
      Transaction Status Update

      Hi ${user.firstName},

      Your ${type} of ${currency} ${amount.toFixed(2)} (Ref: ${reference}) has been updated to: ${status.toUpperCase()}.

      View your full history: ${context.company.website}/dashboard/payments

      The ${context.company.name} Team
    `.trim();
  }

  private getPaymentMethodAddedTextTemplate(context: PaymentMailingContext): string {
    const { user, paymentMethod } = context;
    if (!paymentMethod) return '';

    return `
      New Payment Method Added

      Hi ${user.firstName},

      A new ${paymentMethod.type} (${paymentMethod.details}) was added to your account.

      If you did not make this change, please contact support immediately.

      The ${context.company.name} Team
    `.trim();
  }
}