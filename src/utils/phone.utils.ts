export interface PhoneValidationResult {
  isValid: boolean;
  formattedPhone?: string;
  provider?: 'MTN' | 'AIRTEL' | 'AIRTEL_TIGO';
  error?: string;
}

export class PhoneUtils {
  private static readonly RWANDA_COUNTRY_CODE = '250';
  // Valid Rwanda mobile prefixes: 078, 079 (MTN), 072 (Airtel-Tigo), 073 (Airtel)
  private static readonly RWANDA_PREFIXES = {
    MTN: ['078', '079'],
    AIRTEL: ['073'],
    AIRTEL_TIGO: ['072']
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
    } else if (cleaned.length === 9 && /^[78][27893]/.test(cleaned)) {
      // Handle database format: 781121117 (9 digits starting with 78, 79, 72, or 73)
      // This is likely missing the leading 0, so treat it as 0781121117
      localNumber = cleaned;
    } else {
      // Assume it's already the 9-digit local number
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

    // Detect provider - check both 3-digit prefix (078, 079, 072, 073)
    // and 2-digit prefix (78, 79, 72, 73) for database format
    let prefix = localNumber.substring(0, 3);
    let provider: 'MTN' | 'AIRTEL' | 'AIRTEL_TIGO' | undefined;

    // First, try standard 3-digit prefix (078, 079, 072, 073)
    for (const [providerName, prefixes] of Object.entries(this.RWANDA_PREFIXES)) {
      if (prefixes.includes(prefix)) {
        provider = providerName as 'MTN' | 'AIRTEL' | 'AIRTEL_TIGO';
        break;
      }
    }

    // If no match, check if it's the 2-digit database format (78, 79, 72, 73)
    if (!provider) {
      const twoDigitPrefix = '0' + localNumber.substring(0, 2);
      for (const [providerName, prefixes] of Object.entries(this.RWANDA_PREFIXES)) {
        if (prefixes.includes(twoDigitPrefix)) {
          provider = providerName as 'MTN' | 'AIRTEL' | 'AIRTEL_TIGO';
          // Don't modify localNumber here - it's already 9 digits
          break;
        }
      }
    }

    if (!provider) {
      return { isValid: false, error: 'Unknown mobile provider. Valid prefixes: 078, 079, 072, 073' };
    }

    // Format: remove leading 0 if present (local number should be 9 digits for international format)
    const nineDigitNumber = localNumber.startsWith('0') ? localNumber.substring(1) : localNumber;

    return {
      isValid: true,
      formattedPhone: `+${this.RWANDA_COUNTRY_CODE}${nineDigitNumber}`,
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
  static getProvider(phone: string): 'MTN' | 'AIRTEL' | 'AIRTEL_TIGO' | null {
    const validation = this.validateRwandaPhone(phone);
    return validation.provider || null;
  }
}
