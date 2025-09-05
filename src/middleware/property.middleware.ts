import { Request, Response, NextFunction } from 'express';
import { 
  CreatePropertyDto, 
  PropertyStatus, 
  BookingStatus,
  BookingUpdateDto
} from '../types/property.types';

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
    userType?: string;
  };
}

// Validate property creation/update data
export const validateProperty = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const data: CreatePropertyDto = req.body;
  const errors: string[] = [];

  // Required fields validation
  if (!data.name || data.name.trim().length === 0) {
    errors.push('Property name is required');
  } else if (data.name.length > 200) {
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
  } else if (data.pricePerNight > 10000) {
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
  } else {
    const startDate = new Date(data.availabilityDates.start);
    const endDate = new Date(data.availabilityDates.end);
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      errors.push('Invalid availability dates provided');
    } else if (startDate >= endDate) {
      errors.push('End date must be after start date');
    } else if (startDate < new Date()) {
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

// Validate that user is a host
export const validateHost = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
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

// Validate booking update data
export const validateBookingUpdate = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const data: BookingUpdateDto = req.body;
  const errors: string[] = [];

  // Validate status if provided
  if (data.status) {
    const validStatuses: BookingStatus[] = ['pending', 'confirmed', 'cancelled', 'completed', 'refunded'];
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

// Validate property status updates
export const validatePropertyStatus = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const { status } = req.body;
  
  if (!status) {
    res.status(400).json({
      success: false,
      message: 'Status is required'
    });
    return;
  }

  const validStatuses: PropertyStatus[] = ['active', 'inactive', 'pending', 'suspended', 'draft'];
  if (!validStatuses.includes(status)) {
    res.status(400).json({
      success: false,
      message: `Invalid status. Valid options: ${validStatuses.join(', ')}`
    });
    return;
  }

  next();
};

// Validate pricing updates
export const validatePricing = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const { pricePerNight, pricePerTwoNights } = req.body;
  const errors: string[] = [];

  if (!pricePerNight) {
    errors.push('Price per night is required');
  } else if (typeof pricePerNight !== 'number' || pricePerNight <= 0) {
    errors.push('Price per night must be a positive number');
  } else if (pricePerNight > 10000) {
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

// Validate availability dates
export const validateAvailability = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const { availableFrom, availableTo } = req.body;
  const errors: string[] = [];

  if (!availableFrom || !availableTo) {
    errors.push('Both availableFrom and availableTo dates are required');
  } else {
    const startDate = new Date(availableFrom);
    const endDate = new Date(availableTo);
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      errors.push('Invalid dates provided');
    } else if (startDate >= endDate) {
      errors.push('End date must be after start date');
    } else if (startDate < new Date()) {
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

// Validate date blocking
export const validateDateBlocking = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const { startDate, endDate, reason } = req.body;
  const errors: string[] = [];

  if (!startDate || !endDate) {
    errors.push('Both start date and end date are required');
  } else {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      errors.push('Invalid dates provided');
    } else if (start >= end) {
      errors.push('End date must be after start date');
    } else if (start < new Date()) {
      errors.push('Start date cannot be in the past');
    }
  }

  if (reason && typeof reason !== 'string') {
    errors.push('Reason must be a string');
  } else if (reason && reason.length > 200) {
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

// Validate image upload data
export const validateImageUpload = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const { category, imageUrls } = req.body;
  const errors: string[] = [];

  if (!category) {
    errors.push('Image category is required');
  }

  if (!imageUrls || !Array.isArray(imageUrls)) {
    errors.push('Image URLs must be provided as an array');
  } else if (imageUrls.length === 0) {
    errors.push('At least one image URL is required');
  } else if (imageUrls.length > 10) {
    errors.push('Maximum 10 images can be uploaded at once');
  } else {
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

// Validate bulk operations
export const validateBulkOperation = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const { bookingIds, updates } = req.body;
  const errors: string[] = [];

  if (!Array.isArray(bookingIds) || bookingIds.length === 0) {
    errors.push('Booking IDs array is required and cannot be empty');
  } else if (bookingIds.length > 50) {
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

// Rate limiting middleware for expensive operations
export const rateLimitExpensiveOperations = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  // This would typically use a proper rate limiting library like express-rate-limit
  // For now, this is a placeholder that could be implemented based on specific requirements
  
  // You could implement rate limiting based on:
  // - User ID
  // - IP address
  // - Operation type
  // - Time windows
  
  next();
};

// Cache middleware for frequently accessed data
export const cacheMiddleware = (duration: number = 300) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    // This would typically use Redis or another caching solution
    // For now, this is a placeholder
    
    // Set cache headers
    res.set('Cache-Control', `public, max-age=${duration}`);
    next();
  };
};