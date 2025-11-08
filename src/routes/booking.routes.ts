//src/routes/booking.routes.ts
import { Router } from 'express';
import { BookingController } from '../controllers/booking.controller';
import { authenticate } from '../middleware/auth.middleware';
import { 
  validatePropertyBooking, 
  validateTourBooking, 
  validateBookingUpdate,
  validateAgent,
  validateBookingAccess,
  validateWishlistItem,
  validateWishlistFilters
} from '../middleware/booking.middleware';

const router = Router();
const bookingController = new BookingController();

// --- AUTHENTICATION REQUIRED FOR ALL ROUTES ---
router.use(authenticate);

// --- PROPERTY BOOKING ROUTES ---
// Create property booking
router.post('/properties', validatePropertyBooking, bookingController.createPropertyBooking);

// Get specific property booking
router.get('/properties/:bookingId', validateBookingAccess, bookingController.getPropertyBooking);

// Update property booking
router.put('/properties/:bookingId', validateBookingUpdate, bookingController.updatePropertyBooking);

// Search user's property bookings
router.get('/properties', bookingController.searchPropertyBookings);

// Cancel property booking (guest only)
router.patch('/properties/:bookingId/cancel', (req, res, next) => {
  if (req.user?.userType && req.user.userType !== 'guest') {
    return res.status(403).json({
      success: false,
      message: 'Only guests can cancel bookings'
    });
  }
  next();
}, bookingController.cancelBooking);

// Check-in property booking (host only)
router.patch('/properties/:bookingId/checkin', (req, res, next) => {
  if (req.user?.userType && req.user.userType !== 'host') {
    return res.status(403).json({
      success: false,
      message: 'Host access required'
    });
  }
  next();
}, bookingController.checkInPropertyBooking);

// Check-out property booking (host only)
router.patch('/properties/:bookingId/checkout', (req, res, next) => {
  if (req.user?.userType && req.user.userType !== 'host') {
    return res.status(403).json({
      success: false,
      message: 'Host access required'
    });
  }
  next();
}, bookingController.checkOutPropertyBooking);

// --- TOUR BOOKING ROUTES ---
// Create tour booking
router.post('/tours', validateTourBooking, bookingController.createTourBooking);

// Get specific tour booking
router.get('/tours/:bookingId', validateBookingAccess, bookingController.getTourBooking);

// Update tour booking
router.put('/tours/:bookingId', validateBookingUpdate, bookingController.updateTourBooking);

// Search user's tour bookings
router.get('/tours', bookingController.searchTourBookings);

// Cancel tour booking (guest only)
router.patch('/tours/:bookingId/cancel', (req, res, next) => {
  if (req.user?.userType && req.user.userType !== 'guest') {
    return res.status(403).json({
      success: false,
      message: 'Only guests can cancel bookings'
    });
  }
  next();
}, bookingController.cancelBooking);

// --- AGENT BOOKING ROUTES ---
// Create booking on behalf of client (agent only)
router.post('/agent', validateAgent, bookingController.createAgentBooking);

// --- CALENDAR & OVERVIEW ROUTES ---
// Get user's booking calendar
router.get('/calendar', bookingController.getUserCalendar);

// Get upcoming bookings
router.get('/upcoming', bookingController.getUpcomingBookings);

// Get booking statistics
router.get('/stats', bookingController.getBookingStats);

// --- WISHLIST ROUTES ---
// Add item to wishlist
router.post('/wishlist', 
  authenticate, 
  validateWishlistItem, 
  bookingController.addToWishlist
);

router.get('/wishlist', 
  authenticate, 
  validateWishlistFilters, 
  bookingController.getWishlist
);

router.delete('/wishlist/:wishlistItemId', 
  authenticate, 
  bookingController.removeFromWishlist
);

router.get('/wishlist/check', 
  authenticate, 
  bookingController.checkWishlistStatus
);

router.get('/wishlist/stats', 
  authenticate, 
  bookingController.getWishlistStats
);

router.delete('/wishlist', 
  authenticate, 
  bookingController.clearWishlist
);

// --- GUEST SPECIFIC ROUTES ---
// Guest dashboard data
router.get('/guest/dashboard', (req, res, next) => {
  // Validate user is guest
  if (req.user?.userType && req.user.userType !== 'guest') {
    return res.status(403).json({
      success: false,
      message: 'Guest access required'
    });
  }
  next();
}, bookingController.getBookingStats);

// Guest booking history with filters
router.get('/guest/history', (req, res, next) => {
  if (req.user?.userType && req.user.userType !== 'guest') {
    return res.status(403).json({
      success: false,
      message: 'Guest access required'
    });
  }
  next();
}, bookingController.searchPropertyBookings);

// Guest tour history
router.get('/guest/tours', (req, res, next) => {
  if (req.user?.userType && req.user.userType !== 'guest') {
    return res.status(403).json({
      success: false,
      message: 'Guest access required'
    });
  }
  next();
}, bookingController.searchTourBookings);

// --- TOUR GUIDE SPECIFIC ROUTES ---
// Tour guide bookings (for managing their tours)
router.get('/tourguide/bookings', (req, res, next) => {
  if (req.user?.userType && req.user.userType !== 'tourguide') {
    return res.status(403).json({
      success: false,
      message: 'Tour guide access required'
    });
  }
  next();
}, bookingController.searchTourBookings);

// Check-in participant
router.patch('/tourguide/:bookingId/checkin', (req, res, next) => {
  if (req.user?.userType && req.user.userType !== 'tourguide') {
    return res.status(403).json({
      success: false,
      message: 'Tour guide access required'
    });
  }
  next();
}, bookingController.checkInTourBooking);

// Check-out participant
router.patch('/tourguide/:bookingId/checkout', (req, res, next) => {
  if (req.user?.userType && req.user.userType !== 'tourguide') {
    return res.status(403).json({
      success: false,
      message: 'Tour guide access required'
    });
  }
  next();
}, bookingController.checkOutTourBooking);

// --- AGENT SPECIFIC ROUTES ---
// Agent dashboard - all client bookings
router.get('/agent/clients', validateAgent, (req, res, next) => {
  // This would need custom logic to get all bookings for agent's clients
  // For now, redirect to regular search with agent context
  next();
}, bookingController.searchPropertyBookings);

// Agent commission tracking
router.get('/agent/commissions', validateAgent, bookingController.getBookingStats);

// --- ADMIN/HOST ROUTES (if needed for cross-user access) ---
// Host can view guest bookings for their properties
router.get('/host/guest-bookings', (req, res, next) => {
  if (req.user?.userType && req.user.userType !== 'host') {
    return res.status(403).json({
      success: false,
      message: 'Host access required'
    });
  }
  next();
}, bookingController.searchPropertyBookings);

// --- GENERAL BOOKING ROUTES (MUST BE LAST - matches any /:bookingId) ---
// Get any booking by ID (property or tour) - Universal access control with optional type parameter
// Place at end to avoid conflicting with specific routes like /properties, /tours, /calendar, etc.
router.get('/:bookingId', validateBookingAccess, bookingController.getBookingById);

export default router;