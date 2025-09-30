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
// --- PUBLIC EMAIL CHECK ---
router.get('/check-email/:email', authController.checkEmailStatus);
// --- FORGOT PASSWORD ROUTES ---
router.post('/forgot-password', authController.forgotPassword);
router.post('/verify-otp', authController.verifyOtp);
router.post('/reset-password', authController.resetPassword);
router.post('/setup-password', authController.setupPassword); // For service providers
// --- PROTECTED USER ROUTES ---
router.use(auth_middleware_1.authenticate); // All routes below require authentication
// Profile Management
router.get('/me', authController.getCurrentUser);
router.put('/me', authController.updateMe);
router.put('/me/image', authController.updateProfileImage);
router.put('/me/password', authController.changePasswordFromProfile);
router.put('/me/document-url', authController.updateDocumentUrl);
router.get('/me/documents', authController.getUserDocuments);
router.delete('/me/documents/:documentType', authController.removeDocumentUrl);
// --- TOUR GUIDE SPECIFIC ROUTES ---
router.get('/tourguide/profile', (0, auth_middleware_1.authorize)('tourguide', 'admin'), authController.getCurrentUser);
router.put('/tourguide/employment-type', (0, auth_middleware_1.authorize)('tourguide', 'admin'), authController.updateTourGuideType);
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
// KYC Routes
router.post('/kyc/submit', auth_middleware_1.authenticate, authController.submitKYC);
router.get('/kyc/status', auth_middleware_1.authenticate, authController.getKYCStatus);
// --- ROLE-BASED ROUTES (for future use) ---
// Example: Host-specific endpoints
router.get('/host/properties', (0, auth_middleware_1.authorize)('host', 'admin'), (req, res) => {
    res.json({ message: 'Host properties endpoint - implement in property controller' });
});
router.get('/tourguide/tours', (0, auth_middleware_1.authorize)('tourguide', 'admin'), (req, res) => {
    res.json({ message: 'Tour guide tours endpoint - implement in tour controller' });
});
router.get('/agent/clients', (0, auth_middleware_1.authorize)('agent', 'admin'), (req, res) => {
    res.json({ message: 'Agent clients endpoint - implement in agent controller' });
});
router.get('/agent/referrals', (0, auth_middleware_1.authorize)('agent', 'admin'), authController.getAgentReferrals);
router.get('/agent/referral-code', (0, auth_middleware_1.authorize)('agent', 'admin'), authController.getAgentReferralCode);
exports.default = router;
