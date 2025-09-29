import axios from 'axios';
import { config } from '../config/config';

interface BrevoSMSContact {
  number: string;
  attributes?: {
    FIRSTNAME?: string;
    LASTNAME?: string;
    EMAIL?: string;
  };
}

interface BrevoSMSData {
  sender: string;
  recipient: string;
  content: string;
  type?: 'transactional' | 'marketing';
  tag?: string;
  webUrl?: string;
}

interface SMSContext {
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

export class BrevoSMSService {
  private apiKey: string;
  private apiUrl = 'https://api.brevo.com/v3';
  private defaultSender: string;

  constructor() {
    this.apiKey = config.notifications.sms.apiKey;
    this.defaultSender = config.notifications.sms.from || 'Jambolush';
    
    if (!this.apiKey) {
      console.error('❌ CRITICAL: Brevo API key is missing!');
      console.error('Please check your config file for notifications.sms.apiKey');
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

  // Enhanced SMS sending with validation
  async sendTransactionalSMS(smsData: BrevoSMSData): Promise<string> {
    console.log('📱 Preparing to send SMS...');
    
    // Validate input data
    if (!smsData.recipient) {
      throw new Error('Recipient phone number is required');
    }
    
    if (!smsData.content) {
      throw new Error('SMS content is required');
    }
    
    if (smsData.content.length > 160) {
      console.warn(`⚠️ SMS content is ${smsData.content.length} characters (over 160, may be split into multiple messages)`);
    }
    
    // Validate phone number format
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    if (!phoneRegex.test(smsData.recipient)) {
      throw new Error(`Invalid phone number format: ${smsData.recipient}. Must be in international format with + prefix.`);
    }
    
    // Validate sender name (alphanumeric, max 11 chars for some regions)
    const sender = smsData.sender || this.defaultSender;
    if (sender.length > 15) {
      console.warn(`⚠️ Sender name '${sender}' is longer than 15 characters, may be truncated`);
    }
    
    const requestData = {
      sender: sender,
      recipient: smsData.recipient,
      content: smsData.content,
      type: smsData.type || 'transactional',
      tag: smsData.tag,
      webUrl: smsData.webUrl
    };
    
    // Remove undefined values
    Object.keys(requestData).forEach(key => {
      if (requestData[key as keyof typeof requestData] === undefined) {
        delete requestData[key as keyof typeof requestData];
      }
    });
    
    console.log('📤 Final SMS request data:', JSON.stringify(requestData, null, 2));
    
    const response = await this.makeRequest('/transactionalSMS/sms', requestData);
    
    console.log('✅ SMS sent successfully, reference:', response.reference);
    return response.reference;
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
      const formattedPhone = this.formatPhoneNumber(phoneNumber);
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

  // --- AUTHENTICATION SMS METHODS ---

  async sendWelcomeSMS(context: SMSContext): Promise<void> {
    if (!context.user.phone) return;

    const phoneNumber = this.formatPhoneNumber(context.user.phone, context.user.phoneCountryCode);
    const content = this.getWelcomeSMSContent(context);

    const smsData: BrevoSMSData = {
      sender: this.defaultSender,
      recipient: phoneNumber,
      content,
      type: 'transactional',
      tag: 'welcome',
      webUrl: `${context.company.website}/dashboard`
    };

    await this.sendTransactionalSMS(smsData);
    console.log(`Welcome SMS sent to ${phoneNumber}`);
  }

  async sendPhoneVerificationSMS(context: SMSContext): Promise<void> {
    if (!context.user.phone || !context.verification) return;

    const phoneNumber = this.formatPhoneNumber(context.user.phone, context.user.phoneCountryCode);
    const content = this.getPhoneVerificationSMSContent(context);

    const smsData: BrevoSMSData = {
      sender: this.defaultSender,
      recipient: phoneNumber,
      content,
      type: 'transactional',
      tag: 'phone_verification'
    };

    await this.sendTransactionalSMS(smsData);
    console.log(`Phone verification SMS sent to ${phoneNumber}`);
  }

  async sendPasswordResetSMS(context: SMSContext): Promise<void> {
    if (!context.user.phone || !context.verification) return;

    const phoneNumber = this.formatPhoneNumber(context.user.phone, context.user.phoneCountryCode);
    const content = this.getPasswordResetSMSContent(context);

    const smsData: BrevoSMSData = {
      sender: this.defaultSender,
      recipient: phoneNumber,
      content,
      type: 'transactional',
      tag: 'password_reset',
      webUrl: `${context.company.website}/reset-password`
    };

    await this.sendTransactionalSMS(smsData);
    console.log(`Password reset SMS sent to ${phoneNumber}`);
  }

  async sendPasswordChangedSMS(context: SMSContext): Promise<void> {
    if (!context.user.phone) return;

    const phoneNumber = this.formatPhoneNumber(context.user.phone, context.user.phoneCountryCode);
    const content = this.getPasswordChangedSMSContent(context);

    const smsData: BrevoSMSData = {
      sender: this.defaultSender,
      recipient: phoneNumber,
      content,
      type: 'transactional',
      tag: 'password_changed',
      webUrl: `${context.company.website}/security`
    };

    await this.sendTransactionalSMS(smsData);
    console.log(`Password changed SMS sent to ${phoneNumber}`);
  }

  async sendLoginNotificationSMS(context: SMSContext): Promise<void> {
    if (!context.user.phone) return;

    const phoneNumber = this.formatPhoneNumber(context.user.phone, context.user.phoneCountryCode);
    const content = this.getLoginNotificationSMSContent(context);

    const smsData: BrevoSMSData = {
      sender: this.defaultSender,
      recipient: phoneNumber,
      content,
      type: 'transactional',
      tag: 'login_notification',
      webUrl: `${context.company.website}/security/sessions`
    };

    await this.sendTransactionalSMS(smsData);
    console.log(`Login notification SMS sent to ${phoneNumber}`);
  }

  async sendSuspiciousActivitySMS(context: SMSContext): Promise<void> {
    if (!context.user.phone) return;

    const phoneNumber = this.formatPhoneNumber(context.user.phone, context.user.phoneCountryCode);
    const content = this.getSuspiciousActivitySMSContent(context);

    const smsData: BrevoSMSData = {
      sender: this.defaultSender,
      recipient: phoneNumber,
      content,
      type: 'transactional',
      tag: 'security_alert',
      webUrl: `${context.company.website}/security`
    };

    await this.sendTransactionalSMS(smsData);
    console.log(`Suspicious activity SMS sent to ${phoneNumber}`);
  }

  async sendAccountStatusChangeSMS(context: SMSContext, status: 'suspended' | 'reactivated'): Promise<void> {
    if (!context.user.phone) return;

    const phoneNumber = this.formatPhoneNumber(context.user.phone, context.user.phoneCountryCode);
    const content = this.getAccountStatusSMSContent(context, status);

    const smsData: BrevoSMSData = {
      sender: this.defaultSender,
      recipient: phoneNumber,
      content,
      type: 'transactional',
      tag: `account_${status}`,
      webUrl: status === 'suspended' ? `${context.company.website}/appeal` : `${context.company.website}/login`
    };

    await this.sendTransactionalSMS(smsData);
    console.log(`Account ${status} SMS sent to ${phoneNumber}`);
  }

  async sendTwoFactorSMS(context: SMSContext): Promise<void> {
    if (!context.user.phone || !context.verification) return;

    const phoneNumber = this.formatPhoneNumber(context.user.phone, context.user.phoneCountryCode);
    const content = this.getTwoFactorSMSContent(context);

    const smsData: BrevoSMSData = {
      sender: this.defaultSender,
      recipient: phoneNumber,
      content,
      type: 'transactional',
      tag: 'two_factor_auth'
    };

    await this.sendTransactionalSMS(smsData);
    console.log(`Two-factor authentication SMS sent to ${phoneNumber}`);
  }

  async sendKYCStatusSMS(context: SMSContext, kycStatus: 'approved' | 'rejected' | 'pending_review'): Promise<void> {
    if (!context.user.phone) return;

    const phoneNumber = this.formatPhoneNumber(context.user.phone, context.user.phoneCountryCode);
    const content = this.getKYCStatusSMSContent(context, kycStatus);

    const smsData: BrevoSMSData = {
      sender: this.defaultSender,
      recipient: phoneNumber,
      content,
      type: 'transactional',
      tag: `kyc_${kycStatus}`,
      webUrl: `${context.company.website}/kyc`
    };

    await this.sendTransactionalSMS(smsData);
    console.log(`KYC status SMS sent to ${phoneNumber}`);
  }

  // --- SMS CONTENT TEMPLATES ---

  private getWelcomeSMSContent(context: SMSContext): string {
    return `Welcome to ${context.company.name}, ${context.user.firstName}! Your account is ready. Start exploring: ${context.company.website}`;
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
    return `${context.company.name} SECURITY ALERT: Suspicious activity detected on your account. Change your password immediately: ${context.company.website}/security`;
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

  private formatPhoneNumber(phone: string, countryCode?: string): string {
    console.log('📞 Formatting phone number:', { phone, countryCode });
    
    // Remove any non-digit characters except +
    let cleanPhone = phone.replace(/[^\d+]/g, '');
    
    // If phone already starts with +, return as is (assuming it's correct)
    if (cleanPhone.startsWith('+')) {
      console.log('📞 Phone already formatted:', cleanPhone);
      return cleanPhone;
    }
    
    // Remove any leading zeros
    cleanPhone = cleanPhone.replace(/^0+/, '');
    
    // If country code is provided
    if (countryCode) {
      const cleanCountryCode = countryCode.replace(/[^\d]/g, '');
      const formatted = `+${cleanCountryCode}${cleanPhone}`;
      console.log('📞 Phone formatted with country code:', formatted);
      return formatted;
    }
    
    // Default to Rwanda (+250) if no country code and doesn't start with country code
    if (!cleanPhone.startsWith('250')) {
      const formatted = `+250${cleanPhone}`;
      console.log('📞 Phone formatted with default +250:', formatted);
      return formatted;
    }
    
    // Already has 250, just add +
    const formatted = `+${cleanPhone}`;
    console.log('📞 Phone formatted:', formatted);
    return formatted;
  }

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

  // --- BULK SMS METHODS ---

  async sendBulkSMS(recipients: string[], content: string, tag?: string): Promise<void> {
    const promises = recipients.map(recipient => 
      this.sendTransactionalSMS({
        sender: this.defaultSender,
        recipient,
        content,
        type: 'marketing',
        tag: tag || 'bulk_message'
      })
    );

    await Promise.all(promises);
    console.log(`Bulk SMS sent to ${recipients.length} recipients`);
  }

  // --- SMS PREFERENCES ---
  async shouldSendSMS(userId: number, smsType: string): Promise<boolean> {
    // This would check user preferences from database
    // For now, return true for all transactional SMS
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
  async sendSMSWithRetry(smsData: BrevoSMSData, maxRetries: number = 3): Promise<string> {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.sendTransactionalSMS(smsData);
      } catch (error) {
        lastError = error;
        console.error(`SMS send attempt ${attempt} failed:`, error);
        
        if (attempt < maxRetries) {
          // Wait before retrying (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }
     
    throw lastError;
  }
}