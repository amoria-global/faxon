// src/types/auth.types.ts
// --- AUTHENTICATION DTOs ---
export interface RegisterDto {
  email: string;
  firstName?: string;
  lastName?: string;
  names?: string;
  password?: string;
  phone?: string;
  phoneCountryCode?: string;
  // Granular address fields for KYC
  district?: string;  // required for KYC
  sector?: string;    // required for KYC
  street?: string;    // required for KYC
  province?: string;  // required for KYC
  state?: string;     // required for KYC
  country?: string;   // required for KYC
  // Legacy city field (still available for other use cases)
  city?: string;
  zipCode?: string;
  postalCode?: string;
  postcode?: string;
  pinCode?: string;
  eircode?: string;
  cep?: string;
  provider?: string; // 'manual' | 'google' | 'apple'
  userType?: 'guest' | 'host' | 'tourguide' | 'agent' | 'admin';
  
  // Tour Guide specific fields (when userType = 'tourguide')
  bio?: string;
  experience?: number; // years
  languages?: string[]; // Array of languages
  specializations?: string[]; // Array of specializations
  licenseNumber?: string;
  certifications?: string[]; // Array of certifications
  tourGuideType?: 'freelancer' | 'employed'; // New field
  nationalId?: string; // For freelancers
  companyTIN?: string; // For employed tour guides
  verificationDocument?: string; // URL to uploaded document
  companyName?: string; // For employed tour guides
  employmentContract?: string;
  preferredCommunication?: string; // 'email' | 'sms' | 'phone' | 'whatsapp' | 'all'
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface OAuthDto {
  email: string;
  firstName?: string;
  lastName?: string;
  provider: 'google' | 'apple' | 'manual';
  providerId: string;
}

export interface JwtPayload {
  userId: string;
  userType?: string;
  email: string;
  iat?: number;
  exp?: number;
}

// --- PASSWORD MANAGEMENT ---
export interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface ResetPasswordDto {
  email: string;
}

export interface ResetPasswordConfirmDto {
  token: string;
  newPassword: string;
  confirmPassword: string;
}

// --- USER PROFILE MANAGEMENT ---
export interface UserInfo {
  id: number;
  email: string;
  name: string; // Combined firstName + lastName
  firstName?: string;
  lastName?: string;
  phone?: string;
  phoneCountryCode?: string;
  profile?: string; // Profile image URL (profileImage in DB)
  // Granular address fields for KYC
  district?: string;  // required for KYC
  sector?: string;    // required for KYC
  street?: string;    // required for KYC
  province?: string;  // required for KYC
  state?: string;     // required for KYC
  country?: string;   // required for KYC
  // Legacy city field (still available for other use cases)
  city?: string;
  zipCode?: string;
  postalCode?: string;
  postcode?: string;
  pinCode?: string;
  eircode?: string;
  cep?: string;
  status?: string; // 'active' | 'inactive' | 'pending' | 'suspended' | 'unverified'
  userType?: string; // 'guest' | 'host' | 'tourguide' | 'agent' | 'admin'
  provider?: string; // 'manual' | 'google' | 'apple'
  providerId?: string;
  
  // Tour Guide specific fields
  bio?: string;
  experience?: number;
  languages?: string[]; // Parsed from JSON string
  specializations?: string[]; // Parsed from JSON string
  rating?: number;
  totalTours?: number;
  isVerified?: boolean;
  licenseNumber?: string;
  certifications?: string[]; // Parsed from JSON string
  tourGuideType?: 'freelancer' | 'employed';
  nationalId?: string;
  companyTIN?: string;
  verificationDocument?: string;
  companyName?: string;
  employmentContract?: string;
  
  // Additional fields from schema
  verificationStatus?: string;
  preferredCommunication?: string;
  hostNotes?: string;
  averageRating?: number;
  
  created_at: string;
  updated_at: string;
  last_login?: string;
  total_sessions?: number;
  twoFactorEnabled?: boolean;
  kycCompleted?: boolean;
  kycStatus?: string;
  kycSubmittedAt?: string;
  addressDocument?: string;
}

export interface UpdateUserProfileDto {
  name?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  phoneCountryCode?: string;
  // Granular address fields for KYC
  district?: string;  // required for KYC
  sector?: string;    // required for KYC
  street?: string;    // required for KYC
  province?: string;  // required for KYC
  state?: string;     // required for KYC
  country?: string;   // required for KYC
  // Legacy city field (still available for other use cases)
  city?: string;
  
