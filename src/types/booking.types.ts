//src/types/booking.types.ts
// --- PROPERTY BOOKING TYPES ---
export interface CreatePropertyBookingDto {
  propertyId: number;
  checkIn: string;
  checkOut: string;
  guests: number;
  message?: string;
  specialRequests?: string;
  clientId?: number; // For agent bookings
}

export interface UpdatePropertyBookingDto {
  status?: PropertyBookingStatus;
  message?: string;
  specialRequests?: string;
  guestNotes?: string;
  checkInValidated?: boolean;
  checkInValidatedAt?: Date;
  checkInValidatedBy?: number;
  checkOutValidated?: boolean;
  checkOutValidatedAt?: Date;
  checkOutValidatedBy?: number;
}

export interface PropertyBookingInfo {
  id: string;
  propertyId: number;
  property: {
    name: string;
    location: string;
    images: any;
    pricePerNight: number;
    hostName: string;
    hostEmail: string;
    hostPhone?: string;
  };
  guestId: number;
  guest: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    profileImage?: string;
  };
  checkIn: string;
  checkOut: string;
  guests: number;
  nights: number;
  totalPrice: number;
  status: PropertyBookingStatus;
  paymentStatus: string;
  message?: string;
  hostResponse?: string;
  specialRequests?: string;
  checkInInstructions?: string;
  checkOutInstructions?: string;
  checkInValidated?: boolean;
  checkInValidatedAt?: string;
  checkInValidatedBy?: number;
  checkOutValidated?: boolean;
  checkOutValidatedAt?: string;
  checkOutValidatedBy?: number;
  createdAt: string;
  updatedAt: string;
}

// --- TOUR BOOKING TYPES ---
export interface CreateTourBookingDto {
  tourId: string;
  scheduleId: string;
  numberOfParticipants: number;
  participants: TourParticipant[];
  specialRequests?: string;
  clientId?: number; // For agent bookings
}

export interface UpdateTourBookingDto {
  status?: TourBookingStatus;
  specialRequests?: string;
  checkInStatus?: TourCheckInStatus;
  guestNotes?: string;
}

export interface TourParticipant {
  name: string;
  age: number;
  email?: string;
  phone?: string;
  emergencyContact?: {
    name: string;
    phone: string;
    relationship: string;
  };
  specialRequirements?: string;
}

export interface TourBookingInfo {
  id: string;
  tourId: string;
  tour: {
    title: string;
    description: string;
    category: string;
    type: string;
    duration: number;
    difficulty: string;
    location: string;
    images: any;
    price: number;
    currency: string;
    inclusions: string[];
    exclusions: string[];
    requirements: string[];
    meetingPoint: string;
  };
  scheduleId: string;
  schedule: {
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
    availableSlots: number;
    bookedSlots: number;
  };
  tourGuideId: number;
  tourGuide: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    profileImage?: string;
    bio?: string;
    rating: number;
    totalTours: number;
  };
  userId: number;
  user: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    profileImage?: string;
  };
  numberOfParticipants: number;
  participants: TourParticipant[];
  totalAmount: number;
  currency: string;
  status: TourBookingStatus;
  paymentStatus: string;
  checkInStatus: TourCheckInStatus;
  checkInTime?: string;
  checkOutTime?: string;
  specialRequests?: string;
  refundAmount?: number;
  refundReason?: string;
  bookingDate: string;
  createdAt: string;
  updatedAt: string;
}

// --- AGENT BOOKING TYPES ---
export interface AgentBookingInfo {
  id: string;
  type: 'property' | 'tour';
  clientId: number;
  client: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
  };
  agentId: number;
  bookingDetails: PropertyBookingInfo | TourBookingInfo;
  commission: number;
  commissionRate: number;
  status: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAgentBookingDto {
  type: 'property' | 'tour';
  clientId: number;
  bookingData: CreatePropertyBookingDto | CreateTourBookingDto;
  commissionRate?: number;
  notes?: string;
}

// --- BOOKING FILTER TYPES ---
export interface PropertyBookingFilters {
  status?: PropertyBookingStatus[];
  checkInDate?: string;
  checkOutDate?: string;
  propertyId?: number;
  hostId?: number;
  guestId?: number;
  minAmount?: number;
  maxAmount?: number;
  sortBy?: 'checkIn' | 'checkOut' | 'totalPrice' | 'createdAt' | 'status';
  sortOrder?: 'asc' | 'desc';
  search?: string;
}

export interface TourBookingFilters {
  status?: TourBookingStatus[];
  tourDate?: string;
  tourId?: string;
  tourGuideId?: number;
  userId?: number;
  category?: string;
  difficulty?: string;
  minAmount?: number;
  maxAmount?: number;
  sortBy?: 'bookingDate' | 'totalAmount' | 'createdAt' | 'status';
  sortOrder?: 'asc' | 'desc';
  search?: string;
}

export interface AgentBookingFilters {
  type?: 'property' | 'tour';
  status?: string[];
  clientId?: number;
  dateRange?: {
    start: string;
    end: string;
  };
  minCommission?: number;
  maxCommission?: number;
  sortBy?: 'createdAt' | 'commission' | 'status';
  sortOrder?: 'asc' | 'desc';
}

