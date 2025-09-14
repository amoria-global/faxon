"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const auth_service_1 = require("../services/auth.service");
const authService = new auth_service_1.AuthService();
class AuthController {
    async register(req, res, next) {
        try {
            // Validate user type
            const validUserTypes = ['guest', 'host', 'tourguide', 'agent', 'admin'];
            if (req.body.userType && !validUserTypes.includes(req.body.userType)) {
                return res.status(400).json({ message: 'Invalid user type' });
            }
            // Validate required fields based on user type
            if (!req.body.userType || req.body.userType === 'guest') {
                // For regular signup (guests), all fields are required
                if (!req.body.firstName || !req.body.lastName || !req.body.email || !req.body.password) {
                    return res.status(400).json({
                        message: 'First name, last name, email, and password are required'
                    });
                }
            }
            else {
                // For service providers, email is always required
                if (!req.body.email) {
                    return res.status(400).json({
                        message: 'Email is required'
                    });
                }
                // Names or firstName/lastName required
                if (!req.body.names && (!req.body.firstName || !req.body.lastName)) {
                    return res.status(400).json({
                        message: 'Full name is required'
                    });
                }
            }
            const result = await authService.register(req.body, req);
            res.status(201).json(result);
        }
        catch (error) {
            if (error.message === 'User already exists') {
                res.status(409).json({ message: error.message });
            }
            else {
                res.status(400).json({ message: error.message });
            }
        }
    }
    async login(req, res, next) {
        try {
            if (!req.body.email || !req.body.password) {
                return res.status(400).json({
                    message: 'Email and password are required'
                });
            }
            const result = await authService.login(req.body, req);
            res.json(result);
        }
        catch (error) {
            res.status(401).json({ message: error.message });
        }
    }
    async googleAuth(req, res, next) {
        try {
            const { token } = req.body;
            if (!token) {
                return res.status(400).json({
                    message: 'Google token is required'
                });
            }
            const result = await authService.googleAuth(token, req);
            res.json(result);
        }
        catch (error) {
            res.status(401).json({ message: error.message });
        }
    }
    async appleAuth(req, res, next) {
        try {
            if (!req.body.email || !req.body.providerId) {
                return res.status(400).json({
                    message: 'Email and provider ID are required'
                });
            }
            const result = await authService.appleAuth(req.body, req);
            res.json(result);
        }
        catch (error) {
            res.status(401).json({ message: error.message });
        }
    }
    // --- TOKEN MANAGEMENT ---
    async refreshToken(req, res, next) {
        try {
            if (!req.body.refreshToken) {
                return res.status(400).json({
                    message: 'Refresh token is required'
                });
            }
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
            if (!refreshToken) {
                return res.status(400).json({
                    message: 'Refresh token is required'
                });
            }
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
            const user = await authService.updateUserProfile(parseInt(req.user.userId), req.body, req);
            res.json(user);
        }
        catch (error) {
            res.status(400).json({ message: error.message });
        }
    }
    async updateProfileImage(req, res, next) {
        try {
            console.log('Request body keys:', Object.keys(req.body));
            console.log('Request body:', req.body);
            console.log('Content-Type:', req.headers['content-type']);
            if (!req.user?.userId) {
                return res.status(401).json({ message: 'User not authenticated' });
            }
            const { imageUrl } = req.body;
            console.log('Extracted imageUrl:', imageUrl ? imageUrl.substring(0, 50) + '...' : 'undefined');
            if (!imageUrl) {
                return res.status(400).json({ message: 'Image URL is required' });
            }
            // Validate base64 image format
            if (!imageUrl.startsWith('data:image/')) {
                return res.status(400).json({ message: 'Invalid image format' });
            }
            const user = await authService.updateProfileImage(parseInt(req.user.userId), imageUrl);
            res.json({ profile: imageUrl, user });
        }
        catch (error) {
            console.error('Backend error:', error);
            res.status(400).json({ message: error.message });
        }
    }
    async changePassword(req, res, next) {
        try {
            if (!req.user?.userId) {
                return res.status(401).json({ message: 'User not authenticated' });
            }
            const { currentPassword, newPassword, confirmPassword } = req.body;
            if (!newPassword || !confirmPassword) {
                return res.status(400).json({
                    message: 'New password and confirm password are required'
                });
            }
            await authService.changePassword(parseInt(req.user.userId), req.body, req);
            res.json({ message: 'Password changed successfully' });
        }
        catch (error) {
            res.status(400).json({ message: error.message });
        }
    }
    // --- SETUP PASSWORD (for service providers) ---
    async setupPassword(req, res) {
        try {
            const { email, token, newPassword } = req.body;
            if (!email || !token || !newPassword) {
                return res.status(400).json({
                    message: 'Email, token, and new password are required'
                });
            }
            if (newPassword.length < 8) {
                return res.status(400).json({
                    message: 'Password must be at least 8 characters long'
                });
            }
            await authService.setupPassword(email, token, newPassword, req);
            res.json({ message: 'Password set up successfully. You can now log in.' });
        }
        catch (error) {
            res.status(400).json({ message: error.message });
        }
    }
    // --- FORGOT PASSWORD ---
    async forgotPassword(req, res) {
        try {
            const { email } = req.body;
            if (!email) {
                return res.status(400).json({ message: 'Email is required' });
            }
            const result = await authService.forgotPassword(email, req);
            res.status(200).json(result);
        }
        catch (error) {
            res.status(400).json({ message: error.message });
        }
    }
    async verifyOtp(req, res) {
        try {
            const { email, otp } = req.body;
            if (!email || !otp) {
                return res.status(400).json({
                    message: 'Email and OTP are required'
                });
            }
            const result = await authService.verifyOtp(email, otp);
            res.status(200).json(result);
        }
        catch (error) {
            res.status(400).json({ message: error.message });
        }
    }
    async resetPassword(req, res) {
        try {
            const { email, otp, newPassword } = req.body;
            if (!email || !otp || !newPassword) {
                return res.status(400).json({
                    message: 'Email, OTP, and new password are required'
                });
            }
            if (newPassword.length < 8) {
                return res.status(400).json({
                    message: 'Password must be at least 8 characters long'
                });
            }
            await authService.resetPassword(email, otp, newPassword, req);
            res.status(200).json({ message: 'Password has been reset successfully.' });
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
            // Check if user is admin
            if (!req.user?.userType || req.user.userType !== 'admin') {
                return res.status(403).json({ message: 'Access denied. Admin only.' });
            }
            const users = await authService.getAllUsers(req.query);
            res.json(users);
        }
        catch (error) {
            res.status(500).json({ message: error.message });
        }
    }
    async getUserByEmail(req, res, next) {
        try {
            // Check if user is admin
            if (!req.user?.userType || req.user.userType === 'guest') {
                return res.status(403).json({ message: 'Access denied. Admin only.' });
            }
            const { email } = req.params;
            if (!email) {
                return res.status(400).json({ message: 'Email is required' });
            }
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
            // Check if user is admin or accessing their own data
            const { id } = req.params;
            const userId = parseInt(id);
            if (isNaN(userId)) {
                return res.status(400).json({ message: 'Invalid user ID' });
            }
            const requestingUserId = parseInt(req.user?.userId || '0');
            const isAdmin = req.user?.userType === 'admin';
            if (!isAdmin && userId !== requestingUserId) {
                return res.status(403).json({ message: 'Access denied' });
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
            // Check if user is admin
            if (!req.user?.userType || req.user.userType !== 'admin') {
                return res.status(403).json({ message: 'Access denied. Admin only.' });
            }
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
    async getUsersByType(req, res, next) {
        try {
            // Check if user is admin
            if (!req.user?.userType || req.user.userType !== 'admin') {
                return res.status(403).json({ message: 'Access denied. Admin only.' });
            }
            const { userType } = req.params;
            const validUserTypes = ['guest', 'host', 'tourguide', 'agent', 'admin'];
            if (!validUserTypes.includes(userType)) {
                return res.status(400).json({ message: 'Invalid user type' });
            }
            const users = await authService.getAllUsers({ userType });
            res.json(users);
        }
        catch (error) {
            res.status(500).json({ message: error.message });
        }
    }
    // --- ADMIN CRUD OPERATIONS ---
    async adminCreateUser(req, res, next) {
        try {
            // Validate required fields
            if (!req.body.email) {
                return res.status(400).json({ message: 'Email is required' });
            }
            // Validate user type if provided
            const validUserTypes = ['guest', 'host', 'tourguide', 'agent', 'admin'];
            if (req.body.userType && !validUserTypes.includes(req.body.userType)) {
                return res.status(400).json({ message: 'Invalid user type' });
            }
            // Validate status if provided
            const validStatuses = ['active', 'inactive', 'pending', 'suspended', 'unverified'];
            if (req.body.status && !validStatuses.includes(req.body.status)) {
                return res.status(400).json({ message: 'Invalid status' });
            }
            const user = await authService.adminCreateUser(req.body, req);
            res.status(201).json({
                message: 'User created successfully',
                user
            });
        }
        catch (error) {
            if (error.message.includes('already exists')) {
                res.status(409).json({ message: error.message });
            }
            else {
                res.status(400).json({ message: error.message });
            }
        }
    }
    async adminUpdateUser(req, res, next) {
        try {
            const userId = parseInt(req.params.id);
            if (isNaN(userId)) {
                return res.status(400).json({ message: 'Invalid user ID' });
            }
            // Validate user type if provided
            if (req.body.userType) {
                const validUserTypes = ['guest', 'host', 'tourguide', 'agent', 'admin'];
                if (!validUserTypes.includes(req.body.userType)) {
                    return res.status(400).json({ message: 'Invalid user type' });
                }
            }
            // Validate status if provided
            if (req.body.status) {
                const validStatuses = ['active', 'inactive', 'pending', 'suspended', 'unverified'];
                if (!validStatuses.includes(req.body.status)) {
                    return res.status(400).json({ message: 'Invalid status' });
                }
            }
            const user = await authService.adminUpdateUser(userId, req.body);
            res.json({
                message: 'User updated successfully',
                user
            });
        }
        catch (error) {
            if (error.message === 'User not found') {
                res.status(404).json({ message: error.message });
            }
            else {
                res.status(400).json({ message: error.message });
            }
        }
    }
    async adminDeleteUser(req, res, next) {
        try {
            const userId = parseInt(req.params.id);
            if (isNaN(userId)) {
                return res.status(400).json({ message: 'Invalid user ID' });
            }
            // Prevent self-deletion
            const requestingUserId = parseInt(req.user?.userId || '0');
            if (userId === requestingUserId) {
                return res.status(400).json({ message: 'Cannot delete your own account' });
            }
            const result = await authService.adminDeleteUser(userId);
            res.json(result);
        }
        catch (error) {
            if (error.message === 'User not found') {
                res.status(404).json({ message: error.message });
            }
            else {
                res.status(400).json({ message: error.message });
            }
        }
    }
    async adminSuspendUser(req, res, next) {
        try {
            const userId = parseInt(req.params.id);
            if (isNaN(userId)) {
                return res.status(400).json({ message: 'Invalid user ID' });
            }
            // Prevent self-suspension
            const requestingUserId = parseInt(req.user?.userId || '0');
            if (userId === requestingUserId) {
                return res.status(400).json({ message: 'Cannot suspend your own account' });
            }
            const { reason } = req.body;
            const user = await authService.adminSuspendUser(userId, reason, req);
            res.json({
                message: 'User suspended successfully',
                user
            });
        }
        catch (error) {
            if (error.message === 'User not found') {
                res.status(404).json({ message: error.message });
            }
            else {
                res.status(400).json({ message: error.message });
            }
        }
    }
    async adminActivateUser(req, res, next) {
        try {
            const userId = parseInt(req.params.id);
            if (isNaN(userId)) {
                return res.status(400).json({ message: 'Invalid user ID' });
            }
            const user = await authService.adminActivateUser(userId, req);
            res.json({
                message: 'User activated successfully',
                user
            });
        }
        catch (error) {
            if (error.message === 'User not found') {
                res.status(404).json({ message: error.message });
            }
            else {
                res.status(400).json({ message: error.message });
            }
        }
    }
    async adminResetUserPassword(req, res, next) {
        try {
            const userId = parseInt(req.params.id);
            if (isNaN(userId)) {
                return res.status(400).json({ message: 'Invalid user ID' });
            }
            const result = await authService.adminResetUserPassword(userId, req);
            res.json({
                message: 'Password reset successfully',
                temporaryPassword: result.temporaryPassword,
                note: 'Please share this temporary password securely with the user'
            });
        }
        catch (error) {
            if (error.message === 'User not found') {
                res.status(404).json({ message: error.message });
            }
            else {
                res.status(400).json({ message: error.message });
            }
        }
    }
    async getUserStatistics(req, res, next) {
        try {
            const stats = await authService.getUserStatistics();
            res.json(stats);
        }
        catch (error) {
            res.status(500).json({ message: error.message });
        }
    }
}
exports.AuthController = AuthController;
