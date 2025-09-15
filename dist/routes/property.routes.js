"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const property_controller_1 = require("../controllers/property.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const property_middleware_1 = require("../middleware/property.middleware");
const router = (0, express_1.Router)();
const propertyController = new property_controller_1.PropertyController();
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
// --- AGENT PROPERTY MANAGEMENT (Limited Access) ---
// Agent dashboard and overview
router.get('/agent/dashboard', property_middleware_1.validateAgent, propertyController.getAgentDashboard);
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
// Agent earnings from client properties
router.get('/agent/earnings', property_middleware_1.validateAgent, propertyController.getAgentEarnings);
router.get('/agent/earnings/breakdown', property_middleware_1.validateAgent, propertyController.getAgentEarningsBreakdown);
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
// Agent earnings already defined above
// --- ANALYTICS ---
// Host analytics
router.get('/host/analytics', property_middleware_1.validateHost, propertyController.getHostAnalytics);
// Agent analytics already defined above
// --- REVIEW MANAGEMENT ---
router.post('/:id/reviews', propertyController.createReview);
// Agent review management
router.get('/agent/properties/:id/reviews', property_middleware_1.validateAgent, property_middleware_1.validateAgentPropertyAccess, propertyController.getAgentPropertyReviews);
router.get('/agent/reviews/summary', property_middleware_1.validateAgent, propertyController.getAgentReviewsSummary);
exports.default = router;
