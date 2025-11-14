// src/services/whatsapp.service.ts - WhatsApp OTP Service using Brevo

import axios from 'axios';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { PhoneUtils } from '../utils/phone.utils';

const prisma = new PrismaClient();

interface OTPData {
  otp: string;
  expiryTime: number;
  attempts: number;
  phoneNumber: string;
  amount: number;
  messageId?: string;
  userId: number;
}

export class BrevoWhatsAppService {
  private apiKey: string;
  private baseURL: string = 'https://api.brevo.com/v3';
  private senderNumber: string;
  private otpStorage: Map<string, OTPData> = new Map();

  // WhatsApp Template IDs - These must be created and approved in Brevo
  private templateIds = {
    withdrawalOTP: process.env.BREVO_WHATSAPP_WITHDRAWAL_OTP_TEMPLATE_ID || '',
    transactionStatus: process.env.BREVO_WHATSAPP_TRANSACTION_STATUS_TEMPLATE_ID || '',
    generalNotification: process.env.BREVO_WHATSAPP_NOTIFICATION_TEMPLATE_ID || '',
  };

  constructor() {
    this.apiKey = process.env.BREVO_WHATSAPP_API_KEY || process.env.BREVO_SMS_API_KEY!;
    this.senderNumber = process.env.BREVO_WHATSAPP_SENDER_NUMBER || '';

    if (!this.apiKey) {
      throw new Error('BREVO_WHATSAPP_API_KEY or BREVO_SMS_API_KEY environment variable is required');
    }

    if (!this.senderNumber) {
      console.warn('⚠️  BREVO_WHATSAPP_SENDER_NUMBER not set. WhatsApp messages may fail.');
    }
  }

