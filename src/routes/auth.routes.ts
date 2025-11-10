// src/routes/auth.routes.ts
import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { authenticate, authorize, adminOnly } from '../middleware/auth.middleware';

const router = Router();
const authController = new AuthController();

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
router.use(authenticate); // All routes below require authentication

// Profile Management
router.get('/me', authController.getCurrentUser);
router.put('/me', authController.updateMe);
router.put('/me/image', authController.updateProfileImage);
router.put('/me/password', authController.changePasswordFromProfile);

router.put('/me/document-url', authController.updateDocumentUrl);
router.get('/me/documents', authController.getUserDocuments);
router.delete('/me/documents/:documentType', authController.removeDocumentUrl);

// --- TOUR GUIDE SPECIFIC ROUTES ---
router.get('/tourguide/profile', authorize('tourguide', 'admin'), authController.getCurrentUser);
router.put('/tourguide/employment-type', authorize('tourguide', 'admin'), authController.updateTourGuideType);

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
router.get('/admin/statistics', adminOnly, authController.getUserStatistics);

// User Management - CRUD Operations
router.get('/admin/users', adminOnly, authController.getAllUsers);
router.post('/admin/users', adminOnly, authController.adminCreateUser);
router.get('/admin/users/email/:email', adminOnly, authController.getUserByEmail);
router.get('/admin/users/provider/:provider', adminOnly, authController.getUsersByProvider);
router.get('/admin/users/type/:userType', adminOnly, authController.getUsersByType);

// Single User Operations
router.get('/admin/users/:id', adminOnly, authController.getUserById);
router.put('/admin/users/:id', adminOnly, authController.adminUpdateUser);
router.delete('/admin/users/:id', adminOnly, authController.adminDeleteUser);

// User Actions
router.post('/admin/users/:id/suspend', adminOnly, authController.adminSuspendUser);
router.post('/admin/users/:id/activate', adminOnly, authController.adminActivateUser);
router.post('/admin/users/:id/reset-password', adminOnly, authController.adminResetUserPassword);

// KYC Routes
router.post('/kyc/submit', authenticate, authController.submitKYC);
router.get('/kyc/status', authenticate, authController.getKYCStatus);

router.get('/agent/referrals', authorize('agent', 'admin'), authController.getAgentReferrals);
router.get('/agent/referral-code', authorize('agent', 'admin'), authController.getAgentReferralCode);

// --- AGENT ASSESSMENT ROUTES ---
router.post('/agent/assessment/submit', authorize('agent', 'admin'), authController.submitAgentAssessment);
router.get('/agent/assessment/status', authorize('agent', 'admin'), authController.getAgentAssessmentStatus);

// Admin routes for assessments
router.get('/admin/agent-assessments', adminOnly, authController.getAllAgentAssessments);
router.put('/admin/agent-assessments/:assessmentId/review', adminOnly, authController.reviewAgentAssessment);

export default router;