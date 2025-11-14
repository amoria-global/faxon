/**
 * Operator Resolver Service
 * Smart routing for payment operations based on operator availability,
 * priority, and failover configuration
 */

import { logger } from '../utils/logger';
import paymentSettingsService from './payment-settings.service';
import { PaymentOperator } from '../types/admin-settings.types';

export interface OperatorResolution {
  operator: PaymentOperator;
  providerId: string;
  isPrimary: boolean;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

export interface OperatorSelectionCriteria {
  country: string;
  operationType: 'deposit' | 'payout' | 'refund';
  amount?: number;
  currency?: string;
  preferredOperatorCode?: string;
  excludeOperatorCodes?: string[];
}

export class OperatorResolverService {
  /**
   * Resolve the best operator for a given operation
   * Implements smart routing with failover
   */
  async resolveOperator(
    criteria: OperatorSelectionCriteria
  ): Promise<OperatorResolution | null> {
    try {
      logger.info('Resolving operator', 'OperatorResolverService', criteria);

      // Get all enabled operators for the country
      const operators = await paymentSettingsService.getEnabledOperators(
        criteria.country
      );

      if (!operators || operators.length === 0) {
        logger.warn('No operators available for country', 'OperatorResolverService', {
          country: criteria.country,
        });
        return null;
      }

      // Filter operators by supported operation type
      const supportedOperators = operators.filter((op) => {
        const operations = op.supportedOperations as any;
        return operations && operations[criteria.operationType] === true;
      });

      if (supportedOperators.length === 0) {
        logger.warn('No operators support operation type', 'OperatorResolverService', {
          country: criteria.country,
          operationType: criteria.operationType,
        });
        return null;
      }

      // Apply exclusions
      let candidateOperators = supportedOperators;
      if (criteria.excludeOperatorCodes && criteria.excludeOperatorCodes.length > 0) {
        candidateOperators = candidateOperators.filter(
          (op) => !criteria.excludeOperatorCodes!.includes(op.code)
        );
      }

      // Check if preferred operator is available
      if (criteria.preferredOperatorCode) {
        const preferred = candidateOperators.find(
          (op) => op.code === criteria.preferredOperatorCode
        );

        if (preferred) {
          // Validate amount against limits
          if (this.validateOperatorLimits(preferred, criteria)) {
            return {
              operator: preferred,
              providerId: preferred.primaryProviderId || '',
              isPrimary: true,
              confidence: 'high',
              reason: 'Preferred operator selected and validated',
            };
          }
        }
      }

      // Select best operator based on priority and limits
      const selectedOperator = await this.selectBestOperator(
        candidateOperators,
        criteria
      );

      if (!selectedOperator) {
        logger.warn('No suitable operator found', 'OperatorResolverService', criteria);
        return null;
      }

      return selectedOperator;
    } catch (error: any) {
      logger.error('Failed to resolve operator', 'OperatorResolverService', error);
      return null;
    }
  }

  /**
   * Select best operator from candidates based on priority and configuration
   */
  private async selectBestOperator(
    operators: PaymentOperator[],
    criteria: OperatorSelectionCriteria
  ): Promise<OperatorResolution | null> {
    // Filter by amount limits if specified
    const validOperators = operators.filter((op) =>
      this.validateOperatorLimits(op, criteria)
    );

    if (validOperators.length === 0) {
      return null;
    }

    // Prioritize operators with primary provider
    const primaryOperators = validOperators.filter((op) => op.primaryProviderId);
    const targetOperators = primaryOperators.length > 0 ? primaryOperators : validOperators;

    // For now, select the first available operator
    // TODO: Implement more sophisticated selection based on:
    // - Success rate tracking
    // - Response time metrics
    // - Cost optimization
    // - Load balancing
    const selected = targetOperators[0];

    return {
      operator: selected,
      providerId: selected.primaryProviderId || selected.alternativeProviderId || '',
      isPrimary: !!selected.primaryProviderId,
      confidence: selected.primaryProviderId ? 'high' : 'medium',
      reason: `Selected ${selected.name} based on availability and configuration`,
    };
  }

  /**
   * Validate operator against amount limits
   */
  private validateOperatorLimits(
    operator: PaymentOperator,
    criteria: OperatorSelectionCriteria
  ): boolean {
    if (!criteria.amount) {
      return true; // No amount to validate
    }

    const limits = operator.limits as any;
    if (!limits) {
      return true; // No limits configured
    }

    const operationType = criteria.operationType;
    const typeLimits = limits[operationType];

    if (!typeLimits) {
      return true; // No limits for this operation type
    }

    // Check minimum
    if (typeLimits.minAmount && criteria.amount < typeLimits.minAmount) {
      logger.debug('Amount below operator minimum', 'OperatorResolverService', {
        operator: operator.code,
        amount: criteria.amount,
        minAmount: typeLimits.minAmount,
      });
      return false;
    }

    // Check maximum
    if (typeLimits.maxAmount && criteria.amount > typeLimits.maxAmount) {
      logger.debug('Amount exceeds operator maximum', 'OperatorResolverService', {
        operator: operator.code,
        amount: criteria.amount,
        maxAmount: typeLimits.maxAmount,
      });
      return false;
    }

    return true;
  }

  /**
   * Get failover operator if primary fails
   */
  async getFailoverOperator(
    originalCriteria: OperatorSelectionCriteria,
    failedOperatorCode: string
  ): Promise<OperatorResolution | null> {
    logger.info('Getting failover operator', 'OperatorResolverService', {
      failedOperator: failedOperatorCode,
    });

    // Exclude the failed operator and try again
    const criteria: OperatorSelectionCriteria = {
      ...originalCriteria,
      excludeOperatorCodes: [
        ...(originalCriteria.excludeOperatorCodes || []),
        failedOperatorCode,
      ],
      preferredOperatorCode: undefined, // Don't use preference for failover
    };

    return this.resolveOperator(criteria);
  }

  /**
   * Resolve operator by code (direct lookup)
   */
  async resolveByCode(operatorCode: string): Promise<OperatorResolution | null> {
    try {
      const operator = await paymentSettingsService.getOperator(operatorCode);

      if (!operator || !operator.enabled) {
        logger.warn('Operator not found or disabled', 'OperatorResolverService', {
          operatorCode,
        });
        return null;
      }

      return {
        operator,
        providerId: operator.primaryProviderId || operator.alternativeProviderId || '',
        isPrimary: !!operator.primaryProviderId,
        confidence: 'high',
        reason: 'Direct operator lookup',
      };
    } catch (error: any) {
      logger.error('Failed to resolve operator by code', 'OperatorResolverService', error);
      return null;
    }
  }

  /**
   * Get all available operators for a country and operation type
   */
  async getAvailableOperators(
    country: string,
    operationType: 'deposit' | 'payout' | 'refund'
  ): Promise<PaymentOperator[]> {
    try {
      const operators = await paymentSettingsService.getEnabledOperators(country);

      return operators.filter((op) => {
        const operations = op.supportedOperations as any;
        return operations && operations[operationType] === true;
      });
    } catch (error: any) {
      logger.error('Failed to get available operators', 'OperatorResolverService', error);
      return [];
    }
  }

  /**
   * Check if operator supports specific currency
   */
  isOperatorCurrencySupported(operator: PaymentOperator, currency: string): boolean {
    // Check if operator has fee information for the currency
    if (operator.fees && operator.fees.currency) {
      return operator.fees.currency === currency;
    }

    // Assume supported if not configured (default behavior)
    return true;
  }
}

// Export singleton instance
export const operatorResolverService = new OperatorResolverService();

export default operatorResolverService;
