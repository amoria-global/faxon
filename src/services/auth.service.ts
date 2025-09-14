// src/services/auth.service.ts
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { PrismaClient, Prisma } from '@prisma/client';
import { config } from '../config/config';
import { BrevoMailingService } from '../utils/brevo.auth';
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
  AdminUpdateUserDto
} from '../types/auth.types';

const prisma = new PrismaClient();
const googleClient = new OAuth2Client(config.googleClientId);

export class AuthService {
  private brevoService: BrevoMailingService;

  constructor() {
    this.brevoService = new BrevoMailingService();
  }

  // --- HELPER METHODS FOR EMAIL CONTEXT ---
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
        ...tourGuideData
      }
    });

    const applicationId = isServiceProvider ? `APP-${user.id}-${Date.now()}` : undefined;
    const { accessToken, refreshToken } = await this.generateTokens(user.id, user.email, user.userType);
    await this.createSession(user.id, refreshToken);

    // Send welcome email
    try {
      const mailingContext = this.createMailingContext(user, this.extractSecurityInfo(req));
      
      if (isServiceProvider) {
        // For service providers, send email with setup instructions
        // You might want to create a separate method for this
        await this.brevoService.sendWelcomeEmail(mailingContext);
      } else {
        // For regular users, send standard welcome email
        await this.brevoService.sendWelcomeEmail(mailingContext);
      }
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError);
      // Don't break registration if email fails
    }

    return { 
      user: this.transformToUserInfo(user), 
      accessToken, 
      refreshToken,
      applicationId
    };
  }

  async login(data: LoginDto, req?: any): Promise<AuthResponse> {
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

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLogin: new Date(),
        totalSessions: { increment: 1 }
      }
    });

    const { accessToken, refreshToken } = await this.generateTokens(user.id, user.email, user.userType);
    await this.createSession(user.id, refreshToken);

    // Send login notification (optional, can be enabled/disabled)
    try {
      const securityInfo = this.extractSecurityInfo(req);
      if (securityInfo) {
        const mailingContext = this.createMailingContext(updatedUser, securityInfo);
        await this.brevoService.sendLoginNotification(mailingContext);
      }
    } catch (emailError) {
      console.error('Failed to send login notification:', emailError);
      // Don't break login if email fails
    }

    return { 
      user: this.transformToUserInfo(updatedUser), 
      accessToken, 
      refreshToken 
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
          totalSessions: 1
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

    // Send appropriate email notification
    try {
      const securityInfo = this.extractSecurityInfo(req);
      const mailingContext = this.createMailingContext(user, securityInfo);
      
      if (isNewUser) {
        await this.brevoService.sendWelcomeEmail(mailingContext);
      } else {
        await this.brevoService.sendLoginNotification(mailingContext);
      }
    } catch (emailError) {
      console.error('Failed to send OAuth email notification:', emailError);
    }

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

  console.log('Updating user profile with data:', data);

  // Prepare update data object
  const updateData: any = {};

  // Handle name fields
  if (data.firstName !== undefined) updateData.firstName = data.firstName;
  if (data.lastName !== undefined) updateData.lastName = data.lastName;

  // Handle contact information
  if (data.phone !== undefined) updateData.phone = data.phone;
  if (data.phoneCountryCode !== undefined) updateData.phoneCountryCode = data.phoneCountryCode;

  // Handle location fields
  if (data.country !== undefined) updateData.country = data.country;
  if (data.state !== undefined) updateData.state = data.state;
  if (data.province !== undefined) updateData.province = data.province;
  if (data.city !== undefined) updateData.city = data.city;
  if (data.street !== undefined) updateData.street = data.street;

  // Handle all possible address/postal code fields
  if (data.zipCode !== undefined) updateData.zipCode = data.zipCode;
  if (data.postalCode !== undefined) updateData.postalCode = data.postalCode;
  if (data.postcode !== undefined) updateData.postcode = data.postcode;
  if (data.pinCode !== undefined) updateData.pinCode = data.pinCode;
  if (data.eircode !== undefined) updateData.eircode = data.eircode;
  if (data.cep !== undefined) updateData.cep = data.cep;

  // Handle additional address fields
  if (data.district !== undefined) updateData.district = data.district;
  if (data.county !== undefined) updateData.county = data.county;
  if (data.region !== undefined) updateData.region = data.region;

  // Handle other profile fields
  if (data.verificationStatus !== undefined) updateData.verificationStatus = data.verificationStatus;
  if (data.preferredCommunication !== undefined) updateData.preferredCommunication = data.preferredCommunication;

  // Handle tour guide specific fields if provided
  const tourGuideData: any = {};
  if (data.bio !== undefined) tourGuideData.bio = data.bio;
  if (data.experience !== undefined) tourGuideData.experience = data.experience;
  if (data.languages !== undefined) {
    tourGuideData.languages = data.languages ? JSON.stringify(data.languages) : null;
  }
  if (data.specializations !== undefined) {
    tourGuideData.specializations = data.specializations ? JSON.stringify(data.specializations) : null;
  }
  if (data.licenseNumber !== undefined) tourGuideData.licenseNumber = data.licenseNumber;
  if (data.certifications !== undefined) {
    tourGuideData.certifications = data.certifications ? JSON.stringify(data.certifications) : null;
  }

  // Merge tour guide data if any exists
  Object.assign(updateData, tourGuideData);

  console.log('Final update data:', updateData);

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: updateData
  });

  console.log('User updated successfully:', updatedUser.id);

  // Send profile update notification
  try {
    const securityInfo = this.extractSecurityInfo(req);
    const mailingContext = this.createMailingContext(updatedUser, securityInfo);
    await this.brevoService.sendProfileUpdateNotification(mailingContext);
  } catch (emailError) {
    console.error('Failed to send profile update notification:', emailError);
  }

  return this.transformToUserInfo(updatedUser);
}

