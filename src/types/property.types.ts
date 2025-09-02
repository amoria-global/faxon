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