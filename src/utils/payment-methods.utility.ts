// src/utils/payment-methods.utility.ts
// Payment Methods and Mobile Money Providers Configuration

export interface MobileMoneyProvider {
  id: string;
  name: string;
  displayName: string;
  logo?: string;
  color?: string;
  countryCode: string;
  countryName: string;
  currency: string;
  pawaPayCode: string; // PawaPay provider code
  phoneFormat: string; // Example format for user guidance
  active: boolean;
  paymentProvider: 'xentripay' | 'pawapay'; // Which payment provider to use
}

export interface Country {
  code: string; // ISO 2-letter code
  name: string;
  flag: string; // Emoji flag
  currency: string;
  providers: MobileMoneyProvider[];
}

export interface PaymentMethod {
  id: string;
  name: string;
  displayName: string;
  description: string;
  icon: string; // Icon identifier for frontend
  color: string; // Brand color for UI
  available: boolean;
  countries?: Country[]; // For mobile money
}

/**
 * All mobile money providers by country
 *
 * Provider Routing:
 * - Xentripay: Rwanda only (MTN, Airtel)
 * - PawaPay: All other African countries (Kenya, Uganda, Tanzania, etc.)
 *
 * Based on PawaPay documentation: https://docs.pawapay.io/
 */
export const MOBILE_MONEY_PROVIDERS: MobileMoneyProvider[] = [
  // ========== RWANDA (via Xentripay) ==========
  {
    id: 'mtn_rw',
    name: 'MTN',
    displayName: 'MTN Mobile Money',
    logo: '🟡',
    color: '#FFCB05',
    countryCode: 'RW',
    countryName: 'Rwanda',
    currency: 'RWF',
    pawaPayCode: 'MTN_MOMO_RWA',
    phoneFormat: '078XXXXXXX or 079XXXXXXX',
    active: true,
    paymentProvider: 'xentripay' // Rwanda uses Xentripay
  },
  {
    id: 'airtel_rw',
    name: 'Airtel',
    displayName: 'Airtel Money',
    logo: '🔴',
    color: '#ED1C24',
    countryCode: 'RW',
    countryName: 'Rwanda',
    currency: 'RWF',
    pawaPayCode: 'AIRTEL_RWA',
    phoneFormat: '073XXXXXXX',
    active: true,
    paymentProvider: 'xentripay' // Rwanda uses Xentripay
  },

  // ========== KENYA (via PawaPay) ==========
  {
    id: 'mpesa_ke',
    name: 'M-Pesa',
    displayName: 'M-Pesa',
    logo: '🟢',
    color: '#00A651',
    countryCode: 'KE',
    countryName: 'Kenya',
    currency: 'KES',
    pawaPayCode: 'MPESA_KEN',
    phoneFormat: '07XXXXXXXX or 01XXXXXXXX',
    active: true,
    paymentProvider: 'pawapay'
  },
  {
    id: 'airtel_ke',
    name: 'Airtel',
    displayName: 'Airtel Money',
    logo: '🔴',
    color: '#ED1C24',
    countryCode: 'KE',
    countryName: 'Kenya',
    currency: 'KES',
    pawaPayCode: 'AIRTEL_KEN',
    phoneFormat: '07XXXXXXXX',
    active: true,
    paymentProvider: 'pawapay'
  },

  // ========== UGANDA (via PawaPay) ==========
  {
    id: 'mtn_ug',
    name: 'MTN',
    displayName: 'MTN Mobile Money',
    logo: '🟡',
    color: '#FFCB05',
    countryCode: 'UG',
    countryName: 'Uganda',
    currency: 'UGX',
    pawaPayCode: 'MTN_MOMO_UGA',
    phoneFormat: '077XXXXXXX or 078XXXXXXX',
    active: true,
    paymentProvider: 'pawapay'
  },
  {
    id: 'airtel_ug',
    name: 'Airtel',
    displayName: 'Airtel Money',
    logo: '🔴',
    color: '#ED1C24',
    countryCode: 'UG',
    countryName: 'Uganda',
    currency: 'UGX',
    pawaPayCode: 'AIRTEL_UGA',
    phoneFormat: '070XXXXXXX or 075XXXXXXX',
    active: true,
    paymentProvider: 'pawapay'
  },

  // ========== TANZANIA (via PawaPay) ==========
  {
    id: 'vodacom_tz',
    name: 'Vodacom',
    displayName: 'M-Pesa (Vodacom)',
    logo: '🔴',
    color: '#E60000',
    countryCode: 'TZ',
    countryName: 'Tanzania',
    currency: 'TZS',
    pawaPayCode: 'VODACOM_TZA',
    phoneFormat: '074XXXXXXX or 075XXXXXXX',
    active: true,
    paymentProvider: 'pawapay'
  },
  {
    id: 'tigo_tz',
    name: 'Tigo',
    displayName: 'Tigo Pesa',
    logo: '🔵',
    color: '#0066B2',
    countryCode: 'TZ',
    countryName: 'Tanzania',
    currency: 'TZS',
    pawaPayCode: 'TIGO_TZA',
    phoneFormat: '071XXXXXXX or 065XXXXXXX',
    active: true,
    paymentProvider: 'pawapay'
  },
  {
    id: 'airtel_tz',
    name: 'Airtel',
    displayName: 'Airtel Money',
    logo: '🔴',
    color: '#ED1C24',
    countryCode: 'TZ',
    countryName: 'Tanzania',
    currency: 'TZS',
    pawaPayCode: 'AIRTEL_TZA',
    phoneFormat: '068XXXXXXX or 069XXXXXXX',
    active: true,
    paymentProvider: 'pawapay'
  },
  {
    id: 'halopesa_tz',
    name: 'HaloPesa',
    displayName: 'HaloPesa',
    logo: '🟣',
    color: '#7B2CBF',
    countryCode: 'TZ',
    countryName: 'Tanzania',
    currency: 'TZS',
    pawaPayCode: 'HALOPESA_TZA',
    phoneFormat: '062XXXXXXX',
    active: true,
    paymentProvider: 'pawapay'
  },

  // ========== ZAMBIA ==========
  {
    id: 'mtn_zm',
    name: 'MTN',
    displayName: 'MTN Mobile Money',
    logo: '🟡',
    color: '#FFCB05',
    countryCode: 'ZM',
    countryName: 'Zambia',
    currency: 'ZMW',
    pawaPayCode: 'MTN_MOMO_ZMB',
    phoneFormat: '096XXXXXXX or 076XXXXXXX',
    active: true,
    paymentProvider: 'pawapay'
  },
  {
    id: 'airtel_zm',
    name: 'Airtel',
    displayName: 'Airtel Money',
    logo: '🔴',
    color: '#ED1C24',
    countryCode: 'ZM',
    countryName: 'Zambia',
    currency: 'ZMW',
    pawaPayCode: 'AIRTEL_ZMB',
    phoneFormat: '097XXXXXXX or 077XXXXXXX',
    active: true,
    paymentProvider: 'pawapay'
  },
  {
    id: 'zamtel_zm',
    name: 'Zamtel',
    displayName: 'Zamtel Money',
    logo: '🟢',
    color: '#00A651',
    countryCode: 'ZM',
    countryName: 'Zambia',
    currency: 'ZMW',
    pawaPayCode: 'ZAMTEL_ZMB',
    phoneFormat: '095XXXXXXX',
    active: true,
    paymentProvider: 'pawapay'
  },

  // ========== GHANA ==========
  {
    id: 'mtn_gh',
    name: 'MTN',
    displayName: 'MTN Mobile Money',
    logo: '🟡',
    color: '#FFCB05',
    countryCode: 'GH',
    countryName: 'Ghana',
    currency: 'GHS',
    pawaPayCode: 'MTN_MOMO_GHA',
    phoneFormat: '024XXXXXXX or 054XXXXXXX',
    active: true,
    paymentProvider: 'pawapay'
  },
  {
    id: 'vodafone_gh',
    name: 'Vodafone',
    displayName: 'Vodafone Cash',
    logo: '🔴',
    color: '#E60000',
    countryCode: 'GH',
    countryName: 'Ghana',
    currency: 'GHS',
    pawaPayCode: 'VODAFONE_GHA',
    phoneFormat: '020XXXXXXX or 050XXXXXXX',
    active: true,
    paymentProvider: 'pawapay'
  },
  {
    id: 'airteltigo_gh',
    name: 'AirtelTigo',
    displayName: 'AirtelTigo Money',
    logo: '🔴',
    color: '#ED1C24',
    countryCode: 'GH',
    countryName: 'Ghana',
    currency: 'GHS',
    pawaPayCode: 'AIRTELTIGO_GHA',
    phoneFormat: '027XXXXXXX or 057XXXXXXX',
    active: true,
    paymentProvider: 'pawapay'
  },

  // ========== SENEGAL ==========
  {
    id: 'orange_sn',
    name: 'Orange',
    displayName: 'Orange Money',
    logo: '🟠',
    color: '#FF7900',
    countryCode: 'SN',
    countryName: 'Senegal',
    currency: 'XOF',
    pawaPayCode: 'ORANGE_SEN',
    phoneFormat: '77XXXXXXX or 78XXXXXXX',
    active: true,
    paymentProvider: 'pawapay'
  },
  {
    id: 'free_sn',
    name: 'Free',
    displayName: 'Free Money',
    logo: '🔴',
    color: '#D5001C',
    countryCode: 'SN',
    countryName: 'Senegal',
    currency: 'XOF',
    pawaPayCode: 'FREE_SEN',
    phoneFormat: '76XXXXXXX',
    active: true,
    paymentProvider: 'pawapay'
  },
  {
    id: 'wave_sn',
    name: 'Wave',
    displayName: 'Wave',
    logo: '💙',
    color: '#00C9FF',
    countryCode: 'SN',
    countryName: 'Senegal',
    currency: 'XOF',
    pawaPayCode: 'WAVE_SEN',
    phoneFormat: '70XXXXXXX',
    active: true,
    paymentProvider: 'pawapay'
  },

  // ========== IVORY COAST (CÔTE D'IVOIRE) ==========
  {
    id: 'orange_ci',
    name: 'Orange',
    displayName: 'Orange Money',
    logo: '🟠',
    color: '#FF7900',
    countryCode: 'CI',
    countryName: 'Ivory Coast',
    currency: 'XOF',
    pawaPayCode: 'ORANGE_CIV',
    phoneFormat: '07XXXXXXXX or 05XXXXXXXX',
    active: true,
    paymentProvider: 'pawapay'
  },
  {
    id: 'mtn_ci',
    name: 'MTN',
    displayName: 'MTN Mobile Money',
    logo: '🟡',
    color: '#FFCB05',
    countryCode: 'CI',
    countryName: 'Ivory Coast',
    currency: 'XOF',
    pawaPayCode: 'MTN_MOMO_CIV',
    phoneFormat: '05XXXXXXXX or 07XXXXXXXX',
    active: true,
    paymentProvider: 'pawapay'
  },
  {
    id: 'moov_ci',
    name: 'Moov',
    displayName: 'Moov Money',
    logo: '🔵',
    color: '#009CDE',
    countryCode: 'CI',
    countryName: 'Ivory Coast',
    currency: 'XOF',
    pawaPayCode: 'MOOV_CIV',
    phoneFormat: '01XXXXXXXX',
    active: true,
    paymentProvider: 'pawapay'
  },
  {
    id: 'wave_ci',
    name: 'Wave',
    displayName: 'Wave',
    logo: '💙',
    color: '#00C9FF',
    countryCode: 'CI',
    countryName: 'Ivory Coast',
    currency: 'XOF',
    pawaPayCode: 'WAVE_CIV',
    phoneFormat: '05XXXXXXXX',
    active: true,
    paymentProvider: 'pawapay'
  },

  // ========== BENIN ==========
  {
    id: 'mtn_bj',
    name: 'MTN',
    displayName: 'MTN Mobile Money',
    logo: '🟡',
    color: '#FFCB05',
    countryCode: 'BJ',
    countryName: 'Benin',
    currency: 'XOF',
    pawaPayCode: 'MTN_MOMO_BEN',
    phoneFormat: '96XXXXXX or 97XXXXXX',
    active: true,
    paymentProvider: 'pawapay'
  },
  {
    id: 'moov_bj',
    name: 'Moov',
    displayName: 'Moov Money',
    logo: '🔵',
    color: '#009CDE',
    countryCode: 'BJ',
    countryName: 'Benin',
    currency: 'XOF',
    pawaPayCode: 'MOOV_BEN',
    phoneFormat: '97XXXXXX',
    active: true,
    paymentProvider: 'pawapay'
  },

  // ========== BURKINA FASO ==========
  {
    id: 'orange_bf',
    name: 'Orange',
    displayName: 'Orange Money',
    logo: '🟠',
    color: '#FF7900',
    countryCode: 'BF',
    countryName: 'Burkina Faso',
    currency: 'XOF',
    pawaPayCode: 'ORANGE_BFA',
    phoneFormat: '07XXXXXXXX',
    active: true,
    paymentProvider: 'pawapay'
  },
  {
    id: 'moov_bf',
    name: 'Moov',
    displayName: 'Moov Money',
    logo: '🔵',
    color: '#009CDE',
    countryCode: 'BF',
    countryName: 'Burkina Faso',
    currency: 'XOF',
    pawaPayCode: 'MOOV_BFA',
    phoneFormat: '01XXXXXXXX',
    active: true,
    paymentProvider: 'pawapay'
  },

  // ========== CAMEROON ==========
  {
    id: 'orange_cm',
    name: 'Orange',
    displayName: 'Orange Money',
    logo: '🟠',
    color: '#FF7900',
    countryCode: 'CM',
    countryName: 'Cameroon',
    currency: 'XAF',
    pawaPayCode: 'ORANGE_CMR',
    phoneFormat: '6XXXXXXXX',
    active: true,
    paymentProvider: 'pawapay'
  },
  {
    id: 'mtn_cm',
    name: 'MTN',
    displayName: 'MTN Mobile Money',
    logo: '🟡',
    color: '#FFCB05',
    countryCode: 'CM',
    countryName: 'Cameroon',
    currency: 'XAF',
    pawaPayCode: 'MTN_MOMO_CMR',
    phoneFormat: '6XXXXXXXX',
    active: true,
    paymentProvider: 'pawapay'
  }
];

