//src/routes/admin.routes.ts

import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller';
import { authenticate } from '../middleware/auth.middleware';
import { 
  requireAdmin,
  requirePermissions,
  canAccessUser,
  adminRateLimit,
  bulkOperationRateLimit,
  exportRateLimit,
  handleValidation,
  validateAdminQuery,
  validateUserCreate,
  validateUserUpdate,
  validatePropertyUpdate,
  validateTourUpdate,
  validateBookingUpdate,
  validatePaymentAction,
  validateEscrowAction,
  validateBulkOperation,
  validateExport,
  validateAnalytics,
  auditLog,
  preventSelfModification,
  validateDateRange,
  parseFilters,
  checkMaintenanceMode,
  adminErrorHandler
} from '../middleware/admin.middleware';

const router = Router();
const adminController = new AdminController();

// Apply admin-wide middleware

//public url

// Products
router.get('/content/products',
  validateAdminQuery,
  adminController.getProducts
);

router.use(authenticate);
router.use(requireAdmin);
router.use(adminRateLimit);
router.use(checkMaintenanceMode);

// === DASHBOARD & SYSTEM OVERVIEW ===
router.get('/dashboard', 
  requirePermissions('analytics.view'),
  auditLog('VIEW_DASHBOARD', 'dashboard'),
  adminController.getDashboard
);

router.get('/system/status',
  requirePermissions('system.manage'),
  adminController.getSystemStatus
);

router.get('/health',
  adminController.healthCheck
);

// === USER MANAGEMENT ===

// List users with filtering, pagination, and sorting
router.get('/users',
  requirePermissions('users.view'),
  validateAdminQuery,
  parseFilters,
  validateDateRange,
  auditLog('LIST_USERS', 'users'),
  adminController.getUsers
);

// Get specific user details
router.get('/users/:id',
  requirePermissions('users.view'),
  canAccessUser,
  auditLog('VIEW_USER', 'user'),
  adminController.getUserDetails
);

// Create new user
router.post('/users',
  requirePermissions('users.create'),
  validateUserCreate,
  auditLog('CREATE_USER', 'user'),
  adminController.createUser
);

// Update user
router.put('/users/:id',
  requirePermissions('users.edit'),
  canAccessUser,
  preventSelfModification,
  validateUserUpdate,
  auditLog('UPDATE_USER', 'user'),
  adminController.updateUser
);

// Delete/deactivate user
router.delete('/users/:id',
  requirePermissions('users.delete'),
  preventSelfModification,
  auditLog('DELETE_USER', 'user'),
  adminController.deleteUser
);

// Suspend user
router.post('/users/:id/suspend',
  requirePermissions('users.suspend'),
  preventSelfModification,
  auditLog('SUSPEND_USER', 'user'),
  adminController.suspendUser
);

// Activate user
router.post('/users/:id/activate',
  requirePermissions('users.edit'),
  auditLog('ACTIVATE_USER', 'user'),
  adminController.activateUser
);

// KYC Management
router.post('/users/:id/kyc/approve',
  auditLog('APPROVE_KYC', 'user'),
  adminController.approveKYC
);

router.post('/users/:id/kyc/reject',
  auditLog('REJECT_KYC', 'user'),
  adminController.rejectKYC
);

// User Session Management
router.get('/users/:id/sessions',
  requirePermissions('users.view'),
  auditLog('VIEW_USER_SESSIONS', 'user'),
  adminController.getUserSessions
);

router.post('/users/:id/sessions/terminate-all',
  requirePermissions('users.edit'),
  auditLog('TERMINATE_USER_SESSIONS', 'user'),
  adminController.terminateAllUserSessions
);

router.delete('/sessions/:sessionId',
  requirePermissions('users.edit'),
  auditLog('TERMINATE_SESSION', 'session'),
  adminController.terminateUserSession
);

// === PROPERTY MANAGEMENT ===

// List properties with filtering
router.get('/properties',
  requirePermissions('properties.view'),
  validateAdminQuery,
  parseFilters,
  validateDateRange,
  auditLog('LIST_PROPERTIES', 'properties'),
  adminController.getProperties
);

// Get specific property details
router.get('/properties/:id',
  requirePermissions('properties.view'),
  auditLog('VIEW_PROPERTY', 'property'),
  adminController.getPropertyDetails
);

