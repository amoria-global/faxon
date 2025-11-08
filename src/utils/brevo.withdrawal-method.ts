// utils/brevo.withdrawal-method.ts - Email notifications for withdrawal method approval/rejection

import * as Brevo from '@getbrevo/brevo';
import { config } from '../config/config';

interface CompanyInfo {
  name: string;
  website: string;
  supportEmail: string;
  logo: string;
}

interface WithdrawalMethodData {
  id: string;
  userId: number;
  userEmail: string;
  userFirstName: string;
  userLastName: string;
  methodType: string;
  accountName: string;
  accountDetails: {
    providerCode?: string;
    providerName?: string;
    accountNumber?: string;
    providerType?: string;
    country?: string;
    currency?: string;
  };
  createdAt: Date;
}

interface AdminInfo {
  email: string;
  firstName?: string;
  lastName?: string;
}

export class BrevoWithdrawalMethodService {
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
      name: 'Jambolush Payments',
      email: config.brevoSenderEmail
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
   * Send email to admin when a user submits a withdrawal method for approval
   */
  async sendAdminNotificationForNewMethod(data: WithdrawalMethodData): Promise<void> {
    try {
      const { subject, html, text } = this.generateAdminNotificationTemplate(data);

      await this.sendEmail({
        to: this.adminEmail,
        subject,
        html,
        text
      });

      console.log(`Admin notification sent for withdrawal method ${data.id}`);
    } catch (error: any) {
      console.error('Failed to send admin notification:', error);
      throw error;
    }
  }

  /**
   * Send email to user when their withdrawal method is approved
   */
  async sendUserApprovalNotification(data: WithdrawalMethodData & { approvedBy: string; approvedAt: Date }): Promise<void> {
    try {
      const { subject, html, text } = this.generateUserApprovalTemplate(data);

      await this.sendEmail({
        to: data.userEmail,
        subject,
        html,
        text
      });

      console.log(`Approval notification sent to user ${data.userEmail}`);
    } catch (error: any) {
      console.error('Failed to send user approval notification:', error);
      throw error;
    }
  }

  /**
   * Send email to user when their withdrawal method is rejected
   */
  async sendUserRejectionNotification(data: WithdrawalMethodData & { rejectedBy: string; rejectionReason: string; rejectedAt: Date }): Promise<void> {
    try {
      const { subject, html, text } = this.generateUserRejectionTemplate(data);

      await this.sendEmail({
        to: data.userEmail,
        subject,
        html,
        text
      });

      console.log(`Rejection notification sent to user ${data.userEmail}`);
    } catch (error: any) {
      console.error('Failed to send user rejection notification:', error);
      throw error;
    }
  }

  // === TEMPLATE GENERATORS ===

  private generateAdminNotificationTemplate(data: WithdrawalMethodData): { subject: string; html: string; text: string } {
    const subject = `🔔 New Withdrawal Method Requires Approval - ${data.userFirstName} ${data.userLastName}`;

    const methodTypeLabel = data.methodType === 'BANK' ? 'Bank Account' : 'Mobile Money';
    const approvalLink = `${this.companyInfo.website}/admin/withdrawal-methods/${data.id}`;

    const html = `
      ${this.getBaseTemplate()}
      <body>
        <div class="email-wrapper">
          <div class="email-container">
            <div class="header">
              <img src="${this.companyInfo.logo}" alt="${this.companyInfo.name}" class="logo">
              <div class="header-title">Withdrawal Method Approval Required</div>
              <div class="header-subtitle">Action Needed</div>
            </div>

            <div class="content">
              <div class="greeting">Hello Admin,</div>

              <div class="alert-box alert-warning">
                <div class="alert-title">⏳ Pending Approval</div>
                <div class="alert-text">
                  A user has submitted a new withdrawal method that requires your approval before they can use it for withdrawals.
                </div>
              </div>

              <div class="info-card">
                <div class="info-card-header">👤 User Information</div>
                <div class="info-row">
                  <span class="info-label">User ID</span>
                  <span class="info-value">${data.userId}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Name</span>
                  <span class="info-value">${data.userFirstName} ${data.userLastName}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Email</span>
                  <span class="info-value">${data.userEmail}</span>
                </div>
              </div>

              <div class="info-card">
                <div class="info-card-header">💳 Withdrawal Method Details</div>
                <div class="info-row">
                  <span class="info-label">Method ID</span>
                  <span class="info-value">${data.id}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Type</span>
                  <span class="info-value">${methodTypeLabel}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Account Name</span>
                  <span class="info-value">${data.accountName}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Provider</span>
                  <span class="info-value">${data.accountDetails.providerName || data.accountDetails.providerCode || 'N/A'}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Account Number</span>
                  <span class="info-value">${data.accountDetails.accountNumber || 'N/A'}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Country</span>
                  <span class="info-value">${data.accountDetails.country || 'N/A'}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Currency</span>
                  <span class="info-value">${data.accountDetails.currency || 'N/A'}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Submitted At</span>
                  <span class="info-value">${new Date(data.createdAt).toLocaleString()}</span>
                </div>
              </div>

              <div class="alert-box alert-info">
                <div class="alert-title">📋 Required Actions</div>
                <div class="alert-text">
                  <ul>
                    <li>Verify the account details match the user's identity</li>
                    <li>Ensure the account number format is valid for the selected provider</li>
                    <li>Check for any suspicious activity or duplicate submissions</li>
                    <li>Approve or reject the withdrawal method with appropriate reason</li>
                  </ul>
                </div>
              </div>

              <div class="button-center">
                <a href="${approvalLink}" class="button">
                  Review & Approve
                </a>
              </div>

              <div class="message" style="margin-top: 24px; font-size: 13px; color: #6b7280;">
                Need help? Contact tech support at <a href="mailto:${this.companyInfo.supportEmail}">${this.companyInfo.supportEmail}</a>
              </div>
            </div>

            <div class="footer">
              <div class="footer-text">
                © ${new Date().getFullYear()} ${this.companyInfo.name}. All rights reserved.<br>
                This is an automated admin notification. Please do not reply to this email.
              </div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
Hello Admin,

🔔 NEW WITHDRAWAL METHOD REQUIRES APPROVAL

A user has submitted a new withdrawal method that requires your approval.

USER INFORMATION:
- User ID: ${data.userId}
- Name: ${data.userFirstName} ${data.userLastName}
- Email: ${data.userEmail}

WITHDRAWAL METHOD DETAILS:
- Method ID: ${data.id}
- Type: ${methodTypeLabel}
- Account Name: ${data.accountName}
- Provider: ${data.accountDetails.providerName || data.accountDetails.providerCode || 'N/A'}
- Account Number: ${data.accountDetails.accountNumber || 'N/A'}
- Country: ${data.accountDetails.country || 'N/A'}
- Currency: ${data.accountDetails.currency || 'N/A'}
- Submitted: ${new Date(data.createdAt).toLocaleString()}

REQUIRED ACTIONS:
• Verify the account details match the user's identity
• Ensure the account number format is valid
• Check for any suspicious activity
• Approve or reject the withdrawal method

Review and take action: ${approvalLink}

---
${this.companyInfo.name}
${this.companyInfo.website}
    `;

    return { subject, html, text };
  }

