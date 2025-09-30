"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookingController = void 0;
const booking_service_1 = require("../services/booking.service");
class BookingController {
    constructor() {
        // --- PROPERTY BOOKING ENDPOINTS ---
        this.createPropertyBooking = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const userId = parseInt(req.user.userId);
                const bookingData = req.body;
                // Validate required fields
                const requiredFields = ['propertyId', 'checkIn', 'checkOut', 'guests'];
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
                if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime())) {
                    res.status(400).json({
                        success: false,
                        message: 'Invalid date format'
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
                if (checkInDate < new Date()) {
                    res.status(400).json({
                        success: false,
                        message: 'Check-in date cannot be in the past'
                    });
                    return;
                }
                if (bookingData.guests < 1 || bookingData.guests > 20) {
                    res.status(400).json({
                        success: false,
                        message: 'Number of guests must be between 1 and 20'
                    });
                    return;
                }
                const booking = await this.bookingService.createPropertyBooking(userId, bookingData);
                res.status(201).json({
                    success: true,
                    message: 'Property booking created successfully',
                    data: booking
                });
            }
            catch (error) {
                console.error('Error creating property booking:', error);
                res.status(400).json({
                    success: false,
                    message: error.message || 'Failed to create property booking'
                });
            }
        };
        this.getPropertyBooking = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const userId = parseInt(req.user.userId);
                const bookingId = req.params.bookingId;
                if (!bookingId) {
                    res.status(400).json({
                        success: false,
                        message: 'Booking ID is required'
                    });
                    return;
                }
                const booking = await this.bookingService.getPropertyBookingById(bookingId, userId);
                if (!booking) {
                    res.status(404).json({
                        success: false,
                        message: 'Booking not found'
                    });
                    return;
                }
                res.json({
                    success: true,
                    message: 'Property booking retrieved successfully',
                    data: booking
                });
            }
            catch (error) {
                console.error('Error fetching property booking:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to retrieve property booking'
                });
            }
        };
        this.updatePropertyBooking = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const userId = parseInt(req.user.userId);
                const bookingId = req.params.bookingId;
                const updateData = req.body;
                if (!bookingId) {
                    res.status(400).json({
                        success: false,
                        message: 'Booking ID is required'
                    });
                    return;
                }
                const booking = await this.bookingService.updatePropertyBooking(bookingId, userId, updateData);
                res.json({
                    success: true,
                    message: 'Property booking updated successfully',
                    data: booking
                });
            }
            catch (error) {
                console.error('Error updating property booking:', error);
                res.status(400).json({
                    success: false,
                    message: error.message || 'Failed to update property booking'
                });
            }
        };
        this.searchPropertyBookings = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const userId = parseInt(req.user.userId);
                const page = parseInt(req.query.page) || 1;
                const limit = parseInt(req.query.limit) || 20;
                const filters = {
                    status: req.query.status ? req.query.status.split(',') : undefined,
                    checkInDate: req.query.checkInDate,
                    checkOutDate: req.query.checkOutDate,
                    propertyId: req.query.propertyId ? parseInt(req.query.propertyId) : undefined,
                    minAmount: req.query.minAmount ? parseFloat(req.query.minAmount) : undefined,
                    maxAmount: req.query.maxAmount ? parseFloat(req.query.maxAmount) : undefined,
                    sortBy: req.query.sortBy,
                    sortOrder: req.query.sortOrder,
                    search: req.query.search
                };
                // Remove undefined values
                Object.keys(filters).forEach(key => {
                    if (filters[key] === undefined) {
                        delete filters[key];
                    }
                });
                const result = await this.bookingService.searchPropertyBookings(userId, filters, page, limit);
                res.json({
                    success: true,
                    message: 'Property bookings retrieved successfully',
                    data: result
                });
            }
            catch (error) {
                console.error('Error searching property bookings:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to search property bookings'
                });
            }
        };
        // --- TOUR BOOKING ENDPOINTS ---
        this.createTourBooking = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const userId = parseInt(req.user.userId);
                const bookingData = req.body;
                // Validate required fields
                const requiredFields = ['tourId', 'scheduleId', 'numberOfParticipants', 'participants'];
                const missingFields = requiredFields.filter(field => !bookingData[field]);
                if (missingFields.length > 0) {
                    res.status(400).json({
                        success: false,
                        message: 'Missing required fields',
                        errors: missingFields.map(field => `${field} is required`)
                    });
                    return;
                }
                if (bookingData.numberOfParticipants < 1 || bookingData.numberOfParticipants > 50) {
                    res.status(400).json({
                        success: false,
                        message: 'Number of participants must be between 1 and 50'
                    });
                    return;
                }
                if (!Array.isArray(bookingData.participants) || bookingData.participants.length !== bookingData.numberOfParticipants) {
                    res.status(400).json({
                        success: false,
                        message: 'Participants array must match number of participants'
                    });
                    return;
                }
                // Validate each participant
                for (const participant of bookingData.participants) {
                    if (!participant.name || !participant.age) {
                        res.status(400).json({
                            success: false,
                            message: 'Each participant must have name and age'
                        });
                        return;
                    }
                    if (participant.age < 0 || participant.age > 120) {
                        res.status(400).json({
                            success: false,
                            message: 'Participant age must be between 0 and 120'
                        });
                        return;
                    }
                }
                const booking = await this.bookingService.createTourBooking(userId, bookingData);
                res.status(201).json({
                    success: true,
                    message: 'Tour booking created successfully',
                    data: booking
                });
            }
            catch (error) {
                console.error('Error creating tour booking:', error);
                res.status(400).json({
                    success: false,
                    message: error.message || 'Failed to create tour booking'
                });
            }
        };
        this.getTourBooking = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const userId = parseInt(req.user.userId);
                const bookingId = req.params.bookingId;
                if (!bookingId) {
                    res.status(400).json({
                        success: false,
                        message: 'Booking ID is required'
                    });
                    return;
                }
                const booking = await this.bookingService.getTourBookingById(bookingId, userId);
                if (!booking) {
                    res.status(404).json({
                        success: false,
                        message: 'Tour booking not found'
                    });
                    return;
                }
                res.json({
                    success: true,
                    message: 'Tour booking retrieved successfully',
                    data: booking
                });
            }
            catch (error) {
                console.error('Error fetching tour booking:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to retrieve tour booking'
                });
            }
        };
        this.updateTourBooking = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const userId = parseInt(req.user.userId);
                const bookingId = req.params.bookingId;
                const updateData = req.body;
                if (!bookingId) {
                    res.status(400).json({
                        success: false,
                        message: 'Booking ID is required'
                    });
                    return;
                }
                const booking = await this.bookingService.updateTourBooking(bookingId, userId, updateData);
                res.json({
                    success: true,
                    message: 'Tour booking updated successfully',
                    data: booking
                });
            }
            catch (error) {
                console.error('Error updating tour booking:', error);
                res.status(400).json({
                    success: false,
                    message: error.message || 'Failed to update tour booking'
                });
            }
        };
        this.searchTourBookings = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const userId = parseInt(req.user.userId);
                const page = parseInt(req.query.page) || 1;
                const limit = parseInt(req.query.limit) || 20;
                const filters = {
                    status: req.query.status ? req.query.status.split(',') : undefined,
                    tourDate: req.query.tourDate,
                    tourId: req.query.tourId,
                    category: req.query.category,
                    difficulty: req.query.difficulty,
                    minAmount: req.query.minAmount ? parseFloat(req.query.minAmount) : undefined,
                    maxAmount: req.query.maxAmount ? parseFloat(req.query.maxAmount) : undefined,
                    sortBy: req.query.sortBy,
                    sortOrder: req.query.sortOrder,
                    search: req.query.search
                };
                // Remove undefined values
                Object.keys(filters).forEach(key => {
                    if (filters[key] === undefined) {
                        delete filters[key];
                    }
                });
                const result = await this.bookingService.searchTourBookings(userId, filters, page, limit);
                res.json({
                    success: true,
                    message: 'Tour bookings retrieved successfully',
                    data: result
                });
            }
            catch (error) {
                console.error('Error searching tour bookings:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to search tour bookings'
                });
            }
        };
        // --- AGENT BOOKING ENDPOINTS ---
        this.createAgentBooking = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                if (req.user.userType !== 'agent') {
                    res.status(403).json({
                        success: false,
                        message: 'Agent access required'
                    });
                    return;
                }
                const agentId = parseInt(req.user.userId);
                const bookingData = req.body;
                // Validate required fields
                if (!bookingData.type || !bookingData.clientId || !bookingData.bookingData) {
                    res.status(400).json({
                        success: false,
                        message: 'Type, client ID, and booking data are required'
                    });
                    return;
                }
                if (!['property', 'tour'].includes(bookingData.type)) {
                    res.status(400).json({
                        success: false,
                        message: 'Booking type must be either "property" or "tour"'
                    });
                    return;
                }
                if (bookingData.commissionRate && (bookingData.commissionRate < 0 || bookingData.commissionRate > 1)) {
                    res.status(400).json({
                        success: false,
                        message: 'Commission rate must be between 0 and 1'
                    });
                    return;
                }
                const booking = await this.bookingService.createAgentBooking(agentId, bookingData);
                res.status(201).json({
                    success: true,
                    message: 'Agent booking created successfully',
                    data: booking
                });
            }
            catch (error) {
                console.error('Error creating agent booking:', error);
                res.status(400).json({
                    success: false,
                    message: error.message || 'Failed to create agent booking'
                });
            }
        };
        // --- CALENDAR ENDPOINTS ---
        this.getUserCalendar = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const userId = parseInt(req.user.userId);
                const calendar = await this.bookingService.getUserBookingCalendar(userId);
                res.json({
                    success: true,
                    message: 'User calendar retrieved successfully',
                    data: calendar
                });
            }
            catch (error) {
                console.error('Error fetching user calendar:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to retrieve user calendar'
                });
            }
        };
        // --- ANALYTICS ENDPOINTS ---
        this.getBookingStats = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const userId = parseInt(req.user.userId);
                const stats = await this.bookingService.getGuestBookingStats(userId);
                res.json({
                    success: true,
                    message: 'Booking statistics retrieved successfully',
                    data: stats
                });
            }
            catch (error) {
                console.error('Error fetching booking stats:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to retrieve booking statistics'
                });
            }
        };
        // --- WISHLIST ENDPOINTS ---
        this.addToWishlist = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const userId = parseInt(req.user.userId);
                const { type, itemId, notes } = req.body;
                const wishlistItem = await this.bookingService.addToWishlist(userId, type, itemId, notes);
                res.status(201).json({
                    success: true,
                    message: 'Item added to wishlist successfully',
                    data: wishlistItem
                });
            }
            catch (error) {
                console.error('Error adding to wishlist:', error);
                res.status(400).json({
                    success: false,
                    message: error.message || 'Failed to add item to wishlist'
                });
            }
        };
        this.getWishlist = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const userId = parseInt(req.user.userId);
                const { type, location, minPrice, maxPrice, isAvailable, search, page = '1', limit = '20' } = req.query;
                const filters = {};
                if (type)
                    filters.type = type;
                if (location)
                    filters.location = location;
                if (minPrice)
                    filters.minPrice = Number(minPrice);
                if (maxPrice)
                    filters.maxPrice = Number(maxPrice);
                if (isAvailable !== undefined)
                    filters.isAvailable = isAvailable === 'true';
                if (search)
                    filters.search = search;
                const result = await this.bookingService.getUserWishlist(userId, filters, Number(page), Number(limit));
                res.status(200).json({
                    success: true,
                    message: 'Wishlist retrieved successfully',
                    data: result
                });
            }
            catch (error) {
                console.error('Error fetching wishlist:', error);
                res.status(500).json({
                    success: false,
                    message: error.message || 'Failed to fetch wishlist'
                });
            }
        };
        this.removeFromWishlist = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const userId = parseInt(req.user.userId);
                const { wishlistItemId } = req.params;
                if (!wishlistItemId) {
                    res.status(400).json({
                        success: false,
                        message: 'Wishlist item ID is required'
                    });
                    return;
                }
                await this.bookingService.removeFromWishlist(userId, wishlistItemId);
                res.status(200).json({
                    success: true,
                    message: 'Item removed from wishlist successfully'
                });
            }
            catch (error) {
                console.error('Error removing from wishlist:', error);
                res.status(400).json({
                    success: false,
                    message: error.message || 'Failed to remove item from wishlist'
                });
            }
        };
        this.checkWishlistStatus = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const userId = parseInt(req.user.userId);
                const { type, itemId } = req.query;
                if (!type || !itemId) {
                    res.status(400).json({
                        success: false,
                        message: 'Type and item ID are required'
                    });
                    return;
                }
                const isInWishlist = await this.bookingService.isInWishlist(userId, type, type === 'property' ? Number(itemId) : itemId);
                res.status(200).json({
                    success: true,
                    data: { isInWishlist }
                });
            }
            catch (error) {
                console.error('Error checking wishlist status:', error);
                res.status(500).json({
                    success: false,
                    message: error.message || 'Failed to check wishlist status'
                });
            }
        };
        this.getWishlistStats = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const userId = parseInt(req.user.userId);
                const stats = await this.bookingService.getWishlistStats(userId);
                res.status(200).json({
                    success: true,
                    message: 'Wishlist stats retrieved successfully',
                    data: stats
                });
            }
            catch (error) {
                console.error('Error fetching wishlist stats:', error);
                res.status(500).json({
                    success: false,
                    message: error.message || 'Failed to fetch wishlist stats'
                });
            }
        };
        this.clearWishlist = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const userId = parseInt(req.user.userId);
                await this.bookingService.clearWishlist(userId);
                res.status(200).json({
                    success: true,
                    message: 'Wishlist cleared successfully'
                });
            }
            catch (error) {
                console.error('Error clearing wishlist:', error);
                res.status(500).json({
                    success: false,
                    message: error.message || 'Failed to clear wishlist'
                });
            }
        };
        // --- BULK OPERATIONS ---
        this.cancelBooking = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const userId = parseInt(req.user.userId);
                const bookingId = req.params.bookingId;
                const { type, reason } = req.body;
                if (!bookingId || !type) {
                    res.status(400).json({
                        success: false,
                        message: 'Booking ID and type are required'
                    });
                    return;
                }
                if (!['property', 'tour'].includes(type)) {
                    res.status(400).json({
                        success: false,
                        message: 'Type must be either "property" or "tour"'
                    });
                    return;
                }
                let booking;
                if (type === 'property') {
                    booking = await this.bookingService.updatePropertyBooking(bookingId, userId, {
                        status: 'cancelled',
                        message: reason
                    });
                }
                else {
                    booking = await this.bookingService.updateTourBooking(bookingId, userId, {
                        status: 'cancelled'
                    });
                }
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
        // --- QUICK ACTIONS ---
        this.getUpcomingBookings = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const userId = parseInt(req.user.userId);
                const limit = parseInt(req.query.limit) || 5;
                // Get upcoming bookings from both property and tour bookings
                const today = new Date();
                const propertyFilters = {
                    status: ['confirmed'],
                    checkInDate: today.toISOString().split('T')[0],
                    sortBy: 'checkIn',
                    sortOrder: 'asc'
                };
                const tourFilters = {
                    status: ['confirmed'],
                    tourDate: today.toISOString().split('T')[0],
                    sortBy: 'bookingDate',
                    sortOrder: 'asc'
                };
                const [propertyBookings, tourBookings] = await Promise.all([
                    this.bookingService.searchPropertyBookings(userId, propertyFilters, 1, limit),
                    this.bookingService.searchTourBookings(userId, tourFilters, 1, limit)
                ]);
                const allBookings = [
                    ...propertyBookings.bookings.map(b => ({ ...b, type: 'property' })),
                    ...tourBookings.bookings.map(b => ({ ...b, type: 'tour' }))
                ].sort((a, b) => {
                    // Use type guards to safely access properties
                    const dateA = a.type === 'property' && 'checkIn' in a
                        ? new Date(a.checkIn)
                        : a.type === 'tour' && 'bookingDate' in a
                            ? new Date(a.bookingDate)
                            : new Date(0); // fallback
                    const dateB = b.type === 'property' && 'checkIn' in b
                        ? new Date(b.checkIn)
                        : b.type === 'tour' && 'bookingDate' in b
                            ? new Date(b.bookingDate)
                            : new Date(0); // fallback
                    return dateA.getTime() - dateB.getTime();
                }).slice(0, limit);
                res.json({
                    success: true,
                    message: 'Upcoming bookings retrieved successfully',
                    data: allBookings
                });
            }
            catch (error) {
                console.error('Error fetching upcoming bookings:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to retrieve upcoming bookings'
                });
            }
        };
        this.bookingService = new booking_service_1.BookingService();
    }
}
exports.BookingController = BookingController;