// Update property
router.put('/properties/:id',
  requirePermissions('properties.edit'),
  validatePropertyUpdate,
  auditLog('UPDATE_PROPERTY', 'property'),
  adminController.updateProperty
);

// Approve property
router.post('/properties/:id/approve',
  requirePermissions('properties.verify'),
  auditLog('APPROVE_PROPERTY', 'property'),
  adminController.approveProperty
);

// Reject property
router.post('/properties/:id/reject',
  requirePermissions('properties.edit'),
  auditLog('REJECT_PROPERTY', 'property'),
  adminController.rejectProperty
);

// Suspend property
router.post('/properties/:id/suspend',
  requirePermissions('properties.edit'),
  auditLog('SUSPEND_PROPERTY', 'property'),
  adminController.suspendProperty
);

// === TOUR MANAGEMENT ===

// List tours with filtering
router.get('/tours',
  requirePermissions('tours.view'),
  validateAdminQuery,
  parseFilters,
  validateDateRange,
  auditLog('LIST_TOURS', 'tours'),
  adminController.getTours
);

// Get specific tour details
router.get('/tours/:id',
  requirePermissions('tours.view'),
  auditLog('VIEW_TOUR', 'tour'),
  adminController.getTourDetails
);

// Update tour
router.put('/tours/:id',
  requirePermissions('tours.edit'),
  validateTourUpdate,
  auditLog('UPDATE_TOUR', 'tour'),
  adminController.updateTour
);

// Approve tour
router.post('/tours/:id/approve',
  requirePermissions('tours.edit'),
  auditLog('APPROVE_TOUR', 'tour'),
  adminController.approveTour
);

// Suspend tour
router.post('/tours/:id/suspend',
  requirePermissions('tours.edit'),
  auditLog('SUSPEND_TOUR', 'tour'),
  adminController.suspendTour
);

// === BOOKING MANAGEMENT ===

// List all bookings (unified endpoint)
router.get('/bookings',
  requirePermissions('bookings.view'),
  validateAdminQuery,
  parseFilters,
  validateDateRange,
  auditLog('LIST_BOOKINGS', 'bookings'),
  adminController.getBookings
);

// Get specific booking details
router.get('/bookings/:id/:type',
  requirePermissions('bookings.view'),
  auditLog('VIEW_BOOKING', 'booking'),
  adminController.getBookingDetails
);

// Update booking
router.put('/bookings/:id/:type',
  requirePermissions('bookings.edit'),
  validateBookingUpdate,
  auditLog('UPDATE_BOOKING', 'booking'),
  adminController.updateBooking
);

// Cancel booking
router.post('/bookings/:id/:type/cancel',
  requirePermissions('bookings.cancel'),
  auditLog('CANCEL_BOOKING', 'booking'),
  adminController.cancelBooking
);

// === REVIEW MANAGEMENT ===

// List all reviews
router.get('/reviews',
  requirePermissions('reviews.view'),
  validateAdminQuery,
  parseFilters,
  auditLog('LIST_REVIEWS', 'reviews'),
  adminController.getReviews
);

// Moderate review (approve, hide, delete)
router.post('/reviews/:id/:type/moderate',
  requirePermissions('reviews.moderate'),
  auditLog('MODERATE_REVIEW', 'review'),
  adminController.moderateReview
);

// === PAYMENT TRANSACTION MANAGEMENT ===

// List payment transactions
router.get('/payments',
  requirePermissions('payments.view'),
  validateAdminQuery,
  parseFilters,
  validateDateRange,
  auditLog('LIST_PAYMENTS', 'payments'),
  adminController.getPaymentTransactions
);

// Get specific payment transaction
router.get('/payments/:id',
  requirePermissions('payments.view'),
  auditLog('VIEW_PAYMENT', 'payment'),
  adminController.getPaymentTransaction
);

// Process payment action (approve, reject, refund, dispute)
router.post('/payments/:id/action',
  requirePermissions('payments.process'),
  validatePaymentAction,
  auditLog('PAYMENT_ACTION', 'payment'),
  adminController.processPaymentAction
);

// === ESCROW TRANSACTION MANAGEMENT ===

