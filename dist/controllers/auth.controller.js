"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const auth_service_1 = require("../services/auth.service");
const authService = new auth_service_1.AuthService();
class AuthController {
    async register(req, res, next) {
        try {
            const result = await authService.register(req.body);
            res.status(201).json(result);
        }
        catch (error) {
            res.status(400).json({ message: error.message });
        }
    }
    async login(req, res, next) {
        try {
            const result = await authService.login(req.body);
            res.json(result);
        }
        catch (error) {
            res.status(401).json({ message: error.message });
        }
    }
    async googleAuth(req, res, next) {
        try {
            const { token } = req.body;
            const result = await authService.googleAuth(token);
            res.json(result);
        }
        catch (error) {
            res.status(401).json({ message: error.message });
        }
    }
    async appleAuth(req, res, next) {
        try {
            const result = await authService.appleAuth(req.body);
            res.json(result);
        }
        catch (error) {
            res.status(401).json({ message: error.message });
        }
    }
    // --- TOKEN MANAGEMENT ---
    async refreshToken(req, res, next) {
        try {
            const result = await authService.refreshToken(req.body);
            res.json(result);
        }
        catch (error) {
            res.status(401).json({ message: error.message });
        }
    }
    async logout(req, res, next) {
        try {
            const { refreshToken } = req.body;
            await authService.logout(refreshToken);
            res.json({ message: 'Logged out successfully' });
        }
        catch (error) {
            res.status(400).json({ message: error.message });
        }
    }
    async logoutAllDevices(req, res, next) {
        try {
            if (!req.user?.userId) {
                return res.status(401).json({ message: 'User not authenticated' });
            }
            await authService.logoutAllDevices(parseInt(req.user.userId));
            res.json({ message: 'Logged out from all devices successfully' });
        }
        catch (error) {
            res.status(400).json({ message: error.message });
        }
    }
    // --- USER PROFILE MANAGEMENT ---
    async getCurrentUser(req, res, next) {
        try {
            if (!req.user?.userId) {
                return res.status(401).json({ message: 'User not authenticated' });
            }
            const user = await authService.getUserProfile(parseInt(req.user.userId));
            res.json(user);
        }
        catch (error) {
            res.status(500).json({ message: error.message });
        }
    }
    async updateProfile(req, res, next) {
        try {
            if (!req.user?.userId) {
                return res.status(401).json({ message: 'User not authenticated' });
            }
            const user = await authService.updateUserProfile(parseInt(req.user.userId), req.body);
            res.json(user);
        }
        catch (error) {
            res.status(400).json({ message: error.message });
        }
    }
    async updateProfileImage(req, res, next) {
        try {
            if (!req.user?.userId) {
                return res.status(401).json({ message: 'User not authenticated' });
            }
            const { imageUrl } = req.body;
            const user = await authService.updateProfileImage(parseInt(req.user.userId), imageUrl);
            res.json(user);
        }
        catch (error) {
            res.status(400).json({ message: error.message });
        }
    }
    async changePassword(req, res, next) {
        try {
            if (!req.user?.userId) {
                return res.status(401).json({ message: 'User not authenticated' });
            }
            await authService.changePassword(parseInt(req.user.userId), req.body);
            res.json({ message: 'Password changed successfully' });
        }
        catch (error) {
            res.status(400).json({ message: error.message });
        }
    }
    // --- SESSION MANAGEMENT ---
    async getUserSessions(req, res, next) {
        try {
            if (!req.user?.userId) {
                return res.status(401).json({ message: 'User not authenticated' });
            }
            const sessions = await authService.getUserSessions(parseInt(req.user.userId));
            res.json(sessions);
        }
        catch (error) {
            res.status(500).json({ message: error.message });
        }
    }
    // --- USER QUERIES (Admin/Protected) ---
    async getAllUsers(req, res, next) {
        try {
            const users = await authService.getAllUsers(req.query);
            res.json(users);
        }
        catch (error) {
            res.status(500).json({ message: error.message });
        }
    }
    async getUserByEmail(req, res, next) {
        try {
            const { email } = req.params;
            const user = await authService.getUserByEmail(email);
            if (!user) {
                return res.status(404).json({ message: 'User not found' });
            }
            res.json(user);
        }
        catch (error) {
            res.status(500).json({ message: error.message });
        }
    }
    async getUserById(req, res, next) {
        try {
            const { id } = req.params;
            const userId = parseInt(id);
            if (isNaN(userId)) {
                return res.status(400).json({ message: 'Invalid user ID' });
            }
            const user = await authService.getUserById(userId);
            if (!user) {
                return res.status(404).json({ message: 'User not found' });
            }
            res.json(user);
        }
        catch (error) {
            res.status(500).json({ message: error.message });
        }
    }
    async getUsersByProvider(req, res, next) {
        try {
            const { provider } = req.params;
            if (!['manual', 'google', 'apple'].includes(provider)) {
                return res.status(400).json({ message: 'Invalid provider' });
            }
            const users = await authService.getUsersByProvider(provider);
            res.json(users);
        }
        catch (error) {
            res.status(500).json({ message: error.message });
        }
    }
}
exports.AuthController = AuthController;