  private generateUserApprovalTemplate(data: WithdrawalMethodData & { approvedBy: string; approvedAt: Date }): { subject: string; html: string; text: string } {
    const subject = `✅ Withdrawal Method Approved - ${data.accountDetails.providerName}`;

    const methodTypeLabel = data.methodType === 'BANK' ? 'Bank Account' : 'Mobile Money';

    const html = `
      ${this.getBaseTemplate()}
      <body>
        <div class="email-wrapper">
          <div class="email-container">
            <div class="header">
              <img src="${this.companyInfo.logo}" alt="${this.companyInfo.name}" class="logo">
              <div class="header-title">Withdrawal Method Approved! 🎉</div>
              <div class="header-subtitle">You can now use this method for withdrawals</div>
            </div>

            <div class="content">
              <div class="greeting">Hi ${data.userFirstName}!</div>

              <div class="alert-box alert-success">
                <div class="alert-title">✅ Approved</div>
                <div class="alert-text">
                  Great news! Your ${methodTypeLabel.toLowerCase()} withdrawal method has been approved and is now ready to use.
                </div>
              </div>

              <div class="info-card">
                <div class="info-card-header">💳 Approved Withdrawal Method</div>
                <div class="info-row">
                  <span class="info-label">Type</span>
                  <span class="info-value">${methodTypeLabel}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Account Name</span>
                  <span class="info-value">${data.accountName}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Provider</span>
                  <span class="info-value">${data.accountDetails.providerName || 'N/A'}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Account Number</span>
                  <span class="info-value">${this.maskAccountNumber(data.accountDetails.accountNumber || '')}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Approved At</span>
                  <span class="info-value">${new Date(data.approvedAt).toLocaleString()}</span>
                </div>
              </div>

              <div class="message">
                <strong>What's Next?</strong>
                <ul>
                  <li>You can now select this method when making withdrawals from your wallet</li>
                  <li>Make sure you have sufficient balance in your wallet before requesting a withdrawal</li>
                  <li>Withdrawal fees apply based on your withdrawal amount</li>
                </ul>
              </div>

              <div class="button-center">
                <a href="${this.companyInfo.website}/wallet" class="button">
                  Go to Wallet
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
Hi ${data.userFirstName}!

✅ WITHDRAWAL METHOD APPROVED

Great news! Your ${methodTypeLabel.toLowerCase()} withdrawal method has been approved.

APPROVED WITHDRAWAL METHOD:
- Type: ${methodTypeLabel}
- Account Name: ${data.accountName}
- Provider: ${data.accountDetails.providerName || 'N/A'}
- Account Number: ${this.maskAccountNumber(data.accountDetails.accountNumber || '')}
- Approved At: ${new Date(data.approvedAt).toLocaleString()}

What's Next?
• You can now select this method when making withdrawals
• Ensure sufficient balance in your wallet
• Withdrawal fees apply based on amount

Go to your wallet: ${this.companyInfo.website}/wallet

Need help? Contact us at ${this.companyInfo.supportEmail}

---
${this.companyInfo.name}
${this.companyInfo.website}
    `;

    return { subject, html, text };
  }

