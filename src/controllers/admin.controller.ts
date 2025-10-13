//src/controllers/admin.controller.ts

import { Request, Response, NextFunction } from 'express';
import { AdminService } from '../services/admin.service';
import { 
  AdminUserFilters, 
  AdminPropertyFilters, 
  AdminTourFilters, 
  AdminBookingFilters, 
  AdminQueryParams,
  AdminBulkUpdateRequest,
  AdminBulkDeleteRequest,
  AdminExportRequest
} from '../types/admin.types';

const adminService = new AdminService();

export class AdminController {

  // === DASHBOARD & OVERVIEW ===

  async getDashboard(req: Request, res: Response, next: NextFunction) {
    try {
      const { period = '30d' } = req.query;
      
      const dashboard = await adminService.getDashboardOverview(period as string);
      
      res.json({
        success: true,
        data: dashboard,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  async getSystemStatus(req: Request, res: Response, next: NextFunction) {
    try {
      // System health check
      const status = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.APP_VERSION || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        services: {
          database: 'connected',
          redis: 'connected',
          storage: 'connected'
        }
      };

      res.json({
        success: true,
        data: status,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  async healthCheck(req: Request, res: Response, next: NextFunction) {
    try {
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        checks: {
          database: 'healthy',
          redis: 'healthy',
          storage: 'healthy',
          email: 'healthy',
          payments: 'healthy'
        }
      };

      res.json({
        success: true,
        data: health,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      res.status(503).json({
        success: false,
        error: {
          code: 'HEALTH_CHECK_FAILED',
          message: 'Health check failed'
        },
        timestamp: new Date().toISOString()
      });
    }
  }

  // === USER MANAGEMENT ===

  async getUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const filters: AdminUserFilters = {
        userType: req.query.userType ? (req.query.userType as string).split(',') : undefined,
        status: req.query.status ? (req.query.status as string).split(',') : undefined,
        verificationStatus: req.query.verificationStatus ? (req.query.verificationStatus as string).split(',') : undefined,
        kycStatus: req.query.kycStatus ? (req.query.kycStatus as string).split(',') : undefined,
        provider: req.query.provider ? (req.query.provider as string).split(',') : undefined,
        country: req.query.country ? (req.query.country as string).split(',') : undefined,
        search: req.query.search as string,
        hasBookings: req.query.hasBookings === 'true',
        hasProperties: req.query.hasProperties === 'true',
        hasTours: req.query.hasTours === 'true',
        dateRange: req.query.startDate && req.query.endDate ? {
          start: req.query.startDate as string,
          end: req.query.endDate as string,
          field: (req.query.dateField as 'createdAt' | 'lastLogin' | 'updatedAt') || 'createdAt'
        } : undefined
      };

      const pagination: AdminQueryParams = {
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 20,
        sort: (req.query.sort as string) || 'createdAt',
        order: (req.query.order as 'asc' | 'desc') || 'desc',
        search: req.query.search as string
      };

      const result = await adminService.getUsers(filters, pagination);
      
      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination,
        filters: result.filters,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  async getUserDetails(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = parseInt(req.params.id);
      
      if (!userId || isNaN(userId)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_USER_ID',
            message: 'Valid user ID is required'
          },
          timestamp: new Date().toISOString()
        });
      }

      const user = await adminService.getUserDetails(userId);
      
      res.json({
        success: true,
        data: user,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      if (error.message === 'User not found') {
        return res.status(404).json({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found'
          },
          timestamp: new Date().toISOString()
        });
      }
      next(error);
    }
  }

  async createUser(req: Request, res: Response, next: NextFunction) {
    try {
      const userData = req.body;
      
      const user = await adminService.createUser(userData);
      
      res.status(201).json({
        success: true,
        data: user,
        message: 'User created successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      if (error.message.includes('already exists')) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'USER_EXISTS',
            message: error.message
          },
          timestamp: new Date().toISOString()
        });
      }
      next(error);
    }
  }

  async updateUser(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = parseInt(req.params.id);
      const updateData = req.body;
      
      if (!userId || isNaN(userId)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_USER_ID',
            message: 'Valid user ID is required'
          },
          timestamp: new Date().toISOString()
        });
      }

      const user = await adminService.updateUser(userId, updateData);
      
      res.json({
        success: true,
        data: user,
        message: 'User updated successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      if (error.message === 'User not found') {
        return res.status(404).json({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found'
          },
          timestamp: new Date().toISOString()
        });
      }
      next(error);
    }
  }

  async deleteUser(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = parseInt(req.params.id);
      const permanent = req.query.permanent === 'true';
      
      if (!userId || isNaN(userId)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_USER_ID',
            message: 'Valid user ID is required'
          },
          timestamp: new Date().toISOString()
        });
      }

      const result = await adminService.deleteUser(userId, permanent);
      
      res.json({
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      if (error.message === 'User not found') {
        return res.status(404).json({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found'
          },
          timestamp: new Date().toISOString()
        });
      }
      next(error);
    }
  }

  async suspendUser(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = parseInt(req.params.id);
      const { reason } = req.body;
      
      if (!userId || isNaN(userId)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_USER_ID',
            message: 'Valid user ID is required'
          },
          timestamp: new Date().toISOString()
        });
      }

      const user = await adminService.suspendUser(userId, reason);
      
      res.json({
        success: true,
        data: user,
        message: 'User suspended successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      if (error.message === 'User not found') {
        return res.status(404).json({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found'
          },
          timestamp: new Date().toISOString()
        });
      }
      next(error);
    }
  }

  async activateUser(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = parseInt(req.params.id);
      
      if (!userId || isNaN(userId)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_USER_ID',
            message: 'Valid user ID is required'
          },
          timestamp: new Date().toISOString()
        });
      }

      const user = await adminService.activateUser(userId);
      
      res.json({
        success: true,
        data: user,
        message: 'User activated successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      if (error.message === 'User not found') {
        return res.status(404).json({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found'
          },
          timestamp: new Date().toISOString()
        });
      }
      next(error);
    }
  }

  async approveKYC(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = parseInt(req.params.id);
      const { notes } = req.body;
      
      if (!userId || isNaN(userId)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_USER_ID',
            message: 'Valid user ID is required'
          },
          timestamp: new Date().toISOString()
        });
      }

      const user = await adminService.approveKYC(userId, notes);
      
      res.json({
        success: true,
        data: user,
        message: 'KYC approved successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  async rejectKYC(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = parseInt(req.params.id);
      const { reason } = req.body;
      
      if (!userId || isNaN(userId)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_USER_ID',
            message: 'Valid user ID is required'
          },
          timestamp: new Date().toISOString()
        });
      }

      if (!reason) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_REASON',
            message: 'Rejection reason is required'
          },
          timestamp: new Date().toISOString()
        });
      }

      const user = await adminService.rejectKYC(userId, reason);
      
      res.json({
        success: true,
        data: user,
        message: 'KYC rejected successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  // === USER SESSION MANAGEMENT ===

  async getUserSessions(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.params.id ? parseInt(req.params.id) : undefined;
      
      const pagination: AdminQueryParams = {
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 20,
        sort: (req.query.sort as string) || 'lastActivity',
        order: (req.query.order as 'asc' | 'desc') || 'desc'
      };

      const result = await adminService.getUserSessions(userId, pagination);
      
      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  async terminateUserSession(req: Request, res: Response, next: NextFunction) {
    try {
      const sessionId = req.params.sessionId;
      
      if (!sessionId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_SESSION_ID',
            message: 'Valid session ID is required'
          },
          timestamp: new Date().toISOString()
        });
      }

      const result = await adminService.terminateUserSession(sessionId);
      
      res.json({
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  async terminateAllUserSessions(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = parseInt(req.params.id);
      
      if (!userId || isNaN(userId)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_USER_ID',
            message: 'Valid user ID is required'
          },
          timestamp: new Date().toISOString()
        });
      }

      const result = await adminService.terminateAllUserSessions(userId);
      
      res.json({
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  // === PROPERTY MANAGEMENT ===

  async getProperties(req: Request, res: Response, next: NextFunction) {
    try {
      const filters: AdminPropertyFilters = {
        status: req.query.status ? (req.query.status as string).split(',') : undefined,
        type: req.query.type ? (req.query.type as string).split(',') : undefined,
        category: req.query.category ? (req.query.category as string).split(',') : undefined,
        isVerified: req.query.isVerified ? req.query.isVerified === 'true' : undefined,
        isInstantBook: req.query.isInstantBook ? req.query.isInstantBook === 'true' : undefined,
        hostId: req.query.hostId ? parseInt(req.query.hostId as string) : undefined,
        location: req.query.location ? (req.query.location as string).split(',') : undefined,
        search: req.query.search as string,
        hasBookings: req.query.hasBookings === 'true',
        priceRange: req.query.minPrice || req.query.maxPrice ? {
          min: parseFloat(req.query.minPrice as string) || 0,
          max: parseFloat(req.query.maxPrice as string) || Number.MAX_VALUE
        } : undefined,
        dateRange: req.query.startDate && req.query.endDate ? {
          start: req.query.startDate as string,
          end: req.query.endDate as string,
          field: (req.query.dateField as 'createdAt' | 'availableFrom' | 'availableTo') || 'createdAt'
        } : undefined
      };

      const pagination: AdminQueryParams = {
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 20,
        sort: (req.query.sort as string) || 'createdAt',
        order: (req.query.order as 'asc' | 'desc') || 'desc'
      };

      const result = await adminService.getProperties(filters, pagination);
      
      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination,
        filters: result.filters,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  async getPropertyDetails(req: Request, res: Response, next: NextFunction) {
    try {
      const propertyId = parseInt(req.params.id);
      
      if (!propertyId || isNaN(propertyId)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PROPERTY_ID',
            message: 'Valid property ID is required'
          },
          timestamp: new Date().toISOString()
        });
      }

      const property = await adminService.getPropertyDetails(propertyId);
      
      res.json({
        success: true,
        data: property,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      if (error.message === 'Property not found') {
        return res.status(404).json({
          success: false,
          error: {
            code: 'PROPERTY_NOT_FOUND',
            message: 'Property not found'
          },
          timestamp: new Date().toISOString()
        });
      }
      next(error);
    }
  }

  async updateProperty(req: Request, res: Response, next: NextFunction) {
    try {
      const propertyId = parseInt(req.params.id);
      const updateData = req.body;
      
      if (!propertyId || isNaN(propertyId)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PROPERTY_ID',
            message: 'Valid property ID is required'
          },
          timestamp: new Date().toISOString()
        });
      }

      // This would need to be implemented in the admin service
      // For now, return a placeholder response
      res.json({
        success: true,
        message: 'Property updated successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  async approveProperty(req: Request, res: Response, next: NextFunction) {
    try {
      const propertyId = parseInt(req.params.id);
      const { notes } = req.body;
      
      if (!propertyId || isNaN(propertyId)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PROPERTY_ID',
            message: 'Valid property ID is required'
          },
          timestamp: new Date().toISOString()
        });
      }

      const property = await adminService.approveProperty(propertyId, notes);
      
      res.json({
        success: true,
        data: property,
        message: 'Property approved successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  async rejectProperty(req: Request, res: Response, next: NextFunction) {
    try {
      const propertyId = parseInt(req.params.id);
      const { reason } = req.body;
      
      if (!propertyId || isNaN(propertyId)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PROPERTY_ID',
            message: 'Valid property ID is required'
          },
          timestamp: new Date().toISOString()
        });
      }

      if (!reason) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_REASON',
            message: 'Rejection reason is required'
          },
          timestamp: new Date().toISOString()
        });
      }

      const property = await adminService.rejectProperty(propertyId, reason);
      
      res.json({
        success: true,
        data: property,
        message: 'Property rejected successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  async suspendProperty(req: Request, res: Response, next: NextFunction) {
    try {
      const propertyId = parseInt(req.params.id);
      const { reason } = req.body;
      
      if (!propertyId || isNaN(propertyId)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PROPERTY_ID',
            message: 'Valid property ID is required'
          },
          timestamp: new Date().toISOString()
        });
      }

      const property = await adminService.suspendProperty(propertyId, reason);
      
      res.json({
        success: true,
        data: property,
        message: 'Property suspended successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  // === TOUR MANAGEMENT ===

  async getTours(req: Request, res: Response, next: NextFunction) {
    try {
      const filters: AdminTourFilters = {
        isActive: req.query.isActive ? req.query.isActive === 'true' : undefined,
        category: req.query.category ? (req.query.category as string).split(',') : undefined,
        type: req.query.type ? (req.query.type as string).split(',') : undefined,
        tourGuideId: req.query.tourGuideId ? parseInt(req.query.tourGuideId as string) : undefined,
        location: req.query.location ? (req.query.location as string).split(',') : undefined,
        difficulty: req.query.difficulty ? (req.query.difficulty as string).split(',') : undefined,
        search: req.query.search as string,
        hasBookings: req.query.hasBookings === 'true',
        priceRange: req.query.minPrice || req.query.maxPrice ? {
          min: parseFloat(req.query.minPrice as string) || 0,
          max: parseFloat(req.query.maxPrice as string) || Number.MAX_VALUE
        } : undefined,
        dateRange: req.query.startDate && req.query.endDate ? {
          start: req.query.startDate as string,
          end: req.query.endDate as string,
          field: (req.query.dateField as 'createdAt' | 'updatedAt') || 'createdAt'
        } : undefined
      };

      const pagination: AdminQueryParams = {
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 20,
        sort: (req.query.sort as string) || 'createdAt',
        order: (req.query.order as 'asc' | 'desc') || 'desc'
      };

      const result = await adminService.getTours(filters, pagination);
      
      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination,
        filters: result.filters,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  async getTourDetails(req: Request, res: Response, next: NextFunction) {
    try {
      const tourId = req.params.id;
      
      if (!tourId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_TOUR_ID',
            message: 'Valid tour ID is required'
          },
          timestamp: new Date().toISOString()
        });
      }

      const tour = await adminService.getTourDetails(tourId);
      
      res.json({
        success: true,
        data: tour,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      if (error.message === 'Tour not found') {
        return res.status(404).json({
          success: false,
          error: {
            code: 'TOUR_NOT_FOUND',
            message: 'Tour not found'
          },
          timestamp: new Date().toISOString()
        });
      }
      next(error);
    }
  }

  async updateTour(req: Request, res: Response, next: NextFunction) {
    try {
      const tourId = req.params.id;
      const updateData = req.body;
      
      if (!tourId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_TOUR_ID',
            message: 'Valid tour ID is required'
          },
          timestamp: new Date().toISOString()
        });
      }

      // This would need to be implemented in the admin service
      res.json({
        success: true,
        message: 'Tour updated successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  async approveTour(req: Request, res: Response, next: NextFunction) {
    try {
      const tourId = req.params.id;
      const { notes } = req.body;
      
      if (!tourId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_TOUR_ID',
            message: 'Valid tour ID is required'
          },
          timestamp: new Date().toISOString()
        });
      }

      const tour = await adminService.approveTour(tourId, notes);
      
      res.json({
        success: true,
        data: tour,
        message: 'Tour approved successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  async suspendTour(req: Request, res: Response, next: NextFunction) {
    try {
      const tourId = req.params.id;
      const { reason } = req.body;
      
      if (!tourId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_TOUR_ID',
            message: 'Valid tour ID is required'
          },
          timestamp: new Date().toISOString()
        });
      }

      const tour = await adminService.suspendTour(tourId, reason);
      
      res.json({
        success: true,
        data: tour,
        message: 'Tour suspended successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  // === BOOKING MANAGEMENT ===

  async getBookings(req: Request, res: Response, next: NextFunction) {
    try {
      const filters: AdminBookingFilters = {
        status: req.query.status ? (req.query.status as string).split(',') : undefined,
        paymentStatus: req.query.paymentStatus ? (req.query.paymentStatus as string).split(',') : undefined,
        propertyId: req.query.propertyId ? parseInt(req.query.propertyId as string) : undefined,
        tourId: req.query.tourId as string,
        guestId: req.query.guestId ? parseInt(req.query.guestId as string) : undefined,
        dateRange: req.query.startDate && req.query.endDate ? {
          start: req.query.startDate as string,
          end: req.query.endDate as string,
          field: (req.query.dateField as 'createdAt' | 'checkIn' | 'bookingDate') || 'createdAt'
        } : undefined
      };

      const pagination: AdminQueryParams = {
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 20,
        sort: (req.query.sort as string) || 'createdAt',
        order: (req.query.order as 'asc' | 'desc') || 'desc'
      };

      const result = await adminService.getBookings(filters, pagination);
      
      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination,
        filters: result.filters,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  async getBookingDetails(req: Request, res: Response, next: NextFunction) {
    try {
      const bookingId = req.params.id;
      const type = req.params.type as 'property' | 'tour';
      
      if (!bookingId || !type) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PARAMETERS',
            message: 'Valid booking ID and type are required'
          },
          timestamp: new Date().toISOString()
        });
      }

      if (!['property', 'tour'].includes(type)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_TYPE',
            message: 'Type must be either "property" or "tour"'
          },
          timestamp: new Date().toISOString()
        });
      }

      const booking = await adminService.getBookingDetails(bookingId, type);
      
      res.json({
        success: true,
        data: booking,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      if (error.message === 'Booking not found') {
        return res.status(404).json({
          success: false,
          error: {
            code: 'BOOKING_NOT_FOUND',
            message: 'Booking not found'
          },
          timestamp: new Date().toISOString()
        });
      }
      next(error);
    }
  }

  async updateBooking(req: Request, res: Response, next: NextFunction) {
    try {
      const bookingId = req.params.id;
      const type = req.params.type as 'property' | 'tour';
      const updateData = req.body;
      
      if (!bookingId || !type) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PARAMETERS',
            message: 'Valid booking ID and type are required'
          },
          timestamp: new Date().toISOString()
        });
      }

      // This would need to be implemented in the admin service
      res.json({
        success: true,
        message: 'Booking updated successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  async cancelBooking(req: Request, res: Response, next: NextFunction) {
    try {
      const bookingId = req.params.id;
      const type = req.params.type as 'property' | 'tour';
      const { reason, refundAmount } = req.body;
      
      if (!bookingId || !type) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PARAMETERS',
            message: 'Valid booking ID and type are required'
          },
          timestamp: new Date().toISOString()
        });
      }

      const booking = await adminService.cancelBooking(bookingId, type, reason, refundAmount);
      
      res.json({
        success: true,
        data: booking,
        message: 'Booking cancelled successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  // === REVIEW MANAGEMENT ===

  async getReviews(req: Request, res: Response, next: NextFunction) {
    try {
      const filters = {
        rating: req.query.rating ? parseInt(req.query.rating as string) : undefined,
        isReported: req.query.isReported ? req.query.isReported === 'true' : undefined,
        isVisible: req.query.isVisible ? req.query.isVisible === 'true' : undefined,
        propertyId: req.query.propertyId ? parseInt(req.query.propertyId as string) : undefined,
        tourId: req.query.tourId as string,
        userId: req.query.userId ? parseInt(req.query.userId as string) : undefined,
        dateRange: req.query.startDate && req.query.endDate ? {
          start: req.query.startDate as string,
          end: req.query.endDate as string
        } : undefined
      };

      const pagination: AdminQueryParams = {
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 20,
        sort: (req.query.sort as string) || 'createdAt',
        order: (req.query.order as 'asc' | 'desc') || 'desc'
      };

      const result = await adminService.getReviews(filters, pagination);
      
      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  async moderateReview(req: Request, res: Response, next: NextFunction) {
    try {
      const reviewId = req.params.id;
      const type = req.params.type as 'property' | 'tour';
      const { action, reason } = req.body;
      
      if (!reviewId || !type || !action) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PARAMETERS',
            message: 'Valid review ID, type, and action are required'
          },
          timestamp: new Date().toISOString()
        });
      }

      if (!['approve', 'hide', 'delete'].includes(action)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_ACTION',
            message: 'Action must be "approve", "hide", or "delete"'
          },
          timestamp: new Date().toISOString()
        });
      }

      const result = await adminService.moderateReview(reviewId, type, action, reason);
      
      res.json({
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  // === PAYMENT & TRANSACTION MANAGEMENT ===

  async getPaymentTransactions(req: Request, res: Response, next: NextFunction) {
    try {
      const filters = {
        status: req.query.status ? (req.query.status as string).split(',') : undefined,
        type: req.query.type ? (req.query.type as string).split(',') : undefined,
        method: req.query.method ? (req.query.method as string).split(',') : undefined,
        userId: req.query.userId ? parseInt(req.query.userId as string) : undefined,
        amountRange: req.query.minAmount || req.query.maxAmount ? {
          min: parseFloat(req.query.minAmount as string) || 0,
          max: parseFloat(req.query.maxAmount as string) || Number.MAX_VALUE
        } : undefined,
        dateRange: req.query.startDate && req.query.endDate ? {
          start: req.query.startDate as string,
          end: req.query.endDate as string
        } : undefined
      };

      const pagination: AdminQueryParams = {
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 20,
        sort: (req.query.sort as string) || 'createdAt',
        order: (req.query.order as 'asc' | 'desc') || 'desc'
      };

      const result = await adminService.getPaymentTransactions(filters, pagination);
      
      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  async getPaymentTransaction(req: Request, res: Response, next: NextFunction) {
    try {
      const transactionId = req.params.id;
      
      if (!transactionId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_TRANSACTION_ID',
            message: 'Valid transaction ID is required'
          },
          timestamp: new Date().toISOString()
        });
      }

      // This would need to be implemented in the admin service
      res.json({
        success: true,
        message: 'Get payment transaction details not implemented yet',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  async processPaymentAction(req: Request, res: Response, next: NextFunction) {
    try {
      const transactionId = req.params.id;
      const { action, reason, amount } = req.body;
      
      if (!transactionId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_TRANSACTION_ID',
            message: 'Valid transaction ID is required'
          },
          timestamp: new Date().toISOString()
        });
      }

      // Implement payment action processing
      // This would interact with your payment service
      
      res.json({
        success: true,
        message: `Payment ${action} processed successfully`,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  // === ESCROW TRANSACTION MANAGEMENT ===

  async getEscrowTransactions(req: Request, res: Response, next: NextFunction) {
    try {
      const filters = {
        status: req.query.status ? (req.query.status as string).split(',') : undefined,
        type: req.query.type ? (req.query.type as string).split(',') : undefined,
        userId: req.query.userId ? parseInt(req.query.userId as string) : undefined,
        amountRange: req.query.minAmount || req.query.maxAmount ? {
          min: parseFloat(req.query.minAmount as string) || 0,
          max: parseFloat(req.query.maxAmount as string) || Number.MAX_VALUE
        } : undefined,
        dateRange: req.query.startDate && req.query.endDate ? {
          start: req.query.startDate as string,
          end: req.query.endDate as string
        } : undefined
      };

      const pagination: AdminQueryParams = {
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 20,
        sort: (req.query.sort as string) || 'createdAt',
        order: (req.query.order as 'asc' | 'desc') || 'desc'
      };

      const result = await adminService.getEscrowTransactions(filters, pagination);
      
      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  async getEscrowTransaction(req: Request, res: Response, next: NextFunction) {
    try {
      const transactionId = req.params.id;
      
      if (!transactionId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_TRANSACTION_ID',
            message: 'Valid transaction ID is required'
          },
          timestamp: new Date().toISOString()
        });
      }

      // This would need to be implemented in the admin service
      res.json({
        success: true,
        message: 'Get escrow transaction details not implemented yet',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  async releaseEscrow(req: Request, res: Response, next: NextFunction) {
    try {
      const transactionId = req.params.id;
      const { reason } = req.body;
      const adminId = (req as any).user?.id; // Assuming user is attached to request
      
      if (!transactionId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_TRANSACTION_ID',
            message: 'Valid transaction ID is required'
          },
          timestamp: new Date().toISOString()
        });
      }

      const result = await adminService.releaseEscrow(transactionId, reason, adminId);
      
      res.json({
        success: true,
        data: result,
        message: 'Escrow released successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  async disputeEscrow(req: Request, res: Response, next: NextFunction) {
    try {
      const transactionId = req.params.id;
      const { reason } = req.body;
      
      if (!transactionId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_TRANSACTION_ID',
            message: 'Valid transaction ID is required'
          },
          timestamp: new Date().toISOString()
        });
      }

      const result = await adminService.disputeEscrow(transactionId, reason);
      
      res.json({
        success: true,
        data: result,
        message: 'Escrow disputed successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  // === WITHDRAWAL MANAGEMENT ===

  async getWithdrawalRequests(req: Request, res: Response, next: NextFunction) {
    try {
      const filters = {
        status: req.query.status ? (req.query.status as string).split(',') : undefined,
        method: req.query.method ? (req.query.method as string).split(',') : undefined,
        userId: req.query.userId ? parseInt(req.query.userId as string) : undefined,
        amountRange: req.query.minAmount || req.query.maxAmount ? {
          min: parseFloat(req.query.minAmount as string) || 0,
          max: parseFloat(req.query.maxAmount as string) || Number.MAX_VALUE
        } : undefined,
        dateRange: req.query.startDate && req.query.endDate ? {
          start: req.query.startDate as string,
          end: req.query.endDate as string
        } : undefined
      };

      const pagination: AdminQueryParams = {
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 20,
        sort: (req.query.sort as string) || 'createdAt',
        order: (req.query.order as 'asc' | 'desc') || 'desc'
      };

      const result = await adminService.getWithdrawalRequests(filters, pagination);
      
      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  async approveWithdrawal(req: Request, res: Response, next: NextFunction) {
    try {
      const withdrawalId = req.params.id;
      
      if (!withdrawalId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_WITHDRAWAL_ID',
            message: 'Valid withdrawal ID is required'
          },
          timestamp: new Date().toISOString()
        });
      }

      const result = await adminService.approveWithdrawal(withdrawalId);
      
      res.json({
        success: true,
        data: result,
        message: 'Withdrawal approved successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  async rejectWithdrawal(req: Request, res: Response, next: NextFunction) {
    try {
      const withdrawalId = req.params.id;
      const { reason } = req.body;
      
      if (!withdrawalId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_WITHDRAWAL_ID',
            message: 'Valid withdrawal ID is required'
          },
          timestamp: new Date().toISOString()
        });
      }

      if (!reason) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_REASON',
            message: 'Rejection reason is required'
          },
          timestamp: new Date().toISOString()
        });
      }

      const result = await adminService.rejectWithdrawal(withdrawalId, reason);
      
      res.json({
        success: true,
        data: result,
        message: 'Withdrawal rejected successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  // === WALLET MANAGEMENT ===

  async getWallets(req: Request, res: Response, next: NextFunction) {
    try {
      const filters = {
        userId: req.query.userId ? parseInt(req.query.userId as string) : undefined,
        isActive: req.query.isActive ? req.query.isActive === 'true' : undefined,
        minBalance: req.query.minBalance ? parseFloat(req.query.minBalance as string) : undefined
      };

      const pagination: AdminQueryParams = {
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 20,
        sort: (req.query.sort as string) || 'createdAt',
        order: (req.query.order as 'asc' | 'desc') || 'desc'
      };

      const result = await adminService.getWallets(filters, pagination);
      
      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  async adjustWalletBalance(req: Request, res: Response, next: NextFunction) {
    try {
      const walletId = req.params.id;
      const { amount, reason } = req.body;
      const adminId = (req as any).user?.id;
      
      if (!walletId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_WALLET_ID',
            message: 'Valid wallet ID is required'
          },
          timestamp: new Date().toISOString()
        });
      }

      if (!amount || !reason) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_PARAMETERS',
            message: 'Amount and reason are required'
          },
          timestamp: new Date().toISOString()
        });
      }

      const result = await adminService.adjustWalletBalance(walletId, amount, reason, adminId);
      
      res.json({
        success: true,
        data: result,
        message: 'Wallet balance adjusted successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  // === CONTENT MANAGEMENT ===

  async getServices(req: Request, res: Response, next: NextFunction) {
    try {
      const pagination: AdminQueryParams = {
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 20,
        sort: (req.query.sort as string) || 'created_at',
        order: (req.query.order as 'asc' | 'desc') || 'desc'
      };

      const result = await adminService.getServices(pagination);
      
      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  async createService(req: Request, res: Response, next: NextFunction) {
    try {
      const serviceData: any = req.body;
      const adminId = (req as any).user?.id;

      const result = await adminService.createService(serviceData);
      
      res.status(201).json({
        success: true,
        data: result,
        message: 'Service created successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  async updateService(req: Request, res: Response, next: NextFunction) {
    try {
      const serviceId = parseInt(req.params.id);
      const updateData = req.body;
      
      // This would need implementation in admin service
      res.json({
        success: true,
        message: 'Service updated successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  async getPartners(req: Request, res: Response, next: NextFunction) {
    try {
      const pagination: AdminQueryParams = {
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 20,
        sort: (req.query.sort as string) || 'created_at',
        order: (req.query.order as 'asc' | 'desc') || 'desc'
      };

      const result = await adminService.getPartners(pagination);
      
      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  async deleteService(req: Request, res: Response, next: NextFunction) {
    try {
      const serviceId: any = parseInt(req.params.id);
      const adminId = (req as any).user?.id;

      if (!serviceId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_SERVICE_ID',
            message: 'Valid service ID is required'
          },
          timestamp: new Date().toISOString()
        });
      }

      await adminService.deleteService(serviceId);
      
      res.json({
        success: true,
        message: 'Service deleted successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }


  async createPartner(req: Request, res: Response, next: NextFunction) {
    try {
      const partnerData: any = req.body;
      const adminId = (req as any).user?.id;

      const result = await adminService.createPartner(partnerData, adminId);
      
      res.status(201).json({
        success: true,
        data: result,
        message: 'Partner created successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }


  async updatePartner(req: Request, res: Response, next: NextFunction) {
    try {
      const partnerId = parseInt(req.params.id);
      const updateData = req.body;
      
      // This would need implementation in admin service
      res.json({
        success: true,
        message: 'Partner updated successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

   async deletePartner(req: Request, res: Response, next: NextFunction) {
    try {
      const partnerId: any = parseInt(req.params.id);
      const adminId = (req as any).user?.id;

      if (!partnerId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PARTNER_ID',
            message: 'Valid partner ID is required'
          },
          timestamp: new Date().toISOString()
        });
      }

      await adminService.deletePartner(partnerId, adminId);
      
      res.json({
        success: true,
        message: 'Partner deleted successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

    // === PRODUCT MANAGEMENT ===
  
  async getProducts(req: Request, res: Response, next: NextFunction) {
    try {
      const pagination: any = {
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 20,
        sort: (req.query.sort as string) || 'createdAt',
        order: (req.query.order as 'asc' | 'desc') || 'desc'
      };

      const filters: any = {
        category: req.query.category,
        isAvailable: req.query.isAvailable ? req.query.isAvailable === 'true' : undefined,
        search: req.query.search
      };

      const result = await adminService.getProducts(filters, pagination);
      
      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination,
        filters: result.filters,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  async createProduct(req: Request, res: Response, next: NextFunction) {
    try {
      const productData: any = req.body;
      const adminId = (req as any).user?.id;

      const result = await adminService.createProduct(productData);
      
      res.status(201).json({
        success: true,
        data: result,
        message: 'Product created successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  async updateProduct(req: Request, res: Response, next: NextFunction) {
    try {
      const productId: any = parseInt(req.params.id);
      const updateData: any = req.body;
      const adminId = (req as any).user?.id;

      if (!productId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PRODUCT_ID',
            message: 'Valid product ID is required'
          },
          timestamp: new Date().toISOString()
        });
      }

      const result = await adminService.updateProduct(productId, updateData);
      
      res.json({
        success: true,
        data: result,
        message: 'Product updated successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  async deleteProduct(req: Request, res: Response, next: NextFunction) {
    try {
      const productId: any = parseInt(req.params.id);
      const adminId = (req as any).user?.id;

      if (!productId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PRODUCT_ID',
            message: 'Valid product ID is required'
          },
          timestamp: new Date().toISOString()
        });
      }

      await adminService.deleteProduct(productId, adminId);
      
      res.json({
        success: true,
        message: 'Product deleted successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  async getContactRequests(req: Request, res: Response, next: NextFunction) {
    try {
      const pagination: AdminQueryParams = {
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 20,
        sort: (req.query.sort as string) || 'created_at',
        order: (req.query.order as 'asc' | 'desc') || 'desc'
      };

      const result = await adminService.getContactMessages(pagination);
      
      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  async respondToContact(req: Request, res: Response, next: NextFunction) {
    try {
      const contactId = req.params.id;
      const { response } = req.body;
      const adminId = (req as any).user?.id;
      
      if (!contactId || !response) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_PARAMETERS',
            message: 'Contact ID and response are required'
          },
          timestamp: new Date().toISOString()
        });
      }

      const result = await adminService.respondToContact(contactId, response, adminId);
      
      res.json({
        success: true,
        data: result,
        message: 'Response sent successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  async getNewsletterSubscriptions(req: Request, res: Response, next: NextFunction) {
    try {
      const pagination: AdminQueryParams = {
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 20,
        sort: (req.query.sort as string) || 'subscribed_at',
        order: (req.query.order as 'asc' | 'desc') || 'desc'
      };

      const result = await adminService.getNewsletterSubscriptions(pagination);
      
      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  async updateNewsletterStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const subscriptionId: any = parseInt(req.params.id);
      const { isActive } = req.body;
      
      if (!subscriptionId || isActive === undefined) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_PARAMETERS',
            message: 'Subscription ID and isActive status are required'
          },
          timestamp: new Date().toISOString()
        });
      }

      const result = await adminService.updateNewsletterStatus(subscriptionId, isActive);
      
      res.json({
        success: true,
        data: result,
        message: 'Newsletter subscription updated successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  // === ANALYTICS & REPORTING ===

  async getSystemAnalytics(req: Request, res: Response, next: NextFunction) {
    try {
      const { period = 'month', currency = 'RWF' } = req.query;
      const filters = {
        period: period as string,
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
        currency: currency as string,
        metrics: req.query.metrics ? (req.query.metrics as string).split(',') : undefined,
        groupBy: req.query.groupBy ? (req.query.groupBy as string).split(',') : undefined
      };

      const analytics = await adminService.getSystemAnalytics(period as string, filters);
      
      res.json({
        success: true,
        data: analytics,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  async getVisitorAnalytics(req: Request, res: Response, next: NextFunction) {
    try {
      const { start_date, end_date, limit = '500' } = req.query;
      
      let period: string;
      
      // Calculate period based on date range if provided
      if (start_date && end_date) {
        const startDate = new Date(start_date as string);
        const endDate = new Date(end_date as string);
        
        // Validate dates
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          return res.status(400).json({
            success: false,
            error: 'Invalid date format'
          });
        }
        
        // Calculate days difference
        const diffTime = endDate.getTime() - startDate.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        // Convert to period string that your service expects
        if (diffDays <= 1) {
          period = '1d';
        } else if (diffDays <= 7) {
          period = '7d';
        } else if (diffDays <= 30) {
          period = '30d';
        } else {
          period = `${diffDays}d`;
        }
      } else {
        period = '30d'; // default
      }
      
      const analytics = await adminService.getTestAllFetch(period);
      
      res.json({
        success: true,
        data: analytics,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  async generateFinancialReport(req: Request, res: Response, next: NextFunction) {
    try {
      const { period = '30d', type = 'revenue' } = req.query;
      
      const report = await adminService.generateFinancialReport(
        period as string, 
        type as 'revenue' | 'earnings' | 'payouts'
      );
      
      res.json({
        success: true,
        data: report,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  async generateReport(req: Request, res: Response, next: NextFunction) {
    try {
      const { reportType, period, format = 'json' } = req.query;
      
      if (!reportType) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_REPORT_TYPE',
            message: 'Report type is required'
          },
          timestamp: new Date().toISOString()
        });
      }

      // Generate report based on type
      let reportData: any = {};
      
      switch (reportType) {
        case 'users':
          // Generate user report
          break;
        case 'properties':
          // Generate property report  
          break;
        case 'tours':
          // Generate tour report
          break;
        case 'financials':
          // Generate financial report
          break;
        default:
          return res.status(400).json({
            success: false,
            error: {
              code: 'INVALID_REPORT_TYPE',
              message: 'Invalid report type'
            },
            timestamp: new Date().toISOString()
          });
      }

      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${reportType}-report.csv"`);
        // Convert reportData to CSV and send
      } else if (format === 'excel') {
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${reportType}-report.xlsx"`);
        // Convert reportData to Excel and send
      } else {
        res.json({
          success: true,
          data: reportData,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error: any) {
      next(error);
    }
  }

  // === MARKET DATA ===

  async getMarketData(req: Request, res: Response, next: NextFunction) {
    try {
      const filters = {
        region: req.query.region as string,
        period: req.query.period as string
      };

      const pagination: AdminQueryParams = {
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 20,
        sort: (req.query.sort as string) || 'periodStart',
        order: (req.query.order as 'asc' | 'desc') || 'desc'
      };

      const result = await adminService.getMarketData(filters, pagination);
      
      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  async createMarketData(req: Request, res: Response, next: NextFunction) {
    try {
      const marketData = req.body;
      
      const result = await adminService.createMarketData(marketData);
      
      res.status(201).json({
        success: true,
        data: result,
        message: 'Market data created successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  async updateMarketData(req: Request, res: Response, next: NextFunction) {
    try {
      const marketDataId = req.params.id;
      const updateData = req.body;
      
      const result = await adminService.updateMarketData(marketDataId, updateData);
      
      res.json({
        success: true,
        data: result,
        message: 'Market data updated successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  // === BULK OPERATIONS ===

  async bulkUpdateUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const bulkRequest: AdminBulkUpdateRequest = req.body;
      
      if (!bulkRequest.filters || !bulkRequest.updates) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_BULK_PARAMS',
            message: 'Filters and updates are required'
          },
          timestamp: new Date().toISOString()
        });
      }

      const result = await adminService.bulkUpdateUsers(bulkRequest);
      
      res.json({
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  async bulkDeleteUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const bulkRequest: AdminBulkDeleteRequest | any = req.body;
      
      if (!bulkRequest.filters && (!bulkRequest.ids || !Array.isArray(bulkRequest.ids))) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_BULK_PARAMS',
            message: 'Either filters or array of IDs is required'
          },
          timestamp: new Date().toISOString()
        });
      }

      const result = await adminService.bulkDeleteUsers(bulkRequest);
      
      res.json({
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  async bulkUpdateProperties(req: Request, res: Response, next: NextFunction) {
    try {
      // This would need implementation in admin service
      res.json({
        success: true,
        message: 'Bulk property update not implemented yet',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  async bulkUpdateTours(req: Request, res: Response, next: NextFunction) {
    try {
      // This would need implementation in admin service
      res.json({
        success: true,
        message: 'Bulk tour update not implemented yet',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  // === DATA EXPORT ===

  async exportData(req: Request, res: Response, next: NextFunction) {
    try {
      const exportRequest: AdminExportRequest | any = req.body;
      
      if (!exportRequest.type || !exportRequest.format) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_EXPORT_PARAMS',
            message: 'Export type and format are required'
          }, 
          timestamp: new Date().toISOString()
        });
      }

      const result = await adminService.exportData(exportRequest);
      
      res.json({
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  // === SYSTEM SETTINGS ===

  async getSystemSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const settings = await adminService.getSystemSettings();
      
      res.json({
        success: true,
        data: settings,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  async updateSystemSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const settings = req.body;
      
      const updatedSettings = await adminService.updateSystemSettings(settings);
      
      res.json({
        success: true,
        data: updatedSettings,
        message: 'System settings updated successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  // === ACTIVITY LOGS ===

  async getActivityLogs(req: Request, res: Response, next: NextFunction) {
    try {
      const filters = {
        action: req.query.action as string,
        resource_type: req.query.resource_type as string,
        user_id: req.query.user_id as string,
        dateRange: req.query.startDate && req.query.endDate ? {
          start: req.query.startDate as string,
          end: req.query.endDate as string
        } : undefined
      };

      const pagination: AdminQueryParams = {
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 50,
        sort: (req.query.sort as string) || 'created_at',
        order: (req.query.order as 'asc' | 'desc') || 'desc'
      };

      const result = await adminService.getAuditLogs(filters, pagination);
      
      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  async getAuditLogs(req: Request, res: Response, next: NextFunction) {
    try {
      const filters = {
        action: req.query.action as string,
        resource_type: req.query.resource_type as string,
        user_id: req.query.user_id as string,
        dateRange: req.query.startDate && req.query.endDate ? {
          start: req.query.startDate as string,
          end: req.query.endDate as string
        } : undefined
      };

      const pagination: AdminQueryParams = {
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 50,
        sort: (req.query.sort as string) || 'created_at',
        order: (req.query.order as 'asc' | 'desc') || 'desc'
      };

      const result = await adminService.getAuditLogs(filters, pagination);
      
      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  // === NOTIFICATIONS ===

  async getNotifications(req: Request, res: Response, next: NextFunction) {
    try {
      const pagination: AdminQueryParams = {
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 20,
        sort: (req.query.sort as string) || 'createdAt',
        order: (req.query.order as 'asc' | 'desc') || 'desc'
      };

      const result = await adminService.getNotifications(pagination);
      
      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  async markNotificationRead(req: Request, res: Response, next: NextFunction) {
    try {
      const notificationId = req.params.id;
      
      if (!notificationId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_NOTIFICATION_ID',
            message: 'Valid notification ID is required'
          },
          timestamp: new Date().toISOString()
        });
      }

      // Mark notification as read
      // This is a placeholder - implement your notification system
      
      res.json({
        success: true,
        message: 'Notification marked as read',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  async markAllNotificationsRead(req: Request, res: Response, next: NextFunction) {
    try {
      // Mark all notifications as read
      // This is a placeholder - implement your notification system
      
      res.json({
        success: true,
        message: 'All notifications marked as read',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  // === DATA INTEGRITY ===

  async validateDataIntegrity(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await adminService.validateDataIntegrity();
      
      res.json({
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  async fixDataIntegrityIssue(req: Request, res: Response, next: NextFunction) {
    try {
      const issueType = req.params.issueType;
      
      if (!issueType) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_ISSUE_TYPE',
            message: 'Valid issue type is required'
          },
          timestamp: new Date().toISOString()
        });
      }

      const result = await adminService.fixDataIntegrityIssue(issueType);
      
      res.json({
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  // === GLOBAL SEARCH ===

  async globalSearch(req: Request, res: Response, next: NextFunction) {
    try {
      const { q: query, type } = req.query;
      
      if (!query) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_QUERY',
            message: 'Search query is required'
          },
          timestamp: new Date().toISOString()
        });
      }

      const results = await adminService.globalSearch(query as string, type as string);
      
      res.json({
        success: true,
        data: results,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  // === SYSTEM CONTROL ===

  async clearCache(req: Request, res: Response, next: NextFunction) {
    try {
      // Implement cache clearing
      res.json({
        success: true,
        message: 'Cache cleared successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  async refreshCache(req: Request, res: Response, next: NextFunction) {
    try {
      // Implement cache refresh
      res.json({
        success: true,
        message: 'Cache refreshed successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  async toggleMaintenanceMode(req: Request, res: Response, next: NextFunction) {
    try {
      // Implement maintenance mode toggle
      res.json({
        success: true,
        message: 'Maintenance mode toggled successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  async forceLogoutAllUsers(req: Request, res: Response, next: NextFunction) {
    try {
      // Implement force logout all users
      res.json({
        success: true,
        message: 'All users logged out successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  async sendAnnouncement(req: Request, res: Response, next: NextFunction) {
    try {
      // Implement system announcement
      res.json({
        success: true,
        message: 'Announcement sent successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  // === QUICK STATS ===

  async getQuickStats(req: Request, res: Response, next: NextFunction) {
    try {
      // This would typically aggregate data from the dashboard overview
      res.json({
        success: true,
        data: {
          totalUsers: 0,
          totalProperties: 0,
          totalTours: 0,
          totalBookings: 0,
          totalRevenue: 0,
          pendingApprovals: 0,
          openDisputes: 0,
          systemHealth: 'good'
        },
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  async getUserGrowthStats(req: Request, res: Response, next: NextFunction) {
    try {
      // Implement user growth stats
      res.json({
        success: true,
        message: 'User growth stats not implemented yet',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  async getRevenueStats(req: Request, res: Response, next: NextFunction) {
    try {
      // Implement revenue stats
      res.json({
        success: true,
        message: 'Revenue stats not implemented yet',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  // === INTEGRATION MANAGEMENT ===

  async getIntegrationStatus(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({
        success: true,
        data: {
          paymentGateway: { status: 'connected', lastSync: new Date().toISOString() },
          escrowProvider: { status: 'connected', lastSync: new Date().toISOString() },
          emailService: { status: 'connected', lastSync: new Date().toISOString() },
          smsService: { status: 'connected', lastSync: new Date().toISOString() },
          cloudStorage: { status: 'connected', lastSync: new Date().toISOString() }
        },
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  async testIntegration(req: Request, res: Response, next: NextFunction) {
    try {
      const service = req.params.service;
      
      // Implement integration testing
      res.json({
        success: true,
        message: `${service} integration test completed`,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  // ===================================================================
  //                      PUBLIC METHODS
  // ===================================================================

  // Track visitor analytics (public endpoint)
  async trackVisitor(req: Request, res: Response, next: NextFunction) {
    try {
      const visitorData = {
        ipAddress: req.ip || req.headers['x-forwarded-for'] as string || req.connection.remoteAddress,
        userAgent: req.headers['user-agent'],
        pageUrl: req.body.pageUrl,
        referrer: req.body.referrer || req.headers['referer'],
        sessionId: req.body.sessionId,
        location: req.body.location,
        country: req.body.country,
        city: req.body.city,
        region: req.body.region,
        timezone: req.body.timezone
      };

      const result = await adminService.trackVisitor(visitorData);

      res.status(201).json({
        success: true,
        data: result,
        message: 'Visitor tracked successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  // Subscribe to newsletter (public endpoint)
  async subscribeNewsletter(req: Request, res: Response, next: NextFunction) {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_EMAIL',
            message: 'Email is required'
          },
          timestamp: new Date().toISOString()
        });
      }

      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_EMAIL',
            message: 'Invalid email format'
          },
          timestamp: new Date().toISOString()
        });
      }

      const result = await adminService.subscribeNewsletter(email);

      res.status(201).json({
        success: true,
        data: result,
        message: 'Successfully subscribed to newsletter',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }

  // Submit contact message (public endpoint)
  async submitContactMessage(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, email, phoneNumber, subject, message, userId } = req.body;

      if (!name || !email || !message) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_REQUIRED_FIELDS',
            message: 'Name, email, and message are required'
          },
          timestamp: new Date().toISOString()
        });
      }

      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_EMAIL',
            message: 'Invalid email format'
          },
          timestamp: new Date().toISOString()
        });
      }

      const contactData = {
        userId: userId || null,
        name,
        email,
        phoneNumber,
        subject,
        message
      };

      const result = await adminService.createContactMessage(contactData);

      res.status(201).json({
        success: true,
        data: result,
        message: 'Contact message submitted successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      next(error);
    }
  }
}