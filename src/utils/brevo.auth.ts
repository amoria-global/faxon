import axios from 'axios';
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

export class BrevoMailingService {
  private apiKey: string;
  private apiUrl = 'https://api.brevo.com/v3';
  private defaultSender: { name: string; email: string };

  constructor() {
    this.apiKey = config.brevoApiKey;
    this.defaultSender = {
      name: 'Jambolush Security',
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
      throw new Error(`Failed to send email: ${error.response?.data?.message || error.message}`);
    }
  }

  // --- CONTACT MANAGEMENT ---
  async createOrUpdateContact(contact: BrevoContact): Promise<void> {
    await this.makeRequest('/contacts', contact, 'POST');
  }

  // --- EMAIL SENDING METHODS ---
  async sendTransactionalEmail(emailData: BrevoEmailData): Promise<string> {
    const response = await this.makeRequest('/smtp/email', emailData);
    return response.messageId;
  }

  // --- AUTHENTICATION EMAIL METHODS ---

  async sendWelcomeEmail(context: MailingContext): Promise<void> {
    const emailData: BrevoEmailData = {
      sender: this.defaultSender,
      to: [{ email: context.user.email, name: `${context.user.firstName} ${context.user.lastName}` }],
      subject: `🎉 Welcome to ${context.company.name} - Your Journey Begins Here!`,
      htmlContent: this.getWelcomeTemplate(context),
      textContent: this.getWelcomeTextTemplate(context)
    };

    await this.sendTransactionalEmail(emailData);
    console.log(`Welcome email sent to ${context.user.email}`);
  }

  async sendEmailVerification(context: MailingContext): Promise<void> {
    const emailData: BrevoEmailData = {
      sender: this.defaultSender,
      to: [{ email: context.user.email, name: `${context.user.firstName} ${context.user.lastName}` }],
      subject: `🔐 Verify Your ${context.company.name} Account`,
      htmlContent: this.getEmailVerificationTemplate(context),
      textContent: this.getEmailVerificationTextTemplate(context)
    };

    await this.sendTransactionalEmail(emailData);
    console.log(`Email verification sent to ${context.user.email}`);
  }

  async sendPasswordResetOTP(context: MailingContext): Promise<void> {
    const emailData: BrevoEmailData = {
      sender: this.defaultSender,
      to: [{ email: context.user.email, name: `${context.user.firstName} ${context.user.lastName}` }],
      subject: `🔑 Your ${context.company.name} Password Reset Code`,
      htmlContent: this.getPasswordResetTemplate(context),
      textContent: this.getPasswordResetTextTemplate(context)
    };

    await this.sendTransactionalEmail(emailData);
    console.log(`Password reset OTP sent to ${context.user.email}`);
  }

  async sendPasswordChangedNotification(context: MailingContext): Promise<void> {
    const emailData: BrevoEmailData = {
      sender: this.defaultSender,
      to: [{ email: context.user.email, name: `${context.user.firstName} ${context.user.lastName}` }],
      subject: `🛡️ ${context.company.name} Password Changed Successfully`,
      htmlContent: this.getPasswordChangedTemplate(context),
      textContent: this.getPasswordChangedTextTemplate(context)
    };

    await this.sendTransactionalEmail(emailData);
    console.log(`Password changed notification sent to ${context.user.email}`);
  }

  async sendLoginNotification(context: MailingContext): Promise<void> {
    const emailData: BrevoEmailData = {
      sender: this.defaultSender,
      to: [{ email: context.user.email, name: `${context.user.firstName} ${context.user.lastName}` }],
      subject: `🔔 New Login to Your ${context.company.name} Account`,
      htmlContent: this.getLoginNotificationTemplate(context),
      textContent: this.getLoginNotificationTextTemplate(context)
    };

    await this.sendTransactionalEmail(emailData);
    console.log(`Login notification sent to ${context.user.email}`);
  }

  async sendSuspiciousActivityAlert(context: MailingContext): Promise<void> {
    const emailData: BrevoEmailData = {
      sender: this.defaultSender,
      to: [{ email: context.user.email, name: `${context.user.firstName} ${context.user.lastName}` }],
      subject: `🚨 Suspicious Activity Detected - ${context.company.name} Security Alert`,
      htmlContent: this.getSuspiciousActivityTemplate(context),
      textContent: this.getSuspiciousActivityTextTemplate(context)
    };

    await this.sendTransactionalEmail(emailData);
    console.log(`Suspicious activity alert sent to ${context.user.email}`);
  }

