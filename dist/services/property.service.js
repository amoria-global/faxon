"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PropertyService = void 0;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
class PropertyService {
    // --- PROPERTY CRUD OPERATIONS ---
    async createProperty(hostId, data) {
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
    async updateProperty(propertyId, hostId, data) {
        const existingProperty = await prisma.property.findFirst({
            where: { id: propertyId, hostId }
        });
        if (!existingProperty) {
            throw new Error('Property not found or access denied');
        }
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
    async deleteProperty(propertyId, hostId) {
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
    async getPropertyById(propertyId) {
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
        if (!property)
            return null;
        await prisma.property.update({
            where: { id: propertyId },
            data: { views: { increment: 1 } }
        });
        return this.transformToPropertyInfo(property);
    }
    // --- THIS ENTIRE METHOD HAS BEEN UPDATED ---
    async searchProperties(filters, page = 1, limit = 20) {
        const skip = (page - 1) * limit;
        const whereClause = {
            status: 'active'
        };
        // Apply filters
        if (filters.location) {
            // UPDATED: Removed `mode: 'insensitive'`
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
            if (filters.minPrice)
                whereClause.pricePerNight.gte = filters.minPrice;
            if (filters.maxPrice)
                whereClause.pricePerNight.lte = filters.maxPrice;
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
        // UPDATED: Keyword search block
        const orConditions = [];
        if (filters.search) {
            orConditions.push({ name: { contains: filters.search } }, // mode removed
            { location: { contains: filters.search } }, // mode removed
            { description: { contains: filters.search } } // description added
            );
        }
        if (orConditions.length > 0) {
            if (whereClause.OR) {
                whereClause.OR.push(...orConditions);
            }
            else {
                whereClause.OR = orConditions;
            }
        }
        // UPDATED: Sort options block
        const orderBy = {};
        if (filters.sortBy) {
            if (filters.sortBy === 'rating') {
                orderBy.averageRating = filters.sortOrder || 'desc';
            }
            else if (filters.sortBy === 'price') {
                orderBy.pricePerNight = filters.sortOrder || 'asc';
            }
            else if (filters.sortBy === 'name') {
                orderBy.name = filters.sortOrder || 'asc';
            }
            else {
                orderBy[filters.sortBy] = filters.sortOrder || 'desc';
            }
        }
        else {
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
            properties: properties.map((p) => this.transformToPropertySummary(p)),
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        };
    }
    async getPropertiesByHost(hostId, filters) {
        const whereClause = { hostId };
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
        // ✅ Use Promise.all to handle async transformations
        const transformedProperties = await Promise.all(properties.map((p) => this.transformToPropertyInfo(p)));
        return transformedProperties;
    }
    // --- BOOKING MANAGEMENT ---
    async createBooking(guestId, data) {
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
    async getBookingsByProperty(propertyId, hostId) {
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
        return bookings.map((b) => this.transformToBookingInfo(b));
    }
    // --- REVIEW MANAGEMENT ---
    async createReview(userId, data) {
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
    async getPropertyReviews(propertyId, page = 1, limit = 10) {
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
            reviews: reviews.map((r) => this.transformToPropertyReview(r)),
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        };
    }
    // --- ANALYTICS & DASHBOARD ---
    async getHostDashboard(hostId) {
        const [totalProperties, activeProperties, bookings, reviews] = await Promise.all([
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
            .filter((b) => b.status === 'completed')
            .reduce((sum, b) => sum + b.totalPrice, 0);
        const avgRating = await prisma.property.aggregate({
            where: { hostId },
            _avg: { averageRating: true }
        });
        const upcomingCheckIns = bookings
            .filter((b) => b.status === 'confirmed' && new Date(b.checkIn) > new Date())
            .slice(0, 5);
        return {
            totalProperties,
            activeProperties,
            totalBookings,
            totalRevenue,
            averageRating: avgRating._avg.averageRating || 0,
            recentBookings: bookings.slice(0, 5).map((b) => this.transformToBookingInfo(b)),
            propertyPerformance: [], // Implement based on requirements
            upcomingCheckIns: upcomingCheckIns.map((b) => this.transformToBookingInfo(b)),
            pendingReviews: reviews
        };
    }
    // --- UTILITY METHODS ---
    async updatePropertyRating(propertyId) {
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
    async getBlockedDates(propertyId) {
        const blockedDates = await prisma.blockedDate.findMany({
            where: {
                propertyId,
                endDate: { gte: new Date() },
                isActive: true
            }
        });
        return blockedDates.flatMap(bd => this.getDateRange(bd.startDate, bd.endDate));
    }
    getDateRange(start, end) {
        const dates = [];
        const currentDate = new Date(start);
        while (currentDate <= end) {
            dates.push(currentDate.toISOString().split('T')[0]);
            currentDate.setDate(currentDate.getDate() + 1);
        }
        return dates;
    }
    async transformToPropertyInfo(property) {
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
    transformToPropertySummary(property) {
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
    transformToBookingInfo(booking) {
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
    transformToPropertyReview(review) {
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
    getMainImage(images) {
        // Priority order for main image
        const priorities = ['exterior', 'livingRoom', 'bedroom', 'kitchen', 'diningArea'];
        for (const category of priorities) {
            if (images[category] && images[category].length > 0) {
                return images[category][0];
            }
        }
        // Fallback to any available image
        for (const category of Object.keys(images)) {
            if (images[category] && images[category].length > 0) {
                return images[category][0];
            }
        }
        return ''; // Default placeholder
    }
    // --- MEDIA MANAGEMENT ---
    async uploadPropertyImages(propertyId, hostId, category, imageUrls) {
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
    async removePropertyImage(propertyId, hostId, category, imageUrl) {
        const property = await prisma.property.findFirst({
            where: { id: propertyId, hostId }
        });
        if (!property) {
            throw new Error('Property not found or access denied');
        }
        const currentImages = JSON.parse(property.images || '{}');
        if (currentImages[category]) {
            currentImages[category] = currentImages[category].filter((url) => url !== imageUrl);
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
    async updatePropertyAvailability(propertyId, hostId, availableFrom, availableTo) {
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
    async blockDates(propertyId, hostId, startDate, endDate, reason) {
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
    // --- PRICING MANAGEMENT ---
    async updatePropertyPricing(propertyId, hostId, pricePerNight, pricePerTwoNights) {
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
    async activateProperty(propertyId, hostId) {
        return this.updatePropertyStatus(propertyId, hostId, 'active');
    }
    async deactivateProperty(propertyId, hostId) {
        return this.updatePropertyStatus(propertyId, hostId, 'inactive');
    }
    async updatePropertyStatus(propertyId, hostId, status) {
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
    async getLocationSuggestions(query) {
        const properties = await prisma.property.findMany({
            where: {
                location: { contains: query },
                status: 'active'
            },
            select: { location: true },
            distinct: ['location'],
            take: 10
        });
        return properties.map((p) => p.location);
    }
    // --- FEATURED PROPERTIES ---
    async getFeaturedProperties(limit = 8) {
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
        return properties.map((p) => this.transformToPropertySummary(p));
    }
    // --- SIMILAR PROPERTIES ---
    async getSimilarProperties(propertyId, limit = 6) {
        const property = await prisma.property.findUnique({
            where: { id: propertyId }
        });
        if (!property)
            return [];
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
        return properties.map((p) => this.transformToPropertySummary(p));
    }
    // Additional methods to add to PropertyService class
    // --- GUEST MANAGEMENT METHODS ---
    async getHostGuests(hostId, filters) {
        const whereClause = {
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
        const orderBy = {};
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
        }
        else {
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
        return guests.map((guest) => this.transformToGuestProfile(guest));
    }
    async getGuestDetails(hostId, guestId) {
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
        const bookings = guest.bookingsAsGuest.map((b) => this.transformToBookingInfo(b));
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
        const propertyBookings = bookings.reduce((acc, b) => {
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
    async getHostBookings(hostId, filters, page = 1, limit = 20) {
        const skip = (page - 1) * limit;
        const whereClause = {
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
        const orderBy = {};
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
        }
        else {
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
            bookings: bookings.map((b) => this.transformToBookingInfo(b)),
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        };
    }
    async updateBooking(hostId, bookingId, data) {
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
        const updateData = {};
        if (data.status)
            updateData.status = data.status;
        if (data.notes)
            updateData.notes = data.notes;
        if (data.specialRequests)
            updateData.specialRequests = data.specialRequests;
        if (data.checkInInstructions)
            updateData.checkInInstructions = data.checkInInstructions;
        if (data.checkOutInstructions)
            updateData.checkOutInstructions = data.checkOutInstructions;
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
    async getBookingCalendar(hostId, year, month) {
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
        const days = [];
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
                let type = 'ongoing';
                if (currentDate.toDateString() === checkIn.toDateString()) {
                    type = 'check_in';
                }
                else if (currentDate.toDateString() === checkOut.toDateString()) {
                    type = 'check_out';
                }
                return {
                    id: booking.id,
                    guestName: `${booking.guest.firstName} ${booking.guest.lastName}`,
                    propertyName: booking.property.name,
                    type,
                    status: booking.status // Cast to BookingStatus type
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
    async getEarningsOverview(hostId) {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
        const [totalEarnings, monthlyEarnings, yearlyEarnings, lastMonthEarnings, totalBookings, monthlyBookings, occupiedNights, totalNights] = await Promise.all([
            // Total earnings from completed bookings
            prisma.booking.aggregate({
                where: {
                    property: { hostId },
                    status: 'completed'
                },
                _sum: { totalPrice: true }
            }),
            // This month's earnings
            prisma.booking.aggregate({
                where: {
                    property: { hostId },
                    status: 'completed',
                    checkOut: { gte: startOfMonth }
                },
                _sum: { totalPrice: true }
            }),
            // This year's earnings
            prisma.booking.aggregate({
                where: {
                    property: { hostId },
                    status: 'completed',
                    checkOut: { gte: startOfYear }
                },
                _sum: { totalPrice: true }
            }),
            // Last month's earnings for growth calculation
            prisma.booking.aggregate({
                where: {
                    property: { hostId },
                    status: 'completed',
                    checkOut: { gte: lastMonthStart, lte: lastMonthEnd }
                },
                _sum: { totalPrice: true }
            }),
            // Total bookings count
            prisma.booking.count({
                where: {
                    property: { hostId },
                    status: 'completed'
                }
            }),
            // This month's bookings
            prisma.booking.count({
                where: {
                    property: { hostId },
                    status: 'completed',
                    checkOut: { gte: startOfMonth }
                }
            }),
            // Calculate occupied nights (approximate)
            prisma.booking.findMany({
                where: {
                    property: { hostId },
                    status: 'completed'
                },
                select: { checkIn: true, checkOut: true }
            }),
            // Get total available nights from properties
            prisma.property.count({
                where: { hostId, status: 'active' }
            })
        ]);
        // Calculate occupied nights
        const occupiedNightsCount = occupiedNights.reduce((total, booking) => {
            const nights = Math.ceil((new Date(booking.checkOut).getTime() - new Date(booking.checkIn).getTime()) / (1000 * 60 * 60 * 24));
            return total + nights;
        }, 0);
        // Approximate total available nights (365 days * active properties)
        const totalAvailableNights = totalNights * 365;
        const occupancyRate = totalAvailableNights > 0 ? (occupiedNightsCount / totalAvailableNights) * 100 : 0;
        // Calculate average nightly rate
        const avgNightlyRate = occupiedNightsCount > 0 ? (totalEarnings._sum.totalPrice || 0) / occupiedNightsCount : 0;
        // Calculate revenue growth
        const currentMonth = monthlyEarnings._sum.totalPrice || 0;
        const lastMonth = lastMonthEarnings._sum.totalPrice || 0;
        const revenueGrowth = lastMonth > 0 ? ((currentMonth - lastMonth) / lastMonth) * 100 : 0;
        return {
            totalEarnings: totalEarnings._sum.totalPrice || 0,
            monthlyEarnings: currentMonth,
            yearlyEarnings: yearlyEarnings._sum.totalPrice || 0,
            pendingPayouts: 0, // TODO: Implement with Payout model
            completedPayouts: 0, // TODO: Implement with Payout model
            averageNightlyRate: avgNightlyRate,
            occupancyRate: occupancyRate,
            revenueGrowth: revenueGrowth
        };
    }
    async getEarningsBreakdown(hostId) {
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
                occupancyRate: Math.min(occupancyRate, 100), // Cap at 100%
                lastBooking: lastBooking?.createdAt.toISOString()
            };
        });
    }
    // --- ANALYTICS METHODS ---
    async getHostAnalytics(hostId, timeRange = 'month') {
        const now = new Date();
        let startDate;
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
            default: // month
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
                averagePrice: 0, // TODO: Implement market data
                myAveragePrice: revenueAnalytics.monthlyRevenue.reduce((sum, m) => sum + m.revenue, 0) / Math.max(revenueAnalytics.monthlyRevenue.length, 1),
                occupancyRate: 0, // TODO: Implement market data
                myOccupancyRate: overview.occupancyRate,
                competitorCount: 0, // TODO: Implement market data
                marketPosition: 'mid_range', // TODO: Implement market analysis
                opportunities: [] // TODO: Implement opportunity analysis
            }
        };
    }
    // --- ENHANCED DASHBOARD ---
    async getEnhancedHostDashboard(hostId) {
        const basicDashboard = await this.getHostDashboard(hostId);
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        const [todayCheckIns, todayCheckOuts, occupiedProperties, pendingActions, recentActivity] = await Promise.all([
            // Today's check-ins
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
            // Today's check-outs
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
            // Currently occupied properties
            prisma.booking.count({
                where: {
                    property: { hostId },
                    status: 'confirmed',
                    checkIn: { lte: today },
                    checkOut: { gt: today }
                }
            }),
            // Pending actions (bookings, reviews, etc.)
            prisma.booking.count({
                where: {
                    property: { hostId },
                    status: 'pending'
                }
            }),
            // Recent activity
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
            alerts: [], // TODO: Implement alert system
            marketTrends: {
                demandTrend: 'stable', // TODO: Implement market analysis
                averagePrice: 0, // TODO: Implement market data
                competitorActivity: 'Normal activity in your area' // TODO: Implement competitor tracking
            }
        };
    }
    // --- HELPER METHODS ---
    transformToGuestProfile(guest) {
        const bookings = guest.bookingsAsGuest || [];
        const completedBookings = bookings.filter((b) => b.status === 'completed');
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
            totalSpent: completedBookings.reduce((sum, b) => sum + b.totalPrice, 0),
            averageRating: guest.averageRating || 0,
            lastBooking: bookings.length > 0 ? bookings[0].createdAt.toISOString() : undefined,
            preferredCommunication: guest.preferredCommunication || 'email',
            notes: guest.hostNotes
        };
    }
    async getAnalyticsOverview(hostId, timeRange) {
        // Implementation would depend on having view tracking and other metrics
        return {
            totalViews: 0, // TODO: Implement view tracking
            totalBookings: 0,
            totalRevenue: 0,
            averageRating: 0,
            occupancyRate: 0,
            conversionRate: 0,
            repeatGuestRate: 0,
            timeRange
        };
    }
    async getPropertyPerformanceMetrics(hostId, timeRange) {
        // Simplified implementation - expand based on needs
        return [];
    }
    async getBookingTrendData(hostId, startDate) {
        // Simplified implementation - expand based on needs
        return [];
    }
    async getGuestAnalytics(hostId) {
        // Simplified implementation - expand based on needs
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
    async getRevenueAnalytics(hostId) {
        // Simplified implementation - expand based on needs
        return {
            monthlyRevenue: [],
            revenueByProperty: [],
            seasonalTrends: [],
            pricingOptimization: []
        };
    }
    async getRecentActivity(hostId) {
        // Get recent bookings, reviews, etc. and combine into activity feed
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
        const activities = [];
        // Add booking activities
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
        // Add review activities
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
        // Sort by timestamp and return most recent
        return activities
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, 10);
    }
}
exports.PropertyService = PropertyService;
