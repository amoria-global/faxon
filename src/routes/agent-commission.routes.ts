// src/routes/agent-commission.routes.ts
import { Router } from 'express';
import { AgentCommissionController } from '../controllers/agent-commission.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
const agentCommissionController = new AgentCommissionController();

// Agent routes (requires authentication)
router.post(
  '/agent/properties',
  authenticate,
  agentCommissionController.createPropertyByAgent
);

router.get(
  '/agent/properties',
  authenticate,
  agentCommissionController.getAgentProperties
);

router.get(
  '/agent/commissions/pending',
  authenticate,
  agentCommissionController.getAgentPendingCommissions
);

// Host routes (requires authentication)
router.get(
  '/host/payments/pending',
  authenticate,
  agentCommissionController.getHostPendingPayments
);

router.post(
  '/host/bookings/:bookingId/validate-checkin',
  authenticate,
  agentCommissionController.validateCheckIn
);

router.post(
  '/host/bookings/:bookingId/validate-checkout',
  authenticate,
  agentCommissionController.validateCheckOut
);

// Payment processing route (should be called from payment webhook)
// Note: You may want to add webhook authentication here instead of user auth
router.post(
  '/bookings/:bookingId/process-payment',
  agentCommissionController.processBookingPayment
);

export default router;
