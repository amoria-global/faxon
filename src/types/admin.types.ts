//src/types/admin.types.ts

// === CORE ADMIN TYPES ===
export type AdminRole = 'super_admin' | 'admin' | 'moderator' | 'support';
export type AdminPermission = 
  | 'users.view' | 'users.create' | 'users.edit' | 'users.delete' | 'users.suspend'
  | 'properties.view' | 'properties.create' | 'properties.edit' | 'properties.delete' | 'properties.verify'
  | 'tours.view' | 'tours.create' | 'tours.edit' | 'tours.delete' | 'tours.verify'
  | 'bookings.view' | 'bookings.edit' | 'bookings.cancel' | 'bookings.refund'
  | 'payments.view' | 'payments.process' | 'payments.refund' | 'payments.dispute'
  | 'escrow.view' | 'escrow.manage' | 'escrow.release' | 'escrow.dispute'
  | 'reviews.view' | 'reviews.moderate' | 'reviews.delete'
  | 'analytics.view' | 'reports.generate' | 'exports.create'
  | 'settings.view' | 'settings.edit' | 'system.manage';

// === DASHBOARD TYPES ===
export interface AdminDashboardOverview {
  period: {
    start: string;
    end: string;
    label: string;
  };
  metrics: {
    totalUsers: number;
    activeUsers: number;
    newUsers: number;
    totalProperties: number;
    activeProperties: number;
    pendingProperties: number;
    totalTours: number;
    activeTours: number;
    pendingTours: number;
    totalBookings: number;
    confirmedBookings: number;
    cancelledBookings: number;
    totalRevenue: number;
    platformFees: number;
    escrowHeld: number;
    disputesOpen: number;
  };
  growth: {
    userGrowth: number;
    propertyGrowth: number;
    tourGrowth: number;
    revenueGrowth: number;
  };
  alerts: AdminAlert[];
  recentActivity: AdminActivity[];
}

export interface AdminAlert {
  id: string;
  type: 'error' | 'warning' | 'info' | 'success';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  data?: Record<string, any>;
  actionRequired: boolean;
  actionUrl?: string;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: number;
  isRead?: boolean;
}

export interface AdminActivity {
  id: string;
  userId: number;
  userEmail: string;
  action: string;
  resource: string;
  resourceId: string;
  details: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: string;
}

// === USER MANAGEMENT TYPES ===
export interface AdminUserFilters {
  userType?: string[];
  status?: string[];
  verificationStatus?: string[];
  kycStatus?: string[];
  provider?: string[];
  country?: string[];
  dateRange?: {
    start: string;
    end: string;
    field: 'createdAt' | 'lastLogin' | 'updatedAt';
  };
  search?: string;
  hasBookings?: boolean;
  hasProperties?: boolean;
  hasTours?: boolean;
}

export interface AdminUserListItem {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  userType: string;
  status: string;
  verificationStatus: string;
  kycStatus: string;
  provider: string;
  country?: string;
  totalBookings: number;
  totalProperties: number;
  totalTours: number;
  lastLogin?: string;
  createdAt: string;
  isVerified: boolean;
  profileImage?: string;
}

export interface AdminUserDetails extends AdminUserListItem {
  phone?: string;
  phoneCountryCode?: string;
  address: {
    street?: string;
    city?: string;
    state?: string;
    province?: string;
    country?: string;
    zipCode?: string;
    postalCode?: string;
    postcode?: string;
    pinCode?: string;
    eircode?: string;
    cep?: string;
  };
  profile: {
    bio?: string;
    experience?: number;
    languages?: any;
    specializations?: any;
    rating: number;
    totalSessions: number;
    averageRating: number;
  };
  business?: {
    companyName?: string;
    companyTIN?: string;
    licenseNumber?: string;
    tourGuideType?: string;
    certifications?: any;
  };
  verification: {
    isVerified: boolean;
    verificationDocument?: string;
    addressDocument?: string;
    kycCompleted: boolean;
    kycSubmittedAt?: string;
    twoFactorEnabled: boolean;
  };
  metrics: {
    totalEarnings: number;
    pendingPayouts: number;
    completedTransactions: number;
    disputedTransactions: number;
  };
  recentActivity: AdminActivity[];
  sessions: UserSession[];
}

export interface UserSession {
  id: string;
  sessionToken: string;
  device?: string;
  browser?: string;
  location?: string;
  ipAddress?: string;
  isActive: boolean;
  lastActivity: string;
  expiresAt: string;
  createdAt: string;
}

