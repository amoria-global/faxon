// types/withdrawal-providers.types.ts - Rwanda Bank and Mobile Money Provider Definitions

/**
 * Rwanda Bank and Mobile Money Provider Types
 * Based on provider's supported payment methods
 */

export interface WithdrawalProvider {
  id: string;
  code: string;
  name: string;
  type: 'BANK' | 'MOBILE_MONEY';
  country: string;
  currency: string;
  active: boolean;
  accountFormat?: {
    label: string;
    placeholder: string;
    pattern?: string;
    example: string;
    minLength?: number;
    maxLength?: number;
  };
  fees?: {
    withdrawalFee?: string;
    note?: string;
  };
  logo?: string;
  color?: string;
}

/**
 * Bank Codes - Rwanda Banks supported by the provider
 */
export const RWANDA_BANKS = {
  // Banks
  INVESTMENT_MORTGAGE_BANK: '010',
  BANQUE_DE_KIGALI: '040',
  GTB_RWANDA: '070',
  NATIONAL_COMMERCIAL_BANK: '025',
  ECOBANK_RWANDA: '100',
  ACCESS_BANK_RWANDA: '115',
  URWEGO_OPPORTUNITY_BANK: '145',
  EQUITY_BANK: '192',
  BANQUE_POPULAIRE_RWANDA: '400',
  ZIGAMA_CSS: '800',
  BANK_OF_AFRICA_RWANDA: '900',
  UNGUKA_BANK: '950',
  BANQUE_NATIONALE_RWANDA: '951',
} as const;

/**
 * Mobile Money Provider Codes - Rwanda Mobile Money supported by the provider
 */
export const RWANDA_MOBILE_MONEY = {
  MTN_MOBILE_MONEY: '63510',
  AIRTEL_RWANDA: '63514',
  SPENN: '63509',
} as const;

/**
 * All Rwanda withdrawal provider codes
 */
export const RWANDA_WITHDRAWAL_PROVIDERS = {
  ...RWANDA_BANKS,
  ...RWANDA_MOBILE_MONEY,
} as const;

/**
 * Detailed provider information for Rwanda Banks
 */
