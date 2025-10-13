// utils/brevo.xentripay.ts

import * as Brevo from '@getbrevo/brevo';

// ==================== TYPES ====================

interface EmailRecipient {
  email: string;
  name?: string;
}

interface DepositInitiatedEmailData {
  to: string;
  buyerName: string;
  amount: number;
  transactionId: string;
  description: string;
  instructions: string;
  paymentMethod: string;
}

interface FundsHeldEmailData {
  to: string;
  buyerName: string;
  transactionId: string;
  amount: number;
  description: string;
  paymentMethod: string;
}

interface FundsHeldSellerEmailData {
  to: string;
  sellerName: string;
  transactionId: string;
  amount: number;
  description: string;
}

interface PayoutCompletedEmailData {
  to: string;
  sellerName: string;
  transactionId: string;
  amount: number;
  description: string;
}

interface EscrowReleasedEmailData {
  to: string;
  buyerName: string;
  transactionId: string;
  amount: number;
  description: string;
}

interface RefundCompletedEmailData {
  to: string;
  buyerName: string;
  transactionId: string;
  amount: number;
  reason: string;
}

interface RefundNoticeEmailData {
  to: string;
  sellerName: string;
  transactionId: string;
  amount: number;
  reason: string;
}

// ==================== SERVICE ====================

export class BrevoMailingService {
  private transactionalEmailsApi: Brevo.TransactionalEmailsApi;
  private defaultSender: { name: string; email: string };
  private apiKey: string;
  private senderEmail: string;
  private senderName: string;

  constructor() {
    this.apiKey = process.env.BREVO_API_KEY || '';
    this.senderEmail = process.env.BREVO_SENDER_EMAIL || 'noreply@jambolush.com';
    this.senderName = process.env.COMPANY_NAME || 'Jambolush';

    if (!this.apiKey) {
      console.warn('[BREVO] API key not configured. Email sending will fail.');
    }

    if (!this.senderEmail) {
      console.warn('[BREVO] Sender email not configured. Using default.');
    }

    try {
      this.transactionalEmailsApi = new Brevo.TransactionalEmailsApi();
      this.transactionalEmailsApi.setApiKey(
        Brevo.TransactionalEmailsApiApiKeys.apiKey,
        this.apiKey
      );

      this.defaultSender = {
        name: this.senderName,
        email: this.senderEmail
      };

      console.log('[BREVO] ✅ Mailing service initialized');
    } catch (error: any) {
      console.error('[BREVO] ❌ Failed to initialize:', error.message);
      throw new Error(`Brevo initialization failed: ${error.message}`);
    }
  }

  // ==================== CORE EMAIL SENDING ====================

  private async sendEmail(params: {
    to: EmailRecipient[];
    subject: string;
    htmlContent: string;
    textContent?: string;
  }): Promise<string> {
    try {
      const emailData: any = {
        sender: this.defaultSender,
        to: params.to,
        subject: params.subject,
        htmlContent: params.htmlContent,
        ...(params.textContent && { textContent: params.textContent })
      };

      const response: any = await this.transactionalEmailsApi.sendTransacEmail(emailData);
      const messageId = response.messageId || '';

      console.log('[BREVO] ✅ Email sent:', {
        messageId,
        to: params.to.map(r => r.email).join(', '),
        subject: params.subject
      });

      return messageId;
    } catch (error: any) {
      console.error('[BREVO] ❌ Email failed:', {
        error: error.response?.body || error.message,
        to: params.to,
        subject: params.subject
      });
      throw new Error(`Email sending failed: ${error.message}`);
    }
  }

  // ==================== ESCROW EMAIL TEMPLATES ====================