  async sendAccountStatusChange(context: MailingContext, status: 'suspended' | 'reactivated'): Promise<void> {
    const emailData: BrevoEmailData = {
      sender: this.defaultSender,
      to: [{ email: context.user.email, name: `${context.user.firstName} ${context.user.lastName}` }],
      subject: `${status === 'suspended' ? '⚠️ Account Suspended' : '✅ Account Reactivated'} - ${context.company.name}`,
      htmlContent: this.getAccountStatusTemplate(context, status),
      textContent: this.getAccountStatusTextTemplate(context, status)
    };

    await this.sendTransactionalEmail(emailData);
    console.log(`Account ${status} notification sent to ${context.user.email}`);
  }

  async sendProfileUpdateNotification(context: MailingContext): Promise<void> {
    const emailData: BrevoEmailData = {
      sender: this.defaultSender,
      to: [{ email: context.user.email, name: `${context.user.firstName} ${context.user.lastName}` }],
      subject: `✏️ Profile Updated - ${context.company.name}`,
      htmlContent: this.getProfileUpdateTemplate(context),
      textContent: this.getProfileUpdateTextTemplate(context)
    };

    await this.sendTransactionalEmail(emailData);
    console.log(`Profile update notification sent to ${context.user.email}`);
  }

  // --- EMAIL TEMPLATE METHODS ---
  private getBaseTemplate(): string {
    return `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        .email-container {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          max-width: 600px;
          margin: 0 auto;
          background: linear-gradient(135deg, #0a0e27 0%, #1a1d3a 100%);
          border-radius: 20px;
          overflow: hidden;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
        }
        
        .header {
          background: linear-gradient(135deg, #e91e63 0%, #ff6b9d 100%);
          padding: 40px 30px;
          text-align: center;
          position: relative;
          overflow: hidden;
        }
        
        .header::before {
          content: '';
          position: absolute;
          top: -50%;
          left: -50%;
          width: 200%;
          height: 200%;
          background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><pattern id="grain" width="100" height="100" patternUnits="userSpaceOnUse"><circle cx="10" cy="10" r="1" fill="%23ffffff" opacity="0.1"/><circle cx="30" cy="30" r="1" fill="%23ffffff" opacity="0.1"/><circle cx="50" cy="50" r="1" fill="%23ffffff" opacity="0.1"/><circle cx="70" cy="70" r="1" fill="%23ffffff" opacity="0.1"/><circle cx="90" cy="90" r="1" fill="%23ffffff" opacity="0.1"/></pattern></defs><rect width="100" height="100" fill="url(%23grain)"/></svg>') repeat;
          opacity: 0.3;
        }
        
        .logo {
          position: relative;
          z-index: 2;
          font-size: 32px;
          font-weight: 700;
          color: white;
          text-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
          margin-bottom: 10px;
        }
        
        .header-subtitle {
          position: relative;
          z-index: 2;
          color: rgba(255, 255, 255, 0.9);
          font-size: 16px;
          font-weight: 400;
        }
        
        .content {
          background: white;
          padding: 50px 40px;
          position: relative;
        }
        
        .content::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 4px;
          background: linear-gradient(90deg, #e91e63, #ff6b9d, #e91e63);
        }
        
        .greeting {
          font-size: 28px;
          font-weight: 600;
          color: #0a0e27;
          margin-bottom: 20px;
          background: linear-gradient(135deg, #0a0e27, #1a1d3a);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        
        .message {
          font-size: 16px;
          line-height: 1.6;
          color: #4a5568;
          margin-bottom: 30px;
        }
        
        .highlight-box {
          background: linear-gradient(135deg, #f8faff 0%, #e8f4ff 100%);
          border: 2px solid #e91e63;
          border-radius: 15px;
          padding: 25px;
          margin: 30px 0;
          text-align: center;
          position: relative;
        }
        
        .highlight-box::before {
          content: '';
          position: absolute;
          top: -1px;
          left: -1px;
          right: -1px;
          bottom: -1px;
          background: linear-gradient(135deg, #e91e63, #ff6b9d);
          border-radius: 15px;
          z-index: -1;
        }
        
        .code {
          font-family: 'Monaco', 'Menlo', monospace;
          font-size: 32px;
          font-weight: 700;
          color: #0a0e27;
          letter-spacing: 8px;
          text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        
        .button {
          display: inline-block;
          background: linear-gradient(135deg, #e91e63 0%, #ff6b9d 100%);
          color: white !important;
          text-decoration: none;
          padding: 16px 32px;
          border-radius: 50px;
          font-weight: 600;
          font-size: 16px;
          text-align: center;
          box-shadow: 0 10px 30px rgba(233, 30, 99, 0.3);
          transition: all 0.3s ease;
        }
        
        .button:hover {
          transform: translateY(-2px);
          box-shadow: 0 15px 40px rgba(233, 30, 99, 0.4);
        }
        
        .security-info {
          background: #f7fafc;
          border-radius: 10px;
          padding: 20px;
          margin: 20px 0;
          border-left: 4px solid #e91e63;
        }
        
        .security-item {
          display: flex;
          justify-content: space-between;
          margin: 8px 0;
          font-size: 14px;
        }
        
        .security-label {
          font-weight: 500;
          color: #2d3748;
        }
        
        .security-value {
          color: #4a5568;
          font-family: 'Monaco', 'Menlo', monospace;
        }
        
        .footer {
          background: #0a0e27;
          color: white;
          padding: 40px 30px;
          text-align: center;
        }
        
        .footer-links {
          margin: 20px 0;
        }
        
        .footer-links a {
          color: #ff6b9d;
          text-decoration: none;
          margin: 0 15px;
          font-weight: 500;
        }
        
        .footer-text {
          font-size: 14px;
          color: #a0aec0;
          line-height: 1.5;
        }
        
        .warning {
          background: linear-gradient(135deg, #fff5f5 0%, #fed7d7 100%);
          border: 2px solid #e53e3e;
          border-radius: 15px;
          padding: 20px;
          margin: 20px 0;
          text-align: center;
        }
        
        .warning-icon {
          font-size: 24px;
          margin-bottom: 10px;
        }
        
        .success {
          background: linear-gradient(135deg, #f0fff4 0%, #c6f6d5 100%);
          border: 2px solid #38a169;
          border-radius: 15px;
          padding: 20px;
          margin: 20px 0;
          text-align: center;
        }
        
        .divider {
          height: 2px;
          background: linear-gradient(90deg, transparent, #e91e63, transparent);
          margin: 30px 0;
          border-radius: 1px;
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
        <div class="email-container">
          <div class="header">
            <div class="logo">${context.company.name}</div>
            <div class="header-subtitle">Welcome to the Future</div>
          </div>
          
          <div class="content">
            <div class="greeting">Welcome, ${context.user.firstName}! 🎉</div>
            
            <div class="message">
              We're absolutely thrilled to have you join the <strong>${context.company.name}</strong> community! Your account has been successfully created, and you're now part of something extraordinary.
            </div>
            
            <div class="success">
              <div style="font-size: 24px; margin-bottom: 10px;">✨</div>
              <div style="font-weight: 600; color: #2d3748; margin-bottom: 5px;">Account Created Successfully</div>
              <div style="color: #4a5568;">You're all set to explore our platform</div>
            </div>
            
            <div class="message">
              Here's what you can do next:
              <ul style="margin: 20px 0; padding-left: 20px; color: #4a5568;">
                <li style="margin: 10px 0;">Complete your profile to personalize your experience</li>
                <li style="margin: 10px 0;">Explore our features and discover what's possible</li>
                <li style="margin: 10px 0;">Connect with our community of innovators</li>
              </ul>
            </div>
            
            <div style="text-align: center; margin: 40px 0;">
              <a href="${context.company.website}/dashboard" class="button">
                Start Your Journey
              </a>
            </div>
            
            <div class="divider"></div>
            
            <div style="text-align: center; color: #718096;">
              <p>Need help getting started? We're here for you!</p>
              <p style="margin-top: 10px;">
                <a href="${context.company.website}/support" style="color: #e91e63; text-decoration: none; font-weight: 500;">Visit Support Center</a>
              </p>
            </div>
          </div>
          
          <div class="footer">
            <div class="footer-links">
              <a href="${context.company.website}/dashboard">Dashboard</a>
              <a href="${context.company.website}/support">Support</a>
              <a href="${context.company.website}/privacy">Privacy</a>
            </div>
            <div class="footer-text">
              © ${new Date().getFullYear()} ${context.company.name}. Crafted with passion for innovation.
              <br>
              This email was sent to ${context.user.email}
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
        <div class="email-container">
          <div class="header">
            <div class="logo">${context.company.name}</div>
            <div class="header-subtitle">Security First</div>
          </div>
          
          <div class="content">
            <div class="greeting">Almost There, ${context.user.firstName}! 🔐</div>
            
            <div class="message">
              To complete your account setup and ensure the security of your ${context.company.name} account, please verify your email address using the code below.
            </div>
            
            <div class="highlight-box">
              <div style="color: #4a5568; margin-bottom: 10px; font-weight: 500;">Your Verification Code</div>
              <div class="code">${context.verification?.code}</div>
              <div style="color: #718096; font-size: 14px; margin-top: 10px;">
                Code expires in ${context.verification?.expiresIn}
              </div>
            </div>
            
            <div class="message">
              Enter this code in your verification screen to activate your account. This code is unique to you and should not be shared with anyone.
            </div>
            
            <div style="text-align: center; margin: 40px 0;">
              <a href="${context.company.website}/verify-email" class="button">
                Verify Email Address
              </a>
            </div>
            
            <div class="warning">
              <div class="warning-icon">🛡️</div>
              <div style="font-weight: 600; color: #2d3748; margin-bottom: 5px;">Security Notice</div>
              <div style="color: #4a5568; font-size: 14px;">
                If you didn't create this account, please ignore this email or contact our support team.
              </div>
            </div>
          </div>
          
          <div class="footer">
            <div class="footer-links">
              <a href="${context.company.website}/support">Need Help?</a>
              <a href="${context.company.website}/security">Security Center</a>
            </div>
            <div class="footer-text">
              © ${new Date().getFullYear()} ${context.company.name}. Your security is our priority.
              <br>
              This verification email was sent to ${context.user.email}
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
        <div class="email-container">
          <div class="header">
            <div class="logo">${context.company.name}</div>
            <div class="header-subtitle">Password Reset</div>
          </div>
          
          <div class="content">
            <div class="greeting">Password Reset Request 🔑</div>
            
            <div class="message">
              Hi ${context.user.firstName}, we received a request to reset your ${context.company.name} account password. Use the verification code below to proceed with resetting your password.
            </div>
            
            <div class="highlight-box">
              <div style="color: #4a5568; margin-bottom: 10px; font-weight: 500;">Password Reset Code</div>
              <div class="code">${context.verification?.code}</div>
              <div style="color: #718096; font-size: 14px; margin-top: 10px;">
                This code expires in ${context.verification?.expiresIn}
              </div>
            </div>
            
            <div class="message">
              Enter this code in the password reset form to create a new password. For your security, this code can only be used once.
            </div>
            
            <div style="text-align: center; margin: 40px 0;">
              <a href="${context.company.website}/reset-password" class="button">
                Reset Password
              </a>
            </div>
            
            <div class="security-info">
              <div style="font-weight: 600; color: #2d3748; margin-bottom: 15px; display: flex; align-items: center;">
                <span style="margin-right: 8px;">🔍</span> Request Details
              </div>
              ${context.security ? `
                <div class="security-item">
                  <span class="security-label">Time:</span>
                  <span class="security-value">${new Date(context.security.timestamp).toLocaleString()}</span>
                </div>
                <div class="security-item">
                  <span class="security-label">Device:</span>
                  <span class="security-value">${context.security.device || 'Unknown'}</span>
                </div>
                <div class="security-item">
                  <span class="security-label">Location:</span>
                  <span class="security-value">${context.security.location || 'Unknown'}</span>
                </div>
                <div class="security-item">
                  <span class="security-label">IP Address:</span>
                  <span class="security-value">${context.security.ipAddress || 'Unknown'}</span>
                </div>
              ` : ''}
            </div>
            
            <div class="warning">
              <div class="warning-icon">⚠️</div>
              <div style="font-weight: 600; color: #2d3748; margin-bottom: 5px;">Didn't Request This?</div>
              <div style="color: #4a5568; font-size: 14px;">
                If you didn't request a password reset, please ignore this email or <a href="mailto:${context.company.supportEmail}" style="color: #e53e3e; text-decoration: none;">contact our security team</a> immediately.
              </div>
            </div>
          </div>
          
          <div class="footer">
            <div class="footer-links">
              <a href="${context.company.website}/support">Support</a>
              <a href="${context.company.website}/security">Security</a>
              <a href="${context.company.website}/login">Login</a>
            </div>
            <div class="footer-text">
              © ${new Date().getFullYear()} ${context.company.name}. Protecting your account 24/7.
              <br>
              This security email was sent to ${context.user.email}
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
        <div class="email-container">
          <div class="header">
            <div class="logo">${context.company.name}</div>
            <div class="header-subtitle">Security Update</div>
          </div>
          
          <div class="content">
            <div class="greeting">Password Updated! 🛡️</div>
            
            <div class="message">
              Hi ${context.user.firstName}, this is a confirmation that your ${context.company.name} account password was successfully changed.
            </div>
            
            <div class="success">
              <div style="font-size: 24px; margin-bottom: 10px;">✅</div>
              <div style="font-weight: 600; color: #2d3748; margin-bottom: 5px;">Password Changed Successfully</div>
              <div style="color: #4a5568;">Your account security has been updated</div>
            </div>
            
            <div class="security-info">
              <div style="font-weight: 600; color: #2d3748; margin-bottom: 15px; display: flex; align-items: center;">
                <span style="margin-right: 8px;">📊</span> Change Details
              </div>
              ${context.security ? `
                <div class="security-item">
                  <span class="security-label">Changed:</span>
                  <span class="security-value">${new Date(context.security.timestamp).toLocaleString()}</span>
                </div>
                <div class="security-item">
                  <span class="security-label">Device:</span>
                  <span class="security-value">${context.security.device || 'Unknown'}</span>
                </div>
                <div class="security-item">
                  <span class="security-label">Browser:</span>
                  <span class="security-value">${context.security.browser || 'Unknown'}</span>
                </div>
                <div class="security-item">
                  <span class="security-label">Location:</span>
                  <span class="security-value">${context.security.location || 'Unknown'}</span>
                </div>
              ` : ''}
            </div>
            
            <div class="message">
              Your password change is now active across all your devices. For security reasons, you've been logged out of all other sessions. You can log back in using your new password.
            </div>
            
            <div style="text-align: center; margin: 40px 0;">
              <a href="${context.company.website}/login" class="button">
                Sign In Now
              </a>
            </div>
            
            <div class="warning">
              <div class="warning-icon">🚨</div>
              <div style="font-weight: 600; color: #2d3748; margin-bottom: 5px;">Didn't Make This Change?</div>
              <div style="color: #4a5568; font-size: 14px;">
                If you didn't change your password, your account may be compromised. 
                <a href="mailto:${context.company.supportEmail}" style="color: #e53e3e; text-decoration: none; font-weight: 500;">Contact our security team immediately</a>.
              </div>
            </div>
          </div>
          
          <div class="footer">
            <div class="footer-links">
              <a href="${context.company.website}/security">Security Center</a>
              <a href="${context.company.website}/support">Support</a>
              <a href="${context.company.website}/login">Login</a>
            </div>
            <div class="footer-text">
              © ${new Date().getFullYear()} ${context.company.name}. Your security is our mission.
              <br>
              This security notification was sent to ${context.user.email}
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
        <div class="email-container">
          <div class="header">
            <div class="logo">${context.company.name}</div>
            <div class="header-subtitle">Login Alert</div>
          </div>
          
          <div class="content">
            <div class="greeting">New Login Detected 🔔</div>
            
            <div class="message">
              Hi ${context.user.firstName}, we detected a new sign-in to your ${context.company.name} account. If this was you, no action is needed.
            </div>
            
            <div class="security-info">
              <div style="font-weight: 600; color: #2d3748; margin-bottom: 15px; display: flex; align-items: center;">
                <span style="margin-right: 8px;">🔍</span> Login Details
              </div>
              ${context.security ? `
                <div class="security-item">
                  <span class="security-label">Time:</span>
                  <span class="security-value">${new Date(context.security.timestamp).toLocaleString()}</span>
                </div>
                <div class="security-item">
                  <span class="security-label">Device:</span>
                  <span class="security-value">${context.security.device || 'Unknown Device'}</span>
                </div>
                <div class="security-item">
                  <span class="security-label">Browser:</span>
                  <span class="security-value">${context.security.browser || 'Unknown Browser'}</span>
                </div>
                <div class="security-item">
                  <span class="security-label">Location:</span>
                  <span class="security-value">${context.security.location || 'Unknown Location'}</span>
                </div>
                <div class="security-item">
                  <span class="security-label">IP Address:</span>
                  <span class="security-value">${context.security.ipAddress || 'Unknown'}</span>
                </div>
              ` : ''}
            </div>
            
            <div class="success">
              <div style="font-size: 20px; margin-bottom: 10px;">👤</div>
              <div style="font-weight: 600; color: #2d3748; margin-bottom: 5px;">Was This You?</div>
              <div style="color: #4a5568; font-size: 14px;">
                If you recognize this activity, you can safely ignore this email.
              </div>
            </div>
            
            <div style="text-align: center; margin: 40px 0;">
              <a href="${context.company.website}/security/sessions" class="button">
                Review Account Activity
              </a>
            </div>
            
            <div class="warning">
              <div class="warning-icon">🚨</div>
              <div style="font-weight: 600; color: #2d3748; margin-bottom: 5px;">Unrecognized Login?</div>
              <div style="color: #4a5568; font-size: 14px;">
                If you don't recognize this activity:
                <ul style="margin: 10px 0; padding-left: 20px; text-align: left;">
                  <li>Change your password immediately</li>
                  <li>Review your account activity</li>
                  <li>Enable two-factor authentication</li>
                  <li><a href="mailto:${context.company.supportEmail}" style="color: #e53e3e; text-decoration: none;">Contact our security team</a></li>
                </ul>
              </div>
            </div>
          </div>
          
          <div class="footer">
            <div class="footer-links">
              <a href="${context.company.website}/security">Security</a>
              <a href="${context.company.website}/settings">Settings</a>
              <a href="${context.company.website}/support">Support</a>
            </div>
            <div class="footer-text">
              © ${new Date().getFullYear()} ${context.company.name}. Monitoring your security 24/7.
              <br>
              This security alert was sent to ${context.user.email}
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
      </head>
      <body>
        <div class="email-container">
          <div class="header" style="background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%);">
            <div class="logo">${context.company.name}</div>
            <div class="header-subtitle">Security Alert</div>
          </div>
          
          <div class="content">
            <div class="greeting" style="color: #dc2626;">🚨 Suspicious Activity Detected</div>
            
            <div class="message">
              <strong>Urgent:</strong> ${context.user.firstName}, we've detected suspicious activity on your ${context.company.name} account that requires your immediate attention.
            </div>
            
            <div class="warning" style="border-color: #dc2626; background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);">
              <div class="warning-icon">⚠️</div>
              <div style="font-weight: 600; color: #dc2626; margin-bottom: 5px;">Security Threat Detected</div>
              <div style="color: #991b1b; font-size: 14px;">
                Multiple failed login attempts or unusual access patterns detected
              </div>
            </div>
            
            <div class="security-info" style="border-color: #dc2626;">
              <div style="font-weight: 600; color: #dc2626; margin-bottom: 15px; display: flex; align-items: center;">
                <span style="margin-right: 8px;">🔍</span> Suspicious Activity Details
              </div>
              ${context.security ? `
                <div class="security-item">
                  <span class="security-label">Detected:</span>
                  <span class="security-value">${new Date(context.security.timestamp).toLocaleString()}</span>
                </div>
                <div class="security-item">
                  <span class="security-label">Activity Type:</span>
                  <span class="security-value">Multiple failed login attempts</span>
                </div>
                <div class="security-item">
                  <span class="security-label">Source IP:</span>
                  <span class="security-value">${context.security.ipAddress || 'Unknown'}</span>
                </div>
                <div class="security-item">
                  <span class="security-label">Location:</span>
                  <span class="security-value">${context.security.location || 'Unknown Location'}</span>
                </div>
              ` : ''}
            </div>
            
            <div class="message">
              <strong>Immediate Actions Required:</strong>
              <ul style="margin: 15px 0; padding-left: 20px; color: #4a5568;">
                <li style="margin: 8px 0;">Change your password immediately</li>
                <li style="margin: 8px 0;">Enable two-factor authentication if not already active</li>
                <li style="margin: 8px 0;">Review your recent account activity</li>
                <li style="margin: 8px 0;">Check for any unauthorized changes</li>
              </ul>
            </div>
            
            <div style="text-align: center; margin: 40px 0;">
              <a href="${context.company.website}/security/change-password" class="button" style="background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%);">
                Secure My Account Now
              </a>
            </div>
            
            <div class="warning" style="border-color: #dc2626;">
              <div class="warning-icon">📞</div>
              <div style="font-weight: 600; color: #dc2626; margin-bottom: 5px;">Need Immediate Help?</div>
              <div style="color: #991b1b; font-size: 14px;">
                If you suspect your account has been compromised, contact our security team immediately at 
                <a href="mailto:${context.company.supportEmail}" style="color: #dc2626; text-decoration: none; font-weight: 500;">${context.company.supportEmail}</a>
              </div>
            </div>
          </div>
          
          <div class="footer">
            <div class="footer-links">
              <a href="${context.company.website}/security">Security Center</a>
              <a href="${context.company.website}/support">Emergency Support</a>
              <a href="${context.company.website}/settings">Account Settings</a>
            </div>
            <div class="footer-text">
              © ${new Date().getFullYear()} ${context.company.name}. Your security is our top priority.
              <br>
              This critical security alert was sent to ${context.user.email}
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private getAccountStatusTemplate(context: MailingContext, status: 'suspended' | 'reactivated'): string {
    const isSuspended = status === 'suspended';
    const headerColor = isSuspended ? 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)' : 'linear-gradient(135deg, #059669 0%, #10b981 100%)';
    const icon = isSuspended ? '⚠️' : '✅';
    const title = isSuspended ? 'Account Suspended' : 'Account Reactivated';
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${title}</title>
        ${this.getBaseTemplate()}
      </head>
      <body>
        <div class="email-container">
          <div class="header" style="background: ${headerColor};">
            <div class="logo">${context.company.name}</div>
            <div class="header-subtitle">Account Status Update</div>
          </div>
          
          <div class="content">
            <div class="greeting">${icon} ${title}</div>
            
            <div class="message">
              Hi ${context.user.firstName}, this is an important update regarding your ${context.company.name} account status.
            </div>
            
            ${isSuspended ? `
              <div class="warning" style="border-color: #dc2626;">
                <div class="warning-icon">🔒</div>
                <div style="font-weight: 600; color: #dc2626; margin-bottom: 5px;">Account Suspended</div>
                <div style="color: #991b1b; font-size: 14px;">
                  Your account has been temporarily suspended due to security concerns or policy violations.
                </div>
              </div>
              
              <div class="message">
                <strong>What this means:</strong>
                <ul style="margin: 15px 0; padding-left: 20px; color: #4a5568;">
                  <li style="margin: 8px 0;">You cannot access your account or its features</li>
                  <li style="margin: 8px 0;">All active sessions have been terminated</li>
                  <li style="margin: 8px 0;">Your data remains secure and protected</li>
                </ul>
              </div>
              
              <div style="text-align: center; margin: 40px 0;">
                <a href="${context.company.website}/appeal" class="button" style="background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%);">
                  Submit Appeal
                </a>
              </div>
            ` : `
              <div class="success" style="border-color: #059669;">
                <div style="font-size: 24px; margin-bottom: 10px;">🎉</div>
                <div style="font-weight: 600; color: #065f46; margin-bottom: 5px;">Welcome Back!</div>
                <div style="color: #047857; font-size: 14px;">
                  Your account has been successfully reactivated and you can now access all features.
                </div>
              </div>
              
              <div class="message">
                <strong>You can now:</strong>
                <ul style="margin: 15px 0; padding-left: 20px; color: #4a5568;">
                  <li style="margin: 8px 0;">Access your full account and all features</li>
                  <li style="margin: 8px 0;">Continue where you left off</li>
                  <li style="margin: 8px 0;">Enjoy the complete ${context.company.name} experience</li>
                </ul>
              </div>
              
              <div style="text-align: center; margin: 40px 0;">
                <a href="${context.company.website}/login" class="button">
                  Access Your Account
                </a>
              </div>
            `}
            
            <div class="divider"></div>
            
            <div style="text-align: center; color: #718096;">
              <p>Questions about your account status?</p>
              <p style="margin-top: 10px;">
                <a href="mailto:${context.company.supportEmail}" style="color: #e91e63; text-decoration: none; font-weight: 500;">Contact Support Team</a>
              </p>
            </div>
          </div>
          
          <div class="footer">
            <div class="footer-links">
              <a href="${context.company.website}/support">Support</a>
              <a href="${context.company.website}/terms">Terms</a>
              <a href="${context.company.website}/privacy">Privacy</a>
            </div>
            <div class="footer-text">
              © ${new Date().getFullYear()} ${context.company.name}. Committed to fair and transparent policies.
              <br>
              This account status update was sent to ${context.user.email}
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
        <div class="email-container">
          <div class="header">
            <div class="logo">${context.company.name}</div>
            <div class="header-subtitle">Profile Update</div>
          </div>
          
          <div class="content">
            <div class="greeting">Profile Updated! ✏️</div>
            
            <div class="message">
              Hi ${context.user.firstName}, your ${context.company.name} profile has been successfully updated with your recent changes.
            </div>
            
            <div class="success">
              <div style="font-size: 24px; margin-bottom: 10px;">📝</div>
              <div style="font-weight: 600; color: #2d3748; margin-bottom: 5px;">Changes Saved Successfully</div>
              <div style="color: #4a5568;">Your profile information has been updated</div>
            </div>
            
            <div class="security-info">
              <div style="font-weight: 600; color: #2d3748; margin-bottom: 15px; display: flex; align-items: center;">
                <span style="margin-right: 8px;">📊</span> Update Details
              </div>
              ${context.security ? `
                <div class="security-item">
                  <span class="security-label">Updated:</span>
                  <span class="security-value">${new Date(context.security.timestamp).toLocaleString()}</span>
                </div>
                <div class="security-item">
                  <span class="security-label">Device:</span>
                  <span class="security-value">${context.security.device || 'Unknown'}</span>
                </div>
                <div class="security-item">
                  <span class="security-label">Location:</span>
                  <span class="security-value">${context.security.location || 'Unknown'}</span>
                </div>
              ` : ''}
            </div>
            
            <div class="message">
              Your updated information is now active across all ${context.company.name} services. If you need to make additional changes, you can always update your profile from your account settings.
            </div>
            
            <div style="text-align: center; margin: 40px 0;">
              <a href="${context.company.website}/profile" class="button">
                View Profile
              </a>
            </div>
            
            <div class="highlight-box" style="border-color: #6366f1; background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);">
              <div style="color: #1e40af; font-weight: 600; margin-bottom: 10px;">💡 Pro Tip</div>
              <div style="color: #1e3a8a; font-size: 14px;">
                Keep your profile information up to date to get the most personalized experience from ${context.company.name}.
              </div>
            </div>
            
            <div style="text-align: center; color: #718096; margin-top: 30px;">
              <p>Didn't make these changes?</p>
              <p style="margin-top: 5px;">
                <a href="mailto:${context.company.supportEmail}" style="color: #e91e63; text-decoration: none; font-weight: 500;">Report unauthorized changes</a>
              </p>
            </div>
          </div>
          
          <div class="footer">
            <div class="footer-links">
              <a href="${context.company.website}/profile">Profile</a>
              <a href="${context.company.website}/settings">Settings</a>
              <a href="${context.company.website}/support">Support</a>
            </div>
            <div class="footer-text">
              © ${new Date().getFullYear()} ${context.company.name}. Empowering your digital identity.
              <br>
              This profile update notification was sent to ${context.user.email}
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

We're thrilled to have you join our community. Your account has been successfully created and you're now part of something extraordinary.

Start your journey: ${context.company.website}/dashboard

Need help? Visit our support center: ${context.company.website}/support

© ${new Date().getFullYear()} ${context.company.name}
This email was sent to ${context.user.email}
    `.trim();
  }

