// backend/src/routes/help.routes.ts

import express from 'express';
import { authenticate, authorize, adminOnly } from '../middleware/auth.middleware';
import {
  getFAQs,
  getFAQ,
  markFAQHelpful,
  getArticles,
  getArticle,
  incrementArticleViews,
  getSupportTickets,
  getSupportTicket,
  createSupportTicket,
  updateSupportTicket,
  addTicketResponse,
  closeSupportTicket,
  getHelpCategories,
  sendContactMessage,
  getHelpStats
} from '../controllers/help.controller';

const router = express.Router();

// ============ FAQ ROUTES ============
// Public routes - no authentication required
router.get('/faqs', getFAQs);
router.get('/faqs/:faqId', getFAQ);
router.patch('/faqs/:faqId/helpful', markFAQHelpful); // Can be public or require auth

// ============ ARTICLE ROUTES ============
// Public routes - no authentication required
router.get('/articles', getArticles);
router.get('/articles/:articleId', getArticle);
router.patch('/articles/:articleId/views', incrementArticleViews); // Public for view tracking

// ============ SUPPORT TICKET ROUTES ============
// All ticket routes require authentication
router.get('/tickets', authenticate, getSupportTickets);
router.get('/tickets/:ticketId', authenticate, getSupportTicket);
router.post('/tickets', authenticate, createSupportTicket);
router.put('/tickets/:ticketId', authenticate, updateSupportTicket);
router.post('/tickets/:ticketId/responses', authenticate, addTicketResponse);
router.patch('/tickets/:ticketId/close', authenticate, closeSupportTicket);

// ============ GENERAL HELP ROUTES ============
// Public routes
router.get('/categories', getHelpCategories);
router.post('/contact', sendContactMessage); // Can be public
router.get('/stats', getHelpStats); // Public for general statistics

// ============ ADMIN ROUTES (Optional - for managing help content) ============
// Uncomment these if you want admin-only management features

/*
// FAQ Management (Admin only)
router.post('/faqs', authenticate, adminOnly, createFAQ);
router.put('/faqs/:faqId', authenticate, adminOnly, updateFAQ);
router.delete('/faqs/:faqId', authenticate, adminOnly, deleteFAQ);

// Article Management (Admin only)
router.post('/articles', authenticate, adminOnly, createArticle);
router.put('/articles/:articleId', authenticate, adminOnly, updateArticle);
router.delete('/articles/:articleId', authenticate, adminOnly, deleteArticle);

// Ticket Management (Admin only)
router.get('/admin/tickets', authenticate, adminOnly, getAllTickets);
router.patch('/tickets/:ticketId/assign', authenticate, adminOnly, assignTicket);
router.patch('/tickets/:ticketId/status', authenticate, adminOnly, updateTicketStatus);
*/

export default router;