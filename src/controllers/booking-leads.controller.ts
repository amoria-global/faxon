// ============================================================================
// src/controllers/booking-leads.controller.ts
// Controller for managing archived bookings (leads) - Admin only
// ============================================================================

import { Request, Response } from 'express';
import { BookingLeadsService, BookingLeadFilters } from '../services/booking-leads.service';

export class BookingLeadsController {
  private leadsService: BookingLeadsService;

  constructor() {
    this.leadsService = new BookingLeadsService();
  }

  /**
   * GET /api/admin/booking-leads
   * Get all booking leads with optional filters
   */
  async getAllLeads(req: Request, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const filters: BookingLeadFilters = {
        leadStatus: req.query.leadStatus as any,
        type: req.query.type as 'property' | 'tour',
        search: req.query.search as string,
        dateFrom: req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined,
        dateTo: req.query.dateTo ? new Date(req.query.dateTo as string) : undefined,
        guestId: req.query.guestId ? parseInt(req.query.guestId as string) : undefined,
        propertyId: req.query.propertyId ? parseInt(req.query.propertyId as string) : undefined,
        tourId: req.query.tourId as string
      };

      const result = await this.leadsService.getAllBookingLeads(filters, page, limit);

      res.status(200).json({
        success: true,
        message: 'Booking leads retrieved successfully',
        data: result
      });
    } catch (error: any) {
      console.error('Error fetching booking leads:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch booking leads',
        error: error.message
      });
    }
  }

  /**
   * GET /api/admin/booking-leads/stats
   * Get booking lead statistics
   */
  async getLeadStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = await this.leadsService.getBookingLeadStats();

      res.status(200).json({
        success: true,
        message: 'Booking lead statistics retrieved successfully',
        data: stats
      });
    } catch (error: any) {
      console.error('Error fetching booking lead stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch booking lead statistics',
        error: error.message
      });
    }
  }

  /**
   * GET /api/admin/booking-leads/:type/:leadId
   * Get a specific booking lead by ID
   */
  async getLeadById(req: Request, res: Response): Promise<void> {
    try {
      const { type, leadId } = req.params;

      if (type !== 'property' && type !== 'tour') {
        res.status(400).json({
          success: false,
          message: 'Invalid type. Must be "property" or "tour"'
        });
        return;
      }

      const lead = await this.leadsService.getLeadById(leadId, type as 'property' | 'tour');

      if (!lead) {
        res.status(404).json({
          success: false,
          message: 'Booking lead not found'
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Booking lead retrieved successfully',
        data: lead
      });
    } catch (error: any) {
      console.error('Error fetching booking lead:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch booking lead',
        error: error.message
      });
    }
  }

  /**
   * PATCH /api/admin/booking-leads/:type/:leadId/status
   * Update lead status
   */
  async updateLeadStatus(req: Request, res: Response): Promise<void> {
    try {
      const { type, leadId } = req.params;
      const { status, notes } = req.body;

      if (type !== 'property' && type !== 'tour') {
        res.status(400).json({
          success: false,
          message: 'Invalid type. Must be "property" or "tour"'
        });
        return;
      }

      if (!status) {
        res.status(400).json({
          success: false,
          message: 'Status is required'
        });
        return;
      }

      const validStatuses = ['new', 'contacted', 'qualified', 'converted', 'lost'];
      if (!validStatuses.includes(status)) {
        res.status(400).json({
          success: false,
          message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
        });
        return;
      }

      const updatedLead = await this.leadsService.updateLeadStatus(
        leadId,
        type as 'property' | 'tour',
        status,
        notes
      );

      res.status(200).json({
        success: true,
        message: 'Lead status updated successfully',
        data: updatedLead
      });
    } catch (error: any) {
      console.error('Error updating lead status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update lead status',
        error: error.message
      });
    }
  }

  /**
   * DELETE /api/admin/booking-leads/:type/:leadId
   * Delete a booking lead from archive
   */
  async deleteLead(req: Request, res: Response): Promise<void> {
    try {
      const { type, leadId } = req.params;

      if (type !== 'property' && type !== 'tour') {
        res.status(400).json({
          success: false,
          message: 'Invalid type. Must be "property" or "tour"'
        });
        return;
      }

      await this.leadsService.deleteLead(leadId, type as 'property' | 'tour');

      res.status(200).json({
        success: true,
        message: 'Booking lead deleted successfully'
      });
    } catch (error: any) {
      console.error('Error deleting booking lead:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete booking lead',
        error: error.message
      });
    }
  }

  /**
   * GET /api/admin/booking-leads/export
   * Export booking leads as CSV
   */
  async exportLeads(req: Request, res: Response): Promise<void> {
    try {
      const filters: BookingLeadFilters = {
        leadStatus: req.query.leadStatus as any,
        type: req.query.type as 'property' | 'tour',
        dateFrom: req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined,
        dateTo: req.query.dateTo ? new Date(req.query.dateTo as string) : undefined
      };

      const data = await this.leadsService.exportLeadsAsCSV(filters);

      // Build CSV content
      let csvContent = '';

      // Property bookings header
      if (data.propertyLeads.length > 0) {
        csvContent += 'PROPERTY BOOKING LEADS\n';
        csvContent += 'ID,Guest Name,Guest Email,Guest Phone,Property Name,Location,Check In,Check Out,Guests,Total Price,Status,Payment Status,Lead Status,Archived Date,Notes\n';

        data.propertyLeads.forEach(lead => {
          csvContent += [
            lead.id,
            lead.guestName,
            lead.guestEmail,
            lead.guestPhone || '',
            lead.propertyName,
            lead.propertyLocation,
            new Date(lead.checkIn).toISOString(),
            new Date(lead.checkOut).toISOString(),
            lead.guests,
            lead.totalPrice,
            lead.status,
            lead.paymentStatus,
            lead.leadStatus,
            new Date(lead.archivedAt).toISOString(),
            (lead.adminNotes || '').replace(/,/g, ';')
          ].join(',') + '\n';
        });

        csvContent += '\n';
      }

      // Tour bookings header
      if (data.tourLeads.length > 0) {
        csvContent += 'TOUR BOOKING LEADS\n';
        csvContent += 'ID,User Name,User Email,User Phone,Tour Title,Location,Date,Participants,Total Amount,Currency,Status,Payment Status,Lead Status,Archived Date,Notes\n';

        data.tourLeads.forEach(lead => {
          csvContent += [
            lead.id,
            lead.userName,
            lead.userEmail,
            lead.userPhone || '',
            lead.tourTitle,
            lead.tourLocation,
            new Date(lead.scheduleStartDate).toISOString(),
            lead.numberOfParticipants,
            lead.totalAmount,
            lead.currency,
            lead.status,
            lead.paymentStatus,
            lead.leadStatus,
            new Date(lead.archivedAt).toISOString(),
            (lead.adminNotes || '').replace(/,/g, ';')
          ].join(',') + '\n';
        });
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=booking-leads-${new Date().toISOString()}.csv`);
      res.status(200).send(csvContent);
    } catch (error: any) {
      console.error('Error exporting booking leads:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to export booking leads',
        error: error.message
      });
    }
  }
}