// === PROPERTY MANAGEMENT TYPES ===
export interface AdminPropertyFilters {
  status?: string[];
  type?: string[];
  category?: string[];
  isVerified?: boolean;
  isInstantBook?: boolean;
  hostId?: number;
  location?: string[];
  priceRange?: {
    min: number;
    max: number;
  };
  dateRange?: {
    start: string;
    end: string;
    field: 'createdAt' | 'availableFrom' | 'availableTo';
  };
  search?: string;
  hasBookings?: boolean;
}

export interface AdminPropertyListItem {
  id: number;
  name: string;
  location: string;
  type: string;
  category: string;
  pricePerNight: number;
  currency: string;
  status: string;
  isVerified: boolean;
  isInstantBook: boolean;
  hostId: number;
  hostName: string;
  hostEmail: string;
  totalBookings: number;
  averageRating: number;
  reviewsCount: number;
  views: number;
  createdAt: string;
  images: string[];
}

export interface AdminPropertyDetails extends AdminPropertyListItem {
  description?: string;
  beds: number;
  baths: number;
  maxGuests: number;
  features: any;
  video3D?: string;
  availableFrom?: string;
  availableTo?: string;
  minStay: number;
  maxStay?: number;
  propertyAddress?: string;
  ownerDetails?: any;
  metrics: {
    totalRevenue: number;
    occupancyRate: number;
    averageStayDuration: number;
    cancellationRate: number;
  };
  recentBookings: AdminBookingListItem[];
  reviews: AdminReviewListItem[];
  blockedDates: BlockedDate[];
  pricingRules: PricingRule[];
}

export interface BlockedDate {
  id: string;
  startDate: string;
  endDate: string;
  reason?: string;
  isActive: boolean;
  createdAt: string;
}

export interface PricingRule {
  id: string;
  name: string;
  type: string;
  startDate: string;
  endDate: string;
  priceModifier: number;
  modifierType: string;
  minStay?: number;
  maxStay?: number;
  isActive: boolean;
  createdAt: string;
}

// === TOUR MANAGEMENT TYPES ===
export interface AdminTourFilters {
  isActive?: boolean;
  category?: string[];
  type?: string[];
  tourGuideId?: number;
  location?: string[];
  priceRange?: {
    min: number;
    max: number;
  };
  difficulty?: string[];
  dateRange?: {
    start: string;
    end: string;
    field: 'createdAt' | 'updatedAt';
  };
  search?: string;
  hasBookings?: boolean;
}

export interface AdminTourListItem {
  id: string;
  title: string;
  shortDescription: string;
  category: string;
  type: string;
  duration: number;
  price: number;
  currency: string;
  difficulty: string;
  tourGuideId: number;
  tourGuideName: string;
  tourGuideEmail: string;
  locationCity: string;
  locationCountry: string;
  isActive: boolean;
  rating: number;
  totalReviews: number;
  totalBookings: number;
  views: number;
  createdAt: string;
  images: string[];
}

export interface AdminTourDetails extends AdminTourListItem {
  description: string;
  maxGroupSize: number;
  minGroupSize: number;
  itinerary: any;
  inclusions: any;
  exclusions: any;
  requirements: any;
  locationAddress: string;
  meetingPoint: string;
  latitude?: number;
  longitude?: number;
  tags: any;
  metrics: {
    totalRevenue: number;
    averageGroupSize: number;
    cancellationRate: number;
    repeatCustomerRate: number;
  };
  schedules: TourSchedule[];
  recentBookings: AdminBookingListItem[];
  reviews: AdminTourReviewListItem[];
}

export interface TourSchedule {
  id: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  availableSlots: number;
  bookedSlots: number;
  isAvailable: boolean;
  price?: number;
  specialNotes?: string;
  createdAt: string;
}

// === BOOKING MANAGEMENT TYPES ===
export interface AdminBookingFilters {
  type?: ('property' | 'tour')[];
  status?: string[];
  paymentStatus?: string[];
  dateRange?: {
    start: string;
    end: string;
    field: 'createdAt' | 'checkIn' | 'checkOut' | 'bookingDate';
  };
  amountRange?: {
    min: number;
    max: number;
  };
  guestId?: number;
  hostId?: number;
  tourGuideId?: number;
  propertyId?: number;
  tourId?: string;
  search?: string;
}

