// controllers/payment-distribution.controller.ts - Admin endpoints for payment distribution

import { Request, Response } from 'express';
import { paymentDistributionService } from '../services/payment-distribution.service';
import { logger } from '../utils/logger';

export class PaymentDistributionController {

  /**
   * GET /api/admin/payment-distribution/check
   * Check for undistributed payments
   */
  async checkUndistributedPayments(req: Request, res: Response): Promise<void> {
    try {
      const result = await paymentDistributionService.findUndistributedPayments();

      res.status(200).json({
        success: true,
        message: result.totalUndistributed > 0
          ? `Found ${result.totalUndistributed} undistributed payments totaling ${result.totalAmount} USD`
          : 'No undistributed payments found',
        data: result
      });

    } catch (error: any) {
      logger.error('Failed to check undistributed payments', 'PaymentDistributionController', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * POST /api/admin/payment-distribution/distribute/property/:bookingId
   * Manually distribute wallet for a specific property booking
   */
  async distributePropertyBooking(req: Request, res: Response): Promise<void> {
    try {
      const { bookingId } = req.params;

      if (!bookingId) {
        res.status(400).json({
          success: false,
          error: 'Booking ID is required'
        });
        return;
      }

      const result = await paymentDistributionService.distributePropertyBookingWallets(bookingId);

      res.status(result.success ? 200 : 400).json(result);

    } catch (error: any) {
      logger.error('Failed to distribute property booking wallet', 'PaymentDistributionController', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * POST /api/admin/payment-distribution/distribute/tour/:bookingId
   * Manually distribute wallet for a specific tour booking
   */
  async distributeTourBooking(req: Request, res: Response): Promise<void> {
    try {
      const { bookingId } = req.params;

      if (!bookingId) {
        res.status(400).json({
          success: false,
          error: 'Booking ID is required'
        });
        return;
      }

      const result = await paymentDistributionService.distributeTourBookingWallets(bookingId);

      res.status(result.success ? 200 : 400).json(result);

    } catch (error: any) {
      logger.error('Failed to distribute tour booking wallet', 'PaymentDistributionController', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * POST /api/admin/payment-distribution/distribute/all
   * Batch distribute all undistributed payments
   * WARNING: This can be time-consuming for large volumes
   */
  async distributeAll(req: Request, res: Response): Promise<void> {
    try {
      logger.warn('Starting batch distribution of all undistributed payments', 'PaymentDistributionController');

      const result = await paymentDistributionService.distributeAllUndistributed();

      res.status(200).json(result);

    } catch (error: any) {
      logger.error('Failed to batch distribute all payments', 'PaymentDistributionController', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /api/admin/payment-distribution/stats
   * Get distribution statistics
   */
  async getDistributionStats(req: Request, res: Response): Promise<void> {
    try {
      const undistributed = await paymentDistributionService.findUndistributedPayments();

      const stats = {
        undistributed: {
          propertyBookings: undistributed.propertyBookings.length,
          tourBookings: undistributed.tourBookings.length,
          total: undistributed.totalUndistributed,
          totalAmount: undistributed.totalAmount
        },
        recentIssues: {
          propertyBookings: undistributed.propertyBookings.slice(0, 10).map(b => ({
            id: b.id,
            totalPrice: b.totalPrice,
            paymentStatus: b.paymentStatus,
            createdAt: b.createdAt,
            distributionAttempts: b.distributionAttempts,
            distributionError: b.distributionError
          })),
          tourBookings: undistributed.tourBookings.slice(0, 10).map(b => ({
            id: b.id,
            totalAmount: b.totalAmount,
            paymentStatus: b.paymentStatus,
            createdAt: b.createdAt,
            distributionAttempts: b.distributionAttempts,
            distributionError: b.distributionError
          }))
        }
      };

      res.status(200).json({
        success: true,
        data: stats
      });

    } catch (error: any) {
      logger.error('Failed to get distribution stats', 'PaymentDistributionController', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

export const paymentDistributionController = new PaymentDistributionController();
