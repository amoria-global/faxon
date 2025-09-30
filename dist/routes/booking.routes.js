"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
//src/routes/booking.routes.ts
const express_1 = require("express");
const booking_controller_1 = require("../controllers/booking.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const booking_middleware_1 = require("../middleware/booking.middleware");
const router = (0, express_1.Router)();
const bookingController = new booking_controller_1.BookingController();
// --- AUTHENTICATION REQUIRED FOR ALL ROUTES ---
router.use(auth_middleware_1.authenticate);
// --- PROPERTY BOOKING ROUTES ---
// Create property booking
router.post('/properties', booking_middleware_1.validatePropertyBooking, bookingController.createPropertyBooking);
// Get specific property booking
router.get('/properties/:bookingId', booking_middleware_1.validateBookingAccess, bookingController.getPropertyBooking);
// Update property booking
router.put('/properties/:bookingId', booking_middleware_1.validateBookingUpdate, bookingController.updatePropertyBooking);
// Search user's property bookings
router.get('/properties', bookingController.searchPropertyBookings);
// Cancel property booking
router.patch('/properties/:bookingId/cancel', bookingController.cancelBooking);
// --- TOUR BOOKING ROUTES ---
// Create tour booking
router.post('/tours', booking_middleware_1.validateTourBooking, bookingController.createTourBooking);
// Get specific tour booking
router.get('/tours/:bookingId', booking_middleware_1.validateBookingAccess, bookingController.getTourBooking);
// Update tour booking
router.put('/tours/:bookingId', booking_middleware_1.validateBookingUpdate, bookingController.updateTourBooking);
// Search user's tour bookings
router.get('/tours', bookingController.searchTourBookings);
// Cancel tour booking
router.patch('/tours/:bookingId/cancel', bookingController.cancelBooking);
// --- AGENT BOOKING ROUTES ---
// Create booking on behalf of client (agent only)
router.post('/agent', booking_middleware_1.validateAgent, bookingController.createAgentBooking);
// --- CALENDAR & OVERVIEW ROUTES ---
// Get user's booking calendar
router.get('/calendar', bookingController.getUserCalendar);
// Get upcoming bookings
router.get('/upcoming', bookingController.getUpcomingBookings);
// Get booking statistics
router.get('/stats', bookingController.getBookingStats);
// --- WISHLIST ROUTES ---
// Add item to wishlist
router.post('/wishlist', auth_middleware_1.authenticate, booking_middleware_1.validateWishlistItem, bookingController.addToWishlist);
router.get('/wishlist', auth_middleware_1.authenticate, booking_middleware_1.validateWishlistFilters, bookingController.getWishlist);
router.delete('/wishlist/:wishlistItemId', auth_middleware_1.authenticate, bookingController.removeFromWishlist);
router.get('/wishlist/check', auth_middleware_1.authenticate, bookingController.checkWishlistStatus);
router.get('/wishlist/stats', auth_middleware_1.authenticate, bookingController.getWishlistStats);
router.delete('/wishlist', auth_middleware_1.authenticate, bookingController.clearWishlist);
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
}, booking_middleware_1.validateBookingUpdate, bookingController.updateTourBooking);
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
}, booking_middleware_1.validateBookingUpdate, bookingController.updateTourBooking);
// --- AGENT SPECIFIC ROUTES ---
// Agent dashboard - all client bookings
router.get('/agent/clients', booking_middleware_1.validateAgent, (req, res, next) => {
    // This would need custom logic to get all bookings for agent's clients
    // For now, redirect to regular search with agent context
    next();
}, bookingController.searchPropertyBookings);
// Agent commission tracking
router.get('/agent/commissions', booking_middleware_1.validateAgent, bookingController.getBookingStats);
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
exports.default = router;
