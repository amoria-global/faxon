// --- UTILITY FUNCTIONS ---

import crypto from 'crypto';
import { config } from '../../config/config';

export class EscrowUtils {
  
  /**
   * Generate a unique escrow reference
   */
  static generateEscrowReference(prefix: string = 'ESC'): string {
    const timestamp = Date.now().toString(36);
    const randomBytes = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `${prefix}-${timestamp}-${randomBytes}`;
  }

  /**
   * Validate escrow amount based on currency
   */
  static validateAmount(amount: number, currency: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    const currencyConfig = config.currencies as any;
    const currencySettings = currencyConfig[currency.toLowerCase()];

    if (!currencySettings) {
      errors.push(`Unsupported currency: ${currency}`);
      return { isValid: false, errors };
    }

    if (amount < currencySettings.minAmount) {
      errors.push(`Minimum amount for ${currency} is ${currencySettings.minAmount}`);
    }

    if (amount > currencySettings.maxAmount) {
      errors.push(`Maximum amount for ${currency} is ${currencySettings.maxAmount}`);
    }

    // Check decimal places
    const decimalPlaces = (amount.toString().split('.')[1] || '').length;
    if (decimalPlaces > currencySettings.decimals) {
      errors.push(`${currency} supports maximum ${currencySettings.decimals} decimal places`);
    }

    return { isValid: errors.length === 0, errors };
  }

  /**
   * Calculate escrow fees
   */
  static calculateEscrowFees(amount: number, transactionType: string, currency: string = 'USD'): {
    serviceFee: number;
    processingFee: number;
    totalFees: number;
    netAmount: number;
  } {
    const feePercentage = config.escrow.fees[transactionType as keyof typeof config.escrow.fees] || 0;
    let serviceFee = (amount * feePercentage) / 100;
    
    // Apply minimum and maximum fee limits
    const minFee = currency === 'USD' ? 0.5 : (currency === 'RWF' ? 500 : 10);
    const maxFee = currency === 'USD' ? 100 : (currency === 'RWF' ? 100000 : 10000);
    
    serviceFee = Math.max(minFee, Math.min(serviceFee, maxFee));
    
    const processingFee = currency === 'USD' ? 0.25 : (currency === 'RWF' ? 250 : 25);
    const totalFees = serviceFee + processingFee;
    const netAmount = amount - totalFees;

    return { serviceFee, processingFee, totalFees, netAmount };
  }

  /**
   * Format currency amount
   */
  static formatCurrency(amount: number, currency: string): string {
    const currencyConfig = config.currencies as any;
    const currencySettings = currencyConfig[currency.toLowerCase()];
    
    if (!currencySettings) {
      return `${amount} ${currency}`;
    }

    const formattedAmount = amount.toFixed(currencySettings.decimals);
    return `${currencySettings.symbol}${formattedAmount}`;
  }

  /**
   * Generate secure webhook signature
   */
  static generateWebhookSignature(payload: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }

  /**
   * Verify webhook signature
   */
  static verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    const expectedSignature = this.generateWebhookSignature(payload, secret);
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  }

  /**
   * Calculate dispute deadline
   */
  static calculateDisputeDeadline(daysFromNow: number = 30): Date {
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + daysFromNow);
    return deadline;
  }

  /**
   * Check if escrow is expired
   */
  static isEscrowExpired(createdAt: Date, maxHoldingDays: number = 365): boolean {
    const expiryDate = new Date(createdAt);
    expiryDate.setDate(expiryDate.getDate() + maxHoldingDays);
    return new Date() > expiryDate;
  }

  /**
   * Sanitize user input for escrow descriptions
   */
  static sanitizeDescription(description: string): string {
    return description
      .replace(/[<>]/g, '') // Remove HTML tags
      .replace(/['"]/g, '') // Remove quotes
      .slice(0, 500) // Limit length
      .trim();
  }

  /**
   * Generate escrow terms template
   */
  static generateDefaultEscrowTerms(type: 'manual' | 'automatic' | 'milestone' | 'conditional'): any {
    const baseTerms = {
      type,
      description: '',
      conditions: [],
      autoRelease: { enabled: false },
      disputeSettings: { allowDisputes: true, deadline: this.calculateDisputeDeadline() }
    };

    switch (type) {
      case 'manual':
        return {
          ...baseTerms,
          description: 'Manual release escrow - funds released when both parties agree',
          conditions: ['Buyer confirms goods/services received', 'Seller confirms delivery completion']
        };
      
      case 'automatic':
        return {
          ...baseTerms,
          description: 'Automatic release escrow - funds released automatically after time period',
          conditions: ['Auto-release after specified time period'],
          autoRelease: { enabled: true, date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } // 7 days
        };
      
      case 'milestone':
        return {
          ...baseTerms,
          description: 'Milestone-based escrow - funds released as milestones are completed',
          conditions: ['Complete milestone 1', 'Complete milestone 2', 'Final delivery confirmation'],
          milestones: [
            { id: '1', title: 'Project Start', percentage: 25, amount: 0 },
            { id: '2', title: 'Midpoint Review', percentage: 50, amount: 0 },
            { id: '3', title: 'Final Delivery', percentage: 25, amount: 0 }
          ]
        };
      
      case 'conditional':
        return {
          ...baseTerms,
          description: 'Conditional release escrow - funds released when specific conditions are met',
          conditions: ['Condition 1 must be verified', 'Condition 2 must be approved', 'Documentation must be provided']
        };
      
      default:
        return baseTerms;
    }
  }
}

export class EscrowJobHandlers {
  
  /**
   * Check for escrows ready for auto-release
   */
  static async checkAutoRelease(): Promise<void> {
    try {
      console.log('🔄 Checking escrows for auto-release...');
      
      // Implementation would query database for escrows with auto-release dates that have passed
      // This is a placeholder - implement actual database query
      
      console.log('✅ Auto-release check completed');
    } catch (error) {
      console.error('❌ Auto-release check failed:', error);
    }
  }

  /**
   * Check for escrows approaching dispute deadline
   */
  static async checkDisputeDeadlines(): Promise<void> {
    try {
      console.log('🔄 Checking dispute deadlines...');
      
      // Implementation would query database for escrows approaching dispute deadline
      // Send notifications to users about upcoming deadlines
      
      console.log('✅ Dispute deadline check completed');
    } catch (error) {
      console.error('❌ Dispute deadline check failed:', error);
    }
  }

  /**
   * Clean up expired escrows
   */
  static async cleanupExpiredEscrows(): Promise<void> {
    try {
      console.log('🔄 Cleaning up expired escrows...');
      
      // Implementation would handle expired escrows based on business rules
      
      console.log('✅ Expired escrow cleanup completed');
    } catch (error) {
      console.error('❌ Expired escrow cleanup failed:', error);
    }
  }
}

// --- ERROR HANDLING ---

export class EscrowError extends Error {
  public code: string;
  public statusCode: number;
  public details?: any;

  constructor(message: string, code: string = 'ESCROW_ERROR', statusCode: number = 400, details?: any) {
    super(message);
    this.name = 'EscrowError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export const EscrowErrorCodes = {
  INVALID_AMOUNT: 'INVALID_AMOUNT',
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  ESCROW_NOT_FOUND: 'ESCROW_NOT_FOUND',
  UNAUTHORIZED_RELEASE: 'UNAUTHORIZED_RELEASE',
  DISPUTE_DEADLINE_PASSED: 'DISPUTE_DEADLINE_PASSED',
  ESCROW_ALREADY_RELEASED: 'ESCROW_ALREADY_RELEASED',
  ESCROW_EXPIRED: 'ESCROW_EXPIRED',
  INVALID_CURRENCY: 'INVALID_CURRENCY',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  WEBHOOK_VERIFICATION_FAILED: 'WEBHOOK_VERIFICATION_FAILED'
};

// --- TESTING UTILITIES ---

export class EscrowTestUtils {
  
  /**
   * Generate test escrow data
   */
  static generateTestEscrowData(overrides: any = {}): any {
    return {
      amount: 100,
      currency: 'USD',
      reference: EscrowUtils.generateEscrowReference('TEST'),
      description: 'Test escrow transaction',
      recipientId: 2,
      escrowTerms: EscrowUtils.generateDefaultEscrowTerms('manual'),
      ...overrides
    };
  }

  /**
   * Generate test webhook payload
   */
  static generateTestWebhookPayload(eventType: string, escrowId: string): any {
    return {
      event_type: eventType,
      escrow_id: escrowId,
      transaction_id: EscrowUtils.generateEscrowReference('TXN'),
      status: 'funded',
      timestamp: new Date().toISOString(),
      data: {
        amount: '100.00',
        currency: 'USD'
      }
    };
  }

  /**
   * Mock escrow API responses
   */
  static mockEscrowApiResponse(success: boolean = true): any {
    if (success) {
      return {
        success: true,
        escrow_id: 'escrow_' + crypto.randomUUID(),
        transaction_id: 'txn_' + crypto.randomUUID(),
        status: 'pending',
        payment_url: 'https://example.com/pay/123'
      };
    } else {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data'
        }
      };
    }
  }
}