// List escrow transactions
router.get('/escrow',
  requirePermissions('escrow.view'),
  validateAdminQuery,
  parseFilters,
  validateDateRange,
  auditLog('LIST_ESCROW', 'escrow'),
  adminController.getEscrowTransactions
);

// Get specific escrow transaction
router.get('/escrow/:id',
  requirePermissions('escrow.view'),
  auditLog('VIEW_ESCROW', 'escrow'),
  adminController.getEscrowTransaction
);

// Release escrow
router.post('/escrow/:id/release',
  requirePermissions('escrow.manage'),
  auditLog('RELEASE_ESCROW', 'escrow'),
  adminController.releaseEscrow
);

// Dispute escrow
router.post('/escrow/:id/dispute',
  requirePermissions('escrow.manage'),
  auditLog('DISPUTE_ESCROW', 'escrow'),
  adminController.disputeEscrow
);

// === WITHDRAWAL MANAGEMENT ===

// List withdrawal requests
router.get('/withdrawals',
  requirePermissions('payments.view'),
  validateAdminQuery,
  parseFilters,
  validateDateRange,
  auditLog('LIST_WITHDRAWALS', 'withdrawals'),
  adminController.getWithdrawalRequests
);

// Approve withdrawal
router.post('/withdrawals/:id/approve',
  requirePermissions('payments.process'),
  auditLog('APPROVE_WITHDRAWAL', 'withdrawal'),
  adminController.approveWithdrawal
);

// Reject withdrawal
router.post('/withdrawals/:id/reject',
  requirePermissions('payments.process'),
  auditLog('REJECT_WITHDRAWAL', 'withdrawal'),
  adminController.rejectWithdrawal
);

// === WALLET MANAGEMENT ===

// List wallets
router.get('/wallets',
  requirePermissions('payments.view'),
  validateAdminQuery,
  parseFilters,
  auditLog('LIST_WALLETS', 'wallets'),
  adminController.getWallets
);

// Adjust wallet balance
router.post('/wallets/:id/adjust',
  requirePermissions('payments.process'),
  auditLog('ADJUST_WALLET', 'wallet'),
  adminController.adjustWalletBalance
);

// ===================================================================
//                           ADMIN ROUTES
// ===================================================================

// === CONTENT MANAGEMENT ===

// Products
router.get('/products',
  validateAdminQuery,
  adminController.getProducts
);

router.post('/content/products',
  auditLog('CREATE_PRODUCT', 'product'),
  adminController.createProduct
);

router.put('/content/products/:id',
  auditLog('UPDATE_PRODUCT', 'product'),
  adminController.updateProduct
);

router.delete('/content/products/:id',
  auditLog('DELETE_PRODUCT', 'product'),
  adminController.deleteProduct
);

// Services
router.get('/content/services',
  validateAdminQuery,
  adminController.getServices
);

router.post('/content/services',
  auditLog('CREATE_SERVICE', 'service'),
  adminController.createService
);

router.put('/content/services/:id',
  auditLog('UPDATE_SERVICE', 'service'),
  adminController.updateService
);

router.delete('/content/services/:id',
  auditLog('DELETE_SERVICE', 'service'),
  adminController.deleteService
);

// Partners
router.get('/content/partners',
  validateAdminQuery,
  adminController.getPartners
);

router.post('/content/partners',
  auditLog('CREATE_PARTNER', 'partner'),
  adminController.createPartner
);

router.put('/content/partners/:id',
  auditLog('UPDATE_PARTNER', 'partner'),
  adminController.updatePartner
);

router.delete('/content/partners/:id',
  auditLog('DELETE_PARTNER', 'partner'),
  adminController.deletePartner
);

// Contact requests
router.get('/content/contacts',
  validateAdminQuery,
  adminController.getContactRequests
);

router.post('/content/contacts/:id/respond',
  auditLog('RESPOND_CONTACT', 'contact'),
  adminController.respondToContact
);

// Newsletter subscriptions
router.get('/newsletter/subscriptions',
  validateAdminQuery,
  adminController.getNewsletterSubscriptions
);

router.put('/newsletter/subscriptions/:id',
  auditLog('UPDATE_NEWSLETTER', 'newsletter'),
  adminController.updateNewsletterStatus
);

// === ANALYTICS & REPORTING ===