  // All postal code field variations
  zipCode?: string;
  postalCode?: string;
  postcode?: string;
  pinCode?: string;
  eircode?: string;
  cep?: string;

  // Additional legacy fields:
  county?: string;
  region?: string;
  
  // Tour Guide specific fields
  bio?: string;
  experience?: number;
  languages?: string[];
  specializations?: string[];
  licenseNumber?: string;
  certifications?: string[];
  tourGuideType?: 'freelancer' | 'employed';
  nationalId?: string;
  companyTIN?: string;
  verificationDocument?: string;
  companyName?: string;
  employmentContract?: string;
  
  // Additional fields
  verificationStatus?: string;
  preferredCommunication?: string;
}

export interface DocumentUploadDto {
  file: File;
  documentType: 'national_id' | 'company_tin' | 'employment_contract';
  userId: string;
}

export interface DocumentUploadResponse {
  documentUrl: string;
  message: string;
}

export interface DocumentValidation {
  valid: boolean;
  error?: string;
}

export interface TourGuideTypeSelectionDto {
  tourGuideType: 'freelancer' | 'employed';
}

export interface TourGuideFormState {
  tourGuideType: TourGuideType | '';
  nationalId: string;
  companyTIN: string;
  companyName: string;
  verificationDocument: File | null;
  employmentContract: File | null;
  uploadProgress: number;
  isUploading: boolean;
  documentError: string;
}

export interface UploadProfileImageDto {
  file: File;
}

export interface DeleteAccountDto {
  confirmation: string; // Must be "delete my account"
  password?: string; // For manual auth users
}

// --- COUNTRY/ADDRESS DATA ---
export interface CountryInfo {
  name: string;
  flag: string;
  code: string;
  addressFields: string[];
  states?: string[];
  provinces?: string[];
}

export interface CountryData {
  [key: string]: CountryInfo;
}

// --- API RESPONSES ---
export interface AuthResponse {
  user: UserInfo;
  accessToken: string;
  refreshToken: string;
  applicationId?: string; // For BecomeHost registration
  requiresDocumentUpload?: boolean;
  documentsToUpload?: DocumentType[];
}

export interface TourGuideLoginResponse extends AuthResponse {
  tourGuideType?: TourGuideType;
  documentVerificationStatus?: 'pending' | 'approved' | 'rejected' | 'none';
  missingDocuments?: DocumentType[];
}

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  errors?: string[];
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// --- SESSION MANAGEMENT ---
export interface UserSession {
  id: string;
  userId: string;
  device?: string;
  browser?: string;
  location?: string;
  ipAddress?: string;
  isActive: boolean;
  lastActivity: string;
  createdAt: string;
}

export interface RefreshTokenDto {
  refreshToken: string;
}

// --- TWO-FACTOR AUTHENTICATION ---
export interface EnableTwoFactorDto {
  password: string;
}

export interface VerifyTwoFactorDto {
  code: string;
  backupCode?: string;
}

export interface DisableTwoFactorDto {
  password: string;
  code: string;
}

// --- ACCOUNT VERIFICATION ---
export interface VerifyEmailDto {
  token: string;
}

export interface ResendVerificationDto {
  email: string;
}

// --- ADMIN/MANAGEMENT TYPES ---
export interface AdminUpdateUserDto {
  status?: string; // 'active' | 'inactive' | 'pending' | 'suspended' | 'unverified'
  userType?: string; // 'guest' | 'host' | 'tourguide' | 'agent' | 'admin'
  email?: string;
  name?: string;
}

export interface UserSearchFilters {
  status?: string; // 'active' | 'inactive' | 'pending' | 'suspended' | 'unverified'
  userType?: string; // 'guest' | 'host' | 'tourguide' | 'agent' | 'admin'
  country?: string;
  provider?: string; // 'manual' | 'google' | 'apple'
  search?: string; // Search by name or email
  dateFrom?: string;
  dateTo?: string;
}

// --- ERROR TYPES ---
export interface AuthError {
  code: string;
  message: string;
  field?: string;
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

// --- UTILITY TYPES ---
export type AuthProvider = string; // 'manual' | 'google' | 'apple' - stored as string in DB
export type UserStatus = string; // 'active' | 'inactive' | 'pending' | 'suspended' | 'unverified'
export type UserType = string; // 'guest' | 'host' | 'tourguide' | 'agent' | 'admin'
export type TourGuideType = 'freelancer' | 'employed';
export type DocumentType = 'national_id' | 'company_tin' | 'employment_contract';
export type AddressField = 'district' | 'sector' | 'street' | 'province' | 'state' | 'country' | 'city' | 'zipCode' | 'postalCode' | 'postcode' | 'pinCode' | 'eircode' | 'cep';

// --- KYC TYPES ---
export interface KYCPersonalDetails {
  fullName: string;
  dateOfBirth: string;
  nationality: string;
  // New granular address structure
  district: string;    // required
  sector: string;      // required
  street: string;      // required
  province: string;    // required
  state: string;       // required
  country: string;     // required
  phoneNumber: string;
  email: string;
  documentType: string;
}

export interface KYCSubmissionDto {
  personalDetails: KYCPersonalDetails;
  addressDocumentUrl?: string;
}

// --- FORM STATE TYPES ---
export interface PasswordFormState {
  current: string;
  new: string;
  confirm: string;
}

export interface ProfileFormState {
  isEditing: boolean;
  isLoading: boolean;
  errors: { [key: string]: string };
  uploadProgress?: number;
}

// Add these types to your auth.types.ts file

// --- ADMIN CRUD TYPES ---

// Admin-specific update DTO with additional fields
export interface AdminUpdateUserDto {
  status?: string; // 'active' | 'inactive' | 'pending' | 'suspended' | 'unverified'
  userType?: string; // 'guest' | 'host' | 'tourguide' | 'agent' | 'admin'
  email?: string;
  name?: string; // Full name that will be split into firstName/lastName
  firstName?: string;
  lastName?: string;
}

// Admin create user DTO (extends RegisterDto with admin-specific fields)
export interface AdminCreateUserDto extends RegisterDto {
  status?: string; // Admin can set initial status
  verificationStatus?: string;
  isVerified?: boolean;
}

// Admin suspend user DTO
export interface AdminSuspendUserDto {
  reason?: string;
}

// Admin password reset response
export interface AdminPasswordResetResponse {
  temporaryPassword: string;
}

// User statistics response
export interface UserStatistics {
  totalUsers: number;
  usersByType: Array<{
    type: string;
    count: number;
  }>;
  usersByStatus: Array<{
    status: string;
    count: number;
  }>;
  recentRegistrations: number;
}

// Admin action log (for future audit trail)
export interface AdminActionLog {
  id: string;
  adminId: number;
  adminEmail: string;
  action: 'create' | 'update' | 'delete' | 'suspend' | 'activate' | 'reset_password';
  targetUserId: number;
  targetUserEmail: string;
  details?: string;
  timestamp: string;
}

// Bulk operations (for future enhancement)
export interface BulkUserOperation {
  userIds: number[];
  action: 'suspend' | 'activate' | 'delete';
  reason?: string;
}

export interface BulkOperationResult {
  successful: number[];
  failed: Array<{
    userId: number;
    error: string;
  }>;
}

// Enhanced user search/filter options for admin
export interface AdminUserSearchFilters extends UserSearchFilters {
  id?: number;
  emailContains?: string;
  nameContains?: string;
  phoneContains?: string;
  registeredAfter?: string;
  registeredBefore?: string;
  lastLoginAfter?: string;
  lastLoginBefore?: string;
  hasPassword?: boolean;
  isVerified?: boolean;
  sortBy?: 'createdAt' | 'lastLogin' | 'email' | 'name' | 'userType' | 'status';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

// Admin dashboard summary
export interface AdminDashboardSummary {
  statistics: UserStatistics;
  recentActions: AdminActionLog[];
  pendingApprovals: number;
  suspendedAccounts: number;
  unverifiedAccounts: number;
  activeServiceProviders: {
    hosts: number;
    tourGuides: number;
    agents: number;
  };
}