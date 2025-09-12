// --- TOUR DTOs ---
export interface CreateTourDto {
  title: string;
  description: string;
  shortDescription: string;
  category: string;
  type: string;
  duration: number; // in hours
  maxGroupSize: number;
  minGroupSize?: number;
  price: number;
  currency?: string;
  images: TourImages;
  itinerary: TourItineraryItem[];
  inclusions: string[];
  exclusions: string[];
  requirements: string[];
  difficulty: TourDifficulty;
  locationCountry: string;
  locationState?: string;
  locationCity: string;
  locationAddress: string;
  latitude?: number;
  longitude?: number;
  locationZipCode?: string;
  meetingPoint: string;
  tags: string[];
  schedules: CreateTourScheduleDto[];
}

export interface UpdateTourDto {
  title?: string;
  description?: string;
  shortDescription?: string;
  category?: string;
  type?: string;
  duration?: number;
  maxGroupSize?: number;
  minGroupSize?: number;
  price?: number;
  currency?: string;
  images?: Partial<TourImages>;
  itinerary?: TourItineraryItem[];
  inclusions?: string[];
  exclusions?: string[];
  requirements?: string[];
  difficulty?: TourDifficulty;
  locationCountry?: string;
  locationState?: string;
  locationCity?: string;
  locationAddress?: string;
  latitude?: number;
  longitude?: number;
  locationZipCode?: string;
  meetingPoint?: string;
  tags?: string[];
  isActive?: boolean;
}

export interface CreateTourScheduleDto {
  startDate: string;
  endDate: string;
  startTime: string; // HH:MM format
  endTime: string; // HH:MM format
  availableSlots: number;
  price?: number; // Override tour price if needed
  specialNotes?: string;
}

export interface UpdateTourScheduleDto {
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  availableSlots?: number;
  bookedSlots?: number;
  isAvailable?: boolean;
  price?: number;
  specialNotes?: string;
}

// --- TOUR RESPONSE TYPES ---
export interface TourInfo {
  id: string;
  title: string;
  description: string;
  shortDescription: string;
  category: string;
  type: string;
  duration: number;
  maxGroupSize: number;
  minGroupSize: number;
  price: number;
  currency: string;
  images: TourImages;
  itinerary: TourItineraryItem[];
  inclusions: string[];
  exclusions: string[];
  requirements: string[];
  difficulty: TourDifficulty;
  locationCountry: string;
  locationState?: string;
  locationCity: string;
  locationAddress: string;
  latitude?: number;
  longitude?: number;
  locationZipCode?: string;
  meetingPoint: string;
  tags: string[];
  rating: number;
  totalReviews: number;
  totalBookings: number;
  views: number;
  isActive: boolean;
  tourGuideId: number;
  tourGuide: TourGuideInfo;
  schedules: TourScheduleInfo[];
  createdAt: string;
  updatedAt: string;
}

export interface TourSummary {
  id: string;
  title: string;
  shortDescription: string;
  category: string;
  type: string;
  duration: number;
  price: number;
  currency: string;
  mainImage: string;
  rating: number;
  totalReviews: number;
  difficulty: TourDifficulty;
  locationCity: string;
  locationCountry: string;
  tourGuideName: string;
  tourGuideProfileImage?: string;
  isActive: boolean;
  nextAvailableDate?: string;
}

export interface TourScheduleInfo {
  id: string;
  tourId: string;
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
  updatedAt: string;
}

export interface TourGuideInfo {
  id: number;
  firstName: string;
  lastName: string;
  email?: string;
  profileImage?: string;
  bio?: string;
  experience?: number;
  languages: string[];
  specializations: string[];
  rating: number;
  totalTours: number;
  isVerified: boolean;
  licenseNumber?: string;
  certifications: string[];
}

// --- NESTED TYPES ---
export interface TourImages {
  main: string[];
  activity: string[];
  landscape: string[];
  group: string[];
  guide: string[];
  equipment: string[];
}

