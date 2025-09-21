//src/services/booking.service.ts
import { PrismaClient } from '@prisma/client';
import { BrevoBookingMailingService } from '../utils/brevo.booking';
import {
  CreatePropertyBookingDto,
  UpdatePropertyBookingDto,
  PropertyBookingInfo,
  CreateTourBookingDto,
  UpdateTourBookingDto,
  TourBookingInfo,
  AgentBookingInfo,
  CreateAgentBookingDto,
  PropertyBookingFilters,
  TourBookingFilters,
  AgentBookingFilters,
  BookingAnalytics,
  GuestBookingStats,
  UserBookingCalendar,
  BookingCalendarEvent,
  WishlistItem,
  BookingRecommendation,
  PropertyBookingStatus,
  TourBookingStatus,
  TourCheckInStatus,
  TourParticipant,
  WishlistFilters,
  WishlistStats
} from '../types/booking.types';

const prisma = new PrismaClient();

export class BookingService {
  private emailService = new BrevoBookingMailingService();

  // --- BLOCKED DATES HELPER METHODS ---
  private async createBlockedDatesForBooking(
    propertyId: number, 
    checkIn: Date, 
    checkOut: Date, 
    bookingId: string, 
    reason: string = "booked"
  ): Promise<void> {
    await prisma.blockedDate.create({
      data: {
        propertyId,
        startDate: checkIn,
        endDate: checkOut,
        reason: `${reason} - Booking ID: ${bookingId}`,
        isActive: true
      }
    });
  }

  private async removeBlockedDatesForBooking(bookingId: string): Promise<void> {
    await prisma.blockedDate.deleteMany({
      where: {
        reason: { contains: `Booking ID: ${bookingId}` },
        isActive: true
      }
    });
  }

