export interface PhoneValidationResult {
  isValid: boolean;
  formattedPhone?: string;
  provider?: 'MTN' | 'AIRTEL' | 'TIGO';
  error?: string;
}

export class PhoneUtils {
  private static readonly RWANDA_COUNTRY_CODE = '250';
  private static readonly RWANDA_PREFIXES = {
    MTN: ['078', '079'],
    AIRTEL: ['073'],
    TIGO: ['072']
  };

  /**
   * Validate Rwanda phone number and detect provider
   */
  static validateRwandaPhone(phone: string): PhoneValidationResult {
    if (!phone) {
      return { isValid: false, error: 'Phone number is required' };
    }

    // Remove spaces and special characters
    const cleaned = phone.replace(/[\s\-\(\)]/g, '');

    // Check if it starts with +250 or 250
    let localNumber: string;
    if (cleaned.startsWith('+250')) {
      localNumber = cleaned.substring(4);
    } else if (cleaned.startsWith('250')) {
      localNumber = cleaned.substring(3);
    } else if (cleaned.startsWith('0')) {
      localNumber = cleaned.substring(1);
    } else {
      localNumber = cleaned;
    }

    // Validate length (should be 9 digits after country code)
    if (localNumber.length !== 9) {
      return { isValid: false, error: 'Invalid phone number length' };
    }

    // Validate it's all digits
    if (!/^\d+$/.test(localNumber)) {
      return { isValid: false, error: 'Phone number must contain only digits' };
    }

    // Detect provider
    const prefix = localNumber.substring(0, 3);
    let provider: 'MTN' | 'AIRTEL' | 'TIGO' | undefined;

    for (const [providerName, prefixes] of Object.entries(this.RWANDA_PREFIXES)) {
      if (prefixes.includes(prefix)) {
        provider = providerName as 'MTN' | 'AIRTEL' | 'TIGO';
        break;
      }
    }

    if (!provider) {
      return { isValid: false, error: 'Unknown mobile provider' };
    }

    return {
      isValid: true,
      formattedPhone: `+${this.RWANDA_COUNTRY_CODE}${localNumber}`,
      provider
    };
  }

  /**
   * Format phone number with or without country code
   */
  static formatPhone(phone: string, includeCountryCode: boolean = true): string {
    const validation = this.validateRwandaPhone(phone);
    if (!validation.isValid || !validation.formattedPhone) {
      return phone;
    }

    if (includeCountryCode) {
      return validation.formattedPhone;
    }

    // Return without country code (0XXXXXXXXX format)
    return '0' + validation.formattedPhone.substring(4);
  }

  /**
   * Get provider from phone number
   */
  static getProvider(phone: string): 'MTN' | 'AIRTEL' | 'TIGO' | null {
    const validation = this.validateRwandaPhone(phone);
    return validation.provider || null;
  }
}
