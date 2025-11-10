import { Request, Response, NextFunction } from 'express';
import { 
  CreateTourDto,
  UpdateTourDto,
  TourBookingRequest,
  TourBookingUpdateDto,
  CreateTourScheduleDto,
  UpdateTourScheduleDto,
  TourDifficulty,
  TourBookingStatus,
  TourPaymentStatus,
  TourCheckInStatus
} from '../types/tours.types';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
    userType?: string;
  };
}

// Validate tour creation/update data
export const validateTour = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const data: CreateTourDto = req.body;
  const errors: string[] = [];

  // Required fields validation
  if (!data.title || data.title.trim().length === 0) {
    errors.push('Tour title is required');
  } else if (data.title.length > 200) {
    errors.push('Tour title must be less than 200 characters');
  }

  if (!data.description || data.description.trim().length === 0) {
    errors.push('Tour description is required');
  } else if (data.description.length > 5000) {
    errors.push('Tour description must be less than 5000 characters');
  }

  if (!data.shortDescription || data.shortDescription.trim().length === 0) {
    errors.push('Short description is required');
  } else if (data.shortDescription.length > 500) {
    errors.push('Short description must be less than 500 characters');
  }

  if (!data.category || data.category.trim().length === 0) {
    errors.push('Tour category is required');
  }

  if (!data.type || data.type.trim().length === 0) {
    errors.push('Tour type is required');
  }

  // Validate pricing
  if (!data.price || data.price <= 0) {
    errors.push('Tour price must be greater than 0');
  } else if (data.price > 50000) {
    errors.push('Tour price seems too high (max: $50,000)');
  }

  // Validate duration
  if (!data.duration || data.duration <= 0) {
    errors.push('Tour duration must be greater than 0');
  } else if (data.duration > 168) {
    errors.push('Tour duration cannot exceed 168 hours (7 days)');
  }

  // Validate group size
  if (!data.maxGroupSize || data.maxGroupSize < 1 || data.maxGroupSize > 100) {
    errors.push('Maximum group size must be between 1 and 100');
  }

  if (data.minGroupSize && (data.minGroupSize < 1 || data.minGroupSize > data.maxGroupSize)) {
    errors.push('Minimum group size must be between 1 and maximum group size');
  }

  // Validate difficulty
  if (data.difficulty) {
    const validDifficulties: TourDifficulty[] = ['easy', 'moderate', 'challenging', 'extreme'];
    if (!validDifficulties.includes(data.difficulty)) {
      errors.push(`Invalid difficulty. Valid options: ${validDifficulties.join(', ')}`);
    }
  }

  // Validate location
  if (!data.locationCountry || data.locationCountry.trim().length === 0) {
    errors.push('Country is required');
  }

  if (!data.locationCity || data.locationCity.trim().length === 0) {
    errors.push('City is required');
  }

  if (!data.locationAddress || data.locationAddress.trim().length === 0) {
    errors.push('Address is required');
  }

  if (!data.meetingPoint || data.meetingPoint.trim().length === 0) {
    errors.push('Meeting point is required');
  }

  // Validate coordinates if provided
  if (data.latitude && (data.latitude < -90 || data.latitude > 90)) {
    errors.push('Latitude must be between -90 and 90');
  }

  if (data.longitude && (data.longitude < -180 || data.longitude > 180)) {
    errors.push('Longitude must be between -180 and 180');
  }

  // Validate arrays
  if (data.inclusions && !Array.isArray(data.inclusions)) {
    errors.push('Inclusions must be an array');
  }

  if (data.exclusions && !Array.isArray(data.exclusions)) {
    errors.push('Exclusions must be an array');
  }

  if (data.requirements && !Array.isArray(data.requirements)) {
    errors.push('Requirements must be an array');
  }

  if (data.tags && !Array.isArray(data.tags)) {
    errors.push('Tags must be an array');
  }

  // Validate itinerary
  if (data.itinerary && !Array.isArray(data.itinerary)) {
    errors.push('Itinerary must be an array');
  } else if (data.itinerary) {
    data.itinerary.forEach((item, index) => {
      if (!item.title || !item.description || !item.duration || !item.order) {
        errors.push(`Itinerary item ${index + 1} must have title, description, duration, and order`);
      }
      if (item.duration <= 0) {
        errors.push(`Itinerary item ${index + 1} duration must be greater than 0`);
      }
    });
  }

  // Validate schedules if provided
  if (data.schedules && !Array.isArray(data.schedules)) {
    errors.push('Schedules must be an array');
  } else if (data.schedules && data.schedules.length > 0) {
    data.schedules.forEach((schedule, index) => {
      if (!schedule.startDate || !schedule.endDate || !schedule.startTime || !schedule.endTime || !schedule.availableSlots) {
        errors.push(`Schedule ${index + 1} must have start date, end date, start time, end time, and available slots`);
      }
      
      if (schedule.availableSlots <= 0) {
        errors.push(`Schedule ${index + 1} available slots must be greater than 0`);
      }

      // Validate date format and logic
      const startDate = new Date(schedule.startDate);
      const endDate = new Date(schedule.endDate);
      
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        errors.push(`Schedule ${index + 1} has invalid dates`);
      } else if (startDate >= endDate) {
        errors.push(`Schedule ${index + 1} end date must be after start date`);
      } else if (startDate < new Date()) {
        errors.push(`Schedule ${index + 1} start date cannot be in the past`);
      }

      // Validate time format (HH:MM)
      const timePattern = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timePattern.test(schedule.startTime) || !timePattern.test(schedule.endTime)) {
        errors.push(`Schedule ${index + 1} times must be in HH:MM format`);
      }
    });
  }

  // Validate images object structure
  if (data.images && typeof data.images !== 'object') {
    errors.push('Images must be an object with category arrays');
  }

  if (errors.length > 0) {
    res.status(400).json({
      success: false,
      message: 'Tour validation failed',
      errors: errors
    });
    return;
  }

  next();
};

