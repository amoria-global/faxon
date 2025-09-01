"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
//src/routes/booking.routes.ts
const express_1 = require("express");
const booking_controller_1 = require("../controllers/booking.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const booking_validation_1 = require("../middleware/booking.validation");
const router = (0, express_1.Router)();
const bookingController = new booking_controller_1.BookingController();
// --- PUBLIC ROUTES ---
// Root endpoint - API information
router.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'JamboLush Bookings API',
        version: '1.0.0',
        endpoints: {
            'GET /api/bookings/': 'This endpoint - API information',
            'GET /api/bookings/search': 'Search bookings with filters',
            'POST /api/bookings/': 'Create new booking (auth required)',
            'GET /api/bookings/:id': 'Get booking by ID (auth required)',
            'GET /api/bookings/confirmation/:id': 'Get booking for confirmation (public)',
            'GET /api/bookings/property/:propertyId': 'Get bookings for property',
            'POST /api/bookings/validate': 'Validate booking availability',
            'PUT /api/bookings/:id': 'Update booking (auth required)',
            'PATCH /api/bookings/:id/cancel': 'Cancel booking (auth required)',
            'PATCH /api/bookings/:id/confirm': 'Confirm booking (host only)',
            'PATCH /api/bookings/:id/complete': 'Complete booking (host only)'
        },
        examples: {
            search: '/api/bookings/search?status=confirmed&page=1&limit=10',
            validate: 'POST /api/bookings/validate with {propertyId, checkIn, checkOut, guests}',
            create: 'POST /api/bookings/ with booking details and auth header'
        }
    });
});
// Get booking by ID (public for confirmation pages)
router.get('/confirmation/:id', bookingController.getBookingById);
// Validate booking availability (public)
router.post('/validate', bookingController.validateBooking);
// Search bookings (public with optional filters)
router.get('/search', bookingController.searchBookings);
// Get property bookings (public)
router.get('/property/:propertyId', bookingController.getPropertyBookings);
// --- AUTHENTICATED ROUTES ---
// Create new booking
router.post('/', auth_middleware_1.authenticate, booking_validation_1.validateBooking, bookingController.createBooking);
// Get booking by ID (authenticated)
router.get('/:id', auth_middleware_1.authenticate, bookingController.getBookingById);
// Update booking
router.put('/:id', auth_middleware_1.authenticate, booking_validation_1.validateBookingUpdate, bookingController.updateBooking);
// Cancel booking
router.patch('/:id/cancel', auth_middleware_1.authenticate, booking_validation_1.validateBookingCancellation, bookingController.cancelBooking);
// Host actions
router.patch('/:id/confirm', auth_middleware_1.authenticate, bookingController.confirmBooking);
router.patch('/:id/complete', auth_middleware_1.authenticate, bookingController.completeBooking);
exports.default = router;
