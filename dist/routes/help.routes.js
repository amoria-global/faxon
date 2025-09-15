"use strict";
// backend/src/routes/help.routes.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const help_controller_1 = require("../controllers/help.controller");
const router = express_1.default.Router();
// ============ FAQ ROUTES ============
// Public routes - no authentication required
router.get('/faqs', help_controller_1.getFAQs);
router.get('/faqs/:faqId', help_controller_1.getFAQ);
router.patch('/faqs/:faqId/helpful', help_controller_1.markFAQHelpful); // Can be public or require auth
// ============ ARTICLE ROUTES ============
// Public routes - no authentication required
router.get('/articles', help_controller_1.getArticles);
router.get('/articles/:articleId', help_controller_1.getArticle);
router.patch('/articles/:articleId/views', help_controller_1.incrementArticleViews); // Public for view tracking
// ============ SUPPORT TICKET ROUTES ============
// All ticket routes require authentication
router.get('/tickets', auth_middleware_1.authenticate, help_controller_1.getSupportTickets);
router.get('/tickets/:ticketId', auth_middleware_1.authenticate, help_controller_1.getSupportTicket);
router.post('/tickets', auth_middleware_1.authenticate, help_controller_1.createSupportTicket);
router.put('/tickets/:ticketId', auth_middleware_1.authenticate, help_controller_1.updateSupportTicket);
router.post('/tickets/:ticketId/responses', auth_middleware_1.authenticate, help_controller_1.addTicketResponse);
router.patch('/tickets/:ticketId/close', auth_middleware_1.authenticate, help_controller_1.closeSupportTicket);
// ============ GENERAL HELP ROUTES ============
// Public routes
router.get('/categories', help_controller_1.getHelpCategories);
router.post('/contact', help_controller_1.sendContactMessage); // Can be public
router.get('/stats', help_controller_1.getHelpStats); // Public for general statistics
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
exports.default = router;