  async sendDepositInitiatedEmail(data: DepositInitiatedEmailData): Promise<void> {
    try {
      await this.sendEmail({
        to: [{ email: data.to, name: data.buyerName }],
        subject: `Payment Required - ${data.transactionId}`,
        htmlContent: this.getDepositInitiatedTemplate(data),
        textContent: this.getDepositInitiatedText(data)
      });
    } catch (error: any) {
      console.error('[BREVO] Failed to send deposit initiated email:', error);
      throw error;
    }
  }

  async sendFundsHeldEmail(data: FundsHeldEmailData): Promise<void> {
    try {
      await this.sendEmail({
        to: [{ email: data.to, name: data.buyerName }],
        subject: `Funds Secured in Escrow - ${data.transactionId}`,
        htmlContent: this.getFundsHeldTemplate(data),
        textContent: this.getFundsHeldText(data)
      });
    } catch (error: any) {
      console.error('[BREVO] Failed to send funds held email:', error);
      throw error;
    }
  }

  async sendFundsHeldSellerEmail(data: FundsHeldSellerEmailData): Promise<void> {
    try {
      await this.sendEmail({
        to: [{ email: data.to, name: data.sellerName }],
        subject: `Payment Received in Escrow - ${data.transactionId}`,
        htmlContent: this.getFundsHeldSellerTemplate(data),
        textContent: this.getFundsHeldSellerText(data)
      });
    } catch (error: any) {
      console.error('[BREVO] Failed to send funds held seller email:', error);
      throw error;
    }
  }

  async sendPayoutCompletedEmail(data: PayoutCompletedEmailData): Promise<void> {
    try {
      await this.sendEmail({
        to: [{ email: data.to, name: data.sellerName }],
        subject: `Payment Released - ${data.transactionId}`,
        htmlContent: this.getPayoutCompletedTemplate(data),
        textContent: this.getPayoutCompletedText(data)
      });
    } catch (error: any) {
      console.error('[BREVO] Failed to send payout completed email:', error);
      throw error;
    }
  }

  async sendEscrowReleasedEmail(data: EscrowReleasedEmailData): Promise<void> {
    try {
      await this.sendEmail({
        to: [{ email: data.to, name: data.buyerName }],
        subject: `Escrow Released - ${data.transactionId}`,
        htmlContent: this.getEscrowReleasedTemplate(data),
        textContent: this.getEscrowReleasedText(data)
      });
    } catch (error: any) {
      console.error('[BREVO] Failed to send escrow released email:', error);
      throw error;
    }
  }

  async sendRefundCompletedEmail(data: RefundCompletedEmailData): Promise<void> {
    try {
      await this.sendEmail({
        to: [{ email: data.to, name: data.buyerName }],
        subject: `Refund Processed - ${data.transactionId}`,
        htmlContent: this.getRefundCompletedTemplate(data),
        textContent: this.getRefundCompletedText(data)
      });
    } catch (error: any) {
      console.error('[BREVO] Failed to send refund completed email:', error);
      throw error;
    }
  }

  async sendRefundNoticeEmail(data: RefundNoticeEmailData): Promise<void> {
    try {
      await this.sendEmail({
        to: [{ email: data.to, name: data.sellerName }],
        subject: `Transaction Refunded - ${data.transactionId}`,
        htmlContent: this.getRefundNoticeTemplate(data),
        textContent: this.getRefundNoticeText(data)
      });
    } catch (error: any) {
      console.error('[BREVO] Failed to send refund notice email:', error);
      throw error;
    }
  }

  // ==================== HTML TEMPLATES ====================

