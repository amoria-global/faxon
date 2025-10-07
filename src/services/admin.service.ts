//src/services/admin.service.ts

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { BrevoMailingService } from '../utils/brevo.admin';
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

const prisma = new PrismaClient();

export class AdminService {
  private mailingService: BrevoMailingService;
  private adminEmail: string;
  private companyInfo: any;

  constructor() {
    this.mailingService = new BrevoMailingService();
    this.adminEmail = process.env.ADMIN_EMAIL || 'admin@jambolush.com';
    this.companyInfo = {
      name: 'Jambolush',
      website: 'https://jambolush.com',
      supportEmail: 'support@jambolush.com',
      logo: 'https://jambolush.com/favicon.ico'
    };
  }

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

    // Send critical alerts if any
    const criticalAlerts = alerts.filter(alert => alert.severity === 'critical');
    for (const alert of criticalAlerts) {
      await this.sendCriticalAlert(alert);
    }

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
              ownedProperties: true,
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
      totalBookings: user._count?.bookingsAsGuest || 0,
      totalProperties: user._count?.ownedProperties || 0,
      totalTours: user._count?.toursAsGuide || 0,
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
            ownedProperties: true,
            toursAsGuide: true
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
      totalBookings: user._count?.bookingsAsGuest || 0,
      totalProperties: user._count?.ownedProperties || 0,
      totalTours: user._count?.toursAsGuide || 0,
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
      sessions: []
    };

    return userDetails;
  }

  async createUser(userData: any, adminId?: number): Promise<AdminUserDetails> {
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

    // Send admin notification
    await this.sendAdminNotification({
      type: 'user_created',
      title: 'New User Created Manually',
      message: `A new user has been manually created by an administrator.`,
      severity: 'medium',
      resource: {
        id: user.id,
        name: `${user.firstName} ${user.lastName}`,
        type: 'user'
      },
      metadata: {
        userType: user.userType,
        email: user.email,
        createdBy: adminId
      }
    });

    return this.getUserDetails(user.id);
  }

  async updateUser(userId: number, updateData: any, adminId?: number): Promise<AdminUserDetails> {
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

    // Send admin notification for significant changes
    const significantFields = ['status', 'userType', 'kycStatus', 'verificationStatus'];
    const changedFields = Object.keys(updateData).filter(key => significantFields.includes(key));

    if (changedFields.length > 0) {
      await this.sendAdminNotification({
        type: 'user_updated',
        title: 'User Profile Updated',
        message: `User profile has been updated by an administrator. Changed fields: ${changedFields.join(', ')}`,
        severity: 'low',
        resource: {
          id: userId,
          name: `${user.firstName} ${user.lastName}`,
          type: 'user'
        },
        metadata: {
          changedFields,
          updatedBy: adminId,
          previousValues: Object.fromEntries(changedFields.map(field => [field, (user as any)[field]])),
          newValues: Object.fromEntries(changedFields.map(field => [field, updateData[field]]))
        }
      });
    }

    return this.getUserDetails(updatedUser.id);
  }

  async deleteUser(userId: number, permanent: boolean = false, adminId?: number): Promise<{ success: boolean; message: string }> {
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

      // Send critical alert for permanent deletion
      await this.sendCriticalAlert({
        id: `user-deletion-${userId}`,
        type: 'critical',
        title: 'User Permanently Deleted',
        message: `User ${user.firstName} ${user.lastName} (${user.email}) has been permanently deleted from the system.`,
        createdAt: new Date().toISOString(),
        isRead: false,
        severity: 'critical',
        actionRequired: false
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

      await this.sendAdminNotification({
        type: 'user_deactivated',
        title: 'User Account Deactivated',
        message: `User account has been deactivated by an administrator.`,
        severity: 'medium',
        resource: {
          id: userId,
          name: `${user.firstName} ${user.lastName}`,
          type: 'user'
        },
        metadata: {
          email: user.email,
          deactivatedBy: adminId
        }
      });

      return { success: true, message: 'User deactivated' };
    }
  }

  async suspendUser(userId: number, reason: string, adminId?: number): Promise<AdminUserDetails> {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('User not found');
    }

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

    // Send high priority notification
    await this.sendAdminNotification({
      type: 'user_suspended',
      title: 'User Account Suspended',
      message: `User account has been suspended by an administrator.`,
      severity: 'high',
      reason,
      resource: {
        id: userId,
        name: `${user.firstName} ${user.lastName}`,
        type: 'user'
      },
      metadata: {
        email: user.email,
        suspendedBy: adminId,
        reason
      }
    });

    return this.getUserDetails(userId);
  }

  async activateUser(userId: number, adminId?: number): Promise<AdminUserDetails> {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('User not found');
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        status: 'active',
        updatedAt: new Date()
      }
    });

    await this.sendAdminNotification({
      type: 'user_activated',
      title: 'User Account Activated',
      message: `User account has been reactivated by an administrator.`,
      severity: 'low',
      resource: {
        id: userId,
        name: `${user.firstName} ${user.lastName}`,
        type: 'user'
      },
      metadata: {
        email: user.email,
        activatedBy: adminId
      }
    });

    return this.getUserDetails(userId);
  }

  async approveKYC(userId: number, notes?: string, adminId?: number): Promise<AdminUserDetails> {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('User not found');
    }

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

    await this.sendAdminNotification({
      type: 'kyc_approved',
      title: 'KYC Verification Approved',
      message: `KYC verification has been approved for user ${user.firstName} ${user.lastName}.`,
      severity: 'low',
      resource: {
        id: userId,
        name: `${user.firstName} ${user.lastName}`,
        type: 'user'
      },
      metadata: {
        email: user.email,
        approvedBy: adminId,
        notes
      }
    });

    return this.getUserDetails(userId);
  }

  async rejectKYC(userId: number, reason: string, adminId?: number): Promise<AdminUserDetails> {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('User not found');
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        kycStatus: 'rejected',
        kycCompleted: false,
        updatedAt: new Date()
      }
    });

    await this.sendAdminNotification({
      type: 'kyc_rejected',
      title: 'KYC Verification Rejected',
      message: `KYC verification has been rejected for user ${user.firstName} ${user.lastName}.`,
      severity: 'medium',
      reason,
      resource: {
        id: userId,
        name: `${user.firstName} ${user.lastName}`,
        type: 'user'
      },
      metadata: {
        email: user.email,
        rejectedBy: adminId,
        reason
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
      hostId: property.hostId || 0,
      hostName: property.host ? `${property.host.firstName} ${property.host.lastName}` : 'N/A',
      hostEmail: property.host?.email || 'N/A',
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
      hostId: property.hostId || 0,
      hostName: property.host ? `${property.host.firstName} ${property.host.lastName}` : 'N/A',
      hostEmail: property.host?.email || 'N/A',
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

  async approveProperty(propertyId: number, notes?: string, adminId?: number): Promise<AdminPropertyDetails> {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      include: {
        host: {
          select: {
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    if (!property) {
      throw new Error('Property not found');
    }

    await prisma.property.update({
      where: { id: propertyId },
      data: {
        status: 'active',
        isVerified: true,
        updatedAt: new Date()
      }
    });

    await this.sendAdminNotification({
      type: 'property_approved',
      title: 'Property Listing Approved',
      message: `Property "${property.name}" has been approved and is now live on the platform.`,
      severity: 'low',
      resource: {
        id: propertyId,
        name: property.name,
        type: 'property'
      },
      metadata: {
        hostName: property.host ? `${property.host.firstName} ${property.host.lastName}` : 'N/A',
        hostEmail: property.host?.email || 'N/A',
        approvedBy: adminId,
        notes
      }
    });

    return this.getPropertyDetails(propertyId);
  }

  async rejectProperty(propertyId: number, reason: string, adminId?: number): Promise<AdminPropertyDetails> {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      include: {
        host: {
          select: {
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    if (!property) {
      throw new Error('Property not found');
    }

    await prisma.property.update({
      where: { id: propertyId },
      data: {
        status: 'rejected',
        isVerified: false,
        updatedAt: new Date()
      }
    });

    await this.sendAdminNotification({
      type: 'property_rejected',
      title: 'Property Listing Rejected',
      message: `Property "${property.name}" has been rejected and removed from the platform.`,
      severity: 'medium',
      reason,
      resource: {
        id: propertyId,
        name: property.name,
        type: 'property'
      },
      metadata: {
        hostName: property.host ? `${property.host.firstName} ${property.host.lastName}` : 'N/A',
        hostEmail: property.host?.email || 'N/A',
        rejectedBy: adminId,
        reason
      }
    });

    return this.getPropertyDetails(propertyId);
  }

  async suspendProperty(propertyId: number, reason: string, adminId?: number): Promise<AdminPropertyDetails> {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      include: {
        host: {
          select: {
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    if (!property) {
      throw new Error('Property not found');
    }

    await prisma.property.update({
      where: { id: propertyId },
      data: {
        status: 'suspended',
        updatedAt: new Date()
      }
    });

    await this.sendAdminNotification({
      type: 'property_suspended',
      title: 'Property Listing Suspended',
      message: `Property "${property.name}" has been suspended due to policy violations or safety concerns.`,
      severity: 'high',
      reason,
      resource: {
        id: propertyId,
        name: property.name,
        type: 'property'
      },
      metadata: {
        hostName: property.host ? `${property.host.firstName} ${property.host.lastName}` : 'N/A',
        hostEmail: property.host?.email || 'N/A',
        suspendedBy: adminId,
        reason
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

  async approveTour(tourId: string, notes?: string, adminId?: number): Promise<AdminTourDetails> {
    const tour = await prisma.tour.findUnique({
      where: { id: tourId },
      include: {
        tourGuide: {
          select: {
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    if (!tour) {
      throw new Error('Tour not found');
    }

    await prisma.tour.update({
      where: { id: tourId },
      data: {
        isActive: true,
        updatedAt: new Date()
      }
    });

    await this.sendAdminNotification({
      type: 'tour_approved',
      title: 'Tour Approved',
      message: `Tour "${tour.title}" has been approved and is now live on the platform.`,
      severity: 'low',
      resource: {
        id: tourId,
        name: tour.title,
        type: 'tour'
      },
      metadata: {
        tourGuideName: `${tour.tourGuide.firstName} ${tour.tourGuide.lastName}`,
        tourGuideEmail: tour.tourGuide.email,
        approvedBy: adminId,
        notes
      }
    });

    return this.getTourDetails(tourId);
  }

  async suspendTour(tourId: string, reason: string, adminId?: number): Promise<AdminTourDetails> {
    const tour = await prisma.tour.findUnique({
      where: { id: tourId },
      include: {
        tourGuide: {
          select: {
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    if (!tour) {
      throw new Error('Tour not found');
    }

    await prisma.tour.update({
      where: { id: tourId },
      data: {
        isActive: false,
        updatedAt: new Date()
      }
    });

    await this.sendAdminNotification({
      type: 'tour_suspended',
      title: 'Tour Suspended',
      message: `Tour "${tour.title}" has been suspended due to policy violations or safety concerns.`,
      severity: 'high',
      reason,
      resource: {
        id: tourId,
        name: tour.title,
        type: 'tour'
      },
      metadata: {
        tourGuideName: `${tour.tourGuide.firstName} ${tour.tourGuide.lastName}`,
        tourGuideEmail: tour.tourGuide.email,
        suspendedBy: adminId,
        reason
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

  async cancelBooking(bookingId: string, type: 'property' | 'tour', reason: string, refundAmount?: number, adminId?: number): Promise<AdminBookingDetails> {
    let booking: any;
    let bookingName: string;

    if (type === 'property') {
      booking = await prisma.booking.findUnique({
        where: { id: bookingId },
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
              name: true
            }
          }
        }
      });

      if (!booking) {
        throw new Error('Booking not found');
      }

      await prisma.booking.update({
        where: { id: bookingId },
        data: {
          status: 'cancelled',
          cancellationReason: reason,
          cancelledAt: new Date(),
          updatedAt: new Date()
        }
      });

      bookingName = `${booking.property.name} - ${booking.guest.firstName} ${booking.guest.lastName}`;
    } else {
      booking = await prisma.tourBooking.findUnique({
        where: { id: bookingId },
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
        }
      });

      if (!booking) {
        throw new Error('Booking not found');
      }

      await prisma.tourBooking.update({
        where: { id: bookingId },
        data: {
          status: 'cancelled',
          refundAmount,
          refundReason: reason,
          updatedAt: new Date()
        }
      });

      bookingName = `${booking.tour.title} - ${booking.user.firstName} ${booking.user.lastName}`;
    }

    await this.sendAdminNotification({
      type: 'booking_cancelled',
      title: 'Booking Cancelled by Admin',
      message: `A booking has been cancelled by an administrator.`,
      severity: 'medium',
      reason,
      resource: {
        id: bookingId,
        name: bookingName,
        type: 'booking'
      },
      metadata: {
        bookingType: type,
        guestName: type === 'property' ? `${booking.guest.firstName} ${booking.guest.lastName}` : `${booking.user.firstName} ${booking.user.lastName}`,
        guestEmail: type === 'property' ? booking.guest.email : booking.user.email,
        cancelledBy: adminId,
        reason,
        refundAmount
      }
    });

    return this.getBookingDetails(bookingId, type);
  }

  // === VISITOR TRACKING MANAGEMENT ===

  async getVisitorAnalytics(period: string = '30d', filters: any = {}): Promise<any> {
    const { startDate, endDate } = this.getPeriodDates(period);

    const baseWhere: any = {
      createdAt: { gte: startDate, lte: endDate }
    };

    if (filters.country) {
      baseWhere.country = { contains: filters.country, mode: 'insensitive' };
    }

    const [
      totalVisitors,
      uniqueVisitors,
      dailyStats,
      topCountries,
      topPages,
      browserStats,
      recentVisitors
    ] = await Promise.all([
      // Total visitors count
      prisma.visitorTracking.count({ where: baseWhere }),

      // Unique visitors (distinct IP addresses)
      prisma.visitorTracking.groupBy({
        by: ['ipAddress'],
        where: baseWhere,
        _count: { id: true }
      }),

      // Daily visitor statistics
      this.getDailyVisitorStats(startDate, endDate, filters),

      // Top countries
      prisma.visitorTracking.groupBy({
        by: ['country'],
        where: {
          ...baseWhere,
          country: { not: null }
        },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10
      }),

      // Top pages
      prisma.visitorTracking.groupBy({
        by: ['pageUrl'],
        where: {
          ...baseWhere,
          pageUrl: { not: null }
        },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10
      }),

      // Browser statistics
      this.getBrowserStats(startDate, endDate, filters),

      // Recent visitors
      prisma.visitorTracking.findMany({
        where: baseWhere,
        orderBy: { createdAt: 'desc' },
        take: 10
      })
    ]);

    const dailyAverage = dailyStats.length > 0 ?
      Math.round(dailyStats.reduce((acc: number, day: any) => acc + day.count, 0) / dailyStats.length) : 0;

    const peakDay = dailyStats.length > 0 ?
      Math.max(...dailyStats.map((d: any) => d.count)) : 0;

    return {
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        label: period
      },
      stats: {
        total: totalVisitors,
        uniqueVisitors: uniqueVisitors.length,
        dailyAverage,
        peakDay,
        perDay: dailyStats.map((stat: any) => ({
          date: stat.date,
          count: stat.count,
          views: stat.views || stat.count,
          formattedDate: this.formatDateLabel(stat.date),
          originalDate: stat.date
        })),
        topCountries: topCountries.map((item: any) => ({
          country: item.country,
          count: item._count.id
        })),
        topPages: topPages.map((item: any) => ({
          page: item.pageUrl,
          count: item._count.id
        })),
        browserStats: browserStats
      },
      visits: recentVisitors.map((visitor: any) => ({
        id: visitor.id,
        ip: visitor.ipAddress,
        location: this.formatLocation(visitor),
        timestamp: visitor.createdAt.toISOString(),
        page: visitor.pageUrl,
        duration: '0m 0s', // Duration not tracked in current schema
        browser: this.getBrowserName(visitor.userAgent)
      }))
    };
  }

  async getTestAllFetch(filters: any = {}, pagination: AdminQueryParams = {}): Promise<AdminPaginatedResponse<any>> {
    const visits = await prisma.visitorTracking.findMany();
    console.log('All Visits:', visits);
    return { data: visits, pagination: { page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrev: false }, filters, sort: { field: 'createdAt', order: 'desc' } };
  }

  async getVisitorData(filters: any = {}, pagination: AdminQueryParams = {}): Promise<AdminPaginatedResponse<any>> {
    const { page = 1, limit = 20, sort = 'createdAt', order = 'desc' } = pagination;
    const skip = (page - 1) * limit;

    const where = this.buildVisitorWhereClause(filters);

    const [visitors, total] = await Promise.all([
      prisma.visitorTracking.findMany({
        where,
        orderBy: { [sort]: order },
        skip,
        take: limit
      }),
      prisma.visitorTracking.count({ where })
    ]);

    const transformedVisitors = visitors.map((visitor: any) => ({
      id: visitor.id,
      ip_address: visitor.ipAddress,
      country: visitor.country,
      city: visitor.city,
      region: visitor.region,
      timezone: visitor.timezone,
      page_url: visitor.pageUrl,
      referrer: visitor.referrer,
      created_at: visitor.createdAt.toISOString(),
      user_agent: visitor.userAgent,
      // Processed format for frontend
      ip: visitor.ipAddress,
      location: this.formatLocation(visitor),
      timestamp: visitor.createdAt.toISOString(),
      page: visitor.pageUrl,
      browser: this.getBrowserName(visitor.userAgent)
    }));

    return {
      data: transformedVisitors,
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

  // === SERVICES MANAGEMENT ===

  async getServices(filters: any = {}, pagination: AdminQueryParams = {}): Promise<AdminPaginatedResponse<any>> {
    const { page = 1, limit = 20, sort = 'createdAt', order = 'desc' } = pagination;
    const skip = (page - 1) * limit;

    const where = this.buildServiceWhereClause(filters);

    const [services, total] = await Promise.all([
      prisma.service.findMany({
        where,
        orderBy: { [sort]: order },
        skip,
        take: limit
      }),
      prisma.service.count({ where })
    ]);

    const transformedServices = services.map((service: any) => ({
      id: service.id.toString(),
      name: service.name,
      title: service.name, // For frontend compatibility
      description: service.description,
      price: service.price,
      category: service.category,
      status: service.status,
      isActive: service.isActive,
      icon: service.icon,
      imageUrl: service.imageUrl,
      features: service.features,
      createdAt: service.createdAt.toISOString().split('T')[0],
      updatedAt: service.updatedAt?.toISOString()
    }));

    return {
      data: transformedServices,
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

  async createService(serviceData: any, adminId?: number): Promise<any> {
    const service = await prisma.service.create({
      data: {
        name: serviceData.name,
        description: serviceData.description,
        price: serviceData.price,
        category: serviceData.category,
        imageUrl: serviceData.imageUrl,
        icon: serviceData.icon,
        features: serviceData.features,
        status: serviceData.status || 'active',
        isActive: serviceData.isActive !== false
      }
    });

    await this.sendAdminNotification({
      type: 'service_created',
      title: 'New Service Created',
      message: `A new service "${serviceData.name}" has been created.`,
      severity: 'low',
      resource: {
        id: service.id,
        name: service.name,
        type: 'service' as any
      },
      metadata: {
        category: service.category,
        price: service.price,
        createdBy: adminId
      }
    });

    return this.transformServiceForFrontend(service);
  }

  async updateService(serviceId: string, updateData: any, adminId?: number): Promise<any> {
    const service = await prisma.service.update({
      where: { id: parseInt(serviceId) },
      data: {
        ...updateData,
        updatedAt: new Date()
      }
    });

    await this.sendAdminNotification({
      type: 'service_updated',
      title: 'Service Updated',
      message: `Service "${service.name}" has been updated.`,
      severity: 'low',
      resource: {
        id: service.id,
        name: service.name,
        type: 'service' as any
      },
      metadata: {
        updatedBy: adminId,
        changes: Object.keys(updateData)
      }
    });

    return this.transformServiceForFrontend(service);
  }

  async deleteService(serviceId: string, adminId?: number): Promise<{ success: boolean; message: string }> {
    const service = await prisma.service.findUnique({
      where: { id: parseInt(serviceId) }
    });

    if (!service) {
      throw new Error('Service not found');
    }

    await prisma.service.delete({
      where: { id: parseInt(serviceId) }
    });

    await this.sendAdminNotification({
      type: 'service_deleted',
      title: 'Service Deleted',
      message: `Service "${service.name}" has been permanently deleted.`,
      severity: 'medium',
      resource: {
        id: service.id,
        name: service.name,
        type: 'service' as any
      },
      metadata: {
        deletedBy: adminId
      }
    });

    return {
      success: true,
      message: 'Service deleted successfully'
    };
  }

  // === PRODUCTS MANAGEMENT ===

  async getProducts(filters: any = {}, pagination: AdminQueryParams = {}): Promise<AdminPaginatedResponse<any>> {
    const { page = 1, limit = 20, sort = 'createdAt', order = 'desc' } = pagination;
    const skip = (page - 1) * limit;

    const where = this.buildProductWhereClause(filters);

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy: { [sort]: order },
        skip,
        take: limit
      }),
      prisma.product.count({ where })
    ]);

    const transformedProducts = products.map((product: any) => ({
      id: product.id,
      name: product.name,
      description: product.description,
      price: product.price,
      category: product.category,
      isAvailable: product.isAvailable,
      imageUrl: product.imageUrl,
      siteUrl: product.siteUrl,
      createdAt: product.createdAt?.toISOString(),
      updatedAt: product.updatedAt?.toISOString()
    }));

    return {
      data: transformedProducts,
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

  async createProduct(productData: any, adminId?: number): Promise<any> {
    const product = await prisma.product.create({
      data: {
        name: productData.name,
        description: productData.description,
        price: productData.price,
        category: productData.category,
        imageUrl: productData.imageUrl,
        siteUrl: productData.siteUrl,
        isAvailable: productData.isAvailable !== false
      }
    });

    await this.sendAdminNotification({
      type: 'product_created',
      title: 'New Product Created',
      message: `A new product "${productData.name}" has been created.`,
      severity: 'low',
      resource: {
        id: product.id,
        name: product.name,
        type: 'product' as any
      },
      metadata: {
        category: product.category,
        price: product.price,
        createdBy: adminId
      }
    });

    return this.transformProductForFrontend(product);
  }

  async updateProduct(productId: string, updateData: any, adminId?: number): Promise<any> {
    const product = await prisma.product.update({
      where: { id: parseInt(productId) },
      data: {
        ...updateData,
        updatedAt: new Date()
      }
    });

    await this.sendAdminNotification({
      type: 'product_updated',
      title: 'Product Updated',
      message: `Product "${product.name}" has been updated.`,
      severity: 'low',
      resource: {
        id: product.id,
        name: product.name,
        type: 'product' as any
      },
      metadata: {
        updatedBy: adminId,
        changes: Object.keys(updateData)
      }
    });

    return this.transformProductForFrontend(product);
  }

  async deleteProduct(id: any, adminId: any): Promise<any> {
    const product = await prisma.product.findUnique({
      where: { id }
    });

    if (!product) {
      throw new Error('Product not found');
    }

    const deletedProduct = await prisma.product.delete({
      where: { id }
    });

    await this.sendAdminNotification({
      type: 'product_deleted',
      title: 'Product Deleted',
      message: `Product "${product.name}" has been permanently deleted.`,
      severity: 'medium',
      resource: {
        id: product.id,
        name: product.name,
        type: 'product' as any
      },
      metadata: {
        deletedBy: adminId
      }
    });

    return deletedProduct;
  }

  // === CONTACT MESSAGES MANAGEMENT ===

  async getContactMessages(filters: any = {}, pagination: AdminQueryParams = {}): Promise<AdminPaginatedResponse<any> | any> {
    const { page = 1, limit = 20, sort = 'createdAt', order = 'desc' } = pagination;
    const skip = (page - 1) * limit;

    const where = this.buildContactMessageWhereClause(filters);

    const [messages, total, stats] = await Promise.all([
      prisma.contactMessage.findMany({
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
      prisma.contactMessage.count({ where }),
      this.getContactMessageStats()
    ]);

    const transformedMessages = messages.map((message: any) => ({
      id: message.id.toString(),
      name: message.name,
      email: message.email,
      phone: message.phoneNumber,
      subject: message.subject,
      message: message.message,
      status: this.getMessageStatus(message),
      createdAt: message.createdAt?.toISOString(),
      repliedAt: message.repliedAt?.toISOString(),
      adminReply: message.adminReply,
      isResolved: message.isResolved,
      user: message.user ? {
        name: `${message.user.firstName} ${message.user.lastName}`,
        email: message.user.email
      } : null
    }));

    return {
      data: transformedMessages,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      },
      filters,
      sort: { field: sort, order },
      stats
    };
  }

  async replyToContactMessage(messageId: string, reply: string, adminId: number): Promise<any> {
    const message = await prisma.contactMessage.findUnique({
      where: { id: parseInt(messageId) }
    });

    if (!message) {
      throw new Error('Contact message not found');
    }

    const updatedMessage = await prisma.contactMessage.update({
      where: { id: parseInt(messageId) },
      data: {
        adminReply: reply,
        repliedAt: new Date(),
        isResolved: false, // Mark as replied but not closed
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

    await this.sendAdminNotification({
      type: 'contact_replied',
      title: 'Contact Message Replied',
      message: `Admin has replied to a contact message from ${message.name}.`,
      severity: 'low',
      resource: {
        id: messageId,
        name: `Message from ${message.name}`,
        type: 'contact' as any
      },
      metadata: {
        senderName: message.name,
        senderEmail: message.email,
        subject: message.subject,
        repliedBy: adminId
      }
    });

    return this.transformContactMessageForFrontend(updatedMessage);
  }

  async updateContactMessageStatus(messageId: string, status: 'new' | 'replied' | 'closed', adminId?: number): Promise<any> {
    const updateData: any = { updatedAt: new Date() };

    switch (status) {
      case 'new':
        updateData.isResolved = false;
        updateData.adminReply = null;
        updateData.repliedAt = null;
        break;
      case 'replied':
        // Status will be set when admin reply is added
        break;
      case 'closed':
        updateData.isResolved = true;
        break;
    }

    const message = await prisma.contactMessage.update({
      where: { id: parseInt(messageId) },
      data: updateData
    });

    if (status === 'closed') {
      await this.sendAdminNotification({
        type: 'contact_closed',
        title: 'Contact Message Closed',
        message: `A contact message has been marked as resolved and closed.`,
        severity: 'low',
        resource: {
          id: messageId,
          name: `Message from ${message.name}`,
          type: 'contact' as any
        },
        metadata: {
          senderName: message.name,
          senderEmail: message.email,
          closedBy: adminId
        }
      });
    }

    return this.transformContactMessageForFrontend(message);
  }

  // === PARTNERS MANAGEMENT ===

  async getPartners(pagination: AdminQueryParams = {}): Promise<AdminPaginatedResponse<any>> {
    const { page = 1, limit = 20, sort = 'createdAt', order = 'desc' } = pagination;
    const skip = (page - 1) * limit;

    const [partners, total] = await Promise.all([
      prisma.partner.findMany({
        orderBy: { [sort]: order },
        skip,
        take: limit
      }),
      prisma.partner.count()
    ]);

    const transformedPartners = partners.map((partner: any) => ({
      id: partner.id,
      name: partner.name,
      description: partner.description,
      logoUrl: partner.logoUrl,
      websiteUrl: partner.websiteUrl,
      contactEmail: partner.contactEmail,
      isVisible: partner.isVisible,
      createdAt: partner.createdAt.toISOString(),
      updatedAt: partner.updatedAt.toISOString()
    }));

    return {
      data: transformedPartners,
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

  async createPartner(partnerData: any, adminId: any): Promise<any> {
    const partner = await prisma.partner.create({
      data: {
        ...partnerData,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });

    await this.sendAdminNotification({
      type: 'partner_created',
      title: 'New Partner Added',
      message: `A new partner "${partnerData.name}" has been added to the platform.`,
      severity: 'low',
      resource: {
        id: partner.id,
        name: partner.name,
        type: 'partner' as any
      },
      metadata: {
        websiteUrl: partner.websiteUrl,
        contactEmail: partner.contactEmail,
        createdBy: adminId
      }
    });

    return partner;
  }

  async deletePartner(id: any, adminId: any): Promise<any> {
    const partner = await prisma.partner.findUnique({
      where: { id }
    });

    if (!partner) {
      throw new Error('Partner not found');
    }

    const deletedPartner = await prisma.partner.delete({
      where: { id }
    });

    await this.sendAdminNotification({
      type: 'partner_deleted',
      title: 'Partner Removed',
      message: `Partner "${partner.name}" has been removed from the platform.`,
      severity: 'medium',
      resource: {
        id: partner.id,
        name: partner.name,
        type: 'partner' as any
      },
      metadata: {
        deletedBy: adminId
      }
    });

    return deletedPartner;
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

  async moderateReview(reviewId: string, type: 'property' | 'tour', action: 'approve' | 'hide' | 'delete', reason?: string, adminId?: number): Promise<{ success: boolean; message: string }> {
    let review: any;
    let resourceName: string;

    // Get review details for notification
    if (type === 'property') {
      review = await prisma.review.findUnique({
        where: { id: reviewId },
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
        }
      });
      resourceName = review?.property?.name || 'Unknown Property';
    } else {
      review = await prisma.tourReview.findUnique({
        where: { id: reviewId },
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
        }
      });
      resourceName = review?.tour?.title || 'Unknown Tour';
    }

    if (!review) {
      throw new Error('Review not found');
    }

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

      await this.sendAdminNotification({
        type: 'review_deleted',
        title: 'Review Deleted',
        message: `A review has been permanently deleted by an administrator.`,
        severity: 'medium',
        reason,
        resource: {
          id: reviewId,
          name: `Review for ${resourceName}`,
          type: 'review' as any
        },
        metadata: {
          reviewType: type,
          resourceName,
          reviewerName: `${review.user.firstName} ${review.user.lastName}`,
          reviewerEmail: review.user.email,
          deletedBy: adminId,
          reason
        }
      });

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

      await this.sendAdminNotification({
        type: 'review_moderated',
        title: `Review ${action.charAt(0).toUpperCase() + action.slice(1)}d`,
        message: `A review has been ${action}d by an administrator.`,
        severity: action === 'hide' ? 'medium' : 'low',
        reason,
        resource: {
          id: reviewId,
          name: `Review for ${resourceName}`,
          type: 'review' as any
        },
        metadata: {
          action,
          reviewType: type,
          resourceName,
          reviewerName: `${review.user.firstName} ${review.user.lastName}`,
          reviewerEmail: review.user.email,
          moderatedBy: adminId,
          reason
        }
      });

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
    const transaction: any = await prisma.escrowTransaction.findUnique({
      where: { id: transactionId },
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

    if (!transaction) {
      throw new Error('Escrow transaction not found');
    }

    const updatedTransaction = await prisma.escrowTransaction.update({
      where: { id: transactionId },
      data: {
        status: 'COMPLETED',
        releasedAt: new Date(),
        releasedBy: adminId,
        releaseReason,
        updatedAt: new Date()
      }
    });

    await this.sendAdminNotification({
      type: 'escrow_released',
      title: 'Escrow Funds Released',
      message: `Escrow funds of RWF ${transaction.amount.toLocaleString()} have been released by administrator.`,
      severity: 'medium',
      reason: releaseReason,
      resource: {
        id: transactionId,
        name: `Escrow Transaction ${transactionId}`,
        type: 'transaction'
      },
      metadata: {
        amount: transaction.amount,
        currency: transaction.currency,
        fromUser: `${transaction.user.firstName} ${transaction.user.lastName}`,
        toUser: transaction.recipient ? `${transaction.recipient.firstName} ${transaction.recipient.lastName}` : 'N/A',
        releasedBy: adminId,
        releaseReason
      }
    });

    // Transform and return
    return {
      id: updatedTransaction.id,
      userId: updatedTransaction.userId,
      userName: `${transaction.user.firstName} ${transaction.user.lastName}`,
      userEmail: transaction.user.email,
      recipientId: updatedTransaction.recipientId,
      recipientName: transaction.recipient ? `${transaction.recipient.firstName} ${transaction.recipient.lastName}` : undefined,
      recipientEmail: transaction.recipient?.email,
      type: updatedTransaction.type,
      amount: updatedTransaction.amount,
      currency: updatedTransaction.currency,
      status: updatedTransaction.status,
      reference: updatedTransaction.reference,
      description: updatedTransaction.description,
      escrowId: updatedTransaction.escrowId,
      fundedAt: updatedTransaction.fundedAt?.toISOString(),
      releasedAt: updatedTransaction.releasedAt?.toISOString(),
      releasedBy: updatedTransaction.releasedBy,
      releaseReason: updatedTransaction.releaseReason,
      disputedAt: updatedTransaction.disputedAt?.toISOString(),
      disputedBy: updatedTransaction.disputedBy,
      disputeReason: updatedTransaction.disputeReason,
      resolvedAt: updatedTransaction.resolvedAt?.toISOString(),
      cancelledAt: updatedTransaction.cancelledAt?.toISOString(),
      cancellationReason: updatedTransaction.cancellationReason,
      createdAt: updatedTransaction.createdAt.toISOString(),
      metadata: updatedTransaction.metadata
    };
  }

  async disputeEscrow(transactionId: string, disputeReason: string, adminId?: number): Promise<AdminEscrowTransaction> {
    const transaction: any = await prisma.escrowTransaction.findUnique({
      where: { id: transactionId },
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

    if (!transaction) {
      throw new Error('Escrow transaction not found');
    }

    const updatedTransaction = await prisma.escrowTransaction.update({
      where: { id: transactionId },
      data: {
        status: 'DISPUTED',
        disputedAt: new Date(),
        disputeReason,
        updatedAt: new Date()
      }
    });

    // Send critical alert for dispute
    await this.sendCriticalAlert({
      id: `escrow-dispute-${transactionId}`,
      type: 'critical',
      title: 'Escrow Transaction Disputed',
      message: `Escrow transaction of RWF ${transaction.amount.toLocaleString()} has been marked as disputed and requires immediate resolution.`,
      createdAt: new Date().toISOString(),
      isRead: false,
      severity: 'critical',
      actionRequired: true
    });

    return {
      id: updatedTransaction.id,
      userId: updatedTransaction.userId,
      userName: `${transaction.user.firstName} ${transaction.user.lastName}`,
      userEmail: transaction.user.email,
      recipientId: updatedTransaction.recipientId,
      recipientName: transaction.recipient ? `${transaction.recipient.firstName} ${transaction.recipient.lastName}` : undefined,
      recipientEmail: transaction.recipient?.email,
      type: updatedTransaction.type,
      amount: updatedTransaction.amount,
      currency: updatedTransaction.currency,
      status: updatedTransaction.status,
      reference: updatedTransaction.reference,
      description: updatedTransaction.description,
      escrowId: updatedTransaction.escrowId,
      fundedAt: updatedTransaction.fundedAt?.toISOString(),
      releasedAt: updatedTransaction.releasedAt?.toISOString(),
      releasedBy: updatedTransaction.releasedBy,
      releaseReason: updatedTransaction.releaseReason,
      disputedAt: updatedTransaction.disputedAt?.toISOString(),
      disputedBy: updatedTransaction.disputedBy,
      disputeReason: updatedTransaction.disputeReason,
      resolvedAt: updatedTransaction.resolvedAt?.toISOString(),
      cancelledAt: updatedTransaction.cancelledAt?.toISOString(),
      cancellationReason: updatedTransaction.cancellationReason,
      createdAt: updatedTransaction.createdAt.toISOString(),
      metadata: updatedTransaction.metadata
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

  async approveWithdrawal(withdrawalId: string, adminId?: number): Promise<AdminWithdrawalRequest> {
    const withdrawal: any = await prisma.withdrawalRequest.findUnique({
      where: { id: withdrawalId },
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

    if (!withdrawal) {
      throw new Error('Withdrawal request not found');
    }

    const updatedWithdrawal = await prisma.withdrawalRequest.update({
      where: { id: withdrawalId },
      data: {
        status: 'APPROVED',
        completedAt: new Date(),
        updatedAt: new Date()
      }
    });

    await this.sendAdminNotification({
      type: 'withdrawal_approved',
      title: 'Withdrawal Request Approved',
      message: `Withdrawal request of RWF ${withdrawal.amount.toLocaleString()} has been approved for processing.`,
      severity: 'low',
      resource: {
        id: withdrawalId,
        name: `Withdrawal ${withdrawalId}`,
        type: 'transaction'
      },
      metadata: {
        amount: withdrawal.amount,
        currency: withdrawal.currency,
        method: withdrawal.method,
        userName: `${withdrawal.user.firstName} ${withdrawal.user.lastName}`,
        userEmail: withdrawal.user.email,
        approvedBy: adminId
      }
    });

    return {
      id: updatedWithdrawal.id,
      userId: updatedWithdrawal.userId,
      userName: `${withdrawal.user.firstName} ${withdrawal.user.lastName}`,
      userEmail: withdrawal.user.email,
      amount: updatedWithdrawal.amount,
      currency: updatedWithdrawal.currency,
      method: updatedWithdrawal.method,
      status: updatedWithdrawal.status,
      destination: updatedWithdrawal.destination,
      reference: updatedWithdrawal.reference,
      failureReason: updatedWithdrawal.failureReason,
      createdAt: updatedWithdrawal.createdAt.toISOString(),
      completedAt: updatedWithdrawal.completedAt?.toISOString()
    };
  }

  async rejectWithdrawal(withdrawalId: string, reason: string, adminId?: number): Promise<AdminWithdrawalRequest> {
    const withdrawal: any = await prisma.withdrawalRequest.findUnique({
      where: { id: withdrawalId },
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

    if (!withdrawal) {
      throw new Error('Withdrawal request not found');
    }

    const updatedWithdrawal = await prisma.withdrawalRequest.update({
      where: { id: withdrawalId },
      data: {
        status: 'REJECTED',
        failureReason: reason,
        updatedAt: new Date()
      }
    });

    await this.sendAdminNotification({
      type: 'withdrawal_rejected',
      title: 'Withdrawal Request Rejected',
      message: `Withdrawal request of RWF ${withdrawal.amount.toLocaleString()} has been rejected.`,
      severity: 'medium',
      reason,
      resource: {
        id: withdrawalId,
        name: `Withdrawal ${withdrawalId}`,
        type: 'transaction'
      },
      metadata: {
        amount: withdrawal.amount,
        currency: withdrawal.currency,
        method: withdrawal.method,
        userName: `${withdrawal.user.firstName} ${withdrawal.user.lastName}`,
        userEmail: withdrawal.user.email,
        rejectedBy: adminId,
        reason
      }
    });

    return {
      id: updatedWithdrawal.id,
      userId: updatedWithdrawal.userId,
      userName: `${withdrawal.user.firstName} ${withdrawal.user.lastName}`,
      userEmail: withdrawal.user.email,
      amount: updatedWithdrawal.amount,
      currency: updatedWithdrawal.currency,
      method: updatedWithdrawal.method,
      status: updatedWithdrawal.status,
      destination: updatedWithdrawal.destination,
      reference: updatedWithdrawal.reference,
      failureReason: updatedWithdrawal.failureReason,
      createdAt: updatedWithdrawal.createdAt.toISOString(),
      completedAt: updatedWithdrawal.completedAt?.toISOString()
    };
  }

  // === CONTENT MANAGEMENT (ORIGINAL METHODS) ===

  async respondToContact(contactId: string, response: string, adminId: number): Promise<any> {
    const contact = await prisma.contactMessage.update({
      where: { id: Number(contactId) },
      data: {
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

    await this.sendAdminNotification({
      type: 'bulk_operation',
      title: 'Bulk User Update Completed',
      message: `${result.count} users have been updated in a bulk operation.`,
      severity: 'medium',
      metadata: {
        operation: 'bulk_update_users',
        affected: result.count,
        updates: Object.keys(updates)
      }
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

    await this.sendAdminNotification({
      type: 'bulk_operation',
      title: 'Bulk User Deletion Completed',
      message: `${result.count} users have been soft-deleted in a bulk operation.`,
      severity: 'high',
      metadata: {
        operation: 'bulk_delete_users',
        affected: result.count
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

      await this.sendAdminNotification({
        type: 'data_export',
        title: 'Data Export Completed',
        message: `Data export of ${data.length} ${type} records has been completed.`,
        severity: 'low',
        metadata: {
          exportType: type,
          format,
          recordCount: data.length,
          filename
        }
      });

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

    await this.sendAdminNotification({
      type: 'settings_updated',
      title: 'System Settings Updated',
      message: `System settings have been updated by an administrator.`,
      severity: 'medium',
      metadata: {
        updatedFields: Object.keys(settings)
      }
    });

    return updatedSettings;
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

  async terminateUserSession(sessionId: string, adminId?: number): Promise<{ success: boolean; message: string }> {
    const session = await prisma.userSession.findUnique({
      where: { id: sessionId },
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

    if (!session) {
      throw new Error('Session not found');
    }

    await prisma.userSession.update({
      where: { id: sessionId },
      data: {
        isActive: false,
        updatedAt: new Date()
      }
    });

    await this.sendAdminNotification({
      type: 'session_terminated',
      title: 'User Session Terminated',
      message: `A user session has been terminated by an administrator.`,
      severity: 'medium',
      resource: {
        id: sessionId,
        name: `Session for ${session.user.firstName} ${session.user.lastName}`,
        type: 'session' as any
      },
      metadata: {
        userName: `${session.user.firstName} ${session.user.lastName}`,
        userEmail: session.user.email,
        terminatedBy: adminId
      }
    });

    return {
      success: true,
      message: 'Session terminated successfully'
    };
  }

  async terminateAllUserSessions(userId: number, adminId?: number): Promise<{ success: boolean; message: string; count: number }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        firstName: true,
        lastName: true,
        email: true
      }
    });

    if (!user) {
      throw new Error('User not found');
    }

    const result = await prisma.userSession.updateMany({
      where: { userId, isActive: true },
      data: {
        isActive: false,
        updatedAt: new Date()
      }
    });

    await this.sendAdminNotification({
      type: 'all_sessions_terminated',
      title: 'All User Sessions Terminated',
      message: `All active sessions for user ${user.firstName} ${user.lastName} have been terminated.`,
      severity: 'high',
      resource: {
        id: userId,
        name: `${user.firstName} ${user.lastName}`,
        type: 'user'
      },
      metadata: {
        userName: `${user.firstName} ${user.lastName}`,
        userEmail: user.email,
        sessionsTerminated: result.count,
        terminatedBy: adminId
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
    const { page = 1, limit = 20, sort = 'createdAt', order = 'desc' } = pagination;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (filters.action) {
      where.action = { contains: filters.action, mode: 'insensitive' };
    }
    if (filters.resourceType) {
      where.resourceType = filters.resourceType;
    }
    if (filters.userId) {
      where.userId = filters.userId;
    }
    if (filters.dateRange) {
      where.createdAt = {
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

  // === NEWSLETTER MANAGEMENT ===

  async getNewsletterSubscriptions(pagination: AdminQueryParams = {}): Promise<AdminPaginatedResponse<any>> {
    const { page = 1, limit = 20, sort = 'subscribedAt', order = 'desc' } = pagination;
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
      where: { id: walletId },
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

    await this.sendAdminNotification({
      type: 'wallet_adjustment',
      title: 'Wallet Balance Adjusted',
      message: `Wallet balance has been ${amount > 0 ? 'increased' : 'decreased'} by RWF ${Math.abs(amount).toLocaleString()}.`,
      severity: 'high',
      reason,
      resource: {
        id: walletId,
        name: `Wallet for ${wallet.user.firstName} ${wallet.user.lastName}`,
        type: 'wallet' as any
      },
      metadata: {
        userName: `${wallet.user.firstName} ${wallet.user.lastName}`,
        userEmail: wallet.user.email,
        previousBalance: wallet.balance,
        adjustment: amount,
        newBalance,
        adjustedBy: adminId,
        reason
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

    // Send critical alert if critical issues found
    const criticalIssues = issues.filter(issue => issue.severity === 'critical');
    if (criticalIssues.length > 0) {
      await this.sendCriticalAlert({
        id: `data-integrity-${Date.now()}`,
        type: 'critical',
        title: 'Data Integrity Issues Detected',
        message: `${criticalIssues.length} critical data integrity issue(s) have been detected and require immediate attention.`,
        createdAt: new Date().toISOString(),
        isRead: false,
        severity: 'critical',
        actionRequired: true
      });
    }

    return {
      totalIssues: issues.length,
      issues,
      lastChecked: new Date().toISOString()
    };
  }

  async fixDataIntegrityIssue(issueType: string, adminId?: number): Promise<{ success: boolean; message: string; fixed: number }> {
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

    await this.sendAdminNotification({
      type: 'integrity_issue_fixed',
      title: 'Data Integrity Issue Resolved',
      message: `Data integrity issue "${issueType}" has been resolved. ${fixed} records were fixed.`,
      severity: 'low',
      metadata: {
        issueType,
        recordsFixed: fixed,
        fixedBy: adminId
      }
    });

    return {
      success: true,
      message: `Fixed ${fixed} instances of ${issueType}`,
      fixed
    };
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

  async createMarketData(data: any, adminId?: number): Promise<any> {
    const marketData = await prisma.marketData.create({
      data: {
        ...data,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });

    return marketData;
  }

  async updateMarketData(id: string, data: any, adminId?: number): Promise<any> {
    return await prisma.marketData.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date()
      }
    });
  }

  // === DAILY/WEEKLY REPORTING ===

  async sendDailyDigest(): Promise<void> {
    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

    const [
      newUsers,
      newProperties,
      newBookings,
      pendingApprovals,
      disputes,
      revenue
    ] = await Promise.all([
      this.getNewUsers(yesterday, today),
      this.getNewProperties(yesterday, today),
      this.getNewBookings(yesterday, today),
      this.getPendingApprovals(),
      this.getOpenDisputes(),
      this.getDailyRevenue(yesterday, today)
    ]);

    const alerts = await this.generateSystemAlerts();
    const actions = await this.getPendingActions();

    try {
      await this.mailingService.sendAdminDailyDigest(this.adminEmail, {
        date: today.toLocaleDateString(),
        metrics: {
          newUsers,
          newProperties,
          newBookings,
          pendingApprovals,
          disputes,
          revenue
        },
        alerts: alerts.map(alert => ({
          type: alert.type || 'system',
          message: alert.message,
          severity: alert.severity
        })),
        actions: actions.map(action => ({
          type: action.type,
          description: action.description,
          url: action.url
        }))
      });
    } catch (error) {
      console.error('Failed to send daily digest:', error);
    }
  }

  async sendWeeklyReport(): Promise<void> {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [summary, trends, issues] = await Promise.all([
      this.getWeeklySummary(startDate, endDate),
      this.getWeeklyTrends(startDate, endDate),
      this.getSystemIssues()
    ]);

    try {
      await this.mailingService.sendAdminWeeklyReport(this.adminEmail, {
        week: `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`,
        summary,
        trends,
        issues
      });
    } catch (error) {
      console.error('Failed to send weekly report:', error);
    }
  }

  // === NOTIFICATION HELPERS ===

  private async sendAdminNotification(notification: {
    type: string;
    title: string;
    message: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    reason?: string;
    resource?: {
      id: string | number;
      name: string | any;
      type: 'property' | 'tour' | 'booking' | 'user' | 'transaction';
    };
    metadata?: Record<string, any>;
  }): Promise<void> {
    try {
      await this.mailingService.sendAdminNotification({
        admin: {
          email: this.adminEmail,
          firstName: 'Admin',
          lastName: 'Team'
        },
        company: this.companyInfo,
        notification: {
          ...notification,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Failed to send admin notification:', error);
    }
  }

  private async sendCriticalAlert(alert: AdminAlert): Promise<void> {
    try {
      await this.mailingService.sendAdminCriticalAlert({
        admin: {
          email: this.adminEmail,
          firstName: 'Admin',
          lastName: 'Team'
        },
        company: this.companyInfo,
        alert: {
          type: alert.type || 'system_alert',
          title: alert.title,
          message: alert.message,
          severity: 'critical',
          timestamp: alert.createdAt,
          actionRequired: alert.actionRequired
        }
      });
    } catch (error) {
      console.error('Failed to send critical alert:', error);
    }
  }

  // === HELPER METHODS FOR REPORTING ===

  private async getNewProperties(startDate: Date, endDate: Date): Promise<number> {
    return await prisma.property.count({
      where: {
        createdAt: { gte: startDate, lte: endDate }
      }
    });
  }

  private async getNewBookings(startDate: Date, endDate: Date): Promise<number> {
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

  private async getPendingApprovals(): Promise<number> {
    const [pendingKYC, pendingProperties, pendingTours] = await Promise.all([
      prisma.user.count({ where: { kycStatus: 'pending' } }),
      prisma.property.count({ where: { status: 'pending' } }),
      prisma.tour.count({ where: { isActive: false } })
    ]);
    return pendingKYC + pendingProperties + pendingTours;
  }

  private async getDailyRevenue(startDate: Date, endDate: Date): Promise<number> {
    const payments = await prisma.paymentTransaction.aggregate({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        status: 'completed'
      },
      _sum: { amount: true }
    });
    return payments._sum.amount || 0;
  }

  private async getPendingActions(): Promise<Array<{ type: string; description: string; url: string }>> {
    return [
      {
        type: 'kyc_review',
        description: 'Review pending KYC applications',
        url: 'https://app.jambolush.com/admin/users?filter=pending_kyc'
      },
      {
        type: 'property_review',
        description: 'Review pending property listings',
        url: 'https://app.jambolush.com/admin/properties?filter=pending'
      }
    ];
  }

  private async getWeeklySummary(startDate: Date, endDate: Date): Promise<any> {
    const [totalUsers, totalProperties, totalRevenue] = await Promise.all([
      prisma.user.count(),
      prisma.property.count(),
      this.getDailyRevenue(startDate, endDate)
    ]);

    const previousWeekStart = new Date(startDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    const [previousUsers, previousProperties, previousRevenue] = await Promise.all([
      prisma.user.count({ where: { createdAt: { lt: startDate } } }),
      prisma.property.count({ where: { createdAt: { lt: startDate } } }),
      this.getDailyRevenue(previousWeekStart, startDate)
    ]);

    return {
      totalUsers,
      totalProperties,
      totalRevenue,
      growth: {
        users: this.calculateGrowth(totalUsers, previousUsers),
        properties: this.calculateGrowth(totalProperties, previousProperties),
        revenue: this.calculateGrowth(totalRevenue, previousRevenue)
      }
    };
  }

  private async getWeeklyTrends(startDate: Date, endDate: Date): Promise<any[]> {
    return [
      {
        metric: 'User Registrations',
        value: await this.getNewUsers(startDate, endDate),
        change: 15,
        trend: 'up'
      },
      {
        metric: 'Property Listings',
        value: await this.getNewProperties(startDate, endDate),
        change: 8,
        trend: 'up'
      }
    ];
  }

  private async getSystemIssues(): Promise<any[]> {
    const [disputedTransactions, suspendedUsers, rejectedProperties] = await Promise.all([
      prisma.escrowTransaction.count({ where: { status: 'DISPUTED' } }),
      prisma.user.count({ where: { status: 'suspended' } }),
      prisma.property.count({ where: { status: 'rejected' } })
    ]);

    const issues = [];

    if (disputedTransactions > 0) {
      issues.push({
        type: 'disputed_transactions',
        description: 'Escrow transactions require dispute resolution',
        severity: 'high',
        count: disputedTransactions
      });
    }

    if (suspendedUsers > 10) {
      issues.push({
        type: 'suspended_users',
        description: 'High number of suspended user accounts',
        severity: 'medium',
        count: suspendedUsers
      });
    }

    return issues;
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

  private async getDailyVisitorStats(startDate: Date, endDate: Date, filters: any = {}): Promise<any[]> {
    const visitors = await prisma.visitorTracking.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        ...(filters.country && { country: { contains: filters.country, mode: 'insensitive' } })
      },
      select: {
        createdAt: true
      }
    });

    const dailyStats = new Map<string, { count: number; views: number }>();

    visitors.forEach(visitor => {
      const date = visitor.createdAt?.toISOString().split('T')[0] || '';
      const existing = dailyStats.get(date) || { count: 0, views: 0 };
      dailyStats.set(date, { count: existing.count + 1, views: existing.views + 1 });
    });

    return Array.from(dailyStats.entries())
      .map(([date, stats]) => ({ date, ...stats }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  private async getBrowserStats(startDate: Date, endDate: Date, filters: any = {}): Promise<any[]> {
    const visitors = await prisma.visitorTracking.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        userAgent: { not: null },
        ...(filters.country && { country: { contains: filters.country, mode: 'insensitive' } })
      },
      select: {
        userAgent: true
      }
    });

    const browserCount = new Map<string, number>();

    visitors.forEach(visitor => {
      const browser = this.getBrowserName(visitor.userAgent);
      browserCount.set(browser, (browserCount.get(browser) || 0) + 1);
    });

    return Array.from(browserCount.entries())
      .map(([browser, count]) => ({ browser, count }))
      .sort((a, b) => b.count - a.count);
  }

  private getBrowserName(userAgent: string | null): string {
    if (!userAgent) return 'Unknown';

    if (userAgent.includes('Chrome')) return 'Chrome';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) return 'Safari';
    if (userAgent.includes('Edge')) return 'Edge';
    return 'Other';
  }

  private formatLocation(visitor: any): string {
    if (visitor.city && visitor.country) {
      return `${visitor.city}, ${visitor.country}`;
    }
    if (visitor.country) {
      return visitor.country;
    }
    return 'Unknown';
  }

  private formatDateLabel(dateString: string): string {
    const date = new Date(dateString);
    const today = new Date();
    const diffDays = Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return date.toLocaleDateString('en-US', { weekday: 'short' });
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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

  private buildVisitorWhereClause(filters: any): any {
    const where: any = {};

    if (filters.country) {
      where.country = { contains: filters.country, mode: 'insensitive' };
    }

    if (filters.startDate) {
      where.createdAt = { gte: new Date(filters.startDate) };
    }

    if (filters.endDate) {
      where.createdAt = { ...where.createdAt, lte: new Date(filters.endDate) };
    }

    if (filters.ipAddress) {
      where.ipAddress = { contains: filters.ipAddress };
    }

    if (filters.pageUrl) {
      where.pageUrl = { contains: filters.pageUrl, mode: 'insensitive' };
    }

    return where;
  }

  private buildServiceWhereClause(filters: any): any {
    const where: any = {};

    if (filters.category && filters.category !== 'all') {
      where.category = filters.category;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.activeOnly) {
      where.isActive = true;
    }

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } }
      ];
    }

    return where;
  }

  private buildProductWhereClause(filters: any): any {
    const where: any = {};

    if (filters.category) {
      where.category = filters.category;
    }

    if (filters.availableOnly) {
      where.isAvailable = true;
    }

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } }
      ];
    }

    return where;
  }

  private buildContactMessageWhereClause(filters: any): any {
    const where: any = {};

    if (filters.status && filters.status !== 'all') {
      switch (filters.status) {
        case 'new':
          where.isResolved = false;
          where.adminReply = null;
          break;
        case 'replied':
          where.adminReply = { not: null };
          where.isResolved = false;
          break;
        case 'closed':
          where.isResolved = true;
          break;
      }
    }

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
        { message: { contains: filters.search, mode: 'insensitive' } }
      ];
    }

    return where;
  }

  private buildSelectFields(columns?: string[], entityType?: string): any {
    if (!columns || columns.length === 0) {
      return undefined;
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

  private getMessageStatus(message: any): 'new' | 'replied' | 'closed' {
    if (message.isResolved) return 'closed';
    if (message.adminReply) return 'replied';
    return 'new';
  }

  private async getContactMessageStats(): Promise<any> {
    const stats = await prisma.contactMessage.aggregate({
      _count: {
        id: true
      }
    });

    const [newCount, repliedCount, closedCount] = await Promise.all([
      prisma.contactMessage.count({
        where: { isResolved: false, adminReply: null }
      }),
      prisma.contactMessage.count({
        where: { adminReply: { not: null }, isResolved: false }
      }),
      prisma.contactMessage.count({
        where: { isResolved: true }
      })
    ]);

    return {
      total: stats._count.id,
      new: newCount,
      replied: repliedCount,
      closed: closedCount
    };
  }

  private transformServiceForFrontend(service: any): any {
    return {
      id: service.id.toString(),
      name: service.name,
      title: service.name,
      description: service.description,
      price: service.price,
      category: service.category,
      status: service.status,
      isActive: service.isActive,
      icon: service.icon,
      imageUrl: service.imageUrl,
      features: service.features,
      createdAt: service.createdAt.toISOString().split('T')[0],
      updatedAt: service.updatedAt?.toISOString()
    };
  }

  private transformProductForFrontend(product: any): any {
    return {
      id: product.id,
      name: product.name,
      description: product.description,
      price: product.price,
      category: product.category,
      isAvailable: product.isAvailable,
      imageUrl: product.imageUrl,
      siteUrl: product.siteUrl,
      createdAt: product.createdAt?.toISOString(),
      updatedAt: product.updatedAt?.toISOString()
    };
  }

  private transformContactMessageForFrontend(message: any): any {
    return {
      id: message.id.toString(),
      name: message.name,
      email: message.email,
      phone: message.phoneNumber,
      subject: message.subject,
      message: message.message,
      status: this.getMessageStatus(message),
      createdAt: message.createdAt?.toISOString(),
      repliedAt: message.repliedAt?.toISOString(),
      adminReply: message.adminReply,
      isResolved: message.isResolved,
      user: message.user ? {
        name: `${message.user.firstName} ${message.user.lastName}`,
        email: message.user.email
      } : null
    };
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
    return {
      users: 0,
      properties: 0,
      tours: 0,
      revenue: 0
    };
  }

  private async generateSystemAlerts(): Promise<AdminAlert[]> {
    const alerts: AdminAlert[] = [];

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

    const failedPayments = await prisma.paymentTransaction.count({
      where: {
        status: 'failed',
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }
    });

    if (failedPayments > 20) {
      alerts.push({
        id: 'high-payment-failures',
        type: 'critical',
        title: 'High Payment Failure Rate',
        message: `${failedPayments} payment failures in the last 24 hours`,
        createdAt: new Date().toISOString(),
        isRead: false,
        severity: 'critical',
        actionRequired: true
      });
    }

    return alerts;
  }

  private async getRecentActivity(limit: number): Promise<AdminActivity[]> {
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
      occupancyRate: 0,
      averageStayDuration: 0,
      cancellationRate: 0,
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

    const previousPeriod = this.getPeriodDates('30d');
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
      growth: 0
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
      growth: 0
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
      growth: 0
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
      averageProcessingTime: 0,
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
    const dailyTrends = await this.getDailyTrends(startDate, endDate);
    const monthlyTrends = await this.getMonthlyTrends(startDate, endDate);

    return {
      daily: dailyTrends,
      monthly: monthlyTrends
    };
  }

  private async getDailyTrends(startDate: Date, endDate: Date): Promise<any[]> {
    return [];
  }

  private async getMonthlyTrends(startDate: Date, endDate: Date): Promise<any[]> {
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
}