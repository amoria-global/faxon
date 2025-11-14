/**
 * JamboLush Admin Settings Routes
 * All routes for the admin settings system
 */

import { Router } from 'express';
import jamboLushController from '../controllers/jambolush.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermissions } from '../middleware/admin.middleware';

const router = Router();

// All routes require authentication and admin permissions
router.use(authenticate);
router.use(requirePermissions('system.manage'));

// ============================================
// PAYMENT PROVIDERS
// ============================================

// Get all payment providers
router.get(
  '/settings/payment-providers',
  jamboLushController.getAllPaymentProviders.bind(jamboLushController)
);

// Get single payment provider
router.get(
  '/settings/payment-providers/:providerId',
  jamboLushController.getPaymentProvider.bind(jamboLushController)
);

// Create payment provider
router.post(
  '/settings/payment-providers',
  jamboLushController.createPaymentProvider.bind(jamboLushController)
);

// Update payment provider
router.put(
  '/settings/payment-providers/:providerId',
  jamboLushController.updatePaymentProvider.bind(jamboLushController)
);

// Test payment provider connection
router.post(
  '/settings/payment-providers/:providerId/test',
  jamboLushController.testPaymentProvider.bind(jamboLushController)
);

// ============================================
// OPERATORS
// ============================================

// Get all operators
router.get(
  '/settings/operators',
  jamboLushController.getAllOperators.bind(jamboLushController)
);

// Update operator
router.put(
  '/settings/operators/:operatorCode',
  jamboLushController.updateOperator.bind(jamboLushController)
);

// ============================================
// COMMUNICATION SETTINGS
// ============================================

// Get all communication settings
router.get(
  '/settings/communications',
  jamboLushController.getAllCommunicationSettings.bind(jamboLushController)
);

// Alias: singular route for backward compatibility (GET all)
router.get(
  '/settings/communication',
  jamboLushController.getAllCommunicationSettings.bind(jamboLushController)
);

// Get specific communication setting by channel
router.get(
  '/settings/communications/:channel',
  jamboLushController.getCommunicationSetting.bind(jamboLushController)
);

// Alias: singular route for backward compatibility (GET specific)
router.get(
  '/settings/communication/:channel',
  jamboLushController.getCommunicationSetting.bind(jamboLushController)
);

// Update communication setting (email, sms, whatsapp)
router.put(
  '/settings/communications/:channel',
  jamboLushController.updateCommunicationSetting.bind(jamboLushController)
);

// Alias: singular route for backward compatibility (PUT)
router.put(
  '/settings/communication/:channel',
  jamboLushController.updateCommunicationSetting.bind(jamboLushController)
);

// ============================================
// SECURITY SETTINGS
// ============================================

// Get security settings
router.get(
  '/settings/security',
  jamboLushController.getSecuritySettings.bind(jamboLushController)
);

// Update security settings
router.put(
  '/settings/security',
  jamboLushController.updateSecuritySettings.bind(jamboLushController)
);

// ============================================
// BUSINESS RULES
// ============================================

// Get all business rules
router.get(
  '/settings/business-rules',
  jamboLushController.getAllBusinessRules.bind(jamboLushController)
);

// Update business rules
router.put(
  '/settings/business-rules',
  jamboLushController.updateBusinessRules.bind(jamboLushController)
);

// Toggle system feature
router.post(
  '/settings/system/toggle',
  jamboLushController.toggleSystemFeature.bind(jamboLushController)
);

// ============================================
// AUTOMATED JOBS
// ============================================

// Get all automated jobs
router.get(
  '/automation/jobs',
  jamboLushController.getAllJobs.bind(jamboLushController)
);

// Get job types
router.get(
  '/automation/job-types',
  jamboLushController.getJobTypes.bind(jamboLushController)
);

// Create automated job
router.post(
  '/automation/jobs/schedule',
  jamboLushController.createJob.bind(jamboLushController)
);

// Update automated job
router.put(
  '/automation/jobs/:jobId',
  jamboLushController.updateJob.bind(jamboLushController)
);

// Execute job manually
router.post(
  '/automation/jobs/:jobId/execute',
  jamboLushController.executeJob.bind(jamboLushController)
);

// ============================================
// WEBHOOKS
// ============================================

// Get all webhooks
router.get(
  '/webhooks',
  jamboLushController.getAllWebhooks.bind(jamboLushController)
);

// Create webhook
router.post(
  '/webhooks/register',
  jamboLushController.createWebhook.bind(jamboLushController)
);

// ============================================
// NOTIFICATION TEMPLATES
// ============================================

// Get all templates
router.get(
  '/communications/templates',
  jamboLushController.getAllTemplates.bind(jamboLushController)
);

// Create template
router.post(
  '/communications/templates',
  jamboLushController.createTemplate.bind(jamboLushController)
);

// ============================================
// AUDIT LOGS
// ============================================

// Get audit logs
router.get(
  '/security/audit-logs',
  jamboLushController.getAuditLogs.bind(jamboLushController)
);

export default router;