  private getBaseStyles(): string {
    return `
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          margin: 0;
          padding: 0;
          background-color: #f5f5f5;
        }
        .container {
          max-width: 600px;
          margin: 20px auto;
          background: white;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .header {
          background: #083A85;
          color: white;
          padding: 30px 20px;
          text-align: center;
        }
        .header h1 {
          margin: 0;
          font-size: 24px;
        }
        .content {
          padding: 30px 20px;
        }
        .info-box {
          background: #f8f9fa;
          border-left: 4px solid #083A85;
          padding: 15px;
          margin: 20px 0;
          border-radius: 4px;
        }
        .info-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid #e9ecef;
        }
        .info-row:last-child {
          border-bottom: none;
        }
        .info-label {
          font-weight: 600;
          color: #495057;
        }
        .info-value {
          color: #212529;
        }
        .alert {
          padding: 15px;
          margin: 20px 0;
          border-radius: 4px;
          border-left: 4px solid;
        }
        .alert-success {
          background: #d4edda;
          border-color: #28a745;
          color: #155724;
        }
        .alert-warning {
          background: #fff3cd;
          border-color: #ffc107;
          color: #856404;
        }
        .alert-info {
          background: #d1ecf1;
          border-color: #17a2b8;
          color: #0c5460;
        }
        .button {
          display: inline-block;
          padding: 12px 24px;
          background: #083A85;
          color: white;
          text-decoration: none;
          border-radius: 4px;
          margin: 20px 0;
        }
        .footer {
          background: #f8f9fa;
          padding: 20px;
          text-align: center;
          color: #6c757d;
          font-size: 14px;
        }
      </style>
    `;
  }

  private getDepositInitiatedTemplate(data: DepositInitiatedEmailData): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        ${this.getBaseStyles()}
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Payment Required</h1>
          </div>
          <div class="content">
            <p>Hi ${data.buyerName},</p>
            <p>Your escrow transaction has been initiated. Please complete the payment to secure the funds.</p>
            
            <div class="info-box">
              <div class="info-row">
                <span class="info-label">Transaction ID:</span>
                <span class="info-value">${data.transactionId}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Amount:</span>
                <span class="info-value">${data.amount} RWF</span>
              </div>
              <div class="info-row">
                <span class="info-label">Description:</span>
                <span class="info-value">${data.description}</span>
              </div>
            </div>

            <div class="alert alert-info">
              <strong>Payment Instructions:</strong>
              <p>${data.instructions}</p>
            </div>

