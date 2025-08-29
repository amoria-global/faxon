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
                    res.status(401).json({
                        success: false,
                        message: 'Authentication required'
                    });
                    return;
                }
                const userId = parseInt(req.user.userId);
                const reviewData = req.body;
                // Validate required fields
                if (!reviewData.propertyId || !reviewData.rating || !reviewData.comment) {
                    res.status(400).json({
                        success: false,
                        message: 'Property ID, rating, and comment are required'
                    });
                    return;
                }
                // Validate rating
                if (reviewData.rating < 1 || reviewData.rating > 5) {
                    res.status(400).json({
                        success: false,
                        message: 'Rating must be between 1 and 5'
                    });
                    return;
                }
                const review = await this.propertyService.createReview(userId, reviewData);
                res.status(201).json({
                    success: true,
                    message: 'Review created successfully',
                    data: review
                });
            }
            catch (error) {
                console.error('Error creating review:', error);
                res.status(400).json({
                    success: false,
                    message: error.message || 'Failed to create review'
                });
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
        this.propertyService = new property_service_1.PropertyService();
    }
}
exports.PropertyController = PropertyController;
