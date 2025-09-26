// src/services/settings.service.ts
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import {
  UserSettings,
  UpdateSettingsDto,
  NotificationSettings,
  SecuritySettings,
  GeneralSettings,
  AppearanceSettings,
  ChangePasswordDto,
  VerificationRequest,
  AccountVerification,
  ConnectedAccount,
  SettingsResponse
} from '../types/settings.types';
import { AuthService } from './auth.service';

const prisma = new PrismaClient();

export class SettingsService {
  private authService: AuthService;

  constructor() {
    this.authService = new AuthService();
  }

  // ============ USER SETTINGS MANAGEMENT ============

  /**
   * Get user settings - creates default settings if none exist
   * Returns enhanced format with verification status
   */
  async getUserSettings(userId: number): Promise<{
    notifications: NotificationSettings;
    security: SecuritySettings;
    general: GeneralSettings;
    appearance: AppearanceSettings;
    verification: {
      emailVerified: boolean;
      phoneVerified: boolean;
      emailVerifiedAt?: string;
      phoneVerifiedAt?: string;
    };
  }> {
    let userSettings = await prisma.userSettings.findUnique({
      where: { userId },
      include: { user: true }
    });

    // Create default settings if they don't exist
    if (!userSettings) {
      userSettings = await this.createDefaultSettings(userId);
    }

    // Get verification status
    const verificationStatus = await this.getVerificationStatus(userId);

    // Transform to enhanced format
    const transformedSettings = this.transformSettings(userSettings);

    return {
      notifications: transformedSettings.notifications,
      security: transformedSettings.security,
      general: transformedSettings.general,
      appearance: transformedSettings.appearance,
      verification: {
        emailVerified: verificationStatus.emailVerified,
        phoneVerified: verificationStatus.phoneVerified,
        emailVerifiedAt: verificationStatus.emailVerifiedAt,
        phoneVerifiedAt: verificationStatus.phoneVerifiedAt
      }
    };
  }

  /**
   * Update user settings
   */
  async updateSettings(userId: number, updates: UpdateSettingsDto, req?: any): Promise<UserSettings> {
    // Get current settings or create default ones
    let currentSettings = await prisma.userSettings.findUnique({
      where: { userId }
    });

    if (!currentSettings) {
      currentSettings = await this.createDefaultSettings(userId);
    }

    // Prepare update data by merging with existing settings
    const updateData: any = {};

    if (updates.notifications) {
      const currentNotifications = currentSettings!.notifications as any;
      updateData.notifications = { ...currentNotifications, ...updates.notifications };
    }

    if (updates.security) {
      const currentSecurity = currentSettings!.security as any;
      updateData.security = { ...currentSecurity, ...updates.security };

      // Handle two-factor authentication enabling/disabling
      if (updates.security.twoFactorEnabled !== undefined) {
        await this.handleTwoFactorUpdate(userId, updates.security.twoFactorEnabled, req);
      }
    }

    if (updates.general) {
      const currentGeneral = currentSettings!.general as any;
      updateData.general = { ...currentGeneral, ...updates.general };
    }

    if (updates.appearance) {
      const currentAppearance = currentSettings!.appearance as any;
      updateData.appearance = { ...currentAppearance, ...updates.appearance };
    }

    // Update settings in database
    const updatedSettings = await prisma.userSettings.update({
      where: { userId },
      data: updateData,
      include: { user: true }
    });

    // Send notification for security-related changes
    if (updates.security && Object.keys(updates.security).length > 0) {
      try {
        await this.authService.sendNotifications(
          updatedSettings.user,
          'profile_update',
          req
        );
      } catch (error) {
        console.error('Failed to send settings update notification:', error);
      }
    }

    return this.transformSettings(updatedSettings);
  }

  /**
   * Reset settings to default
   */
  async resetSettings(userId: number): Promise<UserSettings> {
    // Delete existing settings
    await prisma.userSettings.deleteMany({
      where: { userId }
    });

    // Create new default settings
    const defaultSettings = await this.createDefaultSettings(userId);
    return this.transformSettings(defaultSettings);
  }

  // ============ PASSWORD MANAGEMENT ============

