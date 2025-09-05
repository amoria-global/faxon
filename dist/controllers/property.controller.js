"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PropertyController = void 0;
const property_service_1 = require("../services/property.service");
class PropertyController {
    constructor() {
        // --- PROPERTY CRUD OPERATIONS ---
        this.createProperty = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const hostId = parseInt(req.user.userId);
                const propertyData = req.body;
                // Validate required fields
                const requiredFields = ['name', 'location', 'type', 'category', 'pricePerNight', 'beds', 'baths', 'maxGuests'];
                const missingFields = requiredFields.filter(field => !propertyData[field]);
                if (missingFields.length > 0) {
                    res.status(400).json({
                        success: false,
                        message: 'Missing required fields',
                        errors: missingFields.map(field => `${field} is required`)
                    });
                    return;
                }
                // Validate pricing
                if (propertyData.pricePerNight <= 0) {
                    res.status(400).json({
                        success: false,
                        message: 'Price per night must be greater than 0'
                    });
                    return;
                }
                // Validate availability dates
                if (!propertyData.availabilityDates?.start || !propertyData.availabilityDates?.end) {
                    res.status(400).json({
                        success: false,
                        message: 'Availability dates are required'
                    });
                    return;
                }
                const property = await this.propertyService.createProperty(hostId, propertyData);
                res.status(201).json({
                    success: true,
                    message: 'Property created successfully',
                    data: property
                });
            }
            catch (error) {
                console.error('Error creating property:', error);
                res.status(400).json({
                    success: false,
                    message: error.message || 'Failed to create property'
                });
            }
        };
        this.updateProperty = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const propertyId = parseInt(req.params.id);
                const hostId = parseInt(req.user.userId);
                const updateData = req.body;
                if (isNaN(propertyId)) {
                    res.status(400).json({
                        success: false,
                        message: 'Invalid property ID'
                    });
                    return;
                }
                const property = await this.propertyService.updateProperty(propertyId, hostId, updateData);
                res.json({
                    success: true,
                    message: 'Property updated successfully',
                    data: property
                });
            }
            catch (error) {
                console.error('Error updating property:', error);
                res.status(400).json({
                    success: false,
                    message: error.message || 'Failed to update property'
                });
            }
        };
        this.deleteProperty = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const propertyId = parseInt(req.params.id);
                const hostId = parseInt(req.user.userId);
                if (isNaN(propertyId)) {
                    res.status(400).json({
                        success: false,
                        message: 'Invalid property ID'
                    });
                    return;
                }
                await this.propertyService.deleteProperty(propertyId, hostId);
                res.json({
                    success: true,
                    message: 'Property deleted successfully'
                });
            }
            catch (error) {
                console.error('Error deleting property:', error);
                res.status(400).json({
                    success: false,
                    message: error.message || 'Failed to delete property'
                });
            }
        };
        // --- PROPERTY QUERIES ---
        this.getPropertyById = async (req, res) => {
            try {
                const propertyId = parseInt(req.params.id);
                if (isNaN(propertyId)) {
                    res.status(400).json({
                        success: false,
                        message: 'Invalid property ID'
                    });
                    return;
                }
                const property = await this.propertyService.getPropertyById(propertyId);
                if (!property) {
                    res.status(404).json({
                        success: false,
                        message: 'Property not found'
                    });
                    return;
                }
                res.json({
                    success: true,
                    message: 'Property retrieved successfully',
                    data: property
                });
            }
            catch (error) {
                console.error('Error fetching property:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to retrieve property'
                });
            }
        };
        this.searchProperties = async (req, res) => {
            try {
                const page = parseInt(req.query.page) || 1;
                const limit = parseInt(req.query.limit) || 20;
                const filters = {
                    location: req.query.location,
                    type: req.query.type,
                    category: req.query.category,
                    minPrice: req.query.minPrice ? parseFloat(req.query.minPrice) : undefined,
                    maxPrice: req.query.maxPrice ? parseFloat(req.query.maxPrice) : undefined,
                    beds: req.query.beds ? parseInt(req.query.beds) : undefined,
                    baths: req.query.baths ? parseInt(req.query.baths) : undefined,
                    maxGuests: req.query.maxGuests ? parseInt(req.query.maxGuests) : undefined,
                    features: req.query.features ? req.query.features.split(',') : undefined,
                    availableFrom: req.query.availableFrom,
                    availableTo: req.query.availableTo,
                    search: req.query.search,
                    sortBy: req.query.sortBy,
                    sortOrder: req.query.sortOrder
                };
                // Remove undefined values
                Object.keys(filters).forEach(key => {
                    if (filters[key] === undefined) {
                        delete filters[key];
                    }
                });
                const result = await this.propertyService.searchProperties(filters, page, limit);
                res.json({
                    success: true,
                    message: 'Properties retrieved successfully',
                    data: result
                });
            }
            catch (error) {
                console.error('Error searching properties:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to search properties'
                });
            }
        };
        this.getMyProperties = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const hostId = parseInt(req.user.userId);
                const status = req.query.status;
                // Define valid status values based on your PropertyStatus type
                const validStatuses = ['active', 'inactive', 'pending', 'suspended', 'draft'];
                // Validate and create filters
                let filters = undefined;
                if (status) {
                    // Validate that status is a valid PropertyStatus value
                    if (validStatuses.includes(status)) {
                        filters = {
                            status: status
                        };
                    }
                    else {
                        res.status(400).json({
                            success: false,
                            message: `Invalid status. Valid values are: ${validStatuses.join(', ')}`
                        });
                        return;
                    }
                }
                const properties = await this.propertyService.getPropertiesByHost(hostId, filters);
                res.json({
                    success: true,
                    message: 'Properties retrieved successfully',
                    data: properties
                });
            }
            catch (error) {
                console.error('Error fetching host properties:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to retrieve properties'
                });
            }
        };
        this.getFeaturedProperties = async (req, res) => {
            try {
                const limit = parseInt(req.query.limit) || 8;
                const properties = await this.propertyService.getFeaturedProperties(limit);
                res.json({
                    success: true,
                    message: 'Featured properties retrieved successfully',
                    data: properties
                });
            }
            catch (error) {
                console.error('Error fetching featured properties:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to retrieve featured properties'
                });
            }
        };
        this.getSimilarProperties = async (req, res) => {
            try {
                const propertyId = parseInt(req.params.id);
                const limit = parseInt(req.query.limit) || 6;
                if (isNaN(propertyId)) {
                    res.status(400).json({
                        success: false,
                        message: 'Invalid property ID'
                    });
                    return;
                }
                const properties = await this.propertyService.getSimilarProperties(propertyId, limit);
                res.json({
                    success: true,
                    message: 'Similar properties retrieved successfully',
                    data: properties
                });
            }
            catch (error) {
                console.error('Error fetching similar properties:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to retrieve similar properties'
                });
            }
        };
        // --- BOOKING MANAGEMENT ---
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
                const requiredFields = ['propertyId', 'checkIn', 'checkOut', 'guests', 'totalPrice'];
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
                if (new Date(bookingData.checkIn) >= new Date(bookingData.checkOut)) {
                    res.status(400).json({
                        success: false,
                        message: 'Check-out date must be after check-in date'
                    });
                    return;
                }
                const booking = await this.propertyService.createBooking(guestId, bookingData);
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
        this.getPropertyBookings = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const propertyId = parseInt(req.params.id);
                const hostId = parseInt(req.user.userId);
                if (isNaN(propertyId)) {
                    res.status(400).json({
                        success: false,
                        message: 'Invalid property ID'
                    });
                    return;
                }
                const bookings = await this.propertyService.getBookingsByProperty(propertyId, hostId);
                res.json({
                    success: true,
                    message: 'Bookings retrieved successfully',
                    data: bookings
                });
            }
            catch (error) {
                console.error('Error fetching property bookings:', error);
                res.status(400).json({
                    success: false,
                    message: error.message || 'Failed to retrieve bookings'
                });
            }
        };
        // --- REVIEW MANAGEMENT ---
        this.createReview = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({ success: false, message: 'Authentication required' });
                    return;
                }
                const userId = parseInt(req.user.userId);
                const reviewData = req.body;
                // Validate required fields
                if (!reviewData.propertyId || !reviewData.rating || !reviewData.comment) {
                    res.status(400).json({ success: false, message: 'Property ID, rating, and comment are required' });
                    return;
                }
                if (reviewData.rating < 1 || reviewData.rating > 5) {
                    res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' });
                    return;
                }
                const review = await this.propertyService.createReview(userId, reviewData);
                res.status(201).json({ success: true, message: 'Review created successfully', data: review });
            }
            catch (error) {
                console.error('Error creating review:', error);
                res.status(400).json({ success: false, message: error.message || 'Failed to create review' });
            }
        };
        this.getPropertyReviews = async (req, res) => {
            try {
                const propertyId = parseInt(req.params.id);
                const page = parseInt(req.query.page) || 1;
                const limit = parseInt(req.query.limit) || 10;
                if (isNaN(propertyId)) {
                    res.status(400).json({
                        success: false,
                        message: 'Invalid property ID'
                    });
                    return;
                }
                const result = await this.propertyService.getPropertyReviews(propertyId, page, limit);
                res.json({
                    success: true,
                    message: 'Reviews retrieved successfully',
                    data: result
                });
            }
            catch (error) {
                console.error('Error fetching property reviews:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to retrieve reviews'
                });
            }
        };
        // --- MEDIA MANAGEMENT ---
        this.uploadPropertyImages = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const propertyId = parseInt(req.params.id);
                const hostId = parseInt(req.user.userId);
                const { category, imageUrls } = req.body;
                if (isNaN(propertyId)) {
                    res.status(400).json({
                        success: false,
                        message: 'Invalid property ID'
                    });
                    return;
                }
                if (!category || !imageUrls || !Array.isArray(imageUrls)) {
                    res.status(400).json({
                        success: false,
                        message: 'Category and image URLs are required'
                    });
                    return;
                }
                const property = await this.propertyService.uploadPropertyImages(propertyId, hostId, category, imageUrls);
                res.json({
                    success: true,
                    message: 'Images uploaded successfully',
                    data: property
                });
            }
            catch (error) {
                console.error('Error uploading property images:', error);
                res.status(400).json({
                    success: false,
                    message: error.message || 'Failed to upload images'
                });
            }
        };
        this.removePropertyImage = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const propertyId = parseInt(req.params.id);
                const hostId = parseInt(req.user.userId);
                const { category, imageUrl } = req.body;
                if (isNaN(propertyId)) {
                    res.status(400).json({
                        success: false,
                        message: 'Invalid property ID'
                    });
                    return;
                }
                if (!category || !imageUrl) {
                    res.status(400).json({
                        success: false,
                        message: 'Category and image URL are required'
                    });
                    return;
                }
                const property = await this.propertyService.removePropertyImage(propertyId, hostId, category, imageUrl);
                res.json({
                    success: true,
                    message: 'Image removed successfully',
                    data: property
                });
            }
            catch (error) {
                console.error('Error removing property image:', error);
                res.status(400).json({
                    success: false,
                    message: error.message || 'Failed to remove image'
                });
            }
        };
        // --- PROPERTY STATUS MANAGEMENT ---
        this.activateProperty = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const propertyId = parseInt(req.params.id);
                const hostId = parseInt(req.user.userId);
                if (isNaN(propertyId)) {
                    res.status(400).json({
                        success: false,
                        message: 'Invalid property ID'
                    });
                    return;
                }
                const property = await this.propertyService.activateProperty(propertyId, hostId);
                res.json({
                    success: true,
                    message: 'Property activated successfully',
                    data: property
                });
            }
            catch (error) {
                console.error('Error activating property:', error);
                res.status(400).json({
                    success: false,
                    message: error.message || 'Failed to activate property'
                });
            }
        };
        this.deactivateProperty = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const propertyId = parseInt(req.params.id);
                const hostId = parseInt(req.user.userId);
                if (isNaN(propertyId)) {
                    res.status(400).json({
                        success: false,
                        message: 'Invalid property ID'
                    });
                    return;
                }
                const property = await this.propertyService.deactivateProperty(propertyId, hostId);
                res.json({
                    success: true,
                    message: 'Property deactivated successfully',
                    data: property
                });
            }
            catch (error) {
                console.error('Error deactivating property:', error);
                res.status(400).json({
                    success: false,
                    message: error.message || 'Failed to deactivate property'
                });
            }
        };
        // --- ANALYTICS & DASHBOARD ---
        this.getHostDashboard = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const hostId = parseInt(req.user.userId);
                const dashboard = await this.propertyService.getHostDashboard(hostId);
                res.json({
                    success: true,
                    message: 'Dashboard data retrieved successfully',
                    data: dashboard
                });
            }
            catch (error) {
                console.error('Error fetching host dashboard:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to retrieve dashboard data'
                });
            }
        };
        // --- LOCATION SUGGESTIONS ---
        this.getLocationSuggestions = async (req, res) => {
            try {
                const query = req.query.q;
                if (!query || query.length < 2) {
                    res.status(400).json({
                        success: false,
                        message: 'Query must be at least 2 characters long'
                    });
                    return;
                }
                const suggestions = await this.propertyService.getLocationSuggestions(query);
                res.json({
                    success: true,
                    message: 'Location suggestions retrieved successfully',
                    data: suggestions
                });
            }
            catch (error) {
                console.error('Error fetching location suggestions:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to retrieve location suggestions'
                });
            }
        };
        // Additional methods to add to PropertyController class
        // --- GUEST MANAGEMENT ENDPOINTS ---
        this.getHostGuests = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const hostId = parseInt(req.user.userId);
                const filters = {
                    search: req.query.search,
                    verificationStatus: req.query.verificationStatus,
                    bookingStatus: req.query.bookingStatus,
                    sortBy: req.query.sortBy,
                    sortOrder: req.query.sortOrder,
                    dateRange: req.query.startDate && req.query.endDate ? {
                        start: req.query.startDate,
                        end: req.query.endDate
                    } : undefined
                };
                // Remove undefined values
                Object.keys(filters).forEach(key => {
                    if (filters[key] === undefined) {
                        delete filters[key];
                    }
                });
                const guests = await this.propertyService.getHostGuests(hostId, filters);
                res.json({
                    success: true,
                    message: 'Guests retrieved successfully',
                    data: guests
                });
            }
            catch (error) {
                console.error('Error fetching guests:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to retrieve guests'
                });
            }
        };
        this.getGuestDetails = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const hostId = parseInt(req.user.userId);
                const guestId = parseInt(req.params.guestId);
                if (isNaN(guestId)) {
                    res.status(400).json({
                        success: false,
                        message: 'Invalid guest ID'
                    });
                    return;
                }
                const guestHistory = await this.propertyService.getGuestDetails(hostId, guestId);
                res.json({
                    success: true,
                    message: 'Guest details retrieved successfully',
                    data: guestHistory
                });
            }
            catch (error) {
                console.error('Error fetching guest details:', error);
                res.status(400).json({
                    success: false,
                    message: error.message || 'Failed to retrieve guest details'
                });
            }
        };
        // --- BOOKING MANAGEMENT ENDPOINTS ---
        this.getHostBookings = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const hostId = parseInt(req.user.userId);
                const page = parseInt(req.query.page) || 1;
                const limit = parseInt(req.query.limit) || 20;
                const filters = {
                    status: req.query.status ? req.query.status.split(',') : undefined,
                    propertyId: req.query.propertyId ? parseInt(req.query.propertyId) : undefined,
                    guestId: req.query.guestId ? parseInt(req.query.guestId) : undefined,
                    dateRange: req.query.startDate && req.query.endDate ? {
                        start: req.query.startDate,
                        end: req.query.endDate
                    } : undefined,
                    sortBy: req.query.sortBy,
                    sortOrder: req.query.sortOrder
                };
                // Remove undefined values
                Object.keys(filters).forEach(key => {
                    if (filters[key] === undefined) {
                        delete filters[key];
                    }
                });
                const result = await this.propertyService.getHostBookings(hostId, filters, page, limit);
                res.json({
                    success: true,
                    message: 'Bookings retrieved successfully',
                    data: result
                });
            }
            catch (error) {
                console.error('Error fetching host bookings:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to retrieve bookings'
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
                const hostId = parseInt(req.user.userId);
                const bookingId = req.params.bookingId;
                const updateData = req.body;
                if (!bookingId) {
                    res.status(400).json({
                        success: false,
                        message: 'Booking ID is required'
                    });
                    return;
                }
                const booking = await this.propertyService.updateBooking(hostId, bookingId, updateData);
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
        this.getBookingCalendar = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const hostId = parseInt(req.user.userId);
                const year = parseInt(req.query.year) || new Date().getFullYear();
                const month = parseInt(req.query.month) || new Date().getMonth() + 1;
                if (month < 1 || month > 12) {
                    res.status(400).json({
                        success: false,
                        message: 'Month must be between 1 and 12'
                    });
                    return;
                }
                const calendar = await this.propertyService.getBookingCalendar(hostId, year, month);
                res.json({
                    success: true,
                    message: 'Booking calendar retrieved successfully',
                    data: calendar
                });
            }
            catch (error) {
                console.error('Error fetching booking calendar:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to retrieve booking calendar'
                });
            }
        };
        // --- EARNINGS ENDPOINTS ---
        this.getEarningsOverview = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const hostId = parseInt(req.user.userId);
                const earnings = await this.propertyService.getEarningsOverview(hostId);
                res.json({
                    success: true,
                    message: 'Earnings overview retrieved successfully',
                    data: earnings
                });
            }
            catch (error) {
                console.error('Error fetching earnings overview:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to retrieve earnings overview'
                });
            }
        };
        this.getEarningsBreakdown = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const hostId = parseInt(req.user.userId);
                const breakdown = await this.propertyService.getEarningsBreakdown(hostId);
                res.json({
                    success: true,
                    message: 'Earnings breakdown retrieved successfully',
                    data: breakdown
                });
            }
            catch (error) {
                console.error('Error fetching earnings breakdown:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to retrieve earnings breakdown'
                });
            }
        };
        // --- ANALYTICS ENDPOINTS ---
        this.getHostAnalytics = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const hostId = parseInt(req.user.userId);
                const timeRange = req.query.timeRange || 'month';
                const analytics = await this.propertyService.getHostAnalytics(hostId, timeRange);
                res.json({
                    success: true,
                    message: 'Analytics retrieved successfully',
                    data: analytics
                });
            }
            catch (error) {
                console.error('Error fetching analytics:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to retrieve analytics'
                });
            }
        };
        // --- ENHANCED DASHBOARD ---
        this.getEnhancedDashboard = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const hostId = parseInt(req.user.userId);
                const dashboard = await this.propertyService.getEnhancedHostDashboard(hostId);
                res.json({
                    success: true,
                    message: 'Enhanced dashboard retrieved successfully',
                    data: dashboard
                });
            }
            catch (error) {
                console.error('Error fetching enhanced dashboard:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to retrieve enhanced dashboard'
                });
            }
        };
        // --- PROPERTY AVAILABILITY MANAGEMENT ---
        this.updatePropertyAvailability = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const propertyId = parseInt(req.params.id);
                const hostId = parseInt(req.user.userId);
                const { availableFrom, availableTo } = req.body;
                if (isNaN(propertyId)) {
                    res.status(400).json({
                        success: false,
                        message: 'Invalid property ID'
                    });
                    return;
                }
                if (!availableFrom || !availableTo) {
                    res.status(400).json({
                        success: false,
                        message: 'Available from and to dates are required'
                    });
                    return;
                }
                const property = await this.propertyService.updatePropertyAvailability(propertyId, hostId, availableFrom, availableTo);
                res.json({
                    success: true,
                    message: 'Property availability updated successfully',
                    data: property
                });
            }
            catch (error) {
                console.error('Error updating property availability:', error);
                res.status(400).json({
                    success: false,
                    message: error.message || 'Failed to update property availability'
                });
            }
        };
        this.blockPropertyDates = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const propertyId = parseInt(req.params.id);
                const hostId = parseInt(req.user.userId);
                const { startDate, endDate, reason } = req.body;
                if (isNaN(propertyId)) {
                    res.status(400).json({
                        success: false,
                        message: 'Invalid property ID'
                    });
                    return;
                }
                if (!startDate || !endDate) {
                    res.status(400).json({
                        success: false,
                        message: 'Start date and end date are required'
                    });
                    return;
                }
                await this.propertyService.blockDates(propertyId, hostId, startDate, endDate, reason);
                res.json({
                    success: true,
                    message: 'Dates blocked successfully'
                });
            }
            catch (error) {
                console.error('Error blocking dates:', error);
                res.status(400).json({
                    success: false,
                    message: error.message || 'Failed to block dates'
                });
            }
        };
        // --- PRICING MANAGEMENT ---
        this.updatePropertyPricing = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const propertyId = parseInt(req.params.id);
                const hostId = parseInt(req.user.userId);
                const { pricePerNight, pricePerTwoNights } = req.body;
                if (isNaN(propertyId)) {
                    res.status(400).json({
                        success: false,
                        message: 'Invalid property ID'
                    });
                    return;
                }
                if (!pricePerNight || pricePerNight <= 0) {
                    res.status(400).json({
                        success: false,
                        message: 'Valid price per night is required'
                    });
                    return;
                }
                const property = await this.propertyService.updatePropertyPricing(propertyId, hostId, pricePerNight, pricePerTwoNights);
                res.json({
                    success: true,
                    message: 'Property pricing updated successfully',
                    data: property
                });
            }
            catch (error) {
                console.error('Error updating property pricing:', error);
                res.status(400).json({
                    success: false,
                    message: error.message || 'Failed to update property pricing'
                });
            }
        };
        // --- BULK OPERATIONS ---
        this.bulkUpdateBookings = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const hostId = parseInt(req.user.userId);
                const { bookingIds, updates } = req.body;
                if (!Array.isArray(bookingIds) || bookingIds.length === 0) {
                    res.status(400).json({
                        success: false,
                        message: 'Booking IDs array is required'
                    });
                    return;
                }
                if (!updates || Object.keys(updates).length === 0) {
                    res.status(400).json({
                        success: false,
                        message: 'Updates object is required'
                    });
                    return;
                }
                const results = await Promise.allSettled(bookingIds.map(bookingId => this.propertyService.updateBooking(hostId, bookingId, updates)));
                const successful = results.filter(r => r.status === 'fulfilled').length;
                const failed = results.length - successful;
                res.json({
                    success: true,
                    message: `Bulk update completed: ${successful} successful, ${failed} failed`,
                    data: {
                        total: results.length,
                        successful,
                        failed,
                        results: results.map((result, index) => ({
                            bookingId: bookingIds[index],
                            status: result.status,
                            error: result.status === 'rejected' ? result.reason?.message : undefined
                        }))
                    }
                });
            }
            catch (error) {
                console.error('Error in bulk update:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to perform bulk update'
                });
            }
        };
        // --- QUICK ACTIONS ---
        this.getQuickStats = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const hostId = parseInt(req.user.userId);
                const dashboard = await this.propertyService.getEnhancedHostDashboard(hostId);
                res.json({
                    success: true,
                    message: 'Quick stats retrieved successfully',
                    data: dashboard.quickStats
                });
            }
            catch (error) {
                console.error('Error fetching quick stats:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to retrieve quick stats'
                });
            }
        };
        this.getRecentActivity = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const hostId = parseInt(req.user.userId);
                const limit = parseInt(req.query.limit) || 10;
                const dashboard = await this.propertyService.getEnhancedHostDashboard(hostId);
                res.json({
                    success: true,
                    message: 'Recent activity retrieved successfully',
                    data: dashboard.recentActivity.slice(0, limit)
                });
            }
            catch (error) {
                console.error('Error fetching recent activity:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to retrieve recent activity'
                });
            }
        };
        this.propertyService = new property_service_1.PropertyService();
    }
}
exports.PropertyController = PropertyController;