  /**
   * Generate 6-digit OTP
   */
  private generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Send WhatsApp message via Brevo API
   */
  private async sendWhatsApp(
    phoneNumber: string,
    templateId: string,
    params?: Record<string, string>
  ): Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
  }> {
    try {
      const requestBody: any = {
        contactNumbers: [phoneNumber],
        templateId: parseInt(templateId),
        senderNumber: this.senderNumber
      };

      // Add template parameters if provided
      if (params && Object.keys(params).length > 0) {
        requestBody.params = params;
      }

      console.log('📱 Sending WhatsApp message:', {
        recipient: phoneNumber,
        templateId,
        params
      });

      const response = await axios.post(
        `${this.baseURL}/whatsapp/sendMessage`,
        requestBody,
        {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'api-key': this.apiKey
          }
        }
      );

      console.log('✅ WhatsApp message sent successfully:', response.data);

      return {
        success: true,
        messageId: response.data.reference || response.data.messageId || response.data.id
      };
    } catch (error: any) {
      console.error('❌ Brevo WhatsApp Error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to send WhatsApp message'
      };
    }
  }

  /**
   * Fallback: Send plain message (for templates without parameters)
   * Note: WhatsApp requires approved templates, so this is limited
   */
  private async sendWhatsAppFallback(phoneNumber: string, message: string): Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
  }> {
    // WhatsApp requires templates, so we use general notification template
    // The message will be sent as a parameter to the template
    return this.sendWhatsApp(
      phoneNumber,
      this.templateIds.generalNotification,
      { message }
    );
  }


  /**
   * Send withdrawal OTP - ONLY to registered phone number in database
   */
  async sendWithdrawalOTP(
    userId: number,
    registeredPhoneNumber: string, // This MUST be the phone from user's database record
    amount: number,
    currency: string = 'RWF'
  ): Promise<{
    success: boolean;
    message: string;
    messageId?: string;
    expiresIn?: number;
    otp?: string; // INTERNAL USE ONLY - for sending to email
  }> {
    try {
      // SECURITY: Validate that we have a registered phone number
      if (!registeredPhoneNumber || registeredPhoneNumber.trim() === '') {
        return {
          success: false,
          message: 'No registered phone number found for this user'
        };
      }

      // Additional validation: Fetch user from database to double-check phone number
      const userFromDB = await prisma.user.findUnique({
        where: { id: userId },
        select: { phone: true, firstName: true, lastName: true }
      });

      if (!userFromDB || !userFromDB.phone) {
        return {
          success: false,
          message: 'User has no registered phone number in database'
        };
      }

      // SECURITY: Ensure the provided phone matches the database record
      if (userFromDB.phone !== registeredPhoneNumber) {
        console.error(`Phone mismatch for user ${userId}: provided ${registeredPhoneNumber}, database ${userFromDB.phone}`);
        return {
          success: false,
          message: 'Phone number validation failed'
        };
      }

      // Check rate limiting
      const rateLimitKey = `rate_limit_${userId}`;
      const lastSent = this.otpStorage.get(rateLimitKey);
      
      if (lastSent && (Date.now() - (lastSent.expiryTime - 300000)) < 60000) {
        return {
          success: false,
          message: 'Please wait before requesting another OTP'
        };
      }

      // Generate OTP
      const otp = this.generateOTP();
      const expiryTime = Date.now() + (5 * 60 * 1000); // 5 minutes

      // Validate and format the REGISTERED phone number
      const phoneValidation = PhoneUtils.validateRwandaPhone(registeredPhoneNumber);

      if (!phoneValidation.isValid) {
        console.error(`Invalid phone number for user ${userId}: ${registeredPhoneNumber}. Error: ${phoneValidation.error}`);
        return {
          success: false,
          message: `Invalid phone number format: ${phoneValidation.error}. Please update your phone number in your profile.`
        };
      }

      const formattedPhone = phoneValidation.formattedPhone!;

      // Prepare WhatsApp template parameters
      const userName = userFromDB.firstName || 'User';
      const templateParams = {
        FNAME: userName,
        OTP: otp,
        AMOUNT: amount.toString(),
        CURRENCY: currency,
        EXPIRY: '5 minutes'
      };

      // Send WhatsApp message to REGISTERED phone number only using template
      const whatsappResult = await this.sendWhatsApp(
        formattedPhone,
        this.templateIds.withdrawalOTP,
        templateParams
      );

      if (whatsappResult.success) {
        // Store OTP
        const otpKey = `withdrawal_${userId}`;
        this.otpStorage.set(otpKey, {
          otp,
          expiryTime,
          attempts: 0,
          phoneNumber: formattedPhone,
          amount,
          messageId: whatsappResult.messageId,
          userId
        });

        // Store rate limit info
        this.otpStorage.set(rateLimitKey, {
          otp: '',
          expiryTime,
          attempts: 0,
          phoneNumber: formattedPhone,
          amount: 0,
          userId
        });

        // Log OTP attempt in database with registered phone confirmation
        try {
          await prisma.$executeRaw`
            INSERT INTO sms_logs ("userId", "phoneNumber", "messageType", status, metadata, "createdAt")
            VALUES (${userId}, ${formattedPhone}, 'withdrawal_otp_whatsapp', 'sent', ${JSON.stringify({
              amount,
              currency,
              phoneVerified: 'database_registered',
              channel: 'whatsapp'
            })}, NOW())
          `;
        } catch (dbError) {
          console.error('Failed to log WhatsApp message:', dbError);
          // Don't fail the main operation
        }

        return {
          success: true,
          message: 'OTP sent to your registered WhatsApp number',
          messageId: whatsappResult.messageId,
          expiresIn: 300, // 5 minutes in seconds
          otp: otp // INTERNAL USE ONLY - for sending to email
        };
      } else {
        // WhatsApp failed, but still store OTP for email fallback
        const otpKey = `withdrawal_${userId}`;
        this.otpStorage.set(otpKey, {
          otp,
          expiryTime,
          attempts: 0,
          phoneNumber: formattedPhone,
          amount,
          userId
        });

        // Store rate limit info
        this.otpStorage.set(rateLimitKey, {
          otp: '',
          expiryTime,
          attempts: 0,
          phoneNumber: formattedPhone,
          amount: 0,
          userId
        });

        // Log failed WhatsApp attempt
        try {
          await prisma.$executeRaw`
            INSERT INTO sms_logs ("userId", "phoneNumber", "messageType", status, metadata, "createdAt")
            VALUES (${userId}, ${formattedPhone}, 'withdrawal_otp_whatsapp', 'failed', ${JSON.stringify({
              amount,
              currency,
              error: whatsappResult.error,
              fallbackToEmail: true,
              channel: 'whatsapp'
            })}, NOW())
          `;
        } catch (dbError) {
          console.error('Failed to log WhatsApp message:', dbError);
        }

        return {
          success: false,
          message: whatsappResult.error || 'Failed to send OTP to registered WhatsApp number',
          otp: otp, // Return OTP for email fallback
          expiresIn: 300
        };
      }
    } catch (error: any) {
      console.error('Send withdrawal OTP error:', error);
      return {
        success: false,
        message: 'Failed to send withdrawal OTP'
      };
    }
  }

  /**
   * Verify withdrawal OTP
   */
  async verifyWithdrawalOTP(
    userId: number, 
    otp: string, 
    amount: number
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const otpKey = `withdrawal_${userId}`;
      const storedOTP = this.otpStorage.get(otpKey);

      if (!storedOTP) {
        return {
          success: false,
          message: 'No OTP found. Please request a new one.'
        };
      }

      // Check expiry
      if (Date.now() > storedOTP.expiryTime) {
        this.otpStorage.delete(otpKey);
        return {
          success: false,
          message: 'OTP has expired. Please request a new one.'
        };
      }

      // Check attempts
      if (storedOTP.attempts >= 3) {
        this.otpStorage.delete(otpKey);
        return {
          success: false,
          message: 'Too many failed attempts. Please request a new OTP.'
        };
      }

      // Verify OTP
      if (storedOTP.otp !== otp) {
        storedOTP.attempts++;
        return {
          success: false,
          message: `Invalid OTP. ${3 - storedOTP.attempts} attempts remaining.`
        };
      }

      // Verify amount matches
      if (Math.abs(storedOTP.amount - amount) > 0.01) {
        this.otpStorage.delete(otpKey);
        return {
          success: false,
          message: 'Amount mismatch. Please try again.'
        };
      }

      // Success - cleanup
      this.otpStorage.delete(otpKey);
      
      return {
        success: true,
        message: 'OTP verified successfully'
      };
    } catch (error: any) {
      console.error('OTP verification error:', error);
      return {
        success: false,
        message: 'OTP verification failed'
      };
    }
  }

  /**
   * Resend withdrawal OTP with rate limiting
   */
  async resendWithdrawalOTP(
    userId: number,
    phoneNumber: string,
    amount: number,
    currency: string = 'RWF'
  ): Promise<{
    success: boolean;
    message: string;
    messageId?: string;
    expiresIn?: number;
    otp?: string; // INTERNAL USE ONLY - for sending to email
  }> {
    const otpKey = `withdrawal_${userId}`;
    const storedOTP = this.otpStorage.get(otpKey);

    // Rate limiting - allow resend only after 1 minute
    if (storedOTP && (Date.now() - (storedOTP.expiryTime - 300000)) < 60000) {
      return {
        success: false,
        message: 'Please wait before requesting another OTP'
      };
    }

    return this.sendWithdrawalOTP(userId, phoneNumber, amount, currency);
  }

  /**
   * Clean expired OTPs (call this periodically)
   */
  cleanExpiredOTPs(): void {
    const now = Date.now();
    for (const [key, value] of this.otpStorage.entries()) {
      if (now > value.expiryTime) {
        this.otpStorage.delete(key);
      }
    }
  }

  /**
   * Send general notification WhatsApp message
   */
  async sendNotificationSMS(
    phoneNumber: string,
    message: string
  ): Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
  }> {
    const phoneValidation = PhoneUtils.validateRwandaPhone(phoneNumber);

    if (!phoneValidation.isValid) {
      console.error(`Invalid phone number for notification: ${phoneNumber}. Error: ${phoneValidation.error}`);
      return {
        success: false,
        error: `Invalid phone number: ${phoneValidation.error}`
      };
    }

    // Use general notification template with message parameter
    return this.sendWhatsApp(
      phoneValidation.formattedPhone!,
      this.templateIds.generalNotification,
      { MESSAGE: message }
    );
  }

  /**
   * Send transaction status WhatsApp message
   */
  async sendTransactionStatusSMS(
    userId: number,
    phoneNumber: string,
    transactionType: string,
    amount: number,
    currency: string,
    status: string
  ): Promise<void> {
    try {
      const phoneValidation = PhoneUtils.validateRwandaPhone(phoneNumber);

      if (!phoneValidation.isValid) {
        console.error(`Invalid phone number: ${phoneNumber}`);
        return;
      }

      // Use transaction status template with parameters
      const templateParams = {
        TRANSACTION_TYPE: transactionType.charAt(0).toUpperCase() + transactionType.slice(1),
        AMOUNT: amount.toString(),
        CURRENCY: currency,
        STATUS: status.toUpperCase()
      };

      await this.sendWhatsApp(
        phoneValidation.formattedPhone!,
        this.templateIds.transactionStatus,
        templateParams
      );
    } catch (error) {
      console.error('Failed to send transaction status WhatsApp message:', error);
    }
  }

  /**
   * Get OTP statistics for monitoring
   */
  getOTPStats(): {
    activeOTPs: number;
    totalStorage: number;
  } {
    return {
      activeOTPs: this.otpStorage.size,
      totalStorage: this.otpStorage.size
    };
  }
}

// Cleanup expired OTPs every 10 minutes
const whatsappService = new BrevoWhatsAppService();
setInterval(() => {
  whatsappService.cleanExpiredOTPs();
}, 10 * 60 * 1000);

// Export as smsService for backward compatibility
export default whatsappService;
export const smsService = whatsappService;