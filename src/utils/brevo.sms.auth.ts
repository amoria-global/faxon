import axios from 'axios';
import { config } from '../config/config';
import { PhoneUtils } from './phone.utils';

interface BrevoWhatsAppContact {
  number: string;
  attributes?: {
    FIRSTNAME?: string;
    LASTNAME?: string;
    EMAIL?: string;
  };
}

// For backward compatibility
type BrevoSMSContact = BrevoWhatsAppContact;

interface WhatsAppContext {
  user: {
    firstName: string;
    lastName: string;
    phone: string;
    phoneCountryCode?: string;
    id: number;
  };
  company: {
    name: string;
    website: string;
    supportPhone?: string;
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

// For backward compatibility
type SMSContext = WhatsAppContext;

export class BrevoWhatsAppAuthService {
  private apiKey: string;
  private apiUrl = 'https://api.brevo.com/v3';
  private senderNumber: string;
  private defaultSender: string;

  // WhatsApp Template IDs for authentication messages
  private templateIds = {
    welcome: process.env.BREVO_WHATSAPP_WELCOME_TEMPLATE_ID || '',
    phoneVerification: process.env.BREVO_WHATSAPP_PHONE_VERIFICATION_TEMPLATE_ID || '',
    passwordReset: process.env.BREVO_WHATSAPP_PASSWORD_RESET_TEMPLATE_ID || '',
    passwordChanged: process.env.BREVO_WHATSAPP_PASSWORD_CHANGED_TEMPLATE_ID || '',
    loginNotification: process.env.BREVO_WHATSAPP_LOGIN_NOTIFICATION_TEMPLATE_ID || '',
    suspiciousActivity: process.env.BREVO_WHATSAPP_SUSPICIOUS_ACTIVITY_TEMPLATE_ID || '',
    accountStatus: process.env.BREVO_WHATSAPP_ACCOUNT_STATUS_TEMPLATE_ID || '',
    twoFactor: process.env.BREVO_WHATSAPP_TWO_FACTOR_TEMPLATE_ID || '',
    kycStatus: process.env.BREVO_WHATSAPP_KYC_STATUS_TEMPLATE_ID || '',
  };

  constructor() {
    this.apiKey = config.notifications.sms.apiKey;
    this.senderNumber = process.env.BREVO_WHATSAPP_SENDER_NUMBER || '';
    this.defaultSender = process.env.BREVO_SMS_SENDER || 'Jambolush';

    if (!this.apiKey) {
      console.error('❌ CRITICAL: Brevo API key is missing!');
      console.error('Please check your config file for notifications.sms.apiKey or BREVO_WHATSAPP_API_KEY');
    }

    if (!this.senderNumber) {
      console.warn('⚠️  BREVO_WHATSAPP_SENDER_NUMBER not set. WhatsApp messages may fail.');
    }
  }

  private async makeRequest(endpoint: string, data: any, method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'POST') {
    try {
      // Validate API key before making request
      if (!this.apiKey || this.apiKey.trim() === '') {
        throw new Error('Brevo API key is missing or empty. Please check your configuration.');
      }

      const requestConfig = {
        method,
        url: `${this.apiUrl}${endpoint}`,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'api-key': this.apiKey.trim()
        },
        data,
        timeout: 30000 // 30 second timeout
      };

      console.log('📤 Making Brevo API request:');
      console.log('- URL:', requestConfig.url);
      console.log('- Method:', requestConfig.method);
      console.log('- Headers:', {
        ...requestConfig.headers,
        'api-key': this.apiKey ? `[${this.apiKey.substring(0, 8)}...]` : 'MISSING'
      });
      console.log('- Request data:', JSON.stringify(data, null, 2));

      const response = await axios(requestConfig);
      
      console.log('📥 Brevo API success response:');
      console.log('- Status:', response.status);
      console.log('- Headers:', response.headers);
      console.log('- Response data:', JSON.stringify(response.data, null, 2));
      
      return response.data;
    } catch (error: any) {
      console.error('❌ Detailed Brevo SMS API Error:');
      console.error('- Error type:', error.constructor.name);
      console.error('- Error message:', error.message);
      
      if (error.response) {
        // Server responded with error status
        console.error('- Response status:', error.response.status);
        console.error('- Response headers:', JSON.stringify(error.response.headers, null, 2));
        console.error('- Response data:', JSON.stringify(error.response.data, null, 2));
        
        // Handle specific Brevo error codes
        const status = error.response.status;
        const responseData = error.response.data;
        
        switch (status) {
          case 400:
            throw new Error(`Bad Request: ${responseData?.message || 'Invalid request parameters'}`);
          case 401:
            throw new Error(`Unauthorized: Invalid API key or authentication failed`);
          case 402:
            throw new Error(`Payment Required: Insufficient credits or account suspended`);
          case 403:
            throw new Error(`Forbidden: Access denied or feature not available`);
          case 404:
            throw new Error(`Not Found: ${responseData?.message || 'Endpoint not found'}`);
          case 429:
            throw new Error(`Rate Limited: ${responseData?.message || 'Too many requests'}`);
          case 500:
            throw new Error(`Server Error: ${responseData?.message || 'Brevo internal server error'}`);
          default:
            throw new Error(`API Error (${status}): ${responseData?.message || error.message}`);
        }
      } else if (error.request) {
        // Request made but no response received
        console.error('- Request config:', JSON.stringify(error.config, null, 2));
        console.error('- No response received from server');
        throw new Error('Network error: No response from Brevo SMS API. Check your internet connection.');
      } else {
        // Error in request setup
        console.error('- Request setup error:', error.message);
        throw new Error(`Request setup error: ${error.message}`);
      }
    }
  }

  // Test API connectivity and credentials
  async testConnection(): Promise<{ success: boolean; message: string; details?: any }> {
    try {
      console.log('🔍 Testing Brevo SMS API connection...');
      
      // Test with account info endpoint
      const response = await this.makeRequest('/account', null, 'GET');
      
      return {
        success: true,
        message: 'Connection successful',
        details: {
          email: response.email,
          companyName: response.companyName,
          plan: response.plan,
          credits: response.plan?.[0]?.credits
        }
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Connection failed: ${error.message}`,
        details: error
      };
    }
  }

  // Enhanced WhatsApp sending with validation
  async sendWhatsAppMessage(
    phoneNumber: string,
    templateId: string,
    params?: Record<string, string>,
    tag?: string
  ): Promise<string> {
    console.log('📱 Preparing to send WhatsApp message...');

    // Validate input data
    if (!phoneNumber) {
      throw new Error('Recipient phone number is required');
    }

    if (!templateId) {
      throw new Error('Template ID is required for WhatsApp messages');
    }

    // Validate phone number format
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    if (!phoneRegex.test(phoneNumber)) {
      throw new Error(`Invalid phone number format: ${phoneNumber}. Must be in international format with + prefix.`);
    }

    const requestData: any = {
      contactNumbers: [phoneNumber],
      templateId: parseInt(templateId),
      senderNumber: this.senderNumber
    };

    // Add template parameters if provided
    if (params && Object.keys(params).length > 0) {
      requestData.params = params;
    }

    // Add tag if provided
    if (tag) {
      requestData.tag = tag;
    }

    console.log('📤 Final WhatsApp request data:', JSON.stringify(requestData, null, 2));

    const response = await this.makeRequest('/whatsapp/sendMessage', requestData);

    console.log('✅ WhatsApp message sent successfully, reference:', response.reference || response.id);
    return response.reference || response.id;
  }

  // Keep legacy method for backward compatibility
  async sendTransactionalSMS(smsData: any): Promise<string> {
    // Convert old SMS format to WhatsApp template format
    // This is a fallback - ideally all calls should be updated to use sendWhatsAppMessage
    console.warn('⚠️  sendTransactionalSMS is deprecated. Please use sendWhatsAppMessage with templates.');

    // Try to send using a general template
    const generalTemplateId = process.env.BREVO_WHATSAPP_GENERAL_TEMPLATE_ID || '';
    if (!generalTemplateId) {
      throw new Error('General WhatsApp template not configured. Please set BREVO_WHATSAPP_GENERAL_TEMPLATE_ID');
    }

    return this.sendWhatsAppMessage(
      smsData.recipient,
      generalTemplateId,
      { MESSAGE: smsData.content },
      smsData.tag
    );
  }

  // Test method with detailed debugging
  async sendTestSMS(phoneNumber: string, message?: string): Promise<{ success: boolean; reference?: string; error?: string }> {
    try {
      console.log('🧪 Starting SMS test...');
      
      // First test API connection
      const connectionTest = await this.testConnection();
      if (!connectionTest.success) {
        throw new Error(`API connection failed: ${connectionTest.message}`);
      }
      
      console.log('✅ API connection successful');
      
      // Format phone number
      const formattedPhone = PhoneUtils.formatPhone(phoneNumber, true);
      console.log('📞 Formatted phone number:', formattedPhone);
      
      // Default test message
      const testMessage = message || `Test SMS from ${this.defaultSender} at ${new Date().toLocaleTimeString()}. If you receive this, SMS is working correctly!`;
      
      // Send SMS
      const reference = await this.sendTransactionalSMS({
        sender: this.defaultSender,
        recipient: formattedPhone,
        content: testMessage,
        type: 'transactional',
        tag: 'test'
      });
      
      return {
        success: true,
        reference
      };
      
    } catch (error: any) {
      console.error('❌ SMS test failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // --- CONTACT MANAGEMENT ---
  async createOrUpdateSMSContact(contact: BrevoSMSContact): Promise<void> {
    await this.makeRequest('/contacts', {
      ...contact,
      updateEnabled: true
    }, 'POST');
  }

  // --- AUTHENTICATION WHATSAPP METHODS ---

  async sendWelcomeSMS(context: WhatsAppContext): Promise<void> {
    if (!context.user.phone) return;

    const phoneNumber = PhoneUtils.formatPhone(context.user.phone, true);

    await this.sendWhatsAppMessage(
      phoneNumber,
      this.templateIds.welcome,
      {
        FNAME: context.user.firstName,
        COMPANY_NAME: context.company.name
      },
      'welcome'
    );
    console.log(`Welcome WhatsApp message sent to ${phoneNumber}`);
  }

  async sendPhoneVerificationSMS(context: WhatsAppContext): Promise<void> {
    if (!context.user.phone || !context.verification) return;

    const phoneNumber = PhoneUtils.formatPhone(context.user.phone, true);

    await this.sendWhatsAppMessage(
      phoneNumber,
      this.templateIds.phoneVerification,
      {
        COMPANY_NAME: context.company.name,
        CODE: context.verification.code,
        EXPIRES_IN: context.verification.expiresIn
      },
      'phone_verification'
    );
    console.log(`Phone verification WhatsApp message sent to ${phoneNumber}`);
  }

  async sendPasswordResetSMS(context: WhatsAppContext): Promise<void> {
    if (!context.user.phone || !context.verification) return;

    const phoneNumber = PhoneUtils.formatPhone(context.user.phone, true);

    await this.sendWhatsAppMessage(
      phoneNumber,
      this.templateIds.passwordReset,
      {
        COMPANY_NAME: context.company.name,
        CODE: context.verification.code,
        EXPIRES_IN: context.verification.expiresIn
      },
      'password_reset'
    );
    console.log(`Password reset WhatsApp message sent to ${phoneNumber}`);
  }

  async sendPasswordChangedSMS(context: WhatsAppContext): Promise<void> {
    if (!context.user.phone) return;

    const phoneNumber = PhoneUtils.formatPhone(context.user.phone, true);

    const timestamp = context.security?.timestamp
      ? new Date(context.security.timestamp).toLocaleString()
      : 'recently';

    await this.sendWhatsAppMessage(
      phoneNumber,
      this.templateIds.passwordChanged,
      {
        COMPANY_NAME: context.company.name,
        TIMESTAMP: timestamp
      },
      'password_changed'
    );
    console.log(`Password changed SMS sent to ${phoneNumber}`);
  }

  async sendLoginNotificationSMS(context: WhatsAppContext): Promise<void> {
    if (!context.user.phone) return;

    const phoneNumber = PhoneUtils.formatPhone(context.user.phone, true);

    await this.sendWhatsAppMessage(
      phoneNumber,
      this.templateIds.loginNotification,
      {
        COMPANY_NAME: context.company.name,
        DEVICE: context.security?.device?.split(' ')[0] || 'Unknown device',
        LOCATION: context.security?.location || 'Unknown location'
      },
      'login_notification'
    );
    console.log(`Login notification WhatsApp message sent to ${phoneNumber}`);
  }

  async sendSuspiciousActivitySMS(context: WhatsAppContext): Promise<void> {
    if (!context.user.phone) return;

    const phoneNumber = PhoneUtils.formatPhone(context.user.phone, true);

    await this.sendWhatsAppMessage(
      phoneNumber,
      this.templateIds.suspiciousActivity,
      {
        COMPANY_NAME: context.company.name
      },
      'security_alert'
    );
    console.log(`Suspicious activity WhatsApp message sent to ${phoneNumber}`);
  }

  async sendAccountStatusChangeSMS(context: WhatsAppContext, status: 'suspended' | 'reactivated'): Promise<void> {
    if (!context.user.phone) return;

    const phoneNumber = PhoneUtils.formatPhone(context.user.phone, true);

    await this.sendWhatsAppMessage(
      phoneNumber,
      this.templateIds.accountStatus,
      {
        COMPANY_NAME: context.company.name,
        STATUS: status.toUpperCase()
      },
      `account_${status}`
    );
    console.log(`Account ${status} WhatsApp message sent to ${phoneNumber}`);
  }

  async sendTwoFactorSMS(context: WhatsAppContext): Promise<void> {
    if (!context.user.phone || !context.verification) return;

    const phoneNumber = PhoneUtils.formatPhone(context.user.phone, true);

    await this.sendWhatsAppMessage(
      phoneNumber,
      this.templateIds.twoFactor,
      {
        COMPANY_NAME: context.company.name,
        CODE: context.verification.code,
        EXPIRES_IN: context.verification.expiresIn
      },
      'two_factor_auth'
    );
    console.log(`Two-factor authentication WhatsApp message sent to ${phoneNumber}`);
  }

  async sendKYCStatusSMS(context: WhatsAppContext, kycStatus: 'approved' | 'rejected' | 'pending_review'): Promise<void> {
    if (!context.user.phone) return;

    const phoneNumber = PhoneUtils.formatPhone(context.user.phone, true);

    await this.sendWhatsAppMessage(
      phoneNumber,
      this.templateIds.kycStatus,
      {
        COMPANY_NAME: context.company.name,
        STATUS: kycStatus.toUpperCase().replace('_', ' ')
      },
      `kyc_${kycStatus}`
    );
    console.log(`KYC status WhatsApp message sent to ${phoneNumber}`);
  }

  // --- SMS CONTENT TEMPLATES ---

  private getWelcomeSMSContent(context: SMSContext): string {
    return `Welcome to ${context.company.name}, ${context.user.firstName}! Your account is ready. Start exploring: https://jambolush.com`;
  }

  private getPhoneVerificationSMSContent(context: SMSContext): string {
    return `${context.company.name} phone verification code: ${context.verification?.code}. Valid for ${context.verification?.expiresIn}. Don't share this code.`;
  }

  private getPasswordResetSMSContent(context: SMSContext): string {
    return `${context.company.name} password reset code: ${context.verification?.code}. Valid for ${context.verification?.expiresIn}. If you didn't request this, ignore this message.`;
  }

  private getPasswordChangedSMSContent(context: SMSContext): string {
    const time = context.security?.timestamp ? new Date(context.security.timestamp).toLocaleString() : 'recently';
    return `${context.company.name}: Your password was changed on ${time}. If this wasn't you, contact support immediately.`;
  }

  private getLoginNotificationSMSContent(context: SMSContext): string {
    const location = context.security?.location || 'Unknown location';
    const device = context.security?.device?.split(' ')[0] || 'Unknown device';
    return `${context.company.name}: New login from ${device} in ${location}. If this wasn't you, secure your account immediately.`;
  }

  private getSuspiciousActivitySMSContent(context: SMSContext): string {
    return `${context.company.name} SECURITY ALERT: Suspicious activity detected on your account. Change your password immediately: https://jambolush.com/all/forgotpw`;
  }

  private getAccountStatusSMSContent(context: SMSContext, status: 'suspended' | 'reactivated'): string {
    if (status === 'suspended') {
      return `${context.company.name}: Your account has been suspended. Contact support for assistance.`;
    } else {
      return `${context.company.name}: Welcome back! Your account has been reactivated. You can now access all features.`;
    }
  }

  private getTwoFactorSMSContent(context: SMSContext): string {
    return `${context.company.name} security code: ${context.verification?.code}. Valid for ${context.verification?.expiresIn}. Never share this code.`;
  }

  private getKYCStatusSMSContent(context: SMSContext, kycStatus: 'approved' | 'rejected' | 'pending_review'): string {
    switch (kycStatus) {
      case 'approved':
        return `${context.company.name}: Your identity verification has been approved! You now have full access to all features.`;
      case 'rejected':
        return `${context.company.name}: Your identity verification needs attention. Please review and resubmit your documents.`;
      case 'pending_review':
        return `${context.company.name}: Your identity verification is under review. We'll notify you once complete.`;
      default:
        return `${context.company.name}: KYC status update available. Check your account for details.`;
    }
  }

  // --- UTILITY METHODS ---


  private createSMSContext(user: any, security?: any, verification?: any): SMSContext {
    return {
      user: {
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        phoneCountryCode: user.phoneCountryCode,
        id: user.id
      },
      company: {
        name: 'Jambolush',
        website: config.clientUrl || 'https://jambolush.com',
        supportPhone: config.companyPhone || '+250788437347'
      },
      security,
      verification
    };
  }

  // --- BULK WHATSAPP METHODS ---

  async sendBulkSMS(recipients: string[], templateId: string, params?: Record<string, string>, tag?: string): Promise<void> {
    const promises = recipients.map(recipient =>
      this.sendWhatsAppMessage(recipient, templateId, params, tag || 'bulk_message')
    );

    await Promise.all(promises);
    console.log(`Bulk WhatsApp messages sent to ${recipients.length} recipients`);
  }

  // --- WHATSAPP PREFERENCES ---
  async shouldSendSMS(userId: number, smsType: string): Promise<boolean> {
    // This would check user preferences from database
    // For now, return true for all transactional WhatsApp messages
    const transactionalTypes = [
      'phone_verification',
      'password_reset',
      'password_changed',
      'security_alert',
      'two_factor_auth',
      'account_suspended',
      'account_reactivated'
    ];

    return transactionalTypes.includes(smsType);
  }

  // --- ERROR HANDLING & RETRY ---
  async sendWhatsAppWithRetry(
    phoneNumber: string,
    templateId: string,
    params?: Record<string, string>,
    tag?: string,
    maxRetries: number = 3
  ): Promise<string> {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.sendWhatsAppMessage(phoneNumber, templateId, params, tag);
      } catch (error) {
        lastError = error;
        console.error(`WhatsApp send attempt ${attempt} failed:`, error);

        if (attempt < maxRetries) {
          // Wait before retrying (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    throw lastError;
  }

  // Legacy method for backward compatibility
  async sendSMSWithRetry(smsData: any, maxRetries: number = 3): Promise<string> {
    console.warn('⚠️  sendSMSWithRetry is deprecated. Please use sendWhatsAppWithRetry.');
    return this.sendWhatsAppWithRetry(
      smsData.recipient,
      process.env.BREVO_WHATSAPP_GENERAL_TEMPLATE_ID || '',
      { MESSAGE: smsData.content },
      smsData.tag,
      maxRetries
    );
  }
}

// Export with backward compatibility
export const BrevoSMSService = BrevoWhatsAppAuthService;