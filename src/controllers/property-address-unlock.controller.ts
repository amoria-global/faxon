// src/controllers/property-address-unlock.controller.ts - Property Address Unlock Controller

import { Request, Response } from 'express';
import { propertyAddressUnlockService, UnlockAddressRequest, AppreciationSubmission } from '../services/property-address-unlock.service';
import { logger } from '../utils/logger';

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
  };
}

export class PropertyAddressUnlockController {
  /**
   * Initiate unlock payment
   * POST /api/properties/unlock-address
   */
  unlockAddress = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
          errors: ['You must be logged in to unlock property addresses']
        });
        return;
      }

      const userId = parseInt(req.user.userId);
      const {
        propertyId,
        paymentMethod,
        paymentAmountUSD,
        dealCode,
        paymentType,
        // Mobile money fields
        phoneNumber,
        momoProvider,
        countryCode,
        // Card payment fields (redirectUrl only - user data comes from authenticated session)
        redirectUrl
      } = req.body;

      // Validate required fields
      if (!propertyId || !paymentMethod) {
        res.status(400).json({
          success: false,
          message: 'Missing required fields',
          errors: ['propertyId and paymentMethod are required']
        });
        return;
      }

      // Validate payment method
      if (!['non_refundable_fee', 'three_month_30_percent'].includes(paymentMethod)) {
        res.status(400).json({
          success: false,
          message: 'Invalid payment method',
          errors: ['paymentMethod must be either non_refundable_fee or three_month_30_percent']
        });
        return;
      }

      // Validate payment details if not using deal code
      if (!dealCode) {
        if (!paymentAmountUSD || !paymentType) {
          res.status(400).json({
            success: false,
            message: 'Missing payment information',
            errors: ['paymentAmountUSD and paymentType are required when not using a deal code']
          });
          return;
        }

        if (paymentAmountUSD <= 0) {
          res.status(400).json({
            success: false,
            message: 'Invalid payment amount',
            errors: ['Payment amount must be greater than 0']
          });
          return;
        }

        // Validate paymentType
        if (!['momo', 'cc'].includes(paymentType)) {
          res.status(400).json({
            success: false,
            message: 'Invalid payment type',
            errors: ['paymentType must be either "momo" (mobile money) or "cc" (credit card)']
          });
          return;
        }

        // Validate mobile money specific fields
        if (paymentType === 'momo' && !phoneNumber) {
          res.status(400).json({
            success: false,
            message: 'Missing mobile money details',
            errors: ['phoneNumber is required for mobile money payments']
          });
          return;
        }

        // Note: For card payments, user details (email, name, phone) come from authenticated session
        // No additional validation needed
      }

      const unlockRequest: UnlockAddressRequest = {
        propertyId: parseInt(propertyId),
        userId,
        paymentMethod,
        paymentAmountUSD: parseFloat(paymentAmountUSD) || 0,
        dealCode,
        paymentType: paymentType || 'momo',
        // Mobile money
        phoneNumber,
        momoProvider,
        countryCode,
        // Card payment (only redirectUrl from body - user data comes from authenticated session)
        redirectUrl
      };

      logger.info('Processing unlock request', 'PropertyAddressUnlockController', {
        propertyId: unlockRequest.propertyId,
        userId
      });

      const result = await propertyAddressUnlockService.initiateUnlockPayment(unlockRequest);

      const statusCode = result.success ? (result.data ? 200 : 200) : 400;
      res.status(statusCode).json(result);
    } catch (error) {
      logger.error('Error in unlockAddress', 'PropertyAddressUnlockController', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });

      res.status(500).json({
        success: false,
        message: 'Internal server error',
        errors: ['Failed to process unlock request']
      });
    }
  };

  /**
   * Check payment status
   * GET /api/properties/unlock/:unlockId/payment-status
   */
  checkPaymentStatus = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const { unlockId } = req.params;

      logger.info('Checking payment status', 'PropertyAddressUnlockController', {
        unlockId
      });

      const result = await propertyAddressUnlockService.checkPaymentStatus(unlockId);

      res.status(200).json(result);
    } catch (error) {
      logger.error('Error checking payment status', 'PropertyAddressUnlockController', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      res.status(500).json({
        success: false,
        message: 'Internal server error',
        errors: ['Failed to check payment status']
      });
    }
  };

  /**
   * Check unlock status
   * GET /api/properties/:propertyId/unlock-status
   */
  checkUnlockStatus = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const userId = parseInt(req.user.userId);
      const propertyId = parseInt(req.params.propertyId);

      if (isNaN(propertyId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid property ID'
        });
        return;
      }

      logger.info('Checking unlock status', 'PropertyAddressUnlockController', {
        propertyId,
        userId
      });

      const result = await propertyAddressUnlockService.getUnlockStatus(propertyId, userId);

      res.status(200).json({
        success: result.success,
        message: result.message,
        data: {
          unlocked: !!result.data,
          unlockData: result.data || null
        }
      });
    } catch (error) {
      logger.error('Error in checkUnlockStatus', 'PropertyAddressUnlockController', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      res.status(500).json({
        success: false,
        message: 'Internal server error',
        errors: ['Failed to check unlock status']
      });
    }
  };

  /**
   * Submit appreciation feedback
   * POST /api/properties/unlock-appreciation
   */
  submitAppreciation = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const userId = parseInt(req.user.userId);
      const { unlockId, propertyId, appreciationLevel, feedback } = req.body;

      // Validate required fields
      if (!unlockId || !propertyId || !appreciationLevel) {
        res.status(400).json({
          success: false,
          message: 'Missing required fields',
          errors: ['unlockId, propertyId, and appreciationLevel are required']
        });
        return;
      }

      // Validate appreciation level
      const validLevels = ['appreciated', 'neutral', 'not_appreciated'];
      if (!validLevels.includes(appreciationLevel)) {
        res.status(400).json({
          success: false,
          message: 'Invalid appreciation level',
          errors: [`appreciationLevel must be one of: ${validLevels.join(', ')}`]
        });
        return;
      }

      const submission: AppreciationSubmission = {
        unlockId,
        propertyId: parseInt(propertyId),
        userId,
        appreciationLevel,
        feedback
      };

      logger.info('Submitting appreciation', 'PropertyAddressUnlockController', {
        unlockId,
        userId,
        appreciationLevel
      });

      const result = await propertyAddressUnlockService.submitAppreciation(submission);

      const statusCode = result.success ? 200 : 400;
      res.status(statusCode).json(result);
    } catch (error) {
      logger.error('Error in submitAppreciation', 'PropertyAddressUnlockController', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      res.status(500).json({
        success: false,
        message: 'Internal server error',
        errors: ['Failed to submit appreciation']
      });
    }
  };

  /**
   * Get all deal codes for authenticated user
   * GET /api/property-unlock/my-deal-codes
   */
  getMyDealCodes = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const userId = parseInt(req.user.userId);

      logger.info('Getting user deal codes', 'PropertyAddressUnlockController', {
        userId
      });

      const result = await propertyAddressUnlockService.getUserDealCodes(userId);

      res.status(200).json(result);
    } catch (error) {
      logger.error('Error in getMyDealCodes', 'PropertyAddressUnlockController', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      res.status(500).json({
        success: false,
        message: 'Internal server error',
        errors: ['Failed to retrieve deal codes']
      });
    }
  };

  /**
   * Validate deal code
   * POST /api/properties/validate-deal-code
   */
  validateDealCode = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const userId = parseInt(req.user.userId);
      const { dealCode } = req.body;

      if (!dealCode) {
        res.status(400).json({
          success: false,
          message: 'Missing required fields',
          errors: ['dealCode is required']
        });
        return;
      }

      logger.info('Validating deal code', 'PropertyAddressUnlockController', {
        userId,
        dealCode
      });

      const result = await propertyAddressUnlockService.validateDealCode(dealCode, userId);

      res.status(200).json(result);
    } catch (error) {
      logger.error('Error in validateDealCode', 'PropertyAddressUnlockController', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      res.status(500).json({
        success: false,
        message: 'Internal server error',
        data: {
          valid: false,
          reason: 'Failed to validate deal code'
        }
      });
    }
  };

  /**
   * Get unlock fee calculation for a property
   * GET /api/properties/:propertyId/unlock-fee
   */
  getUnlockFee = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const propertyId = parseInt(req.params.propertyId);

      if (isNaN(propertyId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid property ID'
        });
        return;
      }

      logger.info('Getting unlock fee', 'PropertyAddressUnlockController', {
        propertyId
      });

      const feeBreakdown = await propertyAddressUnlockService.getUnlockFeeCalculation(propertyId);

      res.status(200).json({
        success: true,
        message: 'Unlock fee calculation retrieved',
        data: feeBreakdown
      });
    } catch (error) {
      logger.error('Error in getUnlockFee', 'PropertyAddressUnlockController', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      res.status(500).json({
        success: false,
        message: 'Internal server error',
        errors: ['Failed to calculate unlock fee']
      });
    }
  };

  /**
   * Get all unlocked properties for the authenticated user (guest view)
   * GET /api/properties/my-unlocks
   */
  getMyUnlocks = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const userId = parseInt(req.user.userId);

      logger.info('Getting user unlocked properties', 'PropertyAddressUnlockController', {
        userId
      });

      const result = await propertyAddressUnlockService.getUserUnlocks(userId);

      res.status(200).json(result);
    } catch (error) {
      logger.error('Error in getMyUnlocks', 'PropertyAddressUnlockController', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      res.status(500).json({
        success: false,
        message: 'Internal server error',
        errors: ['Failed to retrieve unlocked properties']
      });
    }
  };

  /**
   * Get unlock activities for properties owned by the authenticated user (host view)
   * GET /api/properties/unlock-activities
   */
  getUnlockActivities = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const userId = parseInt(req.user.userId);

      logger.info('Getting unlock activities for host properties', 'PropertyAddressUnlockController', {
        userId
      });

      const result = await propertyAddressUnlockService.getHostUnlockActivities(userId);

      res.status(200).json(result);
    } catch (error) {
      logger.error('Error in getUnlockActivities', 'PropertyAddressUnlockController', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      res.status(500).json({
        success: false,
        message: 'Internal server error',
        errors: ['Failed to retrieve unlock activities']
      });
    }
  };

  /**
   * Cancel unlock request (guests only, 30% eligible for deal code)
   * POST /api/properties/unlock/cancel
   */
  cancelUnlockRequest = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const userId = parseInt(req.user.userId);
      const { unlockId, reason } = req.body;

      if (!unlockId) {
        res.status(400).json({
          success: false,
          message: 'Missing required fields',
          errors: ['unlockId is required']
        });
        return;
      }

      logger.info('Cancelling unlock request', 'PropertyAddressUnlockController', {
        unlockId,
        userId
      });

      const result = await propertyAddressUnlockService.cancelUnlockRequest(unlockId, userId, reason);

      res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      logger.error('Error in cancelUnlockRequest', 'PropertyAddressUnlockController', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      res.status(500).json({
        success: false,
        message: 'Internal server error',
        errors: ['Failed to cancel unlock request']
      });
    }
  };

  /**
   * Get host unlock requests (NO MONEY DETAILS)
   * GET /api/properties/host/unlock-requests
   */
  getHostUnlockRequests = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const userId = parseInt(req.user.userId);

      logger.info('Getting host unlock requests (no money details)', 'PropertyAddressUnlockController', {
        userId
      });

      const result = await propertyAddressUnlockService.getHostUnlockRequests(userId);

      res.status(200).json(result);
    } catch (error) {
      logger.error('Error in getHostUnlockRequests', 'PropertyAddressUnlockController', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      res.status(500).json({
        success: false,
        message: 'Internal server error',
        errors: ['Failed to retrieve unlock requests']
      });
    }
  };

  /**
   * Create booking from unlock (30% already paid)
   * POST /api/properties/unlock/create-booking
   */
  createBookingFromUnlock = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const userId = parseInt(req.user.userId);
      const {
        unlockId,
        checkIn,
        checkOut,
        guests,
        totalPrice,
        message,
        specialRequests
      } = req.body;

      // Validate required fields
      if (!unlockId || !checkIn || !checkOut || !guests || !totalPrice) {
        res.status(400).json({
          success: false,
          message: 'Missing required fields',
          errors: ['unlockId, checkIn, checkOut, guests, and totalPrice are required']
        });
        return;
      }

      logger.info('Creating booking from unlock', 'PropertyAddressUnlockController', {
        unlockId,
        userId,
        checkIn,
        checkOut
      });

      const result = await propertyAddressUnlockService.createBookingFromUnlock({
        unlockId,
        userId,
        checkIn,
        checkOut,
        guests: parseInt(guests),
        totalPrice: parseFloat(totalPrice),
        message,
        specialRequests
      });

      res.status(result.success ? 201 : 400).json(result);
    } catch (error) {
      logger.error('Error in createBookingFromUnlock', 'PropertyAddressUnlockController', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      res.status(500).json({
        success: false,
        message: 'Internal server error',
        errors: ['Failed to create booking from unlock']
      });
    }
  };

  /**
   * Admin: Get unlock analytics
   * GET /api/properties/admin/unlock-analytics
   */
  getAdminUnlockAnalytics = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      // Extract filters from query
      const { startDate, endDate, propertyId, paymentMethod } = req.query;

      const filters: any = {};
      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);
      if (propertyId) filters.propertyId = parseInt(propertyId as string);
      if (paymentMethod) filters.paymentMethod = paymentMethod as string;

      logger.info('Getting admin unlock analytics', 'PropertyAddressUnlockController', {
        filters
      });

      const result = await propertyAddressUnlockService.getAdminUnlockAnalytics(filters);

      res.status(200).json(result);
    } catch (error) {
      logger.error('Error in getAdminUnlockAnalytics', 'PropertyAddressUnlockController', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      res.status(500).json({
        success: false,
        message: 'Internal server error',
        errors: ['Failed to retrieve unlock analytics']
      });
    }
  };
}

// Export singleton instance
export const propertyAddressUnlockController = new PropertyAddressUnlockController();
