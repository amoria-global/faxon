// services/email.service.ts

import * as Brevo from '@getbrevo/brevo';
import { config } from '../config/config';
import {
  EscrowTransaction,
  EscrowParticipant,
  WithdrawalRequest,
  EscrowTransactionStatus
} from '../types/pesapal.types';

interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

interface CompanyInfo {
  name: string;
  website: string;
  supportEmail: string;
  logo: string;
}

export class EmailService {
  private transactionalEmailsApi: Brevo.TransactionalEmailsApi;
  private companyInfo: CompanyInfo;
  private defaultSender: { name: string; email: string };

  constructor() {
    // Initialize Brevo API
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
      name: 'Jambolush Escrow',
      email: config.brevoSenderEmail
    };

    // Company information
    this.companyInfo = {
      name: process.env.COMPANY_NAME || 'Jambolush',
      website: process.env.COMPANY_WEBSITE || 'https://jambolush.com',
      supportEmail: process.env.COMPANY_SUPPORT_EMAIL || 'support@jambolush.com',
      logo: process.env.COMPANY_LOGO || 'https://jambolush.com/favicon.ico'
    };
  }

  // === DEPOSIT NOTIFICATIONS ===

  async sendDepositCreatedEmail(data: {
    user: EscrowParticipant;
    transaction: EscrowTransaction;
    checkoutUrl: string;
  }): Promise<void> {
    try {
      const template = this.generateDepositCreatedTemplate(data);

      await this.sendEmail({
        to: data.user.email,
        subject: template.subject,
        html: template.html,
        text: template.text
      });

      console.log(`Deposit created email sent to ${data.user.email}`);
    } catch (error: any) {
      console.error('Failed to send deposit created email:', error);
      throw error;
    }
  }

  // === STATUS UPDATE NOTIFICATIONS ===

  async sendTransactionStatusEmail(data: {
    user: EscrowParticipant;
    transaction: EscrowTransaction;
    status: EscrowTransactionStatus;
  }): Promise<void> {
    try {
      const template = this.generateStatusUpdateTemplate(data);

      await this.sendEmail({
        to: data.user.email,
        subject: template.subject,
        html: template.html,
        text: template.text
      });

      console.log(`Status update email sent to ${data.user.email} - Status: ${data.status}`);
    } catch (error: any) {
      console.error('Failed to send status update email:', error);
      throw error;
    }
  }

  // === RELEASE NOTIFICATIONS ===

  async sendFundsReleasedEmail(data: {
    user: EscrowParticipant;
    transaction: EscrowTransaction;
  }): Promise<void> {
    try {
      const template = this.generateFundsReleasedTemplate(data);

      await this.sendEmail({
        to: data.user.email,
        subject: template.subject,
        html: template.html,
        text: template.text
      });

      console.log(`Funds released email sent to ${data.user.email}`);
    } catch (error: any) {
      console.error('Failed to send funds released email:', error);
      throw error;
    }
  }

  // === WITHDRAWAL NOTIFICATIONS ===

  async sendWithdrawalRequestEmail(data: {
    user: EscrowParticipant;
    withdrawal: WithdrawalRequest;
  }): Promise<void> {
    try {
      const template = this.generateWithdrawalRequestTemplate(data);

      await this.sendEmail({
        to: data.user.email,
        subject: template.subject,
        html: template.html,
        text: template.text
      });

      console.log(`Withdrawal request email sent to ${data.user.email}`);
    } catch (error: any) {
      console.error('Failed to send withdrawal request email:', error);
      throw error;
    }
  }

  // === REFUND NOTIFICATIONS ===

  async sendRefundProcessedEmail(data: {
    user: EscrowParticipant;
    transaction: EscrowTransaction;
    refundAmount: number;
  }): Promise<void> {
    try {
      const template = this.generateRefundProcessedTemplate(data);

      await this.sendEmail({
        to: data.user.email,
        subject: template.subject,
        html: template.html,
        text: template.text
      });

      console.log(`Refund processed email sent to ${data.user.email}`);
    } catch (error: any) {
      console.error('Failed to send refund processed email:', error);
      throw error;
    }
  }

  // === BOOKING PAYMENT NOTIFICATIONS ===

  async sendBookingPaymentConfirmationEmail(data: {
    userEmail: string;
    userName: string;
    bookingId: string;
    propertyName: string;
    amount: number;
    currency: string;
    checkIn: Date;
    checkOut: Date;
    reference: string;
  }): Promise<void> {
    try {
      const template = this.generateBookingPaymentConfirmationTemplate(data);

      await this.sendEmail({
        to: data.userEmail,
        subject: template.subject,
        html: template.html,
        text: template.text
      });

      console.log(`Booking payment confirmation sent to ${data.userEmail}`);
    } catch (error: any) {
      console.error('Failed to send booking payment confirmation:', error);
      // Don't throw - non-critical
    }
  }

  async sendBookingPaymentStatusEmail(data: {
    userEmail: string;
    userName: string;
    bookingId: string;
    propertyName: string;
    amount: number;
    status: string;
    reference: string;
  }): Promise<void> {
    try {
      const template = this.generateBookingPaymentStatusTemplate(data);

      await this.sendEmail({
        to: data.userEmail,
        subject: template.subject,
        html: template.html,
        text: template.text
      });

      console.log(`Booking payment status email sent to ${data.userEmail}`);
    } catch (error: any) {
      console.error('Failed to send booking payment status email:', error);
      // Don't throw - non-critical
    }
  }

  // === BASE TEMPLATE ===

  private getBaseTemplate(): string {
    return `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #374151; background: #f9fafb; padding: 10px; }
        .email-wrapper { width: 98%; max-width: 600px; margin: 0 auto; }
        .email-container { background: #ffffff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08); border: 1px solid #e5e7eb; overflow: hidden; }
        .header { background: linear-gradient(135deg, #083A85 0%, #0a4499 100%); padding: 32px 24px; text-align: center; color: white; }
        .logo { max-width: 120px; margin-bottom: 8px; }
        .header-title { font-size: 24px; font-weight: 600; margin-bottom: 6px; }
        .header-subtitle { font-size: 14px; font-weight: 400; opacity: 0.9; }
        .content { padding: 28px 20px; background: #ffffff; }
        .greeting { font-size: 20px; font-weight: 600; color: #111827; margin-bottom: 16px; }
        .message { font-size: 15px; line-height: 1.6; color: #4b5563; margin-bottom: 20px; }
        .button { display: inline-block; background: #083A85; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 15px; text-align: center; }
        .button:hover { background: #0a4499; }
        .button-center { text-align: center; margin: 24px 0; }
        .info-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px; margin: 20px 0; }
        .info-card-header { font-weight: 600; color: #374151; margin-bottom: 12px; font-size: 14px; }
        .info-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #f1f5f9; }
        .info-row:last-child { border-bottom: none; }
        .info-label { font-weight: 500; color: #374151; font-size: 13px; }
        .info-value { color: #6b7280; font-size: 13px; text-align: right; }
        .alert-box { border-radius: 8px; padding: 16px; margin: 20px 0; border-left: 3px solid; }
        .alert-success { background: #f0fdf4; border-left-color: #22c55e; color: #15803d; }
        .alert-warning { background: #fffbeb; border-left-color: #f59e0b; color: #d97706; }
        .alert-error { background: #fef2f2; border-left-color: #ef4444; color: #dc2626; }
        .alert-info { background: #eff6ff; border-left-color: #3b82f6; color: #1e40af; }
        .alert-title { font-weight: 600; margin-bottom: 6px; font-size: 14px; }
        .alert-text { font-size: 13px; line-height: 1.5; }
        .footer { background: #083A85; color: white; padding: 24px 20px; text-align: center; }
        .footer-text { font-size: 12px; color: #e5e7eb; line-height: 1.5; }
        ul { margin: 12px 0; padding-left: 24px; }
        li { font-size: 13px; color: #4b5563; margin-bottom: 6px; }
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

  // === TEMPLATE GENERATORS ===

  private generateDepositCreatedTemplate(data: {
    user: EscrowParticipant;
    transaction: EscrowTransaction;
    checkoutUrl: string;
  }): EmailTemplate {
    const subject = `Complete Your Payment - ${data.transaction.reference}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${subject}</title>
        ${this.getBaseTemplate()}
      </head>
      <body>
        <div class="email-wrapper">
          <div class="email-container">
            <div class="header">
              <img src="${this.companyInfo.logo}" alt="${this.companyInfo.name}" class="logo">
              <div class="header-title">${this.companyInfo.name}</div>
              <div class="header-subtitle">Secure Escrow Payment</div>
            </div>

            <div class="content">
              <div class="greeting">Hi ${data.user.firstName || 'there'},</div>

              <div class="message">
                Your payment has been initialized and is being held securely in escrow. Please complete your payment to proceed with your booking.
              </div>

              <div class="info-card">
                <div class="info-card-header">Payment Details</div>
                <div class="info-row"><span class="info-label">Reference</span><span class="info-value">${data.transaction.reference}</span></div>
                <div class="info-row"><span class="info-label">Amount</span><span class="info-value">${data.transaction.amount.toLocaleString()} ${data.transaction.currency}</span></div>
                <div class="info-row"><span class="info-label">Description</span><span class="info-value">${data.transaction.description || 'Escrow payment'}</span></div>
                <div class="info-row"><span class="info-label">Status</span><span class="info-value">Pending Payment</span></div>
              </div>

              <div class="button-center">
                <a href="${data.checkoutUrl}" class="button">Complete Payment</a>
              </div>

              <div class="alert-box alert-info">
                <div class="alert-title">Secure Escrow Protection</div>
                <div class="alert-text">
                  Your funds will be securely held in escrow until the service is confirmed as delivered. This protects both you and the service provider.
                </div>
              </div>
            </div>

            <div class="footer">
              <div class="footer-text">
                Questions? Contact us at ${this.companyInfo.supportEmail}<br>
                © ${new Date().getFullYear()} ${this.companyInfo.name}. All rights reserved.
              </div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
Hi ${data.user.firstName || 'there'},

Your payment has been initialized and is being held securely in escrow.

Payment Details:
- Reference: ${data.transaction.reference}
- Amount: ${data.transaction.amount.toLocaleString()} ${data.transaction.currency}
- Description: ${data.transaction.description || 'Escrow payment'}
- Status: Pending Payment

Complete your payment here: ${data.checkoutUrl}

Questions? Contact us at ${this.companyInfo.supportEmail}
    `;

    return { subject, html, text };
  }

  private generateStatusUpdateTemplate(data: {
    user: EscrowParticipant;
    transaction: EscrowTransaction;
    status: EscrowTransactionStatus;
  }): EmailTemplate {
    const statusMessages = {
      'PENDING': 'Your payment is being processed',
      'HELD': 'Your payment is complete and funds are held securely',
      'READY': 'Your payment is complete and ready for release',
      'RELEASED': 'Funds have been released to the service provider',
      'REFUNDED': 'Your payment has been refunded',
      'FAILED': 'Your payment could not be processed',
      'CANCELLED': 'Your payment has been cancelled'
    };

    const subject = `Payment Update - ${data.transaction.reference}`;
    const statusMessage = statusMessages[data.status] || 'Payment status updated';

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${subject}</title>
        ${this.getBaseTemplate()}
      </head>
      <body>
        <div class="email-wrapper">
          <div class="email-container">
            <div class="header">
              <img src="${this.companyInfo.logo}" alt="${this.companyInfo.name}" class="logo">
              <div class="header-title">${this.companyInfo.name}</div>
              <div class="header-subtitle">Payment Status Update</div>
            </div>

            <div class="content">
              <div class="greeting">Hi ${data.user.firstName || 'there'},</div>

              <div class="message">
                <strong>${statusMessage}</strong>
              </div>

              <div class="info-card">
                <div class="info-card-header">Payment Details</div>
                <div class="info-row"><span class="info-label">Reference</span><span class="info-value">${data.transaction.reference}</span></div>
                <div class="info-row"><span class="info-label">Amount</span><span class="info-value">${data.transaction.amount.toLocaleString()} ${data.transaction.currency}</span></div>
                <div class="info-row"><span class="info-label">Current Status</span><span class="info-value">${data.status}</span></div>
                <div class="info-row"><span class="info-label">Updated</span><span class="info-value">${new Date().toLocaleString()}</span></div>
              </div>

              ${this.getStatusSpecificContent(data.status, data.transaction)}
            </div>

            <div class="footer">
              <div class="footer-text">
                Questions? Contact us at ${this.companyInfo.supportEmail}<br>
                © ${new Date().getFullYear()} ${this.companyInfo.name}. All rights reserved.
              </div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
Hi ${data.user.firstName || 'there'},

${statusMessage}

Payment Details:
- Reference: ${data.transaction.reference}
- Amount: ${data.transaction.amount.toLocaleString()} ${data.transaction.currency}
- Status: ${data.status}
- Updated: ${new Date().toLocaleString()}

Questions? Contact us at ${this.companyInfo.supportEmail}
    `;

    return { subject, html, text };
  }

  private generateFundsReleasedTemplate(data: {
    user: EscrowParticipant;
    transaction: EscrowTransaction;
  }): EmailTemplate {
    const subject = `Funds Released - ${data.transaction.reference}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${subject}</title>
        ${this.getBaseTemplate()}
      </head>
      <body>
        <div class="email-wrapper">
          <div class="email-container">
            <div class="header">
              <img src="${this.companyInfo.logo}" alt="${this.companyInfo.name}" class="logo">
              <div class="header-title">${this.companyInfo.name}</div>
              <div class="header-subtitle">Funds Released</div>
            </div>

            <div class="content">
              <div class="greeting">Hi ${data.user.firstName || 'there'},</div>

              <div class="alert-box alert-success">
                <div class="alert-title">Great News!</div>
                <div class="alert-text">Your funds have been released and are now available in your wallet.</div>
              </div>

              <div class="info-card">
                <div class="info-card-header">Release Details</div>
                <div class="info-row"><span class="info-label">Transaction</span><span class="info-value">${data.transaction.reference}</span></div>
                <div class="info-row"><span class="info-label">Amount Released</span><span class="info-value">${data.transaction.splitAmounts?.host?.toLocaleString() || data.transaction.amount.toLocaleString()} ${data.transaction.currency}</span></div>
                <div class="info-row"><span class="info-label">Released At</span><span class="info-value">${data.transaction.releasedAt ? new Date(data.transaction.releasedAt).toLocaleString() : new Date().toLocaleString()}</span></div>
              </div>

              <div class="message">
                You can now withdraw these funds to your mobile money account or bank account through your wallet.
              </div>
            </div>

            <div class="footer">
              <div class="footer-text">
                Questions? Contact us at ${this.companyInfo.supportEmail}<br>
                © ${new Date().getFullYear()} ${this.companyInfo.name}. All rights reserved.
              </div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
Hi ${data.user.firstName || 'there'},

Great news! Your funds have been released and are now available in your wallet.

Release Details:
- Transaction: ${data.transaction.reference}
- Amount Released: ${data.transaction.splitAmounts?.host?.toLocaleString() || data.transaction.amount.toLocaleString()} ${data.transaction.currency}
- Released At: ${data.transaction.releasedAt ? new Date(data.transaction.releasedAt).toLocaleString() : new Date().toLocaleString()}

You can now withdraw these funds through your wallet.

Questions? Contact us at ${this.companyInfo.supportEmail}
    `;

    return { subject, html, text };
  }

  private generateWithdrawalRequestTemplate(data: {
    user: EscrowParticipant;
    withdrawal: WithdrawalRequest;
  }): EmailTemplate {
    const subject = `Withdrawal Request Submitted - ${data.withdrawal.reference}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${subject}</title>
        ${this.getBaseTemplate()}
      </head>
      <body>
        <div class="email-wrapper">
          <div class="email-container">
            <div class="header">
              <img src="${this.companyInfo.logo}" alt="${this.companyInfo.name}" class="logo">
              <div class="header-title">${this.companyInfo.name}</div>
              <div class="header-subtitle">Withdrawal Request</div>
            </div>

            <div class="content">
              <div class="greeting">Hi ${data.user.firstName || 'there'},</div>

              <div class="message">
                Your withdrawal request has been submitted and is being processed.
              </div>

              <div class="info-card">
                <div class="info-card-header">Withdrawal Details</div>
                <div class="info-row"><span class="info-label">Reference</span><span class="info-value">${data.withdrawal.reference}</span></div>
                <div class="info-row"><span class="info-label">Amount</span><span class="info-value">${data.withdrawal.amount.toLocaleString()} ${data.withdrawal.currency}</span></div>
                <div class="info-row"><span class="info-label">Method</span><span class="info-value">${data.withdrawal.method === 'MOBILE' ? 'Mobile Money' : 'Bank Transfer'}</span></div>
                <div class="info-row"><span class="info-label">Status</span><span class="info-value">${data.withdrawal.status}</span></div>
                <div class="info-row"><span class="info-label">Submitted</span><span class="info-value">${data.withdrawal.createdAt.toLocaleString()}</span></div>
              </div>

              <div class="alert-box alert-info">
                <div class="alert-title">Processing Time</div>
                <div class="alert-text">
                  <ul>
                    <li>Mobile Money: 5-15 minutes</li>
                    <li>Bank Transfer: 1-3 business days</li>
                  </ul>
                </div>
              </div>

              <div class="message">
                You'll receive another email once the withdrawal is completed.
              </div>
            </div>

            <div class="footer">
              <div class="footer-text">
                Questions? Contact us at ${this.companyInfo.supportEmail}<br>
                © ${new Date().getFullYear()} ${this.companyInfo.name}. All rights reserved.
              </div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
Hi ${data.user.firstName || 'there'},

Your withdrawal request has been submitted and is being processed.

Withdrawal Details:
- Reference: ${data.withdrawal.reference}
- Amount: ${data.withdrawal.amount.toLocaleString()} ${data.withdrawal.currency}
- Method: ${data.withdrawal.method === 'MOBILE' ? 'Mobile Money' : 'Bank Transfer'}
- Status: ${data.withdrawal.status}
- Submitted: ${data.withdrawal.createdAt.toLocaleString()}

Processing Time:
- Mobile Money: 5-15 minutes
- Bank Transfer: 1-3 business days

You'll receive another email once the withdrawal is completed.

Questions? Contact us at ${this.companyInfo.supportEmail}
    `;

    return { subject, html, text };
  }

  private generateRefundProcessedTemplate(data: {
    user: EscrowParticipant;
    transaction: EscrowTransaction;
    refundAmount: number;
  }): EmailTemplate {
    const subject = `Refund Processed - ${data.transaction.reference}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${subject}</title>
        ${this.getBaseTemplate()}
      </head>
      <body>
        <div class="email-wrapper">
          <div class="email-container">
            <div class="header">
              <img src="${this.companyInfo.logo}" alt="${this.companyInfo.name}" class="logo">
              <div class="header-title">${this.companyInfo.name}</div>
              <div class="header-subtitle">Refund Processed</div>
            </div>

            <div class="content">
              <div class="greeting">Hi ${data.user.firstName || 'there'},</div>

              <div class="alert-box alert-info">
                <div class="alert-title">Refund Processed</div>
                <div class="alert-text">Your refund has been processed and will be credited back to your original payment method.</div>
              </div>

              <div class="info-card">
                <div class="info-card-header">Refund Details</div>
                <div class="info-row"><span class="info-label">Original Transaction</span><span class="info-value">${data.transaction.reference}</span></div>
                <div class="info-row"><span class="info-label">Refund Amount</span><span class="info-value">${data.refundAmount.toLocaleString()} ${data.transaction.currency}</span></div>
                <div class="info-row"><span class="info-label">Reason</span><span class="info-value">${data.transaction.failureReason || 'Service cancellation'}</span></div>
                <div class="info-row"><span class="info-label">Processed</span><span class="info-value">${new Date().toLocaleString()}</span></div>
              </div>

              <div class="alert-box alert-warning">
                <div class="alert-title">Refund Timeline</div>
                <div class="alert-text">
                  <ul>
                    <li>Mobile Money: 5-15 minutes</li>
                    <li>Bank/Card: 3-5 business days</li>
                  </ul>
                </div>
              </div>

              <div class="message">
                If you don't see the refund within the expected timeframe, please contact our support team.
              </div>
            </div>

            <div class="footer">
              <div class="footer-text">
                Questions? Contact us at ${this.companyInfo.supportEmail}<br>
                © ${new Date().getFullYear()} ${this.companyInfo.name}. All rights reserved.
              </div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
Hi ${data.user.firstName || 'there'},

Your refund has been processed and will be credited back to your original payment method.

Refund Details:
- Original Transaction: ${data.transaction.reference}
- Refund Amount: ${data.refundAmount.toLocaleString()} ${data.transaction.currency}
- Reason: ${data.transaction.failureReason || 'Service cancellation'}
- Processed: ${new Date().toLocaleString()}

Refund Timeline:
- Mobile Money: 5-15 minutes
- Bank/Card: 3-5 business days

Questions? Contact us at ${this.companyInfo.supportEmail}
    `;

    return { subject, html, text };
  }

  // === BOOKING PAYMENT TEMPLATES ===

  private generateBookingPaymentConfirmationTemplate(data: {
    userName: string;
    bookingId: string;
    propertyName: string;
    amount: number;
    currency: string;
    checkIn: Date;
    checkOut: Date;
    reference: string;
  }): EmailTemplate {
    const subject = `🎉 Payment Successful - Booking Confirmed for ${data.propertyName}`;

    const html = `
      ${this.getBaseTemplate()}
      <body>
        <div class="email-wrapper">
          <div class="email-container">
            <div class="header">
              <div class="header-title">Payment Successful! 🎉</div>
              <div class="header-subtitle">Your booking has been confirmed</div>
            </div>

            <div class="content">
              <div class="greeting">Hi ${data.userName}!</div>

              <div class="message">
                Great news! Your payment has been successfully processed and your booking is now <strong>confirmed</strong>.
              </div>

              <div class="alert-box alert-success">
                <div class="alert-title">✅ Booking Confirmed</div>
                <div class="alert-text">
                  Your reservation for ${data.propertyName} has been confirmed. The host has been notified.
                </div>
              </div>

              <div class="info-card">
                <div class="info-card-header">📋 Booking Details</div>
                <div class="info-row">
                  <span class="info-label">Booking ID</span>
                  <span class="info-value">${data.bookingId}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Property</span>
                  <span class="info-value">${data.propertyName}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Check-In</span>
                  <span class="info-value">${new Date(data.checkIn).toLocaleDateString()}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Check-Out</span>
                  <span class="info-value">${new Date(data.checkOut).toLocaleDateString()}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Amount Paid</span>
                  <span class="info-value"><strong>${data.amount.toLocaleString()} ${data.currency}</strong></span>
                </div>
                <div class="info-row">
                  <span class="info-label">Reference</span>
                  <span class="info-value">${data.reference}</span>
                </div>
              </div>

              <div class="message">
                <strong>What's Next?</strong>
                <ul>
                  <li>You'll receive check-in instructions from your host closer to your arrival date</li>
                  <li>Your funds are held securely in escrow until check-in is validated</li>
                  <li>The host will receive their payment after successful check-in</li>
                </ul>
              </div>

              <div class="alert-box alert-info">
                <div class="alert-title">💡 Payment Protection</div>
                <div class="alert-text">
                  Your payment is protected by our escrow system. The host only receives funds after you check in successfully.
                </div>
              </div>

              <div class="button-center">
                <a href="${this.companyInfo.website}/bookings/${data.bookingId}" class="button">
                  View Booking Details
                </a>
              </div>

              <div class="message" style="margin-top: 24px; font-size: 13px; color: #6b7280;">
                Need help? Contact us at <a href="mailto:${this.companyInfo.supportEmail}">${this.companyInfo.supportEmail}</a>
              </div>
            </div>

            <div class="footer">
              <div class="footer-text">
                © ${new Date().getFullYear()} ${this.companyInfo.name}. All rights reserved.<br>
                This is an automated message. Please do not reply to this email.
              </div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
Hi ${data.userName}!

🎉 PAYMENT SUCCESSFUL - BOOKING CONFIRMED

Your payment has been successfully processed and your booking is now confirmed!

Booking Details:
- Booking ID: ${data.bookingId}
- Property: ${data.propertyName}
- Check-In: ${new Date(data.checkIn).toLocaleDateString()}
- Check-Out: ${new Date(data.checkOut).toLocaleDateString()}
- Amount Paid: ${data.amount.toLocaleString()} ${data.currency}
- Reference: ${data.reference}

What's Next?
• You'll receive check-in instructions from your host closer to your arrival date
• Your funds are held securely in escrow until check-in is validated
• The host will receive their payment after successful check-in

Payment Protection:
Your payment is protected by our escrow system. The host only receives funds after you check in successfully.

View your booking: ${this.companyInfo.website}/bookings/${data.bookingId}

Need help? Contact us at ${this.companyInfo.supportEmail}
    `;

    return { subject, html, text };
  }

  private generateBookingPaymentStatusTemplate(data: {
    userName: string;
    bookingId: string;
    propertyName: string;
    amount: number;
    status: string;
    reference: string;
  }): EmailTemplate {
    const statusEmoji = data.status === 'completed' ? '✅' :
                       data.status === 'failed' ? '❌' :
                       data.status === 'refunded' ? '💰' : '⏳';

    const subject = `${statusEmoji} Payment ${data.status.toUpperCase()} - ${data.propertyName}`;

    const alertClass = data.status === 'completed' ? 'alert-success' :
                      data.status === 'failed' ? 'alert-error' :
                      data.status === 'refunded' ? 'alert-warning' : 'alert-info';

    const statusMessage = data.status === 'completed' ? 'Your payment was successful and your booking is confirmed!' :
                         data.status === 'failed' ? 'Unfortunately, your payment could not be processed.' :
                         data.status === 'refunded' ? 'Your payment has been refunded.' :
                         'Your payment is being processed.';

    const html = `
      ${this.getBaseTemplate()}
      <body>
        <div class="email-wrapper">
          <div class="email-container">
            <div class="header">
              <div class="header-title">Payment Update ${statusEmoji}</div>
              <div class="header-subtitle">${data.propertyName}</div>
            </div>

            <div class="content">
              <div class="greeting">Hi ${data.userName}!</div>

              <div class="alert-box ${alertClass}">
                <div class="alert-title">Payment Status: ${data.status.toUpperCase()}</div>
                <div class="alert-text">${statusMessage}</div>
              </div>

              <div class="info-card">
                <div class="info-card-header">Payment Details</div>
                <div class="info-row">
                  <span class="info-label">Booking ID</span>
                  <span class="info-value">${data.bookingId}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Property</span>
                  <span class="info-value">${data.propertyName}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Amount</span>
                  <span class="info-value">${data.amount.toLocaleString()} RWF</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Status</span>
                  <span class="info-value"><strong>${data.status.toUpperCase()}</strong></span>
                </div>
                <div class="info-row">
                  <span class="info-label">Reference</span>
                  <span class="info-value">${data.reference}</span>
                </div>
              </div>

              <div class="button-center">
                <a href="${this.companyInfo.website}/bookings/${data.bookingId}" class="button">
                  View Booking
                </a>
              </div>
            </div>

            <div class="footer">
              <div class="footer-text">
                © ${new Date().getFullYear()} ${this.companyInfo.name}. All rights reserved.
              </div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
Hi ${data.userName}!

${statusEmoji} PAYMENT UPDATE

Status: ${data.status.toUpperCase()}
${statusMessage}

Payment Details:
- Booking ID: ${data.bookingId}
- Property: ${data.propertyName}
- Amount: ${data.amount.toLocaleString()} RWF
- Reference: ${data.reference}

View your booking: ${this.companyInfo.website}/bookings/${data.bookingId}

Need help? Contact us at ${this.companyInfo.supportEmail}
    `;

    return { subject, html, text };
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

  private getStatusSpecificContent(status: EscrowTransactionStatus, transaction: EscrowTransaction): string {
    switch (status) {
      case 'HELD':
        return '<div class="message">Your funds are now securely held in escrow and will be released once the service is confirmed as delivered.</div>';
      case 'RELEASED':
        return '<div class="message">The funds have been released to the service provider. Thank you for using our platform!</div>';
      case 'REFUNDED':
        return '<div class="message">Your refund has been processed and should appear in your account within 3-5 business days.</div>';
      case 'FAILED':
        return `<div class="alert-box alert-error"><div class="alert-title">Payment Failed</div><div class="alert-text">Unfortunately, your payment could not be processed. ${transaction.failureReason ? `Reason: ${transaction.failureReason}` : 'Please try again or contact support.'}</div></div>`;
      default:
        return '';
    }
  }

  // === HEALTH CHECK ===

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      // Test by checking if the API key is configured
      if (!config.brevoApiKey) {
        return {
          success: false,
          message: 'Brevo API key not configured'
        };
      }
      return {
        success: true,
        message: 'Email service is healthy'
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Email service error: ${error.message}`
      };
    }
  }
}
