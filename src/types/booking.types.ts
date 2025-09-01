//src/types/booking.types.ts
// --- BOOKING DTOs ---
export interface CreateBookingDto {
  propertyId: number;
  checkIn: string;
  checkOut: string;
  guests: number;
  totalPrice: number;
  message?: string;
  paymentMethod?: 'card' | 'momo' | 'airtel' | 'mpesa' | 'property';
  paymentTiming: 'now' | 'later';
  cardDetails?: {
    cardNumber: string;
    expiryDate: string;
    cvv: string;
    cardholderName: string;
  };
  mobileDetails?: {
    phoneNumber: string;
  };
}

export interface UpdateBookingDto {
  checkIn?: string;
  checkOut?: string;
  guests?: number;
  totalPrice?: number;
  message?: string;
  status?: BookingStatus;
}

export interface BookingSearchFilters {
  propertyId?: number;
  guestId?: number;
  hostId?: number;
  status?: BookingStatus;
  checkInFrom?: string;
  checkInTo?: string;
  checkOutFrom?: string;
  checkOutTo?: string;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: 'created_at' | 'check_in' | 'check_out' | 'total_price';
  sortOrder?: 'asc' | 'desc';
}

// --- BOOKING RESPONSE TYPES ---
export interface BookingInfo {
  id: string;
  propertyId: number;
  propertyName: string;
  propertyImage: string;
  propertyLocation: string;
  guestId: number;
  guestName: string;
  guestEmail: string;
  guestPhone?: string;
  hostId: number;
  hostName: string;
  hostEmail: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  guests: number;
  pricePerNight: number;
  subtotal: number;
  cleaningFee: number;
  serviceFee: number;
  taxes: number;
  totalPrice: number;
  status: BookingStatus;
  paymentMethod?: string;
  paymentTiming: string;
  message?: string;
  specialRequests?: string;
  cancellationReason?: string;
  refundAmount?: number;
  createdAt: string;
  updatedAt: string;
  confirmationCode: string;
}

export interface BookingSummary {
  id: string;
  propertyName: string;
  propertyImage: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  totalPrice: number;
  status: BookingStatus;
  confirmationCode: string;
  createdAt: string;
}

// --- BOOKING ANALYTICS TYPES ---
export interface BookingAnalytics {
  totalBookings: number;
  totalRevenue: number;
  averageBookingValue: number;
  occupancyRate: number;
  cancellationRate: number;
  bookingsByStatus: BookingStatusCount[];
  monthlyRevenue: MonthlyRevenue[];
  topProperties: TopProperty[];
  upcomingCheckIns: BookingSummary[];
  recentBookings: BookingSummary[];
}

export interface BookingStatusCount {
  status: BookingStatus;
  count: number;
  percentage: number;
}

export interface MonthlyRevenue {
  month: string;
  revenue: number;
  bookings: number;
}

export interface TopProperty {
  propertyId: number;
  propertyName: string;
  bookings: number;
  revenue: number;
}

// --- BOOKING VALIDATION TYPES ---
export interface BookingValidation {
  isAvailable: boolean;
  conflicts: BookingConflict[];
  priceBreakdown: PriceBreakdown;
  maxGuests: number;
  minStay: number;
  maxStay?: number;
  cancellationPolicy: string;
}

export interface BookingConflict {
  bookingId: string;
  checkIn: string;
  checkOut: string;
  status: BookingStatus;
}

export interface PriceBreakdown {
  basePrice: number;
  nights: number;
  subtotal: number;
  cleaningFee: number;
  serviceFee: number;
  taxes: number;
  total: number;
  currency: string;
}

// --- PAYMENT TYPES ---
export interface PaymentInfo {
  id: string;
  bookingId: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  transactionId?: string;
  processorResponse?: any;
  createdAt: string;
  processedAt?: string;
}

export interface RefundInfo {
  id: string;
  bookingId: string;
  paymentId: string;
  amount: number;
  reason: string;
  status: RefundStatus;
  processedAt?: string;
  transactionId?: string;
}

// --- CALENDAR TYPES ---
export interface BookingCalendar {
  propertyId: number;
  year: number;
  month: number;
  days: CalendarBookingDay[];
}

