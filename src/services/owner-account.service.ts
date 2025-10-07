// src/services/owner-account.service.ts
import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';
import { BrevoBookingMailingService } from '../utils/brevo.booking';

const prisma = new PrismaClient();

interface OwnerDetails {
  names: string;
  email: string;
  phone: string;
  address: string;
}

interface CreateOwnerResult {
  id: number;
  email: string;
  isNewAccount: boolean;
  temporaryPassword?: string;
}

export class OwnerAccountService {
  private emailService = new BrevoBookingMailingService();

  /**
   * Create or get existing owner account
   * If owner doesn't exist, creates a new account and sends notification
   * @param ownerDetails Owner information
   * @returns Owner user record
   */
  async createOrGetOwner(ownerDetails: OwnerDetails): Promise<CreateOwnerResult> {
    // Check if owner already exists by email
    const existingOwner = await prisma.user.findUnique({
      where: { email: ownerDetails.email }
    });

    if (existingOwner) {
      return {
        id: existingOwner.id,
        email: existingOwner.email,
        isNewAccount: false
      };
    }

    // Generate temporary password
    const temporaryPassword = this.generateSecurePassword();
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

    // Extract first and last name from full name
    const nameParts = ownerDetails.names.trim().split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ') || firstName;

    // Extract address components
    const addressParts = this.parseAddress(ownerDetails.address);

    // Create new owner account with status 'pending' and userType 'host'
    const newOwner = await prisma.user.create({
      data: {
        email: ownerDetails.email,
        firstName,
        lastName,
        password: hashedPassword,
        phone: ownerDetails.phone,
        userType: 'host',
        status: 'pending', // Account is pending until they verify
        isVerified: false,
        kycCompleted: false,
        kycStatus: 'pending',
        ...addressParts,
        provider: 'manual'
      }
    });

    // Send notification email to new owner
    await this.sendOwnerWelcomeEmail(newOwner, temporaryPassword);

    return {
      id: newOwner.id,
      email: newOwner.email,
      isNewAccount: true,
      temporaryPassword
    };
  }

  /**
   * Send welcome email to newly created owner
   */
  private async sendOwnerWelcomeEmail(owner: any, temporaryPassword: string): Promise<void> {
    try {
      // You can customize this email template
      const emailContent = {
        to: [{ email: owner.email, name: `${owner.firstName} ${owner.lastName}` }],
        subject: 'Welcome to Jambolush - Your Property Owner Account',
        htmlContent: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
              .content { padding: 20px; background-color: #f9f9f9; }
              .credentials { background-color: #fff; padding: 15px; border-left: 4px solid #4CAF50; margin: 20px 0; }
              .button { display: inline-block; padding: 12px 30px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
              .footer { text-align: center; padding: 20px; font-size: 12px; color: #777; }
              .warning { color: #f44336; font-weight: bold; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Welcome to Jambolush!</h1>
              </div>
              <div class="content">
                <h2>Hello ${owner.firstName},</h2>
                <p>An agent has uploaded a property on your behalf to Jambolush. We've created an account for you to manage your property.</p>

                <div class="credentials">
                  <h3>Your Login Credentials:</h3>
                  <p><strong>Email:</strong> ${owner.email}</p>
                  <p><strong>Temporary Password:</strong> <code>${temporaryPassword}</code></p>
                  <p class="warning">⚠️ Please change this password immediately after your first login.</p>
                </div>

                <h3>Next Steps:</h3>
                <ol>
                  <li><strong>Verify Your Email:</strong> Click the button below to verify your email address</li>
                  <li><strong>Complete Your Profile:</strong> Add your wallet information and complete KYC verification</li>
                  <li><strong>Activate Your Property:</strong> Once verified, your property will be visible to guests</li>
                </ol>

                <p><strong>Important:</strong> Your property will not be displayed on the platform until you:</p>
                <ul>
                  <li>✓ Verify your email address</li>
                  <li>✓ Complete KYC verification</li>
                  <li>✓ Add wallet/payment information</li>
                  <li>✓ Activate your account</li>
                </ul>

                <div style="text-align: center;">
                  <a href="https://jambolush.com/auth/login" class="button">Login to Your Account</a>
                </div>

                <p>If you have any questions or didn't request this account, please contact our support team.</p>
              </div>
              <div class="footer">
                <p>© 2024 Jambolush. All rights reserved.</p>
                <p>Support: support@jambolush.com</p>
              </div>
            </div>
          </body>
          </html>
        `
      };

      // Send via Brevo API
      const Sib = require('@getbrevo/brevo');
      const apiInstance = new Sib.TransactionalEmailsApi();
      apiInstance.setApiKey(
        Sib.TransactionalEmailsApiApiKeys.apiKey,
        process.env.BREVO_API_KEY!
      );

      await apiInstance.sendTransacEmail(emailContent);
      console.log(`Welcome email sent to owner: ${owner.email}`);
    } catch (error) {
      console.error('Failed to send owner welcome email:', error);
      // Don't throw - we don't want to fail account creation if email fails
    }
  }

  /**
   * Generate a secure temporary password
   */
  private generateSecurePassword(): string {
    const length = 12;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    const randomBytes = crypto.randomBytes(length);

    for (let i = 0; i < length; i++) {
      password += charset[randomBytes[i] % charset.length];
    }

    return password;
  }

  /**
   * Parse address string into components
   */
  private parseAddress(address: string): any {
    // Basic address parsing - you can enhance this based on your address format
    const parts = address.split(',').map(p => p.trim());

    return {
      street: parts[0] || null,
      city: parts[1] || null,
      state: parts[2] || null,
      country: parts[3] || null
    };
  }

  /**
   * Check if owner account is ready for property display
   * Property should not be displayed if owner:
   * - Has no wallet
   * - Has incomplete KYC
   * - Account is not active
   */
  async isOwnerReadyForDisplay(hostId: number): Promise<boolean> {
    const owner = await prisma.user.findUnique({
      where: { id: hostId },
      include: {
        wallet: true
      }
    });

    if (!owner) {
      return false;
    }

    // Check all required conditions
    const hasWallet = owner.wallet !== null && owner.wallet.isActive;
    const hasCompletedKyc = owner.kycCompleted && owner.kycStatus === 'approved';
    const isAccountActive = owner.status === 'active' && owner.isVerified;

    return hasWallet && hasCompletedKyc && isAccountActive;
  }

  /**
   * Get owner verification status
   */
  async getOwnerVerificationStatus(hostId: number) {
    const owner = await prisma.user.findUnique({
      where: { id: hostId },
      include: {
        wallet: true
      }
    });

    if (!owner) {
      throw new Error('Owner not found');
    }

    return {
      hasWallet: owner.wallet !== null && owner.wallet.isActive,
      hasCompletedKyc: owner.kycCompleted && owner.kycStatus === 'approved',
      isAccountActive: owner.status === 'active' && owner.isVerified,
      kycStatus: owner.kycStatus,
      accountStatus: owner.status,
      isReadyForDisplay: await this.isOwnerReadyForDisplay(hostId)
    };
  }
}