  private generateUserRejectionTemplate(data: WithdrawalMethodData & { rejectedBy: string; rejectionReason: string; rejectedAt: Date }): { subject: string; html: string; text: string } {
    const subject = `❌ Withdrawal Method Rejected - ${data.accountDetails.providerName}`;

    const methodTypeLabel = data.methodType === 'BANK' ? 'Bank Account' : 'Mobile Money';

    const html = `
      ${this.getBaseTemplate()}
      <body>
        <div class="email-wrapper">
          <div class="email-container">
            <div class="header">
              <img src="${this.companyInfo.logo}" alt="${this.companyInfo.name}" class="logo">
              <div class="header-title">Withdrawal Method Rejected</div>
              <div class="header-subtitle">Action Required</div>
            </div>

            <div class="content">
              <div class="greeting">Hi ${data.userFirstName},</div>

              <div class="alert-box alert-error">
                <div class="alert-title">❌ Rejected</div>
                <div class="alert-text">
                  Unfortunately, your ${methodTypeLabel.toLowerCase()} withdrawal method could not be approved at this time.
                </div>
              </div>

              <div class="info-card">
                <div class="info-card-header">💳 Rejected Withdrawal Method</div>
                <div class="info-row">
                  <span class="info-label">Type</span>
                  <span class="info-value">${methodTypeLabel}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Account Name</span>
                  <span class="info-value">${data.accountName}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Provider</span>
                  <span class="info-value">${data.accountDetails.providerName || 'N/A'}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Rejected At</span>
                  <span class="info-value">${new Date(data.rejectedAt).toLocaleString()}</span>
                </div>
              </div>

              <div class="alert-box alert-warning">
                <div class="alert-title">📝 Reason for Rejection</div>
                <div class="alert-text">${data.rejectionReason}</div>
              </div>

              <div class="message">
                <strong>What Can You Do?</strong>
                <ul>
                  <li>Review the rejection reason above</li>
                  <li>Correct the issue if possible (e.g., verify account details)</li>
                  <li>Submit a new withdrawal method with the correct information</li>
                  <li>Contact support if you believe this is an error</li>
                </ul>
              </div>

              <div class="button-center">
                <a href="${this.companyInfo.website}/wallet/withdrawal-methods" class="button">
                  Add New Method
                </a>
              </div>

              <div class="message" style="margin-top: 24px; font-size: 13px; color: #6b7280;">
                Questions? Contact us at <a href="mailto:${this.companyInfo.supportEmail}">${this.companyInfo.supportEmail}</a>
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
Hi ${data.userFirstName},

❌ WITHDRAWAL METHOD REJECTED

Unfortunately, your ${methodTypeLabel.toLowerCase()} withdrawal method could not be approved.

REJECTED WITHDRAWAL METHOD:
- Type: ${methodTypeLabel}
- Account Name: ${data.accountName}
- Provider: ${data.accountDetails.providerName || 'N/A'}
- Rejected At: ${new Date(data.rejectedAt).toLocaleString()}

REASON FOR REJECTION:
${data.rejectionReason}

What Can You Do?
• Review the rejection reason above
• Correct the issue if possible
• Submit a new withdrawal method with correct information
• Contact support if you believe this is an error

Add a new method: ${this.companyInfo.website}/wallet/withdrawal-methods

Questions? Contact us at ${this.companyInfo.supportEmail}

---
${this.companyInfo.name}
${this.companyInfo.website}
    `;

    return { subject, html, text };
  }

  // === BASE TEMPLATE ===

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
          .info-value { color: #6b7280; font-size: 13px; text-align: right; word-break: break-word; max-width: 60%; }
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
            body { padding: 5px; }
            .email-wrapper { width: 100%; max-width: 100%; }
            .email-container { border-radius: 8px; }
            .content { padding: 20px 16px; }
            .header { padding: 24px 16px; }
            .header-title { font-size: 20px; }
            .footer { padding: 20px 16px; }
            .info-card { padding: 12px; }
            .info-row { flex-direction: column; align-items: flex-start; gap: 4px; padding: 8px 0; }
            .info-label { min-width: auto; width: 100%; }
            .info-value { text-align: left; max-width: 100%; width: 100%; }
            .greeting { font-size: 18px; }
            .message, .alert-text { font-size: 14px; }
            .button { display: block; width: 100%; padding: 14px 20px; }
          }
          @media (max-width: 480px) {
            .header-title { font-size: 18px; }
            .greeting { font-size: 16px; }
            .info-label, .info-value { font-size: 12px; }
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

  private maskAccountNumber(accountNumber: string): string {
    if (accountNumber.length <= 4) return accountNumber;

    const last4 = accountNumber.slice(-4);
    const masked = '*'.repeat(Math.max(0, accountNumber.length - 4));
    return masked + last4;
  }
}