// Validate that user is a tour guide
export const validateTourGuide = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
    return;
  }

  // Check if user type is tour guide
  if (req.user.userType && req.user.userType !== 'tourguide') {
    res.status(403).json({
      success: false,
      message: 'Tour guide access required'
    });
    return;
  }

  next();
};

// Validate that user is an admin
export const validateAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
    return;
  }

  // Check if user type is admin
  if (req.user.userType && req.user.userType !== 'admin') {
    res.status(403).json({
      success: false,
      message: 'Admin access required'
    });
    return;
  }

  next();
};

// Validate that user is either an admin or tour guide
export const validateAdminOrTourGuide = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
    return;
  }

  // Check if user type is admin or tourguide
  if (req.user.userType && !['admin', 'tourguide'].includes(req.user.userType)) {
    res.status(403).json({
      success: false,
      message: 'Admin or Tour Guide access required'
    });
    return;
  }

  next();
};

// Validate tour guide access to specific tour
export const validateTourGuideAccess = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
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
    const userType = req.user.userType;

    if (!tourId) {
      res.status(400).json({
        success: false,
        message: 'Tour ID is required'
      });
      return;
    }

    // Admins have access to all tours
    if (userType === 'admin') {
      next();
      return;
    }

    // Check if tour belongs to the tour guide
    const tour = await prisma.tour.findFirst({
      where: {
        id: tourId,
        tourGuideId: tourGuideId
      }
    });

    if (!tour) {
      res.status(403).json({
        success: false,
        message: 'Access denied. Tour not found or not owned by you.'
      });
      return;
    }

    next();
  } catch (error: any) {
    console.error('Error validating tour guide access:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate tour access'
    });
  }
};

