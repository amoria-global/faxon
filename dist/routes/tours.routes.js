"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const tours_controller_1 = require("../controllers/tours.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const tours_middleware_1 = require("../middleware/tours.middleware");
const router = (0, express_1.Router)();
const tourController = new tours_controller_1.TourController();
// --- PUBLIC TOUR ROUTES (No Authentication Required) ---
// Search and browse tours
router.get('/search', (0, tours_middleware_1.cacheMiddleware)(300), tourController.searchTours);
router.get('/featured', (0, tours_middleware_1.cacheMiddleware)(600), tourController.getFeaturedTours);
router.get('/categories', (0, tours_middleware_1.cacheMiddleware)(3600), tourController.getTourCategories);
router.get('/suggestions/location', (0, tours_middleware_1.cacheMiddleware)(1800), tourController.getLocationSuggestions);
router.get('/guides/search', (0, tours_middleware_1.cacheMiddleware)(300), tourController.searchTourGuides);
router.get('/:id', (0, tours_middleware_1.cacheMiddleware)(300), tourController.getTourById);
router.get('/:id/reviews', (0, tours_middleware_1.cacheMiddleware)(300), tourController.getTourReviews);
// --- PROTECTED ROUTES (Authentication Required) ---
router.use(auth_middleware_1.authenticate); // All routes below require authentication
// --- GUEST TOUR BOOKING ROUTES ---
router.post('/bookings', tours_middleware_1.validateGuest, tours_middleware_1.validateTourBooking, tourController.createTourBooking);
router.get('/guest/bookings', tours_middleware_1.validateGuest, tourController.getMyTourBookings);
router.post('/reviews', tours_middleware_1.validateGuest, tours_middleware_1.validateReviewPermissions, tourController.createTourReview);
// --- TOUR GUIDE DASHBOARD & OVERVIEW ---
router.get('/guide/dashboard', tours_middleware_1.validateTourGuide, tourController.getTourGuideDashboard);
router.get('/guide/dashboard/enhanced', tours_middleware_1.validateTourGuide, tourController.getEnhancedTourGuideDashboard);
// --- TOUR GUIDE TOUR MANAGEMENT ---
router.post('/', tours_middleware_1.validateTourGuide, tours_middleware_1.validateTour, tourController.createTour);
router.put('/:id', tours_middleware_1.validateTourGuide, tours_middleware_1.validateTourGuideAccess, tourController.updateTour);
router.delete('/:id', tours_middleware_1.validateTourGuide, tours_middleware_1.validateTourGuideAccess, tourController.deleteTour);
router.get('/guide/my-tours', tours_middleware_1.validateTourGuide, tourController.getMyTours);
// Tour status management
router.patch('/:id/activate', tours_middleware_1.validateTourGuide, tours_middleware_1.validateTourGuideAccess, tourController.activateTour);
router.patch('/:id/deactivate', tours_middleware_1.validateTourGuide, tours_middleware_1.validateTourGuideAccess, tourController.deactivateTour);
// --- TOUR GUIDE SCHEDULE MANAGEMENT ---
router.post('/:id/schedules', tours_middleware_1.validateTourGuide, tours_middleware_1.validateTourGuideAccess, tours_middleware_1.validateTourSchedule, tourController.createTourSchedule);
router.get('/:id/schedules', tours_middleware_1.validateTourGuide, tours_middleware_1.validateTourGuideAccess, tourController.getTourSchedules);
router.put('/schedules/:scheduleId', tours_middleware_1.validateTourGuide, tours_middleware_1.validateScheduleAccess, tours_middleware_1.validateTourSchedule, tourController.updateTourSchedule);
router.delete('/schedules/:scheduleId', tours_middleware_1.validateTourGuide, tours_middleware_1.validateScheduleAccess, tourController.deleteTourSchedule);
// --- TOUR GUIDE BOOKING MANAGEMENT ---
router.get('/guide/bookings', tours_middleware_1.validateTourGuide, tourController.getTourBookings);
router.get('/guide/bookings/calendar', tours_middleware_1.validateTourGuide, tourController.getTourBookingCalendar);
router.put('/guide/bookings/:bookingId', tours_middleware_1.validateTourGuide, tours_middleware_1.validateBookingAccess, tours_middleware_1.validateTourBookingUpdate, tourController.updateTourBooking);
// --- TOUR GUIDE MEDIA MANAGEMENT ---
router.post('/:id/images', tours_middleware_1.validateTourGuide, tours_middleware_1.validateTourGuideAccess, tours_middleware_1.validateTourImageUpload, tourController.uploadTourImages);
router.delete('/:id/images', tours_middleware_1.validateTourGuide, tours_middleware_1.validateTourGuideAccess, tourController.removeTourImage);
// --- TOUR GUIDE EARNINGS ---
router.get('/guide/earnings', tours_middleware_1.validateTourGuide, tourController.getTourGuideEarnings);
router.get('/guide/earnings/breakdown', tours_middleware_1.validateTourGuide, tourController.getTourGuideEarningsBreakdown);
// --- TOUR GUIDE ANALYTICS ---
router.get('/guide/analytics', tours_middleware_1.validateTourGuide, tourController.getTourGuideAnalytics);
router.get('/:id/analytics', tours_middleware_1.validateTourGuide, tours_middleware_1.validateTourGuideAccess, tourController.getTourAnalytics);
// --- TOUR GUIDE MESSAGING ---
router.post('/messages', tours_middleware_1.validateTourGuide, tourController.sendTourMessage);
router.get('/messages', tours_middleware_1.validateTourGuide, tourController.getTourMessages);
// --- ADMIN TOUR MANAGEMENT ROUTES ---
// Admin dashboard and overview
router.get('/admin/tours', tours_middleware_1.validateAdmin, tourController.getAllTours);
router.get('/admin/bookings', tours_middleware_1.validateAdmin, tourController.getAllTourBookings);
router.get('/admin/analytics', tours_middleware_1.validateAdmin, tourController.getTourSystemAnalytics);
// Admin bulk operations
router.patch('/admin/bulk-update-tours', tours_middleware_1.validateAdmin, tours_middleware_1.validateBulkOperation, tourController.bulkUpdateTours);
router.patch('/admin/bulk-update-bookings', tours_middleware_1.validateAdmin, tours_middleware_1.validateBulkOperation, tourController.bulkUpdateTourBookings);
// Admin can access any tour/booking (no validateTourGuideAccess needed)
router.put('/admin/tours/:id', tours_middleware_1.validateAdmin, tourController.updateTour);
router.delete('/admin/tours/:id', tours_middleware_1.validateAdmin, tourController.deleteTour);
router.put('/admin/bookings/:bookingId', tours_middleware_1.validateAdmin, tours_middleware_1.validateTourBookingUpdate, tourController.updateTourBooking);
// Admin schedule management
router.post('/admin/tours/:id/schedules', tours_middleware_1.validateAdmin, tours_middleware_1.validateTourSchedule, tourController.createTourSchedule);
router.get('/admin/tours/:id/schedules', tours_middleware_1.validateAdmin, tourController.getTourSchedules);
router.put('/admin/schedules/:scheduleId', tours_middleware_1.validateAdmin, tours_middleware_1.validateTourSchedule, tourController.updateTourSchedule);
router.delete('/admin/schedules/:scheduleId', tours_middleware_1.validateAdmin, tourController.deleteTourSchedule);
// Admin media management
router.post('/admin/tours/:id/images', tours_middleware_1.validateAdmin, tours_middleware_1.validateTourImageUpload, tourController.uploadTourImages);
router.delete('/admin/tours/:id/images', tours_middleware_1.validateAdmin, tourController.removeTourImage);
// Admin status management
router.patch('/admin/tours/:id/activate', tours_middleware_1.validateAdmin, tourController.activateTour);
router.patch('/admin/tours/:id/deactivate', tours_middleware_1.validateAdmin, tourController.deactivateTour);
exports.default = router;
