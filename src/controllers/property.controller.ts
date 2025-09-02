import { Request, Response } from 'express';
import { PropertyService } from '../services/property.service';
import { 
  CreatePropertyDto, 
  UpdatePropertyDto, 
  PropertySearchFilters,
  BookingRequest,
  CreateReviewDto,
  PropertyImages,
  PropertyStatus
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

      // Validate required fields
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
    } catch (error: any) {
      console.error('Error creating property:', error);
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
      console.error('Error updating property:', error);
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
      console.error('Error deleting property:', error);
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
      console.error('Error fetching property:', error);
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

      // Remove undefined values
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
      console.error('Error searching properties:', error);
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
      
      // Define valid status values based on your PropertyStatus type
      const validStatuses: PropertyStatus[] = ['active', 'inactive', 'pending', 'suspended', 'draft'];
      
      // Validate and create filters
      let filters: Partial<PropertySearchFilters> | undefined = undefined;
      
      if (status) {
        // Validate that status is a valid PropertyStatus value
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
      console.error('Error fetching host properties:', error);
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
      console.error('Error fetching featured properties:', error);
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
      console.error('Error fetching similar properties:', error);
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

      // Validate required fields
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
    } catch (error: any) {
      console.error('Error creating booking:', error);
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
      console.error('Error fetching property bookings:', error);
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
  } catch (error: any) {
    console.error('Error creating review:', error);
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
      console.error('Error fetching property reviews:', error);
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
      console.error('Error uploading property images:', error);
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
      console.error('Error removing property image:', error);
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
      console.error('Error activating property:', error);
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
      console.error('Error deactivating property:', error);
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
      console.error('Error fetching host dashboard:', error);
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
      console.error('Error fetching location suggestions:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve location suggestions'
      });
    }
  };
}