// --- PROPERTY DTOs ---
export interface CreatePropertyDto {
  name: string;
    location: {
    type: 'upi' | 'address';
    upi: string;
    address: string;
    upiDocument?: string;
  } | string;
  type: string;
  category: string;
  pricePerNight: number;
  pricePerTwoNights?: number;
  beds: number;
  baths: number;
  maxGuests: number;
  features: string[];
  description?: string;
  availabilityDates: {
    start: string;
    end: string;
  };
  images: PropertyImages;
  video3D?: string; // URL to uploaded video
  ownerDetails?: OwnerDetails;
}

export interface UpdatePropertyDto {
  name?: string;
  location?: {
    type: 'upi' | 'address';
    upi: string;
    address: string;
    upiDocument?: string;
  };
  upiNumber?: string;
  propertyAddress?: string;
  type?: string;
  category?: string;
  pricePerNight?: number;
  pricePerTwoNights?: number;
  beds?: number;
  baths?: number;
  maxGuests?: number;
  features?: string[];
  description?: string;
  availabilityDates?: {
    start: string;
    end: string;
  };
  images?: Partial<PropertyImages>;
  video3D?: string;
  status?: PropertyStatus;
}

export interface PropertySearchFilters {
  location?: string;
  type?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  beds?: number;
  baths?: number;
  maxGuests?: number;
  features?: string[];
  availableFrom?: string;
  availableTo?: string;
  status?: PropertyStatus;
  hostId?: number;
  search?: string; // Search by name or location
  sortBy?: 'price' | 'rating' | 'created_at' | 'name';
  sortOrder?: 'asc' | 'desc';
}

// --- PROPERTY RESPONSE TYPES ---
export interface PropertyInfo {
  id: number;
  name: string;
  location: string;
  upiNumber?: string;
  propertyAddress?: string;
  type: string;
  category: string;
  pricePerNight: number;
  pricePerTwoNights?: number;
  beds: number;
  baths: number;
  maxGuests: number;
  features: string[];
  description?: string;
  images: PropertyImages;
  video3D?: string;
  rating: number;
  reviewsCount: number;
  hostId: number;
  hostName: string;
  hostProfileImage?: string;
  status: PropertyStatus;
  availability: PropertyAvailability;
  createdAt: string;
  updatedAt: string;
  totalBookings: number;
  isVerified: boolean;
}

export interface PropertySummary {
  id: number;
  name: string;
  location: string;
  category: string;
  type?: string;
  pricePerNight: number;
  image: string; // Main image URL
  rating: number;
  reviewsCount: number;
  beds: number;
  baths: number;
  hostName: string;
  availability: string; // "Available" | "Booked" | "Unavailable"
}

// --- NESTED TYPES ---
export interface OwnerDetails {
  names: string;
  email: string;
  phone: string;
  address: string;
}

export interface PropertyImages {
  livingRoom: string[];
  kitchen: string[];
  diningArea: string[];
  bedroom: string[];
  bathroom: string[];
  workspace: string[];
  balcony: string[];
  laundryArea: string[];
  gym: string[];
  exterior: string[];
  childrenPlayroom: string[];
}

export interface PropertyAvailability {
  isAvailable: boolean;
  availableFrom?: string;
  availableTo?: string;
  blockedDates: string[];
  minStay: number; // Minimum nights
  maxStay?: number; // Maximum nights
}

// --- BOOKING RELATED TYPES ---
export interface BookingRequest {
  propertyId: number;
  checkIn: string;
  checkOut: string;
  guests: number;
  totalPrice: number;
  message?: string;
}

export interface BookingInfo {
  id: string;
  propertyId: number;
  propertyName: string;
  guestId: number;
  guestName: string;
  guestEmail: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  totalPrice: number;
  status: BookingStatus;
  message?: string;
  createdAt: string;
  updatedAt: string;
}

// --- REVIEW TYPES ---
export interface PropertyReview {
  id: string;
  propertyId: number;
  userId: number;
  userName: string;
  userProfileImage?: string;
  rating: number;
  comment: string;
  images?: string[];
  response?: string; // Host response
  createdAt: string;
  updatedAt: string;
}

export interface CreateReviewDto {
  propertyId: number;
  rating: number;
  comment: string;
  images?: string[];
}



// --- AMENITIES & FEATURES ---
export interface PropertyAmenity {
  id: string;
  name: string;
  category: AmenityCategory;
  icon: string;
  description?: string;
}

export interface PropertyFeature {
  name: string;
  category: FeatureCategory;
  isSelected: boolean;
}

