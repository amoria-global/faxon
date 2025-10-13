// src/controllers/settings.controller.ts
import { Request, Response, NextFunction } from 'express';
import { SettingsService } from '../services/settings.service';
import { UpdateSettingsDto, ChangePasswordDto, ConnectAccountDto, DeleteAccountDto } from '../types/settings.types';

const settingsService = new SettingsService();

export class SettingsController {
  // ============ USER SETTINGS ============

  /**
   * Get user settings with verification status
   */
  async getSettings(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated',
          errors: ['Authentication required']
        });
      }

      const settings = await settingsService.getUserSettings(parseInt(req.user.userId));

      res.json({
        success: true,
        data: settings,
        message: 'Settings retrieved successfully'
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve settings',
        errors: [error.message]
      });
    }
  }

  /**
   * Update user settings
   */
  async updateSettings(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }

      const updates: UpdateSettingsDto = req.body;

      // Basic validation
      if (!updates || Object.keys(updates).length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No settings updates provided'
        });
      }

      const updatedSettings = await settingsService.updateSettings(
        parseInt(req.user.userId),
        updates,
        req
      );

      res.json({
        success: true,
        data: updatedSettings,
        message: 'Settings updated successfully'
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Reset settings to default
   */
  async resetSettings(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }

      const defaultSettings = await settingsService.resetSettings(parseInt(req.user.userId));

      res.json({
        success: true,
        data: defaultSettings,
        message: 'Settings reset to default successfully'
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // ============ NOTIFICATION SETTINGS ============

  /**
   * Update notification settings only
   */
  async updateNotificationSettings(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }

      const notificationUpdates = req.body;
      const updates: UpdateSettingsDto = {
        notifications: notificationUpdates
      };

      const updatedSettings = await settingsService.updateSettings(
        parseInt(req.user.userId),
        updates,
        req
      );

      res.json({
        success: true,
        data: updatedSettings.notifications,
        message: 'Notification settings updated successfully'
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // ============ SECURITY SETTINGS ============

  /**
   * Update security settings only
   */
  async updateSecuritySettings(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }

      const securityUpdates = req.body;
      const updates: UpdateSettingsDto = {
        security: securityUpdates
      };

      const updatedSettings = await settingsService.updateSettings(
        parseInt(req.user.userId),
        updates,
        req
      );

      res.json({
        success: true,
        data: updatedSettings.security,
        message: 'Security settings updated successfully'
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // ============ PASSWORD MANAGEMENT ============

  /**
   * Change password with enhanced validation and response
   */
  async changePassword(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated',
          errors: ['Authentication required']
        });
      }

      const { currentPassword, newPassword, confirmPassword }: ChangePasswordDto = req.body;

      // Enhanced validation
      const validationErrors: string[] = [];

      if (!currentPassword) validationErrors.push('Current password is required');
      if (!newPassword) validationErrors.push('New password is required');
      if (!confirmPassword) validationErrors.push('Confirm password is required');

      if (newPassword && newPassword.length < 8) {
        validationErrors.push('Password must be at least 8 characters long');
      }

      if (newPassword && !/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword)) {
        validationErrors.push('Password must contain at least one uppercase letter, one lowercase letter, and one number');
      }

      if (newPassword && confirmPassword && newPassword !== confirmPassword) {
        validationErrors.push('New passwords do not match');
      }

      if (validationErrors.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Password validation failed',
          errors: validationErrors
        });
      }

      const result = await settingsService.changePassword(
        parseInt(req.user.userId),
        { currentPassword, newPassword, confirmPassword },
        req
      );

      res.json({
        success: true,
        message: 'Password changed successfully',
        data: { passwordChanged: true }
      });
    } catch (error: any) {
      let statusCode = 400;
      let errorMessage = error.message;

      // Handle specific error cases
      if (error.message.includes('Current password is incorrect')) {
        statusCode = 401;
      } else if (error.message.includes('rate limit') || error.message.includes('too many')) {
        statusCode = 429;
      }

      res.status(statusCode).json({
        success: false,
        message: errorMessage,
        errors: [errorMessage]
      });
    }
  }

  // ============ ACCOUNT VERIFICATION ============

  /**
   * Get verification status
   */
  async getVerificationStatus(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }

      const verificationStatus = await settingsService.getVerificationStatus(
        parseInt(req.user.userId)
      );

      res.json({
        success: true,
        data: verificationStatus,
        message: 'Verification status retrieved successfully'
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Send verification code with enhanced response
   */
  async sendVerificationCode(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated',
          errors: ['Authentication required']
        });
      }

      const { type } = req.body;

      if (!type || !['email', 'phone'].includes(type)) {
        return res.status(400).json({
          success: false,
          message: 'Verification type must be either "email" or "phone"',
          errors: ['Invalid verification type']
        });
      }

      const result = await settingsService.sendVerificationCode(
        parseInt(req.user.userId),
        type,
        req
      );

      // Handle rate limiting responses appropriately
      if (!result.success && result.code === 'RATE_LIMITED') {
        return res.status(429).json(result);
      }

      if (!result.success && result.code === 'DAILY_LIMIT_EXCEEDED') {
        return res.status(429).json(result);
      }

      res.json(result);
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to send verification code',
        errors: [error.message]
      });
    }
  }

  /**
   * Verify code
   */
  async verifyCode(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }

      const { type, code } = req.body;

      if (!type || !['email', 'phone'].includes(type)) {
        return res.status(400).json({
          success: false,
          message: 'Verification type must be either "email" or "phone"'
        });
      }

      if (!code || typeof code !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Verification code is required'
        });
      }

      const result = await settingsService.verifyCode(
        parseInt(req.user.userId),
        type,
        code
      );

      res.json(result);
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // ============ CONNECTED ACCOUNTS ============

  /**
   * Get connected accounts
   */
  async getConnectedAccounts(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }

      const connectedAccounts = await settingsService.getConnectedAccounts(
        parseInt(req.user.userId)
      );

      res.json({
        success: true,
        data: connectedAccounts,
        message: 'Connected accounts retrieved successfully'
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Connect Google OAuth account
   */
  async connectAccount(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated',
          errors: ['Authentication required']
        });
      }

      const { provider, accessToken, email }: ConnectAccountDto = req.body;

      // Validation
      const validationErrors: string[] = [];

      if (!provider) {
        validationErrors.push('Provider is required');
      } else if (provider !== 'google') {
        validationErrors.push('Only Google OAuth is currently supported');
      }

      if (!accessToken || typeof accessToken !== 'string') {
        validationErrors.push('Valid access token is required');
      } else if (accessToken.length < 20) {
        validationErrors.push('Access token appears to be invalid');
      }

      if (!email || typeof email !== 'string') {
        validationErrors.push('Email is required');
      } else {
        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          validationErrors.push('Valid email address is required');
        }
        // Check for Gmail domain since we're only supporting Google
        if (!email.endsWith('@gmail.com') && !email.includes('@')) {
          validationErrors.push('Please use a Google account email');
        }
      }

      if (validationErrors.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: validationErrors
        });
      }

      const result = await settingsService.connectGoogleAccount(
        parseInt(req.user.userId),
        accessToken,
        email
      );

      res.json(result);
    } catch (error: any) {
      let statusCode = 400;
      if (error.message.includes('already connected')) {
        statusCode = 409;
      } else if (error.message.includes('invalid') || error.message.includes('unauthorized')) {
        statusCode = 401;
      } else if (error.message.includes('rate limit')) {
        statusCode = 429;
      }

      res.status(statusCode).json({
        success: false,
        message: error.message,
        errors: [error.message]
      });
    }
  }

  /**
   * Disconnect account by provider
   */
  async disconnectAccountByProvider(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated',
          errors: ['Authentication required']
        });
      }

      const { provider } = req.params;

      if (!provider || provider !== 'google') {
        return res.status(400).json({
          success: false,
          message: 'Provider must be "google"',
          errors: ['Invalid provider']
        });
      }

      const result = await settingsService.disconnectAccountByProvider(
        parseInt(req.user.userId),
        provider
      );

      res.json(result);
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message,
        errors: [error.message]
      });
    }
  }

  /**
   * Disconnect account by ID (existing method)
   */
  async disconnectAccount(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }

      const { accountId } = req.params;

      if (!accountId) {
        return res.status(400).json({
          success: false,
          message: 'Account ID is required'
        });
      }

      const result = await settingsService.disconnectAccount(
        parseInt(req.user.userId),
        accountId
      );

      res.json(result);
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // ============ GENERAL SETTINGS ============

  /**
   * Update general settings only
   */
  async updateGeneralSettings(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }

      const generalUpdates = req.body;
      const updates: UpdateSettingsDto = {
        general: generalUpdates
      };

      const updatedSettings = await settingsService.updateSettings(
        parseInt(req.user.userId),
        updates,
        req
      );

      res.json({
        success: true,
        data: updatedSettings.general,
        message: 'General settings updated successfully'
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Update appearance settings only
   */
  async updateAppearanceSettings(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }

      const appearanceUpdates = req.body;
      const updates: UpdateSettingsDto = {
        appearance: appearanceUpdates
      };

      const updatedSettings = await settingsService.updateSettings(
        parseInt(req.user.userId),
        updates,
        req
      );

      res.json({
        success: true,
        data: updatedSettings.appearance,
        message: 'Appearance settings updated successfully'
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // ============ ACCOUNT MANAGEMENT ============

  /**
   * Deactivate account
   */
  async deactivateAccount(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated',
          errors: ['Authentication required']
        });
      }

      const { reason } = req.body;

      const result = await settingsService.deactivateAccount(
        parseInt(req.user.userId),
        reason
      );

      res.json(result);
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message,
        errors: [error.message]
      });
    }
  }

  /**
   * Delete account (soft delete with grace period)
   */
  async deleteAccount(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated',
          errors: ['Authentication required']
        });
      }

      const { password, reason }: DeleteAccountDto = req.body;

      // Enhanced validation
      const validationErrors: string[] = [];

      if (!password || typeof password !== 'string') {
        validationErrors.push('Password is required to delete account');
      } else if (password.length < 1) {
        validationErrors.push('Password cannot be empty');
      }

      if (reason && typeof reason !== 'string') {
        validationErrors.push('Reason must be a valid string');
      } else if (reason && reason.length > 500) {
        validationErrors.push('Reason cannot exceed 500 characters');
      }

      if (validationErrors.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: validationErrors
        });
      }

      const result = await settingsService.deleteAccount(
        parseInt(req.user.userId),
        password,
        reason
      );

      // Set status to 200 since this is a successful operation
      res.status(200).json(result);
    } catch (error: any) {
      let statusCode = 400;
      if (error.message.includes('password is incorrect') || error.message.includes('Current password is incorrect')) {
        statusCode = 401;
      } else if (error.message.includes('Cannot delete account') || error.message.includes('cannot delete')) {
        statusCode = 409;
      } else if (error.message.includes('User not found')) {
        statusCode = 404;
      }

      res.status(statusCode).json({
        success: false,
        message: error.message,
        errors: [error.message]
      });
    }
  }

  // ============ SETTINGS SUMMARY ============

  /**
   * Get settings summary for dashboard
   */
  async getSettingsSummary(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }

      const summary = await settingsService.getSettingsSummary(parseInt(req.user.userId));

      res.json({
        success: true,
        data: summary,
        message: 'Settings summary retrieved successfully'
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // ============ TWO FACTOR AUTHENTICATION ============

  /**
   * Enable 2FA
   */
  async enableTwoFactor(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }

      const updates: UpdateSettingsDto = {
        security: {
          twoFactorEnabled: true
        }
      };

      const updatedSettings = await settingsService.updateSettings(
        parseInt(req.user.userId),
        updates,
        req
      );

      res.json({
        success: true,
        data: { twoFactorEnabled: true },
        message: 'Two-factor authentication enabled successfully'
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Disable 2FA
   */
  async disableTwoFactor(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }

      const updates: UpdateSettingsDto = {
        security: {
          twoFactorEnabled: false
        }
      };

      const updatedSettings = await settingsService.updateSettings(
        parseInt(req.user.userId),
        updates,
        req
      );

      res.json({
        success: true,
        data: { twoFactorEnabled: false },
        message: 'Two-factor authentication disabled successfully'
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
}