// Validate tour booking request
export const validateTourBooking = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const data: TourBookingRequest = req.body;
  const errors: string[] = [];

  // Required fields
  if (!data.tourId) {
    errors.push('Tour ID is required');
  }

  if (!data.scheduleId) {
    errors.push('Schedule ID is required');
  }

  if (!data.numberOfParticipants || data.numberOfParticipants < 1) {
    errors.push('Number of participants must be at least 1');
  } else if (data.numberOfParticipants > 50) {
    errors.push('Number of participants cannot exceed 50');
  }

  if (!data.participants || !Array.isArray(data.participants)) {
    errors.push('Participants array is required');
  } else {
    // Validate participant count matches
    if (data.participants.length !== data.numberOfParticipants) {
      errors.push('Number of participants must match participants array length');
    }

    // Validate each participant
    data.participants.forEach((participant, index) => {
      if (!participant.name || !participant.age) {
        errors.push(`Participant ${index + 1} must have name and age`);
      }

      if (participant.age < 0 || participant.age > 120) {
        errors.push(`Participant ${index + 1} age must be between 0 and 120`);
      }

      if (!participant.emergencyContact || !participant.emergencyContact.name || !participant.emergencyContact.phone) {
        errors.push(`Participant ${index + 1} must have emergency contact name and phone`);
      }
    });
  }

  if (!data.totalAmount || data.totalAmount <= 0) {
    errors.push('Total amount must be greater than 0');
  }

  // Validate special requests length
  if (data.specialRequests && data.specialRequests.length > 1000) {
    errors.push('Special requests must be less than 1000 characters');
  }

  if (errors.length > 0) {
    res.status(400).json({
      success: false,
      message: 'Tour booking validation failed',
      errors: errors
    });
    return;
  }

  next();
};

// Validate tour booking update
export const validateTourBookingUpdate = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const data: TourBookingUpdateDto = req.body;
  const errors: string[] = [];

  // Validate status if provided
  if (data.status) {
    const validStatuses: TourBookingStatus[] = ['pending', 'confirmed', 'checkedin', 'completed', 'cancelled', 'refunded', 'no_show'];
    if (!validStatuses.includes(data.status)) {
      errors.push(`Invalid booking status. Valid options: ${validStatuses.join(', ')}`);
    }
  }

  // Validate payment status if provided
  if (data.paymentStatus) {
    const validPaymentStatuses: TourPaymentStatus[] = ['pending', 'paid', 'failed', 'refunded', 'partially_refunded'];
    if (!validPaymentStatuses.includes(data.paymentStatus)) {
      errors.push(`Invalid payment status. Valid options: ${validPaymentStatuses.join(', ')}`);
    }
  }

  // Validate check-in status if provided
  if (data.checkInStatus) {
    const validCheckInStatuses: TourCheckInStatus[] = ['not_checkedin', 'checkedin', 'no_show'];
    if (!validCheckInStatuses.includes(data.checkInStatus)) {
      errors.push(`Invalid check-in status. Valid options: ${validCheckInStatuses.join(', ')}`);
    }
  }

  // Validate text fields length
  if (data.specialRequests && data.specialRequests.length > 1000) {
    errors.push('Special requests must be less than 1000 characters');
  }

  if (data.guestNotes && data.guestNotes.length > 1000) {
    errors.push('Guest notes must be less than 1000 characters');
  }

  if (data.refundReason && data.refundReason.length > 500) {
    errors.push('Refund reason must be less than 500 characters');
  }

  // Validate refund amount
  if (data.refundAmount !== undefined && data.refundAmount < 0) {
    errors.push('Refund amount cannot be negative');
  }

  if (errors.length > 0) {
    res.status(400).json({
      success: false,
      message: 'Tour booking update validation failed',
      errors: errors
    });
    return;
  }

  next();
};

