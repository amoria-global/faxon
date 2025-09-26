// src/types/settings.types.ts
export interface NotificationSettings {
  // Communication Channels
  sms: boolean;
  email: boolean;
  pushNotifications: boolean;

  // Notification Types
  marketingEmails: boolean;
  propertyAlerts: boolean;
  priceDropAlerts: boolean;
  bookingUpdates: boolean;
  securityAlerts: boolean;
  systemNotifications: boolean;

  // Communication Preferences
  preferredChannel: 'email' | 'sms' | 'both';
  quietHours: {
    enabled: boolean;
    startTime: string; // "22:00"
    endTime: string;   // "08:00"
    timezone: string;
  };
}

export interface SecuritySettings {
  // Two-Factor Authentication
  twoFactorEnabled: boolean;
  twoFactorMethod: 'sms' | 'email' | 'authenticator';

  // Account Security
  loginNotifications: boolean;
  passwordChangeNotifications: boolean;
  suspiciousActivityAlerts: boolean;

  // Session Management
  sessionTimeout: number; // in minutes
  maxActiveSessions: number;

  // Privacy
  profileVisibility: 'public' | 'private' | 'friends';
  dataSharing: boolean;
  analyticsOptOut: boolean;
}

export interface GeneralSettings {
  // Language & Region
  language: string;
  timezone: string;
  currency: string;
  dateFormat: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD';
  timeFormat: '12h' | '24h';

  // Account Preferences
  accountDeactivated: boolean;
  dataProcessingConsent: boolean;
  marketingConsent: boolean;

  // Display Preferences
  compactMode: boolean;
  showActivityStatus: boolean;
}

export interface AppearanceSettings {
  theme: 'light' | 'dark' | 'auto';
  fontSize: 'small' | 'medium' | 'large';
  compactMode: boolean;
  colorScheme: string;
  customTheme?: {
    primaryColor: string;
    secondaryColor: string;
    backgroundColor: string;
    textColor: string;
  };
}

export interface UserSettings {
  id?: string;
  userId: number;
  notifications: NotificationSettings;
  security: SecuritySettings;
  general: GeneralSettings;
  appearance: AppearanceSettings;
  createdAt?: string;
  updatedAt?: string;
}

export interface UpdateSettingsDto {
  notifications?: Partial<NotificationSettings>;
  security?: Partial<SecuritySettings>;
  general?: Partial<GeneralSettings>;
  appearance?: Partial<AppearanceSettings>;
}

export interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface VerificationRequest {
  type: 'email' | 'phone';
  code?: string;
}

export interface AccountVerification {
  emailVerified: boolean;
  phoneVerified: boolean;
  emailVerifiedAt?: string;
  phoneVerifiedAt?: string;
  lastEmailVerificationSent?: string;
  lastPhoneVerificationSent?: string;
}

export interface ConnectedAccount {
  id: string;
  provider: 'google' | 'apple' | 'facebook' | 'microsoft';
  email: string;
  connected: boolean;
  connectedAt?: string;
  lastUsed?: string;
}

export interface SettingsResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  errors?: string[];
  code?: 'RATE_LIMITED' | 'DAILY_LIMIT_EXCEEDED' | 'INVALID_CODE' | 'VERIFICATION_FAILED' | 'INVALID_CURRENT_PASSWORD';
}

export interface BackendResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  errors?: string[];
  code?: string;
}

export interface VerificationCodeResponse {
  success: boolean;
  data: {
    sent: boolean;
    destination: string;
    expiresIn: number;
    attemptsRemaining: number;
    cooldownUntil?: string;
  };
  message: string;
  code?: 'RATE_LIMITED' | 'DAILY_LIMIT_EXCEEDED';
}

export interface ConnectAccountDto {
  provider: 'google';
  accessToken: string;
  email: string;
}

export interface DeleteAccountDto {
  password: string;
  reason?: string;
}