export const RWANDA_BANK_PROVIDERS: WithdrawalProvider[] = [
  {
    id: 'investment_mortgage_bank',
    code: '010',
    name: 'Investment and Mortgage Bank',
    type: 'BANK',
    country: 'RWA',
    currency: 'RWF',
    active: true,
    accountFormat: {
      label: 'Bank Account Number',
      placeholder: 'Enter your IMB account number',
      example: '1234567890123',
      minLength: 10,
      maxLength: 16,
    },
  },
  {
    id: 'banque_de_kigali',
    code: '040',
    name: 'Banque de Kigali',
    type: 'BANK',
    country: 'RWA',
    currency: 'RWF',
    active: true,
    accountFormat: {
      label: 'BK Account Number',
      placeholder: 'Enter your BK account number',
      example: '1234567890',
      minLength: 10,
      maxLength: 16,
    },
    logo: 'https://www.bk.rw/img/logo.png',
    color: '#00529B',
  },
  {
    id: 'gtb_rwanda',
    code: '070',
    name: 'Guaranty Trust Bank (Rwanda)',
    type: 'BANK',
    country: 'RWA',
    currency: 'RWF',
    active: true,
    accountFormat: {
      label: 'GTBank Account Number',
      placeholder: 'Enter your GTBank account number',
      example: '1234567890',
      minLength: 10,
      maxLength: 16,
    },
    color: '#FF6600',
  },
  {
    id: 'ncba_rwanda',
    code: '025',
    name: 'National Commercial Bank of Africa',
    type: 'BANK',
    country: 'RWA',
    currency: 'RWF',
    active: true,
    accountFormat: {
      label: 'NCBA Account Number',
      placeholder: 'Enter your NCBA account number',
      example: '1234567890',
      minLength: 10,
      maxLength: 16,
    },
  },
  {
    id: 'ecobank_rwanda',
    code: '100',
    name: 'Ecobank Rwanda',
    type: 'BANK',
    country: 'RWA',
    currency: 'RWF',
    active: true,
    accountFormat: {
      label: 'Ecobank Account Number',
      placeholder: 'Enter your Ecobank account number',
      example: '1234567890',
      minLength: 10,
      maxLength: 16,
    },
    color: '#003D7A',
  },
  {
    id: 'access_bank_rwanda',
    code: '115',
    name: 'Access Bank Rwanda',
    type: 'BANK',
    country: 'RWA',
    currency: 'RWF',
    active: true,
    accountFormat: {
      label: 'Access Bank Account Number',
      placeholder: 'Enter your Access Bank account number',
      example: '1234567890',
      minLength: 10,
      maxLength: 16,
    },
    color: '#E97730',
  },
  {
    id: 'urwego_opportunity_bank',
    code: '145',
    name: 'Urwego Opportunity Bank',
    type: 'BANK',
    country: 'RWA',
    currency: 'RWF',
    active: true,
    accountFormat: {
      label: 'Urwego Bank Account Number',
      placeholder: 'Enter your Urwego account number',
      example: '1234567890',
      minLength: 10,
      maxLength: 16,
    },
  },
  {
    id: 'equity_bank',
    code: '192',
    name: 'Equity Bank',
    type: 'BANK',
    country: 'RWA',
    currency: 'RWF',
    active: true,
    accountFormat: {
      label: 'Equity Bank Account Number',
      placeholder: 'Enter your Equity Bank account number',
      example: '1234567890',
      minLength: 10,
      maxLength: 16,
    },
    color: '#D32F2F',
  },
  {
    id: 'banque_populaire_rwanda',
    code: '400',
    name: 'Banque Populaire du Rwanda',
    type: 'BANK',
    country: 'RWA',
    currency: 'RWF',
    active: true,
    accountFormat: {
      label: 'BPR Account Number',
      placeholder: 'Enter your BPR account number',
      example: '1234567890',
      minLength: 10,
      maxLength: 16,
    },
    color: '#00A859',
  },
  {
    id: 'zigama_css',
    code: '800',
    name: 'Zigama Credit and Savings Scheme',
    type: 'BANK',
    country: 'RWA',
    currency: 'RWF',
    active: true,
    accountFormat: {
      label: 'Zigama CSS Account Number',
      placeholder: 'Enter your Zigama account number',
      example: '1234567890',
      minLength: 10,
      maxLength: 16,
    },
  },
  {
    id: 'bank_of_africa_rwanda',
    code: '900',
    name: 'Bank of Africa Rwanda',
    type: 'BANK',
    country: 'RWA',
    currency: 'RWF',
    active: true,
    accountFormat: {
      label: 'BOA Account Number',
      placeholder: 'Enter your BOA account number',
      example: '1234567890',
      minLength: 10,
      maxLength: 16,
    },
    color: '#003D7A',
  },
  {
    id: 'unguka_bank',
    code: '950',
    name: 'Unguka Bank',
    type: 'BANK',
    country: 'RWA',
    currency: 'RWF',
    active: true,
    accountFormat: {
      label: 'Unguka Bank Account Number',
      placeholder: 'Enter your Unguka account number',
      example: '1234567890',
      minLength: 10,
      maxLength: 16,
    },
  },
  {
    id: 'banque_nationale_rwanda',
    code: '951',
    name: 'Banque Nationale du Rwanda',
    type: 'BANK',
    country: 'RWA',
    currency: 'RWF',
    active: true,
    accountFormat: {
      label: 'BNR Account Number',
      placeholder: 'Enter your BNR account number',
      example: '1234567890',
      minLength: 10,
      maxLength: 16,
    },
  },
];

/**
 * Detailed provider information for Rwanda Mobile Money
 */
