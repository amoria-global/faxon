
// ============================================================================
// src/routes/kyc-reminder.routes.ts
// ============================================================================
import { Router } from 'express';
import { KYCReminderController } from '../controllers/kyc-reminder.controller';
import { adminOnly } from '../middleware/auth.middleware';

const router = Router();
const controller = new KYCReminderController();

// Public routes (no authentication - self-serving)
router.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'KYC Reminder Service',
    timestamp: new Date().toISOString()
  });
});

// Admin-only routes for manual control and monitoring
router.post('/trigger', adminOnly, controller.triggerReminders);
router.get('/status', adminOnly, controller.getStatus);
router.get('/statistics', adminOnly, controller.getStatistics);

export default router;