// --- BOOKING ANALYTICS TYPES ---
export interface BookingAnalytics {
  totalBookings: number;
  totalRevenue: number;
  averageBookingValue: number;
  bookingsByStatus: { status: string; count: number }[];
  bookingsByMonth: { month: string; count: number; revenue: number }[];
  topProperties?: { propertyId: number; propertyName: string; bookings: number }[];
  topTours?: { tourId: string; tourTitle: string; bookings: number }[];
  guestDemographics?: { country: string; count: number }[];
  conversionRate?: number;
  repeatBookingRate?: number;
}

export interface GuestBookingStats {
  totalBookings: number;
  completedBookings: number;
  cancelledBookings: number;
  totalSpent: number;
  averageBookingValue: number;
  favoriteDestinations: string[];
  upcomingBookings: number;
  memberSince: string;
  loyaltyPoints?: number;
}

// --- PAYMENT & TRANSACTION TYPES ---
export interface BookingPayment {
  id: string;
  bookingId: string;
  bookingType: 'property' | 'tour';
  amount: number;
  currency: string;
  method: string;
  status: string;
  transactionId?: string;
  gatewayResponse?: any;
  createdAt: string;
  updatedAt: string;
}

export interface RefundRequest {
  bookingId: string;
  bookingType: 'property' | 'tour';
  reason: string;
  amount: number;
  requestedBy: number;
  adminNotes?: string;
}

// --- NOTIFICATION TYPES ---
export interface BookingNotification {
  id: string;
  userId: number;
  type: BookingNotificationType;
  title: string;
  message: string;
  bookingId?: string;
  bookingType?: 'property' | 'tour';
  data?: any;
  isRead: boolean;
  createdAt: string;
}

// --- ENUMS ---
export type PropertyBookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'refunded';
export type TourBookingStatus = 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'refunded' | 'no_show';
export type TourCheckInStatus = 'not_checked_in' | 'checked_in' | 'checked_out' | 'no_show';
export type BookingNotificationType = 
  | 'booking_confirmed' 
  | 'booking_cancelled' 
  | 'booking_reminder' 
  | 'payment_confirmed' 
  | 'refund_processed'
  | 'check_in_reminder'
  | 'tour_starting_soon'
  | 'booking_completed'
  | 'review_request';

// --- CALENDAR TYPES ---
export interface BookingCalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  type: 'property' | 'tour';
  status: string;
  color?: string;
  description?: string;
  location?: string;
}

export interface UserBookingCalendar {
  userId: number;
  events: BookingCalendarEvent[];
  upcomingBookings: (PropertyBookingInfo | TourBookingInfo)[];
  conflicts?: {
    date: string;
    conflictingBookings: string[];
  }[];
}

// --- SEARCH & RECOMMENDATION TYPES ---
export interface BookingRecommendation {
  type: 'property' | 'tour';
  id: string | number;
  title: string;
  description: string;
  price: number;
  rating: number;
  image: string;
  location: string;
  reasonForRecommendation: string;
  matchPercentage: number;
}

export interface BookingSearchSuggestions {
  properties: {
    id: number;
    name: string;
    location: string;
    pricePerNight: number;
    rating: number;
    image: string;
  }[];
  tours: {
    id: string;
    title: string;
    location: string;
    price: number;
    rating: number;
    image: string;
    duration: number;
  }[];
  destinations: string[];
  recentSearches: string[];
}

// --- WISHLIST TYPES ---
export interface WishlistItem {
  id: string;
  userId: number;
  type: 'property' | 'tour';
  itemId: string | number;
  itemDetails: {
    name: string;
    location: string;
    price: number;
    rating: number;
    image: string;
  };
  notes?: string;
  isAvailable: boolean;
  priceAlerts: boolean;
  createdAt: string;
}

export interface WishlistFilters {
  type?: 'property' | 'tour';
  location?: string;
  minPrice?: number;
  maxPrice?: number;
  isAvailable?: boolean;
  search?: string;
}

export interface WishlistStats {
  totalItems: number;
  propertyCount: number;
  tourCount: number;
  totalValue: number;
  averagePrice: number;
}

export interface AddToWishlistRequest {
  type: 'property' | 'tour';
  itemId: string | number;
  notes?: string;
}

// --- API RESPONSE TYPES ---
export interface BookingResponse {
  success: boolean;
  message: string;
  data?: PropertyBookingInfo | TourBookingInfo | AgentBookingInfo;
  errors?: string[];
}

export interface BookingsListResponse {
  success: boolean;
  message: string;
  data?: {
    bookings: (PropertyBookingInfo | TourBookingInfo)[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  errors?: string[];
}

export interface BookingStatsResponse {
  success: boolean;
  message: string;
  data?: GuestBookingStats | BookingAnalytics;
  errors?: string[];
}

// --- VALIDATION TYPES ---
export interface BookingValidationErrors {
  checkIn?: string;
  checkOut?: string;
  guests?: string;
  participants?: string;
  totalPrice?: string;
  availability?: string;
  payment?: string;
  general?: string[];
}

// --- BULK OPERATION TYPES ---
export interface BulkBookingOperation {
  bookingIds: string[];
  operation: 'cancel' | 'confirm' | 'update_status' | 'send_reminder';
  data?: any;
  reason?: string;
}

export interface BulkOperationResult {
  total: number;
  successful: number;
  failed: number;
  results: {
    bookingId: string;
    status: 'success' | 'failed';
    error?: string;
  }[];
}