// --- ANALYTICS TYPES ---
export interface PropertyAnalytics {
  propertyId: number;
  views: number;
  bookings: number;
  revenue: number;
  averageRating: number;
  occupancyRate: number;
  period: 'weekly' | 'monthly' | 'yearly';
  data: AnalyticsDataPoint[];
}

export interface AnalyticsDataPoint {
  date: string;
  views: number;
  bookings: number;
  revenue: number;
}

// --- ENUMS & UTILITY TYPES ---
export type PropertyStatus = 'active' | 'inactive' | 'pending' | 'suspended' | 'draft';
export type PropertyType = 'apartment' | 'house' | 'villa' | 'condo' | 'townhouse' | 'studio' | 'loft';
export type PropertyCategory = 'entire_place' | 'private_room' | 'shared_room';
export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'refunded';
export type AmenityCategory = 'basic' | 'featured' | 'safety' | 'accessibility';
export type FeatureCategory = 'interior' | 'exterior' | 'entertainment' | 'kitchen' | 'bathroom' | 'outdoor';

// --- UPLOAD TYPES ---
export interface ImageUploadDto {
  propertyId: number;
  category: keyof PropertyImages;
  files: File[];
}

export interface VideoUploadDto {
  propertyId: number;
  file: File;
}

export interface MediaUploadResponse {
  success: boolean;
  urls: string[];
  message: string;
}

// --- VALIDATION TYPES ---
export interface PropertyValidationErrors {
  name?: string;
  location?: string;
  type?: string;
  pricePerNight?: string;
  beds?: string;
  baths?: string;
  maxGuests?: string;
  features?: string;
  images?: string;
  availabilityDates?: string;
}

// --- FORM STATE TYPES ---
export interface PropertyFormState {
  isLoading: boolean;
  isSubmitting: boolean;
  errors: PropertyValidationErrors;
  uploadProgress: { [key: string]: number };
  currentStep: number;
  totalSteps: number;
}

// --- API RESPONSE TYPES ---
export interface PropertyResponse {
  success: boolean;
  message: string;
  data?: PropertyInfo;
  errors?: PropertyValidationErrors;
}

