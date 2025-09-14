"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/auth.routes.ts
const express_1 = require("express");
const auth_controller_1 = require("../controllers/auth.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
const authController = new auth_controller_1.AuthController();
// --- PUBLIC AUTH ROUTES ---
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/google', authController.googleAuth);
router.post('/apple', authController.appleAuth);
router.post('/refresh-token', authController.refreshToken);
// --- FORGOT PASSWORD ROUTES ---
router.post('/forgot-password', authController.forgotPassword);
router.post('/verify-otp', authController.verifyOtp);
router.post('/reset-password', authController.resetPassword);
router.post('/setup-password', authController.setupPassword); // For service providers
// --- PROTECTED USER ROUTES ---
router.use(auth_middleware_1.authenticate); // All routes below require authentication
// Profile Management
router.get('/me', authController.getCurrentUser);
router.put('/me', authController.updateProfile);
router.put('/me/image', authController.updateProfileImage);
router.put('/me/password', authController.changePassword);
// --- ADMIN ROUTES (might need additional admin middleware) ---
router.get('/users', authController.getAllUsers);
router.get('/users/email/:email', authController.getUserByEmail);
router.get('/users/id/:id', authController.getUserById);
router.get('/users/provider/:provider', authController.getUsersByProvider);
// Session Management
router.post('/logout', authController.logout);
router.post('/logout-all', authController.logoutAllDevices);
router.get('/sessions', authController.getUserSessions);
// --- ADMIN ROUTES ---
// Statistics
router.get('/admin/statistics', auth_middleware_1.adminOnly, authController.getUserStatistics);
// User Management - CRUD Operations
router.get('/admin/users', auth_middleware_1.adminOnly, authController.getAllUsers);
router.post('/admin/users', auth_middleware_1.adminOnly, authController.adminCreateUser);
router.get('/admin/users/email/:email', auth_middleware_1.adminOnly, authController.getUserByEmail);
router.get('/admin/users/provider/:provider', auth_middleware_1.adminOnly, authController.getUsersByProvider);
router.get('/admin/users/type/:userType', auth_middleware_1.adminOnly, authController.getUsersByType);
// Single User Operations
router.get('/admin/users/:id', auth_middleware_1.adminOnly, authController.getUserById);
router.put('/admin/users/:id', auth_middleware_1.adminOnly, authController.adminUpdateUser);
router.delete('/admin/users/:id', auth_middleware_1.adminOnly, authController.adminDeleteUser);
// User Actions
router.post('/admin/users/:id/suspend', auth_middleware_1.adminOnly, authController.adminSuspendUser);
router.post('/admin/users/:id/activate', auth_middleware_1.adminOnly, authController.adminActivateUser);
router.post('/admin/users/:id/reset-password', auth_middleware_1.adminOnly, authController.adminResetUserPassword);
// --- ROLE-BASED ROUTES (for future use) ---
// Example: Host-specific endpoints
router.get('/host/properties', (0, auth_middleware_1.authorize)('host', 'admin'), (req, res) => {
    res.json({ message: 'Host properties endpoint - implement in property controller' });
});
// Example: Tour guide-specific endpoints  
router.get('/tourguide/tours', (0, auth_middleware_1.authorize)('tourguide', 'admin'), (req, res) => {
    res.json({ message: 'Tour guide tours endpoint - implement in tour controller' });
});
// Example: Agent-specific endpoints
router.get('/agent/clients', (0, auth_middleware_1.authorize)('agent', 'admin'), (req, res) => {
    res.json({ message: 'Agent clients endpoint - implement in agent controller' });
});
exports.default = router;