export interface TourItineraryItem {
  order: number;
  title: string;
  description: string;
  duration: number; // in minutes
  location?: string;
  highlights?: string[];
}

export interface TourParticipant {
  name: string;
  age: number;
  emergencyContact: {
    name: string;
    phone: string;
    relationship: string;
  };
  specialRequirements?: string[];
  medicalConditions?: string[];
}

// --- BOOKING RELATED TYPES ---
export interface TourBookingRequest {
  tourId: string;
  scheduleId: string;
  numberOfParticipants: number;
  participants: TourParticipant[];
  specialRequests?: string;
  totalAmount: number;
  currency?: string;
}

export interface TourBookingInfo {
  id: string;
  tourId: string;
  tourTitle: string;
  scheduleId: string;
  userId: number;
  userName: string;
  userEmail: string;
  tourGuideId: number;
  tourGuideName: string;
  numberOfParticipants: number;
  participants: TourParticipant[];
  specialRequests?: string;
  totalAmount: number;
  currency: string;
  status: TourBookingStatus;
  paymentStatus: TourPaymentStatus;
  paymentId?: string;
  checkInStatus: TourCheckInStatus;
  checkInTime?: string;
  checkOutTime?: string;
  refundAmount?: number;
  refundReason?: string;
  guestNotes?: string;
  bookingDate: string;
  tourDate: string;
  tourTime: string;
  createdAt: string;
  updatedAt: string;
}

export interface TourBookingUpdateDto {
  status?: TourBookingStatus;
  paymentStatus?: TourPaymentStatus;
  checkInStatus?: TourCheckInStatus;
  specialRequests?: string;
  guestNotes?: string;
  refundAmount?: number;
  refundReason?: string;
}

