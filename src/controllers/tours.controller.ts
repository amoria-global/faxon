import { Request, Response } from 'express';
import { TourService } from '../services/tours.service';
import { 
  CreateTourDto, 
  UpdateTourDto, 
  TourSearchFilters,
  TourBookingRequest,
  CreateTourReviewDto,
  TourImages,
  TourBookingFilters,
  TourBookingStatus,
  TourBookingUpdateDto,
  CreateTourScheduleDto,
  UpdateTourScheduleDto,
  TourGuideFilters,
  CreateTourMessageDto
} from '../types/tours.types';

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
    userType?: string;
  };
}

export class TourController {
  private tourService: TourService;

  constructor() {
    this.tourService = new TourService();
  }

  // --- PUBLIC TOUR ROUTES ---
  searchTours = async (req: Request, res: Response): Promise<void> => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      
      const filters: TourSearchFilters = {
        location: req.query.location as string,
        category: req.query.category as string,
        type: req.query.type as string,
        difficulty: req.query.difficulty as any,
        minPrice: req.query.minPrice ? parseFloat(req.query.minPrice as string) : undefined,
        maxPrice: req.query.maxPrice ? parseFloat(req.query.maxPrice as string) : undefined,
        minDuration: req.query.minDuration ? parseFloat(req.query.minDuration as string) : undefined,
        maxDuration: req.query.maxDuration ? parseFloat(req.query.maxDuration as string) : undefined,
        date: req.query.date as string,
        groupSize: req.query.groupSize ? parseInt(req.query.groupSize as string) : undefined,
        tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
        rating: req.query.rating ? parseFloat(req.query.rating as string) : undefined,
        search: req.query.search as string,
        sortBy: req.query.sortBy as any,
        sortOrder: req.query.sortOrder as 'asc' | 'desc',
        hasAvailability: req.query.hasAvailability === 'true'
      };

      // Remove undefined values
      Object.keys(filters).forEach(key => {
        if (filters[key as keyof TourSearchFilters] === undefined) {
          delete filters[key as keyof TourSearchFilters];
        }
      });

      const result = await this.tourService.searchTours(filters, page, limit);
      
