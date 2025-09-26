//src/services/admin.service.ts

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { 
  AdminDashboardOverview, 
  AdminUserFilters, 
  AdminUserListItem, 
  AdminUserDetails,
  AdminPropertyFilters,
  AdminPropertyListItem,
  AdminPropertyDetails,
  AdminTourFilters,
  AdminTourListItem,
  AdminTourDetails,
  AdminBookingFilters,
  AdminBookingListItem,
  AdminBookingDetails,
  AdminPaymentTransaction,
  AdminEscrowTransaction,
  AdminWithdrawalRequest,
  AdminSystemAnalytics,
  AdminFinancialReport,
  AdminBulkOperation,
  AdminBulkUpdateRequest,
  AdminBulkDeleteRequest,
  AdminExportRequest,
  AdminSystemSettings,
  AdminPaginatedResponse,
  AdminQueryParams,
  AdminAlert,
  AdminActivity
} from '../types/admin.types';
import { late } from 'zod/v3';

const prisma = new PrismaClient();

export class AdminService {

  // === DASHBOARD & OVERVIEW ===

  async getDashboardOverview(period: string = '30d'): Promise<AdminDashboardOverview> {
    const { startDate, endDate } = this.getPeriodDates(period);
    
    // Get current metrics
    const [
      totalUsers,
      activeUsers,
      newUsers,
      totalProperties,
      activeProperties,
      pendingProperties,
      totalTours,
      activeTours,
      pendingTours,
      totalBookings,
      confirmedBookings,
      cancelledBookings,
      revenueData,
      escrowData,
      disputes,
      previousPeriodMetrics
    ] = await Promise.all([
      this.getTotalUsers(),
      this.getActiveUsers(startDate),
      this.getNewUsers(startDate, endDate),
      this.getTotalProperties(),
      this.getActiveProperties(),
      this.getPendingProperties(),
      this.getTotalTours(),
      this.getActiveTours(),
      this.getPendingTours(),
      this.getTotalBookings(startDate, endDate),
      this.getConfirmedBookings(startDate, endDate),
      this.getCancelledBookings(startDate, endDate),
      this.getRevenueData(startDate, endDate),
      this.getEscrowData(),
      this.getOpenDisputes(),
      this.getPreviousPeriodMetrics(period)
    ]);

    const alerts = await this.generateSystemAlerts();
    const recentActivity = await this.getRecentActivity(20);
    
    return {
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        label: period
      },
      metrics: {
        totalUsers,
        activeUsers,
        newUsers,
        totalProperties,
        activeProperties,
        pendingProperties,
        totalTours,
        activeTours,
        pendingTours,
        totalBookings,
        confirmedBookings,
        cancelledBookings,
        totalRevenue: revenueData.total,
        platformFees: revenueData.fees,
        escrowHeld: escrowData.held,
        disputesOpen: disputes
      },
      growth: {
        userGrowth: this.calculateGrowth(newUsers, previousPeriodMetrics.users),
        propertyGrowth: this.calculateGrowth(activeProperties, previousPeriodMetrics.properties),
        tourGrowth: this.calculateGrowth(activeTours, previousPeriodMetrics.tours),
        revenueGrowth: this.calculateGrowth(revenueData.total, previousPeriodMetrics.revenue)
      },
      alerts,
      recentActivity
    };
  }

  // === USER MANAGEMENT ===

  async getUsers(filters: AdminUserFilters, pagination: AdminQueryParams): Promise<AdminPaginatedResponse<AdminUserListItem>> {
    const { page = 1, limit = 20, sort = 'createdAt', order = 'desc' } = pagination;
    const skip = (page - 1) * limit;

    const where = this.buildUserWhereClause(filters);
    
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          userType: true,
          status: true,
          verificationStatus: true,
          kycStatus: true,
          provider: true,
          country: true,
          lastLogin: true,
          createdAt: true,
          isVerified: true,
          profileImage: true,
          _count: {
            select: {
              bookingsAsGuest: true,
              properties: true,
              toursAsGuide: true
            }
          }
        },
        orderBy: { [sort]: order },
        skip,
        take: limit
      }),
      prisma.user.count({ where })
    ]);

    const transformedUsers: AdminUserListItem[] | any = users.map(user => ({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      userType: user.userType,
      status: user.status,
      verificationStatus: user.verificationStatus || 'unverified',
      kycStatus: user.kycStatus,
      provider: user.provider,
      country: user.country,
      totalBookings: user._count.bookingsAsGuest,
      totalProperties: user._count.properties,
      totalTours: user._count.toursAsGuide,
      lastLogin: user.lastLogin?.toISOString(),
      createdAt: user.createdAt.toISOString(),
      isVerified: user.isVerified,
      profileImage: user.profileImage
    }));

    return {
      data: transformedUsers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      },
      filters,
      sort: { field: sort, order }
    };
  }

  async getUserDetails(userId: number): Promise<AdminUserDetails> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        _count: {
          select: {
            bookingsAsGuest: true,
            properties: true,
            toursAsGuide: true
          }
        },
        sessions: {
          select: {
            id: true,
            sessionToken: true,
            device: true,
            browser: true,
            location: true,
            ipAddress: true,
            isActive: true,
            lastActivity: true,
            expiresAt: true,
            createdAt: true
          }
        },
        bankAccounts: true,
        mobileMoneyAccounts: true,
        wallet: true
      }
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Get user metrics
    const metrics = await this.getUserMetrics(userId);
    const recentActivity = await this.getUserRecentActivity(userId, 10);

    const userDetails: AdminUserDetails | any = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      userType: user.userType,
      status: user.status,
      verificationStatus: user.verificationStatus || 'unverified',
      kycStatus: user.kycStatus,
      provider: user.provider,
      country: user.country,
      totalBookings: user._count.bookingsAsGuest,
      totalProperties: user._count.properties,
      totalTours: user._count.toursAsGuide,
      lastLogin: user.lastLogin?.toISOString(),
      createdAt: user.createdAt.toISOString(),
      isVerified: user.isVerified,
      profileImage: user.profileImage,
      phone: user.phone,
      phoneCountryCode: user.phoneCountryCode,
      address: {
        street: user.street,
        city: user.city,
        state: user.state,
        province: user.province,
        country: user.country,
        zipCode: user.zipCode,
        postalCode: user.postalCode,
        postcode: user.postcode,
        pinCode: user.pinCode,
        eircode: user.eircode,
        cep: user.cep
      },
      profile: {
        bio: user.bio,
        experience: user.experience,
        languages: user.languages,
        specializations: user.specializations,
        rating: user.rating,
        totalSessions: user.totalSessions,
        averageRating: user.averageRating
      },
      business: {
        companyName: user.companyName,
        companyTIN: user.companyTIN,
        licenseNumber: user.licenseNumber,
        tourGuideType: user.tourGuideType,
        certifications: user.certifications
      },
      verification: {
        isVerified: user.isVerified,
        verificationDocument: user.verificationDocument,
        addressDocument: user.addressDocument,
        kycCompleted: user.kycCompleted,
        kycSubmittedAt: user.kycSubmittedAt?.toISOString(),
        twoFactorEnabled: user.twoFactorEnabled
      },
      metrics,
      recentActivity,
      sessions: user.sessions.map(session => ({
        id: session.id,
        sessionToken: session.sessionToken,
        device: session.device,
        browser: session.browser,
        location: session.location,
        ipAddress: session.ipAddress,
        isActive: session.isActive,
        lastActivity: session.lastActivity.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
        createdAt: session.createdAt.toISOString()
      }))
    };

    return userDetails;
  }

  async createUser(userData: any): Promise<AdminUserDetails> {
    const existingUser = await prisma.user.findUnique({
      where: { email: userData.email }
    });

    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    let hashedPassword = undefined;
    if (userData.password) {
      hashedPassword = await bcrypt.hash(userData.password, 12);
    }

    const user = await prisma.user.create({
      data: {
        email: userData.email,
        firstName: userData.firstName || '',
        lastName: userData.lastName || '',
        password: hashedPassword,
        userType: userData.userType || 'guest',
        status: userData.status || 'active',
        country: userData.country,
        phone: userData.phone,
        phoneCountryCode: userData.phoneCountryCode,
        provider: 'manual',
        verificationStatus: userData.verificationStatus || 'unverified',
        isVerified: userData.isVerified || false
      }
    });

    // Create wallet for user
    await prisma.wallet.create({
      data: {
        userId: user.id,
        balance: 0,
        currency: 'RWF'
      }
    });

    return this.getUserDetails(user.id);
  }

  async updateUser(userId: number, updateData: any): Promise<AdminUserDetails> {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('User not found');
    }

    let hashedPassword = undefined;
    if (updateData.password) {
      hashedPassword = await bcrypt.hash(updateData.password, 12);
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...updateData,
        ...(hashedPassword && { password: hashedPassword }),
        updatedAt: new Date()
      }
    });

    return this.getUserDetails(updatedUser.id);
  }

  async deleteUser(userId: number, permanent: boolean = false): Promise<{ success: boolean; message: string }> {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (permanent) {
      // Hard delete - use with caution
      await prisma.user.delete({
        where: { id: userId }
      });
      return { success: true, message: 'User permanently deleted' };
    } else {
      // Soft delete - deactivate account
      await prisma.user.update({
        where: { id: userId },
        data: {
          status: 'inactive',
          updatedAt: new Date()
        }
      });
      return { success: true, message: 'User deactivated' };
    }
  }

  async suspendUser(userId: number, reason: string): Promise<AdminUserDetails> {
    await prisma.user.update({
      where: { id: userId },
      data: {
        status: 'suspended',
        updatedAt: new Date()
      }
    });

    // Invalidate all user sessions
    await prisma.userSession.updateMany({
      where: { userId },
      data: { isActive: false }
    });

    return this.getUserDetails(userId);
  }

  async activateUser(userId: number): Promise<AdminUserDetails> {
    await prisma.user.update({
      where: { id: userId },
      data: {
        status: 'active',
        updatedAt: new Date()
      }
    });

    return this.getUserDetails(userId);
  }

  async approveKYC(userId: number, notes?: string): Promise<AdminUserDetails> {
    await prisma.user.update({
      where: { id: userId },
      data: {
        kycStatus: 'approved',
        kycCompleted: true,
        verificationStatus: 'verified',
        isVerified: true,
        updatedAt: new Date()
      }
    });

    return this.getUserDetails(userId);
  }

  async rejectKYC(userId: number, reason: string): Promise<AdminUserDetails> {
    await prisma.user.update({
      where: { id: userId },
      data: {
        kycStatus: 'rejected',
        kycCompleted: false,
        updatedAt: new Date()
      }
    });

    return this.getUserDetails(userId);
  }

  // === PROPERTY MANAGEMENT ===

  async getProperties(filters: AdminPropertyFilters, pagination: AdminQueryParams): Promise<AdminPaginatedResponse<AdminPropertyListItem>> {
    const { page = 1, limit = 20, sort = 'createdAt', order = 'desc' } = pagination;
    const skip = (page - 1) * limit;

    const where = this.buildPropertyWhereClause(filters);
    
    const [properties, total] = await Promise.all([
      prisma.property.findMany({
        where,
        select: {
          id: true,
          name: true,
          location: true,
          type: true,
          category: true,
          pricePerNight: true,
          status: true,
          isVerified: true,
          isInstantBook: true,
          hostId: true,
          totalBookings: true,
          averageRating: true,
          reviewsCount: true,
          views: true,
          createdAt: true,
          images: true,
          host: {
            select: {
              firstName: true,
              lastName: true,
              email: true
            }
          }
        },
        orderBy: { [sort]: order },
        skip,
        take: limit
      }),
      prisma.property.count({ where })
    ]);

    const transformedProperties: AdminPropertyListItem[] = properties.map(property => ({
      id: property.id,
      name: property.name,
      location: property.location,
      type: property.type,
      category: property.category,
      pricePerNight: property.pricePerNight,
      currency: 'RWF', // Default currency
      status: property.status,
      isVerified: property.isVerified,
      isInstantBook: property.isInstantBook,
      hostId: property.hostId,
      hostName: `${property.host.firstName} ${property.host.lastName}`,
      hostEmail: property.host.email,
      totalBookings: property.totalBookings,
      averageRating: property.averageRating,
      reviewsCount: property.reviewsCount,
      views: property.views,
      createdAt: property.createdAt.toISOString(),
      images: Array.isArray(property.images) ? property.images as string[] : []
    }));

    return {
      data: transformedProperties,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      },
      filters,
      sort: { field: sort, order }
    };
  }

  async getPropertyDetails(propertyId: number): Promise<AdminPropertyDetails> {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      include: {
        host: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        },
        bookings: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            guest: {
              select: {
                firstName: true,
                lastName: true,
                email: true
              }
            }
          }
        },
        reviews: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                email: true
              }
            }
          }
        },
        blockedDates: true,
        pricingRules: true
      }
    });

    if (!property) {
      throw new Error('Property not found');
    }

    const metrics = await this.getPropertyMetrics(propertyId);

    const propertyDetails: AdminPropertyDetails | any = {
      id: property.id,
      name: property.name,
      location: property.location,
      type: property.type,
      category: property.category,
      pricePerNight: property.pricePerNight,
      currency: 'RWF',
      status: property.status,
      isVerified: property.isVerified,
      isInstantBook: property.isInstantBook,
      hostId: property.hostId,
      hostName: `${property.host.firstName} ${property.host.lastName}`,
      hostEmail: property.host.email,
      totalBookings: property.totalBookings,
      averageRating: property.averageRating,
      reviewsCount: property.reviewsCount,
      views: property.views,
      createdAt: property.createdAt.toISOString(),
      images: Array.isArray(property.images) ? property.images as string[] : [],
      description: property.description,
      beds: property.beds,
      baths: property.baths,
      maxGuests: property.maxGuests,
      features: property.features,
      video3D: property.video3D,
      availableFrom: property.availableFrom?.toISOString(),
      availableTo: property.availableTo?.toISOString(),
      minStay: property.minStay,
      maxStay: property.maxStay,
      propertyAddress: property.propertyAddress,
      ownerDetails: property.ownerDetails,
      metrics,
      recentBookings: property.bookings.map(booking => this.transformToAdminBookingListItem(booking, 'property')),
      reviews: property.reviews.map(review => ({
        id: review.id,
        type: 'property' as const,
        resourceId: review.propertyId,
        resourceName: property.name,
        userId: review.userId,
        userName: `${review.user.firstName} ${review.user.lastName}`,
        userEmail: review.user.email,
        rating: review.rating,
        comment: review.comment,
        isVisible: review.isVisible,
        isReported: review.isReported,
        response: review.response,
        responseDate: review.responseDate?.toISOString(),
        createdAt: review.createdAt.toISOString(),
        images: Array.isArray(review.images) ? review.images as string[] : []
      })),
      blockedDates: property.blockedDates.map(date => ({
        id: date.id,
        startDate: date.startDate.toISOString(),
        endDate: date.endDate.toISOString(),
        reason: date.reason,
        isActive: date.isActive,
        createdAt: date.createdAt.toISOString()
      })),
      pricingRules: property.pricingRules.map(rule => ({
        id: rule.id,
        name: rule.name,
        type: rule.type,
        startDate: rule.startDate.toISOString(),
        endDate: rule.endDate.toISOString(),
        priceModifier: rule.priceModifier,
        modifierType: rule.modifierType,
        minStay: rule.minStay,
        maxStay: rule.maxStay,
        isActive: rule.isActive,
        createdAt: rule.createdAt.toISOString()
      }))
    };

    return propertyDetails;
  }

  async approveProperty(propertyId: number, notes?: string): Promise<AdminPropertyDetails> {
    await prisma.property.update({
      where: { id: propertyId },
      data: {
        status: 'active',
        isVerified: true,
        updatedAt: new Date()
      }
    });

    return this.getPropertyDetails(propertyId);
  }

  async rejectProperty(propertyId: number, reason: string): Promise<AdminPropertyDetails> {
    await prisma.property.update({
      where: { id: propertyId },
      data: {
        status: 'rejected',
        isVerified: false,
        updatedAt: new Date()
      }
    });

    return this.getPropertyDetails(propertyId);
  }

  async suspendProperty(propertyId: number, reason: string): Promise<AdminPropertyDetails> {
    await prisma.property.update({
      where: { id: propertyId },
      data: {
        status: 'suspended',
        updatedAt: new Date()
      }
    });

    return this.getPropertyDetails(propertyId);
  }

  // === TOUR MANAGEMENT ===

  async getTours(filters: AdminTourFilters, pagination: AdminQueryParams): Promise<AdminPaginatedResponse<AdminTourListItem>> {
    const { page = 1, limit = 20, sort = 'createdAt', order = 'desc' } = pagination;
    const skip = (page - 1) * limit;

    const where = this.buildTourWhereClause(filters);
    
    const [tours, total] = await Promise.all([
      prisma.tour.findMany({
        where,
        select: {
          id: true,
          title: true,
          shortDescription: true,
          category: true,
          type: true,
          duration: true,
          price: true,
          currency: true,
          difficulty: true,
          tourGuideId: true,
          locationCity: true,
          locationCountry: true,
          isActive: true,
          rating: true,
          totalReviews: true,
          totalBookings: true,
          views: true,
          createdAt: true,
          images: true,
          tourGuide: {
            select: {
              firstName: true,
              lastName: true,
              email: true
            }
          }
        },
        orderBy: { [sort]: order },
        skip,
        take: limit
      }),
      prisma.tour.count({ where })
    ]);

    const transformedTours: AdminTourListItem[] = tours.map(tour => ({
      id: tour.id,
      title: tour.title,
      shortDescription: tour.shortDescription,
      category: tour.category,
      type: tour.type,
      duration: tour.duration,
      price: tour.price,
      currency: tour.currency,
      difficulty: tour.difficulty,
      tourGuideId: tour.tourGuideId,
      tourGuideName: `${tour.tourGuide.firstName} ${tour.tourGuide.lastName}`,
      tourGuideEmail: tour.tourGuide.email,
      locationCity: tour.locationCity,
      locationCountry: tour.locationCountry,
      isActive: tour.isActive,
      rating: tour.rating,
      totalReviews: tour.totalReviews,
      totalBookings: tour.totalBookings,
      views: tour.views,
      createdAt: tour.createdAt.toISOString(),
      images: Array.isArray(tour.images) ? tour.images as string[] : []
    }));

    return {
      data: transformedTours,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      },
      filters,
      sort: { field: sort, order }
    };
  }

  async getTourDetails(tourId: string): Promise<AdminTourDetails> {
    const tour = await prisma.tour.findUnique({
      where: { id: tourId },
      include: {
        tourGuide: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        },
        bookings: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                email: true
              }
            }
          }
        },
        reviews: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                email: true
              }
            }
          }
        },
        schedules: {
          orderBy: { startDate: 'asc' }
        }
      }
    });

    if (!tour) {
      throw new Error('Tour not found');
    }

    const metrics = await this.getTourMetrics(tourId);

    const tourDetails: AdminTourDetails | any = {
      id: tour.id,
      title: tour.title,
      shortDescription: tour.shortDescription,
      description: tour.description,
      category: tour.category,
      type: tour.type,
      duration: tour.duration,
      price: tour.price,
      currency: tour.currency,
      difficulty: tour.difficulty,
      tourGuideId: tour.tourGuideId,
      tourGuideName: `${tour.tourGuide.firstName} ${tour.tourGuide.lastName}`,
      tourGuideEmail: tour.tourGuide.email,
      locationCity: tour.locationCity,
      locationCountry: tour.locationCountry,
      locationAddress: tour.locationAddress,
      latitude: tour.latitude,
      longitude: tour.longitude,
      meetingPoint: tour.meetingPoint,
      maxGroupSize: tour.maxGroupSize,
      minGroupSize: tour.minGroupSize,
      isActive: tour.isActive,
      rating: tour.rating,
      totalReviews: tour.totalReviews,
      totalBookings: tour.totalBookings,
      views: tour.views,
      createdAt: tour.createdAt.toISOString(),
      updatedAt: tour.updatedAt.toISOString(),
      images: Array.isArray(tour.images) ? tour.images as string[] : [],
      itinerary: tour.itinerary,
      inclusions: tour.inclusions,
      exclusions: tour.exclusions,
      requirements: tour.requirements,
      tags: tour.tags,
      metrics,
      recentBookings: tour.bookings.map(booking => this.transformToAdminBookingListItem(booking, 'tour')),
      reviews: tour.reviews.map(review => ({
        id: review.id,
        type: 'tour' as const,
        resourceId: review.tourId,
        resourceName: tour.title,
        userId: review.userId,
        userName: `${review.user.firstName} ${review.user.lastName}`,
        userEmail: review.user.email,
        rating: review.rating,
        comment: review.comment,
        isVisible: review.isVisible,
        isReported: review.isReported,
        response: review.response,
        responseDate: review.responseDate?.toISOString(),
        createdAt: review.createdAt.toISOString(),
        images: Array.isArray(review.images) ? review.images as string[] : []
      })),
      schedules: tour.schedules.map(schedule => ({
        id: schedule.id,
        startDate: schedule.startDate.toISOString(),
        endDate: schedule.endDate.toISOString(),
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        availableSlots: schedule.availableSlots,
        bookedSlots: schedule.bookedSlots,
        isAvailable: schedule.isAvailable,
        price: schedule.price,
        specialNotes: schedule.specialNotes,
        createdAt: schedule.createdAt.toISOString()
      }))
    };

    return tourDetails;
  }

  async approveTour(tourId: string, notes?: string): Promise<AdminTourDetails> {
    await prisma.tour.update({
      where: { id: tourId },
      data: {
        isActive: true,
        updatedAt: new Date()
      }
    });

    return this.getTourDetails(tourId);
  }

  async suspendTour(tourId: string, reason: string): Promise<AdminTourDetails> {
    await prisma.tour.update({
      where: { id: tourId },
      data: {
        isActive: false,
        updatedAt: new Date()
      }
    });

    return this.getTourDetails(tourId);
  }

  // === BOOKING MANAGEMENT ===

  async getBookings(filters: AdminBookingFilters, pagination: AdminQueryParams): Promise<AdminPaginatedResponse<AdminBookingListItem>> {
    const { page = 1, limit = 20, sort = 'createdAt', order = 'desc' } = pagination;
    const skip = (page - 1) * limit;

    const propertyWhere = this.buildBookingWhereClause(filters, 'property');
    const tourWhere = this.buildBookingWhereClause(filters, 'tour');

    const [propertyBookings, tourBookings, propertyTotal, tourTotal] = await Promise.all([
      prisma.booking.findMany({
        where: propertyWhere,
        include: {
          guest: {
            select: {
              firstName: true,
              lastName: true,
              email: true
            }
          },
          property: {
            select: {
              name: true,
              host: {
                select: {
                  firstName: true,
                  lastName: true,
                  email: true
                }
              }
            }
          }
        },
        orderBy: { [sort]: order },
        skip: Math.floor(skip / 2),
        take: Math.ceil(limit / 2)
      }),
      prisma.tourBooking.findMany({
        where: tourWhere,
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true
            }
          },
          tour: {
            select: {
              title: true,
              tourGuide: {
                select: {
                  firstName: true,
                  lastName: true,
                  email: true
                }
              }
            }
          }
        },
        orderBy: { [sort]: order },
        skip: Math.floor(skip / 2),
        take: Math.ceil(limit / 2)
      }),
      prisma.booking.count({ where: propertyWhere }),
      prisma.tourBooking.count({ where: tourWhere })
    ]);

    const allBookings: AdminBookingListItem[] = [
      ...propertyBookings.map(booking => this.transformToAdminBookingListItem(booking, 'property')),
      ...tourBookings.map(booking => this.transformToAdminBookingListItem(booking, 'tour'))
    ];

    // Sort combined results
    allBookings.sort((a, b) => {
      const aDate = new Date(a.createdAt).getTime();
      const bDate = new Date(b.createdAt).getTime();
      return order === 'desc' ? bDate - aDate : aDate - bDate;
    });

    const total = propertyTotal + tourTotal;

    return {
      data: allBookings.slice(0, limit),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      },
      filters,
      sort: { field: sort, order }
    };
  }

  async getBookingDetails(bookingId: string, type: 'property' | 'tour'): Promise<AdminBookingDetails> {
    if (type === 'property') {
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        include: {
          guest: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              country: true
            }
          },
          property: {
            include: {
              host: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true
                }
              }
            }
          },
          reviews: {
            include: {
              user: {
                select: {
                  firstName: true,
                  lastName: true
                }
              }
            }
          }
        }
      });

      if (!booking) {
        throw new Error('Booking not found');
      }

      return this.transformToAdminBookingDetails(booking, 'property');
    } else {
      const booking = await prisma.tourBooking.findUnique({
        where: { id: bookingId },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              country: true
            }
          },
          tour: {
            include: {
              tourGuide: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true
                }
              }
            }
          },
          schedule: true,
          reviews: {
            include: {
              user: {
                select: {
                  firstName: true,
                  lastName: true
                }
              }
            }
          }
        }
      });

      if (!booking) {
        throw new Error('Booking not found');
      }

      return this.transformToAdminBookingDetails(booking, 'tour');
    }
  }

  async cancelBooking(bookingId: string, type: 'property' | 'tour', reason: string, refundAmount?: number): Promise<AdminBookingDetails> {
    if (type === 'property') {
      await prisma.booking.update({
        where: { id: bookingId },
        data: {
          status: 'cancelled',
          cancellationReason: reason,
          cancelledAt: new Date(),
          updatedAt: new Date()
        }
      });
    } else {
      await prisma.tourBooking.update({
        where: { id: bookingId },
        data: {
          status: 'cancelled',
          refundAmount,
          refundReason: reason,
          updatedAt: new Date()
        }
      });
    }

    return this.getBookingDetails(bookingId, type);
  }

  // === REVIEW MANAGEMENT ===

  async getReviews(filters: any, pagination: AdminQueryParams): Promise<AdminPaginatedResponse<any>> {
    const { page = 1, limit = 20, sort = 'createdAt', order = 'desc' } = pagination;
    const skip = (page - 1) * limit;

    const propertyWhere = this.buildReviewWhereClause(filters, 'property');
    const tourWhere = this.buildReviewWhereClause(filters, 'tour');

    const [propertyReviews, tourReviews, propertyTotal, tourTotal] = await Promise.all([
      prisma.review.findMany({
        where: propertyWhere,
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true
            }
          },
          property: {
            select: {
              name: true
            }
          }
        },
        orderBy: { [sort]: order },
        skip: Math.floor(skip / 2),
        take: Math.ceil(limit / 2)
      }),
      prisma.tourReview.findMany({
        where: tourWhere,
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true
            }
          },
          tour: {
            select: {
              title: true
            }
          }
        },
        orderBy: { [sort]: order },
        skip: Math.floor(skip / 2),
        take: Math.ceil(limit / 2)
      }),
      prisma.review.count({ where: propertyWhere }),
      prisma.tourReview.count({ where: tourWhere })
    ]);

    const allReviews = [
      ...propertyReviews.map(review => ({
        id: review.id,
        type: 'property' as const,
        resourceId: review.propertyId,
        resourceName: review.property.name,
        userId: review.userId,
        userName: `${review.user.firstName} ${review.user.lastName}`,
        userEmail: review.user.email,
        rating: review.rating,
        comment: review.comment,
        isVisible: review.isVisible,
        isReported: review.isReported,
        response: review.response,
        responseDate: review.responseDate?.toISOString(),
        createdAt: review.createdAt.toISOString(),
        images: Array.isArray(review.images) ? review.images as string[] : []
      })),
      ...tourReviews.map(review => ({
        id: review.id,
        type: 'tour' as const,
        resourceId: review.tourId,
        resourceName: review.tour.title,
        userId: review.userId,
        userName: `${review.user.firstName} ${review.user.lastName}`,
        userEmail: review.user.email,
        rating: review.rating,
        comment: review.comment,
        isVisible: review.isVisible,
        isReported: review.isReported,
        response: review.response,
        responseDate: review.responseDate?.toISOString(),
        createdAt: review.createdAt.toISOString(),
        images: Array.isArray(review.images) ? review.images as string[] : []
      }))
    ];

    const total = propertyTotal + tourTotal;

    return {
      data: allReviews.slice(0, limit),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      },
      filters,
      sort: { field: sort, order }
    };
  }

  async moderateReview(reviewId: string, type: 'property' | 'tour', action: 'approve' | 'hide' | 'delete', reason?: string): Promise<{ success: boolean; message: string }> {
    const updateData: any = {
      updatedAt: new Date()
    };

    switch (action) {
      case 'approve':
        updateData.isVisible = true;
        updateData.isReported = false;
        break;
      case 'hide':
        updateData.isVisible = false;
        break;
      case 'delete':
        // Handle delete case separately
        break;
    }

    if (action === 'delete') {
      if (type === 'property') {
        await prisma.review.delete({
          where: { id: reviewId }
        });
      } else {
        await prisma.tourReview.delete({
          where: { id: reviewId }
        });
      }
      return { success: true, message: 'Review deleted successfully' };
    } else {
      if (type === 'property') {
        await prisma.review.update({
          where: { id: reviewId },
          data: updateData
        });
      } else {
        await prisma.tourReview.update({
          where: { id: reviewId },
          data: updateData
        });
      }
      return { success: true, message: `Review ${action}d successfully` };
    }
  }

  // === PAYMENT & TRANSACTION MANAGEMENT ===

  async getPaymentTransactions(filters: any, pagination: AdminQueryParams): Promise<AdminPaginatedResponse<AdminPaymentTransaction>> {
    const { page = 1, limit = 20, sort = 'createdAt', order = 'desc' } = pagination;
    const skip = (page - 1) * limit;

    const where = this.buildPaymentWhereClause(filters);
    
    const [transactions, total] = await Promise.all([
      prisma.paymentTransaction.findMany({
        where,
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true
            }
          }
        },
        orderBy: { [sort]: order },
        skip,
        take: limit
      }),
      prisma.paymentTransaction.count({ where })
    ]);

    const transformedTransactions: AdminPaymentTransaction[] | any = transactions.map(transaction => ({
      id: transaction.id,
      userId: transaction.userId,
      userName: `${transaction.user.firstName} ${transaction.user.lastName}`,
      userEmail: transaction.user.email,
      type: transaction.type,
      method: transaction.method,
      amount: transaction.amount,
      currency: transaction.currency,
      status: transaction.status,
      reference: transaction.reference,
      externalId: transaction.externalId,
      description: transaction.description,
      charges: transaction.charges,
      netAmount: transaction.netAmount,
      sourceAccount: transaction.sourceAccount,
      destinationAccount: transaction.destinationAccount,
      failureReason: transaction.failureReason,
      createdAt: transaction.createdAt.toISOString(),
      completedAt: transaction.completedAt?.toISOString(),
      escrowStatus: transaction.escrowStatus,
      isEscrowBased: transaction.isEscrowBased
    }));

    return {
      data: transformedTransactions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      },
      filters,
      sort: { field: sort, order }
    };
  }

  async getEscrowTransactions(filters: any, pagination: AdminQueryParams): Promise<AdminPaginatedResponse<AdminEscrowTransaction>> {
    const { page = 1, limit = 20, sort = 'createdAt', order = 'desc' } = pagination;
    const skip = (page - 1) * limit;

    const where = this.buildEscrowWhereClause(filters);
    
    const [transactions, total] = await Promise.all([
      prisma.escrowTransaction.findMany({
        where,
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true
            }
          },
          recipient: {
            select: {
              firstName: true,
              lastName: true,
              email: true
            }
          }
        },
        orderBy: { [sort]: order },
        skip,
        take: limit
      }),
      prisma.escrowTransaction.count({ where })
    ]);

    const transformedTransactions: AdminEscrowTransaction[] | any = transactions.map(transaction => ({
      id: transaction.id,
      userId: transaction.userId,
      userName: `${transaction.user.firstName} ${transaction.user.lastName}`,
      userEmail: transaction.user.email,
      recipientId: transaction.recipientId,
      recipientName: transaction.recipient ? `${transaction.recipient.firstName} ${transaction.recipient.lastName}` : undefined,
      recipientEmail: transaction.recipient?.email,
      type: transaction.type,
      amount: transaction.amount,
      currency: transaction.currency,
      status: transaction.status,
      reference: transaction.reference,
      description: transaction.description,
      escrowId: transaction.escrowId,
      fundedAt: transaction.fundedAt?.toISOString(),
      releasedAt: transaction.releasedAt?.toISOString(),
      releasedBy: transaction.releasedBy,
      releaseReason: transaction.releaseReason,
      disputedAt: transaction.disputedAt?.toISOString(),
      disputedBy: transaction.disputedBy,
      disputeReason: transaction.disputeReason,
      resolvedAt: transaction.resolvedAt?.toISOString(),
      cancelledAt: transaction.cancelledAt?.toISOString(),
      cancellationReason: transaction.cancellationReason,
      createdAt: transaction.createdAt.toISOString(),
      metadata: transaction.metadata
    }));

    return {
      data: transformedTransactions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      },
      filters,
      sort: { field: sort, order }
    };
  }

  async releaseEscrow(transactionId: string, releaseReason: string, adminId: number): Promise<AdminEscrowTransaction> {
    const transaction: any = await prisma.escrowTransaction.update({
      where: { id: transactionId },
      data: {
        status: 'COMPLETED',
        releasedAt: new Date(),
        releasedBy: adminId,
        releaseReason,
        updatedAt: new Date()
      },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true
          }
        },
        recipient: {
          select: {
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    // Transform and return
    return {
      id: transaction.id,
      userId: transaction.userId,
      userName: `${transaction.user.firstName} ${transaction.user.lastName}`,
      userEmail: transaction.user.email,
      recipientId: transaction.recipientId,
      recipientName: transaction.recipient ? `${transaction.recipient.firstName} ${transaction.recipient.lastName}` : undefined,
      recipientEmail: transaction.recipient?.email,
      type: transaction.type,
      amount: transaction.amount,
      currency: transaction.currency,
      status: transaction.status,
      reference: transaction.reference,
      description: transaction.description,
      escrowId: transaction.escrowId,
      fundedAt: transaction.fundedAt?.toISOString(),
      releasedAt: transaction.releasedAt?.toISOString(),
      releasedBy: transaction.releasedBy,
      releaseReason: transaction.releaseReason,
      disputedAt: transaction.disputedAt?.toISOString(),
      disputedBy: transaction.disputedBy,
      disputeReason: transaction.disputeReason,
      resolvedAt: transaction.resolvedAt?.toISOString(),
      cancelledAt: transaction.cancelledAt?.toISOString(),
      cancellationReason: transaction.cancellationReason,
      createdAt: transaction.createdAt.toISOString(),
      metadata: transaction.metadata
    };
  }

  async disputeEscrow(transactionId: string, disputeReason: string): Promise<AdminEscrowTransaction> {
    const transaction: any = await prisma.escrowTransaction.update({
      where: { id: transactionId },
      data: {
        status: 'DISPUTED',
        disputedAt: new Date(),
        disputeReason,
        updatedAt: new Date()
      },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true
          }
        },
        recipient: {
          select: {
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    // Transform and return (similar to releaseEscrow)
    return {
      id: transaction.id,
      userId: transaction.userId,
      userName: `${transaction.user.firstName} ${transaction.user.lastName}`,
      userEmail: transaction.user.email,
      recipientId: transaction.recipientId,
      recipientName: transaction.recipient ? `${transaction.recipient.firstName} ${transaction.recipient.lastName}` : undefined,
      recipientEmail: transaction.recipient?.email,
      type: transaction.type,
      amount: transaction.amount,
      currency: transaction.currency,
      status: transaction.status,
      reference: transaction.reference,
      description: transaction.description,
      escrowId: transaction.escrowId,
      fundedAt: transaction.fundedAt?.toISOString(),
      releasedAt: transaction.releasedAt?.toISOString(),
      releasedBy: transaction.releasedBy,
      releaseReason: transaction.releaseReason,
      disputedAt: transaction.disputedAt?.toISOString(),
      disputedBy: transaction.disputedBy,
      disputeReason: transaction.disputeReason,
      resolvedAt: transaction.resolvedAt?.toISOString(),
      cancelledAt: transaction.cancelledAt?.toISOString(),
      cancellationReason: transaction.cancellationReason,
      createdAt: transaction.createdAt.toISOString(),
      metadata: transaction.metadata
    };
  }

  // === WITHDRAWAL & PAYOUT MANAGEMENT ===

  async getWithdrawalRequests(filters: any, pagination: AdminQueryParams): Promise<AdminPaginatedResponse<AdminWithdrawalRequest>> {
    const { page = 1, limit = 20, sort = 'createdAt', order = 'desc' } = pagination;
    const skip = (page - 1) * limit;

    const where = this.buildWithdrawalWhereClause(filters);
    
    const [withdrawals, total] = await Promise.all([
      prisma.withdrawalRequest.findMany({
        where,
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true
            }
          }
        },
        orderBy: { [sort]: order },
        skip,
        take: limit
      }),
      prisma.withdrawalRequest.count({ where })
    ]);

    const transformedWithdrawals: AdminWithdrawalRequest[] | any = withdrawals.map(withdrawal => ({
      id: withdrawal.id,
      userId: withdrawal.userId,
      userName: `${withdrawal.user.firstName} ${withdrawal.user.lastName}`,
      userEmail: withdrawal.user.email,
      amount: withdrawal.amount,
      currency: withdrawal.currency,
      method: withdrawal.method,
      status: withdrawal.status,
      destination: withdrawal.destination,
      reference: withdrawal.reference,
      failureReason: withdrawal.failureReason,
      createdAt: withdrawal.createdAt.toISOString(),
      completedAt: withdrawal.completedAt?.toISOString()
    }));

    return {
      data: transformedWithdrawals,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      },
      filters,
      sort: { field: sort, order }
    };
  }

  async approveWithdrawal(withdrawalId: string): Promise<AdminWithdrawalRequest> {
    const withdrawal: any = await prisma.withdrawalRequest.update({
      where: { id: withdrawalId },
      data: {
        status: 'APPROVED',
        completedAt: new Date(),
        updatedAt: new Date()
      },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    return {
      id: withdrawal.id,
      userId: withdrawal.userId,
      userName: `${withdrawal.user.firstName} ${withdrawal.user.lastName}`,
      userEmail: withdrawal.user.email,
      amount: withdrawal.amount,
      currency: withdrawal.currency,
      method: withdrawal.method,
      status: withdrawal.status,
      destination: withdrawal.destination,
      reference: withdrawal.reference,
      failureReason: withdrawal.failureReason,
      createdAt: withdrawal.createdAt.toISOString(),
      completedAt: withdrawal.completedAt?.toISOString()
    };
  }

  async rejectWithdrawal(withdrawalId: string, reason: string): Promise<AdminWithdrawalRequest> {
    const withdrawal: any = await prisma.withdrawalRequest.update({
      where: { id: withdrawalId },
      data: {
        status: 'REJECTED',
        failureReason: reason,
        updatedAt: new Date()
      },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    return {
      id: withdrawal.id,
      userId: withdrawal.userId,
      userName: `${withdrawal.user.firstName} ${withdrawal.user.lastName}`,
      userEmail: withdrawal.user.email,
      amount: withdrawal.amount,
      currency: withdrawal.currency,
      method: withdrawal.method,
      status: withdrawal.status,
      destination: withdrawal.destination,
      reference: withdrawal.reference,
      failureReason: withdrawal.failureReason,
      createdAt: withdrawal.createdAt.toISOString(),
      completedAt: withdrawal.completedAt?.toISOString()
    };
  }

  // === CONTENT MANAGEMENT ===

  async getServices(pagination: AdminQueryParams): Promise<AdminPaginatedResponse<any>> {
    const { page = 1, limit = 20, sort = 'created_at', order = 'desc' } = pagination;
    const skip = (page - 1) * limit;

    const [services, total] = await Promise.all([
      prisma.service.findMany({
        orderBy: { [sort]: order },
        skip,
        take: limit
      }),
      prisma.service.count()
    ]);

    return {
      data: services,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      },
      filters: {},
      sort: { field: sort, order }
    };
  }

  async getPartners(pagination: AdminQueryParams): Promise<AdminPaginatedResponse<any>> {
    const { page = 1, limit = 20, sort = 'created_at', order = 'desc' } = pagination;
    const skip = (page - 1) * limit;

    const [partners, total] = await Promise.all([
      prisma.partner.findMany({
        orderBy: { [sort]: order },
        skip,
        take: limit
      }),
      prisma.partner.count()
    ]);

    return {
      data: partners,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      },
      filters: {},
      sort: { field: sort, order }
    };
  }

  async getContactRequests(pagination: AdminQueryParams): Promise<AdminPaginatedResponse<any>> {
    const { page = 1, limit = 20, sort = 'created_at', order = 'desc' } = pagination;
    const skip = (page - 1) * limit;

    const [contacts, total] = await Promise.all([
      prisma.contactMessage.findMany({
        orderBy: { [sort]: order },
        skip,
        take: limit
      }),
      prisma.contactMessage.count()
    ]);

    return {
      data: contacts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      },
      filters: {},
      sort: { field: sort, order }
    };
  }

  // src/services/admin.service.ts

  async respondToContact(contactId: string, response: string, adminId: number): Promise<any> {
    const contact = await prisma.contactMessage.update({
      // FIX: Changed BigInt(contactId) to Number(contactId) to match the Int type in the schema.
      where: { id: Number(contactId) },
      data: {
        // FIX: Renamed fields from snake_case to the correct camelCase used by Prisma Client.
        adminReply: response,
        repliedAt: new Date(),
        isResolved: true,
        updatedAt: new Date()
      }
    });

    return contact;
  }

  // === ANALYTICS ===

  async getSystemAnalytics(period: string, filters: any): Promise<AdminSystemAnalytics> {
    const { startDate, endDate } = this.getPeriodDates(period);
    
    const [
      userAnalytics,
      propertyAnalytics,
      tourAnalytics,
      bookingAnalytics,
      paymentAnalytics,
      trends
    ] = await Promise.all([
      this.getUserAnalytics(startDate, endDate),
      this.getPropertyAnalytics(startDate, endDate),
      this.getTourAnalytics(startDate, endDate),
      this.getBookingAnalytics(startDate, endDate),
      this.getPaymentAnalytics(startDate, endDate),
      this.getTrends(startDate, endDate)
    ]);

    return {
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        label: period
      },
      users: userAnalytics,
      properties: propertyAnalytics,
      tours: tourAnalytics,
      bookings: bookingAnalytics,
      payments: paymentAnalytics,
      trends
    };
  }

  async generateFinancialReport(period: string, type: 'revenue' | 'earnings' | 'payouts'): Promise<AdminFinancialReport | any> {
    const { startDate, endDate } = this.getPeriodDates(period);
    
    // Generate comprehensive financial report
    const [
      revenueData,
      earningsData,
      payoutData,
      escrowData,
      transactionData
    ] = await Promise.all([
      this.getRevenueData(startDate, endDate),
      this.getEarningsData(startDate, endDate),
      this.getPayoutData(startDate, endDate),
      this.getEscrowData(),
      this.getTransactionData(startDate, endDate)
    ]);

    return {
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        label: period
      },
      revenue: revenueData,
      earnings: earningsData,
      payouts: payoutData,
      escrow: escrowData,
      transactions: transactionData,
      summary: {
        totalRevenue: revenueData.total,
        totalEarnings: earningsData.total,
        totalPayouts: payoutData.total,
        escrowBalance: escrowData.held,
        platformFees: revenueData.fees,
        netIncome: revenueData.total - payoutData.total
      }
    };
  }

  // === BULK OPERATIONS ===

  async bulkUpdateUsers(request: AdminBulkUpdateRequest): Promise<AdminBulkOperation | any> {
    const { filters, updates, dryRun = false } = request;
    
    const where = this.buildUserWhereClause(filters);
    
    if (dryRun) {
      const count = await prisma.user.count({ where });
      return {
        operation: 'bulk_update_users',
        affected: count,
        success: true,
        dryRun: true,
        message: `Would update ${count} users`
      };
    }

    const result = await prisma.user.updateMany({
      where,
      data: updates
    });

    return {
      operation: 'bulk_update_users',
      affected: result.count,
      success: true,
      dryRun: false,
      message: `Updated ${result.count} users successfully`
    };
  }

  async bulkDeleteUsers(request: AdminBulkDeleteRequest | any): Promise<AdminBulkOperation | any> {
    const { filters, dryRun = false } = request;
    
    const where = this.buildUserWhereClause(filters);
    
    if (dryRun) {
      const count = await prisma.user.count({ where });
      return {
        operation: 'bulk_delete_users',
        affected: count,
        success: true,
        dryRun: true,
        message: `Would delete ${count} users`
      };
    }

    // For safety, only soft delete by updating status
    const result = await prisma.user.updateMany({
      where,
      data: {
        status: 'deleted',
        updatedAt: new Date()
      }
    });

    return {
      operation: 'bulk_delete_users',
      affected: result.count,
      success: true,
      dryRun: false,
      message: `Soft deleted ${result.count} users successfully`
    };
  }

  // === EXPORT FUNCTIONALITY ===

  async exportData(request: AdminExportRequest | any): Promise<{ success: boolean; downloadUrl?: string; message: string }> {
    const { type, format, filters, columns } = request;
    
    try {
      let data: any[] = [];
      
      switch (type) {
        case 'users':
          const users = await prisma.user.findMany({
            where: this.buildUserWhereClause(filters || {}),
            select: this.buildSelectFields(columns, 'user')
          });
          data = users;
          break;
          
        case 'properties':
          const properties = await prisma.property.findMany({
            where: this.buildPropertyWhereClause(filters || {}),
            select: this.buildSelectFields(columns, 'property')
          });
          data = properties;
          break;
          
        case 'bookings':
          // Implementation for booking export
          break;
          
        default:
          throw new Error('Invalid export type');
      }

      // Generate export file based on format
      const filename = `${type}_export_${Date.now()}.${format}`;
      const exportPath = await this.generateExportFile(data, format, filename);
      
      return {
        success: true,
        downloadUrl: `/api/admin/exports/${filename}`,
        message: `Export completed. ${data.length} records exported.`
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Export failed: ${error.message}`
      };
    }
  }

  // === SYSTEM SETTINGS ===

  async getSystemSettings(): Promise<AdminSystemSettings | any> {
    // This would typically come from a settings table or configuration
    return {
      general: {
        siteName: 'Your Platform',
        siteUrl: process.env.SITE_URL || '',
        adminEmail: process.env.ADMIN_EMAIL || '',
        timezone: 'UTC',
        defaultCurrency: 'RWF'
      },
      features: {
        userRegistration: true,
        emailVerification: true,
        twoFactorAuth: false,
        escrowPayments: true,
        instantBooking: true
      },
      payments: {
        defaultProcessingFee: 2.9,
        escrowHoldPeriod: 7,
        payoutSchedule: 'weekly',
        minimumPayout: 10.00
      },
      notifications: {
        emailNotifications: true,
        smsNotifications: false,
        pushNotifications: false
      },
      security: {
        passwordMinLength: 8,
        sessionTimeout: 24,
        maxLoginAttempts: 5,
        requireEmailVerification: true
      }
    };
  }

  async updateSystemSettings(settings: Partial<AdminSystemSettings>): Promise<AdminSystemSettings> {
    // Implementation would depend on how settings are stored
    // For now, return the updated settings
    const currentSettings = await this.getSystemSettings();
    const updatedSettings = { ...currentSettings, ...settings };
    
    // Save to database/configuration
    // await this.saveSystemSettings(updatedSettings);
    
    return updatedSettings;
  }

  // === HELPER METHODS ===

  private getPeriodDates(period: string): { startDate: Date; endDate: Date } {
    const endDate = new Date();
    let startDate: Date;

    switch (period) {
      case '7d':
        startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '1y':
        startDate = new Date(endDate.getFullYear() - 1, endDate.getMonth(), endDate.getDate());
        break;
      default:
        startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    return { startDate, endDate };
  }

  private buildUserWhereClause(filters: AdminUserFilters): any {
    const where: any = {};

    if (filters.userType?.length) {
      where.userType = { in: filters.userType };
    }

    if (filters.status?.length) {
      where.status = { in: filters.status };
    }

    if (filters.verificationStatus?.length) {
      where.verificationStatus = { in: filters.verificationStatus };
    }

    if (filters.kycStatus?.length) {
      where.kycStatus = { in: filters.kycStatus };
    }

    if (filters.provider?.length) {
      where.provider = { in: filters.provider };
    }

    if (filters.country?.length) {
      where.country = { in: filters.country };
    }

    if (filters.search) {
      where.OR = [
        { email: { contains: filters.search, mode: 'insensitive' } },
        { firstName: { contains: filters.search, mode: 'insensitive' } },
        { lastName: { contains: filters.search, mode: 'insensitive' } }
      ];
    }

    if (filters.dateRange) {
      where[filters.dateRange.field] = {
        gte: new Date(filters.dateRange.start),
        lte: new Date(filters.dateRange.end)
      };
    }

    return where;
  }

  private buildPropertyWhereClause(filters: AdminPropertyFilters): any {
    const where: any = {};

    if (filters.status?.length) {
      where.status = { in: filters.status };
    }

    if (filters.type?.length) {
      where.type = { in: filters.type };
    }

    if (filters.category?.length) {
      where.category = { in: filters.category };
    }

    if (filters.isVerified !== undefined) {
      where.isVerified = filters.isVerified;
    }

    if (filters.isInstantBook !== undefined) {
      where.isInstantBook = filters.isInstantBook;
    }

    if (filters.hostId) {
      where.hostId = filters.hostId;
    }

    if (filters.priceRange) {
      where.pricePerNight = {
        gte: filters.priceRange.min,
        lte: filters.priceRange.max
      };
    }

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { location: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } }
      ];
    }

    return where;
  }

  private buildTourWhereClause(filters: AdminTourFilters): any {
    const where: any = {};

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    if (filters.category?.length) {
      where.category = { in: filters.category };
    }

    if (filters.type?.length) {
      where.type = { in: filters.type };
    }

    if (filters.tourGuideId) {
      where.tourGuideId = filters.tourGuideId;
    }

    if (filters.difficulty?.length) {
      where.difficulty = { in: filters.difficulty };
    }

    if (filters.priceRange) {
      where.price = {
        gte: filters.priceRange.min,
        lte: filters.priceRange.max
      };
    }

    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
        { locationCity: { contains: filters.search, mode: 'insensitive' } }
      ];
    }

    return where;
  }

  private buildBookingWhereClause(filters: AdminBookingFilters, type: 'property' | 'tour'): any {
    const where: any = {};

    if (filters.status?.length) {
      where.status = { in: filters.status };
    }

    if (filters.paymentStatus?.length) {
      where.paymentStatus = { in: filters.paymentStatus };
    }

    if (type === 'property') {
      if (filters.propertyId) {
        where.propertyId = filters.propertyId;
      }
      if (filters.guestId) {
        where.guestId = filters.guestId;
      }
    } else {
      if (filters.tourId) {
        where.tourId = filters.tourId;
      }
      if (filters.guestId) {
        where.userId = filters.guestId;
      }
    }

    if (filters.dateRange) {
      where[filters.dateRange.field] = {
        gte: new Date(filters.dateRange.start),
        lte: new Date(filters.dateRange.end)
      };
    }

    return where;
  }

  private buildReviewWhereClause(filters: any, type: 'property' | 'tour'): any {
    const where: any = {};

    if (filters.rating) {
      where.rating = filters.rating;
    }

    if (filters.isReported !== undefined) {
      where.isReported = filters.isReported;
    }

    if (filters.isVisible !== undefined) {
      where.isVisible = filters.isVisible;
    }

    if (type === 'property' && filters.propertyId) {
      where.propertyId = filters.propertyId;
    }

    if (type === 'tour' && filters.tourId) {
      where.tourId = filters.tourId;
    }

    if (filters.userId) {
      where.userId = filters.userId;
    }

    return where;
  }

  private buildPaymentWhereClause(filters: any): any {
    const where: any = {};

    if (filters.status?.length) {
      where.status = { in: filters.status };
    }

    if (filters.type?.length) {
      where.type = { in: filters.type };
    }

    if (filters.method?.length) {
      where.method = { in: filters.method };
    }

    if (filters.userId) {
      where.userId = filters.userId;
    }

    if (filters.amountRange) {
      where.amount = {
        gte: filters.amountRange.min,
        lte: filters.amountRange.max
      };
    }

    return where;
  }

  private buildEscrowWhereClause(filters: any): any {
    const where: any = {};

    if (filters.status?.length) {
      where.status = { in: filters.status };
    }

    if (filters.type?.length) {
      where.type = { in: filters.type };
    }

    if (filters.userId) {
      where.OR = [
        { userId: filters.userId },
        { recipientId: filters.userId }
      ];
    }

    if (filters.amountRange) {
      where.amount = {
        gte: filters.amountRange.min,
        lte: filters.amountRange.max
      };
    }

    return where;
  }

  private buildWithdrawalWhereClause(filters: any): any {
    const where: any = {};

    if (filters.status?.length) {
      where.status = { in: filters.status };
    }

    if (filters.method?.length) {
      where.method = { in: filters.method };
    }

    if (filters.userId) {
      where.userId = filters.userId;
    }

    if (filters.amountRange) {
      where.amount = {
        gte: filters.amountRange.min,
        lte: filters.amountRange.max
      };
    }

    return where;
  }

  private buildSelectFields(columns?: string[], entityType?: string): any {
    if (!columns || columns.length === 0) {
      return undefined; // Return all fields
    }

    const select: any = {};
    columns.forEach(column => {
      select[column] = true;
    });

    return select;
  }

  private calculateGrowth(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  }

  private transformToAdminBookingListItem(booking: any, type: 'property' | 'tour'): AdminBookingListItem {
    return {
      id: booking.id,
      type,
      guestId: booking.guestId || booking.userId,
      guestName: `${booking.guest?.firstName || booking.user?.firstName} ${booking.guest?.lastName || booking.user?.lastName}`,
      guestEmail: booking.guest?.email || booking.user?.email,
      providerId: booking.hostId || booking.tourGuideId,
      providerName: type === 'property' 
        ? `${booking.property?.host?.firstName || ''} ${booking.property?.host?.lastName || ''}`
        : `${booking.tour?.tourGuide?.firstName || ''} ${booking.tour?.tourGuide?.lastName || ''}`,
      providerEmail: type === 'property' ? booking.property?.host?.email : booking.tour?.tourGuide?.email,
      resourceId: booking.propertyId || booking.tourId,
      resourceName: type === 'property' ? booking.property?.name : booking.tour?.title,
      totalPrice: booking.totalPrice || booking.totalAmount,
      currency: booking.currency || 'RWF',
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      dates: {
        checkIn: booking.checkIn?.toISOString(),
        checkOut: booking.checkOut?.toISOString(),
        bookingDate: (booking.bookingDate || booking.createdAt)?.toISOString()
      },
      guests: booking.guests,
      participants: booking.numberOfParticipants,
      createdAt: booking.createdAt.toISOString(),
      updatedAt: booking.updatedAt.toISOString()
    };
  }

  private transformToAdminBookingDetails(booking: any, type: 'property' | 'tour'): AdminBookingDetails | any {
    const base = {
      id: booking.id,
      type,
      guestId: booking.guestId || booking.userId,
      guestName: `${booking.guest?.firstName || booking.user?.firstName} ${booking.guest?.lastName || booking.user?.lastName}`,
      guestEmail: booking.guest?.email || booking.user?.email,
      guestPhone: booking.guest?.phone || booking.user?.phone,
      guestCountry: booking.guest?.country || booking.user?.country,
      providerId: type === 'property' ? booking.property?.hostId : booking.tour?.tourGuideId,
      providerName: type === 'property' 
        ? `${booking.property?.host?.firstName || ''} ${booking.property?.host?.lastName || ''}`
        : `${booking.tour?.tourGuide?.firstName || ''} ${booking.tour?.tourGuide?.lastName || ''}`,
      providerEmail: type === 'property' ? booking.property?.host?.email : booking.tour?.tourGuide?.email,
      resourceId: booking.propertyId || booking.tourId,
      resourceName: type === 'property' ? booking.property?.name : booking.tour?.title,
      totalPrice: booking.totalPrice || booking.totalAmount,
      currency: booking.currency || 'RWF',
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      paymentMethod: booking.paymentMethod,
      transactionId: booking.transactionId || booking.paymentId,
      dates: {
        checkIn: booking.checkIn?.toISOString(),
        checkOut: booking.checkOut?.toISOString(),
        bookingDate: (booking.bookingDate || booking.createdAt)?.toISOString()
      },
      guests: booking.guests,
      participants: booking.numberOfParticipants,
      specialRequests: booking.specialRequests,
      notes: booking.notes || booking.guestNotes,
      cancellationReason: booking.cancellationReason || booking.refundReason,
      cancelledAt: booking.cancelledAt?.toISOString(),
      createdAt: booking.createdAt.toISOString(),
      updatedAt: booking.updatedAt.toISOString()
    };

    if (type === 'property') {
      return {
        ...base,
        property: {
          id: booking.property.id,
          name: booking.property.name,
          location: booking.property.location,
          type: booking.property.type,
          category: booking.property.category,
          pricePerNight: booking.property.pricePerNight,
          images: Array.isArray(booking.property.images) ? booking.property.images : []
        },
        checkInInstructions: booking.checkInInstructions,
        checkOutInstructions: booking.checkOutInstructions
      } as unknown as AdminBookingDetails;
    } else {
      return {
        ...base,
        tour: {
          id: booking.tour.id,
          title: booking.tour.title,
          description: booking.tour.description,
          category: booking.tour.category,
          duration: booking.tour.duration,
          price: booking.tour.price,
          images: Array.isArray(booking.tour.images) ? booking.tour.images : []
        },
        schedule: booking.schedule ? {
          id: booking.schedule.id,
          startDate: booking.schedule.startDate.toISOString(),
          endDate: booking.schedule.endDate.toISOString(),
          startTime: booking.schedule.startTime,
          endTime: booking.schedule.endTime
        } : undefined,
        participants: booking.participants,
        checkInStatus: booking.checkInStatus,
        checkInTime: booking.checkInTime?.toISOString(),
        checkOutTime: booking.checkOutTime?.toISOString()
      } as unknown as AdminBookingDetails;
    }
  }

  private async generateExportFile(data: any[], format: string, filename: string): Promise<string> {
    // Implementation for generating export files (CSV, Excel, JSON)
    // This would typically save files to a storage service
    // Return the file path or URL
    return `/exports/${filename}`;
  }

  // Implementation of metrics and analytics methods

  private async getTotalUsers(): Promise<number> {
    return await prisma.user.count();
  }

  private async getActiveUsers(startDate: Date): Promise<number> {
    return await prisma.user.count({
      where: {
        lastLogin: { gte: startDate }
      }
    });
  }

  private async getNewUsers(startDate: Date, endDate: Date): Promise<number> {
    return await prisma.user.count({
      where: {
        createdAt: { gte: startDate, lte: endDate }
      }
    });
  }

  private async getTotalProperties(): Promise<number> {
    return await prisma.property.count();
  }

  private async getActiveProperties(): Promise<number> {
    return await prisma.property.count({
      where: { status: 'active' }
    });
  }

  private async getPendingProperties(): Promise<number> {
    return await prisma.property.count({
      where: { status: 'pending' }
    });
  }

  private async getTotalTours(): Promise<number> {
    return await prisma.tour.count();
  }

  private async getActiveTours(): Promise<number> {
    return await prisma.tour.count({
      where: { isActive: true }
    });
  }

  private async getPendingTours(): Promise<number> {
    return await prisma.tour.count({
      where: { isActive: false }
    });
  }

  private async getTotalBookings(startDate: Date, endDate: Date): Promise<number> {
    const [propertyBookings, tourBookings] = await Promise.all([
      prisma.booking.count({
        where: { createdAt: { gte: startDate, lte: endDate } }
      }),
      prisma.tourBooking.count({
        where: { createdAt: { gte: startDate, lte: endDate } }
      })
    ]);
    return propertyBookings + tourBookings;
  }

  private async getConfirmedBookings(startDate: Date, endDate: Date): Promise<number> {
    const [propertyBookings, tourBookings] = await Promise.all([
      prisma.booking.count({
        where: { 
          createdAt: { gte: startDate, lte: endDate },
          status: 'confirmed'
        }
      }),
      prisma.tourBooking.count({
        where: { 
          createdAt: { gte: startDate, lte: endDate },
          status: 'confirmed'
        }
      })
    ]);
    return propertyBookings + tourBookings;
  }

  private async getCancelledBookings(startDate: Date, endDate: Date): Promise<number> {
    const [propertyBookings, tourBookings] = await Promise.all([
      prisma.booking.count({
        where: { 
          createdAt: { gte: startDate, lte: endDate },
          status: 'cancelled'
        }
      }),
      prisma.tourBooking.count({
        where: { 
          createdAt: { gte: startDate, lte: endDate },
          status: 'cancelled'
        }
      })
    ]);
    return propertyBookings + tourBookings;
  }

  private async getRevenueData(startDate: Date, endDate: Date): Promise<{ total: number; fees: number }> {
    const payments = await prisma.paymentTransaction.aggregate({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        status: 'completed'
      },
      _sum: {
        amount: true,
        charges: true
      }
    });

    return {
      total: payments._sum.amount || 0,
      fees: payments._sum.charges || 0
    };
  }

  private async getEscrowData(): Promise<{ held: number }> {
    const escrow = await prisma.escrowTransaction.aggregate({
      where: {
        status: { in: ['PENDING', 'HELD'] }
      },
      _sum: {
        amount: true
      }
    });

    return {
      held: escrow._sum.amount || 0
    };
  }

  private async getOpenDisputes(): Promise<number> {
    return await prisma.escrowTransaction.count({
      where: { status: 'DISPUTED' }
    });
  }

  private async getPreviousPeriodMetrics(period: string): Promise<any> {
    // Implementation would calculate metrics for the previous period for comparison
    return {
      users: 0,
      properties: 0,
      tours: 0,
      revenue: 0
    };
  }

  private async generateSystemAlerts(): Promise<AdminAlert[] | any[]> {
    const alerts: AdminAlert[] = [];

    // Check for high dispute rate
    const totalEscrow = await prisma.escrowTransaction.count();
    const disputedEscrow = await prisma.escrowTransaction.count({
      where: { status: 'DISPUTED' }
    });

    if (totalEscrow > 0 && (disputedEscrow / totalEscrow) > 0.1) {
      alerts.push({
        id: 'high-dispute-rate',
        type: 'warning',
        title: 'High Dispute Rate',
        message: `${((disputedEscrow / totalEscrow) * 100).toFixed(1)}% of escrow transactions are disputed`,
        createdAt: new Date().toISOString(),
        isRead: false,
        severity: 'medium',
        actionRequired: false
      });
    }

    // Check for pending KYC approvals
    const pendingKYC = await prisma.user.count({
      where: { kycStatus: 'pending' }
    });

    if (pendingKYC > 10) {
      alerts.push({
        id: 'pending-kyc',
        type: 'info',
        title: 'Pending KYC Approvals',
        message: `${pendingKYC} users are waiting for KYC approval`,
        createdAt: new Date().toISOString(),
        isRead: false,
        severity: 'medium',
        actionRequired: false
      });
    }

    return alerts;
  }

  private async getRecentActivity(limit: number): Promise<AdminActivity[]> {
    // This would typically come from an activity log table
    // For now, return empty array
    return [];
  }

  private async getUserMetrics(userId: number): Promise<any> {
    const [earnings, transactions, disputes] = await Promise.all([
      prisma.hostEarning.aggregate({
        where: { hostId: userId },
        _sum: { hostEarning: true }
      }),
      prisma.paymentTransaction.count({
        where: { userId, status: 'completed' }
      }),
      prisma.escrowTransaction.count({
        where: { userId, status: 'DISPUTED' }
      })
    ]);

    return {
      totalEarnings: earnings._sum.hostEarning || 0,
      pendingPayouts: 0,
      completedTransactions: transactions,
      disputedTransactions: disputes
    };
  }

  private async getUserRecentActivity(userId: number, limit: number): Promise<AdminActivity[]> {
    // Implementation for user's recent activity
    return [];
  }

  private async getPropertyMetrics(propertyId: number): Promise<any> {
    const [revenue, bookings, reviews] = await Promise.all([
      prisma.hostEarning.aggregate({
        where: { propertyId },
        _sum: { hostEarning: true }
      }),
      prisma.booking.aggregate({
        where: { propertyId },
        _count: { id: true },
        _avg: { guests: true }
      }),
      prisma.review.aggregate({
        where: { propertyId },
        _avg: { rating: true },
        _count: { id: true }
      })
    ]);

    return {
      totalRevenue: revenue._sum.hostEarning || 0,
      occupancyRate: 0, // Would need more complex calculation
      averageStayDuration: 0, // Would need calculation based on check-in/out dates
      cancellationRate: 0, // Would need calculation
      totalBookings: bookings._count.id || 0,
      averageGuests: bookings._avg.guests || 0,
      averageRating: reviews._avg.rating || 0,
      totalReviews: reviews._count.id || 0
    };
  }

  private async getTourMetrics(tourId: string): Promise<any> {
    const [revenue, bookings, reviews] = await Promise.all([
      prisma.tourEarnings.aggregate({
        where: { tourId },
        _sum: { netAmount: true }
      }),
      prisma.tourBooking.aggregate({
        where: { tourId },
        _count: { id: true },
        _sum: { numberOfParticipants: true }
      }),
      prisma.tourReview.aggregate({
        where: { tourId },
        _avg: { rating: true },
        _count: { id: true }
      })
    ]);

    return {
      totalRevenue: revenue._sum.netAmount || 0,
      totalBookings: bookings._count.id || 0,
      totalParticipants: bookings._sum.numberOfParticipants || 0,
      averageRating: reviews._avg.rating || 0,
      totalReviews: reviews._count.id || 0
    };
  }

  private async getUserAnalytics(startDate: Date, endDate: Date): Promise<any> {
    const [total, active, newUsers, usersByType, usersByStatus] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({
        where: { lastLogin: { gte: startDate } }
      }),
      prisma.user.count({
        where: { createdAt: { gte: startDate, lte: endDate } }
      }),
      prisma.user.groupBy({
        by: ['userType'],
        _count: { id: true }
      }),
      prisma.user.groupBy({
        by: ['status'],
        _count: { id: true }
      })
    ]);

    const previousPeriod = this.getPeriodDates('30d'); // Get previous 30d for comparison
    const previousTotal = await prisma.user.count({
      where: { createdAt: { lt: startDate } }
    });

    const growth = this.calculateGrowth(total, previousTotal);

    return {
      total,
      active,
      new: newUsers,
      byType: usersByType.reduce((acc: any, item) => {
        acc[item.userType] = item._count.id;
        return acc;
      }, {}),
      byStatus: usersByStatus.reduce((acc: any, item) => {
        acc[item.status] = item._count.id;
        return acc;
      }, {}),
      growth
    };
  }

  private async getPropertyAnalytics(startDate: Date, endDate: Date): Promise<any> {
    const [total, active, verified, byType, byCategory, avgRating] = await Promise.all([
      prisma.property.count(),
      prisma.property.count({
        where: { status: 'active' }
      }),
      prisma.property.count({
        where: { isVerified: true }
      }),
      prisma.property.groupBy({
        by: ['type'],
        _count: { id: true }
      }),
      prisma.property.groupBy({
        by: ['category'],
        _count: { id: true }
      }),
      prisma.property.aggregate({
        _avg: { averageRating: true }
      })
    ]);

    // Calculate occupancy rate (simplified)
    const totalBookings = await prisma.booking.count({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        status: { in: ['confirmed', 'completed'] }
      }
    });

    const occupancyRate = total > 0 ? (totalBookings / total) * 100 : 0;

    return {
      total,
      active,
      verified,
      byType: byType.reduce((acc: any, item) => {
        acc[item.type] = item._count.id;
        return acc;
      }, {}),
      byCategory: byCategory.reduce((acc: any, item) => {
        acc[item.category] = item._count.id;
        return acc;
      }, {}),
      averageRating: avgRating._avg.averageRating || 0,
      occupancyRate,
      growth: 0 // Would need previous period data
    };
  }

  private async getTourAnalytics(startDate: Date, endDate: Date): Promise<any> {
    const [total, active, byCategory, avgRating, totalBookings] = await Promise.all([
      prisma.tour.count(),
      prisma.tour.count({
        where: { isActive: true }
      }),
      prisma.tour.groupBy({
        by: ['category'],
        _count: { id: true }
      }),
      prisma.tour.aggregate({
        _avg: { rating: true }
      }),
      prisma.tourBooking.count({
        where: {
          createdAt: { gte: startDate, lte: endDate },
          status: { in: ['confirmed', 'completed'] }
        }
      })
    ]);

    const bookingRate = total > 0 ? (totalBookings / total) * 100 : 0;

    return {
      total,
      active,
      byCategory: byCategory.reduce((acc: any, item) => {
        acc[item.category] = item._count.id;
        return acc;
      }, {}),
      averageRating: avgRating._avg.rating || 0,
      bookingRate,
      totalBookings,
      growth: 0 // Would need previous period data
    };
  }

  private async getBookingAnalytics(startDate: Date, endDate: Date): Promise<any> {
    const [propertyBookings, tourBookings, propertyRevenue, tourRevenue] = await Promise.all([
      prisma.booking.groupBy({
        by: ['status'],
        where: { createdAt: { gte: startDate, lte: endDate } },
        _count: { id: true },
        _sum: { totalPrice: true }
      }),
      prisma.tourBooking.groupBy({
        by: ['status'],
        where: { createdAt: { gte: startDate, lte: endDate } },
        _count: { id: true },
        _sum: { totalAmount: true }
      }),
      prisma.booking.aggregate({
        where: {
          createdAt: { gte: startDate, lte: endDate },
          status: 'completed'
        },
        _sum: { totalPrice: true },
        _avg: { totalPrice: true }
      }),
      prisma.tourBooking.aggregate({
        where: {
          createdAt: { gte: startDate, lte: endDate },
          status: 'completed'
        },
        _sum: { totalAmount: true },
        _avg: { totalAmount: true }
      })
    ]);

    const totalBookings = propertyBookings.reduce((acc, b) => acc + b._count.id, 0) + 
                         tourBookings.reduce((acc, b) => acc + b._count.id, 0);
    
    const totalRevenue = (propertyRevenue._sum.totalPrice || 0) + (tourRevenue._sum.totalAmount || 0);
    const averageValue = totalBookings > 0 ? totalRevenue / totalBookings : 0;

    const confirmed = propertyBookings.find(b => b.status === 'confirmed')?._count.id || 0;
    
    const cancelled = propertyBookings.find(b => b.status === 'cancelled')?._count.id || 0;

    const conversionRate = totalBookings > 0 ? (confirmed / totalBookings) * 100 : 0;

    return {
      total: totalBookings,
      confirmed,
      cancelled,
      revenue: totalRevenue,
      averageValue,
      byType: {
        property: propertyBookings.reduce((acc, b) => acc + b._count.id, 0),
        tour: tourBookings.reduce((acc, b) => acc + b._count.id, 0)
      },
      conversionRate,
      growth: 0 // Would need previous period data
    };
  }

  private async getPaymentAnalytics(startDate: Date, endDate: Date): Promise<any> {
    const [payments, escrowStats, byMethod, byStatus] = await Promise.all([
      prisma.paymentTransaction.aggregate({
        where: { createdAt: { gte: startDate, lte: endDate } },
        _sum: { amount: true, charges: true },
        _count: { id: true },
        _avg: { amount: true }
      }),
      prisma.escrowTransaction.groupBy({
        by: ['status'],
        where: { createdAt: { gte: startDate, lte: endDate } },
        _count: { id: true },
        _sum: { amount: true }
      }),
      prisma.paymentTransaction.groupBy({
        by: ['method'],
        where: { createdAt: { gte: startDate, lte: endDate } },
        _count: { id: true },
        _sum: { amount: true }
      }),
      prisma.paymentTransaction.groupBy({
        by: ['status'],
        where: { createdAt: { gte: startDate, lte: endDate } },
        _count: { id: true }
      })
    ]);

    const successfulPayments = byStatus.find(s => s.status === 'completed')?._count.id || 0;
    const totalPayments = payments._count.id || 0;
    const successRate = totalPayments > 0 ? (successfulPayments / totalPayments) * 100 : 0;

    const disputedEscrow = escrowStats.find(s => s.status === 'DISPUTED')?._count.id || 0;
    const totalEscrow = escrowStats.reduce((acc, s) => acc + s._count.id, 0);
    const escrowHeld = escrowStats.find(s => s.status === 'PENDING')?._sum.amount || 0;

    return {
      totalVolume: payments._sum.amount || 0,
      totalFees: payments._sum.charges || 0,
      escrowHeld,
      disputes: disputedEscrow,
      successRate,
      averageProcessingTime: 0, // Would need to calculate from created vs completed timestamps
      byMethod: byMethod.reduce((acc: any, item) => {
        acc[item.method] = {
          count: item._count.id,
          volume: item._sum.amount || 0
        };
        return acc;
      }, {}),
      byStatus: byStatus.reduce((acc: any, item) => {
        acc[item.status] = item._count.id;
        return acc;
      }, {})
    };
  }

  private async getTrends(startDate: Date, endDate: Date): Promise<any> {
    // Generate daily/monthly trend data
    const dailyTrends = await this.getDailyTrends(startDate, endDate);
    const monthlyTrends = await this.getMonthlyTrends(startDate, endDate);

    return {
      daily: dailyTrends,
      monthly: monthlyTrends
    };
  }

  private async getDailyTrends(startDate: Date, endDate: Date): Promise<any[]> {
    // This would generate day-by-day metrics
    // For now, return empty array - would need complex date grouping queries
    return [];
  }

  private async getMonthlyTrends(startDate: Date, endDate: Date): Promise<any[]> {
    // This would generate month-by-month metrics
    // For now, return empty array - would need complex date grouping queries
    return [];
  }

  private async getEarningsData(startDate: Date, endDate: Date): Promise<any> {
    const [hostEarnings, tourEarnings] = await Promise.all([
      prisma.hostEarning.aggregate({
        where: { createdAt: { gte: startDate, lte: endDate } },
        _sum: { hostEarning: true, platformFee: true, grossAmount: true },
        _count: { id: true }
      }),
      prisma.tourEarnings.aggregate({
        where: { createdAt: { gte: startDate, lte: endDate } },
        _sum: { amount: true, commission: true, netAmount: true },
        _count: { id: true }
      })
    ]);

    return {
      total: (hostEarnings._sum.hostEarning || 0) + (tourEarnings._sum.netAmount || 0),
      property: hostEarnings._sum.hostEarning || 0,
      tour: tourEarnings._sum.netAmount || 0,
      platformFees: (hostEarnings._sum.platformFee || 0) + (tourEarnings._sum.commission || 0),
      count: (hostEarnings._count.id || 0) + (tourEarnings._count.id || 0)
    };
  }

  private async getPayoutData(startDate: Date, endDate: Date): Promise<any> {
    const payouts = await prisma.payout.aggregate({
      where: { createdAt: { gte: startDate, lte: endDate } },
      _sum: { amount: true, fees: true, netAmount: true },
      _count: { id: true }
    });

    const byStatus = await prisma.payout.groupBy({
      by: ['status'],
      where: { createdAt: { gte: startDate, lte: endDate } },
      _count: { id: true },
      _sum: { netAmount: true }
    });

    return {
      total: payouts._sum.netAmount || 0,
      fees: payouts._sum.fees || 0,
      count: payouts._count.id || 0,
      byStatus: byStatus.reduce((acc: any, item) => {
        acc[item.status] = {
          count: item._count.id,
          amount: item._sum.netAmount || 0
        };
        return acc;
      }, {})
    };
  }

  private async getTransactionData(startDate: Date, endDate: Date): Promise<any> {
    const [payments, escrow, withdrawals] = await Promise.all([
      prisma.paymentTransaction.count({
        where: { createdAt: { gte: startDate, lte: endDate } }
      }),
      prisma.escrowTransaction.count({
        where: { createdAt: { gte: startDate, lte: endDate } }
      }),
      prisma.withdrawalRequest.count({
        where: { createdAt: { gte: startDate, lte: endDate } }
      })
    ]);

    return {
      total: payments + escrow + withdrawals,
      payments,
      escrow,
      withdrawals
    };
  }

  // === NOTIFICATION MANAGEMENT ===

  async getNotifications(pagination: AdminQueryParams): Promise<AdminPaginatedResponse<any>> {
    const { page = 1, limit = 20, sort = 'createdAt', order = 'desc' } = pagination;
    const skip = (page - 1) * limit;

    const [escrowNotifications, tourNotifications, escrowTotal, tourTotal] = await Promise.all([
      prisma.escrowNotification.findMany({
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true
            }
          }
        },
        orderBy: { [sort]: order },
        skip: Math.floor(skip / 2),
        take: Math.ceil(limit / 2)
      }),
      prisma.tourNotification.findMany({
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true
            }
          }
        },
        orderBy: { [sort]: order },
        skip: Math.floor(skip / 2),
        take: Math.ceil(limit / 2)
      }),
      prisma.escrowNotification.count(),
      prisma.tourNotification.count()
    ]);

    const allNotifications = [
      ...escrowNotifications.map(n => ({
        ...n,
        source: 'escrow',
        userName: `${n.user.firstName} ${n.user.lastName}`,
        userEmail: n.user.email
      })),
      ...tourNotifications.map(n => ({
        ...n,
        source: 'tour',
        userName: `${n.user.firstName} ${n.user.lastName}`,
        userEmail: n.user.email
      }))
    ];

    const total = escrowTotal + tourTotal;

    return {
      data: allNotifications.slice(0, limit),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      },
      filters: {},
      sort: { field: sort, order }
    };
  }

  // === USER SESSION MANAGEMENT ===

  async getUserSessions(userId?: number, pagination: AdminQueryParams = {}): Promise<AdminPaginatedResponse<any>> {
    const { page = 1, limit = 20, sort = 'lastActivity', order = 'desc' } = pagination;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (userId) {
      where.userId = userId;
    }

    const [sessions, total] = await Promise.all([
      prisma.userSession.findMany({
        where,
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true
            }
          }
        },
        orderBy: { [sort]: order },
        skip,
        take: limit
      }),
      prisma.userSession.count({ where })
    ]);

    const transformedSessions = sessions.map(session => ({
      id: session.id,
      userId: session.userId,
      userName: `${session.user.firstName} ${session.user.lastName}`,
      userEmail: session.user.email,
      sessionToken: session.sessionToken,
      device: session.device,
      browser: session.browser,
      location: session.location,
      ipAddress: session.ipAddress,
      isActive: session.isActive,
      lastActivity: session.lastActivity.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      createdAt: session.createdAt.toISOString()
    }));

    return {
      data: transformedSessions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      },
      filters: {},
      sort: { field: sort, order }
    };
  }

  async terminateUserSession(sessionId: string): Promise<{ success: boolean; message: string }> {
    await prisma.userSession.update({
      where: { id: sessionId },
      data: {
        isActive: false,
        updatedAt: new Date()
      }
    });

    return {
      success: true,
      message: 'Session terminated successfully'
    };
  }

  async terminateAllUserSessions(userId: number): Promise<{ success: boolean; message: string; count: number }> {
    const result = await prisma.userSession.updateMany({
      where: { userId, isActive: true },
      data: {
        isActive: false,
        updatedAt: new Date()
      }
    });

    return {
      success: true,
      message: 'All user sessions terminated successfully',
      count: result.count
    };
  }

  // === AUDIT LOGS ===

  async getAuditLogs(filters: any = {}, pagination: AdminQueryParams = {}): Promise<AdminPaginatedResponse<any>> {
    const { page = 1, limit = 20, sort = 'created_at', order = 'desc' } = pagination;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (filters.action) {
      where.action = { contains: filters.action, mode: 'insensitive' };
    }
    if (filters.resource_type) {
      where.resource_type = filters.resource_type;
    }
    if (filters.user_id) {
      where.user_id = filters.user_id;
    }
    if (filters.dateRange) {
      where.created_at = {
        gte: new Date(filters.dateRange.start),
        lte: new Date(filters.dateRange.end)
      };
    }

    const [logs, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        orderBy: { [sort]: order },
        skip,
        take: limit
      }),
      prisma.activityLog.count({ where })
    ]);

    return {
      data: logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      },
      filters,
      sort: { field: sort, order }
    };
  }

  // === VISITOR TRACKING ===

  // src/services/admin.service.ts

async getVisitorAnalytics(period: string = '30d'): Promise<any> {
  const { startDate, endDate } = this.getPeriodDates(period);

  const [totalVisitors, uniqueVisitors, byCountry, topPages] = await Promise.all([
    prisma.visitorTracking.count({
      // FIX: 'created_at' changed to 'createdAt'
      where: { createdAt: { gte: startDate, lte: endDate } }
    }),
    prisma.visitorTracking.groupBy({
      // FIX: 'ip_address' changed to 'ipAddress'
      by: ['ipAddress'],
      // FIX: 'created_at' changed to 'createdAt'
      where: { createdAt: { gte: startDate, lte: endDate } },
      _count: { id: true }
    }),
    prisma.visitorTracking.groupBy({
      by: ['country'],
      where: {
        // FIX: 'created_at' changed to 'createdAt'
        createdAt: { gte: startDate, lte: endDate },
        country: { not: null }
      },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10
    }),
    prisma.visitorTracking.groupBy({
      // FIX: 'page_url' changed to 'pageUrl'
      by: ['pageUrl'],
      where: {
        // FIX: 'created_at' changed to 'createdAt'
        createdAt: { gte: startDate, lte: endDate },
        // FIX: 'page_url' changed to 'pageUrl'
        pageUrl: { not: null }
      },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10
    })
  ]);

  return {
    period: {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      label: period
    },
    totalVisitors,
    uniqueVisitors: uniqueVisitors.length,
    byCountry: byCountry.map((item: any) => ({
      country: item.country,
      // FIX: Added optional chaining and nullish coalescing for safety.
      count: item._count?.id ?? 0
    })),
    topPages: topPages.map((item: any) => ({
      // FIX: 'page_url' changed to 'pageUrl'
      url: item.pageUrl,
      // FIX: Added optional chaining and nullish coalescing for safety.
      count: item._count?.id ?? 0
    }))
  };
}
  // === NEWSLETTER MANAGEMENT ===

  async getNewsletterSubscriptions(pagination: AdminQueryParams = {}): Promise<AdminPaginatedResponse<any>> {
    const { page = 1, limit = 20, sort = 'subscribed_at', order = 'desc' } = pagination;
    const skip = (page - 1) * limit;

    const [subscriptions, total] = await Promise.all([
      prisma.newsletterSubscription.findMany({
        orderBy: { [sort]: order },
        skip,
        take: limit
      }),
      prisma.newsletterSubscription.count()
    ]);

    return {
      data: subscriptions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      },
      filters: {},
      sort: { field: sort, order }
    };
  }

  async updateNewsletterStatus(id: string, isActive: boolean): Promise<any> {
    return await prisma.newsletterSubscription.update({
      where: { id },
      data: { isSubscribed: isActive }
    });
  }

  // === MARKET DATA MANAGEMENT ===

  async getMarketData(filters: any = {}, pagination: AdminQueryParams = {}): Promise<AdminPaginatedResponse<any>> {
    const { page = 1, limit = 20, sort = 'periodStart', order = 'desc' } = pagination;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (filters.region) {
      where.region = filters.region;
    }
    if (filters.period) {
      where.period = filters.period;
    }

    const [marketData, total] = await Promise.all([
      prisma.marketData.findMany({
        where,
        orderBy: { [sort]: order },
        skip,
        take: limit
      }),
      prisma.marketData.count({ where })
    ]);

    return {
      data: marketData,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      },
      filters,
      sort: { field: sort, order }
    };
  }

  async createMarketData(data: any): Promise<any> {
    return await prisma.marketData.create({
      data: {
        ...data,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
  }

  async updateMarketData(id: string, data: any): Promise<any> {
    return await prisma.marketData.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date()
      }
    });
  }

  // === WALLET MANAGEMENT ===

  async getWallets(filters: any = {}, pagination: AdminQueryParams = {}): Promise<AdminPaginatedResponse<any>> {
    const { page = 1, limit = 20, sort = 'createdAt', order = 'desc' } = pagination;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (filters.userId) {
      where.userId = filters.userId;
    }
    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }
    if (filters.minBalance) {
      where.balance = { gte: filters.minBalance };
    }

    const [wallets, total] = await Promise.all([
      prisma.wallet.findMany({
        where,
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true
            }
          },
          _count: {
            select: {
              transactions: true
            }
          }
        },
        orderBy: { [sort]: order },
        skip,
        take: limit
      }),
      prisma.wallet.count({ where })
    ]);

    const transformedWallets = wallets.map(wallet => ({
      id: wallet.id,
      userId: wallet.userId,
      userName: `${wallet.user.firstName} ${wallet.user.lastName}`,
      userEmail: wallet.user.email,
      balance: wallet.balance,
      currency: wallet.currency,
      accountNumber: wallet.accountNumber,
      isActive: wallet.isActive,
      isVerified: wallet.isVerified,
      transactionCount: wallet._count.transactions,
      createdAt: wallet.createdAt.toISOString(),
      updatedAt: wallet.updatedAt.toISOString()
    }));

    return {
      data: transformedWallets,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      },
      filters,
      sort: { field: sort, order }
    };
  }

  async adjustWalletBalance(walletId: string, amount: number, reason: string, adminId: number): Promise<any> {
    const wallet = await prisma.wallet.findUnique({
      where: { id: walletId }
    });

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const newBalance = wallet.balance + amount;

    // Update wallet balance
    const updatedWallet = await prisma.wallet.update({
      where: { id: walletId },
      data: {
        balance: newBalance,
        updatedAt: new Date()
      }
    });

    // Create transaction record
    await prisma.walletTransaction.create({
      data: {
        walletId,
        type: amount > 0 ? 'credit' : 'debit',
        amount: Math.abs(amount),
        balanceBefore: wallet.balance,
        balanceAfter: newBalance,
        reference: `ADMIN_ADJUSTMENT_${Date.now()}`,
        description: reason,
        transactionId: `admin-${adminId}-${Date.now()}`
      }
    });

    return updatedWallet;
  }

  // === COMPREHENSIVE SEARCH ===

  async globalSearch(query: string, type?: string): Promise<any> {
    const results: any = {
      users: [],
      properties: [],
      tours: [],
      bookings: [],
      transactions: []
    };

    if (!type || type === 'users') {
      results.users = await prisma.user.findMany({
        where: {
          OR: [
            { email: { contains: query, mode: 'insensitive' } },
            { firstName: { contains: query, mode: 'insensitive' } },
            { lastName: { contains: query, mode: 'insensitive' } }
          ]
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          userType: true,
          status: true
        },
        take: 10
      });
    }

    if (!type || type === 'properties') {
      results.properties = await prisma.property.findMany({
        where: {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { location: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } }
          ]
        },
        select: {
          id: true,
          name: true,
          location: true,
          type: true,
          status: true,
          hostId: true
        },
        take: 10
      });
    }

    if (!type || type === 'tours') {
      results.tours = await prisma.tour.findMany({
        where: {
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
            { locationCity: { contains: query, mode: 'insensitive' } }
          ]
        },
        select: {
          id: true,
          title: true,
          locationCity: true,
          category: true,
          isActive: true,
          tourGuideId: true
        },
        take: 10
      });
    }

    return results;
  }

  // === DATA VALIDATION & INTEGRITY ===

  async validateDataIntegrity(): Promise<any> {
    const issues: any[] = [];

    // Check for users without wallets
    const usersWithoutWallets = await prisma.user.count({
      where: {
        wallet: null
      }
    });

    if (usersWithoutWallets > 0) {
      issues.push({
        type: 'missing_wallets',
        count: usersWithoutWallets,
        description: 'Users without wallet records',
        severity: 'medium'
      });
    }

    // Check for bookings without payment records
    const bookingsWithoutPayments = await prisma.booking.count({
      where: {
        paymentStatus: 'pending',
        createdAt: {
          lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 days old
        }
      }
    });

    if (bookingsWithoutPayments > 0) {
      issues.push({
        type: 'stale_payment_pending',
        count: bookingsWithoutPayments,
        description: 'Bookings with pending payments older than 7 days',
        severity: 'high'
      });
    }

    // Check for orphaned escrow transactions
    const orphanedEscrow = await prisma.escrowTransaction.count({
      where: {
        status: 'PENDING',
        createdAt: {
          lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days old
        }
      }
    });

    if (orphanedEscrow > 0) {
      issues.push({
        type: 'orphaned_escrow',
        count: orphanedEscrow,
        description: 'Escrow transactions pending for more than 30 days',
        severity: 'critical'
      });
    }

    return {
      totalIssues: issues.length,
      issues,
      lastChecked: new Date().toISOString()
    };
  }

  async fixDataIntegrityIssue(issueType: string): Promise<{ success: boolean; message: string; fixed: number }> {
    let fixed = 0;

    switch (issueType) {
      case 'missing_wallets':
        const usersWithoutWallets = await prisma.user.findMany({
          where: { wallet: null },
          select: { id: true }
        });

        for (const user of usersWithoutWallets) {
          await prisma.wallet.create({
            data: {
              userId: user.id,
              balance: 0,
              currency: 'RWF'
            }
          });
          fixed++;
        }
        break;

      case 'stale_payment_pending':
        const result = await prisma.booking.updateMany({
          where: {
            paymentStatus: 'pending',
            createdAt: {
              lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
            }
          },
          data: {
            status: 'cancelled',
            paymentStatus: 'failed',
            cancellationReason: 'Payment timeout - auto-cancelled by system'
          }
        });
        fixed = result.count;
        break;

      default:
        return {
          success: false,
          message: 'Unknown issue type',
          fixed: 0
        };
    }

    return {
      success: true,
      message: `Fixed ${fixed} instances of ${issueType}`,
      fixed
    };
  }
}