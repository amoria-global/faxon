"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TourController = void 0;
const tours_service_1 = require("../services/tours.service");
class TourController {
    constructor() {
        // --- PUBLIC TOUR ROUTES ---
        this.searchTours = async (req, res) => {
            try {
                const page = parseInt(req.query.page) || 1;
                const limit = parseInt(req.query.limit) || 20;
                const filters = {
                    location: req.query.location,
                    category: req.query.category,
                    type: req.query.type,
                    difficulty: req.query.difficulty,
                    minPrice: req.query.minPrice ? parseFloat(req.query.minPrice) : undefined,
                    maxPrice: req.query.maxPrice ? parseFloat(req.query.maxPrice) : undefined,
                    minDuration: req.query.minDuration ? parseFloat(req.query.minDuration) : undefined,
                    maxDuration: req.query.maxDuration ? parseFloat(req.query.maxDuration) : undefined,
                    date: req.query.date,
                    groupSize: req.query.groupSize ? parseInt(req.query.groupSize) : undefined,
                    tags: req.query.tags ? req.query.tags.split(',') : undefined,
                    rating: req.query.rating ? parseFloat(req.query.rating) : undefined,
                    search: req.query.search,
                    sortBy: req.query.sortBy,
                    sortOrder: req.query.sortOrder,
                    hasAvailability: req.query.hasAvailability === 'true'
                };
                // Remove undefined values
                Object.keys(filters).forEach(key => {
                    if (filters[key] === undefined) {
                        delete filters[key];
                    }
                });
                const result = await this.tourService.searchTours(filters, page, limit);
                res.json({
                    success: true,
                    message: 'Tours retrieved successfully',
                    data: result
                });
            }
            catch (error) {
                console.error('Error searching tours:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to search tours'
                });
            }
        };
        this.getTourById = async (req, res) => {
            try {
                const tourId = req.params.id;
                if (!tourId) {
                    res.status(400).json({
                        success: false,
                        message: 'Tour ID is required'
                    });
                    return;
                }
                const tour = await this.tourService.getTourById(tourId);
                if (!tour) {
                    res.status(404).json({
                        success: false,
                        message: 'Tour not found'
                    });
                    return;
                }
                res.json({
                    success: true,
                    message: 'Tour retrieved successfully',
                    data: tour
                });
            }
            catch (error) {
                console.error('Error fetching tour:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to retrieve tour'
                });
            }
        };
        this.getFeaturedTours = async (req, res) => {
            try {
                const limit = parseInt(req.query.limit) || 8;
                const tours = await this.tourService.getFeaturedTours(limit);
                res.json({
                    success: true,
                    message: 'Featured tours retrieved successfully',
                    data: tours
                });
            }
            catch (error) {
                console.error('Error fetching featured tours:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to retrieve featured tours'
                });
            }
        };
        this.getTourReviews = async (req, res) => {
            try {
                const tourId = req.params.id;
                const page = parseInt(req.query.page) || 1;
                const limit = parseInt(req.query.limit) || 10;
                if (!tourId) {
                    res.status(400).json({
                        success: false,
                        message: 'Tour ID is required'
                    });
                    return;
                }
                const result = await this.tourService.getTourReviews(tourId, page, limit);
                res.json({
                    success: true,
                    message: 'Reviews retrieved successfully',
                    data: result
                });
            }
            catch (error) {
                console.error('Error fetching tour reviews:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to retrieve reviews'
                });
            }
        };
        this.getTourCategories = async (req, res) => {
            try {
                const categories = await this.tourService.getTourCategories();
                res.json({
                    success: true,
                    message: 'Tour categories retrieved successfully',
                    data: categories
                });
            }
            catch (error) {
                console.error('Error fetching tour categories:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to retrieve categories'
                });
            }
        };
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
                const suggestions = await this.tourService.getLocationSuggestions(query);
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
        this.searchTourGuides = async (req, res) => {
            try {
                const page = parseInt(req.query.page) || 1;
                const limit = parseInt(req.query.limit) || 20;
                const filters = {
                    search: req.query.search,
                    specialization: req.query.specialization,
                    language: req.query.language,
                    experience: req.query.experience ? parseInt(req.query.experience) : undefined,
                    rating: req.query.rating ? parseFloat(req.query.rating) : undefined,
                    isVerified: req.query.isVerified === 'true',
                    location: req.query.location,
                    sortBy: req.query.sortBy,
                    sortOrder: req.query.sortOrder
                };
                // Remove undefined values
                Object.keys(filters).forEach(key => {
                    if (filters[key] === undefined) {
                        delete filters[key];
                    }
                });
                const result = await this.tourService.searchTourGuides(filters, page, limit);
                res.json({
                    success: true,
                    message: 'Tour guides retrieved successfully',
                    data: result
                });
            }
            catch (error) {
                console.error('Error searching tour guides:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to search tour guides'
                });
            }
        };
        // --- GUEST ENDPOINTS ---
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
                const requiredFields = ['tourId', 'scheduleId', 'numberOfParticipants', 'participants', 'totalAmount'];
                const missingFields = requiredFields.filter(field => !bookingData[field]);
                if (missingFields.length > 0) {
                    res.status(400).json({
                        success: false,
                        message: 'Missing required fields',
                        errors: missingFields.map(field => `${field} is required`)
                    });
                    return;
                }
                // Validate participant count
                if (bookingData.numberOfParticipants !== bookingData.participants.length) {
                    res.status(400).json({
                        success: false,
                        message: 'Number of participants must match participants array length'
                    });
                    return;
                }
                const booking = await this.tourService.createTourBooking(userId, bookingData);
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
        this.getMyTourBookings = async (req, res) => {
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
                    tourId: req.query.tourId,
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
                const result = await this.tourService.getUserTourBookings(userId, filters, page, limit);
                res.json({
                    success: true,
                    message: 'Tour bookings retrieved successfully',
                    data: result
                });
            }
            catch (error) {
                console.error('Error fetching user tour bookings:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to retrieve tour bookings'
                });
            }
        };
        this.getMyTourBookingById = async (req, res) => {
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
                const booking = await this.tourService.getUserTourBookingById(userId, bookingId);
                if (!booking) {
                    res.status(404).json({
                        success: false,
                        message: 'Booking not found or you do not have access to this booking'
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
                console.error('Error fetching tour booking by ID:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to retrieve tour booking'
                });
            }
        };
        this.createTourReview = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const userId = parseInt(req.user.userId);
                const reviewData = req.body;
                // Validate required fields
                if (!reviewData.bookingId || !reviewData.tourId || !reviewData.rating || !reviewData.comment) {
                    res.status(400).json({
                        success: false,
                        message: 'Booking ID, tour ID, rating, and comment are required'
                    });
                    return;
                }
                if (reviewData.rating < 1 || reviewData.rating > 5) {
                    res.status(400).json({
                        success: false,
                        message: 'Rating must be between 1 and 5'
                    });
                    return;
                }
                const review = await this.tourService.createTourReview(userId, reviewData);
                res.status(201).json({
                    success: true,
                    message: 'Review created successfully',
                    data: review
                });
            }
            catch (error) {
                console.error('Error creating tour review:', error);
                res.status(400).json({
                    success: false,
                    message: error.message || 'Failed to create review'
                });
            }
        };
        // --- TOUR GUIDE ENDPOINTS ---
        this.getTourGuideDashboard = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const tourGuideId = parseInt(req.user.userId);
                const dashboard = await this.tourService.getTourGuideDashboard(tourGuideId);
                res.json({
                    success: true,
                    message: 'Dashboard retrieved successfully',
                    data: dashboard
                });
            }
            catch (error) {
                console.error('Error fetching tour guide dashboard:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to retrieve dashboard'
                });
            }
        };
        this.getEnhancedTourGuideDashboard = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const tourGuideId = parseInt(req.user.userId);
                const dashboard = await this.tourService.getEnhancedTourGuideDashboard(tourGuideId);
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
        this.createTour = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const tourGuideId = parseInt(req.user.userId);
                const tourData = req.body;
                // Validate required fields
                const requiredFields = ['title', 'description', 'shortDescription', 'category', 'type', 'duration', 'maxGroupSize', 'price', 'locationCity', 'locationCountry', 'meetingPoint'];
                const missingFields = requiredFields.filter(field => !tourData[field]);
                if (missingFields.length > 0) {
                    res.status(400).json({
                        success: false,
                        message: 'Missing required fields',
                        errors: missingFields.map(field => `${field} is required`)
                    });
                    return;
                }
                const tour = await this.tourService.createTour(tourGuideId, tourData);
                res.status(201).json({
                    success: true,
                    message: 'Tour created successfully',
                    data: tour
                });
            }
            catch (error) {
                console.error('Error creating tour:', error);
                res.status(400).json({
                    success: false,
                    message: error.message || 'Failed to create tour'
                });
            }
        };
        this.updateTour = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const tourId = req.params.id;
                const tourGuideId = parseInt(req.user.userId);
                const updateData = req.body;
                if (!tourId) {
                    res.status(400).json({
                        success: false,
                        message: 'Tour ID is required'
                    });
                    return;
                }
                const tour = await this.tourService.updateTour(tourId, tourGuideId, updateData);
                res.json({
                    success: true,
                    message: 'Tour updated successfully',
                    data: tour
                });
            }
            catch (error) {
                console.error('Error updating tour:', error);
                res.status(400).json({
                    success: false,
                    message: error.message || 'Failed to update tour'
                });
            }
        };
        this.deleteTour = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const tourId = req.params.id;
                const tourGuideId = parseInt(req.user.userId);
                if (!tourId) {
                    res.status(400).json({
                        success: false,
                        message: 'Tour ID is required'
                    });
                    return;
                }
                await this.tourService.deleteTour(tourId, tourGuideId);
                res.json({
                    success: true,
                    message: 'Tour deleted successfully'
                });
            }
            catch (error) {
                console.error('Error deleting tour:', error);
                res.status(400).json({
                    success: false,
                    message: error.message || 'Failed to delete tour'
                });
            }
        };
        this.getMyTours = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const tourGuideId = parseInt(req.user.userId);
                const page = parseInt(req.query.page) || 1;
                const limit = parseInt(req.query.limit) || 20;
                const filters = {
                    search: req.query.search,
                    category: req.query.category,
                    isActive: req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined,
                    sortBy: req.query.sortBy,
                    sortOrder: req.query.sortOrder
                };
                // Remove undefined values
                Object.keys(filters).forEach(key => {
                    if (filters[key] === undefined) {
                        delete filters[key];
                    }
                });
                const result = await this.tourService.getToursByGuide(tourGuideId, filters, page, limit);
                res.json({
                    success: true,
                    message: 'Tours retrieved successfully',
                    data: result
                });
            }
            catch (error) {
                console.error('Error fetching guide tours:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to retrieve tours'
                });
            }
        };
        // --- TOUR SCHEDULE MANAGEMENT ---
        this.createTourSchedule = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const tourId = req.params.id;
                const tourGuideId = parseInt(req.user.userId);
                const scheduleData = req.body;
                if (!tourId) {
                    res.status(400).json({
                        success: false,
                        message: 'Tour ID is required'
                    });
                    return;
                }
                const schedule = await this.tourService.createTourSchedule(tourId, tourGuideId, scheduleData);
                res.status(201).json({
                    success: true,
                    message: 'Tour schedule created successfully',
                    data: schedule
                });
            }
            catch (error) {
                console.error('Error creating tour schedule:', error);
                res.status(400).json({
                    success: false,
                    message: error.message || 'Failed to create tour schedule'
                });
            }
        };
        this.updateTourSchedule = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const scheduleId = req.params.scheduleId;
                const tourGuideId = parseInt(req.user.userId);
                const updateData = req.body;
                if (!scheduleId) {
                    res.status(400).json({
                        success: false,
                        message: 'Schedule ID is required'
                    });
                    return;
                }
                const schedule = await this.tourService.updateTourSchedule(scheduleId, tourGuideId, updateData);
                res.json({
                    success: true,
                    message: 'Tour schedule updated successfully',
                    data: schedule
                });
            }
            catch (error) {
                console.error('Error updating tour schedule:', error);
                res.status(400).json({
                    success: false,
                    message: error.message || 'Failed to update tour schedule'
                });
            }
        };
        this.deleteTourSchedule = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const scheduleId = req.params.scheduleId;
                const tourGuideId = parseInt(req.user.userId);
                if (!scheduleId) {
                    res.status(400).json({
                        success: false,
                        message: 'Schedule ID is required'
                    });
                    return;
                }
                await this.tourService.deleteTourSchedule(scheduleId, tourGuideId);
                res.json({
                    success: true,
                    message: 'Tour schedule deleted successfully'
                });
            }
            catch (error) {
                console.error('Error deleting tour schedule:', error);
                res.status(400).json({
                    success: false,
                    message: error.message || 'Failed to delete tour schedule'
                });
            }
        };
        this.getTourSchedules = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const tourId = req.params.id;
                const tourGuideId = parseInt(req.user.userId);
                if (!tourId) {
                    res.status(400).json({
                        success: false,
                        message: 'Tour ID is required'
                    });
                    return;
                }
                const schedules = await this.tourService.getTourSchedules(tourId, tourGuideId);
                res.json({
                    success: true,
                    message: 'Tour schedules retrieved successfully',
                    data: schedules
                });
            }
            catch (error) {
                console.error('Error fetching tour schedules:', error);
                res.status(400).json({
                    success: false,
                    message: error.message || 'Failed to retrieve tour schedules'
                });
            }
        };
        // --- BOOKING MANAGEMENT ---
        this.getTourBookings = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const tourGuideId = parseInt(req.user.userId);
                const page = parseInt(req.query.page) || 1;
                const limit = parseInt(req.query.limit) || 20;
                const filters = {
                    status: req.query.status ? req.query.status.split(',') : undefined,
                    tourId: req.query.tourId,
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
                const result = await this.tourService.getTourGuideBookings(tourGuideId, filters, page, limit);
                res.json({
                    success: true,
                    message: 'Tour bookings retrieved successfully',
                    data: result
                });
            }
            catch (error) {
                console.error('Error fetching tour guide bookings:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to retrieve tour bookings'
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
                const bookingId = req.params.bookingId;
                const tourGuideId = parseInt(req.user.userId);
                const updateData = req.body;
                if (!bookingId) {
                    res.status(400).json({
                        success: false,
                        message: 'Booking ID is required'
                    });
                    return;
                }
                const booking = await this.tourService.updateTourBooking(bookingId, tourGuideId, updateData);
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
        this.getTourBookingCalendar = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const tourGuideId = parseInt(req.user.userId);
                const year = parseInt(req.query.year) || new Date().getFullYear();
                const month = parseInt(req.query.month) || new Date().getMonth() + 1;
                if (month < 1 || month > 12) {
                    res.status(400).json({
                        success: false,
                        message: 'Month must be between 1 and 12'
                    });
                    return;
                }
                const calendar = await this.tourService.getTourBookingCalendar(tourGuideId, year, month);
                res.json({
                    success: true,
                    message: 'Tour booking calendar retrieved successfully',
                    data: calendar
                });
            }
            catch (error) {
                console.error('Error fetching tour booking calendar:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to retrieve tour booking calendar'
                });
            }
        };
        // --- MEDIA MANAGEMENT ---
        this.uploadTourImages = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const tourId = req.params.id;
                const tourGuideId = parseInt(req.user.userId);
                const { category, imageUrls } = req.body;
                if (!tourId) {
                    res.status(400).json({
                        success: false,
                        message: 'Tour ID is required'
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
                const tour = await this.tourService.uploadTourImages(tourId, tourGuideId, category, imageUrls);
                res.json({
                    success: true,
                    message: 'Images uploaded successfully',
                    data: tour
                });
            }
            catch (error) {
                console.error('Error uploading tour images:', error);
                res.status(400).json({
                    success: false,
                    message: error.message || 'Failed to upload images'
                });
            }
        };
        this.removeTourImage = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const tourId = req.params.id;
                const tourGuideId = parseInt(req.user.userId);
                const { category, imageUrl } = req.body;
                if (!tourId) {
                    res.status(400).json({
                        success: false,
                        message: 'Tour ID is required'
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
                const tour = await this.tourService.removeTourImage(tourId, tourGuideId, category, imageUrl);
                res.json({
                    success: true,
                    message: 'Image removed successfully',
                    data: tour
                });
            }
            catch (error) {
                console.error('Error removing tour image:', error);
                res.status(400).json({
                    success: false,
                    message: error.message || 'Failed to remove image'
                });
            }
        };
        // --- EARNINGS ---
        this.getTourGuideEarnings = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const tourGuideId = parseInt(req.user.userId);
                const timeRange = req.query.timeRange || 'month';
                const earnings = await this.tourService.getTourGuideEarnings(tourGuideId, timeRange);
                res.json({
                    success: true,
                    message: 'Earnings retrieved successfully',
                    data: earnings
                });
            }
            catch (error) {
                console.error('Error fetching tour guide earnings:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to retrieve earnings'
                });
            }
        };
        this.getTourGuideEarningsBreakdown = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const tourGuideId = parseInt(req.user.userId);
                const breakdown = await this.tourService.getTourGuideEarningsBreakdown(tourGuideId);
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
        // --- ANALYTICS ---
        this.getTourGuideAnalytics = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const tourGuideId = parseInt(req.user.userId);
                const timeRange = req.query.timeRange || 'month';
                const analytics = await this.tourService.getTourGuideAnalytics(tourGuideId, timeRange);
                res.json({
                    success: true,
                    message: 'Analytics retrieved successfully',
                    data: analytics
                });
            }
            catch (error) {
                console.error('Error fetching tour guide analytics:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to retrieve analytics'
                });
            }
        };
        this.getTourAnalytics = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const tourId = req.params.id;
                const tourGuideId = parseInt(req.user.userId);
                const timeRange = req.query.timeRange || 'month';
                if (!tourId) {
                    res.status(400).json({
                        success: false,
                        message: 'Tour ID is required'
                    });
                    return;
                }
                const analytics = await this.tourService.getTourAnalytics(tourId, tourGuideId, timeRange);
                res.json({
                    success: true,
                    message: 'Tour analytics retrieved successfully',
                    data: analytics
                });
            }
            catch (error) {
                console.error('Error fetching tour analytics:', error);
                res.status(400).json({
                    success: false,
                    message: error.message || 'Failed to retrieve tour analytics'
                });
            }
        };
        // --- MESSAGING ---
        this.sendTourMessage = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const senderId = parseInt(req.user.userId);
                const messageData = req.body;
                // Validate required fields
                if (!messageData.receiverId || !messageData.message) {
                    res.status(400).json({
                        success: false,
                        message: 'Receiver ID and message are required'
                    });
                    return;
                }
                const message = await this.tourService.sendTourMessage(senderId, messageData);
                res.status(201).json({
                    success: true,
                    message: 'Message sent successfully',
                    data: message
                });
            }
            catch (error) {
                console.error('Error sending tour message:', error);
                res.status(400).json({
                    success: false,
                    message: error.message || 'Failed to send message'
                });
            }
        };
        this.getTourMessages = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const userId = parseInt(req.user.userId);
                const conversationWith = req.query.conversationWith ? parseInt(req.query.conversationWith) : undefined;
                const bookingId = req.query.bookingId;
                const tourId = req.query.tourId;
                const messages = await this.tourService.getTourMessages(userId, conversationWith, bookingId, tourId);
                res.json({
                    success: true,
                    message: 'Messages retrieved successfully',
                    data: messages
                });
            }
            catch (error) {
                console.error('Error fetching tour messages:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to retrieve messages'
                });
            }
        };
        // --- STATUS MANAGEMENT ---
        this.activateTour = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const tourId = req.params.id;
                const tourGuideId = parseInt(req.user.userId);
                if (!tourId) {
                    res.status(400).json({
                        success: false,
                        message: 'Tour ID is required'
                    });
                    return;
                }
                const tour = await this.tourService.activateTour(tourId, tourGuideId);
                res.json({
                    success: true,
                    message: 'Tour activated successfully',
                    data: tour
                });
            }
            catch (error) {
                console.error('Error activating tour:', error);
                res.status(400).json({
                    success: false,
                    message: error.message || 'Failed to activate tour'
                });
            }
        };
        this.deactivateTour = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const tourId = req.params.id;
                const tourGuideId = parseInt(req.user.userId);
                if (!tourId) {
                    res.status(400).json({
                        success: false,
                        message: 'Tour ID is required'
                    });
                    return;
                }
                const tour = await this.tourService.deactivateTour(tourId, tourGuideId);
                res.json({
                    success: true,
                    message: 'Tour deactivated successfully',
                    data: tour
                });
            }
            catch (error) {
                console.error('Error deactivating tour:', error);
                res.status(400).json({
                    success: false,
                    message: error.message || 'Failed to deactivate tour'
                });
            }
        };
        // --- ADMIN ENDPOINTS ---
        this.getAllTours = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const page = parseInt(req.query.page) || 1;
                const limit = parseInt(req.query.limit) || 20;
                const filters = {
                    search: req.query.search,
                    category: req.query.category,
                    tourGuideId: req.query.tourGuideId ? parseInt(req.query.tourGuideId) : undefined,
                    isActive: req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined,
                    sortBy: req.query.sortBy,
                    sortOrder: req.query.sortOrder
                };
                // Remove undefined values
                Object.keys(filters).forEach(key => {
                    if (filters[key] === undefined) {
                        delete filters[key];
                    }
                });
                const result = await this.tourService.getAllTours(filters, page, limit);
                res.json({
                    success: true,
                    message: 'All tours retrieved successfully',
                    data: result
                });
            }
            catch (error) {
                console.error('Error fetching all tours:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to retrieve tours'
                });
            }
        };
        this.getAllTourBookings = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const page = parseInt(req.query.page) || 1;
                const limit = parseInt(req.query.limit) || 20;
                const filters = {
                    status: req.query.status ? req.query.status.split(',') : undefined,
                    tourId: req.query.tourId,
                    tourGuideId: req.query.tourGuideId ? parseInt(req.query.tourGuideId) : undefined,
                    userId: req.query.userId ? parseInt(req.query.userId) : undefined,
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
                const result = await this.tourService.getAllTourBookings(filters, page, limit);
                res.json({
                    success: true,
                    message: 'All tour bookings retrieved successfully',
                    data: result
                });
            }
            catch (error) {
                console.error('Error fetching all tour bookings:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to retrieve tour bookings'
                });
            }
        };
        this.getTourSystemAnalytics = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const timeRange = req.query.timeRange || 'month';
                const analytics = await this.tourService.getTourSystemAnalytics(timeRange);
                res.json({
                    success: true,
                    message: 'System analytics retrieved successfully',
                    data: analytics
                });
            }
            catch (error) {
                console.error('Error fetching system analytics:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to retrieve system analytics'
                });
            }
        };
        // --- BULK OPERATIONS ---
        this.bulkUpdateTours = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const { tourIds, operation, data } = req.body;
                if (!Array.isArray(tourIds) || tourIds.length === 0) {
                    res.status(400).json({
                        success: false,
                        message: 'Tour IDs array is required'
                    });
                    return;
                }
                if (!operation) {
                    res.status(400).json({
                        success: false,
                        message: 'Operation is required'
                    });
                    return;
                }
                const result = await this.tourService.bulkUpdateTours(tourIds, operation, data);
                res.json({
                    success: true,
                    message: `Bulk operation completed: ${result.successful} successful, ${result.failed} failed`,
                    data: result
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
        this.bulkUpdateTourBookings = async (req, res) => {
            try {
                if (!req.user) {
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const { bookingIds, operation, data } = req.body;
                if (!Array.isArray(bookingIds) || bookingIds.length === 0) {
                    res.status(400).json({
                        success: false,
                        message: 'Booking IDs array is required'
                    });
                    return;
                }
                if (!operation) {
                    res.status(400).json({
                        success: false,
                        message: 'Operation is required'
                    });
                    return;
                }
                const result = await this.tourService.bulkUpdateTourBookings(bookingIds, operation, data);
                res.json({
                    success: true,
                    message: `Bulk operation completed: ${result.successful} successful, ${result.failed} failed`,
                    data: result
                });
            }
            catch (error) {
                console.error('Error in bulk booking update:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to perform bulk booking update'
                });
            }
        };
        this.tourService = new tours_service_1.TourService();
    }
}
exports.TourController = TourController;