// Validate tour schedule creation/update
export const validateTourSchedule = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const data: CreateTourScheduleDto | UpdateTourScheduleDto = req.body;
  const errors: string[] = [];

  // Validate dates if provided
  if (data.startDate && data.endDate) {
    const startDate = new Date(data.startDate);
    const endDate = new Date(data.endDate);
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      errors.push('Invalid dates provided');
    } else if (startDate >= endDate) {
      errors.push('End date must be after start date');
    } else if (startDate < new Date()) {
      errors.push('Start date cannot be in the past');
    }
  }

  // Validate time format (HH:MM)
  const timePattern = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
  
  if (data.startTime && !timePattern.test(data.startTime)) {
    errors.push('Start time must be in HH:MM format');
  }

  if (data.endTime && !timePattern.test(data.endTime)) {
    errors.push('End time must be in HH:MM format');
  }

  // Validate available slots
  if (data.availableSlots !== undefined && (data.availableSlots < 1 || data.availableSlots > 100)) {
    errors.push('Available slots must be between 1 and 100');
  }

  // Validate booked slots (for updates)
  if ('bookedSlots' in data && data.bookedSlots !== undefined) {
    if (data.bookedSlots < 0) {
      errors.push('Booked slots cannot be negative');
    }
    
    if (data.availableSlots && data.bookedSlots > data.availableSlots) {
      errors.push('Booked slots cannot exceed available slots');
    }
  }

  // Validate price override
  if (data.price !== undefined && data.price <= 0) {
    errors.push('Price must be greater than 0');
  }

  // Validate special notes length
  if (data.specialNotes && data.specialNotes.length > 500) {
    errors.push('Special notes must be less than 500 characters');
  }

  if (errors.length > 0) {
    res.status(400).json({
      success: false,
      message: 'Tour schedule validation failed',
      errors: errors
    });
    return;
  }

  next();
};

// Validate image upload data
export const validateTourImageUpload = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const { category, imageUrls } = req.body;
  const errors: string[] = [];

  if (!category) {
    errors.push('Image category is required');
  } else {
    const validCategories = ['main', 'activity', 'landscape', 'group', 'guide', 'equipment'];
    if (!validCategories.includes(category)) {
      errors.push(`Invalid category. Valid options: ${validCategories.join(', ')}`);
    }
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
      message: 'Image upload validation failed',
      errors: errors
    });
    return;
  }

  next();
};

// Validate user access to tour booking
export const validateBookingAccess = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
      return;
    }

    const bookingId = req.params.bookingId;
    const userId = parseInt(req.user.userId);
    const userType = req.user.userType;

    if (!bookingId) {
      res.status(400).json({
        success: false,
        message: 'Booking ID is required'
      });
      return;
    }

    // Admin has access to all bookings
    if (userType === 'admin') {
      next();
      return;
    }

    // Check booking access based on user type
    const booking = await prisma.tourBooking.findFirst({
      where: {
        id: bookingId,
        OR: [
          { userId: userId }, // Guest who made the booking
          { tourGuideId: userId } // Tour guide who owns the tour
        ]
      }
    });

    if (!booking) {
      res.status(403).json({
        success: false,
        message: 'Access denied. Booking not found or not accessible by you.'
      });
      return;
    }

    next();
  } catch (error: any) {
    console.error('Error validating booking access:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate booking access'
    });
  }
};

// Validate bulk operations
export const validateBulkOperation = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const { tourIds, bookingIds, operation } = req.body;
  const errors: string[] = [];

  // Check for either tourIds or bookingIds
  if (!tourIds && !bookingIds) {
    errors.push('Either tour IDs or booking IDs array is required');
  }

  if (tourIds && (!Array.isArray(tourIds) || tourIds.length === 0)) {
    errors.push('Tour IDs must be a non-empty array');
  } else if (tourIds && tourIds.length > 100) {
    errors.push('Maximum 100 tours can be updated at once');
  }

  if (bookingIds && (!Array.isArray(bookingIds) || bookingIds.length === 0)) {
    errors.push('Booking IDs must be a non-empty array');
  } else if (bookingIds && bookingIds.length > 100) {
    errors.push('Maximum 100 bookings can be updated at once');
  }

  if (!operation) {
    errors.push('Operation is required');
  } else {
    const validTourOperations = ['activate', 'deactivate', 'delete', 'update_category', 'update_tags'];
    const validBookingOperations = ['confirm', 'cancel', 'complete', 'update_status'];
    
    if (tourIds && !validTourOperations.includes(operation)) {
      errors.push(`Invalid tour operation. Valid options: ${validTourOperations.join(', ')}`);
    }
    
    if (bookingIds && !validBookingOperations.includes(operation)) {
      errors.push(`Invalid booking operation. Valid options: ${validBookingOperations.join(', ')}`);
    }
  }

  if (errors.length > 0) {
    res.status(400).json({
      success: false,
      message: 'Bulk operation validation failed',
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
    
    // Set cache headers for public tour data
    if (req.method === 'GET' && !req.user) {
      res.set('Cache-Control', `public, max-age=${duration}`);
    }
    
    next();
  };
};

// Validate tour update permissions (for different user types)
export const validateTourUpdatePermissions = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const updateData: UpdateTourDto = req.body;
  const userType = req.user?.userType;
  const errors: string[] = [];

  // Tour guides can update most fields but with some restrictions
  if (userType === 'tourguide') {
    // Restrict certain sensitive fields for tour guides
    const restrictedFields = ['tourGuideId'];
    const attemptedRestrictedFields = Object.keys(updateData).filter(field => 
      restrictedFields.includes(field)
    );

    if (attemptedRestrictedFields.length > 0) {
      errors.push(`Tour guides cannot edit these fields: ${attemptedRestrictedFields.join(', ')}`);
    }

    // Validate pricing changes (could add limits here)
    if (updateData.price !== undefined && updateData.price <= 0) {
      errors.push('Tour price must be greater than 0');
    }
  }

  // Admin can update everything (no restrictions)
  if (userType === 'admin') {
    // Admins have full access
  }

  // Other user types shouldn't be able to update tours
  if (userType && !['tourguide', 'admin'].includes(userType)) {
    errors.push('Insufficient permissions to update tours');
  }

  if (errors.length > 0) {
    res.status(403).json({
      success: false,
      message: 'Tour update permission validation failed',
      errors: errors
    });
    return;
  }

  next();
};

