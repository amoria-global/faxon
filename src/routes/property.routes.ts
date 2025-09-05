import { Router } from 'express';
import { PropertyController } from '../controllers/property.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validateProperty, validateBookingUpdate, validateHost } from '../middleware/property.middleware';

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

// --- PROPERTY MANAGEMENT ---
router.post('/', validateProperty, propertyController.createProperty);
router.put('/:id', validateHost, propertyController.updateProperty);
router.delete('/:id', validateHost, propertyController.deleteProperty);
router.get('/host/my-properties', validateHost, propertyController.getMyProperties);

// Property status management
router.patch('/:id/activate', validateHost, propertyController.activateProperty);
router.patch('/:id/deactivate', validateHost, propertyController.deactivateProperty);

// Property availability management
router.patch('/:id/availability', validateHost, propertyController.updatePropertyAvailability);
router.post('/:id/block-dates', validateHost, propertyController.blockPropertyDates);

// Property pricing management
router.patch('/:id/pricing', validateHost, propertyController.updatePropertyPricing);

// --- MEDIA MANAGEMENT ---
router.post('/:id/images', validateHost, propertyController.uploadPropertyImages);
router.delete('/:id/images', validateHost, propertyController.removePropertyImage);

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

// --- GUEST MANAGEMENT ---
router.get('/host/guests', validateHost, propertyController.getHostGuests);
router.get('/host/guests/:guestId', validateHost, propertyController.getGuestDetails);

// --- EARNINGS & FINANCIAL ---
router.get('/host/earnings', validateHost, propertyController.getEarningsOverview);
router.get('/host/earnings/breakdown', validateHost, propertyController.getEarningsBreakdown);

// --- ANALYTICS ---
router.get('/host/analytics', validateHost, propertyController.getHostAnalytics);

// --- REVIEW MANAGEMENT ---
router.post('/:id/reviews', propertyController.createReview);

export default router;