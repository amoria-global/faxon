import { BrevoMailingService } from '../utils/brevo.auth';
import { UserInfo } from '../types/auth.types';

export class AuthMailingIntegration {
  private mailingService: BrevoMailingService;
  private companyInfo: {
    name: string;
    website: string;
    supportEmail: string;
    logo: string;
  };

  constructor() {
    this.mailingService = new BrevoMailingService();
    this.companyInfo = {
      name: 'Jambolush',
      website: 'https://jambolush.com',
      supportEmail: 'security@jambolush.com',
      logo: 'https://jambolush.com/assets/logo.png'
    };
  }

  // --- CONTEXT BUILDERS ---
  private buildBaseContext(user: UserInfo, securityInfo?: any) {
    return {
      user: {
        firstName: user.firstName || user.name.split(' ')[0] || 'User',
        lastName: user.lastName || user.name.split(' ')[1] || '',
        email: user.email,
        id: user.id
      },
      company: this.companyInfo,
      security: securityInfo ? {
        device: this.getDeviceInfo(securityInfo.userAgent),
        browser: this.getBrowserInfo(securityInfo.userAgent),
        location: securityInfo.location || 'Unknown Location',
        ipAddress: securityInfo.ipAddress || 'Unknown IP',
        timestamp: new Date().toISOString()
      } : undefined
    };
  }

  private buildVerificationContext(user: UserInfo, code: string, expiresInMinutes: number = 10) {
    const context = this.buildBaseContext(user);
    context.verification = {
      code,
      expiresIn: `${expiresInMinutes} minutes`
    };
    return context;
  }

  // --- PUBLIC MAILING METHODS ---

  /**
   * Send welcome email after successful registration
   */
  async sendWelcomeEmail(user: UserInfo): Promise<void> {
    try {
      const context = this.buildBaseContext(user);
      await this.mailingService.sendWelcomeEmail(context);
      
      // Create contact in Brevo
      await this.mailingService.createOrUpdateContact({
        email: user.email,
        attributes: {
          FIRSTNAME: user.firstName || user.name.split(' ')[0] || '',
          LASTNAME: user.lastName || user.name.split(' ')[1] || '',
          SMS: user.phone || ''
        },
        listIds: [1] // Add to main contact list
      });
    } catch (error) {
      console.error('Failed to send welcome email:', error);
      // Don't throw error - email failure shouldn't break registration
    }
  }

  /**
   * Send email verification code
   */
  async sendEmailVerification(user: UserInfo, verificationCode: string): Promise<void> {
    try {
      const context = this.buildVerificationContext(user, verificationCode, 30);
      await this.mailingService.sendEmailVerification(context);
    } catch (error) {
      console.error('Failed to send email verification:', error);
    }
  }

  /**
   * Send password reset OTP
   */
  async sendPasswordResetOTP(user: UserInfo, otp: string, securityInfo?: any): Promise<void> {
    try {
      const context = this.buildVerificationContext(user, otp, 10);
      if (securityInfo) {
        context.security = {
          device: this.getDeviceInfo(securityInfo.userAgent),
          browser: this.getBrowserInfo(securityInfo.userAgent),
          location: securityInfo.location || 'Unknown Location',
          ipAddress: securityInfo.ipAddress || 'Unknown IP',
          timestamp: new Date().toISOString()
        };
      }
      await this.mailingService.sendPasswordResetOTP(context);
    } catch (error) {
      console.error('Failed to send password reset OTP:', error);
    }
  }

  /**
   * Send password changed confirmation
   */
  async sendPasswordChangedNotification(user: UserInfo, securityInfo?: any): Promise<void> {
    try {
      const context = this.buildBaseContext(user, securityInfo);
      await this.mailingService.sendPasswordChangedNotification(context);
    } catch (error) {
      console.error('Failed to send password change notification:', error);
    }
  }

  /**
   * Send login notification
   */
  async sendLoginNotification(user: UserInfo, securityInfo?: any): Promise<void> {
    try {
      const context = this.buildBaseContext(user, securityInfo);
      await this.mailingService.sendLoginNotification(context);
    } catch (error) {
      console.error('Failed to send login notification:', error);
    }
  }

