// Enhanced Property Routes with Transaction Monitoring
import { Router } from 'express';
import { PropertyController } from '../controllers/property.controller';
import { EnhancedPropertyController } from '../controllers/enhanced-property.controller';
import { AgentPerformanceController } from '../controllers/agent-performance.controller';
import { authenticate } from '../middleware/auth.middleware';
import {
  validateProperty,
  validateBookingUpdate,
  validateHost,
  validateAgent,
  validateAgentPropertyAccess,
  validateAgentPropertyEdit
  // validateAgentAsHost - REMOVED: Agents can no longer own properties
} from '../middleware/property.middleware';

const router = Router();
const propertyController = new PropertyController();
const enhancedPropertyController = new EnhancedPropertyController();
const agentPerformanceController = new AgentPerformanceController();

// --- PUBLIC PROPERTY ROUTES ---
// Search and browse properties
router.get('/search', propertyController.searchProperties);
router.get('/featured', propertyController.getFeaturedProperties);
router.get('/suggestions/location', propertyController.getLocationSuggestions);
router.get('/:id', propertyController.getPropertyById);
router.get('/:id/similar', propertyController.getSimilarProperties);
router.get('/:id/reviews', propertyController.getPropertyReviews);

// --- PROTECTED ROUTES (Authentication Required) ---
router.use(authenticate); // All routes below require authentication

// --- HOST DASHBOARD & OVERVIEW ---
router.get('/host/dashboard', validateHost, propertyController.getHostDashboard);
router.get('/host/dashboard/enhanced', validateHost, propertyController.getEnhancedDashboard);
router.get('/host/quick-stats', validateHost, propertyController.getQuickStats);
router.get('/host/recent-activity', validateHost, propertyController.getRecentActivity);

// --- HOST PROPERTY MANAGEMENT ---
router.post('/', validateProperty, propertyController.createProperty);
router.put('/:id', validateHost, propertyController.updateProperty);
router.delete('/:id', validateHost, propertyController.deleteProperty);
router.get('/host/my-properties', validateHost, propertyController.getMyProperties);

// Host property status management
router.patch('/:id/activate', validateHost, propertyController.activateProperty);
router.patch('/:id/deactivate', validateHost, propertyController.deactivateProperty);

// Host property availability management
router.patch('/:id/availability', validateHost, propertyController.updatePropertyAvailability);
router.post('/:id/block-dates', validateHost, propertyController.blockPropertyDates);

// Host property pricing management
router.patch('/:id/pricing', validateHost, propertyController.updatePropertyPricing);

// --- AGENT DASHBOARD (CONSOLIDATED SINGLE ENDPOINT) ---
// Comprehensive agent dashboard with all stats, recent data, wallet, and activity
router.get('/agent/dashboard', validateAgent, enhancedPropertyController.getAgentDashboard);

// --- AGENT PERFORMANCE DASHBOARD (JAMBOLUSH STYLE) ---
// Agent performance dashboard matching Jambolush design with KPIs, scores, rankings
router.get('/agent/performance', validateAgent, agentPerformanceController.getPerformanceDashboard);
router.post('/agent/performance/save-metrics', validateAgent, agentPerformanceController.saveMonthlyMetrics);

// --- AGENT TRANSACTION MONITORING ROUTES ---
// Transaction monitoring dashboard
router.get('/agent/transactions/monitoring', validateAgent, enhancedPropertyController.getTransactionMonitoringDashboard);

// Escrow transaction routes
router.get('/agent/transactions/escrow', validateAgent, enhancedPropertyController.getAgentEscrowTransactions);
router.get('/agent/transactions/escrow/summary', validateAgent, enhancedPropertyController.getAgentTransactionSummary);

// Payment transaction routes
router.get('/agent/transactions/payment', validateAgent, enhancedPropertyController.getAgentPaymentTransactions);

// Combined transaction routes
router.get('/agent/transactions/summary', validateAgent, enhancedPropertyController.getAgentTransactionSummary);
router.get('/agent/transactions/analytics', validateAgent, enhancedPropertyController.getTransactionAnalytics);
router.get('/agent/transactions/status/:transactionId', validateAgent, enhancedPropertyController.getTransactionStatus);

