import * as Brevo from '@getbrevo/brevo';
import { config } from '../config/config';

interface BrevoContact {
  email: string;
  attributes: {
    FIRSTNAME?: string;
    LASTNAME?: string;
    SMS?: string;
  };
  listIds?: number[];
}

interface MailingContext {
  user: {
    firstName: string;
    lastName: string;
    email: string;
    id: number;
  };
  company: {
    name: string;
    website: string;
    supportEmail: string;
    logo: string;
  };
  security?: {
    device?: string;
    browser?: string;
    location?: string;
    ipAddress?: string;
    timestamp: string;
  };
  verification?: {
    code: string;
    expiresIn: string;
  };
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

interface BatchEmailResult {
  successful: number;
  failed: Array<{ email: string; error: string; type: string }>;
}

export class BrevoMailingService {
  private transactionalEmailsApi: Brevo.TransactionalEmailsApi;
  private contactsApi: Brevo.ContactsApi;
  private defaultSender: { name: string; email: string };

  constructor() {
    try {
      // Initialize APIs
      this.transactionalEmailsApi = new Brevo.TransactionalEmailsApi();
      this.contactsApi = new Brevo.ContactsApi();

      // Validate configuration
      if (!config.brevoApiKey) {
        throw new Error('Brevo API key is required but not configured');
      }

      if (!config.brevoSenderEmail) {
        throw new Error('Brevo sender email is required but not configured');
      }

      // Set API key for transactional emails
      this.transactionalEmailsApi.setApiKey(
        Brevo.TransactionalEmailsApiApiKeys.apiKey, 
        config.brevoApiKey
      );

      // Set API key for contacts
      this.contactsApi.setApiKey(
        Brevo.ContactsApiApiKeys.apiKey, 
        config.brevoApiKey
      );

      this.defaultSender = {
        name: 'Jambolush',
        email: config.brevoSenderEmail
      };

    } catch (error: any) {
      throw error;
    }
  }