  // --- PROPERTY BOOKING METHODS ---
  async createPropertyBooking(userId: number, data: CreatePropertyBookingDto): Promise<PropertyBookingInfo> {
    // Validate property exists and is available
    const property = await prisma.property.findUnique({
      where: { id: data.propertyId },
      include: { host: true }
    });

    if (!property || property.status !== 'active') {
      throw new Error('Property not available for booking');
    }

    if (data.guests > property.maxGuests) {
      throw new Error(`Maximum ${property.maxGuests} guests allowed for this property`);
    }

    const checkInDate = new Date(data.checkIn);
    const checkOutDate = new Date(data.checkOut);
    
    // Validate dates
    if (checkInDate >= checkOutDate) {
      throw new Error('Check-out date must be after check-in date');
    }

    if (checkInDate < new Date()) {
      throw new Error('Check-in date cannot be in the past');
    }

    // Calculate nights and total price
    const nights = Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24));
    const totalPrice = nights === 2 && property.pricePerTwoNights 
      ? property.pricePerTwoNights 
      : nights * property.pricePerNight;

    // Check for conflicting bookings
    const conflictingBooking = await prisma.booking.findFirst({
      where: {
        propertyId: data.propertyId,
        status: { in: ['pending', 'confirmed'] },
        OR: [
          {
            checkIn: { lte: checkInDate },
            checkOut: { gt: checkInDate }
          },
          {
            checkIn: { lt: checkOutDate },
            checkOut: { gte: checkOutDate }
          },
          {
            checkIn: { gte: checkInDate },
            checkOut: { lte: checkOutDate }
          }
        ]
      }
    });

    if (conflictingBooking) {
      throw new Error('Property is not available for the selected dates');
    }

    // Check for blocked dates
    const blockedDates = await prisma.blockedDate.findFirst({
      where: {
        propertyId: data.propertyId,
        isActive: true,
        OR: [
          {
            startDate: { lte: checkInDate },
            endDate: { gt: checkInDate }
          },
          {
            startDate: { lt: checkOutDate },
            endDate: { gte: checkOutDate }
          },
          {
            startDate: { gte: checkInDate },
            endDate: { lte: checkOutDate }
          }
        ]
      }
    });

    if (blockedDates) {
      throw new Error('Property is blocked for the selected dates');
    }

    // Create booking
    const booking = await prisma.booking.create({
      data: {
        propertyId: data.propertyId,
        guestId: data.clientId || userId, // Use clientId if agent booking
        checkIn: checkInDate,
        checkOut: checkOutDate,
        guests: data.guests,
        totalPrice,
        message: data.message,
        specialRequests: data.specialRequests,
        status: 'pending',
        paymentStatus: 'pending'
      },
      include: {
        property: {
          include: { host: true }
        },
        guest: true
      }
    });

    // Create blocked dates for the booking period
    try {
      await this.createBlockedDatesForBooking(
        data.propertyId,
        checkInDate,
        checkOutDate,
        booking.id,
        "confirmed booking"
      );
    } catch (blockError) {
      console.error('Failed to create blocked dates:', blockError);
      // Continue even if blocked dates creation fails
      throw new Error('Failed to create blocked dates: ' + blockError);
    }

    // Update property total bookings
    await prisma.property.update({
      where: { id: data.propertyId },
      data: { totalBookings: { increment: 1 } }
    });

    try {
      // Send confirmation email to guest
      await this.emailService.sendBookingConfirmationEmail({
        user: {
          firstName: booking.guest.firstName,
          lastName: booking.guest.lastName,
          email: booking.guest.email,
          id: booking.guestId
        },
        company: {
          name: 'Jambolush',
          website: 'https://jambolush.com',
          supportEmail: 'support@jambolush.com',
          logo: 'https://jambolush.com/logo.png'
        },
        booking: this.transformToPropertyBookingInfo(booking),
        recipientType: 'guest'
      });

      // Send notification to host
      await this.emailService.sendNewBookingNotification({
        user: {
          firstName: booking.property.host.firstName,
          lastName: booking.property.host.lastName,
          email: booking.property.host.email,
          id: booking.property.hostId
        },
        company: {
          name: 'Jambolush',
          website: 'https://jambolush.com',
          supportEmail: 'support@jambolush.com',
          logo: 'https://jambolush.com/logo.png'
        },
        booking: this.transformToPropertyBookingInfo(booking),
        recipientType: 'host'
      });
    } catch (emailError) {
      console.error('Failed to send property booking emails:', emailError);
      // Don't fail the booking if email fails
    }

    return this.transformToPropertyBookingInfo(booking);
  }

  async getPropertyBookingById(bookingId: string, userId: number): Promise<PropertyBookingInfo | null> {
    const booking = await prisma.booking.findFirst({
      where: {
        id: bookingId,
        OR: [
          { guestId: userId },
          { property: { hostId: userId } }
        ]
      },
      include: {
        property: {
          include: { host: true }
        },
        guest: true
      }
    });

    if (!booking) return null;

    return this.transformToPropertyBookingInfo(booking);
  }

  async updatePropertyBooking(bookingId: string, userId: number, data: UpdatePropertyBookingDto): Promise<PropertyBookingInfo> {
    const booking = await prisma.booking.findFirst({
      where: {
        id: bookingId,
        OR: [
          { guestId: userId },
          { property: { hostId: userId } }
        ]
      }
    });

    if (!booking) {
      throw new Error('Booking not found or access denied');
    }

    const updatedBooking = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        ...(data.status && { status: data.status }),
        ...(data.message && { message: data.message }),
        ...(data.specialRequests && { specialRequests: data.specialRequests })
      },
      include: {
        property: {
          include: { host: true }
        },
        guest: true
      }
    });

    // Handle blocked dates based on status changes
    if (data.status) {
      try {
        if (data.status === 'cancelled') {
          // Remove blocked dates when booking is cancelled
          await this.removeBlockedDatesForBooking(bookingId);
          
          // Send cancellation email
          await this.emailService.sendBookingCancellationEmail({
            user: {
              firstName: updatedBooking.guest.firstName,
              lastName: updatedBooking.guest.lastName,
              email: updatedBooking.guest.email,
              id: updatedBooking.guestId
            },
            company: {
              name: 'Jambolush',
              website: 'https://jambolush.com',
              supportEmail: 'support@jambolush.com',
              logo: 'https://jambolush.com/logo.png'
            },
            booking: this.transformToPropertyBookingInfo(updatedBooking),
            recipientType: 'guest',
            cancellationReason: data.message || 'Booking has been cancelled as requested.'
          });
        } else if (data.status === 'confirmed' && booking.status !== 'confirmed') {
          // Ensure blocked dates exist when booking is confirmed
          // (in case they weren't created initially or were removed)
          await this.createBlockedDatesForBooking(
            updatedBooking.propertyId,
            updatedBooking.checkIn,
            updatedBooking.checkOut,
            bookingId,
            "confirmed booking"
          );
        }
      } catch (blockError) {
        console.error('Failed to update blocked dates:', blockError);
        // Continue even if blocked dates update fails
      }
    }

    return this.transformToPropertyBookingInfo(updatedBooking);
  }

  async updateBookingDates(
    bookingId: string, 
    userId: number, 
    newCheckIn: Date, 
    newCheckOut: Date
  ): Promise<PropertyBookingInfo> {
    const booking = await prisma.booking.findFirst({
      where: {
        id: bookingId,
        OR: [
          { guestId: userId },
          { property: { hostId: userId } }
        ]
      }
    });

    if (!booking) {
      throw new Error('Booking not found or access denied');
    }

    // Validate new dates don't conflict with other bookings
    const conflictingBooking = await prisma.booking.findFirst({
      where: {
        propertyId: booking.propertyId,
        id: { not: bookingId }, // Exclude current booking
        status: { in: ['pending', 'confirmed'] },
        OR: [
          {
            checkIn: { lte: newCheckIn },
            checkOut: { gt: newCheckIn }
          },
          {
            checkIn: { lt: newCheckOut },
            checkOut: { gte: newCheckOut }
          },
          {
            checkIn: { gte: newCheckIn },
            checkOut: { lte: newCheckOut }
          }
        ]
      }
    });

    if (conflictingBooking) {
      throw new Error('New dates conflict with existing booking');
    }

    // Check for blocked dates in the new date range
    const blockedDates = await prisma.blockedDate.findFirst({
      where: {
        propertyId: booking.propertyId,
        isActive: true,
        reason: { not: { contains: `Booking ID: ${bookingId}` } }, // Exclude current booking's blocked dates
        OR: [
          {
            startDate: { lte: newCheckIn },
            endDate: { gt: newCheckIn }
          },
          {
            startDate: { lt: newCheckOut },
            endDate: { gte: newCheckOut }
          },
          {
            startDate: { gte: newCheckIn },
            endDate: { lte: newCheckOut }
          }
        ]
      }
    });

    if (blockedDates) {
      throw new Error('Property is blocked for the new selected dates');
    }

    // Calculate new price
    const nights = Math.ceil((newCheckOut.getTime() - newCheckIn.getTime()) / (1000 * 60 * 60 * 24));
    const property = await prisma.property.findUnique({ where: { id: booking.propertyId } });
    const newTotalPrice = nights === 2 && property?.pricePerTwoNights 
      ? property.pricePerTwoNights 
      : nights * (property?.pricePerNight || 0);

    // Update booking with new dates and price
    const updatedBooking = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        checkIn: newCheckIn,
        checkOut: newCheckOut,
        totalPrice: newTotalPrice
      },
      include: {
        property: {
          include: { host: true }
        },
        guest: true
      }
    });

    // Update blocked dates
    try {
      // Remove old blocked dates
      await this.removeBlockedDatesForBooking(bookingId);
      
      // Create new blocked dates
      await this.createBlockedDatesForBooking(
        booking.propertyId,
        newCheckIn,
        newCheckOut,
        bookingId,
        "updated booking"
      );
    } catch (blockError) {
      console.error('Failed to update blocked dates for date change:', blockError);
    }

    return this.transformToPropertyBookingInfo(updatedBooking);
  }

  async getPropertyAvailability(
    propertyId: number, 
    startDate: Date, 
    endDate: Date
  ): Promise<{ isAvailable: boolean; blockedPeriods: Array<{ start: Date; end: Date; reason: string }> }> {
    // Get all bookings in the date range
    const bookings = await prisma.booking.findMany({
      where: {
        propertyId,
        status: { in: ['pending', 'confirmed'] },
        OR: [
          {
            checkIn: { lte: endDate },
            checkOut: { gte: startDate }
          }
        ]
      }
    });

    // Get all blocked dates in the date range
    const blockedDates = await prisma.blockedDate.findMany({
      where: {
        propertyId,
        isActive: true,
        OR: [
          {
            startDate: { lte: endDate },
            endDate: { gte: startDate }
          }
        ]
      }
    });

    const blockedPeriods: Array<{ start: Date; end: Date; reason: string }> = [];

    // Add booking periods
    bookings.forEach(booking => {
      blockedPeriods.push({
        start: booking.checkIn,
        end: booking.checkOut,
        reason: `Booking ${booking.id}`
      });
    });

    // Add blocked date periods
    blockedDates.forEach(blocked => {
      blockedPeriods.push({
        start: blocked.startDate,
        end: blocked.endDate,
        reason: blocked.reason || 'Blocked by host'
      });
    });

    // Check if the requested period overlaps with any blocked period
    const isAvailable = !blockedPeriods.some(period => 
      period.start < endDate && period.end > startDate
    );

    return {
      isAvailable,
      blockedPeriods: blockedPeriods.sort((a, b) => a.start.getTime() - b.start.getTime())
    };
  }

  async searchPropertyBookings(userId: number, filters: PropertyBookingFilters, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const whereClause: any = {
      OR: [
        { guestId: userId },
        { property: { hostId: userId } }
      ]
    };

    if (filters.status) {
      whereClause.status = { in: filters.status };
    }

    if (filters.propertyId) {
      whereClause.propertyId = filters.propertyId;
    }

    if (filters.checkInDate || filters.checkOutDate) {
      whereClause.AND = [];
      if (filters.checkInDate) {
        whereClause.AND.push({ checkIn: { gte: new Date(filters.checkInDate) } });
      }
      if (filters.checkOutDate) {
        whereClause.AND.push({ checkOut: { lte: new Date(filters.checkOutDate) } });
      }
    }

    if (filters.minAmount || filters.maxAmount) {
      whereClause.totalPrice = {};
      if (filters.minAmount) whereClause.totalPrice.gte = filters.minAmount;
      if (filters.maxAmount) whereClause.totalPrice.lte = filters.maxAmount;
    }

    if (filters.search) {
      whereClause.OR = [
        { property: { name: { contains: filters.search } } },
        { property: { location: { contains: filters.search } } },
        { guest: { firstName: { contains: filters.search } } },
        { guest: { lastName: { contains: filters.search } } }
      ];
    }

    const orderBy: any = {};
    if (filters.sortBy) {
      orderBy[filters.sortBy] = filters.sortOrder || 'desc';
    } else {
      orderBy.createdAt = 'desc';
    }

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where: whereClause,
        include: {
          property: {
            include: { host: true }
          },
          guest: true
        },
        orderBy,
        skip,
        take: limit
      }),
      prisma.booking.count({ where: whereClause })
    ]);

    return {
      bookings: bookings.map(b => this.transformToPropertyBookingInfo(b)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  // --- TOUR BOOKING METHODS ---
  async createTourBooking(userId: number, data: CreateTourBookingDto): Promise<TourBookingInfo> {
    // Validate tour and schedule
    const schedule = await prisma.tourSchedule.findUnique({
      where: { id: data.scheduleId },
      include: {
        tour: {
          include: { tourGuide: true }
        }
      }
    });

    if (!schedule || !schedule.isAvailable) {
      throw new Error('Tour schedule not available');
    }

    if (schedule.tour.id !== data.tourId) {
      throw new Error('Schedule does not match the selected tour');
    }

    if (data.numberOfParticipants > (schedule.availableSlots - schedule.bookedSlots)) {
      throw new Error('Not enough available slots for this tour');
    }

    if (data.numberOfParticipants > schedule.tour.maxGroupSize) {
      throw new Error(`Maximum ${schedule.tour.maxGroupSize} participants allowed for this tour`);
    }

    if (data.numberOfParticipants < schedule.tour.minGroupSize) {
      throw new Error(`Minimum ${schedule.tour.minGroupSize} participants required for this tour`);
    }

    // Validate participants data
    if (data.participants.length !== data.numberOfParticipants) {
      throw new Error('Number of participants does not match participant details');
    }

    const totalAmount = (schedule.price || schedule.tour.price) * data.numberOfParticipants;

    // Create tour booking
    const booking = await prisma.tourBooking.create({
      data: {
        userId: data.clientId || userId,
        tourId: data.tourId,
        scheduleId: data.scheduleId,
        tourGuideId: schedule.tour.tourGuideId,
        numberOfParticipants: data.numberOfParticipants,
        participants: JSON.stringify(data.participants),
        specialRequests: data.specialRequests,
        totalAmount,
        currency: schedule.tour.currency,
        status: 'pending',
        paymentStatus: 'pending'
      },
      include: {
        tour: {
          include: { tourGuide: true }
        },
        schedule: true,
        user: true
      }
    });

    // Update schedule booked slots
    await prisma.tourSchedule.update({
      where: { id: data.scheduleId },
      data: { bookedSlots: { increment: data.numberOfParticipants } }
    });

    // Update tour total bookings
     await prisma.tour.update({
      where: { id: data.tourId },
      data: { totalBookings: { increment: 1 } }
    });

    try {
      // Send confirmation email to guest
      await this.emailService.sendBookingConfirmationEmail({
        user: {
          firstName: booking.user.firstName,
          lastName: booking.user.lastName,
          email: booking.user.email,
          id: booking.userId
        },
        company: {
          name: 'Jambolush',
          website: 'https://jambolush.com',
          supportEmail: 'support@jambolush.com',
          logo: 'https://jambolush.com/logo.png'
        },
        booking: this.transformToTourBookingInfo(booking),
        recipientType: 'guest'
      });

      // Send notification to tour guide
      await this.emailService.sendNewBookingNotification({
        user: {
          firstName: booking.tour.tourGuide.firstName,
          lastName: booking.tour.tourGuide.lastName,
          email: booking.tour.tourGuide.email,
          id: booking.tourGuideId
        },
        company: {
          name: 'Jambolush',
          website: 'https://jambolush.com',
          supportEmail: 'support@jambolush.com',
          logo: 'https://jambolush.com/logo.png'
        },
        booking: this.transformToTourBookingInfo(booking),
        recipientType: 'guide'
      });
    } catch (emailError) {
      console.error('Failed to send tour booking emails:', emailError);
      // Don't fail the booking if email fails
    }

    return this.transformToTourBookingInfo(booking);
  }

  async getTourBookingById(bookingId: string, userId: number): Promise<TourBookingInfo | null> {
    const booking = await prisma.tourBooking.findFirst({
      where: {
        id: bookingId,
        OR: [
          { userId: userId },
          { tourGuideId: userId }
        ]
      },
      include: {
        tour: {
          include: { tourGuide: true }
        },
        schedule: true,
        user: true
      }
    });

    if (!booking) return null;

    return this.transformToTourBookingInfo(booking);
  }

  async updateTourBooking(bookingId: string, userId: number, data: UpdateTourBookingDto): Promise<TourBookingInfo> {
    const booking = await prisma.tourBooking.findFirst({
      where: {
        id: bookingId,
        OR: [
          { userId: userId },
          { tourGuideId: userId }
        ]
      }
    });

    if (!booking) {
      throw new Error('Tour booking not found or access denied');
    }

    const updateData: any = {};
    
    if (data.status) updateData.status = data.status;
    if (data.specialRequests) updateData.specialRequests = data.specialRequests;
    if (data.checkInStatus) updateData.checkInStatus = data.checkInStatus;

    // Handle check-in/out times
    if (data.checkInStatus === 'checked_in' && !booking.checkInTime) {
      updateData.checkInTime = new Date();
    }

    if (data.checkInStatus === 'checked_out' && !booking.checkOutTime) {
      updateData.checkOutTime = new Date();
    }

    const updatedBooking = await prisma.tourBooking.update({
      where: { id: bookingId },
      data: updateData,
      include: {
        tour: {
          include: { tourGuide: true }
        },
        schedule: true,
        user: true
      }
    });

    if (data.status === 'cancelled') {
      try {
        await this.emailService.sendBookingCancellationEmail({
          user: {
            firstName: updatedBooking.user.firstName,
            lastName: updatedBooking.user.lastName,
            email: updatedBooking.user.email,
            id: updatedBooking.userId
          },
          company: {
            name: 'Jambolush',
            website: 'https://jambolush.com',
            supportEmail: 'support@jambolush.com',
            logo: 'https://jambolush.com/logo.png'
          },
          booking: this.transformToTourBookingInfo(updatedBooking),
          recipientType: 'guest',
          cancellationReason: data.specialRequests || 'Tour booking has been cancelled as requested.'
        });
      } catch (emailError) {
        console.error('Failed to send tour cancellation email:', emailError);
      }
    }

    return this.transformToTourBookingInfo(updatedBooking);
  }

  async searchTourBookings(userId: number, filters: TourBookingFilters, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const whereClause: any = {
      OR: [
        { userId: userId },
        { tourGuideId: userId }
      ]
    };

    if (filters.status) {
      whereClause.status = { in: filters.status };
    }

    if (filters.tourId) {
      whereClause.tourId = filters.tourId;
    }

    if (filters.tourDate) {
      const date = new Date(filters.tourDate);
      whereClause.schedule = {
        startDate: {
          gte: new Date(date.setHours(0, 0, 0, 0)),
          lt: new Date(date.setHours(23, 59, 59, 999))
        }
      };
    }

    if (filters.category) {
      whereClause.tour = { category: filters.category };
    }

    if (filters.difficulty) {
      whereClause.tour = { ...whereClause.tour, difficulty: filters.difficulty };
    }

    if (filters.minAmount || filters.maxAmount) {
      whereClause.totalAmount = {};
      if (filters.minAmount) whereClause.totalAmount.gte = filters.minAmount;
      if (filters.maxAmount) whereClause.totalAmount.lte = filters.maxAmount;
    }

    if (filters.search) {
      whereClause.OR = [
        { tour: { title: { contains: filters.search } } },
        { tour: { locationCity: { contains: filters.search } } },
        { user: { firstName: { contains: filters.search } } },
        { user: { lastName: { contains: filters.search } } }
      ];
    }

    const orderBy: any = {};
    if (filters.sortBy) {
      orderBy[filters.sortBy] = filters.sortOrder || 'desc';
    } else {
      orderBy.createdAt = 'desc';
    }

    const [bookings, total] = await Promise.all([
      prisma.tourBooking.findMany({
        where: whereClause,
        include: {
          tour: {
            include: { tourGuide: true }
          },
          schedule: true,
          user: true
        },
        orderBy,
        skip,
        take: limit
      }),
      prisma.tourBooking.count({ where: whereClause })
    ]);

    return {
      bookings: bookings.map(b => this.transformToTourBookingInfo(b)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  // --- AGENT BOOKING METHODS ---
async createAgentBooking(agentId: number, data: CreateAgentBookingDto): Promise<AgentBookingInfo> {
  // Verify agent role
  const agent = await prisma.user.findFirst({
    where: { id: agentId, userType: 'agent' }
  });

  if (!agent) {
    throw new Error('Invalid agent credentials');
  }

  // Verify client exists
  const client = await prisma.user.findUnique({
    where: { id: data.clientId }
  });

  if (!client) {
    throw new Error('Client not found');
  }

  let bookingDetails: PropertyBookingInfo | TourBookingInfo;
  let commission = 0;

  if (data.type === 'property') {
    const propertyBookingData = data.bookingData as CreatePropertyBookingDto;
    propertyBookingData.clientId = data.clientId;
    
    bookingDetails = await this.createPropertyBooking(agentId, propertyBookingData);
    commission = bookingDetails.totalPrice * (data.commissionRate || 0.05); // 5% default
  } else {
    const tourBookingData = data.bookingData as CreateTourBookingDto;
    tourBookingData.clientId = data.clientId;
    
    bookingDetails = await this.createTourBooking(agentId, tourBookingData);
    commission = bookingDetails.totalAmount * (data.commissionRate || 0.05); // 5% default
  }

  // Create agent booking record (you might need to add this table to schema)
  // For now, we'll return a composed object
  return {
    id: `agent_${bookingDetails.id}`,
    type: data.type,
    clientId: data.clientId,
    client: {
      firstName: client.firstName,
      lastName: client.lastName,
      email: client.email,
      phone: client.phone || undefined  // Fix: Convert null to undefined
    },
    agentId,
    bookingDetails,
    commission,
    commissionRate: data.commissionRate || 0.05,
    status: 'active',
    notes: data.notes,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

  // --- CALENDAR METHODS ---
async getUserBookingCalendar(userId: number): Promise<UserBookingCalendar> {
  const today = new Date();
  const futureDate = new Date();
  futureDate.setMonth(futureDate.getMonth() + 6); // Next 6 months

  const [propertyBookings, tourBookings] = await Promise.all([
    prisma.booking.findMany({
      where: {
        guestId: userId,
        checkIn: { gte: today, lte: futureDate }
      },
      include: {
        property: { select: { name: true, location: true } }
      }
    }),
    prisma.tourBooking.findMany({
      where: {
        userId: userId,
        schedule: {
          startDate: { gte: today, lte: futureDate }
        }
      },
      include: {
        tour: { 
          select: { 
            title: true,
            duration: true,        // Fix: Include duration
            locationCity: true     // Fix: Include locationCity
          } 
        },
        schedule: true
      }
    })
  ]);

  const events: BookingCalendarEvent[] = [];

  // Add property bookings to calendar
  propertyBookings.forEach(booking => {
    events.push({
      id: booking.id,
      title: `${booking.property.name} - ${booking.property.location}`,
      start: booking.checkIn.toISOString(),
      end: booking.checkOut.toISOString(),
      type: 'property',
      status: booking.status,
      color: this.getStatusColor(booking.status),
      description: `Property booking for ${booking.guests} guests`,
      location: booking.property.location
    });
  });

  // Add tour bookings to calendar
  tourBookings.forEach(booking => {
    const endDate = new Date(booking.schedule.startDate);
    endDate.setHours(endDate.getHours() + booking.tour.duration);  // Fix: Now duration is available

    events.push({
      id: booking.id,
      title: booking.tour.title,
      start: booking.schedule.startDate.toISOString(),
      end: endDate.toISOString(),
      type: 'tour',
      status: booking.status,
      color: this.getStatusColor(booking.status),
      description: `Tour for ${booking.numberOfParticipants} participants`,
      location: booking.tour.locationCity  // Fix: Now locationCity is available
    });
  });

  const upcomingBookings = [
    ...propertyBookings.map(b => this.transformToPropertyBookingInfo(b)),
    ...tourBookings.map(b => this.transformToTourBookingInfo(b))
  ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
   .slice(0, 5);

  return {
    userId,
    events: events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()),
    upcomingBookings,
    conflicts: [] // TODO: Implement conflict detection
  };
}

  // --- ANALYTICS METHODS ---
async getGuestBookingStats(userId: number): Promise<GuestBookingStats> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found');

  const [propertyBookings, tourBookings] = await Promise.all([
    prisma.booking.findMany({
      where: { guestId: userId },
      include: { property: { select: { location: true } } }
    }),
    prisma.tourBooking.findMany({
      where: { userId: userId },
      include: { 
        tour: { 
          select: { 
            locationCity: true 
          } 
        },
        schedule: {          // Fix: Include schedule
          select: {
            startDate: true
          }
        }
      }
    })
  ]);

  const totalBookings = propertyBookings.length + tourBookings.length;
  const completedBookings = propertyBookings.filter(b => b.status === 'completed').length + 
                            tourBookings.filter(b => b.status === 'completed').length;
  const cancelledBookings = propertyBookings.filter(b => b.status === 'cancelled').length + 
                            tourBookings.filter(b => b.status === 'cancelled').length;
  
  const totalSpent = propertyBookings.reduce((sum, b) => sum + (b.status === 'completed' ? b.totalPrice : 0), 0) +
                     tourBookings.reduce((sum, b) => sum + (b.status === 'completed' ? b.totalAmount : 0), 0);

  const averageBookingValue = completedBookings > 0 ? totalSpent / completedBookings : 0;

  // Get favorite destinations
  const destinations: { [key: string]: number } = {};
  propertyBookings.forEach(b => {
    if (b.status === 'completed') {
      destinations[b.property.location] = (destinations[b.property.location] || 0) + 1;
    }
  });
  tourBookings.forEach(b => {
    if (b.status === 'completed') {
      destinations[b.tour.locationCity] = (destinations[b.tour.locationCity] || 0) + 1;
    }
  });

  const favoriteDestinations = Object.entries(destinations)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([dest]) => dest);

  const upcomingBookings = propertyBookings.filter(b => 
    b.status === 'confirmed' && new Date(b.checkIn) > new Date()
  ).length + tourBookings.filter(b => 
    b.status === 'confirmed' && new Date(b.schedule.startDate) > new Date()  // Fix: Now schedule is available
  ).length;

  return {
    totalBookings,
    completedBookings,
    cancelledBookings,
    totalSpent,
    averageBookingValue,
    favoriteDestinations,
    upcomingBookings,
    memberSince: user.createdAt.toISOString()
  };
}


  // --- WISHLIST METHODS ---
  // Update the existing addToWishlist method
async addToWishlist(userId: number, type: 'property' | 'tour', itemId: string | number, notes?: string): Promise<WishlistItem> {
  // Currently only supports properties due to schema limitation
  if (type === 'tour') {
    throw new Error('Tour wishlists are not supported yet. Please add tourId field to Wishlist model.');
  }

  const propertyId = itemId as number;

  // Check if property exists
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: {
      id: true,
      name: true,
      location: true,
      pricePerNight: true,
      averageRating: true,
      images: true,
      status: true
    }
  });

  if (!property) {
    throw new Error('Property not found');
  }

  // Check if already in wishlist
  const existingItem = await prisma.wishlist.findUnique({
    where: {
      userId_propertyId: {
        userId,
        propertyId
      }
    }
  });

  if (existingItem) {
    throw new Error('Property is already in your wishlist');
  }

  // Add to wishlist
  const wishlistItem = await prisma.wishlist.create({
    data: {
      userId,
      propertyId
    }
  });

  // Parse images
  const images = typeof property.images === 'string' 
    ? JSON.parse(property.images) 
    : property.images || {};

  return {
    id: wishlistItem.id,
    userId,
    type: 'property',
    itemId: propertyId,
    itemDetails: {
      name: property.name,
      location: property.location,
      price: property.pricePerNight,
      rating: property.averageRating || 0,
      image: images?.exterior?.[0] || ''
    },
    notes,
    isAvailable: property.status === 'active',
    priceAlerts: false,
    createdAt: wishlistItem.createdAt.toISOString()
  };
}

async getUserWishlist(
  userId: number, 
  filters: WishlistFilters = {}, 
  page: number = 1, 
  limit: number = 20
) {
  const skip = (page - 1) * limit;

  // Build where clause
  const whereClause: any = { userId };

  // Since we only support properties for now
  if (filters.type === 'tour') {
    return {
      items: [],
      total: 0,
      page,
      limit,
      totalPages: 0
    };
  }

  const propertyWhere: any = {};

  if (filters.location) {
    propertyWhere.location = { contains: filters.location, mode: 'insensitive' };
  }

  if (filters.minPrice || filters.maxPrice) {
    propertyWhere.pricePerNight = {};
    if (filters.minPrice) propertyWhere.pricePerNight.gte = filters.minPrice;
    if (filters.maxPrice) propertyWhere.pricePerNight.lte = filters.maxPrice;
  }

  if (filters.isAvailable !== undefined) {
    propertyWhere.status = filters.isAvailable ? 'active' : { not: 'active' };
  }

  if (filters.search) {
    propertyWhere.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { location: { contains: filters.search, mode: 'insensitive' } },
      { description: { contains: filters.search, mode: 'insensitive' } }
    ];
  }

  if (Object.keys(propertyWhere).length > 0) {
    whereClause.property = propertyWhere;
  }

  const [wishlistItems, total] = await Promise.all([
    prisma.wishlist.findMany({
      where: whereClause,
      include: {
        property: {
          select: {
            id: true,
            name: true,
            location: true,
            pricePerNight: true,
            averageRating: true,
            images: true,
            status: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit
    }),
    prisma.wishlist.count({ where: whereClause })
  ]);

  const items: WishlistItem[] = wishlistItems.map(item => {
    const images = typeof item.property.images === 'string' 
      ? JSON.parse(item.property.images) 
      : item.property.images || {};

    return {
      id: item.id,
      userId: item.userId,
      type: 'property',
      itemId: item.property.id,
      itemDetails: {
        name: item.property.name,
        location: item.property.location,
        price: item.property.pricePerNight,
        rating: item.property.averageRating || 0,
        image: images?.exterior?.[0] || ''
      },
      isAvailable: item.property.status === 'active',
      priceAlerts: false,
      createdAt: item.createdAt.toISOString()
    };
  });

  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit)
  };
}

async removeFromWishlist(userId: number, wishlistItemId: string): Promise<void> {
  const wishlistItem = await prisma.wishlist.findFirst({
    where: {
      id: wishlistItemId,
      userId: userId
    }
  });

  if (!wishlistItem) {
    throw new Error('Wishlist item not found or access denied');
  }

  await prisma.wishlist.delete({
    where: { id: wishlistItemId }
  });
}

async isInWishlist(userId: number, type: 'property' | 'tour', itemId: string | number): Promise<boolean> {
  if (type === 'tour') {
    return false; // Not supported yet
  }

  const existingItem = await prisma.wishlist.findUnique({
    where: {
      userId_propertyId: {
        userId,
        propertyId: itemId as number
      }
    }
  });

  return !!existingItem;
}

async getWishlistStats(userId: number): Promise<WishlistStats> {
  const wishlistItems = await prisma.wishlist.findMany({
    where: { userId },
    include: {
      property: {
        select: {
          pricePerNight: true,
          status: true
        }
      }
    }
  });

  const activeItems = wishlistItems.filter(item => item.property.status === 'active');
  const totalValue = activeItems.reduce((sum, item) => sum + item.property.pricePerNight, 0);

  return {
    totalItems: wishlistItems.length,
    propertyCount: wishlistItems.length,
    tourCount: 0, // Not supported yet
    totalValue,
    averagePrice: activeItems.length > 0 ? totalValue / activeItems.length : 0
  };
}

async clearWishlist(userId: number): Promise<void> {
  await prisma.wishlist.deleteMany({
    where: { userId }
  });
}

// --- HELPER METHODS ---
private transformToPropertyBookingInfo(booking: any): PropertyBookingInfo {
  const checkIn = new Date(booking.checkIn);
  const checkOut = new Date(booking.checkOut);
  const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));

    return {
      id: booking.id,
      propertyId: booking.propertyId,
      property: {
        name: booking.property.name,
        location: booking.property.location,
        images: JSON.parse(booking.property.images || '{}'),
        pricePerNight: booking.property.pricePerNight,
        hostName: `${booking.property.host.firstName} ${booking.property.host.lastName}`,
        hostEmail: booking.property.host.email,
        hostPhone: booking.property.host.phone
      },
      guestId: booking.guestId,
      guest: {
        firstName: booking.guest.firstName,
        lastName: booking.guest.lastName,
        email: booking.guest.email,
        phone: booking.guest.phone,
        profileImage: booking.guest.profileImage
      },
      checkIn: booking.checkIn.toISOString(),
      checkOut: booking.checkOut.toISOString(),
      guests: booking.guests,
      nights,
      totalPrice: booking.totalPrice,
      status: booking.status as PropertyBookingStatus,
      paymentStatus: booking.paymentStatus,
      message: booking.message,
      hostResponse: booking.hostResponse,
      specialRequests: booking.specialRequests,
      checkInInstructions: booking.checkInInstructions,
      checkOutInstructions: booking.checkOutInstructions,
      createdAt: booking.createdAt.toISOString(),
      updatedAt: booking.updatedAt.toISOString()
    };
  }

  private transformToTourBookingInfo(booking: any): TourBookingInfo {
    return {
      id: booking.id,
      tourId: booking.tourId,
      tour: {
        title: booking.tour.title,
        description: booking.tour.description,
        category: booking.tour.category,
        type: booking.tour.type,
        duration: booking.tour.duration,
        difficulty: booking.tour.difficulty,
        location: `${booking.tour.locationCity}, ${booking.tour.locationCountry}`,
        images: JSON.parse(booking.tour.images || '{}'),
        price: booking.tour.price,
        currency: booking.tour.currency,
        inclusions: JSON.parse(booking.tour.inclusions || '[]'),
        exclusions: JSON.parse(booking.tour.exclusions || '[]'),
        requirements: JSON.parse(booking.tour.requirements || '[]'),
        meetingPoint: booking.tour.meetingPoint
      },
      scheduleId: booking.scheduleId,
      schedule: {
        startDate: booking.schedule.startDate.toISOString(),
        endDate: booking.schedule.endDate.toISOString(),
        startTime: booking.schedule.startTime,
        endTime: booking.schedule.endTime,
        availableSlots: booking.schedule.availableSlots,
        bookedSlots: booking.schedule.bookedSlots
      },
      tourGuideId: booking.tourGuideId,
      tourGuide: {
        firstName: booking.tour.tourGuide.firstName,
        lastName: booking.tour.tourGuide.lastName,
        email: booking.tour.tourGuide.email,
        phone: booking.tour.tourGuide.phone,
        profileImage: booking.tour.tourGuide.profileImage,
        bio: booking.tour.tourGuide.bio,
        rating: booking.tour.tourGuide.rating,
        totalTours: booking.tour.tourGuide.totalTours
      },
      userId: booking.userId,
      user: {
        firstName: booking.user.firstName,
        lastName: booking.user.lastName,
        email: booking.user.email,
        phone: booking.user.phone,
        profileImage: booking.user.profileImage
      },
      numberOfParticipants: booking.numberOfParticipants,
      participants: JSON.parse(booking.participants || '[]'),
      totalAmount: booking.totalAmount,
      currency: booking.currency,
      status: booking.status as TourBookingStatus,
      paymentStatus: booking.paymentStatus,
      checkInStatus: booking.checkInStatus as TourCheckInStatus,
      checkInTime: booking.checkInTime?.toISOString(),
      checkOutTime: booking.checkOutTime?.toISOString(),
      specialRequests: booking.specialRequests,
      refundAmount: booking.refundAmount,
      refundReason: booking.refundReason,
      bookingDate: booking.bookingDate.toISOString(),
      createdAt: booking.createdAt.toISOString(),
      updatedAt: booking.updatedAt.toISOString()
    };
  }

  private getStatusColor(status: string): string {
    const colors: { [key: string]: string } = {
      'pending': '#f59e0b',
      'confirmed': '#10b981',
      'cancelled': '#ef4444',
      'completed': '#6366f1',
      'refunded': '#8b5cf6',
      'in_progress': '#06b6d4',
      'no_show': '#6b7280'
    };
    return colors[status] || '#9ca3af';
  }
}