// --- REVIEW TYPES ---
export interface TourReviewInfo {
  id: string;
  bookingId: string;
  userId: number;
  userName: string;
  userProfileImage?: string;
  tourId: string;
  tourTitle: string;
  tourGuideId: number;
  rating: number;
  comment: string;
  images?: string[];
  pros: string[];
  cons: string[];
  wouldRecommend: boolean;
  isAnonymous: boolean;
  isVerified: boolean;
  isVisible: boolean;
  helpfulCount: number;
  response?: string; // Tour guide response
  responseDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTourReviewDto {
  bookingId: string;
  tourId: string;
  rating: number;
  comment: string;
  images?: string[];
  pros: string[];
  cons: string[];
  wouldRecommend: boolean;
  isAnonymous?: boolean;
}

// --- SEARCH AND FILTER TYPES ---
export interface TourSearchFilters {
  location?: string; // City or country
  category?: string;
  type?: string;
  difficulty?: TourDifficulty;
  minPrice?: number;
  maxPrice?: number;
  minDuration?: number;
  maxDuration?: number;
  date?: string; // Specific date
  dateRange?: {
    start: string;
    end: string;
  };
  groupSize?: number;
  tags?: string[];
  rating?: number; // Minimum rating
  search?: string; // Search by title or description
  sortBy?: 'price' | 'rating' | 'duration' | 'created_at' | 'popularity';
  sortOrder?: 'asc' | 'desc';
  tourGuideId?: number;
  language?: string;
  hasAvailability?: boolean;
  isActive?: boolean;
}

export interface TourGuideFilters {
  search?: string;
  specialization?: string;
  language?: string;
  experience?: number; // Minimum years
  rating?: number; // Minimum rating
  isVerified?: boolean;
  location?: string;
  sortBy?: 'rating' | 'experience' | 'tours' | 'name';
  sortOrder?: 'asc' | 'desc';
}

export interface TourBookingFilters {
  status?: TourBookingStatus[];
  tourId?: string;
  tourGuideId?: number;
  userId?: number;
  dateRange?: {
    start: string;
    end: string;
  };
  paymentStatus?: TourPaymentStatus[];
  checkInStatus?: TourCheckInStatus[];
  sortBy?: 'date' | 'amount' | 'tour' | 'guest';
  sortOrder?: 'asc' | 'desc';
}

// --- ANALYTICS TYPES ---
export interface TourAnalytics {
  tourId: string;
  tourTitle: string;
  views: number;
  bookings: number;
  revenue: number;
  averageRating: number;
  conversionRate: number;
  period: 'weekly' | 'monthly' | 'yearly';
  data: TourAnalyticsDataPoint[];
}

export interface TourAnalyticsDataPoint {
  date: string;
  views: number;
  bookings: number;
  revenue: number;
  participants: number;
}

export interface TourGuideAnalytics {
  overview: TourGuideAnalyticsOverview;
  tourPerformance: TourPerformanceMetrics[];
  bookingTrends: TourBookingTrendData[];
  guestInsights: TourGuestAnalytics;
  revenueAnalytics: TourRevenueAnalytics;
  marketComparison: TourMarketComparisonData;
}

export interface TourGuideAnalyticsOverview {
  totalViews: number;
  totalBookings: number;
  totalRevenue: number;
  averageRating: number;
  totalParticipants: number;
  conversionRate: number;
  repeatGuestRate: number;
  timeRange: 'week' | 'month' | 'quarter' | 'year';
}

export interface TourPerformanceMetrics {
  tourId: string;
  tourTitle: string;
  views: number;
  bookings: number;
  revenue: number;
  participants: number;
  averageRating: number;
  conversionRate: number;
  pricePerformance: 'above_market' | 'at_market' | 'below_market';
  recommendations: string[];
}

export interface TourBookingTrendData {
  date: string;
  bookings: number;
  revenue: number;
  participants: number;
  averageBookingValue: number;
}

export interface TourGuestAnalytics {
  totalGuests: number;
  newGuests: number;
  returningGuests: number;
  averageGroupSize: number;
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

export interface TourRevenueAnalytics {
  monthlyRevenue: { month: string; revenue: number }[];
  revenueByTour: { tourId: string; tourTitle: string; revenue: number }[];
  seasonalTrends: { season: string; averageRevenue: number; bookingCount: number }[];
  pricingOptimization: {
    tourId: string;
    currentPrice: number;
    suggestedPrice: number;
    potentialIncrease: number;
    confidence: number;
  }[];
}

export interface TourMarketComparisonData {
  averagePrice: number;
  myAveragePrice: number;
  bookingRate: number;
  myBookingRate: number;
  competitorCount: number;
  marketPosition: 'premium' | 'mid_range' | 'budget';
  opportunities: string[];
}

// --- DASHBOARD TYPES ---
export interface TourGuideDashboard {
  totalTours: number;
  activeTours: number;
  totalBookings: number;
  totalRevenue: number;
  averageRating: number;
  totalParticipants: number;
  recentBookings: TourBookingInfo[];
  tourPerformance: TourAnalytics[];
  upcomingTours: TourScheduleInfo[];
  pendingReviews: number;
  monthlyEarnings: TourEarningsData[];
}

export interface TourEarningsData {
  month: string;
  earnings: number;
  bookings: number;
  participants: number;
}

export interface EnhancedTourGuideDashboard extends TourGuideDashboard {
  quickStats: {
    todayTours: number;
    tomorrowTours: number;
    weekBookings: number;
    pendingActions: number;
  };
  recentActivity: TourGuideActivity[];
  alerts: TourGuideAlert[];
  weather?: WeatherInfo;
  marketTrends: {
    demandTrend: 'up' | 'down' | 'stable';
    averagePrice: number;
    seasonalFactor: string;
  };
}

export interface TourGuideActivity {
  id: string;
  type: 'booking' | 'review' | 'payment' | 'message' | 'cancellation' | 'schedule_update';
  title: string;
  description: string;
  timestamp: string;
  tourId?: string;
  bookingId?: string;
  isRead: boolean;
  priority: 'low' | 'medium' | 'high';
}

export interface TourGuideAlert {
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

// --- EARNINGS TYPES ---
export interface TourEarningsOverview {
  totalEarnings: number;
  monthlyEarnings: number;
  yearlyEarnings: number;
  pendingPayouts: number;
  completedPayouts: number;
  averageTourPrice: number;
  conversionRate: number;
  revenueGrowth: number; // percentage
}

export interface TourEarningsBreakdown {
  tourId: string;
  tourTitle: string;
  totalEarnings: number;
  monthlyEarnings: number;
  bookingsCount: number;
  averageBookingValue: number;
  conversionRate: number;
  lastBooking?: string;
}

export interface TourEarningsInfo {
  id: string;
  tourGuideId: number;
  bookingId: string;
  tourId: string;
  tourTitle: string;
  amount: number; // Gross amount
  commission: number; // Platform commission
  netAmount: number; // Amount guide receives
  currency: string;
  status: TourEarningsStatus;
  payoutDate?: string;
  payoutMethod?: string;
  transactionId?: string;
  createdAt: string;
  updatedAt: string;
}

// --- CALENDAR TYPES ---
export interface TourCalendarDay {
  date: string;
  tours: {
    id: string;
    scheduleId: string;
    title: string;
    startTime: string;
    endTime: string;
    bookedSlots: number;
    totalSlots: number;
    status: 'available' | 'fully_booked' | 'completed' | 'cancelled';
  }[];
  totalBookings: number;
  totalRevenue: number;
  isToday: boolean;
}

export interface TourCalendarMonth {
  year: number;
  month: number;
  days: TourCalendarDay[];
}

export interface TourAvailabilityCalendar {
  tourId: string;
  months: TourCalendarMonth[];
  blockedPeriods: {
    start: string;
    end: string;
    reason: string;
  }[];
}

// --- MESSAGE TYPES ---
export interface TourMessageInfo {
  id: string;
  senderId: number;
  senderName: string;
  senderType: 'guest' | 'guide';
  receiverId: number;
  receiverName: string;
  bookingId?: string;
  tourId?: string;
  subject?: string;
  message: string;
  attachments?: string[];
  messageType: TourMessageType;
  isRead: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTourMessageDto {
  receiverId: number;
  bookingId?: string;
  tourId?: string;
  subject?: string;
  message: string;
  attachments?: string[];
  messageType: TourMessageType;
}

// --- NOTIFICATION TYPES ---
export interface TourNotificationInfo {
  id: string;
  userId: number;
  type: TourNotificationType;
  title: string;
  message: string;
  data?: any;
  isRead: boolean;
  createdAt: string;
}

// --- CATEGORY AND TAG TYPES ---
export interface TourCategoryInfo {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  color?: string;
  isActive: boolean;
  sortOrder: number;
  tourCount?: number;
}

export interface TourTagInfo {
  id: string;
  name: string;
  slug: string;
  color?: string;
  isActive: boolean;
  usageCount: number;
}

// --- ADMIN TYPES ---
export interface AdminTourInfo extends TourInfo {
  tourGuideEmail?: string;
  totalRevenue: number;
  platformCommission: number;
  guideEarnings: number;
  lastBooking?: string;
  isReported: boolean;
  reportCount: number;
}

export interface AdminTourFilters {
  status?: string;
  tourGuideId?: number;
  category?: string;
  search?: string;
  isReported?: boolean;
  sortBy?: 'created_at' | 'updated_at' | 'title' | 'status' | 'bookings' | 'revenue';
  sortOrder?: 'asc' | 'desc';
}

export interface AdminTourBookingInfo extends TourBookingInfo {
  platformFee: number;
  guideEarnings: number;
  isDisputed: boolean;
  disputeReason?: string;
}

export interface TourSystemAnalytics {
  overview: {
    totalTours: number;
    totalGuides: number;
    totalBookings: number;
    totalRevenue: number;
    timeRange: string;
  };
  distributions: {
    toursByCategory: { category: string; count: number }[];
    guidesByExperience: { experience: string; count: number }[];
    bookingsByStatus: { status: string; count: number }[];
  };
  recentActivity: {
    recentTours: {
      id: string;
      title: string;
      guideName: string;
      createdAt: string;
    }[];
    recentBookings: {
      id: string;
      tourTitle: string;
      guestName: string;
      totalAmount: number;
      createdAt: string;
    }[];
    recentGuides: {
      id: number;
      name: string;
      email: string;
      specializations: string[];
      createdAt: string;
    }[];
  };
}

// --- ENUMS & UTILITY TYPES ---
export type TourDifficulty = 'easy' | 'moderate' | 'challenging' | 'extreme';
export type TourBookingStatus = 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'refunded' | 'no_show';
export type TourPaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'partially_refunded';
export type TourCheckInStatus = 'not_checked_in' | 'checked_in' | 'checked_out' | 'no_show';
export type TourEarningsStatus = 'pending' | 'approved' | 'paid' | 'disputed';
export type TourMessageType = 'booking_inquiry' | 'booking_confirmation' | 'tour_update' | 'general' | 'support' | 'system';
export type TourNotificationType = 'booking_received' | 'booking_confirmed' | 'booking_cancelled' | 'tour_reminder' | 'review_received' | 'payment_received' | 'message_received' | 'schedule_reminder' | 'system_update';

// --- VALIDATION TYPES ---
export interface TourValidationErrors {
  title?: string;
  description?: string;
  category?: string;
  type?: string;
  duration?: string;
  price?: string;
  maxGroupSize?: string;
  location?: string;
  meetingPoint?: string;
  itinerary?: string;
  schedules?: string;
}

export interface TourBookingValidationErrors {
  tourId?: string;
  scheduleId?: string;
  numberOfParticipants?: string;
  participants?: string;
  totalAmount?: string;
}

// --- API RESPONSE TYPES ---
export interface TourResponse {
  success: boolean;
  message: string;
  data?: TourInfo;
  errors?: TourValidationErrors;
}

export interface ToursResponse {
  success: boolean;
  message: string;
  data?: {
    tours: TourSummary[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  errors?: string[];
}

export interface TourBookingResponse {
  success: boolean;
  message: string;
  data?: TourBookingInfo;
  errors?: TourBookingValidationErrors;
}

export interface TourBookingsResponse {
  success: boolean;
  message: string;
  data?: {
    bookings: TourBookingInfo[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  errors?: string[];
}

// --- BULK OPERATIONS ---
export interface BulkTourOperation {
  tourIds: string[];
  operation: 'activate' | 'deactivate' | 'delete' | 'update_category' | 'update_tags';
  data?: any;
}

export interface BulkTourBookingOperation {
  bookingIds: string[];
  operation: 'confirm' | 'cancel' | 'complete' | 'update_status';
  data?: TourBookingUpdateDto;
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
}

// --- INTEGRATION TYPES ---
export interface TourGuideAPIKey {
  id: string;
  tourGuideId: number;
  keyName: string;
  apiKey: string;
  permissions: string[];
  isActive: boolean;
  expiresAt?: string;
  lastUsed?: string;
  createdAt: string;
}

export interface TourWebhook {
  id: string;
  tourGuideId: number;
  url: string;
  events: string[];
  isActive: boolean;
  secret?: string;
  lastTriggered?: string;
  failureCount: number;
  createdAt: string;
}

// --- EXPORT TYPES ---
export interface TourExportRequest {
  type: 'tours' | 'bookings' | 'earnings' | 'reviews' | 'analytics';
  format: 'csv' | 'xlsx' | 'pdf';
  filters?: any;
  dateRange?: {
    start: string;
    end: string;
  };
  columns?: string[];
  userId: number;
  userType: 'tourguide' | 'admin';
}

export interface TourExportResult {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  downloadUrl?: string;
  expiresAt?: string;
  error?: string;
  createdAt: string;
}