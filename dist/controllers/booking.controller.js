"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookingController = void 0;
const booking_service_1 = require("../services/booking.service");
class BookingController {
    constructor() {
        // --- BOOKING CRUD OPERATIONS ---
        this.createBooking = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const guestId = parseInt(req.user.userId);
                const bookingData = req.body;
                // Validate required fields
                const requiredFields = ['propertyId', 'checkIn', 'checkOut', 'guests', 'paymentTiming'];
                const missingFields = requiredFields.filter(field => !bookingData[field]);
                if (missingFields.length > 0) {
                    res.status(400).json({
                        success: false,
                        message: 'Missing required fields',
                        errors: missingFields.map(field => `${field} is required`)
                    });
                    return;
                }
                // Validate dates
                const checkInDate = new Date(bookingData.checkIn);
                const checkOutDate = new Date(bookingData.checkOut);
                const now = new Date();
                if (checkInDate < now) {
                    res.status(400).json({
                        success: false,
                        message: 'Check-in date cannot be in the past'
                    });
                    return;
                }
                if (checkInDate >= checkOutDate) {
                    res.status(400).json({
                        success: false,
                        message: 'Check-out date must be after check-in date'
                    });
                    return;
                }
                // Validate payment details if paying now
                if (bookingData.paymentTiming === 'now' && bookingData.paymentMethod !== 'property') {
                    if (!bookingData.paymentMethod) {
                        res.status(400).json({
                            success: false,
                            message: 'Payment method is required when paying now'
                        });
                        return;
                    }
                    // Validate card details for card payments
                    if (bookingData.paymentMethod === 'card') {
                        const { cardDetails } = bookingData;
                        if (!cardDetails || !cardDetails.cardNumber || !cardDetails.expiryDate || !cardDetails.cvv || !cardDetails.cardholderName) {
                            res.status(400).json({
                                success: false,
                                message: 'Complete card details are required for card payments'
                            });
                            return;
                        }
                    }
                    // Validate mobile details for mobile money payments
                    if (['momo', 'airtel', 'mpesa'].includes(bookingData.paymentMethod)) {
                        const { mobileDetails } = bookingData;
                        if (!mobileDetails || !mobileDetails.phoneNumber) {
                            res.status(400).json({
                                success: false,
                                message: 'Phone number is required for mobile money payments'
                            });
                            return;
                        }
                    }
                }
                const booking = await this.bookingService.createBooking(guestId, bookingData);
                res.status(201).json({
                    success: true,
                    message: 'Booking created successfully',
                    data: booking
                });
            }
            catch (error) {
                console.error('Error creating booking:', error);
                res.status(400).json({
                    success: false,
                    message: error.message || 'Failed to create booking'
                });
            }
        };
        this.updateBooking = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const bookingId = req.params.id;
                const userId = parseInt(req.user.userId);
                const updateData = req.body;
                const userRole = req.query.role || 'guest';
                if (!bookingId) {
                    res.status(400).json({
                        success: false,
                        message: 'Booking ID is required'
                    });
                    return;
                }
                const booking = await this.bookingService.updateBooking(bookingId, userId, updateData, userRole);
                res.json({
                    success: true,
                    message: 'Booking updated successfully',
                    data: booking
                });
            }
            catch (error) {
                console.error('Error updating booking:', error);
                res.status(400).json({
                    success: false,
                    message: error.message || 'Failed to update booking'
                });
            }
        };
        this.cancelBooking = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const bookingId = req.params.id;
                const userId = parseInt(req.user.userId);
                const { reason } = req.body;
                const userRole = req.query.role || 'guest';
                if (!bookingId) {
                    res.status(400).json({
                        success: false,
                        message: 'Booking ID is required'
                    });
                    return;
                }
                if (!reason) {
                    res.status(400).json({
                        success: false,
                        message: 'Cancellation reason is required'
                    });
                    return;
                }
                const booking = await this.bookingService.cancelBooking(bookingId, userId, reason, userRole);
                res.json({
                    success: true,
                    message: 'Booking cancelled successfully',
                    data: booking
                });
            }
            catch (error) {
                console.error('Error cancelling booking:', error);
                res.status(400).json({
                    success: false,
                    message: error.message || 'Failed to cancel booking'
                });
            }
        };
        // --- BOOKING QUERIES ---
        // --- BOOKING QUERIES ---
        this.getBookingById = async (req, res) => {
            try {
                const bookingId = req.params.id;
                let userId;
                let userRole;
                if (req.user) {
                    userId = parseInt(req.user.userId);
                    userRole = req.query.role || 'guest';
                }
                if (!bookingId) {
                    res.status(400).json({
                        success: false,
                        message: 'Booking ID is required'
                    });
                    return;
                }
                const booking = await this.bookingService.getBookingById(bookingId, userId, userRole);
                if (!booking) {
                    res.status(404).json({
                        success: false,
                        message: 'Booking not found'
                    });
                    return;
                }
                res.json({
                    success: true,
                    message: 'Booking retrieved successfully',
                    data: booking
                });
            }
            catch (error) {
                console.error('Error fetching booking:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to retrieve booking'
                });
            }
        };
        this.searchBookings = async (req, res) => {
            try {
                const page = parseInt(req.query.page) || 1;
                const limit = parseInt(req.query.limit) || 20;
                const filters = {
                    propertyId: req.query.propertyId ? parseInt(req.query.propertyId) : undefined,
                    guestId: req.query.guestId ? parseInt(req.query.guestId) : undefined,
                    hostId: req.query.hostId ? parseInt(req.query.hostId) : undefined,
                    status: req.query.status,
                    checkInFrom: req.query.checkInFrom,
                    checkInTo: req.query.checkInTo,
                    checkOutFrom: req.query.checkOutFrom,
                    checkOutTo: req.query.checkOutTo,
                    minPrice: req.query.minPrice ? parseFloat(req.query.minPrice) : undefined,
                    maxPrice: req.query.maxPrice ? parseFloat(req.query.maxPrice) : undefined,
                    sortBy: req.query.sortBy,
                    sortOrder: req.query.sortOrder
                };
                // Remove undefined values
                Object.keys(filters).forEach(key => {
                    if (filters[key] === undefined) {
                        delete filters[key];
                    }
                });
                const result = await this.bookingService.searchBookings(filters, page, limit);
                res.json({
                    success: true,
                    message: 'Bookings retrieved successfully',
                    data: result
                });
            }
            catch (error) {
                console.error('Error searching bookings:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to search bookings'
                });
            }
        };
        this.getPropertyBookings = async (req, res) => {
            try {
                const propertyId = parseInt(req.params.propertyId);
                let hostId;
                if (req.user) {
                    hostId = parseInt(req.user.userId);
                }
                if (isNaN(propertyId)) {
                    res.status(400).json({
                        success: false,
                        message: 'Invalid property ID'
                    });
                    return;
                }
                const bookings = await this.bookingService.getPropertyBookings(propertyId, hostId);
                res.json({
                    success: true,
                    message: 'Property bookings retrieved successfully',
                    data: bookings
                });
            }
            catch (error) {
                console.error('Error fetching property bookings:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to retrieve bookings'
                });
            }
        };
        // --- BOOKING VALIDATION ---
        this.validateBooking = async (req, res) => {
            try {
                const { propertyId, checkIn, checkOut, guests } = req.body;
                if (!propertyId || !checkIn || !checkOut || !guests) {
                    res.status(400).json({
                        success: false,
                        message: 'PropertyId, checkIn, checkOut, and guests are required'
                    });
                    return;
                }
                const validation = await this.bookingService.validateBooking(propertyId, checkIn, checkOut, guests);
                res.json({
                    success: true,
                    message: 'Booking validation completed',
                    data: validation
                });
            }
            catch (error) {
                console.error('Error validating booking:', error);
                res.status(400).json({
                    success: false,
                    message: error.message || 'Failed to validate booking'
                });
            }
        };
        // --- BOOKING ACTIONS ---
        this.confirmBooking = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const bookingId = req.params.id;
                const hostId = parseInt(req.user.userId);
                if (!bookingId) {
                    res.status(400).json({
                        success: false,
                        message: 'Booking ID is required'
                    });
                    return;
                }
                const booking = await this.bookingService.updateBooking(bookingId, hostId, { status: 'confirmed' }, 'host');
                res.json({
                    success: true,
                    message: 'Booking confirmed successfully',
                    data: booking
                });
            }
            catch (error) {
                console.error('Error confirming booking:', error);
                res.status(400).json({
                    success: false,
                    message: error.message || 'Failed to confirm booking'
                });
            }
        };
        this.completeBooking = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const bookingId = req.params.id;
                const hostId = parseInt(req.user.userId);
                if (!bookingId) {
                    res.status(400).json({
                        success: false,
                        message: 'Booking ID is required'
                    });
                    return;
                }
                const booking = await this.bookingService.updateBooking(bookingId, hostId, { status: 'completed' }, 'host');
                res.json({
                    success: true,
                    message: 'Booking completed successfully',
                    data: booking
                });
            }
            catch (error) {
                console.error('Error completing booking:', error);
                res.status(400).json({
                    success: false,
                    message: error.message || 'Failed to complete booking'
                });
            }
        };
        this.bookingService = new booking_service_1.BookingService();
    }
}
exports.BookingController = BookingController;