/**
 * Group providers by country
 */
export function getCountriesWithProviders(): Country[] {
  const countryMap = new Map<string, Country>();

  MOBILE_MONEY_PROVIDERS.forEach(provider => {
    if (!countryMap.has(provider.countryCode)) {
      countryMap.set(provider.countryCode, {
        code: provider.countryCode,
        name: provider.countryName,
        flag: getCountryFlag(provider.countryCode),
        currency: provider.currency,
        providers: []
      });
    }
    countryMap.get(provider.countryCode)!.providers.push(provider);
  });

  return Array.from(countryMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Get country flag emoji
 */
function getCountryFlag(countryCode: string): string {
  const flags: Record<string, string> = {
    'RW': '🇷🇼',
    'KE': '🇰🇪',
    'UG': '🇺🇬',
    'TZ': '🇹🇿',
    'ZM': '🇿🇲',
    'GH': '🇬🇭',
    'SN': '🇸🇳',
    'CI': '🇨🇮',
    'BJ': '🇧🇯',
    'BF': '🇧🇫',
    'CM': '🇨🇲'
  };
  return flags[countryCode] || '🌍';
}

/**
 * Get all available payment methods
 */
export function getPaymentMethods(): PaymentMethod[] {
  return [
    {
      id: 'mobile_money',
      name: 'Mobile Money',
      displayName: 'Mobile Money',
      description: 'Pay with MTN, Airtel, M-Pesa, Orange Money, and more',
      icon: '📱',
      color: '#10B981', // Green
      available: true,
      countries: getCountriesWithProviders()
    },
    {
      id: 'card',
      name: 'Card',
      displayName: 'Credit/Debit Card',
      description: 'Pay with Visa, Mastercard, or American Express',
      icon: '💳',
      color: '#3B82F6', // Blue
      available: true
    },
    {
      id: 'crypto',
      name: 'Crypto',
      displayName: 'Cryptocurrency',
      description: 'Pay with Bitcoin, Ethereum, USDT (Coming Soon)',
      icon: '₿',
      color: '#F59E0B', // Orange
      available: false // Coming soon
    },
    {
      id: 'wire',
      name: 'Wire Transfer',
      displayName: 'Bank Transfer',
      description: 'Direct bank transfer (Coming Soon)',
      icon: '🏦',
      color: '#6366F1', // Indigo
      available: false // Coming soon
    }
  ];
}

/**
 * Get provider by ID
 */
export function getProviderById(providerId: string): MobileMoneyProvider | undefined {
  return MOBILE_MONEY_PROVIDERS.find(p => p.id === providerId);
}

/**
 * Get providers by country code
 */
export function getProvidersByCountry(countryCode: string): MobileMoneyProvider[] {
  return MOBILE_MONEY_PROVIDERS.filter(p => p.countryCode === countryCode && p.active);
}

/**
 * Get PawaPay provider code from provider ID
 */
export function getPawaPayCode(providerId: string): string | undefined {
  const provider = getProviderById(providerId);
  return provider?.pawaPayCode;
}

/**
 * Get providers by payment provider (xentripay or pawapay)
 */
export function getProvidersByPaymentProvider(paymentProvider: 'xentripay' | 'pawapay'): MobileMoneyProvider[] {
  return MOBILE_MONEY_PROVIDERS.filter(p => p.paymentProvider === paymentProvider && p.active);
}

/**
 * Get Xentripay providers (Rwanda only: MTN, Airtel)
 */
export function getXentripayProviders(): MobileMoneyProvider[] {
  return getProvidersByPaymentProvider('xentripay');
}

/**
 * Get PawaPay providers (All Africa except Rwanda)
 */
export function getPawapayProviders(): MobileMoneyProvider[] {
  return getProvidersByPaymentProvider('pawapay');
}

/**
 * Check if a provider uses Xentripay or PawaPay
 */
export function getPaymentProviderForId(providerId: string): 'xentripay' | 'pawapay' | undefined {
  const provider = getProviderById(providerId);
  return provider?.paymentProvider;
}