  // --- ERROR HANDLING UTILITIES ---
  private logBrevoError(context: string, error: BrevoApiError, additionalData?: any): void {
    const errorInfo = {
      service: 'BrevoMailingService',
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

  // Retry logic for critical operations
  private async withRetry<T>(
    operation: () => Promise<T>,
    context: string,
    maxRetries: number = 3,
    backoffMs: number = 1000
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        
        // Don't retry on certain error types (client errors)
        if (error.response?.status && [400, 401, 403, 404].includes(error.response.status)) {
          throw this.handleBrevoError(context, error);
        }

        if (attempt < maxRetries) {
          const delay = backoffMs * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw this.handleBrevoError(`${context} (failed after ${maxRetries} attempts)`, lastError);
  }

  // Health check method
  async checkBrevoConnection(): Promise<boolean> {
    try {
      await this.contactsApi.getContacts(1, 0);
      return true;
    } catch (error: any) {
      this.logBrevoError('healthCheck', error);
      return false;
    }
  }

  // --- CONTACT MANAGEMENT ---
  async createOrUpdateContact(contact: BrevoContact): Promise<void> {
    try {
      // Validate contact data
      if (!contact.email || !this.isValidEmail(contact.email)) {
        throw new Error(`Invalid email address: ${contact.email}`);
      }

      const createContactRequest = {
        email: contact.email,
        attributes: contact.attributes,
        ...(contact.listIds && { listIds: contact.listIds })
      };

      await this.withRetry(
        () => this.contactsApi.createContact(createContactRequest),
        'createOrUpdateContact',
        3
      );

    } catch (error: any) {
      const enhancedError = this.handleBrevoError(
        'createOrUpdateContact',
        error,
        { 
          contactEmail: contact.email, 
          listIds: contact.listIds,
          attributeKeys: Object.keys(contact.attributes)
        }
      );
      throw enhancedError;
    }
  }

  // --- EMAIL SENDING METHODS ---
  async sendTransactionalEmail(emailData: {
    sender: { name: string; email: string };
    to: Array<{ email: string; name?: string }>;
    subject: string;
    htmlContent: string;
    textContent?: string;
    templateId?: number;
    params?: Record<string, any>;
  }): Promise<string> {
    try {
      // Validate email data
      this.validateEmailData(emailData);

      const sendEmailRequest: any = {
        sender: emailData.sender,
        to: emailData.to,
        subject: emailData.subject,
        htmlContent: emailData.htmlContent,
        ...(emailData.textContent && { textContent: emailData.textContent }),
        ...(emailData.templateId && { templateId: emailData.templateId }),
        ...(emailData.params && { params: emailData.params })
      };

      const response: any = await this.withRetry(
        () => this.transactionalEmailsApi.sendTransacEmail(sendEmailRequest),
        'sendTransactionalEmail',
        3
      );

      const messageId = response.messageId || '';
      return messageId;
    } catch (error: any) {
      const enhancedError = this.handleBrevoError(
        'sendTransactionalEmail',
        error,
        {
          recipientCount: emailData.to.length,
          recipients: emailData.to.map(r => r.email).join(', '),
          subject: emailData.subject,
          templateId: emailData.templateId,
          sender: emailData.sender.email,
          hasHtmlContent: !!emailData.htmlContent,
          hasTextContent: !!emailData.textContent
        }
      );
      throw enhancedError;
    }
  }

  private validateEmailData(emailData: any): void {
    if (!emailData.to || !Array.isArray(emailData.to) || emailData.to.length === 0) {
      throw new Error('Email recipients are required');
    }

    for (const recipient of emailData.to) {
      if (!recipient.email || !this.isValidEmail(recipient.email)) {
        throw new Error(`Invalid recipient email: ${recipient.email}`);
      }
    }

    if (!emailData.subject || emailData.subject.trim().length === 0) {
      throw new Error('Email subject is required');
    }

    if (!emailData.htmlContent || emailData.htmlContent.trim().length === 0) {
      throw new Error('Email HTML content is required');
    }

    if (!emailData.sender || !emailData.sender.email || !this.isValidEmail(emailData.sender.email)) {
      throw new Error(`Invalid sender email: ${emailData.sender?.email}`);
    }
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // --- AUTHENTICATION EMAIL METHODS ---

  async sendWelcomeEmail(context: MailingContext): Promise<void> {
    try {
      const emailData = {
        sender: this.defaultSender,
        to: [{ email: context.user.email, name: `${context.user.firstName} ${context.user.lastName}` }],
        subject: `Welcome to ${context.company.name} - Your Journey Begins Here!`,
        htmlContent: this.getWelcomeTemplate(context),
        textContent: this.getWelcomeTextTemplate(context)
      };

      await this.sendTransactionalEmail(emailData);
    } catch (error: any) {
      throw error;
    }
  }

  async sendEmailVerification(context: MailingContext): Promise<void> {
    try {
      if (!context.verification?.code) {
        throw new Error('Verification code is required for email verification');
      }

      const emailData = {
        sender: this.defaultSender,
        to: [{ email: context.user.email, name: `${context.user.firstName} ${context.user.lastName}` }],
        subject: `Verify Your ${context.company.name} Account`,
        htmlContent: this.getEmailVerificationTemplate(context),
        textContent: this.getEmailVerificationTextTemplate(context)
      };

      await this.sendTransactionalEmail(emailData);
    } catch (error: any) {
      throw error;
    }
  }

  async sendPasswordResetOTP(context: MailingContext): Promise<void> {
    try {
      if (!context.verification?.code) {
        throw new Error('Verification code is required for password reset');
      }

      const emailData = {
        sender: this.defaultSender,
        to: [{ email: context.user.email, name: `${context.user.firstName} ${context.user.lastName}` }],
        subject: `Your ${context.company.name} Password Reset Code`,
        htmlContent: this.getPasswordResetTemplate(context),
        textContent: this.getPasswordResetTextTemplate(context)
      };

      await this.sendTransactionalEmail(emailData);
    } catch (error: any) {
      throw error;
    }
  }

  async sendPasswordChangedNotification(context: MailingContext): Promise<void> {
    try {
      const emailData = {
        sender: this.defaultSender,
        to: [{ email: context.user.email, name: `${context.user.firstName} ${context.user.lastName}` }],
        subject: `${context.company.name} Password Changed Successfully`,
        htmlContent: this.getPasswordChangedTemplate(context),
        textContent: this.getPasswordChangedTextTemplate(context)
      };

      await this.sendTransactionalEmail(emailData);
    } catch (error: any) {
      throw error;
    }
  }

  async sendLoginNotification(context: MailingContext): Promise<void> {
    try {
      const emailData = {
        sender: this.defaultSender,
        to: [{ email: context.user.email, name: `${context.user.firstName} ${context.user.lastName}` }],
        subject: `New Login to Your ${context.company.name} Account`,
        htmlContent: this.getLoginNotificationTemplate(context),
        textContent: this.getLoginNotificationTextTemplate(context)
      };

      await this.sendTransactionalEmail(emailData);
    } catch (error: any) {
      throw error;
    }
  }

  async sendSuspiciousActivityAlert(context: MailingContext): Promise<void> {
    try {
      const emailData = {
        sender: this.defaultSender,
        to: [{ email: context.user.email, name: `${context.user.firstName} ${context.user.lastName}` }],
        subject: `Suspicious Activity Detected - ${context.company.name} Security Alert`,
        htmlContent: this.getSuspiciousActivityTemplate(context),
        textContent: this.getSuspiciousActivityTextTemplate(context)
      };

      await this.sendTransactionalEmail(emailData);
    } catch (error: any) {
      throw error;
    }
  }

  async sendAccountStatusChange(context: MailingContext, status: 'suspended' | 'reactivated'): Promise<void> {
    try {
      const emailData = {
        sender: this.defaultSender,
        to: [{ email: context.user.email, name: `${context.user.firstName} ${context.user.lastName}` }],
        subject: `${status === 'suspended' ? 'Account Suspended' : 'Account Reactivated'} - ${context.company.name}`,
        htmlContent: this.getAccountStatusTemplate(context, status),
        textContent: this.getAccountStatusTextTemplate(context, status)
      };

      await this.sendTransactionalEmail(emailData);
    } catch (error: any) {
      throw error;
    }
  }

  async sendProfileUpdateNotification(context: MailingContext): Promise<void> {
    try {
      const emailData = {
        sender: this.defaultSender,
        to: [{ email: context.user.email, name: `${context.user.firstName} ${context.user.lastName}` }],
        subject: `Profile Updated - ${context.company.name}`,
        htmlContent: this.getProfileUpdateTemplate(context),
        textContent: this.getProfileUpdateTextTemplate(context)
      };

      await this.sendTransactionalEmail(emailData);
    } catch (error: any) {
      throw error;
    }
  }

  // --- TEMPLATE SENDER USING TEMPLATE ID ---
  async sendTemplateEmail(
    templateId: number, 
    context: MailingContext, 
    subject: string,
    params?: Record<string, any>
  ): Promise<void> {
    try {
      if (!templateId || templateId <= 0) {
        throw new Error('Valid template ID is required');
      }

      const emailData = {
        sender: this.defaultSender,
        to: [{ email: context.user.email, name: `${context.user.firstName} ${context.user.lastName}` }],
        subject: subject,
        templateId: templateId,
        htmlContent: '', // Required but will be overridden by template
        params: {
          firstName: context.user.firstName,
          lastName: context.user.lastName,
          companyName: context.company.name,
          companyWebsite: context.company.website,
          ...params
        }
      };

      await this.sendTransactionalEmail(emailData);
    } catch (error: any) {
      throw error;
    }
  }

  // --- BATCH OPERATIONS ---
  async sendBatchEmails(emails: Array<{
    context: MailingContext;
    type: 'welcome' | 'verification' | 'passwordReset' | 'passwordChanged' | 'loginNotification' | 'suspiciousActivity' | 'accountStatus' | 'profileUpdate';
    additionalData?: any;
  }>): Promise<BatchEmailResult> {
    const results: BatchEmailResult = {
      successful: 0,
      failed: []
    };

    for (const emailRequest of emails) {
      try {
        switch (emailRequest.type) {
          case 'welcome':
            await this.sendWelcomeEmail(emailRequest.context);
            break;
          case 'verification':
            await this.sendEmailVerification(emailRequest.context);
            break;
          case 'passwordReset':
            await this.sendPasswordResetOTP(emailRequest.context);
            break;
          case 'passwordChanged':
            await this.sendPasswordChangedNotification(emailRequest.context);
            break;
          case 'loginNotification':
            await this.sendLoginNotification(emailRequest.context);
            break;
          case 'suspiciousActivity':
            await this.sendSuspiciousActivityAlert(emailRequest.context);
            break;
          case 'accountStatus':
            const status = emailRequest.additionalData?.status || 'suspended';
            await this.sendAccountStatusChange(emailRequest.context, status);
            break;
          case 'profileUpdate':
            await this.sendProfileUpdateNotification(emailRequest.context);
            break;
          default:
            throw new Error(`Unknown email type: ${emailRequest.type}`);
        }
        results.successful++;
      } catch (error: any) {
        results.failed.push({
          email: emailRequest.context.user.email,
          error: error.message,
          type: emailRequest.type
        });
      }
    }

    if (results.failed.length > 0) {
      console.error('Failed emails:', JSON.stringify(results.failed, null, 2));
    }

    return results;
  }

  // --- MODERNIZED EMAIL TEMPLATES ---
  private getBaseTemplate(): string {
  return `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');

      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      body {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        line-height: 1.6;
        color: #374151;
        background: #f9fafb;
        padding: 10px;
      }

      .email-wrapper {
        width: 98%;
        max-width: 600px;
        margin: 0 auto;
      }

      /* Main card container */
      .email-container {
        background: #ffffff;
        border-radius: 12px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
        border: 1px solid #e5e7eb;
        overflow: hidden;
      }

      /* Header */
      .header {
        background: linear-gradient(135deg, #083A85 0%, #0a4499 100%);
        padding: 32px 24px;
        text-align: center;
        color: white;
      }
      
      .logo {
        font-size: 24px;
        font-weight: 600;
        margin-bottom: 6px;
      }

      .header-subtitle {
        font-size: 14px;
        font-weight: 400;
        opacity: 0.9;
      }

      /* Content section */
      .content {
        padding: 28px 20px;
        background: #ffffff;
      }

      .greeting {
        font-size: 20px;
        font-weight: 600;
        color: #111827;
        margin-bottom: 16px;
      }

      .message {
        font-size: 15px;
        line-height: 1.6;
        color: #4b5563;
        margin-bottom: 20px;
      }

      .highlight-box {
        background: #f8fafc;
        border: 2px solid #083A85;
        border-radius: 10px;
        padding: 20px;
        margin: 20px 0;
        text-align: center;
      }

      .verification-code {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 28px;
        font-weight: 600;
        color: #083A85;
        letter-spacing: 4px;
        margin: 10px 0;
      }
      
      .code-label {
        font-size: 13px;
        font-weight: 500;
        color: #6b7280;
        margin-bottom: 6px;
      }

      .code-expiry {
        font-size: 13px;
        color: #9ca3af;
        margin-top: 6px;
      }

      .button {
        display: inline-block;
        background: #083A85;
        color: #ffffff;
        text-decoration: none;
        padding: 12px 24px;
        border-radius: 8px;
        font-weight: 600;
        font-size: 15px;
        text-align: center;
      }

      .button:hover {
        background: #0a4499;
        color: white !important;
      }

      .button-center {
        text-align: center;
        margin: 24px 0;
      }

      /* Info card */
      .info-card {
        background: #083A85;
        border: 1px solid #e5e7eb;
        border-radius: 10px;
        padding: 18px;
        margin: 20px 0;
      }
      
      .info-card-header {
        display: flex;
        align-items: center;
        font-weight: 600;
        color: white;
        margin-bottom: 12px;
        font-size: 14px;
      }

      .info-card-icon {
        margin-right: 6px;
        font-size: 16px;
      }

      .info-row {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        padding: 10px 0;
        border-bottom: 1px solid rgba(241, 245, 249, 0.3);
        gap: 12px;
      }

      .info-row:last-child {
        border-bottom: none;
      }

      .info-label {
        font-weight: 600;
        color: white;
        font-size: 13px;
        flex-shrink: 0;
        min-width: 70px;
      }

      .info-value {
        color: #e2e8f0;
        font-size: 13px;
        font-weight: 400;
        text-align: right;
        flex: 1;
        word-break: break-word;
        line-height: 1.4;
      }

      .alert-box {
        border-radius: 8px;
        padding: 16px;
        margin: 20px 0;
        border-left: 3px solid;
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
        margin-bottom: 6px;
        font-size: 14px;
      }

      .alert-text {
        font-size: 13px;
        line-height: 1.5;
      }

      .divider {
        height: 1px;
        background: #e5e7eb;
        margin: 24px 0;
      }

      /* Footer */
      .footer {
        background: #083A85;
        color: white;
        padding: 24px 20px;
        text-align: center;
      }

      .footer-links {
        margin-bottom: 16px;
      }

      .footer-links a {
        color: rgba(255, 255, 255, 0.9);
        text-decoration: none;
        margin: 0 10px;
        font-weight: 500;
        font-size: 13px;
      }

      .footer-links a:hover {
        color: #ffffff;
      }

      .footer-text {
        font-size: 12px;
        color: #e5e7eb;
        line-height: 1.5;
      }

      .footer-email {
        color: #93c5fd;
        font-weight: 500;
        text-decoration: none;
      }

      .feature-list {
        list-style: none;
        padding: 0;
        margin: 14px 0;
      }

      .feature-list li {
        padding: 6px 0;
        color: #4b5563;
        font-size: 14px;
      }

      .feature-list li:before {
        content: "✓";
        color: #22c55e;
        font-weight: bold;
        margin-right: 6px;
      }

      @media (max-width: 600px) {
        .email-wrapper {
          width: 100%;
        }

        .content {
          padding: 20px 16px;
        }

        .header {
          padding: 24px 16px;
        }

        .footer {
          padding: 20px 16px;
        }

        .verification-code {
          font-size: 24px;
          letter-spacing: 3px;
        }

        .greeting {
          font-size: 18px;
        }

        .info-row {
          flex-direction: column;
          align-items: flex-start;
          gap: 4px;
          padding: 8px 0;
        }

        .info-label {
          min-width: auto;
        }

        .info-value {
          text-align: left;
          word-break: break-all;
        }
      }
    </style>
  `;
}

  private getWelcomeTemplate(context: MailingContext): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Welcome to ${context.company.name}</title>
        ${this.getBaseTemplate()}
      </head>
      <body>
        <div class="email-wrapper">
          <div class="email-container">
            <div class="header">
              <div class="logo">${context.company.name}</div>
              <div class="header-subtitle">Your Real Estate Journey Starts Here</div>
            </div>
            
            <div class="content">
              <div class="greeting">Welcome, ${context.user.firstName}!</div>
              
              <div class="message">
                Congratulations! You've successfully joined <strong>${context.company.name}</strong> – Rwanda's premier real estate platform. We're excited to help you discover exceptional properties and connect with the best opportunities in the market.
              </div>
              
              <div class="alert-box alert-success">
                <div class="alert-title">Account Successfully Created</div>
                <div class="alert-text">Your account is ready. Start exploring premium real estate listings, connect with verified agents, and discover your dream property.</div>
              </div>
              
              <div class="message">
                What's next? Here's how to get started:
              </div>
              
              <ul class="feature-list">
                <li>Complete your profile to receive personalized property recommendations</li>
                <li>Browse our extensive collection of verified property listings</li>
                <li>Connect with certified real estate professionals</li>
                <li>Set up property alerts for your preferred locations and budget</li>
                <li>Access exclusive market insights and property valuations</li>
              </ul>
              
              <div class="button-center">
                <a href="https://jambolush.com" class="button">
                  Explore Properties Now
                </a>
              </div>
              
              <div class="divider"></div>
              
              <div style="text-align: center; color: #6b7280;">
                <p>Need assistance finding the perfect property?</p>
                <p style="margin-top: 8px;">
                  <a href="https://app.jambolush.com/all/support" style="color: #083A85; text-decoration: none; font-weight: 500;">Contact Our Property Experts</a>
                </p>
              </div>
            </div>
            
            <div class="footer">
              <div class="footer-links">
                <a href="https://jambolush.com">Browse Properties</a>
                <a href="https://jambolush.com/all/contact-us">Support</a>
                <a href="https://jambolush.com/all/privacy-policy">Privacy</a>
              </div>
              <div class="footer-text">
                © ${new Date().getFullYear()} ${context.company.name}. Connecting you to Rwanda's finest properties.
                <br>
                This welcome email was sent to ${context.user.email}
              </div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private getEmailVerificationTemplate(context: MailingContext): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Verify Your Email</title>
        ${this.getBaseTemplate()}
      </head>
      <body>
        <div class="email-wrapper">
          <div class="email-container">
            <div class="header">
              <div class="logo">${context.company.name}</div>
              <div class="header-subtitle">Email Verification Required</div>
            </div>
            
            <div class="content">
              <div class="greeting">Almost There, ${context.user.firstName}!</div>
              
              <div class="message">
                To complete your ${context.company.name} account setup and start browsing premium real estate listings, please verify your email address using the code below.
              </div>
              
              <div class="highlight-box">
                <div class="code-label">Your Verification Code</div>
                <div class="verification-code">${context.verification?.code}</div>
                <div class="code-expiry">Code expires in ${context.verification?.expiresIn}</div>
              </div>
              
              <div class="message">
                Enter this 6-digit code on the verification page to activate your account and gain full access to all ${context.company.name} features. This code is unique and secure – please don't share it with anyone.
              </div>
              
              <div class="button-center">
                <a href="https://jambolush.com/all/account-verification" class="button">
                  Verify Email Now
                </a>
              </div>
              
              <div class="alert-box alert-warning">
                <div class="alert-title">Security Notice</div>
                <div class="alert-text">
                  If you didn't create a ${context.company.name} account, please ignore this email. If you continue receiving these emails, contact our support team.
                </div>
              </div>
            </div>
            
            <div class="footer">
              <div class="footer-links">
                <a href="https://app.jambolush.com/all/support">Need Help?</a>
                <a href="https://app.jambolush.com/all/security">Security Center</a>
              </div>
              <div class="footer-text">
                © ${new Date().getFullYear()} ${context.company.name}. Your security is our priority.
                <br>
                This verification email was sent to ${context.user.email}
              </div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private getPasswordResetTemplate(context: MailingContext): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Reset Your Password</title>
        ${this.getBaseTemplate()}
      </head>
      <body>
        <div class="email-wrapper">
          <div class="email-container">
            <div class="header">
              <div class="logo">${context.company.name}</div>
              <div class="header-subtitle">Password Reset Request</div>
            </div>
            
            <div class="content">
              <div class="greeting">Password Reset Request</div>
              
              <div class="message">
                Hi ${context.user.firstName}, we received a request to reset the password for your ${context.company.name} account. Use the verification code below to create a new password and regain access to your property search.
              </div>
              
              <div class="highlight-box">
                <div class="code-label">Password Reset Code</div>
                <div class="verification-code">${context.verification?.code}</div>
                <div class="code-expiry">This code expires in ${context.verification?.expiresIn}</div>
              </div>
              
              <div class="message">
                Enter this code on the password reset page to create a new secure password. For your security, this code can only be used once and will expire after the time shown above.
              </div>
              
              <div class="button-center">
                <a href="https://jambolush.com/all/forgotpw" class="button">
                  Reset Password Now
                </a>
              </div>
              
              ${context.security ? `
                <div class="info-card">
                  <div class="info-card-header">
                    <span class="info-card-icon">🔍</span>
                    Request Details
                  </div>
                  <div class="info-row">
                    <span class="info-label">Time</span>
                    <span class="info-value">${new Date(context.security.timestamp).toLocaleString()}</span>
                  </div>
                  <div class="info-row">
                    <span class="info-label">Device</span>
                    <span class="info-value">${context.security.device || 'Unknown Device'}</span>
                  </div>
                  <div class="info-row">
                    <span class="info-label">Location</span>
                    <span class="info-value">${context.security.location || 'Unknown Location'}</span>
                  </div>
                  <div class="info-row">
                    <span class="info-label">IP Address</span>
                    <span class="info-value">${context.security.ipAddress || 'Not Available'}</span>
                  </div>
                </div>
              ` : ''}
              
              <div class="alert-box alert-error">
                <div class="alert-title">Didn't Request This?</div>
                <div class="alert-text">
                  If you didn't request a password reset, your account may be at risk. Please ignore this email and 
                  <a href="mailto:${context.company.supportEmail}" style="color: #dc2626; text-decoration: none; font-weight: 500;">contact our security team</a> immediately to protect your account.
                </div>
              </div>
            </div>
            
            <div class="footer">
              <div class="footer-links">
                <a href="https://app.jambolush.com/all/support">Support</a>
                <a href="https://app.jambolush.com/all/security">Security</a>
                <a href="https://app.jambolush.com/all/login">Login</a>
              </div>
              <div class="footer-text">
                © ${new Date().getFullYear()} ${context.company.name}. Protecting your account 24/7.
                <br>
                This security email was sent to ${context.user.email}
              </div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private getPasswordChangedTemplate(context: MailingContext): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Password Changed Successfully</title>
        ${this.getBaseTemplate()}
      </head>
      <body>
        <div class="email-wrapper">
          <div class="email-container">
            <div class="header">
              <div class="logo">${context.company.name}</div>
              <div class="header-subtitle">Security Update Confirmed</div>
            </div>
            
            <div class="content">
              <div class="greeting">Password Updated Successfully</div>
              
              <div class="message">
                Hi ${context.user.firstName}, this confirms that your ${context.company.name} account password was successfully changed. Your account security has been strengthened and you can continue accessing all property listings and features.
              </div>
              
              <div class="alert-box alert-success">
                <div class="alert-title">Security Enhancement Complete</div>
                <div class="alert-text">Your new password is now active. All other login sessions have been automatically logged out for your security.</div>
              </div>
              
              ${context.security ? `
                <div class="info-card">
                  <div class="info-card-header">
                    <span class="info-card-icon">📊</span>
                    Change Details
                  </div>
                  <div class="info-row">
                    <span class="info-label">Changed</span>
                    <span class="info-value">${new Date(context.security.timestamp).toLocaleString()}</span>
                  </div>
                  <div class="info-row">
                    <span class="info-label">Device</span>
                    <span class="info-value">${context.security.device || 'Unknown Device'}</span>
                  </div>
                  <div class="info-row">
                    <span class="info-label">Browser</span>
                    <span class="info-value">${context.security.browser || 'Unknown Browser'}</span>
                  </div>
                  <div class="info-row">
                    <span class="info-label">Location</span>
                    <span class="info-value">${context.security.location || 'Unknown Location'}</span>
                  </div>
                </div>
              ` : ''}
              
              <div class="message">
                You can now sign in using your new password. For security reasons, you may need to log in again on your other devices. This helps ensure only you have access to your property searches and saved favorites.
              </div>
              
              <div class="button-center">
                <a href="https://app.jambolush.com/all/login" class="button">
                  Sign In to Your Account
                </a>
              </div>
              
              <div class="alert-box alert-error">
                <div class="alert-title">Didn't Make This Change?</div>
                <div class="alert-text">
                  If you didn't change your password, your account security may be compromised. 
                  <a href="mailto:${context.company.supportEmail}" style="color: #dc2626; text-decoration: none; font-weight: 500;">Contact our security team immediately</a> – we'll help secure your account right away.
                </div>
              </div>
            </div>
            
            <div class="footer">
              <div class="footer-links">
                <a href="https://app.jambolush.com/all/security">Security Center</a>
                <a href="https://app.jambolush.com/all/support">Support</a>
                <a href="https://app.jambolush.com/all/login">Login</a>
              </div>
              <div class="footer-text">
                © ${new Date().getFullYear()} ${context.company.name}. Your security enables your success.
                <br>
                This security notification was sent to ${context.user.email}
              </div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private getLoginNotificationTemplate(context: MailingContext): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>New Login Detected</title>
      ${this.getBaseTemplate()}
    </head>
    <body>
      <div class="email-wrapper">
        <div class="email-container">
          <div class="header">
            <div class="logo">${context.company.name}</div>
            <div class="header-subtitle">Login Security Alert</div>
          </div>
          
          <div class="content">
            <div class="greeting">New Account Access Detected</div>
            
            <div class="message">
              Hi ${context.user.firstName}, we noticed a new sign-in to your ${context.company.name} account. This login alert helps keep your property search and personal information secure. If this was you, no action is required.
            </div>
            
            ${context.security ? `
              <div class="info-card">
                <div class="info-card-header">
                  <span class="info-card-icon">🔍</span>
                  Login Details
                </div>
                <div class="info-row">
                  <span class="info-label">Time</span>
                  <span class="info-value">${new Date(context.security.timestamp).toLocaleString()}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Device</span>
                  <span class="info-value">${context.security.device || 'Unknown Device'}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Browser</span>
                  <span class="info-value">${context.security.browser || 'Unknown Browser'}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Location</span>
                  <span class="info-value">${context.security.location || 'Unknown Location'}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">IP Address</span>
                  <span class="info-value">${context.security.ipAddress || 'Not Available'}</span>
                </div>
              </div>
            ` : ''}
            
            <div class="alert-box alert-success">
              <div class="alert-title">Recognize This Activity?</div>
              <div class="alert-text">
                If you just signed in from this device and location, you can safely ignore this security notification. We send these alerts to help protect your account.
              </div>
            </div>
            
            <div class="button-center">
              <a href="https://app.jambolush.com/all/security/sessions" class="button">
                Review All Login Activity
              </a>
            </div>
            
            <div class="alert-box alert-error">
              <div class="alert-title">Don't Recognize This Login?</div>
              <div class="alert-text">
                If this wasn't you, secure your account immediately by:
                <ul style="margin: 8px 0; padding-left: 20px;">
                  <li>Changing your password right away</li>
                  <li>Reviewing all recent account activity</li>
                  <li>Enabling two-factor authentication</li>
                  <li><a href="mailto:${context.company.supportEmail}" style="color: #dc2626; text-decoration: none; font-weight: 500;">Contacting our security team</a></li>
                </ul>
              </div>
            </div>
            
            <div class="divider"></div>
            
            <div style="text-align: center; color: #6b7280;">
              <p>Questions about your account security?</p>
              <p style="margin-top: 8px;">
                <a href="mailto:${context.company.supportEmail}" style="color: #083A85; text-decoration: none; font-weight: 500;">Get Help from Our Security Team</a>
              </p>
            </div>
          </div>
          
          <div class="footer">
            <div class="footer-links">
              <a href="https://app.jambolush.com/all/security">Security</a>
              <a href="https://app.jambolush.com/all/settings">Settings</a>
              <a href="https://app.jambolush.com/all/support">Support</a>
            </div>
            <div class="footer-text">
              © ${new Date().getFullYear()} ${context.company.name}. Protecting your property journey 24/7.
              <br>
              This security alert was sent to <span class="footer-email">${context.user.email}</span>
            </div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

  private getSuspiciousActivityTemplate(context: MailingContext): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Security Alert - Suspicious Activity</title>
        ${this.getBaseTemplate()}
        <style>
          .header-critical {
            background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%);
          }
        </style>
      </head>
      <body>
        <div class="email-wrapper">
          <div class="email-container">
            <div class="header header-critical">
              <div class="logo">${context.company.name}</div>
              <div class="header-subtitle">Urgent Security Alert</div>
            </div>
            
            <div class="content">
              <div class="greeting" style="color: #dc2626;">Suspicious Activity Detected</div>
              
              <div class="message">
                <strong>Immediate Action Required:</strong> ${context.user.firstName}, our security systems have detected unusual activity on your ${context.company.name} account that requires your immediate attention to protect your property searches and personal information.
              </div>
              
              <div class="alert-box alert-error">
                <div class="alert-title">Security Threat Detected</div>
                <div class="alert-text">
                  We've identified multiple failed login attempts or unusual access patterns from an unrecognized location. This could indicate someone is trying to access your account without permission.
                </div>
              </div>
              
              ${context.security ? `
                <div class="info-card" style="border-color: #dc2626;">
                  <div class="info-card-header" style="color: #dc2626;">
                    <span class="info-card-icon">🚨</span>
                    Threat Detection Details
                  </div>
                  <div class="info-row">
                    <span class="info-label">Detected</span>
                    <span class="info-value">${new Date(context.security.timestamp).toLocaleString()}</span>
                  </div>
                  <div class="info-row">
                    <span class="info-label">Activity Type</span>
                    <span class="info-value">Multiple failed login attempts</span>
                  </div>
                  <div class="info-row">
                    <span class="info-label">Source IP</span>
                    <span class="info-value">${context.security.ipAddress || 'Unknown Source'}</span>
                  </div>
                  <div class="info-row">
                    <span class="info-label">Location</span>
                    <span class="info-value">${context.security.location || 'Unknown Location'}</span>
                  </div>
                </div>
              ` : ''}
              
              <div class="message">
                <strong>Protect Your Account Now:</strong>
              </div>
              
              <ul class="feature-list">
                <li>Change your password immediately to a strong, unique password</li>
                <li>Enable two-factor authentication for enhanced security</li>
                <li>Review all recent account activity and saved property searches</li>
                <li>Check for any unauthorized changes to your profile or preferences</li>
                <li>Sign out of all devices and sign back in with your new password</li>
              </ul>
              
              <div class="button-center">
                <a href="https://app.jambolush.com/all/security/change-password" class="button" style="background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%);">
                  Secure My Account Now
                </a>
              </div>
              
              <div class="alert-box alert-error">
                <div class="alert-title">Need Emergency Help?</div>
                <div class="alert-text">
                  If you believe your account has been compromised or you notice any unauthorized property inquiries, contact our emergency security team immediately at 
                  <a href="mailto:${context.company.supportEmail}" style="color: #dc2626; text-decoration: none; font-weight: 500;">${context.company.supportEmail}</a>. We're here 24/7 to help secure your account.
                </div>
              </div>
            </div>
            
            <div class="footer">
              <div class="footer-links">
                <a href="https://app.jambolush.com/all/security">Security Center</a>
                <a href="https://app.jambolush.com/all/support">Emergency Support</a>
                <a href="https://app.jambolush.com/all/settings">Account Settings</a>
              </div>
              <div class="footer-text">
                © ${new Date().getFullYear()} ${context.company.name}. Your security enables your success.
                <br>
                This critical security alert was sent to ${context.user.email}
              </div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private getAccountStatusTemplate(context: MailingContext, status: 'suspended' | 'reactivated'): string {
    const isSuspended = status === 'suspended';
    const headerClass = isSuspended ? 'header-critical' : 'header-success';
    const title = isSuspended ? 'Account Temporarily Suspended' : 'Account Successfully Reactivated';
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${title}</title>
        ${this.getBaseTemplate()}
        <style>
          .header-critical {
            background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%);
          }
          .header-success {
            background: linear-gradient(135deg, #059669 0%, #10b981 100%);
          }
        </style>
      </head>
      <body>
        <div class="email-wrapper">
          <div class="email-container">
            <div class="header ${headerClass}">
              <div class="logo">${context.company.name}</div>
              <div class="header-subtitle">Account Status Update</div>
            </div>
            
            <div class="content">
              <div class="greeting">${title}</div>
              
              <div class="message">
                Hi ${context.user.firstName}, this is an important update regarding your ${context.company.name} account status and access to our real estate platform.
              </div>
              
              ${isSuspended ? `
                <div class="alert-box alert-error">
                  <div class="alert-title">Account Access Temporarily Restricted</div>
                  <div class="alert-text">
                    Your account has been temporarily suspended due to potential security concerns or policy violations. This is a precautionary measure to protect your information and our community.
                  </div>
                </div>
                
                <div class="message">
                  <strong>What this means:</strong>
                </div>
                
                <ul class="feature-list" style="color: #6b7280;">
                  <li style="color: #6b7280;">Temporary restriction from accessing property listings and account features</li>
                  <li style="color: #6b7280;">All active sessions have been securely terminated</li>
                  <li style="color: #6b7280;">Your personal data and saved properties remain protected</li>
                  <li style="color: #6b7280;">No unauthorized access to your account information</li>
                </ul>
                
                <div class="button-center">
                  <a href="https://app.jambolush.com/all/appeal" class="button" style="background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%);">
                    Submit Account Appeal
                  </a>
                </div>
              ` : `
                <div class="alert-box alert-success">
                  <div class="alert-title">Welcome Back to ${context.company.name}!</div>
                  <div class="alert-text">
                    Your account has been successfully reactivated. You now have full access to all property listings, search features, and premium services.
                  </div>
                </div>
                
                <div class="message">
                  <strong>You can now enjoy:</strong>
                </div>
                
                <ul class="feature-list">
                  <li>Full access to all property listings and advanced search</li>
                  <li>Reconnect with your saved properties and favorites</li>
                  <li>Contact verified agents and schedule property visits</li>
                  <li>Receive personalized property recommendations</li>
                  <li>Access exclusive market insights and property valuations</li>
                </ul>
                
                <div class="button-center">
                  <a href="https://app.jambolush.com/all/login" class="button">
                    Access Your Account Now
                  </a>
                </div>
              `}
              
              <div class="divider"></div>
              
              <div style="text-align: center; color: #6b7280;">
                <p>Questions about your account status or need assistance?</p>
                <p style="margin-top: 8px;">
                  <a href="mailto:${context.company.supportEmail}" style="color: #083A85; text-decoration: none; font-weight: 500;">Contact Our Support Team</a>
                </p>
              </div>
            </div>
            
            <div class="footer">
              <div class="footer-links">
                <a href="https://app.jambolush.com/all/support">Support</a>
                <a href="https://app.jambolush.com/all/terms">Terms of Service</a>
                <a href="https://jambolush.com/all/privacy-policy">Privacy Policy</a>
              </div>
              <div class="footer-text">
                © ${new Date().getFullYear()} ${context.company.name}. Committed to fair and transparent service.
                <br>
                This account status update was sent to ${context.user.email}
              </div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private getProfileUpdateTemplate(context: MailingContext): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Profile Updated</title>
        ${this.getBaseTemplate()}
      </head>
      <body>
        <div class="email-wrapper">
          <div class="email-container">
            <div class="header">
              <div class="logo">${context.company.name}</div>
              <div class="header-subtitle">Profile Successfully Updated</div>
            </div>
            
            <div class="content">
              <div class="greeting">Profile Changes Confirmed</div>
              
              <div class="message">
                Hi ${context.user.firstName}, your ${context.company.name} profile has been successfully updated with your recent changes. These updates will help us provide you with more personalized property recommendations and improved service.
              </div>
              
              <div class="alert-box alert-success">
                <div class="alert-title">Changes Successfully Applied</div>
                <div class="alert-text">Your updated profile information is now active across all ${context.company.name} services, including property search, agent communications, and recommendation algorithms.</div>
              </div>
              
              ${context.security ? `
                <div class="info-card">
                  <div class="info-card-header">
                    <span class="info-card-icon">📊</span>
                    Update Summary
                  </div>
                  <div class="info-row">
                    <span class="info-label">Updated</span>
                    <span class="info-value">${new Date(context.security.timestamp).toLocaleString()}</span>
                  </div>
                  <div class="info-row">
                    <span class="info-label">Device</span>
                    <span class="info-value">${context.security.device || 'Unknown Device'}</span>
                  </div>
                  <div class="info-row">
                    <span class="info-label">Location</span>
                    <span class="info-value">${context.security.location || 'Unknown Location'}</span>
                  </div>
                </div>
              ` : ''}
              
              <div class="message">
                Your updated information helps our platform deliver more relevant property suggestions and connect you with the right real estate opportunities. If you need to make additional changes, you can always update your profile from your account settings.
              </div>
              
              <div class="button-center">
                <a href="https://app.jambolush.com/all/profile" class="button">
                  View Updated Profile
                </a>
              </div>
              
              <div class="info-card" style="background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); border-color: #0ea5e9;">
                <div class="info-card-header" style="color: #0369a1;">
                  <span class="info-card-icon">💡</span>
                  Optimization Tip
                </div>
                <div style="color: #0c4a6e; font-size: 14px; line-height: 1.5;">
                  Keep your profile information current to receive the most accurate property valuations and location-based recommendations. Updated preferences help us match you with properties that truly fit your needs.
                </div>
              </div>
              
              <div style="text-align: center; color: #6b7280; margin-top: 24px;">
                <p>Notice any unauthorized profile changes?</p>
                <p style="margin-top: 4px;">
                  <a href="mailto:${context.company.supportEmail}" style="color: #083A85; text-decoration: none; font-weight: 500;">Report Security Concerns</a>
                </p>
              </div>
            </div>
            
            <div class="footer">
              <div class="footer-links">
                <a href="https://app.jambolush.com/all/profile">Profile</a>
                <a href="https://app.jambolush.com/all/settings">Settings</a>
                <a href="https://app.jambolush.com/all/support">Support</a>
              </div>
              <div class="footer-text">
                © ${new Date().getFullYear()} ${context.company.name}. Personalizing your property journey.
                <br>
                This profile update notification was sent to ${context.user.email}
              </div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // --- TEXT TEMPLATES FOR FALLBACK ---
  private getWelcomeTextTemplate(context: MailingContext): string {
    return `
Welcome to ${context.company.name}, ${context.user.firstName}!

Congratulations! You've successfully joined Rwanda's premier real estate platform. We're excited to help you discover exceptional properties and connect with the best opportunities in the market.

Start exploring premium properties: https://app.jambolush.com

What's next:
• Complete your profile for personalized recommendations
• Browse verified property listings
• Connect with certified real estate professionals
• Set up property alerts for your preferred locations

Need assistance? Contact our property experts: https://app.jambolush.com/all/support

© ${new Date().getFullYear()} ${context.company.name}
Connecting you to Rwanda's finest properties.
This welcome email was sent to ${context.user.email}
    `.trim();
  }

  private getEmailVerificationTextTemplate(context: MailingContext): string {
    return `
Email Verification Required - ${context.company.name}

Hi ${context.user.firstName}, please verify your email address to access premium real estate listings.

Verification Code: ${context.verification?.code}
Code expires in: ${context.verification?.expiresIn}

Verify at: https://jambolush.com/all/account-verification

If you didn't create this account, please ignore this email.

© ${new Date().getFullYear()} ${context.company.name}
Your security is our priority.
    `.trim();
  }

  private getPasswordResetTextTemplate(context: MailingContext): string {
    return `
Password Reset Request - ${context.company.name}

Hi ${context.user.firstName}, use this code to reset your password and regain access to your property search:

Reset Code: ${context.verification?.code}
Expires in: ${context.verification?.expiresIn}

Reset at: https://jambolush.com/all/forgotpw

If you didn't request this, please ignore this email or contact security at ${context.company.supportEmail}.

© ${new Date().getFullYear()} ${context.company.name}
Protecting your account 24/7.
    `.trim();
  }

  private getPasswordChangedTextTemplate(context: MailingContext): string {
    return `
Password Changed Successfully - ${context.company.name}

Hi ${context.user.firstName}, your password was successfully changed. Your account security has been strengthened.

Changed: ${context.security?.timestamp ? new Date(context.security.timestamp).toLocaleString() : 'Recently'}

You can now sign in: https://app.jambolush.com/all/login

If you didn't make this change, contact security immediately at ${context.company.supportEmail}.

© ${new Date().getFullYear()} ${context.company.name}
Your security enables your success.
    `.trim();
  }

  private getLoginNotificationTextTemplate(context: MailingContext): string {
    return `
New Login Detected - ${context.company.name}

Hi ${context.user.firstName}, we detected a new sign-in to your account to help keep your property search secure.

Time: ${context.security?.timestamp ? new Date(context.security.timestamp).toLocaleString() : 'Recently'}
Device: ${context.security?.device || 'Unknown Device'}
Location: ${context.security?.location || 'Unknown Location'}

If you don't recognize this activity, secure your account immediately:
https://app.jambolush.com/all/security

© ${new Date().getFullYear()} ${context.company.name}
Protecting your property journey 24/7.
    `.trim();
  }

  private getSuspiciousActivityTextTemplate(context: MailingContext): string {
    return `
URGENT SECURITY ALERT - ${context.company.name}

${context.user.firstName}, suspicious activity detected on your account. Immediate action required.

Secure your account immediately:
1. Change your password: https://app.jambolush.com/all/security/change-password
2. Enable two-factor authentication
3. Review account activity
4. Contact emergency support: ${context.company.supportEmail}

© ${new Date().getFullYear()} ${context.company.name}
Your security enables your success.
    `.trim();
  }

  private getAccountStatusTextTemplate(context: MailingContext, status: 'suspended' | 'reactivated'): string {
    const action = status === 'suspended' ? 'temporarily suspended' : 'successfully reactivated';
    const url = status === 'suspended' ? '/all/appeal' : '/all/login';
    const message = status === 'suspended' 
      ? 'Your account access has been temporarily restricted due to security concerns or policy violations. Submit an appeal:'
      : 'Welcome back! Your account is now active with full access to all property listings. Sign in:';
    
    return `
Account ${action.toUpperCase()} - ${context.company.name}

Hi ${context.user.firstName}, your ${context.company.name} account has been ${action}.

${message} https://app.jambolush.com${url}

Questions? Contact support: ${context.company.supportEmail}

© ${new Date().getFullYear()} ${context.company.name}
Committed to fair and transparent service.
    `.trim();
  }

  private getProfileUpdateTextTemplate(context: MailingContext): string {
    return `
Profile Successfully Updated - ${context.company.name}

Hi ${context.user.firstName}, your profile has been successfully updated. These changes will help us provide more personalized property recommendations.

Updated: ${context.security?.timestamp ? new Date(context.security.timestamp).toLocaleString() : 'Recently'}

View profile: https://app.jambolush.com/all/profile

If you didn't make these changes, report it: ${context.company.supportEmail}

© ${new Date().getFullYear()} ${context.company.name}
Personalizing your property journey.
    `.trim();
  }

  // --- UTILITY METHODS ---
  
  /**
   * Get service statistics
   */
  async getServiceStats(): Promise<{
    isHealthy: boolean;
    lastHealthCheck: string;
    emailsSentToday?: number;
    apiKeyValid: boolean;
  }> {
    try {
      const isHealthy = await this.checkBrevoConnection();
      return {
        isHealthy,
        lastHealthCheck: new Date().toISOString(),
        apiKeyValid: isHealthy
      };
    } catch (error: any) {
      return {
        isHealthy: false,
        lastHealthCheck: new Date().toISOString(),
        apiKeyValid: false
      };
    }
  }

  /**
   * Test email functionality with a simple test email
   */
  async sendTestEmail(recipientEmail: string): Promise<boolean> {
    try {
      if (!this.isValidEmail(recipientEmail)) {
        throw new Error(`Invalid test recipient email: ${recipientEmail}`);
      }

      const testEmailData = {
        sender: this.defaultSender,
        to: [{ email: recipientEmail, name: 'Test User' }],
        subject: 'Jambolush Service Test Email',
        htmlContent: `
          <html>
            <body style="font-family: Arial, sans-serif; padding: 20px;">
              <h2 style="color: #083A85;">Test Email Successful</h2>
              <p>This is a test email from the Jambolush Mailing Service.</p>
              <p><strong>Sent at:</strong> ${new Date().toLocaleString()}</p>
              <p style="color: #666; font-size: 12px;">
                If you received this email, the Brevo integration is working correctly.
              </p>
            </body>
          </html>
        `,
        textContent: `
Test Email Successful

This is a test email from the Jambolush Mailing Service.
Sent at: ${new Date().toLocaleString()}

If you received this email, the Brevo integration is working correctly.
        `.trim()
      };

      await this.sendTransactionalEmail(testEmailData);
      return true;
    } catch (error: any) {
      return false;
    }
  }

  /**
   * Cleanup method for graceful shutdown
   */
  async cleanup(): Promise<void> {
    try {
      // Perform any necessary cleanup operations
      // For Brevo SDK, there's typically no explicit cleanup needed
    } catch (error: any) {
      console.error('Error during cleanup:', error.message);
    }
  }
}