// src/services/agent-commission.service.ts
import { PrismaClient } from '@prisma/client';
import { OwnerAccountService } from './owner-account.service';
import { CreatePropertyDto, PropertyInfo } from '../types/property.types';

const prisma = new PrismaClient();

export class AgentCommissionService {
  private ownerAccountService = new OwnerAccountService();

  /**
   * Create property by agent with owner management
   * Agent can never be the owner, must provide owner details
   */
  async createPropertyByAgent(
    agentId: number,
    propertyData: CreatePropertyDto & { ownerDetails: { names: string; email: string; phone: string; address: string } }
  ): Promise<PropertyInfo> {
    // Verify agent exists and has proper role
    const agent = await prisma.user.findFirst({
      where: { id: agentId, userType: 'agent' }
    });

    if (!agent) {
      throw new Error('Only agents can use this endpoint');
    }

    // Validate owner details are provided
    if (!propertyData.ownerDetails) {
      throw new Error('Owner details are required for agent property upload');
    }

    // Create or get owner account
    const ownerResult = await this.ownerAccountService.createOrGetOwner(propertyData.ownerDetails);

    // Parse location data
    let locationData: any = {};
    let upiNumber: string | null = null;
    let propertyAddress: string | null = null;

    if (typeof propertyData.location === 'string') {
      propertyAddress = propertyData.location;
    } else {
      if (propertyData.location.type === 'upi') {
        upiNumber = propertyData.location.upi;
      } else {
        propertyAddress = propertyData.location.address;
      }
    }

    // Create property with agent, owner, and host relationships
    const property = await prisma.property.create({
      data: {
        name: propertyData.name,
        location: propertyAddress || upiNumber || 'Unknown',
        upiNumber,
        propertyAddress,
        type: propertyData.type,
        category: propertyData.category,
        description: propertyData.description,
        pricePerNight: propertyData.pricePerNight,
        pricePerTwoNights: propertyData.pricePerTwoNights,
        beds: propertyData.beds,
        baths: propertyData.baths,
        maxGuests: propertyData.maxGuests,
        features: JSON.stringify(propertyData.features),
        images: JSON.stringify(propertyData.images),
        video3D: propertyData.video3D,
        availableFrom: new Date(propertyData.availabilityDates?.start || propertyData.availableFrom || new Date()),
        availableTo: new Date(propertyData.availabilityDates?.end || propertyData.availableTo || new Date()),
        // Critical: Set relationships
        hostId: ownerResult.id, // Owner is the host
        agentId: agentId, // Agent who uploaded
        commissionRate: 0.10, // Default 10% commission for agent
        status: 'pending', // Property starts as pending
        isVerified: false
      },
      include: {
        host: true,
        agent: true
      }
    });

    return this.transformToPropertyInfo(property);
  }

