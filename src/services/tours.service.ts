import { PrismaClient } from '@prisma/client';
import { BrevoTourMailingService, TourMailingContext } from '../utils/brevo.tours';
import {
  CreateTourDto,
  UpdateTourDto,
  TourSearchFilters,
  TourBookingRequest,
  CreateTourReviewDto,
  TourInfo,
  TourSummary,
  TourBookingInfo,
  TourReviewInfo,
  TourScheduleInfo,
  TourGuideInfo,
  TourBookingFilters,
  TourBookingUpdateDto,
  CreateTourScheduleDto,
  UpdateTourScheduleDto,
  TourGuideFilters,
  TourImages,
  TourGuideDashboard,
  EnhancedTourGuideDashboard,
  TourEarningsOverview,
  TourEarningsBreakdown,
  TourGuideAnalytics,
  TourAnalytics,
  TourCalendarMonth,
  TourMessageInfo,
  CreateTourMessageDto,
  TourCategoryInfo,
  TourNotificationInfo,
  TourSystemAnalytics,
  BulkOperationResult
} from '../types/tours.types';

const prisma = new PrismaClient();

export class TourService {
  private emailService: BrevoTourMailingService;

  constructor() {
    this.emailService = new BrevoTourMailingService();
  }
  // --- PUBLIC TOUR OPERATIONS ---

  async searchTours(filters: TourSearchFilters, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const whereConditions: any = {
      isActive: true
    };

    // Build where conditions based on filters
    if (filters.location) {
      whereConditions.OR = [
        { locationCity: { contains: filters.location, mode: 'insensitive' } },
        { locationCountry: { contains: filters.location, mode: 'insensitive' } },
        { locationState: { contains: filters.location, mode: 'insensitive' } }
      ];
    }

    if (filters.category) {
      whereConditions.category = filters.category;
    }

    if (filters.type) {
      whereConditions.type = filters.type;
    }

    if (filters.difficulty) {
      whereConditions.difficulty = filters.difficulty;
    }

    if (filters.minPrice || filters.maxPrice) {
      whereConditions.price = {};
      if (filters.minPrice) whereConditions.price.gte = filters.minPrice;
      if (filters.maxPrice) whereConditions.price.lte = filters.maxPrice;
    }

    if (filters.minDuration || filters.maxDuration) {
      whereConditions.duration = {};
      if (filters.minDuration) whereConditions.duration.gte = filters.minDuration;
      if (filters.maxDuration) whereConditions.duration.lte = filters.maxDuration;
    }

    if (filters.groupSize) {
      whereConditions.maxGroupSize = { gte: filters.groupSize };
    }

    if (filters.tags && filters.tags.length > 0) {
      whereConditions.tags = {
        hasEvery: filters.tags
      };
    }

    if (filters.rating) {
      whereConditions.rating = { gte: filters.rating };
    }

    if (filters.search) {
      whereConditions.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
        { shortDescription: { contains: filters.search, mode: 'insensitive' } }
      ];
    }

    if (filters.tourGuideId) {
      whereConditions.tourGuideId = filters.tourGuideId;
    }

    if (filters.hasAvailability) {
      whereConditions.schedules = {
        some: {
          isAvailable: true,
          startDate: { gte: new Date() }
        }
      };
    }

    if (filters.date) {
      const selectedDate = new Date(filters.date);
      whereConditions.schedules = {
        some: {
          startDate: { lte: selectedDate },
          endDate: { gte: selectedDate },
          isAvailable: true
        }
      };
    }

    if (filters.dateRange) {
      whereConditions.schedules = {
        some: {
          startDate: { gte: new Date(filters.dateRange.start) },
          endDate: { lte: new Date(filters.dateRange.end) },
          isAvailable: true
        }
      };
    }

    // Build order by
    let orderBy: any = {};
    switch (filters.sortBy) {
      case 'price':
        orderBy.price = filters.sortOrder || 'asc';
        break;
      case 'rating':
        orderBy.rating = filters.sortOrder || 'desc';
        break;
      case 'duration':
        orderBy.duration = filters.sortOrder || 'asc';
        break;
      case 'popularity':
        orderBy.totalBookings = filters.sortOrder || 'desc';
        break;
      case 'created_at':
        orderBy.createdAt = filters.sortOrder || 'desc';
        break;
      default:
        orderBy.createdAt = 'desc';
    }

