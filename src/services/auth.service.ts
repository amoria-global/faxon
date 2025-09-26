// src/services/auth.service.ts
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { PrismaClient, Prisma } from '@prisma/client';
import { config } from '../config/config';
import { BrevoMailingService } from '../utils/brevo.auth';
import { BrevoSMSService } from '../utils/brevo.sms.auth';
import { 
  RegisterDto, 
  LoginDto, 
  OAuthDto, 
  JwtPayload, 
  UserInfo,
  AuthResponse,
  ChangePasswordDto,
  UpdateUserProfileDto,
  UserSession,
  RefreshTokenDto,
  AdminUpdateUserDto,
  TourGuideLoginResponse,
  TourGuideType,
  DocumentType
} from '../types/auth.types';

const prisma = new PrismaClient();
const googleClient = new OAuth2Client(config.googleClientId);

export class AuthService {
  private brevoEmailService: BrevoMailingService;
  private brevoSMSService: BrevoSMSService;

  constructor() {
    this.brevoEmailService = new BrevoMailingService();
    this.brevoSMSService = new BrevoSMSService();
  }

  // --- CONTEXT CREATION HELPERS ---
  private createMailingContext(user: any, security?: any, verification?: any) {
    return {
      user: {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        id: user.id
      },
      company: {
        name: 'Jambolush',
        website: config.clientUrl || 'https://jambolush.com',
        supportEmail: config.supportEmail,
        logo: config.companyLogo
      },
      security,
      verification
    };
  }