export interface PropertiesResponse {
  success: boolean;
  message: string;
  data?: {
    properties: PropertySummary[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  errors?: string[];
}

// --- DASHBOARD TYPES ---
export interface HostDashboard {
  totalProperties: number;
  activeProperties: number;
  totalBookings: number;
  totalRevenue: number;
  averageRating: number;
  recentBookings: BookingInfo[];
  propertyPerformance: PropertyAnalytics[];
  upcomingCheckIns: BookingInfo[];
  pendingReviews: number;
}

export interface PropertyInsights {
  propertyId: number;
  propertyName: string;
  monthlyViews: number;
  monthlyBookings: number;
  monthlyRevenue: number;
  averageNightlyRate: number;
  occupancyRate: number;
  competitorPricing: {
    average: number;
    min: number;
    max: number;
  };
  suggestions: string[];
}

// --- LOCATION TYPES ---
export interface LocationData {
  address: string;
  city: string;
  state: string;
  country: string;
  zipCode?: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  neighborhood?: string;
  landmarks?: string[];
}

// --- PRICING TYPES ---
export interface PricingRule {
  id: string;
  propertyId: number;
  name: string;
  type: 'seasonal' | 'weekly' | 'monthly' | 'custom';
  startDate: string;
  endDate: string;
  priceModifier: number; // Percentage or fixed amount
  modifierType: 'percentage' | 'fixed';
  isActive: boolean;
}

export interface DynamicPricing {
  basePrice: number;
  finalPrice: number;
  appliedRules: PricingRule[];
  breakdown: {
    basePrice: number;
    seasonalAdjustment: number;
    weeklyDiscount: number;
    monthlyDiscount: number;
    customRules: number;
  };
}

// --- CALENDAR TYPES ---
export interface CalendarDay {
  date: string;
  isAvailable: boolean;
  price: number;
  isBlocked: boolean;
  hasBooking: boolean;
  bookingId?: string;
  notes?: string;
}

export interface CalendarMonth {
  year: number;
  month: number;
  days: CalendarDay[];
}

export interface AvailabilityCalendar {
  propertyId: number;
  months: CalendarMonth[];
  blockedPeriods: {
    start: string;
    end: string;
    reason: string;
  }[];
}

// Additional types for host dashboard functionality

// --- GUEST MANAGEMENT TYPES ---
export interface GuestProfile {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  profileImage?: string;
  verificationStatus: 'verified' | 'pending' | 'unverified';
  joinDate: string;
  totalBookings: number;
  totalSpent: number;
  averageRating: number;
  lastBooking?: string;
  preferredCommunication: 'email' | 'phone' | 'both';
  notes?: string;
}

export interface GuestBookingHistory {
  guestId: number;
  bookings: BookingInfo[];
  totalBookings: number;
  totalRevenue: number;
  averageStayDuration: number;
  favoriteProperty?: string;
}

// --- EARNINGS & FINANCIAL TYPES ---
export interface EarningsOverview {
  totalEarnings: number;
  monthlyEarnings: number;
  yearlyEarnings: number;
  pendingPayouts: number;
  completedPayouts: number;
  averageNightlyRate: number;
  occupancyRate: number;
  revenueGrowth: number; // percentage
}

export interface EarningsBreakdown {
  propertyId: number;
  propertyName: string;
  totalEarnings: number;
  monthlyEarnings: number;
  bookingsCount: number;
  averageBookingValue: number;
  occupancyRate: number;
  lastBooking?: string;
}

export interface PayoutHistory {
  id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  payoutDate: string;
  method: 'bank_transfer' | 'paypal' | 'stripe';
  fees: number;
  netAmount: number;
  period: {
    start: string;
    end: string;
  };
}

export interface FinancialTransaction {
  id: string;
  type: 'booking' | 'cancellation' | 'refund' | 'fee' | 'payout';
  amount: number;
  currency: string;
  description: string;
  date: string;
  bookingId?: string;
  propertyId?: number;
  status: 'pending' | 'completed' | 'failed';
}

// --- ANALYTICS TYPES ---
export interface HostAnalytics {
  overview: AnalyticsOverview;
  propertyPerformance: PropertyPerformanceMetrics[];
  bookingTrends: BookingTrendData[];
  guestInsights: GuestAnalytics;
  revenueAnalytics: RevenueAnalytics;
  marketComparison: MarketComparisonData;
}

export interface AnalyticsOverview {
  totalViews: number;
  totalBookings: number;
  totalRevenue: number;
  averageRating: number;
  occupancyRate: number;
  conversionRate: number;
  repeatGuestRate: number;
  timeRange: 'week' | 'month' | 'quarter' | 'year';
}

export interface PropertyPerformanceMetrics {
  propertyId: number;
  propertyName: string;
  views: number;
  bookings: number;
  revenue: number;
  occupancyRate: number;
  averageRating: number;
  conversionRate: number;
  pricePerformance: 'above_market' | 'at_market' | 'below_market';
  recommendations: string[];
}

export interface BookingTrendData {
  date: string;
  bookings: number;
  revenue: number;
  averageBookingValue: number;
  occupancyRate: number;
}

export interface GuestAnalytics {
  totalGuests: number;
  newGuests: number;
  returningGuests: number;
  averageStayDuration: number;
  guestDemographics: {
    ageGroups: { range: string; count: number }[];
    countries: { country: string; count: number }[];
    purposes: { purpose: string; count: number }[];
  };
  guestSatisfaction: {
    averageRating: number;
    ratingDistribution: { rating: number; count: number }[];
    commonComplaints: string[];
    commonPraises: string[];
  };
}

export interface RevenueAnalytics {
  monthlyRevenue: { month: string; revenue: number }[];
  revenueByProperty: { propertyId: number; propertyName: string; revenue: number }[];
  seasonalTrends: { season: string; averageRevenue: number; bookingCount: number }[];
  pricingOptimization: {
    currentPrice: number;
    suggestedPrice: number;
    potentialIncrease: number;
    confidence: number;
  }[];
}

export interface MarketComparisonData {
  averagePrice: number;
  myAveragePrice: number;
  occupancyRate: number;
  myOccupancyRate: number;
  competitorCount: number;
  marketPosition: 'premium' | 'mid_range' | 'budget';
  opportunities: string[];
}

// --- BOOKING MANAGEMENT TYPES ---
export interface BookingFilters {
  status?: BookingStatus[];
  propertyId?: number;
  clientId?: number; // Added clientId to the type
  dateRange?: {
    start: string;
    end: string;
  };
  guestId?: number;
  sortBy?: 'date' | 'amount' | 'property' | 'guest';
  sortOrder?: 'asc' | 'desc';
}

export interface BookingUpdateDto {
  status?: BookingStatus;
  notes?: string;
  specialRequests?: string;
  checkInInstructions?: string;
  checkOutInstructions?: string;
}

export interface BookingCalendar {
  year: number;
  month: number;
  days: BookingCalendarDay[];
}

export interface BookingCalendarDay {
  date: string;
  bookings: {
    id: string;
    guestName: string;
    propertyName: string;
    type: 'check_in' | 'check_out' | 'ongoing';
    status: BookingStatus;
  }[];
  revenue: number; 
  isToday: boolean;
}

// --- DASHBOARD ENHANCEMENT TYPES ---
export interface EnhancedHostDashboard extends HostDashboard {
  quickStats: {
    todayCheckIns: number;
    todayCheckOuts: number;
    occupiedProperties: number;
    pendingActions: number;
  };
  recentActivity: DashboardActivity[];
  alerts: DashboardAlert[];
  weather?: WeatherInfo;
  marketTrends: {
    demandTrend: 'up' | 'down' | 'stable';
    averagePrice: number;
    competitorActivity: string;
  };
}

export interface DashboardActivity {
  id: string;
  type: 'booking' | 'review' | 'payout' | 'message' | 'cancellation';
  title: string;
  description: string;
  timestamp: string;
  propertyId?: number;
  bookingId?: string;
  isRead: boolean;
  priority: 'low' | 'medium' | 'high';
}

export interface DashboardAlert {
  id: string;
  type: 'urgent' | 'warning' | 'info';
  title: string;
  message: string;
  actionRequired: boolean;
  actionUrl?: string;
  createdAt: string;
  expiresAt?: string;
}

export interface WeatherInfo {
  location: string;
  current: {
    temperature: number;
    condition: string;
    humidity: number;
    windSpeed: number;
  };
  forecast: {
    date: string;
    highTemp: number;
    lowTemp: number;
    condition: string;
    precipitationChance: number;
  }[];
}
// Updated property.types.ts - Add these types to your existing types file

// --- AGENT-SPECIFIC TYPES ---

export interface AgentDashboard {
  totalClients: number;
  activeClients: number;
  totalCommissions: number;
  pendingCommissions: number;
  avgCommissionPerBooking: number;
  recentBookings: AgentBookingInfo[];
  monthlyCommissions: MonthlyCommissionData[];
}

export interface AgentBookingInfo {
  id: string;
  clientName: string;
  bookingType: 'property' | 'tour';
  commission: number;
  commissionStatus: 'pending' | 'earned' | 'paid';
  bookingDate: string;
  createdAt: string;
}

export interface MonthlyCommissionData {
  month: string;
  commission: number;
  bookings: number;
}

export interface AgentClient {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  profileImage?: string;
  status: string;
  userType: string;
  joinDate: string;
  totalProperties: number;
  totalBookings: number;
  totalSpent: number;
  totalCommissionsEarned: number;
  lastBooking?: string;
}

export interface AgentEarnings {
  totalEarnings: number;
  totalBookings: number;
  periodEarnings: number;
  periodBookings: number;
  commissionBreakdown: {
    bookingType: string;
    totalCommission: number;
    bookingCount: number;
  }[];
  timeRange: 'week' | 'month' | 'quarter' | 'year';
}

export interface AgentPerformance {
  monthlyStats: any[];
  topClients: AgentTopClient[];
  conversionMetrics: {
    inquiryToBookingRate: number;
    averageBookingValue: number;
    clientRetentionRate: number;
  };
}

export interface AgentTopClient {
  clientId: number;
  clientName: string;
  clientEmail?: string;
  totalCommission: number;
  totalBookingValue: number;
  totalBookings: number;
}

export interface AgentCommissionInfo {
  id: string;
  clientName: string;
  bookingType: 'property' | 'tour';
  bookingValue: number;
  commission: number;
  commissionRate: number;
  commissionStatus: 'pending' | 'earned' | 'paid';
  bookingDate: string;
  commissionDueDate?: string;
  commissionPaidDate?: string;
  notes?: string;
}

export interface AgentFilters {
  status?: string;
  bookingType?: string;
  clientId?: number;
  startDate?: string;
  endDate?: string;
}

// --- ADMIN-SPECIFIC TYPES ---

export interface AdminPropertyInfo {
  id: number;
  name: string;
  location: string;
  type: string;
  category: string;
  status: PropertyStatus;
  isVerified: boolean;
  pricePerNight: number;
  hostId: number;
  hostName: string;
  hostEmail?: string;
  hostType?: string;
  totalBookings: number;
  averageRating: number;
  reviewsCount: number;
  views: number;
  createdAt: string;
  updatedAt: string;
  totalRevenue: number;
}

export interface AdminUserInfo {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  userType: UserType;
  status: string;
  verificationStatus?: string;
  phone?: string;
  country?: string;
  city?: string;
  profileImage?: string;
  createdAt: string;
  lastLogin?: string;
  totalProperties: number;
  totalBookings: number;
  isVerified: boolean;
  // Agent-specific fields
  agentCode?: string;
  commissionRate?: number;
  totalCommissions?: number;
  // Admin-specific fields
  adminLevel?: string;
  adminPermissions?: string[];
}

export interface SystemAnalytics {
  overview: {
    totalProperties: number;
    totalUsers: number;
    totalBookings: number;
    totalRevenue: number;
    timeRange: string;
  };
  distributions: {
    propertiesByStatus: { status: string; count: number }[];
    usersByType: { userType: string; count: number }[];
    bookingsByStatus: { status: string; count: number }[];
  };
  recentActivity: SystemActivity;
}

export interface SystemActivity {
  recentProperties: {
    id: number;
    name: string;
    hostName: string;
    createdAt: string;
  }[];
  recentBookings: {
    id: string;
    propertyName: string;
    guestName: string;
    totalPrice: number;
    createdAt: string;
  }[];
  recentUsers: {
    id: number;
    name: string;
    email: string;
    userType: string;
    createdAt: string;
  }[];
}

export interface AdminAction {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  adminName: string;
  adminEmail: string;
  reason?: string;
  details?: any;
  createdAt: string;
}

export interface BulkActionResult {
  total: number;
  successful: number;
  failed: number;
  results: {
    targetId: string;
    success: boolean;
    result?: any;
    error?: string;
  }[];
}

export interface SystemReports {
  dailyStats: {
    today: {
      properties: number;
      bookings: number;
      users: number;
    };
    yesterday: {
      properties: number;
      bookings: number;
      users: number;
    };
    growth: {
      properties: number;
      bookings: number;
      users: number;
    };
  };
  weeklyStats: {
    date: string;
    properties: number;
    bookings: number;
    users: number;
    revenue: number;
  }[];
  topHosts: {
    id: number;
    name: string;
    email: string;
    totalProperties: number;
    totalBookings: number;
    avgRating: number;
    totalEarnings: number;
    joinDate: string;
  }[];
  topProperties: {
    id: number;
    name: string;
    location: string;
    hostName: string;
    totalBookings: number;
    averageRating: number;
    totalRevenue: number;
    pricePerNight: number;
  }[];
  revenueStats: {
    monthlyRevenue: {
      month: string;
      revenue: number;
      bookings: number;
    }[];
    totalRevenue: number;
    totalBookings: number;
    averageBookingValue: number;
    monthlyGrowth: number;
  };
}

// --- ACCESS CONTROL TYPES ---

export type UserType = 'guest' | 'host' | 'agent' | 'admin' | 'tourguide';

export type AccessLevel = 'read' | 'write' | 'delete';

export interface AccessControlContext {
  userId: number;
  userType: UserType;
  propertyId?: number;
  bookingId?: string;
  targetUserId?: number;
}

export interface PermissionCheck {
  hasAccess: boolean;
  reason?: string;
  suggestedAction?: string;
}

// --- FILTER AND SEARCH TYPES ---

export interface AdminPropertyFilters {
  status?: string;
  hostId?: number;
  search?: string;
  verificationStatus?: 'verified' | 'pending' | 'unverified';
  sortBy?: 'created_at' | 'updated_at' | 'name' | 'status';
  sortOrder?: 'asc' | 'desc';
}

export interface AdminUserFilters {
  userType?: string;
  status?: string;
  search?: string;
  sortBy?: 'name' | 'email' | 'createdAt' | 'lastLogin';
  sortOrder?: 'asc' | 'desc';
}

export interface AgentClientFilters {
  search?: string;
  status?: string;
  sortBy?: 'name' | 'joinDate' | 'totalBookings' | 'totalSpent';
  sortOrder?: 'asc' | 'desc';
}

// --- RESPONSE WRAPPER TYPES ---

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data?: T;
  errors?: string[];
}

export interface PaginatedResponse<T> {
  success: boolean;
  message: string;
  data: {
    items: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// --- COMMISSION TYPES ---

export interface CommissionCalculation {
  commission: number;
  commissionRate: number;
  bookingValue: number;
  agentId: number;
  clientId: number;
  bookingType: 'property' | 'tour';
}

export interface CommissionPayout {
  id: string;
  agentId: number;
  agentName: string;
  totalCommission: number;
  totalBookings: number;
  payoutDate: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  paymentMethod: string;
  commissions: AgentCommissionInfo[];
}

// --- NOTIFICATION TYPES ---

export interface NotificationData {
  userId: number;
  type: string;
  title: string;
  message: string;
  data?: any;
  isRead: boolean;
  createdAt: string;
}

export interface SystemNotification {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  targetUsers: UserType[];
  isActive: boolean;
  expiresAt?: string;
  createdAt: string;
}

// --- AUDIT TYPES ---

export interface AuditLog {
  id: string;
  userId: number;
  userType: UserType;
  action: string;
  resourceType: string;
  resourceId: string;
  oldValues?: any;
  newValues?: any;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

// --- SETTINGS TYPES ---

export interface SystemSettings {
  id: string;
  key: string;
  value: any;
  category: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CommissionSettings {
  defaultAgentRate: number;
  propertyCommissionRate: number;
  tourCommissionRate: number;
  volumeDiscountTiers: {
    bookingCount: number;
    bonusRate: number;
  }[];
  payoutSchedule: 'weekly' | 'monthly' | 'quarterly';
  minimumPayoutAmount: number;
}

// --- VALIDATION TYPES ---

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
}

export interface PropertyValidationResult extends ValidationResult {
  missingFields: string[];
  invalidFields: string[];
  suggestions: string[];
}

// --- ENHANCED BOOKING TYPES ---

export interface EnhancedBookingInfo extends BookingInfo {
  agentId?: number;
  agentName?: string;
  commission?: number;
  commissionStatus?: 'pending' | 'earned' | 'paid';
  isAgentBooking: boolean;
  propertyOwnerName: string;
  paymentStatus: string;
  cancellationPolicy?: string;
  specialRequests?: string;
  hostNotes?: string;
}

// --- DASHBOARD WIDGET TYPES ---

export interface DashboardWidget {
  id: string;
  title: string;
  type: 'chart' | 'stat' | 'table' | 'list';
  data: any;
  config: {
    refreshInterval?: number;
    chartType?: 'line' | 'bar' | 'pie' | 'donut';
    showTotal?: boolean;
    showGrowth?: boolean;
  };
  permissions: UserType[];
}

export interface DashboardLayout {
  userId: number;
  userType: UserType;
  widgets: {
    widgetId: string;
    position: { x: number; y: number; w: number; h: number };
    isVisible: boolean;
  }[];
  lastUpdated: string;
}

// --- EXPORT TYPES ---

export interface ExportRequest {
  type: 'properties' | 'bookings' | 'users' | 'commissions' | 'analytics';
  format: 'csv' | 'xlsx' | 'pdf';
  filters?: any;
  dateRange?: {
    start: string;
    end: string;
  };
  columns?: string[];
  userId: number;
  userType: UserType;
}

export interface ExportResult {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  downloadUrl?: string;
  expiresAt?: string;
  error?: string;
  createdAt: string;
}
// --- SEARCH AND FILTER TYPES ---
export interface GuestSearchFilters {
  search?: string; // Name or email
  verificationStatus?: 'verified' | 'pending' | 'unverified';
  bookingStatus?: 'active' | 'past' | 'upcoming';
  sortBy?: 'name' | 'bookings' | 'spending' | 'joinDate';
  sortOrder?: 'asc' | 'desc';
  dateRange?: {
    start: string;
    end: string;
  };
}

// Add these types to your existing property.types.ts file

// --- AGENT PROPERTY MANAGEMENT TYPES ---
export interface AgentPropertyFilters {
  clientId?: number;
  status?: string;
  search?: string;
  sortBy?: 'name' | 'location' | 'price' | 'rating' | 'created_at';
  sortOrder?: 'asc' | 'desc';
}

export interface AgentPropertyInfo extends PropertyInfo {
  hostEmail?: string;
  totalRevenue: number;
  agentCommission: number;
}

export interface AgentPropertyPerformance {
  timeRange: 'week' | 'month' | 'quarter' | 'year';
  properties: {
    propertyId: number;
    propertyName: string;
    bookings: number;
    revenue: number;
    occupancyRate: number;
    agentCommission: number;
    averageRating: number;
  }[];
  summary: {
    totalBookings: number;
    totalRevenue: number;
    totalCommission: number;
    averageOccupancy: number;
  };
}

// --- AGENT BOOKING TYPES ---
export interface AgentBookingFilters extends BookingFilters {
  clientId?: number;
}

export interface EnhancedAgentBookingInfo extends BookingInfo {
  agentCommission: number;
  commissionStatus: string;
  clientName: string;
}

export interface AgentBookingRequest extends BookingRequest {
  clientId: number;
}

// --- AGENT ANALYTICS TYPES ---
export interface AgentPropertyAnalytics {
  totalRevenue: number;
  monthlyRevenue: number;
  totalBookings: number;
  occupancyRate: number;
  agentCommission: {
    rate: number;
    totalEarned: number;
    monthlyProjection: number;
  };
}

export interface AgentPropertiesAnalyticsSummary {
  timeRange: string;
  properties: {
    propertyId: number;
    propertyName: string;
    totalRevenue: number;
    totalBookings: number;
    occupancyRate: number;
    agentCommission: AgentPropertyAnalytics['agentCommission'];
  }[];
  totals: {
    totalRevenue: number;
    totalCommission: number;
    totalBookings: number;
    averageOccupancy: number;
  };
}

// --- AGENT COMMISSION TYPES ---
export interface CommissionConfiguration {
  agentId: number;
  defaultRate: number;
  propertyCommissionRate?: number;
  tourCommissionRate?: number;
  volumeDiscounts?: {
    bookingThreshold: number;
    bonusRate: number;
  }[];
  isActive: boolean;
}

export interface AgentCommissionTracking {
  agentId: number;
  clientId: number;
  bookingId: string;
  baseCommission: number;
  bonusCommission?: number;
  totalCommission: number;
  status: 'pending' | 'earned' | 'paid' | 'disputed';
  earnedDate?: string;
  paidDate?: string;
}

// --- AGENT CLIENT MANAGEMENT TYPES ---
export interface AgentClientRelationship {
  agentId: number;
  clientId: number;
  relationshipType: 'property_management' | 'booking_assistance' | 'full_service';
  commissionRate: number;
  startDate: string;
  endDate?: string;
  status: 'active' | 'inactive' | 'suspended';
  notes?: string;
}

export interface ClientPropertySummary extends PropertySummary {
  totalRevenue: number;
  agentCommission: number;
  managementLevel: 'full' | 'limited' | 'view_only';
}

// --- AGENT REVIEW TYPES ---
export interface AgentReviewsSummary {
  totalReviews: number;
  averageRating: number;
  recentReviews: PropertyReview[];
  ratingDistribution: {
    rating: number;
    count: number;
  }[];
  propertiesManaged: number;
}

// --- AGENT PERMISSION TYPES ---
export interface AgentPermissions {
  agentId: number;
  clientId: number;
  canEditProperties: boolean;
  canManageBookings: boolean;
  canViewFinancials: boolean;
  canUploadMedia: boolean;
  canManageAvailability: boolean;
  canSetPricing: boolean;
  restrictedFields?: string[];
  permissions: {
    [key: string]: boolean;
  };
}

export interface AgentPropertyEditPermissions {
  allowedFields: string[];
  restrictedFields: string[];
  requiresApproval: string[];
  maxPriceChange?: number;
  maxAvailabilityDays?: number;
}

// --- AGENT DASHBOARD ENHANCEMENT TYPES ---
export interface EnhancedAgentDashboard extends AgentDashboard {
  quickStats: {
    todayBookings: number;
    pendingCommissions: number;
    activeProperties: number;
    clientsWithBookings: number;
  };
  recentActivity: AgentActivity[];
  upcomingEvents: AgentEvent[];
  performanceMetrics: {
    conversionRate: number;
    averageBookingValue: number;
    clientRetentionRate: number;
    commissionGrowthRate: number;
  };
}

export interface AgentActivity {
  id: string;
  type: 'booking_created' | 'commission_earned' | 'property_updated' | 'client_added' | 'review_received';
  title: string;
  description: string;
  timestamp: string;
  clientId?: number;
  propertyId?: number;
  bookingId?: string;
  amount?: number;
  isRead: boolean;
  priority: 'low' | 'medium' | 'high';
}

export interface AgentEvent {
  id: string;
  type: 'check_in' | 'check_out' | 'property_inspection' | 'client_meeting' | 'commission_payout';
  title: string;
  description: string;
  dateTime: string;
  clientId?: number;
  propertyId?: number;
  location?: string;
  status: 'upcoming' | 'in_progress' | 'completed' | 'cancelled';
}

// --- AGENT NOTIFICATION TYPES ---
export interface AgentNotification {
  id: string;
  agentId: number;
  type: 'new_booking' | 'commission_earned' | 'property_issue' | 'client_message' | 'review_alert' | 'payout_ready';
  title: string;
  message: string;
  data?: {
    clientId?: number;
    propertyId?: number;
    bookingId?: string;
    amount?: number;
    [key: string]: any;
  };
  isRead: boolean;
  createdAt: string;
  expiresAt?: string;
}

// --- AGENT REPORTING TYPES ---
export interface AgentPerformanceReport {
  agentId: number;
  reportPeriod: {
    start: string;
    end: string;
  };
  summary: {
    totalClients: number;
    totalProperties: number;
    totalBookings: number;
    totalRevenue: number;
    totalCommissions: number;
  };
  clientPerformance: {
    clientId: number;
    clientName: string;
    propertiesManaged: number;
    bookingsGenerated: number;
    revenueGenerated: number;
    commissionsEarned: number;
  }[];
  propertyPerformance: {
    propertyId: number;
    propertyName: string;
    clientName: string;
    bookings: number;
    revenue: number;
    occupancyRate: number;
    averageRating: number;
  }[];
  trends: {
    bookingTrend: 'increasing' | 'stable' | 'decreasing';
    revenueTrend: 'increasing' | 'stable' | 'decreasing';
    clientGrowth: number;
    marketShare?: number;
  };
}

// --- AGENT BULK OPERATIONS TYPES ---
export interface AgentBulkPropertyUpdate {
  propertyIds: number[];
  updates: {
    pricePerNight?: number;
    pricePerTwoNights?: number;
    features?: string[];
    description?: string;
    minStay?: number;
    maxStay?: number;
    status?: PropertyStatus;
  };
  reason?: string;
  notifyClients: boolean;
}

export interface AgentBulkBookingUpdate {
  bookingIds: string[];
  updates: BookingUpdateDto;
  reason?: string;
  notifyGuests: boolean;
  notifyClients: boolean;
}

export interface BulkOperationResult {
  total: number;
  successful: number;
  failed: number;
  results: {
    targetId: string;
    success: boolean;
    result?: any;
    error?: string;
  }[];
  summary: string;
}

// --- AGENT INTEGRATION TYPES ---
export interface AgentAPIKey {
  id: string;
  agentId: number;
  keyName: string;
  apiKey: string;
  permissions: string[];
  isActive: boolean;
  expiresAt?: string;
  lastUsed?: string;
  createdAt: string;
}

export interface AgentWebhook {
  id: string;
  agentId: number;
  url: string;
  events: string[];
  isActive: boolean;
  secret?: string;
  lastTriggered?: string;
  failureCount: number;
  createdAt: string;
}

// --- AGENT VALIDATION TYPES ---
export interface AgentPropertyValidation {
  propertyId: number;
  agentId: number;
  hasEditAccess: boolean;
  hasViewAccess: boolean;
  editableFields: string[];
  restrictions: {
    maxPriceIncrease?: number;
    requiresApproval?: string[];
    blockedActions?: string[];
  };
  reason?: string;
}

export interface AgentClientValidation {
  clientId: number;
  agentId: number;
  hasAccess: boolean;
  relationshipType?: string;
  permissions: AgentPermissions;
  reason?: string;
}

// Add these types to your existing types file

// --- AGENT AS HOST TYPES ---
export interface AgentPropertyOwnership {
  isDirectOwner: boolean;
  isClientProperty: boolean;
  propertyId: number;
}

export interface AgentOwnProperty extends PropertyInfo {
  relationshipType: 'owned';
  commissionRate: 0;
  fullRevenue: true;
  totalRevenue: number;
}

export interface AgentManagedProperty extends PropertyInfo {
  relationshipType: 'managed';
  fullRevenue: false;
  agentCommission: number;
  clientName: string;
}

export interface AgentAllPropertiesResponse {
  ownProperties: AgentOwnProperty[];
  managedProperties: AgentManagedProperty[];
  totalOwned: number;
  totalManaged: number;
  totalProperties: number;
}

export interface EnhancedAgentDashboard extends AgentDashboard {
  ownProperties: {
    count: number;
    totalRevenue: number;
    recentBookings: BookingInfo[];
  };
  summary: {
    totalPropertiesOwned: number;
    totalPropertiesManaged: number;
    ownPropertyRevenue: number;
    managedPropertyCommissions: number;
    combinedEarnings: number;
  };
}