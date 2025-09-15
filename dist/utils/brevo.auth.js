"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrevoMailingService = void 0;
const axios_1 = __importDefault(require("axios"));
const config_1 = require("../config/config");
class BrevoMailingService {
    constructor() {
        this.apiUrl = 'https://api.brevo.com/v3';
        this.apiKey = config_1.config.brevoApiKey;
        this.defaultSender = {
            name: 'Jambolush Security',
            email: config_1.config.brevoSenderEmail
        };
    }
    async makeRequest(endpoint, data, method = 'POST') {
        try {
            const response = await (0, axios_1.default)({
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
        }
        catch (error) {
            console.error('Brevo API Error:', error.response?.data || error.message);
            throw new Error(`Failed to send email: ${error.response?.data?.message || error.message}`);
        }
    }
    // --- CONTACT MANAGEMENT ---
    async createOrUpdateContact(contact) {
        await this.makeRequest('/contacts', contact, 'POST');
    }
    // --- EMAIL SENDING METHODS ---
    async sendTransactionalEmail(emailData) {
        const response = await this.makeRequest('/smtp/email', emailData);
        return response.messageId;
    }
    // --- AUTHENTICATION EMAIL METHODS ---
    async sendWelcomeEmail(context) {
        const emailData = {
            sender: this.defaultSender,
            to: [{ email: context.user.email, name: `${context.user.firstName} ${context.user.lastName}` }],
            subject: `Welcome to ${context.company.name} - Your Journey Begins Here!`,
            htmlContent: this.getWelcomeTemplate(context),
            textContent: this.getWelcomeTextTemplate(context)
        };
        await this.sendTransactionalEmail(emailData);
        console.log(`Welcome email sent to ${context.user.email}`);
    }
    async sendEmailVerification(context) {
        const emailData = {
            sender: this.defaultSender,
            to: [{ email: context.user.email, name: `${context.user.firstName} ${context.user.lastName}` }],
            subject: `Verify Your ${context.company.name} Account`,
            htmlContent: this.getEmailVerificationTemplate(context),
            textContent: this.getEmailVerificationTextTemplate(context)
        };
        await this.sendTransactionalEmail(emailData);
        console.log(`Email verification sent to ${context.user.email}`);
    }
    async sendPasswordResetOTP(context) {
        const emailData = {
            sender: this.defaultSender,
            to: [{ email: context.user.email, name: `${context.user.firstName} ${context.user.lastName}` }],
            subject: `Your ${context.company.name} Password Reset Code`,
            htmlContent: this.getPasswordResetTemplate(context),
            textContent: this.getPasswordResetTextTemplate(context)
        };
        await this.sendTransactionalEmail(emailData);
        console.log(`Password reset OTP sent to ${context.user.email}`);
    }
    async sendPasswordChangedNotification(context) {
        const emailData = {
            sender: this.defaultSender,
            to: [{ email: context.user.email, name: `${context.user.firstName} ${context.user.lastName}` }],
            subject: `${context.company.name} Password Changed Successfully`,
            htmlContent: this.getPasswordChangedTemplate(context),
            textContent: this.getPasswordChangedTextTemplate(context)
        };
        await this.sendTransactionalEmail(emailData);
        console.log(`Password changed notification sent to ${context.user.email}`);
    }
    async sendLoginNotification(context) {
        const emailData = {
            sender: this.defaultSender,
            to: [{ email: context.user.email, name: `${context.user.firstName} ${context.user.lastName}` }],
            subject: `New Login to Your ${context.company.name} Account`,
            htmlContent: this.getLoginNotificationTemplate(context),
            textContent: this.getLoginNotificationTextTemplate(context)
        };
        await this.sendTransactionalEmail(emailData);
        console.log(`Login notification sent to ${context.user.email}`);
    }
    async sendSuspiciousActivityAlert(context) {
        const emailData = {
            sender: this.defaultSender,
            to: [{ email: context.user.email, name: `${context.user.firstName} ${context.user.lastName}` }],
            subject: `Suspicious Activity Detected - ${context.company.name} Security Alert`,
            htmlContent: this.getSuspiciousActivityTemplate(context),
            textContent: this.getSuspiciousActivityTextTemplate(context)
        };
        await this.sendTransactionalEmail(emailData);
        console.log(`Suspicious activity alert sent to ${context.user.email}`);
    }
    async sendAccountStatusChange(context, status) {
        const emailData = {
            sender: this.defaultSender,
            to: [{ email: context.user.email, name: `${context.user.firstName} ${context.user.lastName}` }],
            subject: `${status === 'suspended' ? 'Account Suspended' : 'Account Reactivated'} - ${context.company.name}`,
            htmlContent: this.getAccountStatusTemplate(context, status),
            textContent: this.getAccountStatusTextTemplate(context, status)
        };
        await this.sendTransactionalEmail(emailData);
        console.log(`Account ${status} notification sent to ${context.user.email}`);
    }
    async sendProfileUpdateNotification(context) {
        const emailData = {
            sender: this.defaultSender,
            to: [{ email: context.user.email, name: `${context.user.firstName} ${context.user.lastName}` }],
            subject: `Profile Updated - ${context.company.name}`,
            htmlContent: this.getProfileUpdateTemplate(context),
            textContent: this.getProfileUpdateTextTemplate(context)
        };
        await this.sendTransactionalEmail(emailData);
        console.log(`Profile update notification sent to ${context.user.email}`);
    }
    // --- MODERNIZED EMAIL TEMPLATES ---
    getBaseTemplate() {
        return `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        
        * { 
          margin: 0; 
          padding: 0; 
          box-sizing: border-box; 
        }
        
        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          line-height: 1.6;
          color: #374151;
          background-color: #f9fafb;
        }
        
        .email-wrapper {
          max-width: 600px;
          margin: 0 auto;
          background-color: #f9fafb;
          padding: 20px;
        }
        
        .email-container {
          background: white;
          border-radius: 20px;
          overflow: hidden;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
          border: 1px solid #e5e7eb;
        }
        
        .header {
          background: linear-gradient(135deg, #083A85 0%, #0a4499 100%);
          padding: 40px 30px;
          text-align: center;
          color: white;
        }
        
        .logo {
          font-size: 28px;
          font-weight: 700;
          margin-bottom: 8px;
          letter-spacing: -0.025em;
        }
        
        .header-subtitle {
          font-size: 16px;
          font-weight: 400;
          opacity: 0.9;
        }
        
        .content {
          padding: 40px 30px;
        }
        
        .greeting {
          font-size: 24px;
          font-weight: 600;
          color: #111827;
          margin-bottom: 20px;
          letter-spacing: -0.025em;
        }
        
        .message {
          font-size: 16px;
          line-height: 1.7;
          color: #4b5563;
          margin-bottom: 24px;
        }
        
        .highlight-box {
          background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
          border: 2px solid #083A85;
          border-radius: 16px;
          padding: 24px;
          margin: 24px 0;
          text-align: center;
        }
        
        .verification-code {
          font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
          font-size: 32px;
          font-weight: 700;
          color: #083A85;
          letter-spacing: 6px;
          margin: 12px 0;
        }
        
        .code-label {
          font-size: 14px;
          font-weight: 500;
          color: #6b7280;
          margin-bottom: 8px;
        }
        
        .code-expiry {
          font-size: 14px;
          color: #9ca3af;
          margin-top: 8px;
        }
        
        .button {
          display: inline-block;
          background: linear-gradient(135deg, #083A85 0%, #0a4499 100%);
          color: white;
          text-decoration: none;
          padding: 14px 28px;
          border-radius: 12px;
          font-weight: 600;
          font-size: 16px;
          text-align: center;
          box-shadow: 0 4px 14px rgba(8, 58, 133, 0.3);
          transition: all 0.3s ease;
        }
        
        .button:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(8, 58, 133, 0.4);
        }
        
        .button-center {
          text-align: center;
          margin: 32px 0;
        }
        
        .info-card {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 20px;
          margin: 24px 0;
        }
        
        .info-card-header {
          display: flex;
          align-items: center;
          font-weight: 600;
          color: #374151;
          margin-bottom: 16px;
          font-size: 15px;
        }
        
        .info-card-icon {
          margin-right: 8px;
          font-size: 18px;
        }
        
        .info-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 0;
          border-bottom: 1px solid #f1f5f9;
        }
        
        .info-row:last-child {
          border-bottom: none;
        }
        
        .info-label {
          font-weight: 500;
          color: #374151;
          font-size: 14px;
        }
        
        .info-value {
          font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
          color: #6b7280;
          font-size: 14px;
          text-align: right;
        }
        
        .alert-box {
          border-radius: 12px;
          padding: 20px;
          margin: 24px 0;
          border-left: 4px solid;
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
          margin-bottom: 8px;
          font-size: 15px;
        }
        
        .alert-text {
          font-size: 14px;
          line-height: 1.5;
        }
        
        .divider {
          height: 1px;
          background: linear-gradient(90deg, transparent, #e5e7eb, transparent);
          margin: 32px 0;
        }
        
        .footer {
          background: #083A85;
          color: white;
          padding: 32px 30px;
          text-align: center;
        }
        
        .footer-links {
          margin-bottom: 20px;
        }
        
        .footer-links a {
          color: #93c5fd;
          text-decoration: none;
          margin: 0 12px;
          font-weight: 500;
          font-size: 14px;
        }
        
        .footer-links a:hover {
          color: white;
        }
        
        .footer-text {
          font-size: 13px;
          color: #cbd5e1;
          line-height: 1.5;
        }
        
        .security-badge {
          display: inline-flex;
          align-items: center;
          background: #dbeafe;
          color: #1e40af;
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 13px;
          font-weight: 500;
          margin-top: 16px;
        }
        
        .feature-list {
          list-style: none;
          padding: 0;
          margin: 16px 0;
        }
        
        .feature-list li {
          padding: 8px 0;
          color: #4b5563;
          font-size: 15px;
        }
        
        .feature-list li:before {
          content: "✓";
          color: #22c55e;
          font-weight: bold;
          margin-right: 8px;
        }
        
        @media (max-width: 600px) {
          .email-wrapper {
            padding: 10px;
          }
          
          .content {
            padding: 30px 20px;
          }
          
          .header {
            padding: 30px 20px;
          }
          
          .footer {
            padding: 24px 20px;
          }
          
          .verification-code {
            font-size: 28px;
            letter-spacing: 4px;
          }
          
          .greeting {
            font-size: 20px;
          }
          
          .info-row {
            flex-direction: column;
            align-items: flex-start;
            gap: 4px;
          }
          
          .info-value {
            text-align: left;
          }
        }
      </style>
    `;
    }
    getWelcomeTemplate(context) {
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
              <div class="header-subtitle">Welcome to the Future</div>
            </div>
            
            <div class="content">
              <div class="greeting">Welcome, ${context.user.firstName}!</div>
              
              <div class="message">
                We're thrilled to have you join the <strong>${context.company.name}</strong> community! Your account has been successfully created, and you're now part of something extraordinary.
              </div>
              
              <div class="alert-box alert-success">
                <div class="alert-title">Account Created Successfully</div>
                <div class="alert-text">You're all set to explore our platform and discover amazing properties.</div>
              </div>
              
              <div class="message">
                Here's what you can do next:
              </div>
              
              <ul class="feature-list">
                <li>Complete your profile to personalize your experience</li>
                <li>Explore our features and discover what's possible</li>
                <li>Connect with our community of property enthusiasts</li>
                <li>Start browsing exclusive properties in your area</li>
              </ul>
              
              <div class="button-center">
                <a href="${context.company.website}/dashboard" class="button">
                  Start Your Journey
                </a>
              </div>
              
              <div class="divider"></div>
              
              <div style="text-align: center; color: #6b7280;">
                <p>Need help getting started? We're here for you!</p>
                <p style="margin-top: 8px;">
                  <a href="${context.company.website}/support" style="color: #083A85; text-decoration: none; font-weight: 500;">Visit Support Center</a>
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
        </div>
      </body>
      </html>
    `;
    }
    getEmailVerificationTemplate(context) {
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
              <div class="header-subtitle">Security First</div>
            </div>
            
            <div class="content">
              <div class="greeting">Almost There, ${context.user.firstName}!</div>
              
              <div class="message">
                To complete your account setup and ensure the security of your ${context.company.name} account, please verify your email address using the code below.
              </div>
              
              <div class="highlight-box">
                <div class="code-label">Your Verification Code</div>
                <div class="verification-code">${context.verification?.code}</div>
                <div class="code-expiry">Code expires in ${context.verification?.expiresIn}</div>
              </div>
              
              <div class="message">
                Enter this code in your verification screen to activate your account. This code is unique to you and should not be shared with anyone.
              </div>
              
              <div class="button-center">
                <a href="${context.company.website}/verify-email" class="button">
                  Verify Email Address
                </a>
              </div>
              
              <div class="alert-box alert-warning">
                <div class="alert-title">Security Notice</div>
                <div class="alert-text">
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
        </div>
      </body>
      </html>
    `;
    }
    getPasswordResetTemplate(context) {
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
              <div class="header-subtitle">Password Reset</div>
            </div>
            
            <div class="content">
              <div class="greeting">Password Reset Request</div>
              
              <div class="message">
                Hi ${context.user.firstName}, we received a request to reset your ${context.company.name} account password. Use the verification code below to proceed with resetting your password.
              </div>
              
              <div class="highlight-box">
                <div class="code-label">Password Reset Code</div>
                <div class="verification-code">${context.verification?.code}</div>
                <div class="code-expiry">This code expires in ${context.verification?.expiresIn}</div>
              </div>
              
              <div class="message">
                Enter this code in the password reset form to create a new password. For your security, this code can only be used once.
              </div>
              
              <div class="button-center">
                <a href="${context.company.website}/reset-password" class="button">
                  Reset Password
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
                    <span class="info-value">${context.security.device || 'Unknown'}</span>
                  </div>
                  <div class="info-row">
                    <span class="info-label">Location</span>
                    <span class="info-value">${context.security.location || 'Unknown'}</span>
                  </div>
                  <div class="info-row">
                    <span class="info-label">IP Address</span>
                    <span class="info-value">${context.security.ipAddress || 'Unknown'}</span>
                  </div>
                </div>
              ` : ''}
              
              <div class="alert-box alert-error">
                <div class="alert-title">Didn't Request This?</div>
                <div class="alert-text">
                  If you didn't request a password reset, please ignore this email or 
                  <a href="mailto:${context.company.supportEmail}" style="color: #dc2626; text-decoration: none; font-weight: 500;">contact our security team</a> immediately.
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
        </div>
      </body>
      </html>
    `;
    }
    getPasswordChangedTemplate(context) {
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
              <div class="header-subtitle">Security Update</div>
            </div>
            
            <div class="content">
              <div class="greeting">Password Updated Successfully</div>
              
              <div class="message">
                Hi ${context.user.firstName}, this is a confirmation that your ${context.company.name} account password was successfully changed.
              </div>
              
              <div class="alert-box alert-success">
                <div class="alert-title">Password Changed Successfully</div>
                <div class="alert-text">Your account security has been updated and all other sessions have been logged out.</div>
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
                    <span class="info-value">${context.security.device || 'Unknown'}</span>
                  </div>
                  <div class="info-row">
                    <span class="info-label">Browser</span>
                    <span class="info-value">${context.security.browser || 'Unknown'}</span>
                  </div>
                  <div class="info-row">
                    <span class="info-label">Location</span>
                    <span class="info-value">${context.security.location || 'Unknown'}</span>
                  </div>
                </div>
              ` : ''}
              
              <div class="message">
                Your password change is now active across all your devices. For security reasons, you've been logged out of all other sessions. You can log back in using your new password.
              </div>
              
              <div class="button-center">
                <a href="${context.company.website}/login" class="button">
                  Sign In Now
                </a>
              </div>
              
              <div class="alert-box alert-error">
                <div class="alert-title">Didn't Make This Change?</div>
                <div class="alert-text">
                  If you didn't change your password, your account may be compromised. 
                  <a href="mailto:${context.company.supportEmail}" style="color: #dc2626; text-decoration: none; font-weight: 500;">Contact our security team immediately</a>.
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
        </div>
      </body>
      </html>
    `;
    }
    getLoginNotificationTemplate(context) {
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
              <div class="header-subtitle">Login Alert</div>
            </div>
            
            <div class="content">
              <div class="greeting">New Login Detected</div>
              
              <div class="message">
                Hi ${context.user.firstName}, we detected a new sign-in to your ${context.company.name} account. If this was you, no action is needed.
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
                    <span class="info-value">${context.security.ipAddress || 'Unknown'}</span>
                  </div>
                </div>
              ` : ''}
              
              <div class="alert-box alert-success">
                <div class="alert-title">Was This You?</div>
                <div class="alert-text">
                  If you recognize this activity, you can safely ignore this email.
                </div>
              </div>
              
              <div class="button-center">
                <a href="${context.company.website}/security/sessions" class="button">
                  Review Account Activity
                </a>
              </div>
              
              <div class="alert-box alert-error">
                <div class="alert-title">Unrecognized Login?</div>
                <div class="alert-text">
                  If you don't recognize this activity:
                  <ul style="margin: 8px 0; padding-left: 20px;">
                    <li>Change your password immediately</li>
                    <li>Review your account activity</li>
                    <li>Enable two-factor authentication</li>
                    <li><a href="mailto:${context.company.supportEmail}" style="color: #dc2626; text-decoration: none; font-weight: 500;">Contact our security team</a></li>
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
        </div>
      </body>
      </html>
    `;
    }
    getSuspiciousActivityTemplate(context) {
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
              <div class="header-subtitle">Security Alert</div>
            </div>
            
            <div class="content">
              <div class="greeting" style="color: #dc2626;">Suspicious Activity Detected</div>
              
              <div class="message">
                <strong>Urgent:</strong> ${context.user.firstName}, we've detected suspicious activity on your ${context.company.name} account that requires your immediate attention.
              </div>
              
              <div class="alert-box alert-error">
                <div class="alert-title">Security Threat Detected</div>
                <div class="alert-text">
                  Multiple failed login attempts or unusual access patterns detected from an unrecognized location.
                </div>
              </div>
              
              ${context.security ? `
                <div class="info-card" style="border-color: #dc2626;">
                  <div class="info-card-header" style="color: #dc2626;">
                    <span class="info-card-icon">🔍</span>
                    Suspicious Activity Details
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
                    <span class="info-value">${context.security.ipAddress || 'Unknown'}</span>
                  </div>
                  <div class="info-row">
                    <span class="info-label">Location</span>
                    <span class="info-value">${context.security.location || 'Unknown Location'}</span>
                  </div>
                </div>
              ` : ''}
              
              <div class="message">
                <strong>Immediate Actions Required:</strong>
              </div>
              
              <ul class="feature-list">
                <li>Change your password immediately</li>
                <li>Enable two-factor authentication if not already active</li>
                <li>Review your recent account activity</li>
                <li>Check for any unauthorized changes</li>
              </ul>
              
              <div class="button-center">
                <a href="${context.company.website}/security/change-password" class="button" style="background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%);">
                  Secure My Account Now
                </a>
              </div>
              
              <div class="alert-box alert-error">
                <div class="alert-title">Need Immediate Help?</div>
                <div class="alert-text">
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
        </div>
      </body>
      </html>
    `;
    }
    getAccountStatusTemplate(context, status) {
        const isSuspended = status === 'suspended';
        const headerClass = isSuspended ? 'header-critical' : '';
        const title = isSuspended ? 'Account Suspended' : 'Account Reactivated';
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
                Hi ${context.user.firstName}, this is an important update regarding your ${context.company.name} account status.
              </div>
              
              ${isSuspended ? `
                <div class="alert-box alert-error">
                  <div class="alert-title">Account Suspended</div>
                  <div class="alert-text">
                    Your account has been temporarily suspended due to security concerns or policy violations.
                  </div>
                </div>
                
                <div class="message">
                  <strong>What this means:</strong>
                </div>
                
                <ul class="feature-list" style="color: #6b7280;">
                  <li style="color: #6b7280;">You cannot access your account or its features</li>
                  <li style="color: #6b7280;">All active sessions have been terminated</li>
                  <li style="color: #6b7280;">Your data remains secure and protected</li>
                </ul>
                
                <div class="button-center">
                  <a href="${context.company.website}/appeal" class="button" style="background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%);">
                    Submit Appeal
                  </a>
                </div>
              ` : `
                <div class="alert-box alert-success">
                  <div class="alert-title">Welcome Back!</div>
                  <div class="alert-text">
                    Your account has been successfully reactivated and you can now access all features.
                  </div>
                </div>
                
                <div class="message">
                  <strong>You can now:</strong>
                </div>
                
                <ul class="feature-list">
                  <li>Access your full account and all features</li>
                  <li>Continue where you left off</li>
                  <li>Enjoy the complete ${context.company.name} experience</li>
                </ul>
                
                <div class="button-center">
                  <a href="${context.company.website}/login" class="button">
                    Access Your Account
                  </a>
                </div>
              `}
              
              <div class="divider"></div>
              
              <div style="text-align: center; color: #6b7280;">
                <p>Questions about your account status?</p>
                <p style="margin-top: 8px;">
                  <a href="mailto:${context.company.supportEmail}" style="color: #083A85; text-decoration: none; font-weight: 500;">Contact Support Team</a>
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
        </div>
      </body>
      </html>
    `;
    }
    getProfileUpdateTemplate(context) {
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
              <div class="header-subtitle">Profile Update</div>
            </div>
            
            <div class="content">
              <div class="greeting">Profile Updated Successfully</div>
              
              <div class="message">
                Hi ${context.user.firstName}, your ${context.company.name} profile has been successfully updated with your recent changes.
              </div>
              
              <div class="alert-box alert-success">
                <div class="alert-title">Changes Saved Successfully</div>
                <div class="alert-text">Your profile information has been updated and is now active across all services.</div>
              </div>
              
              ${context.security ? `
                <div class="info-card">
                  <div class="info-card-header">
                    <span class="info-card-icon">📊</span>
                    Update Details
                  </div>
                  <div class="info-row">
                    <span class="info-label">Updated</span>
                    <span class="info-value">${new Date(context.security.timestamp).toLocaleString()}</span>
                  </div>
                  <div class="info-row">
                    <span class="info-label">Device</span>
                    <span class="info-value">${context.security.device || 'Unknown'}</span>
                  </div>
                  <div class="info-row">
                    <span class="info-label">Location</span>
                    <span class="info-value">${context.security.location || 'Unknown'}</span>
                  </div>
                </div>
              ` : ''}
              
              <div class="message">
                Your updated information is now active across all ${context.company.name} services. If you need to make additional changes, you can always update your profile from your account settings.
              </div>
              
              <div class="button-center">
                <a href="${context.company.website}/profile" class="button">
                  View Profile
                </a>
              </div>
              
              <div class="info-card" style="background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); border-color: #0ea5e9;">
                <div class="info-card-header" style="color: #0369a1;">
                  <span class="info-card-icon">💡</span>
                  Pro Tip
                </div>
                <div style="color: #0c4a6e; font-size: 14px; line-height: 1.5;">
                  Keep your profile information up to date to get the most personalized experience from ${context.company.name}.
                </div>
              </div>
              
              <div style="text-align: center; color: #6b7280; margin-top: 24px;">
                <p>Didn't make these changes?</p>
                <p style="margin-top: 4px;">
                  <a href="mailto:${context.company.supportEmail}" style="color: #083A85; text-decoration: none; font-weight: 500;">Report unauthorized changes</a>
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
        </div>
      </body>
      </html>
    `;
    }
    // --- TEXT TEMPLATES FOR FALLBACK ---
    getWelcomeTextTemplate(context) {
        return `
Welcome to ${context.company.name}, ${context.user.firstName}!

We're thrilled to have you join our community. Your account has been successfully created and you're now part of something extraordinary.

Start your journey: ${context.company.website}/dashboard

Need help? Visit our support center: ${context.company.website}/support

© ${new Date().getFullYear()} ${context.company.name}
This email was sent to ${context.user.email}
    `.trim();
    }
    getEmailVerificationTextTemplate(context) {
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
    getPasswordResetTextTemplate(context) {
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
    getPasswordChangedTextTemplate(context) {
        return `
Password Changed - ${context.company.name}

Hi ${context.user.firstName}, your password was successfully changed.

Changed: ${context.security?.timestamp ? new Date(context.security.timestamp).toLocaleString() : 'Recently'}

If you didn't make this change, contact security immediately at ${context.company.supportEmail}.

Sign in: ${context.company.website}/login

© ${new Date().getFullYear()} ${context.company.name}
    `.trim();
    }
    getLoginNotificationTextTemplate(context) {
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
    getSuspiciousActivityTextTemplate(context) {
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
    getAccountStatusTextTemplate(context, status) {
        const action = status === 'suspended' ? 'suspended' : 'reactivated';
        const url = status === 'suspended' ? '/appeal' : '/login';
        return `
Account ${action.toUpperCase()} - ${context.company.name}

Hi ${context.user.firstName}, your account has been ${action}.

${status === 'suspended'
            ? `Your account access has been temporarily restricted. Submit an appeal: ${context.company.website}${url}`
            : `Welcome back! Your account is now active. Sign in: ${context.company.website}${url}`}

Questions? Contact support: ${context.company.supportEmail}

© ${new Date().getFullYear()} ${context.company.name}
    `.trim();
    }
    getProfileUpdateTextTemplate(context) {
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
exports.BrevoMailingService = BrevoMailingService;
