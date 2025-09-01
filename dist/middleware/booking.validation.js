"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateBookingCancellation = exports.validateBookingUpdate = exports.validateBooking = void 0;
const validateBooking = (req, res, next) => {
    try {
        const data = req.body;
        const errors = [];
        // Basic booking information validation
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
        if (!data.paymentTiming) {
            errors.push('Payment timing is required');
        }
        else if (!['now', 'later'].includes(data.paymentTiming)) {
            errors.push('Payment timing must be either "now" or "later"');
        }
        // Date validation
        if (data.checkIn && data.checkOut) {
            const checkInDate = new Date(data.checkIn);
            const checkOutDate = new Date(data.checkOut);
            const now = new Date();
            now.setHours(0, 0, 0, 0); // Reset time to start of day
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
            // Calculate nights and validate reasonable stay duration
            const nights = Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24));
            if (nights < 1) {
                errors.push('Minimum stay is 1 night');
            }
            if (nights > 365) {
                errors.push('Maximum stay is 365 nights');
            }
            // Check if dates are too far in the future (1 year)
            const oneYearFromNow = new Date();
            oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
            if (checkInDate > oneYearFromNow) {
                errors.push('Check-in date cannot be more than 1 year in the future');
            }
        }
        // Payment validation
        if (data.paymentTiming === 'now') {
            if (!data.paymentMethod) {
                errors.push('Payment method is required when paying now');
            }
            else {
                const validMethods = ['card', 'momo', 'airtel', 'mpesa', 'property'];
                if (!validMethods.includes(data.paymentMethod)) {
                    errors.push(`Payment method must be one of: ${validMethods.join(', ')}`);
                }
                // Validate card details for card payments
                if (data.paymentMethod === 'card') {
                    if (!data.cardDetails) {
                        errors.push('Card details are required for card payments');
                    }
                    else {
                        const { cardNumber, expiryDate, cvv, cardholderName } = data.cardDetails;
                        if (!cardNumber || cardNumber.trim().length === 0) {
                            errors.push('Card number is required');
                        }
                        else if (cardNumber.replace(/\s/g, '').length < 13 || cardNumber.replace(/\s/g, '').length > 19) {
                            errors.push('Card number must be between 13 and 19 digits');
                        }
                        else if (!/^\d+$/.test(cardNumber.replace(/\s/g, ''))) {
                            errors.push('Card number must contain only digits');
                        }
                        if (!expiryDate || expiryDate.trim().length === 0) {
                            errors.push('Expiry date is required');
                        }
                        else if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(expiryDate.trim())) {
                            errors.push('Expiry date must be in MM/YY format');
                        }
                        else {
                            // Validate expiry date is not in the past
                            const [month, year] = expiryDate.split('/');
                            const expiryDateObj = new Date(2000 + parseInt(year), parseInt(month) - 1);
                            const now = new Date();
                            now.setDate(1); // Set to first day of month for comparison
                            if (expiryDateObj < now) {
                                errors.push('Card has expired');
                            }
                        }
                        if (!cvv || cvv.trim().length === 0) {
                            errors.push('CVV is required');
                        }
                        else if (!/^\d{3,4}$/.test(cvv.trim())) {
                            errors.push('CVV must be 3 or 4 digits');
                        }
                        if (!cardholderName || cardholderName.trim().length < 2) {
                            errors.push('Cardholder name must be at least 2 characters long');
                        }
                        else if (cardholderName.trim().length > 50) {
                            errors.push('Cardholder name must be less than 50 characters');
                        }
                    }
                }
                // Validate mobile details for mobile money payments
                if (['momo', 'airtel', 'mpesa'].includes(data.paymentMethod)) {
                    if (!data.mobileDetails) {
                        errors.push('Mobile details are required for mobile money payments');
                    }
                    else {
                        const { phoneNumber } = data.mobileDetails;
                        if (!phoneNumber || phoneNumber.trim().length === 0) {
                            errors.push('Phone number is required');
                        }
                        else if (phoneNumber.trim().length < 10) {
                            errors.push('Phone number must be at least 10 characters');
                        }
                        else if (phoneNumber.trim().length > 20) {
                            errors.push('Phone number must be less than 20 characters');
                        }
                        else if (!/^\+?[\d\s\-\(\)]+$/.test(phoneNumber.trim())) {
                            errors.push('Phone number contains invalid characters');
                        }
                        // Validate country-specific formats
                        if (data.paymentMethod === 'momo' && !phoneNumber.includes('250')) {
                            errors.push('MTN Mobile Money requires a Rwandan phone number (+250)');
                        }
                        if (data.paymentMethod === 'mpesa' && !phoneNumber.includes('254')) {
                            errors.push('M-Pesa requires a Kenyan phone number (+254)');
                        }
                    }
                }
            }
        }
        // Optional message validation
        if (data.message && data.message.length > 1000) {
            errors.push('Message must be less than 1000 characters');
        }
        // Total price validation (if provided)
        if (data.totalPrice !== undefined) {
            if (typeof data.totalPrice !== 'number' || data.totalPrice <= 0) {
                errors.push('Total price must be greater than 0');
            }
            else if (data.totalPrice > 1000000) {
                errors.push('Total price cannot exceed $1,000,000');
            }
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
const validateBookingUpdate = (req, res, next) => {
    try {
        const data = req.body;
        const errors = [];
        // Validate only provided fields
        if (data.checkIn !== undefined) {
            const checkInDate = new Date(data.checkIn);
            const now = new Date();
            now.setHours(0, 0, 0, 0);
            if (isNaN(checkInDate.getTime())) {
                errors.push('Invalid check-in date format');
            }
            else if (checkInDate < now) {
                errors.push('Check-in date cannot be in the past');
            }
        }
        if (data.checkOut !== undefined) {
            const checkOutDate = new Date(data.checkOut);
            if (isNaN(checkOutDate.getTime())) {
                errors.push('Invalid check-out date format');
            }
        }
        // Cross-validate dates if both are provided
        if (data.checkIn && data.checkOut) {
            const checkInDate = new Date(data.checkIn);
            const checkOutDate = new Date(data.checkOut);
            if (checkInDate >= checkOutDate) {
                errors.push('Check-out date must be after check-in date');
            }
            const nights = Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24));
            if (nights < 1) {
                errors.push('Minimum stay is 1 night');
            }
            if (nights > 365) {
                errors.push('Maximum stay is 365 nights');
            }
        }
        if (data.guests !== undefined) {
            if (typeof data.guests !== 'number' || data.guests < 1 || data.guests > 100) {
                errors.push('Number of guests must be between 1 and 100');
            }
        }
        if (data.totalPrice !== undefined) {
            if (typeof data.totalPrice !== 'number' || data.totalPrice <= 0) {
                errors.push('Total price must be greater than 0');
            }
            else if (data.totalPrice > 1000000) {
                errors.push('Total price cannot exceed $1,000,000');
            }
        }
        if (data.message !== undefined && data.message.length > 1000) {
            errors.push('Message must be less than 1000 characters');
        }
        if (data.status !== undefined) {
            const validStatuses = ['pending', 'confirmed', 'cancelled', 'completed', 'refunded', 'disputed', 'no_show'];
            if (!validStatuses.includes(data.status)) {
                errors.push(`Status must be one of: ${validStatuses.join(', ')}`);
            }
        }
        if (errors.length > 0) {
            res.status(400).json({
                success: false,
                message: 'Booking update validation failed',
                errors
            });
            return;
        }
        next();
    }
    catch (error) {
        console.error('Booking update validation error:', error);
        res.status(500).json({
            success: false,
            message: 'Validation error',
            errors: ['Internal server error during validation']
        });
    }
};
exports.validateBookingUpdate = validateBookingUpdate;
const validateBookingCancellation = (req, res, next) => {
    try {
        const { reason } = req.body;
        const errors = [];
        if (!reason) {
            errors.push('Cancellation reason is required');
        }
        else if (typeof reason !== 'string' || reason.trim().length < 10) {
            errors.push('Cancellation reason must be at least 10 characters long');
        }
        else if (reason.length > 500) {
            errors.push('Cancellation reason must be less than 500 characters');
        }
        if (errors.length > 0) {
            res.status(400).json({
                success: false,
                message: 'Cancellation validation failed',
                errors
            });
            return;
        }
        next();
    }
    catch (error) {
        console.error('Booking cancellation validation error:', error);
        res.status(500).json({
            success: false,
            message: 'Validation error',
            errors: ['Internal server error during validation']
        });
    }
};
exports.validateBookingCancellation = validateBookingCancellation;
