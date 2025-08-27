// --- AUTHENTICATION DTOs ---
export interface RegisterDto {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  phone?: string;
  phoneCountryCode?: string;
  country?: string;
  userType?: 'host' | 'field agent';
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
  email: string;
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
  firstName?: string; // For backward compatibility
  lastName?: string;  // For backward compatibility
  phone?: string;
  phoneCountryCode?: string;
  profile?: string; // Profile image URL
  country?: string;
  state?: string;
  province?: string;
  city?: string;
  street?: string;
  zipCode?: string;
  postalCode?: string;
  postcode?: string;
  pinCode?: string;
  eircode?: string;
  cep?: string;
  status?: 'active' | 'inactive' | 'pending' | 'suspended';
  userType?: 'host' | 'field agent';
  provider?: 'manual' | 'google' | 'apple';
  providerId?: string;
  created_at: string;
  updated_at: string;
  last_login?: string;
  total_sessions?: number;
  twoFactorEnabled?: boolean;
}

export interface UpdateUserProfileDto {
  name?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  phoneCountryCode?: string;
  country?: string;
  state?: string;
  province?: string;
  city?: string;
  street?: string;
  zipCode?: string;
  postalCode?: string;
  postcode?: string;
  pinCode?: string;
  eircode?: string;
  cep?: string;
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
  status?: 'active' | 'inactive' | 'pending' | 'suspended';
  userType?: 'host' | 'field agent';
  email?: string;
  name?: string;
}

export interface UserSearchFilters {
  status?: 'active' | 'inactive' | 'pending' | 'suspended';
  userType?: 'host' | 'field agent';
  country?: string;
  provider?: 'manual' | 'google' | 'apple';
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
export type AuthProvider = 'manual' | 'google' | 'apple';
export type UserStatus = 'active' | 'inactive' | 'pending' | 'suspended';
export type UserType = 'host' | 'field agent';
export type AddressField = 'street' | 'city' | 'state' | 'province' | 'zipCode' | 'postalCode' | 'postcode' | 'pinCode' | 'eircode' | 'cep';

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