// Get system analytics
router.get('/analytics',
  requirePermissions('analytics.view'),
  validateAnalytics,
  validateDateRange,
  auditLog('VIEW_ANALYTICS', 'analytics'),
  adminController.getSystemAnalytics
);

// Get visitor analytics
router.get('/analytics/visitors',
  requirePermissions('analytics.view'),
  validateDateRange,
  auditLog('VIEW_VISITOR_ANALYTICS', 'analytics'),
  adminController.getVisitorAnalytics
);

// Generate financial report
router.get('/reports/financial',
  requirePermissions('analytics.view'),
  validateAnalytics,
  validateDateRange,
  auditLog('VIEW_FINANCIAL_REPORT', 'financial_report'),
  adminController.generateFinancialReport
);

// Generate custom report
router.post('/reports/generate',
  requirePermissions('reports.generate'),
  auditLog('GENERATE_REPORT', 'report'),
  adminController.generateReport
);

// === ANALYTICS & REPORTING ===

// Get system analytics
router.get('/analytics',
  requirePermissions('analytics.view'),
  validateAnalytics,
  validateDateRange,
  auditLog('VIEW_ANALYTICS', 'analytics'),
  adminController.getSystemAnalytics
);

// Get visitor analytics
router.get('/analytics/visitors',
  requirePermissions('analytics.view'),
  validateDateRange,
  auditLog('VIEW_VISITOR_ANALYTICS', 'analytics'),
  adminController.getVisitorAnalytics
);

// Generate financial report
router.get('/reports/financial',
  requirePermissions('analytics.view'),
  validateAnalytics,
  validateDateRange,
  auditLog('VIEW_FINANCIAL_REPORT', 'financial_report'),
  adminController.generateFinancialReport
);

// Generate custom report
router.post('/reports/generate',
  requirePermissions('reports.generate'),
  auditLog('GENERATE_REPORT', 'report'),
  adminController.generateReport
);

// === MARKET DATA ===

// List market data
router.get('/market-data',
  requirePermissions('analytics.view'),
  validateAdminQuery,
  parseFilters,
  adminController.getMarketData
);

// Create market data
router.post('/market-data',
  requirePermissions('system.manage'),
  auditLog('CREATE_MARKET_DATA', 'market_data'),
  adminController.createMarketData
);

// Update market data
router.put('/market-data/:id',
  requirePermissions('system.manage'),
  auditLog('UPDATE_MARKET_DATA', 'market_data'),
  adminController.updateMarketData
);

// === BULK OPERATIONS ===

// Bulk update users
router.post('/bulk/users/update',
  requirePermissions('users.edit'),
  bulkOperationRateLimit,
  validateBulkOperation,
  auditLog('BULK_UPDATE_USERS', 'bulk_users'),
  adminController.bulkUpdateUsers
);

// Bulk delete users
router.post('/bulk/users/delete',
  requirePermissions('users.delete'),
  bulkOperationRateLimit,
  validateBulkOperation,
  auditLog('BULK_DELETE_USERS', 'bulk_users'),
  adminController.bulkDeleteUsers
);

// Bulk update properties
router.post('/bulk/properties/update',
  requirePermissions('properties.edit'),
  bulkOperationRateLimit,
  validateBulkOperation,
  auditLog('BULK_UPDATE_PROPERTIES', 'bulk_properties'),
  adminController.bulkUpdateProperties
);

// Bulk update tours
router.post('/bulk/tours/update',
  requirePermissions('tours.edit'),
  bulkOperationRateLimit,
  validateBulkOperation,
  auditLog('BULK_UPDATE_TOURS', 'bulk_tours'),
  adminController.bulkUpdateTours
);

// === DATA EXPORT ===

// Export users data
router.post('/export/users',
  requirePermissions('exports.create'),
  exportRateLimit,
  validateExport,
  auditLog('EXPORT_USERS', 'export'),
  adminController.exportData
);

// Export properties data
router.post('/export/properties',
  requirePermissions('exports.create'),
  exportRateLimit,
  validateExport,
  auditLog('EXPORT_PROPERTIES', 'export'),
  adminController.exportData
);

// Export tours data
router.post('/export/tours',
  requirePermissions('exports.create'),
  exportRateLimit,
  validateExport,
  auditLog('EXPORT_TOURS', 'export'),
  adminController.exportData
);