            <p>Once payment is received, the funds will be held securely in escrow until the transaction is completed.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} ${this.senderName}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private getFundsHeldTemplate(data: FundsHeldEmailData): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        ${this.getBaseStyles()}
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Funds Secured in Escrow</h1>
          </div>
          <div class="content">
            <p>Hi ${data.buyerName},</p>
            
            <div class="alert alert-success">
              <strong>Payment Successful!</strong> Your funds are now held securely in escrow.
            </div>

            <div class="info-box">
              <div class="info-row">
                <span class="info-label">Transaction ID:</span>
                <span class="info-value">${data.transactionId}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Amount:</span>
                <span class="info-value">${data.amount} RWF</span>
              </div>
              <div class="info-row">
                <span class="info-label">Description:</span>
                <span class="info-value">${data.description}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Status:</span>
                <span class="info-value">HELD IN ESCROW</span>
              </div>
            </div>

            <p>The funds will be released to the seller once you confirm that the service/product has been delivered as agreed.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} ${this.senderName}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private getFundsHeldSellerTemplate(data: FundsHeldSellerEmailData): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        ${this.getBaseStyles()}
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Payment Received in Escrow</h1>
          </div>
          <div class="content">
            <p>Hi ${data.sellerName},</p>
            
            <div class="alert alert-success">
              <strong>Good News!</strong> Payment has been received and is now held in escrow.
            </div>

            <div class="info-box">
              <div class="info-row">
                <span class="info-label">Transaction ID:</span>
                <span class="info-value">${data.transactionId}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Amount:</span>
                <span class="info-value">${data.amount} RWF</span>
              </div>
              <div class="info-row">
                <span class="info-label">Description:</span>
                <span class="info-value">${data.description}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Status:</span>
                <span class="info-value">AWAITING DELIVERY</span>
              </div>
            </div>

            <p>Please proceed with delivering the service/product. Once the buyer confirms delivery, the funds will be released to you.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} ${this.senderName}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private getPayoutCompletedTemplate(data: PayoutCompletedEmailData): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        ${this.getBaseStyles()}
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Payment Released</h1>
          </div>
          <div class="content">
            <p>Hi ${data.sellerName},</p>
            
            <div class="alert alert-success">
              <strong>Payment Complete!</strong> The escrow funds have been released to you.
            </div>

            <div class="info-box">
              <div class="info-row">
                <span class="info-label">Transaction ID:</span>
                <span class="info-value">${data.transactionId}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Amount:</span>
                <span class="info-value">${data.amount} RWF</span>
              </div>
              <div class="info-row">
                <span class="info-label">Description:</span>
                <span class="info-value">${data.description}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Status:</span>
                <span class="info-value">COMPLETED</span>
              </div>
            </div>

            <p>The funds should appear in your mobile money account shortly.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} ${this.senderName}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private getEscrowReleasedTemplate(data: EscrowReleasedEmailData): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        ${this.getBaseStyles()}
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Escrow Released</h1>
          </div>
          <div class="content">
            <p>Hi ${data.buyerName},</p>
            
            <div class="alert alert-success">
              <strong>Transaction Complete!</strong> You have successfully released the escrow funds to the seller.
            </div>

            <div class="info-box">
              <div class="info-row">
                <span class="info-label">Transaction ID:</span>
                <span class="info-value">${data.transactionId}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Amount:</span>
                <span class="info-value">${data.amount} RWF</span>
              </div>
              <div class="info-row">
                <span class="info-label">Description:</span>
                <span class="info-value">${data.description}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Status:</span>
                <span class="info-value">RELEASED</span>
              </div>
            </div>

            <p>Thank you for using our escrow service. We hope you're satisfied with your transaction.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} ${this.senderName}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private getRefundCompletedTemplate(data: RefundCompletedEmailData): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        ${this.getBaseStyles()}
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Refund Processed</h1>
          </div>
          <div class="content">
            <p>Hi ${data.buyerName},</p>
            
            <div class="alert alert-info">
              <strong>Refund Complete!</strong> The escrow funds have been refunded to you.
            </div>

            <div class="info-box">
              <div class="info-row">
                <span class="info-label">Transaction ID:</span>
                <span class="info-value">${data.transactionId}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Refund Amount:</span>
                <span class="info-value">${data.amount} RWF</span>
              </div>
              <div class="info-row">
                <span class="info-label">Reason:</span>
                <span class="info-value">${data.reason}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Status:</span>
                <span class="info-value">REFUNDED</span>
              </div>
            </div>

            <p>The refund should appear in your mobile money account shortly.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} ${this.senderName}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private getRefundNoticeTemplate(data: RefundNoticeEmailData): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        ${this.getBaseStyles()}
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Transaction Refunded</h1>
          </div>
          <div class="content">
            <p>Hi ${data.sellerName},</p>
            
            <div class="alert alert-warning">
              <strong>Transaction Refunded:</strong> The escrow funds have been returned to the buyer.
            </div>

            <div class="info-box">
              <div class="info-row">
                <span class="info-label">Transaction ID:</span>
                <span class="info-value">${data.transactionId}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Amount:</span>
                <span class="info-value">${data.amount} RWF</span>
              </div>
              <div class="info-row">
                <span class="info-label">Reason:</span>
                <span class="info-value">${data.reason}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Status:</span>
                <span class="info-value">REFUNDED</span>
              </div>
            </div>

            <p>The transaction has been cancelled and the funds returned to the buyer.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} ${this.senderName}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // ==================== TEXT TEMPLATES ====================

  private getDepositInitiatedText(data: DepositInitiatedEmailData): string {
    return `
Payment Required - ${data.transactionId}

Hi ${data.buyerName},

Your escrow transaction has been initiated. Please complete the payment to secure the funds.

Transaction Details:
- Transaction ID: ${data.transactionId}
- Amount: ${data.amount} RWF
- Description: ${data.description}

Payment Instructions:
${data.instructions}

Once payment is received, the funds will be held securely in escrow until the transaction is completed.

© ${new Date().getFullYear()} ${this.senderName}
    `.trim();
  }

  private getFundsHeldText(data: FundsHeldEmailData): string {
    return `
Funds Secured in Escrow - ${data.transactionId}

Hi ${data.buyerName},

Payment Successful! Your funds are now held securely in escrow.

Transaction Details:
- Transaction ID: ${data.transactionId}
- Amount: ${data.amount} RWF
- Description: ${data.description}
- Status: HELD IN ESCROW

The funds will be released to the seller once you confirm that the service/product has been delivered as agreed.

© ${new Date().getFullYear()} ${this.senderName}
    `.trim();
  }

  private getFundsHeldSellerText(data: FundsHeldSellerEmailData): string {
    return `
Payment Received in Escrow - ${data.transactionId}

Hi ${data.sellerName},

Good News! Payment has been received and is now held in escrow.

Transaction Details:
- Transaction ID: ${data.transactionId}
- Amount: ${data.amount} RWF
- Description: ${data.description}
- Status: AWAITING DELIVERY

Please proceed with delivering the service/product. Once the buyer confirms delivery, the funds will be released to you.

© ${new Date().getFullYear()} ${this.senderName}
    `.trim();
  }

  private getPayoutCompletedText(data: PayoutCompletedEmailData): string {
    return `
Payment Released - ${data.transactionId}

Hi ${data.sellerName},

Payment Complete! The escrow funds have been released to you.

Transaction Details:
- Transaction ID: ${data.transactionId}
- Amount: ${data.amount} RWF
- Description: ${data.description}
- Status: COMPLETED

The funds should appear in your mobile money account shortly.

© ${new Date().getFullYear()} ${this.senderName}
    `.trim();
  }

  private getEscrowReleasedText(data: EscrowReleasedEmailData): string {
    return `
Escrow Released - ${data.transactionId}

Hi ${data.buyerName},

Transaction Complete! You have successfully released the escrow funds to the seller.

Transaction Details:
- Transaction ID: ${data.transactionId}
- Amount: ${data.amount} RWF
- Description: ${data.description}
- Status: RELEASED

Thank you for using our escrow service.

© ${new Date().getFullYear()} ${this.senderName}
    `.trim();
  }

  private getRefundCompletedText(data: RefundCompletedEmailData): string {
    return `
Refund Processed - ${data.transactionId}

Hi ${data.buyerName},

Refund Complete! The escrow funds have been refunded to you.

Transaction Details:
- Transaction ID: ${data.transactionId}
- Refund Amount: ${data.amount} RWF
- Reason: ${data.reason}
- Status: REFUNDED

The refund should appear in your mobile money account shortly.

© ${new Date().getFullYear()} ${this.senderName}
    `.trim();
  }

  private getRefundNoticeText(data: RefundNoticeEmailData): string {
    return `
Transaction Refunded - ${data.transactionId}

Hi ${data.sellerName},

Transaction Refunded: The escrow funds have been returned to the buyer.

Transaction Details:
- Transaction ID: ${data.transactionId}
- Amount: ${data.amount} RWF
- Reason: ${data.reason}
- Status: REFUNDED

The transaction has been cancelled and the funds returned to the buyer.

© ${new Date().getFullYear()} ${this.senderName}
    `.trim();
  }

  // ==================== UTILITY METHODS ====================

  async testConnection(): Promise<boolean> {
    try {
      // Test by attempting to send a minimal request
      // In production, you might want to use a specific test endpoint
      console.log('[BREVO] Testing connection...');
      return true;
    } catch (error: any) {
      console.error('[BREVO] ❌ Connection test failed:', error.message);
      return false;
    }
  }
}