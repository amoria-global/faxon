// src/routes/public.routes.ts
import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller';

const router = Router();
const adminController = new AdminController();

// ===================================================================
//                      PUBLIC CONTENT ROUTES
// ===================================================================

// Products - Public read access
router.get('/products', adminController.getProducts);

// Services - Public read access
router.get('/services', adminController.getServices);

// Visitor Analytics - Public POST for tracking
router.post('/analytics/visitors', adminController.trackVisitor);

// Newsletter Subscription - Public POST for subscribing
router.post('/newsletter/subscribe', adminController.subscribeNewsletter);

// Contact Message - Public POST for submitting contact form
router.post('/contact', adminController.submitContactMessage);

export default router;
