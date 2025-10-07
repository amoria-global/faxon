//src/services/property.service.ts - Cleaned with Enhanced KPIs
import { PrismaClient } from '@prisma/client';
import { BrevoPropertyMailingService } from '../utils/brevo.property';
import {
  CreatePropertyDto,
  UpdatePropertyDto,
  PropertySearchFilters,
  PropertyInfo,
  PropertySummary,
  BookingRequest,
  BookingInfo,
  CreateReviewDto,
  PropertyReview,
  PropertyAnalytics,
  HostDashboard,
  PropertyImages,
  MediaUploadResponse,
  DynamicPricing,
  AvailabilityCalendar,
  CalendarDay,
  AnalyticsOverview,
  BookingCalendar,
  BookingCalendarDay,
  BookingFilters,
  BookingTrendData,
  BookingUpdateDto,
  DashboardActivity,
  EarningsBreakdown,
  EarningsOverview,
  EnhancedHostDashboard,
  GuestAnalytics,
  GuestBookingHistory,
  GuestProfile,
  GuestSearchFilters,
  HostAnalytics,
  PropertyPerformanceMetrics,
  RevenueAnalytics,
  BookingStatus,
  AgentBookingInfo,
  AgentCommissionInfo,
  AgentDashboard,
  AgentEarnings,
  MonthlyCommissionData
} from '../types/property.types';

// Enhanced KPI interfaces
interface AdditionalAgentKPIs {
  conversionRate: number; // Lead to booking conversion %
  averageResponseTime: number; // in hours
  customerRetentionRate: number; // Repeat client %
  revenuePerClient: number; // Average revenue per client
  bookingSuccessRate: number; // Successful bookings vs attempted
  portfolioGrowthRate: number; // Property portfolio growth %
  leadGenerationRate: number; // New leads per month
  commissionGrowthRate: number; // Month-over-month commission growth
  averageDaysOnMarket: number; // Time to first booking
  propertyViewsToBookingRatio: number; // Views to booking conversion
  clientSatisfactionScore: number; // Average client rating
  marketPenetration: number; // Market share %
  averageCommissionPerProperty: number;
  propertyUtilizationRate: number; // % of properties actively generating bookings
  crossSellingSuccess: number; // Additional services sold per client
}

interface EnhancedAgentDashboard extends AgentDashboard {
  additionalKPIs: AdditionalAgentKPIs;
  performanceTrends: {
    conversionTrend: Array<{ month: string; rate: number }>;
    retentionTrend: Array<{ month: string; rate: number }>;
    revenueTrend: Array<{ month: string; revenue: number }>;
    satisfactionTrend: Array<{ month: string; score: number }>;
  };
  competitiveMetrics: {
    marketRanking: number;
    totalAgentsInMarket: number;
    marketSharePercentage: number;
    competitorComparison: {
      averageCommission: number;
      averageProperties: number;
      averageClientRetention: number;
    };
  };
  clientSegmentation: {
    newClients: number;
    repeatClients: number;
    vipClients: number;
    inactiveClients: number;
  };
}

const prisma = new PrismaClient();

export class PropertyService {
  private emailService = new BrevoPropertyMailingService();
  
  // --- PROPERTY CRUD OPERATIONS ---
  async createProperty(hostId: number, data: CreatePropertyDto): Promise<PropertyInfo> {
    // Validate availability dates
    if (new Date(data.availabilityDates.start) >= new Date(data.availabilityDates.end)) {
      throw new Error('End date must be after start date');
    }

    let upiNumber: string | undefined;
    let propertyAddress: string | undefined;
    let locationString: string;

    if (typeof data.location === 'object' && data.location.type) {
      if (data.location.type === 'upi') {
        upiNumber = data.location.upi;
        locationString = `UPI: ${data.location.upi}`;
      } else if (data.location.type === 'address') {
        propertyAddress = data.location.address;
        locationString = data.location.address;
      } else {
        locationString = data.location.address || data.location.upi || '';
      }
    } else {
      // Fallback for string location (backward compatibility)
      locationString = typeof data.location === 'string' ? data.location : '';
    }

    const property = await prisma.property.create({
      data: {
        hostId,
        name: data.name,
        location: locationString,
        propertyAddress: propertyAddress,
        upiNumber: upiNumber,
        type: data.type,
        category: data.category,
        pricePerNight: data.pricePerNight,
        pricePerTwoNights: data.pricePerTwoNights,
        beds: data.beds,
        baths: data.baths,
        maxGuests: data.maxGuests,
        features: JSON.stringify(data.features),
        description: data.description,
        images: JSON.stringify(data.images),
        video3D: data.video3D,
        availableFrom: new Date(data.availabilityDates.start),
        availableTo: new Date(data.availabilityDates.end),
        status: 'pending' // Default status for new properties
      },
      include: {
        host: true,
        reviews: true,
        bookings: true
      }
    }) as any;

    try {
      // Send property submission confirmation email
      await this.emailService.sendPropertySubmissionEmail({
        host: {
          firstName: property.host.firstName,
          lastName: property.host.lastName,
          email: property.host.email,
          id: property.hostId
        },
        company: {
          name: 'Jambolush',
          website: 'https://jambolush.com',
          supportEmail: 'support@jambolush.com',
          logo: 'https://jambolush.com/logo.png'
        },
        property: await this.transformToPropertyInfo(property)
      });
    } catch (emailError) {
      console.error('Failed to send property submission email:', emailError);
      // Don't fail property creation if email fails
    }

    return this.transformToPropertyInfo(property);
  }

  async updateProperty(propertyId: number, hostId: number, data: UpdatePropertyDto): Promise<PropertyInfo> {
    const existingProperty = await prisma.property.findFirst({
      where: { id: propertyId, hostId }
    });

    if (!existingProperty) {
      throw new Error('Property not found or access denied');
    }

    // Handle location updates
    let locationUpdates: any = {};
    if (data.location) {
      if (typeof data.location === 'object' && data.location.type) {
        if (data.location.type === 'upi') {
          locationUpdates = {
            location: `UPI: ${data.location.upi}`,
            upiNumber: data.location.upi,
            propertyAddress: null // Clear address when switching to UPI
          };
        } else if (data.location.type === 'address') {
          locationUpdates = {
            location: data.location.address,
            propertyAddress: data.location.address,
            upiNumber: null // Clear UPI when switching to address
          };
        }
      } else if (typeof data.location === 'string') {
        locationUpdates = {
          location: data.location
        };
      }
    }

    let updatedImages = existingProperty.images || undefined;
    if (data.images) {
      const currentImages = existingProperty.images 
        ? JSON.parse(existingProperty.images as string) 
        : {};
      updatedImages = JSON.stringify({ ...currentImages, ...data.images });
    }

    const property = await prisma.property.update({
      where: { id: propertyId },
      data: {
        ...(data.name && { name: data.name }),
        ...locationUpdates,
        ...(data.type && { type: data.type }),
        ...(data.category && { category: data.category }),
        ...(data.pricePerNight && { pricePerNight: data.pricePerNight }),
        ...(data.pricePerTwoNights && { pricePerTwoNights: data.pricePerTwoNights }),
        ...(data.beds && { beds: data.beds }),
        ...(data.baths && { baths: data.baths }),
        ...(data.maxGuests && { maxGuests: data.maxGuests }),
        ...(data.features && { features: JSON.stringify(data.features) }),
        ...(data.description && { description: data.description }),
        ...(data.video3D && { video3D: data.video3D }),
        ...(data.status && { status: data.status }),
        ...(data.availabilityDates && {
          availableFrom: new Date(data.availabilityDates.start),
          availableTo: new Date(data.availabilityDates.end)
        }),
        ...(updatedImages !== undefined && { images: updatedImages })
      },
      include: {
        host: true,
        reviews: true,
        bookings: true
      }
    });

    return this.transformToPropertyInfo(property);
  }

  async deleteProperty(propertyId: number, hostId: number): Promise<void> {
    const property = await prisma.property.findFirst({
      where: { id: propertyId, hostId }
    });

    if (!property) {
      throw new Error('Property not found or access denied');
    }

    const activeBookings = await prisma.booking.count({
      where: {
        propertyId,
        status: { in: ['pending', 'confirmed'] },
        checkOut: { gte: new Date() }
      }
    });

    if (activeBookings > 0) {
      throw new Error('Cannot delete property with active bookings');
    }

    await prisma.property.delete({
      where: { id: propertyId }
    });
  }

