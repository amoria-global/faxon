/**
 * Payment Settings Service
 * Wrapper around JamboLush Admin Settings for payment-specific operations
 * Provides caching and convenience methods for payment services
 */

import jamboLushAdminSettingsService from './jambolush-admin-settings.service';
import settingsCacheService from './settings-cache.service';
import {
  PaymentProvider,
  PaymentOperator,
  BusinessRule,
} from '../types/admin-settings.types';

export interface ProviderCredentials {
  apiKey: string;
  secretKey?: string;
  merchantId?: string;
  baseUrl: string;
  webhookUrl: string;
  webhookSecret?: string;
  timeout: number;
  retryAttempts: number;
  testMode: boolean;
}

export interface WithdrawalFeeTier {
  minAmount: number;
  maxAmount: number;
  feeAmount: number;
  tierName: string;
}

export interface WithdrawalLimits {
  minAmount: number;
  maxAmount: number;
  dailyLimit?: number;
  monthlyLimit?: number;
}

export interface CommissionSplits {
  hostPercentage: number;
  agentPercentage: number;
  platformPercentage: number;
  tourGuidePercentage: number;
  tourPlatformPercentage: number;
}

export class PaymentSettingsService {
  private providerTTL = 5 * 60 * 1000; // 5 minutes
  private operatorTTL = 5 * 60 * 1000; // 5 minutes
  private businessRulesTTL = 1 * 60 * 1000; // 1 minute

  /**
   * Get provider credentials with caching
   */
  async getProviderCredentials(
    providerId: string
  ): Promise<ProviderCredentials | null> {
    const cacheKey = `provider:${providerId}`;

    return await settingsCacheService.get(
      cacheKey,
      async () => {
        const provider =
          await jamboLushAdminSettingsService.getPaymentProvider(providerId);

        if (!provider || !provider.enabled) {
          return null;
        }

        return {
          apiKey: provider.credentials.apiKey,
          secretKey: provider.credentials.secretKey,
          merchantId: provider.credentials.merchantId,
          baseUrl: provider.config?.baseUrl || '',
          webhookUrl: provider.config?.webhookUrl || '',
          webhookSecret: provider.credentials.webhookSecret,
          timeout: provider.config?.timeout || 30000,
          retryAttempts: provider.config?.retryAttempts || 3,
          testMode: provider.testMode,
        };
      },
      this.providerTTL
    );
  }

  /**
   * Get all enabled providers
   */
  async getEnabledProviders(): Promise<PaymentProvider[]> {
    const cacheKey = 'providers:enabled';

    return await settingsCacheService.get(
      cacheKey,
      async () => {
        const allProviders =
          await jamboLushAdminSettingsService.getAllPaymentProviders();
        return allProviders.filter((p) => p.enabled);
      },
      this.providerTTL
    );
  }

  /**
   * Get operator by code with caching
   */
  async getOperator(operatorCode: string): Promise<PaymentOperator | null> {
    const cacheKey = `operator:${operatorCode}`;

    return await settingsCacheService.get(
      cacheKey,
      async () => {
        return await jamboLushAdminSettingsService.getOperator(operatorCode);
      },
      this.operatorTTL
    );
  }

  /**
   * Get enabled operators for a country
   */
  async getEnabledOperators(country?: string): Promise<PaymentOperator[]> {
    const cacheKey = country
      ? `operators:enabled:${country}`
      : 'operators:enabled:all';

    return await settingsCacheService.get(
      cacheKey,
      async () => {
        return await jamboLushAdminSettingsService.getAllOperators({
          country,
          enabled: true,
        });
      },
      this.operatorTTL
    );
  }

  /**
   * Get withdrawal fee tiers
   */
  async getWithdrawalFeeTiers(): Promise<WithdrawalFeeTier[]> {
    const cacheKey = 'business:withdrawal:fees';

    return await settingsCacheService.get(
      cacheKey,
      async () => {
        const financial =
          await jamboLushAdminSettingsService.getBusinessRule('financial');

        if (!financial || !financial.rules) {
          // Return default tiers in correct format
          return [
            {
              minAmount: 0,
              maxAmount: 1000000,
              feeAmount: 600,
              tierName: 'Tier 1 (Up to 1M RWF)'
            },
            {
              minAmount: 1000001,
              maxAmount: 5000000,
              feeAmount: 1200,
              tierName: 'Tier 2 (1M-5M RWF)'
            },
            {
              minAmount: 5000001,
              maxAmount: Infinity,
              feeAmount: 3000,
              tierName: 'Tier 3 (Above 5M RWF)'
            },
          ];
        }

        const rules = financial.rules as any;
        const tiers = rules.withdrawalFeeTiers;

        if (!tiers || !Array.isArray(tiers)) {
          return [
            {
              minAmount: 0,
              maxAmount: 1000000,
              feeAmount: 600,
              tierName: 'Tier 1 (Up to 1M RWF)'
            },
            {
              minAmount: 1000001,
              maxAmount: 5000000,
              feeAmount: 1200,
              tierName: 'Tier 2 (1M-5M RWF)'
            },
            {
              minAmount: 5000001,
              maxAmount: Infinity,
              feeAmount: 3000,
              tierName: 'Tier 3 (Above 5M RWF)'
            },
          ];
        }

        // Convert from database format to expected format
        return tiers.map((tier: any, index: number) => ({
          minAmount: tier.minAmount || 0,
          maxAmount: tier.maxAmount || Infinity,
          feeAmount: tier.fee || tier.feeAmount || 0,
          tierName: tier.tierName || `Tier ${index + 1}`,
        }));
      },
      this.businessRulesTTL
    );
  }

