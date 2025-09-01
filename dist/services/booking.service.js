"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookingService = void 0;
//src/services/booking.service.ts
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
class BookingService {
    // --- BOOKING CRUD OPERATIONS ---
    async createBooking(guestId, data) {
        // First validate the booking
        const validation = await this.validateBooking(data.propertyId, data.checkIn, data.checkOut, data.guests);
        if (!validation.isAvailable) {
            throw new Error('Property is not available for the selected dates');
        }
        if (validation.conflicts.length > 0) {
            throw new Error('Selected dates conflict with existing bookings');
        }
        // Get property details
        const property = await prisma.property.findUnique({
            where: { id: data.propertyId },
            include: { host: true }
        });
        if (!property) {
            throw new Error('Property not found');
        }
        // Calculate price breakdown
        const priceBreakdown = this.calculatePriceBreakdown(property.pricePerNight, data.checkIn, data.checkOut);
        // Generate confirmation code
        const confirmationCode = this.generateConfirmationCode();
        // Create booking with proper field mapping
        const booking = await prisma.booking.create({
            data: {
                propertyId: data.propertyId,
                guestId,
                hostId: property.hostId,
                checkIn: new Date(data.checkIn),
                checkOut: new Date(data.checkOut),
                guests: data.guests,
                nights: priceBreakdown.nights,
                pricePerNight: property.pricePerNight,
                subtotal: priceBreakdown.subtotal,
                cleaningFee: priceBreakdown.cleaningFee,
                serviceFee: priceBreakdown.serviceFee,
                taxes: priceBreakdown.taxes,
                totalPrice: priceBreakdown.total,
                status: data.paymentTiming === 'now' ? 'pending' : 'confirmed',
                paymentMethod: data.paymentMethod || null,
                paymentTiming: data.paymentTiming,
                message: data.message || null,
                confirmationCode
            },
            include: {
                property: {
                    include: { host: true }
                },
                guest: true
            }
        });
        // Process payment if paying now
        if (data.paymentTiming === 'now' && data.paymentMethod && data.paymentMethod !== 'property') {
            await this.processPayment(booking.id, data);
        }
        // Send notifications
        await this.sendBookingNotifications(booking.id, 'booking_created');
        return this.transformToBookingInfo(booking);
    }
    async updateBooking(bookingId, userId, data, userRole = 'guest') {
        // Find booking with permissions check
        const whereClause = userRole === 'guest'
            ? { id: bookingId, guestId: userId }
            : { id: bookingId, hostId: userId };
        const existingBooking = await prisma.booking.findFirst({
            where: whereClause,
            include: {
                property: { include: { host: true } },
                guest: true
            }
        });
        if (!existingBooking) {
            throw new Error('Booking not found or access denied');
        }
        // Check if booking can be modified
        if (['completed', 'cancelled', 'refunded'].includes(existingBooking.status)) {
            throw new Error('Cannot modify completed, cancelled, or refunded booking');
        }
        // If dates are being changed, validate availability
        if (data.checkIn || data.checkOut) {
            const newCheckIn = data.checkIn || existingBooking.checkIn.toISOString();
            const newCheckOut = data.checkOut || existingBooking.checkOut.toISOString();
            const validation = await this.validateBooking(existingBooking.propertyId, newCheckIn, newCheckOut, data.guests || existingBooking.guests, bookingId);
            if (!validation.isAvailable || validation.conflicts.length > 0) {
                throw new Error('New dates are not available');
            }
        }
        // Calculate new price if dates changed
        let updateData = {
            ...(data.guests && { guests: data.guests }),
            ...(data.message && { message: data.message }),
            ...(data.status && { status: data.status })
        };
        if (data.checkIn || data.checkOut) {
            const newCheckIn = data.checkIn || existingBooking.checkIn.toISOString();
            const newCheckOut = data.checkOut || existingBooking.checkOut.toISOString();
            const priceBreakdown = this.calculatePriceBreakdown(existingBooking.pricePerNight, newCheckIn, newCheckOut);
            updateData = {
                ...updateData,
                checkIn: new Date(newCheckIn),
                checkOut: new Date(newCheckOut),
                nights: priceBreakdown.nights,
                subtotal: priceBreakdown.subtotal,
                totalPrice: priceBreakdown.total
            };
        }
        const updatedBooking = await prisma.booking.update({
            where: { id: bookingId },
            data: updateData,
            include: {
                property: { include: { host: true } },
                guest: true
            }
        });
        return this.transformToBookingInfo(updatedBooking);
    }
    async cancelBooking(bookingId, userId, reason, userRole = 'guest') {
        const whereClause = userRole === 'guest'
            ? { id: bookingId, guestId: userId }
            : { id: bookingId, hostId: userId };
        const booking = await prisma.booking.findFirst({
            where: whereClause,
            include: {
                property: { include: { host: true } },
                guest: true
            }
        });
        if (!booking) {
            throw new Error('Booking not found or access denied');
        }
        if (booking.status === 'cancelled') {
            throw new Error('Booking is already cancelled');
        }
        // Calculate refund amount based on cancellation policy
        const refundAmount = this.calculateRefundAmount(booking, userRole);
        const cancelledBooking = await prisma.booking.update({
            where: { id: bookingId },
            data: {
                status: 'cancelled',
                cancellationReason: reason,
                refundAmount
            },
            include: {
                property: { include: { host: true } },
                guest: true
            }
        });
        // Process refund if applicable
        if (refundAmount > 0 && booking.paymentTiming === 'now') {
            await this.processRefund(bookingId, refundAmount, reason);
        }
        // Send notifications
        await this.sendBookingNotifications(bookingId, 'booking_cancelled');
        return this.transformToBookingInfo(cancelledBooking);
    }
    // --- BOOKING QUERIES ---
    async getBookingById(bookingId, userId, userRole) {
        let whereClause = { id: bookingId };
        if (userId && userRole) {
            whereClause = userRole === 'guest'
                ? { id: bookingId, guestId: userId }
                : { id: bookingId, hostId: userId };
        }
        const booking = await prisma.booking.findFirst({
            where: whereClause,
            include: {
                property: { include: { host: true } },
                guest: true
            }
        });
        return booking ? this.transformToBookingInfo(booking) : null;
    }
    async searchBookings(filters, page = 1, limit = 20) {
        const skip = (page - 1) * limit;
        const whereClause = {};
        if (filters.propertyId)
            whereClause.propertyId = filters.propertyId;
        if (filters.guestId)
            whereClause.guestId = filters.guestId;
        if (filters.hostId)
            whereClause.hostId = filters.hostId;
        if (filters.status)
            whereClause.status = filters.status;
        if (filters.checkInFrom || filters.checkInTo) {
            whereClause.checkIn = {};
            if (filters.checkInFrom)
                whereClause.checkIn.gte = new Date(filters.checkInFrom);
            if (filters.checkInTo)
                whereClause.checkIn.lte = new Date(filters.checkInTo);
        }
        if (filters.checkOutFrom || filters.checkOutTo) {
            whereClause.checkOut = {};
            if (filters.checkOutFrom)
                whereClause.checkOut.gte = new Date(filters.checkOutFrom);
            if (filters.checkOutTo)
                whereClause.checkOut.lte = new Date(filters.checkOutTo);
        }
        if (filters.minPrice || filters.maxPrice) {
            whereClause.totalPrice = {};
            if (filters.minPrice)
                whereClause.totalPrice.gte = filters.minPrice;
            if (filters.maxPrice)
                whereClause.totalPrice.lte = filters.maxPrice;
        }
        const orderBy = {};
        if (filters.sortBy) {
            orderBy[filters.sortBy === 'created_at' ? 'createdAt' : filters.sortBy] = filters.sortOrder || 'desc';
        }
        else {
            orderBy.createdAt = 'desc';
        }
        const [bookings, total] = await Promise.all([
            prisma.booking.findMany({
                where: whereClause,
                include: {
                    property: { include: { host: true } },
                    guest: true
                },
                orderBy,
                skip,
                take: limit
            }),
            prisma.booking.count({ where: whereClause })
        ]);
        return {
            bookings: bookings.map(b => this.transformToBookingSummary(b)),
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        };
    }
    async getGuestBookings(guestId) {
        const bookings = await prisma.booking.findMany({
            where: { guestId },
            include: {
                property: { include: { host: true } },
                guest: true
            },
            orderBy: { createdAt: 'desc' }
        });
        return bookings.map(b => this.transformToBookingSummary(b));
    }
    async getHostBookings(hostId) {
        const bookings = await prisma.booking.findMany({
            where: { hostId },
            include: {
                property: { include: { host: true } },
                guest: true
            },
            orderBy: { createdAt: 'desc' }
        });
        return bookings.map(b => this.transformToBookingSummary(b));
    }
    async getPropertyBookings(propertyId, hostId) {
        const whereClause = { propertyId };
        if (hostId)
            whereClause.hostId = hostId;
        const bookings = await prisma.booking.findMany({
            where: whereClause,
            include: {
                property: { include: { host: true } },
                guest: true
            },
            orderBy: { checkIn: 'asc' }
        });
        return bookings.map(b => this.transformToBookingSummary(b));
    }
    // --- BOOKING VALIDATION ---
    async validateBooking(propertyId, checkIn, checkOut, guests, excludeBookingId) {
        const property = await prisma.property.findUnique({
            where: { id: propertyId }
        });
        if (!property) {
            throw new Error('Property not found');
        }
        const checkInDate = new Date(checkIn);
        const checkOutDate = new Date(checkOut);
        // Check basic availability
        const isAvailable = property.status === 'active' &&
            checkInDate >= (property.availableFrom || new Date()) &&
            checkOutDate <= (property.availableTo || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));
        // Check for conflicts
        const whereClause = {
            propertyId,
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
        };
        if (excludeBookingId) {
            whereClause.id = { not: excludeBookingId };
        }
        const conflictingBookings = await prisma.booking.findMany({
            where: whereClause,
            select: {
                id: true,
                checkIn: true,
                checkOut: true,
                status: true
            }
        });
        const conflicts = conflictingBookings.map(b => ({
            bookingId: b.id,
            checkIn: b.checkIn.toISOString(),
            checkOut: b.checkOut.toISOString(),
            status: b.status
        }));
        // Calculate price breakdown
        const priceBreakdown = this.calculatePriceBreakdown(property.pricePerNight, checkIn, checkOut);
        return {
            isAvailable: isAvailable && conflicts.length === 0,
            conflicts,
            priceBreakdown,
            maxGuests: property.maxGuests,
            minStay: 1,
            cancellationPolicy: 'Moderate'
        };
    }
    // --- DASHBOARD DATA ---
    async getGuestDashboard(guestId) {
        const now = new Date();
        const [upcomingBookings, pastBookings, totalStats] = await Promise.all([
            prisma.booking.findMany({
                where: {
                    guestId,
                    checkIn: { gte: now },
                    status: { in: ['confirmed', 'pending'] }
                },
                include: {
                    property: true,
                    guest: true
                },
                orderBy: { checkIn: 'asc' },
                take: 10
            }),
            prisma.booking.findMany({
                where: {
                    guestId,
                    checkOut: { lt: now },
                    status: 'completed'
                },
                include: {
                    property: true,
                    guest: true
                },
                orderBy: { checkOut: 'desc' },
                take: 10
            }),
            prisma.booking.aggregate({
                where: { guestId },
                _count: true,
                _sum: { totalPrice: true }
            })
        ]);
        // Get pending reviews
        const pendingReviews = await prisma.booking.findMany({
            where: {
                guestId,
                checkOut: { lt: now },
                status: 'completed',
                // Add review relation check if you have reviews table
            },
            select: {
                id: true,
                property: { select: { name: true } },
                checkOut: true
            },
            take: 5
        });
        // Get favorite properties
        const favoriteProperties = await prisma.booking.groupBy({
            by: ['propertyId'],
            where: { guestId },
            _count: { propertyId: true },
            orderBy: { _count: { propertyId: 'desc' } },
            take: 5
        });
        const favoritePropertiesDetails = await Promise.all(favoriteProperties.map(async (fav) => {
            const property = await prisma.property.findUnique({
                where: { id: fav.propertyId },
                select: { name: true }
            });
            return {
                propertyId: fav.propertyId,
                propertyName: property?.name || 'Unknown Property',
                timesBooked: fav._count.propertyId
            };
        }));
        return {
            upcomingBookings: upcomingBookings.map(b => this.transformToBookingSummary(b)),
            pastBookings: pastBookings.map(b => this.transformToBookingSummary(b)),
            pendingReviews: pendingReviews.map(p => ({
                bookingId: p.id,
                propertyName: p.property.name,
                checkOutDate: p.checkOut.toISOString()
            })),
            totalBookings: totalStats._count || 0,
            totalSpent: totalStats._sum.totalPrice || 0,
            favoriteProperties: favoritePropertiesDetails
        };
    }
    async getHostBookingDashboard(hostId) {
        const today = new Date();
        const startOfDay = new Date(today.setHours(0, 0, 0, 0));
        const endOfDay = new Date(today.setHours(23, 59, 59, 999));
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
        const [todayCheckIns, todayCheckOuts, upcomingBookings, recentBookings, pendingRequests, thisMonthStats, lastMonthStats, occupancyStats] = await Promise.all([
            prisma.booking.findMany({
                where: {
                    hostId,
                    checkIn: { gte: startOfDay, lte: endOfDay },
                    status: 'confirmed'
                },
                include: { property: true, guest: true },
                orderBy: { checkIn: 'asc' }
            }),
            prisma.booking.findMany({
                where: {
                    hostId,
                    checkOut: { gte: startOfDay, lte: endOfDay },
                    status: 'confirmed'
                },
                include: { property: true, guest: true },
                orderBy: { checkOut: 'asc' }
            }),
            prisma.booking.findMany({
                where: {
                    hostId,
                    checkIn: { gte: today },
                    status: 'confirmed'
                },
                include: { property: true, guest: true },
                orderBy: { checkIn: 'asc' },
                take: 10
            }),
            prisma.booking.findMany({
                where: { hostId },
                include: { property: true, guest: true },
                orderBy: { createdAt: 'desc' },
                take: 10
            }),
            prisma.booking.findMany({
                where: { hostId, status: 'pending' },
                include: { property: true, guest: true },
                orderBy: { createdAt: 'asc' }
            }),
            prisma.booking.aggregate({
                where: {
                    hostId,
                    createdAt: { gte: startOfMonth }
                },
                _count: true,
                _sum: { totalPrice: true }
            }),
            prisma.booking.aggregate({
                where: {
                    hostId,
                    createdAt: { gte: startOfLastMonth, lt: startOfMonth }
                },
                _count: true
            }),
            prisma.booking.count({
                where: {
                    hostId,
                    status: 'confirmed',
                    checkIn: { lte: today },
                    checkOut: { gte: today }
                }
            })
        ]);
        const totalProperties = await prisma.property.count({ where: { hostId } });
        const occupancyRate = totalProperties > 0 ? (occupancyStats / totalProperties) * 100 : 0;
        const bookingChange = lastMonthStats._count > 0
            ? ((thisMonthStats._count - lastMonthStats._count) / lastMonthStats._count) * 100
            : 0;
        return {
            todayCheckIns: todayCheckIns.map(b => this.transformToBookingSummary(b)),
            todayCheckOuts: todayCheckOuts.map(b => this.transformToBookingSummary(b)),
            upcomingBookings: upcomingBookings.map(b => this.transformToBookingSummary(b)),
            recentBookings: recentBookings.map(b => this.transformToBookingSummary(b)),
            pendingRequests: pendingRequests.map(b => this.transformToBookingSummary(b)),
            occupancyRate,
            monthlyRevenue: thisMonthStats._sum.totalPrice || 0,
            bookingStats: {
                thisMonth: thisMonthStats._count,
                lastMonth: lastMonthStats._count,
                percentageChange: bookingChange
            }
        };
    }
    // --- UTILITY METHODS ---
    calculateNights(checkIn, checkOut) {
        return Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
    }
    calculatePriceBreakdown(pricePerNight, checkIn, checkOut) {
        const checkInDate = new Date(checkIn);
        const checkOutDate = new Date(checkOut);
        const nights = Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24));
        const subtotal = pricePerNight * nights;
        const cleaningFee = Math.round(subtotal * 0.1); // 10% cleaning fee
        const serviceFee = Math.round(subtotal * 0.05); // 5% service fee
        const taxes = Math.round((subtotal + cleaningFee + serviceFee) * 0.08); // 8% taxes
        return {
            basePrice: pricePerNight,
            nights,
            subtotal,
            cleaningFee,
            serviceFee,
            taxes,
            total: subtotal + cleaningFee + serviceFee + taxes,
            currency: 'USD'
        };
    }
    calculateRefundAmount(booking, cancelledBy) {
        const now = new Date();
        const checkInDate = new Date(booking.checkIn);
        const daysUntilCheckIn = Math.ceil((checkInDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (cancelledBy === 'host') {
            return booking.totalPrice; // Full refund if host cancels
        }
        // Guest cancellation policy (moderate)
        if (daysUntilCheckIn >= 5) {
            return Math.round(booking.totalPrice * 0.5); // 50% refund
        }
        else if (daysUntilCheckIn >= 1) {
            return Math.round(booking.totalPrice * 0.25); // 25% refund
        }
        else {
            return 0; // No refund for same-day cancellation
        }
    }
    generateConfirmationCode() {
        return 'JB' + Math.random().toString(36).substr(2, 8).toUpperCase();
    }
    async processPayment(bookingId, data) {
        // Simulate payment processing
        // In a real implementation, integrate with payment providers
        console.log(`Processing payment for booking ${bookingId} via ${data.paymentMethod}`);
        // Update booking status based on payment result
        await prisma.booking.update({
            where: { id: bookingId },
            data: { status: 'confirmed' } // or 'failed' if payment fails
        });
    }
    async processRefund(bookingId, amount, reason) {
        // Simulate refund processing
        console.log(`Processing refund of $${amount} for booking ${bookingId}: ${reason}`);
        // In a real implementation, process the actual refund
    }
    async sendBookingNotifications(bookingId, type) {
        // Simulate sending notifications
        console.log(`Sending ${type} notification for booking ${bookingId}`);
        // In a real implementation, send emails, SMS, push notifications, etc.
    }
    transformToBookingInfo(booking) {
        const images = JSON.parse(booking.property.images || '{}');
        const mainImage = this.getMainImage(images);
        return {
            id: booking.id,
            propertyId: booking.propertyId,
            propertyName: booking.property.name,
            propertyImage: mainImage,
            propertyLocation: booking.property.location,
            guestId: booking.guestId,
            guestName: `${booking.guest.firstName} ${booking.guest.lastName}`.trim(),
            guestEmail: booking.guest.email,
            guestPhone: booking.guest.phone || null,
            hostId: booking.hostId,
            hostName: `${booking.property.host.firstName} ${booking.property.host.lastName}`.trim(),
            hostEmail: booking.property.host.email,
            checkIn: booking.checkIn.toISOString(),
            checkOut: booking.checkOut.toISOString(),
            nights: booking.nights || this.calculateNights(booking.checkIn, booking.checkOut),
            guests: booking.guests,
            pricePerNight: booking.pricePerNight || booking.property.pricePerNight,
            subtotal: booking.subtotal || 0,
            cleaningFee: booking.cleaningFee || 0,
            serviceFee: booking.serviceFee || 0,
            taxes: booking.taxes || 0,
            totalPrice: booking.totalPrice,
            status: booking.status,
            paymentMethod: booking.paymentMethod || null,
            paymentTiming: booking.paymentTiming || 'later',
            message: booking.message || null,
            specialRequests: booking.specialRequests || null,
            cancellationReason: booking.cancellationReason || null,
            refundAmount: booking.refundAmount || null,
            createdAt: booking.createdAt.toISOString(),
            updatedAt: booking.updatedAt.toISOString(),
            confirmationCode: booking.confirmationCode || 'N/A'
        };
    }
    transformToBookingSummary(booking) {
        const images = JSON.parse(booking.property.images || '{}');
        const mainImage = this.getMainImage(images);
        return {
            id: booking.id,
            propertyName: booking.property.name,
            propertyImage: mainImage,
            guestName: `${booking.guest.firstName} ${booking.guest.lastName}`.trim(),
            checkIn: booking.checkIn.toISOString(),
            checkOut: booking.checkOut.toISOString(),
            totalPrice: booking.totalPrice,
            status: booking.status,
            confirmationCode: booking.confirmationCode,
            createdAt: booking.createdAt.toISOString()
        };
    }
    getMainImage(images) {
        const priorities = ['exterior', 'livingRoom', 'bedroom', 'kitchen', 'diningArea'];
        for (const category of priorities) {
            if (images[category] && images[category].length > 0) {
                return images[category][0];
            }
        }
        for (const category of Object.keys(images)) {
            if (images[category] && images[category].length > 0) {
                return images[category][0];
            }
        }
        return 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=800&q=80';
    }
}
exports.BookingService = BookingService;