  /**
   * Send suspicious activity alert
   */
  async sendSuspiciousActivityAlert(user: UserInfo, securityInfo?: any): Promise<void> {
    try {
      const context = this.buildBaseContext(user, securityInfo);
      await this.mailingService.sendSuspiciousActivityAlert(context);
    } catch (error) {
      console.error('Failed to send suspicious activity alert:', error);
    }
  }

  /**
   * Send account status change notification
   */
  async sendAccountStatusChange(user: UserInfo, status: 'suspended' | 'reactivated'): Promise<void> {
    try {
      const context = this.buildBaseContext(user);
      await this.mailingService.sendAccountStatusChange(context, status);
    } catch (error) {
      console.error('Failed to send account status change notification:', error);
    }
  }

  /**
   * Send profile update notification
   */
  async sendProfileUpdateNotification(user: UserInfo, securityInfo?: any): Promise<void> {
    try {
      const context = this.buildBaseContext(user, securityInfo);
      await this.mailingService.sendProfileUpdateNotification(context);
    } catch (error) {
      console.error('Failed to send profile update notification:', error);
    }
  }

  // --- UTILITY METHODS ---
  private getDeviceInfo(userAgent?: string): string {
    if (!userAgent) return 'Unknown Device';
    
    if (userAgent.includes('Mobile') || userAgent.includes('Android')) {
      return 'Mobile Device';
    } else if (userAgent.includes('Tablet') || userAgent.includes('iPad')) {
      return 'Tablet';
    } else if (userAgent.includes('Windows')) {
      return 'Windows Computer';
    } else if (userAgent.includes('Mac')) {
      return 'Mac Computer';
    } else if (userAgent.includes('Linux')) {
      return 'Linux Computer';
    } else {
      return 'Desktop Computer';
    }
  }

  private getBrowserInfo(userAgent?: string): string {
    if (!userAgent) return 'Unknown Browser';
    
    if (userAgent.includes('Chrome')) {
      return 'Google Chrome';
    } else if (userAgent.includes('Firefox')) {
      return 'Mozilla Firefox';
    } else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
      return 'Safari';
    } else if (userAgent.includes('Edge')) {
      return 'Microsoft Edge';
    } else if (userAgent.includes('Opera')) {
      return 'Opera';
    } else {
      return 'Unknown Browser';
    }
  }

  /**
   * Check if login should trigger notification based on risk factors
   */
  shouldSendLoginNotification(user: UserInfo, securityInfo?: any): boolean {
    if (!securityInfo) return false;
    
    // Send notification for new devices, unusual locations, etc.
    // This is a simplified version - implement more sophisticated logic
    const lastLoginTime = user.last_login ? new Date(user.last_login).getTime() : 0;
    const timeSinceLastLogin = Date.now() - lastLoginTime;
    const daysSinceLastLogin = timeSinceLastLogin / (1000 * 60 * 60 * 24);
    
    // Send notification if:
    // - First time login (no last_login)
    // - Login from different location
    // - Login after 7+ days
    return !user.last_login || daysSinceLastLogin > 7;
  }

  /**
   * Detect suspicious activity patterns
   */
  isSuspiciousActivity(loginAttempts: number, timeWindow: number): boolean {
    // Send alert if more than 5 failed attempts in 10 minutes
    return loginAttempts > 5 && timeWindow <= 10;
  }
}

// --- ENHANCED TYPES FOR SECURITY TRACKING ---
export interface SecurityInfo {
  ipAddress?: string;
  userAgent?: string;
  location?: string;
  timestamp?: Date;
  loginAttempts?: number;
  timeWindow?: number;
}

// --- MIDDLEWARE FOR CAPTURING SECURITY INFO ---
export class SecurityInfoCapture {
  static extractFromRequest(req: any): SecurityInfo {
    return {
      ipAddress: req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for']?.split(',')[0],
      userAgent: req.headers['user-agent'],
      location: req.headers['cf-ipcountry'] || req.headers['x-country-code'] || 'Unknown',
      timestamp: new Date()
    };
  }

  static async getLocationFromIP(ipAddress: string): Promise<string> {
    try {
      // You can integrate with IP geolocation services like:
      // - ipapi.co
      // - ipstack.com
      // - MaxMind GeoIP
      
      // Example with ipapi.co (free tier available)
      const response = await fetch(`https://ipapi.co/${ipAddress}/json/`);
      const data: any = await response.json();
      return `${data.city}, ${data.country_name}`;
    } catch (error) {
      return 'Unknown Location';
    }
  }
}