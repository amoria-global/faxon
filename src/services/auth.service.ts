import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { PrismaClient } from '@prisma/client';
import { config } from '../config/config';
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
  RefreshTokenDto
} from '../types/auth.types';

const prisma = new PrismaClient();
const googleClient = new OAuth2Client(config.googleClientId);

export class AuthService {
  
  // --- REGISTRATION & LOGIN ---
  async register(data: RegisterDto): Promise<AuthResponse> {
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email }
    });

    if (existingUser) {
      throw new Error('User already exists');
    }

    // Handle name parsing
    let firstName = data.firstName || '';
    let lastName = data.lastName || '';
    
    // If names (full name) is provided instead of firstName/lastName
    if (data.names && (!data.firstName || !data.lastName)) {
      const nameParts = data.names.trim().split(' ');
      firstName = nameParts[0] || '';
      lastName = nameParts.slice(1).join(' ') || '';
    }

    // Validate required fields for all users
    if (!firstName || !lastName) {
      throw new Error('First name and last name are required');
    }

    // For service providers (host, tourguide, agent), password is optional
    const isServiceProvider = ['host', 'tourguide', 'agent'].includes(data.userType || '');
    let hashedPassword = null;

    if (data.password) {
      hashedPassword = await bcrypt.hash(data.password, 10);
    } else if (!isServiceProvider) {
      // For regular users (guest), password is required
      throw new Error('Password is required');
    }
    
    // Prepare tour guide specific data
    const tourGuideData = data.userType === 'tourguide' ? {
      bio: data.bio,
      experience: data.experience,
      languages: data.languages ? JSON.stringify(data.languages) : null,
      specializations: data.specializations ? JSON.stringify(data.specializations) : null,
      licenseNumber: data.licenseNumber,
      certifications: data.certifications ? JSON.stringify(data.certifications) : null,
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
        status: isServiceProvider ? 'pending' : 'active', // Service providers need approval
        verificationStatus: isServiceProvider ? 'pending' : 'unverified',
        ...tourGuideData
      }
    });

    // Generate application ID for service providers
    const applicationId = isServiceProvider ? `APP-${user.id}-${Date.now()}` : undefined;

    const { accessToken, refreshToken } = await this.generateTokens(user.id, user.email, user.userType);
    await this.createSession(user.id, refreshToken);

    return { 
      user: this.transformToUserInfo(user), 
      accessToken, 
      refreshToken,
      applicationId
    };
  }

  async login(data: LoginDto): Promise<AuthResponse> {
    const user = await prisma.user.findUnique({
      where: { email: data.email }
    });

    if (!user) {
      throw new Error('Invalid credentials');
    }

    // Check if user is a service provider pending password setup
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

    // Update last login and session count
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
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

  // --- OAUTH AUTHENTICATION ---
  async googleAuth(token: string): Promise<AuthResponse> {
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

      return this.handleOAuth(oauthData);
    } catch (error) {
      throw new Error('Google authentication failed: '+error);
    }
  }

  async appleAuth(data: any): Promise<AuthResponse> {
    const oauthData: OAuthDto = {
      email: data.email,
      firstName: data.firstName || '',
      lastName: data.lastName || '',
      provider: 'apple',
      providerId: data.providerId
    };

    return this.handleOAuth(oauthData);
  }

  private async handleOAuth(data: OAuthDto): Promise<AuthResponse> {
    let user = await prisma.user.findUnique({
      where: { email: data.email }
    });

    if (!user) {
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
      // Update login info for existing OAuth user
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

    return { 
      user: this.transformToUserInfo(user), 
      accessToken, 
      refreshToken 
    };
  }

  // --- SESSION MANAGEMENT ---
  private async createSession(userId: number, refreshToken: string, deviceInfo?: any): Promise<UserSession> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

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
    
    // Update session with new refresh token
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

  async updateUserProfile(userId: number, data: UpdateUserProfileDto): Promise<UserInfo> {
    // Prepare tour guide specific data
    const tourGuideData = data.bio || data.experience || data.languages || data.specializations || data.licenseNumber || data.certifications ? {
      bio: data.bio,
      experience: data.experience,
      languages: data.languages ? JSON.stringify(data.languages) : undefined,
      specializations: data.specializations ? JSON.stringify(data.specializations) : undefined,
      licenseNumber: data.licenseNumber,
      certifications: data.certifications ? JSON.stringify(data.certifications) : undefined,
    } : {};

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
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
        verificationStatus: data.verificationStatus,
        preferredCommunication: data.preferredCommunication,
        ...tourGuideData
      }
    });

    return this.transformToUserInfo(user);
  }

  async updateProfileImage(userId: number, imageUrl: string): Promise<UserInfo> {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { profileImage: imageUrl }
    });

    return this.transformToUserInfo(user);
  }

  // --- PASSWORD MANAGEMENT ---
  async changePassword(userId: number, data: ChangePasswordDto): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('User not found');
    }

    // If user is a service provider without password, skip current password check
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

    // Invalidate all sessions for security
    await this.logoutAllDevices(userId);
  }

  // --- PASSWORD SETUP FOR SERVICE PROVIDERS ---
  async setupPassword(email: string, token: string, newPassword: string): Promise<void> {
    // Verify the token and get user
    const user = await prisma.user.findFirst({
      where: {
        email,
        password: null, // User without password
        userType: { in: ['host', 'tourguide', 'agent'] }
      }
    });

    if (!user) {
      throw new Error('Invalid request');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword
      }
    });
  }
 
  // --- FORGOT PASSWORD ---
  async forgotPassword(email: string): Promise<{ message: string }> {
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      // For security, don't reveal if the user exists or not
      return { message: 'If a user with that email exists, a reset code has been sent.' };
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 10 * 60 * 1000); // OTP expires in 10 minutes

    await prisma.user.update({
      where: { email },
      data: {
        resetPasswordOtp: otp,
        resetPasswordExpires: expires,
      },
    });

    // TODO: Implement a real email sending service here! (e.g., Nodemailer, SendGrid)
    console.log(`Password reset OTP for ${email}: ${otp}`);
    
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

  async resetPassword(email: string, otp: string, newPassword: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || user.resetPasswordOtp !== otp || !user.resetPasswordExpires || user.resetPasswordExpires < new Date()) {
      throw new Error('Invalid or expired OTP. Please try again.');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { email },
      data: {
        password: hashedPassword,
        resetPasswordOtp: null,
        resetPasswordExpires: null
      },
    });
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
    // Parse JSON strings for tour guide fields
    let languages, specializations, certifications;
    try {
      languages = user.languages ? JSON.parse(user.languages) : undefined;
      specializations = user.specializations ? JSON.parse(user.specializations) : undefined;
      certifications = user.certifications ? JSON.parse(user.certifications) : undefined;
    } catch {
      // If parsing fails, keep as is
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
      profile: user.profileImage, // Map profileImage to profile
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
      // Tour Guide specific fields
      bio: user.bio,
      experience: user.experience,
      languages,
      specializations,
      rating: user.rating,
      totalTours: user.totalTours,
      isVerified: user.isVerified,
      licenseNumber: user.licenseNumber,
      certifications,
      // Additional fields
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