import { Router } from 'express';
import { BookingController } from '../controllers/booking.controller';
import { authenticate } from '../middleware/auth.middleware';
import { 
  validatePropertyBooking, 
  validateTourBooking, 
  validateBookingUpdate,
  validateAgent,
  validateBookingAccess,
  validateWishlistItem
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

// Cancel property booking
router.patch('/properties/:bookingId/cancel', bookingController.cancelBooking);

// --- TOUR BOOKING ROUTES ---
// Create tour booking
router.post('/tours', validateTourBooking, bookingController.createTourBooking);

// Get specific tour booking
router.get('/tours/:bookingId', validateBookingAccess, bookingController.getTourBooking);

// Update tour booking
router.put('/tours/:bookingId', validateBookingUpdate, bookingController.updateTourBooking);

// Search user's tour bookings
router.get('/tours', bookingController.searchTourBookings);

// Cancel tour booking
router.patch('/tours/:bookingId/cancel', bookingController.cancelBooking);

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
router.post('/wishlist', validateWishlistItem, bookingController.addToWishlist);

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
  // Add check-in status to body
  req.body.checkInStatus = 'checked_in';
  next();
}, validateBookingUpdate, bookingController.updateTourBooking);

// Check-out participant
router.patch('/tourguide/:bookingId/checkout', (req, res, next) => {
  if (req.user?.userType && req.user.userType !== 'tourguide') {
    return res.status(403).json({
      success: false,
      message: 'Tour guide access required'
    });
  }
  // Add check-out status to body
  req.body.checkInStatus = 'checked_out';
  next();
}, validateBookingUpdate, bookingController.updateTourBooking);

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

export default router;