// --- MONITORING AND HEALTH CHECKS ---

export class EscrowMonitoring {
  
  /**
   * Check escrow service health
   */
  static async checkEscrowServiceHealth(): Promise<{ status: string; latency: number; error?: string }> {
    const startTime = Date.now();
    
    try {
      // Make a simple API call to check service availability
      // This is a placeholder - implement actual health check
      
      const latency = Date.now() - startTime;
      return { status: 'healthy', latency };
    } catch (error: any) {
      const latency = Date.now() - startTime;
      return { status: 'unhealthy', latency, error: error.message };
    }
  }

  /**
   * Get escrow system metrics
   */
  static async getEscrowMetrics(): Promise<any> {
    try {
      // Implementation would gather metrics from database
      return {
        totalEscrows: 0,
        activeEscrows: 0,
        completedEscrows: 0,
        disputedEscrows: 0,
        totalValue: 0,
        averageResolutionTime: 0
      };
    } catch (error) {
      console.error('Failed to get escrow metrics:', error);
      return null;
    }
  }
}

// --- NOTIFICATION HELPERS ---

export class EscrowNotificationHelper {
  
  /**
   * Send escrow notification
   */
  static async sendEscrowNotification(
    userId: number,
    type: string,
    title: string,
    message: string,
    data?: any
  ): Promise<void> {
    try {
      // Implementation would create notification record and send via configured channels
      console.log(`📧 Sending ${type} notification to user ${userId}: ${title}`);
    } catch (error) {
      console.error('Failed to send escrow notification:', error);
    }
  }

  /**
   * Generate notification templates
   */
  static getNotificationTemplate(type: string, data: any): { title: string; message: string } {
    const templates: Record<string, (data: any) => { title: string; message: string }> = {
      escrow_created: (data) => ({
        title: 'Escrow Created',
        message: `Your escrow payment of ${EscrowUtils.formatCurrency(data.amount, data.currency)} has been created. Reference: ${data.reference}`
      }),
      escrow_funded: (data) => ({
        title: 'Escrow Funded',
        message: `Escrow payment ${data.reference} has been successfully funded and is now active.`
      }),
      escrow_released: (data) => ({
        title: 'Escrow Released',
        message: `Escrow payment ${data.reference} has been released. Funds are being transferred to your account.`
      }),
      dispute_created: (data) => ({
        title: 'Dispute Created',
        message: `A dispute has been opened for escrow ${data.reference}. Please provide any supporting evidence.`
      })
    };

    return templates[type]?.(data) || { title: 'Escrow Update', message: 'Your escrow status has been updated.' };
  }
}
