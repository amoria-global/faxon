"use strict";
// services/email.service.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailService = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
class EmailService {
    constructor() {
        // Initialize email transporter
        this.transporter = nodemailer_1.default.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT || '587'),
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });
        // Company information
        this.companyInfo = {
            name: process.env.COMPANY_NAME || 'Jambolush',
            website: process.env.COMPANY_WEBSITE || 'https://jambolush.com',
            supportEmail: process.env.COMPANY_SUPPORT_EMAIL || 'support@jambolush.com',
            logo: process.env.COMPANY_LOGO || 'https://jambolush.com/logo.png'
        };
    }
    // === DEPOSIT NOTIFICATIONS ===
    async sendDepositCreatedEmail(data) {
        try {
            const template = this.generateDepositCreatedTemplate(data);
            await this.sendEmail({
                to: data.user.email,
                subject: template.subject,
                html: template.html,
                text: template.text
            });
            console.log(`Deposit created email sent to ${data.user.email}`);
        }
        catch (error) {
            console.error('Failed to send deposit created email:', error);
            throw error;
        }
    }
    // === STATUS UPDATE NOTIFICATIONS ===
    async sendTransactionStatusEmail(data) {
        try {
            const template = this.generateStatusUpdateTemplate(data);
            await this.sendEmail({
                to: data.user.email,
                subject: template.subject,
                html: template.html,
                text: template.text
            });
            console.log(`Status update email sent to ${data.user.email} - Status: ${data.status}`);
        }
        catch (error) {
            console.error('Failed to send status update email:', error);
            throw error;
        }
    }
    // === RELEASE NOTIFICATIONS ===
    async sendFundsReleasedEmail(data) {
        try {
            const template = this.generateFundsReleasedTemplate(data);
            await this.sendEmail({
                to: data.user.email,
                subject: template.subject,
                html: template.html,
                text: template.text
            });
            console.log(`Funds released email sent to ${data.user.email}`);
        }
        catch (error) {
            console.error('Failed to send funds released email:', error);
            throw error;
        }
    }
    // === WITHDRAWAL NOTIFICATIONS ===
    async sendWithdrawalRequestEmail(data) {
        try {
            const template = this.generateWithdrawalRequestTemplate(data);
            await this.sendEmail({
                to: data.user.email,
                subject: template.subject,
                html: template.html,
                text: template.text
            });
            console.log(`Withdrawal request email sent to ${data.user.email}`);
        }
        catch (error) {
            console.error('Failed to send withdrawal request email:', error);
            throw error;
        }
    }
    // === REFUND NOTIFICATIONS ===
    async sendRefundProcessedEmail(data) {
        try {
            const template = this.generateRefundProcessedTemplate(data);
            await this.sendEmail({
                to: data.user.email,
                subject: template.subject,
                html: template.html,
                text: template.text
            });
            console.log(`Refund processed email sent to ${data.user.email}`);
        }
        catch (error) {
            console.error('Failed to send refund processed email:', error);
            throw error;
        }
    }
    // === TEMPLATE GENERATORS ===
    generateDepositCreatedTemplate(data) {
        const subject = `Complete Your Payment - ${data.transaction.reference}`;
        const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${subject}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { text-align: center; margin-bottom: 30px; }
          .logo { max-width: 150px; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 8px; }
          .button { 
            display: inline-block; 
            padding: 12px 30px; 
            background: #007bff; 
            color: white; 
            text-decoration: none; 
            border-radius: 5px; 
            margin: 20px 0;
          }
          .details { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <img src="${this.companyInfo.logo}" alt="${this.companyInfo.name}" class="logo">
          </div>
          
          <div class="content">
            <h2>Hi ${data.user.firstName || 'there'},</h2>
            
            <p>Your payment has been initialized and is being held securely in escrow. Please complete your payment to proceed with your booking.</p>
            
            <div class="details">
              <h3>Payment Details</h3>
              <p><strong>Reference:</strong> ${data.transaction.reference}</p>
              <p><strong>Amount:</strong> ${data.transaction.amount.toLocaleString()} ${data.transaction.currency}</p>
              <p><strong>Description:</strong> ${data.transaction.description || 'Escrow payment'}</p>
              <p><strong>Status:</strong> Pending Payment</p>
            </div>
            
            <p style="text-align: center;">
              <a href="${data.checkoutUrl}" class="button">Complete Payment</a>
            </p>
            
            <p><strong>Important:</strong> Your funds will be securely held in escrow until the service is confirmed as delivered. This protects both you and the service provider.</p>
          </div>
          
          <div class="footer">
            <p>Questions? Contact us at <a href="mailto:${this.companyInfo.supportEmail}">${this.companyInfo.supportEmail}</a></p>
            <p>&copy; ${new Date().getFullYear()} ${this.companyInfo.name}. All rights reserved.</p>
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
    generateStatusUpdateTemplate(data) {
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
        <title>${subject}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { text-align: center; margin-bottom: 30px; }
          .logo { max-width: 150px; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 8px; }
          .status-success { color: #28a745; }
          .status-warning { color: #ffc107; }
          .status-danger { color: #dc3545; }
          .details { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <img src="${this.companyInfo.logo}" alt="${this.companyInfo.name}" class="logo">
          </div>
          
          <div class="content">
            <h2>Hi ${data.user.firstName || 'there'},</h2>
            
            <p class="${this.getStatusClass(data.status)}">
              <strong>${statusMessage}</strong>
            </p>
            
            <div class="details">
              <h3>Payment Details</h3>
              <p><strong>Reference:</strong> ${data.transaction.reference}</p>
              <p><strong>Amount:</strong> ${data.transaction.amount.toLocaleString()} ${data.transaction.currency}</p>
              <p><strong>Current Status:</strong> ${data.status}</p>
              <p><strong>Updated:</strong> ${new Date().toLocaleString()}</p>
            </div>
            
            ${this.getStatusSpecificContent(data.status, data.transaction)}
          </div>
          
          <div class="footer">
            <p>Questions? Contact us at <a href="mailto:${this.companyInfo.supportEmail}">${this.companyInfo.supportEmail}</a></p>
            <p>&copy; ${new Date().getFullYear()} ${this.companyInfo.name}. All rights reserved.</p>
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
    generateFundsReleasedTemplate(data) {
        const subject = `Funds Released - ${data.transaction.reference}`;
        const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${subject}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { text-align: center; margin-bottom: 30px; }
          .logo { max-width: 150px; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 8px; }
          .success { color: #28a745; }
          .details { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <img src="${this.companyInfo.logo}" alt="${this.companyInfo.name}" class="logo">
          </div>
          
          <div class="content">
            <h2>Hi ${data.user.firstName || 'there'},</h2>
            
            <p class="success"><strong>Great news! Your funds have been released and are now available in your wallet.</strong></p>
            
            <div class="details">
              <h3>Release Details</h3>
              <p><strong>Transaction:</strong> ${data.transaction.reference}</p>
              <p><strong>Amount Released:</strong> ${data.transaction.splitAmounts?.host?.toLocaleString() || data.transaction.amount.toLocaleString()} ${data.transaction.currency}</p>
              <p><strong>Released At:</strong> ${data.transaction.releasedAt ? new Date(data.transaction.releasedAt).toLocaleString() : new Date().toLocaleString()}</p>
            </div>
            
            <p>You can now withdraw these funds to your mobile money account or bank account through your wallet.</p>
          </div>
          
          <div class="footer">
            <p>Questions? Contact us at <a href="mailto:${this.companyInfo.supportEmail}">${this.companyInfo.supportEmail}</a></p>
            <p>&copy; ${new Date().getFullYear()} ${this.companyInfo.name}. All rights reserved.</p>
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
    generateWithdrawalRequestTemplate(data) {
        const subject = `Withdrawal Request Submitted - ${data.withdrawal.reference}`;
        const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${subject}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { text-align: center; margin-bottom: 30px; }
          .logo { max-width: 150px; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 8px; }
          .details { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <img src="${this.companyInfo.logo}" alt="${this.companyInfo.name}" class="logo">
          </div>
          
          <div class="content">
            <h2>Hi ${data.user.firstName || 'there'},</h2>
            
            <p>Your withdrawal request has been submitted and is being processed.</p>
            
            <div class="details">
              <h3>Withdrawal Details</h3>
              <p><strong>Reference:</strong> ${data.withdrawal.reference}</p>
              <p><strong>Amount:</strong> ${data.withdrawal.amount.toLocaleString()} ${data.withdrawal.currency}</p>
              <p><strong>Method:</strong> ${data.withdrawal.method === 'MOBILE' ? 'Mobile Money' : 'Bank Transfer'}</p>
              <p><strong>Status:</strong> ${data.withdrawal.status}</p>
              <p><strong>Submitted:</strong> ${data.withdrawal.createdAt.toLocaleString()}</p>
            </div>
            
            <p><strong>Processing Time:</strong></p>
            <ul>
              <li>Mobile Money: 5-15 minutes</li>
              <li>Bank Transfer: 1-3 business days</li>
            </ul>
            
            <p>You'll receive another email once the withdrawal is completed.</p>
          </div>
          
          <div class="footer">
            <p>Questions? Contact us at <a href="mailto:${this.companyInfo.supportEmail}">${this.companyInfo.supportEmail}</a></p>
            <p>&copy; ${new Date().getFullYear()} ${this.companyInfo.name}. All rights reserved.</p>
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
    generateRefundProcessedTemplate(data) {
        const subject = `Refund Processed - ${data.transaction.reference}`;
        const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${subject}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { text-align: center; margin-bottom: 30px; }
          .logo { max-width: 150px; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 8px; }
          .info { color: #17a2b8; }
          .details { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <img src="${this.companyInfo.logo}" alt="${this.companyInfo.name}" class="logo">
          </div>
          
          <div class="content">
            <h2>Hi ${data.user.firstName || 'there'},</h2>
            
            <p class="info"><strong>Your refund has been processed and will be credited back to your original payment method.</strong></p>
            
            <div class="details">
              <h3>Refund Details</h3>
              <p><strong>Original Transaction:</strong> ${data.transaction.reference}</p>
              <p><strong>Refund Amount:</strong> ${data.refundAmount.toLocaleString()} ${data.transaction.currency}</p>
              <p><strong>Reason:</strong> ${data.transaction.failureReason || 'Service cancellation'}</p>
              <p><strong>Processed:</strong> ${new Date().toLocaleString()}</p>
            </div>
            
            <p><strong>Refund Timeline:</strong></p>
            <ul>
              <li>Mobile Money: 5-15 minutes</li>
              <li>Bank/Card: 3-5 business days</li>
            </ul>
            
            <p>If you don't see the refund within the expected timeframe, please contact our support team.</p>
          </div>
          
          <div class="footer">
            <p>Questions? Contact us at <a href="mailto:${this.companyInfo.supportEmail}">${this.companyInfo.supportEmail}</a></p>
            <p>&copy; ${new Date().getFullYear()} ${this.companyInfo.name}. All rights reserved.</p>
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
    // === UTILITY METHODS ===
    async sendEmail(options) {
        const mailOptions = {
            from: options.from || `"${this.companyInfo.name}" <${process.env.SMTP_FROM || 'noreply@jambolush.com'}>`,
            to: options.to,
            subject: options.subject,
            html: options.html,
            text: options.text
        };
        await this.transporter.sendMail(mailOptions);
    }
    getStatusClass(status) {
        switch (status) {
            case 'HELD':
            case 'READY':
            case 'RELEASED':
                return 'status-success';
            case 'PENDING':
                return 'status-warning';
            case 'FAILED':
            case 'CANCELLED':
                return 'status-danger';
            default:
                return '';
        }
    }
    getStatusSpecificContent(status, transaction) {
        switch (status) {
            case 'HELD':
                return '<p>Your funds are now securely held in escrow and will be released once the service is confirmed as delivered.</p>';
            case 'RELEASED':
                return '<p>The funds have been released to the service provider. Thank you for using our platform!</p>';
            case 'REFUNDED':
                return '<p>Your refund has been processed and should appear in your account within 3-5 business days.</p>';
            case 'FAILED':
                return `<p>Unfortunately, your payment could not be processed. ${transaction.failureReason ? `Reason: ${transaction.failureReason}` : 'Please try again or contact support.'}</p>`;
            default:
                return '';
        }
    }
    // === HEALTH CHECK ===
    async testConnection() {
        try {
            await this.transporter.verify();
            return {
                success: true,
                message: 'Email service is healthy'
            };
        }
        catch (error) {
            return {
                success: false,
                message: `Email service error: ${error.message}`
            };
        }
    }
}
exports.EmailService = EmailService;
