/**
 * JamboLush Admin Settings Service
 * Centralized service for managing all admin settings
 */

import { PrismaClient } from '@prisma/client';
import { encryptionService } from '../utils/encryption.utility';

const prisma = new PrismaClient();
import {
  PaymentProvider,
  CreatePaymentProviderDto,
  UpdatePaymentProviderDto,
  PaymentOperator,
  CreateOperatorDto,
  UpdateOperatorDto,
  CommunicationSetting,
  UpdateCommunicationSettingDto,
  SecuritySetting,
  UpdateSecuritySettingDto,
  BusinessRule,
  UpdateBusinessRulesDto,
  AutomatedJob,
  CreateAutomatedJobDto,
  UpdateAutomatedJobDto,
  Webhook,
  CreateWebhookDto,
  UpdateWebhookDto,
  NotificationTemplate,
  CreateNotificationTemplateDto,
  UpdateNotificationTemplateDto,
  AuditLog,
  CreateAuditLogDto,
  PaymentTransactionDto,
  PaymentTransactionResponse,
} from '../types/admin-settings.types';

export class JamboLushAdminSettingsService {
  // ============================================
  // PAYMENT PROVIDERS
  // ============================================

  async getAllPaymentProviders(): Promise<PaymentProvider[]> {
    const providers = await prisma.paymentProvider.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return providers.map((provider: any) => ({
      ...provider,
      type: provider.type as 'mobile_money' | 'bank' | 'card',
      config: provider.config as any,
      credentials: this.decryptCredentials(provider.credentials as any),
    })) as PaymentProvider[];
  }

  async getPaymentProvider(id: string): Promise<PaymentProvider | null> {
    const provider = await prisma.paymentProvider.findUnique({
      where: { id },
    });

    if (!provider) return null;

    return {
      ...provider,
      type: provider.type as 'mobile_money' | 'bank' | 'card',
      config: provider.config as any,
      credentials: this.decryptCredentials(provider.credentials as any),
    } as PaymentProvider;
  }

  async createPaymentProvider(
    data: CreatePaymentProviderDto
  ): Promise<PaymentProvider> {
    const encryptedCredentials = this.encryptCredentials(data.credentials);

    const provider = await prisma.paymentProvider.create({
      data: {
        name: data.name,
        type: data.type,
        region: data.region,
        enabled: data.enabled ?? false,
        testMode: data.testMode ?? true,
        credentials: encryptedCredentials as any,
        config: data.config as any,
      },
    });

    return {
      ...provider,
      type: provider.type as 'mobile_money' | 'bank' | 'card',
      config: provider.config as any,
      credentials: data.credentials,
    } as PaymentProvider;
  }

  async updatePaymentProvider(
    id: string,
    data: UpdatePaymentProviderDto
  ): Promise<PaymentProvider> {
    const updateData: any = {};

    if (data.enabled !== undefined) updateData.enabled = data.enabled;
    if (data.testMode !== undefined) updateData.testMode = data.testMode;
    if (data.config) updateData.config = data.config;

    // Check if provider exists
    const existing = await this.getPaymentProvider(id);

    if (data.credentials) {
      // Merge with existing credentials if partial update
      if (existing) {
        const mergedCredentials = {
          ...existing.credentials,
          ...data.credentials,
        };
        updateData.credentials = this.encryptCredentials(mergedCredentials);
      } else {
        updateData.credentials = this.encryptCredentials(data.credentials);
      }
    }

    // Use upsert to handle both create and update scenarios
    const provider = await prisma.paymentProvider.upsert({
      where: { id },
      update: updateData,
      create: {
        id,
        name: id.charAt(0).toUpperCase() + id.slice(1), // Capitalize ID as name
        type: 'mobile_money', // Default type
        region: null,
        enabled: data.enabled ?? false,
        testMode: data.testMode ?? true,
        credentials: updateData.credentials || this.encryptCredentials({}),
        config: data.config as any,
      },
    });

    return {
      ...provider,
      type: provider.type as 'mobile_money' | 'bank' | 'card',
      config: provider.config as any,
      credentials: this.decryptCredentials(provider.credentials as any),
    } as PaymentProvider;
  }

  async deletePaymentProvider(id: string): Promise<void> {
    await prisma.paymentProvider.delete({
      where: { id },
    });
  }

