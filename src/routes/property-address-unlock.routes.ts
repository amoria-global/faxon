// src/routes/property-address-unlock.routes.ts - Property Address Unlock Routes

import { Router } from 'express';
import { propertyAddressUnlockController } from '../controllers/property-address-unlock.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * @route   POST /api/property-unlock/unlock-address
 * @desc    Unlock property address and get contact information
 * @access  Private (Authenticated users)
 * @body    {
 *            propertyId: number,
 *            paymentMethod: 'non_refundable_fee' | 'three_month_30_percent',
 *            paymentAmountUSD: number,  // Backend converts to RWF automatically
 *            phoneNumber: string,       // Mobile money phone number
 *            provider?: 'MTN' | 'AIRTEL',  // Payment provider (defaults to MTN)
 *            dealCode?: string          // Optional deal code for free unlock
 *          }
 */
router.post('/unlock-address', propertyAddressUnlockController.unlockAddress);

/**
 * @route   GET /api/properties/:propertyId/unlock-status
 * @desc    Check if user has already unlocked a property
 * @access  Private (Authenticated users)
 * @params  propertyId - Property ID
 * @returns {
 *            unlockId: string,
 *            propertyId: number,
 *            address: string,
 *            coordinates: { lat: number, lng: number } | null,
 *            googleMapsUrl: string,
 *            hostContactInfo: HostContact,
 *            unlockedAt: Date,
 *            paymentMethod: string,
 *            appreciationSubmitted: boolean
 *          }
 */
router.get('/:propertyId/unlock-status', propertyAddressUnlockController.checkUnlockStatus);

/**
 * @route   GET /api/properties/unlock/:unlockId/payment-status
 * @desc    Check payment status for an unlock
 * @access  Private (Authenticated users)
 * @params  unlockId - Unlock ID
 */
router.get('/unlock/:unlockId/payment-status', propertyAddressUnlockController.checkPaymentStatus);

/**
 * @route   GET /api/properties/:propertyId/unlock-fee
 * @desc    Get unlock fee calculation for a property
 * @access  Private (Authenticated users)
 * @params  propertyId - Property ID
 */
router.get('/:propertyId/unlock-fee', propertyAddressUnlockController.getUnlockFee);

/**
 * @route   POST /api/property-unlock/unlock-appreciation
 * @desc    Submit appreciation feedback for unlocked property
 * @access  Private (Authenticated users)
 * @body    {
 *            unlockId: string,
 *            propertyId: number,
 *            appreciationLevel: 'appreciated' | 'neutral' | 'not_appreciated',
 *            feedback?: string
 *          }
 * @returns {
 *            success: boolean,
 *            message: string,
 *            data: {
 *              dealCode?: {
 *                code: string,
 *                userId: number,
 *                generatedAt: Date,
 *                expiresAt: Date,
 *                remainingUnlocks: number,  // Default: 5
 *                isActive: boolean,
 *                sourcePropertyId: number
 *              }
 *            }
 *          }
 * @note    Deal code is AUTOMATICALLY generated for:
 *          - 'not_appreciated' (30% payment method only)
 *          - 'neutral' (30% payment method only)
 *          - 'appreciated' gets NO deal code
 */
router.post('/unlock-appreciation', propertyAddressUnlockController.submitAppreciation);

/**
 * @route   GET /api/property-unlock/my-deal-codes
 * @desc    Get all deal codes for the authenticated user
 * @access  Private (Authenticated users)
 * @returns {
 *            totalDealCodes: number,
 *            activeDealCodes: number,  // Valid (active, not expired, remaining > 0)
 *            dealCodes: Array<{
 *              id: number,
 *              code: string,
 *              remainingUnlocks: number,
 *              isActive: boolean,
 *              generatedAt: Date,
 *              expiresAt: Date,
 *              isExpired: boolean,
 *              isValid: boolean,  // Active AND not expired AND remaining > 0
 *              sourceProperty: {
 *                id: number,
 *                name: string,
 *                location: string,
 *                image: string | null
 *              },
 *              usageHistory: Array<{
 *                propertyId: number,
 *                propertyName: string,
 *                propertyLocation: string,
 *                usedAt: Date
 *              }>
 *            }>
 *          }
 */
router.get('/my-deal-codes', propertyAddressUnlockController.getMyDealCodes);

/**
 * @route   POST /api/property-unlock/validate-deal-code
 * @desc    Validate a deal code before using it
 * @access  Private (Authenticated users)
 * @body    {
 *            dealCode: string
 *          }
 */
router.post('/validate-deal-code', propertyAddressUnlockController.validateDealCode);