// Export bookings data
router.post('/export/bookings',
  requirePermissions('exports.create'),
  exportRateLimit,
  validateExport,
  auditLog('EXPORT_BOOKINGS', 'export'),
  adminController.exportData
);

// Export payments data
router.post('/export/payments',
  requirePermissions('exports.create'),
  exportRateLimit,
  validateExport,
  auditLog('EXPORT_PAYMENTS', 'export'),
  adminController.exportData
);

// === SYSTEM SETTINGS ===

// Get system settings
router.get('/settings',
  requirePermissions('settings.view'),
  auditLog('VIEW_SETTINGS', 'settings'),
  adminController.getSystemSettings
);

// Update system settings
router.put('/settings',
  requirePermissions('settings.edit'),
  auditLog('UPDATE_SETTINGS', 'settings'),
  adminController.updateSystemSettings
);

// === ACTIVITY LOGS & AUDIT TRAIL ===

// Get admin activity logs
router.get('/logs/activity',
  requirePermissions('system.manage'),
  validateAdminQuery,
  parseFilters,
  validateDateRange,
  adminController.getActivityLogs
);

// Get audit logs
router.get('/logs/audit',
  requirePermissions('system.manage'),
  validateAdminQuery,
  parseFilters,
  validateDateRange,
  adminController.getAuditLogs
);

// === NOTIFICATIONS ===

// Get admin notifications
router.get('/notifications',
  adminController.getNotifications
);

// Mark notification as read
router.put('/notifications/:id/read',
  adminController.markNotificationRead
);

// Mark all notifications as read
router.put('/notifications/read-all',
  adminController.markAllNotificationsRead
);

// === DATA INTEGRITY ===

// Validate data integrity
router.get('/system/validate-integrity',
  requirePermissions('system.manage'),
  auditLog('VALIDATE_DATA_INTEGRITY', 'system'),
  adminController.validateDataIntegrity
);

// Fix data integrity issues
router.post('/system/fix-integrity/:issueType',
  requirePermissions('system.manage'),
  auditLog('FIX_DATA_INTEGRITY', 'system'),
  adminController.fixDataIntegrityIssue
);

// === GLOBAL SEARCH ===

// Global search across all entities
router.get('/search',
  adminController.globalSearch
);

// === CACHE MANAGEMENT ===

// Clear system cache
router.post('/cache/clear',
  requirePermissions('system.manage'),
  auditLog('CLEAR_CACHE', 'cache'),
  adminController.clearCache
);

// Refresh specific cache keys
router.post('/cache/refresh',
  requirePermissions('system.manage'),
  auditLog('REFRESH_CACHE', 'cache'),
  adminController.refreshCache
);

// === MAINTENANCE & SYSTEM CONTROL ===

// Toggle maintenance mode
router.post('/maintenance/toggle',
  requirePermissions('system.manage'),
  auditLog('TOGGLE_MAINTENANCE', 'maintenance'),
  adminController.toggleMaintenanceMode
);

// Force logout all users
router.post('/system/logout-all',
  requirePermissions('system.manage'),
  auditLog('FORCE_LOGOUT_ALL', 'system'),
  adminController.forceLogoutAllUsers
);

// Send system announcement
router.post('/announcements',
  requirePermissions('system.manage'),
  auditLog('SEND_ANNOUNCEMENT', 'announcement'),
  adminController.sendAnnouncement
);

// === STATISTICS & QUICK STATS ===

// Get dashboard quick stats
router.get('/stats/quick',
  requirePermissions('analytics.view'),
  adminController.getQuickStats
);

// Get user growth stats
router.get('/stats/users/growth',
  requirePermissions('analytics.view'),
  validateDateRange,
  adminController.getUserGrowthStats
);

// Get revenue stats
router.get('/stats/revenue',
  requirePermissions('analytics.view'),
  validateDateRange,
  adminController.getRevenueStats
);

// === INTEGRATION MANAGEMENT ===

// Get integration status
router.get('/integrations',
  requirePermissions('system.manage'),
  adminController.getIntegrationStatus
);

// Test integration
router.post('/integrations/:service/test',
  requirePermissions('system.manage'),
  auditLog('TEST_INTEGRATION', 'integration'),
  adminController.testIntegration
);

// === ERROR HANDLING ===
router.use(adminErrorHandler);

export default router;