  async testPaymentProvider(id: string): Promise<{
    connected: boolean;
    latency?: number;
    providerStatus?: string;
    error?: string;
  }> {
    const provider = await this.getPaymentProvider(id);
    if (!provider) {
      return { connected: false, error: 'Provider not found' };
    }

    // TODO: Implement actual provider connectivity test
    // This is a placeholder implementation
    const startTime = Date.now();

    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 100));
      const latency = Date.now() - startTime;

      return {
        connected: true,
        latency,
        providerStatus: 'operational',
      };
    } catch (error: any) {
      return {
        connected: false,
        error: error.message,
      };
    }
  }

  // ============================================
  // PAYMENT OPERATORS
  // ============================================

  async getAllOperators(filters?: {
    country?: string;
    type?: string;
    enabled?: boolean;
  }): Promise<PaymentOperator[]> {
    const where: any = {};

    if (filters?.country) where.country = filters.country;
    if (filters?.type) where.type = filters.type;
    if (filters?.enabled !== undefined) where.enabled = filters.enabled;

    return await prisma.paymentOperator.findMany({
      where,
      orderBy: [{ country: 'asc' }, { name: 'asc' }],
    }) as any[];
  }

  async getOperator(code: string): Promise<PaymentOperator | null> {
    return await prisma.paymentOperator.findUnique({
      where: { code },
    }) as any;
  }

  async createOperator(data: CreateOperatorDto): Promise<PaymentOperator> {
    return await prisma.paymentOperator.create({
      data: {
        name: data.name,
        code: data.code,
        country: data.country,
        type: data.type,
        enabled: data.enabled ?? false,
        primaryProviderId: data.primaryProviderId,
        alternativeProviderId: data.alternativeProviderId,
        supportedOperations: data.supportedOperations as any,
        limits: data.limits as any,
        fees: data.fees as any,
      },
    }) as any;
  }

  async updateOperator(
    code: string,
    data: UpdateOperatorDto
  ): Promise<PaymentOperator> {
    const updateData: any = {};

    if (data.enabled !== undefined) updateData.enabled = data.enabled;
    if (data.primaryProviderId) updateData.primaryProviderId = data.primaryProviderId;
    if (data.alternativeProviderId) updateData.alternativeProviderId = data.alternativeProviderId;
    if (data.supportedOperations) updateData.supportedOperations = data.supportedOperations;
    if (data.limits) updateData.limits = data.limits;
    if (data.fees) updateData.fees = data.fees;

    // Use upsert to handle both create and update scenarios
    const createData: any = {
      code,
      name: code.replace(/_/g, ' '), // Convert MTN_RW to "MTN RW"
      country: code.split('_')[1] || 'RW', // Extract country from code (e.g., MTN_RW -> RW)
      type: 'mobile_money', // Default type
      enabled: data.enabled ?? false,
      primaryProviderId: data.primaryProviderId,
      alternativeProviderId: data.alternativeProviderId,
      supportedOperations: data.supportedOperations || {
        deposit: true,
        withdrawal: true,
        refund: true,
        disburse: true
      },
    };

    // Only add limits and fees if provided (avoid null)
    if (data.limits) createData.limits = data.limits;
    if (data.fees) createData.fees = data.fees;

    return await prisma.paymentOperator.upsert({
      where: { code },
      update: updateData,
      create: createData,
    }) as any;
  }

  async deleteOperator(code: string): Promise<void> {
    await prisma.paymentOperator.delete({
      where: { code },
    });
  }

  // ============================================
  // COMMUNICATION SETTINGS
  // ============================================

  async getAllCommunicationSettings(): Promise<CommunicationSetting[]> {
    const settings = await prisma.communicationSetting.findMany();

    return settings.map((setting: any) => ({
      ...setting,
      config: this.decryptCredentials(setting.config as any),
    })) as any[];
  }

  async getCommunicationSetting(
    channel: 'email' | 'sms' | 'whatsapp'
  ): Promise<CommunicationSetting | null> {
    const setting = await prisma.communicationSetting.findUnique({
      where: { id: channel },
    });

    if (!setting) return null;

    return {
      ...setting,
      config: this.decryptCredentials(setting.config as any),
    } as any;
  }

  async updateCommunicationSetting(
    channel: 'email' | 'sms' | 'whatsapp',
    data: UpdateCommunicationSettingDto
  ): Promise<CommunicationSetting> {
    const updateData: any = {};

    if (data.enabled !== undefined) updateData.enabled = data.enabled;
    if (data.provider) updateData.provider = data.provider;
    if (data.dailyLimit !== undefined) updateData.dailyLimit = data.dailyLimit;

    if (data.config) {
      const existing = await this.getCommunicationSetting(channel);
      const mergedConfig = existing
        ? { ...existing.config, ...data.config }
        : data.config;
      updateData.config = this.encryptCredentials(mergedConfig);
    }

    const setting = await prisma.communicationSetting.upsert({
      where: { id: channel },
      update: updateData,
      create: {
        id: channel,
        enabled: data.enabled ?? false,
        provider: data.provider ?? 'brevo',
        config: this.encryptCredentials(data.config || {}) as any,
        dailyLimit: data.dailyLimit,
      },
    });

    return {
      ...setting,
      config: this.decryptCredentials(setting.config as any),
    } as any;
  }

  // ============================================
  // SECURITY SETTINGS
  // ============================================

  async getAllSecuritySettings(): Promise<SecuritySetting[]> {
    return await prisma.securitySetting.findMany() as any[];
  }

  async getSecuritySetting(
    category: 'twoFactor' | 'session' | 'passwordPolicy' | 'apiSecurity'
  ): Promise<SecuritySetting | null> {
    return await prisma.securitySetting.findFirst({
      where: { category },
    }) as any;
  }

  async updateSecuritySettings(
    data: UpdateSecuritySettingDto
  ): Promise<SecuritySetting[]> {
    const updates: Promise<any>[] = [];

    for (const [category, settings] of Object.entries(data)) {
      updates.push(
        prisma.securitySetting.upsert({
          where: { id: category },
          update: { settings: settings as any },
          create: {
            category,
            settings: settings as any,
          },
        })
      );
    }

    return await Promise.all(updates);
  }

  // ============================================
  // BUSINESS RULES
  // ============================================

  async getAllBusinessRules(): Promise<BusinessRule[]> {
    return await prisma.businessRule.findMany() as any[];
  }

  async getBusinessRule(
    category: 'booking' | 'cancellation' | 'payment' | 'commission' | 'system' | 'financial' | 'limits'
  ): Promise<BusinessRule | null> {
    return await prisma.businessRule.findFirst({
      where: { category },
    }) as any;
  }

  async updateBusinessRules(
    data: UpdateBusinessRulesDto
  ): Promise<BusinessRule[]> {
    const updates: Promise<any>[] = [];

    for (const [category, rules] of Object.entries(data)) {
      updates.push(
        prisma.businessRule.upsert({
          where: { id: category },
          update: { rules: rules as any },
          create: {
            category,
            rules: rules as any,
          },
        })
      );
    }

    return await Promise.all(updates);
  }

  // ============================================
  // AUTOMATED JOBS
  // ============================================

  async getAllJobs(): Promise<AutomatedJob[]> {
    return await prisma.automatedJob.findMany({
      orderBy: { createdAt: 'desc' },
    }) as any[];
  }

  async getJob(id: string): Promise<AutomatedJob | null> {
    return await prisma.automatedJob.findUnique({
      where: { id },
    }) as any;
  }

  async createJob(data: CreateAutomatedJobDto): Promise<AutomatedJob> {
    return await prisma.automatedJob.create({
      data: {
        jobType: data.jobType,
        schedule: data.schedule,
        timezone: data.timezone ?? 'Africa/Kigali',
        enabled: data.enabled ?? true,
        config: data.config as any,
      },
    }) as any;
  }

  async updateJob(id: string, data: UpdateAutomatedJobDto): Promise<AutomatedJob> {
    return await prisma.automatedJob.update({
      where: { id },
      data: data as any,
    }) as any;
  }

  async deleteJob(id: string): Promise<void> {
    await prisma.automatedJob.delete({
      where: { id },
    });
  }

  async executeJob(id: string): Promise<{ executionId: string; status: string }> {
    const job = await this.getJob(id);
    if (!job) throw new Error('Job not found');

    // TODO: Implement job execution logic
    const executionId = `EXEC_${Date.now()}`;

    await prisma.automatedJob.update({
      where: { id },
      data: {
        lastRun: new Date(),
        lastRunStatus: 'success',
        executionCount: { increment: 1 },
        successCount: { increment: 1 },
      },
    });

    return {
      executionId,
      status: 'running',
    };
  }

  // ============================================
  // WEBHOOKS
  // ============================================

  async getAllWebhooks(): Promise<Webhook[]> {
    return await prisma.webhook.findMany() as any[];
  }

  async getWebhook(id: string): Promise<Webhook | null> {
    return await prisma.webhook.findUnique({
      where: { id },
    }) as any;
  }

  async createWebhook(data: CreateWebhookDto): Promise<Webhook> {
    return await prisma.webhook.create({
      data: {
        url: data.url,
        events: data.events as any,
        secret: data.secret,
        active: data.active ?? true,
        headers: data.headers as any,
      },
    }) as any;
  }

  async updateWebhook(id: string, data: UpdateWebhookDto): Promise<Webhook> {
    return await prisma.webhook.update({
      where: { id },
      data: data as any,
    }) as any;
  }

  async deleteWebhook(id: string): Promise<void> {
    await prisma.webhook.delete({
      where: { id },
    });
  }

  // ============================================
  // NOTIFICATION TEMPLATES
  // ============================================

  async getAllTemplates(filters?: {
    channel?: string;
    category?: string;
  }): Promise<NotificationTemplate[]> {
    const where: any = {};

    if (filters?.channel) where.channel = filters.channel;
    if (filters?.category) where.category = filters.category;

    return await prisma.notificationTemplate.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    }) as any[];
  }

  async getTemplate(id: string): Promise<NotificationTemplate | null> {
    return await prisma.notificationTemplate.findUnique({
      where: { id },
    }) as any;
  }

  async createTemplate(
    data: CreateNotificationTemplateDto
  ): Promise<NotificationTemplate> {
    return await prisma.notificationTemplate.create({
      data: {
        name: data.name,
        channel: data.channel,
        category: data.category,
        subject: data.subject,
        content: data.content,
        variables: data.variables as any,
        active: data.active ?? true,
      },
    }) as any;
  }

  async updateTemplate(
    id: string,
    data: UpdateNotificationTemplateDto
  ): Promise<NotificationTemplate> {
    return await prisma.notificationTemplate.update({
      where: { id },
      data: data as any,
    }) as any;
  }

  async deleteTemplate(id: string): Promise<void> {
    await prisma.notificationTemplate.delete({
      where: { id },
    });
  }

  // ============================================
  // AUDIT LOGS
  // ============================================

  async createAuditLog(data: CreateAuditLogDto): Promise<AuditLog> {
    return await prisma.auditLog.create({
      data: {
        userId: data.userId,
        action: data.action,
        category: data.category,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        status: data.status,
        metadata: data.metadata as any,
      },
    }) as any;
  }

  async getAuditLogs(filters?: {
    userId?: number;
    action?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  }): Promise<{ logs: AuditLog[]; total: number }> {
    const where: any = {};

    if (filters?.userId) where.userId = filters.userId;
    if (filters?.action) where.action = filters.action;
    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = filters.startDate;
      if (filters.endDate) where.createdAt.lte = filters.endDate;
    }

    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 50;
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return { logs: logs as any[], total };
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  private encryptCredentials(credentials: any): any {
    if (!credentials) return null;

    const encrypted: any = {};
    for (const [key, value] of Object.entries(credentials)) {
      if (typeof value === 'string') {
        encrypted[key] = encryptionService.encrypt(value);
      } else {
        encrypted[key] = value;
      }
    }
    return encrypted;
  }

  private decryptCredentials(credentials: any): any {
    if (!credentials) return null;

    const decrypted: any = {};
    for (const [key, value] of Object.entries(credentials)) {
      if (typeof value === 'string' && value.length > 50) {
        try {
          decrypted[key] = encryptionService.decrypt(value);
        } catch {
          // If decryption fails, assume it's not encrypted
          decrypted[key] = value;
        }
      } else {
        decrypted[key] = value;
      }
    }
    return decrypted;
  }

  /**
   * Mask sensitive credentials for display
   */
  maskCredentials(credentials: any): any {
    const masked: any = {};
    for (const [key, value] of Object.entries(credentials)) {
      if (typeof value === 'string') {
        masked[key] = encryptionService.maskSensitiveData(value);
      } else {
        masked[key] = value;
      }
    }
    return masked;
  }
}

// Export singleton instance
export const jamboLushAdminSettingsService = new JamboLushAdminSettingsService();
export default jamboLushAdminSettingsService;