export interface CalendarBookingDay {
  date: string;
  isAvailable: boolean;
  price: number;
  bookings: {
    id: string;
    guestName: string;
    status: BookingStatus;
    isCheckIn: boolean;
    isCheckOut: boolean;
  }[];
  blockedReason?: string;
}

// --- COMMUNICATION TYPES ---
export interface BookingMessage {
  id: string;
  bookingId: string;
  senderId: number;
  senderName: string;
  senderType: 'guest' | 'host';
  message: string;
  attachments?: string[];
  createdAt: string;
  readAt?: string;
}

export interface BookingNotification {
  id: string;
  userId: number;
  bookingId: string;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  data?: any;
  createdAt: string;
}

// --- ENUMS ---
export type BookingStatus = 
  | 'pending' 
  | 'confirmed' 
  | 'cancelled' 
  | 'completed' 
  | 'refunded' 
  | 'disputed' 
  | 'no_show';

export type PaymentMethod = 
  | 'card' 
  | 'momo' 
  | 'airtel' 
  | 'mpesa' 
  | 'bank_transfer' 
  | 'cash' 
  | 'property';

export type PaymentStatus = 
  | 'pending' 
  | 'processing' 
  | 'completed' 
  | 'failed' 
  | 'cancelled' 
  | 'refunded';

export type RefundStatus = 
  | 'pending' 
  | 'processing' 
  | 'completed' 
  | 'failed' 
  | 'cancelled';

export type NotificationType = 
  | 'booking_created' 
  | 'booking_confirmed' 
  | 'booking_cancelled' 
  | 'payment_received' 
  | 'check_in_reminder' 
  | 'check_out_reminder' 
  | 'review_request';

// --- API RESPONSE TYPES ---
export interface BookingResponse {
  success: boolean;
  message: string;
  data?: BookingInfo;
  errors?: string[];
}

export interface BookingsResponse {
  success: boolean;
  message: string;
  data?: {
    bookings: BookingSummary[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  errors?: string[];
}

export interface BookingValidationResponse {
  success: boolean;
  message: string;
  data?: BookingValidation;
  errors?: string[];
}

// --- DASHBOARD TYPES ---
export interface GuestDashboard {
  upcomingBookings: BookingSummary[];
  pastBookings: BookingSummary[];
  pendingReviews: {
    bookingId: string;
    propertyName: string;
    checkOutDate: string;
  }[];
  totalBookings: number;
  totalSpent: number;
  favoriteProperties: {
    propertyId: number;
    propertyName: string;
    timesBooked: number;
  }[];
}

export interface HostBookingDashboard {
  todayCheckIns: BookingSummary[];
  todayCheckOuts: BookingSummary[];
  upcomingBookings: BookingSummary[];
  recentBookings: BookingSummary[];
  pendingRequests: BookingSummary[];
  occupancyRate: number;
  monthlyRevenue: number;
  bookingStats: {
    thisMonth: number;
    lastMonth: number;
    percentageChange: number;
  };
}

// --- FORM TYPES ---
export interface BookingFormData {
  propertyId: number;
  checkIn: string;
  checkOut: string;
  guests: number;
  message: string;
  paymentTiming: 'now' | 'later';
  paymentMethod?: PaymentMethod;
  cardData?: {
    cardNumber: string;
    expiryDate: string;
    cvv: string;
    cardholderName: string;
  };
  mobileData?: {
    phoneNumber: string;
  };
}

export interface BookingFormErrors {
  propertyId?: string;
  checkIn?: string;
  checkOut?: string;
  guests?: string;
  paymentMethod?: string;
  cardNumber?: string;
  expiryDate?: string;
  cvv?: string;
  cardholderName?: string;
  phoneNumber?: string;
  general?: string;
}

// --- UTILITY TYPES ---
export interface DateRange {
  start: string;
  end: string;
}

export interface BookingMetrics {
  totalBookings: number;
  totalRevenue: number;
  averageStay: number;
  averageGuests: number;
  topCountries: { country: string; bookings: number; }[];
  peakSeason: { month: string; bookings: number; }[];
  cancellationRate: number;
  repeatGuestRate: number;
}