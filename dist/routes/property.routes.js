"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Enhanced Property Routes with Transaction Monitoring
const express_1 = require("express");
const property_controller_1 = require("../controllers/property.controller");
const enhanced_property_controller_1 = require("../controllers/enhanced-property.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const property_middleware_1 = require("../middleware/property.middleware");
const router = (0, express_1.Router)();
const propertyController = new property_controller_1.PropertyController();
const enhancedPropertyController = new enhanced_property_controller_1.EnhancedPropertyController();
// --- PUBLIC PROPERTY ROUTES ---
// Search and browse properties
router.get('/search', propertyController.searchProperties);
router.get('/featured', propertyController.getFeaturedProperties);
router.get('/suggestions/location', propertyController.getLocationSuggestions);
router.get('/:id', propertyController.getPropertyById);
router.get('/:id/similar', propertyController.getSimilarProperties);
router.get('/:id/reviews', propertyController.getPropertyReviews);
// --- PROTECTED ROUTES (Authentication Required) ---
router.use(auth_middleware_1.authenticate); // All routes below require authentication
// --- HOST DASHBOARD & OVERVIEW ---
router.get('/host/dashboard', property_middleware_1.validateHost, propertyController.getHostDashboard);
router.get('/host/dashboard/enhanced', property_middleware_1.validateHost, propertyController.getEnhancedDashboard);
router.get('/host/quick-stats', property_middleware_1.validateHost, propertyController.getQuickStats);
router.get('/host/recent-activity', property_middleware_1.validateHost, propertyController.getRecentActivity);
// --- HOST PROPERTY MANAGEMENT ---
router.post('/', property_middleware_1.validateProperty, propertyController.createProperty);
router.put('/:id', property_middleware_1.validateHost, propertyController.updateProperty);
router.delete('/:id', property_middleware_1.validateHost, propertyController.deleteProperty);
router.get('/host/my-properties', property_middleware_1.validateHost, propertyController.getMyProperties);
// Host property status management
router.patch('/:id/activate', property_middleware_1.validateHost, propertyController.activateProperty);
router.patch('/:id/deactivate', property_middleware_1.validateHost, propertyController.deactivateProperty);
// Host property availability management
router.patch('/:id/availability', property_middleware_1.validateHost, propertyController.updatePropertyAvailability);
router.post('/:id/block-dates', property_middleware_1.validateHost, propertyController.blockPropertyDates);
// Host property pricing management
router.patch('/:id/pricing', property_middleware_1.validateHost, propertyController.updatePropertyPricing);
// --- ENHANCED AGENT DASHBOARD WITH TRANSACTION MONITORING ---
// Enhanced agent dashboard with transaction data
router.get('/agent/dashboard', property_middleware_1.validateAgent, enhancedPropertyController.getAgentDashboard);
router.get('/agent/dashboard/enhanced', property_middleware_1.validateAgent, enhancedPropertyController.getAgentDashboard);
// --- AGENT TRANSACTION MONITORING ROUTES ---
// Transaction monitoring dashboard
router.get('/agent/transactions/monitoring', property_middleware_1.validateAgent, enhancedPropertyController.getTransactionMonitoringDashboard);
// Escrow transaction routes
router.get('/agent/transactions/escrow', property_middleware_1.validateAgent, enhancedPropertyController.getAgentEscrowTransactions);
router.get('/agent/transactions/escrow/summary', property_middleware_1.validateAgent, enhancedPropertyController.getAgentTransactionSummary);
// Payment transaction routes
router.get('/agent/transactions/payment', property_middleware_1.validateAgent, enhancedPropertyController.getAgentPaymentTransactions);
// Combined transaction routes
router.get('/agent/transactions/summary', property_middleware_1.validateAgent, enhancedPropertyController.getAgentTransactionSummary);
router.get('/agent/transactions/analytics', property_middleware_1.validateAgent, enhancedPropertyController.getTransactionAnalytics);
router.get('/agent/transactions/status/:transactionId', property_middleware_1.validateAgent, enhancedPropertyController.getTransactionStatus);
// Commission and earnings with transaction breakdown
router.get('/agent/earnings', property_middleware_1.validateAgent, enhancedPropertyController.getAgentEarningsWithTransactions);
router.get('/agent/earnings/breakdown', property_middleware_1.validateAgent, propertyController.getAgentEarningsBreakdown);
router.get('/agent/commissions/states', property_middleware_1.validateAgent, enhancedPropertyController.getAgentCommissionStates);
router.get('/agent/commissions/monthly', property_middleware_1.validateAgent, enhancedPropertyController.getMonthlyCommissionsWithTransactions);
// Withdrawal requests
router.get('/agent/withdrawals', property_middleware_1.validateAgent, enhancedPropertyController.getAgentWithdrawalRequests);
// Booking transaction data
router.get('/agent/bookings/:bookingId/transactions', property_middleware_1.validateAgent, enhancedPropertyController.getBookingTransactionData);
// Transaction export
router.get('/agent/transactions/export', property_middleware_1.validateAgent, enhancedPropertyController.exportTransactions);
// --- LEGACY AGENT PROPERTY MANAGEMENT (Enhanced with Transaction Support) ---
router.get('/agent/properties', property_middleware_1.validateAgent, propertyController.getAgentProperties);
router.get('/agent/properties/performance', property_middleware_1.validateAgent, propertyController.getAgentPropertyPerformance);
// Agent property viewing and limited editing
router.get('/agent/properties/:id', property_middleware_1.validateAgent, property_middleware_1.validateAgentPropertyAccess, propertyController.getAgentPropertyDetails);
router.patch('/agent/properties/:id/edit', property_middleware_1.validateAgent, property_middleware_1.validateAgentPropertyAccess, property_middleware_1.validateAgentPropertyEdit, propertyController.updateAgentProperty);
// Agent property booking management for clients
router.get('/agent/properties/:id/bookings', property_middleware_1.validateAgent, property_middleware_1.validateAgentPropertyAccess, propertyController.getAgentPropertyBookings);
router.post('/agent/properties/:id/bookings', property_middleware_1.validateAgent, property_middleware_1.validateAgentPropertyAccess, propertyController.createAgentBooking);
// Agent analytics for client properties
router.get('/agent/properties/:id/analytics', property_middleware_1.validateAgent, property_middleware_1.validateAgentPropertyAccess, propertyController.getAgentPropertyAnalytics);
router.get('/agent/properties/analytics/summary', property_middleware_1.validateAgent, propertyController.getAgentPropertiesAnalyticsSummary);
// Agent client property management
router.get('/agent/clients/:clientId/properties', property_middleware_1.validateAgent, propertyController.getClientProperties);
router.post('/agent/clients/:clientId/properties', property_middleware_1.validateAgent, property_middleware_1.validateProperty, propertyController.createClientProperty);
// --- MEDIA MANAGEMENT ---
// Host media management
router.post('/:id/images', property_middleware_1.validateHost, propertyController.uploadPropertyImages);
router.delete('/:id/images', property_middleware_1.validateHost, propertyController.removePropertyImage);
// Agent media management (limited)
router.post('/agent/properties/:id/images', property_middleware_1.validateAgent, property_middleware_1.validateAgentPropertyAccess, propertyController.uploadAgentPropertyImages);
// --- BOOKING MANAGEMENT ---
// Create booking (for guests)
router.post('/bookings', propertyController.createBooking);
// Host booking management
router.get('/host/bookings', property_middleware_1.validateHost, propertyController.getHostBookings);
router.get('/host/bookings/calendar', property_middleware_1.validateHost, propertyController.getBookingCalendar);
router.put('/host/bookings/:bookingId', property_middleware_1.validateHost, property_middleware_1.validateBookingUpdate, propertyController.updateBooking);
router.patch('/host/bookings/bulk-update', property_middleware_1.validateHost, propertyController.bulkUpdateBookings);
// Property-specific bookings
router.get('/:id/bookings', property_middleware_1.validateHost, propertyController.getPropertyBookings);
// Agent booking management
router.get('/agent/bookings', property_middleware_1.validateAgent, propertyController.getAgentBookings);
router.get('/agent/bookings/calendar', property_middleware_1.validateAgent, propertyController.getAgentBookingCalendar);
router.put('/agent/bookings/:bookingId', property_middleware_1.validateAgent, property_middleware_1.validateBookingUpdate, propertyController.updateAgentBooking);
// --- GUEST MANAGEMENT --- 
// Host guest management
router.get('/host/guests', property_middleware_1.validateHost, propertyController.getHostGuests);
router.get('/host/guests/:guestId', property_middleware_1.validateHost, propertyController.getGuestDetails);
// Agent guest management
router.get('/agent/guests', property_middleware_1.validateAgent, propertyController.getAgentGuests);
router.get('/agent/clients/:clientId/guests', property_middleware_1.validateAgent, propertyController.getClientGuests);
// --- EARNINGS & FINANCIAL ---
// Host earnings
router.get('/host/earnings', property_middleware_1.validateHost, propertyController.getEarningsOverview);
router.get('/host/earnings/breakdown', property_middleware_1.validateHost, propertyController.getEarningsBreakdown);
// --- ANALYTICS ---
// Host analytics
router.get('/host/analytics', property_middleware_1.validateHost, propertyController.getHostAnalytics);
// --- REVIEW MANAGEMENT ---
router.post('/:id/reviews', propertyController.createReview);
// Agent review management
router.get('/agent/properties/:id/reviews', property_middleware_1.validateAgent, property_middleware_1.validateAgentPropertyAccess, propertyController.getAgentPropertyReviews);
router.get('/agent/reviews/summary', property_middleware_1.validateAgent, propertyController.getAgentReviewsSummary);
// --- AGENT AS HOST ROUTES ---
// Agent's own property management
router.post('/agent/own/properties', property_middleware_1.validateAgent, property_middleware_1.validateAgentAsHost, property_middleware_1.validateProperty, propertyController.createAgentOwnProperty);
router.get('/agent/own/properties', property_middleware_1.validateAgent, propertyController.getAgentOwnProperties);
router.get('/agent/own/properties/:id/bookings', property_middleware_1.validateAgent, propertyController.getAgentOwnPropertyBookings);
router.get('/agent/own/guests', property_middleware_1.validateAgent, propertyController.getAgentOwnPropertyGuests);
// Unified agent property management
router.get('/agent/all-properties', property_middleware_1.validateAgent, propertyController.getAllAgentProperties);
// Agent's own property editing (full access like a host)
router.put('/agent/own/properties/:id', property_middleware_1.validateAgent, propertyController.updateProperty);
router.delete('/agent/own/properties/:id', property_middleware_1.validateAgent, propertyController.deleteProperty);
router.post('/agent/own/properties/:id/images', property_middleware_1.validateAgent, propertyController.uploadPropertyImages);
// --- ENHANCED AGENT KPI ROUTES ---
router.get('/agent/dashboard/enhanced', property_middleware_1.validateAgent, propertyController.getEnhancedAgentDashboard);
router.get('/agent/kpis/additional', property_middleware_1.validateAgent, propertyController.getAdditionalAgentKPIs);
router.get('/agent/performance/trends', property_middleware_1.validateAgent, propertyController.getAgentPerformanceTrends);
router.get('/agent/competitive/metrics', property_middleware_1.validateAgent, propertyController.getAgentCompetitiveMetrics);
router.get('/agent/clients/segmentation', property_middleware_1.validateAgent, propertyController.getAgentClientSegmentation);
router.get('/agent/kpis/individual/:kpi', property_middleware_1.validateAgent, propertyController.getIndividualAgentKPI);
// --- REAL-TIME TRANSACTION MONITORING ROUTES ---
// WebSocket endpoints would be handled separately, but these HTTP endpoints support real-time features
router.get('/agent/transactions/realtime/status', property_middleware_1.validateAgent, enhancedPropertyController.getTransactionStatus);
router.get('/agent/transactions/realtime/updates', property_middleware_1.validateAgent, enhancedPropertyController.getTransactionMonitoringDashboard);
// --- TRANSACTION WEBHOOK ENDPOINTS (for Pesapal integration) ---
// These would typically be handled by a separate webhook controller
router.post('/webhooks/pesapal/escrow', handlePesapalEscrowWebhook);
router.post('/webhooks/pesapal/payment', handlePesapalPaymentWebhook);
// --- BULK TRANSACTION OPERATIONS ---
router.post('/agent/transactions/bulk/export', property_middleware_1.validateAgent, enhancedPropertyController.exportTransactions);
// Webhook handlers (these would be implemented separately)
async function handlePesapalEscrowWebhook(req, res) {
    try {
        const { order_id, tracking_id, status, amount, currency } = req.body;
        // Update escrow transaction status
        // This would be implemented in the enhanced property service
        res.json({ success: true, message: 'Webhook processed successfully' });
    }
    catch (error) {
        console.error('Pesapal escrow webhook error:', error);
        res.status(500).json({ success: false, message: 'Webhook processing failed' });
    }
}
async function handlePesapalPaymentWebhook(req, res) {
    try {
        const { order_id, tracking_id, status, amount, currency } = req.body;
        // Update payment transaction status
        // This would be implemented in the enhanced property service
        res.json({ success: true, message: 'Webhook processed successfully' });
    }
    catch (error) {
        console.error('Pesapal payment webhook error:', error);
        res.status(500).json({ success: false, message: 'Webhook processing failed' });
    }
}
exports.default = router;