/**
 * @route   GET /api/properties/my-unlocks
 * @desc    Get all unlock requests for the authenticated user (guest view) - includes PENDING
 * @access  Private (Authenticated users)
 * @returns {
 *            totalUnlocks: number,
 *            unlocks: Array<{
 *              unlockId: string,
 *              paymentStatus: string,  // PENDING, SUBMITTED, COMPLETED, FAILED, CANCELLED
 *              paymentMethod: string,
 *              paymentAmountRwf: number,
 *              paymentAmountUsd: number,
 *              createdAt: Date,
 *              unlockedAt: Date | null,
 *              property: PropertyDetails,
 *              // Only if paymentStatus === 'COMPLETED':
 *              address?: string,
 *              coordinates?: { lat: number, lng: number } | null,
 *              googleMapsUrl?: string,
 *              hostContactInfo?: HostContact,
 *              appreciationSubmitted?: boolean
 *            }>
 *          }
 */
router.get('/my-unlocks', propertyAddressUnlockController.getMyUnlocks);

/**
 * @route   GET /api/properties/unlock-activities
 * @desc    Get unlock activities for all properties owned by the authenticated user (host view)
 * @access  Private (Authenticated users - must be host/property owner)
 * @returns {
 *            totalUnlocks: number,
 *            totalRevenue: number,
 *            unlocksByProperty: Array<{
 *              propertyId: number,
 *              propertyName: string,
 *              propertyLocation: string,
 *              totalUnlocks: number,
 *              revenue: number,
 *              unlocks: Array<{
 *                unlockId: string,
 *                unlockedAt: Date,
 *                paymentMethod: string,
 *                paymentAmountRwf: number,
 *                guest: GuestDetails
 *              }>
 *            }>
 *          }
 */
router.get('/unlock-activities', propertyAddressUnlockController.getUnlockActivities);

/**
 * @route   POST /api/property-unlock/unlock/cancel
 * @desc    Cancel unlock request (30% eligible for deal code + refund minus 15k service fee)
 * @access  Private (Guests only)
 * @body    {
 *            unlockId: string,
 *            reason?: string
 *          }
 * @returns {
 *            cancelled: boolean,
 *            refundEligible: boolean,
 *            dealCode?: { code: string, remainingUnlocks: number, expiresAt: Date },
 *            refundAmount?: number  // payment amount - 15,000 RWF service fee
 *          }
 * @note    Deal code is AUTOMATICALLY generated for 30% payment method
 *          Refund = payment amount - 15,000 RWF service fee
 */
router.post('/unlock/cancel', propertyAddressUnlockController.cancelUnlockRequest);

/**
 * @route   GET /api/properties/host/unlock-requests
 * @desc    Get host unlock analytics (host view)
 * @access  Private (Hosts only)
 * @returns {
 *            totalUnlocks: number,
 *            revenue: {
 *              total: number,
 *              nonRefundable: number,
 *              monthlyBooking: number,
 *              currency: string
 *            },
 *            appreciationStats: {
 *              appreciated: number,
 *              neutral: number,
 *              notAppreciated: number
 *            },
 *            topUnlockedProperties: Array<{
 *              propertyId: string,
 *              title: string,
 *              unlockCount: number,
 *              revenue: number
 *            }>,
 *            recentUnlocks: Array<{
 *              id: string,
 *              propertyId: string,
 *              propertyTitle: string,
 *              unlockDate: string,
 *              appreciationSubmitted: boolean,
 *              appreciationLevel: string | null,
 *              paymentMethod: string,
 *              paymentStatus: string,
 *              guest: { id, name, email, phone, profileImage }
 *            }>
 *          }
 */
router.get('/host/unlock-requests', propertyAddressUnlockController.getHostUnlockRequests);

/**
 * @route   POST /api/properties/unlock/create-booking
 * @desc    Create booking from unlock (30% already paid)
 * @access  Private (Guests with completed 30% unlock)
 * @body    {
 *            unlockId: string,
 *            checkIn: string,
 *            checkOut: string,
 *            guests: number,
 *            totalPrice: number,
 *            message?: string,
 *            specialRequests?: string
 *          }
 * @returns {
 *            bookingId: string,
 *            totalAmount: number,
 *            paidAmount: number, // 30%
 *            remainingAmount: number, // 70%
 *            paymentUrl: string // jambolush.com/spaces/{slug}/confirm-and-pay?bookingId=...
 *          }
 */
router.post('/unlock/create-booking', propertyAddressUnlockController.createBookingFromUnlock);

/**
 * @route   GET /api/properties/admin/unlock-analytics
 * @desc    Admin unlock analytics and transaction data
 * @access  Private (Admin only)
 * @query   {
 *            startDate?: Date,
 *            endDate?: Date,
 *            propertyId?: number,
 *            paymentMethod?: string
 *          }
 * @returns {
 *            overview: {
 *              totalUnlocks, totalRevenue, totalNonRefundable,
 *              total30Percent, totalCancelled, totalDealCodesGenerated,
 *              conversionToBooking
 *            },
 *            unlocks: Array<UnlockDetails>,
 *            recentActivity: Array<ActivityLog>
 *          }
 */
router.get('/admin/unlock-analytics', propertyAddressUnlockController.getAdminUnlockAnalytics);

export default router;
