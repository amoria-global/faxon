import { Router } from 'express';
import { TourController } from '../controllers/tours.controller';
import { authenticate } from '../middleware/auth.middleware';
import {
  validateTour,
  validateTourGuide,
  validateAdmin,
  validateAdminOrTourGuide,
  validateTourGuideAccess,
  validateTourBooking,
  validateTourBookingUpdate,
  validateTourSchedule,
  validateTourImageUpload,
  validateBookingAccess,
  validateBulkOperation,
  validateGuest,
  validateReviewPermissions,
  validateScheduleAccess,
  cacheMiddleware
} from '../middleware/tours.middleware';

const router = Router();
const tourController = new TourController();

// --- PUBLIC TOUR ROUTES (No Authentication Required) ---
// Search and browse tours
router.get('/search', cacheMiddleware(300), tourController.searchTours);
router.get('/featured', cacheMiddleware(600), tourController.getFeaturedTours);
router.get('/categories', cacheMiddleware(3600), tourController.getTourCategories);
router.get('/suggestions/location', cacheMiddleware(1800), tourController.getLocationSuggestions);
router.get('/guides/search', cacheMiddleware(300), tourController.searchTourGuides);
router.get('/:id', cacheMiddleware(300), tourController.getTourById);
router.get('/:id/reviews', cacheMiddleware(300), tourController.getTourReviews);
router.get('/:id/schedules', cacheMiddleware(300), tourController.getTourSchedules);

// --- PROTECTED ROUTES (Authentication Required) ---
router.use(authenticate); // All routes below require authentication

// --- GUEST TOUR BOOKING ROUTES ---
router.post('/bookings', validateGuest, validateTourBooking, tourController.createTourBooking);
router.get('/guest/bookings', validateGuest, tourController.getMyTourBookings);
router.get('/guest/bookings/:bookingId', validateGuest, tourController.getMyTourBookingById); // NEW: Get specific booking by ID
router.post('/reviews', validateGuest, validateReviewPermissions, tourController.createTourReview);

// --- TOUR GUIDE DASHBOARD & OVERVIEW ---
router.get('/guide/dashboard', validateTourGuide, tourController.getTourGuideDashboard);
router.get('/guide/dashboard/enhanced', validateTourGuide, tourController.getEnhancedTourGuideDashboard);

// --- TOUR GUIDE TOUR MANAGEMENT ---
router.post('/', validateTourGuide, validateTour, tourController.createTour);
router.put('/:id', validateAdminOrTourGuide, validateTourGuideAccess, tourController.updateTour);
router.delete('/:id', validateAdminOrTourGuide, validateTourGuideAccess, tourController.deleteTour);
router.get('/guide/my-tours', validateTourGuide, tourController.getMyTours);

// Tour status management
router.patch('/:id/activate', validateAdminOrTourGuide, validateTourGuideAccess, tourController.activateTour);
router.patch('/:id/deactivate', validateAdminOrTourGuide, validateTourGuideAccess, tourController.deactivateTour);

// --- TOUR GUIDE SCHEDULE MANAGEMENT ---
router.post('/:id/schedules', validateAdminOrTourGuide, validateTourGuideAccess, validateTourSchedule, tourController.createTourSchedule);
router.put('/schedules/:scheduleId', validateAdminOrTourGuide, validateScheduleAccess, validateTourSchedule, tourController.updateTourSchedule);
router.delete('/schedules/:scheduleId', validateAdminOrTourGuide, validateScheduleAccess, tourController.deleteTourSchedule);

// --- TOUR GUIDE BOOKING MANAGEMENT ---
router.get('/guide/bookings', validateTourGuide, tourController.getTourBookings);
router.get('/guide/bookings/calendar', validateTourGuide, tourController.getTourBookingCalendar);
router.put('/guide/bookings/:bookingId', validateTourGuide, validateBookingAccess, validateTourBookingUpdate, tourController.updateTourBooking);

// --- TOUR GUIDE MEDIA MANAGEMENT ---
router.post('/:id/images', validateAdminOrTourGuide, validateTourGuideAccess, validateTourImageUpload, tourController.uploadTourImages);
router.delete('/:id/images', validateAdminOrTourGuide, validateTourGuideAccess, tourController.removeTourImage);

// --- TOUR GUIDE EARNINGS ---
router.get('/guide/earnings', validateTourGuide, tourController.getTourGuideEarnings);
router.get('/guide/earnings/breakdown', validateTourGuide, tourController.getTourGuideEarningsBreakdown);

// --- TOUR GUIDE ANALYTICS ---
router.get('/guide/analytics', validateTourGuide, tourController.getTourGuideAnalytics);
router.get('/:id/analytics', validateTourGuide, validateTourGuideAccess, tourController.getTourAnalytics);

// --- TOUR GUIDE MESSAGING ---
router.post('/messages', validateTourGuide, tourController.sendTourMessage);
router.get('/messages', validateTourGuide, tourController.getTourMessages);

// --- ADMIN TOUR MANAGEMENT ROUTES ---
// Admin dashboard and overview
router.get('/admin/tours', validateAdmin, tourController.getAllTours);
router.get('/admin/bookings', validateAdmin, tourController.getAllTourBookings);
router.get('/admin/analytics', validateAdmin, tourController.getTourSystemAnalytics);

// Admin bulk operations
router.patch('/admin/bulk-update-tours', validateAdmin, validateBulkOperation, tourController.bulkUpdateTours);
router.patch('/admin/bulk-update-bookings', validateAdmin, validateBulkOperation, tourController.bulkUpdateTourBookings);

// Note: Admin can now use the regular tour management routes (/:id, /schedules/:scheduleId, etc.)
// The following routes are kept for backward compatibility but are deprecated
// Admins should use PUT /:id instead of PUT /admin/tours/:id
router.put('/admin/bookings/:bookingId', validateAdmin, validateTourBookingUpdate, tourController.updateTourBooking);
router.get('/admin/tours/:id/schedules', validateAdmin, tourController.getTourSchedules);

export default router;