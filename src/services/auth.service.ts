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

    const hashedPassword = await bcrypt.hash(data.password, 10);
    
    const user = await prisma.user.create({
      data: {
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        password: hashedPassword,
        provider: 'manual',
        phone: data.phone,
        phoneCountryCode: data.phoneCountryCode || 'US',
        country: data.country,
        userType: data.userType || 'guest'
      }
    });

    const { accessToken, refreshToken } = await this.generateTokens(user.id, user.email);
    await this.createSession(user.id, refreshToken);

    return { 
      user: this.transformToUserInfo(user), 
      accessToken, 
      refreshToken 
    };
  }

  async login(data: LoginDto): Promise<AuthResponse> {
    const user = await prisma.user.findUnique({
      where: { email: data.email }
    });

    if (!user || !user.password) {
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

    const { accessToken, refreshToken } = await this.generateTokens(user.id, user.email);
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
      throw new Error('Google authentication failed');
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

    const { accessToken, refreshToken } = await this.generateTokens(user.id, user.email);
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

    const { accessToken, refreshToken } = await this.generateTokens(session.user.id, session.user.email);
    
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
        cep: data.cep
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

    if (!user || !user.password) {
      throw new Error('User not found or invalid account type');
    }

    const isCurrentValid = await bcrypt.compare(data.currentPassword, user.password);
    if (!isCurrentValid) {
      throw new Error('Current password is incorrect');
    }

    if (data.newPassword !== data.confirmPassword) {
      throw new Error('New passwords do not match');
    }

    const hashedNewPassword = await bcrypt.hash(data.newPassword, 10);
    
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedNewPassword }
    });



    // Invalidate all sessions for security
    await this.logoutAllDevices(userId);
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
        resetPasswordExpires: null,
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

    return sessions.map((session: { id: any; device: any; browser: any; location: any; ipAddress: any; isActive: any; lastActivity: { toISOString: () => any; }; createdAt: { toISOString: () => any; }; }) => ({
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
  private async generateTokens(userId: number, email: string) {
    const accessToken = jwt.sign(
      { userId: userId.toString(), email } as JwtPayload,
      config.jwtSecret,
      { expiresIn: '15m' }
    );

    const refreshToken = jwt.sign(
      { userId: userId.toString(), email, type: 'refresh' },
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