// And make sure you have the updateProfileImage method:
async updateProfileImage(userId: number, imageUrl: string): Promise<UserInfo> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { profileImage: imageUrl }
  });

  return this.transformToUserInfo(user);
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
    
    await prisma.user.update({
      where: { id: userId },
      data: { 
        password: hashedNewPassword
      }
    });

    // Send password changed notification
    try {
      const securityInfo = this.extractSecurityInfo(req);
      const mailingContext = this.createMailingContext(user, securityInfo);
      await this.brevoService.sendPasswordChangedNotification(mailingContext);
    } catch (emailError) {
      console.error('Failed to send password changed notification:', emailError);
    }

    await this.logoutAllDevices(userId);
  }

  // --- PASSWORD SETUP FOR SERVICE PROVIDERS ---
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
      data: {
        password: hashedPassword
      }
    });

    // Send password setup confirmation
    try {
      const securityInfo = this.extractSecurityInfo(req);
      const mailingContext = this.createMailingContext(updatedUser, securityInfo);
      await this.brevoService.sendPasswordChangedNotification(mailingContext);
    } catch (emailError) {
      console.error('Failed to send password setup notification:', emailError);
    }
  }
 
  // --- FORGOT PASSWORD ---
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

    // Send password reset OTP
    try {
      const securityInfo = this.extractSecurityInfo(req);
      const verificationInfo = {
        code: otp,
        expiresIn: '10 minutes'
      };
      const mailingContext = this.createMailingContext(user, securityInfo, verificationInfo);
      await this.brevoService.sendPasswordResetOTP(mailingContext);
    } catch (emailError) {
      console.error('Failed to send password reset OTP:', emailError);
      throw new Error('Failed to send reset code. Please try again.');
    }
    
    return { message: 'A password reset code has been sent to your email.' };
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

    // Send password reset confirmation
    try {
      const securityInfo = this.extractSecurityInfo(req);
      const mailingContext = this.createMailingContext(updatedUser, securityInfo);
      await this.brevoService.sendPasswordChangedNotification(mailingContext);
    } catch (emailError) {
      console.error('Failed to send password reset confirmation:', emailError);
    }
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

  // --- ADMIN CRUD OPERATIONS ---
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
        ...tourGuideData
      }
    });

    // Send welcome email for admin-created users
    try {
      const mailingContext = this.createMailingContext(user, this.extractSecurityInfo(req));
      await this.brevoService.sendWelcomeEmail(mailingContext);
    } catch (emailError) {
      console.error('Failed to send welcome email for admin-created user:', emailError);
    }

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

    // Profile fields
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.phoneCountryCode !== undefined) updateData.phoneCountryCode = data.phoneCountryCode;
    if (data.country !== undefined) updateData.country = data.country;
    if (data.state !== undefined) updateData.state = data.state;
    if (data.province !== undefined) updateData.province = data.province;
    if (data.city !== undefined) updateData.city = data.city;
    if (data.street !== undefined) updateData.street = data.street;
    if (data.zipCode !== undefined) updateData.zipCode = data.zipCode;
    if (data.postalCode !== undefined) updateData.postalCode = data.postalCode;
    if (data.postcode !== undefined) updateData.postcode = data.postcode;
    if (data.pinCode !== undefined) updateData.pinCode = data.pinCode;
    if (data.eircode !== undefined) updateData.eircode = data.eircode;
    if (data.cep !== undefined) updateData.cep = data.cep;
    if (data.verificationStatus !== undefined) updateData.verificationStatus = data.verificationStatus;
    if (data.preferredCommunication !== undefined) updateData.preferredCommunication = data.preferredCommunication;

    // Tour guide specific fields
    if (data.bio !== undefined) updateData.bio = data.bio;
    if (data.experience !== undefined) updateData.experience = data.experience;
    if (data.languages !== undefined) {
      updateData.languages = data.languages ? JSON.stringify(data.languages) : Prisma.DbNull;
    }
    if (data.specializations !== undefined) {
      updateData.specializations = data.specializations ? JSON.stringify(data.specializations) : Prisma.DbNull;
    }
    if (data.licenseNumber !== undefined) updateData.licenseNumber = data.licenseNumber;
    if (data.certifications !== undefined) {
      updateData.certifications = data.certifications ? JSON.stringify(data.certifications) : Prisma.DbNull;
    }

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

    // Send account suspension notification
    try {
      const securityInfo = this.extractSecurityInfo(req);
      const mailingContext = this.createMailingContext(updatedUser, securityInfo);
      await this.brevoService.sendAccountStatusChange(mailingContext, 'suspended');
    } catch (emailError) {
      console.error('Failed to send suspension notification:', emailError);
    }

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

    // Send account reactivation notification
    try {
      const securityInfo = this.extractSecurityInfo(req);
      const mailingContext = this.createMailingContext(updatedUser, securityInfo);
      await this.brevoService.sendAccountStatusChange(mailingContext, 'reactivated');
    } catch (emailError) {
      console.error('Failed to send reactivation notification:', emailError);
    }

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

    // Send password reset notification
    try {
      const securityInfo = this.extractSecurityInfo(req);
      const mailingContext = this.createMailingContext(updatedUser, securityInfo);
      await this.brevoService.sendPasswordChangedNotification(mailingContext);
    } catch (emailError) {
      console.error('Failed to send admin password reset notification:', emailError);
    }

    return { temporaryPassword };
  }

  async getUserStatistics(): Promise<any> {
    const [totalUsers, usersByType, usersByStatus, recentRegistrations] = await Promise.all([
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
      recentRegistrations
    };
  }

  // --- UTILITY METHODS ---
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
      verificationStatus: user.verificationStatus,
      preferredCommunication: user.preferredCommunication,
      hostNotes: user.hostNotes,
      averageRating: user.averageRating,
      created_at: user.createdAt.toISOString(),
      updated_at: user.updatedAt.toISOString(),
      last_login: user.lastLogin?.toISOString(),
      total_sessions: user.totalSessions,
      twoFactorEnabled: user.twoFactorEnabled
    };
  }

  private sanitizeUser(user: any) {
    const { password, ...sanitized } = user;
    return sanitized;
  }
}