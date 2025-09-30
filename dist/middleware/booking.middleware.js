"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimitBookingCreation = exports.validateGuest = exports.validateTourGuide = exports.validatePagination = exports.validateDateFilters = exports.validateWishlistFilters = exports.validateWishlistItem = exports.validateBookingAccess = exports.validateAgentBooking = exports.validateAgent = exports.validateBookingUpdate = exports.validateTourBooking = exports.validatePropertyBooking = void 0;
// Validate property booking creation
const validatePropertyBooking = (req, res, next) => {
    const data = req.body;
    const errors = [];
    // Required fields validation
    if (!data.propertyId) {
        errors.push('Property ID is required');
    }
    else if (isNaN(Number(data.propertyId)) || data.propertyId < 1) {
        errors.push('Property ID must be a valid positive number');
    }
    if (!data.checkIn) {
        errors.push('Check-in date is required');
    }
    else {
        const checkInDate = new Date(data.checkIn);
        if (isNaN(checkInDate.getTime())) {
            errors.push('Check-in date must be a valid date');
        }
        else if (checkInDate < new Date()) {
            errors.push('Check-in date cannot be in the past');
        }
    }
    if (!data.checkOut) {
        errors.push('Check-out date is required');
    }
    else {
        const checkOutDate = new Date(data.checkOut);
        if (isNaN(checkOutDate.getTime())) {
            errors.push('Check-out date must be a valid date');
        }
        else if (data.checkIn && checkOutDate <= new Date(data.checkIn)) {
            errors.push('Check-out date must be after check-in date');
        }
    }
    if (!data.guests) {
        errors.push('Number of guests is required');
    }
    else if (data.guests < 1 || data.guests > 20) {
        errors.push('Number of guests must be between 1 and 20');
    }
    // Optional field validation
    if (data.message && data.message.length > 500) {
        errors.push('Message must be less than 500 characters');
    }
    if (data.specialRequests && data.specialRequests.length > 1000) {
        errors.push('Special requests must be less than 1000 characters');
    }
    // Agent booking validation
    if (data.clientId) {
        if (req.user?.userType !== 'agent') {
            errors.push('Only agents can book for clients');
        }
        else if (isNaN(Number(data.clientId)) || data.clientId < 1) {
            errors.push('Client ID must be a valid positive number');
        }
    }
    // Validate minimum stay duration
    if (data.checkIn && data.checkOut) {
        const checkInDate = new Date(data.checkIn);
        const checkOutDate = new Date(data.checkOut);
        const nights = Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24));
        if (nights < 1) {
            errors.push('Booking must be for at least 1 night');
        }
        else if (nights > 365) {
            errors.push('Booking cannot exceed 365 nights');
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
exports.validatePropertyBooking = validatePropertyBooking;
// Validate tour booking creation
const validateTourBooking = (req, res, next) => {
    const data = req.body;
    const errors = [];
    // Required fields validation
    if (!data.tourId) {
        errors.push('Tour ID is required');
    }
    else if (typeof data.tourId !== 'string' || data.tourId.trim().length === 0) {
        errors.push('Tour ID must be a valid string');
    }
    if (!data.scheduleId) {
        errors.push('Schedule ID is required');
    }
    else if (typeof data.scheduleId !== 'string' || data.scheduleId.trim().length === 0) {
        errors.push('Schedule ID must be a valid string');
    }
    if (!data.numberOfParticipants) {
        errors.push('Number of participants is required');
    }
    else if (data.numberOfParticipants < 1 || data.numberOfParticipants > 50) {
        errors.push('Number of participants must be between 1 and 50');
    }
    if (!data.participants) {
        errors.push('Participants information is required');
    }
    else if (!Array.isArray(data.participants)) {
        errors.push('Participants must be an array');
    }
    else if (data.participants.length !== data.numberOfParticipants) {
        errors.push('Number of participants must match participants array length');
    }
    else {
        // Validate each participant
        data.participants.forEach((participant, index) => {
            if (!participant.name || participant.name.trim().length === 0) {
                errors.push(`Participant ${index + 1}: Name is required`);
            }
            else if (participant.name.length > 100) {
                errors.push(`Participant ${index + 1}: Name must be less than 100 characters`);
            }
            if (participant.age === undefined || participant.age === null) {
                errors.push(`Participant ${index + 1}: Age is required`);
            }
            else if (participant.age < 0 || participant.age > 120) {
                errors.push(`Participant ${index + 1}: Age must be between 0 and 120`);
            }
            if (participant.email && !isValidEmail(participant.email)) {
                errors.push(`Participant ${index + 1}: Invalid email format`);
            }
            if (participant.phone && participant.phone.length > 20) {
                errors.push(`Participant ${index + 1}: Phone number must be less than 20 characters`);
            }
            if (participant.emergencyContact) {
                if (!participant.emergencyContact.name || participant.emergencyContact.name.trim().length === 0) {
                    errors.push(`Participant ${index + 1}: Emergency contact name is required`);
                }
                if (!participant.emergencyContact.phone || participant.emergencyContact.phone.trim().length === 0) {
                    errors.push(`Participant ${index + 1}: Emergency contact phone is required`);
                }
                if (!participant.emergencyContact.relationship || participant.emergencyContact.relationship.trim().length === 0) {
                    errors.push(`Participant ${index + 1}: Emergency contact relationship is required`);
                }
            }
        });
    }
    // Optional field validation
    if (data.specialRequests && data.specialRequests.length > 1000) {
        errors.push('Special requests must be less than 1000 characters');
    }
    // Agent booking validation
    if (data.clientId) {
        if (req.user?.userType !== 'agent') {
            errors.push('Only agents can book for clients');
        }
        else if (isNaN(Number(data.clientId)) || data.clientId < 1) {
            errors.push('Client ID must be a valid positive number');
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
exports.validateTourBooking = validateTourBooking;
// Fixed validateBookingUpdate function
const validateBookingUpdate = (req, res, next) => {
    const data = req.body;
    const errors = [];
    // Validate status if provided
    if ('status' in data && data.status) {
        const propertyStatuses = ['pending', 'confirmed', 'cancelled', 'completed', 'refunded'];
        const tourStatuses = ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'refunded', 'no_show'];
        // Check if it's a valid status (assuming we can't determine type here)
        if (!propertyStatuses.includes(data.status) &&
            !tourStatuses.includes(data.status)) {
            errors.push('Invalid status provided');
        }
    }
    // Validate check-in status for tour bookings
    if ('checkInStatus' in data && data.checkInStatus) {
        const validCheckInStatuses = ['not_checked_in', 'checked_in', 'checked_out', 'no_show'];
        if (!validCheckInStatuses.includes(data.checkInStatus)) {
            errors.push('Invalid check-in status provided');
        }
    }
    // Validate text fields using 'in' operator to check property existence
    if ('message' in data && data.message && data.message.length > 500) {
        errors.push('Message must be less than 500 characters');
    }
    if ('specialRequests' in data && data.specialRequests && data.specialRequests.length > 1000) {
        errors.push('Special requests must be less than 1000 characters');
    }
    if ('guestNotes' in data && data.guestNotes && data.guestNotes.length > 1000) {
        errors.push('Guest notes must be less than 1000 characters');
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
// Validate agent permissions
const validateAgent = (req, res, next) => {
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
    next();
};
exports.validateAgent = validateAgent;
// Validate agent booking creation
const validateAgentBooking = (req, res, next) => {
    const data = req.body;
    const errors = [];
    // Required fields validation
    if (!data.type) {
        errors.push('Booking type is required');
    }
    else if (!['property', 'tour'].includes(data.type)) {
        errors.push('Booking type must be either "property" or "tour"');
    }
    if (!data.clientId) {
        errors.push('Client ID is required');
    }
    else if (isNaN(Number(data.clientId)) || data.clientId < 1) {
        errors.push('Client ID must be a valid positive number');
    }
    if (!data.bookingData) {
        errors.push('Booking data is required');
    }
    else if (typeof data.bookingData !== 'object') {
        errors.push('Booking data must be an object');
    }
    // Validate commission rate
    if (data.commissionRate !== undefined) {
        if (typeof data.commissionRate !== 'number') {
            errors.push('Commission rate must be a number');
        }
        else if (data.commissionRate < 0 || data.commissionRate > 1) {
            errors.push('Commission rate must be between 0 and 1');
        }
    }
    // Validate notes
    if (data.notes && data.notes.length > 1000) {
        errors.push('Notes must be less than 1000 characters');
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
exports.validateAgentBooking = validateAgentBooking;
// Validate booking access permissions
const validateBookingAccess = (req, res, next) => {
    if (!req.user) {
        res.status(401).json({
            success: false,
            message: 'Authentication required'
        });
        return;
    }
    const bookingId = req.params.bookingId;
    if (!bookingId) {
        res.status(400).json({
            success: false,
            message: 'Booking ID is required'
        });
        return;
    }
    // Additional validation could be added here to check if user has access to specific booking
    // For now, we'll let the service layer handle the access control
    next();
};
exports.validateBookingAccess = validateBookingAccess;
// Validate wishlist item
const validateWishlistItem = (req, res, next) => {
    const { type, itemId } = req.body;
    const errors = [];
    if (!type) {
        errors.push('Item type is required');
    }
    else if (!['property', 'tour'].includes(type)) {
        errors.push('Item type must be either "property" or "tour"');
    }
    if (!itemId) {
        errors.push('Item ID is required');
    }
    else {
        if (type === 'property') {
            if (isNaN(Number(itemId)) || itemId < 1) {
                errors.push('Property ID must be a valid positive number');
            }
        }
        else if (type === 'tour') {
            if (typeof itemId !== 'string' || itemId.trim().length === 0) {
                errors.push('Tour ID must be a valid string');
            }
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
exports.validateWishlistItem = validateWishlistItem;
const validateWishlistFilters = (req, res, next) => {
    const { type, minPrice, maxPrice, page, limit } = req.query;
    const errors = [];
    if (type && !['property', 'tour'].includes(type)) {
        errors.push('Type filter must be either "property" or "tour"');
    }
    if (minPrice && (isNaN(Number(minPrice)) || Number(minPrice) < 0)) {
        errors.push('Minimum price must be a valid positive number');
    }
    if (maxPrice && (isNaN(Number(maxPrice)) || Number(maxPrice) < 0)) {
        errors.push('Maximum price must be a valid positive number');
    }
    if (minPrice && maxPrice && Number(minPrice) > Number(maxPrice)) {
        errors.push('Minimum price cannot be greater than maximum price');
    }
    if (page && (isNaN(Number(page)) || Number(page) < 1)) {
        errors.push('Page must be a valid positive number');
    }
    if (limit && (isNaN(Number(limit)) || Number(limit) < 1 || Number(limit) > 100)) {
        errors.push('Limit must be a valid number between 1 and 100');
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
exports.validateWishlistFilters = validateWishlistFilters;
// Validate date filters
const validateDateFilters = (req, res, next) => {
    const { checkInDate, checkOutDate, tourDate } = req.query;
    const errors = [];
    if (checkInDate && isNaN(new Date(checkInDate).getTime())) {
        errors.push('Invalid check-in date format');
    }
    if (checkOutDate && isNaN(new Date(checkOutDate).getTime())) {
        errors.push('Invalid check-out date format');
    }
    if (tourDate && isNaN(new Date(tourDate).getTime())) {
        errors.push('Invalid tour date format');
    }
    if (checkInDate && checkOutDate) {
        const checkIn = new Date(checkInDate);
        const checkOut = new Date(checkOutDate);
        if (checkIn >= checkOut) {
            errors.push('Check-out date must be after check-in date');
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
exports.validateDateFilters = validateDateFilters;
// Validate pagination parameters
const validatePagination = (req, res, next) => {
    const { page, limit } = req.query;
    const errors = [];
    if (page && (isNaN(Number(page)) || Number(page) < 1)) {
        errors.push('Page must be a positive number');
    }
    if (limit && (isNaN(Number(limit)) || Number(limit) < 1 || Number(limit) > 100)) {
        errors.push('Limit must be a positive number between 1 and 100');
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
exports.validatePagination = validatePagination;
// Validate tour guide permissions
const validateTourGuide = (req, res, next) => {
    if (!req.user) {
        res.status(401).json({
            success: false,
            message: 'Authentication required'
        });
        return;
    }
    if (req.user.userType !== 'tourguide') {
        res.status(403).json({
            success: false,
            message: 'Tour guide access required'
        });
        return;
    }
    next();
};
exports.validateTourGuide = validateTourGuide;
// Validate guest permissions
const validateGuest = (req, res, next) => {
    if (!req.user) {
        res.status(401).json({
            success: false,
            message: 'Authentication required'
        });
        return;
    }
    if (req.user.userType !== 'guest') {
        res.status(403).json({
            success: false,
            message: 'Guest access required'
        });
        return;
    }
    next();
};
exports.validateGuest = validateGuest;
// Rate limiting for booking creation (basic implementation)
const rateLimitBookingCreation = (req, res, next) => {
    // This would typically use Redis or similar for production
    // For now, this is a placeholder that could be implemented based on requirements
    // You could implement rate limiting based on:
    // - User ID (max bookings per hour/day)
    // - IP address
    // - Booking type
    // Example: Max 10 bookings per hour per user
    // const userId = req.user?.userId;
    // Check against rate limit store
    next();
};
exports.rateLimitBookingCreation = rateLimitBookingCreation;
// Helper function to validate email format
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}
// Helper function to validate phone number format
function isValidPhoneNumber(phone) {
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    return phoneRegex.test(phone.replace(/[\s\-\(\)]/g, ''));
}