// Commission and earnings with transaction breakdown
router.get('/agent/earnings', validateAgent, enhancedPropertyController.getAgentEarningsWithTransactions);
router.get('/agent/earnings/breakdown', validateAgent, propertyController.getAgentEarningsBreakdown);
router.get('/agent/commissions/states', validateAgent, enhancedPropertyController.getAgentCommissionStates);
router.get('/agent/commissions/monthly', validateAgent, enhancedPropertyController.getMonthlyCommissionsWithTransactions);

// Withdrawal requests
router.get('/agent/withdrawals', validateAgent, enhancedPropertyController.getAgentWithdrawalRequests);

// Booking transaction data
router.get('/agent/bookings/:bookingId/transactions', validateAgent, enhancedPropertyController.getBookingTransactionData);

// Transaction export
router.get('/agent/transactions/export', validateAgent, enhancedPropertyController.exportTransactions);

// --- LEGACY AGENT PROPERTY MANAGEMENT (Enhanced with Transaction Support) ---
router.get('/agent/properties', validateAgent, propertyController.getAgentProperties);
router.get('/agent/properties/performance', validateAgent, propertyController.getAgentPropertyPerformance);

// Agent property viewing and limited editing
router.get('/agent/properties/:id', validateAgent, validateAgentPropertyAccess, propertyController.getAgentPropertyDetails);
router.patch('/agent/properties/:id/edit', validateAgent, validateAgentPropertyAccess, validateAgentPropertyEdit, propertyController.updateAgentProperty);

// Agent property booking management for clients
router.get('/agent/properties/:id/bookings', validateAgent, validateAgentPropertyAccess, propertyController.getAgentPropertyBookings);
router.post('/agent/properties/:id/bookings', validateAgent, validateAgentPropertyAccess, propertyController.createAgentBooking);

// Agent analytics for client properties
router.get('/agent/properties/:id/analytics', validateAgent, validateAgentPropertyAccess, propertyController.getAgentPropertyAnalytics);
router.get('/agent/properties/analytics/summary', validateAgent, propertyController.getAgentPropertiesAnalyticsSummary);

// Agent client relationship management
router.post('/agent/clients/:clientId/relationship', validateAgent, propertyController.establishClientRelationship);
router.get('/agent/clients', validateAgent, propertyController.getAgentClients);

// Agent property fix endpoint (for migration)
router.post('/agent/properties/fix-agent-id', validateAgent, propertyController.fixAgentPropertiesAgentId);

// Agent client property management
router.get('/agent/clients/:clientId/properties', validateAgent, propertyController.getClientProperties);
router.post('/agent/clients/:clientId/properties', validateAgent, validateProperty, propertyController.createClientProperty);

// --- MEDIA MANAGEMENT ---
// Host media management
router.post('/:id/images', validateHost, propertyController.uploadPropertyImages);
router.delete('/:id/images', validateHost, propertyController.removePropertyImage);

// Agent media management (limited)
router.post('/agent/properties/:id/images', validateAgent, validateAgentPropertyAccess, propertyController.uploadAgentPropertyImages);

// --- BOOKING MANAGEMENT ---
// Create booking (for guests)
router.post('/bookings', propertyController.createBooking);

// Host booking management
router.get('/host/bookings', validateHost, propertyController.getHostBookings);
router.get('/host/bookings/calendar', validateHost, propertyController.getBookingCalendar);
router.put('/host/bookings/:bookingId', validateHost, validateBookingUpdate, propertyController.updateBooking);
router.patch('/host/bookings/bulk-update', validateHost, propertyController.bulkUpdateBookings);

// Property-specific bookings
router.get('/:id/bookings', validateHost, propertyController.getPropertyBookings);

// Agent booking management
router.get('/agent/bookings', validateAgent, propertyController.getAgentBookings);
router.get('/agent/bookings/calendar', validateAgent, propertyController.getAgentBookingCalendar);
router.put('/agent/bookings/:bookingId', validateAgent, validateBookingUpdate, propertyController.updateAgentBooking);

// --- GUEST MANAGEMENT --- 
// Host guest management
router.get('/host/guests', validateHost, propertyController.getHostGuests);
router.get('/host/guests/:guestId', validateHost, propertyController.getGuestDetails);

// Agent guest management
router.get('/agent/guests', validateAgent, propertyController.getAgentGuests);
router.get('/agent/clients/:clientId/guests', validateAgent, propertyController.getClientGuests);

