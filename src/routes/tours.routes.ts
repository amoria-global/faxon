import { Router } from 'express';
import { TourController } from '../controllers/tours.controller';
import { authenticate } from '../middleware/auth.middleware';
import { 
  validateTour, 
  validateTourGuide,
  validateAdmin,
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

// --- PROTECTED ROUTES (Authentication Required) ---
router.use(authenticate); // All routes below require authentication

// --- GUEST TOUR BOOKING ROUTES ---
router.post('/bookings', validateGuest, validateTourBooking, tourController.createTourBooking);
router.get('/guest/bookings', validateGuest, tourController.getMyTourBookings);
router.post('/reviews', validateGuest, validateReviewPermissions, tourController.createTourReview);

// --- TOUR GUIDE DASHBOARD & OVERVIEW ---
router.get('/guide/dashboard', validateTourGuide, tourController.getTourGuideDashboard);
router.get('/guide/dashboard/enhanced', validateTourGuide, tourController.getEnhancedTourGuideDashboard);

// --- TOUR GUIDE TOUR MANAGEMENT ---
router.post('/', validateTourGuide, validateTour, tourController.createTour);
router.put('/:id', validateTourGuide, validateTourGuideAccess, tourController.updateTour);
router.delete('/:id', validateTourGuide, validateTourGuideAccess, tourController.deleteTour);
router.get('/guide/my-tours', validateTourGuide, tourController.getMyTours);

// Tour status management
router.patch('/:id/activate', validateTourGuide, validateTourGuideAccess, tourController.activateTour);
router.patch('/:id/deactivate', validateTourGuide, validateTourGuideAccess, tourController.deactivateTour);

// --- TOUR GUIDE SCHEDULE MANAGEMENT ---
router.post('/:id/schedules', validateTourGuide, validateTourGuideAccess, validateTourSchedule, tourController.createTourSchedule);
router.get('/:id/schedules', validateTourGuide, validateTourGuideAccess, tourController.getTourSchedules);
router.put('/schedules/:scheduleId', validateTourGuide, validateScheduleAccess, validateTourSchedule, tourController.updateTourSchedule);
router.delete('/schedules/:scheduleId', validateTourGuide, validateScheduleAccess, tourController.deleteTourSchedule);

// --- TOUR GUIDE BOOKING MANAGEMENT ---
router.get('/guide/bookings', validateTourGuide, tourController.getTourBookings);
router.get('/guide/bookings/calendar', validateTourGuide, tourController.getTourBookingCalendar);
router.put('/guide/bookings/:bookingId', validateTourGuide, validateBookingAccess, validateTourBookingUpdate, tourController.updateTourBooking);

// --- TOUR GUIDE MEDIA MANAGEMENT ---
router.post('/:id/images', validateTourGuide, validateTourGuideAccess, validateTourImageUpload, tourController.uploadTourImages);
router.delete('/:id/images', validateTourGuide, validateTourGuideAccess, tourController.removeTourImage);

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

// Admin can access any tour/booking (no validateTourGuideAccess needed)
router.put('/admin/tours/:id', validateAdmin, tourController.updateTour);
router.delete('/admin/tours/:id', validateAdmin, tourController.deleteTour);
router.put('/admin/bookings/:bookingId', validateAdmin, validateTourBookingUpdate, tourController.updateTourBooking);

// Admin schedule management
router.post('/admin/tours/:id/schedules', validateAdmin, validateTourSchedule, tourController.createTourSchedule);
router.get('/admin/tours/:id/schedules', validateAdmin, tourController.getTourSchedules);
router.put('/admin/schedules/:scheduleId', validateAdmin, validateTourSchedule, tourController.updateTourSchedule);
router.delete('/admin/schedules/:scheduleId', validateAdmin, tourController.deleteTourSchedule);

// Admin media management
router.post('/admin/tours/:id/images', validateAdmin, validateTourImageUpload, tourController.uploadTourImages);
router.delete('/admin/tours/:id/images', validateAdmin, tourController.removeTourImage);

// Admin status management
router.patch('/admin/tours/:id/activate', validateAdmin, tourController.activateTour);
router.patch('/admin/tours/:id/deactivate', validateAdmin, tourController.deactivateTour);

export default router;