  /**
   * Get all properties managed by an agent (regardless of status)
   */
  async getAgentProperties(agentId: number, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [properties, total] = await Promise.all([
      prisma.property.findMany({
        where: { agentId },
        include: {
          host: true,
          agent: true,
          bookings: {
            where: { status: { in: ['confirmed', 'checkedin', 'checkout'] } }
          },
          agentCommissions: {
            where: { agentId }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.property.count({ where: { agentId } })
    ]);

    const enrichedProperties = await Promise.all(
      properties.map(async (property) => {
        const ownerStatus = await this.ownerAccountService.getOwnerVerificationStatus(property.hostId!);
        const totalCommission = property.agentCommissions.reduce((sum, c) => sum + c.amount, 0);

        return {
          ...this.transformToPropertyInfo(property),
          ownerVerificationStatus: ownerStatus,
          totalCommissionEarned: totalCommission,
          totalBookings: property.bookings.length
        };
      })
    );

    return {
      properties: enrichedProperties,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * Calculate and create commission record when booking is paid
   */
  async calculateAndCreateCommission(bookingId: string): Promise<void> {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        property: {
          include: {
            agent: true,
            host: true
          }
        }
      }
    });

    if (!booking) {
      throw new Error('Booking not found');
    }

    // Only create commission if property has an agent
    if (!booking.property.agentId) {
      return;
    }

    // Check if commission already exists
    const existingCommission = await prisma.agentCommission.findFirst({
      where: { bookingId: booking.id }
    });

    if (existingCommission) {
      return;
    }

    // Calculate commission
    const commissionRate = booking.property.commissionRate || 0.10;
    const commissionAmount = booking.totalPrice * commissionRate;

    // Create commission record as 'pending' until check-in
    await prisma.agentCommission.create({
      data: {
        agentId: booking.property.agentId,
        propertyId: booking.propertyId,
        bookingId: booking.id,
        amount: commissionAmount,
        commissionRate,
        status: 'pending' // Will be 'earned' after check-in
      }
    });

    console.log(`Commission created: ${commissionAmount} for agent ${booking.property.agentId}`);
  }

  /**
   * Create host payment record when booking is paid
   */
  async createHostPayment(bookingId: string): Promise<void> {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        property: {
          include: {
            host: true,
            agent: true
          }
        }
      }
    });

    if (!booking) {
      throw new Error('Booking not found');
    }

    // Check if payment already exists
    const existingPayment = await prisma.hostPayment.findFirst({
      where: { bookingId: booking.id }
    });

    if (existingPayment) {
      return;
    }

    // Calculate host payment (total - agent commission - platform fee)
    const agentCommissionRate = booking.property.agentId ? (booking.property.commissionRate || 0.10) : 0;
    const agentCommission = booking.totalPrice * agentCommissionRate;
    const platformFeeRate = 0.05; // 5% platform fee
    const platformFee = booking.totalPrice * platformFeeRate;
    const netAmount = booking.totalPrice - agentCommission - platformFee;

    // Create host payment record as 'pending' until check-in
    await prisma.hostPayment.create({
      data: {
        hostId: booking.property.hostId!,
        bookingId: booking.id,
        amount: booking.totalPrice,
        platformFee,
        netAmount,
        currency: 'USD',
        status: 'pending', // Will be 'approved' after check-in validation
        checkInRequired: true,
        checkInValidated: false
      }
    });

    console.log(`Host payment created: ${netAmount} for host ${booking.property.hostId}`);
  }

  /**
   * Validate check-in by host
   */
  async validateCheckIn(bookingId: string, hostId: number, checkInCode?: string): Promise<void> {
    const booking = await prisma.booking.findFirst({
      where: {
        id: bookingId,
        property: {
          hostId
        }
      },
      include: {
        property: true
      }
    });

    if (!booking) {
      throw new Error('Booking not found or you do not have permission');
    }

    // Validate check-in code if provided
    if (booking.checkInCode && checkInCode && booking.checkInCode !== checkInCode) {
      throw new Error('Invalid check-in code');
    }

    // Update booking check-in validation
    await prisma.booking.update({
      where: { id: bookingId },
      data: {
        checkInValidated: true,
        checkInValidatedAt: new Date(),
        checkInValidatedBy: hostId
      }
    });

    // Update host payment status to 'approved' (money release starts)
    await prisma.hostPayment.updateMany({
      where: {
        bookingId,
        hostId
      },
      data: {
        checkInValidated: true,
        checkInValidatedAt: new Date(),
        status: 'approved'
      }
    });

    // Update agent commission status to 'earned'
    await prisma.agentCommission.updateMany({
      where: {
        bookingId,
        propertyId: booking.propertyId
      },
      data: {
        status: 'earned',
        earnedAt: new Date()
      }
    });

    console.log(`Check-in validated for booking ${bookingId}`);
  }