      res.json({
        success: true,
        message: 'Tours retrieved successfully',
        data: result
      });
    } catch (error: any) {
      console.error('Error searching tours:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to search tours'
      });
    }
  };

  getTourById = async (req: Request, res: Response): Promise<void> => {
    try {
      const tourId = req.params.id;

      if (!tourId) {
        res.status(400).json({
          success: false,
          message: 'Tour ID is required'
        });
        return;
      }

      const tour = await this.tourService.getTourById(tourId);
      
      if (!tour) {
        res.status(404).json({
          success: false,
          message: 'Tour not found'
        });
        return;
      }

      res.json({
        success: true,
        message: 'Tour retrieved successfully',
        data: tour
      });
    } catch (error: any) {
      console.error('Error fetching tour:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve tour'
      });
    }
  };

  getFeaturedTours = async (req: Request, res: Response): Promise<void> => {
    try {
      const limit = parseInt(req.query.limit as string) || 8;
      const tours = await this.tourService.getFeaturedTours(limit);
      
      res.json({
        success: true,
        message: 'Featured tours retrieved successfully',
        data: tours
      });
    } catch (error: any) {
      console.error('Error fetching featured tours:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve featured tours'
      });
    }
  };

  getTourReviews = async (req: Request, res: Response): Promise<void> => {
    try {
      const tourId = req.params.id;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      if (!tourId) {
        res.status(400).json({
          success: false,
          message: 'Tour ID is required'
        });
        return;
      }

      const result = await this.tourService.getTourReviews(tourId, page, limit);
      
      res.json({
        success: true,
        message: 'Reviews retrieved successfully',
        data: result
      });
    } catch (error: any) {
      console.error('Error fetching tour reviews:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve reviews'
      });
    }
  };

  getTourCategories = async (req: Request, res: Response): Promise<void> => {
    try {
      const categories = await this.tourService.getTourCategories();
      
      res.json({
        success: true,
        message: 'Tour categories retrieved successfully',
        data: categories
      });
    } catch (error: any) {
      console.error('Error fetching tour categories:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve categories'
      });
    }
  };

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

      const suggestions = await this.tourService.getLocationSuggestions(query);
      
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

  searchTourGuides = async (req: Request, res: Response): Promise<void> => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      
      const filters: TourGuideFilters = {
        search: req.query.search as string,
        specialization: req.query.specialization as string,
        language: req.query.language as string,
        experience: req.query.experience ? parseInt(req.query.experience as string) : undefined,
        rating: req.query.rating ? parseFloat(req.query.rating as string) : undefined,
        isVerified: req.query.isVerified === 'true',
        location: req.query.location as string,
        sortBy: req.query.sortBy as any,
        sortOrder: req.query.sortOrder as 'asc' | 'desc'
      };

      // Remove undefined values
      Object.keys(filters).forEach(key => {
        if (filters[key as keyof TourGuideFilters] === undefined) {
          delete filters[key as keyof TourGuideFilters];
        }
      });

      const result = await this.tourService.searchTourGuides(filters, page, limit);
      
      res.json({
        success: true,
        message: 'Tour guides retrieved successfully',
        data: result
      });
    } catch (error: any) {
      console.error('Error searching tour guides:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to search tour guides'
      });
    }
  };

  // --- GUEST ENDPOINTS ---
  createTourBooking = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const userId = parseInt(req.user.userId);
      const bookingData: TourBookingRequest = req.body;

      // Validate required fields
      const requiredFields = ['tourId', 'scheduleId', 'numberOfParticipants', 'participants', 'totalAmount'];
      const missingFields = requiredFields.filter(field => !bookingData[field as keyof TourBookingRequest]);
      
      if (missingFields.length > 0) {
        res.status(400).json({
          success: false,
          message: 'Missing required fields',
          errors: missingFields.map(field => `${field} is required`)
        });
        return;
      }

      // Validate participant count
      if (bookingData.numberOfParticipants !== bookingData.participants.length) {
        res.status(400).json({
          success: false,
          message: 'Number of participants must match participants array length'
        });
        return;
      }

      const booking = await this.tourService.createTourBooking(userId, bookingData);
      
      res.status(201).json({
        success: true,
        message: 'Tour booking created successfully',
        data: booking
      });
    } catch (error: any) {
      console.error('Error creating tour booking:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to create tour booking'
      });
    }
  };

  getMyTourBookings = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const userId = parseInt(req.user.userId);
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const filters: TourBookingFilters = {
        status: req.query.status ? (req.query.status as string).split(',') as TourBookingStatus[] : undefined,
        tourId: req.query.tourId as string,
        dateRange: req.query.startDate && req.query.endDate ? {
          start: req.query.startDate as string,
          end: req.query.endDate as string
        } : undefined,
        sortBy: req.query.sortBy as any,
        sortOrder: req.query.sortOrder as 'asc' | 'desc'
      };

      // Remove undefined values
      Object.keys(filters).forEach(key => {
        if (filters[key as keyof TourBookingFilters] === undefined) {
          delete filters[key as keyof TourBookingFilters];
        }
      });

      const result = await this.tourService.getUserTourBookings(userId, filters, page, limit);
      
      res.json({
        success: true,
        message: 'Tour bookings retrieved successfully',
        data: result
      });
    } catch (error: any) {
      console.error('Error fetching user tour bookings:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve tour bookings'
      });
    }
  };

  createTourReview = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const userId = parseInt(req.user.userId);
      const reviewData: CreateTourReviewDto = req.body;

      // Validate required fields
      if (!reviewData.bookingId || !reviewData.tourId || !reviewData.rating || !reviewData.comment) {
        res.status(400).json({
          success: false,
          message: 'Booking ID, tour ID, rating, and comment are required'
        });
        return;
      }

      if (reviewData.rating < 1 || reviewData.rating > 5) {
        res.status(400).json({
          success: false,
          message: 'Rating must be between 1 and 5'
        });
        return;
      }

      const review = await this.tourService.createTourReview(userId, reviewData);

      res.status(201).json({
        success: true,
        message: 'Review created successfully',
        data: review
      });
    } catch (error: any) {
      console.error('Error creating tour review:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to create review'
      });
    }
  };

  // --- TOUR GUIDE ENDPOINTS ---
  getTourGuideDashboard = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const tourGuideId = parseInt(req.user.userId);
      const dashboard = await this.tourService.getTourGuideDashboard(tourGuideId);
      
      res.json({
        success: true,
        message: 'Dashboard retrieved successfully',
        data: dashboard
      });
    } catch (error: any) {
      console.error('Error fetching tour guide dashboard:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve dashboard'
      });
    }
  };

  getEnhancedTourGuideDashboard = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const tourGuideId = parseInt(req.user.userId);
      const dashboard = await this.tourService.getEnhancedTourGuideDashboard(tourGuideId);
      
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

  createTour = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const tourGuideId = parseInt(req.user.userId);
      const tourData: CreateTourDto = req.body;

      // Validate required fields
      const requiredFields = ['title', 'description', 'shortDescription', 'category', 'type', 'duration', 'maxGroupSize', 'price', 'locationCity', 'locationCountry', 'meetingPoint'];
      const missingFields = requiredFields.filter(field => !tourData[field as keyof CreateTourDto]);
      
      if (missingFields.length > 0) {
        res.status(400).json({
          success: false,
          message: 'Missing required fields',
          errors: missingFields.map(field => `${field} is required`)
        });
        return;
      }

      const tour = await this.tourService.createTour(tourGuideId, tourData);
      
      res.status(201).json({
        success: true,
        message: 'Tour created successfully',
        data: tour
      });
    } catch (error: any) {
      console.error('Error creating tour:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to create tour'
      });
    }
  };

  updateTour = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
      const updateData: UpdateTourDto = req.body;

      if (!tourId) {
        res.status(400).json({
          success: false,
          message: 'Tour ID is required'
        });
        return;
      }

      const tour = await this.tourService.updateTour(tourId, tourGuideId, updateData);
      
      res.json({
        success: true,
        message: 'Tour updated successfully',
        data: tour
      });
    } catch (error: any) {
      console.error('Error updating tour:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to update tour'
      });
    }
  };

  deleteTour = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

      if (!tourId) {
        res.status(400).json({
          success: false,
          message: 'Tour ID is required'
        });
        return;
      }

      await this.tourService.deleteTour(tourId, tourGuideId);
      
      res.json({
        success: true,
        message: 'Tour deleted successfully'
      });
    } catch (error: any) {
      console.error('Error deleting tour:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to delete tour'
      });
    }
  };

  getMyTours = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const tourGuideId = parseInt(req.user.userId);
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      
      const filters: TourSearchFilters = {
        search: req.query.search as string,
        category: req.query.category as string,
        isActive: req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined,
        sortBy: req.query.sortBy as any,
        sortOrder: req.query.sortOrder as 'asc' | 'desc'
      };

      // Remove undefined values
      Object.keys(filters).forEach(key => {
        if (filters[key as keyof TourSearchFilters] === undefined) {
          delete filters[key as keyof TourSearchFilters];
        }
      });

      const result = await this.tourService.getToursByGuide(tourGuideId, filters, page, limit);
      
      res.json({
        success: true,
        message: 'Tours retrieved successfully',
        data: result
      });
    } catch (error: any) {
      console.error('Error fetching guide tours:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve tours'
      });
    }
  };

  // --- TOUR SCHEDULE MANAGEMENT ---
  createTourSchedule = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
      const scheduleData: CreateTourScheduleDto = req.body;

      if (!tourId) {
        res.status(400).json({
          success: false,
          message: 'Tour ID is required'
        });
        return;
      }

      const schedule = await this.tourService.createTourSchedule(tourId, tourGuideId, scheduleData);
      
      res.status(201).json({
        success: true,
        message: 'Tour schedule created successfully',
        data: schedule
      });
    } catch (error: any) {
      console.error('Error creating tour schedule:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to create tour schedule'
      });
    }
  };

  updateTourSchedule = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const scheduleId = req.params.scheduleId;
      const tourGuideId = parseInt(req.user.userId);
      const updateData: UpdateTourScheduleDto = req.body;

      if (!scheduleId) {
        res.status(400).json({
          success: false,
          message: 'Schedule ID is required'
        });
        return;
      }

      const schedule = await this.tourService.updateTourSchedule(scheduleId, tourGuideId, updateData);
      
      res.json({
        success: true,
        message: 'Tour schedule updated successfully',
        data: schedule
      });
    } catch (error: any) {
      console.error('Error updating tour schedule:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to update tour schedule'
      });
    }
  };

  deleteTourSchedule = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const scheduleId = req.params.scheduleId;
      const tourGuideId = parseInt(req.user.userId);

      if (!scheduleId) {
        res.status(400).json({
          success: false,
          message: 'Schedule ID is required'
        });
        return;
      }

      await this.tourService.deleteTourSchedule(scheduleId, tourGuideId);
      
      res.json({
        success: true,
        message: 'Tour schedule deleted successfully'
      });
    } catch (error: any) {
      console.error('Error deleting tour schedule:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to delete tour schedule'
      });
    }
  };

  getTourSchedules = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

      if (!tourId) {
        res.status(400).json({
          success: false,
          message: 'Tour ID is required'
        });
        return;
      }

      const schedules = await this.tourService.getTourSchedules(tourId, tourGuideId);
      
      res.json({
        success: true,
        message: 'Tour schedules retrieved successfully',
        data: schedules
      });
    } catch (error: any) {
      console.error('Error fetching tour schedules:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to retrieve tour schedules'
      });
    }
  };

  // --- BOOKING MANAGEMENT ---
  getTourBookings = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const tourGuideId = parseInt(req.user.userId);
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const filters: TourBookingFilters = {
        status: req.query.status ? (req.query.status as string).split(',') as TourBookingStatus[] : undefined,
        tourId: req.query.tourId as string,
        dateRange: req.query.startDate && req.query.endDate ? {
          start: req.query.startDate as string,
          end: req.query.endDate as string
        } : undefined,
        sortBy: req.query.sortBy as any,
        sortOrder: req.query.sortOrder as 'asc' | 'desc'
      };

      // Remove undefined values
      Object.keys(filters).forEach(key => {
        if (filters[key as keyof TourBookingFilters] === undefined) {
          delete filters[key as keyof TourBookingFilters];
        }
      });

      const result = await this.tourService.getTourGuideBookings(tourGuideId, filters, page, limit);
      
      res.json({
        success: true,
        message: 'Tour bookings retrieved successfully',
        data: result
      });
    } catch (error: any) {
      console.error('Error fetching tour guide bookings:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve tour bookings'
      });
    }
  };

  updateTourBooking = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const bookingId = req.params.bookingId;
      const tourGuideId = parseInt(req.user.userId);
      const updateData: TourBookingUpdateDto = req.body;

      if (!bookingId) {
        res.status(400).json({
          success: false,
          message: 'Booking ID is required'
        });
        return;
      }

      const booking = await this.tourService.updateTourBooking(bookingId, tourGuideId, updateData);
      
      res.json({
        success: true,
        message: 'Tour booking updated successfully',
        data: booking
      });
    } catch (error: any) {
      console.error('Error updating tour booking:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to update tour booking'
      });
    }
  };

  getTourBookingCalendar = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const tourGuideId = parseInt(req.user.userId);
      const year = parseInt(req.query.year as string) || new Date().getFullYear();
      const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;

      if (month < 1 || month > 12) {
        res.status(400).json({
          success: false,
          message: 'Month must be between 1 and 12'
        });
        return;
      }

      const calendar = await this.tourService.getTourBookingCalendar(tourGuideId, year, month);
      
      res.json({
        success: true,
        message: 'Tour booking calendar retrieved successfully',
        data: calendar
      });
    } catch (error: any) {
      console.error('Error fetching tour booking calendar:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve tour booking calendar'
      });
    }
  };

  // --- MEDIA MANAGEMENT ---
  uploadTourImages = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
      const { category, imageUrls } = req.body;

      if (!tourId) {
        res.status(400).json({
          success: false,
          message: 'Tour ID is required'
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

      const tour = await this.tourService.uploadTourImages(
        tourId, 
        tourGuideId, 
        category as keyof TourImages, 
        imageUrls
      );
      
      res.json({
        success: true,
        message: 'Images uploaded successfully',
        data: tour
      });
    } catch (error: any) {
      console.error('Error uploading tour images:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to upload images'
      });
    }
  };

  removeTourImage = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
      const { category, imageUrl } = req.body;

      if (!tourId) {
        res.status(400).json({
          success: false,
          message: 'Tour ID is required'
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

      const tour = await this.tourService.removeTourImage(
        tourId, 
        tourGuideId, 
        category as keyof TourImages, 
        imageUrl
      );
      
      res.json({
        success: true,
        message: 'Image removed successfully',
        data: tour
      });
    } catch (error: any) {
      console.error('Error removing tour image:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to remove image'
      });
    }
  };

  // --- EARNINGS ---
  getTourGuideEarnings = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const tourGuideId = parseInt(req.user.userId);
      const timeRange = (req.query.timeRange as 'week' | 'month' | 'quarter' | 'year') || 'month';

      const earnings = await this.tourService.getTourGuideEarnings(tourGuideId, timeRange);
      
      res.json({
        success: true,
        message: 'Earnings retrieved successfully',
        data: earnings
      });
    } catch (error: any) {
      console.error('Error fetching tour guide earnings:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve earnings'
      });
    }
  };

  getTourGuideEarningsBreakdown = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const tourGuideId = parseInt(req.user.userId);
      const breakdown = await this.tourService.getTourGuideEarningsBreakdown(tourGuideId);
      
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

  // --- ANALYTICS ---
  getTourGuideAnalytics = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const tourGuideId = parseInt(req.user.userId);
      const timeRange = (req.query.timeRange as 'week' | 'month' | 'quarter' | 'year') || 'month';

      const analytics = await this.tourService.getTourGuideAnalytics(tourGuideId, timeRange);
      
      res.json({
        success: true,
        message: 'Analytics retrieved successfully',
        data: analytics
      });
    } catch (error: any) {
      console.error('Error fetching tour guide analytics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve analytics'
      });
    }
  };

  getTourAnalytics = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
      const timeRange = (req.query.timeRange as 'week' | 'month' | 'quarter' | 'year') || 'month';

      if (!tourId) {
        res.status(400).json({
          success: false,
          message: 'Tour ID is required'
        });
        return;
      }

      const analytics = await this.tourService.getTourAnalytics(tourId, tourGuideId, timeRange);
      
      res.json({
        success: true,
        message: 'Tour analytics retrieved successfully',
        data: analytics
      });
    } catch (error: any) {
      console.error('Error fetching tour analytics:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to retrieve tour analytics'
      });
    }
  };

  // --- MESSAGING ---
  sendTourMessage = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const senderId = parseInt(req.user.userId);
      const messageData: CreateTourMessageDto = req.body;

      // Validate required fields
      if (!messageData.receiverId || !messageData.message) {
        res.status(400).json({
          success: false,
          message: 'Receiver ID and message are required'
        });
        return;
      }

      const message = await this.tourService.sendTourMessage(senderId, messageData);
      
      res.status(201).json({
        success: true,
        message: 'Message sent successfully',
        data: message
      });
    } catch (error: any) {
      console.error('Error sending tour message:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to send message'
      });
    }
  };

  getTourMessages = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const userId = parseInt(req.user.userId);
      const conversationWith = req.query.conversationWith ? parseInt(req.query.conversationWith as string) : undefined;
      const bookingId = req.query.bookingId as string;
      const tourId = req.query.tourId as string;

      const messages = await this.tourService.getTourMessages(userId, conversationWith, bookingId, tourId);
      
      res.json({
        success: true,
        message: 'Messages retrieved successfully',
        data: messages
      });
    } catch (error: any) {
      console.error('Error fetching tour messages:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve messages'
      });
    }
  };

  // --- STATUS MANAGEMENT ---
  activateTour = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

      if (!tourId) {
        res.status(400).json({
          success: false,
          message: 'Tour ID is required'
        });
        return;
      }

      const tour = await this.tourService.activateTour(tourId, tourGuideId);
      
      res.json({
        success: true,
        message: 'Tour activated successfully',
        data: tour
      });
    } catch (error: any) {
      console.error('Error activating tour:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to activate tour'
      });
    }
  };

  deactivateTour = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

      if (!tourId) {
        res.status(400).json({
          success: false,
          message: 'Tour ID is required'
        });
        return;
      }

      const tour = await this.tourService.deactivateTour(tourId, tourGuideId);
      
      res.json({
        success: true,
        message: 'Tour deactivated successfully',
        data: tour
      });
    } catch (error: any) {
      console.error('Error deactivating tour:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to deactivate tour'
      });
    }
  };

  // --- ADMIN ENDPOINTS ---
  getAllTours = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      
      const filters: TourSearchFilters = {
        search: req.query.search as string,
        category: req.query.category as string,
        tourGuideId: req.query.tourGuideId ? parseInt(req.query.tourGuideId as string) : undefined,
        isActive: req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined,
        sortBy: req.query.sortBy as any,
        sortOrder: req.query.sortOrder as 'asc' | 'desc'
      };

      // Remove undefined values
      Object.keys(filters).forEach(key => {
        if (filters[key as keyof TourSearchFilters] === undefined) {
          delete filters[key as keyof TourSearchFilters];
        }
      });

      const result = await this.tourService.getAllTours(filters, page, limit);
      
      res.json({
        success: true,
        message: 'All tours retrieved successfully',
        data: result
      });
    } catch (error: any) {
      console.error('Error fetching all tours:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve tours'
      });
    }
  };

  getAllTourBookings = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const filters: TourBookingFilters = {
        status: req.query.status ? (req.query.status as string).split(',') as TourBookingStatus[] : undefined,
        tourId: req.query.tourId as string,
        tourGuideId: req.query.tourGuideId ? parseInt(req.query.tourGuideId as string) : undefined,
        userId: req.query.userId ? parseInt(req.query.userId as string) : undefined,
        dateRange: req.query.startDate && req.query.endDate ? {
          start: req.query.startDate as string,
          end: req.query.endDate as string
        } : undefined,
        sortBy: req.query.sortBy as any,
        sortOrder: req.query.sortOrder as 'asc' | 'desc'
      };

      // Remove undefined values
      Object.keys(filters).forEach(key => {
        if (filters[key as keyof TourBookingFilters] === undefined) {
          delete filters[key as keyof TourBookingFilters];
        }
      });

      const result = await this.tourService.getAllTourBookings(filters, page, limit);
      
      res.json({
        success: true,
        message: 'All tour bookings retrieved successfully',
        data: result
      });
    } catch (error: any) {
      console.error('Error fetching all tour bookings:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve tour bookings'
      });
    }
  };

  getTourSystemAnalytics = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const timeRange = (req.query.timeRange as string) || 'month';
      const analytics = await this.tourService.getTourSystemAnalytics(timeRange);
      
      res.json({
        success: true,
        message: 'System analytics retrieved successfully',
        data: analytics
      });
    } catch (error: any) {
      console.error('Error fetching system analytics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve system analytics'
      });
    }
  };

  // --- BULK OPERATIONS ---
  bulkUpdateTours = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const { tourIds, operation, data } = req.body;

      if (!Array.isArray(tourIds) || tourIds.length === 0) {
        res.status(400).json({
          success: false,
          message: 'Tour IDs array is required'
        });
        return;
      }

      if (!operation) {
        res.status(400).json({
          success: false,
          message: 'Operation is required'
        });
        return;
      }

      const result = await this.tourService.bulkUpdateTours(tourIds, operation, data);
      
      res.json({
        success: true,
        message: `Bulk operation completed: ${result.successful} successful, ${result.failed} failed`,
        data: result
      });
    } catch (error: any) {
      console.error('Error in bulk update:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to perform bulk update'
      });
    }
  };

  bulkUpdateTourBookings = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const { bookingIds, operation, data } = req.body;

      if (!Array.isArray(bookingIds) || bookingIds.length === 0) {
        res.status(400).json({
          success: false,
          message: 'Booking IDs array is required'
        });
        return;
      }

      if (!operation) {
        res.status(400).json({
          success: false,
          message: 'Operation is required'
        });
        return;
      }

      const result = await this.tourService.bulkUpdateTourBookings(bookingIds, operation, data);
      
      res.json({
        success: true,
        message: `Bulk operation completed: ${result.successful} successful, ${result.failed} failed`,
        data: result
      });
    } catch (error: any) {
      console.error('Error in bulk booking update:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to perform bulk booking update'
      });
    }
  };
}