  private createSMSContext(user: any, security?: any, verification?: any) {
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

  private extractSecurityInfo(req?: any) {
    if (!req) return undefined;
    
    return {
      device: req.headers['user-agent'] || 'Unknown Device',
      browser: this.getBrowserFromUserAgent(req.headers['user-agent']),
      location: req.headers['cf-ipcountry'] || req.headers['x-forwarded-for']?.split(',')[0] || 'Unknown Location',
      ipAddress: req.ip || req.connection.remoteAddress || 'Unknown IP',
      timestamp: new Date().toISOString()
    };
  }

  private getBrowserFromUserAgent(userAgent: string): string {
    if (!userAgent) return 'Unknown Browser';
    
    if (userAgent.includes('Chrome')) return 'Chrome';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Safari')) return 'Safari';
    if (userAgent.includes('Edge')) return 'Edge';
    return 'Unknown Browser';
  }

  // --- DUAL NOTIFICATION SYSTEM ---
  async sendNotifications(
    user: any,
    notificationType: 'welcome' | 'login' | 'password_reset' | 'password_changed' | 
                     'suspicious_activity' | 'account_status' | 'profile_update' | 
                     'phone_verification' | 'two_factor' | 'email_verification',
    req?: any,
    verification?: any,
    additionalData?: any
  ): Promise<void> {
    const securityInfo = this.extractSecurityInfo(req);
    const emailContext = this.createMailingContext(user, securityInfo, verification);
    const smsContext = this.createSMSContext(user, securityInfo, verification);

    // Always attempt email notifications
    try {
      switch (notificationType) {
        case 'welcome':
          await this.brevoEmailService.sendWelcomeEmail(emailContext);
          break;
        case 'email_verification':
          await this.brevoEmailService.sendEmailVerification(emailContext);
          break;
        case 'login':
          await this.brevoEmailService.sendLoginNotification(emailContext);
          break;
        case 'password_reset':
          await this.brevoEmailService.sendPasswordResetOTP(emailContext);
          break;
        case 'password_changed':
          await this.brevoEmailService.sendPasswordChangedNotification(emailContext);
          break;
        case 'suspicious_activity':
          await this.brevoEmailService.sendSuspiciousActivityAlert(emailContext);
          break;
        case 'account_status':
          await this.brevoEmailService.sendAccountStatusChange(emailContext, additionalData.status);
          break;
        case 'profile_update':
          await this.brevoEmailService.sendProfileUpdateNotification(emailContext);
          break;
      }
    } catch (emailError) {
      console.error(`Failed to send ${notificationType} email:`, emailError);
    }

    // Send SMS if user has phone and preferences allow
    if (user.phone) {
      try {
        const shouldSendSMS = await this.brevoSMSService.shouldSendSMS(user.id, notificationType);
        if (shouldSendSMS) {
          switch (notificationType) {
            case 'welcome':
              await this.brevoSMSService.sendWelcomeSMS(smsContext);
              break;
            case 'login':
              await this.brevoSMSService.sendLoginNotificationSMS(smsContext);
              break;
            case 'password_reset':
              await this.brevoSMSService.sendPasswordResetSMS(smsContext);
              break;
            case 'password_changed':
              await this.brevoSMSService.sendPasswordChangedSMS(smsContext);
              break;
            case 'suspicious_activity':
              await this.brevoSMSService.sendSuspiciousActivitySMS(smsContext);
              break;
            case 'account_status':
              await this.brevoSMSService.sendAccountStatusChangeSMS(smsContext, additionalData.status);
              break;
            case 'phone_verification':
              await this.brevoSMSService.sendPhoneVerificationSMS(smsContext);
              break;
            case 'two_factor':
              await this.brevoSMSService.sendTwoFactorSMS(smsContext);
              break;
          }
        }
      } catch (smsError) {
        console.error(`Failed to send ${notificationType} SMS:`, smsError);
      }
    }
  }

  // --- REGISTRATION & LOGIN ---
  async register(data: RegisterDto, req?: any): Promise<AuthResponse> {
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email }
    });

    if (existingUser) {
      throw new Error('User already exists');
    }

    // Handle name parsing
    let firstName = data.firstName || '';
    let lastName = data.lastName || '';
    
    if (data.names && (!data.firstName || !data.lastName)) {
      const nameParts = data.names.trim().split(' ');
      firstName = nameParts[0] || '';
      lastName = nameParts.slice(1).join(' ') || '';
    }

    if (!firstName || !lastName) {
      throw new Error('First name and last name are required');
    }

    const isServiceProvider = ['host', 'tourguide', 'agent'].includes(data.userType || '');
    let hashedPassword = null;

    if (data.password) {
      hashedPassword = await bcrypt.hash(data.password, 10);
    } else if (!isServiceProvider) {
      throw new Error('Password is required');
    }
    
    const tourGuideData = data.userType === 'tourguide' ? {
      bio: data.bio,
      experience: data.experience,
      languages: data.languages ? JSON.stringify(data.languages) : undefined,
      specializations: data.specializations ? JSON.stringify(data.specializations) : undefined,
      licenseNumber: data.licenseNumber,
      certifications: data.certifications ? JSON.stringify(data.certifications) : undefined,
      tourGuideType: data.tourGuideType,
      nationalId: data.nationalId,
      companyTIN: data.companyTIN,
      companyName: data.companyName,
    } : {};
    
    const user = await prisma.user.create({
      data: {
        email: data.email,
        firstName,
        lastName,
        password: hashedPassword,
        provider: data.provider || 'manual',
        phone: data.phone,
        phoneCountryCode: data.phoneCountryCode,
        country: data.country,
        state: data.state,
        province: data.province,
        city: data.city,
        street: data.street,
        zipCode: data.zipCode,
        postalCode: data.postalCode,
        postcode: data.postcode,
        pinCode: data.pinCode,
        eircode: data.eircode,
        cep: data.cep,
        userType: data.userType || 'guest',
        status: isServiceProvider ? 'pending' : 'active',
        verificationStatus: isServiceProvider ? 'pending' : 'unverified',
        preferredCommunication: data.preferredCommunication || 'both',
        ...tourGuideData
      }
    });

    const applicationId = isServiceProvider ? `APP-${user.id}-${Date.now()}` : undefined;
    const { accessToken, refreshToken } = await this.generateTokens(user.id, user.email, user.userType);
    await this.createSession(user.id, refreshToken);

    // Send welcome notifications
    await this.sendNotifications(user, 'welcome', req);

    return { 
      user: this.transformToUserInfo(user), 
      accessToken, 
      refreshToken,
      applicationId
    };
  }

  async login(data: LoginDto, req?: any): Promise<AuthResponse | TourGuideLoginResponse> {
    const user = await prisma.user.findUnique({
      where: { email: data.email }
    });

    if (!user) {
      throw new Error('Invalid credentials');
    }

    if (!user.password && ['host', 'tourguide', 'agent'].includes(user.userType)) {
      throw new Error('Please set up your password first. Check your email for instructions.');
    }

    if (!user.password) {
      throw new Error('Invalid credentials');
    }

    const isValid = await bcrypt.compare(data.password, user.password);
    if (!isValid) {
      throw new Error('Invalid credentials');
    }

    // Check if 2FA is required
    if (user.twoFactorEnabled) {
      // Generate and send 2FA code
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expires = new Date(Date.now() + 5 * 60 * 1000);

      // Use existing resetPassword fields for 2FA since twoFactorCode doesn't exist
      await prisma.user.update({
        where: { id: user.id },
        data: {
          resetPasswordOtp: code,
          resetPasswordExpires: expires
        }
      });

      const verification = { code, expiresIn: '5 minutes' };
      await this.sendNotifications(user, 'two_factor', req, verification);

      return {
        user: this.transformToUserInfo(user),
        accessToken: '',
        refreshToken: '',
        requiresTwoFactor: true,
        message: 'Two-factor authentication code sent to your phone'
      } as any;
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLogin: new Date(),
        totalSessions: { increment: 1 }
      }
    });

    const { accessToken, refreshToken } = await this.generateTokens(user.id, user.email, user.userType);
    await this.createSession(user.id, refreshToken);

    // Send login notifications
    await this.sendNotifications(updatedUser, 'login', req);

    const baseResponse = { 
      user: this.transformToUserInfo(updatedUser), 
      accessToken, 
      refreshToken 
    };

    // Enhanced response for tour guides
    if (user.userType === 'tourguide') {
      const missingDocuments = this.getMissingDocuments(updatedUser);
      return {
        ...baseResponse,
        tourGuideType: (updatedUser as any).tourGuideType as TourGuideType,
        documentVerificationStatus: this.getDocumentVerificationStatus(updatedUser),
        missingDocuments
      };
    }

    return baseResponse;
  }

  // --- TWO-FACTOR AUTHENTICATION ---
  async verifyTwoFactorLogin(email: string, code: string, req?: any): Promise<AuthResponse> {
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user || !user.resetPasswordOtp || !user.resetPasswordExpires) {
      throw new Error('Invalid or expired code');
    }

    if (user.resetPasswordExpires < new Date()) {
      throw new Error('Verification code has expired');
    }

    if (user.resetPasswordOtp !== code) {
      throw new Error('Invalid verification code');
    }

    // Clear 2FA code and complete login
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        resetPasswordOtp: null,
        resetPasswordExpires: null,
        lastLogin: new Date(),
        totalSessions: { increment: 1 }
      }
    });

    const { accessToken, refreshToken } = await this.generateTokens(user.id, user.email, user.userType);
    await this.createSession(user.id, refreshToken);

    return {
      user: this.transformToUserInfo(updatedUser),
      accessToken,
      refreshToken
    };
  }

  async sendTwoFactorCode(userId: number, req?: any): Promise<{ message: string }> {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (!user.twoFactorEnabled) {
      throw new Error('Two-factor authentication is not enabled');
    }

    if (!user.phone) {
      throw new Error('No phone number configured for 2FA');
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 5 * 60 * 1000);

    await prisma.user.update({
      where: { id: userId },
      data: {
        resetPasswordOtp: code,
        resetPasswordExpires: expires
      }
    });

    const verification = { code, expiresIn: '5 minutes' };
    await this.sendNotifications(user, 'two_factor', req, verification);

    return { message: '2FA code sent to your phone' };
  }

  async enableTwoFactor(userId: number): Promise<{ message: string }> {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (!user.phone) {
      throw new Error('Please add a phone number first to enable two-factor authentication');
    }

    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true }
    });

    return { message: 'Two-factor authentication enabled successfully' };
  }

  async disableTwoFactor(userId: number): Promise<{ message: string }> {
    await prisma.user.update({
      where: { id: userId },
      data: { 
        twoFactorEnabled: false,
        resetPasswordOtp: null,
        resetPasswordExpires: null
      }
    });

    return { message: 'Two-factor authentication disabled' };
  }

  // --- PHONE VERIFICATION ---
  async sendPhoneVerificationCode(userId: number, req?: any): Promise<{ message: string; expiresIn: string }> {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (!user.phone) {
      throw new Error('No phone number associated with this account');
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 10 * 60 * 1000);

    // Use existing resetPassword fields since phoneVerification fields don't exist
    await prisma.user.update({
      where: { id: userId },
      data: {
        resetPasswordOtp: otp,
        resetPasswordExpires: expires,
      }
    });

    const verification = { code: otp, expiresIn: '10 minutes' };
    await this.sendNotifications(user, 'phone_verification', req, verification);

    return {
      message: 'Verification code sent to your phone',
      expiresIn: '10 minutes'
    };
  }

  async verifyPhoneCode(userId: number, code: string): Promise<{ message: string }> {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user || !user.resetPasswordOtp || !user.resetPasswordExpires) {
      throw new Error('Invalid verification code');
    }

    if (user.resetPasswordExpires < new Date()) {
      throw new Error('Verification code has expired');
    }

    if (user.resetPasswordOtp !== code) {
      throw new Error('Invalid verification code');
    }

    // Use existing verificationStatus field since phoneVerified doesn't exist
    await prisma.user.update({
      where: { id: userId },
      data: {
        verificationStatus: 'verified',
        resetPasswordOtp: null,
        resetPasswordExpires: null
      }
    });

    return { message: 'Phone number verified successfully' };
  }

  // --- EMAIL VERIFICATION ---
  async sendEmailVerification(userId: number, req?: any): Promise<{ message: string }> {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('User not found');
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    // Use existing resetPassword fields since emailVerification fields don't exist
    await prisma.user.update({
      where: { id: userId },
      data: {
        resetPasswordOtp: code,
        resetPasswordExpires: expires
      }
    });

    const verification = { code, expiresIn: '30 minutes' };
    await this.sendNotifications(user, 'email_verification', req, verification);

    return { message: 'Verification code sent to your email' };
  }

  async verifyEmailCode(userId: number, code: string): Promise<{ message: string }> {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user || !user.resetPasswordOtp || !user.resetPasswordExpires) {
      throw new Error('Invalid verification code');
    }

    if (user.resetPasswordExpires < new Date()) {
      throw new Error('Verification code has expired');
    }

    if (user.resetPasswordOtp !== code) {
      throw new Error('Invalid verification code');
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        verificationStatus: 'verified',
        resetPasswordOtp: null,
        resetPasswordExpires: null
      }
    });

    return { message: 'Email verified successfully' };
  }

  // Add this method to the AuthService class in src/services/auth.service.ts
  // Place it in the "--- USER QUERIES ---" section

   // --- PUBLIC USER CHECKS ---
  async checkEmailStatus(email: string): Promise<{
    exists: boolean;
    userType?: string;
    status?: string;
    verificationStatus?: any;
    hasPassword: boolean;
    message: string;
    nextAction?: 'login' | 'setup_password' | 'verify_account' | 'signup' | 'contact_support';
  }> {
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      return {
        exists: false,
        hasPassword: false,
        message: 'No account found with this email address',
        nextAction: 'signup'
      };
    }

    const hasPassword = !!(user.password);
    const userStatus = user.status;
    const verificationStatus = user.verificationStatus;
    const userType = user.userType;

    // Determine next action based on user state
    let nextAction: 'login' | 'setup_password' | 'verify_account' | 'signup' | 'contact_support' = 'login';
    let message = 'Account found';

    // Check if user is suspended or inactive
    if (userStatus === 'suspended') {
      return {
        exists: true,
        userType,
        status: userStatus,
        verificationStatus,
        hasPassword,
        message: 'Your account has been suspended. Please contact support.',
        nextAction: 'contact_support'
      };
    }

    // Check if user needs to set up password (service providers)
    if (!hasPassword && ['host', 'tourguide', 'agent'].includes(userType)) {
      return {
        exists: true,
        userType,
        status: userStatus,
        verificationStatus,
        hasPassword,
        message: 'Please set up your password to continue',
        nextAction: 'setup_password'
      };
    }

    // Check if user needs password but is guest (shouldn't happen, but handle it)
    if (!hasPassword && userType === 'guest') {
      return {
        exists: true,
        userType,
        status: userStatus,
        verificationStatus,
        hasPassword,
        message: 'Password setup required',
        nextAction: 'setup_password'
      };
    }

    // Check verification status for different user types
    if (verificationStatus !== 'verified') {
      if (userType === 'guest') {
        return {
          exists: true,
          userType,
          status: userStatus,
          verificationStatus,
          hasPassword,
          message: 'Please verify your account to continue',
          nextAction: 'verify_account'
        };
      } else {
        // Service providers with unverified status
        return {
          exists: true,
          userType,
          status: userStatus,
          verificationStatus,
          hasPassword,
          message: 'Account verification pending',
          nextAction: 'verify_account'
        };
      }
    }

    // Check overall status
    if (userStatus === 'pending') {
      return {
        exists: true,
        userType,
        status: userStatus,
        verificationStatus,
        hasPassword,
        message: 'Account is pending approval',
        nextAction: 'contact_support'
      };
    }

    if (userStatus === 'inactive') {
      return {
        exists: true,
        userType,
        status: userStatus,
        verificationStatus,
        hasPassword,
        message: 'Account is inactive. Please contact support.',
        nextAction: 'contact_support'
      };
    }

    // User is active, verified, and has password - ready to login
    if (userStatus === 'active' && verificationStatus === 'verified' && hasPassword) {
      return {
        exists: true,
        userType,
        status: userStatus,
        verificationStatus,
        hasPassword,
        message: 'Ready to sign in',
        nextAction: 'login'
      };
    }

    // Default case - something is not right
    return {
      exists: true,
      userType,
      status: userStatus,
      verificationStatus,
      hasPassword,
      message: 'Account status unclear. Please contact support.',
      nextAction: 'contact_support'
    };
  }

  // --- DOCUMENT MANAGEMENT ---
  async updateDocumentUrl(
    userId: number, 
    documentType: 'verification' | 'employment',
    documentUrl: string
  ): Promise<UserInfo> {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (user.userType !== 'tourguide') {
      throw new Error('Document updates are only available for tour guides');
    }

    const updateData: any = {};
    
    if (documentType === 'verification') {
      updateData.verificationDocument = documentUrl || null;
    } else if (documentType === 'employment') {
      updateData.employmentContract = documentUrl || null;
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData
    });

    return this.transformToUserInfo(updatedUser);
  }

  async getUserDocuments(userId: number): Promise<{
    verificationDocument?: string;
    employmentContract?: string;
    tourGuideType?: TourGuideType;
    documentVerificationStatus?: string;
    missingDocuments?: string[];
  }> {
    const user: any = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('User not found');
    }

    return {
      verificationDocument: user.verificationDocument || undefined,
      employmentContract: user.employmentContract || undefined,
      tourGuideType: (user as any).tourGuideType as TourGuideType || undefined,
      documentVerificationStatus: user.verificationStatus || 'pending',
      missingDocuments: this.getMissingDocuments(user)
    };
  }

  // --- OAUTH AUTHENTICATION ---
  async googleAuth(token: string, req?: any): Promise<AuthResponse> {
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: token,
        audience: config.googleClientId
      });
      
      const payload = ticket.getPayload();
      if (!payload) throw new Error('Invalid token');

      const oauthData: OAuthDto = {
        email: payload.email!,
        firstName: payload.given_name || '',
        lastName: payload.family_name || '',
        provider: 'google',
        providerId: payload.sub
      };

      return this.handleOAuth(oauthData, req);
    } catch (error) {
      throw new Error('Google authentication failed: '+error);
    }
  }

  async appleAuth(data: any, req?: any): Promise<AuthResponse> {
    const oauthData: OAuthDto = {
      email: data.email,
      firstName: data.firstName || '',
      lastName: data.lastName || '',
      provider: 'apple',
      providerId: data.providerId
    };

    return this.handleOAuth(oauthData, req);
  }

  private async handleOAuth(data: OAuthDto, req?: any): Promise<AuthResponse> {
    let user = await prisma.user.findUnique({
      where: { email: data.email }
    });

    let isNewUser = false;
    if (!user) {
      isNewUser = true;
      user = await prisma.user.create({
        data: {
          email: data.email,
          firstName: data.firstName || '',
          lastName: data.lastName || '',
          provider: data.provider,
          providerId: data.providerId,
          userType: 'guest',
          status: 'active',
          totalSessions: 1,
          preferredCommunication: 'email'
        }
      });
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          lastLogin: new Date(),
          totalSessions: { increment: 1 }
        }
      });
    }

    const { accessToken, refreshToken } = await this.generateTokens(user.id, user.email, user.userType);
    await this.createSession(user.id, refreshToken);

    const notificationType = isNewUser ? 'welcome' : 'login';
    await this.sendNotifications(user, notificationType, req);

    return { 
      user: this.transformToUserInfo(user), 
      accessToken, 
      refreshToken 
    };
  }

  // --- SESSION MANAGEMENT ---
  private async createSession(userId: number, refreshToken: string, deviceInfo?: any): Promise<UserSession> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const session = await prisma.userSession.create({
      data: {
        userId,
        sessionToken: this.generateSessionToken(),
        refreshToken,
        device: deviceInfo?.device,
        browser: deviceInfo?.browser,
        location: deviceInfo?.location,
        ipAddress: deviceInfo?.ipAddress,
        expiresAt
      }
    });

    return {
      id: session.id,
      userId: userId.toString(),
      device: session.device || undefined,
      browser: session.browser || undefined,
      location: session.location || undefined,
      ipAddress: session.ipAddress || undefined,
      isActive: session.isActive,
      lastActivity: session.lastActivity.toISOString(),
      createdAt: session.createdAt.toISOString()
    };
  }

  async refreshToken(data: RefreshTokenDto): Promise<AuthResponse> {
    const session = await prisma.userSession.findUnique({
      where: { refreshToken: data.refreshToken },
      include: { user: true }
    });

    if (!session || !session.isActive || session.expiresAt < new Date()) {
      throw new Error('Invalid or expired refresh token');
    }

    const { accessToken, refreshToken } = await this.generateTokens(session.user.id, session.user.email, session.user.userType);
    
    await prisma.userSession.update({
      where: { id: session.id },
      data: { 
        refreshToken,
        lastActivity: new Date()
      }
    });

    return {
      user: this.transformToUserInfo(session.user),
      accessToken,
      refreshToken
    };
  }

  async logout(refreshToken: string): Promise<void> {
    await prisma.userSession.updateMany({
      where: { refreshToken },
      data: { isActive: false }
    });
  }

  async logoutAllDevices(userId: number): Promise<void> {
    await prisma.userSession.updateMany({
      where: { userId },
      data: { isActive: false }
    });
  }

  // --- USER PROFILE MANAGEMENT ---
  async getUserProfile(userId: number): Promise<UserInfo> {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('User not found');
    }

    return this.transformToUserInfo(user);
  }

  async updateUserProfile(userId: number, data: UpdateUserProfileDto, req?: any): Promise<UserInfo> {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('User not found');
    }

    const updateData: any = {};

    // Handle basic profile fields
    if (data.firstName !== undefined) updateData.firstName = data.firstName;
    if (data.lastName !== undefined) updateData.lastName = data.lastName;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.phoneCountryCode !== undefined) updateData.phoneCountryCode = data.phoneCountryCode;

    // Handle location fields
    if (data.country !== undefined) updateData.country = data.country;
    if (data.state !== undefined) updateData.state = data.state;
    if (data.province !== undefined) updateData.province = data.province;
    if (data.city !== undefined) updateData.city = data.city;
    if (data.street !== undefined) updateData.street = data.street;

    // Handle postal codes
    if (data.zipCode !== undefined) updateData.zipCode = data.zipCode;
    if (data.postalCode !== undefined) updateData.postalCode = data.postalCode;
    if (data.postcode !== undefined) updateData.postcode = data.postcode;
    if (data.pinCode !== undefined) updateData.pinCode = data.pinCode;
    if (data.eircode !== undefined) updateData.eircode = data.eircode;
    if (data.cep !== undefined) updateData.cep = data.cep;

    // Handle preferences
    if (data.preferredCommunication !== undefined) updateData.preferredCommunication = data.preferredCommunication;
    if (data.verificationStatus !== undefined) updateData.verificationStatus = data.verificationStatus;

    // Handle tour guide fields
    if (data.bio !== undefined) updateData.bio = data.bio;
    if (data.experience !== undefined) updateData.experience = data.experience;
    if (data.languages !== undefined) {
      updateData.languages = data.languages ? JSON.stringify(data.languages) : null;
    }
    if (data.specializations !== undefined) {
      updateData.specializations = data.specializations ? JSON.stringify(data.specializations) : null;
    }
    if (data.licenseNumber !== undefined) updateData.licenseNumber = data.licenseNumber;
    if (data.certifications !== undefined) {
      updateData.certifications = data.certifications ? JSON.stringify(data.certifications) : null;
    }
    if (data.tourGuideType !== undefined) updateData.tourGuideType = data.tourGuideType;
    if (data.nationalId !== undefined) updateData.nationalId = data.nationalId;
    if (data.companyTIN !== undefined) updateData.companyTIN = data.companyTIN;
    if (data.companyName !== undefined) updateData.companyName = data.companyName;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData
    });

    await this.sendNotifications(updatedUser, 'profile_update', req);

    return this.transformToUserInfo(updatedUser);
  }

  async updateProfileImage(userId: number, imageUrl: string): Promise<UserInfo> {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { profileImage: imageUrl }
    });

    return this.transformToUserInfo(user);
  }

  // --- COMMUNICATION PREFERENCES ---
  async updateCommunicationPreferences(
    userId: number, 
    preferences: {
      preferredCommunication?: 'email' | 'sms' | 'both' | 'email_only' | 'sms_only';
    }
  ): Promise<UserInfo> {
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        preferredCommunication: preferences.preferredCommunication
      }
    });

    return this.transformToUserInfo(updatedUser);
  }

  // --- PASSWORD MANAGEMENT ---
  async changePassword(userId: number, data: ChangePasswordDto, req?: any): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('User not found');
    }

    const isServiceProvider = ['host', 'tourguide', 'agent'].includes(user.userType);
    if (user.password && !(isServiceProvider && !user.password)) {
      const isCurrentValid = await bcrypt.compare(data.currentPassword, user.password);
      if (!isCurrentValid) {
        throw new Error('Current password is incorrect');
      }
    }

    if (data.newPassword !== data.confirmPassword) {
      throw new Error('New passwords do not match');
    }

    const hashedNewPassword = await bcrypt.hash(data.newPassword, 10);
    
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { password: hashedNewPassword }
    });

    await this.sendNotifications(updatedUser, 'password_changed', req);
    await this.logoutAllDevices(userId);
  }

  async setupPassword(email: string, token: string, newPassword: string, req?: any): Promise<void> {
    const user = await prisma.user.findFirst({
      where: {
        email,
        password: null,
        userType: { in: ['host', 'tourguide', 'agent'] }
      }
    });

    if (!user) {
      throw new Error('Invalid request');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword }
    });

    await this.sendNotifications(updatedUser, 'password_changed', req);
  }
 
  async forgotPassword(email: string, req?: any): Promise<{ message: string }> {
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return { message: 'If a user with that email exists, a reset code has been sent.' };
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.user.update({
      where: { email },
      data: {
        resetPasswordOtp: otp,
        resetPasswordExpires: expires,
      },
    });

    const verification = { code: otp, expiresIn: '10 minutes' };
    await this.sendNotifications(user, 'password_reset', req, verification);
    
    return { message: 'A password reset code has been sent to your email and phone.' };
  }

  async verifyOtp(email: string, otp: string): Promise<{ message: string }> {
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !user.resetPasswordOtp || !user.resetPasswordExpires) {
      throw new Error('Invalid OTP or email.');
    }

    if (user.resetPasswordExpires < new Date()) {
      throw new Error('OTP has expired.');
    }

    if (user.resetPasswordOtp !== otp) {
      throw new Error('Invalid OTP.');
    }

    return { message: 'OTP verified successfully.' };
  }

  async resetPassword(email: string, otp: string, newPassword: string, req?: any): Promise<void> {
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || user.resetPasswordOtp !== otp || !user.resetPasswordExpires || user.resetPasswordExpires < new Date()) {
      throw new Error('Invalid or expired OTP. Please try again.');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const updatedUser = await prisma.user.update({
      where: { email },
      data: {
        password: hashedPassword,
        resetPasswordOtp: null,
        resetPasswordExpires: null
      },
    });

    await this.sendNotifications(updatedUser, 'password_changed', req);
  }

  // --- USER QUERIES ---
  async getAllUsers(filters?: any): Promise<UserInfo[]> {
    const users = await prisma.user.findMany({
      where: filters,
      orderBy: { createdAt: 'desc' }
    });

    return users.map((user: any) => this.transformToUserInfo(user));
  }

  async getUserByEmail(email: string): Promise<UserInfo | null> {
    const user = await prisma.user.findUnique({
      where: { email }
    });

    return user ? this.transformToUserInfo(user) : null;
  }

  async getUserById(id: number): Promise<UserInfo | null> {
    const user = await prisma.user.findUnique({
      where: { id }
    });

    return user ? this.transformToUserInfo(user) : null;
  }

  async getUsersByProvider(provider: 'manual' | 'google' | 'apple'): Promise<UserInfo[]> {
    const users = await prisma.user.findMany({
      where: { provider },
      orderBy: { createdAt: 'desc' }
    });

    return users.map((user: any) => this.transformToUserInfo(user));
  }

  async getUserSessions(userId: number): Promise<UserSession[]> {
    const sessions = await prisma.userSession.findMany({
      where: { userId, isActive: true },
      orderBy: { lastActivity: 'desc' }
    });

    return sessions.map((session: any) => ({
      id: session.id,
      userId: userId.toString(),
      device: session.device || undefined,
      browser: session.browser || undefined,
      location: session.location || undefined,
      ipAddress: session.ipAddress || undefined,
      isActive: session.isActive,
      lastActivity: session.lastActivity.toISOString(),
      createdAt: session.createdAt.toISOString()
    }));
  }

  // --- ADMIN OPERATIONS ---
  async adminCreateUser(data: RegisterDto & { status?: string }, req?: any): Promise<UserInfo> {
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email }
    });

    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    let firstName = data.firstName || '';
    let lastName = data.lastName || '';
    
    if (data.names && (!data.firstName || !data.lastName)) {
      const nameParts = data.names.trim().split(' ');
      firstName = nameParts[0] || '';
      lastName = nameParts.slice(1).join(' ') || '';
    }

    if (!firstName || !lastName) {
      throw new Error('First name and last name are required');
    }

    let hashedPassword = null;
    if (data.password) {
      hashedPassword = await bcrypt.hash(data.password, 10);
    }

    const tourGuideData = data.userType === 'tourguide' ? {
      bio: data.bio,
      experience: data.experience,
      languages: data.languages ? JSON.stringify(data.languages) : undefined,
      specializations: data.specializations ? JSON.stringify(data.specializations) : undefined,
      licenseNumber: data.licenseNumber,
      certifications: data.certifications ? JSON.stringify(data.certifications) : undefined,
    } : {};

    const user = await prisma.user.create({
      data: {
        email: data.email,
        firstName,
        lastName,
        password: hashedPassword,
        provider: data.provider || 'manual',
        phone: data.phone,
        phoneCountryCode: data.phoneCountryCode,
        country: data.country,
        state: data.state,
        province: data.province,
        city: data.city,
        street: data.street,
        zipCode: data.zipCode,
        postalCode: data.postalCode,
        postcode: data.postcode,
        pinCode: data.pinCode,
        eircode: data.eircode,
        cep: data.cep,
        userType: data.userType || 'guest',
        status: data.status || 'active',
        verificationStatus: data.status === 'active' ? 'verified' : 'unverified',
        preferredCommunication: data.preferredCommunication || 'both',
        ...tourGuideData
      }
    });

    await this.sendNotifications(user, 'welcome', req);
    return this.transformToUserInfo(user);
  }

  async adminUpdateUser(userId: number, data: AdminUpdateUserDto & UpdateUserProfileDto): Promise<UserInfo> {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('User not found');
    }

    const updateData: any = {};

    if (data.status !== undefined) updateData.status = data.status;
    if (data.userType !== undefined) updateData.userType = data.userType;
    if (data.email !== undefined) {
      const emailExists = await prisma.user.findUnique({
        where: { email: data.email }
      });
      if (emailExists && emailExists.id !== userId) {
        throw new Error('Email already in use');
      }
      updateData.email = data.email;
    }

    if (data.name) {
      const nameParts = data.name.trim().split(' ');
      updateData.firstName = nameParts[0] || '';
      updateData.lastName = nameParts.slice(1).join(' ') || '';
    } else {
      if (data.firstName !== undefined) updateData.firstName = data.firstName;
      if (data.lastName !== undefined) updateData.lastName = data.lastName;
    }

    // Copy all other fields from the profile update method
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.phoneCountryCode !== undefined) updateData.phoneCountryCode = data.phoneCountryCode;
    if (data.country !== undefined) updateData.country = data.country;
    if (data.preferredCommunication !== undefined) updateData.preferredCommunication = data.preferredCommunication;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData
    });

    return this.transformToUserInfo(updatedUser);
  }

  async adminDeleteUser(userId: number): Promise<{ message: string }> {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (user.userType === 'admin') {
      const adminCount = await prisma.user.count({
        where: { userType: 'admin' }
      });
      if (adminCount <= 1) {
        throw new Error('Cannot delete the last admin user');
      }
    }

    await prisma.$transaction([
      prisma.userSession.deleteMany({
        where: { userId }
      }),
      prisma.user.delete({
        where: { id: userId }
      })
    ]);

    return { message: 'User deleted successfully' };
  }

  async adminSuspendUser(userId: number, reason?: string, req?: any): Promise<UserInfo> {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (user.userType === 'admin') {
      throw new Error('Cannot suspend admin users');
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        status: 'suspended',
        hostNotes: reason ? `Suspended: ${reason}` : 'Account suspended by admin'
      }
    });

    await prisma.userSession.updateMany({
      where: { userId },
      data: { isActive: false }
    });

    await this.sendNotifications(updatedUser, 'account_status', req, undefined, { status: 'suspended' });
    return this.transformToUserInfo(updatedUser);
  }

  async adminActivateUser(userId: number, req?: any): Promise<UserInfo> {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('User not found');
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        status: 'active',
        verificationStatus: 'verified'
      }
    });

    await this.sendNotifications(updatedUser, 'account_status', req, undefined, { status: 'reactivated' });
    return this.transformToUserInfo(updatedUser);
  }

  async adminResetUserPassword(userId: number, req?: any): Promise<{ temporaryPassword: string }> {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('User not found');
    }

    const temporaryPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        hostNotes: 'Password reset by admin - temporary password assigned'
      }
    });

    await prisma.userSession.updateMany({
      where: { userId },
      data: { isActive: false }
    });

    await this.sendNotifications(updatedUser, 'password_changed', req);
    return { temporaryPassword };
  }

  // --- KYC METHODS ---
  async submitKYC(
    userId: number, 
    personalDetails: any, 
    addressDocumentUrl?: string
  ): Promise<{ user: UserInfo; requiresDocumentUpload: boolean }> {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('User not found');
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        firstName: personalDetails.fullName.split(' ')[0] || user.firstName,
        lastName: personalDetails.fullName.split(' ').slice(1).join(' ') || user.lastName,
        phone: personalDetails.phoneNumber,
        email: personalDetails.email,
        street: personalDetails.address,
        country: personalDetails.nationality,
        kycCompleted: true,
        kycSubmittedAt: new Date(),
        kycStatus: 'pending',
        addressDocument: addressDocumentUrl,
      }
    });

    if (updatedUser.phone) {
      try {
        await this.brevoSMSService.sendKYCStatusSMS(
          this.createSMSContext(updatedUser),
          'pending_review'
        );
      } catch (error) {
        console.error('Failed to send KYC SMS notification:', error);
      }
    }

    return {
      user: this.transformToUserInfo(updatedUser),
      requiresDocumentUpload: !addressDocumentUrl
    };
  }

  async getKYCStatus(userId: number): Promise<{
    kycCompleted: boolean;
    kycStatus: string;
    kycSubmittedAt?: string;
    requiresDocumentUpload: boolean;
  }> {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('User not found');
    }

    return {
      kycCompleted: user.kycCompleted,
      kycStatus: user.kycStatus || 'pending',
      kycSubmittedAt: user.kycSubmittedAt?.toISOString(),
      requiresDocumentUpload: !user.addressDocument
    };
  }

  async adminUpdateKYCStatus(
    userId: number, 
    status: 'approved' | 'rejected' | 'pending',
    req?: any
  ): Promise<UserInfo> {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('User not found');
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        kycStatus: status,
        verificationStatus: status === 'approved' ? 'verified' : 'pending'
      }
    });

    if (updatedUser.phone && status !== 'pending') {
      try {
        await this.brevoSMSService.sendKYCStatusSMS(
          this.createSMSContext(updatedUser),
          status
        );
      } catch (error) {
        console.error('Failed to send KYC status SMS:', error);
      }
    }

    return this.transformToUserInfo(updatedUser);
  }

  // --- STATISTICS ---
  async getUserStatistics(): Promise<any> {
    const [
      totalUsers, 
      usersByType, 
      usersByStatus, 
      recentRegistrations, 
      kycCompleted,
      twoFactorEnabled
    ] = await Promise.all([
      prisma.user.count(),
      
      prisma.user.groupBy({
        by: ['userType'],
        _count: true
      }),
      
      prisma.user.groupBy({
        by: ['status'],
        _count: true
      }),
      
      prisma.user.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          }
        }
      }),

      prisma.user.count({
        where: { kycCompleted: true }
      }),

      prisma.user.count({
        where: { twoFactorEnabled: true }
      })
    ]);

    return {
      totalUsers,
      usersByType: usersByType.map(item => ({
        type: item.userType,
        count: item._count
      })),
      usersByStatus: usersByStatus.map(item => ({
        status: item.status,
        count: item._count
      })),
      recentRegistrations,
      kycCompleted,
      twoFactorEnabled,
      kycCompletionRate: totalUsers > 0 ? (kycCompleted / totalUsers * 100).toFixed(1) : '0',
      twoFactorAdoptionRate: totalUsers > 0 ? (twoFactorEnabled / totalUsers * 100).toFixed(1) : '0'
    };
  }

  // --- UTILITY METHODS ---
  private getMissingDocuments(user: any): DocumentType[] {
    const missing: DocumentType[] = [];
    
    if (user.userType === 'tourguide') {
      if (!user.verificationDocument) {
        if (user.tourGuideType === 'freelancer') {
          missing.push('national_id');
        } else if (user.tourGuideType === 'employed') {
          missing.push('company_tin');
        }
      }
      
      if (user.tourGuideType === 'employed' && !user.employmentContract) {
        missing.push('employment_contract');
      }
    }
    
    return missing;
  }

  private getDocumentVerificationStatus(user: any): 'pending' | 'approved' | 'rejected' | 'none' {
    if (!user.verificationDocument) {
      return 'none';
    }
    
    if (user.verificationStatus === 'verified') {
      return 'approved';
    } else if (user.verificationStatus === 'rejected') {
      return 'rejected';
    }
    
    return 'pending';
  }

  private async generateTokens(userId: number, email: string, userType: string) {
    const accessToken = jwt.sign(
      { userId: userId.toString(), email, userType } as JwtPayload,
      config.jwtSecret,
      { expiresIn: '15m' }
    );

    const refreshToken = jwt.sign(
      { userId: userId.toString(), email, userType, type: 'refresh' },
      config.jwtSecret,
      { expiresIn: '30d' }
    );

    return { accessToken, refreshToken };
  }

  private generateSessionToken(): string {
    return jwt.sign(
      { type: 'session', timestamp: Date.now() },
      config.jwtSecret,
      { expiresIn: '30d' }
    );
  }

  private transformToUserInfo(user: any): UserInfo {
    let languages, specializations, certifications;
    try {
      languages = user.languages ? JSON.parse(user.languages) : undefined;
      specializations = user.specializations ? JSON.parse(user.specializations) : undefined;
      certifications = user.certifications ? JSON.parse(user.certifications) : undefined;
    } catch {
      languages = user.languages;
      specializations = user.specializations;
      certifications = user.certifications;
    }

    return {
      id: user.id,
      email: user.email,
      name: `${user.firstName} ${user.lastName}`.trim(),
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      phoneCountryCode: user.phoneCountryCode,
      profile: user.profileImage,
      country: user.country,
      state: user.state,
      province: user.province,
      city: user.city,
      street: user.street,
      zipCode: user.zipCode,
      postalCode: user.postalCode,
      postcode: user.postcode,
      pinCode: user.pinCode,
      eircode: user.eircode,
      cep: user.cep,
      status: user.status,
      userType: user.userType,
      provider: user.provider,
      providerId: user.providerId,
      bio: user.bio,
      experience: user.experience,
      languages,
      specializations,
      rating: user.rating,
      totalTours: user.totalTours,
      isVerified: user.isVerified,
      licenseNumber: user.licenseNumber,
      certifications,
      tourGuideType: user.tourGuideType,
      nationalId: user.nationalId,
      companyTIN: user.companyTIN,
      companyName: user.companyName,
      verificationDocument: user.verificationDocument,
      employmentContract: user.employmentContract,
      verificationStatus: user.verificationStatus,
      preferredCommunication: user.preferredCommunication,
      hostNotes: user.hostNotes,
      averageRating: user.averageRating,
      created_at: user.createdAt.toISOString(),
      updated_at: user.updatedAt.toISOString(),
      last_login: user.lastLogin?.toISOString(),
      total_sessions: user.totalSessions,
      twoFactorEnabled: user.twoFactorEnabled,
      kycCompleted: user.kycCompleted,
      kycStatus: user.kycStatus,
      kycSubmittedAt: user.kycSubmittedAt?.toISOString(),
      addressDocument: user.addressDocument
    };
  }
}