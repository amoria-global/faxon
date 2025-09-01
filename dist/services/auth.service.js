"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const google_auth_library_1 = require("google-auth-library");
const client_1 = require("@prisma/client");
const config_1 = require("../config/config");
const prisma = new client_1.PrismaClient();
const googleClient = new google_auth_library_1.OAuth2Client(config_1.config.googleClientId);
class AuthService {
    // --- REGISTRATION & LOGIN ---
    async register(data) {
        const existingUser = await prisma.user.findUnique({
            where: { email: data.email }
        });
        if (existingUser) {
            throw new Error('User already exists');
        }
        const hashedPassword = await bcryptjs_1.default.hash(data.password, 10);
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
                userType: data.userType || 'host'
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
    async login(data) {
        const user = await prisma.user.findUnique({
            where: { email: data.email }
        });
        if (!user || !user.password) {
            throw new Error('Invalid credentials');
        }
        const isValid = await bcryptjs_1.default.compare(data.password, user.password);
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
    async googleAuth(token) {
        try {
            const ticket = await googleClient.verifyIdToken({
                idToken: token,
                audience: config_1.config.googleClientId
            });
            const payload = ticket.getPayload();
            if (!payload)
                throw new Error('Invalid token');
            const oauthData = {
                email: payload.email,
                firstName: payload.given_name || '',
                lastName: payload.family_name || '',
                provider: 'google',
                providerId: payload.sub
            };
            return this.handleOAuth(oauthData);
        }
        catch (error) {
            throw new Error('Google authentication failed');
        }
    }
    async appleAuth(data) {
        const oauthData = {
            email: data.email,
            firstName: data.firstName || '',
            lastName: data.lastName || '',
            provider: 'apple',
            providerId: data.providerId
        };
        return this.handleOAuth(oauthData);
    }
    async handleOAuth(data) {
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
        }
        else {
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
    async createSession(userId, refreshToken, deviceInfo) {
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
    async refreshToken(data) {
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
    async logout(refreshToken) {
        await prisma.userSession.updateMany({
            where: { refreshToken },
            data: { isActive: false }
        });
    }
    async logoutAllDevices(userId) {
        await prisma.userSession.updateMany({
            where: { userId },
            data: { isActive: false }
        });
    }
    // --- USER PROFILE MANAGEMENT ---
    async getUserProfile(userId) {
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });
        if (!user) {
            throw new Error('User not found');
        }
        return this.transformToUserInfo(user);
    }
    async updateUserProfile(userId, data) {
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
    async updateProfileImage(userId, imageUrl) {
        const user = await prisma.user.update({
            where: { id: userId },
            data: { profileImage: imageUrl }
        });
        return this.transformToUserInfo(user);
    }
    // --- PASSWORD MANAGEMENT ---
    async changePassword(userId, data) {
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });
        if (!user || !user.password) {
            throw new Error('User not found or invalid account type');
        }
        const isCurrentValid = await bcryptjs_1.default.compare(data.currentPassword, user.password);
        if (!isCurrentValid) {
            throw new Error('Current password is incorrect');
        }
        if (data.newPassword !== data.confirmPassword) {
            throw new Error('New passwords do not match');
        }
        const hashedNewPassword = await bcryptjs_1.default.hash(data.newPassword, 10);
        await prisma.user.update({
            where: { id: userId },
            data: { password: hashedNewPassword }
        });
        // Invalidate all sessions for security
        await this.logoutAllDevices(userId);
    }
    // --- USER QUERIES ---
    async getAllUsers(filters) {
        const users = await prisma.user.findMany({
            where: filters,
            orderBy: { createdAt: 'desc' }
        });
        return users.map(user => this.transformToUserInfo(user));
    }
    async getUserByEmail(email) {
        const user = await prisma.user.findUnique({
            where: { email }
        });
        return user ? this.transformToUserInfo(user) : null;
    }
    async getUserById(id) {
        const user = await prisma.user.findUnique({
            where: { id }
        });
        return user ? this.transformToUserInfo(user) : null;
    }
    async getUsersByProvider(provider) {
        const users = await prisma.user.findMany({
            where: { provider },
            orderBy: { createdAt: 'desc' }
        });
        return users.map(user => this.transformToUserInfo(user));
    }
    async getUserSessions(userId) {
        const sessions = await prisma.userSession.findMany({
            where: { userId, isActive: true },
            orderBy: { lastActivity: 'desc' }
        });
        return sessions.map(session => ({
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
    async generateTokens(userId, email) {
        const accessToken = jsonwebtoken_1.default.sign({ userId: userId.toString(), email }, config_1.config.jwtSecret, { expiresIn: '15m' });
        const refreshToken = jsonwebtoken_1.default.sign({ userId: userId.toString(), email, type: 'refresh' }, config_1.config.jwtSecret, { expiresIn: '30d' });
        return { accessToken, refreshToken };
    }
    generateSessionToken() {
        return jsonwebtoken_1.default.sign({ type: 'session', timestamp: Date.now() }, config_1.config.jwtSecret, { expiresIn: '30d' });
    }
    transformToUserInfo(user) {
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
    sanitizeUser(user) {
        const { password, ...sanitized } = user;
        return sanitized;
    }
}
exports.AuthService = AuthService;
