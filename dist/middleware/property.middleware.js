"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateReview = exports.validateBooking = exports.validatePropertyUpdate = exports.validateProperty = void 0;
const validateProperty = (req, res, next) => {
    try {
        const data = req.body;
        const errors = [];
        // Basic property information validation
        if (!data.name || data.name.trim().length < 3) {
            errors.push('Property name must be at least 3 characters long');
        }
        if (data.name && data.name.length > 100) {
            errors.push('Property name must be less than 100 characters');
        }
        if (!data.location || data.location.trim().length < 5) {
            errors.push('Location must be at least 5 characters long');
        }
        if (!data.type) {
            errors.push('Property type is required');
        }
        else {
            const validTypes = ['apartment', 'house', 'villa', 'condo', 'townhouse', 'studio', 'loft'];
            if (!validTypes.includes(data.type.toLowerCase())) {
                errors.push(`Property type must be one of: ${validTypes.join(', ')}`);
            }
        }
        if (!data.category) {
            errors.push('Property category is required');
        }
        else {
            const validCategories = ['entire_place', 'private_room', 'shared_room'];
            if (!validCategories.includes(data.category)) {
                errors.push(`Property category must be one of: ${validCategories.join(', ')}`);
            }
        }
        // Pricing validation
        if (!data.pricePerNight || data.pricePerNight <= 0) {
            errors.push('Price per night must be greater than 0');
        }
        if (data.pricePerNight && data.pricePerNight > 10000) {
            errors.push('Price per night cannot exceed $10,000');
        }
        if (data.pricePerTwoNights && data.pricePerTwoNights <= 0) {
            errors.push('Price per two nights must be greater than 0');
        }
        // Capacity validation
        if (!data.beds || data.beds < 0 || data.beds > 50) {
            errors.push('Number of beds must be between 0 and 50');
        }
        if (!data.baths || data.baths < 1 || data.baths > 20) {
            errors.push('Number of bathrooms must be between 1 and 20');
        }
        if (!data.maxGuests || data.maxGuests < 1 || data.maxGuests > 100) {
            errors.push('Maximum guests must be between 1 and 100');
        }
        // Features validation
        if (!data.features || !Array.isArray(data.features)) {
            errors.push('Features must be an array');
        }
        else if (data.features.length === 0) {
            errors.push('At least one feature is required');
        }
        else if (data.features.length > 50) {
            errors.push('Maximum 50 features allowed');
        }
        else {
            // Validate each feature
            data.features.forEach((feature, index) => {
                if (typeof feature !== 'string' || feature.trim().length === 0) {
                    errors.push(`Feature at index ${index} must be a non-empty string`);
                }
                else if (feature.length > 50) {
                    errors.push(`Feature at index ${index} must be less than 50 characters`);
                }
            });
        }
        // Description validation (optional)
        if (data.description && data.description.length > 2000) {
            errors.push('Description must be less than 2000 characters');
        }
        // Availability dates validation
        if (!data.availabilityDates) {
            errors.push('Availability dates are required');
        }
        else {
            if (!data.availabilityDates.start) {
                errors.push('Start date is required');
            }
            if (!data.availabilityDates.end) {
                errors.push('End date is required');
            }
            if (data.availabilityDates.start && data.availabilityDates.end) {
                const startDate = new Date(data.availabilityDates.start);
                const endDate = new Date(data.availabilityDates.end);
                const now = new Date();
                if (isNaN(startDate.getTime())) {
                    errors.push('Invalid start date format');
                }
                if (isNaN(endDate.getTime())) {
                    errors.push('Invalid end date format');
                }
                if (startDate < now) {
                    errors.push('Start date cannot be in the past');
                }
                if (startDate >= endDate) {
                    errors.push('End date must be after start date');
                }
                // Check if dates are not too far in the future (e.g., 2 years)
                const twoYearsFromNow = new Date();
                twoYearsFromNow.setFullYear(twoYearsFromNow.getFullYear() + 2);
                if (endDate > twoYearsFromNow) {
                    errors.push('End date cannot be more than 2 years in the future');
                }
            }
        }
        // Images validation
        if (!data.images) {
            errors.push('Property images are required');
        }
        else {
            const imageCategories = [
                'livingRoom', 'kitchen', 'diningArea', 'bedroom', 'bathroom',
                'workspace', 'balcony', 'laundryArea', 'gym', 'exterior', 'childrenPlayroom'
            ];
            let totalImages = 0;
            let hasRequiredImages = false;
            imageCategories.forEach(category => {
                const categoryImages = data.images[category];
                if (categoryImages && Array.isArray(categoryImages)) {
                    totalImages += categoryImages.length;
                    // At least one image in key categories is required
                    if (['exterior', 'livingRoom', 'bedroom'].includes(category) && categoryImages.length > 0) {
                        hasRequiredImages = true;
                    }
                    // Validate individual image URLs
                    categoryImages.forEach((imageUrl, index) => {
                        if (typeof imageUrl !== 'string' || imageUrl.trim().length === 0) {
                            errors.push(`Image URL in ${category} at index ${index} is invalid`);
                        }
                        else if (!isValidImageUrl(imageUrl)) {
                            errors.push(`Image URL in ${category} at index ${index} is not a valid URL`);
                        }
                    });
                    // Check maximum images per category
                    if (categoryImages.length > 10) {
                        errors.push(`Maximum 10 images allowed per category (${category})`);
                    }
                }
            });
            if (!hasRequiredImages) {
                errors.push('At least one image is required in exterior, living room, or bedroom category');
            }
            if (totalImages === 0) {
                errors.push('At least one property image is required');
            }
            if (totalImages > 50) {
                errors.push('Maximum 50 total images allowed');
            }
        }
        // Video validation (optional)
        if (data.video3D && !isValidVideoUrl(data.video3D)) {
            errors.push('Invalid 3D video URL format');
        }
        // Owner details validation (optional)
        if (data.ownerDetails) {
            if (!data.ownerDetails.names || data.ownerDetails.names.trim().length < 2) {
                errors.push('Owner name must be at least 2 characters long');
            }
            if (!data.ownerDetails.email || !isValidEmail(data.ownerDetails.email)) {
                errors.push('Valid owner email is required');
            }
            if (!data.ownerDetails.phone || data.ownerDetails.phone.trim().length < 10) {
                errors.push('Owner phone number must be at least 10 characters long');
            }
            if (!data.ownerDetails.address || data.ownerDetails.address.trim().length < 10) {
                errors.push('Owner address must be at least 10 characters long');
            }
        }
        if (errors.length > 0) {
            res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors
            });
            return;
        }
        next();
    }
    catch (error) {
        console.error('Property validation error:', error);
        res.status(500).json({
            success: false,
            message: 'Validation error',
            errors: ['Internal server error during validation']
        });
    }
};
exports.validateProperty = validateProperty;
const validatePropertyUpdate = (req, res, next) => {
    try {
        const data = req.body;
        const errors = [];
        // Validate only provided fields
        if (data.name !== undefined) {
            if (typeof data.name !== 'string' || data.name.trim().length < 3) {
                errors.push('Property name must be at least 3 characters long');
            }
            else if (data.name.length > 100) {
                errors.push('Property name must be less than 100 characters');
            }
        }
        if (data.location !== undefined) {
            if (typeof data.location !== 'string' || data.location.trim().length < 5) {
                errors.push('Location must be at least 5 characters long');
            }
        }
        if (data.type !== undefined) {
            const validTypes = ['apartment', 'house', 'villa', 'condo', 'townhouse', 'studio', 'loft'];
            if (!validTypes.includes(data.type.toLowerCase())) {
                errors.push(`Property type must be one of: ${validTypes.join(', ')}`);
            }
        }
        if (data.category !== undefined) {
            const validCategories = ['entire_place', 'private_room', 'shared_room'];
            if (!validCategories.includes(data.category)) {
                errors.push(`Property category must be one of: ${validCategories.join(', ')}`);
            }
        }
        if (data.pricePerNight !== undefined) {
            if (typeof data.pricePerNight !== 'number' || data.pricePerNight <= 0) {
                errors.push('Price per night must be greater than 0');
            }
            else if (data.pricePerNight > 10000) {
                errors.push('Price per night cannot exceed $10,000');
            }
        }
        if (data.beds !== undefined) {
            if (typeof data.beds !== 'number' || data.beds < 0 || data.beds > 50) {
                errors.push('Number of beds must be between 0 and 50');
            }
        }
        if (data.baths !== undefined) {
            if (typeof data.baths !== 'number' || data.baths < 1 || data.baths > 20) {
                errors.push('Number of bathrooms must be between 1 and 20');
            }
        }
        if (data.maxGuests !== undefined) {
            if (typeof data.maxGuests !== 'number' || data.maxGuests < 1 || data.maxGuests > 100) {
                errors.push('Maximum guests must be between 1 and 100');
            }
        }
        if (data.features !== undefined) {
            if (!Array.isArray(data.features)) {
                errors.push('Features must be an array');
            }
            else if (data.features.length > 50) {
                errors.push('Maximum 50 features allowed');
            }
        }
        if (data.description !== undefined && data.description.length > 2000) {
            errors.push('Description must be less than 2000 characters');
        }
        if (data.status !== undefined) {
            const validStatuses = ['active', 'inactive', 'pending', 'suspended', 'draft'];
            if (!validStatuses.includes(data.status)) {
                errors.push(`Status must be one of: ${validStatuses.join(', ')}`);
            }
        }
        if (errors.length > 0) {
            res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors
            });
            return;
        }
        next();
    }
    catch (error) {
        console.error('Property update validation error:', error);
        res.status(500).json({
            success: false,
            message: 'Validation error',
            errors: ['Internal server error during validation']
        });
    }
};
exports.validatePropertyUpdate = validatePropertyUpdate;
const validateBooking = (req, res, next) => {
    try {
        const data = req.body;
        const errors = [];
        // Required fields validation
        if (!data.propertyId) {
            errors.push('Property ID is required');
        }
        else if (typeof data.propertyId !== 'number' || data.propertyId <= 0) {
            errors.push('Valid property ID is required');
        }
        if (!data.checkIn) {
            errors.push('Check-in date is required');
        }
        if (!data.checkOut) {
            errors.push('Check-out date is required');
        }
        if (!data.guests) {
            errors.push('Number of guests is required');
        }
        else if (typeof data.guests !== 'number' || data.guests < 1 || data.guests > 100) {
            errors.push('Number of guests must be between 1 and 100');
        }
        if (!data.totalPrice) {
            errors.push('Total price is required');
        }
        else if (typeof data.totalPrice !== 'number' || data.totalPrice <= 0) {
            errors.push('Total price must be greater than 0');
        }
        // Date validation
        if (data.checkIn && data.checkOut) {
            const checkInDate = new Date(data.checkIn);
            const checkOutDate = new Date(data.checkOut);
            const now = new Date();
            if (isNaN(checkInDate.getTime())) {
                errors.push('Invalid check-in date format');
            }
            if (isNaN(checkOutDate.getTime())) {
                errors.push('Invalid check-out date format');
            }
            if (checkInDate < now) {
                errors.push('Check-in date cannot be in the past');
            }
            if (checkInDate >= checkOutDate) {
                errors.push('Check-out date must be after check-in date');
            }
            // Minimum stay of 1 night
            const daysDifference = (checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 3600 * 24);
            if (daysDifference < 1) {
                errors.push('Minimum stay is 1 night');
            }
            // Maximum stay of 365 days
            if (daysDifference > 365) {
                errors.push('Maximum stay is 365 nights');
            }
        }
        // Optional message validation
        if (data.message && data.message.length > 500) {
            errors.push('Message must be less than 500 characters');
        }
        if (errors.length > 0) {
            res.status(400).json({
                success: false,
                message: 'Booking validation failed',
                errors
            });
            return;
        }
        next();
    }
    catch (error) {
        console.error('Booking validation error:', error);
        res.status(500).json({
            success: false,
            message: 'Validation error',
            errors: ['Internal server error during validation']
        });
    }
};
exports.validateBooking = validateBooking;
const validateReview = (req, res, next) => {
    try {
        const data = req.body;
        const errors = [];
        // Required fields validation
        if (!data.propertyId) {
            errors.push('Property ID is required');
        }
        else if (typeof data.propertyId !== 'number' || data.propertyId <= 0) {
            errors.push('Valid property ID is required');
        }
        if (!data.rating) {
            errors.push('Rating is required');
        }
        else if (typeof data.rating !== 'number' || data.rating < 1 || data.rating > 5) {
            errors.push('Rating must be between 1 and 5');
        }
        if (!data.comment) {
            errors.push('Comment is required');
        }
        else if (typeof data.comment !== 'string' || data.comment.trim().length < 10) {
            errors.push('Comment must be at least 10 characters long');
        }
        else if (data.comment.length > 1000) {
            errors.push('Comment must be less than 1000 characters');
        }
        // Optional images validation
        if (data.images) {
            if (!Array.isArray(data.images)) {
                errors.push('Images must be an array');
            }
            else if (data.images.length > 10) {
                errors.push('Maximum 10 images allowed');
            }
            else {
                data.images.forEach((imageUrl, index) => {
                    if (typeof imageUrl !== 'string' || !isValidImageUrl(imageUrl)) {
                        errors.push(`Image URL at index ${index} is invalid`);
                    }
                });
            }
        }
        if (errors.length > 0) {
            res.status(400).json({
                success: false,
                message: 'Review validation failed',
                errors
            });
            return;
        }
        next();
    }
    catch (error) {
        console.error('Review validation error:', error);
        res.status(500).json({
            success: false,
            message: 'Validation error',
            errors: ['Internal server error during validation']
        });
    }
};
exports.validateReview = validateReview;
// --- UTILITY FUNCTIONS ---
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}
function isValidImageUrl(url) {
    try {
        const urlObj = new URL(url);
        const protocol = urlObj.protocol;
        const pathname = urlObj.pathname.toLowerCase();
        // Check if it's a valid HTTP/HTTPS URL
        if (protocol !== 'http:' && protocol !== 'https:') {
            return false;
        }
        // Check if the URL ends with a valid image extension
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'];
        const hasImageExtension = imageExtensions.some(ext => pathname.endsWith(ext));
        return hasImageExtension || pathname.includes('/images/') || pathname.includes('/media/');
    }
    catch {
        return false;
    }
}
function isValidVideoUrl(url) {
    try {
        const urlObj = new URL(url);
        const protocol = urlObj.protocol;
        const pathname = urlObj.pathname.toLowerCase();
        // Check if it's a valid HTTP/HTTPS URL
        if (protocol !== 'http:' && protocol !== 'https:') {
            return false;
        }
        // Check if the URL ends with a valid video extension
        const videoExtensions = ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv'];
        const hasVideoExtension = videoExtensions.some(ext => pathname.endsWith(ext));
        return hasVideoExtension || pathname.includes('/videos/') || pathname.includes('/media/');
    }
    catch {
        return false;
    }
}