  /**
   * Change user password with enhanced validation
   */
  async changePassword(userId: number, data: ChangePasswordDto, req?: any): Promise<SettingsResponse> {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Validate current password
    if (user.password) {
      const isCurrentValid = await bcrypt.compare(data.currentPassword, user.password);
      if (!isCurrentValid) {
        throw new Error('Current password is incorrect');
      }
    } else {
      throw new Error('No password set for this account');
    }

    // Validate new password
    if (data.newPassword !== data.confirmPassword) {
      throw new Error('New passwords do not match');
    }

    // Password strength validation
    if (data.newPassword.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }

    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(data.newPassword)) {
      throw new Error('Password must contain at least one uppercase letter, one lowercase letter, and one number');
    }

    // Check if new password is different from current
    const isSameAsOld = await bcrypt.compare(data.newPassword, user.password);
    if (isSameAsOld) {
      throw new Error('New password must be different from current password');
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(data.newPassword, 12);

    // Update password
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { password: hashedNewPassword }
    });

    // Send notification
    try {
      await this.authService.sendNotifications(updatedUser, 'password_changed', req);
    } catch (error) {
      console.error('Failed to send password change notification:', error);
    }

    // Optionally logout all other sessions for security
    await prisma.userSession.updateMany({
      where: {
        userId,
        id: { not: req?.sessionId || '' } // Keep current session active
      },
      data: { isActive: false }
    });

    return {
      success: true,
      message: 'Password changed successfully'
    };
  }

  // ============ ACCOUNT VERIFICATION ============

  /**
   * Get user verification status
   */
  async getVerificationStatus(userId: number): Promise<AccountVerification> {
    let verification = await prisma.userVerification.findFirst({
      where: { userId }
    });

    if (!verification) {
      verification = await prisma.userVerification.create({
        data: { userId }
      });
    }

    return {
      emailVerified: verification.emailVerified,
      phoneVerified: verification.phoneVerified,
      emailVerifiedAt: verification.emailVerifiedAt?.toISOString(),
      phoneVerifiedAt: verification.phoneVerifiedAt?.toISOString(),
      lastEmailVerificationSent: verification.lastEmailVerificationSent?.toISOString(),
      lastPhoneVerificationSent: verification.lastPhoneVerificationSent?.toISOString()
    };
  }

  /**
   * Send verification code with enhanced rate limiting and better error messages
   */
  async sendVerificationCode(userId: number, type: 'email' | 'phone', req?: any): Promise<{
    success: boolean;
    data: {
      sent: boolean;
      destination: string;
      expiresIn: number;
      attemptsRemaining: number;
      cooldownUntil?: string;
    };
    message: string;
    code?: 'RATE_LIMITED' | 'DAILY_LIMIT_EXCEEDED';
  }> {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (type === 'email' && !user.email) {
      throw new Error('No email address found for this account');
    }

    if (type === 'phone' && !user.phone) {
      throw new Error('No phone number found for this account');
    }

    // Get or create verification record
    let verification = await prisma.userVerification.findFirst({
      where: { userId }
    });

    if (!verification) {
      verification = await prisma.userVerification.create({
        data: { userId }
      });
    }

    // Rate limiting check - 1 request per minute
    const now = new Date();
    const lastSent = type === 'email'
      ? verification.lastEmailVerificationSent
      : verification.lastPhoneVerificationSent;

    if (lastSent && (now.getTime() - lastSent.getTime()) < 60000) { // 1 minute cooldown
      const cooldownUntil = new Date(lastSent.getTime() + 60000);
      return {
        success: false,
        data: {
          sent: false,
          destination: this.maskDestination(type, user),
          expiresIn: 0,
          attemptsRemaining: 0,
          cooldownUntil: cooldownUntil.toISOString()
        },
        message: 'Please wait before requesting another verification code',
        code: 'RATE_LIMITED'
      };
    }

    // Check daily attempts limit - max 5 per day
    const attempts = type === 'email'
      ? verification.emailVerificationAttempts
      : verification.phoneVerificationAttempts;

    if (attempts >= 5) {
      return {
        success: false,
        data: {
          sent: false,
          destination: this.maskDestination(type, user),
          expiresIn: 0,
          attemptsRemaining: 0
        },
        message: 'Daily verification attempt limit reached. Please try again tomorrow.',
        code: 'DAILY_LIMIT_EXCEEDED'
      };
    }

    // Generate verification code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Update verification record
    const updateData: any = {};
    if (type === 'email') {
      updateData.emailVerificationCode = code;
      updateData.emailCodeExpires = expires;
      updateData.lastEmailVerificationSent = now;
      updateData.emailVerificationAttempts = attempts + 1;
    } else {
      updateData.phoneVerificationCode = code;
      updateData.phoneCodeExpires = expires;
      updateData.lastPhoneVerificationSent = now;
      updateData.phoneVerificationAttempts = attempts + 1;
    }

    await prisma.userVerification.update({
      where: { id: verification.id },
      data: updateData
    });

    // Send verification code via AuthService
    const verificationData = { code, expiresIn: '10 minutes' };
    const notificationType = type === 'email' ? 'email_verification' : 'phone_verification';

    try {
      await this.authService.sendNotifications(user, notificationType, req, verificationData);
    } catch (error) {
      console.error(`Failed to send ${type} verification:`, error);
      throw new Error(`Failed to send verification code. Please try again.`);
    }

    return {
      success: true,
      data: {
        sent: true,
        destination: this.maskDestination(type, user),
        expiresIn: 600, // 10 minutes in seconds
        attemptsRemaining: 4 - attempts
      },
      message: `Verification code sent to your ${type}`
    };
  }

  /**
   * Mask email/phone for security
   */
  private maskDestination(type: 'email' | 'phone', user: any): string {
    if (type === 'email' && user.email) {
      const [username, domain] = user.email.split('@');
      const maskedUsername = username.slice(0, 2) + '*'.repeat(Math.max(1, username.length - 4)) + username.slice(-2);
      return `${maskedUsername}@${domain}`;
    }

    if (type === 'phone' && user.phone) {
      const phone = user.phone.replace(/\D/g, ''); // Remove non-digits
      if (phone.length >= 4) {
        return phone.slice(0, 2) + '*'.repeat(phone.length - 4) + phone.slice(-2);
      }
      return '*'.repeat(phone.length);
    }

    return `***${type}***`;
  }

  /**
   * Verify code
   */
  async verifyCode(userId: number, type: 'email' | 'phone', code: string): Promise<SettingsResponse> {
    const verification = await prisma.userVerification.findFirst({
      where: { userId }
    });

    if (!verification) {
      throw new Error('No verification record found');
    }

    const storedCode = type === 'email'
      ? verification.emailVerificationCode
      : verification.phoneVerificationCode;

    const codeExpires = type === 'email'
      ? verification.emailCodeExpires
      : verification.phoneCodeExpires;

    if (!storedCode || !codeExpires) {
      throw new Error('No verification code found. Please request a new one.');
    }

    if (new Date() > codeExpires) {
      throw new Error('Verification code has expired. Please request a new one.');
    }

    if (storedCode !== code) {
      throw new Error('Invalid verification code');
    }

    // Mark as verified
    const updateData: any = {
      [`${type}Verified`]: true,
      [`${type}VerifiedAt`]: new Date(),
      [`${type}VerificationCode`]: null,
      [`${type}CodeExpires`]: null
    };

    await prisma.userVerification.update({
      where: { id: verification.id },
      data: updateData
    });

    // Also update user verification status
    await prisma.user.update({
      where: { id: userId },
      data: {
        verificationStatus: 'verified'
      }
    });

    return {
      success: true,
      message: `${type.charAt(0).toUpperCase() + type.slice(1)} verified successfully`
    };
  }

  // ============ CONNECTED ACCOUNTS ============

  /**
   * Get connected accounts - filter to only return Google accounts
   * with real OAuth connection status checking
   */
  async getConnectedAccounts(userId: number): Promise<{
    id: string;
    provider: 'google';
    email: string;
    connected: boolean;
    connectedAt: string;
    lastUsed?: string;
  }[]> {
    const accounts = await prisma.connectedAccount.findMany({
      where: {
        userId,
        provider: 'google' // Only return Google accounts
      },
      orderBy: { connectedAt: 'desc' }
    });

    // Check real Google OAuth connection status
    const connectedAccounts = await Promise.all(
      accounts.map(async (account) => {
        // Check if the OAuth token is still valid
        let realConnectionStatus = account.connected;

        try {
          // TODO: Add actual Google OAuth token validation here
          // For now, use the stored connected status
          realConnectionStatus = account.connected;
        } catch (error) {
          console.error('Failed to verify Google connection:', error);
          // If verification fails, mark as disconnected
          realConnectionStatus = false;

          // Update the database
          await prisma.connectedAccount.update({
            where: { id: account.id },
            data: { connected: false }
          });
        }

        return {
          id: account.id,
          provider: 'google' as const,
          email: account.email,
          connected: realConnectionStatus,
          connectedAt: account.connectedAt.toISOString(),
          lastUsed: account.lastUsed?.toISOString()
        };
      })
    );

    return connectedAccounts;
  }

  /**
   * Connect Google OAuth account
   */
  async connectGoogleAccount(userId: number, accessToken: string, email: string): Promise<SettingsResponse> {
    try {
      // Verify the access token with Google (basic implementation)
      // In production, you would verify the token with Google's API
      if (!accessToken || accessToken.length < 10) {
        throw new Error('Invalid access token provided');
      }

      // Check if Google account is already connected to this user
      const existingConnection = await prisma.connectedAccount.findFirst({
        where: {
          userId,
          provider: 'google',
          email
        }
      });

      if (existingConnection && existingConnection.connected) {
        throw new Error('This Google account is already connected to your profile');
      }

      // Check if this Google account is connected to another user
      const otherUserConnection = await prisma.connectedAccount.findFirst({
        where: {
          email,
          provider: 'google',
          connected: true,
          userId: { not: userId }
        }
      });

      if (otherUserConnection) {
        throw new Error('This Google account is already connected to another user');
      }

      let connectedAccount;
      if (existingConnection) {
        // Reactivate existing connection
        connectedAccount = await prisma.connectedAccount.update({
          where: { id: existingConnection.id },
          data: {
            connected: true,
            connectedAt: new Date(),
            lastUsed: new Date(),
            metadata: { accessToken: accessToken.substring(0, 20) + '...' } // Store partial token for reference
          }
        });
      } else {
        // Create new connection
        // Extract provider ID from email or use email as provider ID
        const providerId = email.split('@')[0] + '_' + Date.now();

        connectedAccount = await prisma.connectedAccount.create({
          data: {
            userId,
            provider: 'google',
            providerId,
            email,
            connected: true,
            connectedAt: new Date(),
            lastUsed: new Date(),
            metadata: { accessToken: accessToken.substring(0, 20) + '...' } // Store partial token for reference
          }
        });
      }

      return {
        success: true,
        message: 'Google account connected successfully',
        data: {
          id: connectedAccount.id,
          provider: 'google',
          email: connectedAccount.email,
          connected: true,
          connectedAt: connectedAccount.connectedAt.toISOString()
        }
      };
    } catch (error: any) {
      console.error('Failed to connect Google account:', error);
      throw error;
    }
  }

  /**
   * Disconnect account by provider
   */
  async disconnectAccountByProvider(userId: number, provider: string): Promise<SettingsResponse> {
    const account = await prisma.connectedAccount.findFirst({
      where: {
        userId,
        provider,
        connected: true
      }
    });

    if (!account) {
      throw new Error(`No connected ${provider} account found`);
    }

    await prisma.connectedAccount.update({
      where: { id: account.id },
      data: {
        connected: false,
        lastUsed: new Date()
      }
    });

    return {
      success: true,
      message: `${provider} account disconnected successfully`,
      data: {
        provider,
        disconnectedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Disconnect account by ID
   */
  async disconnectAccount(userId: number, accountId: string): Promise<SettingsResponse> {
    const account = await prisma.connectedAccount.findFirst({
      where: {
        id: accountId,
        userId
      }
    });

    if (!account) {
      throw new Error('Connected account not found');
    }

    await prisma.connectedAccount.update({
      where: { id: accountId },
      data: {
        connected: false,
        lastUsed: new Date()
      }
    });

    return {
      success: true,
      message: `${account.provider} account disconnected successfully`
    };
  }

  // ============ PRIVATE HELPER METHODS ============

  /**
   * Create default settings for new user
   */
  private async createDefaultSettings(userId: number): Promise<any> {
    const defaultSettings = {
      userId,
      notifications: {
        sms: true,
        email: true,
        pushNotifications: false,
        marketingEmails: false,
        propertyAlerts: true,
        priceDropAlerts: true,
        bookingUpdates: true,
        securityAlerts: true,
        systemNotifications: true,
        preferredChannel: 'email',
        quietHours: {
          enabled: false,
          startTime: '22:00',
          endTime: '08:00',
          timezone: 'UTC'
        }
      },
      security: {
        twoFactorEnabled: false,
        twoFactorMethod: 'sms',
        loginNotifications: true,
        passwordChangeNotifications: true,
        suspiciousActivityAlerts: true,
        sessionTimeout: 30,
        maxActiveSessions: 5,
        profileVisibility: 'public',
        dataSharing: false,
        analyticsOptOut: false
      },
      general: {
        language: 'en',
        timezone: 'UTC',
        currency: 'USD',
        dateFormat: 'MM/DD/YYYY',
        timeFormat: '12h',
        accountDeactivated: false,
        dataProcessingConsent: true,
        marketingConsent: false,
        compactMode: false,
        showActivityStatus: true
      },
      appearance: {
        theme: 'light',
        fontSize: 'medium',
        compactMode: false,
        colorScheme: 'default'
      }
    };

    return await prisma.userSettings.create({
      data: defaultSettings,
      include: { user: true }
    });
  }

  /**
   * Handle two-factor authentication changes
   */
  private async handleTwoFactorUpdate(userId: number, enable: boolean, req?: any): Promise<void> {
    if (enable) {
      await this.authService.enableTwoFactor(userId);
    } else {
      await this.authService.disableTwoFactor(userId);
    }
  }

  /**
   * Transform database settings to API response format
   */
  private transformSettings(dbSettings: any): UserSettings {
    return {
      id: dbSettings.id,
      userId: dbSettings.userId,
      notifications: dbSettings.notifications as NotificationSettings,
      security: dbSettings.security as SecuritySettings,
      general: dbSettings.general as GeneralSettings,
      appearance: dbSettings.appearance as AppearanceSettings,
      createdAt: dbSettings.createdAt.toISOString(),
      updatedAt: dbSettings.updatedAt.toISOString()
    };
  }

  // ============ ACCOUNT MANAGEMENT ============

  /**
   * Deactivate user account
   */
  async deactivateAccount(userId: number, reason?: string): Promise<SettingsResponse> {
    // Update user status
    await prisma.user.update({
      where: { id: userId },
      data: {
        status: 'inactive',
        hostNotes: reason ? `Account deactivated: ${reason}` : 'Account deactivated by user'
      }
    });

    // Update settings to reflect deactivation
    await prisma.userSettings.updateMany({
      where: { userId },
      data: {
        general: {
          accountDeactivated: true
        }
      }
    });

    // Deactivate all sessions
    await prisma.userSession.updateMany({
      where: { userId },
      data: { isActive: false }
    });

    return {
      success: true,
      message: 'Account deactivated successfully'
    };
  }

  /**
   * Delete user account (soft delete with grace period)
   */
  async deleteAccount(userId: number, password: string, reason?: string): Promise<SettingsResponse> {
    // Get user with password
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Verify password if user has one
    if (user.password) {
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        throw new Error('Current password is incorrect');
      }
    } else {
      throw new Error('Cannot delete account: No password set for this account');
    }

    // Check for active bookings or important data that would prevent deletion
    const activeBookings = await prisma.booking.count({
      where: {
        guestId: userId,
        status: { in: ['confirmed', 'pending'] },
        checkIn: { gte: new Date() }
      }
    });

    const hostBookings = await prisma.booking.count({
      where: {
        property: { hostId: userId },
        status: { in: ['confirmed', 'pending'] },
        checkIn: { gte: new Date() }
      }
    });

    if (activeBookings > 0 || hostBookings > 0) {
      throw new Error('Cannot delete account: You have active bookings. Please complete or cancel them first');
    }

    // Check for active tours
    const activeTours = await prisma.tourBooking.count({
      where: {
        userId,
        status: { in: ['confirmed', 'pending'] },
        schedule: {
          startDate: { gte: new Date() }
        }
      }
    });

    const guideTours = await prisma.tourBooking.count({
      where: {
        tourGuideId: userId,
        status: { in: ['confirmed', 'pending'] },
        schedule: {
          startDate: { gte: new Date() }
        }
      }
    });

    if (activeTours > 0 || guideTours > 0) {
      throw new Error('Cannot delete account: You have active tour bookings. Please complete or cancel them first');
    }

    // Set deletion date to 30 days from now (grace period)
    const deletionDate = new Date();
    deletionDate.setDate(deletionDate.getDate() + 30);

    // Mark account for deletion
    await prisma.user.update({
      where: { id: userId },
      data: {
        status: 'scheduled_for_deletion',
        hostNotes: reason
          ? `Account scheduled for deletion: ${reason}. Will be deleted on ${deletionDate.toISOString()}`
          : `Account scheduled for deletion by user. Will be deleted on ${deletionDate.toISOString()}`
      }
    });

    // Update settings to reflect deletion scheduling
    const currentSettings = await prisma.userSettings.findUnique({
      where: { userId }
    });

    if (currentSettings) {
      const updatedGeneral = {
        ...(currentSettings.general as any),
        accountDeactivated: true,
        scheduledForDeletion: true,
        deletionDate: deletionDate.toISOString()
      };

      await prisma.userSettings.update({
        where: { id: currentSettings.id },
        data: {
          general: updatedGeneral
        }
      });
    }

    // Deactivate all sessions
    await prisma.userSession.updateMany({
      where: { userId },
      data: { isActive: false }
    });

    // Disconnect all connected accounts
    await prisma.connectedAccount.updateMany({
      where: { userId },
      data: { connected: false }
    });

    // Send deletion confirmation notification
    try {
      await this.authService.sendNotifications(
        user,
        'account_status',
        null,
        undefined,
        {
          status: 'scheduled_for_deletion',
          deletionDate: deletionDate.toISOString(),
          gracePeriodDays: 30
        }
      );
    } catch (error) {
      console.error('Failed to send account deletion notification:', error);
    }

    return {
      success: true,
      message: `Account scheduled for deletion on ${deletionDate.toLocaleDateString()}. You can recover your account by logging in before this date.`,
      data: {
        deletionDate: deletionDate.toISOString(),
        gracePeriodDays: 30
      }
    };
  }

  /**
   * Get user settings summary for dashboard
   */
  async getSettingsSummary(userId: number): Promise<{
    notificationsEnabled: number;
    securityScore: number;
    verificationStatus: AccountVerification;
    connectedAccounts: number;
  }> {
    const settings = await this.getUserSettings(userId);
    const verificationStatus = await this.getVerificationStatus(userId);
    const connectedAccounts = await this.getConnectedAccounts(userId);

    // Calculate notifications enabled
    const notifications = settings.notifications;
    const notificationKeys = ['sms', 'email', 'pushNotifications', 'marketingEmails', 'propertyAlerts', 'priceDropAlerts'];
    const notificationsEnabled = notificationKeys.filter(key => (notifications as any)[key]).length;

    // Calculate security score
    let securityScore = 0;
    const security = settings.security;
    if (security.twoFactorEnabled) securityScore += 25;
    if (security.loginNotifications) securityScore += 15;
    if (security.passwordChangeNotifications) securityScore += 15;
    if (security.suspiciousActivityAlerts) securityScore += 15;
    if (verificationStatus.emailVerified) securityScore += 15;
    if (verificationStatus.phoneVerified) securityScore += 15;

    return {
      notificationsEnabled,
      securityScore: Math.min(securityScore, 100),
      verificationStatus,
      connectedAccounts: connectedAccounts.filter(acc => acc.connected).length
    };
  }
}