export const RWANDA_MOBILE_MONEY_PROVIDERS: WithdrawalProvider[] = [
  {
    id: 'mtn_mobile_money',
    code: '63510',
    name: 'MTN Mobile Money',
    type: 'MOBILE_MONEY',
    country: 'RWA',
    currency: 'RWF',
    active: true,
    accountFormat: {
      label: 'MTN Mobile Money Number',
      placeholder: '078XXXXXXX or 079XXXXXXX',
      pattern: '^(078|079)[0-9]{7}$',
      example: '0788123456',
      minLength: 10,
      maxLength: 10,
    },
    fees: {
      withdrawalFee: '0%',
      note: 'Fees may apply based on transaction amount',
    },
    logo: 'https://www.mtn.co.rw/wp-content/uploads/2021/01/mtn-logo.png',
    color: '#FFCB05',
  },
  {
    id: 'airtel_rwanda',
    code: '63514',
    name: 'Airtel Rwanda',
    type: 'MOBILE_MONEY',
    country: 'RWA',
    currency: 'RWF',
    active: true,
    accountFormat: {
      label: 'Airtel Money Number',
      placeholder: '073XXXXXXX',
      pattern: '^(073)[0-9]{7}$',
      example: '0731234567',
      minLength: 10,
      maxLength: 10,
    },
    fees: {
      withdrawalFee: '0%',
      note: 'Fees may apply based on transaction amount',
    },
    logo: 'https://www.airtel.in/static-assets/new-home/img/brand-logo.png',
    color: '#ED1C24',
  },
  {
    id: 'spenn',
    code: '63509',
    name: 'SPENN',
    type: 'MOBILE_MONEY',
    country: 'RWA',
    currency: 'RWF',
    active: true,
    accountFormat: {
      label: 'SPENN Phone Number',
      placeholder: '07XXXXXXXX',
      pattern: '^(07)[0-9]{8}$',
      example: '0781234567',
      minLength: 10,
      maxLength: 10,
    },
    fees: {
      withdrawalFee: '0%',
      note: 'Fees may apply based on transaction amount',
    },
    color: '#00A859',
  },
];

/**
 * All Rwanda withdrawal providers (banks + mobile money)
 */
export const ALL_RWANDA_WITHDRAWAL_PROVIDERS: WithdrawalProvider[] = [
  ...RWANDA_BANK_PROVIDERS,
  ...RWANDA_MOBILE_MONEY_PROVIDERS,
];

/**
 * Helper function to get provider by code
 */
export function getProviderByCode(code: string): WithdrawalProvider | undefined {
  return ALL_RWANDA_WITHDRAWAL_PROVIDERS.find(p => p.code === code);
}

/**
 * Helper function to get provider by ID
 */
export function getProviderById(id: string): WithdrawalProvider | undefined {
  return ALL_RWANDA_WITHDRAWAL_PROVIDERS.find(p => p.id === id);
}

/**
 * Helper function to get all banks
 */
export function getBankProviders(): WithdrawalProvider[] {
  return ALL_RWANDA_WITHDRAWAL_PROVIDERS.filter(p => p.type === 'BANK');
}

/**
 * Helper function to get all mobile money providers
 */
export function getMobileMoneyProviders(): WithdrawalProvider[] {
  return ALL_RWANDA_WITHDRAWAL_PROVIDERS.filter(p => p.type === 'MOBILE_MONEY');
}

/**
 * Helper function to validate account number format
 */
export function validateAccountNumber(providerCode: string, accountNumber: string): boolean {
  const provider = getProviderByCode(providerCode);
  if (!provider || !provider.accountFormat) return false;

  const { pattern, minLength, maxLength } = provider.accountFormat;

  // Check length
  if (minLength && accountNumber.length < minLength) return false;
  if (maxLength && accountNumber.length > maxLength) return false;

  // Check pattern if provided
  if (pattern) {
    const regex = new RegExp(pattern);
    return regex.test(accountNumber);
  }

  return true;
}

/**
 * Type for withdrawal method data
 */
export interface WithdrawalMethodData {
  methodType: 'BANK' | 'MOBILE_MONEY';
  providerCode: string;
  accountName: string;
  accountNumber: string;
  bankName?: string; // Optional, will be populated from provider
  phoneNumber?: string; // For mobile money
}
