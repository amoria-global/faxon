import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
const authController = new AuthController();

// --- PUBLIC AUTH ROUTES ---
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/google', authController.googleAuth);
router.post('/apple', authController.appleAuth);
router.post('/refresh-token', authController.refreshToken);

// --- PROTECTED USER ROUTES ---
router.use(authenticate); // All routes below require authentication

// Profile Management
router.get('/me', authController.getCurrentUser);
router.put('/me', authController.updateProfile);
router.put('/me/image', authController.updateProfileImage);
router.put('/me/password', authController.changePassword);

// Session Management
router.post('/logout', authController.logout);
router.post('/logout-all', authController.logoutAllDevices);
router.get('/sessions', authController.getUserSessions);

// --- ADMIN ROUTES (might need additional admin middleware) ---
router.get('/users', authController.getAllUsers);
router.get('/users/email/:email', authController.getUserByEmail);
router.get('/users/id/:id', authController.getUserById);
router.get('/users/provider/:provider', authController.getUsersByProvider);

export default router;