    const [tours, total] = await Promise.all([
      prisma.tour.findMany({
        where: whereConditions,
        include: {
          tourGuide: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              profileImage: true,
              rating: true,
              isVerified: true
            }
          },
          schedules: {
            where: {
              isAvailable: true,
              startDate: { gte: new Date() }
            },
            orderBy: { startDate: 'asc' },
            take: 1
          }
        },
        orderBy,
        skip,
        take: limit
      }),
      prisma.tour.count({ where: whereConditions })
    ]);

    const tourSummaries: TourSummary[] = tours.map(tour => ({
      id: tour.id,
      title: tour.title,
      shortDescription: tour.shortDescription,
      category: tour.category,
      type: tour.type,
      duration: tour.duration,
      price: tour.price,
      currency: tour.currency,
      mainImage: (tour.images as any)?.main?.[0] || '',
      rating: tour.rating,
      totalReviews: tour.totalReviews,
      difficulty: tour.difficulty as any,
      locationCity: tour.locationCity,
      locationCountry: tour.locationCountry,
      tourGuideName: `${tour.tourGuide.firstName} ${tour.tourGuide.lastName}`,
      tourGuideProfileImage: tour.tourGuide.profileImage ?? undefined,
      isActive: tour.isActive,
      nextAvailableDate: tour.schedules[0]?.startDate.toISOString()
    }));

    return {
      tours: tourSummaries,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  async getTourById(tourId: string): Promise<TourInfo | null> {
    const tour = await prisma.tour.findFirst({
      where: { id: tourId, isActive: true },
      include: {
        tourGuide: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            profileImage: true,
            bio: true,
            experience: true,
            languages: true,
            specializations: true,
            rating: true,
            totalTours: true,
            isVerified: true,
            licenseNumber: true,
            certifications: true
          }
        },
        schedules: {
          where: { isAvailable: true },
          orderBy: { startDate: 'asc' }
        }
      }
    });

    if (!tour) return null;

    // Increment view count
    await prisma.tour.update({
      where: { id: tourId },
      data: { views: { increment: 1 } }
    });

    return this.formatTourInfo(tour);
  }

  async getFeaturedTours(limit: number = 8): Promise<TourSummary[]> {
    const tours = await prisma.tour.findMany({
      where: {
        isActive: true,
        rating: { gte: 4.0 }
      },
      include: {
        tourGuide: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profileImage: true,
            isVerified: true
          }
        },
        schedules: {
          where: {
            isAvailable: true,
            startDate: { gte: new Date() }
          },
          orderBy: { startDate: 'asc' },
          take: 1
        }
      },
      orderBy: [
        { rating: 'desc' },
        { totalBookings: 'desc' }
      ],
      take: limit
    });

    return tours.map(tour => ({
      id: tour.id,
      title: tour.title,
      shortDescription: tour.shortDescription,
      category: tour.category,
      type: tour.type,
      duration: tour.duration,
      price: tour.price,
      currency: tour.currency,
      mainImage: (tour.images as any)?.main?.[0] || '',
      rating: tour.rating,
      totalReviews: tour.totalReviews,
      difficulty: tour.difficulty as any,
      locationCity: tour.locationCity,
      locationCountry: tour.locationCountry,
      tourGuideName: `${tour.tourGuide.firstName} ${tour.tourGuide.lastName}`,
      tourGuideProfileImage: tour.tourGuide.profileImage as any,
      isActive: tour.isActive,
      nextAvailableDate: tour.schedules[0]?.startDate.toISOString()
    }));
  }

  async getTourReviews(tourId: string, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [reviews, total] = await Promise.all([
      prisma.tourReview.findMany({
        where: {
          tourId,
          isVisible: true
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              profileImage: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.tourReview.count({
        where: {
          tourId,
          isVisible: true
        }
      })
    ]);

    const reviewInfos: TourReviewInfo[] = reviews.map(review => ({
      id: review.id,
      bookingId: review.bookingId,
      userId: review.userId,
      userName: `${review.user.firstName} ${review.user.lastName}`,
      userProfileImage: review.user.profileImage ?? undefined,
      tourId: review.tourId,
      tourTitle: '', // Would need to join with tour table
      tourGuideId: review.tourGuideId,
      rating: review.rating,
      comment: review.comment,
      images: review.images as string[],
      pros: review.pros as string[],
      cons: review.cons as string[],
      wouldRecommend: review.wouldRecommend,
      isAnonymous: review.isAnonymous,
      isVerified: review.isVerified,
      isVisible: review.isVisible,
      helpfulCount: review.helpfulCount,
      response: review.response ?? undefined,
      responseDate: review.responseDate?.toISOString(),
      createdAt: review.createdAt.toISOString(),
      updatedAt: review.updatedAt.toISOString()
    }));

    return {
      reviews: reviewInfos,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  async getTourCategories(): Promise<TourCategoryInfo[]> {
    const categories = await prisma.tourCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' }
    });

    return categories.map(category => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description ?? undefined,
      icon: category.icon ?? undefined,
      color: category.color ?? undefined,
      isActive: category.isActive,
      sortOrder: category.sortOrder
    }));
  }

  async getLocationSuggestions(query: string): Promise<string[]> {
    const suggestions = await prisma.tour.findMany({
      where: {
        isActive: true,
        OR: [
          { locationCity: { contains: query, mode: 'insensitive' } },
          { locationCountry: { contains: query, mode: 'insensitive' } },
          { locationState: { contains: query, mode: 'insensitive' } }
        ]
      },
      select: {
        locationCity: true,
        locationCountry: true,
        locationState: true
      },
      distinct: ['locationCity', 'locationCountry']
    });

    const uniqueLocations = new Set<string>();

    suggestions.forEach(tour => {
      if (tour.locationCity) {
        uniqueLocations.add(`${tour.locationCity}, ${tour.locationCountry}`);
      }
      if (tour.locationState) {
        uniqueLocations.add(`${tour.locationState}, ${tour.locationCountry}`);
      }
      uniqueLocations.add(tour.locationCountry);
    });

    return Array.from(uniqueLocations).slice(0, 10);
  }

  async searchTourGuides(filters: TourGuideFilters, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const whereConditions: any = {
      userType: 'tourguide'
    };

    if (filters.search) {
      whereConditions.OR = [
        { firstName: { contains: filters.search, mode: 'insensitive' } },
        { lastName: { contains: filters.search, mode: 'insensitive' } },
        { bio: { contains: filters.search, mode: 'insensitive' } }
      ];
    }

    if (filters.specialization) {
      whereConditions.specializations = {
        has: filters.specialization
      };
    }

    if (filters.language) {
      whereConditions.languages = {
        has: filters.language
      };
    }

    if (filters.experience) {
      whereConditions.experience = { gte: filters.experience };
    }

    if (filters.rating) {
      whereConditions.rating = { gte: filters.rating };
    }

    if (filters.isVerified !== undefined) {
      whereConditions.isVerified = filters.isVerified;
    }

    if (filters.location) {
      whereConditions.toursAsGuide = {
        some: {
          OR: [
            { locationCity: { contains: filters.location, mode: 'insensitive' } },
            { locationCountry: { contains: filters.location, mode: 'insensitive' } }
          ]
        }
      };
    }

    let orderBy: any = {};
    switch (filters.sortBy) {
      case 'rating':
        orderBy.rating = filters.sortOrder || 'desc';
        break;
      case 'experience':
        orderBy.experience = filters.sortOrder || 'desc';
        break;
      case 'tours':
        orderBy.totalTours = filters.sortOrder || 'desc';
        break;
      case 'name':
        orderBy.firstName = filters.sortOrder || 'asc';
        break;
      default:
        orderBy.rating = 'desc';
    }

    const [guides, total] = await Promise.all([
      prisma.user.findMany({
        where: whereConditions,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          profileImage: true,
          bio: true,
          experience: true,
          languages: true,
          specializations: true,
          rating: true,
          totalTours: true,
          isVerified: true,
          licenseNumber: true,
          certifications: true
        },
        orderBy,
        skip,
        take: limit
      }),
      prisma.user.count({ where: whereConditions })
    ]);

    const guideInfos: TourGuideInfo[] = guides.map(guide => ({
      id: guide.id,
      firstName: guide.firstName,
      lastName: guide.lastName,
      profileImage: guide.profileImage ?? undefined,
      bio: guide.bio ?? undefined,
      experience: guide.experience ?? undefined,
      languages: guide.languages as string[],
      specializations: guide.specializations as string[],
      rating: guide.rating,
      totalTours: guide.totalTours,
      isVerified: guide.isVerified,
      licenseNumber: guide.licenseNumber ?? undefined,
      certifications: guide.certifications as string[]
    }));

    return {
      guides: guideInfos,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  // --- GUEST OPERATIONS ---

  async createTourBooking(userId: number, bookingData: TourBookingRequest): Promise<TourBookingInfo> {
    // First, check if schedule exists at all
    const scheduleExists = await prisma.tourSchedule.findUnique({
      where: { id: bookingData.scheduleId }
    });

    console.log('Schedule exists:', scheduleExists);

    if (!scheduleExists) {
      throw new Error(`Schedule with ID ${bookingData.scheduleId} not found`);
    }

    // Check if it belongs to the correct tour
    if (scheduleExists.tourId !== bookingData.tourId) {
      throw new Error(`Schedule ${bookingData.scheduleId} doesn't belong to tour ${bookingData.tourId}`);
    }

    // Check availability
    if (!scheduleExists.isAvailable) {
      throw new Error(`Schedule ${bookingData.scheduleId} is not available`);
    }

    // Check if it's in the future
    if (scheduleExists.startDate < new Date()) {
      throw new Error(`Schedule ${bookingData.scheduleId} is in the past`);
    }

    // Now proceed with the original query
    const schedule = await prisma.tourSchedule.findFirst({
      where: {
        id: bookingData.scheduleId,
        tourId: bookingData.tourId,
        isAvailable: true,
        startDate: { gte: new Date() }
      },
      include: {
        tour: {
          include: {
            tourGuide: {
              select: {
                id: true,
                firstName: true,
                lastName: true
              }
            }
          }
        }
      }
    });

    if (!schedule) {
      throw new Error('Tour schedule not found or not available');
    }

    // Check if there are enough available slots
    const availableSlots = schedule.availableSlots - schedule.bookedSlots;
    if (availableSlots < bookingData.numberOfParticipants) {
      throw new Error(`Only ${availableSlots} slots available for this tour`);
    }

    // Verify group size doesn't exceed tour limits
    if (bookingData.numberOfParticipants > schedule.tour.maxGroupSize) {
      throw new Error(`Group size exceeds maximum allowed (${schedule.tour.maxGroupSize})`);
    }

    if (bookingData.numberOfParticipants < schedule.tour.minGroupSize) {
      throw new Error(`Group size below minimum required (${schedule.tour.minGroupSize})`);
    }

    // Create the booking
    const booking = await prisma.tourBooking.create({
      data: {
        userId,
        tourId: bookingData.tourId,
        scheduleId: bookingData.scheduleId,
        tourGuideId: schedule.tour.tourGuideId,
        numberOfParticipants: bookingData.numberOfParticipants,
        participants: JSON.stringify(bookingData.participants),
        specialRequests: bookingData.specialRequests,
        totalAmount: bookingData.totalAmount,
        currency: bookingData.currency || 'USD',
        status: 'pending',
        paymentStatus: 'pending',
        checkInStatus: 'not_checked_in'
      },
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
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            }
          }
        },
        schedule: {
          select: {
            startDate: true,
            startTime: true
          }
        }
      }
    });

    // Update schedule booked slots
    await prisma.tourSchedule.update({
      where: { id: bookingData.scheduleId },
      data: { bookedSlots: { increment: bookingData.numberOfParticipants } }
    });

    // Update tour total bookings
    await prisma.tour.update({
      where: { id: bookingData.tourId },
      data: { totalBookings: { increment: 1 } }
    });

    try {
      if (booking.user && booking.tour.tourGuide) {
        const emailContext: TourMailingContext = {
          recipient: {
            firstName: booking.tour.tourGuide.firstName,
            lastName: booking.tour.tourGuide.lastName,
            email: booking.tour.tourGuide.email,
            id: booking.tour.tourGuide.id
          },
          company: {
            name: 'Jambolush Tours',
            website: 'https://jambolush.com',
            supportEmail: 'support@jambolush.com',
            logo: 'https://jambolush.com/favicon.ico'
          },
          tour: this.formatTourInfo(booking.tour),
          booking: this.formatTourBookingInfo(booking)
        };

        await this.emailService.sendNewBookingRequestEmail(emailContext);
      }
    } catch (emailError) {
      console.error('Failed to send booking request email:', emailError);
    }

    return this.formatTourBookingInfo(booking);
  }

  async getUserTourBookings(userId: number, filters: TourBookingFilters, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const whereConditions: any = {
      userId
    };

    if (filters.status && filters.status.length > 0) {
      whereConditions.status = { in: filters.status };
    }

    if (filters.tourId) {
      whereConditions.tourId = filters.tourId;
    }

    if (filters.dateRange) {
      whereConditions.schedule = {
        startDate: {
          gte: new Date(filters.dateRange.start),
          lte: new Date(filters.dateRange.end)
        }
      };
    }

    let orderBy: any = {};
    switch (filters.sortBy) {
      case 'date':
        orderBy = { schedule: { startDate: filters.sortOrder || 'desc' } };
        break;
      case 'amount':
        orderBy.totalAmount = filters.sortOrder || 'desc';
        break;
      default:
        orderBy.createdAt = 'desc';
    }

    const [bookings, total] = await Promise.all([
      prisma.tourBooking.findMany({
        where: whereConditions,
        include: {
          tour: {
            select: {
              title: true,
              tourGuide: {
                select: {
                  firstName: true,
                  lastName: true
                }
              }
            }
          },
          schedule: {
            select: {
              startDate: true,
              startTime: true
            }
          },
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true
            }
          }
        },
        orderBy,
        skip,
        take: limit
      }),
      prisma.tourBooking.count({ where: whereConditions })
    ]);

    const bookingInfos = bookings.map(booking => this.formatTourBookingInfo(booking));

    return {
      bookings: bookingInfos,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  // Add this method to your TourService class in the GUEST OPERATIONS section

  async getUserTourBookingById(userId: number, bookingId: string): Promise<TourBookingInfo | null> {
    const booking = await prisma.tourBooking.findFirst({
      where: {
        id: bookingId,
        userId // Security: Only allow users to access their own bookings
      },
      include: {
        tour: {
          select: {
            title: true,
            shortDescription: true,
            category: true,
            locationCity: true,
            locationCountry: true,
            meetingPoint: true,
            price: true,
            duration: true,
            images: true,
            tourGuide: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                profileImage: true,
                phone: true
              }
            }
          }
        },
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true
          }
        },
        schedule: {
          select: {
            startDate: true,
            endDate: true,
            startTime: true,
            endTime: true,
            availableSlots: true
          }
        }
      }
    });

    if (!booking) {
      return null;
    }

    return this.formatTourBookingInfo(booking);
  }

  async createTourReview(userId: number, reviewData: CreateTourReviewDto): Promise<TourReviewInfo> {
    // Verify the booking exists and belongs to the user
    const booking = await prisma.tourBooking.findFirst({
      where: {
        id: reviewData.bookingId,
        userId,
        status: 'completed'
      },
      include: {
        tour: {
          select: {
            title: true,
            tourGuideId: true
          }
        }
      }
    });

    if (!booking) {
      throw new Error('Booking not found or tour not completed');
    }

    // Check if review already exists
    const existingReview = await prisma.tourReview.findFirst({
      where: {
        bookingId: reviewData.bookingId,
        userId
      }
    });

    if (existingReview) {
      throw new Error('Review already exists for this booking');
    }

    // Create the review
    const review = await prisma.tourReview.create({
      data: {
        bookingId: reviewData.bookingId,
        userId,
        tourId: reviewData.tourId,
        tourGuideId: booking.tour.tourGuideId,
        rating: reviewData.rating,
        comment: reviewData.comment,
        images: reviewData.images || [],
        pros: reviewData.pros,
        cons: reviewData.cons,
        wouldRecommend: reviewData.wouldRecommend,
        isAnonymous: reviewData.isAnonymous || false,
        isVerified: true,
        isVisible: true
      },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            profileImage: true
          }
        }
      }
    });

    // Update tour rating and review count
    await this.updateTourRating(reviewData.tourId);

    // Update tour guide rating
    await this.updateTourGuideRating(booking.tour.tourGuideId);

    return {
      id: review.id,
      bookingId: review.bookingId,
      userId: review.userId,
      userName: `${review.user.firstName} ${review.user.lastName}`,
      userProfileImage: review.user.profileImage ?? undefined,
      tourId: review.tourId,
      tourTitle: booking.tour.title,
      tourGuideId: review.tourGuideId,
      rating: review.rating,
      comment: review.comment,
      images: review.images as string[],
      pros: review.pros as string[],
      cons: review.cons as string[],
      wouldRecommend: review.wouldRecommend,
      isAnonymous: review.isAnonymous,
      isVerified: review.isVerified,
      isVisible: review.isVisible,
      helpfulCount: review.helpfulCount,
      response: review.response ?? undefined,
      responseDate: review.responseDate?.toISOString(),
      createdAt: review.createdAt.toISOString(),
      updatedAt: review.updatedAt.toISOString()
    };
  }

  // --- TOUR GUIDE OPERATIONS ---

  async getTourGuideDashboard(tourGuideId: number): Promise<TourGuideDashboard> {
    const [
      totalTours,
      activeTours,
      totalBookings,
      totalRevenue,
      averageRating,
      totalParticipants,
      recentBookings,
      upcomingTours,
      pendingReviews
    ] = await Promise.all([
      prisma.tour.count({
        where: { tourGuideId }
      }),
      prisma.tour.count({
        where: { tourGuideId, isActive: true }
      }),
      prisma.tourBooking.count({
        where: { tourGuideId }
      }),
      prisma.tourEarnings.aggregate({
        where: { tourGuideId },
        _sum: { netAmount: true }
      }),
      prisma.user.findUnique({
        where: { id: tourGuideId },
        select: { rating: true }
      }),
      prisma.tourBooking.aggregate({
        where: { tourGuideId },
        _sum: { numberOfParticipants: true }
      }),
      this.getRecentTourBookings(tourGuideId, 5),
      this.getUpcomingTourSchedules(tourGuideId, 5),
      prisma.tourBooking.count({
        where: {
          tourGuideId,
          status: 'completed',
          reviews: { none: {} }
        }
      })
    ]);

    const monthlyEarnings = await this.getMonthlyEarnings(tourGuideId);

    return {
      totalTours,
      activeTours,
      totalBookings,
      totalRevenue: totalRevenue._sum.netAmount || 0,
      averageRating: averageRating?.rating || 0,
      totalParticipants: totalParticipants._sum.numberOfParticipants || 0,
      recentBookings,
      tourPerformance: [], // Would implement detailed tour analytics
      upcomingTours,
      pendingReviews,
      monthlyEarnings
    };
  }

  async getEnhancedTourGuideDashboard(tourGuideId: number): Promise<EnhancedTourGuideDashboard> {
    const baseDashboard = await this.getTourGuideDashboard(tourGuideId);

    const [quickStats, recentActivity, alerts] = await Promise.all([
      this.getTourGuideQuickStats(tourGuideId),
      this.getTourGuideRecentActivity(tourGuideId),
      this.getTourGuideAlerts(tourGuideId)
    ]);

    return {
      ...baseDashboard,
      quickStats,
      recentActivity,
      alerts,
      marketTrends: {
        demandTrend: 'stable',
        averagePrice: 150,
        seasonalFactor: 'Peak season approaching'
      }
    };
  }

  async createTour(tourGuideId: number, tourData: CreateTourDto): Promise<TourInfo> {
    const tour = await prisma.tour.create({
      data: {
        title: tourData.title,
        description: tourData.description,
        shortDescription: tourData.shortDescription,
        tourGuideId,
        category: tourData.category,
        type: tourData.type,
        duration: tourData.duration,
        maxGroupSize: tourData.maxGroupSize,
        minGroupSize: tourData.minGroupSize || 1,
        price: tourData.price,
        currency: tourData.currency || 'USD',
        images: JSON.stringify(tourData.images),
        itinerary: JSON.stringify(tourData.itinerary),
        inclusions: tourData.inclusions,
        exclusions: tourData.exclusions,
        requirements: tourData.requirements,
        difficulty: tourData.difficulty,
        locationCountry: tourData.locationCountry,
        locationState: tourData.locationState,
        locationCity: tourData.locationCity,
        locationAddress: tourData.locationAddress,
        latitude: tourData.latitude,
        longitude: tourData.longitude,
        locationZipCode: tourData.locationZipCode,
        meetingPoint: tourData.meetingPoint,
        tags: tourData.tags,
        isActive: true
      },
      include: {
        tourGuide: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            profileImage: true,
            bio: true,
            experience: true,
            languages: true,
            specializations: true,
            rating: true,
            totalTours: true,
            isVerified: true,
            licenseNumber: true,
            certifications: true
          }
        }
      }
    });

    // Create schedules if provided
    if (tourData.schedules && tourData.schedules.length > 0) {
      await Promise.all(
        tourData.schedules.map(schedule =>
          prisma.tourSchedule.create({
            data: {
              tourId: tour.id,
              tourGuideId,
              startDate: new Date(schedule.startDate),
              endDate: new Date(schedule.endDate),
              startTime: schedule.startTime,
              endTime: schedule.endTime,
              availableSlots: schedule.availableSlots,
              price: schedule.price,
              specialNotes: schedule.specialNotes
            }
          })
        )
      );
    }

    // Update tour guide total tours count
    await prisma.user.update({
      where: { id: tourGuideId },
      data: { totalTours: { increment: 1 } }
    });

    try {
      const tourGuide = await prisma.user.findUnique({
        where: { id: tourGuideId },
        select: { firstName: true, lastName: true, email: true }
      });

      if (tourGuide) {
        const emailContext: TourMailingContext = {
          recipient: {
            firstName: tourGuide.firstName,
            lastName: tourGuide.lastName,
            email: tourGuide.email,
            id: tourGuideId
          },
          company: {
            name: 'Jambolush Tours',
            website: 'https://jambolush.com', // Replace with your domain
            supportEmail: 'support@jambolush.com', // Replace with your email
            logo: 'https://jambolush.com/favicon.ico' // Replace with your logo
          },
          tour: this.formatTourInfo(tour)
        };

        await this.emailService.sendNewTourConfirmationEmail(emailContext);
      }
    } catch (emailError) {
      console.error('Failed to send tour confirmation email:', emailError);
      // Don't fail the tour creation if email fails
    }


    return this.formatTourInfo({ ...tour, schedules: [] });
  }

  async updateTour(tourId: string, tourGuideId: number, updateData: UpdateTourDto): Promise<TourInfo> {
    // Verify tour belongs to guide
    const existingTour = await prisma.tour.findFirst({
      where: { id: tourId, tourGuideId }
    });

    if (!existingTour) {
      throw new Error('Tour not found or access denied');
    }

    const tour = await prisma.tour.update({
      where: { id: tourId },
      data: {
        ...updateData,
        itinerary: updateData.itinerary ? JSON.stringify(updateData.itinerary) : undefined,
      },
      include: {
        tourGuide: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            profileImage: true,
            bio: true,
            experience: true,
            languages: true,
            specializations: true,
            rating: true,
            totalTours: true,
            isVerified: true,
            licenseNumber: true,
            certifications: true
          }
        },
        schedules: {
          orderBy: { startDate: 'asc' }
        }
      }
    });

    return this.formatTourInfo(tour);
  }

  async deleteTour(tourId: string, tourGuideId: number): Promise<void> {
    // Verify tour belongs to guide
    const tour = await prisma.tour.findFirst({
      where: { id: tourId, tourGuideId }
    });

    if (!tour) {
      throw new Error('Tour not found or access denied');
    }

    // Check for active bookings
    const activeBookings = await prisma.tourBooking.count({
      where: {
        tourId,
        status: { in: ['pending', 'confirmed', 'in_progress'] }
      }
    });

    if (activeBookings > 0) {
      throw new Error('Cannot delete tour with active bookings');
    }

    // Soft delete by setting isActive to false
    await prisma.tour.update({
      where: { id: tourId },
      data: { isActive: false }
    });

    // Update tour guide total tours count
    await prisma.user.update({
      where: { id: tourGuideId },
      data: { totalTours: { decrement: 1 } }
    });
  }

  async getToursByGuide(tourGuideId: number, filters: TourSearchFilters, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const whereConditions: any = {
      tourGuideId
    };

    if (filters.search) {
      whereConditions.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } }
      ];
    }

    if (filters.category) {
      whereConditions.category = filters.category;
    }

    if (filters.isActive !== undefined) {
      whereConditions.isActive = filters.isActive;
    }

    let orderBy: any = {};
    switch (filters.sortBy) {
      case 'price':
        orderBy.price = filters.sortOrder || 'asc';
        break;
      case 'rating':
        orderBy.rating = filters.sortOrder || 'desc';
        break;
      case 'created_at':
        orderBy.createdAt = filters.sortOrder || 'desc';
        break;
      default:
        orderBy.createdAt = 'desc';
    }

    const [tours, total] = await Promise.all([
      prisma.tour.findMany({
        where: whereConditions,
        include: {
          schedules: {
            where: {
              isAvailable: true,
              startDate: { gte: new Date() }
            },
            orderBy: { startDate: 'asc' },
            take: 1
          }
        },
        orderBy,
        skip,
        take: limit
      }),
      prisma.tour.count({ where: whereConditions })
    ]);

    const tourSummaries: TourSummary[] = tours.map(tour => ({
      id: tour.id,
      title: tour.title,
      shortDescription: tour.shortDescription,
      category: tour.category,
      type: tour.type,
      duration: tour.duration,
      price: tour.price,
      currency: tour.currency,
      mainImage: (tour.images as any)?.main?.[0] || '',
      rating: tour.rating,
      totalReviews: tour.totalReviews,
      difficulty: tour.difficulty as any,
      locationCity: tour.locationCity,
      locationCountry: tour.locationCountry,
      tourGuideName: '', // Not needed for own tours
      tourGuideProfileImage: undefined,
      isActive: tour.isActive,
      nextAvailableDate: tour.schedules[0]?.startDate.toISOString()
    }));

    return {
      tours: tourSummaries,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  // --- SCHEDULE MANAGEMENT ---

  async createTourSchedule(tourId: string, tourGuideId: number, scheduleData: CreateTourScheduleDto): Promise<TourScheduleInfo> {
    // Verify tour belongs to guide
    const tour = await prisma.tour.findFirst({
      where: { id: tourId, tourGuideId }
    });

    if (!tour) {
      throw new Error('Tour not found or access denied');
    }

    const schedule = await prisma.tourSchedule.create({
      data: {
        tourId,
        tourGuideId,
        startDate: new Date(scheduleData.startDate),
        endDate: new Date(scheduleData.endDate),
        startTime: scheduleData.startTime,
        endTime: scheduleData.endTime,
        availableSlots: scheduleData.availableSlots,
        price: scheduleData.price,
        specialNotes: scheduleData.specialNotes
      }
    });

    return {
      id: schedule.id,
      tourId: schedule.tourId,
      startDate: schedule.startDate.toISOString(),
      endDate: schedule.endDate.toISOString(),
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      availableSlots: schedule.availableSlots,
      bookedSlots: schedule.bookedSlots,
      isAvailable: schedule.isAvailable,
      price: schedule.price ?? undefined,
      specialNotes: schedule.specialNotes ?? undefined,
      createdAt: schedule.createdAt.toISOString(),
      updatedAt: schedule.updatedAt.toISOString()
    };
  }

  async updateTourSchedule(scheduleId: string, tourGuideId: number, updateData: UpdateTourScheduleDto): Promise<TourScheduleInfo> {
    // Verify schedule belongs to guide
    const existingSchedule = await prisma.tourSchedule.findFirst({
      where: { id: scheduleId, tourGuideId }
    });

    if (!existingSchedule) {
      throw new Error('Schedule not found or access denied');
    }

    const schedule = await prisma.tourSchedule.update({
      where: { id: scheduleId },
      data: {
        ...updateData,
        startDate: updateData.startDate ? new Date(updateData.startDate) : undefined,
        endDate: updateData.endDate ? new Date(updateData.endDate) : undefined
      }
    });

    return {
      id: schedule.id,
      tourId: schedule.tourId,
      startDate: schedule.startDate.toISOString(),
      endDate: schedule.endDate.toISOString(),
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      availableSlots: schedule.availableSlots,
      bookedSlots: schedule.bookedSlots,
      isAvailable: schedule.isAvailable,
      price: schedule.price ?? undefined,
      specialNotes: schedule.specialNotes ?? undefined,
      createdAt: schedule.createdAt.toISOString(),
      updatedAt: schedule.updatedAt.toISOString()
    };
  }

  async deleteTourSchedule(scheduleId: string, tourGuideId: number): Promise<void> {
    // Verify schedule belongs to guide
    const schedule = await prisma.tourSchedule.findFirst({
      where: { id: scheduleId, tourGuideId }
    });

    if (!schedule) {
      throw new Error('Schedule not found or access denied');
    }

    // Check for active bookings
    const activeBookings = await prisma.tourBooking.count({
      where: {
        scheduleId,
        status: { in: ['pending', 'confirmed', 'in_progress'] }
      }
    });

    if (activeBookings > 0) {
      throw new Error('Cannot delete schedule with active bookings');
    }

    await prisma.tourSchedule.delete({
      where: { id: scheduleId }
    });
  }

  async getTourSchedules(tourId: string, tourGuideId: number): Promise<TourScheduleInfo[]> {
    // Verify tour belongs to guide
    const tour = await prisma.tour.findFirst({
      where: { id: tourId, tourGuideId }
    });

    if (!tour) {
      throw new Error('Tour not found or access denied');
    }

    const schedules = await prisma.tourSchedule.findMany({
      where: { tourId },
      orderBy: { startDate: 'asc' }
    });

    return schedules.map(schedule => ({
      id: schedule.id,
      tourId: schedule.tourId,
      startDate: schedule.startDate.toISOString(),
      endDate: schedule.endDate.toISOString(),
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      availableSlots: schedule.availableSlots,
      bookedSlots: schedule.bookedSlots,
      isAvailable: schedule.isAvailable,
      price: schedule.price ?? undefined,
      specialNotes: schedule.specialNotes ?? undefined,
      createdAt: schedule.createdAt.toISOString(),
      updatedAt: schedule.updatedAt.toISOString()
    }));
  }

  // --- BOOKING MANAGEMENT ---

  async getTourGuideBookings(tourGuideId: number, filters: TourBookingFilters, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const whereConditions: any = {
      tourGuideId
    };

    if (filters.status && filters.status.length > 0) {
      whereConditions.status = { in: filters.status };
    }

    if (filters.tourId) {
      whereConditions.tourId = filters.tourId;
    }

    if (filters.dateRange) {
      whereConditions.schedule = {
        startDate: {
          gte: new Date(filters.dateRange.start),
          lte: new Date(filters.dateRange.end)
        }
      };
    }

    let orderBy: any = {};
    switch (filters.sortBy) {
      case 'date':
        orderBy = { schedule: { startDate: filters.sortOrder || 'desc' } };
        break;
      case 'amount':
        orderBy.totalAmount = filters.sortOrder || 'desc';
        break;
      default:
        orderBy.createdAt = 'desc';
    }

    const [bookings, total] = await Promise.all([
      prisma.tourBooking.findMany({
        where: whereConditions,
        include: {
          tour: {
            select: {
              title: true,
              tourGuide: {
                select: {
                  firstName: true,
                  lastName: true
                }
              }
            }
          },
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true
            }
          },
          schedule: {
            select: {
              startDate: true,
              startTime: true
            }
          }
        },
        orderBy,
        skip,
        take: limit
      }),
      prisma.tourBooking.count({ where: whereConditions })
    ]);

    const bookingInfos = bookings.map(booking => this.formatTourBookingInfo(booking));

    return {
      bookings: bookingInfos,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  async updateTourBooking(bookingId: string, tourGuideId: number, updateData: TourBookingUpdateDto): Promise<TourBookingInfo> {
    // Verify booking belongs to guide
    const existingBooking = await prisma.tourBooking.findFirst({
      where: { id: bookingId, tourGuideId }
    });

    if (!existingBooking) {
      throw new Error('Booking not found or access denied');
    }

    const booking = await prisma.tourBooking.update({
      where: { id: bookingId },
      data: updateData,
      include: {
        tour: {
          select: {
            title: true,
            tourGuide: {
              select: {
                firstName: true,
                lastName: true
              }
            }
          }
        },
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true
          }
        },
        schedule: {
          select: {
            startDate: true,
            startTime: true
          }
        }
      }
    });

    return this.formatTourBookingInfo(booking);
  }

  async getTourBookingCalendar(tourGuideId: number, year: number, month: number): Promise<TourCalendarMonth> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const bookings = await prisma.tourBooking.findMany({
      where: {
        tourGuideId,
        schedule: {
          startDate: {
            gte: startDate,
            lte: endDate
          }
        }
      },
      include: {
        tour: {
          select: {
            title: true
          }
        },
        schedule: true
      }
    });

    // Group bookings by date and format calendar
    const daysInMonth = endDate.getDate();
    const days = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const currentDate = new Date(year, month - 1, day);
      const dayBookings = bookings.filter(booking =>
        booking.schedule.startDate.toDateString() === currentDate.toDateString()
      );

      days.push({
        date: currentDate.toISOString(),
        tours: dayBookings.map(booking => ({
          id: booking.tour.title,
          scheduleId: booking.scheduleId,
          title: booking.tour.title,
          startTime: booking.schedule.startTime,
          endTime: booking.schedule.endTime,
          bookedSlots: booking.numberOfParticipants,
          totalSlots: booking.schedule.availableSlots,
          status: booking.status === 'completed' ? 'completed' as const :
            booking.status === 'cancelled' ? 'cancelled' as const :
              booking.schedule.bookedSlots >= booking.schedule.availableSlots ? 'fully_booked' as const : 'available' as const
        })),
        totalBookings: dayBookings.length,
        totalRevenue: dayBookings.reduce((sum, booking) => sum + booking.totalAmount, 0),
        isToday: currentDate.toDateString() === new Date().toDateString()
      });
    }

    return {
      year,
      month,
      days
    };
  }

  // --- MEDIA MANAGEMENT ---

  async uploadTourImages(tourId: string, tourGuideId: number, category: keyof TourImages, imageUrls: string[]): Promise<TourInfo> {
    // Verify tour belongs to guide
    const tour = await prisma.tour.findFirst({
      where: { id: tourId, tourGuideId }
    });

    if (!tour) {
      throw new Error('Tour not found or access denied');
    }

    // Update tour images
    const currentImages = tour.images as any || {};
    const updatedImages = {
      ...currentImages,
      [category]: [...(currentImages[category] || []), ...imageUrls]
    };

    const updatedTour = await prisma.tour.update({
      where: { id: tourId },
      data: { images: updatedImages },
      include: {
        tourGuide: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            profileImage: true,
            bio: true,
            experience: true,
            languages: true,
            specializations: true,
            rating: true,
            totalTours: true,
            isVerified: true,
            licenseNumber: true,
            certifications: true
          }
        },
        schedules: {
          orderBy: { startDate: 'asc' }
        }
      }
    });

    return this.formatTourInfo(updatedTour);
  }

  async removeTourImage(tourId: string, tourGuideId: number, category: keyof TourImages, imageUrl: string): Promise<TourInfo> {
    // Verify tour belongs to guide
    const tour = await prisma.tour.findFirst({
      where: { id: tourId, tourGuideId }
    });

    if (!tour) {
      throw new Error('Tour not found or access denied');
    }

    // Remove image from tour
    const currentImages = tour.images as any || {};
    const updatedImages = {
      ...currentImages,
      [category]: (currentImages[category] || []).filter((url: string) => url !== imageUrl)
    };

    const updatedTour = await prisma.tour.update({
      where: { id: tourId },
      data: { images: updatedImages },
      include: {
        tourGuide: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            profileImage: true,
            bio: true,
            experience: true,
            languages: true,
            specializations: true,
            rating: true,
            totalTours: true,
            isVerified: true,
            licenseNumber: true,
            certifications: true
          }
        },
        schedules: {
          orderBy: { startDate: 'asc' }
        }
      }
    });

    return this.formatTourInfo(updatedTour);
  }

  // --- STATUS MANAGEMENT ---

  async activateTour(tourId: string, tourGuideId: number): Promise<TourInfo> {
    return this.updateTourStatus(tourId, tourGuideId, true);
  }

  async deactivateTour(tourId: string, tourGuideId: number): Promise<TourInfo> {
    return this.updateTourStatus(tourId, tourGuideId, false);
  }

  private async updateTourStatus(tourId: string, tourGuideId: number, isActive: boolean): Promise<TourInfo> {
    // Verify tour belongs to guide
    const tour = await prisma.tour.findFirst({
      where: { id: tourId, tourGuideId }
    });

    if (!tour) {
      throw new Error('Tour not found or access denied');
    }

    const updatedTour = await prisma.tour.update({
      where: { id: tourId },
      data: { isActive },
      include: {
        tourGuide: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            profileImage: true,
            bio: true,
            experience: true,
            languages: true,
            specializations: true,
            rating: true,
            totalTours: true,
            isVerified: true,
            licenseNumber: true,
            certifications: true
          }
        },
        schedules: {
          orderBy: { startDate: 'asc' }
        }
      }
    });

    return this.formatTourInfo(updatedTour);
  }

  // --- EARNINGS ---

  async getTourGuideEarnings(tourGuideId: number, timeRange: string): Promise<TourEarningsOverview> {
    const now = new Date();
    let startDate: Date;

    switch (timeRange) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'quarter':
        startDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const [
      totalEarnings,
      periodEarnings,
      totalBookings,
      periodBookings,
      averagePrice,
      conversionRate
    ] = await Promise.all([
      prisma.tourEarnings.aggregate({
        where: { tourGuideId },
        _sum: { netAmount: true }
      }),
      prisma.tourEarnings.aggregate({
        where: {
          tourGuideId,
          createdAt: { gte: startDate }
        },
        _sum: { netAmount: true }
      }),
      prisma.tourBooking.count({
        where: { tourGuideId }
      }),
      prisma.tourBooking.count({
        where: {
          tourGuideId,
          createdAt: { gte: startDate }
        }
      }),
      prisma.tour.aggregate({
        where: { tourGuideId },
        _avg: { price: true }
      }),
      0.25 // Mock conversion rate - would calculate from actual data
    ]);

    return {
      totalEarnings: totalEarnings._sum.netAmount || 0,
      monthlyEarnings: periodEarnings._sum.netAmount || 0,
      yearlyEarnings: 0, // Would calculate
      pendingPayouts: 0, // Would calculate
      completedPayouts: 0, // Would calculate
      averageTourPrice: averagePrice._avg.price || 0,
      conversionRate,
      revenueGrowth: 0 // Would calculate
    };
  }

  async getTourGuideEarningsBreakdown(tourGuideId: number): Promise<TourEarningsBreakdown[]> {
    const tours = await prisma.tour.findMany({
      where: { tourGuideId },
      include: {
        bookings: {
          where: { status: 'completed' }
        },
        earnings: true
      }
    });

    return tours.map(tour => ({
      tourId: tour.id,
      tourTitle: tour.title,
      totalEarnings: tour.earnings.reduce((sum, earning) => sum + earning.netAmount, 0),
      monthlyEarnings: 0, // Would calculate for current month
      bookingsCount: tour.bookings.length,
      averageBookingValue: tour.bookings.length > 0 ?
        tour.bookings.reduce((sum, booking) => sum + booking.totalAmount, 0) / tour.bookings.length : 0,
      conversionRate: 0, // Would calculate
      lastBooking: tour.bookings[tour.bookings.length - 1]?.createdAt.toISOString()
    }));
  }

  // --- ANALYTICS ---

  async getTourGuideAnalytics(tourGuideId: number, timeRange: string): Promise<TourGuideAnalytics> {
    // This would implement comprehensive analytics
    return {
      overview: {
        totalViews: 0,
        totalBookings: 0,
        totalRevenue: 0,
        averageRating: 0,
        totalParticipants: 0,
        conversionRate: 0,
        repeatGuestRate: 0,
        timeRange: timeRange as any
      },
      tourPerformance: [],
      bookingTrends: [],
      guestInsights: {
        totalGuests: 0,
        newGuests: 0,
        returningGuests: 0,
        averageGroupSize: 0,
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
      },
      revenueAnalytics: {
        monthlyRevenue: [],
        revenueByTour: [],
        seasonalTrends: [],
        pricingOptimization: []
      },
      marketComparison: {
        averagePrice: 0,
        myAveragePrice: 0,
        bookingRate: 0,
        myBookingRate: 0,
        competitorCount: 0,
        marketPosition: 'mid_range',
        opportunities: []
      }
    };
  }

  async getTourAnalytics(tourId: string, tourGuideId: number, timeRange: string): Promise<TourAnalytics> {
    // Verify tour belongs to guide
    const tour = await prisma.tour.findFirst({
      where: { id: tourId, tourGuideId }
    });

    if (!tour) {
      throw new Error('Tour not found or access denied');
    }

    // This would implement detailed tour analytics
    return {
      tourId,
      tourTitle: tour.title,
      views: tour.views,
      bookings: tour.totalBookings,
      revenue: 0, // Would calculate
      averageRating: tour.rating,
      conversionRate: 0, // Would calculate
      period: timeRange as any,
      data: []
    };
  }

  // --- MESSAGING ---

  async sendTourMessage(senderId: number, messageData: CreateTourMessageDto): Promise<TourMessageInfo> {
    const message = await prisma.tourMessage.create({
      data: {
        senderId,
        receiverId: messageData.receiverId,
        bookingId: messageData.bookingId,
        tourId: messageData.tourId,
        subject: messageData.subject,
        message: messageData.message,
        attachments: messageData.attachments || [],
        messageType: messageData.messageType
      },
      include: {
        sender: {
          select: {
            firstName: true,
            lastName: true,
            userType: true
          }
        },
        receiver: {
          select: {
            firstName: true,
            lastName: true
          }
        }
      }
    });

    return {
      id: message.id,
      senderId: message.senderId,
      senderName: `${message.sender.firstName} ${message.sender.lastName}`,
      senderType: message.sender.userType === 'tourguide' ? 'guide' : 'guest',
      receiverId: message.receiverId,
      receiverName: `${message.receiver.firstName} ${message.receiver.lastName}`,
      bookingId: message.bookingId ?? undefined,
      tourId: message.tourId ?? undefined,
      subject: message.subject ?? undefined,
      message: message.message,
      attachments: message.attachments as string[],
      messageType: message.messageType as any,
      isRead: message.isRead,
      createdAt: message.createdAt.toISOString(),
      updatedAt: message.updatedAt.toISOString()
    };
  }

  async getTourMessages(userId: number, conversationWith?: number, bookingId?: string, tourId?: string): Promise<TourMessageInfo[]> {
    const whereConditions: any = {
      OR: [
        { senderId: userId },
        { receiverId: userId }
      ]
    };

    if (conversationWith) {
      whereConditions.OR = [
        { senderId: userId, receiverId: conversationWith },
        { senderId: conversationWith, receiverId: userId }
      ];
    }

    if (bookingId) {
      whereConditions.bookingId = bookingId;
    }

    if (tourId) {
      whereConditions.tourId = tourId;
    }

    const messages = await prisma.tourMessage.findMany({
      where: whereConditions,
      include: {
        sender: {
          select: {
            firstName: true,
            lastName: true,
            userType: true
          }
        },
        receiver: {
          select: {
            firstName: true,
            lastName: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return messages.map(message => ({
      id: message.id,
      senderId: message.senderId,
      senderName: `${message.sender.firstName} ${message.sender.lastName}`,
      senderType: message.sender.userType === 'tourguide' ? 'guide' : 'guest',
      receiverId: message.receiverId,
      receiverName: `${message.receiver.firstName} ${message.receiver.lastName}`,
      bookingId: message.bookingId ?? undefined,
      tourId: message.tourId ?? undefined,
      subject: message.subject ?? undefined,
      message: message.message,
      attachments: message.attachments as string[],
      messageType: message.messageType as any,
      isRead: message.isRead,
      createdAt: message.createdAt.toISOString(),
      updatedAt: message.updatedAt.toISOString()
    }));
  }

  // --- ADMIN OPERATIONS ---

  async getAllTours(filters: TourSearchFilters, page: number = 1, limit: number = 20) {
    // Similar to searchTours but without isActive filter for admin
    const skip = (page - 1) * limit;

    const whereConditions: any = {};

    // Build where conditions (similar to searchTours but include inactive tours)
    if (filters.search) {
      whereConditions.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } }
      ];
    }

    if (filters.category) {
      whereConditions.category = filters.category;
    }

    if (filters.tourGuideId) {
      whereConditions.tourGuideId = filters.tourGuideId;
    }

    if (filters.isActive !== undefined) {
      whereConditions.isActive = filters.isActive;
    }

    const [tours, total] = await Promise.all([
      prisma.tour.findMany({
        where: whereConditions,
        include: {
          tourGuide: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              profileImage: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.tour.count({ where: whereConditions })
    ]);

    return {
      tours: tours.map(tour => this.formatTourInfo(tour)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  async getAllTourBookings(filters: TourBookingFilters, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const whereConditions: any = {};

    if (filters.status && filters.status.length > 0) {
      whereConditions.status = { in: filters.status };
    }

    if (filters.tourId) {
      whereConditions.tourId = filters.tourId;
    }

    if (filters.tourGuideId) {
      whereConditions.tourGuideId = filters.tourGuideId;
    }

    if (filters.userId) {
      whereConditions.userId = filters.userId;
    }

    if (filters.dateRange) {
      whereConditions.schedule = {
        startDate: {
          gte: new Date(filters.dateRange.start),
          lte: new Date(filters.dateRange.end)
        }
      };
    }

    const [bookings, total] = await Promise.all([
      prisma.tourBooking.findMany({
        where: whereConditions,
        include: {
          tour: {
            select: {
              title: true,
              tourGuide: {  // Access tour guide through tour
                select: {
                  firstName: true,
                  lastName: true
                }
              }
            }
          },
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true
            }
          },
          schedule: {
            select: {
              startDate: true,
              startTime: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.tourBooking.count({ where: whereConditions })
    ]);

    return {
      bookings: bookings.map(booking => this.formatTourBookingInfo(booking)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  async getTourSystemAnalytics(timeRange: string): Promise<TourSystemAnalytics> {
    const [
      totalTours,
      totalGuides,
      totalBookings,
      totalRevenue
    ] = await Promise.all([
      prisma.tour.count(),
      prisma.user.count({ where: { userType: 'tourguide' } }),
      prisma.tourBooking.count(),
      prisma.tourEarnings.aggregate({
        _sum: { amount: true }
      })
    ]);

    return {
      overview: {
        totalTours,
        totalGuides,
        totalBookings,
        totalRevenue: totalRevenue._sum.amount || 0,
        timeRange
      },
      distributions: {
        toursByCategory: [],
        guidesByExperience: [],
        bookingsByStatus: []
      },
      recentActivity: {
        recentTours: [],
        recentBookings: [],
        recentGuides: []
      }
    };
  }

  // --- BULK OPERATIONS ---

  async bulkUpdateTours(tourIds: string[], operation: string, data?: any): Promise<BulkOperationResult> {
    const results = await Promise.allSettled(
      tourIds.map(async tourId => {
        switch (operation) {
          case 'activate':
            return await prisma.tour.update({
              where: { id: tourId },
              data: { isActive: true }
            });
          case 'deactivate':
            return await prisma.tour.update({
              where: { id: tourId },
              data: { isActive: false }
            });
          case 'delete':
            return await prisma.tour.update({
              where: { id: tourId },
              data: { isActive: false }
            });
          case 'update_category':
            return await prisma.tour.update({
              where: { id: tourId },
              data: { category: data.category }
            });
          default:
            throw new Error(`Unknown operation: ${operation}`);
        }
      })
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.length - successful;

    return {
      total: results.length,
      successful,
      failed,
      results: results.map((result, index) => ({
        targetId: tourIds[index],
        success: result.status === 'fulfilled',
        result: result.status === 'fulfilled' ? result.value : undefined,
        error: result.status === 'rejected' ? result.reason?.message : undefined
      }))
    };
  }

  async bulkUpdateTourBookings(bookingIds: string[], operation: string, data?: any): Promise<BulkOperationResult> {
    const results = await Promise.allSettled(
      bookingIds.map(async bookingId => {
        switch (operation) {
          case 'confirm':
            return await prisma.tourBooking.update({
              where: { id: bookingId },
              data: { status: 'confirmed' }
            });
          case 'cancel':
            return await prisma.tourBooking.update({
              where: { id: bookingId },
              data: { status: 'cancelled' }
            });
          case 'complete':
            return await prisma.tourBooking.update({
              where: { id: bookingId },
              data: { status: 'completed' }
            });
          case 'update_status':
            return await prisma.tourBooking.update({
              where: { id: bookingId },
              data: { status: data.status }
            });
          default:
            throw new Error(`Unknown operation: ${operation}`);
        }
      })
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.length - successful;

    return {
      total: results.length,
      successful,
      failed,
      results: results.map((result, index) => ({
        targetId: bookingIds[index],
        success: result.status === 'fulfilled',
        result: result.status === 'fulfilled' ? result.value : undefined,
        error: result.status === 'rejected' ? result.reason?.message : undefined
      }))
    };
  }

  // --- HELPER METHODS ---

  private formatTourInfo(tour: any): TourInfo {
    return {
      id: tour.id,
      title: tour.title,
      description: tour.description,
      shortDescription: tour.shortDescription,
      category: tour.category,
      type: tour.type,
      duration: tour.duration,
      maxGroupSize: tour.maxGroupSize,
      minGroupSize: tour.minGroupSize,
      price: tour.price,
      currency: tour.currency,
      images: tour.images as TourImages,
      itinerary: tour.itinerary as any[],
      inclusions: tour.inclusions as string[],
      exclusions: tour.exclusions as string[],
      requirements: tour.requirements as string[],
      difficulty: tour.difficulty as any,
      locationCountry: tour.locationCountry,
      locationState: tour.locationState,
      locationCity: tour.locationCity,
      locationAddress: tour.locationAddress,
      latitude: tour.latitude,
      longitude: tour.longitude,
      locationZipCode: tour.locationZipCode,
      meetingPoint: tour.meetingPoint,
      tags: tour.tags as string[],
      rating: tour.rating,
      totalReviews: tour.totalReviews,
      totalBookings: tour.totalBookings,
      views: tour.views,
      isActive: tour.isActive,
      tourGuideId: tour.tourGuideId,
      tourGuide: tour.tourGuide ? {
        id: tour.tourGuide.id,
        firstName: tour.tourGuide.firstName,
        lastName: tour.tourGuide.lastName,
        email: tour.tourGuide.email,
        profileImage: tour.tourGuide.profileImage,
        bio: tour.tourGuide.bio,
        experience: tour.tourGuide.experience,
        languages: tour.tourGuide.languages as string[],
        specializations: tour.tourGuide.specializations as string[],
        rating: tour.tourGuide.rating,
        totalTours: tour.tourGuide.totalTours,
        isVerified: tour.tourGuide.isVerified,
        licenseNumber: tour.tourGuide.licenseNumber,
        certifications: tour.tourGuide.certifications as string[]
      } : {} as TourGuideInfo,
      // FIX: Add null checks for date objects before calling toISOString()
      schedules: tour.schedules ? tour.schedules.map((schedule: any) => ({
        id: schedule.id,
        tourId: schedule.tourId,
        startDate: schedule.startDate?.toISOString() || '',
        endDate: schedule.endDate?.toISOString() || '',
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        availableSlots: schedule.availableSlots,
        bookedSlots: schedule.bookedSlots,
        isAvailable: schedule.isAvailable,
        price: schedule.price,
        specialNotes: schedule.specialNotes,
        createdAt: schedule.createdAt?.toISOString() || '',
        updatedAt: schedule.updatedAt?.toISOString() || ''
      })) : [],
      createdAt: tour.createdAt?.toISOString() || '',
      updatedAt: tour.updatedAt?.toISOString() || ''
    };
  }

  private formatTourBookingInfo(booking: any): TourBookingInfo {
    return {
      id: booking.id,
      tourId: booking.tourId,
      tourTitle: booking.tour.title,
      scheduleId: booking.scheduleId,
      userId: booking.userId,
      userName: `${booking.user.firstName} ${booking.user.lastName}`,
      userEmail: booking.user.email,
      tourGuideId: booking.tourGuideId,
      tourGuideName: `${booking.tourGuide}`,
      numberOfParticipants: booking.numberOfParticipants,
      participants: booking.participants as any[],
      specialRequests: booking.specialRequests,
      totalAmount: booking.totalAmount,
      currency: booking.currency,
      status: booking.status as any,
      paymentStatus: booking.paymentStatus as any,
      paymentId: booking.paymentId,
      checkInStatus: booking.checkInStatus as any,
      checkInTime: booking.checkInTime?.toISOString(),
      checkOutTime: booking.checkOutTime?.toISOString(),
      refundAmount: booking.refundAmount,
      refundReason: booking.refundReason,
      guestNotes: booking.guestNotes,
      bookingDate: booking.bookingDate.toISOString(),
      tourDate: booking.schedule.startDate.toISOString(),
      tourTime: booking.schedule.startTime,
      createdAt: booking.createdAt.toISOString(),
      updatedAt: booking.updatedAt.toISOString()
    };
  }

  private async updateTourRating(tourId: string): Promise<void> {
    const reviews = await prisma.tourReview.findMany({
      where: { tourId, isVisible: true },
      select: { rating: true }
    });

    if (reviews.length > 0) {
      const averageRating = reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;

      await prisma.tour.update({
        where: { id: tourId },
        data: {
          rating: parseFloat(averageRating.toFixed(2)),
          totalReviews: reviews.length
        }
      });
    }
  }

  private async updateTourGuideRating(tourGuideId: number): Promise<void> {
    const reviews = await prisma.tourReview.findMany({
      where: { tourGuideId, isVisible: true },
      select: { rating: true }
    });

    if (reviews.length > 0) {
      const averageRating = reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;

      await prisma.user.update({
        where: { id: tourGuideId },
        data: { rating: parseFloat(averageRating.toFixed(2)) }
      });
    }
  }

  private async getRecentTourBookings(tourGuideId: number, limit: number = 5): Promise<TourBookingInfo[]> {
    const bookings = await prisma.tourBooking.findMany({
      where: { tourGuideId },
      include: {
        tour: {
          select: {
            title: true,
            // FIX: Include tourGuide data
            tourGuide: {
              select: {
                id: true,
                firstName: true,
                lastName: true
              }
            }
          }
        },
        user: { select: { firstName: true, lastName: true, email: true } },
        schedule: { select: { startDate: true, startTime: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    return bookings.map(booking => this.formatTourBookingInfo(booking));
  }

  private async getUpcomingTourSchedules(tourGuideId: number, limit: number = 5): Promise<TourScheduleInfo[]> {
    const schedules = await prisma.tourSchedule.findMany({
      where: {
        tourGuideId,
        isAvailable: true,
        startDate: { gte: new Date() }
      },
      orderBy: { startDate: 'asc' },
      take: limit
    });

    return schedules.map(schedule => ({
      id: schedule.id,
      tourId: schedule.tourId,
      startDate: schedule.startDate.toISOString(),
      endDate: schedule.endDate.toISOString(),
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      availableSlots: schedule.availableSlots,
      bookedSlots: schedule.bookedSlots,
      isAvailable: schedule.isAvailable,
      price: schedule.price ?? undefined,
      specialNotes: schedule.specialNotes ?? undefined,
      createdAt: schedule.createdAt.toISOString(),
      updatedAt: schedule.updatedAt.toISOString()
    }));
  }

  private async getMonthlyEarnings(tourGuideId: number) {
    // This would implement monthly earnings calculation
    return [];
  }

  private async getTourGuideQuickStats(tourGuideId: number) {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [todayTours, tomorrowTours, weekBookings] = await Promise.all([
      prisma.tourSchedule.count({
        where: {
          tourGuideId,
          startDate: {
            gte: new Date(today.toDateString()),
            lt: new Date(tomorrow.toDateString())
          }
        }
      }),
      prisma.tourSchedule.count({
        where: {
          tourGuideId,
          startDate: {
            gte: new Date(tomorrow.toDateString()),
            lt: new Date(new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000).toDateString())
          }
        }
      }),
      prisma.tourBooking.count({
        where: {
          tourGuideId,
          createdAt: {
            gte: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
          }
        }
      })
    ]);

    return {
      todayTours,
      tomorrowTours,
      weekBookings,
      pendingActions: 0 // Would calculate pending reviews, messages, etc.
    };
  }

  private async getTourGuideRecentActivity(tourGuideId: number) {
    // This would implement recent activity tracking
    return [];
  }

  private async getTourGuideAlerts(tourGuideId: number) {
    // This would implement alert system
    return [];
  }
}