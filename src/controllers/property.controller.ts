import { Request, Response } from 'express';
import { PropertyService } from '../services/property.service';
import { logger } from '../utils/logger';
import {
  CreatePropertyDto,
  UpdatePropertyDto,
  PropertySearchFilters,
  BookingRequest,
  CreateReviewDto,
  PropertyImages,
  PropertyStatus,
  BookingFilters,
  BookingStatus,
  BookingUpdateDto,
  GuestSearchFilters
} from '../types/property.types';

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
  };
}

export class PropertyController {
  private propertyService: PropertyService;

  constructor() {
    this.propertyService = new PropertyService();
  }

  // --- PROPERTY CRUD OPERATIONS ---
  createProperty = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const hostId = parseInt(req.user.userId);
      const propertyData: CreatePropertyDto = req.body;

      const requiredFields = ['name', 'location', 'type', 'category', 'pricePerNight', 'beds', 'baths', 'maxGuests'];
      const missingFields = requiredFields.filter(field => !propertyData[field as keyof CreatePropertyDto]);
      
      if (missingFields.length > 0) {
        res.status(400).json({
          success: false,
          message: 'Missing required fields',
          errors: missingFields.map(field => `${field} is required`)
        });
        return;
      }

      if (propertyData.pricePerNight <= 0) {
        res.status(400).json({
          success: false,
          message: 'Price per night must be greater than 0'
        });
        return;
      }

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
    } catch (error: any) {
      logger.error('Failed to create property', 'PropertyController', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to create property'
      });
    }
  };

  updateProperty = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
      const updateData: UpdatePropertyDto = req.body;

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
    } catch (error: any) {
      logger.error('Failed to update property', 'PropertyController', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to update property'
      });
    }
  };

  deleteProperty = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
    } catch (error: any) {
      logger.error('Failed to delete property', 'PropertyController', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to delete property'
      });
    }
  };

  // --- PROPERTY QUERIES ---
  getPropertyById = async (req: Request, res: Response): Promise<void> => {
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
    } catch (error: any) {
      logger.error('Failed to fetch property', 'PropertyController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve property'
      });
    }
  };

  searchProperties = async (req: Request, res: Response): Promise<void> => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      
      const filters: PropertySearchFilters = {
        location: req.query.location as string,
        type: req.query.type as string,
        category: req.query.category as string,
        minPrice: req.query.minPrice ? parseFloat(req.query.minPrice as string) : undefined,
        maxPrice: req.query.maxPrice ? parseFloat(req.query.maxPrice as string) : undefined,
        beds: req.query.beds ? parseInt(req.query.beds as string) : undefined,
        baths: req.query.baths ? parseInt(req.query.baths as string) : undefined,
        maxGuests: req.query.maxGuests ? parseInt(req.query.maxGuests as string) : undefined,
        features: req.query.features ? (req.query.features as string).split(',') : undefined,
        availableFrom: req.query.availableFrom as string,
        availableTo: req.query.availableTo as string,
        search: req.query.search as string,
        sortBy: req.query.sortBy as 'price' | 'rating' | 'created_at' | 'name',
        sortOrder: req.query.sortOrder as 'asc' | 'desc'
      };

      Object.keys(filters).forEach(key => {
        if (filters[key as keyof PropertySearchFilters] === undefined) {
          delete filters[key as keyof PropertySearchFilters];
        }
      });

      const result = await this.propertyService.searchProperties(filters, page, limit);
      
      res.json({
        success: true,
        message: 'Properties retrieved successfully',
        data: result
      });
    } catch (error: any) {
      logger.error('Failed to search properties', 'PropertyController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to search properties'
      });
    }
  };

  getMyProperties = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const hostId = parseInt(req.user.userId);
      const status = req.query.status as string;
      
      const validStatuses: PropertyStatus[] = ['active', 'inactive', 'pending', 'suspended', 'draft'];
      
      let filters: Partial<PropertySearchFilters> | undefined = undefined;
      
      if (status) {
        if (validStatuses.includes(status as PropertyStatus)) {
          filters = { 
            status: status as PropertyStatus
          };
        } else {
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
    } catch (error: any) {
      logger.error('Failed to fetch host properties', 'PropertyController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve properties'
      });
    }
  };

  getFeaturedProperties = async (req: Request, res: Response): Promise<void> => {
    try {
      const limit = parseInt(req.query.limit as string) || 8;
      const properties = await this.propertyService.getFeaturedProperties(limit);
      
      res.json({
        success: true,
        message: 'Featured properties retrieved successfully',
        data: properties
      });
    } catch (error: any) {
      logger.error('Failed to fetch featured properties', 'PropertyController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve featured properties'
      });
    }
  };

  getSimilarProperties = async (req: Request, res: Response): Promise<void> => {
    try {
      const propertyId = parseInt(req.params.id);
      const limit = parseInt(req.query.limit as string) || 6;

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
    } catch (error: any) {
      logger.error('Failed to fetch similar properties', 'PropertyController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve similar properties'
      });
    }
  };

  // --- BOOKING MANAGEMENT ---
  createBooking = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const guestId = parseInt(req.user.userId);
      const bookingData: BookingRequest = req.body;

      const requiredFields = ['propertyId', 'checkIn', 'checkOut', 'guests', 'totalPrice'];
      const missingFields = requiredFields.filter(field => !bookingData[field as keyof BookingRequest]);
      
      if (missingFields.length > 0) {
        res.status(400).json({
          success: false,
          message: 'Missing required fields',
          errors: missingFields.map(field => `${field} is required`)
        });
        return;
      }

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
    } catch (error: any) {
      logger.error('Failed to create booking', 'PropertyController', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to create booking'
      });
    }
  };

  getPropertyBookings = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
    } catch (error: any) {
      logger.error('Failed to fetch property bookings', 'PropertyController', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to retrieve bookings'
      });
    }
  };

  // --- REVIEW MANAGEMENT ---
  createReview = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: 'Authentication required' });
        return;
      }

      const userId = parseInt(req.user.userId);
      const reviewData: CreateReviewDto = req.body;

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
    } catch (error: any) {
      logger.error('Failed to create review', 'PropertyController', error);
      res.status(400).json({ success: false, message: error.message || 'Failed to create review' });
    }
  };

  getPropertyReviews = async (req: Request, res: Response): Promise<void> => {
    try {
      const propertyId = parseInt(req.params.id);
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

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
    } catch (error: any) {
      logger.error('Failed to fetch property reviews', 'PropertyController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve reviews'
      });
    }
  };

  // --- MEDIA MANAGEMENT ---
  uploadPropertyImages = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

      const property = await this.propertyService.uploadPropertyImages(
        propertyId, 
        hostId, 
        category as keyof PropertyImages, 
        imageUrls
      );
      
      res.json({
        success: true,
        message: 'Images uploaded successfully',
        data: property
      });
    } catch (error: any) {
      logger.error('Failed to upload property images', 'PropertyController', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to upload images'
      });
    }
  };

  removePropertyImage = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

      const property = await this.propertyService.removePropertyImage(
        propertyId, 
        hostId, 
        category as keyof PropertyImages, 
        imageUrl
      );
      
      res.json({
        success: true,
        message: 'Image removed successfully',
        data: property
      });
    } catch (error: any) {
      logger.error('Failed to remove property image', 'PropertyController', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to remove image'
      });
    }
  };

  // --- PROPERTY STATUS MANAGEMENT ---
  activateProperty = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
    } catch (error: any) {
      logger.error('Failed to activate property', 'PropertyController', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to activate property'
      });
    }
  };

  deactivateProperty = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
    } catch (error: any) {
      logger.error('Failed to deactivate property', 'PropertyController', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to deactivate property'
      });
    }
  };

  // --- ANALYTICS & DASHBOARD ---
  getHostDashboard = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
    } catch (error: any) {
      logger.error('Failed to fetch host dashboard', 'PropertyController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve dashboard data'
      });
    }
  };

  // --- LOCATION SUGGESTIONS ---
  getLocationSuggestions = async (req: Request, res: Response): Promise<void> => {
    try {
      const query = req.query.q as string;

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
    } catch (error: any) {
      logger.error('Failed to fetch location suggestions', 'PropertyController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve location suggestions'
      });
    }
  };

  // --- GUEST MANAGEMENT ENDPOINTS ---
  getHostGuests = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const hostId = parseInt(req.user.userId);
      const filters: GuestSearchFilters = {
        search: req.query.search as string,
        verificationStatus: req.query.verificationStatus as 'verified' | 'pending' | 'unverified',
        bookingStatus: req.query.bookingStatus as 'active' | 'past' | 'upcoming',
        sortBy: req.query.sortBy as 'name' | 'bookings' | 'spending' | 'joinDate',
        sortOrder: req.query.sortOrder as 'asc' | 'desc',
        dateRange: req.query.startDate && req.query.endDate ? {
          start: req.query.startDate as string,
          end: req.query.endDate as string
        } : undefined
      };

      Object.keys(filters).forEach(key => {
        if (filters[key as keyof GuestSearchFilters] === undefined) {
          delete filters[key as keyof GuestSearchFilters];
        }
      });

      const guests = await this.propertyService.getHostGuests(hostId, filters);
      
      res.json({
        success: true,
        message: 'Guests retrieved successfully',
        data: guests
      });
    } catch (error: any) {
      logger.error('Failed to fetch guests', 'PropertyController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve guests'
      });
    }
  };

  getGuestDetails = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
    } catch (error: any) {
      logger.error('Failed to fetch guest details', 'PropertyController', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to retrieve guest details'
      });
    }
  };

  // --- BOOKING MANAGEMENT ENDPOINTS ---
  getHostBookings = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const hostId = parseInt(req.user.userId);
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const filters: BookingFilters = {
        status: req.query.status ? (req.query.status as string).split(',') as BookingStatus[] : undefined,
        propertyId: req.query.propertyId ? parseInt(req.query.propertyId as string) : undefined,
        guestId: req.query.guestId ? parseInt(req.query.guestId as string) : undefined,
        dateRange: req.query.startDate && req.query.endDate ? {
          start: req.query.startDate as string,
          end: req.query.endDate as string
        } : undefined,
        sortBy: req.query.sortBy as 'date' | 'amount' | 'property' | 'guest',
        sortOrder: req.query.sortOrder as 'asc' | 'desc'
      };

      Object.keys(filters).forEach(key => {
        if (filters[key as keyof BookingFilters] === undefined) {
          delete filters[key as keyof BookingFilters];
        }
      });

      const result = await this.propertyService.getHostBookings(hostId, filters, page, limit);
      
      res.json({
        success: true,
        message: 'Bookings retrieved successfully',
        data: result
      });
    } catch (error: any) {
      logger.error('Failed to fetch host bookings', 'PropertyController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve bookings'
      });
    }
  };

  updateBooking = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
      const updateData: BookingUpdateDto = req.body;

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
    } catch (error: any) {
      logger.error('Failed to update booking', 'PropertyController', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to update booking'
      });
    }
  };

  getBookingCalendar = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const hostId = parseInt(req.user.userId);
      const year = parseInt(req.query.year as string) || new Date().getFullYear();
      const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;

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
    } catch (error: any) {
      logger.error('Failed to fetch booking calendar', 'PropertyController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve booking calendar'
      });
    }
  };

  // --- EARNINGS ENDPOINTS ---
  getEarningsOverview = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
    } catch (error: any) {
      logger.error('Failed to fetch earnings overview', 'PropertyController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve earnings overview'
      });
    }
  };

  getEarningsBreakdown = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
    } catch (error: any) {
      logger.error('Failed to fetch earnings breakdown', 'PropertyController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve earnings breakdown'
      });
    }
  };

  // --- ANALYTICS ENDPOINTS ---
  getHostAnalytics = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const hostId = parseInt(req.user.userId);
      const timeRange = (req.query.timeRange as 'week' | 'month' | 'quarter' | 'year') || 'month';

      const analytics = await this.propertyService.getHostAnalytics(hostId, timeRange);
      
      res.json({
        success: true,
        message: 'Analytics retrieved successfully',
        data: analytics
      });
    } catch (error: any) {
      logger.error('Failed to fetch analytics', 'PropertyController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve analytics'
      });
    }
  };

  // --- ENHANCED DASHBOARD ---
  getEnhancedDashboard = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
    } catch (error: any) {
      logger.error('Failed to fetch enhanced dashboard', 'PropertyController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve enhanced dashboard'
      });
    }
  };

  // --- PROPERTY AVAILABILITY MANAGEMENT ---
  updatePropertyAvailability = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

      const property = await this.propertyService.updatePropertyAvailability(
        propertyId, 
        hostId, 
        availableFrom, 
        availableTo
      );
      
      res.json({
        success: true,
        message: 'Property availability updated successfully',
        data: property
      });
    } catch (error: any) {
      logger.error('Failed to update property availability', 'PropertyController', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to update property availability'
      });
    }
  };

  blockPropertyDates = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
    } catch (error: any) {
      logger.error('Failed to block dates', 'PropertyController', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to block dates'
      });
    }
  };

  // --- PRICING MANAGEMENT ---
  updatePropertyPricing = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

      const property = await this.propertyService.updatePropertyPricing(
        propertyId, 
        hostId, 
        pricePerNight, 
        pricePerTwoNights
      );
      
      res.json({
        success: true,
        message: 'Property pricing updated successfully',
        data: property
      });
    } catch (error: any) {
      logger.error('Failed to update property pricing', 'PropertyController', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to update property pricing'
      });
    }
  };

  // --- BULK OPERATIONS ---
  bulkUpdateBookings = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

      const results = await Promise.allSettled(
        bookingIds.map(bookingId => 
          this.propertyService.updateBooking(hostId, bookingId, updates)
        )
      );

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
    } catch (error: any) {
      logger.error('Failed to perform bulk update', 'PropertyController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to perform bulk update'
      });
    }
  };

  // --- QUICK ACTIONS ---
  getQuickStats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
    } catch (error: any) {
      logger.error('Failed to fetch quick stats', 'PropertyController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve quick stats'
      });
    }
  };

  getRecentActivity = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const hostId = parseInt(req.user.userId);
      const limit = parseInt(req.query.limit as string) || 10;
      
      const dashboard = await this.propertyService.getEnhancedHostDashboard(hostId);
      
      res.json({
        success: true,
        message: 'Recent activity retrieved successfully',
        data: dashboard.recentActivity.slice(0, limit)
      });
    } catch (error: any) {
      logger.error('Failed to fetch recent activity', 'PropertyController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve recent activity'
      });
    }
  };

  // --- AGENT DASHBOARD & OVERVIEW ---
  getAgentDashboard = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const agentId = parseInt(req.user.userId);
      const dashboard = await this.propertyService.getAgentDashboard(agentId);
      
      res.json({
        success: true,
        message: 'Agent dashboard retrieved successfully',
        data: dashboard
      });
    } catch (error: any) {
      logger.error('Failed to fetch agent dashboard', 'PropertyController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve agent dashboard'
      });
    }
  };

  // --- AGENT PROPERTY MANAGEMENT ---
  getAgentProperties = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const agentId = parseInt(req.user.userId);
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      
      const filters: any = {
        clientId: req.query.clientId ? parseInt(req.query.clientId as string) : undefined,
        status: req.query.status as string,
        search: req.query.search as string,
        sortBy: req.query.sortBy as 'name' | 'location' | 'price' | 'rating' | 'created_at',
        sortOrder: req.query.sortOrder as 'asc' | 'desc'
      };

      Object.keys(filters).forEach(key => {
        if (filters[key] === undefined) {
          delete filters[key];
        }
      });

      const result = await this.propertyService.getAgentProperties(agentId, filters, page, limit);
      
      res.json({
        success: true,
        message: 'Agent properties retrieved successfully',
        data: result
      });
    } catch (error: any) {
      logger.error('Failed to fetch agent properties', 'PropertyController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve agent properties'
      });
    }
  };

  getAgentPropertyPerformance = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const agentId = parseInt(req.user.userId);
      const timeRange = (req.query.timeRange as 'week' | 'month' | 'quarter' | 'year') || 'month';
      
      const performance = await this.propertyService.getAgentPropertyPerformance(agentId, timeRange);
      
      res.json({
        success: true,
        message: 'Agent property performance retrieved successfully',
        data: performance
      });
    } catch (error: any) {
      logger.error('Failed to fetch agent property performance', 'PropertyController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve property performance'
      });
    }
  };

  getAgentPropertyDetails = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

      const property = await this.propertyService.getAgentPropertyDetails(agentId, propertyId);
      
      res.json({
        success: true,
        message: 'Agent property details retrieved successfully',
        data: property
      });
    } catch (error: any) {
      logger.error('Failed to fetch agent property details', 'PropertyController', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to retrieve property details'
      });
    }
  };

  updateAgentProperty = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
      const updateData = req.body;

      if (isNaN(propertyId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid property ID'
        });
        return;
      }

      const property = await this.propertyService.updateAgentProperty(agentId, propertyId, updateData);
      
      res.json({
        success: true,
        message: 'Property updated successfully by agent',
        data: property
      });
    } catch (error: any) {
      logger.error('Failed to update agent property', 'PropertyController', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to update property'
      });
    }
  };

  // --- AGENT BOOKING MANAGEMENT ---
  getAgentPropertyBookings = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

      const bookings = await this.propertyService.getAgentPropertyBookings(agentId, propertyId);

      res.json({
        success: true,
        message: 'Agent property bookings retrieved successfully',
        data: bookings
      });
    } catch (error: any) {
      logger.error('Failed to fetch agent property bookings', 'PropertyController', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to retrieve bookings'
      });
    }
  };

  createAgentBooking = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
      const bookingData = req.body;

      if (isNaN(propertyId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid property ID'
        });
        return;
      }

      bookingData.propertyId = propertyId;

      const booking = await this.propertyService.createAgentBooking(agentId, bookingData);
      
      res.status(201).json({
        success: true,
        message: 'Booking created successfully by agent',
        data: booking
      });
    } catch (error: any) {
      logger.error('Failed to create agent booking', 'PropertyController', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to create booking'
      });
    }
  };

  getAgentBookings = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const agentId = parseInt(req.user.userId);
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const filters: BookingFilters = {
        status: req.query.status ? (req.query.status as string).split(',') as BookingStatus[] : undefined,
        propertyId: req.query.propertyId ? parseInt(req.query.propertyId as string) : undefined,
        clientId: req.query.clientId ? parseInt(req.query.clientId as string) : undefined,
        dateRange: req.query.startDate && req.query.endDate ? {
          start: req.query.startDate as string,
          end: req.query.endDate as string
        } : undefined,
        sortBy: req.query.sortBy as 'date' | 'amount' | 'property' | 'guest',
        sortOrder: req.query.sortOrder as 'asc' | 'desc'
      };

      Object.keys(filters).forEach(key => {
        if (filters[key as keyof BookingFilters] === undefined) {
          delete filters[key as keyof BookingFilters];
        }
      });

      const result = await this.propertyService.getAgentBookings(agentId, filters, page, limit);
      
      res.json({
        success: true,
        message: 'Agent bookings retrieved successfully',
        data: result
      });
    } catch (error: any) {
      logger.error('Failed to fetch agent bookings', 'PropertyController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve agent bookings'
      });
    }
  };

  getAgentBookingCalendar = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const agentId = parseInt(req.user.userId);
      const year = parseInt(req.query.year as string) || new Date().getFullYear();
      const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;

      if (month < 1 || month > 12) {
        res.status(400).json({
          success: false,
          message: 'Month must be between 1 and 12'
        });
        return;
      }

      const calendar = await this.propertyService.getAgentBookingCalendar(agentId, year, month);
      
      res.json({
        success: true,
        message: 'Agent booking calendar retrieved successfully',
        data: calendar
      });
    } catch (error: any) {
      logger.error('Failed to fetch agent booking calendar', 'PropertyController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve booking calendar'
      });
    }
  };

  updateAgentBooking = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const agentId = parseInt(req.user.userId);
      const bookingId = req.params.bookingId;
      const updateData: BookingUpdateDto = req.body;

      if (!bookingId) {
        res.status(400).json({
          success: false,
          message: 'Booking ID is required'
        });
        return;
      }

      const booking = await this.propertyService.updateAgentBooking(agentId, bookingId, updateData);
      
      res.json({
        success: true,
        message: 'Booking updated successfully by agent',
        data: booking
      });
    } catch (error: any) {
      logger.error('Failed to update agent booking', 'PropertyController', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to update booking'
      });
    }
  };

  // --- AGENT ANALYTICS ---
  getAgentPropertyAnalytics = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
      const timeRange = (req.query.timeRange as 'week' | 'month' | 'quarter' | 'year') || 'month';

      if (isNaN(propertyId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid property ID'
        });
        return;
      }

      const analytics = await this.propertyService.getAgentPropertyAnalytics(agentId, propertyId, timeRange);
      
      res.json({
        success: true,
        message: 'Agent property analytics retrieved successfully',
        data: analytics
      });
    } catch (error: any) {
      logger.error('Failed to fetch agent property analytics', 'PropertyController', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to retrieve analytics'
      });
    }
  };

  getAgentPropertiesAnalyticsSummary = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const agentId = parseInt(req.user.userId);
      const timeRange = (req.query.timeRange as 'week' | 'month' | 'quarter' | 'year') || 'month';

      const summary = await this.propertyService.getAgentPropertiesAnalyticsSummary(agentId, timeRange);
      
      res.json({
        success: true,
        message: 'Agent properties analytics summary retrieved successfully',
        data: summary
      });
    } catch (error: any) {
      logger.error('Failed to fetch agent properties analytics summary', 'PropertyController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve analytics summary'
      });
    }
  };

  // --- AGENT EARNINGS ---
  getAgentEarnings = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const agentId = parseInt(req.user.userId);
      const timeRange = (req.query.timeRange as 'week' | 'month' | 'quarter' | 'year') || 'month';

      const earnings = await this.propertyService.getAgentEarnings(agentId, timeRange);
      
      res.json({
        success: true,
        message: 'Agent earnings retrieved successfully',
        data: earnings
      });
    } catch (error: any) {
      logger.error('Failed to fetch agent earnings', 'PropertyController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve agent earnings'
      });
    }
  };

  getAgentEarningsBreakdown = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const agentId = parseInt(req.user.userId);
      const breakdown = await this.propertyService.getAgentEarningsBreakdown(agentId);
      
      res.json({
        success: true,
        message: 'Agent earnings breakdown retrieved successfully',
        data: breakdown
      });
    } catch (error: any) {
      logger.error('Failed to fetch agent earnings breakdown', 'PropertyController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve earnings breakdown'
      });
    }
  };

  // --- CLIENT PROPERTY MANAGEMENT ---
  getClientProperties = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const agentId = parseInt(req.user.userId);
      const clientId = parseInt(req.params.clientId);

      if (isNaN(clientId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid client ID'
        });
        return;
      }

      const properties = await this.propertyService.getClientProperties(agentId, clientId);
      
      res.json({
        success: true,
        message: 'Client properties retrieved successfully',
        data: properties
      });
    } catch (error: any) {
      logger.error('Failed to fetch client properties', 'PropertyController', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to retrieve client properties'
      });
    }
  };

  createClientProperty = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const agentId = parseInt(req.user.userId);
      const clientId = parseInt(req.params.clientId);
      const propertyData: CreatePropertyDto = req.body;

      if (isNaN(clientId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid client ID'
        });
        return;
      }

      const property = await this.propertyService.createClientProperty(agentId, clientId, propertyData);
      
      res.status(201).json({
        success: true,
        message: 'Client property created successfully',
        data: property
      });
    } catch (error: any) {
      logger.error('Failed to create client property', 'PropertyController', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to create client property'
      });
    }
  };

  // --- AGENT MEDIA MANAGEMENT ---
  uploadAgentPropertyImages = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

      const property = await this.propertyService.uploadAgentPropertyImages(
        agentId, 
        propertyId, 
        category as keyof PropertyImages, 
        imageUrls
      );
      
      res.json({
        success: true,
        message: 'Images uploaded successfully by agent',
        data: property
      });
    } catch (error: any) {
      logger.error('Failed to upload agent property images', 'PropertyController', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to upload images'
      });
    }
  };

  // --- AGENT GUEST MANAGEMENT ---
  getAgentGuests = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const agentId = parseInt(req.user.userId);
      const filters: GuestSearchFilters = {
        search: req.query.search as string,
        verificationStatus: req.query.verificationStatus as 'verified' | 'pending' | 'unverified',
        bookingStatus: req.query.bookingStatus as 'active' | 'past' | 'upcoming',
        sortBy: req.query.sortBy as 'name' | 'bookings' | 'spending' | 'joinDate',
        sortOrder: req.query.sortOrder as 'asc' | 'desc',
        dateRange: req.query.startDate && req.query.endDate ? {
          start: req.query.startDate as string,
          end: req.query.endDate as string
        } : undefined
      };

      Object.keys(filters).forEach(key => {
        if (filters[key as keyof GuestSearchFilters] === undefined) {
          delete filters[key as keyof GuestSearchFilters];
        }
      });

      const guests = await this.propertyService.getAgentGuests(agentId, filters);
      
      res.json({
        success: true,
        message: 'Agent guests retrieved successfully',
        data: guests
      });
    } catch (error: any) {
      logger.error('Failed to fetch agent guests', 'PropertyController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve agent guests'
      });
    }
  };

  getClientGuests = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const agentId = parseInt(req.user.userId);
      const clientId = parseInt(req.params.clientId);

      if (isNaN(clientId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid client ID'
        });
        return;
      }

      const guests = await this.propertyService.getClientGuests(agentId, clientId);
      
      res.json({
        success: true,
        message: 'Client guests retrieved successfully',
        data: guests
      });
    } catch (error: any) {
      logger.error('Failed to fetch client guests', 'PropertyController', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to retrieve client guests'
      });
    }
  };

  // --- AGENT REVIEW MANAGEMENT ---
  getAgentPropertyReviews = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      if (isNaN(propertyId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid property ID'
        });
        return;
      }

      const result = await this.propertyService.getAgentPropertyReviews(agentId, propertyId, page, limit);
      
      res.json({
        success: true,
        message: 'Agent property reviews retrieved successfully',
        data: result
      });
    } catch (error: any) {
      logger.error('Failed to fetch agent property reviews', 'PropertyController', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to retrieve reviews'
      });
    }
  };

  getAgentReviewsSummary = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const agentId = parseInt(req.user.userId);
      const summary = await this.propertyService.getAgentReviewsSummary(agentId);
      
      res.json({
        success: true,
        message: 'Agent reviews summary retrieved successfully',
        data: summary
      });
    } catch (error: any) {
      logger.error('Failed to fetch agent reviews summary', 'PropertyController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve reviews summary'
      });
    }
  };

  // --- AGENT AS HOST ENDPOINTS ---
  createAgentOwnProperty = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const agentId = parseInt(req.user.userId);
      const propertyData: CreatePropertyDto = req.body;

      const property = await this.propertyService.createAgentOwnProperty(agentId, propertyData);
      
      res.status(201).json({
        success: true,
        message: 'Agent property created successfully',
        data: property
      });
    } catch (error: any) {
      logger.error('Failed to create agent own property', 'PropertyController', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to create property'
      });
    }
  };

  getAgentOwnProperties = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const agentId = parseInt(req.user.userId);
      const status = req.query.status as string;
      
      const filters: Partial<PropertySearchFilters> = {};
      if (status) {
        filters.status = status as PropertyStatus;
      }
      
      const properties = await this.propertyService.getAgentOwnProperties(agentId, filters);
      
      res.json({
        success: true,
        message: 'Agent owned properties retrieved successfully',
        data: properties
      });
    } catch (error: any) {
      logger.error('Failed to fetch agent own properties', 'PropertyController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve properties'
      });
    }
  };

  getAgentOwnPropertyBookings = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

      const bookings = await this.propertyService.getAgentOwnPropertyBookings(agentId, propertyId);
      
      res.json({
        success: true,
        message: 'Agent property bookings retrieved successfully',
        data: bookings
      });
    } catch (error: any) {
      logger.error('Failed to fetch agent own property bookings', 'PropertyController', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to retrieve bookings'
      });
    }
  };

  getAgentOwnPropertyGuests = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const agentId = parseInt(req.user.userId);
      const propertyId = req.query.propertyId ? parseInt(req.query.propertyId as string) : undefined;

      const guests = await this.propertyService.getAgentOwnPropertyGuests(agentId, propertyId);
      
      res.json({
        success: true,
        message: 'Agent property guests retrieved successfully',
        data: guests
      });
    } catch (error: any) {
      logger.error('Failed to fetch agent property guests', 'PropertyController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve guests'
      });
    }
  };

  getAllAgentProperties = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const agentId = parseInt(req.user.userId);
      const filters = {
        status: req.query.status as string,
        search: req.query.search as string,
        sortBy: req.query.sortBy as string,
        sortOrder: req.query.sortOrder as string
      };

      const result = await this.propertyService.getAllAgentProperties(agentId, filters);
      
      res.json({
        success: true,
        message: 'All agent properties retrieved successfully',
        data: result
      });
    } catch (error: any) {
      logger.error('Failed to fetch all agent properties', 'PropertyController', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve properties'
      });
    }
  };

  // --- ENHANCED AGENT KPI ENDPOINTS ---
  getEnhancedAgentDashboard = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const agentId = parseInt(req.user.userId);
      const dashboard = await this.propertyService.getEnhancedAgentDashboard(agentId);
      
      res.json({
        success: true,
        message: 'Enhanced agent dashboard retrieved successfully',
        data: dashboard
      });
    } catch (error: any) {
      logger.error('Failed to fetch enhanced agent dashboard', 'PropertyController', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch enhanced dashboard data'
      });
    }
  };

  getAdditionalAgentKPIs = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const agentId = parseInt(req.user.userId);
      const additionalKPIs = await this.propertyService.getAdditionalAgentKPIs(agentId);
      
      res.json({
        success: true,
        message: 'Additional KPIs retrieved successfully',
        data: {
          kpis: additionalKPIs,
          calculatedAt: new Date().toISOString()
        }
      });
    } catch (error: any) {
      logger.error('Failed to fetch additional KPIs', 'PropertyController', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch additional KPIs'
      });
    }
  };

  getAgentPerformanceTrends = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const agentId = parseInt(req.user.userId);
      const trends = await this.propertyService.getAgentPerformanceTrends(agentId);
      
      res.json({
        success: true,
        message: 'Performance trends retrieved successfully',
        data: trends
      });
    } catch (error: any) {
      logger.error('Failed to fetch performance trends', 'PropertyController', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch performance trends'
      });
    }
  };

  getAgentCompetitiveMetrics = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const agentId = parseInt(req.user.userId);
      const competitiveMetrics = await this.propertyService.getAgentCompetitiveMetrics(agentId);
      
      res.json({
        success: true,
        message: 'Competitive metrics retrieved successfully',
        data: competitiveMetrics
      });
    } catch (error: any) {
      logger.error('Failed to fetch competitive metrics', 'PropertyController', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch competitive metrics'
      });
    }
  };

  getAgentClientSegmentation = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const agentId = parseInt(req.user.userId);
      const segmentation = await this.propertyService.getAgentClientSegmentation(agentId);
      
      res.json({
        success: true,
        message: 'Client segmentation retrieved successfully',
        data: segmentation
      });
    } catch (error: any) {
      logger.error('Failed to fetch client segmentation', 'PropertyController', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch client segmentation'
      });
    }
  };

  getIndividualAgentKPI = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const agentId = parseInt(req.user.userId);
      const { kpi } = req.params;
      const { timeRange = 'month' } = req.query;
      
      const startDate = new Date();
      switch (timeRange) {
        case 'week':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case 'quarter':
          startDate.setMonth(startDate.getMonth() - 3);
          break;
        case 'year':
          startDate.setFullYear(startDate.getFullYear() - 1);
          break;
        default:
          startDate.setMonth(startDate.getMonth() - 1);
      }

      let kpiData;
      
      switch (kpi) {
        case 'conversion-rate':
          kpiData = await this.propertyService.getAgentConversionRate(agentId, startDate);
          break;
        case 'response-time':
          kpiData = await this.propertyService.getAgentAverageResponseTime(agentId, startDate);
          break;
        case 'retention-rate':
          kpiData = await this.propertyService.getAgentCustomerRetentionRate(agentId);
          break;
        case 'revenue-per-client':
          kpiData = await this.propertyService.getAgentRevenuePerClient(agentId, startDate);
          break;
        case 'success-rate':
          kpiData = await this.propertyService.getAgentBookingSuccessRate(agentId, startDate);
          break;
        case 'portfolio-growth':
          kpiData = await this.propertyService.getAgentPortfolioGrowthRate(agentId);
          break;
        case 'lead-generation':
          kpiData = await this.propertyService.getAgentLeadGenerationRate(agentId, startDate);
          break;
        case 'commission-growth':
          kpiData = await this.propertyService.getAgentCommissionGrowthRate(agentId);
          break;
        case 'days-on-market':
          kpiData = await this.propertyService.getAgentAverageDaysOnMarket(agentId);
          break;
        case 'views-to-booking':
          kpiData = await this.propertyService.getAgentPropertyViewsToBookingRatio(agentId, startDate);
          break;
        case 'satisfaction-score':
          kpiData = await this.propertyService.getAgentClientSatisfactionScore(agentId);
          break;
        case 'market-penetration':
          kpiData = await this.propertyService.getAgentMarketPenetration(agentId);
          break;
        case 'utilization-rate':
          kpiData = await this.propertyService.getAgentPropertyUtilizationRate(agentId);
          break;
        case 'cross-selling':
          kpiData = await this.propertyService.getAgentCrossSellingSuccess(agentId, startDate);
          break;
        default:
          res.status(400).json({
            success: false,
            message: 'Invalid KPI requested'
          });
          return;
      }
      
      res.json({
        success: true,
        message: 'Individual KPI retrieved successfully',
        data: {
          kpi,
          value: kpiData,
          timeRange,
          calculatedAt: new Date().toISOString()
        }
      });
    } catch (error: any) {
      logger.error('Failed to fetch individual KPI', 'PropertyController', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch KPI data'
      });
    }
  };
}