  private getEmailVerificationTextTemplate(context: MailingContext): string {
    return `
Email Verification - ${context.company.name}

Hi ${context.user.firstName}, please verify your email address using the code below:

Verification Code: ${context.verification?.code}
Code expires in: ${context.verification?.expiresIn}

Verify at: ${context.company.website}/verify-email

If you didn't create this account, please ignore this email.

© ${new Date().getFullYear()} ${context.company.name}
    `.trim();
  }

  private getPasswordResetTextTemplate(context: MailingContext): string {
    return `
Password Reset - ${context.company.name}

Hi ${context.user.firstName}, use this code to reset your password:

Reset Code: ${context.verification?.code}
Expires in: ${context.verification?.expiresIn}

Reset at: ${context.company.website}/reset-password

If you didn't request this, please ignore this email or contact support at ${context.company.supportEmail}.

© ${new Date().getFullYear()} ${context.company.name}
    `.trim();
  }

  private getPasswordChangedTextTemplate(context: MailingContext): string {
    return `
Password Changed - ${context.company.name}

Hi ${context.user.firstName}, your password was successfully changed.

Changed: ${context.security?.timestamp ? new Date(context.security.timestamp).toLocaleString() : 'Recently'}

If you didn't make this change, contact security immediately at ${context.company.supportEmail}.

Sign in: ${context.company.website}/login

© ${new Date().getFullYear()} ${context.company.name}
    `.trim();
  }

