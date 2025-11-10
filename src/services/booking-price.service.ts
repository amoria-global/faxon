// src/services/booking-price.service.ts
import { BookingService } from './booking.service';
import { applyBookingPriceReduction, applyBookingsPriceReduction } from '../utils/price-reduction.utility';
import {
  PropertyBookingInfo,
  TourBookingInfo,
  PropertyBookingFilters,
  TourBookingFilters
} from '../types/booking.types';

/**
 * Service wrapper that applies price reduction for eligible user types (host, agent, tourguide)
 */
export class BookingPriceService {
  private bookingService: BookingService;

  constructor() {
    this.bookingService = new BookingService();
  }

  /**
   * Get property booking by ID with price reduction applied for eligible users
   */
  async getPropertyBookingById(
    bookingId: string,
    userId: number,
    userType?: string
  ): Promise<PropertyBookingInfo | null> {
    const booking = await this.bookingService.getPropertyBookingById(bookingId, userId);
    if (!booking) return null;

    return applyBookingPriceReduction(booking, userType, false) as PropertyBookingInfo;
  }

  /**
   * Get tour booking by ID with price reduction applied for eligible users
   */
  async getTourBookingById(
    bookingId: string,
    userId: number,
    userType?: string
  ): Promise<TourBookingInfo | null> {
    const booking = await this.bookingService.getTourBookingById(bookingId, userId);
    if (!booking) return null;

    return applyBookingPriceReduction(booking, userType, false) as TourBookingInfo;
  }

  /**
   * Get general booking by ID with price reduction applied for eligible users
   */
  async getBookingById(
    bookingId: string,
    userId: number,
    userType?: string,
    type?: 'property' | 'tour'
  ): Promise<PropertyBookingInfo | TourBookingInfo | null> {
    const booking = await this.bookingService.getBookingById(bookingId, userId, type);
    if (!booking) return null;

    return applyBookingPriceReduction(booking, userType, false);
  }

  /**
   * Search property bookings with price reduction applied for eligible users
   */
  async searchPropertyBookings(
    userId: number,
    userType: string | undefined,
    filters: PropertyBookingFilters,
    page: number = 1,
    limit: number = 20
  ) {
    const result = await this.bookingService.searchPropertyBookings(userId, filters, page, limit);

    return {
      ...result,
      bookings: applyBookingsPriceReduction(result.bookings, userType, false)
    };
  }

  /**
   * Search tour bookings with price reduction applied for eligible users
   */
  async searchTourBookings(
    userId: number,
    userType: string | undefined,
    filters: TourBookingFilters,
    page: number = 1,
    limit: number = 20
  ) {
    const result = await this.bookingService.searchTourBookings(userId, filters, page, limit);

    return {
      ...result,
      bookings: applyBookingsPriceReduction(result.bookings, userType, false)
    };
  }

  /**
   * Get upcoming bookings with price reduction applied
   */
  async getUpcomingBookingsWithPriceReduction(
    userId: number,
    userType: string | undefined,
    limit: number = 5
  ) {
    // This would need to be implemented in the base BookingService first
    // For now, we can use the search methods
    const today = new Date();

    const [propertyBookings, tourBookings] = await Promise.all([
      this.searchPropertyBookings(userId, userType, {
        status: ['confirmed'],
        checkInDate: today.toISOString().split('T')[0],
        sortBy: 'checkIn',
        sortOrder: 'asc'
      }, 1, limit),
      this.searchTourBookings(userId, userType, {
        status: ['confirmed'],
        tourDate: today.toISOString().split('T')[0],
        sortBy: 'bookingDate',
        sortOrder: 'asc'
      }, 1, limit)
    ]);

    const allBookings = [
      ...propertyBookings.bookings.map(b => ({ ...b, type: 'property' as const })),
      ...tourBookings.bookings.map(b => ({ ...b, type: 'tour' as const }))
    ].sort((a, b) => {
      const dateA = a.type === 'property' && 'checkIn' in a
        ? new Date(a.checkIn)
        : a.type === 'tour' && 'bookingDate' in a
        ? new Date(a.bookingDate)
        : new Date(0);

      const dateB = b.type === 'property' && 'checkIn' in b
        ? new Date(b.checkIn)
        : b.type === 'tour' && 'bookingDate' in b
        ? new Date(b.bookingDate)
        : new Date(0);

      return dateA.getTime() - dateB.getTime();
    }).slice(0, limit);

    return allBookings;
  }
}