  /**
   * Get withdrawal limits
   */
  async getWithdrawalLimits(): Promise<WithdrawalLimits> {
    const cacheKey = 'business:withdrawal:limits';

    return await settingsCacheService.get(
      cacheKey,
      async () => {
        const financial =
          await jamboLushAdminSettingsService.getBusinessRule('financial');

        if (!financial || !financial.rules) {
          // Return defaults in RWF
          return {
            minAmount: 100, // 100 RWF minimum
            maxAmount: 50000000, // 50M RWF maximum
            dailyLimit: 20000000, // 20M RWF daily
            monthlyLimit: 100000000, // 100M RWF monthly
          };
        }

        const rules = financial.rules as any;
        return {
          minAmount: rules.minWithdrawal || 100,
          maxAmount: rules.maxWithdrawal || 50000000,
          dailyLimit: rules.dailyWithdrawalLimit || 20000000,
          monthlyLimit: rules.monthlyWithdrawalLimit || 100000000,
        };
      },
      this.businessRulesTTL
    );
  }

  /**
   * Get commission splits
   */
  async getCommissionSplits(): Promise<CommissionSplits> {
    const cacheKey = 'business:commission:splits';

    return await settingsCacheService.get(
      cacheKey,
      async () => {
        const commission =
          await jamboLushAdminSettingsService.getBusinessRule('commission');

        if (!commission || !commission.rules) {
          // Return defaults
          return {
            hostPercentage: 78.95,
            agentPercentage: 4.39,
            platformPercentage: 16.67,
            tourGuidePercentage: 84,
            tourPlatformPercentage: 16,
          };
        }

        const rules = commission.rules as any;
        return {
          hostPercentage: rules.hostSplit || 78.95,
          agentPercentage: rules.agentCommission || 4.39,
          platformPercentage: rules.platformCommission || 16.67,
          tourGuidePercentage: rules.tourGuideCommission || 84,
          tourPlatformPercentage: rules.tourPlatformFee || 16,
        };
      },
      this.businessRulesTTL
    );
  }

  /**
   * Get status polling intervals
   */
  async getPollingIntervals(): Promise<{
    pollIntervalMs: number;
    recheckIntervalMs: number;
    completedRecheckMs: number;
    maxAgeDays: number;
  }> {
    const cacheKey = 'business:polling:intervals';

    return await settingsCacheService.get(
      cacheKey,
      async () => {
        const system =
          await jamboLushAdminSettingsService.getBusinessRule('system');

        if (!system || !system.rules) {
          // Return defaults
          return {
            pollIntervalMs: 30 * 1000,
            recheckIntervalMs: 10 * 60 * 1000,
            completedRecheckMs: 2 * 60 * 1000,
            maxAgeDays: 30,
          };
        }

        const rules = system.rules as any;
        return {
          pollIntervalMs: rules.statusPollIntervalMs || 30 * 1000,
          recheckIntervalMs: rules.statusRecheckIntervalMs || 10 * 60 * 1000,
          completedRecheckMs:
            rules.completedTransactionRecheckMs || 2 * 60 * 1000,
          maxAgeDays: rules.transactionMaxAgeDays || 30,
        };
      },
      this.businessRulesTTL
    );
  }

  /**
   * Invalidate provider cache
   */
  invalidateProvider(providerId: string): void {
    settingsCacheService.invalidate(`provider:${providerId}`);
    settingsCacheService.invalidate('providers:enabled');
  }

  /**
   * Invalidate operator cache
   */
  invalidateOperator(operatorCode: string): void {
    settingsCacheService.invalidate(`operator:${operatorCode}`);
    settingsCacheService.invalidatePattern(/^operators:enabled:/);
  }

  /**
   * Invalidate all payment-related cache
   */
  invalidateAll(): void {
    settingsCacheService.invalidatePattern(/^(provider|operator|business):/);
  }

  /**
   * Get operator with fallback provider selection
   */
  async getOperatorWithProvider(
    operatorCode: string
  ): Promise<{
    operator: PaymentOperator;
    primaryProvider: ProviderCredentials | null;
    alternativeProvider: ProviderCredentials | null;
  } | null> {
    const operator = await this.getOperator(operatorCode);
    if (!operator || !operator.enabled) {
      return null;
    }

    const primary = operator.primaryProviderId
      ? await this.getProviderCredentials(operator.primaryProviderId)
      : null;

    const alternative = operator.alternativeProviderId
      ? await this.getProviderCredentials(operator.alternativeProviderId)
      : null;

    return {
      operator,
      primaryProvider: primary,
      alternativeProvider: alternative,
    };
  }

  /**
   * Check if provider is enabled and available
   */
  async isProviderAvailable(providerId: string): Promise<boolean> {
    const credentials = await this.getProviderCredentials(providerId);
    return credentials !== null;
  }

  /**
   * Check if operator is enabled
   */
  async isOperatorEnabled(operatorCode: string): Promise<boolean> {
    const operator = await this.getOperator(operatorCode);
    return operator !== null && operator.enabled;
  }
}

// Export singleton instance
export const paymentSettingsService = new PaymentSettingsService();
export default paymentSettingsService;
