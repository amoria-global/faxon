//src/services/property.service.ts - Unified Property Service
import { PrismaClient } from '@prisma/client';
import { BrevoPropertyMailingService } from '../utils/brevo.property';
import { EnhancedPropertyService } from './enhanced-property.service';
import { config } from '../config/config';
import { applyGuestPriceMarkupToObject } from '../utils/guest-price-markup.utility';
import { findDuplicateProperties } from '../utils/duplicate-detection.utility';
import { duplicateNotificationService } from './duplicate-notification.service';
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
  private enhancedService = new EnhancedPropertyService();
  
  // --- PROPERTY CRUD OPERATIONS ---
  async createProperty(hostId: number, data: CreatePropertyDto): Promise<PropertyInfo> {
    // Validate pricing type and ensure correct price field is provided
    if (data.pricingType === 'night' && !data.pricePerNight) {
      throw new Error('pricePerNight is required when pricingType is "night"');
    }
    if (data.pricingType === 'month' && !data.pricePerMonth) {
      throw new Error('pricePerMonth is required when pricingType is "month"');
    }

    // Validate availability dates (support both old and new format)
    const availStart = data.availabilityDates?.start || data.availableFrom;
    const availEnd = data.availabilityDates?.end || data.availableTo;

    if (!availStart || !availEnd) {
      throw new Error('Availability dates are required');
    }

    if (new Date(availStart) >= new Date(availEnd)) {
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

    // DUPLICATE DETECTION - Check against approved and pending properties only
    const existingProperties = await prisma.property.findMany({
      where: {
        status: {
          in: ['approved', 'pending'] // Only check against approved and pending, NOT rejected
        }
      },
      select: {
        id: true,
        name: true,
        propertyAddress: true,
        location: true,
        hostId: true,
        status: true
      }
    });

    const duplicates = findDuplicateProperties(
      {
        name: data.name,
        propertyAddress: propertyAddress,
        location: locationString,
        hostId: hostId
      },
      existingProperties,
      95 // 95% similarity threshold
    );

    if (duplicates.length > 0) {
      // Log duplicates for admin review and notify
      for (const duplicate of duplicates) {
        const originalProperty = await prisma.property.findUnique({
          where: { id: duplicate.propertyId },
          select: { hostId: true, name: true }
        });

        // Create duplicate detection log
        const logEntry = await prisma.duplicateDetectionLog.create({
          data: {
            entityType: 'property',
            entityId: 'pending', // Will be updated after property is created if allowed
            duplicateOfId: String(duplicate.propertyId),
            similarityScore: duplicate.similarity.overallScore,
            similarityDetails: JSON.parse(JSON.stringify(duplicate.similarity)),
            uploaderId: hostId,
            originalOwnerId: originalProperty?.hostId || null,
            status: 'pending',
            adminNotified: false,
            uploaderNotified: false,
            ownerNotified: false
          }
        });

        // Send notifications asynchronously (don't block the response)
        duplicateNotificationService.notifyDuplicateDetection({
          entityType: 'property',
          entityId: String(logEntry.id),
          duplicateOfId: String(duplicate.propertyId),
          uploaderId: hostId,
          originalOwnerId: originalProperty?.hostId,
          entityName: data.name,
          duplicateEntityName: originalProperty?.name || 'Unknown',
          similarityScore: duplicate.similarity.overallScore,
          similarityReasons: duplicate.similarity.reasons
        }).catch(err => {
          console.error('Failed to send duplicate notifications:', err);
        });
      }

      // Block property creation
      const duplicateDetails = duplicates.map(d => ({
        propertyId: d.propertyId,
        score: d.similarity.overallScore,
        reasons: d.similarity.reasons
      }));

      throw new Error(
        `This property appears to be a duplicate. Similarity detected with existing ${duplicates.length} propert${duplicates.length > 1 ? 'ies' : 'y'}. Reasons: ${duplicateDetails[0].reasons.join(', ')}. Please contact support if you believe this is an error.`
      );
    }

    const property = await prisma.property.create({
      data: {
        hostId,
        name: data.name,
        location: locationString,
        propertyAddress: propertyAddress,
        upiNumber: upiNumber,
        coordinates: data.coordinates ? JSON.stringify(data.coordinates) : undefined,
        type: data.type,
        category: data.category,
        pricingType: data.pricingType,
        pricePerNight: data.pricePerNight ?? null,
        pricePerMonth: data.pricePerMonth ?? null,
        pricePerTwoNights: data.pricePerTwoNights ?? null,
        minStay: data.minimumStay || 1,
        beds: data.beds,
        baths: data.baths,
        maxGuests: data.maxGuests,
        features: JSON.stringify(data.features),
        description: data.description,
        images: JSON.stringify(data.images),
        video3D: data.video3D,
        availableFrom: new Date(availStart),
        availableTo: new Date(availEnd),
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

    // Send admin notification for new property submission
    try {
      const { adminNotifications } = await import('../utils/admin-notifications.js');
      await adminNotifications.sendPropertySubmissionNotification({
        propertyId: property.id,
        user: {
          id: property.hostId,
          email: property.host.email,
          firstName: property.host.firstName || 'User',
          lastName: property.host.lastName || ''
        },
        property: {
          name: property.name,
          location: property.location,
          type: property.type
        },
        checkInDate: property.createdAt
      });
    } catch (adminNotifError) {
      console.error('Failed to send admin notification for property submission:', adminNotifError);
      // Don't fail property creation if admin notification fails
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

    // Validate pricing type changes
    if (data.pricingType) {
      if (data.pricingType === 'night' && !data.pricePerNight && !(existingProperty as any).pricePerNight) {
        throw new Error('pricePerNight is required when pricingType is "night"');
      }
      if (data.pricingType === 'month' && !data.pricePerMonth && !(existingProperty as any).pricePerMonth) {
        throw new Error('pricePerMonth is required when pricingType is "month"');
      }
    }

    const property = await prisma.property.update({
      where: { id: propertyId },
      data: {
        ...(data.name && { name: data.name }),
        ...locationUpdates,
        ...(data.coordinates && { coordinates: JSON.stringify(data.coordinates) }),
        ...(data.type && { type: data.type }),
        ...(data.category && { category: data.category }),
        ...(data.pricingType && { pricingType: data.pricingType }),
        ...(data.pricePerNight !== undefined && { pricePerNight: data.pricePerNight }),
        ...(data.pricePerMonth !== undefined && { pricePerMonth: data.pricePerMonth }),
        ...(data.pricePerTwoNights !== undefined && { pricePerTwoNights: data.pricePerTwoNights }),
        ...(data.minimumStay !== undefined && { minStay: data.minimumStay }),
        ...(data.beds && { beds: data.beds }),
        ...(data.baths && { baths: data.baths }),
        ...(data.maxGuests && { maxGuests: data.maxGuests }),
        ...(data.features && { features: JSON.stringify(data.features) }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.video3D !== undefined && { video3D: data.video3D }),
        ...(data.status && { status: data.status }),
        ...(data.availabilityDates && {
          availableFrom: new Date(data.availabilityDates.start),
          availableTo: new Date(data.availabilityDates.end)
        }),
        ...((data.availableFrom || data.availableTo) && {
          ...(data.availableFrom && { availableFrom: new Date(data.availableFrom) }),
          ...(data.availableTo && { availableTo: new Date(data.availableTo) })
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
  async getPropertyById(propertyId: number, userType?: string): Promise<PropertyInfo | null> {
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

    // Check if user is host, agent, or tourguide - if so, skip markup
    // Apply 14% markup only for guest view (not for hosts, agents, or tour guides)
    const shouldApplyMarkup = !userType || !['host', 'agent', 'tourguide'].includes(userType);

    if (shouldApplyMarkup) {
      return this.transformToPropertyInfoForGuest(property);
    } else {
      return this.transformToPropertyInfo(property);
    }
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
    if (filters.pricingType) {
      whereClause.pricingType = filters.pricingType;
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

    // Apply 14% markup for guest view
    return {
      properties: properties.map((p: any) => this.transformToPropertySummaryForGuest(p)),
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
    // Ensure data.propertyId is treated as a number
    const propertyIdAsNumber = Number(data.propertyId);

    // Check if user has checked out from this property
    const checkedOutBooking = await prisma.booking.findFirst({
      where: {
        propertyId: propertyIdAsNumber, // Use the converted number
        guestId: userId,
        checkOutValidated: true,
        checkOut: { lt: new Date() }
      }
    });

    if (!checkedOutBooking) {
      throw new Error('You can only review properties you have checked out from');
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
      reviews,
      earnings,
      propertyViews,
      wishlistCount,
      blockedDates,
      pendingPayments,
      // FIX: Add missing revenue sources
      paymentTransactions,
      walletTransactions,
      bonuses,
      ownerPayments,
      completedBookings
    ] = await Promise.all([
      // Existing queries
      prisma.property.count({ where: { hostId } }),
      prisma.property.count({ where: { hostId, status: 'active' } }),
      prisma.booking.findMany({
        where: {
          property: { hostId },
          status: { in: ['pending', 'confirmed', 'checkedin', 'checkout'] }
        },
        include: { property: true, guest: true },
        orderBy: { createdAt: 'desc' },
        take: 10
      }),
      prisma.review.count({
        where: { property: { hostId } }
      }),
      // NEW: Owner earnings data
      prisma.ownerEarning.aggregate({
        where: { ownerId: hostId },
        _sum: {
          grossAmount: true,
          platformFee: true,
          ownerEarning: true
        },
        _count: true
      }),
      // NEW: Property views analytics
      prisma.propertyView.aggregate({
        where: { property: { hostId } },
        _count: true,
        _avg: { duration: true }
      }),
      // NEW: Wishlist popularity
      prisma.wishlist.count({
        where: { property: { hostId } }
      }),
      // NEW: Blocked dates
      prisma.blockedDate.count({
        where: {
          property: { hostId },
          isActive: true,
          endDate: { gte: new Date() }
        }
      }),
      // NEW: Pending payments
      prisma.ownerPayment.count({
        where: {
          ownerId: hostId,
          status: { in: ['pending', 'approved'] }
        }
      }),
      // FIX: Query PaymentTransaction for actual payouts
      prisma.paymentTransaction.findMany({
        where: {
          userId: hostId,
          type: { in: ['payout', 'earning'] },
          status: 'completed'
        },
        select: {
          id: true,
          type: true,
          amount: true,
          currency: true,
          status: true,
          netAmount: true,
          charges: true,
          createdAt: true,
          completedAt: true
        },
        orderBy: { createdAt: 'desc' },
        take: 20
      }),
      // FIX: Query WalletTransaction for earnings
      prisma.walletTransaction.findMany({
        where: {
          wallet: { userId: hostId },
          type: 'credit',
          OR: [
            { description: { contains: 'booking', mode: 'insensitive' } },
            { description: { contains: 'earning', mode: 'insensitive' } }
          ]
        },
        select: {
          id: true,
          amount: true,
          type: true,
          description: true,
          createdAt: true
        },
        orderBy: { createdAt: 'desc' },
        take: 20
      }),
      // FIX: Query Bonus table for referral/performance bonuses
      prisma.bonus.findMany({
        where: { userId: hostId },
        select: {
          id: true,
          sourceType: true,
          amount: true,
          currency: true,
          status: true,
          description: true,
          createdAt: true
        },
        orderBy: { createdAt: 'desc' }
      }),
      // FIX: Query OwnerPayment for all payment records
      prisma.ownerPayment.findMany({
        where: { ownerId: hostId },
        select: {
          id: true,
          amount: true,
          platformFee: true,
          netAmount: true,
          status: true,
          checkInValidated: true,
          paidAt: true,
          createdAt: true
        },
        orderBy: { createdAt: 'desc' },
        take: 20
      }),
      // FIX: Get all completed bookings for revenue calculation
      prisma.booking.findMany({
        where: {
          property: { hostId },
          paymentStatus: 'completed'
        },
        select: {
          id: true,
          totalPrice: true,
          status: true,
          paymentStatus: true,
          walletDistributed: true,
          createdAt: true
        }
      })
    ]);

    // Calculate earnings status breakdown
    const earningsStatus = await prisma.ownerEarning.groupBy({
      by: ['status'],
      where: { ownerId: hostId },
      _sum: { ownerEarning: true },
      _count: true
    });

    // Get property performance with views
    const propertiesWithViews = await prisma.property.findMany({
      where: { hostId },
      select: {
        id: true,
        name: true,
        views: true,
        totalBookings: true,
        averageRating: true,
        _count: {
          select: {
            bookings: true,
            reviews: true,
            wishlistedBy: true
          }
        }
      },
      orderBy: { views: 'desc' },
      take: 5
    });

    const totalBookings = bookings.length;

    // FIX: Calculate revenue from multiple sources for accuracy
    const revenueFromCompletedBookings = completedBookings.reduce((sum, b) => sum + b.totalPrice, 0);
    const revenueFromEarningsTable = earnings._sum.grossAmount || 0;
    const revenueFromPaymentTransactions = paymentTransactions.reduce((sum: number, t: any) => sum + (t.netAmount || t.amount), 0);
    const revenueFromWalletTransactions = (walletTransactions as any[]).reduce((sum: number, t: any) => sum + (t.amount || 0), 0);
    const bonusEarnings = bonuses.reduce((sum, b) => sum + b.amount, 0);

    // Calculate distributed vs pending earnings
    const distributedBookings = completedBookings.filter(b => b.walletDistributed);
    const pendingDistributionBookings = completedBookings.filter(b => !b.walletDistributed);
    const pendingDistributionAmount = pendingDistributionBookings.reduce((sum, b) => sum + b.totalPrice, 0);

    // Calculate owner payments summary
    const paidOwnerPayments = ownerPayments.filter((p: any) => p.status === 'paid');
    const totalPaidOut = paidOwnerPayments.reduce((sum: number, p: any) => sum + p.netAmount, 0);
    const pendingOwnerPayments = ownerPayments.filter((p: any) => p.status === 'pending' || p.status === 'approved');
    const pendingPayoutAmount = pendingOwnerPayments.reduce((sum: number, p: any) => sum + p.netAmount, 0);

    // Use the most comprehensive revenue calculation
    const totalRevenue = Math.max(revenueFromCompletedBookings, revenueFromEarningsTable);

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
      propertyPerformance: propertiesWithViews.map((p: any) => ({
        propertyId: p.id,
        propertyName: p.name,
        views: p.views,
        bookings: p._count.bookings,
        rating: p.averageRating,
        reviewsCount: p._count.reviews,
        wishlistedBy: p._count.wishlistedBy,
        conversionRate: p.views > 0 ? ((p._count.bookings / p.views) * 100).toFixed(2) : '0'
      })),
      upcomingCheckIns: upcomingCheckIns.map((b: any) => this.transformToBookingInfo(b)),
      pendingReviews: reviews,
      // ENHANCED EARNINGS FIELDS:
      earnings: {
        // From OwnerEarning table (confirmed distributed earnings)
        totalGross: earnings._sum.grossAmount || 0,
        totalPlatformFee: earnings._sum.platformFee || 0,
        totalNet: earnings._sum.ownerEarning || 0,
        transactionsCount: earnings._count || 0,
        byStatus: earningsStatus.map((s: any) => ({
          status: s.status,
          amount: s._sum.ownerEarning || 0,
          count: s._count
        })),
        // FIX: Add comprehensive revenue breakdown
        fromBookings: revenueFromCompletedBookings,
        fromWallet: revenueFromWalletTransactions,
        fromPayouts: revenueFromPaymentTransactions,
        bonuses: bonusEarnings,
        // Pending earnings (bookings completed but not distributed)
        pendingDistribution: pendingDistributionAmount,
        pendingDistributionCount: pendingDistributionBookings.length,
        // Owner payment tracking
        totalPaidOut,
        pendingPayout: pendingPayoutAmount,
        pendingPayoutCount: pendingOwnerPayments.length,
        // Recent transactions for transparency
        recentPayouts: paymentTransactions.slice(0, 10).map((t: any) => ({
          id: t.id,
          type: t.type,
          amount: t.amount,
          netAmount: t.netAmount || t.amount,
          charges: t.charges || 0,
          status: t.status,
          createdAt: t.createdAt.toISOString(),
          completedAt: t.completedAt?.toISOString() || null
        })),
        recentBonuses: bonuses.slice(0, 5).map(b => ({
          id: b.id,
          type: b.sourceType,
          amount: b.amount,
          currency: b.currency,
          status: b.status,
          description: b.description,
          createdAt: b.createdAt.toISOString()
        }))
      } as HostDashboard['earnings'],
      analytics: {
        totalViews: propertyViews._count || 0,
        averageViewDuration: Math.round(propertyViews._avg.duration || 0),
        totalWishlisted: wishlistCount,
        activeBlockedDates: blockedDates,
        pendingPayments: pendingPayments
      }
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
      .filter(b => b.status === 'checkout')
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
        status: { in: ['confirmed', 'checkedin', 'checkout'] },
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
      // Fetch from OwnerEarning table (actual earnings after platform fees)
      totalEarnings,
      monthlyEarnings,
      yearlyEarnings,
      lastMonthEarnings,
      // Fetch pending and completed payouts from OwnerPayment
      pendingPayouts,
      completedPayouts,
      // Booking data for occupancy calculations
      totalBookings,
      monthlyBookings,
      occupiedNights,
      totalNights,
      // Wallet data for actual balance
      walletData,
      // Multi-source earnings data
      completedBookings,
      monthlyCompletedBookings,
      yearlyCompletedBookings,
      lastMonthCompletedBookings,
      paymentTransactions,
      monthlyPaymentTransactions,
      yearlyPaymentTransactions,
      lastMonthPaymentTransactions,
      walletTransactions,
      monthlyWalletTransactions,
      yearlyWalletTransactions,
      lastMonthWalletTransactions,
      bonuses,
      monthlyBonuses,
      yearlyBonuses,
      lastMonthBonuses
    ] = await Promise.all([
      // Total earnings from OwnerEarning table
      prisma.ownerEarning.aggregate({
        where: { ownerId: hostId },
        _sum: { ownerEarning: true, grossAmount: true, platformFee: true }
      }),
      // Monthly earnings
      prisma.ownerEarning.aggregate({
        where: {
          ownerId: hostId,
          createdAt: { gte: startOfMonth }
        },
        _sum: { ownerEarning: true }
      }),
      // Yearly earnings
      prisma.ownerEarning.aggregate({
        where: {
          ownerId: hostId,
          createdAt: { gte: startOfYear }
        },
        _sum: { ownerEarning: true }
      }),
      // Last month earnings for growth calculation
      prisma.ownerEarning.aggregate({
        where: {
          ownerId: hostId,
          createdAt: { gte: lastMonthStart, lte: lastMonthEnd }
        },
        _sum: { ownerEarning: true }
      }),
      // Pending payouts from OwnerPayment table
      prisma.ownerPayment.aggregate({
        where: {
          ownerId: hostId,
          status: { in: ['pending', 'approved'] }
        },
        _sum: { netAmount: true }
      }),
      // Completed payouts
      prisma.ownerPayment.aggregate({
        where: {
          ownerId: hostId,
          status: 'paid'
        },
        _sum: { netAmount: true }
      }),
      // Booking counts
      prisma.booking.count({
        where: {
          property: { hostId },
          status: 'checkout'
        }
      }),
      prisma.booking.count({
        where: {
          property: { hostId },
          status: 'checkout',
          checkOut: { gte: startOfMonth }
        }
      }),
      // Occupied nights for occupancy calculation
      prisma.booking.findMany({
        where: {
          property: { hostId },
          status: 'checkout'
        },
        select: { checkIn: true, checkOut: true }
      }),
      // Total properties for occupancy calculation
      prisma.property.count({
        where: { hostId, status: 'active' }
      }),
      // Wallet balance
      prisma.wallet.findUnique({
        where: { userId: hostId },
        select: { balance: true, pendingBalance: true }
      }),
      // MULTI-SOURCE EARNINGS - Total
      prisma.booking.findMany({
        where: {
          property: { hostId },
          paymentStatus: 'completed'
        },
        select: { totalPrice: true }
      }),
      // Monthly completed bookings
      prisma.booking.findMany({
        where: {
          property: { hostId },
          paymentStatus: 'completed',
          checkOut: { gte: startOfMonth }
        },
        select: { totalPrice: true }
      }),
      // Yearly completed bookings
      prisma.booking.findMany({
        where: {
          property: { hostId },
          paymentStatus: 'completed',
          checkOut: { gte: startOfYear }
        },
        select: { totalPrice: true }
      }),
      // Last month completed bookings
      prisma.booking.findMany({
        where: {
          property: { hostId },
          paymentStatus: 'completed',
          checkOut: { gte: lastMonthStart, lte: lastMonthEnd }
        },
        select: { totalPrice: true }
      }),
      // Payment transactions - total (payouts to host)
      prisma.paymentTransaction.findMany({
        where: {
          userId: hostId,
          type: 'payout',
          status: 'completed'
        },
        select: { netAmount: true, amount: true }
      }),
      // Monthly payment transactions
      prisma.paymentTransaction.findMany({
        where: {
          userId: hostId,
          type: 'payout',
          status: 'completed',
          createdAt: { gte: startOfMonth }
        },
        select: { netAmount: true, amount: true }
      }),
      // Yearly payment transactions
      prisma.paymentTransaction.findMany({
        where: {
          userId: hostId,
          type: 'payout',
          status: 'completed',
          createdAt: { gte: startOfYear }
        },
        select: { netAmount: true, amount: true }
      }),
      // Last month payment transactions
      prisma.paymentTransaction.findMany({
        where: {
          userId: hostId,
          type: 'payout',
          status: 'completed',
          createdAt: { gte: lastMonthStart, lte: lastMonthEnd }
        },
        select: { netAmount: true, amount: true }
      }),
      // Wallet transactions - total
      prisma.walletTransaction.findMany({
        where: {
          wallet: { userId: hostId },
          type: 'credit',
          OR: [
            { description: { contains: 'booking', mode: 'insensitive' } },
            { description: { contains: 'earning', mode: 'insensitive' } }
          ]
        },
        select: { amount: true }
      }),
      // Monthly wallet transactions
      prisma.walletTransaction.findMany({
        where: {
          wallet: { userId: hostId },
          type: 'credit',
          createdAt: { gte: startOfMonth },
          OR: [
            { description: { contains: 'booking', mode: 'insensitive' } },
            { description: { contains: 'earning', mode: 'insensitive' } }
          ]
        },
        select: { amount: true }
      }),
      // Yearly wallet transactions
      prisma.walletTransaction.findMany({
        where: {
          wallet: { userId: hostId },
          type: 'credit',
          createdAt: { gte: startOfYear },
          OR: [
            { description: { contains: 'booking', mode: 'insensitive' } },
            { description: { contains: 'earning', mode: 'insensitive' } }
          ]
        },
        select: { amount: true }
      }),
      // Last month wallet transactions
      prisma.walletTransaction.findMany({
        where: {
          wallet: { userId: hostId },
          type: 'credit',
          createdAt: { gte: lastMonthStart, lte: lastMonthEnd },
          OR: [
            { description: { contains: 'booking', mode: 'insensitive' } },
            { description: { contains: 'earning', mode: 'insensitive' } }
          ]
        },
        select: { amount: true }
      }),
      // Bonuses - total
      prisma.bonus.findMany({
        where: { userId: hostId },
        select: { amount: true }
      }),
      // Monthly bonuses
      prisma.bonus.findMany({
        where: {
          userId: hostId,
          createdAt: { gte: startOfMonth }
        },
        select: { amount: true }
      }),
      // Yearly bonuses
      prisma.bonus.findMany({
        where: {
          userId: hostId,
          createdAt: { gte: startOfYear }
        },
        select: { amount: true }
      }),
      // Last month bonuses
      prisma.bonus.findMany({
        where: {
          userId: hostId,
          createdAt: { gte: lastMonthStart, lte: lastMonthEnd }
        },
        select: { amount: true }
      })
    ]);

    const occupiedNightsCount = occupiedNights.reduce((total, booking) => {
      const nights = Math.ceil((new Date(booking.checkOut).getTime() - new Date(booking.checkIn).getTime()) / (1000 * 60 * 60 * 24));
      return total + nights;
    }, 0);

    const totalAvailableNights = totalNights * 365;
    const occupancyRate = totalAvailableNights > 0 ? (occupiedNightsCount / totalAvailableNights) * 100 : 0;

    // Calculate earnings from multiple sources
    const earningsFromTable = Number(totalEarnings._sum.ownerEarning || 0);
    const earningsFromBookings = completedBookings.reduce((sum, b) => sum + Number(b.totalPrice), 0);
    const earningsFromPayments = paymentTransactions.reduce((sum, t) => sum + Number(t.netAmount || t.amount), 0);
    const earningsFromWallet = walletTransactions.reduce((sum, t) => sum + Number(t.amount), 0);
    const earningsFromBonuses = bonuses.reduce((sum, b) => sum + Number(b.amount), 0);

    // Use maximum for most accurate total
    const totalEarningsAmount = Math.max(earningsFromTable, earningsFromBookings, earningsFromPayments, earningsFromWallet) + earningsFromBonuses;

    // Monthly earnings from multiple sources
    const monthlyFromTable = Number(monthlyEarnings._sum.ownerEarning || 0);
    const monthlyFromBookings = monthlyCompletedBookings.reduce((sum, b) => sum + Number(b.totalPrice), 0);
    const monthlyFromPayments = monthlyPaymentTransactions.reduce((sum, t) => sum + Number(t.netAmount || t.amount), 0);
    const monthlyFromWallet = monthlyWalletTransactions.reduce((sum, t) => sum + Number(t.amount), 0);
    const monthlyFromBonuses = monthlyBonuses.reduce((sum, b) => sum + Number(b.amount), 0);
    const currentMonth = Math.max(monthlyFromTable, monthlyFromBookings, monthlyFromPayments, monthlyFromWallet) + monthlyFromBonuses;

    // Yearly earnings from multiple sources
    const yearlyFromTable = Number(yearlyEarnings._sum.ownerEarning || 0);
    const yearlyFromBookings = yearlyCompletedBookings.reduce((sum, b) => sum + Number(b.totalPrice), 0);
    const yearlyFromPayments = yearlyPaymentTransactions.reduce((sum, t) => sum + Number(t.netAmount || t.amount), 0);
    const yearlyFromWallet = yearlyWalletTransactions.reduce((sum, t) => sum + Number(t.amount), 0);
    const yearlyFromBonuses = yearlyBonuses.reduce((sum, b) => sum + Number(b.amount), 0);
    const yearlyTotal = Math.max(yearlyFromTable, yearlyFromBookings, yearlyFromPayments, yearlyFromWallet) + yearlyFromBonuses;

    // Last month earnings from multiple sources
    const lastMonthFromTable = Number(lastMonthEarnings._sum.ownerEarning || 0);
    const lastMonthFromBookings = lastMonthCompletedBookings.reduce((sum, b) => sum + Number(b.totalPrice), 0);
    const lastMonthFromPayments = lastMonthPaymentTransactions.reduce((sum, t) => sum + Number(t.netAmount || t.amount), 0);
    const lastMonthFromWallet = lastMonthWalletTransactions.reduce((sum, t) => sum + Number(t.amount), 0);
    const lastMonthFromBonuses = lastMonthBonuses.reduce((sum, b) => sum + Number(b.amount), 0);
    const lastMonth = Math.max(lastMonthFromTable, lastMonthFromBookings, lastMonthFromPayments, lastMonthFromWallet) + lastMonthFromBonuses;

    const avgNightlyRate = occupiedNightsCount > 0 ? totalEarningsAmount / occupiedNightsCount : 0;
    const revenueGrowth = lastMonth > 0 ? ((currentMonth - lastMonth) / lastMonth) * 100 : 0;

    return {
      totalEarnings: totalEarningsAmount,
      monthlyEarnings: currentMonth,
      yearlyEarnings: yearlyTotal,
      pendingPayouts: Number(pendingPayouts._sum.netAmount || 0),
      completedPayouts: Number(completedPayouts._sum.netAmount || 0),
      averageNightlyRate: avgNightlyRate,
      occupancyRate: occupancyRate,
      revenueGrowth: revenueGrowth,
      // Additional fields
      currentBalance: walletData ? Number(walletData.balance) : 0,
      pendingBalance: walletData ? Number(walletData.pendingBalance) : 0
    };
  }

  async getEarningsBreakdown(hostId: number): Promise<EarningsBreakdown[]> {
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    // Get all properties for the host
    const properties = await prisma.property.findMany({
      where: { hostId },
      include: {
        bookings: {
          where: { status: { in: ['checkout'] } },
          select: {
            id: true,
            checkIn: true,
            checkOut: true,
            createdAt: true
          }
        }
      }
    });

    // Get earnings breakdown by property from multiple sources
    const earningsData = await Promise.all(
      properties.map(async (property) => {
        const [
          totalEarnings,
          monthlyEarnings,
          completedBookings,
          monthlyCompletedBookings,
          paymentTransactions,
          monthlyPaymentTransactions,
          walletTransactions,
          monthlyWalletTransactions
        ] = await Promise.all([
          prisma.ownerEarning.aggregate({
            where: {
              ownerId: hostId,
              propertyId: property.id
            },
            _sum: { ownerEarning: true, grossAmount: true, platformFee: true },
            _count: true
          }),
          prisma.ownerEarning.aggregate({
            where: {
              ownerId: hostId,
              propertyId: property.id,
              createdAt: { gte: startOfMonth }
            },
            _sum: { ownerEarning: true }
          }),
          // Completed bookings for this property
          prisma.booking.findMany({
            where: {
              propertyId: property.id,
              paymentStatus: 'completed'
            },
            select: { totalPrice: true }
          }),
          // Monthly completed bookings
          prisma.booking.findMany({
            where: {
              propertyId: property.id,
              paymentStatus: 'completed',
              checkOut: { gte: startOfMonth }
            },
            select: { totalPrice: true }
          }),
          // Payment transactions for this property - since PaymentTransaction doesn't have booking relation,
          // we'll use an empty array placeholder (earnings are primarily from bookings and wallet)
          Promise.resolve([]),
          // Monthly payment transactions - placeholder
          Promise.resolve([]),
          // Wallet transactions for this property
          prisma.walletTransaction.findMany({
            where: {
              wallet: { userId: hostId },
              type: 'credit',
              OR: [
                { description: { contains: property.name, mode: 'insensitive' } },
                { description: { contains: 'booking', mode: 'insensitive' } }
              ]
            },
            select: { amount: true }
          }),
          // Monthly wallet transactions
          prisma.walletTransaction.findMany({
            where: {
              wallet: { userId: hostId },
              type: 'credit',
              createdAt: { gte: startOfMonth },
              OR: [
                { description: { contains: property.name, mode: 'insensitive' } },
                { description: { contains: 'booking', mode: 'insensitive' } }
              ]
            },
            select: { amount: true }
          })
        ]);

        const allBookings = property.bookings;
        const totalNights = allBookings.reduce((sum, b) => {
          const nights = Math.ceil((new Date(b.checkOut).getTime() - new Date(b.checkIn).getTime()) / (1000 * 60 * 60 * 24));
          return sum + nights;
        }, 0);

        // Calculate total earnings from multiple sources
        const earningsFromTable = Number(totalEarnings._sum.ownerEarning || 0);
        const earningsFromBookings = completedBookings.reduce((sum, b) => sum + Number(b.totalPrice), 0);
        const earningsFromPayments = 0; // PaymentTransaction doesn't have booking relation, earnings come from bookings/wallet
        const earningsFromWallet = walletTransactions.reduce((sum, t) => sum + Number(t.amount), 0);
        const totalEarningsAmount = Math.max(earningsFromTable, earningsFromBookings, earningsFromPayments, earningsFromWallet);

        // Calculate monthly earnings from multiple sources
        const monthlyFromTable = Number(monthlyEarnings._sum.ownerEarning || 0);
        const monthlyFromBookings = monthlyCompletedBookings.reduce((sum, b) => sum + Number(b.totalPrice), 0);
        const monthlyFromPayments = 0; // PaymentTransaction doesn't have booking relation
        const monthlyFromWallet = monthlyWalletTransactions.reduce((sum, t) => sum + Number(t.amount), 0);
        const monthlyTotal = Math.max(monthlyFromTable, monthlyFromBookings, monthlyFromPayments, monthlyFromWallet);

        const bookingsCount = Math.max(totalEarnings._count, completedBookings.length);
        const avgBookingValue = bookingsCount > 0 ? totalEarningsAmount / bookingsCount : 0;
        const occupancyRate = totalNights > 0 ? (totalNights / (365 * (new Date().getFullYear() - new Date(property.createdAt).getFullYear() + 1))) * 100 : 0;

        const lastBooking = allBookings.length > 0
          ? allBookings.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
          : null;

        return {
          propertyId: property.id,
          propertyName: property.name,
          totalEarnings: totalEarningsAmount,
          monthlyEarnings: monthlyTotal,
          bookingsCount: bookingsCount,
          averageBookingValue: avgBookingValue,
          occupancyRate: Math.min(occupancyRate, 100),
          lastBooking: lastBooking?.createdAt.toISOString(),
          // Additional fields
          grossAmount: Number(totalEarnings._sum.grossAmount || 0),
          platformFee: Number(totalEarnings._sum.platformFee || 0)
        };
      })
    );

    return earningsData;
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
      monthlyCommissions,
      // NEW: Leads management data
      leadsData,
      // NEW: Inquiries data
      inquiriesData,
      // NEW: Client interactions
      interactionsData,
      // NEW: Agent reviews
      reviewsData,
      // NEW: Commission details
      commissionsDetail,
      // NEW: Property views for agent properties
      propertyViewsData,
      // FIX: Add missing revenue sources
      paymentTransactions,
      walletTransactions,
      bonuses,
      allCommissions
    ] = await Promise.all([
      // Existing queries
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
      this.getAgentMonthlyCommissions(agentId),
      // NEW: Fetch leads with status breakdown
      prisma.lead.groupBy({
        by: ['status'],
        where: { agentId },
        _count: true
      }),
      // NEW: Fetch inquiries data
      prisma.inquiry.aggregate({
        where: { agentId },
        _count: true,
        _avg: { responseTime: true }
      }),
      // NEW: Fetch client interactions
      prisma.clientInteraction.aggregate({
        where: { agentId },
        _count: true,
        _avg: { clientSatisfaction: true }
      }),
      // NEW: Fetch agent reviews
      prisma.agentReview.aggregate({
        where: { agentId },
        _count: true,
        _avg: {
          rating: true,
          communicationRating: true,
          professionalismRating: true,
          knowledgeRating: true,
          responsivenessRating: true,
          resultsRating: true
        }
      }),
      // NEW: Fetch commission details by status
      prisma.agentCommission.groupBy({
        by: ['status'],
        where: { agentId },
        _sum: { amount: true },
        _count: true
      }),
      // NEW: Fetch property views for agent-managed properties
      prisma.propertyView.aggregate({
        where: { property: { agentId } },
        _count: true
      }),
      // FIX: Query PaymentTransaction for actual payouts
      prisma.paymentTransaction.findMany({
        where: {
          userId: agentId,
          type: { in: ['payout', 'commission'] },
          status: 'completed'
        },
        select: {
          id: true,
          type: true,
          amount: true,
          currency: true,
          status: true,
          netAmount: true,
          charges: true,
          createdAt: true,
          completedAt: true
        },
        orderBy: { createdAt: 'desc' },
        take: 20
      }),
      // FIX: Query WalletTransaction for earnings
      prisma.walletTransaction.findMany({
        where: {
          wallet: { userId: agentId },
          type: 'credit',
          OR: [
            { description: { contains: 'commission', mode: 'insensitive' } },
            { description: { contains: 'earning', mode: 'insensitive' } }
          ]
        },
        select: {
          id: true,
          amount: true,
          type: true,
          description: true,
          createdAt: true
        },
        orderBy: { createdAt: 'desc' },
        take: 20
      }),
      // FIX: Query Bonus table for referral/performance bonuses
      prisma.bonus.findMany({
        where: { userId: agentId },
        select: {
          id: true,
          sourceType: true,
          amount: true,
          currency: true,
          status: true,
          description: true,
          createdAt: true
        },
        orderBy: { createdAt: 'desc' }
      }),
      // FIX: Get ALL commissions including pending
      prisma.agentCommission.findMany({
        where: { agentId },
        select: {
          id: true,
          amount: true,
          commissionRate: true,
          status: true,
          earnedAt: true,
          paidAt: true,
          createdAt: true
        },
        orderBy: { createdAt: 'desc' },
        take: 50
      })
    ]);

    const totalClients = totalClientsData.length;
    const activeClients = activeClientsData.length;

    const avgCommissionPerBooking = recentBookings.length > 0
      ? (totalCommissions._sum.commission || 0) / recentBookings.length
      : 0;

    // Calculate lead conversion rate
    const totalLeads = leadsData.reduce((sum: number, lead: any) => sum + lead._count, 0);
    const convertedLeads = leadsData.find((l: any) => l.status === 'converted')?._count || 0;
    const leadConversionRate = totalLeads > 0 ? ((convertedLeads / totalLeads) * 100).toFixed(2) : '0';

    // Get pending inquiries count
    const pendingInquiriesCount = await prisma.inquiry.count({
      where: { agentId, isResponded: false }
    });

    // Get upcoming interactions
    const upcomingInteractions = await prisma.clientInteraction.count({
      where: {
        agentId,
        scheduledAt: { gte: new Date() },
        completedAt: null
      }
    });

    // FIX: Calculate commission earnings from multiple sources
    const commissionFromPayments = paymentTransactions.reduce((sum: number, t: any) => sum + (t.netAmount || t.amount), 0);
    const commissionFromWallet = (walletTransactions as any[]).reduce((sum: number, t: any) => sum + (t.amount || 0), 0);
    const bonusEarnings = bonuses.reduce((sum, b) => sum + b.amount, 0);

    // FIX: Separate commissions by status for accurate reporting
    const earnedCommissions = allCommissions.filter(c => c.status === 'earned' || c.status === 'paid');
    const pendingCommissionsFromTable = allCommissions.filter(c => c.status === 'pending');
    const paidCommissions = allCommissions.filter(c => c.status === 'paid');

    const totalEarnedAmount = earnedCommissions.reduce((sum, c) => sum + c.amount, 0);
    const totalPendingAmount = pendingCommissionsFromTable.reduce((sum, c) => sum + c.amount, 0);
    const totalPaidAmount = paidCommissions.reduce((sum, c) => sum + c.amount, 0);

    // Use the most comprehensive calculation
    const calculatedTotalCommissions = Math.max(
      totalCommissions._sum.commission || 0,
      totalEarnedAmount + totalPendingAmount
    );

    return {
      totalClients,
      activeClients,
      totalCommissions: calculatedTotalCommissions,
      pendingCommissions: totalPendingAmount,
      avgCommissionPerBooking,
      recentBookings: recentBookings.map(this.transformToAgentBookingInfo),
      monthlyCommissions,
      // NEW FIELDS:
      leads: {
        total: totalLeads,
        byStatus: leadsData.map((l: any) => ({
          status: l.status,
          count: l._count
        })),
        conversionRate: leadConversionRate
      },
      inquiries: {
        total: inquiriesData._count || 0,
        pending: pendingInquiriesCount,
        averageResponseTime: Math.round(inquiriesData._avg.responseTime || 0)
      },
      interactions: {
        total: interactionsData._count || 0,
        upcoming: upcomingInteractions,
        averageClientSatisfaction: interactionsData._avg.clientSatisfaction || 0
      },
      reviews: {
        count: reviewsData._count || 0,
        averageRating: reviewsData._avg.rating || 0,
        categoryRatings: {
          communication: reviewsData._avg.communicationRating || 0,
          professionalism: reviewsData._avg.professionalismRating || 0,
          knowledge: reviewsData._avg.knowledgeRating || 0,
          responsiveness: reviewsData._avg.responsivenessRating || 0,
          results: reviewsData._avg.resultsRating || 0
        }
      },
      commissions: {
        total: calculatedTotalCommissions,
        earned: totalEarnedAmount,
        pending: totalPendingAmount,
        paid: totalPaidAmount,
        byStatus: commissionsDetail.map((c: any) => ({
          status: c.status,
          amount: c._sum.amount || 0,
          count: c._count
        })),
        // FIX: Add comprehensive breakdown
        fromPayouts: commissionFromPayments,
        fromWallet: commissionFromWallet,
        bonuses: bonusEarnings,
        // Recent transactions
        recentPayouts: paymentTransactions.slice(0, 10).map((t: any) => ({
          id: t.id,
          type: t.type,
          amount: t.amount,
          netAmount: t.netAmount || t.amount,
          charges: t.charges || 0,
          status: t.status,
          createdAt: t.createdAt.toISOString(),
          completedAt: t.completedAt?.toISOString() || null
        })),
        recentCommissions: allCommissions.slice(0, 10).map(c => ({
          id: c.id,
          amount: c.amount,
          commissionRate: c.commissionRate,
          status: c.status,
          earnedAt: c.earnedAt?.toISOString() || null,
          paidAt: c.paidAt?.toISOString() || null,
          createdAt: c.createdAt.toISOString()
        })),
        recentBonuses: bonuses.slice(0, 5).map(b => ({
          id: b.id,
          type: b.sourceType,
          amount: b.amount,
          currency: b.currency,
          status: b.status,
          description: b.description,
          createdAt: b.createdAt.toISOString()
        }))
      } as AgentDashboard['commissions'],
      propertyViews: {
        total: propertyViewsData._count || 0
      }
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
        status: { in: ['confirmed', 'checkedin', 'checkout'] }
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
        status: 'checkout'
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
        status: { in: ['confirmed', 'checkedin', 'checkout'] }
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
          status: 'checkout'
        },
        _sum: { commission: true }
      }),
      prisma.agentBooking.aggregate({
        where: {
          agentId,
          createdAt: { gte: twoMonthsAgo, lte: lastMonth },
          status: 'checkout'
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
          status: { in: ['confirmed', 'checkedin', 'checkout'] }
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
        status: 'checkout'
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
            status: { in: ['confirmed', 'checkedin', 'checkout'] },
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
      coordinates: property.coordinates ? JSON.parse(property.coordinates as string) : undefined,
      upiNumber: property.upiNumber,
      propertyAddress: property.propertyAddress,
      type: property.type,
      category: property.category,
      pricingType: property.pricingType || 'night',
      pricePerNight: property.pricePerNight,
      pricePerMonth: property.pricePerMonth,
      pricePerTwoNights: property.pricePerTwoNights,
      beds: property.beds,
      baths: property.baths,
      maxGuests: property.maxGuests,
      minStay: property.minStay || 1,
      maxStay: property.maxStay,
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

  // Apply 14% markup for guest-facing property details
  private async transformToPropertyInfoForGuest(property: any): Promise<PropertyInfo> {
    const info = await this.transformToPropertyInfo(property);
    // Apply markup to the appropriate price field based on pricing type
    const priceFields = info.pricingType === 'night'
      ? (['pricePerNight', 'pricePerTwoNights'] as (keyof PropertyInfo)[])
      : (['pricePerMonth'] as (keyof PropertyInfo)[]);
    return applyGuestPriceMarkupToObject(info, priceFields);
  }

  private transformToPropertySummary(property: any): PropertySummary {
    const images = property.images ? JSON.parse(property.images as string) : {};
    const mainImage = this.getMainImage(images);
    const pricingType = property.pricingType || 'night';

    return {
      id: property.id,
      name: property.name,
      location: property.location,
      category: property.category,
      type: property.type,
      pricingType: pricingType,
      // Only include the relevant price field based on pricing type
      ...(pricingType === 'night'
        ? { pricePerNight: property.pricePerNight }
        : { pricePerMonth: property.pricePerMonth }
      ),
      minStay: property.minStay || 1,
      image: mainImage,
      rating: property.averageRating || 0,
      reviewsCount: property.reviewsCount || 0,
      beds: property.beds,
      baths: property.baths,
      hostName: property.host ? `${property.host.firstName} ${property.host.lastName}`.trim() : 'Unknown Host',
      availability: property.status === 'active' ? 'Available' : 'Unavailable'
    };
  }

  // Apply 14% markup for guest-facing property summary
  private transformToPropertySummaryForGuest(property: any): PropertySummary {
    const summary = this.transformToPropertySummary(property);
    // Apply markup to the appropriate price field based on pricing type
    const priceFields = summary.pricingType === 'night'
      ? (['pricePerNight'] as (keyof PropertySummary)[])
      : (['pricePerMonth'] as (keyof PropertySummary)[]);
    return applyGuestPriceMarkupToObject(summary, priceFields);
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
    const completedBookings = bookings.filter((b: any) => b.status === 'checkout');
    
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
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const [
      totalViews,
      totalBookings,
      completedBookings,
      walletTransactions,
      paymentTransactions,
      bonuses,
      ratings,
      properties,
      occupiedNights,
      repeatGuests
    ] = await Promise.all([
      // Total views
      prisma.propertyView.count({
        where: {
          property: { hostId },
          createdAt: { gte: startDate }
        }
      }),
      // Total bookings in period
      prisma.booking.count({
        where: {
          property: { hostId },
          createdAt: { gte: startDate }
        }
      }),
      // Completed bookings for revenue
      prisma.booking.findMany({
        where: {
          property: { hostId },
          paymentStatus: 'completed',
          createdAt: { gte: startDate }
        },
        select: { totalPrice: true, checkIn: true, checkOut: true }
      }),
      // Wallet transactions
      prisma.walletTransaction.findMany({
        where: {
          wallet: { userId: hostId },
          type: 'credit',
          createdAt: { gte: startDate },
          OR: [
            { description: { contains: 'booking', mode: 'insensitive' } },
            { description: { contains: 'earning', mode: 'insensitive' } }
          ]
        },
        select: { amount: true }
      }),
      // Payment transactions
      prisma.paymentTransaction.findMany({
        where: {
          userId: hostId,
          type: 'payout',
          status: 'completed',
          createdAt: { gte: startDate }
        },
        select: { netAmount: true, amount: true }
      }),
      // Bonuses
      prisma.bonus.findMany({
        where: {
          userId: hostId,
          createdAt: { gte: startDate }
        },
        select: { amount: true }
      }),
      // Average rating
      prisma.review.aggregate({
        where: {
          property: { hostId },
          createdAt: { gte: startDate }
        },
        _avg: { rating: true }
      }),
      // Active properties
      prisma.property.count({
        where: { hostId, status: 'active' }
      }),
      // Occupied nights for occupancy calculation
      prisma.booking.findMany({
        where: {
          property: { hostId },
          status: 'checkout',
          checkOut: { gte: startDate }
        },
        select: { checkIn: true, checkOut: true }
      }),
      // Repeat guests
      prisma.booking.groupBy({
        by: ['guestId'],
        where: {
          property: { hostId },
          createdAt: { gte: startDate }
        },
        _count: true,
        having: { guestId: { _count: { gt: 1 } } }
      })
    ]);

    // Calculate revenue from multiple sources
    const revenueFromBookings = completedBookings.reduce((sum, b) => sum + Number(b.totalPrice), 0);
    const revenueFromWallet = walletTransactions.reduce((sum, t) => sum + Number(t.amount), 0);
    const revenueFromPayouts = paymentTransactions.reduce((sum, t) => sum + Number(t.netAmount || t.amount), 0);
    const revenueFromBonuses = bonuses.reduce((sum, b) => sum + Number(b.amount), 0);
    const totalRevenue = Math.max(revenueFromBookings, revenueFromWallet, revenueFromPayouts) + revenueFromBonuses;

    // Calculate occupancy rate
    const occupiedNightsCount = occupiedNights.reduce((total, booking) => {
      const nights = Math.ceil((new Date(booking.checkOut).getTime() - new Date(booking.checkIn).getTime()) / (1000 * 60 * 60 * 24));
      return total + nights;
    }, 0);

    const daysInPeriod = Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const totalAvailableNights = properties * daysInPeriod;
    const occupancyRate = totalAvailableNights > 0 ? (occupiedNightsCount / totalAvailableNights) * 100 : 0;

    // Conversion rate
    const conversionRate = totalViews > 0 ? (totalBookings / totalViews) * 100 : 0;

    // Repeat guest rate
    const totalGuests = await prisma.booking.groupBy({
      by: ['guestId'],
      where: {
        property: { hostId },
        createdAt: { gte: startDate }
      }
    });
    const repeatGuestRate = totalGuests.length > 0 ? (repeatGuests.length / totalGuests.length) * 100 : 0;

    return {
      totalViews,
      totalBookings,
      totalRevenue,
      averageRating: ratings._avg.rating || 0,
      occupancyRate,
      conversionRate,
      repeatGuestRate,
      timeRange
    };
  }

  private async getPropertyPerformanceMetrics(hostId: number, timeRange: string): Promise<PropertyPerformanceMetrics[]> {
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
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const properties = await prisma.property.findMany({
      where: { hostId },
      include: {
        bookings: {
          where: {
            createdAt: { gte: startDate }
          },
          select: {
            id: true,
            totalPrice: true,
            paymentStatus: true,
            checkIn: true,
            checkOut: true
          }
        },
        reviews: {
          where: {
            createdAt: { gte: startDate }
          },
          select: { rating: true }
        },
        propertyViews: {
          where: {
            createdAt: { gte: startDate }
          }
        }
      }
    });

    return properties.map((property: any) => {
      const completedBookings = property.bookings.filter((b: any) => b.paymentStatus === 'completed');
      const revenue = completedBookings.reduce((sum: number, b: any) => sum + Number(b.totalPrice), 0);
      const avgRating = property.reviews.length > 0
        ? property.reviews.reduce((sum: number, r: any) => sum + r.rating, 0) / property.reviews.length
        : 0;

      const occupiedNights = property.bookings.reduce((total: number, booking: any) => {
        const nights = Math.ceil((new Date(booking.checkOut).getTime() - new Date(booking.checkIn).getTime()) / (1000 * 60 * 60 * 24));
        return total + nights;
      }, 0);

      const daysInPeriod = Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const occupancyRate = daysInPeriod > 0 ? (occupiedNights / daysInPeriod) * 100 : 0;

      return {
        propertyId: property.id,
        propertyName: property.name,
        views: property.propertyViews.length,
        bookings: property.bookings.length,
        revenue,
        occupancyRate,
        averageRating: avgRating,
        conversionRate: property.propertyViews.length > 0 ? (property.bookings.length / property.propertyViews.length) * 100 : 0,
        pricePerformance: 'at_market' as const,
        recommendations: []
      };
    });
  }

  private async getBookingTrendData(hostId: number, startDate: Date): Promise<BookingTrendData[]> {
    const bookings = await prisma.booking.findMany({
      where: {
        property: { hostId },
        createdAt: { gte: startDate }
      },
      select: {
        totalPrice: true,
        paymentStatus: true,
        createdAt: true
      }
    });

    // Group by month
    const monthlyData: { [key: string]: { bookings: number; revenue: number } } = {};

    bookings.forEach(booking => {
      const month = booking.createdAt.toISOString().slice(0, 7); // YYYY-MM
      if (!monthlyData[month]) {
        monthlyData[month] = { bookings: 0, revenue: 0 };
      }
      monthlyData[month].bookings += 1;
      if (booking.paymentStatus === 'completed') {
        monthlyData[month].revenue += Number(booking.totalPrice);
      }
    });

    return Object.entries(monthlyData).map(([period, data]) => ({
      date: period,
      bookings: data.bookings,
      revenue: data.revenue,
      averageBookingValue: data.bookings > 0 ? data.revenue / data.bookings : 0,
      occupancyRate: 0 // Would need to calculate based on available nights
    }));
  }

  private async getGuestAnalytics(hostId: number): Promise<GuestAnalytics> {
    const [bookings, reviews] = await Promise.all([
      prisma.booking.findMany({
        where: { property: { hostId } },
        select: {
          guestId: true,
          checkIn: true,
          checkOut: true
        }
      }),
      prisma.review.findMany({
        where: { property: { hostId } },
        select: { rating: true }
      })
    ]);

    // Count unique and returning guests
    const guestBookingCounts: { [key: number]: number } = {};
    bookings.forEach(booking => {
      guestBookingCounts[booking.guestId] = (guestBookingCounts[booking.guestId] || 0) + 1;
    });

    const totalGuests = Object.keys(guestBookingCounts).length;
    const returningGuests = Object.values(guestBookingCounts).filter(count => count > 1).length;
    const newGuests = totalGuests - returningGuests;

    // Calculate average stay duration
    const totalNights = bookings.reduce((sum, b) => {
      const nights = Math.ceil((new Date(b.checkOut).getTime() - new Date(b.checkIn).getTime()) / (1000 * 60 * 60 * 24));
      return sum + nights;
    }, 0);
    const averageStayDuration = bookings.length > 0 ? totalNights / bookings.length : 0;

    // Rating distribution
    const ratingCounts: { [key: number]: number } = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    reviews.forEach(review => {
      const rating = Math.floor(review.rating);
      ratingCounts[rating] = (ratingCounts[rating] || 0) + 1;
    });

    const ratingDistribution = Object.entries(ratingCounts).map(([rating, count]) => ({
      rating: Number(rating),
      count
    }));

    const averageRating = reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;

    return {
      totalGuests,
      newGuests,
      returningGuests,
      averageStayDuration,
      guestDemographics: {
        ageGroups: [],
        countries: [],
        purposes: []
      },
      guestSatisfaction: {
        averageRating,
        ratingDistribution,
        commonComplaints: [],
        commonPraises: []
      }
    };
  }
 
  private async getRevenueAnalytics(hostId: number): Promise<RevenueAnalytics> {
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const [bookings, properties] = await Promise.all([
      prisma.booking.findMany({
        where: {
          property: { hostId },
          paymentStatus: 'completed',
          createdAt: { gte: twelveMonthsAgo }
        },
        select: {
          totalPrice: true,
          createdAt: true,
          propertyId: true,
          checkIn: true
        }
      }),
      prisma.property.findMany({
        where: { hostId },
        select: {
          id: true,
          name: true
        }
      })
    ]);

    // Monthly revenue
    const monthlyData: { [key: string]: number } = {};
    bookings.forEach(booking => {
      const month = booking.createdAt.toISOString().slice(0, 7);
      monthlyData[month] = (monthlyData[month] || 0) + Number(booking.totalPrice);
    });

    const monthlyRevenue = Object.entries(monthlyData).map(([month, revenue]) => ({
      month,
      revenue
    }));

    // Revenue by property
    const propertyData: { [key: number]: number } = {};
    bookings.forEach(booking => {
      propertyData[booking.propertyId] = (propertyData[booking.propertyId] || 0) + Number(booking.totalPrice);
    });

    const revenueByProperty = properties.map(property => ({
      propertyId: property.id,
      propertyName: property.name,
      revenue: propertyData[property.id] || 0
    }));

    // Seasonal trends (by quarter)
    const seasonalData: { [key: string]: number } = {};
    bookings.forEach(booking => {
      const month = new Date(booking.checkIn).getMonth();
      let season: string;
      if (month >= 2 && month <= 4) season = 'Spring';
      else if (month >= 5 && month <= 7) season = 'Summer';
      else if (month >= 8 && month <= 10) season = 'Fall';
      else season = 'Winter';

      seasonalData[season] = (seasonalData[season] || 0) + Number(booking.totalPrice);
    });

    const seasonalTrends = Object.entries(seasonalData).map(([season, revenue]) => {
      const seasonBookings = bookings.filter(b => {
        const month = new Date(b.checkIn).getMonth();
        if (season === 'Spring') return month >= 2 && month <= 4;
        if (season === 'Summer') return month >= 5 && month <= 7;
        if (season === 'Fall') return month >= 8 && month <= 10;
        return month === 11 || month === 0 || month === 1;
      });
      return {
        season,
        averageRevenue: seasonBookings.length > 0 ? revenue / seasonBookings.length : 0,
        bookingCount: seasonBookings.length
      };
    });

    return {
      monthlyRevenue,
      revenueByProperty,
      seasonalTrends,
      pricingOptimization: [] // Would require market data
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
        status: 'checkout'
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
        where: { agentId, status: { in: ['checkout'] } },
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
        where: { status: { in: ['checkout'] } },
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
      where: { agentId, status: { in: ['checkout'] } },
      _avg: { commission: true }
    });

    const vipClients = await prisma.agentBooking.groupBy({
      by: ['clientId'],
      where: {
        agentId,
        status: 'checkout'
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
        agentId: agentId
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

    // Apply 14% markup for guest view
    return properties.map((p: any) => this.transformToPropertySummaryForGuest(p));
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

    // Apply 14% markup for guest view
    return properties.map((p: any) => this.transformToPropertySummaryForGuest(p));
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

    // Query properties where agentId matches
    // This ensures agents only see properties they uploaded/manage, not all properties from hosts they work with
    const whereClause: any = {
      agentId: agentId
    };

    if (filters.clientId) {
      // Filter by specific host (client)
      whereClause.hostId = filters.clientId;
    }
    if (filters.status) {
      whereClause.status = filters.status;
    }
    if (filters.search) {
      if (!whereClause.AND) {
        whereClause.AND = [];
      }
      whereClause.AND.push({
        OR: [
          { name: { contains: filters.search } },
          { location: { contains: filters.search } }
        ]
      });
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
              status: { in: ['confirmed', 'checkedin', 'checkout'] }
            }
          }),
          prisma.booking.aggregate({
            where: {
              propertyId: property.id,
              createdAt: { gte: startDate },
              status: 'checkout'
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

    // Get properties uploaded by this agent
    const agentProperties = await prisma.property.findMany({
      where: { agentId },
      select: { id: true }
    });

    const agentPropertyIds = agentProperties.map(p => p.id);

    // Build where clause for bookings
    const bookingWhereClause: any = {
      propertyId: { in: agentPropertyIds }
    };

    if (filters.status) {
      bookingWhereClause.status = filters.status;
    }

    if (filters.dateRange) {
      bookingWhereClause.createdAt = {
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

    // Get bookings for agent's properties
    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where: bookingWhereClause,
        include: {
          property: { select: { name: true, hostId: true } },
          guest: { select: { firstName: true, lastName: true } }
        },
        orderBy,
        skip,
        take: limit
      }),
      prisma.booking.count({ where: bookingWhereClause })
    ]);

    // Enrich with agent commission data if available
    const enrichedBookings = await Promise.all(
      bookings.map(async (booking) => {
        const agentBooking = await prisma.agentBooking.findFirst({
          where: {
            bookingId: booking.id,
            agentId
          },
          include: {
            client: { select: { firstName: true, lastName: true } }
          }
        });

        return {
          ...this.transformToBookingInfo(booking),
          agentCommission: agentBooking?.commission || 0,
          commissionStatus: agentBooking?.status || 'pending',
          clientName: agentBooking ? `${agentBooking.client.firstName} ${agentBooking.client.lastName}` : 'N/A'
        };
      })
    );

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
        status: { in: ['confirmed', 'checkedin', 'checkout'] },
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

    const [
      totalEarnings,
      totalBookings,
      periodEarnings,
      periodBookings,
      commissionBreakdown,
      // Multi-source earnings
      allCommissions,
      periodCommissions,
      paymentTransactions,
      periodPaymentTransactions,
      walletTransactions,
      periodWalletTransactions,
      bonuses,
      periodBonuses
    ] = await Promise.all([
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
      }),
      // AgentCommission table - all statuses
      prisma.agentCommission.findMany({
        where: { agentId },
        select: { amount: true, status: true }
      }),
      // Period commissions
      prisma.agentCommission.findMany({
        where: {
          agentId,
          createdAt: { gte: startDate }
        },
        select: { amount: true, status: true }
      }),
      // Payment transactions (payouts)
      prisma.paymentTransaction.findMany({
        where: {
          userId: agentId,
          type: 'payout',
          status: 'completed'
        },
        select: { netAmount: true, amount: true }
      }),
      // Period payment transactions
      prisma.paymentTransaction.findMany({
        where: {
          userId: agentId,
          type: 'payout',
          status: 'completed',
          createdAt: { gte: startDate }
        },
        select: { netAmount: true, amount: true }
      }),
      // Wallet transactions
      prisma.walletTransaction.findMany({
        where: {
          wallet: { userId: agentId },
          type: 'credit',
          OR: [
            { description: { contains: 'commission', mode: 'insensitive' } },
            { description: { contains: 'earning', mode: 'insensitive' } }
          ]
        },
        select: { amount: true }
      }),
      // Period wallet transactions
      prisma.walletTransaction.findMany({
        where: {
          wallet: { userId: agentId },
          type: 'credit',
          createdAt: { gte: startDate },
          OR: [
            { description: { contains: 'commission', mode: 'insensitive' } },
            { description: { contains: 'earning', mode: 'insensitive' } }
          ]
        },
        select: { amount: true }
      }),
      // Bonuses
      prisma.bonus.findMany({
        where: { userId: agentId },
        select: { amount: true }
      }),
      // Period bonuses
      prisma.bonus.findMany({
        where: {
          userId: agentId,
          createdAt: { gte: startDate }
        },
        select: { amount: true }
      })
    ]);

    // Calculate total earnings from multiple sources
    const earningsFromAgentBooking = Number(totalEarnings._sum.commission || 0);
    const earningsFromCommissions = allCommissions
      .filter(c => c.status === 'earned' || c.status === 'paid')
      .reduce((sum, c) => sum + Number(c.amount), 0);
    const earningsFromPayouts = paymentTransactions.reduce((sum, t) => sum + Number(t.netAmount || t.amount), 0);
    const earningsFromWallet = walletTransactions.reduce((sum, t) => sum + Number(t.amount), 0);
    const earningsFromBonuses = bonuses.reduce((sum, b) => sum + Number(b.amount), 0);
    const totalEarningsAmount = Math.max(earningsFromAgentBooking, earningsFromCommissions, earningsFromPayouts, earningsFromWallet) + earningsFromBonuses;

    // Calculate period earnings from multiple sources
    const periodFromAgentBooking = Number(periodEarnings._sum.commission || 0);
    const periodFromCommissions = periodCommissions
      .filter(c => c.status === 'earned' || c.status === 'paid')
      .reduce((sum, c) => sum + Number(c.amount), 0);
    const periodFromPayouts = periodPaymentTransactions.reduce((sum, t) => sum + Number(t.netAmount || t.amount), 0);
    const periodFromWallet = periodWalletTransactions.reduce((sum, t) => sum + Number(t.amount), 0);
    const periodFromBonuses = periodBonuses.reduce((sum, b) => sum + Number(b.amount), 0);
    const periodEarningsAmount = Math.max(periodFromAgentBooking, periodFromCommissions, periodFromPayouts, periodFromWallet) + periodFromBonuses;

    return {
      totalEarnings: totalEarningsAmount,
      totalBookings,
      periodEarnings: periodEarningsAmount,
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
          where: { status: { in: ['checkout'] } },
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

  async establishClientRelationship(agentId: number, clientId: number, bookingType: string = 'general'): Promise<any> {
    console.log('🔗 Establishing relationship - AgentID:', agentId, 'ClientID:', clientId);

    // Prevent self-relationship
    if (agentId === clientId) {
      throw new Error('Agent cannot establish relationship with themselves. Please provide a different client ID.');
    }

    // Verify client exists and is a host
    const client = await prisma.user.findUnique({
      where: { id: clientId },
      select: { id: true, email: true, userType: true, firstName: true, lastName: true }
    });

    console.log('👤 Client found:', client);

    if (!client) {
      throw new Error('Client not found.');
    }

    // Verify client is a host (can own properties)
    if (client.userType !== 'host' && client.userType !== 'admin') {
      throw new Error(`User with ID ${clientId} is not a host. Only hosts can have properties managed by agents. User type: ${client.userType}`);
    }

    // Check if relationship already exists
    const existingRelationship = await prisma.agentBooking.findFirst({
      where: {
        agentId,
        clientId,
        status: 'active'
      }
    });

    console.log('🔍 Existing relationship:', existingRelationship);

    if (existingRelationship) {
      throw new Error('Relationship with this client already exists.');
    }

    // Get commission rate from config (default agent split)
    const commissionRate = await this.getAgentCommissionRateFromConfig();
    console.log('💰 Commission rate from config:', commissionRate);

    // Create agent-client relationship
    const relationship = await prisma.agentBooking.create({
      data: {
        agentId,
        clientId,
        bookingType: bookingType,
        bookingId: `relationship-${Date.now()}`,
        commission: 0,
        commissionRate,
        status: 'active',
        notes: `Agent-client relationship established for ${bookingType} management`
      }
    });

    console.log('✅ Relationship created:', relationship);

    return {
      id: relationship.id,
      agentId: relationship.agentId,
      clientId: relationship.clientId,
      clientName: `${client.firstName} ${client.lastName}`,
      clientEmail: client.email,
      clientType: client.userType,
      commissionRate: relationship.commissionRate,
      status: relationship.status,
      createdAt: relationship.createdAt
    };
  }

  async fixAgentPropertiesAgentId(agentId: number): Promise<any> {
    // Get all client relationships for this agent
    const relationships = await prisma.agentBooking.findMany({
      where: { agentId, status: 'active' },
      select: { clientId: true }
    });

    const clientIds = [...new Set(relationships.map(r => r.clientId))];

    // Find properties where hostId is in clientIds but agentId is null
    const propertiesToFix = await prisma.property.findMany({
      where: {
        hostId: { in: clientIds },
        agentId: null
      },
      select: { id: true, name: true, hostId: true }
    });

    // Update all these properties
    const updated = await prisma.property.updateMany({
      where: {
        hostId: { in: clientIds },
        agentId: null
      },
      data: { agentId }
    });

    return {
      propertiesFixed: updated.count,
      properties: propertiesToFix
    };
  }

  async getAgentClients(agentId: number): Promise<any[]> {
    const relationships = await prisma.agentBooking.findMany({
      where: {
        agentId,
      },
      include: {
        client: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            userType: true,
            phone: true,
            profileImage: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return relationships.map(rel => ({
      relationshipId: rel.id,
      clientId: rel.clientId,
      clientName: `${rel.client.firstName} ${rel.client.lastName}`,
      clientEmail: rel.client.email,
      clientPhone: rel.client.phone,
      clientType: rel.client.userType,
      profileImage: rel.client.profileImage,
      commissionRate: rel.commissionRate,
      bookingType: rel.bookingType,
      establishedAt: rel.createdAt
    }));
  }

  async createClientProperty(agentId: number, clientId: number, data: CreatePropertyDto): Promise<PropertyInfo> {
    console.log('🔍 Checking access - AgentID:', agentId, 'ClientID:', clientId);

    // Verify client exists and is a host
    const client = await prisma.user.findUnique({
      where: { id: clientId },
      select: { id: true, email: true, userType: true, firstName: true, lastName: true }
    });

    if (!client) {
      throw new Error('Client not found.');
    }

    // Verify client is a host (can own properties)
    if (client.userType !== 'host' && client.userType !== 'admin') {
      throw new Error(`User with ID ${clientId} is not a host. Only hosts can have properties managed by agents. User type: ${client.userType}`);
    }

    // Check if relationship exists
    let hasAccess = await this.verifyAgentClientAccess(agentId, clientId);
    console.log('✅ Access result:', hasAccess);

    // If no relationship exists, create it automatically
    if (!hasAccess) {
      console.log('🔗 No relationship found. Creating one automatically...');

      const commissionRate = await this.getAgentCommissionRateFromConfig();

      await prisma.agentBooking.create({
        data: {
          agentId,
          clientId,
          bookingType: 'property',
          bookingId: `auto-relationship-${Date.now()}`,
          commission: 0,
          commissionRate,
          status: 'active',
          notes: `Agent-client relationship auto-created for property management`
        }
      });

      console.log('✅ Relationship created automatically');
      hasAccess = true;
    }

    // Create the property (hostId will be clientId)
    const property = await this.createProperty(clientId, data);

    // Update property to set agentId
    await prisma.property.update({
      where: { id: property.id },
      data: { agentId: agentId }
    });

    console.log(`✅ Property ${property.id} created with hostId=${clientId} and agentId=${agentId}`);

    // Create property-specific booking record
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

    // Return property info
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

  // DISABLED: Agents can no longer own properties
  async createAgentOwnProperty(agentId: number, data: CreatePropertyDto): Promise<PropertyInfo> {
    throw new Error('Agents cannot own properties. Use createClientProperty to create properties for your clients.');
  }

  // DISABLED: Agents can no longer own properties
  async getAgentOwnProperties(agentId: number, filters?: Partial<PropertySearchFilters>) {
    // Return empty array - agents cannot own properties
    return [];
  }

  // DISABLED: Agents can no longer own properties
  async getAgentOwnPropertyBookings(agentId: number, propertyId: number) {
    throw new Error('Agents cannot own properties. Access client property bookings through agent property management routes.');
  }

  // DISABLED: Agents can no longer own properties
  async getAgentOwnPropertyGuests(agentId: number, propertyId?: number) {
    throw new Error('Agents cannot own properties. Access client guests through agent property management routes.');
  }

  async getAllAgentProperties(agentId: number, filters?: any) {
    // DISABLED: Agents can no longer own properties
    // Only return managed client properties
    const clientProperties = await this.getAgentProperties(agentId, filters);

    const enrichedClientProperties = clientProperties.properties?.map(p => ({
      ...p,
      relationshipType: 'managed' as const,
      fullRevenue: false
    })) || [];

    return {
      ownProperties: [], // Always empty - agents cannot own properties
      managedProperties: enrichedClientProperties,
      totalOwned: 0, // Always 0
      totalManaged: enrichedClientProperties.length,
      totalProperties: enrichedClientProperties.length // Only managed properties
    };
  }

  // --- PRIVATE HELPER METHODS ---
  private async verifyAgentPropertyAccess(agentId: number, propertyId: number): Promise<boolean> {
    // Check if the property was uploaded/managed by this agent
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { agentId: true }
    });

    // Agent has access only if they uploaded/manage this property
    return property?.agentId === agentId;
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

  // DISABLED: Agents can no longer own properties
  private async getAgentOwnPropertyIds(agentId: number): Promise<number[]> {
    // Return empty array - agents cannot own properties
    return [];
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

    return 4.38; // Default commission rate
  }

  private async getAgentCommissionRateFromConfig(): Promise<number> {
    // Get agent commission from config defaultSplitRules
    return config.defaultSplitRules.agent || 4.38;
  }

  private calculateBookingCommission(bookingValue: number, agentId: number): number {
    const commissionRate = 4.38;
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

  // --- TRANSACTION MONITORING METHODS (delegated to enhanced service) ---
  async getAgentDashboardWithTransactions(agentId: number) {
    return await this.enhancedService.getAgentDashboardWithTransactions(agentId);
  }

  async getAgentEarningsWithTransactions(agentId: number, timeRange: 'week' | 'month' | 'quarter' | 'year') {
    return await this.enhancedService.getAgentEarningsWithTransactions(agentId, timeRange);
  }

  async getTransactionMonitoringDashboard(agentId: number) {
    return await this.enhancedService.getTransactionMonitoringDashboard(agentId);
  }

  async getAgentPaymentTransactions(agentId: number) {
    return await this.enhancedService.getAgentPaymentTransactions(agentId);
  }

  async getAgentTransactionSummary(agentId: number) {
    return await this.enhancedService.getAgentTransactionSummary(agentId);
  }

  async getAgentMonthlyCommissionsWithTransactions(agentId: number) {
    return await this.enhancedService.getAgentMonthlyCommissionsWithTransactions(agentId);
  }
}