  private getLoginNotificationTextTemplate(context: MailingContext): string {
    return `
New Login Detected - ${context.company.name}

Hi ${context.user.firstName}, we detected a new sign-in to your account.

Time: ${context.security?.timestamp ? new Date(context.security.timestamp).toLocaleString() : 'Recently'}
Device: ${context.security?.device || 'Unknown'}
Location: ${context.security?.location || 'Unknown'}

If you don't recognize this activity, secure your account immediately:
${context.company.website}/security

© ${new Date().getFullYear()} ${context.company.name}
    `.trim();
  }

  private getSuspiciousActivityTextTemplate(context: MailingContext): string {
    return `
SECURITY ALERT - ${context.company.name}

${context.user.firstName}, suspicious activity detected on your account.

Secure your account immediately:
1. Change your password: ${context.company.website}/security/change-password
2. Enable two-factor authentication
3. Review account activity

Emergency support: ${context.company.supportEmail}

© ${new Date().getFullYear()} ${context.company.name}
    `.trim();
  }

  private getAccountStatusTextTemplate(context: MailingContext, status: 'suspended' | 'reactivated'): string {
    const action = status === 'suspended' ? 'suspended' : 'reactivated';
    const url = status === 'suspended' ? '/appeal' : '/login';
    
    return `
Account ${action.toUpperCase()} - ${context.company.name}

Hi ${context.user.firstName}, your account has been ${action}.

${status === 'suspended' 
  ? `Your account access has been temporarily restricted. Submit an appeal: ${context.company.website}${url}`
  : `Welcome back! Your account is now active. Sign in: ${context.company.website}${url}`
}

Questions? Contact support: ${context.company.supportEmail}

© ${new Date().getFullYear()} ${context.company.name}
    `.trim();
  }

  private getProfileUpdateTextTemplate(context: MailingContext): string {
    return `
Profile Updated - ${context.company.name}

Hi ${context.user.firstName}, your profile has been successfully updated.

Updated: ${context.security?.timestamp ? new Date(context.security.timestamp).toLocaleString() : 'Recently'}

View profile: ${context.company.website}/profile

If you didn't make these changes, report it: ${context.company.supportEmail}

© ${new Date().getFullYear()} ${context.company.name}
    `.trim();
  }
}