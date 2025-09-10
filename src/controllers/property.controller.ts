import { Request, Response } from 'express';
import { PropertyService } from '../services/property.service';
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

  // Additional methods to add to PropertyController class

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

    // Remove undefined values
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
    console.error('Error fetching guests:', error);
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
    console.error('Error fetching guest details:', error);
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

    // Remove undefined values
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
    console.error('Error fetching host bookings:', error);
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
    console.error('Error updating booking:', error);
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
    console.error('Error fetching booking calendar:', error);
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
    console.error('Error fetching earnings overview:', error);
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
    console.error('Error fetching earnings breakdown:', error);
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
    console.error('Error fetching analytics:', error);
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
    console.error('Error fetching enhanced dashboard:', error);
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
    console.error('Error updating property availability:', error);
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
    console.error('Error blocking dates:', error);
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
    console.error('Error updating property pricing:', error);
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
    console.error('Error in bulk update:', error);
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
    console.error('Error fetching quick stats:', error);
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
    console.error('Error fetching recent activity:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve recent activity'
    });
  }
};

// Add these methods to your PropertyController class

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
    console.error('Error fetching agent dashboard:', error);
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

    // Remove undefined values
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
    console.error('Error fetching agent properties:', error);
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
    console.error('Error fetching agent property performance:', error);
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
    console.error('Error fetching agent property details:', error);
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
    console.error('Error updating agent property:', error);
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
    console.error('Error fetching agent property bookings:', error);
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

    // Ensure propertyId in body matches URL param
    bookingData.propertyId = propertyId;

    const booking = await this.propertyService.createAgentBooking(agentId, bookingData);
    
    res.status(201).json({
      success: true,
      message: 'Booking created successfully by agent',
      data: booking
    });
  } catch (error: any) {
    console.error('Error creating agent booking:', error);
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

    // Remove undefined values
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
    console.error('Error fetching agent bookings:', error);
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
    console.error('Error fetching agent booking calendar:', error);
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
    console.error('Error updating agent booking:', error);
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
    console.error('Error fetching agent property analytics:', error);
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
    console.error('Error fetching agent properties analytics summary:', error);
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
    console.error('Error fetching agent earnings:', error);
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
    console.error('Error fetching agent earnings breakdown:', error);
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
    console.error('Error fetching client properties:', error);
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
    console.error('Error creating client property:', error);
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
    console.error('Error uploading agent property images:', error);
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

    // Remove undefined values
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
    console.error('Error fetching agent guests:', error);
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
    console.error('Error fetching client guests:', error);
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
    console.error('Error fetching agent property reviews:', error);
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
    console.error('Error fetching agent reviews summary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve reviews summary'
    });
  }
};
}