"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TourService = void 0;
const client_1 = require("@prisma/client");
const brevo_tours_1 = require("../utils/brevo.tours");
const prisma = new client_1.PrismaClient();
class TourService {
    constructor() {
        this.emailService = new brevo_tours_1.BrevoTourMailingService();
    }
    // --- PUBLIC TOUR OPERATIONS ---
    async searchTours(filters, page = 1, limit = 20) {
        const skip = (page - 1) * limit;
        const whereConditions = {
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
            if (filters.minPrice)
                whereConditions.price.gte = filters.minPrice;
            if (filters.maxPrice)
                whereConditions.price.lte = filters.maxPrice;
        }
        if (filters.minDuration || filters.maxDuration) {
            whereConditions.duration = {};
            if (filters.minDuration)
                whereConditions.duration.gte = filters.minDuration;
            if (filters.maxDuration)
                whereConditions.duration.lte = filters.maxDuration;
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
        let orderBy = {};
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
        const tourSummaries = tours.map(tour => ({
            id: tour.id,
            title: tour.title,
            shortDescription: tour.shortDescription,
            category: tour.category,
            type: tour.type,
            duration: tour.duration,
            price: tour.price,
            currency: tour.currency,
            mainImage: tour.images?.main?.[0] || '',
            rating: tour.rating,
            totalReviews: tour.totalReviews,
            difficulty: tour.difficulty,
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
    async getTourById(tourId) {
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
        if (!tour)
            return null;
        // Increment view count
        await prisma.tour.update({
            where: { id: tourId },
            data: { views: { increment: 1 } }
        });
        return this.formatTourInfo(tour);
    }
    async getFeaturedTours(limit = 8) {
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
            mainImage: tour.images?.main?.[0] || '',
            rating: tour.rating,
            totalReviews: tour.totalReviews,
            difficulty: tour.difficulty,
            locationCity: tour.locationCity,
            locationCountry: tour.locationCountry,
            tourGuideName: `${tour.tourGuide.firstName} ${tour.tourGuide.lastName}`,
            tourGuideProfileImage: tour.tourGuide.profileImage,
            isActive: tour.isActive,
            nextAvailableDate: tour.schedules[0]?.startDate.toISOString()
        }));
    }
    async getTourReviews(tourId, page = 1, limit = 10) {
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
        const reviewInfos = reviews.map(review => ({
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
            images: review.images,
            pros: review.pros,
            cons: review.cons,
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
    async getTourCategories() {
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
    async getLocationSuggestions(query) {
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
        const uniqueLocations = new Set();
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
    async searchTourGuides(filters, page = 1, limit = 20) {
        const skip = (page - 1) * limit;
        const whereConditions = {
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
        let orderBy = {};
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
        const guideInfos = guides.map(guide => ({
            id: guide.id,
            firstName: guide.firstName,
            lastName: guide.lastName,
            profileImage: guide.profileImage ?? undefined,
            bio: guide.bio ?? undefined,
            experience: guide.experience ?? undefined,
            languages: guide.languages,
            specializations: guide.specializations,
            rating: guide.rating,
            totalTours: guide.totalTours,
            isVerified: guide.isVerified,
            licenseNumber: guide.licenseNumber ?? undefined,
            certifications: guide.certifications
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
    async createTourBooking(userId, bookingData) {
        // Verify tour and schedule exist and are available
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
                const emailContext = {
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
                        logo: 'https://jambolush.com/logo.png'
                    },
                    tour: this.formatTourInfo(booking.tour),
                    booking: this.formatTourBookingInfo(booking)
                };
                await this.emailService.sendNewBookingRequestEmail(emailContext);
            }
        }
        catch (emailError) {
            console.error('Failed to send booking request email:', emailError);
        }
        return this.formatTourBookingInfo(booking);
    }
    async getUserTourBookings(userId, filters, page = 1, limit = 20) {
        const skip = (page - 1) * limit;
        const whereConditions = {
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
        let orderBy = {};
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
    async createTourReview(userId, reviewData) {
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
            images: review.images,
            pros: review.pros,
            cons: review.cons,
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
    async getTourGuideDashboard(tourGuideId) {
        const [totalTours, activeTours, totalBookings, totalRevenue, averageRating, totalParticipants, recentBookings, upcomingTours, pendingReviews] = await Promise.all([
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
    async getEnhancedTourGuideDashboard(tourGuideId) {
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
    async createTour(tourGuideId, tourData) {
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
            await Promise.all(tourData.schedules.map(schedule => prisma.tourSchedule.create({
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
            })));
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
                const emailContext = {
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
                        logo: 'https://jambolush.com/logo.png' // Replace with your logo
                    },
                    tour: this.formatTourInfo(tour)
                };
                await this.emailService.sendNewTourConfirmationEmail(emailContext);
            }
        }
        catch (emailError) {
            console.error('Failed to send tour confirmation email:', emailError);
            // Don't fail the tour creation if email fails
        }
        return this.formatTourInfo({ ...tour, schedules: [] });
    }
    async updateTour(tourId, tourGuideId, updateData) {
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
    async deleteTour(tourId, tourGuideId) {
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
    async getToursByGuide(tourGuideId, filters, page = 1, limit = 20) {
        const skip = (page - 1) * limit;
        const whereConditions = {
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
        let orderBy = {};
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
        const tourSummaries = tours.map(tour => ({
            id: tour.id,
            title: tour.title,
            shortDescription: tour.shortDescription,
            category: tour.category,
            type: tour.type,
            duration: tour.duration,
            price: tour.price,
            currency: tour.currency,
            mainImage: tour.images?.main?.[0] || '',
            rating: tour.rating,
            totalReviews: tour.totalReviews,
            difficulty: tour.difficulty,
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
    async createTourSchedule(tourId, tourGuideId, scheduleData) {
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
    async updateTourSchedule(scheduleId, tourGuideId, updateData) {
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
    async deleteTourSchedule(scheduleId, tourGuideId) {
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
    async getTourSchedules(tourId, tourGuideId) {
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
    async getTourGuideBookings(tourGuideId, filters, page = 1, limit = 20) {
        const skip = (page - 1) * limit;
        const whereConditions = {
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
        let orderBy = {};
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
    async updateTourBooking(bookingId, tourGuideId, updateData) {
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
    async getTourBookingCalendar(tourGuideId, year, month) {
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
            const dayBookings = bookings.filter(booking => booking.schedule.startDate.toDateString() === currentDate.toDateString());
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
                    status: booking.status === 'completed' ? 'completed' :
                        booking.status === 'cancelled' ? 'cancelled' :
                            booking.schedule.bookedSlots >= booking.schedule.availableSlots ? 'fully_booked' : 'available'
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
    async uploadTourImages(tourId, tourGuideId, category, imageUrls) {
        // Verify tour belongs to guide
        const tour = await prisma.tour.findFirst({
            where: { id: tourId, tourGuideId }
        });
        if (!tour) {
            throw new Error('Tour not found or access denied');
        }
        // Update tour images
        const currentImages = tour.images || {};
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
    async removeTourImage(tourId, tourGuideId, category, imageUrl) {
        // Verify tour belongs to guide
        const tour = await prisma.tour.findFirst({
            where: { id: tourId, tourGuideId }
        });
        if (!tour) {
            throw new Error('Tour not found or access denied');
        }
        // Remove image from tour
        const currentImages = tour.images || {};
        const updatedImages = {
            ...currentImages,
            [category]: (currentImages[category] || []).filter((url) => url !== imageUrl)
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
    async activateTour(tourId, tourGuideId) {
        return this.updateTourStatus(tourId, tourGuideId, true);
    }
    async deactivateTour(tourId, tourGuideId) {
        return this.updateTourStatus(tourId, tourGuideId, false);
    }
    async updateTourStatus(tourId, tourGuideId, isActive) {
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
    async getTourGuideEarnings(tourGuideId, timeRange) {
        const now = new Date();
        let startDate;
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
        const [totalEarnings, periodEarnings, totalBookings, periodBookings, averagePrice, conversionRate] = await Promise.all([
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
    async getTourGuideEarningsBreakdown(tourGuideId) {
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
    async getTourGuideAnalytics(tourGuideId, timeRange) {
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
                timeRange: timeRange
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
    async getTourAnalytics(tourId, tourGuideId, timeRange) {
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
            period: timeRange,
            data: []
        };
    }
    // --- MESSAGING ---
    async sendTourMessage(senderId, messageData) {
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
            attachments: message.attachments,
            messageType: message.messageType,
            isRead: message.isRead,
            createdAt: message.createdAt.toISOString(),
            updatedAt: message.updatedAt.toISOString()
        };
    }
    async getTourMessages(userId, conversationWith, bookingId, tourId) {
        const whereConditions = {
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
            attachments: message.attachments,
            messageType: message.messageType,
            isRead: message.isRead,
            createdAt: message.createdAt.toISOString(),
            updatedAt: message.updatedAt.toISOString()
        }));
    }
    // --- ADMIN OPERATIONS ---
    async getAllTours(filters, page = 1, limit = 20) {
        // Similar to searchTours but without isActive filter for admin
        const skip = (page - 1) * limit;
        const whereConditions = {};
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
    async getAllTourBookings(filters, page = 1, limit = 20) {
        const skip = (page - 1) * limit;
        const whereConditions = {};
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
    async getTourSystemAnalytics(timeRange) {
        const [totalTours, totalGuides, totalBookings, totalRevenue] = await Promise.all([
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
    async bulkUpdateTours(tourIds, operation, data) {
        const results = await Promise.allSettled(tourIds.map(async (tourId) => {
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
        }));
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
    async bulkUpdateTourBookings(bookingIds, operation, data) {
        const results = await Promise.allSettled(bookingIds.map(async (bookingId) => {
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
        }));
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
    formatTourInfo(tour) {
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
            images: tour.images,
            itinerary: tour.itinerary,
            inclusions: tour.inclusions,
            exclusions: tour.exclusions,
            requirements: tour.requirements,
            difficulty: tour.difficulty,
            locationCountry: tour.locationCountry,
            locationState: tour.locationState,
            locationCity: tour.locationCity,
            locationAddress: tour.locationAddress,
            latitude: tour.latitude,
            longitude: tour.longitude,
            locationZipCode: tour.locationZipCode,
            meetingPoint: tour.meetingPoint,
            tags: tour.tags,
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
                languages: tour.tourGuide.languages,
                specializations: tour.tourGuide.specializations,
                rating: tour.tourGuide.rating,
                totalTours: tour.tourGuide.totalTours,
                isVerified: tour.tourGuide.isVerified,
                licenseNumber: tour.tourGuide.licenseNumber,
                certifications: tour.tourGuide.certifications
            } : {},
            schedules: tour.schedules ? tour.schedules.map((schedule) => ({
                id: schedule.id,
                tourId: schedule.tourId,
                startDate: schedule.startDate.toISOString(),
                endDate: schedule.endDate.toISOString(),
                startTime: schedule.startTime,
                endTime: schedule.endTime,
                availableSlots: schedule.availableSlots,
                bookedSlots: schedule.bookedSlots,
                isAvailable: schedule.isAvailable,
                price: schedule.price,
                specialNotes: schedule.specialNotes,
                createdAt: schedule.createdAt.toISOString(),
                updatedAt: schedule.updatedAt.toISOString()
            })) : [],
            createdAt: tour.createdAt.toISOString(),
            updatedAt: tour.updatedAt.toISOString()
        };
    }
    formatTourBookingInfo(booking) {
        return {
            id: booking.id,
            tourId: booking.tourId,
            tourTitle: booking.tour.title,
            scheduleId: booking.scheduleId,
            userId: booking.userId,
            userName: `${booking.user.firstName} ${booking.user.lastName}`,
            userEmail: booking.user.email,
            tourGuideId: booking.tourGuideId,
            tourGuideName: `${booking.tourGuide.firstName} ${booking.tourGuide.lastName}`,
            numberOfParticipants: booking.numberOfParticipants,
            participants: booking.participants,
            specialRequests: booking.specialRequests,
            totalAmount: booking.totalAmount,
            currency: booking.currency,
            status: booking.status,
            paymentStatus: booking.paymentStatus,
            paymentId: booking.paymentId,
            checkInStatus: booking.checkInStatus,
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
    async updateTourRating(tourId) {
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
    async updateTourGuideRating(tourGuideId) {
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
    async getRecentTourBookings(tourGuideId, limit = 5) {
        const bookings = await prisma.tourBooking.findMany({
            where: { tourGuideId },
            include: {
                tour: { select: { title: true } },
                user: { select: { firstName: true, lastName: true, email: true } },
                schedule: { select: { startDate: true, startTime: true } },
                // Removed invalid 'tourGuide' property
            },
            orderBy: { createdAt: 'desc' },
            take: limit
        });
        return bookings.map(booking => this.formatTourBookingInfo(booking));
    }
    async getUpcomingTourSchedules(tourGuideId, limit = 5) {
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
    async getMonthlyEarnings(tourGuideId) {
        // This would implement monthly earnings calculation
        return [];
    }
    async getTourGuideQuickStats(tourGuideId) {
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
    async getTourGuideRecentActivity(tourGuideId) {
        // This would implement recent activity tracking
        return [];
    }
    async getTourGuideAlerts(tourGuideId) {
        // This would implement alert system
        return [];
    }
}
exports.TourService = TourService;
