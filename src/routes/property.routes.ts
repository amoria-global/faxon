import { Router } from 'express';
import { PropertyController } from '../controllers/property.controller';
import { authenticate } from '../middleware/auth.middleware';
import { 
  validateProperty, 
  validateBookingUpdate, 
  validateHost,
  validateAgent,
  validateAgentPropertyAccess,
  validateAgentPropertyEdit, 
  validateAgentAsHost
} from '../middleware/property.middleware';

const router = Router();
const propertyController = new PropertyController();

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

// --- AGENT PROPERTY MANAGEMENT (Limited Access) ---
// Agent dashboard and overview
router.get('/agent/dashboard', validateAgent, propertyController.getAgentDashboard);
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

// Agent earnings from client properties
router.get('/agent/earnings', validateAgent, propertyController.getAgentEarnings);
router.get('/agent/earnings/breakdown', validateAgent, propertyController.getAgentEarningsBreakdown);

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

// Agent earnings already defined above

// --- ANALYTICS ---
// Host analytics
router.get('/host/analytics', validateHost, propertyController.getHostAnalytics);

// Agent analytics already defined above

// --- REVIEW MANAGEMENT ---
router.post('/:id/reviews', propertyController.createReview);

// Agent review management
router.get('/agent/properties/:id/reviews', validateAgent, validateAgentPropertyAccess, propertyController.getAgentPropertyReviews);
router.get('/agent/reviews/summary', validateAgent, propertyController.getAgentReviewsSummary);
// Add these routes to your existing router

// --- AGENT AS HOST ROUTES ---
// Agent's own property management
router.post('/agent/own/properties', validateAgent, validateAgentAsHost, validateProperty, propertyController.createAgentOwnProperty);
router.get('/agent/own/properties', validateAgent, propertyController.getAgentOwnProperties);
router.get('/agent/own/properties/:id/bookings', validateAgent, propertyController.getAgentOwnPropertyBookings);
router.get('/agent/own/guests', validateAgent, propertyController.getAgentOwnPropertyGuests);

// Unified agent property management
router.get('/agent/all-properties', validateAgent, propertyController.getAllAgentProperties);
router.get('/agent/dashboard/enhanced', validateAgent, propertyController.getEnhancedAgentDashboard);

// Agent's own property editing (full access like a host)
router.put('/agent/own/properties/:id', validateAgent, propertyController.updateProperty);
router.delete('/agent/own/properties/:id', validateAgent, propertyController.deleteProperty);
router.post('/agent/own/properties/:id/images', validateAgent, propertyController.uploadPropertyImages);
// Add these routes to your existing property routes file
// Insert these after the existing agent routes

// --- ENHANCED AGENT KPI ROUTES ---
router.get('/agent/dashboard/enhanced', validateAgent, propertyController.getEnhancedAgentDashboard);
router.get('/agent/kpis/additional', validateAgent, propertyController.getAdditionalAgentKPIs);
router.get('/agent/performance/trends', validateAgent, propertyController.getAgentPerformanceTrends);
router.get('/agent/competitive/metrics', validateAgent, propertyController.getAgentCompetitiveMetrics);
router.get('/agent/clients/segmentation', validateAgent, propertyController.getAgentClientSegmentation);
router.get('/agent/kpis/individual/:kpi', validateAgent, propertyController.getIndividualAgentKPI);

export default router;