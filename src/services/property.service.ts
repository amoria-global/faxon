import { PrismaClient } from '@prisma/client';
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
  CalendarDay
} from '../types/property.types';

const prisma = new PrismaClient();

export class PropertyService {
  
  // --- PROPERTY CRUD OPERATIONS ---
  async createProperty(hostId: number, data: CreatePropertyDto): Promise<PropertyInfo> {
    // Validate availability dates
    if (new Date(data.availabilityDates.start) >= new Date(data.availabilityDates.end)) {
      throw new Error('End date must be after start date');
    }

    const property = await prisma.property.create({
      data: {
        hostId,
        name: data.name,
        location: data.location,
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
        ownerDetails: data.ownerDetails ? JSON.stringify(data.ownerDetails) : null,
        status: 'pending' // Default status for new properties
      },
      include: {
        host: true,
        reviews: true,
        bookings: true
      }
    });

    return this.transformToPropertyInfo(property);
  }

  async updateProperty(propertyId: number, hostId: number, data: UpdatePropertyDto): Promise<PropertyInfo> {
    // Check if property belongs to the host
    const existingProperty = await prisma.property.findFirst({
      where: { id: propertyId, hostId }
    });

    if (!existingProperty) {
      throw new Error('Property not found or access denied');
    }

    // Merge existing images with new ones if provided
    let updatedImages = existingProperty.images;
    if (data.images) {
      const currentImages = JSON.parse(existingProperty.images || '{}');
      updatedImages = JSON.stringify({ ...currentImages, ...data.images });
    }

    const property = await prisma.property.update({
      where: { id: propertyId },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.location && { location: data.location }),
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
        images: updatedImages
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

    // Check for active bookings
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

    // Increment view count
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
      whereClause.location = { contains: filters.location, mode: 'insensitive' };
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
      // For JSON feature search - check if features JSON contains all required features
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
    
    // Handle search filter properly to avoid overwriting existing OR conditions
    const orConditions = [];
    if (filters.search) {
      orConditions.push(
        { name: { contains: filters.search, mode: 'insensitive' } },
        { location: { contains: filters.search, mode: 'insensitive' } }
      );
    }
    
    if (orConditions.length > 0) {
      if (whereClause.OR) {
        whereClause.OR.push(...orConditions);
      } else {
        whereClause.OR = orConditions;
      }
    }

    // Sort options
    const orderBy: any = {};
    if (filters.sortBy) {
      if (filters.sortBy === 'rating') {
        orderBy.averageRating = filters.sortOrder || 'desc';
      } else if (filters.sortBy === 'price') {
        orderBy.pricePerNight = filters.sortOrder || 'asc';
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
      properties: properties.map(p => this.transformToPropertySummary(p)),
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

    return properties.map(p => this.transformToPropertyInfo(p));
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

    return bookings.map(b => this.transformToBookingInfo(b));
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
        images: data.images ? JSON.stringify(data.images) : null
      },
      include: { user: true }
    });

    // Update property average rating
    await this.updatePropertyRating(data.propertyId);

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
      reviews: reviews.map(r => this.transformToPropertyReview(r)),
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
      .filter(b => b.status === 'completed')
      .reduce((sum, b) => sum + b.totalPrice, 0);

    const avgRating = await prisma.property.aggregate({
      where: { hostId },
      _avg: { averageRating: true }
    });

    const upcomingCheckIns = bookings
      .filter(b => b.status === 'confirmed' && b.checkIn > new Date())
      .slice(0, 5);

    return {
      totalProperties,
      activeProperties,
      totalBookings,
      totalRevenue,
      averageRating: avgRating._avg.averageRating || 0,
      recentBookings: bookings.slice(0, 5).map(b => this.transformToBookingInfo(b)),
      propertyPerformance: [], // Implement based on requirements
      upcomingCheckIns: upcomingCheckIns.map(b => this.transformToBookingInfo(b)),
      pendingReviews: reviews
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
    // If you have a BlockedDate model, uncomment this:
    // const blockedDates = await prisma.blockedDate.findMany({
    //   where: { 
    //     propertyId,
    //     endDate: { gte: new Date() }
    //   }
    // });
    // return blockedDates.flatMap(bd => this.getDateRange(bd.startDate, bd.endDate));
    
    // For now, return empty array
    return [];
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
      type: property.type,
      category: property.category,
      pricePerNight: property.pricePerNight,
      pricePerTwoNights: property.pricePerTwoNights,
      beds: property.beds,
      baths: property.baths,
      maxGuests: property.maxGuests,
      features: JSON.parse(property.features || '[]'),
      description: property.description,
      images: JSON.parse(property.images || '{}'),
      video3D: property.video3D,
      rating: property.averageRating || 0,
      reviewsCount: property.reviewsCount || 0,
      hostId: property.hostId,
      hostName: `${property.host.firstName} ${property.host.lastName}`.trim(),
      hostProfileImage: property.host.profileImage,
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
    const images = JSON.parse(property.images || '{}');
    const mainImage = this.getMainImage(images);
    
    return {
      id: property.id,
      name: property.name,
      location: property.location,
      category: property.category,
      pricePerNight: property.pricePerNight,
      image: mainImage,
      rating: property.averageRating || 0,
      reviewsCount: property.reviewsCount || 0,
      beds: property.beds,
      baths: property.baths,
      hostName: `${property.host.firstName} ${property.host.lastName}`.trim(),
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
      images: review.images ? JSON.parse(review.images) : undefined,
      response: review.response,
      createdAt: review.createdAt.toISOString(),
      updatedAt: review.updatedAt.toISOString()
    };
  }

  private getMainImage(images: PropertyImages): string {
    // Priority order for main image
    const priorities: (keyof PropertyImages)[] = ['exterior', 'livingRoom', 'bedroom', 'kitchen', 'diningArea'];
    
    for (const category of priorities) {
      if (images[category] && images[category].length > 0) {
        return images[category][0];
      }
    }
    
    // Fallback to any available image
    for (const category of Object.keys(images) as (keyof PropertyImages)[]) {
      if (images[category] && images[category].length > 0) {
        return images[category][0];
      }
    }
    
    return ''; // Default placeholder
  }

  // --- MEDIA MANAGEMENT ---
  async uploadPropertyImages(propertyId: number, hostId: number, category: keyof PropertyImages, imageUrls: string[]): Promise<PropertyInfo> {
    const property = await prisma.property.findFirst({
      where: { id: propertyId, hostId }
    });

    if (!property) {
      throw new Error('Property not found or access denied');
    }

    const currentImages = JSON.parse(property.images || '{}');
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

    const currentImages = JSON.parse(property.images || '{}');
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

  // --- AVAILABILITY MANAGEMENT ---
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

    // Note: You'll need to create a BlockedDate model in your Prisma schema:
    // model BlockedDate {
    //   id         Int      @id @default(autoincrement())
    //   propertyId Int
    //   startDate  DateTime
    //   endDate    DateTime
    //   reason     String?
    //   property   Property @relation(fields: [propertyId], references: [id], onDelete: Cascade)
    //   createdAt  DateTime @default(now())
    // }
    
    // Uncomment this when you add the BlockedDate model:
    // await prisma.blockedDate.create({
    //   data: {
    //     propertyId,
    //     startDate: new Date(startDate),
    //     endDate: new Date(endDate),
    //     reason: reason || 'Blocked by host'
    //   }
    // });
    
    console.warn('BlockedDate functionality not implemented - add BlockedDate model to Prisma schema');
  }

  // --- PRICING MANAGEMENT ---
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

  // --- PROPERTY STATUS MANAGEMENT ---
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

    return this.transformToPropertyInfo(updatedProperty);
  }

  // --- SEARCH SUGGESTIONS ---
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

    return properties.map(p => p.location);
  }

  // --- FEATURED PROPERTIES ---
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

    return properties.map(p => this.transformToPropertySummary(p));
  }

  // --- SIMILAR PROPERTIES ---
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

    return properties.map(p => this.transformToPropertySummary(p));
  }
}