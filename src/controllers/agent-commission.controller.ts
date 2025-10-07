// src/controllers/agent-commission.controller.ts
import { Request, Response } from 'express';
import { AgentCommissionService } from '../services/agent-commission.service';
import { CreatePropertyDto } from '../types/property.types';

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
    userType?: string;
  };
}

export class AgentCommissionController {
  private agentCommissionService: AgentCommissionService;

  constructor() {
    this.agentCommissionService = new AgentCommissionService();
  }

  /**
   * Create property by agent (with owner details)
   * POST /api/agent/properties
   */
  createPropertyByAgent = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const agentId = parseInt(req.user.userId);
      const propertyData = req.body as CreatePropertyDto & {
        ownerDetails: {
          names: string;
          email: string;
          phone: string;
          address: string;
        };
      };

      // Validate owner details
      if (!propertyData.ownerDetails) {
        res.status(400).json({
          success: false,
          message: 'Owner details are required (names, email, phone, address)'
        });
        return;
      }

      const { names, email, phone, address } = propertyData.ownerDetails;
      if (!names || !email || !phone || !address) {
        res.status(400).json({
          success: false,
          message: 'All owner details are required: names, email, phone, address'
        });
        return;
      }

      const property = await this.agentCommissionService.createPropertyByAgent(agentId, propertyData);

      res.status(201).json({
        success: true,
        message: 'Property created successfully. Owner has been notified.',
        data: property
      });
    } catch (error: any) {
      console.error('Error creating property by agent:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to create property'
      });
    }
  };

  /**
   * Get all properties managed by agent (any status)
   * GET /api/agent/properties
   */
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

      const result = await this.agentCommissionService.getAgentProperties(agentId, page, limit);

      res.status(200).json({
        success: true,
        message: 'Agent properties retrieved successfully',
        data: result
      });
    } catch (error: any) {
      console.error('Error getting agent properties:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve agent properties'
      });
    }
  };

  /**
   * Get pending commissions for agent
   * GET /api/agent/commissions/pending
   */
  getAgentPendingCommissions = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const agentId = parseInt(req.user.userId);
      const result = await this.agentCommissionService.getAgentPendingCommissions(agentId);

      res.status(200).json({
        success: true,
        message: 'Pending commissions retrieved successfully',
        data: result
      });
    } catch (error: any) {
      console.error('Error getting pending commissions:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve pending commissions'
      });
    }
  };

  /**
   * Get pending payments for host
   * GET /api/host/payments/pending
   */
  getHostPendingPayments = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const hostId = parseInt(req.user.userId);
      const result = await this.agentCommissionService.getHostPendingPayments(hostId);

      res.status(200).json({
        success: true,
        message: 'Pending payments retrieved successfully',
        data: result
      });
    } catch (error: any) {
      console.error('Error getting pending payments:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve pending payments'
      });
    }
  };

  /**
   * Validate check-in by host
   * POST /api/host/bookings/:bookingId/validate-checkin
   */
  validateCheckIn = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const hostId = parseInt(req.user.userId);
      const { bookingId } = req.params;
      const { checkInCode } = req.body;

      await this.agentCommissionService.validateCheckIn(bookingId, hostId, checkInCode);

      res.status(200).json({
        success: true,
        message: 'Check-in validated successfully. Payments are now approved for release.'
      });
    } catch (error: any) {
      console.error('Error validating check-in:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to validate check-in'
      });
    }
  };

  /**
   * Validate check-out by host
   * POST /api/host/bookings/:bookingId/validate-checkout
   */
  validateCheckOut = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const hostId = parseInt(req.user.userId);
      const { bookingId } = req.params;
      const { checkOutCode } = req.body;

      await this.agentCommissionService.validateCheckOut(bookingId, hostId, checkOutCode);

      res.status(200).json({
        success: true,
        message: 'Check-out validated successfully. Booking is now completed.'
      });
    } catch (error: any) {
      console.error('Error validating check-out:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to validate check-out'
      });
    }
  };

  /**
   * Trigger commission and payment creation (called after successful payment)
   * POST /api/bookings/:bookingId/process-payment
   * This should be called by your payment webhook/callback
   */
  processBookingPayment = async (req: Request, res: Response): Promise<void> => {
    try {
      const { bookingId } = req.params;

      // Create commission for agent (if applicable)
      await this.agentCommissionService.calculateAndCreateCommission(bookingId);

      // Create host payment record
      await this.agentCommissionService.createHostPayment(bookingId);

      res.status(200).json({
        success: true,
        message: 'Payment processed successfully. Commission and host payment records created.'
      });
    } catch (error: any) {
      console.error('Error processing booking payment:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to process booking payment'
      });
    }
  };
}
