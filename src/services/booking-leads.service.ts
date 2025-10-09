// ============================================================================
// src/services/booking-leads.service.ts
// Service for managing archived bookings (leads) for admin
// ============================================================================

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface BookingLeadFilters {
  leadStatus?: 'new' | 'contacted' | 'qualified' | 'converted' | 'lost';
  type?: 'property' | 'tour';
  search?: string;
  dateFrom?: Date;
  dateTo?: Date;
  guestId?: number;
  propertyId?: number;
  tourId?: string;
}

export interface BookingLeadStats {
  totalLeads: number;
  newLeads: number;
  contactedLeads: number;
  qualifiedLeads: number;
  convertedLeads: number;
  lostLeads: number;
  conversionRate: number;
  totalPotentialRevenue: number;
  averageLeadValue: number;
}

export class BookingLeadsService {
  /**
   * Get all property booking leads (archived bookings)
   */
  async getPropertyBookingLeads(
    filters: BookingLeadFilters = {},
    page: number = 1,
    limit: number = 20
  ) {
    const skip = (page - 1) * limit;
    const whereClause: any = {};

    if (filters.leadStatus) {
      whereClause.leadStatus = filters.leadStatus;
    }

    if (filters.search) {
      whereClause.OR = [
        { guestName: { contains: filters.search, mode: 'insensitive' } },
        { guestEmail: { contains: filters.search, mode: 'insensitive' } },
        { propertyName: { contains: filters.search, mode: 'insensitive' } },
        { propertyLocation: { contains: filters.search, mode: 'insensitive' } }
      ];
    }

    if (filters.dateFrom || filters.dateTo) {
      whereClause.archivedAt = {};
      if (filters.dateFrom) whereClause.archivedAt.gte = filters.dateFrom;
      if (filters.dateTo) whereClause.archivedAt.lte = filters.dateTo;
    }

    if (filters.guestId) {
      whereClause.guestId = filters.guestId;
    }

    if (filters.propertyId) {
      whereClause.propertyId = filters.propertyId;
    }

    const [leads, total] = await Promise.all([
      prisma.bookingArchive.findMany({
        where: whereClause,
        orderBy: { archivedAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.bookingArchive.count({ where: whereClause })
    ]);

    return {
      leads,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * Get all tour booking leads (archived bookings)
   */
  async getTourBookingLeads(
    filters: BookingLeadFilters = {},
    page: number = 1,
    limit: number = 20
  ) {
    const skip = (page - 1) * limit;
    const whereClause: any = {};

    if (filters.leadStatus) {
      whereClause.leadStatus = filters.leadStatus;
    }

    if (filters.search) {
      whereClause.OR = [
        { userName: { contains: filters.search, mode: 'insensitive' } },
        { userEmail: { contains: filters.search, mode: 'insensitive' } },
        { tourTitle: { contains: filters.search, mode: 'insensitive' } },
        { tourLocation: { contains: filters.search, mode: 'insensitive' } }
      ];
    }

    if (filters.dateFrom || filters.dateTo) {
      whereClause.archivedAt = {};
      if (filters.dateFrom) whereClause.archivedAt.gte = filters.dateFrom;
      if (filters.dateTo) whereClause.archivedAt.lte = filters.dateTo;
    }

    if (filters.guestId) {
      whereClause.userId = filters.guestId;
    }

    if (filters.tourId) {
      whereClause.tourId = filters.tourId;
    }

    const [leads, total] = await Promise.all([
      prisma.tourBookingArchive.findMany({
        where: whereClause,
        orderBy: { archivedAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.tourBookingArchive.count({ where: whereClause })
    ]);

    return {
      leads,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * Get all booking leads (both property and tour)
   */
  async getAllBookingLeads(
    filters: BookingLeadFilters = {},
    page: number = 1,
    limit: number = 20
  ) {
    if (filters.type === 'property') {
      return this.getPropertyBookingLeads(filters, page, limit);
    } else if (filters.type === 'tour') {
      return this.getTourBookingLeads(filters, page, limit);
    }

    // Get both types
    const [propertyResult, tourResult] = await Promise.all([
      this.getPropertyBookingLeads(filters, 1, 100),
      this.getTourBookingLeads(filters, 1, 100)
    ]);

    // Combine and sort by archived date
    const allLeads = [
      ...propertyResult.leads.map(lead => ({ ...lead, type: 'property' as const })),
      ...tourResult.leads.map(lead => ({ ...lead, type: 'tour' as const }))
    ].sort((a, b) => new Date(b.archivedAt).getTime() - new Date(a.archivedAt).getTime());

    const skip = (page - 1) * limit;
    const paginatedLeads = allLeads.slice(skip, skip + limit);

    return {
      leads: paginatedLeads,
      total: propertyResult.total + tourResult.total,
      page,
      limit,
      totalPages: Math.ceil((propertyResult.total + tourResult.total) / limit)
    };
  }

  /**
   * Get booking lead statistics
   */
  async getBookingLeadStats(): Promise<BookingLeadStats> {
    const [propertyLeads, tourLeads] = await Promise.all([
      prisma.bookingArchive.findMany(),
      prisma.tourBookingArchive.findMany()
    ]);

    const allLeads = [...propertyLeads, ...tourLeads];
    const totalLeads = allLeads.length;

    // Count by status
    const newLeads = allLeads.filter(l => l.leadStatus === 'new').length;
    const contactedLeads = allLeads.filter(l => l.leadStatus === 'contacted').length;
    const qualifiedLeads = allLeads.filter(l => l.leadStatus === 'qualified').length;
    const convertedLeads = allLeads.filter(l => l.leadStatus === 'converted').length;
    const lostLeads = allLeads.filter(l => l.leadStatus === 'lost').length;

    // Calculate revenue metrics
    const totalPotentialRevenue = propertyLeads.reduce((sum, l) => sum + l.totalPrice, 0) +
      tourLeads.reduce((sum, l) => sum + l.totalAmount, 0);

    const averageLeadValue = totalLeads > 0 ? totalPotentialRevenue / totalLeads : 0;
    const conversionRate = totalLeads > 0 ? (convertedLeads / totalLeads) * 100 : 0;

    return {
      totalLeads,
      newLeads,
      contactedLeads,
      qualifiedLeads,
      convertedLeads,
      lostLeads,
      conversionRate,
      totalPotentialRevenue,
      averageLeadValue
    };
  }

  /**
   * Update lead status
   */
  async updateLeadStatus(
    leadId: string,
    type: 'property' | 'tour',
    status: 'new' | 'contacted' | 'qualified' | 'converted' | 'lost',
    notes?: string
  ) {
    const updateData: any = {
      leadStatus: status,
      adminNotes: notes
    };

    if (status === 'contacted' && !notes) {
      updateData.contactedAt = new Date();
    }

    if (status === 'converted') {
      updateData.convertedToBooking = true;
    }

    if (type === 'property') {
      return await prisma.bookingArchive.update({
        where: { id: leadId },
        data: updateData
      });
    } else {
      return await prisma.tourBookingArchive.update({
        where: { id: leadId },
        data: updateData
      });
    }
  }

  /**
   * Get a specific lead by ID
   */
  async getLeadById(leadId: string, type: 'property' | 'tour') {
    if (type === 'property') {
      return await prisma.bookingArchive.findUnique({
        where: { id: leadId }
      });
    } else {
      return await prisma.tourBookingArchive.findUnique({
        where: { id: leadId }
      });
    }
  }

  /**
   * Delete a lead from archive
   */
  async deleteLead(leadId: string, type: 'property' | 'tour') {
    if (type === 'property') {
      return await prisma.bookingArchive.delete({
        where: { id: leadId }
      });
    } else {
      return await prisma.tourBookingArchive.delete({
        where: { id: leadId }
      });
    }
  }

  /**
   * Export leads as CSV data
   */
  async exportLeadsAsCSV(filters: BookingLeadFilters = {}) {
    const propertyLeads = await prisma.bookingArchive.findMany({
      where: this.buildWhereClause(filters, 'property'),
      orderBy: { archivedAt: 'desc' }
    });

    const tourLeads = await prisma.tourBookingArchive.findMany({
      where: this.buildWhereClause(filters, 'tour'),
      orderBy: { archivedAt: 'desc' }
    });

    return {
      propertyLeads,
      tourLeads
    };
  }

  private buildWhereClause(filters: BookingLeadFilters, type: 'property' | 'tour'): any {
    const whereClause: any = {};

    if (filters.leadStatus) {
      whereClause.leadStatus = filters.leadStatus;
    }

    if (filters.dateFrom || filters.dateTo) {
      whereClause.archivedAt = {};
      if (filters.dateFrom) whereClause.archivedAt.gte = filters.dateFrom;
      if (filters.dateTo) whereClause.archivedAt.lte = filters.dateTo;
    }

    if (type === 'property' && filters.propertyId) {
      whereClause.propertyId = filters.propertyId;
    }

    if (type === 'tour' && filters.tourId) {
      whereClause.tourId = filters.tourId;
    }

    return whereClause;
  }
}
