// --- PROPERTY DTOs ---
export interface CreatePropertyDto {
  name: string;
  location: string;
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
  location?: string;
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