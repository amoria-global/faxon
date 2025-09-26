// src/routes/settings.routes.ts
import { Router } from 'express';
import { SettingsController } from '../controllers/settings.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
const settingsController = new SettingsController();

// All settings routes require authentication
router.use(authenticate);

// ============ MAIN SETTINGS ROUTES ============

// Get all user settings
router.get('/', settingsController.getSettings.bind(settingsController));

// Update all or partial settings
router.put('/', settingsController.updateSettings.bind(settingsController));

// Reset all settings to default
router.post('/reset', settingsController.resetSettings.bind(settingsController));

// Get settings summary for dashboard
router.get('/summary', settingsController.getSettingsSummary.bind(settingsController));

// ============ NOTIFICATION SETTINGS ============

// Update notification settings only
router.put('/notifications', settingsController.updateNotificationSettings.bind(settingsController));

// ============ SECURITY SETTINGS ============

// Update security settings only
router.put('/security', settingsController.updateSecuritySettings.bind(settingsController));

// Change password
router.post('/security/password', settingsController.changePassword.bind(settingsController));

// Two-Factor Authentication
router.post('/security/2fa/enable', settingsController.enableTwoFactor.bind(settingsController));
router.post('/security/2fa/disable', settingsController.disableTwoFactor.bind(settingsController));

// ============ VERIFICATION ============

// Get verification status
router.get('/verification/status', settingsController.getVerificationStatus.bind(settingsController));

// Send verification code
router.post('/verification/send', settingsController.sendVerificationCode.bind(settingsController));

// Verify code
router.post('/verification/verify', settingsController.verifyCode.bind(settingsController));

// ============ CONNECTED ACCOUNTS ============

// Get connected accounts
router.get('/connected-accounts', settingsController.getConnectedAccounts.bind(settingsController));

// Connect account (Google OAuth)
router.post('/connected-accounts/connect', settingsController.connectAccount.bind(settingsController));

// Disconnect account by provider
router.delete('/connected-accounts/:provider', settingsController.disconnectAccountByProvider.bind(settingsController));

// Disconnect account by ID (legacy - for backward compatibility)
router.delete('/accounts/connected/:accountId', settingsController.disconnectAccount.bind(settingsController));

// ============ GENERAL SETTINGS ============

// Update general settings only
router.put('/general', settingsController.updateGeneralSettings.bind(settingsController));

// ============ APPEARANCE SETTINGS ============

// Update appearance settings only
router.put('/appearance', settingsController.updateAppearanceSettings.bind(settingsController));

// ============ ACCOUNT MANAGEMENT ============

// Deactivate account
router.post('/account/deactivate', settingsController.deactivateAccount.bind(settingsController));

// Delete account
router.post('/account/delete', settingsController.deleteAccount.bind(settingsController));

export default router;