// --- EARNINGS & FINANCIAL ---
// Host earnings
router.get('/host/earnings', validateHost, propertyController.getEarningsOverview);
router.get('/host/earnings/breakdown', validateHost, propertyController.getEarningsBreakdown);

// --- ANALYTICS ---
// Host analytics
router.get('/host/analytics', validateHost, propertyController.getHostAnalytics);

// --- REVIEW MANAGEMENT ---
router.post('/:id/reviews', propertyController.createReview);

// Agent review management
router.get('/agent/properties/:id/reviews', validateAgent, validateAgentPropertyAccess, propertyController.getAgentPropertyReviews);
router.get('/agent/reviews/summary', validateAgent, propertyController.getAgentReviewsSummary);

// --- AGENT AS HOST ROUTES ---
// DISABLED: Agents cannot own properties, they can only manage client properties
// router.post('/agent/own/properties', validateAgent, validateAgentAsHost, validateProperty, propertyController.createAgentOwnProperty);
// router.get('/agent/own/properties', validateAgent, propertyController.getAgentOwnProperties);
// router.get('/agent/own/properties/:id/bookings', validateAgent, propertyController.getAgentOwnPropertyBookings);
// router.get('/agent/own/guests', validateAgent, propertyController.getAgentOwnPropertyGuests);

// Unified agent property management (now only returns managed properties)
router.get('/agent/all-properties', validateAgent, propertyController.getAllAgentProperties);

// DISABLED: Agent's own property editing (agents cannot own properties)
// router.put('/agent/own/properties/:id', validateAgent, propertyController.updateProperty);
// router.delete('/agent/own/properties/:id', validateAgent, propertyController.deleteProperty);
// router.post('/agent/own/properties/:id/images', validateAgent, propertyController.uploadPropertyImages);

// --- ENHANCED AGENT KPI ROUTES (OPTIONAL - Use main /agent/dashboard for comprehensive data) ---
// These routes are kept for backward compatibility and granular access to specific metrics
router.get('/agent/kpis/additional', validateAgent, propertyController.getAdditionalAgentKPIs);
router.get('/agent/performance/trends', validateAgent, propertyController.getAgentPerformanceTrends);
router.get('/agent/competitive/metrics', validateAgent, propertyController.getAgentCompetitiveMetrics);
router.get('/agent/clients/segmentation', validateAgent, propertyController.getAgentClientSegmentation);
router.get('/agent/kpis/individual/:kpi', validateAgent, propertyController.getIndividualAgentKPI);

// --- REAL-TIME TRANSACTION MONITORING ROUTES ---
// WebSocket endpoints would be handled separately, but these HTTP endpoints support real-time features
router.get('/agent/transactions/realtime/status', validateAgent, enhancedPropertyController.getTransactionStatus);
router.get('/agent/transactions/realtime/updates', validateAgent, enhancedPropertyController.getTransactionMonitoringDashboard);

// --- TRANSACTION WEBHOOK ENDPOINTS (for Pesapal integration) ---
// These would typically be handled by a separate webhook controller
router.post('/webhooks/pesapal/escrow', handlePesapalEscrowWebhook);
router.post('/webhooks/pesapal/payment', handlePesapalPaymentWebhook);

// --- BULK TRANSACTION OPERATIONS ---
router.post('/agent/transactions/bulk/export', validateAgent, enhancedPropertyController.exportTransactions);

// Webhook handlers (these would be implemented separately)
async function handlePesapalEscrowWebhook(req: any, res: any) {
  try {
    const { order_id, tracking_id, status, amount, currency } = req.body;
    
    // Update escrow transaction status
    // This would be implemented in the enhanced property service
    
    res.json({ success: true, message: 'Webhook processed successfully' });
  } catch (error) {
    console.error('Pesapal escrow webhook error:', error);
    res.status(500).json({ success: false, message: 'Webhook processing failed' });
  }
}

async function handlePesapalPaymentWebhook(req: any, res: any) {
  try {
    const { order_id, tracking_id, status, amount, currency } = req.body;
    
    // Update payment transaction status
    // This would be implemented in the enhanced property service
    
    res.json({ success: true, message: 'Webhook processed successfully' });
  } catch (error) {
    console.error('Pesapal payment webhook error:', error);
    res.status(500).json({ success: false, message: 'Webhook processing failed' });
  }
}

export default router;