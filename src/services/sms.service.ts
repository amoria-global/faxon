// src/services/sms.service.ts - SMS OTP Service using Brevo

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

export class BrevoSMSService {
  private apiKey: string;
  private baseURL: string = 'https://api.brevo.com/v3';
  private otpStorage: Map<string, OTPData> = new Map();

  constructor() {
    this.apiKey = process.env.BREVO_SMS_API_KEY!;
    
    if (!this.apiKey) {
      throw new Error('BREVO_SMS_API_KEY environment variable is required');
    }
  }

  /**
   * Generate 6-digit OTP
   */
  private generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Send SMS via Brevo API
   */
  private async sendSMS(phoneNumber: string, message: string): Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
  }> {
    try {
      const response = await axios.post(
        `${this.baseURL}/transactionalSMS/sms`,
        {
          sender: 'Jambolush', // Sender name (up to 11 chars)
          recipient: phoneNumber,
          content: message,
          type: 'transactional'
        },
        {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'api-key': this.apiKey
          }
        }
      );

      return {
        success: true,
        messageId: response.data.reference || response.data.messageId
      };
    } catch (error: any) {
      console.error('Brevo SMS Error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to send SMS'
      };
    }
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

      // Create SMS message with user's name for personalization
      const userName = userFromDB.firstName || 'User';
      const message = `Hi ${userName}, your Jambolush withdrawal verification code is ${otp}. Amount: ${amount} ${currency}. Code expires in 5 minutes. Do not share this code.`;

      // Send SMS to REGISTERED phone number only
      const smsResult = await this.sendSMS(formattedPhone, message);

      if (smsResult.success) {
        // Store OTP
        const otpKey = `withdrawal_${userId}`;
        this.otpStorage.set(otpKey, {
          otp,
          expiryTime,
          attempts: 0,
          phoneNumber: formattedPhone,
          amount,
          messageId: smsResult.messageId,
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
            INSERT INTO sms_logs (user_id, phone_number, message_type, status, metadata, created_at)
            VALUES (${userId}, ${formattedPhone}, 'withdrawal_otp', 'sent', ${JSON.stringify({
              amount,
              currency,
              phoneVerified: 'database_registered'
            })}, NOW())
          `;
        } catch (dbError) {
          console.error('Failed to log SMS:', dbError);
          // Don't fail the main operation
        }

        return {
          success: true,
          message: 'OTP sent to your registered phone number',
          messageId: smsResult.messageId,
          expiresIn: 300, // 5 minutes in seconds
          otp: otp // INTERNAL USE ONLY - for sending to email
        };
      } else {
        // SMS failed, but still store OTP for email fallback
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

        // Log failed SMS attempt
        try {
          await prisma.$executeRaw`
            INSERT INTO sms_logs (user_id, phone_number, message_type, status, metadata, created_at)
            VALUES (${userId}, ${formattedPhone}, 'withdrawal_otp', 'failed', ${JSON.stringify({
              amount,
              currency,
              error: smsResult.error,
              fallbackToEmail: true
            })}, NOW())
          `;
        } catch (dbError) {
          console.error('Failed to log SMS:', dbError);
        }

        return {
          success: false,
          message: smsResult.error || 'Failed to send OTP to registered phone number',
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
   * Send general notification SMS
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

    return this.sendSMS(phoneValidation.formattedPhone!, `Jambolush: ${message}`);
  }

  /**
   * Send transaction status SMS
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
      let message = '';
      
      switch (status.toLowerCase()) {
        case 'completed':
        case 'success':
          message = `Your ${transactionType} of ${amount} ${currency} has been completed successfully.`;
          break;
        case 'failed':
          message = `Your ${transactionType} of ${amount} ${currency} has failed. Please contact support.`;
          break;
        case 'pending':
          message = `Your ${transactionType} of ${amount} ${currency} is being processed.`;
          break;
        default:
          message = `Your ${transactionType} of ${amount} ${currency} status: ${status}`;
      }

      await this.sendNotificationSMS(phoneNumber, message);
    } catch (error) {
      console.error('Failed to send transaction status SMS:', error);
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
const smsService = new BrevoSMSService();
setInterval(() => {
  smsService.cleanExpiredOTPs();
}, 10 * 60 * 1000);

export default smsService;