// Validate tour schedule access
export const validateScheduleAccess = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
      return;
    }

    const scheduleId = req.params.scheduleId;
    const userId = parseInt(req.user.userId);
    const userType = req.user.userType;

    if (!scheduleId) {
      res.status(400).json({
        success: false,
        message: 'Schedule ID is required'
      });
      return;
    }

    // Admin has access to all schedules
    if (userType === 'admin') {
      next();
      return;
    }

    // Check if schedule belongs to user's tour
    const schedule = await prisma.tourSchedule.findFirst({
      where: {
        id: scheduleId,
        tourGuideId: userId
      }
    });

    if (!schedule) {
      res.status(403).json({
        success: false,
        message: 'Access denied. Schedule not found or not owned by you.'
      });
      return;
    }

    next();
  } catch (error: any) {
    console.error('Error validating schedule access:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate schedule access'
    });
  }
};

// Validate guest access (for booking tours)
export const validateGuest = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
    return;
  }

  // Check if user type is guest (or allow other types that can book tours)
  const allowedUserTypes = ['guest', 'host', 'agent', 'admin'];
  if (req.user.userType && !allowedUserTypes.includes(req.user.userType)) {
    res.status(403).json({
      success: false,
      message: 'Invalid user type for booking tours'
    });
    return;
  }

  next();
};

// Validate tour review permissions
export const validateReviewPermissions = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
      return;
    }

    const { tourId } = req.body;
    const userId = parseInt(req.user.userId);

    if (!tourId) {
      res.status(400).json({
        success: false,
        message: 'Tour ID is required for review'
      });
      return;
    }

    // Check if tour exists
    const tour = await prisma.tour.findUnique({
      where: { id: tourId }
    });

    if (!tour) {
      res.status(404).json({
        success: false,
        message: 'Tour not found'
      });
      return;
    }

    // Check if user has a completed booking for this tour
    const completedBooking = await prisma.tourBooking.findFirst({
      where: {
        tourId: tourId,
        userId: userId,
        status: 'completed'
      }
    });

    if (!completedBooking) {
      res.status(403).json({
        success: false,
        message: 'You can only review tours you have completed'
      });
      return;
    }

    // Check if review already exists for this tour and user
    const existingReview = await prisma.tourReview.findFirst({
      where: {
        tourId: tourId,
        userId: userId
      }
    });

    if (existingReview) {
      res.status(400).json({
        success: false,
        message: 'You have already reviewed this tour'
      });
      return;
    }

    next();
  } catch (error: any) {
    console.error('Error validating review permissions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate review permissions'
    });
  }
};