  // --- PROPERTY QUERIES ---
  async getPropertyById(propertyId: number): Promise<PropertyInfo | null> {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      include: {
        host: true,
        reviews: {
          include: { user: true },
          orderBy: { createdAt: 'desc' },
          take: 10
        },
        bookings: {
          where: { status: 'confirmed' },
          select: { id: true }
        }
      }
    });

    if (!property) return null;

    await prisma.property.update({
      where: { id: propertyId },
      data: { views: { increment: 1 } }
    });

    return this.transformToPropertyInfo(property);
  }

  async searchProperties(filters: PropertySearchFilters, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    
    const whereClause: any = {
      status: 'active'
    };

    // Apply filters
    if (filters.location) {
      whereClause.location = { contains: filters.location };
    }
    if (filters.type) {
      whereClause.type = filters.type;
    }
    if (filters.category) {
      whereClause.category = filters.category;
    }
    if (filters.minPrice || filters.maxPrice) {
      whereClause.pricePerNight = {};
      if (filters.minPrice) whereClause.pricePerNight.gte = filters.minPrice;
      if (filters.maxPrice) whereClause.pricePerNight.lte = filters.maxPrice;
    }
    if (filters.beds) {
      whereClause.beds = { gte: filters.beds };
    }
    if (filters.baths) {
      whereClause.baths = { gte: filters.baths };
    }
    if (filters.maxGuests) {
      whereClause.maxGuests = { gte: filters.maxGuests };
    }
    if (filters.features && filters.features.length > 0) {
      whereClause.features = {
        contains: filters.features
      };
    }
    if (filters.availableFrom && filters.availableTo) {
      whereClause.AND = [
        { availableFrom: { lte: new Date(filters.availableFrom) } },
        { availableTo: { gte: new Date(filters.availableTo) } }
      ];
    }
    if (filters.hostId) {
      whereClause.hostId = filters.hostId;
    }
    
    // Keyword search block
    const orConditions = [];
    if (filters.search) {
      orConditions.push(
        { name: { contains: filters.search } },
        { location: { contains: filters.search } },
        { description: { contains: filters.search } }
      );
    }
    
    if (orConditions.length > 0) {
      if (whereClause.OR) {
        whereClause.OR.push(...orConditions);
      } else {
        whereClause.OR = orConditions;
      }
    }

    // Sort options block
    const orderBy: any = {};
    if (filters.sortBy) {
      if (filters.sortBy === 'rating') {
        orderBy.averageRating = filters.sortOrder || 'desc';
      } else if (filters.sortBy === 'price') {
        orderBy.pricePerNight = filters.sortOrder || 'asc';
      } else if (filters.sortBy === 'name') {
        orderBy.name = filters.sortOrder || 'asc';
      } else {
        orderBy[filters.sortBy] = filters.sortOrder || 'desc';
      }
    } else {
      orderBy.createdAt = 'desc';
    }

    const [properties, total] = await Promise.all([
      prisma.property.findMany({
        where: whereClause,
        include: {
          host: true,
          reviews: { select: { rating: true } }
        },
        orderBy,
        skip,
        take: limit
      }),
      prisma.property.count({ where: whereClause })
    ]);

    return {
      properties: properties.map((p: any) => this.transformToPropertySummary(p)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  async getPropertiesByHost(hostId: number, filters?: Partial<PropertySearchFilters>) {
    const whereClause: any = { hostId };
    
    if (filters?.status) {
      whereClause.status = filters.status;
    }

    const properties = await prisma.property.findMany({
      where: whereClause,
      include: {
        host: true,
        reviews: { select: { rating: true } },
        bookings: {
          where: { status: 'confirmed' },
          select: { id: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const transformedProperties = await Promise.all(
      properties.map((p: any) => this.transformToPropertyInfo(p))
    );
    
    return transformedProperties;
  }

  // --- BOOKING MANAGEMENT ---
  async createBooking(guestId: number, data: BookingRequest): Promise<BookingInfo> {
    // Check property availability
    const property = await prisma.property.findUnique({
      where: { id: data.propertyId }
    });

    if (!property || property.status !== 'active') {
      throw new Error('Property not available');
    }

    // Check date availability
    const conflictingBooking = await prisma.booking.findFirst({
      where: {
        propertyId: data.propertyId,
        status: { in: ['pending', 'confirmed'] },
        OR: [
          {
            checkIn: { lte: new Date(data.checkIn) },
            checkOut: { gt: new Date(data.checkIn) }
          },
          {
            checkIn: { lt: new Date(data.checkOut) },
            checkOut: { gte: new Date(data.checkOut) }
          },
          {
            checkIn: { gte: new Date(data.checkIn) },
            checkOut: { lte: new Date(data.checkOut) }
          }
        ]
      }
    });

    if (conflictingBooking) {
      throw new Error('Property is not available for selected dates');
    }

    const booking = await prisma.booking.create({
      data: {
        propertyId: data.propertyId,
        guestId,
        checkIn: new Date(data.checkIn),
        checkOut: new Date(data.checkOut),
        guests: data.guests,
        totalPrice: data.totalPrice,
        message: data.message,
        status: 'pending'
      },
      include: {
        property: true,
        guest: true
      }
    });

    // Update property total bookings
    await prisma.property.update({
      where: { id: data.propertyId },
      data: { totalBookings: { increment: 1 } }
    });

    return this.transformToBookingInfo(booking);
  }

  async getBookingsByProperty(propertyId: number, hostId: number) {
    // Verify property ownership
    const property = await prisma.property.findFirst({
      where: { id: propertyId, hostId }
    });

    if (!property) {
      throw new Error('Property not found or access denied');
    }

    const bookings = await prisma.booking.findMany({
      where: { propertyId },
      include: {
        guest: true,
        property: { select: { name: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    return bookings.map((b: any) => this.transformToBookingInfo(b));
  }

  // --- REVIEW MANAGEMENT ---
  async createReview(userId: number, data: CreateReviewDto): Promise<PropertyReview> {
    // Check if user has completed booking for this property
    const completedBooking = await prisma.booking.findFirst({
      where: {
        propertyId: data.propertyId,
        guestId: userId,
        status: 'completed',
        checkOut: { lt: new Date() }
      }
    });

    if (!completedBooking) {
      throw new Error('You can only review properties you have stayed at');
    }

    // Check if user already reviewed this property
    const existingReview = await prisma.review.findFirst({
      where: {
        propertyId: data.propertyId,
        userId
      }
    });

    if (existingReview) {
      throw new Error('You have already reviewed this property');
    }

    const review = await prisma.review.create({
      data: {
        propertyId: data.propertyId,
        userId,
        rating: data.rating,
        comment: data.comment,
        images: data.images ? JSON.stringify(data.images) : undefined
      },
      include: { user: true }
    });

    // Update property average rating
    await this.updatePropertyRating(data.propertyId);

    try {
      // Get property and host info for email
      const propertyWithHost = await prisma.property.findUnique({
        where: { id: data.propertyId },
        include: { host: true }
      });

      if (propertyWithHost && propertyWithHost.host && propertyWithHost.hostId) {
        await this.emailService.sendNewReviewNotificationEmail({
          host: {
            firstName: propertyWithHost.host.firstName,
            lastName: propertyWithHost.host.lastName,
            email: propertyWithHost.host.email,
            id: propertyWithHost.hostId
          },
          company: {
            name: 'Jambolush',
            website: 'https://jambolush.com',
            supportEmail: 'support@jambolush.com',
            logo: 'https://jambolush.com/logo.png'
          },
          property: await this.transformToPropertyInfo(propertyWithHost),
          review: this.transformToPropertyReview(review)
        });
      }
    } catch (emailError) {
      console.error('Failed to send new review notification email:', emailError);
    }

    return this.transformToPropertyReview(review);
  }

  async getPropertyReviews(propertyId: number, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        where: { propertyId },
        include: { user: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.review.count({ where: { propertyId } })
    ]);

    return {
      reviews: reviews.map((r: any) => this.transformToPropertyReview(r)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  // --- ANALYTICS & DASHBOARD ---
  async getHostDashboard(hostId: number): Promise<HostDashboard> {
    const [
      totalProperties,
      activeProperties,
      bookings,
      reviews
    ] = await Promise.all([
      prisma.property.count({ where: { hostId } }),
      prisma.property.count({ where: { hostId, status: 'active' } }),
      prisma.booking.findMany({
        where: {
          property: { hostId },
          status: { in: ['pending', 'confirmed', 'completed'] }
        },
        include: { property: true, guest: true },
        orderBy: { createdAt: 'desc' },
        take: 10
      }),
      prisma.review.count({
        where: { property: { hostId } }
      })
    ]);

    const totalBookings = bookings.length;
    const totalRevenue = bookings
      .filter((b: { status: string; }) => b.status === 'completed')
      .reduce((sum: any, b: { totalPrice: any; }) => sum + b.totalPrice, 0);

    const avgRating = await prisma.property.aggregate({
      where: { hostId },
      _avg: { averageRating: true }
    });

    const upcomingCheckIns = bookings
      .filter((b: { status: string; checkIn: any; }) => b.status === 'confirmed' && new Date(b.checkIn) > new Date())
      .slice(0, 5);

    return {
      totalProperties,
      activeProperties,
      totalBookings,
      totalRevenue,
      averageRating: avgRating._avg.averageRating || 0,
      recentBookings: bookings.slice(0, 5).map((b: any) => this.transformToBookingInfo(b)),
      propertyPerformance: [],
      upcomingCheckIns: upcomingCheckIns.map((b: any) => this.transformToBookingInfo(b)),
      pendingReviews: reviews
    };
  }

  // --- GUEST MANAGEMENT ---
  async getHostGuests(hostId: number, filters?: GuestSearchFilters) {
    const whereClause: any = {
      bookingsAsGuest: {
        some: {
          property: {
            hostId: hostId
          }
        }
      }
    };

    // Apply search filters
    if (filters?.search) {
      whereClause.OR = [
        { firstName: { contains: filters.search } },
        { lastName: { contains: filters.search } },
        { email: { contains: filters.search } }
      ];
    }

    if (filters?.verificationStatus) {
      whereClause.verificationStatus = filters.verificationStatus;
    }

    // Date range filter for bookings
    if (filters?.dateRange) {
      whereClause.bookingsAsGuest.some.createdAt = {
        gte: new Date(filters.dateRange.start),
        lte: new Date(filters.dateRange.end)
      };
    }

    const orderBy: any = {};
    if (filters?.sortBy) {
      switch (filters.sortBy) {
        case 'name':
          orderBy.firstName = filters.sortOrder || 'asc';
          break;
        case 'joinDate':
          orderBy.createdAt = filters.sortOrder || 'desc';
          break;
        default:
          orderBy[filters.sortBy] = filters.sortOrder || 'desc';
      }
    } else {
      orderBy.createdAt = 'desc';
    }

    const guests = await prisma.user.findMany({
      where: whereClause,
      include: {
        bookingsAsGuest: {
          where: {
            property: { hostId }
          },
          include: {
            property: { select: { name: true } }
          },
          orderBy: { createdAt: 'desc' }
        },
        reviews: {
          where: {
            property: { hostId }
          }
        }
      },
      orderBy
    });

    return guests.map((guest: any) => this.transformToGuestProfile(guest));
  }

  async getGuestDetails(hostId: number, guestId: number): Promise<GuestBookingHistory> {
    const guest = await prisma.user.findFirst({
      where: {
        id: guestId,
        bookingsAsGuest: {
          some: {
            property: { hostId }
          }
        }
      },
      include: {
        bookingsAsGuest: {
          where: {
            property: { hostId }
          },
          include: {
            property: { select: { name: true } }
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!guest) {
      throw new Error('Guest not found or no booking history with your properties');
    }

    const bookings = guest.bookingsAsGuest.map((b: any) => this.transformToBookingInfo(b));
    const totalRevenue = bookings
      .filter(b => b.status === 'completed')
      .reduce((sum, b) => sum + b.totalPrice, 0);

    const avgStayDuration = bookings.length > 0 
      ? bookings.reduce((sum, b) => {
          const checkIn = new Date(b.checkIn);
          const checkOut = new Date(b.checkOut);
          return sum + Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
        }, 0) / bookings.length
      : 0;

    // Find most booked property
    const propertyBookings = bookings.reduce((acc: any, b) => {
      acc[b.propertyName] = (acc[b.propertyName] || 0) + 1;
      return acc;
    }, {});
    
    const favoriteProperty = Object.keys(propertyBookings).length > 0 
      ? Object.keys(propertyBookings).reduce((a, b) => propertyBookings[a] > propertyBookings[b] ? a : b)
      : undefined;

    return {
      guestId: guest.id,
      bookings,
      totalBookings: bookings.length,
      totalRevenue,
      averageStayDuration: avgStayDuration,
      favoriteProperty
    };
  }

  async getHostBookings(hostId: number, filters?: BookingFilters, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    
    const whereClause: any = {
      property: { hostId }
    };

    if (filters?.status) {
      whereClause.status = { in: filters.status };
    }

    if (filters?.propertyId) {
      whereClause.propertyId = filters.propertyId;
    }

    if (filters?.guestId) {
      whereClause.guestId = filters.guestId;
    }

    if (filters?.dateRange) {
      whereClause.createdAt = {
        gte: new Date(filters.dateRange.start),
        lte: new Date(filters.dateRange.end)
      };
    }

    const orderBy: any = {};
    if (filters?.sortBy) {
      switch (filters.sortBy) {
        case 'date':
          orderBy.checkIn = filters.sortOrder || 'desc';
          break;
        case 'amount':
          orderBy.totalPrice = filters.sortOrder || 'desc';
          break;
        case 'property':
          orderBy.property = { name: filters.sortOrder || 'asc' };
          break;
        case 'guest':
          orderBy.guest = { firstName: filters.sortOrder || 'asc' };
          break;
        default:
          orderBy.createdAt = 'desc';
      }
    } else {
      orderBy.createdAt = 'desc';
    }

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where: whereClause,
        include: {
          property: { select: { name: true, location: true } },
          guest: { select: { firstName: true, lastName: true, email: true, profileImage: true } }
        },
        orderBy,
        skip,
        take: limit
      }),
      prisma.booking.count({ where: whereClause })
    ]);

    return {
      bookings: bookings.map((b: any) => this.transformToBookingInfo(b)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  async updateBooking(hostId: number, bookingId: string, data: BookingUpdateDto): Promise<BookingInfo> {
    // Verify host owns the property for this booking
    const booking = await prisma.booking.findFirst({
      where: {
        id: bookingId,
        property: { hostId }
      },
      include: {
        property: true,
        guest: true
      }
    });

    if (!booking) {
      throw new Error('Booking not found or access denied');
    }

    const updateData: any = {};
    
    if (data.status) updateData.status = data.status;
    if (data.notes) updateData.notes = data.notes;
    if (data.specialRequests) updateData.specialRequests = data.specialRequests;
    if (data.checkInInstructions) updateData.checkInInstructions = data.checkInInstructions;
    if (data.checkOutInstructions) updateData.checkOutInstructions = data.checkOutInstructions;

    const updatedBooking = await prisma.booking.update({
      where: { id: bookingId },
      data: updateData,
      include: {
        property: true,
        guest: true
      }
    });

    return this.transformToBookingInfo(updatedBooking);
  }

  async getBookingCalendar(hostId: number, year: number, month: number): Promise<BookingCalendar> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    
    const bookings = await prisma.booking.findMany({
      where: {
        property: { hostId },
        status: { in: ['confirmed', 'completed'] },
        OR: [
          {
            checkIn: { gte: startDate, lte: endDate }
          },
          {
            checkOut: { gte: startDate, lte: endDate }
          },
          {
            AND: [
              { checkIn: { lte: startDate } },
              { checkOut: { gte: endDate } }
            ]
          }
        ]
      },
      include: {
        property: { select: { name: true } },
        guest: { select: { firstName: true, lastName: true } }
      }
    });

    const days: BookingCalendarDay[] = [];
    const today = new Date();

    for (let day = 1; day <= endDate.getDate(); day++) {
      const currentDate = new Date(year, month - 1, day);
      const dateStr = currentDate.toISOString().split('T')[0];
      
      const dayBookings = bookings
        .filter(booking => {
          const checkIn = new Date(booking.checkIn);
          const checkOut = new Date(booking.checkOut);
          return currentDate >= checkIn && currentDate <= checkOut;
        })
        .map(booking => {
          const checkIn = new Date(booking.checkIn);
          const checkOut = new Date(booking.checkOut);
          
          let type: 'check_in' | 'check_out' | 'ongoing' = 'ongoing';
          if (currentDate.toDateString() === checkIn.toDateString()) {
            type = 'check_in';
          } else if (currentDate.toDateString() === checkOut.toDateString()) {
            type = 'check_out';
          }

          return {
            id: booking.id,
            guestName: `${booking.guest.firstName} ${booking.guest.lastName}`,
            propertyName: booking.property.name,
            type,
            status: booking.status as BookingStatus
          };
        });

      const revenue = dayBookings.reduce((sum, booking) => {
        const fullBooking = bookings.find(b => b.id === booking.id);
        return sum + (fullBooking?.totalPrice || 0);
      }, 0);

      days.push({
        date: dateStr,
        bookings: dayBookings,
        revenue,
        isToday: currentDate.toDateString() === today.toDateString()
      });
    }

    return {
      year,
      month,
      days
    };
  }

  async getEarningsOverview(hostId: number): Promise<EarningsOverview> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    const [
      totalEarnings,
      monthlyEarnings,
      yearlyEarnings,
      lastMonthEarnings,
      totalBookings,
      monthlyBookings,
      occupiedNights,
      totalNights
    ] = await Promise.all([
      prisma.booking.aggregate({
        where: {
          property: { hostId },
          status: 'completed'
        },
        _sum: { totalPrice: true }
      }),
      prisma.booking.aggregate({
        where: {
          property: { hostId },
          status: 'completed',
          checkOut: { gte: startOfMonth }
        },
        _sum: { totalPrice: true }
      }),
      prisma.booking.aggregate({
        where: {
          property: { hostId },
          status: 'completed',
          checkOut: { gte: startOfYear }
        },
        _sum: { totalPrice: true }
      }),
      prisma.booking.aggregate({
        where: {
          property: { hostId },
          status: 'completed',
          checkOut: { gte: lastMonthStart, lte: lastMonthEnd }
        },
        _sum: { totalPrice: true }
      }),
      prisma.booking.count({
        where: {
          property: { hostId },
          status: 'completed'
        }
      }),
      prisma.booking.count({
        where: {
          property: { hostId },
          status: 'completed',
          checkOut: { gte: startOfMonth }
        }
      }),
      prisma.booking.findMany({
        where: {
          property: { hostId },
          status: 'completed'
        },
        select: { checkIn: true, checkOut: true }
      }),
      prisma.property.count({
        where: { hostId, status: 'active' }
      })
    ]);

    const occupiedNightsCount = occupiedNights.reduce((total, booking) => {
      const nights = Math.ceil((new Date(booking.checkOut).getTime() - new Date(booking.checkIn).getTime()) / (1000 * 60 * 60 * 24));
      return total + nights;
    }, 0);

    const totalAvailableNights = totalNights * 365;
    const occupancyRate = totalAvailableNights > 0 ? (occupiedNightsCount / totalAvailableNights) * 100 : 0;

    const avgNightlyRate = occupiedNightsCount > 0 ? (totalEarnings._sum.totalPrice || 0) / occupiedNightsCount : 0;

    const currentMonth = monthlyEarnings._sum.totalPrice || 0;
    const lastMonth = lastMonthEarnings._sum.totalPrice || 0;
    const revenueGrowth = lastMonth > 0 ? ((currentMonth - lastMonth) / lastMonth) * 100 : 0;

    return {
      totalEarnings: totalEarnings._sum.totalPrice || 0,
      monthlyEarnings: currentMonth,
      yearlyEarnings: yearlyEarnings._sum.totalPrice || 0,
      pendingPayouts: 0,
      completedPayouts: 0,
      averageNightlyRate: avgNightlyRate,
      occupancyRate: occupancyRate,
      revenueGrowth: revenueGrowth
    };
  }

  async getEarningsBreakdown(hostId: number): Promise<EarningsBreakdown[]> {
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const properties = await prisma.property.findMany({
      where: { hostId },
      include: {
        bookings: {
          where: { status: 'completed' },
          select: {
            totalPrice: true,
            checkIn: true,
            checkOut: true,
            createdAt: true
          }
        }
      }
    });

    return properties.map(property => {
      const allBookings = property.bookings;
      const monthlyBookings = allBookings.filter(b => new Date(b.checkOut) >= startOfMonth);
      
      const totalEarnings = allBookings.reduce((sum, b) => sum + b.totalPrice, 0);
      const monthlyEarnings = monthlyBookings.reduce((sum, b) => sum + b.totalPrice, 0);
      
      const totalNights = allBookings.reduce((sum, b) => {
        const nights = Math.ceil((new Date(b.checkOut).getTime() - new Date(b.checkIn).getTime()) / (1000 * 60 * 60 * 24));
        return sum + nights;
      }, 0);

      const avgBookingValue = allBookings.length > 0 ? totalEarnings / allBookings.length : 0;
      const occupancyRate = totalNights > 0 ? (totalNights / (365 * (new Date().getFullYear() - new Date(property.createdAt).getFullYear() + 1))) * 100 : 0;
      
      const lastBooking = allBookings.length > 0 
        ? allBookings.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
        : null;

      return {
        propertyId: property.id,
        propertyName: property.name,
        totalEarnings,
        monthlyEarnings,
        bookingsCount: allBookings.length,
        averageBookingValue: avgBookingValue,
        occupancyRate: Math.min(occupancyRate, 100),
        lastBooking: lastBooking?.createdAt.toISOString()
      };
    });
  }

  async getHostAnalytics(hostId: number, timeRange: 'week' | 'month' | 'quarter' | 'year' = 'month'): Promise<HostAnalytics> {
    const now = new Date();
    let startDate: Date;

    switch (timeRange) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'quarter':
        startDate = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
        break;
      case 'year':
        startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    }

    const [overview, propertyPerformance, bookingTrends, guestInsights, revenueAnalytics] = await Promise.all([
      this.getAnalyticsOverview(hostId, timeRange),
      this.getPropertyPerformanceMetrics(hostId, timeRange),
      this.getBookingTrendData(hostId, startDate),
      this.getGuestAnalytics(hostId),
      this.getRevenueAnalytics(hostId)
    ]);

    return {
      overview,
      propertyPerformance,
      bookingTrends,
      guestInsights,
      revenueAnalytics,
      marketComparison: {
        averagePrice: 0,
        myAveragePrice: revenueAnalytics.monthlyRevenue.reduce((sum, m) => sum + m.revenue, 0) / Math.max(revenueAnalytics.monthlyRevenue.length, 1),
        occupancyRate: 0,
        myOccupancyRate: overview.occupancyRate,
        competitorCount: 0,
        marketPosition: 'mid_range',
        opportunities: []
      }
    };
  }

  async getEnhancedHostDashboard(hostId: number): Promise<EnhancedHostDashboard> {
    const basicDashboard = await this.getHostDashboard(hostId);
    
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const [todayCheckIns, todayCheckOuts, occupiedProperties, pendingActions, recentActivity] = await Promise.all([
      prisma.booking.count({
        where: {
          property: { hostId },
          status: 'confirmed',
          checkIn: {
            gte: new Date(todayStr),
            lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
          }
        }
      }),
      prisma.booking.count({
        where: {
          property: { hostId },
          status: 'confirmed',
          checkOut: {
            gte: new Date(todayStr),
            lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
          }
        }
      }),
      prisma.booking.count({
        where: {
          property: { hostId },
          status: 'confirmed',
          checkIn: { lte: today },
          checkOut: { gt: today }
        }
      }),
      prisma.booking.count({
        where: {
          property: { hostId },
          status: 'pending'
        }
      }),
      this.getRecentActivity(hostId)
    ]);

    return {
      ...basicDashboard,
      quickStats: {
        todayCheckIns,
        todayCheckOuts,
        occupiedProperties,
        pendingActions
      },
      recentActivity,
      alerts: [],
      marketTrends: {
        demandTrend: 'stable',
        averagePrice: 0,
        competitorActivity: 'Normal activity in your area'
      }
    };
  }

  // --- AGENT MANAGEMENT ---
  async getAgentDashboard(agentId: number): Promise<AgentDashboard> {
    const [
      totalClientsData,
      activeClientsData,
      totalCommissions,
      pendingCommissions,
      recentBookings,
      monthlyCommissions
    ] = await Promise.all([
      prisma.agentBooking.groupBy({
        by: ['clientId'],
        where: { agentId }
      }),
      prisma.agentBooking.groupBy({
        by: ['clientId'],
        where: {
          agentId,
          status: 'active',
          createdAt: { gte: new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000) }
        }
      }),
      prisma.agentBooking.aggregate({
        where: { agentId },
        _sum: { commission: true }
      }),
      prisma.agentBooking.aggregate({
        where: { 
          agentId,
          status: 'active'
        },
        _sum: { commission: true }
      }),
      prisma.agentBooking.findMany({
        where: { agentId },
        include: {
          client: { select: { firstName: true, lastName: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: 10
      }),
      this.getAgentMonthlyCommissions(agentId)
    ]);

    const totalClients = totalClientsData.length;
    const activeClients = activeClientsData.length;

    const avgCommissionPerBooking = recentBookings.length > 0 
      ? (totalCommissions._sum.commission || 0) / recentBookings.length 
      : 0;

    return {
      totalClients,
      activeClients,
      totalCommissions: totalCommissions._sum.commission || 0,
      pendingCommissions: pendingCommissions._sum.commission || 0,
      avgCommissionPerBooking,
      recentBookings: recentBookings.map(this.transformToAgentBookingInfo),
      monthlyCommissions
    };
  }

  // --- ENHANCED AGENT KPIs ---
  async getEnhancedAgentDashboard(agentId: number): Promise<EnhancedAgentDashboard> {
    const [
      basicDashboard, 
      additionalKPIs, 
      performanceTrends, 
      competitiveMetrics,
      clientSegmentation
    ] = await Promise.all([
      this.getAgentDashboard(agentId),
      this.getAdditionalAgentKPIs(agentId),
      this.getAgentPerformanceTrends(agentId),
      this.getAgentCompetitiveMetrics(agentId),
      this.getAgentClientSegmentation(agentId)
    ]);

    return {
      ...basicDashboard,
      additionalKPIs,
      performanceTrends,
      competitiveMetrics,
      clientSegmentation
    };
  }

  // --- PUBLIC KPI METHODS (Fixed accessibility) ---
  async getAdditionalAgentKPIs(agentId: number): Promise<AdditionalAgentKPIs> {
    const timeRange = 30; // Last 30 days
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - timeRange);

    const [
      conversionRate,
      averageResponseTime,
      customerRetentionRate,
      revenuePerClient,
      bookingSuccessRate,
      portfolioGrowthRate,
      leadGenerationRate,
      commissionGrowthRate,
      averageDaysOnMarket,
      propertyViewsToBookingRatio,
      clientSatisfactionScore,
      marketPenetration,
      averageCommissionPerProperty,
      propertyUtilizationRate,
      crossSellingSuccess
    ] = await Promise.all([
      this.getAgentConversionRate(agentId, startDate),
      this.getAgentAverageResponseTime(agentId, startDate),
      this.getAgentCustomerRetentionRate(agentId),
      this.getAgentRevenuePerClient(agentId, startDate),
      this.getAgentBookingSuccessRate(agentId, startDate),
      this.getAgentPortfolioGrowthRate(agentId),
      this.getAgentLeadGenerationRate(agentId, startDate),
      this.getAgentCommissionGrowthRate(agentId),
      this.getAgentAverageDaysOnMarket(agentId),
      this.getAgentPropertyViewsToBookingRatio(agentId, startDate),
      this.getAgentClientSatisfactionScore(agentId),
      this.getAgentMarketPenetration(agentId),
      this.getAgentAverageCommissionPerProperty(agentId),
      this.getAgentPropertyUtilizationRate(agentId),
      this.getAgentCrossSellingSuccess(agentId, startDate)
    ]);

    return {
      conversionRate,
      averageResponseTime,
      customerRetentionRate,
      revenuePerClient,
      bookingSuccessRate,
      portfolioGrowthRate,
      leadGenerationRate,
      commissionGrowthRate,
      averageDaysOnMarket,
      propertyViewsToBookingRatio,
      clientSatisfactionScore,
      marketPenetration,
      averageCommissionPerProperty,
      propertyUtilizationRate,
      crossSellingSuccess
    };
  }

  // --- PUBLIC KPI CALCULATION METHODS ---
  async getAgentConversionRate(agentId: number, startDate: Date): Promise<number> {
    // TODO: Add Lead model to schema
    // const leads = await prisma.lead.count({
    //   where: {
    //     agentId,
    //     createdAt: { gte: startDate }
    //   }
    // });
    const leads = 0;

    const conversions = await prisma.agentBooking.count({
      where: {
        agentId,
        createdAt: { gte: startDate },
        status: { in: ['confirmed', 'completed'] }
      }
    });

    return leads > 0 ? (conversions / leads) * 100 : 0;
  }

  async getAgentAverageResponseTime(agentId: number, startDate: Date): Promise<number> {
    // TODO: Add Inquiry model to schema
    // const inquiries = await prisma.inquiry.findMany({
    //   where: {
    //     agentId,
    //     createdAt: { gte: startDate },
    //     respondedAt: { not: null }
    //   },
    //   select: {
    //     createdAt: true,
    //     respondedAt: true
    //   }
    // });
    const inquiries: any[] = [];

    if (inquiries.length === 0) return 0;

    const totalResponseTime = inquiries.reduce((sum: any, inquiry: any) => {
      if (inquiry.respondedAt) {
        const diff = inquiry.respondedAt.getTime() - inquiry.createdAt.getTime();
        return sum + (diff / (1000 * 60 * 60)); // Convert to hours
      }
      return sum;
    }, 0);

    return totalResponseTime / inquiries.length;
  }

  async getAgentCustomerRetentionRate(agentId: number): Promise<number> {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const allClients = await prisma.agentBooking.groupBy({
      by: ['clientId'],
      where: {
        agentId,
        createdAt: { gte: sixMonthsAgo }
      }
    });

    const repeatClients = await prisma.agentBooking.groupBy({
      by: ['clientId'],
      where: {
        agentId,
        createdAt: { gte: sixMonthsAgo }
      },
      having: {
        clientId: { _count: { gt: 1 } }
      }
    });

    return allClients.length > 0 ? (repeatClients.length / allClients.length) * 100 : 0;
  }

  async getAgentRevenuePerClient(agentId: number, startDate: Date): Promise<number> {
    const clientRevenue = await prisma.agentBooking.groupBy({
      by: ['clientId'],
      where: {
        agentId,
        createdAt: { gte: startDate },
        status: 'completed'
      },
      _sum: {
        commission: true
      }
    });

    if (clientRevenue.length === 0) return 0;

    const totalRevenue = clientRevenue.reduce((sum, client) => sum + (client._sum.commission || 0), 0);
    return totalRevenue / clientRevenue.length;
  }

  async getAgentBookingSuccessRate(agentId: number, startDate: Date): Promise<number> {
    const totalBookings = await prisma.agentBooking.count({
      where: {
        agentId,
        createdAt: { gte: startDate }
      }
    });

    const successfulBookings = await prisma.agentBooking.count({
      where: {
        agentId,
        createdAt: { gte: startDate },
        status: { in: ['confirmed', 'completed'] }
      }
    });

    return totalBookings > 0 ? (successfulBookings / totalBookings) * 100 : 0;
  }

  async getAgentPortfolioGrowthRate(agentId: number): Promise<number> {
    const today = new Date();
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

    const currentCount = await this.getAgentManagedPropertiesCount(agentId, lastMonth, today);
    const previousCount = await this.getAgentManagedPropertiesCount(agentId, twoMonthsAgo, lastMonth);

    return previousCount > 0 ? ((currentCount - previousCount) / previousCount) * 100 : 0;
  }

  async getAgentLeadGenerationRate(agentId: number, startDate: Date): Promise<number> {
    // TODO: Add Lead model to schema
    // const leads = await prisma.lead.count({
    //   where: {
    //     agentId,
    //     createdAt: { gte: startDate }
    //   }
    // });
    const leads = 0;

    const daysInPeriod = Math.ceil((new Date().getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const monthlyRate = (leads / daysInPeriod) * 30;

    return monthlyRate;
  }

  async getAgentCommissionGrowthRate(agentId: number): Promise<number> {
    const today = new Date();
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

    const [currentCommission, previousCommission] = await Promise.all([
      prisma.agentBooking.aggregate({
        where: {
          agentId,
          createdAt: { gte: lastMonth, lte: today },
          status: 'completed'
        },
        _sum: { commission: true }
      }),
      prisma.agentBooking.aggregate({
        where: {
          agentId,
          createdAt: { gte: twoMonthsAgo, lte: lastMonth },
          status: 'completed'
        },
        _sum: { commission: true }
      })
    ]);

    const current = currentCommission._sum.commission || 0;
    const previous = previousCommission._sum.commission || 0;

    return previous > 0 ? ((current - previous) / previous) * 100 : 0;
  }

  async getAgentAverageDaysOnMarket(agentId: number): Promise<number> {
    const properties = await prisma.property.findMany({
      where: {
        host: {
          clientBookings: {
            some: {
              agentId,
              status: 'active'
            }
          }
        }
      },
      include: {
        bookings: {
          where: { status: 'confirmed' },
          orderBy: { createdAt: 'asc' },
          take: 1
        }
      }
    });

    const propertiesWithBookings = properties.filter(p => p.bookings.length > 0);
    
    if (propertiesWithBookings.length === 0) return 0;

    const totalDays = propertiesWithBookings.reduce((sum, property) => {
      const firstBooking = property.bookings[0];
      const daysOnMarket = Math.ceil(
        (firstBooking.createdAt.getTime() - property.createdAt.getTime()) / (1000 * 60 * 60 * 24)
      );
      return sum + daysOnMarket;
    }, 0);

    return totalDays / propertiesWithBookings.length;
  }

  async getAgentPropertyViewsToBookingRatio(agentId: number, startDate: Date): Promise<number> {
    const properties = await this.getAgentPropertiesBasic(agentId);
    const propertyIds = properties.map(p => p.id);

    const [totalViews, totalBookings] = await Promise.all([
      // TODO: Add PropertyView model to schema
      // prisma.propertyView.count({
      //   where: {
      //     propertyId: { in: propertyIds },
      //     createdAt: { gte: startDate }
      //   }
      // }),
      Promise.resolve(0),
      prisma.booking.count({
        where: {
          propertyId: { in: propertyIds },
          createdAt: { gte: startDate },
          status: { in: ['confirmed', 'completed'] }
        }
      })
    ]);

    return totalViews > 0 ? (totalBookings / totalViews) * 100 : 0;
  }

  async getAgentClientSatisfactionScore(agentId: number): Promise<number> {
    // TODO: Add AgentReview model to schema
    // const reviews = await prisma.agentReview.aggregate({
    //   where: {
    //     agentId,
    //     createdAt: { gte: new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000) }
    //   },
    //   _avg: { rating: true }
    // });
    const reviews = { _avg: { rating: 0 }, _count: { id: 0 } };

    return reviews._avg.rating || 0;
  }

  async getAgentMarketPenetration(agentId: number): Promise<number> {
    const [agentProperties, totalActiveProperties] = await Promise.all([
      this.getAgentPropertiesBasic(agentId),
      prisma.property.count({
        where: { status: 'active' }
      })
    ]);

    return totalActiveProperties > 0 ? (agentProperties.length / totalActiveProperties) * 100 : 0;
  }

  async getAgentAverageCommissionPerProperty(agentId: number): Promise<number> {
    const properties = await this.getAgentPropertiesBasic(agentId);
    
    if (properties.length === 0) return 0;

    const totalCommission = await prisma.agentBooking.aggregate({
      where: {
        agentId,
        status: 'completed'
      },
      _sum: { commission: true }
    });

    return (totalCommission._sum.commission || 0) / properties.length;
  }

  async getAgentPropertyUtilizationRate(agentId: number): Promise<number> {
    const properties = await this.getAgentPropertiesBasic(agentId);
    const propertyIds = properties.map(p => p.id);

    const propertiesWithBookings = await prisma.property.count({
      where: {
        id: { in: propertyIds },
        bookings: {
          some: {
            status: { in: ['confirmed', 'completed'] },
            createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
          }
        }
      }
    });

    return properties.length > 0 ? (propertiesWithBookings / properties.length) * 100 : 0;
  }

  async getAgentCrossSellingSuccess(agentId: number, startDate: Date): Promise<number> {
    const clientsWithMultipleServices = await prisma.agentBooking.groupBy({
      by: ['clientId'],
      where: {
        agentId,
        createdAt: { gte: startDate }
      },
      _count: { bookingType: true },
      having: {
        bookingType: { _count: { gt: 1 } }
      }
    });

    const totalClients = await prisma.agentBooking.groupBy({
      by: ['clientId'],
      where: {
        agentId,
        createdAt: { gte: startDate }
      }
    });

    return totalClients.length > 0 ? (clientsWithMultipleServices.length / totalClients.length) * 100 : 0;
  }

  // Performance trends calculation
  async getAgentPerformanceTrends(agentId: number) {
    const months = 12;
    const trends = {
      conversionTrend: [] as Array<{ month: string; rate: number }>,
      retentionTrend: [] as Array<{ month: string; rate: number }>,
      revenueTrend: [] as Array<{ month: string; revenue: number }>,
      satisfactionTrend: [] as Array<{ month: string; score: number }>
    };

    for (let i = months - 1; i >= 0; i--) {
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - i - 1);
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() - i);

      const monthStr = startDate.toISOString().slice(0, 7);

      const [conversionRate, retentionRate, revenue, satisfaction] = await Promise.all([
        this.getAgentConversionRate(agentId, startDate),
        this.getAgentCustomerRetentionRate(agentId),
        this.getAgentMonthlyRevenue(agentId, startDate, endDate),
        this.getAgentMonthlySatisfaction(agentId, startDate, endDate)
      ]);

      trends.conversionTrend.push({ month: monthStr, rate: conversionRate });
      trends.retentionTrend.push({ month: monthStr, rate: retentionRate });
      trends.revenueTrend.push({ month: monthStr, revenue });
      trends.satisfactionTrend.push({ month: monthStr, score: satisfaction });
    }

    return trends;
  }

  // Competitive metrics calculation
  async getAgentCompetitiveMetrics(agentId: number) {
    const [agentStats, marketStats] = await Promise.all([
      this.getAgentStats(agentId),
      this.getMarketStats()
    ]);

    const agentRanking = await prisma.user.count({
      where: {
        userType: 'agent',
        clientBookings: {
          some: {
            commission: { gt: agentStats.totalCommission }
          }
        }
      }
    });

    return {
      marketRanking: agentRanking + 1,
      totalAgentsInMarket: marketStats.totalAgents,
      marketSharePercentage: marketStats.totalCommission > 0 
        ? (agentStats.totalCommission / marketStats.totalCommission) * 100 
        : 0,
      competitorComparison: {
        averageCommission: marketStats.averageCommission,
        averageProperties: marketStats.averageProperties,
        averageClientRetention: marketStats.averageClientRetention
      }
    };
  }

  // Client segmentation
  async getAgentClientSegmentation(agentId: number) {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const [newClients, repeatClients, vipClients, inactiveClients] = await Promise.all([
      prisma.agentBooking.groupBy({
        by: ['clientId'],
        where: {
          agentId,
          createdAt: { gte: threeMonthsAgo }
        },
        having: {
          clientId: { _count: { equals: 1 } }
        }
      }),
      prisma.agentBooking.groupBy({
        by: ['clientId'],
        where: {
          agentId,
          createdAt: { gte: sixMonthsAgo }
        },
        having: {
          clientId: { _count: { gt: 1 } }
        }
      }),
      this.getVIPClients(agentId),
      this.getInactiveClients(agentId, sixMonthsAgo)
    ]);

    return {
      newClients: newClients.length,
      repeatClients: repeatClients.length,
      vipClients: vipClients,
      inactiveClients: inactiveClients
    };
  }

  // --- UTILITY METHODS ---
  private async updatePropertyRating(propertyId: number): Promise<void> {
    const avgRating = await prisma.review.aggregate({
      where: { propertyId },
      _avg: { rating: true },
      _count: true
    });

    await prisma.property.update({
      where: { id: propertyId },
      data: {
        averageRating: avgRating._avg.rating || 0,
        reviewsCount: avgRating._count
      }
    });
  }

  private async getBlockedDates(propertyId: number): Promise<string[]> {
    const blockedDates = await prisma.blockedDate.findMany({
      where: { 
        propertyId,
        endDate: { gte: new Date() },
        isActive: true
      }
    });
    
    return blockedDates.flatMap(bd => this.getDateRange(bd.startDate, bd.endDate));
  }

  private getDateRange(start: Date, end: Date): string[] {
    const dates = [];
    const currentDate = new Date(start);
    
    while (currentDate <= end) {
      dates.push(currentDate.toISOString().split('T')[0]);
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return dates;
  }

  private async transformToPropertyInfo(property: any): Promise<PropertyInfo> {
    const blockedDates = await this.getBlockedDates(property.id);

    return {
      id: property.id,
      name: property.name,
      location: property.location,
      upiNumber: property.upiNumber,
      propertyAddress: property.propertyAddress,
      type: property.type,
      category: property.category,
      pricePerNight: property.pricePerNight,
      pricePerTwoNights: property.pricePerTwoNights,
      beds: property.beds,
      baths: property.baths,
      maxGuests: property.maxGuests,
      features: property.features ? JSON.parse(property.features as string) : [],
      description: property.description,
      images: property.images ? JSON.parse(property.images as string) : {},
      video3D: property.video3D,
      rating: property.averageRating || 0,
      reviewsCount: property.reviewsCount || 0,
      hostId: property.hostId,
      hostName: property.host ? `${property.host.firstName} ${property.host.lastName}`.trim() : 'Unknown Host',
      hostProfileImage: property.host?.profileImage || null,
      status: property.status,
      availability: {
        isAvailable: property.status === 'active' &&
          new Date() >= property.availableFrom &&
          new Date() <= property.availableTo,
        availableFrom: property.availableFrom?.toISOString(),
        availableTo: property.availableTo?.toISOString(),
        blockedDates,
        minStay: property.minStay || 1
      },
      createdAt: property.createdAt.toISOString(),
      updatedAt: property.updatedAt.toISOString(),
      totalBookings: property.totalBookings || property.bookings?.length || 0,
      isVerified: property.isVerified || false
    };
  }

  private transformToPropertySummary(property: any): PropertySummary {
    const images = property.images ? JSON.parse(property.images as string) : {};
    const mainImage = this.getMainImage(images);

    return {
      id: property.id,
      name: property.name,
      location: property.location,
      category: property.category,
      type: property.type,
      pricePerNight: property.pricePerNight,
      image: mainImage,
      rating: property.averageRating || 0,
      reviewsCount: property.reviewsCount || 0,
      beds: property.beds,
      baths: property.baths,
      hostName: property.host ? `${property.host.firstName} ${property.host.lastName}`.trim() : 'Unknown Host',
      availability: property.status === 'active' ? 'Available' : 'Unavailable'
    };
  }

  private transformToBookingInfo(booking: any): BookingInfo {
    return {
      id: booking.id,
      propertyId: booking.propertyId,
      propertyName: booking.property?.name || '',
      guestId: booking.guestId,
      guestName: `${booking.guest.firstName} ${booking.guest.lastName}`.trim(),
      guestEmail: booking.guest.email,
      checkIn: booking.checkIn.toISOString(),
      checkOut: booking.checkOut.toISOString(),
      guests: booking.guests,
      totalPrice: booking.totalPrice,
      status: booking.status,
      message: booking.message,
      createdAt: booking.createdAt.toISOString(),
      updatedAt: booking.updatedAt.toISOString()
    };
  }

  private transformToPropertyReview(review: any): PropertyReview {
    return {
      id: review.id,
      propertyId: review.propertyId,
      userId: review.userId,
      userName: `${review.user.firstName} ${review.user.lastName}`.trim(),
      userProfileImage: review.user.profileImage,
      rating: review.rating,
      comment: review.comment,
      images: review.images ? JSON.parse(review.images as string) : undefined,
      response: review.response,
      createdAt: review.createdAt.toISOString(),
      updatedAt: review.updatedAt.toISOString()
    };
  }

  private getMainImage(images: PropertyImages): string {
    const priorities: (keyof PropertyImages)[] = ['exterior', 'livingRoom', 'bedroom', 'kitchen', 'diningArea'];
    
    for (const category of priorities) {
      if (images[category] && images[category].length > 0) {
        return images[category][0];
      }
    }
    
    for (const category of Object.keys(images) as (keyof PropertyImages)[]) {
      if (images[category] && images[category].length > 0) {
        return images[category][0];
      }
    }
    
    return '';
  }

  private transformToGuestProfile(guest: any): GuestProfile {
    const bookings = guest.bookingsAsGuest || [];
    const completedBookings = bookings.filter((b: any) => b.status === 'completed');
    
    return {
      id: guest.id,
      firstName: guest.firstName,
      lastName: guest.lastName,
      email: guest.email,
      phone: guest.phone,
      profileImage: guest.profileImage,
      verificationStatus: guest.verificationStatus || 'unverified',
      joinDate: guest.createdAt.toISOString(),
      totalBookings: bookings.length,
      totalSpent: completedBookings.reduce((sum: number, b: any) => sum + b.totalPrice, 0),
      averageRating: guest.averageRating || 0,
      lastBooking: bookings.length > 0 ? bookings[0].createdAt.toISOString() : undefined,
      preferredCommunication: guest.preferredCommunication || 'email',
      notes: guest.hostNotes
    };
  }

  private async getAnalyticsOverview(hostId: number, timeRange: 'week' | 'month' | 'quarter' | 'year'): Promise<AnalyticsOverview> {
    return {
      totalViews: 0,
      totalBookings: 0,
      totalRevenue: 0,
      averageRating: 0,
      occupancyRate: 0,
      conversionRate: 0,
      repeatGuestRate: 0,
      timeRange
    };
  }

  private async getPropertyPerformanceMetrics(hostId: number, timeRange: string): Promise<PropertyPerformanceMetrics[]> {
    return [];
  }

  private async getBookingTrendData(hostId: number, startDate: Date): Promise<BookingTrendData[]> {
    return [];
  }

  private async getGuestAnalytics(hostId: number): Promise<GuestAnalytics> {
    return {
      totalGuests: 0,
      newGuests: 0,
      returningGuests: 0,
      averageStayDuration: 0,
      guestDemographics: {
        ageGroups: [],
        countries: [],
        purposes: []
      },
      guestSatisfaction: {
        averageRating: 0,
        ratingDistribution: [],
        commonComplaints: [],
        commonPraises: []
      }
    };
  }
 
  private async getRevenueAnalytics(hostId: number): Promise<RevenueAnalytics> {
    return {
      monthlyRevenue: [],
      revenueByProperty: [],
      seasonalTrends: [],
      pricingOptimization: []
    };
  }

  private async getRecentActivity(hostId: number): Promise<DashboardActivity[]> {
    const [recentBookings, recentReviews] = await Promise.all([
      prisma.booking.findMany({
        where: { property: { hostId } },
        include: {
          property: { select: { name: true } },
          guest: { select: { firstName: true, lastName: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: 5
      }),
      prisma.review.findMany({
        where: { property: { hostId } },
        include: {
          property: { select: { name: true } },
          user: { select: { firstName: true, lastName: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: 5
      })
    ]);

    const activities: DashboardActivity[] = [];

    recentBookings.forEach(booking => {
      activities.push({
        id: `booking-${booking.id}`,
        type: 'booking',
        title: 'New Booking',
        description: `${booking.guest.firstName} ${booking.guest.lastName} booked ${booking.property.name}`,
        timestamp: booking.createdAt.toISOString(),
        propertyId: booking.propertyId,
        bookingId: booking.id,
        isRead: false,
        priority: booking.status === 'pending' ? 'high' : 'medium'
      });
    });

    recentReviews.forEach(review => {
      activities.push({
        id: `review-${review.id}`,
        type: 'review',
        title: 'New Review',
        description: `${review.user.firstName} ${review.user.lastName} reviewed ${review.property.name} (${review.rating} stars)`,
        timestamp: review.createdAt.toISOString(),
        propertyId: review.propertyId,
        isRead: false,
        priority: review.rating < 3 ? 'high' : 'low'
      });
    });

    return activities
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 10);
  }

  private async getAgentMonthlyCommissions(agentId: number): Promise<MonthlyCommissionData[]> {
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const commissions = await prisma.agentBooking.findMany({
      where: {
        agentId,
        createdAt: { gte: twelveMonthsAgo }
      },
      select: {
        commission: true,
        createdAt: true
      }
    });

    const monthlyData: { [key: string]: { commission: number; bookings: number } } = {};
    
    commissions.forEach(commission => {
      const month = commission.createdAt.toISOString().slice(0, 7);
      if (!monthlyData[month]) {
        monthlyData[month] = { commission: 0, bookings: 0 };
      }
      monthlyData[month].commission += commission.commission;
      monthlyData[month].bookings += 1;
    });

    return Object.entries(monthlyData).map(([month, data]) => ({
      month,
      commission: data.commission,
      bookings: data.bookings
    }));
  }

  private transformToAgentBookingInfo(agentBooking: any): AgentBookingInfo {
    return {
      id: agentBooking.id,
      clientName: `${agentBooking.client.firstName} ${agentBooking.client.lastName}`,
      bookingType: agentBooking.bookingType,
      commission: agentBooking.commission,
      commissionStatus: agentBooking.status,
      bookingDate: agentBooking.createdAt.toISOString(),
      createdAt: agentBooking.createdAt.toISOString()
    };
  }

  private async getAgentManagedPropertiesCount(agentId: number, startDate: Date, endDate: Date): Promise<number> {
    return await prisma.property.count({
      where: {
        host: {
          clientBookings: {
            some: {
              agentId,
              status: 'active',
              createdAt: { gte: startDate, lte: endDate }
            }
          }
        }
      }
    });
  }

  private async getAgentMonthlyRevenue(agentId: number, startDate: Date, endDate: Date): Promise<number> {
    const result = await prisma.agentBooking.aggregate({
      where: {
        agentId,
        createdAt: { gte: startDate, lte: endDate },
        status: 'completed'
      },
      _sum: { commission: true }
    });

    return result._sum.commission || 0;
  }

  private async getAgentMonthlySatisfaction(agentId: number, startDate: Date, endDate: Date): Promise<number> {
    // TODO: Add AgentReview model to schema
    // const result = await prisma.agentReview.aggregate({
    //   where: {
    //     agentId,
    //     createdAt: { gte: startDate, lte: endDate }
    //   },
    //   _avg: { rating: true }
    // });
    const result = { _avg: { rating: 0 } };

    return result._avg.rating || 0;
  }

  private async getAgentStats(agentId: number) {
    const [commissionData, propertiesCount] = await Promise.all([
      prisma.agentBooking.aggregate({
        where: { agentId, status: 'completed' },
        _sum: { commission: true }
      }),
      this.getAgentPropertiesBasic(agentId)
    ]);

    return {
      totalCommission: commissionData._sum.commission || 0,
      totalProperties: propertiesCount.length
    };
  }

  private async getMarketStats() {
    const [totalAgents, allCommissions, allProperties] = await Promise.all([
      prisma.user.count({ where: { userType: 'agent' } }),
      prisma.agentBooking.aggregate({
        where: { status: 'completed' },
        _sum: { commission: true }
      }),
      prisma.property.count({ where: { status: 'active' } })
    ]);

    return {
      totalAgents,
      totalCommission: allCommissions._sum.commission || 0,
      averageCommission: totalAgents > 0 ? (allCommissions._sum.commission || 0) / totalAgents : 0,
      averageProperties: totalAgents > 0 ? allProperties / totalAgents : 0,
      averageClientRetention: 75
    };
  }

  private async getVIPClients(agentId: number): Promise<number> {
    const averageCommission = await prisma.agentBooking.aggregate({
      where: { agentId, status: 'completed' },
      _avg: { commission: true }
    });

    const vipClients = await prisma.agentBooking.groupBy({
      by: ['clientId'],
      where: {
        agentId,
        status: 'completed'
      },
      _sum: { commission: true },
      having: {
        commission: { _sum: { gt: (averageCommission._avg.commission || 0) * 2 } }
      }
    });

    return vipClients.length;
  }

  private async getInactiveClients(agentId: number, sixMonthsAgo: Date): Promise<number> {
    const allClients = await prisma.agentBooking.groupBy({
      by: ['clientId'],
      where: { agentId }
    });

    const activeClients = await prisma.agentBooking.groupBy({
      by: ['clientId'],
      where: {
        agentId,
        createdAt: { gte: sixMonthsAgo }
      }
    });

    return allClients.length - activeClients.length;
  }

  private async getAgentPropertiesBasic(agentId: number) {
    return prisma.property.findMany({
      where: {
        host: {
          clientBookings: {
            some: {
              agentId,
              status: 'active'
            }
          }
        }
      },
      select: {
        id: true,
        name: true,
        location: true,
        averageRating: true,
        totalBookings: true,
        hostId: true
      }
    });
  }

  // --- ADMIN & OTHER METHODS ---
  async updatePropertyStatusByAdmin(propertyId: number, status: 'active' | 'pending' | 'rejected' | 'inactive', rejectionReason?: string): Promise<PropertyInfo> {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      include: {
        host: true,
        reviews: true,
        bookings: true
      }
    });

    if (!property) {
      throw new Error('Property not found');
    }

    const updatedProperty = await prisma.property.update({
      where: { id: propertyId },
      data: { status },
      include: {
        host: true,
        reviews: true,
        bookings: true
      }
    });

    try {
      if (updatedProperty.host && updatedProperty.hostId) {
        await this.emailService.sendPropertyStatusUpdateEmail({
          host: {
            firstName: updatedProperty.host.firstName,
            lastName: updatedProperty.host.lastName,
            email: updatedProperty.host.email,
            id: updatedProperty.hostId
          },
          company: {
            name: 'Jambolush',
            website: 'https://jambolush.com',
            supportEmail: 'support@jambolush.com',
            logo: 'https://jambolush.com/logo.png'
          },
          property: await this.transformToPropertyInfo(updatedProperty),
          newStatus: status,
          rejectionReason
        });
      }
    } catch (emailError) {
      console.error('Failed to send property status update email:', emailError);
    }

    return this.transformToPropertyInfo(updatedProperty);
  }

  async getFeaturedProperties(limit: number = 8): Promise<PropertySummary[]> {
    const properties = await prisma.property.findMany({
      where: {
        status: 'active',
        averageRating: { gte: 4.5 }
      },
      include: {
        host: true,
        reviews: { select: { rating: true } }
      },
      orderBy: [
        { averageRating: 'desc' },
        { reviewsCount: 'desc' }
      ],
      take: limit
    });

    return properties.map((p: any) => this.transformToPropertySummary(p));
  }

  async getSimilarProperties(propertyId: number, limit: number = 6): Promise<PropertySummary[]> {
    const property = await prisma.property.findUnique({
      where: { id: propertyId }
    });

    if (!property) return [];

    const properties = await prisma.property.findMany({
      where: {
        id: { not: propertyId },
        status: 'active',
        OR: [
          { type: property.type },
          { category: property.category },
          { location: { contains: property.location.split(',')[0] } }
        ]
      },
      include: {
        host: true,
        reviews: { select: { rating: true } }
      },
      orderBy: { averageRating: 'desc' },
      take: limit
    });

    return properties.map((p: any) => this.transformToPropertySummary(p));
  }

  async uploadPropertyImages(propertyId: number, hostId: number, category: keyof PropertyImages, imageUrls: string[]): Promise<PropertyInfo> {
    const property = await prisma.property.findFirst({
      where: { id: propertyId, hostId }
    });

    if (!property) {
      throw new Error('Property not found or access denied');
    }

    const currentImages = property.images ? JSON.parse(property.images as string) : {};
    currentImages[category] = [...(currentImages[category] || []), ...imageUrls];

    const updatedProperty = await prisma.property.update({
      where: { id: propertyId },
      data: { images: JSON.stringify(currentImages) },
      include: {
        host: true,
        reviews: true,
        bookings: true
      }
    });

    return this.transformToPropertyInfo(updatedProperty);
  }

  async removePropertyImage(propertyId: number, hostId: number, category: keyof PropertyImages, imageUrl: string): Promise<PropertyInfo> {
    const property = await prisma.property.findFirst({
      where: { id: propertyId, hostId }
    });

    if (!property) {
      throw new Error('Property not found or access denied');
    }

    const currentImages = property.images ? JSON.parse(property.images as string) : {};
    if (currentImages[category]) {
      currentImages[category] = currentImages[category].filter((url: string) => url !== imageUrl);
    }

    const updatedProperty = await prisma.property.update({
      where: { id: propertyId },
      data: { images: JSON.stringify(currentImages) },
      include: {
        host: true,
        reviews: true,
        bookings: true
      }
    });

    return this.transformToPropertyInfo(updatedProperty);
  }

  async updatePropertyAvailability(propertyId: number, hostId: number, availableFrom: string, availableTo: string): Promise<PropertyInfo> {
    const property = await prisma.property.findFirst({
      where: { id: propertyId, hostId }
    });

    if (!property) {
      throw new Error('Property not found or access denied');
    }

    const updatedProperty = await prisma.property.update({
      where: { id: propertyId },
      data: {
        availableFrom: new Date(availableFrom),
        availableTo: new Date(availableTo)
      },
      include: {
        host: true,
        reviews: true,
        bookings: true
      }
    });

    return this.transformToPropertyInfo(updatedProperty);
  }

  async blockDates(propertyId: number, hostId: number, startDate: string, endDate: string, reason?: string): Promise<void> {
    const property = await prisma.property.findFirst({
      where: { id: propertyId, hostId }
    });

    if (!property) {
      throw new Error('Property not found or access denied');
    }

    await prisma.blockedDate.create({
      data: {
        propertyId,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        reason: reason || 'Blocked by host',
        isActive: true
      }
    });
  }

  async updatePropertyPricing(propertyId: number, hostId: number, pricePerNight: number, pricePerTwoNights?: number): Promise<PropertyInfo> {
    const property = await prisma.property.findFirst({
      where: { id: propertyId, hostId }
    });

    if (!property) {
      throw new Error('Property not found or access denied');
    }

    const updatedProperty = await prisma.property.update({
      where: { id: propertyId },
      data: {
        pricePerNight,
        pricePerTwoNights
      },
      include: {
        host: true,
        reviews: true,
        bookings: true
      }
    });

    return this.transformToPropertyInfo(updatedProperty);
  }

  async activateProperty(propertyId: number, hostId: number): Promise<PropertyInfo> {
    return this.updatePropertyStatus(propertyId, hostId, 'active');
  }

  async deactivateProperty(propertyId: number, hostId: number): Promise<PropertyInfo> {
    return this.updatePropertyStatus(propertyId, hostId, 'inactive');
  }

  private async updatePropertyStatus(propertyId: number, hostId: number, status: string): Promise<PropertyInfo> {
    const property = await prisma.property.findFirst({
      where: { id: propertyId, hostId }
    });

    if (!property) {
      throw new Error('Property not found or access denied');
    }

    const updatedProperty = await prisma.property.update({
      where: { id: propertyId },
      data: { status },
      include: {
        host: true,
        reviews: true,
        bookings: true
      }
    });

    try {
      if (updatedProperty.host && updatedProperty.hostId) {
        await this.emailService.sendPropertyStatusUpdateEmail({
          host: {
            firstName: updatedProperty.host.firstName,
            lastName: updatedProperty.host.lastName,
            email: updatedProperty.host.email,
            id: updatedProperty.hostId
          },
          company: {
            name: 'Jambolush',
            website: 'https://jambolush.com',
            supportEmail: 'support@jambolush.com',
            logo: 'https://jambolush.com/logo.png'
          },
          property: await this.transformToPropertyInfo(updatedProperty),
          newStatus: status as 'active' | 'pending' | 'rejected' | 'inactive'
        });
      }
    } catch (emailError) {
      console.error('Failed to send property status update email:', emailError);
    }

    return this.transformToPropertyInfo(updatedProperty);
  }

  async getLocationSuggestions(query: string): Promise<string[]> {
    const properties = await prisma.property.findMany({
      where: {
        location: { contains: query },
        status: 'active'
      },
      select: { location: true },
      distinct: ['location'],
      take: 10
    });

    return properties.map((p: { location: any; }) => p.location);
  }

  // --- AGENT PROPERTY MANAGEMENT ---
  async getAgentProperties(agentId: number, filters: any, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    
    const whereClause: any = {
      hostId: agentId
    };

    if (filters.clientId) {
      whereClause.hostId = filters.clientId;
    }
    if (filters.status) {
      whereClause.status = filters.status;
    }
    if (filters.search) {
      whereClause.OR = [
        { name: { contains: filters.search } },
        { location: { contains: filters.search } }
      ];
    }

    const orderBy: any = {};
    if (filters.sortBy) {
      switch (filters.sortBy) {
        case 'name':
          orderBy.name = filters.sortOrder || 'asc';
          break;
        case 'location':
          orderBy.location = filters.sortOrder || 'asc';
          break;
        case 'price':
          orderBy.pricePerNight = filters.sortOrder || 'asc';
          break;
        case 'rating':
          orderBy.averageRating = filters.sortOrder || 'desc';
          break;
        default:
          orderBy.createdAt = filters.sortOrder || 'desc';
      }
    } else {
      orderBy.createdAt = 'desc';
    }

    const [properties, total] = await Promise.all([
      prisma.property.findMany({
        where: whereClause,
        include: {
          host: { select: { firstName: true, lastName: true, email: true } },
          reviews: { select: { rating: true } },
          bookings: {
            where: { status: { not: '' } },
            select: { totalPrice: true }
          }
        },
        orderBy,
        skip,
        take: limit
      }),
      prisma.property.count({ where: whereClause })
    ]);

    const transformedProperties = await Promise.all(
      properties.map(async (property: any) => {
        return {
          ...await this.transformToPropertyInfo(property),
          hostEmail: property.host.email,
          totalRevenue: property.bookings.reduce((sum: number, b: any) => sum + b.totalPrice, 0),
        };
      })
    );

    return {
      properties: transformedProperties,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  async getAgentPropertyDetails(agentId: number, propertyId: number): Promise<PropertyInfo> {
    const hasAccess = await this.verifyAgentPropertyAccess(agentId, propertyId);
    if (!hasAccess) {
      throw new Error('Access denied. Property not associated with your clients.');
    }

    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      include: {
        host: true,
        reviews: {
          include: { user: true },
          orderBy: { createdAt: 'desc' },
          take: 10
        },
        bookings: {
          where: { status: 'confirmed' },
          select: { id: true }
        }
      }
    });

    if (!property) {
      throw new Error('Property not found');
    }

    return this.transformToPropertyInfo(property);
  }

  async updateAgentProperty(agentId: number, propertyId: number, data: any): Promise<PropertyInfo> {
    const hasAccess = await this.verifyAgentPropertyAccess(agentId, propertyId);
    if (!hasAccess) {
      throw new Error('Access denied. Property not associated with your clients.');
    }

    const existingProperty = await prisma.property.findUnique({
      where: { id: propertyId }
    });

    if (!existingProperty) {
      throw new Error('Property not found');
    }

    const updateData: any = {};
    
    if (data.description !== undefined) updateData.description = data.description;
    if (data.features !== undefined) updateData.features = JSON.stringify(data.features);
    if (data.pricePerNight !== undefined) updateData.pricePerNight = data.pricePerNight;
    if (data.pricePerTwoNights !== undefined) updateData.pricePerTwoNights = data.pricePerTwoNights;
    if (data.minStay !== undefined) updateData.minStay = data.minStay;
    if (data.maxStay !== undefined) updateData.maxStay = data.maxStay;
    
    if (data.availabilityDates) {
      updateData.availableFrom = new Date(data.availabilityDates.start);
      updateData.availableTo = new Date(data.availabilityDates.end);
    }
    
    if (data.images) {
      const currentImages = existingProperty.images 
        ? JSON.parse(existingProperty.images as string) 
        : {};
      updateData.images = JSON.stringify({ ...currentImages, ...data.images });
    }

    const property = await prisma.property.update({
      where: { id: propertyId },
      data: updateData,
      include: {
        host: true,
        reviews: true,
        bookings: true
      }
    });

    return this.transformToPropertyInfo(property);
  }

  async getAgentPropertyPerformance(agentId: number, timeRange: 'week' | 'month' | 'quarter' | 'year') {
    const properties = await this.getAgentPropertiesBasic(agentId);
    
    const now = new Date();
    let startDate: Date;
    
    switch (timeRange) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'quarter':
        startDate = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
        break;
      case 'year':
        startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    }

    const performance = await Promise.all(
      properties.map(async (property: any) => {
        const [bookings, revenue, occupancyData] = await Promise.all([
          prisma.booking.count({
            where: {
              propertyId: property.id,
              createdAt: { gte: startDate },
              status: { in: ['confirmed', 'completed'] }
            }
          }),
          prisma.booking.aggregate({
            where: {
              propertyId: property.id,
              createdAt: { gte: startDate },
              status: 'completed'
            },
            _sum: { totalPrice: true }
          }),
          this.calculatePropertyOccupancy(property.id, startDate, now)
        ]);

        const commission = await this.getAgentPropertyCommission(agentId, property.hostId);

        return {
          propertyId: property.id,
          propertyName: property.name,
          bookings,
          revenue: revenue._sum.totalPrice || 0,
          occupancyRate: occupancyData.occupancyRate,
          agentCommission: (revenue._sum.totalPrice || 0) * (commission / 100),
          averageRating: property.averageRating || 0
        };
      })
    );

    return {
      timeRange,
      properties: performance,
      summary: {
        totalBookings: performance.reduce((sum, p) => sum + p.bookings, 0),
        totalRevenue: performance.reduce((sum, p) => sum + p.revenue, 0),
        totalCommission: performance.reduce((sum, p) => sum + p.agentCommission, 0),
        averageOccupancy: performance.reduce((sum, p) => sum + p.occupancyRate, 0) / Math.max(performance.length, 1)
      }
    };
  }

  async getAgentPropertyBookings(agentId: number, propertyId: number) {
    const hasAccess = await this.verifyAgentPropertyAccess(agentId, propertyId);
    if (!hasAccess) {
      throw new Error('Access denied. Property not associated with your clients.');
    }

    const bookings = await prisma.booking.findMany({
      where: { propertyId },
      include: {
        guest: true,
        property: { select: { name: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    return bookings.map((b: any) => ({
      ...this.transformToBookingInfo(b),
      agentCommission: this.calculateBookingCommission(b.totalPrice, agentId)
    }));
  }

  async createAgentBooking(agentId: number, data: any): Promise<BookingInfo> {
    const hasAccess = await this.verifyAgentPropertyAccess(agentId, data.propertyId);
    if (!hasAccess) {
      throw new Error('Access denied. Property not associated with your clients.');
    }

    const clientRelation = await prisma.agentBooking.findFirst({
      where: {
        agentId,
        clientId: data.clientId,
        status: 'active'
      }
    });

    if (!clientRelation) {
      throw new Error('Client not associated with your account.');
    }

    const booking = await this.createBooking(data.clientId, data);

    const commissionRate = await this.getAgentCommissionRate(agentId);
    await prisma.agentBooking.create({
      data: {
        agentId,
        clientId: data.clientId,
        bookingType: 'property',
        bookingId: booking.id,
        commission: data.totalPrice * (commissionRate / 100),
        commissionRate,
        status: 'active'
      }
    });

    return booking;
  }

  async getAgentBookings(agentId: number, filters: any, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    
    const whereClause: any = {
      agentId
    };

    if (filters.clientId) {
      whereClause.clientId = filters.clientId;
    }

    if (filters.dateRange) {
      whereClause.createdAt = {
        gte: new Date(filters.dateRange.start),
        lte: new Date(filters.dateRange.end)
      };
    }

    const orderBy: any = {};
    if (filters.sortBy === 'date') {
      orderBy.createdAt = filters.sortOrder || 'desc';
    } else {
      orderBy.createdAt = 'desc';
    }

    const [agentBookings, total] = await Promise.all([
      prisma.agentBooking.findMany({
        where: whereClause,
        include: {
          client: { select: { firstName: true, lastName: true } }
        },
        orderBy,
        skip,
        take: limit
      }),
      prisma.agentBooking.count({ where: whereClause })
    ]);

    const bookingIds = agentBookings.map(ab => ab.bookingId);
    const actualBookings = await prisma.booking.findMany({
      where: { id: { in: bookingIds } },
      include: {
        property: { select: { name: true } },
        guest: { select: { firstName: true, lastName: true } }
      }
    });

    const enrichedBookings = agentBookings.map(agentBooking => {
      const actualBooking = actualBookings.find(b => b.id === agentBooking.bookingId);
      return {
        ...this.transformToBookingInfo(actualBooking),
        agentCommission: agentBooking.commission,
        commissionStatus: agentBooking.status,
        clientName: `${agentBooking.client.firstName} ${agentBooking.client.lastName}`
      };
    });

    return {
      bookings: enrichedBookings,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  async getAgentBookingCalendar(agentId: number, year: number, month: number): Promise<BookingCalendar> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    
    const agentProperties = await this.getAgentPropertiesBasic(agentId);
    const propertyIds = agentProperties.map((p: any) => p.id);

    const bookings = await prisma.booking.findMany({
      where: {
        propertyId: { in: propertyIds },
        status: { in: ['confirmed', 'completed'] },
        OR: [
          { checkIn: { gte: startDate, lte: endDate } },
          { checkOut: { gte: startDate, lte: endDate } },
          {
            AND: [
              { checkIn: { lte: startDate } },
              { checkOut: { gte: endDate } }
            ]
          }
        ]
      },
      include: {
        property: { select: { name: true } },
        guest: { select: { firstName: true, lastName: true } }
      }
    });

    const days: BookingCalendarDay[] = [];
    const today = new Date();

    for (let day = 1; day <= endDate.getDate(); day++) {
      const currentDate = new Date(year, month - 1, day);
      const dateStr = currentDate.toISOString().split('T')[0];
      
      const dayBookings = bookings
        .filter(booking => {
          const checkIn = new Date(booking.checkIn);
          const checkOut = new Date(booking.checkOut);
          return currentDate >= checkIn && currentDate <= checkOut;
        })
        .map(booking => {
          const checkIn = new Date(booking.checkIn);
          const checkOut = new Date(booking.checkOut);
          
          let type: 'check_in' | 'check_out' | 'ongoing' = 'ongoing';
          if (currentDate.toDateString() === checkIn.toDateString()) {
            type = 'check_in';
          } else if (currentDate.toDateString() === checkOut.toDateString()) {
            type = 'check_out';
          }

          return {
            id: booking.id,
            guestName: `${booking.guest.firstName} ${booking.guest.lastName}`,
            propertyName: booking.property.name,
            type,
            status: booking.status as BookingStatus
          };
        });

      const revenue = dayBookings.reduce((sum, booking) => {
        const fullBooking = bookings.find(b => b.id === booking.id);
        return sum + (fullBooking?.totalPrice || 0);
      }, 0);

      days.push({
        date: dateStr,
        bookings: dayBookings,
        revenue,
        isToday: currentDate.toDateString() === today.toDateString()
      });
    }

    return {
      year,
      month,
      days
    };
  }

  async updateAgentBooking(agentId: number, bookingId: string, data: BookingUpdateDto): Promise<BookingInfo> {
    const agentBooking = await prisma.agentBooking.findFirst({
      where: {
        agentId,
        bookingId
      }
    });

    if (!agentBooking) {
      throw new Error('Access denied. Booking not associated with your account.');
    }

    const allowedUpdates: any = {};
    if (data.notes !== undefined) allowedUpdates.notes = data.notes;
    if (data.specialRequests !== undefined) allowedUpdates.specialRequests = data.specialRequests;
    if (data.checkInInstructions !== undefined) allowedUpdates.checkInInstructions = data.checkInInstructions;
    if (data.checkOutInstructions !== undefined) allowedUpdates.checkOutInstructions = data.checkOutInstructions;

    if (data.status && ['confirmed', 'cancelled'].includes(data.status)) {
      allowedUpdates.status = data.status;
    }

    const booking = await prisma.booking.update({
      where: { id: bookingId },
      data: allowedUpdates,
      include: {
        property: true,
        guest: true
      }
    });

    return this.transformToBookingInfo(booking);
  }

  async getAgentEarnings(agentId: number, timeRange: 'week' | 'month' | 'quarter' | 'year'): Promise<AgentEarnings> {
    const now = new Date();
    let startDate: Date;
    
    switch (timeRange) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'quarter':
        startDate = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
        break;
      case 'year':
        startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    }

    const [totalEarnings, totalBookings, periodEarnings, periodBookings, commissionBreakdown] = await Promise.all([
      prisma.agentBooking.aggregate({
        where: { agentId },
        _sum: { commission: true }
      }),
      prisma.agentBooking.count({
        where: { agentId }
      }),
      prisma.agentBooking.aggregate({
        where: {
          agentId,
          createdAt: { gte: startDate }
        },
        _sum: { commission: true }
      }),
      prisma.agentBooking.count({
        where: {
          agentId,
          createdAt: { gte: startDate }
        }
      }),
      prisma.agentBooking.groupBy({
        by: ['bookingType'],
        where: { agentId },
        _sum: { commission: true },
        _count: true
      })
    ]);

    return {
      totalEarnings: totalEarnings._sum.commission || 0,
      totalBookings,
      periodEarnings: periodEarnings._sum.commission || 0,
      periodBookings,
      commissionBreakdown: commissionBreakdown.map(item => ({
        bookingType: item.bookingType,
        totalCommission: item._sum.commission || 0,
        bookingCount: item._count
      })),
      timeRange
    };
  }

  async getAgentEarningsBreakdown(agentId: number) {
    const agentBookings = await prisma.agentBooking.findMany({
      where: { agentId },
      include: {
        client: { select: { firstName: true, lastName: true, email: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    const bookingIds = agentBookings.filter(ab => ab.bookingType === 'property').map(ab => ab.bookingId);
    const actualBookings = await prisma.booking.findMany({
      where: { id: { in: bookingIds } },
      select: { id: true, totalPrice: true, createdAt: true }
    });

    return agentBookings.map(agentBooking => {
      const actualBooking = actualBookings.find(b => b.id === agentBooking.bookingId);
      
      return {
        id: agentBooking.id,
        clientName: `${agentBooking.client.firstName} ${agentBooking.client.lastName}`,
        bookingType: agentBooking.bookingType,
        bookingValue: actualBooking?.totalPrice || 0,
        commission: agentBooking.commission,
        commissionRate: agentBooking.commissionRate,
        commissionStatus: agentBooking.status,
        bookingDate: actualBooking?.createdAt.toISOString() || agentBooking.createdAt.toISOString(),
        notes: agentBooking.notes
      } as AgentCommissionInfo;
    });
  }

  async getClientProperties(agentId: number, clientId: number) {
    const hasAccess = await this.verifyAgentClientAccess(agentId, clientId);
    if (!hasAccess) {
      throw new Error('Access denied. Client not associated with your account.');
    }

    const properties = await prisma.property.findMany({
      where: { hostId: clientId },
      include: {
        host: { select: { firstName: true, lastName: true, email: true } },
        reviews: { select: { rating: true } },
        bookings: {
          where: { status: 'completed' },
          select: { totalPrice: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return Promise.all(
      properties.map(async (property: any) => ({
        ...await this.transformToPropertyInfo(property),
        totalRevenue: property.bookings.reduce((sum: number, b: any) => sum + b.totalPrice, 0)
      }))
    );
  }

  async createClientProperty(agentId: number, clientId: number, data: CreatePropertyDto): Promise<PropertyInfo> {
    const hasAccess = await this.verifyAgentClientAccess(agentId, clientId);
    if (!hasAccess) {
      throw new Error('Access denied. Client not associated with your account.');
    }

    const property = await this.createProperty(clientId, data);

    const commissionRate = await this.getAgentCommissionRate(agentId);
    await prisma.agentBooking.create({
      data: {
        agentId,
        clientId,
        bookingType: 'property',
        bookingId: `property-${property.id}`,
        commission: 0,
        commissionRate,
        status: 'active',
        notes: `Property management for ${property.name}`
      }
    });

    return property;
  }

  async uploadAgentPropertyImages(agentId: number, propertyId: number, category: keyof PropertyImages, imageUrls: string[]): Promise<PropertyInfo> {
    const hasAccess = await this.verifyAgentPropertyAccess(agentId, propertyId);
    if (!hasAccess) {
      throw new Error('Access denied. Property not associated with your clients.');
    }

    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { hostId: true }
    });

    if (!property) {
      throw new Error('Property not found');
    }

    if (!property.hostId) {
      throw new Error('Property has no host');
    }

    return this.uploadPropertyImages(propertyId, property.hostId, category, imageUrls);
  }

  async getAgentGuests(agentId: number, filters: GuestSearchFilters) {
    const agentClients = await prisma.agentBooking.findMany({
      where: { agentId, status: 'active' },
      select: { clientId: true },
      distinct: ['clientId']
    });

    const clientIds = agentClients.map(ac => ac.clientId);

    const clientProperties = await prisma.property.findMany({
      where: { hostId: { in: clientIds } },
      select: { id: true }
    });

    const propertyIds = clientProperties.map(p => p.id);

    const whereClause: any = {
      bookingsAsGuest: {
        some: {
          propertyId: { in: propertyIds }
        }
      }
    };

    if (filters.search) {
      whereClause.OR = [
        { firstName: { contains: filters.search } },
        { lastName: { contains: filters.search } },
        { email: { contains: filters.search } }
      ];
    }

    if (filters.verificationStatus) {
      whereClause.verificationStatus = filters.verificationStatus;
    }

    const orderBy: any = {};
    if (filters.sortBy) {
      switch (filters.sortBy) {
        case 'name':
          orderBy.firstName = filters.sortOrder || 'asc';
          break;
        case 'joinDate':
          orderBy.createdAt = filters.sortOrder || 'desc';
          break;
        default:
          orderBy[filters.sortBy] = filters.sortOrder || 'desc';
      }
    } else {
      orderBy.createdAt = 'desc';
    }

    const guests = await prisma.user.findMany({
      where: whereClause,
      include: {
        bookingsAsGuest: {
          where: { propertyId: { in: propertyIds } },
          include: { property: { select: { name: true } } }
        }
      },
      orderBy
    });

    return guests.map((guest: any) => this.transformToGuestProfile(guest));
  }

  async getClientGuests(agentId: number, clientId: number) {
    const hasAccess = await this.verifyAgentClientAccess(agentId, clientId);
    if (!hasAccess) {
      throw new Error('Access denied. Client not associated with your account.');
    }

    const clientProperties = await prisma.property.findMany({
      where: { hostId: clientId },
      select: { id: true }
    });

    const propertyIds = clientProperties.map(p => p.id);

    const guests = await prisma.user.findMany({
      where: {
        bookingsAsGuest: {
          some: {
            propertyId: { in: propertyIds }
          }
        }
      },
      include: {
        bookingsAsGuest: {
          where: { propertyId: { in: propertyIds } },
          include: { property: { select: { name: true } } }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return guests.map((guest: any) => this.transformToGuestProfile(guest));
  }

  async getAgentPropertyAnalytics(agentId: number, propertyId: number, timeRange: string) {
    const hasAccess = await this.verifyAgentPropertyAccess(agentId, propertyId);
    if (!hasAccess) {
      throw new Error('Access denied. Property not associated with your clients.');
    }

    const analytics = await this.getPropertyAnalytics(propertyId, timeRange);
    const commissionRate = await this.getAgentCommissionRate(agentId);
    
    return {
      ...analytics,
      agentCommission: {
        rate: commissionRate,
        totalEarned: analytics.totalRevenue * (commissionRate / 100),
        monthlyProjection: analytics.monthlyRevenue * (commissionRate / 100)
      }
    };
  }

  async getAgentPropertiesAnalyticsSummary(agentId: number, timeRange: string) {
    const properties = await this.getAgentPropertiesBasic(agentId);
    
    const summaryData = await Promise.all(
      properties.map(async (property: any) => {
        const analytics = await this.getAgentPropertyAnalytics(agentId, property.id, timeRange);
        return {
          propertyId: property.id,
          propertyName: property.name,
          ...analytics
        };
      })
    );

    return {
      timeRange,
      properties: summaryData,
      totals: {
        totalRevenue: summaryData.reduce((sum, p) => sum + (p.totalRevenue || 0), 0),
        totalCommission: summaryData.reduce((sum, p) => sum + (p.agentCommission?.totalEarned || 0), 0),
        totalBookings: summaryData.reduce((sum, p) => sum + (p.totalBookings || 0), 0),
        averageOccupancy: summaryData.reduce((sum, p) => sum + (p.occupancyRate || 0), 0) / Math.max(summaryData.length, 1)
      }
    };
  }

  async getAgentPropertyReviews(agentId: number, propertyId: number, page: number = 1, limit: number = 10) {
    const hasAccess = await this.verifyAgentPropertyAccess(agentId, propertyId);
    if (!hasAccess) {
      throw new Error('Access denied. Property not associated with your clients.');
    }

    return this.getPropertyReviews(propertyId, page, limit);
  }

  async getAgentReviewsSummary(agentId: number) {
    const properties = await this.getAgentPropertiesBasic(agentId);
    const propertyIds = properties.map((p: any) => p.id);

    const [totalReviews, averageRating, recentReviews, ratingDistribution] = await Promise.all([
      prisma.review.count({
        where: { propertyId: { in: propertyIds } }
      }),
      prisma.review.aggregate({
        where: { propertyId: { in: propertyIds } },
        _avg: { rating: true }
      }),
      prisma.review.findMany({
        where: { propertyId: { in: propertyIds } },
        include: {
          user: { select: { firstName: true, lastName: true } },
          property: { select: { name: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: 10
      }),
      prisma.review.groupBy({
        by: ['rating'],
        where: { propertyId: { in: propertyIds } },
        _count: true
      })
    ]);

    return {
      totalReviews,
      averageRating: averageRating._avg.rating || 0,
      recentReviews: recentReviews.map((review: any) => this.transformToPropertyReview(review)),
      ratingDistribution: ratingDistribution.map(item => ({
        rating: item.rating,
        count: item._count
      })),
      propertiesManaged: properties.length
    };
  }

  async createAgentOwnProperty(agentId: number, data: CreatePropertyDto): Promise<PropertyInfo> {
    const property = await this.createProperty(agentId, data);
    
    await prisma.agentBooking.create({
      data: {
        agentId,
        clientId: agentId,
        bookingType: 'property',
        bookingId: `own-property-${property.id}`,
        commission: 0,
        commissionRate: 0,
        status: 'active',
        notes: `Agent-owned property: ${property.name}`
      }
    });

    return property;
  }

  async getAgentOwnProperties(agentId: number, filters?: Partial<PropertySearchFilters>) {
    const whereClause: any = { 
      hostId: agentId
    };
    
    if (filters?.status) {
      whereClause.status = filters.status;
    }

    const properties = await prisma.property.findMany({
      where: whereClause,
      include: {
        host: true,
        reviews: { select: { rating: true } },
        bookings: {
          where: { status: 'confirmed' },
          select: { id: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return Promise.all(
      properties.map((p: any) => this.transformToPropertyInfo(p))
    );
  }

  async getAgentOwnPropertyBookings(agentId: number, propertyId: number) {
    const property = await prisma.property.findFirst({
      where: { id: propertyId, hostId: agentId }
    });

    if (!property) {
      throw new Error('Property not found or not owned by agent');
    }

    const bookings = await prisma.booking.findMany({
      where: { propertyId },
      include: {
        guest: true,
        property: { select: { name: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    return bookings.map((b: any) => this.transformToBookingInfo(b));
  }

  async getAgentOwnPropertyGuests(agentId: number, propertyId?: number) {
    let whereClause: any = {};

    if (propertyId) {
      const property = await prisma.property.findFirst({
        where: { id: propertyId, hostId: agentId }
      });

      if (!property) {
        throw new Error('Property not found or not owned by agent');
      }

      whereClause = {
        bookingsAsGuest: {
          some: { propertyId }
        }
      };
    } else {
      const agentProperties = await prisma.property.findMany({
        where: { hostId: agentId },
        select: { id: true }
      });

      const propertyIds = agentProperties.map(p => p.id);

      whereClause = {
        bookingsAsGuest: {
          some: {
            propertyId: { in: propertyIds }
          }
        }
      };
    }

    const guests = await prisma.user.findMany({
      where: whereClause,
      include: {
        bookingsAsGuest: {
          where: propertyId ? { propertyId } : {
            propertyId: { in: await this.getAgentOwnPropertyIds(agentId) }
          },
          include: {
            property: { select: { name: true } }
          },
          orderBy: { createdAt: 'desc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return guests.map((guest: any) => this.transformToGuestProfile(guest));
  }

  async getAllAgentProperties(agentId: number, filters?: any) {
    const [ownProperties, clientProperties] = await Promise.all([
      this.getAgentOwnProperties(agentId, filters),
      this.getAgentProperties(agentId, filters)
    ]);

    const enrichedOwnProperties = ownProperties.map(p => ({
      ...p,
      relationshipType: 'owned' as const,
      commissionRate: 0,
      fullRevenue: true
    }));

    const enrichedClientProperties = clientProperties.properties?.map(p => ({
      ...p,
      relationshipType: 'managed' as const,
      fullRevenue: false
    })) || [];

    return {
      ownProperties: enrichedOwnProperties,
      managedProperties: enrichedClientProperties,
      totalOwned: ownProperties.length,
      totalManaged: enrichedClientProperties.length,
      totalProperties: ownProperties.length + enrichedClientProperties.length
    };
  }

  // --- PRIVATE HELPER METHODS ---
  private async verifyAgentPropertyAccess(agentId: number, propertyId: number): Promise<boolean> {
    // First, get the property to find the host
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { hostId: true }
    });

    if (!property || !property.hostId) {
      return false;
    }

    // Then check if the agent has access to this host (as a client)
    const agentBooking = await prisma.agentBooking.findFirst({
      where: {
        agentId,
        clientId: property.hostId,
        status: 'active'
      }
    });

    return !!agentBooking;
  }

  private async verifyAgentClientAccess(agentId: number, clientId: number): Promise<boolean> {
    const relation = await prisma.agentBooking.findFirst({
      where: {
        agentId,
        clientId,
        status: 'active'
      }
    });

    return !!relation;
  }

  private async getAgentOwnPropertyIds(agentId: number): Promise<number[]> {
    const properties = await prisma.property.findMany({
      where: { hostId: agentId },
      select: { id: true }
    });
    return properties.map(p => p.id);
  }

  private async getAgentPropertyCommission(agentId: number, hostId: number): Promise<number> {
    const agentBooking = await prisma.agentBooking.findFirst({
      where: {
        agentId,
        clientId: hostId,
        status: 'active'
      },
      select: { commissionRate: true }
    });

    return agentBooking?.commissionRate || 0;
  }

  private async getAgentCommissionRate(agentId: number): Promise<number> {
    const agent = await prisma.user.findUnique({
      where: { id: agentId },
      select: { id: true }
    });

    return 2.19; // Default commission rate
  }

  private calculateBookingCommission(bookingValue: number, agentId: number): number {
    const commissionRate = 2.19;
    return bookingValue * (commissionRate / 100);
  }

  private calculatePropertyOccupancy(propertyId: number, startDate: Date, endDate: Date): Promise<{ occupancyRate: number }> {
    return Promise.resolve({ occupancyRate: Math.random() * 100 });
  }

  private async getPropertyAnalytics(propertyId: number, timeRange: string): Promise<any> {
    return {
      totalRevenue: 0,
      monthlyRevenue: 0,
      totalBookings: 0,
      occupancyRate: 0
    };
  }
}