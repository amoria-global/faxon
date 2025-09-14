"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateAgentClientAccess = exports.validateAgentBooking = exports.validateAgentPropertyEdit = exports.validateAgentPropertyAccess = exports.validateAgent = exports.cacheMiddleware = exports.rateLimitExpensiveOperations = exports.validateBulkOperation = exports.validateImageUpload = exports.validateDateBlocking = exports.validateAvailability = exports.validatePricing = exports.validatePropertyStatus = exports.validateBookingUpdate = exports.validateHost = exports.validateProperty = void 0;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
// Validate property creation/update data
const validateProperty = (req, res, next) => {
    const data = req.body;
    const errors = [];
    // Required fields validation
    if (!data.name || data.name.trim().length === 0) {
        errors.push('Property name is required');
    }
    else if (data.name.length > 200) {
        errors.push('Property name must be less than 200 characters');
    }
    if (!data.location || data.location.trim().length === 0) {
        errors.push('Property location is required');
    }
    if (!data.type || data.type.trim().length === 0) {
        errors.push('Property type is required');
    }
    if (!data.category || data.category.trim().length === 0) {
        errors.push('Property category is required');
    }
    // Validate pricing
    if (!data.pricePerNight || data.pricePerNight <= 0) {
        errors.push('Price per night must be greater than 0');
    }
    else if (data.pricePerNight > 10000) {
        errors.push('Price per night seems too high (max: $10,000)');
    }
    if (data.pricePerTwoNights && data.pricePerTwoNights <= 0) {
        errors.push('Price per two nights must be greater than 0 if provided');
    }
    // Validate capacity
    if (!data.beds || data.beds < 0 || data.beds > 50) {
        errors.push('Number of beds must be between 0 and 50');
    }
    if (!data.baths || data.baths < 1 || data.baths > 20) {
        errors.push('Number of bathrooms must be between 1 and 20');
    }
    if (!data.maxGuests || data.maxGuests < 1 || data.maxGuests > 100) {
        errors.push('Maximum guests must be between 1 and 100');
    }
    // Validate features
    if (data.features && !Array.isArray(data.features)) {
        errors.push('Features must be an array');
    }
    // Validate availability dates
    if (!data.availabilityDates || !data.availabilityDates.start || !data.availabilityDates.end) {
        errors.push('Availability dates (start and end) are required');
    }
    else {
        const startDate = new Date(data.availabilityDates.start);
        const endDate = new Date(data.availabilityDates.end);
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            errors.push('Invalid availability dates provided');
        }
        else if (startDate >= endDate) {
            errors.push('End date must be after start date');
        }
        else if (startDate < new Date()) {
            errors.push('Start date cannot be in the past');
        }
    }
    // Validate description length
    if (data.description && data.description.length > 2000) {
        errors.push('Description must be less than 2000 characters');
    }
    // Validate images object structure
    if (data.images && typeof data.images !== 'object') {
        errors.push('Images must be an object with category arrays');
    }
    // Validate video URL if provided
    if (data.video3D && typeof data.video3D !== 'string') {
        errors.push('Video URL must be a string');
    }
    if (errors.length > 0) {
        res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: errors
        });
        return;
    }
    next();
};
exports.validateProperty = validateProperty;
// Validate that user is a host
const validateHost = (req, res, next) => {
    if (!req.user) {
        res.status(401).json({
            success: false,
            message: 'Authentication required'
        });
        return;
    }
    // Check if user type is host (if userType is available)
    if (req.user.userType && req.user.userType !== 'host') {
        res.status(403).json({
            success: false,
            message: 'Host access required'
        });
        return;
    }
    next();
};
exports.validateHost = validateHost;
// Validate booking update data
const validateBookingUpdate = (req, res, next) => {
    const data = req.body;
    const errors = [];
    // Validate status if provided
    if (data.status) {
        const validStatuses = ['pending', 'confirmed', 'cancelled', 'completed', 'refunded'];
        if (!validStatuses.includes(data.status)) {
            errors.push(`Invalid booking status. Valid options: ${validStatuses.join(', ')}`);
        }
    }
    // Validate text fields length
    if (data.notes && data.notes.length > 1000) {
        errors.push('Notes must be less than 1000 characters');
    }
    if (data.specialRequests && data.specialRequests.length > 500) {
        errors.push('Special requests must be less than 500 characters');
    }
    if (data.checkInInstructions && data.checkInInstructions.length > 1000) {
        errors.push('Check-in instructions must be less than 1000 characters');
    }
    if (data.checkOutInstructions && data.checkOutInstructions.length > 1000) {
        errors.push('Check-out instructions must be less than 1000 characters');
    }
    if (errors.length > 0) {
        res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: errors
        });
        return;
    }
    next();
};
exports.validateBookingUpdate = validateBookingUpdate;
// Validate property status updates
const validatePropertyStatus = (req, res, next) => {
    const { status } = req.body;
    if (!status) {
        res.status(400).json({
            success: false,
            message: 'Status is required'
        });
        return;
    }
    const validStatuses = ['active', 'inactive', 'pending', 'suspended', 'draft'];
    if (!validStatuses.includes(status)) {
        res.status(400).json({
            success: false,
            message: `Invalid status. Valid options: ${validStatuses.join(', ')}`
        });
        return;
    }
    next();
};
exports.validatePropertyStatus = validatePropertyStatus;
// Validate pricing updates
const validatePricing = (req, res, next) => {
    const { pricePerNight, pricePerTwoNights } = req.body;
    const errors = [];
    if (!pricePerNight) {
        errors.push('Price per night is required');
    }
    else if (typeof pricePerNight !== 'number' || pricePerNight <= 0) {
        errors.push('Price per night must be a positive number');
    }
    else if (pricePerNight > 10000) {
        errors.push('Price per night seems too high (max: $10,000)');
    }
    if (pricePerTwoNights && (typeof pricePerTwoNights !== 'number' || pricePerTwoNights <= 0)) {
        errors.push('Price per two nights must be a positive number if provided');
    }
    if (errors.length > 0) {
        res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: errors
        });
        return;
    }
    next();
};
exports.validatePricing = validatePricing;
// Validate availability dates
const validateAvailability = (req, res, next) => {
    const { availableFrom, availableTo } = req.body;
    const errors = [];
    if (!availableFrom || !availableTo) {
        errors.push('Both availableFrom and availableTo dates are required');
    }
    else {
        const startDate = new Date(availableFrom);
        const endDate = new Date(availableTo);
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            errors.push('Invalid dates provided');
        }
        else if (startDate >= endDate) {
            errors.push('End date must be after start date');
        }
        else if (startDate < new Date()) {
            errors.push('Start date cannot be in the past');
        }
    }
    if (errors.length > 0) {
        res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: errors
        });
        return;
    }
    next();
};
exports.validateAvailability = validateAvailability;
// Validate date blocking
const validateDateBlocking = (req, res, next) => {
    const { startDate, endDate, reason } = req.body;
    const errors = [];
    if (!startDate || !endDate) {
        errors.push('Both start date and end date are required');
    }
    else {
        const start = new Date(startDate);
        const end = new Date(endDate);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            errors.push('Invalid dates provided');
        }
        else if (start >= end) {
            errors.push('End date must be after start date');
        }
        else if (start < new Date()) {
            errors.push('Start date cannot be in the past');
        }
    }
    if (reason && typeof reason !== 'string') {
        errors.push('Reason must be a string');
    }
    else if (reason && reason.length > 200) {
        errors.push('Reason must be less than 200 characters');
    }
    if (errors.length > 0) {
        res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: errors
        });
        return;
    }
    next();
};
exports.validateDateBlocking = validateDateBlocking;
// Validate image upload data
const validateImageUpload = (req, res, next) => {
    const { category, imageUrls } = req.body;
    const errors = [];
    if (!category) {
        errors.push('Image category is required');
    }
    if (!imageUrls || !Array.isArray(imageUrls)) {
        errors.push('Image URLs must be provided as an array');
    }
    else if (imageUrls.length === 0) {
        errors.push('At least one image URL is required');
    }
    else if (imageUrls.length > 10) {
        errors.push('Maximum 10 images can be uploaded at once');
    }
    else {
        // Validate URL format (basic validation)
        const urlPattern = /^https?:\/\/.+/;
        const invalidUrls = imageUrls.filter(url => !urlPattern.test(url));
        if (invalidUrls.length > 0) {
            errors.push('All image URLs must be valid HTTP/HTTPS URLs');
        }
    }
    if (errors.length > 0) {
        res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: errors
        });
        return;
    }
    next();
};
exports.validateImageUpload = validateImageUpload;
// Validate bulk operations
const validateBulkOperation = (req, res, next) => {
    const { bookingIds, updates } = req.body;
    const errors = [];
    if (!Array.isArray(bookingIds) || bookingIds.length === 0) {
        errors.push('Booking IDs array is required and cannot be empty');
    }
    else if (bookingIds.length > 50) {
        errors.push('Maximum 50 bookings can be updated at once');
    }
    if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
        errors.push('Updates object is required and cannot be empty');
    }
    if (errors.length > 0) {
        res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: errors
        });
        return;
    }
    next();
};
exports.validateBulkOperation = validateBulkOperation;
// Rate limiting middleware for expensive operations
const rateLimitExpensiveOperations = (req, res, next) => {
    // This would typically use a proper rate limiting library like express-rate-limit
    // For now, this is a placeholder that could be implemented based on specific requirements
    // You could implement rate limiting based on:
    // - User ID
    // - IP address
    // - Operation type
    // - Time windows
    next();
};
exports.rateLimitExpensiveOperations = rateLimitExpensiveOperations;
// Cache middleware for frequently accessed data
const cacheMiddleware = (duration = 300) => {
    return (req, res, next) => {
        // This would typically use Redis or another caching solution
        // For now, this is a placeholder
        // Set cache headers
        res.set('Cache-Control', `public, max-age=${duration}`);
        next();
    };
};
exports.cacheMiddleware = cacheMiddleware;
// Validate that user is an agent
const validateAgent = (req, res, next) => {
    if (!req.user) {
        res.status(401).json({
            success: false,
            message: 'Authentication required'
        });
        return;
    }
    // Check if user type is agent
    if (req.user.userType && req.user.userType !== 'agent') {
        res.status(403).json({
            success: false,
            message: 'Agent access required'
        });
        return;
    }
    next();
};
exports.validateAgent = validateAgent;
// Validate that agent has access to the specific property
const validateAgentPropertyAccess = async (req, res, next) => {
    try {
        if (!req.user) {
            res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
            return;
        }
        const propertyId = parseInt(req.params.id);
        const agentId = parseInt(req.user.userId);
        if (isNaN(propertyId)) {
            res.status(400).json({
                success: false,
                message: 'Invalid property ID'
            });
            return;
        }
        // Check if agent has access to this property through their clients
        const hasAccess = await prisma.agentBooking.findFirst({
            where: {
                agentId,
                bookingType: 'property'
            },
            include: {
                client: {
                    include: {
                        properties: {
                            where: { id: propertyId }
                        }
                    }
                }
            }
        });
        // Alternative check: verify if the property belongs to one of agent's clients
        const property = await prisma.property.findFirst({
            where: {
                id: propertyId,
                host: {
                    clientBookings: {
                        some: {
                            agentId: agentId
                        }
                    }
                }
            }
        });
        if (!hasAccess && !property) {
            res.status(403).json({
                success: false,
                message: 'Access denied. Property not associated with your clients.'
            });
            return;
        }
        next();
    }
    catch (error) {
        console.error('Error validating agent property access:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to validate property access'
        });
    }
};
exports.validateAgentPropertyAccess = validateAgentPropertyAccess;
// Validate agent property edit permissions (limited fields only)
const validateAgentPropertyEdit = (req, res, next) => {
    const updateData = req.body;
    const errors = [];
    // Define fields that agents are allowed to edit (limited access)
    const allowedFields = [
        'description',
        'features',
        'pricePerNight',
        'pricePerTwoNights',
        'availabilityDates',
        'images', // limited to adding/updating images
        'maxStay',
        'minStay'
    ];
    // Define fields that agents are NOT allowed to edit
    const restrictedFields = [
        'name',
        'location',
        'type',
        'category',
        'beds',
        'baths',
        'maxGuests',
        'status',
        'hostId',
        'ownerDetails',
        'isVerified',
        'isInstantBook'
    ];
    // Check if agent is trying to edit restricted fields
    const attemptedRestrictedFields = Object.keys(updateData).filter(field => restrictedFields.includes(field));
    if (attemptedRestrictedFields.length > 0) {
        errors.push(`Agents cannot edit these fields: ${attemptedRestrictedFields.join(', ')}`);
    }
    // Check if agent is only editing allowed fields
    const attemptedFields = Object.keys(updateData);
    const invalidFields = attemptedFields.filter(field => !allowedFields.includes(field) && !restrictedFields.includes(field));
    if (invalidFields.length > 0) {
        errors.push(`Invalid fields: ${invalidFields.join(', ')}`);
    }
    // Validate pricing if being updated
    if (updateData.pricePerNight !== undefined) {
        if (typeof updateData.pricePerNight !== 'number' || updateData.pricePerNight <= 0) {
            errors.push('Price per night must be a positive number');
        }
        else if (updateData.pricePerNight > 10000) {
            errors.push('Price per night seems too high (max: $10,000)');
        }
    }
    if (updateData.pricePerTwoNights !== undefined) {
        if (typeof updateData.pricePerTwoNights !== 'number' || updateData.pricePerTwoNights <= 0) {
            errors.push('Price per two nights must be a positive number');
        }
    }
    // Validate availability dates if being updated
    if (updateData.availabilityDates) {
        const { start, end } = updateData.availabilityDates;
        if (!start || !end) {
            errors.push('Both start and end dates are required for availability');
        }
        else {
            const startDate = new Date(start);
            const endDate = new Date(end);
            if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
                errors.push('Invalid availability dates provided');
            }
            else if (startDate >= endDate) {
                errors.push('End date must be after start date');
            }
            else if (startDate < new Date()) {
                errors.push('Start date cannot be in the past');
            }
        }
    }
    // Validate stay duration limits
    if (updateData.minStay !== undefined) {
        if (typeof updateData.minStay !== 'number' || updateData.minStay < 1 || updateData.minStay > 365) {
            errors.push('Minimum stay must be between 1 and 365 days');
        }
    }
    if (updateData.maxStay !== undefined) {
        if (typeof updateData.maxStay !== 'number' || updateData.maxStay < 1 || updateData.maxStay > 365) {
            errors.push('Maximum stay must be between 1 and 365 days');
        }
        if (updateData.minStay && updateData.maxStay < updateData.minStay) {
            errors.push('Maximum stay cannot be less than minimum stay');
        }
    }
    // Validate features array
    if (updateData.features !== undefined) {
        if (!Array.isArray(updateData.features)) {
            errors.push('Features must be an array');
        }
        else if (updateData.features.length > 20) {
            errors.push('Maximum 20 features allowed');
        }
    }
    // Validate description length
    if (updateData.description !== undefined) {
        if (typeof updateData.description !== 'string') {
            errors.push('Description must be a string');
        }
        else if (updateData.description.length > 2000) {
            errors.push('Description must be less than 2000 characters');
        }
    }
    if (errors.length > 0) {
        res.status(400).json({
            success: false,
            message: 'Agent property edit validation failed',
            errors: errors
        });
        return;
    }
    next();
};
exports.validateAgentPropertyEdit = validateAgentPropertyEdit;
// Validate agent booking creation
const validateAgentBooking = (req, res, next) => {
    const bookingData = req.body;
    const errors = [];
    // Required fields for agent bookings
    const requiredFields = ['propertyId', 'clientId', 'checkIn', 'checkOut', 'guests', 'totalPrice'];
    const missingFields = requiredFields.filter(field => !bookingData[field]);
    if (missingFields.length > 0) {
        errors.push(`Missing required fields: ${missingFields.join(', ')}`);
    }
    // Validate dates
    if (bookingData.checkIn && bookingData.checkOut) {
        const checkIn = new Date(bookingData.checkIn);
        const checkOut = new Date(bookingData.checkOut);
        if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime())) {
            errors.push('Invalid dates provided');
        }
        else if (checkIn >= checkOut) {
            errors.push('Check-out date must be after check-in date');
        }
        else if (checkIn < new Date()) {
            errors.push('Check-in date cannot be in the past');
        }
    }
    // Validate guest count
    if (bookingData.guests !== undefined) {
        if (typeof bookingData.guests !== 'number' || bookingData.guests < 1 || bookingData.guests > 50) {
            errors.push('Number of guests must be between 1 and 50');
        }
    }
    // Validate total price
    if (bookingData.totalPrice !== undefined) {
        if (typeof bookingData.totalPrice !== 'number' || bookingData.totalPrice <= 0) {
            errors.push('Total price must be a positive number');
        }
    }
    // Validate client ID
    if (bookingData.clientId !== undefined) {
        if (typeof bookingData.clientId !== 'number' || bookingData.clientId <= 0) {
            errors.push('Valid client ID is required');
        }
    }
    if (errors.length > 0) {
        res.status(400).json({
            success: false,
            message: 'Agent booking validation failed',
            errors: errors
        });
        return;
    }
    next();
};
exports.validateAgentBooking = validateAgentBooking;
// Validate agent client relationship
const validateAgentClientAccess = async (req, res, next) => {
    try {
        if (!req.user) {
            res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
            return;
        }
        const clientId = parseInt(req.params.clientId);
        const agentId = parseInt(req.user.userId);
        if (isNaN(clientId)) {
            res.status(400).json({
                success: false,
                message: 'Invalid client ID'
            });
            return;
        }
        // Check if agent has relationship with this client
        const agentClientRelation = await prisma.agentBooking.findFirst({
            where: {
                agentId,
                clientId,
                status: 'active'
            }
        });
        if (!agentClientRelation) {
            res.status(403).json({
                success: false,
                message: 'Access denied. Client not associated with your account.'
            });
            return;
        }
        next();
    }
    catch (error) {
        console.error('Error validating agent client access:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to validate client access'
        });
    }
};
exports.validateAgentClientAccess = validateAgentClientAccess;