  /**
   * Validate check-out by host
   */
  async validateCheckOut(bookingId: string, hostId: number, checkOutCode?: string): Promise<void> {
    const booking = await prisma.booking.findFirst({
      where: {
        id: bookingId,
        property: {
          hostId
        }
      }
    });

    if (!booking) {
      throw new Error('Booking not found or you do not have permission');
    }

    // Validate check-out code if provided
    if (booking.checkOutCode && checkOutCode && booking.checkOutCode !== checkOutCode) {
      throw new Error('Invalid check-out code');
    }

    // Update booking check-out validation
    await prisma.booking.update({
      where: { id: bookingId },
      data: {
        checkOutValidated: true,
        checkOutValidatedAt: new Date(),
        checkOutValidatedBy: hostId,
        status: 'checkout'
      }
    });

    console.log(`Check-out validated for booking ${bookingId}`);
  }

  /**
   * Get pending commission for agent
   */
  async getAgentPendingCommissions(agentId: number) {
    const commissions = await prisma.agentCommission.findMany({
      where: {
        agentId,
        status: { in: ['pending', 'earned'] }
      },
      include: {
        property: {
          select: {
            name: true,
            location: true
          }
        },
        booking: {
          select: {
            checkIn: true,
            checkOut: true,
            guest: {
              select: {
                firstName: true,
                lastName: true,
                email: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const totalPending = commissions
      .filter(c => c.status === 'pending')
      .reduce((sum, c) => sum + c.amount, 0);

    const totalEarned = commissions
      .filter(c => c.status === 'earned')
      .reduce((sum, c) => sum + c.amount, 0);

    return {
      commissions,
      summary: {
        totalPending,
        totalEarned,
        totalCount: commissions.length
      }
    };
  }

  /**
   * Get pending payments for host
   */
  async getHostPendingPayments(hostId: number) {
    const payments = await prisma.hostPayment.findMany({
      where: {
        hostId,
        status: { in: ['pending', 'approved'] }
      },
      include: {
        booking: {
          include: {
            property: {
              select: {
                name: true,
                location: true
              }
            },
            guest: {
              select: {
                firstName: true,
                lastName: true,
                email: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const pendingCheckIn = payments.filter(p => !p.checkInValidated);
    const approvedPayments = payments.filter(p => p.status === 'approved');

    const totalPending = pendingCheckIn.reduce((sum, p) => sum + p.netAmount, 0);
    const totalApproved = approvedPayments.reduce((sum, p) => sum + p.netAmount, 0);

    return {
      payments,
      summary: {
        totalPendingCheckIn: totalPending,
        totalApproved,
        totalCount: payments.length,
        pendingCheckInCount: pendingCheckIn.length,
        approvedCount: approvedPayments.length
      }
    };
  }

  /**
   * Check if property should be displayed publicly
   * Property is hidden if owner hasn't completed verification
   */
  async shouldDisplayProperty(propertyId: number): Promise<boolean> {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      include: {
        host: {
          include: {
            wallet: true
          }
        }
      }
    });

    if (!property) {
      return false;
    }

    // Property must be verified
    if (!property.isVerified || property.status !== 'active') {
      return false;
    }

    // Check host verification
    if (property.hostId) {
      const isHostReady = await this.ownerAccountService.isOwnerReadyForDisplay(property.hostId);
      return isHostReady;
    }

    return false;
  }

  /**
   * Transform property to PropertyInfo format
   */
  private transformToPropertyInfo(property: any): PropertyInfo {
    return {
      id: property.id,
      name: property.name,
      location: property.location,
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
      features: JSON.parse(property.features || '[]'),
      description: property.description,
      images: JSON.parse(property.images || '{}'),
      video3D: property.video3D,
      rating: property.averageRating,
      reviewsCount: property.reviewsCount,
      hostId: property.hostId,
      hostName: property.host ? `${property.host.firstName} ${property.host.lastName}` : 'Unknown',
      hostProfileImage: property.host?.profileImage,
      status: property.status,
      availability: {
        isAvailable: property.status === 'active',
        availableFrom: property.availableFrom?.toISOString(),
        availableTo: property.availableTo?.toISOString(),
        blockedDates: [],
        minStay: property.minStay || 1
      },
      createdAt: property.createdAt.toISOString(),
      updatedAt: property.updatedAt.toISOString(),
      totalBookings: property.totalBookings,
      isVerified: property.isVerified
    };
  }
}
