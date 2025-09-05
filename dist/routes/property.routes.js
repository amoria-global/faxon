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
// --- PROPERTY MANAGEMENT ---
router.post('/', property_middleware_1.validateProperty, propertyController.createProperty);
router.put('/:id', property_middleware_1.validateHost, propertyController.updateProperty);
router.delete('/:id', property_middleware_1.validateHost, propertyController.deleteProperty);
router.get('/host/my-properties', property_middleware_1.validateHost, propertyController.getMyProperties);
// Property status management
router.patch('/:id/activate', property_middleware_1.validateHost, propertyController.activateProperty);
router.patch('/:id/deactivate', property_middleware_1.validateHost, propertyController.deactivateProperty);
// Property availability management
router.patch('/:id/availability', property_middleware_1.validateHost, propertyController.updatePropertyAvailability);
router.post('/:id/block-dates', property_middleware_1.validateHost, propertyController.blockPropertyDates);
// Property pricing management
router.patch('/:id/pricing', property_middleware_1.validateHost, propertyController.updatePropertyPricing);
// --- MEDIA MANAGEMENT ---
router.post('/:id/images', property_middleware_1.validateHost, propertyController.uploadPropertyImages);
router.delete('/:id/images', property_middleware_1.validateHost, propertyController.removePropertyImage);
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
// --- GUEST MANAGEMENT ---
router.get('/host/guests', property_middleware_1.validateHost, propertyController.getHostGuests);
router.get('/host/guests/:guestId', property_middleware_1.validateHost, propertyController.getGuestDetails);
// --- EARNINGS & FINANCIAL ---
router.get('/host/earnings', property_middleware_1.validateHost, propertyController.getEarningsOverview);
router.get('/host/earnings/breakdown', property_middleware_1.validateHost, propertyController.getEarningsBreakdown);
// --- ANALYTICS ---
router.get('/host/analytics', property_middleware_1.validateHost, propertyController.getHostAnalytics);
// --- REVIEW MANAGEMENT ---
router.post('/:id/reviews', propertyController.createReview);
exports.default = router;