export interface AdminBookingListItem {
  id: string;
  type: 'property' | 'tour';
  guestId: number;
  guestName: string;
  guestEmail: string;
  providerId: number;
  providerName: string;
  providerEmail: string;
  resourceId: string | number;
  resourceName: string;
  totalPrice: number;
  currency: string;
  status: string;
  paymentStatus: string;
  dates: {
    checkIn?: string;
    checkOut?: string;
    bookingDate?: string;
  };
  guests?: number;
  participants?: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminBookingDetails extends AdminBookingListItem {
  message?: string;
  hostResponse?: string;
  specialRequests?: string;
  checkInInstructions?: string;
  checkOutInstructions?: string;
  guestNotes?: string;
  paymentMethod?: string;
  transactionId?: string;
  cancellationReason?: string;
  cancelledAt?: string;
  refundAmount?: number;
  refundReason?: string;
  checkInStatus?: string;
  checkInTime?: string;
  checkOutTime?: string;
  paymentTransactions: AdminPaymentTransaction[];
  escrowTransactions: AdminEscrowTransaction[];
}

// === REVIEW MANAGEMENT TYPES ===
export interface AdminReviewListItem {
  id: string;
  type: 'property' | 'tour' | 'agent';
  resourceId: string | number;
  resourceName: string;
  userId: number;
  userName: string;
  userEmail: string;
  rating: number;
  comment: string;
  isVisible: boolean;
  isReported: boolean;
  response?: string;
  responseDate?: string;
  createdAt: string;
  images?: string[];
}

export interface AdminTourReviewListItem extends AdminReviewListItem {
  tourId: string;
  tourGuideId: number;
  pros: any;
  cons: any;
  wouldRecommend: boolean;
  isAnonymous: boolean;
  isVerified: boolean;
  helpfulCount: number;
  reportCount: number;
}

// === PAYMENT & ESCROW MANAGEMENT TYPES ===
export interface AdminPaymentTransaction {
  id: string;
  userId: number;
  userName: string;
  userEmail: string;
  type: string;
  method: string;
  amount: number;
  currency: string;
  status: string;
  reference: string;
  externalId?: string;
  description?: string;
  charges?: number;
  netAmount?: number;
  sourceAccount?: string;
  destinationAccount?: string;
  failureReason?: string;
  createdAt: string;
  completedAt?: string;
  escrowStatus?: string;
  isEscrowBased: boolean;
}

export interface AdminEscrowTransaction {
  id: string;
  userId: number;
  userName: string;
  userEmail: string;
  recipientId?: number;
  recipientName?: string;
  recipientEmail?: string;
  type: string;
  amount: number;
  currency: string;
  status: string;
  reference: string;
  description?: string;
  escrowId?: string;
  fundedAt?: string;
  releasedAt?: string;
  releasedBy?: number;
  releaseReason?: string;
  disputedAt?: string;
  disputedBy?: number;
  disputeReason?: string;
  resolvedAt?: string;
  cancelledAt?: string;
  cancellationReason?: string;
  createdAt: string;
  metadata?: any;
}

export interface AdminWithdrawalRequest {
  id: string;
  userId: number;
  userName: string;
  userEmail: string;
  amount: number;
  currency: string;
  method: string;
  status: string;
  destination: any;
  reference: string;
  failureReason?: string;
  createdAt: string;
  completedAt?: string;
}

// === ANALYTICS & REPORTING TYPES ===
export interface AdminAnalyticsFilters {
  period: 'day' | 'week' | 'month' | 'quarter' | 'year' | 'custom';
  startDate?: string;
  endDate?: string;
  metrics?: string[];
  groupBy?: string[];
  currency?: string;
}

export interface AdminSystemAnalytics {
  period: {
    start: string;
    end: string;
    label: string;
  };
  users: {
    total: number;
    active: number;
    new: number;
    byType: Record<string, number>;
    byStatus: Record<string, number>;
    growth: number;
  };
  properties: {
    total: number;
    active: number;
    verified: number;
    byType: Record<string, number>;
    byCategory: Record<string, number>;
    averageRating: number;
    occupancyRate: number;
    growth: number;
  };
  tours: {
    total: number;
    active: number;
    byCategory: Record<string, number>;
    averageRating: number;
    bookingRate: number;
    growth: number;
  };
  bookings: {
    total: number;
    confirmed: number;
    cancelled: number;
    revenue: number;
    averageValue: number;
    byType: Record<string, number>;
    conversionRate: number;
    growth: number;
  };
  payments: {
    totalVolume: number;
    totalFees: number;
    escrowHeld: number;
    disputes: number;
    successRate: number;
    averageProcessingTime: number;
    byMethod: Record<string, number>;
    byStatus: Record<string, number>;
  };
  trends: {
    daily: Array<{
      date: string;
      users: number;
      bookings: number;
      revenue: number;
    }>;
    monthly: Array<{
      month: string;
      users: number;
      properties: number;
      tours: number;
      bookings: number;
      revenue: number;
    }>;
  };
}

export interface AdminFinancialReport {
  period: {
    start: string;
    end: string;
  };
  summary: {
    grossRevenue: number;
    platformFees: number;
    netRevenue: number;
    hostPayouts: number;
    tourGuidePayouts: number;
    agentCommissions: number;
    escrowHeld: number;
    refundsIssued: number;
    chargebacks: number;
    operatingProfit: number;
  };
  breakdown: {
    byService: Record<string, {
      revenue: number;
      fees: number;
      volume: number;
    }>;
    byPaymentMethod: Record<string, {
      volume: number;
      amount: number;
      fees: number;
    }>;
    byCurrency: Record<string, number>;
  };
  trends: Array<{
    period: string;
    revenue: number;
    fees: number;
    volume: number;
  }>;
}

// === SYSTEM SETTINGS TYPES ===
export interface AdminSystemSettings {
  general: {
    siteName: string;
    siteUrl: string;
    supportEmail: string;
    currency: string;
    timezone: string;
    language: string;
    maintenanceMode: boolean;
    registrationEnabled: boolean;
  };
  fees: {
    propertyCommission: number;
    tourCommission: number;
    agentCommission: number;
    paymentProcessingFee: number;
    escrowFee: number;
    disputeFee: number;
  };
  limits: {
    maxBookingAmount: number;
    maxEscrowHoldPeriod: number;
    maxWithdrawalAmount: number;
    maxPropertiesPerHost: number;
    maxToursPerGuide: number;
  };
  verification: {
    autoApproveProperties: boolean;
    autoApproveTours: boolean;
    kycRequired: boolean;
    kycLimits: {
      withoutKyc: number;
      withKyc: number;
    };
  };
  notifications: {
    emailEnabled: boolean;
    smsEnabled: boolean;
    pushEnabled: boolean;
    webhooksEnabled: boolean;
  };
  integrations: {
    paymentGateways: Record<string, any>;
    escrowProvider: Record<string, any>;
    emailProvider: Record<string, any>;
    smsProvider: Record<string, any>;
  };
}

// === BULK OPERATIONS TYPES ===
export interface AdminBulkOperation {
  id: string;
  type: 'update' | 'delete' | 'export' | 'import';
  resource: 'users' | 'properties' | 'tours' | 'bookings' | 'payments';
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  totalItems: number;
  processedItems: number;
  successCount: number;
  failureCount: number;
  initiatedBy: number;
  filters?: Record<string, any>;
  operations?: Record<string, any>;
  results?: Array<{
    id: string;
    status: 'success' | 'failed';
    error?: string;
  }>;
  downloadUrl?: string;
  createdAt: string;
  completedAt?: string;
}

export interface AdminBulkUpdateRequest {
  resource: 'users' | 'properties' | 'tours' | 'bookings';
  filters: Record<string, any>;
  updates: Record<string, any>;
  dryRun?: boolean;
}

export interface AdminBulkDeleteRequest {
  resource: 'users' | 'properties' | 'tours' | 'bookings';
  ids: string[] | number[];
  permanent?: boolean;
  reason?: string;
}

export interface AdminExportRequest {
  resource: 'users' | 'properties' | 'tours' | 'bookings' | 'payments' | 'analytics';
  format: 'csv' | 'excel' | 'json' | 'pdf';
  filters?: Record<string, any>;
  fields?: string[];
  includeRelations?: boolean;
}

// === ADMIN AUDIT TYPES ===
export interface AdminAuditLog {
  id: string;
  adminId: number;
  adminEmail: string;
  action: string;
  resource: string;
  resourceId?: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  errorMessage?: string;
  duration?: number;
  timestamp: string;
}

// === API RESPONSE TYPES ===
export interface AdminPaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  filters?: Record<string, any>;
  sort?: {
    field: string;
    order: 'asc' | 'desc';
  };
}

export interface AdminSuccessResponse<T = any> {
  success: true;
  data: T;
  message?: string;
  timestamp: string;
}

export interface AdminErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
  timestamp: string;
}

export type AdminResponse<T = any> = AdminSuccessResponse<T> | AdminErrorResponse;

// === ADMIN QUERY PARAMETERS ===
export interface AdminQueryParams {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
  search?: string;
  filters?: string; // JSON string of filters
  include?: string[]; // Relations to include
  fields?: string[]; // Fields to select
}

// === PERMISSION TYPES ===
export interface AdminPermissionSet {
  userId: number;
  role: AdminRole;
  permissions: AdminPermission[];
  restrictions?: {
    maxUsers?: number;
    maxProperties?: number;
    maxTours?: number;
    allowedCountries?: string[];
    allowedCurrencies?: string[];
  };
  createdAt: string;
  updatedAt: string;
}

export interface AdminResourcePermissions {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canBulkEdit: boolean;
  canExport: boolean;
  restrictions?: Record<string, any>;
}